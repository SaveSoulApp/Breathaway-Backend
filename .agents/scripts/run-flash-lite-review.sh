#!/bin/bash

# Configuration defaults
MODEL_NAME=${AI_REVIEW_MODEL:-"gemini-3.1-flash-lite"}
API_ENDPOINT=${AI_REVIEW_ENDPOINT:-"https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent"}
MAX_BYTES=${AI_REVIEW_MAX_BYTES:-900000}

# Load environment variables if .env exists
if [ -f .env ]; then
  if ! git check-ignore -q .env; then
    echo "Warning: .env file is not in .gitignore. Please add it to prevent secret leakage!"
  fi
  set -a
  source .env
  set +a
fi

if [ -z "$GEMINI_API_KEY" ]; then
  echo "Error: GEMINI_API_KEY is not set. Please add it to your .env file or export it."
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed."
  exit 1
fi

if ! command -v curl &> /dev/null; then
  echo "Error: curl is required but not installed."
  exit 1
fi

echo "Generating local git diff..."
# We diff the current uncommitted changes. 
# If the working directory is clean, this will be empty, so we should check for that.
git diff > diff.txt

if [ ! -s diff.txt ]; then
  # If diff is empty, maybe they have staged changes? Let's check staged as well.
  git diff --cached > diff.txt
fi

if [ ! -s diff.txt ]; then
  echo "Error: No uncommitted changes found. Please make some changes before running the review."
  rm diff.txt
  exit 1
fi

ACTUAL_BYTES=$(wc -c < diff.txt)

if [ "$ACTUAL_BYTES" -gt "$MAX_BYTES" ]; then
  echo "Diff exceeds ${MAX_BYTES} bytes — truncating to avoid context overflow"
  head -c "$MAX_BYTES" diff.txt > diff_trimmed.txt
  printf '\n\n... (diff truncated — code change is too large for a full review)\n' >> diff_trimmed.txt
  mv diff_trimmed.txt diff.txt
fi

cat <<'HEADER' > prompt_header.txt
You are a senior NestJS backend engineer.

Review this code change.

Repository Stack:
- NestJS
- Prisma
- PostgreSQL
- TypeScript

Look specifically for:
- NestJS dependency injection issues
- Prisma query mistakes
- N+1 queries
- Missing transactions for multi-step writes
- DTO validation
- Guards
- Interceptors
- Exception filters
- SQL performance and PostgreSQL indexes
- Breaking API changes
- Swagger changes

If the diff is trivial (e.g. only version bumps, comment changes, or
whitespace), respond with a one-line summary and skip unused sections.

Please generate a review with the following sections. Output MUST be valid Markdown.

## 🤖 AI Summary & Walkthrough
Provide a high-level summary of what this code change accomplishes.

## 🗺️ Architecture / Flow Diagram
Generate a Mermaid.js `graph TD` or `sequenceDiagram` that visualizes the changes. 
Use valid mermaid syntax enclosed in ```mermaid code blocks.

## 📂 File Walkthrough
Provide a bulleted list explaining the key changes file-by-file.

## Major Changes
## Potential Bugs
## Security Concerns
## Performance Concerns
## Maintainability
## Suggested Improvements

Git Diff:
HEADER

cat prompt_header.txt diff.txt > prompt.txt

echo "Calling Gemini 3.1 Flash Lite API..."
jq -Rs '{contents:[{parts:[{text:.}]}]}' prompt.txt > body.json

HTTP_STATUS=$(curl -s -o response.json -w "%{http_code}" -X POST \
  "${API_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: ${GEMINI_API_KEY}" \
  -d @body.json)

if [ "$HTTP_STATUS" != "200" ]; then
  echo "Gemini API error response (HTTP ${HTTP_STATUS}):"
  cat response.json
  rm -f diff.txt prompt_header.txt prompt.txt body.json response.json
  exit 1
fi

jq -r '.candidates[0].content.parts[0].text' response.json > review.md
echo "Review generated successfully in review.md"

# Cleanup temp files
rm -f diff.txt prompt_header.txt prompt.txt body.json response.json
