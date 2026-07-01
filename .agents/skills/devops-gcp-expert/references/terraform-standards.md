# Terraform Standards

Reference for Terraform module structure, remote state, environment separation, and secrets
handling for this GCP project (Cloud Run, Cloud SQL, Secret Manager, Cloud Scheduler).

---

## 1. Repository Structure

```
infrastructure/
├── modules/
│   ├── cloud-run-service/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── cloud-scheduler-job/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── cloud-sql-instance/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── secret-manager-secret/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── environments/
    ├── staging/
    │   ├── main.tf          # composes modules for staging
    │   ├── variables.tf
    │   ├── terraform.tfvars # environment-specific values (no secret values)
    │   └── backend.tf       # remote state config for this environment
    └── production/
        ├── main.tf
        ├── variables.tf
        ├── terraform.tfvars
        └── backend.tf
```

**Rule:** Never write environment-specific resources directly — every GCP resource is defined
once as a module, then composed per environment by passing variables. A new environment should
require only a new `environments/<name>/` directory calling existing modules, not duplicating
resource blocks.

---

## 2. Remote State

### Backend configuration (GCS, per environment)
```hcl
# environments/production/backend.tf
terraform {
  backend "gcs" {
    bucket = "your-project-terraform-state"
    prefix = "production"
  }
}
```
```hcl
# environments/staging/backend.tf
terraform {
  backend "gcs" {
    bucket = "your-project-terraform-state"
    prefix = "staging"
  }
}
```

**Rules:**
- Use a GCS bucket dedicated to Terraform state, with versioning enabled on the bucket (GCS
  object versioning provides a state history/rollback safety net).
- Separate state per environment via distinct `prefix` values (or separate buckets) —
  staging and production must never share state, since an `apply` error in one should never
  be able to touch the other's resources.
- Never use local state (`terraform.tfstate` committed to or absent from git) for any shared
  infrastructure — local state can't be safely used by more than one person/CI run and
  contains secret values in plaintext.
- Enable state locking (GCS backend supports this natively via Cloud Storage's built-in
  locking) to prevent concurrent `apply` races, especially important once CI runs `apply`.

---

## 3. Module Example: Cloud Run Service

```hcl
# modules/cloud-run-service/variables.tf
variable "service_name" {
  type = string
}
variable "image" {
  type = string
}
variable "region" {
  type    = string
  default = "us-central1"
}
variable "min_instances" {
  type    = number
  default = 0
}
variable "max_instances" {
  type    = number
  default = 10
}
variable "env_vars" {
  type    = map(string)
  default = {}
}
variable "secret_env_vars" {
  description = "Map of ENV_VAR_NAME => Secret Manager secret ID"
  type        = map(string)
  default     = {}
}
variable "service_account_email" {
  type = string
}
```

```hcl
# modules/cloud-run-service/main.tf
resource "google_cloud_run_v2_service" "this" {
  name     = var.service_name
  location = var.region

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get { path = "/health" }
        failure_threshold = 3
        period_seconds     = 5
      }
      liveness_probe {
        http_get { path = "/health" }
        period_seconds = 10
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# modules/cloud-run-service/outputs.tf
output "uri" {
  value = google_cloud_run_v2_service.this.uri
}
output "name" {
  value = google_cloud_run_v2_service.this.name
}
```

### Usage per environment
```hcl
# environments/production/main.tf
module "api_service" {
  source = "../../modules/cloud-run-service"

  service_name           = "api-production"
  image                   = var.api_image
  min_instances           = 2
  max_instances           = 20
  service_account_email   = google_service_account.api_runtime.email

  env_vars = {
    NODE_ENV = "production"
  }

  secret_env_vars = {
    DATABASE_URL                  = google_secret_manager_secret.database_url.secret_id
    FIREBASE_SERVICE_ACCOUNT_JSON = google_secret_manager_secret.firebase_sa.secret_id
  }
}
```

---

## 4. Secrets in Terraform — Declare the Resource, Not the Value

