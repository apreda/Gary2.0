#!/usr/bin/env node
/**
 * Insight Connections Runner
 *
 * Calls generateInsightConnections() for a given date across the active leagues
 * and INSERTs the resulting flat rows into the `insight_connections`
 * Supabase table. Idempotent per day: the day's existing rows for each league are
 * replaced (DELETE-then-INSERT) so re-runs never duplicate.
 *
 * Writes use the service-role REST path documented in the Supabase conventions
 * (mirrors storeDailyPicks in src/supabaseClient.js): axios POST to
 * /rest/v1/insight_connections with the SUPABASE_SERVICE_ROLE_KEY (falls back to
 * the anon key), which bypasses RLS. iOS reads via the anon SELECT policy.
 *
 * Usage:
 *   node run-insight-connections.js                       # today (EST), MLB + NBA safe default
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
const { buildLeaguePulse } = await import('./src/services/insights/leaguePulse.js');
const { buildFootballLeaguePulse } = await import('./src/services/insights/footballLeaguePulse.js');
const { buildFootballPlayerInsightCards } = await import('./src/services/insights/footballPlayerInsightCards.js');
const { buildNcaafPlayerInsightCards } = await import('./src/services/insights/ncaafPlayerInsightCards.js');
const { loadFootballSlate } = await import('./src/services/insights/footballData.js');
const {
  footballHubRunIsEmptyFailure,
  shouldRepairFootballMarketVendor,
  shouldPreserveCurrentFootballFantasySnapshot,
  shouldUpgradeFootballFantasyEvidence,
} = await import('./scripts/lib/insightRunPolicy.js');
const { replaceFootballProofRows } = await import('./scripts/lib/footballProofStorage.js');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

// Leagues we currently generate insight connections for. Add others here as
// they come online (each needs a computer registry in generateInsightConnections).
const ACTIVE_LEAGUES = ['MLB', 'NFL', 'NCAAF', 'NBA'];
// Keep the local/default invocation on its historical MLB/NBA scope. Football
// runs through the separately staggered football-hub-insights workflow (or an
// explicit --league request) so it never gets silently coupled to this command.
const DEFAULT_LEAGUES = ['MLB', 'NBA'];

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
// These facts can be invalidated by the most recently completed game. Unlike
// editorial reads, they must refresh in place across the day rather than obey
// the first-write-wins copy freeze.
const VOLATILE_CATEGORIES = new Set([
  'streaking',
  'streak',
  // Football availability + named starters change through a game day (a
  // Questionable becomes an Out; a QB1 flips on a late depth-chart move) — a
  // frozen morning snapshot would show a stale status at kickoff. Scoped by
  // construction: MLB's replacement lane writes category 'beneficiary', so
  // these two names replace-in-place only where football writes them.
  'injury',
  'quarterback',
  'pace_script',
  'market_range',
  'next_slate',
  'the_sweat',
  'after_gary',
  'fantasy_usage',
  'fantasy_matchup',
  'fantasy_trend',
]);

// Per-player breakdown packs (the iOS Hub "full breakdown" view). Built for MLB
// (hitter/pitcher) and, since Aug 27 2026, NFL/NCAAF (football payloads on the
// same PlayerInsightPack contract) after the day's insight_connections insert
// succeeds; failures here are NON-FATAL to the connections run.
const CARDS_TABLE = 'player_insight_cards';
const CARDS_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/${CARDS_TABLE}` : null;

// League Pulse: league-wide daily leaderboard tables (MLB + NFL/NCAAF). Unlike the
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
// else the non-football safe default.
let leagues = DEFAULT_LEAGUES;
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
 * Delete the existing confirmedXI situational row(s) for one (date, league, game)
 * so the confirmedXI lane can UPGRADE IN PLACE (projected < contested < confirmed)
 * instead of being frozen by the additive-freeze. EXEMPTION FOR confirmedXI ONLY —
 * every other lane keeps first-write-wins. The confirmedXI lane re-keys to the same
 * `situational|||<game_id>` rowKey on every run, so without this the freshly-computed
 * 'confirmed' row gets dropped and a live game stays stuck on "LINEUP NOT CONFIRMED YET".
 *
 * SCOPED by `meta->>'kind'='confirmedXI'`: category='situational' can be SHARED by
 * multiple lanes. A blanket category-only delete would wipe a sibling situational
 * row whenever it's absent from this run's fresh rows (e.g. a transient fetch
 * failure), permanently losing that card for the day. The jsonb `kind`
 * discriminator ensures only confirmedXI rows are removed; a sibling situational
 * row is never touched and keeps its normal first-write-wins freeze.
 */
