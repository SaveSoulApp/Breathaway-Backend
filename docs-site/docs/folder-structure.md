---
sidebar_position: 4
---

# Folder Structure

This page describes the organization of the BreathAway repository. The project uses a clear separation between the core framework setup, external integrations, shared components, and feature modules.

---

## 📁 Repository Overview

Here is a high-level overview of the repository directories:

```
├── .agents/               # Custom AI agent guidelines, workflows, and skills
├── .github/               # GitHub Actions CI/CD workflows and configurations
├── prisma/                # Prisma ORM folder (schema definition and database migrations)
├── scripts/               # Utility shell scripts (e.g. deployment, testing envs setup)
├── terraform/             # Terraform infrastructure definition files (GCP resources)
├── test/                  # E2E (End-to-End) testing suites and configuration
├── docs-site/             # Docusaurus documentation website
├── src/                   # Main NestJS source code directory
├── package.json           # Project configurations and npm script shortcuts
├── tsconfig.json          # Global TypeScript configuration
└── pnpm-workspace.yaml    # Workspaces definition for pnpm
```

---

## 📁 The `src/` Directory Structure

The internal application code is organized as follows:

```
src/
├── common/                # Shared framework components
│   ├── decorators/        # Custom parameter or route decorators
│   ├── dto/               # Common data transfer objects
│   ├── enums/             # Global TypeScript enumerations
│   ├── filters/           # Framework-level exception filters
│   ├── guards/            # Global/common guards (e.g. client identity)
│   ├── interceptors/      # Common response/request interceptors
│   ├── middlewares/       # Express/NestJS middleware classes
│   ├── pipes/             # Input transformations and validators
│   └── utils/             # Helper utilities
│
├── config/                # Global configuration definitions and Swagger setups
│
├── core/                  # Core modules and GCP cloud integrations
│   ├── base/              # Abstract classes and base components
│   ├── crypto/            # Local encryption mechanisms
│   ├── exception-filters/ # Top-level global exception handler
│   ├── gcp-secret-manager/# GCP Secret Manager integration
│   ├── identity-crypto/   # GCP KMS-backed identity field encryption
│   └── logger/            # Pino structured logging provider
│
├── infrastructure/        # Third-party adapters and connections
│   ├── cache/             # Redis caching service layer
│   └── database/          # Prisma database client setup and filters
│
├── modules/               # Feature-based domain modules (business logic)
│   ├── auth/              # JWT, login, session management
│   ├── profiles/          # User personal profiles
│   ├── matches/           # Matching resolver and match statuses
│   └── .../               # Other business modules
│
├── shared/                # Shared business domains and domain exception classes
│   └── domain/
│       └── exceptions/    # Common domain error definitions
│
├── types/                 # Express, request, or environment type definitions
├── app.controller.ts      # Root entry controller
├── app.module.ts          # Main application module containing registration
├── app.service.ts         # Root entry service
└── main.ts                # Bootstrap file (entry point of the application)
```

---

## 📂 Structure of a Feature Module

Each folder inside `src/modules/` is self-contained. It encapsulates all classes, validation schemas, and types required for that specific feature.

Here is the standard layout of a feature module:

```
src/modules/likes/
├── dto/                   # Data Transfer Objects
│   ├── request/           # Incoming validations (e.g., create-like.request.dto.ts)
│   ├── response/          # Outgoing mappings (e.g., like.response.dto.ts)
│   └── index.ts           # Barrel file for exports
├── entities/              # Local business domain models (if applicable)
├── likes.controller.ts    # HTTP endpoint controller
├── likes.module.ts        # NestJS module definitions
├── likes.service.ts       # Business logic implementation
├── likes.types.ts         # Internal module types
└── tests/                 # Unit tests (e.g., likes.service.spec.ts)
```
