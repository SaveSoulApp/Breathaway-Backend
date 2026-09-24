# Terraform Infrastructure Guide

Multi-environment (non-prod / prod) Terraform setup for the Breathaway backend.

---

## Directory Structure

```
terraform/
├── environments/
│   ├── non-prod/           # breathaway-dev GCP project
│   │   ├── backend.tf      # GCS remote state (state/non-prod prefix)
│   │   ├── providers.tf    # Pinned google provider version
│   │   ├── variables.tf    # Variable declarations
│   │   ├── terraform.tfvars # Non-secret values (safe to commit)
│   │   ├── main.tf         # GCP API enablement + data sources
│   │   ├── artifact-registry.tf
│   │   ├── wif.tf          # Workload Identity Federation + CI SA
│   │   ├── secrets.tf      # Secret Manager containers (no values)
│   │   ├── pubsub.tf       # Pub/Sub topics + push subscriptions
│   │   ├── scheduler.tf    # Cloud Scheduler jobs
│   │   └── audit-logs.tf   # BigQuery + Cloud Logging pipelines
│   └── prod/               # breathaway GCP project
│       └── (identical .tf files, different terraform.tfvars)
├── _archive/               # Old flat .tf files (preserved for reference)
└── README.md               # This file
```

> **Note on duplication**: The `.tf` files in `non-prod/` and `prod/` are
> intentionally identical — all differences are expressed in `terraform.tfvars`.
> When you add or change a resource, update it in **both** environment directories.

---

## What Terraform Manages

| Resource | Terraform | Notes |
|---|---|---|
| GCP API enablement | ✅ | `google_project_service` |
| Artifact Registry (Docker repo) | ✅ | With cleanup policies |
| Workload Identity Federation | ✅ | GitHub Actions → GCP auth |
| Secret Manager containers | ✅ | Containers only — values populated via gcloud |
| Pub/Sub topics | ✅ | All 4 push topics + audit-logs-topic |
| Pub/Sub subscriptions | ✅ | Push (OIDC) + BigQuery native |
| Cloud Scheduler jobs | ✅ | 3 internal jobs |
| BigQuery (audit logs) | ✅ | Dataset + table |
| Cloud Logging bucket + sink | ✅ | Pino log pipeline |
| Cloud Run service | ❌ | Managed by `scripts/deploy.sh` |
| Cloud Storage buckets | ❌ | Managed manually |
| Firebase | ❌ | Firebase console / CLI |
| Supabase | ❌ | External service |
| Upstash Redis | ❌ | External service |

---

## Prerequisites

1. **Terraform CLI** ≥ 1.7 installed (`brew install terraform`)
2. **gcloud CLI** authenticated: `gcloud auth application-default login`
3. **GCS state bucket** created (one-time bootstrap — see below)
4. **Cloud Run service deployed** before running Terraform (Pub/Sub subscriptions and
   Cloud Scheduler need the live service URL)

---

## Bootstrap: Create the State Bucket (One-Time)

Run this once — Terraform cannot manage its own backend bucket:

```bash
# Create the bucket in the non-prod project (state for both envs lives here)
gcloud storage buckets create gs://breathaway-terraform-state \
  --project=breathaway-dev \
  --location=ASIA-SOUTH1 \
  --uniform-bucket-level-access

# Enable versioning for state history / rollback safety
gcloud storage buckets update gs://breathaway-terraform-state --versioning

# Verify
gcloud storage buckets describe gs://breathaway-terraform-state
```

---

## Day-to-Day Workflow

### Apply changes to non-prod

```bash
./scripts/terraform-apply.sh --env=non-prod
```

### Apply changes to prod

```bash
./scripts/terraform-apply.sh --env=prod
```

The script runs `terraform init` + `terraform plan`, shows the plan, and waits
for explicit confirmation before applying. For prod, you must type `production`
to confirm.

### View current state

```bash
terraform -chdir=terraform/environments/non-prod state list
terraform -chdir=terraform/environments/prod state list
```

### Format all Terraform files

```bash
terraform fmt -recursive terraform/
```

---

## State Migration (First-Time Setup for Non-Prod)

If you are migrating from the old flat `terraform/` layout with local state,
run the import script once:

```bash
chmod +x scripts/terraform-import.sh
./scripts/terraform-import.sh
```

After the import finishes, verify zero drift:

