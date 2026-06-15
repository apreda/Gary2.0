#!/usr/bin/env node
/**
 * The Wire — Betting-Angle News Generator
 *
 * Produces the Home page "Wire" feed: short, bettor-framed news items
 * (results vs the closing number, line moves, injury line-reactions, analyst
 * voices, pace notes) for the active leagues. ONE grounded Gemini call per
 * league (cheap Flash model + google_search) returns a strict JSON array; the
 * runner normalizes those to flat `wire_items` rows and writes them with the
 * same service-role DELETE-then-INSERT idempotency as run-insight-connections.js
 * (mirrors storeDailyPicks in src/supabaseClient.js). iOS reads via the anon
 * SELECT policy.
 *
 * Idempotent per day: the day's existing rows for each league are replaced so
 * re-runs (the later launchd passes) never duplicate.
 *
 * Usage:
 *   node run-wire-items.js                       # today (EST), all active leagues
 *   node run-wire-items.js --date 2026-06-02     # specific date
 *   node run-wire-items.js --league MLB          # single league
 *   node run-wire-items.js --league mlb,nba      # multiple leagues
 *   node run-wire-items.js --dry-run             # print rows, no write
 */

// MUST load env vars FIRST before any other imports
import './src/loadEnv.js';

import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getESTDate } from './src/utils/dateUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

// Leagues the Wire covers. Mirrors run-insight-connections.js ACTIVE_LEAGUES.
// WC = 2026 FIFA World Cup (kicks off June 11; empty slates simply yield fewer items).
const ACTIVE_LEAGUES = ['MLB', 'NBA', 'WC'];

// ── EDIT ME ──────────────────────────────────────────────────────────────────
// Curated public betting voices the model should PREFER when sourcing a real,
// recent (last 24h) analyst post/quote for a 'voice' item. Add/remove handles
// here. The model must still find an ACTUAL post via search — it never
// fabricates. Handles are passed verbatim into the prompt.
const X_VOICES = ['@HaralabosV', '@RufusPeabody', '@ActionNetworkHQ', '@br_betting'];
// ─────────────────────────────────────────────────────────────────────────────

// Cheap grounding model — same as the insights pipeline.
const WIRE_MODEL = 'gemini-3-flash-preview';

// Resolve Supabase config exactly like src/supabaseClient.js does for Node scripts.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role key bypasses RLS on the server; fall back to anon if unset.
const adminKey = supabaseServiceKey || supabaseAnonKey;

const TABLE = 'wire_items';
const REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/${TABLE}` : null;

// game_results is the grounding source for "Gary-relevant" framing.
const RESULTS_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/game_results` : null;

// daily_picks is the grounding source for TODAY's real slate (the teams Gary is
// actually dealing with). Used to build the real-team allowlist that prevents the
// model from fabricating games (e.g. inventing a 2024-Finals NBA matchup when the
// NBA pipeline has produced nothing real).
const DAILY_PICKS_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/daily_picks` : null;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// Arg parsing (mirrors run-insight-connections.js)
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

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY missing — the Wire needs grounded Gemini to generate items.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// Grounding context (yesterday's Gary-relevant results from game_results)
// ─────────────────────────────────────────────────────────────────────────────

const restHeaders = {
  apikey: adminKey,
  Authorization: `Bearer ${adminKey}`,
  'Content-Type': 'application/json',
};

/** Yesterday's date (ET) relative to targetDate, as YYYY-MM-DD. */
function yesterdayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`); // noon avoids TZ rollover
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Pull yesterday's graded game_results rows for a league so the model can frame
 * 'result' items against Gary-relevant games. Best-effort: a failure here just
 * yields no extra context (the run still proceeds on pure search grounding).
 */
