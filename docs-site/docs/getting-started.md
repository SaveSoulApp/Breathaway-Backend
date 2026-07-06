---
sidebar_position: 2
---

# Getting Started

Follow this guide to set up the BreathAway backend application and the documentation site on your local machine.

## Prerequisites

Before starting, ensure you have the following installed:
- **Node.js**: `v20` or higher (tested on `v25.9.0`)
- **Package Manager**: `pnpm` (version `10.15.1`)
- **Database**: PostgreSQL (either a local instance or running via Docker)
- **Containerization**: Docker (optional, but recommended for running PostgreSQL/Redis locally)
- **GCP SDK**: Google Cloud CLI (authenticated to access secret manager/KMS if running with real cloud credentials)

---

## 1. Installation

Clone the repository and install dependencies from the root directory:

```bash
pnpm install
```

This command will install the dependencies for both the root NestJS backend and the `/docs-site` documentation website since it is configured as a pnpm workspace.

---

## 2. Environment Setup

The application uses environment-specific files to manage configurations. The standard configuration flow relies on `.env.development` (for local development) and `.env.test` (for testing).

### Syncing Environment Variables
A startup script is provided to link the development environment file:

```bash
# Symlinks .env.development to .env
pnpm run syncenv:development
```

> [!WARNING]
> Environment files (`.env`, `.env.development`, `.env.test`) contain sensitive configurations and must never be committed to source control.

---

## 3. Database Setup

We use Prisma ORM to interact with our PostgreSQL database.

### Running PostgreSQL locally via Docker
If you do not have a running PostgreSQL instance, you can spin one up using the included `docker-compose.yml`:

```bash
docker-compose up -d
```

### Applying Migrations
Apply the database migrations to your local PostgreSQL instance:

```bash
# This creates/applies migrations on your local database
pnpm run migrate:local
```

### Seeding or Generating Prisma Client
Regenerate the Prisma Client after migrating or editing the schema:

```bash
pnpm run generate:dev
```

---

## 4. Run the Application

Start the NestJS backend in development mode with hot-reloading (watch mode):

```bash
pnpm run start:dev
```

The application will start by default on port `3000`. You can verify it is running by visiting:
- Health check: `http://localhost:3000/api/v1/health`
- Swagger UI (if enabled): `http://localhost:3000/api/public`

---

## 5. Run the Documentation Site

You can run the Docusaurus documentation site independently from the root folder:

```bash
# Starts Docusaurus local development server
pnpm run docs:start
```

Open your browser and navigate to `http://localhost:3000` (or `http://localhost:3001` if port 3000 is occupied by the backend API) to view the documentation site.
