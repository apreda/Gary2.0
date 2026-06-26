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
const { buildWcPlayerInsightCards } = await import('./src/services/insights/wcPlayerInsightCards.js');
const { ballDontLieService } = await import('./src/services/ballDontLieService.js');
const fifaWorldCupService = (await import('./src/services/fifaWorldCupService.js')).default;
const { buildLeaguePulse } = await import('./src/services/insights/leaguePulse.js');

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

// Per-player breakdown packs (the iOS Hub "full breakdown" view). Built for MLB
// (hitter/pitcher) and WC (outfield/keeper) after the day's insight_connections
// insert succeeds; failures here are NON-FATAL to the connections run.
const CARDS_TABLE = 'player_insight_cards';
const CARDS_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/${CARDS_TABLE}` : null;

// League Pulse: league-wide daily leaderboard tables (MLB + WC). Unlike the
// additive-freeze connections write, pulse is a LIVE SNAPSHOT — full-row UPSERT
// on (date, league, tab) each run via Prefer: resolution=merge-duplicates. A
// dropped/ungroundable tab simply never gets a row (iOS hides any tab with no row).
const PULSE_TABLE = 'league_pulse';
const PULSE_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/${PULSE_TABLE}` : null;

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
// Manual force-refresh: wipe the day's rows first, then regenerate from scratch.
// The scheduled runs are additive-freeze (no churn); --reset is the escape hatch
// for rebuilding a lane by hand. NOT used by the cron path.
const resetDay = args.includes('--reset');
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
 * Delete the day's existing rows for a league. ONLY used by --reset (manual
 * force-refresh) — the scheduled write is additive-freeze and never deletes.
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
 * Insert connection rows. The caller passes only the cards not already posted
 * for the day (additive-freeze), so this never duplicates. Sanitizes via JSON
 * round-trip to strip functions/circular refs (same pattern as storeDailyPicks).
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

/**
 * Stable identity of a connection within a day+league — the ENTITY it describes,
 * so a re-run never replaces or duplicates an already-posted card. Entity cards
 * (a player in a game, a team) key on their ids; id-less lanes (group/tournament)
 * key on the headline. Keying on the entity (not the value/headline) means a card
 * is frozen even if a later run would recompute its number slightly differently —
 * the morning's card stays put, no churn.
 */
function rowKey(r) {
  const hasEntity = r.player_id || r.team_id || r.game_id;
  return hasEntity
    ? `${r.category}|${r.player_id || ''}|${r.team_id || ''}|${r.game_id || ''}`
    : `${r.category}|${r.headline}`;
}

/**
 * Keys already stored for (date, league). The write is ADDITIVE: a lane fills in
 * as its data lands across the day's runs (HR / lineup-dependent lanes wait on
 * the pick runs), but a card that's already posted is FROZEN. Stops the "Hub
 * picks were all different 4 hours later" churn.
 */
async function existingKeys(date, league) {
  const { data } = await axios.get(REST_URL, {
    headers: restHeaders,
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
      select: 'category,headline,player_id,team_id,game_id',
    },
  });
  const set = new Set();
  for (const r of data || []) set.add(rowKey(r));
  return set;
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
 * Build the day's per-player breakdown packs (MLB + WC) and write them with the
 * same DELETE-then-INSERT idempotency. NON-FATAL: any failure here is caught and
 * warned so it never sinks the connections run. Respects --dry-run (prints the
 * pack count + one sample payload instead of writing). The row-map + write path
 * below are league-generic; only the slate fetch + builder dispatch branch.
 */