async function fetchResultsContext(date, league) {
  if (!RESULTS_REST_URL) return [];
  const yday = yesterdayOf(date);
  try {
    const resp = await axios({
      method: 'GET',
      url: RESULTS_REST_URL,
      headers: restHeaders,
      params: {
        select: 'league,result,final_score,pick_text,matchup',
        league: `eq.${league}`,
        game_date: `eq.${yday}`,
        limit: 25,
      },
    });
    return Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`   ⚠️  [${league}] results context fetch failed (non-fatal): ${detail}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Real-team allowlist (anti-fabrication gate)
//
// The model — even with google_search — will free-associate a "salient" matchup
// from its training prior when there's no real, current data for a league (e.g.
// inventing the 2024 Celtics–Mavericks Finals during the 2026 NBA injuries-API
// outage). The cure is to ground items in the teams Gary is ACTUALLY dealing with:
// today's slate (daily_picks) plus yesterday's graded games (game_results). If a
// league has none, we skip it entirely — a dark Wire beats a fabricated one. Items
// that name a team outside the allowlist are dropped after generation.
// ─────────────────────────────────────────────────────────────────────────────

// Words that are too generic to discriminate one team from another (city/qualifier
// words shared across teams). Stripped from both sides before token matching so the
// discriminating signal is the mascot/country token (dodgers, celtics, paraguay).
const TEAM_STOPWORDS = new Set([
  'los', 'angeles', 'new', 'york', 'san', 'st', 'saint', 'fc', 'sc', 'cf', 'afc',
  'united', 'city', 'club', 'the', 'of', 'and', 'de', 'real', 'sporting',
]);

/** Lowercase, strip punctuation, split to discriminating tokens (stopwords removed). */
function teamTokens(name) {
  if (!name) return [];
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !TEAM_STOPWORDS.has(w));
}

/** Pull today's slate team names for a league from daily_picks. */
async function fetchSlateTeams(date, league) {
  if (!DAILY_PICKS_REST_URL) return [];
  try {
    const resp = await axios({
      method: 'GET',
      url: DAILY_PICKS_REST_URL,
      headers: restHeaders,
      params: { select: 'picks', date: `eq.${date}`, limit: 1 },
    });
    const row = Array.isArray(resp.data) ? resp.data[0] : null;
    const picks = Array.isArray(row?.picks) ? row.picks : [];
    const names = [];
    for (const p of picks) {
      if (String(p?.league || '').toUpperCase() !== league) continue;
      if (p?.awayTeam) names.push(p.awayTeam);
      if (p?.homeTeam) names.push(p.homeTeam);
    }
    return names;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`   ⚠️  [${league}] slate fetch failed (non-fatal): ${detail}`);
    return [];
  }
}

/**
 * Build the real-team allowlist for a league: full names (for the prompt) + a token
 * set (for validation), drawn from today's slate and yesterday's graded results.
 */
function buildAllowlist(slateTeams, resultsContext) {
  const names = new Set();
  for (const n of slateTeams) if (n) names.add(String(n).trim());
  for (const r of resultsContext) {
    // matchup is "Away @ Home"
    for (const side of String(r.matchup || '').split(/\s*@\s*|\s+vs\.?\s+/i)) {
      const s = side.trim();
      if (s) names.add(s);
    }
  }
  const tokens = new Set();
  for (const n of names) for (const t of teamTokens(n)) tokens.add(t);
  return { names: [...names], tokens };
}

/**
 * Decide whether an item is grounded in the allowlist. Game-specific kinds
 * (result/line_move/injury) MUST reference at least one real team in their `game`
 * or headline. League-wide commentary (voice/pace with no game) is allowed through,
 * but if it names a game, that game must check out.
 */
function isItemGrounded(item, allowTokens) {
  if (!allowTokens || allowTokens.size === 0) return false;
  const gameSpecific = item.kind === 'result' || item.kind === 'line_move' || item.kind === 'injury';
  const hay = `${item.game || ''} ${item.headline || ''} ${item.subline || ''}`;
  const refTokens = teamTokens(hay);
  const overlap = refTokens.some((t) => allowTokens.has(t));

  if (item.game) {
    // A named matchup must contain a real team; otherwise it's an invented game.
    const gameTokens = teamTokens(item.game);
    const gameHasReal = gameTokens.some((t) => allowTokens.has(t));
    if (!gameHasReal) return false;
  }
  if (gameSpecific) {
    // result/line_move/injury without any real-team reference = fabrication.
    return overlap;
  }
  return true; // voice/pace league-wide commentary
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt + Gemini call (grounded)
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt({ date, league, resultsContext, allowNames }) {
  const yday = yesterdayOf(date);
  const ctxBlock = resultsContext.length
    ? resultsContext
        .map(
          (r) =>
            `- ${r.matchup || '?'} | final ${r.final_score || '?'} | Gary: ${r.pick_text || '?'} (${r.result || '?'})`
        )
        .join('\n')
    : '(no graded Gary games on file for yesterday — use search results only)';

  const teamsBlock = allowNames && allowNames.length
    ? allowNames.map((n) => `- ${n}`).join('\n')
    : '(none)';

  return `You are the editor of "The Wire", a betting-news ticker for sharp sports bettors. ` +
    `Generate news items for ${league} for ${date} (today, ET). Yesterday was ${yday}.\n\n` +
    `These are the ONLY real teams in play right now (today's slate + yesterday's graded games). ` +
    `Every item MUST be about one of these teams. Do NOT write about any team not on this list, and ` +
    `do NOT invent matchups, series, or playoff rounds from memory — if you are not certain a game is ` +
    `happening on the real ${date} schedule, omit it:\n${teamsBlock}\n\n` +
    `Use Google Search to find REAL, current information about THESE teams: yesterday's final scores ` +
    `against the closing spread/total, line moves on today's slate, injury news and its market reaction, ` +
    `recent posts from prominent betting analysts, and pace/scoring-environment notes.\n\n` +
    `Gary's recently graded games (for framing 'result' items against games our users bet):\n${ctxBlock}\n\n` +
    `Return a STRICT JSON array (no prose, no markdown fences, no commentary) of 4 to 8 items. ` +
    `Each item is an object with EXACTLY these keys:\n` +
    `  "kind": one of "result" | "line_move" | "injury" | "voice" | "pace"\n` +
    `  "headline": short, punchy, <= 90 chars\n` +
    `  "subline": one sentence of supporting detail (or null)\n` +
    `  "body": 2-3 further sentences for readers who tap to expand — what happened, why the ` +
    `market moved, and what it means for tonight. No repetition of the headline/subline. (or null)\n` +
    `  "source_handle": the analyst handle for 'voice' items, else null\n` +
    `  "game": the matchup this is about ("Away @ Home"), or null if league-wide\n` +
    `  "relevance_score": integer 0-100 (higher = more lead-worthy / front-page)\n\n` +
    `EDITORIAL RULES (every item is written from a sports BETTOR's perspective):\n` +
    `- result: frame against the CLOSING number, never a plain score. ` +
    `Good: "Spurs don't cover the 6.5 in a 4-point win". Bad: "Spurs win 110-106".\n` +
    `- line_move: name the OLD number and the NEW number ("Total dropped from 9 to 8.5").\n` +
    `- injury: state the BETTING CONSEQUENCE (team total / spread / ML reaction), not just the news.\n` +
    `- voice: ONLY when you find an ACTUAL recent (last 24h) public post or quote by a prominent betting ` +
    `analyst. PREFER these curated handles: ${X_VOICES.join(', ')}. Set source_handle, paraphrase ` +
    `faithfully, and NEVER fabricate a quote, a post, or a handle. If you can't verify one, omit voice items.\n` +
    `- pace: scoring-environment / pace / weather note relevant to totals.\n` +
    `- Plain, professional copy. No hype, no clickbait, no exclamation marks.\n` +
    `- Only include items you can ground in real, current information. Fewer real items beats padding.\n\n` +
    `Output ONLY the JSON array.`;
}

/**
 * One grounded Gemini call per league. Returns raw model text (or null on error).
 * Mirrors the geminiGrounding() helper in scripts/run-all-results.js.
 */
async function callWireModel(prompt) {
  const model = genAI.getGenerativeModel({
    model: WIRE_MODEL,
    tools: [{ google_search: {} }],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ─────────────────────────────────────────────────────────────────────────────
// Robust JSON extraction (clone of the insights/props "search all blocks" pattern)
// ─────────────────────────────────────────────────────────────────────────────

const VALID_KINDS = new Set(['result', 'line_move', 'injury', 'voice', 'pace']);

/**
 * Pull the first valid JSON array of items out of the model text. Tolerates
 * ```json fences, leading prose, and trailing commentary by scanning for the
 * outermost array. Returns [] if nothing parseable is found.
 */
function parseWireItems(text) {
  if (!text || typeof text !== 'string') return [];

  const candidates = [];

  // 1) fenced ```json ... ``` (or bare ``` ... ```) blocks
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m[1]) candidates.push(m[1].trim());
  }

  // 2) the outermost [...] array anywhere in the text
  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first !== -1 && last !== -1 && last > first) {
    candidates.push(text.slice(first, last + 1));
  }

  // 3) the whole string as a last resort
  candidates.push(text.trim());

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
    } catch {
      /* try next candidate */
    }
  }
  return [];
}

