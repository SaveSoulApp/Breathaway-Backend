import sys
import subprocess
import json
from datetime import datetime, timezone, timedelta

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ID = "breathaway-dev"
REGION = "asia-south1"
REPOSITORY = "breathaway-backend"
SERVICE_NAME = "backend-service"

# Full Artifact Registry image path (without tag/digest)
IMAGE_BASE_URL = f"{REGION}-docker.pkg.dev/{PROJECT_ID}/{REPOSITORY}/{SERVICE_NAME}"

DAYS_TO_KEEP = 10
MIN_REVISIONS_TO_KEEP = 5


def run_command(cmd: list[str], allow_failure: bool = False) -> str:
    """Run a shell command and return stdout. Exits on failure unless allow_failure=True."""
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        if allow_failure:
            return ""
        print(f"Error running command: {' '.join(cmd)}")
        print(result.stderr)
        sys.exit(1)
    return result.stdout.strip()


def extract_image_digest(revision: dict) -> str | None:
    """Extract the fully-qualified image digest from a Cloud Run revision spec."""
    try:
        containers = revision["spec"]["containers"]
        if containers:
            return containers[0].get("image")
    except (KeyError, IndexError):
        pass
    return None


# ---------------------------------------------------------------------------
# Phase 1: Cloud Run revision cleanup
# ---------------------------------------------------------------------------
def cleanup_revisions() -> tuple[set[str], set[str]]:
    """
    Delete stale Cloud Run revisions.

    Returns:
        surviving_images: image refs still in use by kept revisions.
        deleted_images:   image refs freed by deleted revisions.
    """
    print(f"\n{'='*60}")
    print(f"  Phase 1: Cloud Run revision cleanup")
    print(f"  Service : {SERVICE_NAME}  |  Region: {REGION}")
    print(f"{'='*60}")

    cmd = [
        "gcloud", "run", "revisions", "list",
        f"--service={SERVICE_NAME}",
        f"--region={REGION}",
        "--sort-by=~metadata.creationTimestamp",
        "--format=json",
    ]

    print("Fetching revisions...")
    output = run_command(cmd)

    if not output:
        print("No revisions found.")
        return set(), set()

    revisions = json.loads(output)
    print(f"Found {len(revisions)} revision(s) total.")

    if len(revisions) <= MIN_REVISIONS_TO_KEEP:
        print(
            f"Only {len(revisions)} revision(s) exist — minimum to keep is "
            f"{MIN_REVISIONS_TO_KEEP}. Skipping revision cleanup."
        )
        surviving_images = {extract_image_digest(r) for r in revisions} - {None}
        return surviving_images, set()

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=DAYS_TO_KEEP)
    print(f"Cutoff date (older than {DAYS_TO_KEEP} days): {cutoff_date.isoformat()}")

    surviving_images: set[str] = set()
    deleted_images: set[str] = set()

    for index, rev in enumerate(revisions):
        rev_name = rev["metadata"]["name"]
        image_ref = extract_image_digest(rev)

        # Always keep the N most recent revisions
        if index < MIN_REVISIONS_TO_KEEP:
            print(f"  ✔ Keeping  {rev_name} (one of {MIN_REVISIONS_TO_KEEP} most recent)")
            if image_ref:
                surviving_images.add(image_ref)
            continue

        # Parse creationTimestamp (e.g., "2026-05-26T05:52:42.470403Z")
        creation_time_str = rev["metadata"].get("creationTimestamp", "")
        if not creation_time_str:
            print(f"  ⚠ Skipping {rev_name} — no creationTimestamp found.")
            if image_ref:
                surviving_images.add(image_ref)
            continue

        creation_time_str = creation_time_str.replace("Z", "+00:00")
        try:
            creation_time = datetime.fromisoformat(creation_time_str)
        except ValueError:
            print(f"  ⚠ Skipping {rev_name} — could not parse date: {creation_time_str}")
            if image_ref:
                surviving_images.add(image_ref)
            continue

        if creation_time >= cutoff_date:
            print(f"  ✔ Keeping  {rev_name} (newer than {DAYS_TO_KEEP} days)")
            if image_ref:
                surviving_images.add(image_ref)
            continue

        # Check live traffic allocation before deleting
        traffic = sum(
            int(t.get("percent", 0))
            for t in rev.get("status", {}).get("traffic", [])
        )
        if traffic > 0:
            print(f"  ⚠ Skipping {rev_name} — serving {traffic}% live traffic")
            if image_ref:
                surviving_images.add(image_ref)
            continue

        print(f"  🗑 Deleting {rev_name} (created: {creation_time_str})")
        run_command(["gcloud", "run", "revisions", "delete", rev_name, f"--region={REGION}", "--quiet"])
        if image_ref:
            deleted_images.add(image_ref)

    print("Phase 1 complete.\n")
    return surviving_images, deleted_images


