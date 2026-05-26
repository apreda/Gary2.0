#!/bin/bash
# Gary 2.0 — Daily results grading (launched by launchd at 6:45am EST)
# Grades yesterday's picks against actual game outcomes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load NVM if available (launchd doesn't source shell profile)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Fallback: ensure node is on PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$PROJECT_DIR"

echo "[$(date)] Starting daily results grading..."
node scripts/run-all-results.js "$@"
echo "[$(date)] Results grading complete."