```bash
terraform -chdir=terraform/environments/non-prod plan
# Expected: "No changes. Infrastructure is up-to-date."
# New resources (WIF, secrets, API enablement) will show as "to be created" — apply those.
```

Then archive the old flat files:

```bash
mkdir -p terraform/_archive
mv terraform/main.tf terraform/pubsub.tf terraform/scheduler.tf terraform/audit-logs.tf terraform/_archive/
mv terraform/.terraform terraform/terraform.tfstate terraform/terraform.tfstate.backup terraform/_archive/ 2>/dev/null || true
```

---

## Post-Apply: Secret Population Checklist

After `terraform apply` creates new Secret Manager containers, populate their values.
**Values are NEVER stored in Terraform — always use gcloud.**

```bash
# Template:
echo -n "<value>" | gcloud secrets versions add <secret-id> \
  --project=<project_id> --data-file=-

# Checklist for non-prod (breathaway-dev):
# Replace <value> with the actual secret for each:
echo -n "<value>" | gcloud secrets versions add access-token-instagram   --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add active-master-key-id     --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add admin-password            --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add admin-username            --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add api-keys                  --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add brevo-api-key             --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add client-ids                --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add database-url              --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add firebase-client-email     --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add firebase-private-key      --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add gcp-secret-master-keys    --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add hmac-key-base64           --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add ipinfo-token              --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add jwt-secret                --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add kms-active-key-id         --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add kms-key-names             --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add redis-url                 --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add revenuecat-webhook-secret --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add supabase-jwt-private-key  --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add supabase-service-role-key --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add supabase-url              --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add swagger-password          --project=breathaway-dev --data-file=-
echo -n "<value>" | gcloud secrets versions add swagger-username          --project=breathaway-dev --data-file=-
```

---

## Post-Apply: Update GitHub Actions Secrets (After WIF Apply)

After the first `terraform apply` that creates the WIF resources, retrieve the
outputs and set them as GitHub Actions secrets in the repository settings:

```bash
# Get the values from Terraform outputs
terraform -chdir=terraform/environments/non-prod output wif_provider
terraform -chdir=terraform/environments/non-prod output wif_service_account
```

Set these in GitHub → Settings → Secrets and variables → Actions:
- `WIF_PROVIDER` = value of `wif_provider` output
- `WIF_SERVICE_ACCOUNT` = value of `wif_service_account` output

The `cleanup-cloud-run.yaml` and `terraform-plan.yaml` workflows already reference
these secrets.

---

## Prod Bootstrap Sequence

For the first production deployment:

1. **Enable billing** on the `breathaway` GCP project (if not already done)
2. **Deploy Cloud Run** (Terraform needs the service URL):
   ```bash
   ./scripts/deploy.sh --env=prod
   ```
3. **Apply Terraform**:
   ```bash
   ./scripts/terraform-apply.sh --env=prod
   ```
4. **Populate secrets** using the checklist above (with `--project=breathaway`)
5. **Update GitHub Actions secrets** for prod (set `WIF_PROVIDER_PROD` / `WIF_SERVICE_ACCOUNT_PROD`
   if you add a separate prod deploy workflow in future)

---

## Adding a New Pub/Sub Topic

1. Add the key to `pubsub_push_subscriptions` in both `environments/non-prod/pubsub.tf`
   and `environments/prod/pubsub.tf`
2. Run `./scripts/terraform-apply.sh --env=non-prod` to create the topic and subscription
3. Register the new topic in `src/modules/pubsub/` as a recognized topic type
4. After testing, apply to prod

---

## Adding a New Secret

1. Add the secret ID (snake-case, matching the name in `deploy.sh`) to `local.app_secrets`
   in both environment `secrets.tf` files
2. Apply Terraform → the container is created
3. Populate the value: `echo -n "<value>" | gcloud secrets versions add <secret-id> ...`
4. Add `--update-secrets="ENV_VAR_NAME=<secret-id>:latest"` to `scripts/deploy.sh`
5. Redeploy Cloud Run

---

## Terraform Checklist

- [ ] Remote GCS backend with per-env state separation
- [ ] No secret values in any `.tf` or `.tfvars` file
- [ ] Terraform and provider versions pinned in `providers.tf`
- [ ] `terraform fmt -recursive` run before committing
- [ ] `terraform plan` reviewed in CI (PR comment) before applying
- [ ] `terraform apply` always manual via `scripts/terraform-apply.sh`
- [ ] `terraform plan` shows zero changes after import migration
