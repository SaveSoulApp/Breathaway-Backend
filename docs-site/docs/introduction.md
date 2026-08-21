---
slug: /
sidebar_position: 1
---

# BreathAway Backend Documentation

Welcome to the technical documentation for the **BreathAway** backend system.

BreathAway is a progressive social and relationship platform that facilitates meaningful connections. This documentation serves as the single source of truth for the backend application design, API conventions, infrastructure, data models, and domain modules.

## 🚀 Core Platform Features

- **Robust Authentication & Verification**: Supports OTP verification, JWT-based sessions, Firebase integration, and multiple OAuth Social Identities (Instagram, LinkedIn, Twitter).
- **Encrypted Identity Architecture**: Advanced security layers that encrypt sensitive user identifiers (emails, phone numbers) using AES-256-GCM, wrapping encryption keys with Google Cloud KMS.
- **Match-Making & Workflows**: Real-time liking, mutual matching, and background match resolution workflows.
- **Credit Ledger Ledger**: A double-entry ledger database for user credits (purchases, referrals, subscription allocations, and action expenditures).
- **Stateless Infrastructure**: Runs containerized on GCP Cloud Run, utilizing Redis for caching, Cloud SQL for PostgreSQL, and GCP Pub/Sub for asynchronous event handling.

## 🛠 Tech Stack

- **Framework**: NestJS v11 (TypeScript)
- **Database**: PostgreSQL (via Prisma ORM)
- **Caching**: Redis
- **Infra/Cloud**: Google Cloud Platform (Cloud Run, Cloud SQL, Secret Manager, Pub/Sub, KMS, Cloud Logging)
- **Package Manager**: pnpm

## 📖 How to Navigate These Docs

- **[Getting Started](./getting-started.md)**: Set up the project locally, configure environment variables, and run the service.
- **[Architecture & Guidelines](./architecture.md)**: Discover our system architecture, design patterns, and coding standards.
- **[Folder Structure](./folder-structure.md)**: Explore the repository structure and understand the separation of concerns.
- **[NestJS Modules](./modules/auth.md)**: Technical deep-dives into all 25 modules of the BreathAway API.
- **[API reference](./api/overview.md)**: Documentation on HTTP protocols, authentication, and endpoints.
- **[Testing](./testing.md)**: Run unit and E2E tests.