# ---------------------------------------------------------------------------
# Phase 2: Artifact Registry image cleanup
# ---------------------------------------------------------------------------
def cleanup_artifact_registry(surviving_images: set[str], deleted_images: set[str]) -> None:
    """
    Delete Docker images from Artifact Registry that are:
      1. Not referenced by any surviving Cloud Run revision, AND
      2. Older than DAYS_TO_KEEP days.

    Images still in use by a live/kept revision are always preserved.
    """
    print(f"{'='*60}")
    print(f"  Phase 2: Artifact Registry cleanup")
    print(f"  Repository: {IMAGE_BASE_URL}")
    print(f"{'='*60}")

    cmd = [
        "gcloud", "artifacts", "docker", "images", "list",
        IMAGE_BASE_URL,
        "--include-tags",
        "--sort-by=~CREATE_TIME",
        "--format=json",
        f"--project={PROJECT_ID}",
    ]

    print("Fetching images from Artifact Registry...")
    output = run_command(cmd, allow_failure=True)

    if not output:
        print("No images found in Artifact Registry.")
        return

    images = json.loads(output)
    print(f"Found {len(images)} image(s) in Artifact Registry.")

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=DAYS_TO_KEEP)

    deleted_count = 0
    skipped_count = 0

    for img in images:
        # The fully-qualified digest reference, e.g.:
        #   asia-south1-docker.pkg.dev/breathaway-dev/breathaway-backend/backend-service@sha256:abc123
        digest = img.get("digest", "")
        image_with_digest = f"{IMAGE_BASE_URL}@{digest}" if digest else None

        # Also collect all tag-based refs for this image so we can cross-reference
        tags = img.get("tags", []) or []
        tag_refs = {f"{IMAGE_BASE_URL}:{tag}" for tag in tags}

        # Check if this image (by digest or any tag) is referenced by a surviving revision
        is_in_use = bool(
            (image_with_digest and image_with_digest in surviving_images)
            or tag_refs.intersection(surviving_images)
            # Also protect images whose digest was referenced in surviving revisions
            or any(digest and digest in ref for ref in surviving_images)
        )

        if is_in_use:
            print(f"  ✔ Keeping  {digest} — referenced by a live revision")
            skipped_count += 1
            continue

        # Parse image creation time
        create_time_str = img.get("createTime", "")
        if not create_time_str:
            print(f"  ⚠ Skipping {digest} — no createTime found.")
            skipped_count += 1
            continue

        create_time_str = create_time_str.replace("Z", "+00:00")
        try:
            create_time = datetime.fromisoformat(create_time_str)
        except ValueError:
            print(f"  ⚠ Skipping {digest} — could not parse date: {create_time_str}")
            skipped_count += 1
            continue

        if create_time >= cutoff_date:
            print(f"  ✔ Keeping  {digest} (newer than {DAYS_TO_KEEP} days)")
            skipped_count += 1
            continue

        if not image_with_digest:
            print(f"  ⚠ Skipping image — no digest available, cannot safely delete.")
            skipped_count += 1
            continue

        print(f"  🗑 Deleting {image_with_digest} (created: {create_time_str})")
        run_command([
            "gcloud", "artifacts", "docker", "images", "delete",
            image_with_digest,
            "--delete-tags",
            "--quiet",
            f"--project={PROJECT_ID}",
        ])
        deleted_count += 1

    print(f"\nArtifact Registry cleanup complete: {deleted_count} deleted, {skipped_count} kept.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    surviving_images, deleted_images = cleanup_revisions()
    cleanup_artifact_registry(surviving_images, deleted_images)
    print("\n✅ All cleanup tasks finished successfully.")


if __name__ == "__main__":
    main()

