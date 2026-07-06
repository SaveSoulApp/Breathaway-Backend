# BreathAway Backend

The backend infrastructure for the **BreathAway** application. This project is built using [NestJS](https://nestjs.com/), a progressive Node.js framework, and serves as the core API for managing users, authentication, profiles, matching algorithms, in-app credits, and notifications.

---

## 🚀 Core Functionality & Features

- **Authentication & Authorization**: Multi-factor authentication supporting OTPs, JWT, Firebase, and Social Identities (Instagram, LinkedIn, Twitter).
- **User & Profile Management**: Secure handling of user profiles, identities, and device tokens.
- **Matching System**: Robust liking, matching, and match-resolution workflows between users.
- **Credit Ledger System**: Tracks credit purchases, bonuses, referrals, and expenditures using a transactional ledger.
- **Integrations**: 
  - **Firebase** for push notifications.
  - **Google Cloud Pub/Sub** for asynchronous event processing.
  - **GCP Secret Manager** for secure configuration handling.
  - **SendGrid** / **Nodemailer** for email communications.
- **Caching & Rate Limiting**: Redis-backed caching and strict throttling policies to prevent abuse.

---

## 🛠 Tech Stack

- **Framework**: [NestJS](https://nestjs.com/) v11 (TypeScript)
- **Database**: PostgreSQL (via [Prisma ORM](https://www.prisma.io/))
- **Caching**: Redis
- **Cloud/Infra**: Google Cloud Platform (Pub/Sub, Secret Manager)
- **Package Manager**: [pnpm](https://pnpm.io/)

---

## 💻 Local Setup & Development

### 1. Install Dependencies
Make sure you have `pnpm` installed globally, then run:
```bash
pnpm install
```

### 2. Environment Variables
The application uses environment-specific files (`.env.development`, `.env.production`). These files are never committed to the repository. The standard workflow synchronizes these into the `.env` file before executing commands.

```bash
# Sync development environment (if needed manually)
pnpm run syncenv:development
```

### 3. Run the Application
```bash
# Development mode (watch)
pnpm run start:dev

# Debug mode
pnpm run start:debug

# Production build and run
pnpm run build
pnpm run start:prod
```

---

## 🗄 Prisma ORM & Database Management

We use Prisma as our ORM. We provide custom scripts to safely handle migrations and schema generations for different environments by syncing the correct `.env` files automatically.

### Generating Prisma Client
After making changes to `prisma/schema.prisma` or pulling new code, regenerate the client types:
```bash
pnpm run generate:dev
# Or for production: pnpm run generate:prod
```

### Running Migrations

**Local Development (Creating Migrations):**
When you modify `prisma/schema.prisma` and want to create a new migration file:
```bash
pnpm run migrate:local
```
*(This maps to `prisma migrate dev` and should only be run against local development databases).*

**Deploying Migrations (Dev/Prod Servers):**
To apply existing migrations to a database (without resetting data or generating new migration files):
```bash
# Deploy to development database
pnpm run migrate:dev

# Deploy to production database
pnpm run migrate:prod
```

### Prisma Studio
To inspect and manage database records visually:
```bash
pnpm run studio:dev
```

---

## 🚢 Deployment

Deployment is orchestrated via custom shell scripts mapped to `pnpm` commands, allowing for consistent releases to Google Cloud (or your preferred environment).

To deploy the application, ensure you are authenticated with GCP and run:

```bash
# Deploy to the development environment
pnpm run deploy:dev

# Deploy to the production environment
pnpm run deploy:prod
```
These scripts will execute `./scripts/deploy.sh` with the respective environment flag (`--env=dev` or `--env=prod`).

---

## 🏗 Architecture & Guidelines

- **Modular Design**: Code is split into domain-specific modules inside `src/modules/` (e.g., `auth`, `profiles`, `matches`, `credits`).
- **Data Transfer Objects (DTOs)**: We strictly use class-validator and class-transformer for incoming request payloads and outgoing responses.
- **Dependency Injection**: Services and external clients (Prisma, GCP) are heavily decoupled via NestJS's DI container.
- **Error Handling & Logging**: Handled globally with customized Exception Filters and Pino-based structured logging suitable for GCP Cloud Logging.

---

## 🧪 Testing

```bash
# Unit tests
pnpm run test

# e2e tests
pnpm run test:e2e

# Test coverage
pnpm run test:cov
```

---

## 📖 Documentation (Docusaurus)

The project includes a comprehensive technical documentation site built with Docusaurus, located in the `docs-site` directory.

### Running the Docs Locally
```bash
# Start the documentation site locally on port 3001
pnpm run docs:start

# Build the documentation for production
pnpm run docs:build

# Serve the production build locally
pnpm run docs:serve
```

The documentation contains architectural guidelines, API conventions, and detailed modules breakdowns.