async function deleteSituationalRowForGame(date, league, gameId) {
  await axios({
    method: 'DELETE',
    url: REST_URL,
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
      category: `eq.situational`,
      game_id: `eq.${gameId}`,
      'meta->>kind': `eq.confirmedXI`,
    },
  });
}

/**
 * Read the existing stored confirmedXI situational row for one (date, league,
 * game), if any. Returns { status, kickoff } from its jsonb meta, or null when
 * no such row is stored yet. Used by the MONOTONIC-PAST-KICKOFF downgrade guard:
 * once a game is stored 'confirmed' and kickoff has passed, a later run must not
 * write it back down to 'projected'/'contested' (BDL can drop the team sheet
 * mid-match, which would otherwise recompute the status downward). GROUNDED —
 * reads the real prior row; never invents a 'confirmed' state.
 */
async function existingConfirmedXiRow(date, league, gameId) {
  const { data } = await axios.get(REST_URL, {
    headers: restHeaders,
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
      category: `eq.situational`,
      game_id: `eq.${gameId}`,
      'meta->>kind': `eq.confirmedXI`,
      select: 'meta',
      limit: 1,
    },
  });
  const meta = (data && data[0] && data[0].meta) || null;
  if (!meta) return null;
  return { status: meta.status || null, kickoff: meta.kickoff || null };
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

/** Replace only volatile factual lanes that produced a healthy fresh snapshot. */
async function replaceVolatileRows(date, league, rows) {
  const categories = [...new Set(
    rows.map((r) => r.category).filter((category) => VOLATILE_CATEGORIES.has(category))
  )];
  const replacedKeys = new Set();

  for (const category of categories) {
    const fresh = rows.filter((r) => r.category === category);
    // A non-empty fresh lane proves the computer completed. Never delete the
    // last-good lane on a zero-row/transient-data run.
    if (!fresh.length) continue;
    if (category === 'the_sweat' || category === 'after_gary') {
      await replaceFootballProofRows({
        httpClient: axios,
        restUrl: REST_URL,
        headers: restHeaders,
        date,
        league,
        category,
        rows: fresh,
      });
      for (const row of fresh) replacedKeys.add(rowKey(row));
      continue;
    }
    const { data: existing } = await axios.get(REST_URL, {
      headers: restHeaders,
      params: {
        date: `eq.${date}`,
        league: `eq.${league}`,
        category: `eq.${category}`,
        select: 'id,category,meta',
      },
    });
    if (shouldPreserveCurrentFootballFantasySnapshot(existing, fresh)) {
      console.log(`   ⏸️  ${category}: preserving verified current-season snapshot over prior-season fallback`);
      continue;
    }
    // Insert first: a failed write leaves the prior snapshot intact. Once the
    // replacement is durable, remove only the exact ids observed above.
    await insertRows(fresh);
    const oldIds = (existing || []).map((row) => row.id).filter((id) => id != null);
    if (oldIds.length) {
      await axios({
        method: 'DELETE',
        url: REST_URL,
        headers: { ...restHeaders, Prefer: 'return=minimal' },
        params: { id: `in.(${oldIds.join(',')})` },
      });
    }
    for (const row of fresh) replacedKeys.add(rowKey(row));
  }

  return replacedKeys;
}

/** Stored rows for (date, league) with the fields the content patch needs. */
async function existingRowsForPatch(date, league) {
  const { data } = await axios.get(REST_URL, {
    headers: restHeaders,
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
      select: 'id,category,headline,game,player_id,team_id,game_id,meta',
      limit: 500,
    },
  });
  return Array.isArray(data) ? data : [];
}

