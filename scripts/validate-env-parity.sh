#!/bin/bash

# ==============================================================================
# validate-env-parity.sh
#
# Enforces that common.prod.sh implements every key declared in common.dev.sh.
# Think of common.dev.sh as the "interface" — prod must satisfy it.
#
# Usage:
#   bash scripts/validate-env-parity.sh
#
# Exit codes:
#   0 — all keys present (pass)
#   1 — one or more keys missing in prod (fail)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_FILE="${SCRIPT_DIR}/common.dev.sh"
PROD_FILE="${SCRIPT_DIR}/common.prod.sh"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

# Extract all `export KEY=...` variable names from a file.
# Handles:
#   export FOO="bar"
#   export FOO='bar'
#   export FOO=bar
extract_keys() {
  grep -E '^[[:space:]]*export [A-Z_][A-Z0-9_]*=' "$1" \
    | sed -E 's/^[[:space:]]*export ([A-Z_][A-Z0-9_]*)=.*/\1/' \
    | sort -u
}

DEV_KEYS=$(extract_keys "$DEV_FILE")
PROD_KEYS=$(extract_keys "$PROD_FILE")

MISSING=()
while IFS= read -r key; do
  if ! echo "$PROD_KEYS" | grep -qx "$key"; then
    MISSING+=("$key")
  fi
done <<< "$DEV_KEYS"

echo ""
echo "${BOLD}🔍 Env Parity Check${RESET}"
echo "   Interface : $(basename "$DEV_FILE")"
echo "   Impl      : $(basename "$PROD_FILE")"
echo ""

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "${RED}${BOLD}❌ FAILED — the following keys are missing from $(basename "$PROD_FILE"):${RESET}"
  echo ""
  for key in "${MISSING[@]}"; do
    echo "   ${YELLOW}→ ${key}${RESET}"
  done
  echo ""
  echo "${RED}Add the missing keys to common.prod.sh with their production values.${RESET}"
  echo ""
  exit 1
fi

DEV_COUNT=$(echo "$DEV_KEYS" | wc -l | tr -d ' ')
echo "${GREEN}${BOLD}✅ PASSED — all ${DEV_COUNT} keys from $(basename "$DEV_FILE") are present in $(basename "$PROD_FILE")${RESET}"
echo ""
