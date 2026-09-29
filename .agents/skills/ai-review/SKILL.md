---
name: ai-review
description: >-
  Executes an automated local AI code review for the current local branch against develop,
  replicating .github/workflows/ai-review.yml without external cloud models, APIs, or GitHub MCP.
  Analyzes branch git diffs against develop, identifies potential bugs, security concerns,
  performance concerns, maintainability issues, and suggested improvements. Trigger when the user runs "/ai-review",
  "/pr-review", asks for an AI review, or asks to review the current branch against develop.
---

# AI Local Code Reviewer

This skill provides an automated, comprehensive code review of the **currently checked out local branch** compared against the **`develop`** branch (or `origin/develop`), replicating the review pipeline from [.github/workflows/ai-review.yml](file:///.github/workflows/ai-review.yml).

### Key Execution Principles
- **100% Local Inference**: Evaluates code directly using the active model in session. No external cloud endpoints, curl scripts, or `GEMINI_API_KEY` secrets needed.
- **Zero GitHub MCP / Open PR Dependency**: Operates entirely offline from GitHub PR APIs. It does not search for open PRs, list PRs, or make remote API updates. It reviews the local branch state directly.
- **Default Base Branch**: Compares the current local branch against `origin/develop` (fallback to `develop`).
- **Focused Output**: Delivers an actionable engineering code review strictly structured around Potential Bugs, Security Concerns, Performance Concerns, Maintainability, and Suggested Improvements.

---

## Slash Commands & Triggering

Users can trigger this skill using any of the following:

- `/ai-review` *(Default: reviews local running branch against `origin/develop`)*
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

Run the local diff extractor script which applies the exact exclusions defined in `ai-review.yml`:

```bash
.agents/skills/ai-review/scripts/extract-pr-diff.sh --base origin/develop --stat
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
- Cross-reference with [.agents/skills/ai-review/references/review-checklists.md](file:///.agents/skills/ai-review/references/review-checklists.md).

---

### Step 4: Generate Streamlined Review Output

Format the output strictly using the following 5 sections. **Do NOT include** sections for *AI Summary & Walkthrough*, *Architecture / Flow Diagram*, *File Walkthrough*, or *Major Changes*:

```markdown
## Potential Bugs
Identify logic errors, edge cases, regex traps, unhandled exceptions, race conditions, or incorrect assumptions in the code.

## Security Concerns
Identify authorization gaps, authentication flaws, IDOR vulnerabilities, unauthenticated endpoint exposure, weak PRNG, unhandled injection, or information disclosure in logs.

## Performance Concerns
Identify N+1 queries, unindexed filters, duplicate operations/evaluations, connection leaks, unoptimized transactions, or unneeded overhead under load.

## Maintainability
Identify violations of project standards (e.g. 4-group imports, absolute paths, decoupled notification architecture), hardcoded copy/configurations, inconsistent typing/formatting, or anti-patterns.

## Suggested Improvements
Actionable code snippets, concrete architectural refactors, and test coverage suggestions directly addressing the concerns identified above.
```

> **Clean Code Fast-Path**: If the diff contains no issues in a given category, state "No critical concerns identified" under that heading with a brief 1-line justification.