/** PATCH one stored row by primary key. */
async function patchRowById(id, patch) {
  await axios({
    method: 'PATCH',
    url: REST_URL,
    params: { id: `eq.${id}` },
    data: JSON.parse(JSON.stringify(patch)),
    headers: { ...restHeaders, Prefer: 'return=minimal' },
  });
}

/**
 * Stable identity of a connection within a day+league — the ENTITY it describes,
 * so a re-run never replaces or duplicates an already-posted card. Entity cards
 * (a player in a game, a team) key on their ids; id-less lanes (group/tournament,
 * regression_tomorrow) key on the headline + game. Keying on the entity (not the
 * value/headline) means a card is frozen even if a later run would recompute its
 * number slightly differently — the morning's card stays put, no churn.
 *
 * Digits are STRIPPED from the headline part of the id-less key: those headlines
 * embed the recomputed number ("France head the title market at +170" → "+175",
 * "Ryan Johnson: 7.4 ERA vs 4.33 xERA" → "4.3"), so keying on the raw headline
 * minted a "new" story every time the number drifted between runs — the exact
 * duplicate class found live on Jul 4 2026. The game field disambiguates two
 * same-shaped headlines from different matchups.
 */
function rowKey(r) {
  if (r.category === 'the_sweat' && r.meta?.factor_code) {
    return `${r.category}|${r.game_id || ''}|${r.meta.factor_code}`;
  }
  const hasEntity = r.player_id || r.team_id || r.game_id;
  return hasEntity
    ? `${r.category}|${r.player_id || ''}|${r.team_id || ''}|${r.game_id || ''}`
    : `${r.category}|${(r.headline || '').replace(/[0-9]/g, '')}|${r.game || ''}`;
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
      select: 'category,headline,game,player_id,team_id,game_id',
    },
  });
  const set = new Set();
  for (const r of data || []) set.add(rowKey(r));
  return set;
}

/**
 * Seed state for the per-lane CHECKPOINT writer (football): the stored row keys
 * (same identity as the additive-freeze) plus the set of categories that already
 * have rows today — volatile categories checkpoint only into an EMPTY category,
 * because a non-empty one belongs to replaceVolatileRows' snapshot semantics.
 */
async function existingState(date, league) {
  const { data } = await axios.get(REST_URL, {
    headers: restHeaders,
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
      select: 'category,headline,game,player_id,team_id,game_id',
    },
  });
  const keys = new Set();
  const categories = new Set();
  for (const r of data || []) {
    keys.add(rowKey(r));
    categories.add(r.category);
  }
  return { keys, categories };
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

/**
 * The day's posted college props (prop_picks is one jsonb row per date; each
 * entry carries `sport`). The NCAAF pack builder prints a player's own lines
 * from these. A failed read is an empty list — the section simply stays off.
 */
