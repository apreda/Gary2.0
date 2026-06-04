#!/usr/bin/env node
/**
 * Insight Connections Runner
 *
 * Calls generateInsightConnections() for a given date across the active leagues
 * (MLB for now) and INSERTs the resulting flat rows into the `insight_connections`
 * Supabase table. Idempotent per day: the day's existing rows for each league are
 * replaced (DELETE-then-INSERT) so re-runs never duplicate.
 *
 * Writes use the service-role REST path documented in the Supabase conventions
 * (mirrors storeDailyPicks in src/supabaseClient.js): axios POST to
 * /rest/v1/insight_connections with the SUPABASE_SERVICE_ROLE_KEY (falls back to
 * the anon key), which bypasses RLS. iOS reads via the anon SELECT policy.
 *
 * Usage:
 *   node run-insight-connections.js                       # today (EST), all active leagues
 *   node run-insight-connections.js --date 2026-06-02     # specific date
 *   node run-insight-connections.js --league MLB          # single league
 *   node run-insight-connections.js --league mlb,nba      # multiple leagues
 *   node run-insight-connections.js --dry-run             # print rows, no write
 */

// MUST load env vars FIRST before any other imports
import './src/loadEnv.js';

import axios from 'axios';
import { getESTDate } from './src/utils/dateUtils.js';

// Import after env is loaded (services read env at module init time)
const { generateInsightConnections } = await import('./src/services/insights/generateInsightConnections.js');
const { buildPlayerInsightCards } = await import('./src/services/insights/playerInsightCards.js');
const { ballDontLieService } = await import('./src/services/ballDontLieService.js');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

// Leagues we currently generate insight connections for. Add others here as
// they come online (each needs a computer registry in generateInsightConnections).
// WC = 2026 FIFA World Cup (kicks off June 11; empty slates no-op until then).
const ACTIVE_LEAGUES = ['MLB', 'NBA', 'WC'];

// Resolve Supabase config exactly like src/supabaseClient.js does for Node scripts.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role key bypasses RLS on the server; fall back to anon if unset.
const adminKey = supabaseServiceKey || supabaseAnonKey;

const TABLE = 'insight_connections';
const REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/${TABLE}` : null;

// Per-player breakdown packs (the iOS Hub "full breakdown" view). Built only for
// MLB after the day's insight_connections insert succeeds; failures here are
// NON-FATAL to the connections run.
const CARDS_TABLE = 'player_insight_cards';
const CARDS_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/${CARDS_TABLE}` : null;

// ─────────────────────────────────────────────────────────────────────────────
// Arg parsing (mirrors getArgValue in scripts/run-agentic-picks.js)
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArgValue(flag) {
  // Supports: --flag value  |  --flag=value
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

const dryRun = args.includes('--dry-run');
const dateArg = getArgValue('--date');
const leagueArg = getArgValue('--league');

// Date: --date if given, else today in EST (YYYY-MM-DD).
const targetDate = dateArg || getESTDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error(`❌ Invalid --date "${targetDate}". Expected YYYY-MM-DD.`);
  process.exit(1);
}

// Leagues: --league (comma-separated, case-insensitive) filtered to ACTIVE_LEAGUES,
// else all active leagues.
let leagues = ACTIVE_LEAGUES;
if (leagueArg) {
  const requested = leagueArg
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  leagues = ACTIVE_LEAGUES.filter((l) => requested.includes(l));
  const unknown = requested.filter((l) => !ACTIVE_LEAGUES.includes(l));
  if (unknown.length) {
    console.warn(`⚠️  Ignoring unsupported league(s): ${unknown.join(', ')}`);
  }
}

if (leagues.length === 0) {
  console.error(
    `❌ No active leagues to run. Active: ${ACTIVE_LEAGUES.join(', ')}` +
      (leagueArg ? ` (requested: ${leagueArg})` : '')
  );
  process.exit(1);
}