```hcl
# Declares the secret container — does NOT set its value here
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url-${var.environment}"

  replication {
    auto {}
  }
}

# Grants access — also safe to declare in Terraform
resource "google_secret_manager_secret_iam_member" "api_access" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_runtime.email}"
}
```

**The secret value itself is never written into `.tf` files or `.tfvars` committed to git.**
Choose one of these patterns to populate the actual value:

### Option A — populate out-of-band via `gcloud`/console after `apply`
Terraform creates the empty secret container; a human or a separate, restricted-access script
adds the first version manually:
```bash
echo -n "postgresql://..." | gcloud secrets versions add database-url-production --data-file=-
```
Simplest and avoids the value ever touching Terraform state. Downside: secret creation and
value population are two manual steps.

### Option B — inject via a CI-only variable, never committed
```hcl
resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = var.database_url   # sourced from a CI secret (GitHub Actions secret), never .tfvars in git
}
```
The `var.database_url` value is passed via `TF_VAR_database_url` as a GitHub Actions secret at
`terraform apply` time — never written to a `.tfvars` file that's committed. Note this does
write the value into Terraform state, so state bucket access control (Option in section 2)
must be tightly restricted (`roles/storage.objectViewer` only for those who need it).

**Recommendation:** Option A for highly sensitive, rarely-rotated secrets (DB root credentials,
Firebase service account); Option B is acceptable for secrets that need to be reliably
reproducible from CI (e.g., generated API keys for a sandboxed third-party service) where the
convenience of full automation outweighs the state-file exposure, given tightened state bucket
IAM.

---

## 5. IAM — Least Privilege Service Accounts

Create a dedicated runtime service account per Cloud Run service — never reuse the default
Compute Engine service account or grant `roles/editor`:

```hcl
resource "google_service_account" "api_runtime" {
  account_id   = "api-runtime-${var.environment}"
  display_name = "API Runtime SA (${var.environment})"
}

resource "google_project_iam_member" "api_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

# Secret access granted per-secret, not project-wide (see section 4)
```

**Rule:** Every `google_project_iam_member` grant should be questioned — prefer
resource-level IAM bindings (e.g., `google_secret_manager_secret_iam_member` scoped to one
secret) over project-level roles whenever the GCP resource type supports it.

---

## 6. Variables and Environment Separation

```hcl
# environments/production/variables.tf
variable "environment" {
  type    = string
  default = "production"
}
variable "project_id" {
  type = string
}
variable "api_image" {
  description = "Fully qualified image, set by CI at apply time"
  type        = string
}
variable "database_url" {
  type      = string
  sensitive = true
}
```

```hcl
# environments/production/terraform.tfvars — safe to commit, no secret values
project_id = "your-gcp-project-prod"
```

`api_image` and `database_url` are passed at `apply` time via `-var` flags or `TF_VAR_*`
environment variables from CI, never hardcoded in a committed `tfvars` file.

---

## 7. Plan/Apply Workflow

- `terraform plan` runs on every pull request touching `infrastructure/`, with output posted
  as a PR comment for review (see `references/github-actions-ci.md`).
- `terraform apply` runs only on merge to the branch mapped to that environment, and only for
  production after the manual approval gate.
- Never run `terraform apply` from a local machine against production — all applies to shared
  environments go through CI, ensuring a consistent, audited execution path and consistent
  provider/Terraform version.
- Pin the Terraform and provider versions explicitly:
```hcl
terraform {
  required_version = "~> 1.7.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}
```

---

## 8. Review Checklist (Terraform-specific)

- [ ] All resources defined via reusable modules, not duplicated per environment
- [ ] Remote GCS backend with per-environment state separation
- [ ] No secret values present in any committed `.tf` or `.tfvars` file
- [ ] Service accounts are per-service and least-privilege, not shared or project-level `editor`
- [ ] Secret access (`secretAccessor`) granted per-secret, not project-wide
- [ ] Terraform and provider versions pinned
- [ ] `terraform plan` required and reviewed before any `apply` to production