async function buildAndStoreCards({ date, league, connections }) {
  if (league !== 'MLB' && league !== 'WC') return;
  try {
    // generateInsightConnections returns the count but not the slate itself;
    // re-fetch it here (both fetchers are short-TTL cached, so this is cheap).
    let packs;
    if (league === 'WC') {
      const matches = (await fifaWorldCupService.getMatchesForDate(date)) || [];
      packs = await buildWcPlayerInsightCards({ date, league, connections, matches });
    } else {
      const games = (await ballDontLieService.getMlbGamesForDate(date)) || [];
      packs = await buildPlayerInsightCards({ date, league, connections, games });
    }

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
// League Pulse write path (UPSERT-by-tab — live snapshot, NOT additive-freeze)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the day's League Pulse tab packs (MLB + WC) and UPSERT them on
 * (date, league, tab) — a full-row replace each run via merge-duplicates, so the
 * board is always the current snapshot (the live-data behavior the spec wants, the
 * opposite of the connections additive-freeze). NON-FATAL: any failure here is
 * caught + warned so it never sinks the connections run. Respects --dry-run.
 */
async function buildAndStorePulse({ date, league }) {
  if (league !== 'MLB' && league !== 'WC') return;
  try {
    const packs = await buildLeaguePulse({ date, league });
    if (!Array.isArray(packs) || packs.length === 0) {
      console.log(`   ℹ️  No league pulse tabs built for ${league} (${date}).`);
      return;
    }

    const rows = packs.map((p) => ({
      date: p.date,
      league: p.league,
      tab: p.tab,
      title: p.title,
      subtitle: p.subtitle ?? null,
      columns: p.columns,
      rows: p.rows,
      sort_note: p.sort_note ?? null,
      generated_by: 'insights-cli',
    }));

    if (dryRun) {
      console.log(`   🧪 Would UPSERT ${rows.length} league pulse tab(s): ${rows.map((r) => r.tab).join(', ')}. Sample:`);
      console.log(JSON.stringify(rows[0], null, 2));
      return;
    }

    // UPSERT on the (date, league, tab) unique constraint — full-row replace.
    const sanitized = JSON.parse(JSON.stringify(rows));
    await axios({
      method: 'POST',
      url: PULSE_REST_URL,
      data: sanitized,
      headers: {
        ...restHeaders,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });
    console.log(`   ✅ Stored ${rows.length} league pulse tab(s) for ${league} (${date}): ${rows.map((r) => r.tab).join(', ')}.`);
  } catch (err) {
    // NON-FATAL — a pulse build/write failure must not fail the connections run.
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`   ⚠️  [${league}] league pulse skipped: ${detail}`);
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
      // League Pulse is INDEPENDENT of the connections (it builds league-wide
      // tables straight from the slate), so still build it on a 0-connection day
      // (e.g. a thin WC opener). NON-FATAL + dry-run-aware internally.
      await buildAndStorePulse({ date: targetDate, league });
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
      // League Pulse (MLB + WC) builds its own league-wide tables from the slate.
      await buildAndStorePulse({ date: targetDate, league });
      continue;
    }

    try {
      // FIRST-WRITE-WINS per card: keep what's already posted for the day, add
      // only the cards not there yet. A lane fills in as its data lands across the
      // day's runs (HR / lineup-dependent lanes wait on the pick runs) but nothing
      // the user already saw is replaced — no intra-day churn. Grading updates the
      // result field separately. (Was DELETE-then-INSERT, which churned the board.)
      if (resetDay) await deleteDayRows(targetDate, league);   // manual force-refresh only
      const seen = await existingKeys(targetDate, league);
      const fresh = rows.filter((r) => !seen.has(rowKey(r)));
      if (fresh.length) await insertRows(fresh);
      console.log(`   ✅ ${fresh.length} new / ${rows.length} computed for ${league} (${targetDate}); ${rows.length - fresh.length} already posted (frozen).`);
      // After the connections insert succeeds, build + store this league's
      // per-player breakdown packs (MLB only). NON-FATAL — guarded internally.
      await buildAndStoreCards({ date: targetDate, league, connections });
      // League Pulse (MLB + WC) — league-wide leaderboard tables, full-row UPSERT
      // each run (live snapshot). NON-FATAL — guarded internally.
      await buildAndStorePulse({ date: targetDate, league });
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
