---
sidebar_position: 14
---

# Identity Workflows Module

The `IdentityWorkflowsModule` orchestrates compound onboarding and identity validation workflows.

---

## 📋 Purpose & Responsibilities

- **Onboarding Workflow Execution**: Combines multiple registration steps (OTP verification, Instagram linking, and initial profile setup) into atomic client flows.
- **Workflow State Auditing**: Tracks the registration progress of new users to optimize signup conversion funnels.

---

## 🛠 File & Class Definitions

### Controller
- **[IdentityWorkflowsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/identity-workflows/identity-workflows.controller.ts)**: Exposes routes for progressive onboarding transitions.
  - Route Prefix: `/api/v1/identity-workflows`

### Service
- **[IdentityWorkflowsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/identity-workflows/identity-workflows.service.ts)**: Guides the user account transitions through registration states, coordinating with the `IdentitiesService`, `OneTimePasswordsService`, and `ProfilesService`.
