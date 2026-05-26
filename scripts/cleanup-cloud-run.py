import os
import sys
import subprocess
import json
from datetime import datetime, timezone, timedelta

# Configuration
SERVICE_NAME = "backend-service"
REGION = "asia-south1"
DAYS_TO_KEEP = 10
MIN_REVISIONS_TO_KEEP = 5

def run_command(cmd):
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        print(f"Error running command: {' '.join(cmd)}")
        print(result.stderr)
        sys.exit(1)
    return result.stdout.strip()

def main():
    print(f"Starting Cloud Run revision cleanup for service: {SERVICE_NAME} in {REGION}")

    # Fetch all revisions sorted by creation timestamp (newest first) in JSON format
    cmd = [
        "gcloud", "run", "revisions", "list",
        f"--service={SERVICE_NAME}",
        f"--region={REGION}",
        "--sort-by=~metadata.creationTimestamp",
        "--format=json"
    ]
    
    print("Fetching revisions...")
    output = run_command(cmd)
    
    if not output:
        print("No revisions found.")
        return
        
    revisions = json.loads(output)
    print(f"Found {len(revisions)} revisions total.")
    
    if len(revisions) <= MIN_REVISIONS_TO_KEEP:
        print(f"Only {len(revisions)} revisions exist. We need to keep at least {MIN_REVISIONS_TO_KEEP}. Exiting.")
        return

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=DAYS_TO_KEEP)
    print(f"Cutoff date (older than {DAYS_TO_KEEP} days): {cutoff_date.isoformat()}")

    for index, rev in enumerate(revisions):
        rev_name = rev['metadata']['name']
        
        # Keep the most recent ones
        if index < MIN_REVISIONS_TO_KEEP:
            print(f"Keeping {rev_name} (One of the {MIN_REVISIONS_TO_KEEP} most recent)")
            continue

        # Parse creationTimestamp (e.g., "2026-05-26T05:52:42.470403Z")
        creation_time_str = rev['metadata'].get('creationTimestamp')
        if not creation_time_str:
            print(f"Skipping {rev_name} - No creationTimestamp found.")
            continue
            
        # Handle trailing 'Z' and ensure we parse it to UTC datetime
        creation_time_str = creation_time_str.replace('Z', '+00:00')
        try:
            creation_time = datetime.fromisoformat(creation_time_str)
        except ValueError:
            print(f"Skipping {rev_name} - Could not parse date {creation_time_str}")
            continue
            
        if creation_time < cutoff_date:
            # Check traffic allocation
            traffic = 0
            if 'status' in rev and 'traffic' in rev['status']:
                for t in rev['status']['traffic']:
                    traffic += int(t.get('percent', 0))
            
            if traffic > 0:
                print(f"Skipping {rev_name} - Currently serving {traffic}% traffic")
                continue
                
            print(f"Deleting {rev_name} (Created: {creation_time_str})...")
            # --- THE LINE BELOW NOW ACTUALLY DELETES THE REVISION ---
            run_command(["gcloud", "run", "revisions", "delete", rev_name, f"--region={REGION}", "--quiet"])
        else:
            print(f"Keeping {rev_name} (Newer than {DAYS_TO_KEEP} days)")

    print("Cleanup finished!")

if __name__ == "__main__":
    main()
