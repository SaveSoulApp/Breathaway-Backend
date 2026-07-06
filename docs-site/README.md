# BreathAway Backend Documentation Site

This is the Docusaurus-based technical documentation site for the BreathAway API backend service.

---

## 🛠 Features

- **Document Root**: Docs are served directly from the root route (`/`).
- **Diagrams**: Native support for rendering diagrams using Mermaid.js (`@docusaurus/theme-mermaid`).
- **Syntax Highlighting**: Supports TypeScript, JSON, SQL, Docker, and shell script highlighting.
- **Dark Mode**: Configured out of the box with standard dark/light themes.

---

## 🚀 Running Locally

You can run this site independently using `pnpm` from the project root.

### 1. Install Dependencies
Run from the workspace root:
```bash
pnpm install
```

### 2. Start the Site
Run from the workspace root:
```bash
pnpm run docs:start
```
Alternatively, navigate to this directory and run:
```bash
pnpm run start
```
The site will start on [http://localhost:3000](http://localhost:3000) (or `http://localhost:3001` if port 3000 is occupied by the NestJS API).

---

## 📦 Building for Production

To compile the documentation into static HTML files:
```bash
# From workspace root
pnpm run docs:build

# From this directory
pnpm run build
```
The compiled assets will be placed in the `/build` directory.
