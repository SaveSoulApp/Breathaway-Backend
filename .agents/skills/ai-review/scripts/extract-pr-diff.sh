#!/usr/bin/env bash

# ==============================================================================
# extract-pr-diff.sh — Local PR Diff Extractor
# Replicates diff extraction from .github/workflows/ai-pr-review.yml
# ==============================================================================

set -uo pipefail

# ANSI Color Codes
RESET="\033[0m"
BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
CYAN="\033[36m"
GRAY="\033[90m"

# Move to repository root
ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR" || exit 1

# Default values matching ai-pr-review.yml
MAX_BYTES=900000   # ~900 KB guard against oversized diffs
BASE_REF=""
OUTPUT_FILE=""
PRINT_STAT=false
INCLUDE_UNCOMMITTED=false

# Helper to print usage
usage() {
  echo -e "${BOLD}Usage:${RESET} $0 [options]"
  echo ""
  echo "Options:"
  echo "  -b, --base <branch>       Base branch to compare against (e.g. main, origin/main)"
  echo "  -o, --output <file>       Write diff to a file instead of stdout"
  echo "  -m, --max-bytes <bytes>   Maximum diff size in bytes before truncation (default: 900000)"
  echo "  -u, --include-uncommitted Include uncommitted/staged working directory changes"
  echo "  -s, --stat                Print diffstat summary to stderr"
  echo "  -h, --help                Show this help message"
  exit 0
}

# Parse options
while [[ $# -gt 0 ]]; do
  case $1 in
    -b|--base)
      BASE_REF="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    -m|--max-bytes)
      MAX_BYTES="$2"
      shift 2
      ;;
    -u|--include-uncommitted)
      INCLUDE_UNCOMMITTED=true
      shift
      ;;
    -s|--stat)
      PRINT_STAT=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo -e "${RED}Unknown option: $1${RESET}" >&2
      usage
      ;;
  esac
done

# Auto-detect base branch if not provided (defaulting to develop branch)
if [[ -z "$BASE_REF" ]]; then
  for candidate in "origin/develop" "develop" "origin/main" "main" "origin/master" "master"; do
    if git rev-parse --verify "$candidate" >/dev/null 2>&1; then
      BASE_REF="$candidate"
      break
    fi
  done
fi

if [[ -z "$BASE_REF" ]]; then
  echo -e "${RED}Error: Could not automatically detect base branch. Specify one using --base <branch>${RESET}" >&2
  exit 1
fi

# Fetch base ref if it belongs to origin and remote is reachable
if [[ "$BASE_REF" =~ ^origin/ ]]; then
  REMOTE_BRANCH="${BASE_REF#origin/}"
  git fetch origin "$REMOTE_BRANCH" --quiet 2>/dev/null || true
fi

# Target commit: HEAD or working tree
COMPARE_TARGET="HEAD"

# Build exclusions matching .github/workflows/ai-pr-review.yml
EXCLUDE_SPECS=(
  ':(exclude)package-lock.json'
  ':(exclude)pnpm-lock.yaml'
  ':(exclude)yarn.lock'
  ':(exclude)dist/**'
  ':(exclude)coverage/**'
  ':(exclude)generated/**'
  ':(exclude)node_modules/**'
  ':(exclude)*.test.ts'
  ':(exclude)*.spec.ts'
  ':(exclude)test/**'
)

# Optional diffstat output
if [[ "$PRINT_STAT" == true ]]; then
  echo -e "${BOLD}${CYAN}Diff Summary (${BASE_REF}...${COMPARE_TARGET}):${RESET}" >&2
  git diff --stat "$BASE_REF...$COMPARE_TARGET" -- . "${EXCLUDE_SPECS[@]}" >&2 || true
  echo "" >&2
fi

# Create a temporary file for the raw diff
TMP_DIFF=$(mktemp)
trap 'rm -f "$TMP_DIFF"' EXIT

# Generate diff
if [[ "$INCLUDE_UNCOMMITTED" == true ]]; then
  # Compare working tree against merge-base
  MERGE_BASE=$(git merge-base "$BASE_REF" HEAD 2>/dev/null || echo "$BASE_REF")
  git diff "$MERGE_BASE" -- . "${EXCLUDE_SPECS[@]}" > "$TMP_DIFF"
else
  git diff "$BASE_REF...$COMPARE_TARGET" -- . "${EXCLUDE_SPECS[@]}" > "$TMP_DIFF"
fi

ACTUAL_BYTES=$(wc -c < "$TMP_DIFF" | tr -d ' ')

# Truncate if diff exceeds MAX_BYTES
if [[ "$ACTUAL_BYTES" -gt "$MAX_BYTES" ]]; then
  echo -e "${YELLOW}Warning: Diff size (${ACTUAL_BYTES} bytes) exceeds limit (${MAX_BYTES} bytes). Truncating...${RESET}" >&2
  TRUNCATED_TMP=$(mktemp)
  head -c "$MAX_BYTES" "$TMP_DIFF" > "$TRUNCATED_TMP"
  printf '\n\n... (diff truncated — PR is too large for a full review)\n' >> "$TRUNCATED_TMP"
  mv "$TRUNCATED_TMP" "$TMP_DIFF"
fi

# Output diff
if [[ -n "$OUTPUT_FILE" ]]; then
  mkdir -p "$(dirname "$OUTPUT_FILE")"
  cp "$TMP_DIFF" "$OUTPUT_FILE"
  echo -e "${GREEN}Diff written to: ${OUTPUT_FILE} (${ACTUAL_BYTES} bytes, base: ${BASE_REF})${RESET}" >&2
else
  cat "$TMP_DIFF"
fi
