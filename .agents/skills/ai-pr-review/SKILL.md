---
name: ai-pr-review
description: >-
  Executes an automated local AI code review for the current local branch against develop,
  replicating .github/workflows/ai-pr-review.yml without external cloud models, APIs, or GitHub MCP.
  Analyzes branch git diffs against develop, generates an AI summary, Mermaid architecture/flow diagram,
  file walkthrough, and major changes list. Trigger when the user runs "/ai-review", "/ai-pr-review",
  "/pr-review", asks for an AI review, or asks to review the current branch against develop.
---

# AI Local Code Reviewer

This skill provides an automated, comprehensive code review of the **currently checked out local branch** compared against the **`develop`** branch (or `origin/develop`), replicating the review pipeline from [.github/workflows/ai-pr-review.yml](file:///.github/workflows/ai-pr-review.yml).

### Key Execution Principles
- **100% Local Inference**: Evaluates code directly using the active model in session. No external cloud endpoints, curl scripts, or `GEMINI_API_KEY` secrets needed.
- **Zero GitHub MCP / Open PR Dependency**: Operates entirely offline from GitHub PR APIs. It does not search for open PRs, list PRs, or make remote API updates. It reviews the local branch state directly.
- **Default Base Branch**: Compares the current local branch against `origin/develop` (fallback to `develop`).
- **Focused Output**: Delivers an executive architectural review containing only the high-value summary, Mermaid visualization, file-by-file walkthrough, and major changes.

---

## Slash Commands & Triggering

Users can trigger this skill using any of the following:

- `/ai-review` *(Default: reviews local running branch against `origin/develop`)*
- `/ai-pr-review`
- `/pr-review`
- `/ai-review --base <branch>` *(e.g. `--base main` if reviewing against a different branch)*
- `/ai-review --uncommitted` *(include unstaged or uncommitted working directory changes)*
- *"Review my current branch against develop"*

---

## Execution Protocol

When triggered, execute the following steps:

### Step 1: Detect Current Local Branch & Commit Context

Gather git branch and commit context locally:

```bash
git branch --show-current
git rev-parse --short HEAD
git log --oneline -n 10 $(git merge-base origin/develop HEAD)..HEAD
```

- Confirm the current branch name.
- Identify the commit history on this branch since splitting from `origin/develop`.

---

### Step 2: Extract & Filter Git Diff Against Develop

Run the local diff extractor script which applies the exact exclusions defined in `ai-pr-review.yml`:

```bash
.agents/skills/ai-pr-review/scripts/extract-pr-diff.sh --base origin/develop --stat
```

*(If `--uncommitted` was requested, add `--include-uncommitted`).*

**Exclusions Enforced**:
- Lockfiles: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`
- Generated artifacts & dependencies: `dist/**`, `coverage/**`, `generated/**`, `node_modules/**`
- Test files: `*.test.ts`, `*.spec.ts`, `test/**`
- Diffs larger than 900 KB are safely truncated with a truncation marker.

---

### Step 3: Deep Local Codebase Inspection

Leverage local workspace access to understand full context around modified files:
- Inspect modified controllers, services, and modules using `view_file`.
- Inspect schema relations in `prisma/schema.prisma` or migration files if models were added or changed.
- Inspect DTO request/response contracts and domain events emitted.

---

### Step 4: Generate Streamlined Review Output

Format the output strictly using the following 4 sections. **Do NOT include** sections for *Potential Bugs*, *Security Concerns*, *Performance Concerns*, *Maintainability*, or *Suggested Improvements*:

```markdown
## 🤖 AI Summary & Walkthrough
Provide a concise, high-level summary of what this branch accomplishes, its motivation, and its primary architectural impact.

## 🗺️ Architecture / Flow Diagram
Generate a valid Mermaid.js `sequenceDiagram` or `graph TD` visualizing the end-to-end data flow, request lifecycle, or service interactions introduced by the changes.
Enclose within ```mermaid code blocks with valid syntax and quoted labels.

## 📂 File Walkthrough
Provide a clean, bulleted list categorized by domain layer (e.g., Database & Config, Core Services, Webhooks & Admin), explaining what changed file-by-file.

## Major Changes
- High-level bulleted summary of key features, database models, endpoints, or architectural patterns introduced in this branch.
```

> **Trivial Changes Fast-Path**: If the diff contains only trivial modifications (e.g. whitespace, comments, or documentation bumps), output a concise 1-2 sentence summary and skip unused sections.
