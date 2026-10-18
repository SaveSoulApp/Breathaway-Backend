#!/bin/bash
set -euo pipefail

# ==============================================================================
# Backward-Compatible Deployment Forwarding Shim
#
# Delegates execution directly to scripts/deploy/deploy.sh preserving all flags.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
exec "${SCRIPT_DIR}/deploy/deploy.sh" "$@"
