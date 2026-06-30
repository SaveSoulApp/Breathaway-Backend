# GitHub Actions CI/CD

Reference for structuring CI/CD pipelines: lint/test/build gates, Workload Identity Federation
auth to GCP, Docker build/push, Terraform plan/apply, and Cloud Run deployment with rollback.

---

## 1. Authentication — Workload Identity Federation (no downloaded keys)

Never store a downloaded GCP service account JSON key as a GitHub secret. Use Workload
Identity Federation so GitHub Actions authenticates to GCP using short-lived, automatically
rotated tokens tied to the specific repo/workflow.

### One-time GCP setup (via Terraform, see `terraform-standards.md`)
```hcl
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions-pool"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_actions_impersonation" {
  service_account_id = google_service_account.ci_deployer.name
  role                = "roles/iam.workloadIdentityUser"
  member              = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/your-org/your-repo"
}
```

### Workflow usage
```yaml
permissions:
  contents: read
  id-token: write   # required for Workload Identity Federation

jobs:
  deploy:
    steps:
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/123456789/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider'
          service_account: 'ci-deployer@your-project.iam.gserviceaccount.com'
```

---

## 2. Pipeline Structure

### Stage gating principle
Each stage must pass before the next runs. A failed lint or test blocks build and deploy
entirely — never allow deployment to proceed past a failed quality gate.

```
lint → unit test → build (Docker image) → [E2E test, if applicable] → deploy
```

### Full workflow example
```yaml
# .github/workflows/ci-cd.yml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

permissions:
  contents: read
  id-token: write

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  unit-test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm run test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  e2e-test:
    runs-on: ubuntu-latest
    needs: unit-test
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
      - run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          FIREBASE_AUTH_EMULATOR_HOST: localhost:9099

  build-and-push:
    runs-on: ubuntu-latest
    needs: [unit-test, e2e-test]
    if: github.event_name == 'push'
    outputs:
      image: ${{ steps.image-tag.outputs.image }}
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.CI_DEPLOYER_SA }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud auth configure-docker us-central1-docker.pkg.dev
      - id: image-tag
        run: echo "image=us-central1-docker.pkg.dev/${{ vars.PROJECT_ID }}/api/api:${{ github.sha }}" >> "$GITHUB_OUTPUT"
      - run: docker build -t ${{ steps.image-tag.outputs.image }} .
      - run: docker push ${{ steps.image-tag.outputs.image }}

  deploy-staging:
    runs-on: ubuntu-latest
    needs: build-and-push
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.CI_DEPLOYER_SA }}
      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
      - uses: hashicorp/setup-terraform@v3
      - run: terraform -chdir=infrastructure/environments/staging init
      - run: terraform -chdir=infrastructure/environments/staging apply -auto-approve
                -var="api_image=${{ needs.build-and-push.outputs.image }}"

  deploy-production:
    runs-on: ubuntu-latest
    needs: build-and-push
    if: github.ref == 'refs/heads/main'
    environment: production   # GitHub Environment with required reviewers — manual approval gate
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.CI_DEPLOYER_SA }}
      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
      - uses: hashicorp/setup-terraform@v3
      - run: terraform -chdir=infrastructure/environments/production init
      - run: terraform -chdir=infrastructure/environments/production apply -auto-approve
                -var="api_image=${{ needs.build-and-push.outputs.image }}"
```

**Key points:**
- `e2e-test` spins up a real Postgres service container and runs `prisma migrate deploy`
  against it — matching the `test-automation-expert` skill's E2E conventions (real DB, not
  mocked).
- Migrations run as an explicit pipeline step **before** `terraform apply` updates the Cloud
  Run revision, consistent with the rule in `cloud-run-deployment.md` against running
  migrations inside `bootstrap()`.
- `environment: production` in the job maps to a GitHub Environment configured with required
  reviewers in repo settings — this is the manual approval gate.
- Image tag uses the git SHA, never `:latest`, so every deploy is traceable to an exact commit
  and rollback can target a specific previous image precisely.

---

## 3. Terraform Plan on Pull Requests

```yaml
# .github/workflows/terraform-plan.yml
name: Terraform Plan

on:
  pull_request:
    paths: ['infrastructure/**']

permissions:
  contents: read
  id-token: write
  pull-requests: write

jobs:
  plan:
    strategy:
      matrix:
        environment: [staging, production]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.CI_DEPLOYER_SA }}
      - uses: hashicorp/setup-terraform@v3
      - run: terraform -chdir=infrastructure/environments/${{ matrix.environment }} init
      - run: terraform -chdir=infrastructure/environments/${{ matrix.environment }} plan -no-color
        id: plan
      - uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `Terraform plan (${{ matrix.environment }}):\n\`\`\`\n${{ steps.plan.outputs.stdout }}\n\`\`\``
            });
```
Posting `plan` output as a PR comment makes infrastructure changes reviewable the same way as
code changes, before anyone runs `apply`.

---

## 4. Rollback

Cloud Run keeps prior revisions available. A rollback is a traffic-split change, not a redeploy:

```bash
# List recent revisions
gcloud run revisions list --service=api-production --region=us-central1

# Roll back traffic to a known-good previous revision
gcloud run services update-traffic api-production \
  --region=us-central1 \
  --to-revisions=api-production-00042-abc=100
```

**Rules:**
- Document this as a runbook step, not something improvised during an incident.
- Database migrations are the hard part of rollback: if the new revision's migration is not
  backward-compatible with the previous revision's code, rolling back the Cloud Run revision
  alone is insufficient — this is exactly why `prisma-optimizer`'s and `schema-design.md`'s
  multi-step migration discipline (additive-first, breaking changes split across deploys)
  matters: it keeps every revision rollback-safe against the current schema.
- Consider adding a dedicated `rollback.yml` workflow that accepts a target revision as input
  and runs the `update-traffic` command via CI, so rollback doesn't require a human running
  `gcloud` commands locally during an incident.

---

## 5. Secrets Available to GitHub Actions

Store these as GitHub Actions secrets/variables (`Settings → Secrets and variables → Actions`):

| Name | Type | Purpose |
|---|---|---|
| `WIF_PROVIDER` | variable | Workload Identity Federation provider resource name |
| `CI_DEPLOYER_SA` | variable | Service account email CI impersonates |
| `PROJECT_ID` | variable | GCP project ID |
| `STAGING_DATABASE_URL` | secret | Used only for the migration step against staging |
| `PRODUCTION_DATABASE_URL` | secret | Used only for the migration step against production, gated by environment protection |

Use GitHub Environment-scoped secrets (not repo-wide) for anything production-specific, so
they're only accessible to jobs running under the `production` environment with its approval
gate — this prevents a PR-triggered job from ever having access to production credentials.

---

## 6. Review Checklist (CI/CD-specific)

- [ ] Workload Identity Federation used; no downloaded SA key in GitHub secrets
- [ ] Lint and unit tests block build/deploy on failure
- [ ] E2E tests run against a real (ephemeral, CI-provisioned) Postgres instance, not mocks
- [ ] Docker images tagged with git SHA, never `:latest`, for traceable/precise rollback
- [ ] Migrations run as an explicit pre-deploy step, never inside app `bootstrap()`
- [ ] Production deploy gated by a GitHub Environment with required reviewers
- [ ] Production secrets scoped to the `production` GitHub Environment, not repo-wide
- [ ] Terraform plan runs and is posted for review on PRs touching `infrastructure/`
- [ ] A documented/tested rollback procedure exists (revision traffic-split, not redeploy)