/** Coerce an arbitrary parsed item into a normalized wire_items row (or null). */
function toRow(item, league, date) {
  if (!item || typeof item !== 'object') return null;
  const kind = String(item.kind || '').trim().toLowerCase();
  if (!VALID_KINDS.has(kind)) return null;
  const headline = item.headline != null ? String(item.headline).trim() : '';
  if (!headline) return null;

  let score = item.relevance_score;
  score = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null;

  return {
    date,
    league,
    kind,
    headline,
    subline: item.subline != null && String(item.subline).trim() ? String(item.subline).trim() : null,
    source_handle:
      item.source_handle != null && String(item.source_handle).trim()
        ? String(item.source_handle).trim()
        : null,
    game: item.game != null && String(item.game).trim() ? String(item.game).trim() : null,
    relevance_score: score,
    meta:
      item.body != null && String(item.body).trim()
        ? { body: String(item.body).trim() }
        : null,
    generated_by: 'run-wire-items.js@gemini-3-flash-preview',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write path (service-role REST — mirrors run-insight-connections.js)
// ─────────────────────────────────────────────────────────────────────────────

/** DELETE the day's existing rows for a league so the run is idempotent. */
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

/** INSERT the day's freshly-computed rows (idempotency comes from delete first). */
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
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(
    `\n📰 The Wire — date=${targetDate} leagues=${leagues.join(', ')}` +
      (dryRun ? ' (DRY RUN)' : '')
  );

  let totalRows = 0;
  let failures = 0;

  for (const league of leagues) {
    console.log(`\n── ${league} ──`);
    try {
      const resultsContext = await fetchResultsContext(targetDate, league);
      const slateTeams = await fetchSlateTeams(targetDate, league);
      const allow = buildAllowlist(slateTeams, resultsContext);
      console.log(
        `   Context: ${resultsContext.length} graded result row(s), ` +
          `${slateTeams.length} slate team-slot(s) → ${allow.names.length} real team(s).`
      );

      // Anti-fabrication gate: no real teams in play → no Wire for this league.
      // (Fixes the NBA-outage hallucination — a dark Wire beats an invented one.)
      if (allow.tokens.size === 0) {
        console.log(`   ⏭️  Skipping ${league}: no real slate or graded games to ground items.`);
        if (!dryRun) {
          await deleteDayRows(targetDate, league); // clear any stale/fabricated rows
          console.log(`   🧹 Cleared any existing ${league} rows for ${targetDate}.`);
        }
        continue;
      }

      const prompt = buildPrompt({ date: targetDate, league, resultsContext, allowNames: allow.names });
      const text = await callWireModel(prompt);
      const parsed = parseWireItems(text);

      const allRows = parsed
        .map((item) => toRow(item, league, targetDate))
        .filter(Boolean);

      // Drop items naming a team that isn't really in play (caught fabrications).
      const rows = allRows.filter((r) => isItemGrounded(r, allow.tokens));
      const dropped = allRows.length - rows.length;
      if (dropped > 0) {
        console.log(`   🚫 Dropped ${dropped} ungrounded item(s) (team not on the real slate).`);
      }

      if (rows.length === 0) {
        console.log(`   No grounded wire items for ${league} on ${targetDate}.`);
        if (!dryRun) {
          await deleteDayRows(targetDate, league); // don't leave stale rows behind
        }
        continue;
      }

      // Highest relevance first (matches the index ordering iOS reads).
      rows.sort((a, b) => (b.relevance_score ?? -1) - (a.relevance_score ?? -1));
      totalRows += rows.length;

      if (dryRun) {
        console.log(`   Would write ${rows.length} row(s):`);
        console.log(JSON.stringify(rows, null, 2));
        continue;
      }

      // Idempotency: clear the day's rows for this league, then insert fresh.
      await deleteDayRows(targetDate, league);
      await insertRows(rows);
      console.log(`   ✅ Stored ${rows.length} wire item(s) for ${league} (${targetDate}).`);
    } catch (err) {
      failures += 1;
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`   ❌ [${league}] wire generation failed: ${detail}`);
    }
  }

  console.log(
    `\n${dryRun ? '🧪 DRY RUN complete' : '✅ Done'} — ${totalRows} item(s) ` +
      `${dryRun ? 'computed' : 'processed'} for ${targetDate}.`
  );

  // Non-zero exit only if EVERY league failed (one bad league shouldn't kill the run).
  if (failures > 0 && failures === leagues.length) process.exit(1);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Wire items runner crashed:', error);
    process.exit(1);
  });