if (!dryRun) {
  if (!REST_URL || !adminKey) {
    console.error(
      '❌ Supabase configuration missing. Set SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in the environment.'
    );
    process.exit(1);
  }
  if (!supabaseServiceKey) {
    console.warn(
      '⚠️  SUPABASE_SERVICE_ROLE_KEY not set — falling back to the anon key. ' +
        'Writes will fail unless RLS permits anon inserts.'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a generated connection to a FLAT insight_connections row, stamping the
 * partition keys (date, league) and provenance. Column names match the migration
 * one-for-one so the iOS anon client can decode rows directly.
 */
function toRow(connection, league, date) {
  return {
    date,
    league,
    generated_by: 'insights-cli',
    category: connection.category,
    headline: connection.headline,
    detail: connection.detail,
    game: connection.game,
    value: connection.value != null ? String(connection.value) : null,
    tone: connection.tone,
    spark: connection.spark ?? null,
    line_val: connection.line_val ?? null,
    relevance_score: connection.relevance_score ?? null,
    player_id: connection.player_id != null ? String(connection.player_id) : null,
    team_id: connection.team_id != null ? String(connection.team_id) : null,
    game_id: connection.game_id != null ? String(connection.game_id) : null,
    meta: connection.meta ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write path (service-role REST — mirrors storeDailyPicks in supabaseClient.js)
// ─────────────────────────────────────────────────────────────────────────────

const restHeaders = {
  apikey: adminKey,
  Authorization: `Bearer ${adminKey}`,
  'Content-Type': 'application/json',
};

/**
 * Delete the day's existing rows for a league so the run is idempotent
 * (replaces stale connections that the generator no longer produces).
 */
async function deleteDayRows(date, league) {
  await axios({
    method: 'DELETE',
    url: REST_URL,
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
    },
  });
}

/**
 * Insert the day's freshly-computed rows. Idempotency comes from deleteDayRows()
 * running first. Sanitizes via JSON round-trip to strip functions/circular refs
 * (same defensive pattern as storeDailyPicks).
 */
async function insertRows(rows) {
  const sanitized = JSON.parse(JSON.stringify(rows));
  await axios({
    method: 'POST',
    url: REST_URL,
    data: sanitized,
    headers: { ...restHeaders, Prefer: 'return=minimal' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Insight Cards write path (same idempotency as the connections write)
// ─────────────────────────────────────────────────────────────────────────────

/** DELETE the day's existing packs for a league (idempotent re-run). */
async function deleteDayCards(date, league) {
  await axios({
    method: 'DELETE',
    url: CARDS_REST_URL,
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
    },
  });
}

/** INSERT freshly-built packs (idempotency comes from deleteDayCards first). */
async function insertCards(rows) {
  const sanitized = JSON.parse(JSON.stringify(rows));
  await axios({
    method: 'POST',
    url: CARDS_REST_URL,
    data: sanitized,
    headers: { ...restHeaders, Prefer: 'return=minimal' },
  });
}

/**
 * Build the day's per-player breakdown packs (MLB only) and write them with the
 * same DELETE-then-INSERT idempotency. NON-FATAL: any failure here is caught and
 * warned so it never sinks the connections run. Respects --dry-run (prints the
 * pack count + one sample payload instead of writing).
 */
async function buildAndStoreCards({ date, league, connections }) {
  if (league !== 'MLB') return;
  try {
    // generateInsightConnections returns gameCount but not the slate itself;
    // re-fetch it here (getMlbGamesForDate is 5-min cached, so this is cheap).
    const games = (await ballDontLieService.getMlbGamesForDate(date)) || [];
    const packs = await buildPlayerInsightCards({ date, league, connections, games });

    if (!Array.isArray(packs) || packs.length === 0) {
      console.log(`   ℹ️  No player insight cards built for ${league} (${date}).`);
      return;
    }

    const rows = packs.map((p) => ({
      date: p.date,
      league: p.league,
      player_id: String(p.player_id),
      player_name: p.player_name ?? null,
      team_abbr: p.team_abbr ?? null,
      game_id: p.game_id != null ? String(p.game_id) : null,
      payload: p.payload,
      generated_by: 'insights-cli',
    }));

    if (dryRun) {
      console.log(`   🧪 Would write ${rows.length} player insight card(s). Sample payload:`);
      console.log(JSON.stringify(rows[0]?.payload, null, 2));
      return;
    }

    await deleteDayCards(date, league);
    await insertCards(rows);
    console.log(`   ✅ Stored ${rows.length} player insight card(s) for ${league} (${date}).`);
  } catch (err) {
    // NON-FATAL — a pack build/write failure must not fail the connections run.
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`   ⚠️  [${league}] player insight cards skipped: ${detail}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(
    `\n🔗 Insight Connections — date=${targetDate} leagues=${leagues.join(', ')}` +
      (dryRun ? ' (DRY RUN)' : '')
  );

  let totalRows = 0;
  let hadError = false;

  for (const league of leagues) {
    console.log(`\n── ${league} ──`);
    let connections;
    try {
      // WC preview mode emits one 'tournament' row per group (12) — lift the
      // per-category cap so the whole group picture fits.
      const options = league === 'WC' ? { maxPerCategory: 12 } : undefined;
      connections = await generateInsightConnections({ date: targetDate, league, options });
    } catch (err) {
      hadError = true;
      console.error(`❌ [${league}] generateInsightConnections failed: ${err.message}`);
      continue;
    }

    if (!Array.isArray(connections)) {
      // Tolerate { connections: [...] } or a single object.
      if (connections && Array.isArray(connections.connections)) {
        connections = connections.connections;
      } else if (connections && typeof connections === 'object') {
        connections = [connections];
      } else {
        connections = [];
      }
    }

    if (connections.length === 0) {
      console.log(`   No connections generated for ${league} on ${targetDate}.`);
      continue;
    }

    const rows = connections.map((c) => toRow(c, league, targetDate));
    totalRows += rows.length;

    if (dryRun) {
      console.log(`   Would write ${rows.length} row(s):`);
      console.log(JSON.stringify(rows, null, 2));
      // Player insight cards build on the SAME connections (MLB only); in dry-run
      // this prints the pack count + one sample payload instead of writing.
      await buildAndStoreCards({ date: targetDate, league, connections });
      continue;
    }

    try {
      // Idempotency: clear the day's rows for this league, then upsert fresh.
      await deleteDayRows(targetDate, league);
      await insertRows(rows);
      console.log(`   ✅ Stored ${rows.length} row(s) for ${league} (${targetDate}).`);
      // After the connections insert succeeds, build + store this league's
      // per-player breakdown packs (MLB only). NON-FATAL — guarded internally.
      await buildAndStoreCards({ date: targetDate, league, connections });
    } catch (err) {
      hadError = true;
      const detail = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.error(`   ❌ [${league}] write failed: ${detail}`);
    }
  }

  console.log(
    `\n${dryRun ? '🧪 DRY RUN complete' : '✅ Done'} — ${totalRows} row(s) ` +
      `${dryRun ? 'computed' : 'processed'} for ${targetDate}.`
  );

  if (hadError) process.exit(1);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Insight Connections runner crashed:', error);
    process.exit(1);
  });
