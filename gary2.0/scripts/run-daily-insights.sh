#!/bin/bash
# Gary 2.0 — Insight Connections generation (launched by launchd 4x daily ET:
# 07:15, 11:00, 16:30, 19:30). Computes the day's hub "edges"
# (insight_connections) for the active leagues and replaces the day's rows in
# Supabase. Idempotent per day+league, so later passes simply refresh as
# lineups firm up — the 7:15 pass makes the Hub a morning resource
# (probables/weather/schedule lanes); lineup-dependent lanes fill in later.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load NVM if available (launchd doesn't source shell profile)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Fallback: ensure node is on PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$PROJECT_DIR"

echo "[$(date)] Starting Gary HR picks run (feeds the Home Run Threats hub lane)..."
# HR picks upsert into prop_picks (idempotent per day). A failure must not
# block the insights pass — the HR lane simply emits 0 rows when no picks exist.
node scripts/run-mlb-hr-picks.js --store=1 || echo "[$(date)] HR picks run failed (non-fatal) — continuing to insights"

echo "[$(date)] Starting insight connections run..."
node run-insight-connections.js "$@"
echo "[$(date)] Insight connections complete."

# MLB field lineups moved to the CLOUD (Supabase edge fn `mlb-field-lineups`, pg_cron
# every 30 min — see supabase/functions/mlb-field-lineups). Removed from this laptop
# run to avoid a redundant delete+insert that briefly flickered the iOS field view.

# Generate "The Wire" betting-angle news items for the Home page. Idempotent per
# day+league. Non-fatal: a Wire failure must NOT fail the insights job above.
echo "[$(date)] Starting The Wire run..."
node run-wire-items.js "$@" || echo "[$(date)] Wire items run failed (non-fatal)"
echo "[$(date)] The Wire complete."
