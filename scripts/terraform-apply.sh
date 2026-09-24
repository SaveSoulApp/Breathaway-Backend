#!/bin/bash
# scripts/terraform-apply.sh
#
# Human-gated Terraform apply wrapper for the Breathaway multi-environment setup.
#
# Usage:
#   ./scripts/terraform-apply.sh --env=non-prod
#   ./scripts/terraform-apply.sh --env=prod
#
# What this script does:
#   1. Resolves the correct environment directory
#   2. Authenticates (prompts if no active gcloud session)
#   3. Runs `terraform init -reconfigure` (safe to re-run)
#   4. Runs `terraform plan -out=tfplan` and shows the output
#   5. Asks for explicit confirmation before applying
#   6. Applies the saved plan

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
TERRAFORM_ROOT="${SCRIPT_DIR}/../terraform/environments"

# ── Colour helpers ────────────────────────────────────────────────────────────
print_status()  { echo -e "\033[0;34m🔧 $1\033[0m"; }
print_success() { echo -e "\033[0;32m✅ $1\033[0m"; }
print_warning() { echo -e "\033[0;33m⚠️  $1\033[0m"; }
print_error()   { echo -e "\033[0;31m❌ $1\033[0m"; exit 1; }

# ── Argument parsing ──────────────────────────────────────────────────────────
ENV=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env=*) ENV="${1#*=}"; shift ;;
    --env|-e)
      [[ -z "${2:-}" ]] && print_error "Missing value for $1"
      ENV="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 --env=<non-prod|prod>"
      echo ""
      echo "Options:"
      echo "  --env=<non-prod|prod>   Target environment (required)"
      echo "  --help, -h              Show this help"
      exit 0 ;;
    *) print_error "Unknown argument '$1'. Run '$0 --help' for usage." ;;
  esac
done

if [[ "$ENV" != "non-prod" && "$ENV" != "prod" ]]; then
  print_error "Environment must be 'non-prod' or 'prod'. Got: '${ENV}'"
fi

TF_DIR="${TERRAFORM_ROOT}/${ENV}"

if [[ ! -d "$TF_DIR" ]]; then
  print_error "Terraform directory not found: ${TF_DIR}"
fi

# ── Production safety gate ────────────────────────────────────────────────────
if [[ "$ENV" == "prod" ]]; then
  print_warning "You are about to apply Terraform changes to PRODUCTION (breathaway)."
  print_warning "This affects live user traffic. Proceed only after reviewing the plan carefully."
  echo ""
  read -rp "Type 'production' to confirm you intend to apply to production: " PROD_CONFIRM
  if [[ "$PROD_CONFIRM" != "production" ]]; then
    echo "Aborted — confirmation text did not match."
    exit 0
  fi
fi

# ── Terraform init ────────────────────────────────────────────────────────────
print_status "Initializing Terraform for environment: [${ENV}]"
terraform -chdir="${TF_DIR}" init -reconfigure

# ── Terraform plan ────────────────────────────────────────────────────────────
PLAN_FILE="${TF_DIR}/tfplan"
print_status "Generating plan..."
terraform -chdir="${TF_DIR}" plan -out="${PLAN_FILE}"

echo ""
echo "──────────────────────────────────────────────────────"
print_warning "Review the plan above carefully before applying."
read -rp "Apply the plan for [${ENV}]? (yes/no): " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted — plan was NOT applied."
  rm -f "${PLAN_FILE}"
  exit 0
fi

# ── Terraform apply ───────────────────────────────────────────────────────────
print_status "Applying plan..."
terraform -chdir="${TF_DIR}" apply "${PLAN_FILE}"

# Clean up saved plan file after successful apply
rm -f "${PLAN_FILE}"

print_success "Terraform apply complete for [${ENV}]."

if [[ "$ENV" == "non-prod" ]]; then
  echo ""
  print_warning "Reminder: If new secrets were created, populate their values:"
  echo "   See terraform/README.md → 'Post-Apply Secret Checklist'"
fi
