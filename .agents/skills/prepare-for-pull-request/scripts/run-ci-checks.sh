#!/usr/bin/env bash

# ==============================================================================
# run-ci-checks.sh — Local CI Quality Gate Runner
# Mirrors GitHub Actions CI pipeline (.github/workflows/tests.yaml)
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

# Parse arguments
QUICK_MODE=false
FIX_MODE=false
TESTS_ONLY=false

for arg in "$@"; do
  case $arg in
    --quick|-q)
      QUICK_MODE=true
      shift
      ;;
    --fix|-f)
      FIX_MODE=true
      shift
      ;;
    --tests-only|-t)
      TESTS_ONLY=true
      shift
      ;;
    --help|-h)
      echo -e "${BOLD}Usage:${RESET} $0 [options]"
      echo ""
      echo "Options:"
      echo "  -f, --fix         Auto-format code and apply auto-fixable ESLint rules"
      echo "  -q, --quick       Skip unit tests; run Prisma generate, lint, and tsc only"
      echo "  -t, --tests-only  Run only unit tests and coverage"
      echo "  -h, --help        Show this help message"
      exit 0
      ;;
  esac
done

echo -e "\n${BOLD}${CYAN}======================================================${RESET}"
echo -e "${BOLD}${CYAN}   🚀 Pre-PR Local CI Quality Gate Runner${RESET}"
echo -e "${BOLD}${CYAN}   Target: .github/workflows/tests.yaml parity${RESET}"
echo -e "${BOLD}${CYAN}======================================================${RESET}\n"

TOTAL_START=$(date +%s)
FAILED_GATES=()

run_gate() {
  local GATE_NAME="$1"
  local CMD="$2"
  local START_TIME
  START_TIME=$(date +%s)

  echo -e "${BOLD}▶ Running: ${GATE_NAME}...${RESET}"
  echo -e "${GRAY}  $ ${CMD}${RESET}"

  if eval "$CMD"; then
    local END_TIME
    END_TIME=$(date +%s)
    local DURATION=$((END_TIME - START_TIME))
    echo -e "  ${GREEN}✔ PASSED${RESET} ${GRAY}(${DURATION}s)${RESET}\n"
    return 0
  else
    local END_TIME
    END_TIME=$(date +%s)
    local DURATION=$((END_TIME - START_TIME))
    echo -e "  ${RED}✖ FAILED${RESET} ${GRAY}(${DURATION}s)${RESET}\n"
    FAILED_GATES+=("$GATE_NAME")
    return 1
  fi
}

# --- GATE 1: Dependency Check ---
if ! command -v pnpm &> /dev/null; then
  echo -e "${RED}Error: pnpm is required but not installed in PATH.${RESET}"
  exit 1
fi

if [ "$TESTS_ONLY" = false ]; then
  # --- GATE 2: Prisma Client Generation ---
  # DATABASE_URL fallback dummy DSN satisfies eager load-time validation in prisma.config.ts
  run_gate "Prisma Client Generation" \
    'DATABASE_URL="${DATABASE_URL:-postgresql://ci:ci@localhost:5432/ci}" pnpm exec prisma generate'

  # --- GATE 3: Code Formatting (Prettier) ---
  if [ "$FIX_MODE" = true ]; then
    run_gate "Prettier Format (Auto-fix)" \
      'npx prettier --write "src/**/*.ts" "test/**/*.ts"'
  fi

  # --- GATE 4: ESLint ---
  run_gate "ESLint Verification" \
    'pnpm lint'

  # --- GATE 5: Static Type-checking (tsc) ---
  run_gate "TypeScript Type-Check (tsc --noEmit)" \
    'pnpm exec tsc --noEmit'
fi

# --- GATE 6: Unit Tests & Coverage ---
if [ "$QUICK_MODE" = false ]; then
  run_gate "Jest Unit Tests & Coverage" \
    'pnpm exec jest --coverage --ci --passWithNoTests'
fi

TOTAL_END=$(date +%s)
TOTAL_DURATION=$((TOTAL_END - TOTAL_START))

echo -e "${BOLD}${CYAN}======================================================${RESET}"
echo -e "${BOLD}${CYAN}   🏁 CI Gate Run Summary (${TOTAL_DURATION}s)${RESET}"
echo -e "${BOLD}${CYAN}======================================================${RESET}"

if [ ${#FAILED_GATES[@]} -eq 0 ]; then
  echo -e "${BOLD}${GREEN}🎉 ALL GATES PASSED! Your branch is ready for Pull Request.${RESET}\n"
  exit 0
else
  echo -e "${BOLD}${RED}❌ FAILED GATES (${#FAILED_GATES[@]}):${RESET}"
  for gate in "${FAILED_GATES[@]}"; do
    echo -e "  ${RED}• ${gate}${RESET}"
  done
  echo -e "\n${YELLOW}Please resolve the errors above before opening your PR.${RESET}\n"
  exit 1
fi