async function loadNcaafPropEntries(date) {
  if (!supabaseUrl) return [];
  try {
    const { data } = await axios({
      method: 'GET',
      url: `${supabaseUrl}/rest/v1/prop_picks`,
      headers: restHeaders,
      params: { date: `eq.${date}`, select: 'picks' },
    });
    return (Array.isArray(data) ? data : [])
      .flatMap((row) => (Array.isArray(row?.picks) ? row.picks : (row?.picks?.picks || [])))
      .filter((entry) => String(entry?.sport || entry?.league || '').toUpperCase() === 'NCAAF');
  } catch (err) {
    console.warn(`   ⚠️  [NCAAF] prop entries unavailable for the packs: ${err.message}`);
    return [];
  }
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
 * Build the day's per-player breakdown packs (MLB + NFL/NCAAF) and write them with the
 * same DELETE-then-INSERT idempotency. NON-FATAL: any failure here is caught and
 * warned so it never sinks the connections run. Respects --dry-run (prints the
 * pack count + one sample payload instead of writing).
 */
async function buildAndStoreCards({ date, league, connections }) {
  // Football packs (Aug 27 2026 parity build): the same table, the same
  // DELETE-then-INSERT idempotency, a football payload on the shared
  // PlayerInsightPack contract. Leagues without a pack builder still no-op.
  if (league === 'NFL' || league === 'NCAAF') {
    try {
      const games = await loadFootballSlate({
        bdl: ballDontLieService, league: league.toLowerCase(), date,
      });
      // College packs ride their own builder (NCAAF Picks page parity, Sep 4
      // 2026 — league isolation law): the NFL builder is NFL-only.
      const packs = league === 'NCAAF'
        ? await buildNcaafPlayerInsightCards({
          date, games, bdl: ballDontLieService, propEntries: await loadNcaafPropEntries(date),
        })
        : await buildFootballPlayerInsightCards({
          date, league, games, bdl: ballDontLieService,
        });
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
        console.log(`   🧪 Would write ${rows.length} ${league} player insight card(s). Sample payload:`);
        console.log(JSON.stringify(rows[0]?.payload, null, 2));
        return;
      }
      await deleteDayCards(date, league);
      await insertCards(rows);
      console.log(`   ✅ Stored ${rows.length} player insight card(s) for ${league} (${date}).`);
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.warn(`   ⚠️  [${league}] player insight cards skipped: ${detail}`);
    }
    return;
  }
  if (league !== 'MLB') return;
  try {
    // generateInsightConnections returns the count but not the slate itself;
    // re-fetch it here (short-TTL cached, so this is cheap).
    const games = (await ballDontLieService.getMlbGamesForETDate(date)) || [];
    // Streak-watch subjects (founder, Jul 27): every player named on the hub
    // must open a card, including players whose team is idle tonight — pass
    // the latest streak-board names so packs exist for them too.
    let extraPlayerNames = [];
    try {
      const { data } = await axios.get(`${supabaseUrl}/rest/v1/streaks`, {
        headers: restHeaders,
        params: {
          subject_type: 'eq.player',
          select: 'subject,game_date',
          order: 'game_date.desc',
          limit: 60,
        },
      });
      const rows = Array.isArray(data) ? data : [];
      const latest = rows[0]?.game_date;
      extraPlayerNames = [...new Set(rows.filter((r) => r.game_date === latest).map((r) => r.subject).filter(Boolean))];
    } catch (e) {
      console.warn(`   [Cards] streak-subject fetch skipped: ${e.message}`);
    }
    const packs = await buildPlayerInsightCards({ date, league, connections, games, extraPlayerNames });

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
 * Build the day's League Pulse tab packs (MLB + NFL/NCAAF) and UPSERT them on
 * (date, league, tab) — a full-row replace each run via merge-duplicates, so the
 * board is always the current snapshot (the live-data behavior the spec wants, the
 * opposite of the connections additive-freeze). NON-FATAL: any failure here is
 * caught + warned so it never sinks the connections run. Respects --dry-run.
 */
async function buildAndStorePulse({ date, league }) {
  // MLB rides its original builder; NFL/NCAAF ride the football builder
  // (Aug 27 2026 parity build) onto the SAME generic-table write below.
  const isFootballPulse = league === 'NFL' || league === 'NCAAF';
  if (league !== 'MLB' && !isFootballPulse) return;
  try {
    const packs = isFootballPulse
      ? await buildFootballLeaguePulse({ date, league, bdl: ballDontLieService })
      : await buildLeaguePulse({ date, league });
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
      url: `${PULSE_REST_URL}?on_conflict=date,league,tab`,
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

    // LEAGUE PULSE FIRST (founder, Sep 3 2026). The pulse tables are built
    // from the slate and the league's own boards — they need nothing the
    // per-game generator produces. Built LAST, they were lost every time the
    // plist hard-cap killed this stage mid-run (7 kills to date; NCAAF's AP
    // Top 25 vanished twice on Sep 3 alone, and the college Hub lost its
    // rankings board for the day). Cheap, independent work goes first so a
    // capped stage costs picks, never the boards. The call is idempotent
    // (upsert on date+league+tab) and non-fatal.
    await buildAndStorePulse({ date: targetDate, league });

    // PER-LANE CHECKPOINT (Aug 27 2026). The insights plist hard-caps this
    // stage (GARY_CAP_FOOTBALL) and the alarm kills the whole process when the
    // subscription-bridge lane reads run long — on Aug 27 every pass computed
    // its lanes and died before the single end-of-run write, shipping ZERO NFL
    // rows on a 4-game day. Store each football lane AS IT COMPLETES instead:
    //   • additive lanes ride the SAME first-write-wins freeze as the final
    //     write (seeded keys + rowKey), so nothing already posted is touched;
    //   • volatile lanes (injury/quarterback/pace_script/…) checkpoint only
    //     into an EMPTY category — once a category has rows, its refresh
    //     belongs to replaceVolatileRows' insert-then-delete snapshot;
    //   • confirmedXI situational rows stay the final write's alone (their
    //     upgrade-in-place needs the run's full set).
    // The final write below is unchanged and idempotent over checkpoint rows
    // (its own existingKeys fetch sees them and freezes them). Football-only:
    // MLB rows are not final at lane time (voice pass + id resolver run
    // between generate and store). Manual --reset skips checkpoints — its
    // delete-then-rebuild expects the day to be rebuilt in one write.
    const isFootballLeague = league === 'NFL' || league === 'NCAAF';
    let onLaneRows;
    if (!dryRun && !resetDay && isFootballLeague) {
      try {
        const state = await existingState(targetDate, league);
        onLaneRows = async ({ computer, rows: laneConnections }) => {
          const fresh = [];
          for (const r of laneConnections.map((c) => toRow(c, league, targetDate))) {
            if (r.category === 'situational' && r.meta?.kind === 'confirmedXI') continue;
            if (VOLATILE_CATEGORIES.has(r.category)) {
              if (state.categories.has(r.category)) continue;
            } else if (state.keys.has(rowKey(r))) {
              continue;
            }
            fresh.push(r);
          }
          if (!fresh.length) return;
          await insertRows(fresh);
          for (const r of fresh) {
            state.keys.add(rowKey(r));
            state.categories.add(r.category);
          }
          console.log(`   💾 checkpoint: ${fresh.length} row(s) stored from ${computer} (${league})`);
        };
      } catch (err) {
        // Seeding failed (transient REST error) — run exactly as before, one
        // write at the end. The checkpoint is a safety net, never a gate.
        console.warn(`   ⚠️  [${league}] checkpoint seed failed — falling back to end-of-run write only: ${err.message}`);
        onLaneRows = undefined;
      }
    }

    let connections;
    let generatedGameCount = 0;
    try {
      const generated = await generateInsightConnections({
        date: targetDate,
        league,
        options: onLaneRows ? { onLaneRows } : {},
      });
      generatedGameCount = Number(generated?.gameCount) || 0;
      if (Array.isArray(generated?.failures) && generated.failures.length > 0) {
        hadError = true;
        console.error(
          `❌ [${league}] ${generated.failures.length} insight computer(s) failed: ` +
          generated.failures.map((failure) => `${failure.computer}: ${failure.message}`).join(' | '),
        );
      }
      connections = generated;
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

    // Gary's voice pass (Jul 27 2026): rows leave with Gary's read on tonight
    // written over the computer's evidence; the computed sentence moves to
    // meta.evidence for the expanded card. Failure ships template details.
    if (connections.length > 0) {
      try {
        const { applyGaryVoice } = await import('./src/services/insights/garyInsightVoice.js');
        connections = await applyGaryVoice(connections, { league });
      } catch (e) {
        console.warn(`   [Gary voice] pass skipped (${e.message}) — template details ship`);
      }
    }

    if (connections.length === 0) {
      if (footballHubRunIsEmptyFailure({
        league,
        gameCount: generatedGameCount,
        connectionCount: connections.length,
      })) {
        hadError = true;
        console.error(
          `❌ [${league}] ${generatedGameCount} scheduled game(s) produced zero Hub rows across every registered computer. ` +
          'No rows were deleted; failing the run so this cannot report a false-green football board.',
        );
      }
      console.log(`   No connections generated for ${league} on ${targetDate}.`);
      // League Pulse already ran at the top of this league's pass.
      continue;
    }

    const rows = connections.map((c) => toRow(c, league, targetDate));
    totalRows += rows.length;

    if (dryRun) {
      console.log(`   Would write ${rows.length} row(s):`);
      console.log(JSON.stringify(rows, null, 2));
      // Player insight cards (MLB rides connections; football rides the slate); in dry-run
      // this prints the pack count + one sample payload instead of writing.
      await buildAndStoreCards({ date: targetDate, league, connections });
      continue;
    }

    try {
      // FIRST-WRITE-WINS per card: keep what's already posted for the day, add
      // only the cards not there yet. A lane fills in as its data lands across the
      // day's runs (HR / lineup-dependent lanes wait on the pick runs) but nothing
      // the user already saw is replaced — no intra-day churn. Grading updates the
      // result field separately. (Was DELETE-then-INSERT, which churned the board.)
      if (resetDay) await deleteDayRows(targetDate, league);   // manual force-refresh only

      // UPGRADE-IN-PLACE EXEMPTION (confirmedXI lane only): the confirmed-XI lane
      // re-keys to the same `situational|||<game_id>` rowKey every run, so the
      // additive-freeze would drop its freshly-computed 'confirmed' row and the
      // projected→confirmed transition would never land (game stuck on "LINEUP NOT
      // CONFIRMED YET"). For each game that has a confirmedXI row THIS run, delete
      // the prior situational row(s) for that game and re-insert this run's
      // situational rows so it advances projected < contested < confirmed. Every
      // OTHER lane keeps first-write-wins below — the churn protection is untouched.
      const confirmedXiGameIds = new Set(
        rows
          .filter((r) => r.meta?.kind === 'confirmedXI' && r.game_id != null)
          .map((r) => String(r.game_id))
      );
      let upgraded = 0;
      for (const gameId of confirmedXiGameIds) {
        const gameConfirmedXi = rows.filter(
          (r) =>
            r.category === 'situational' &&
            r.meta?.kind === 'confirmedXI' &&
            String(r.game_id) === gameId
        );

        // MONOTONIC-PAST-KICKOFF GUARD: status only ever moves UP
        // (projected → contested → confirmed). Once a game is stored 'confirmed'
        // and kickoff has passed, REFUSE to write it back down to a lesser status
        // — BDL can drop the confirmed team sheet mid-match, which makes this run
        // recompute the status downward (back to 'projected'/'contested'). Skip
        // the delete+re-insert entirely so the real prior 'confirmed' row is held.
        // Grounded: only honors an actual stored 'confirmed'; never fabricates one.
        const freshStatus = gameConfirmedXi[0]?.meta?.status || null;
        if (freshStatus && freshStatus !== 'confirmed') {
          const prior = await existingConfirmedXiRow(targetDate, league, gameId);
          const kickoffMs = prior?.kickoff ? Date.parse(prior.kickoff) : NaN;
          const kickoffPassed = Number.isFinite(kickoffMs) && Date.now() >= kickoffMs;
          if (prior?.status === 'confirmed' && kickoffPassed) {
            console.log(`   ⏸️  confirmedXI ${league} game ${gameId}: holding stored 'confirmed' — refused downgrade to '${freshStatus}' (kickoff passed; BDL sheet likely dropped).`);
            continue; // leave the stored confirmed row in place
          }
        }

        await deleteSituationalRowForGame(targetDate, league, gameId);
        // Re-insert ONLY this run's confirmedXI situational rows for that game — the
        // scoped delete above removed only kind='confirmedXI' rows, so any sibling
        // situational row is untouched in the DB and must NOT be re-inserted here
        // (that would duplicate it). The sibling keeps its normal first-write-wins
        // freeze below.
        if (gameConfirmedXi.length) await insertRows(gameConfirmedXi);
        upgraded += gameConfirmedXi.length;
      }

      // Volatile factual lanes refresh as a scoped snapshot. This removes a
      // streak the moment the latest completed game breaks it while leaving
      // every editorial/AI-authored card under the normal no-churn freeze.
      const volatileKeys = await replaceVolatileRows(targetDate, league, rows);

      // Additive-freeze for every other row (first-write-wins). The confirmedXI rows
      // for those games were just written above, so exclude ONLY them here — sibling
      // situational rows still flow through the normal freeze so a fresh one lands
      // once and an existing one is preserved.
      const seen = await existingKeys(targetDate, league);
      const fresh = rows.filter(
        (r) =>
          !(
            r.category === 'situational' &&
            r.meta?.kind === 'confirmedXI' &&
            confirmedXiGameIds.has(String(r.game_id))
          ) && !VOLATILE_CATEGORIES.has(r.category) &&
          !seen.has(rowKey(r))
      );
      if (fresh.length) await insertRows(fresh);

      // CONTENT PATCH (Jul 27 2026): the freeze protects a card's IDENTITY from
      // churn — it was never meant to trap a card on pre-Gary template copy or
      // a missing tap-through id. For stored rows this run recomputed, patch
      // detail/meta/ids IN PLACE when (a) the stored row predates the voice
      // pass (no meta.evidence) or (b) it lacks a player_id the fresh row has.
      // Headline, value, tone, relevance stay frozen — zero visible churn.
      let patched = 0;
      try {
        const stored = await existingRowsForPatch(targetDate, league);
        const storedByKey = new Map(stored.map((s) => [rowKey(s), s]));
        for (const r of rows) {
          const s = storedByKey.get(rowKey(r));
          if (!s) continue;
          const needsVoice = !(s.meta && typeof s.meta === 'object' && s.meta.evidence) && r.meta?.evidence;
          const needsId = s.player_id == null && r.player_id != null;
          // Fresh factual enrichment the stored row predates (NRFI price /
          // starter first-inning splits, Jul 27; the head-to-head meetings
          // ledger, Aug 6) — same zero-churn contract: a stored row gains a
          // field it never had, and nothing already published changes.
          const needsEnrich = ((r.meta?.price != null || r.meta?.sp_first_inning != null)
              && s.meta?.price == null && s.meta?.sp_first_inning == null)
            || (Array.isArray(r.meta?.meetings) && r.meta.meetings.length
              && !Array.isArray(s.meta?.meetings));
          const needsFantasyEvidenceUpgrade = shouldUpgradeFootballFantasyEvidence(s, r);
          const needsMarketVendorRepair = shouldRepairFootballMarketVendor(s, r);
          if (!needsVoice && !needsId && !needsEnrich && !needsFantasyEvidenceUpgrade && !needsMarketVendorRepair) continue;
          const patch = {};
          if (needsVoice || needsEnrich || needsFantasyEvidenceUpgrade || needsMarketVendorRepair) {
            patch.detail = r.detail;
            patch.meta = { ...(s.meta || {}), ...(r.meta || {}) };
          }
          if (needsFantasyEvidenceUpgrade || needsMarketVendorRepair) {
            // This is the one content transition that may change already-shown
            // copy: prior-season fantasy figures leave together when current
            // evidence arrives, and a legacy prediction-market card is replaced
            // atomically by its canonical sportsbook snapshot.
            patch.headline = r.headline;
            patch.value = r.value;
            patch.tone = r.tone;
            patch.spark = r.spark;
            patch.line_val = r.line_val;
            patch.relevance_score = r.relevance_score;
            if (r.team_id != null) patch.team_id = String(r.team_id);
          }
          if (needsId) {
            patch.player_id = String(r.player_id);
            if (s.team_id == null && r.team_id != null) patch.team_id = String(r.team_id);
          }
          await patchRowById(s.id, patch);
          patched++;
        }
      } catch (e) {
        console.warn(`   [Content patch] skipped: ${e.message}`);
      }

      console.log(`   ✅ ${fresh.length} new / ${rows.length} computed for ${league} (${targetDate}); ${Math.max(0, rows.length - fresh.length - upgraded - volatileKeys.size)} already posted (frozen); ${volatileKeys.size} volatile row(s) refreshed; ${upgraded} confirmedXI situational row(s) upgraded-in-place; ${patched} content-patched (voice/ids/fantasy evidence).`);
      // After the connections insert succeeds, build + store this league's
      // per-player breakdown packs (MLB + NFL/NCAAF). NON-FATAL — guarded internally.
      await buildAndStoreCards({ date: targetDate, league, connections });
      // League Pulse REFRESH — the board was already written at the top of
      // this pass; this second upsert picks up anything that landed during
      // the run (moved odds, a new injury). A hard-cap kill now costs the
      // refresh, never the board itself. NON-FATAL — guarded internally.
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
