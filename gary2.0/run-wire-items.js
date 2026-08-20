#!/usr/bin/env node
/**
 * The Wire — The Day in Baseball
 *
 * Produces the Home page "Wire" feed: short items about what is happening in
 * the league TODAY — notable in-game moments (multi-HR nights, no-hitters,
 * milestone lines, wild finals), injury news with its consequence, line moves
 * on tonight's slate, and totals-relevant environment notes. ONE grounded
 * Gemini call per league (cheap Flash model + google_search) returns a strict
 * JSON array; the runner normalizes those to flat `wire_items` rows and writes
 * them with the same service-role DELETE-then-INSERT idempotency as
 * run-insight-connections.js. iOS reads via the anon SELECT policy.
 *
 * REDESIGNED Aug 5 2026 (founder): the old feed led with "result" items —
 * yesterday's games recapped against the closing number. Those duplicated the
 * headline recap cards at the top of Home and read a day stale by evening
 * (a fresh 8:49 PM run was still telling Monday's 14-2 rout on Wednesday
 * night). The "result" kind is retired; "moment" leads. Freshness is a prompt
 * LAW: today first, yesterday only when the copy says so, nothing older.
 *
 * Idempotent per day: the day's existing rows for each league are replaced so
 * re-runs (the later scheduled passes) never duplicate.
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
const ACTIVE_LEAGUES = ['MLB', 'NFL', 'NCAAF', 'NBA'];

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

// game_recaps carries each final's box line (R/H/HR per side) and its
// sanitizer-verified stat bullets — the ground truth for 'moment' stat claims.
const RECAPS_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/game_recaps` : null;

// daily_picks is the grounding source for TODAY's real slate (the teams Gary is
// actually dealing with). Used to build the real-team allowlist that prevents the
// model from fabricating games (e.g. inventing a 2024-Finals NBA matchup when the
// NBA pipeline has produced nothing real).
const DAILY_PICKS_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/daily_picks` : null;
const DAILY_SLATE_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/daily_slate` : null;

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

/** N days before dateStr, as YYYY-MM-DD. */
function daysBefore(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Injury headlines this feed already ran in the week before targetDate.
 * Grounded search can't date its snippets, so the model kept re-reporting
 * ongoing IL stints as fresh moves (Aug 19: "Reds place Hunter Greene on IL"
 * — four days AFTER this same feed ran his season-ending Tommy John story).
 * The published history is the one dated record we hold; it feeds both the
 * prompt (prevention) and the repeat-player gate below (enforcement).
 */
async function fetchRecentInjuryHeadlines(targetDate, league, days = 7) {
  try {
    const { data } = await axios({
      method: 'GET',
      url: REST_URL,
      headers: restHeaders,
      params: {
        select: 'date,headline,subline',
        league: `eq.${league}`,
        kind: 'eq.injury',
        date: `gte.${daysBefore(targetDate, days)}`,
        and: `(date.lt.${targetDate})`,
        order: 'date.desc',
        limit: 60,
      },
    });
    return Array.isArray(data) ? data : [];
  } catch {
    return []; // best-effort: no history just means no extra guard material
  }
}

/**
 * Capitalized 2-3 word runs that survive team-token stripping — the player
 * names in a headline. "Texans' Jayden Higgins out for season" → jayden
 * higgins. Name-level (not surname) so Riley Greene never collides with
 * Hunter Greene.
 */
function personNames(text, teamTokenSet) {
  const names = new Set();
  if (!text) return names;
  const matches = String(text).match(/\b[A-Z][a-zA-Z'’.-]*(?:\s+[A-Z][a-zA-Z'’.-]*){1,2}\b/g) || [];
  const isTeamWord = (w) => {
    const t = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    return t.length < 2 || teamTokenSet.has(t);
  };
  for (const seq of matches) {
    const words = seq.split(/\s+/);
    while (words.length && isTeamWord(words[0])) words.shift();
    while (words.length && isTeamWord(words[words.length - 1])) words.pop();
    if (words.length >= 2 && words.length <= 3) {
      const name = words.join(' ').toLowerCase().replace(/[^a-z\s'-]/g, '').replace(/\s+/g, ' ').trim();
      if (name.includes(' ')) names.add(name);
    }
  }
  return names;
}

/**
 * A repeat-player injury item may still run when it reports a MATERIAL new
 * phase — the story moving forward, not the original move re-told.
 */
const INJURY_ESCALATION =
  /\b(surgery|torn|out for (?:the )?season|season-ending|activated|returns?|returning|reinstated|setback|shut down|60-day)\b/i;

/**
 * Pull one day's graded game_results rows for a league. The grader writes each
 * game minutes after its final, so an evening run sees TONIGHT's finished games
 * here — the freshest "day in baseball" grounding there is. Best-effort: a
 * failure just yields no extra context (the run proceeds on search grounding).
 */
async function fetchFinalsForDay(date, league) {
  if (!RESULTS_REST_URL) return [];
  try {
    const resp = await axios({
      method: 'GET',
      url: RESULTS_REST_URL,
      headers: restHeaders,
      params: {
        select: 'league,final_score,matchup',
        league: `eq.${league}`,
        game_date: `eq.${date}`,
        limit: 25,
      },
    });
    return Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`   ⚠️  [${league}] finals context fetch failed (non-fatal): ${detail}`);
    return [];
  }
}

/**
 * Join one day's finals with their game_recaps box lines + stat bullets, as
 * ready-to-print context lines. The bullets were already fact-checked at recap
 * time (the price sanitizer + box are built from the real BDL batting lines),
 * so a 'moment' grounded here can't invent a stat — the Aug 6 dry run had the
 * model take a real 6-0 final and embellish "held to three hits" onto a team
 * that actually had eight.
 */
async function fetchFinalsWithNotes(date, league) {
  const finals = await fetchFinalsForDay(date, league);
  if (!finals.length || !RECAPS_REST_URL) return finals.map((r) => ({ ...r, note: null }));
  let recaps = [];
  try {
    const resp = await axios({
      method: 'GET',
      url: RECAPS_REST_URL,
      headers: restHeaders,
      params: {
        select: 'matchup,box,bullets',
        league: `eq.${league}`,
        game_date: `eq.${date}`,
        limit: 25,
      },
    });
    recaps = Array.isArray(resp.data) ? resp.data : [];
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`   ⚠️  [${league}] recap-notes fetch failed (non-fatal): ${detail}`);
  }
  const byMatchup = new Map(recaps.map((r) => [String(r.matchup || '').toLowerCase(), r]));
  return finals.map((r) => {
    const rec = byMatchup.get(String(r.matchup || '').toLowerCase());
    const bits = [];
    const side = (s) => (s && s.runs != null ? `${s.runs}R/${s.hits ?? '?'}H/${s.hr ?? '?'}HR` : null);
    const away = side(rec?.box?.away), home = side(rec?.box?.home);
    if (away && home) bits.push(`box: away ${away} — home ${home}`);
    if (Array.isArray(rec?.bullets) && rec.bullets.length) bits.push(`notes: ${rec.bullets.join('; ')}`);
    return { ...r, note: bits.length ? bits.join(' | ') : null };
  });
}

/** "9:41 PM" ET right now — the prompt's freshness anchor. */
function nowClockET() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date());
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

/** Pull today's full slate team names, falling back to the legacy pick row. */
async function fetchSlateTeams(date, league) {
  if (DAILY_SLATE_REST_URL) {
    try {
      const resp = await axios({
        method: 'GET',
        url: DAILY_SLATE_REST_URL,
        headers: restHeaders,
        params: {
          select: 'away_team,home_team',
          date: `eq.${date}`,
          league: `eq.${league}`,
          limit: 200,
        },
      });
      const rows = Array.isArray(resp.data) ? resp.data : [];
      const names = rows.flatMap((row) => [row?.away_team, row?.home_team]).filter(Boolean);
      if (names.length > 0) return names;
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.warn(`   ⚠️  [${league}] daily_slate fetch failed; trying pick ledger: ${detail}`);
    }
  }

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
 * set (for validation), drawn from today's slate and the last two days' finals.
 */
function buildAllowlist(slateTeams, finalsRows) {
  const names = new Set();
  for (const n of slateTeams) if (n) names.add(String(n).trim());
  for (const r of finalsRows) {
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
  const gameSpecific = item.kind === 'moment' || item.kind === 'line_move' || item.kind === 'injury';
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

function buildPrompt({ date, league, todayFinals, ydayFinals, allowNames, recentInjuries = [] }) {
  const yday = yesterdayOf(date);
  const clock = nowClockET();
  const injuryHistoryBlock = recentInjuries.length
    ? recentInjuries.map((r) => `- [${r.date}] ${r.headline}`).join('\n')
    : '(none on file)';
  const finalsLine = (rows) =>
    rows
      .map((r) => `- ${r.matchup || '?'} | final ${r.final_score || '?'}${r.note ? ` | ${r.note}` : ''}`)
      .join('\n');
  const todayBlock = todayFinals.length
    ? finalsLine(todayFinals)
    : '(none final yet — early in the day, or games still in progress)';
  const ydayBlock = ydayFinals.length ? finalsLine(ydayFinals) : '(none on file)';

  const teamsBlock = allowNames && allowNames.length
    ? allowNames.map((n) => `- ${n}`).join('\n')
    : '(none)';
  const football = league === 'NFL' || league === 'NCAAF';
  const momentExamples = football
    ? `a multi-touchdown game, a 100-yard rushing or receiving performance, a pick-six, a dominant sack/turnover game, a comeback, a game-winning drive, an upset, or a milestone explicitly present in the verified notes`
    : `a multi-homer night, a double-digit strikeout start, a no-hitter or one taken deep into the game, a huge RBI line, a walk-off, an extra-innings marathon, a slugfest or a shutout of note, or a milestone explicitly present in the verified notes`;
  const environmentExamples = football
    ? `weather, pace, expected game script, or scoring-environment notes relevant to the total`
    : `scoring-environment, park, or weather notes relevant to totals`;

  return `You are the editor of "The Wire" — the day-in-${league} ticker on a sports betting app's ` +
    `front page. It is ${clock} ET on ${date}. Yesterday was ${yday}. Generate today's items.\n\n` +
    `These are the ONLY real teams in play right now (today's slate + the last graded games). ` +
    `Every item MUST be about one of these teams. Do NOT write about any team not on this list, and ` +
    `do NOT invent matchups, series, or playoff rounds from memory — if you are not certain a game is ` +
    `happening on the real ${date} schedule, omit it:\n${teamsBlock}\n\n` +
    `Games already FINAL today, ${date} (freshest material — lead here):\n${todayBlock}\n\n` +
    `Yesterday's finals, ${yday} (usable ONLY under the freshness rules below):\n${ydayBlock}\n\n` +
    `INJURY NEWS THIS FEED ALREADY PUBLISHED in the last 7 days — the reader has seen every one ` +
    `of these; they are OLD news:\n${injuryHistoryBlock}\n` +
    `An injury item runs ONLY for something NEW TODAY: a new injury, or a MATERIAL new phase of ` +
    `one listed above (surgery decided, ruled out for the season, activated/returning, a setback). ` +
    `NEVER re-report a stint from that list, and NEVER report the ORIGINAL move of a player whose ` +
    `story has since advanced — search results are often days or weeks old and do not say so. ` +
    `An injury story you cannot date to today does not run.\n\n` +
    `Use Google Search to find REAL, current information about these teams: tonight's standout ` +
    `individual performances and game stories, today's injury news, line moves on the upcoming slate, ` +
    `and scoring-environment notes.\n\n` +
    `Return a STRICT JSON array (no prose, no markdown fences, no commentary) of 4 to 8 items. ` +
    `Each item is an object with EXACTLY these keys:\n` +
    `  "kind": one of "moment" | "injury" | "line_move" | "pace"\n` +
    `  "headline": short, punchy, <= 90 chars\n` +
    `  "subline": one sentence of supporting detail (or null)\n` +
    `  "body": 2-3 further sentences for readers who tap to expand. No repetition of the ` +
    `headline/subline. (or null)\n` +
    `  "source_handle": always null\n` +
    `  "game": the matchup this is about ("Away @ Home"), or null if league-wide\n` +
    `  "relevance_score": integer 0-100 (higher = more lead-worthy / front-page)\n\n` +
    `EDITORIAL RULES:\n` +
    `- moment (the feed's LEAD kind): a thing that HAPPENED in a game worth telling a friend about — ` +
    `${momentExamples}. Name the player/team and the real number when the notes provide it. This is fan-interest copy, ` +
    `NOT a betting recap — never frame a moment against a spread or closing number.\n` +
    `- STAT GROUNDING LAW for moments: a moment is built EXCLUSIVELY from that game's line in the ` +
    `FINALS blocks above — the final, the box, the notes. Not from search, not from memory: not the ` +
    `stats, not the opponent, not season context ("first time this season", "joins Mays and Bonds"). ` +
    `A game whose line has NO "notes:" section is not eligible for a moment at all. Never add a ` +
    `player fact the notes don't state — handedness, age, rookie status, position, nationality. ` +
    `If the blocks don't support it, it doesn't exist — write fewer items. Search is for injury, ` +
    `line_move, and pace items only.\n` +
    `- injury: real injury, IL, or return-timeline news from today and what it changes (rotation, ` +
    `lineup, market). A call-up, trade, or lineup preference is NOT an injury item — if it fits no ` +
    `kind, it doesn't run.\n` +
    `- The night's best moments are the feed's lead — when the notes produced real ones, score them ` +
    `above everything else.\n` +
    `- line_move: name the OLD number and the NEW number ("Total dropped from 9 to 8.5").\n` +
    `- pace: ${environmentExamples}.\n` +
    `FRESHNESS LAWS (the reason this feed exists — violating them ships stale news):\n` +
    `- Lead with TODAY: things that happened today, injury news from today, moves on the upcoming slate.\n` +
    `- An item about yesterday is allowed ONLY when today has not yet produced its own material ` +
    `(a morning run), and its copy MUST say when it happened ("Tuesday night") — never present an ` +
    `old game as if it just happened.\n` +
    `- NOTHING older than yesterday. No season retrospectives, no "earlier this week".\n` +
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

// 'voice' removed — Gary never fabricates attributed analyst quotes (founder).
// 'result' retired Aug 5 2026 — yesterday-recaps duplicated the headline cards
// and read stale by evening (founder). Any stray item of either kind the model
// emits is dropped at validation by its absence here.
const VALID_KINDS = new Set(['moment', 'line_move', 'injury', 'pace']);

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

/**
 * The notes never state a pitcher's handedness, but the model keeps guessing it
 * anyway ("the Royals right-hander" — Cameron throws left; it survived three
 * prompt-law dry runs on Aug 6). Prompt laws don't hold here, so the word class
 * comes out deterministically: "pitcher" is always true, never a coin flip.
 */
function scrubHandedness(s) {
  if (!s) return s;
  return String(s)
    // noun forms stand in for the player — swap for a word that's always true
    .replace(/\b(?:right|left)-hander\b/gi, 'pitcher')
    .replace(/\b(?:righty|lefty|southpaw)\b/gi, 'pitcher')
    // adjective form just modifies a noun that follows — drop it
    .replace(/\b(?:right|left)-handed\s+/gi, '')
    .replace(/\s{2,}/g, ' ');
}

/** Coerce an arbitrary parsed item into a normalized wire_items row (or null). */
function toRow(item, league, date) {
  if (!item || typeof item !== 'object') return null;
  const kind = String(item.kind || '').trim().toLowerCase();
  if (!VALID_KINDS.has(kind)) return null;
  // Moments are written from the notes alone, and the notes carry no
  // handedness — any that appears is invented.
  if (kind === 'moment') {
    for (const k of ['headline', 'subline', 'body']) {
      if (item[k] != null) item[k] = scrubHandedness(item[k]);
    }
  }
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

/**
 * Replace the day's rows for a league: INSERT the fresh rows FIRST, then delete
 * the old ones by id. The old order (DELETE-then-INSERT) had a failure mode
 * where a rejected insert — e.g. a schema constraint the migration hasn't
 * reached yet — left the day's Wire EMPTY after its rows were already deleted.
 * This order fails safe: an insert that throws leaves yesterday's copy intact.
 */
async function replaceDayRows(date, league, rows) {
  const existing = await axios({
    method: 'GET',
    url: REST_URL,
    headers: restHeaders,
    params: { select: 'id', date: `eq.${date}`, league: `eq.${league}`, limit: 100 },
  });
  const oldIds = (Array.isArray(existing.data) ? existing.data : []).map((r) => r.id);

  const sanitized = JSON.parse(JSON.stringify(rows));
  await axios({
    method: 'POST',
    url: REST_URL,
    data: sanitized,
    headers: { ...restHeaders, Prefer: 'return=minimal' },
  });

  if (oldIds.length) {
    await axios({
      method: 'DELETE',
      url: REST_URL,
      headers: { ...restHeaders, Prefer: 'return=minimal' },
      params: { id: `in.(${oldIds.join(',')})` },
    });
  }
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
      // Today's finals are the lead material (the grader writes each game
      // minutes after its final); yesterday's ride along for morning runs.
      // Each final carries its box line + recap notes — the stat ground truth.
      const todayFinals = await fetchFinalsWithNotes(targetDate, league);
      const ydayFinals = await fetchFinalsWithNotes(yesterdayOf(targetDate), league);
      const slateTeams = await fetchSlateTeams(targetDate, league);
      const allow = buildAllowlist(slateTeams, [...todayFinals, ...ydayFinals]);
      console.log(
        `   Context: ${todayFinals.length} final(s) today, ${ydayFinals.length} yesterday, ` +
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

      const recentInjuries = await fetchRecentInjuryHeadlines(targetDate, league);
      const prompt = buildPrompt({ date: targetDate, league, todayFinals, ydayFinals, allowNames: allow.names, recentInjuries });
      const text = await callWireModel(prompt);
      const parsed = parseWireItems(text);

      const allRows = parsed
        .map((item) => toRow(item, league, targetDate))
        .filter(Boolean);

      // Drop items naming a team that isn't really in play (caught fabrications).
      let rows = allRows.filter((r) => isItemGrounded(r, allow.tokens));
      let dropped = allRows.length - rows.length;
      if (dropped > 0) {
        console.log(`   🚫 Dropped ${dropped} ungrounded item(s) (team not on the real slate).`);
      }

      // ENFORCED stat-grounding for moments (the prompt law alone did not hold:
      // the Aug 6 dry runs kept inventing a one-hitter onto whichever game had
      // no notes). A moment is only valid for a game whose finals line carried
      // a notes section — those notes are the sanitizer-verified recap bullets,
      // the one stat source the model was allowed to write from.
      const notedTokens = new Set();
      for (const f of [...todayFinals, ...ydayFinals]) {
        if (f.note && f.note.includes('notes:')) {
          for (const t of teamTokens(f.matchup)) notedTokens.add(t);
        }
      }
      const withNotes = rows.filter((r) =>
        r.kind !== 'moment' || teamTokens(r.game || r.headline).some((t) => notedTokens.has(t)));
      dropped = rows.length - withNotes.length;
      if (dropped > 0) {
        console.log(`   🚫 Dropped ${dropped} moment(s) about games with no verified notes.`);
      }
      rows = withNotes;

      // ENFORCED injury freshness (the prompt law alone did not hold: Aug 19
      // re-ran Hunter Greene's original IL move four days after this feed
      // published his season-ending surgery). A player this feed covered in
      // the last week only returns for a MATERIAL new phase.
      const coveredNames = new Set();
      for (const h of recentInjuries) {
        for (const n of personNames(`${h.headline || ''} ${h.subline || ''}`, allow.tokens)) coveredNames.add(n);
      }
      const freshInjuries = rows.filter((r) => {
        if (r.kind !== 'injury' || coveredNames.size === 0) return true;
        const copy = `${r.headline} ${r.subline || ''}`;
        const repeat = [...personNames(copy, allow.tokens)].some((n) => coveredNames.has(n));
        return !repeat || INJURY_ESCALATION.test(copy);
      });
      dropped = rows.length - freshInjuries.length;
      if (dropped > 0) {
        console.log(`   🚫 Dropped ${dropped} re-reported injury item(s) (player already covered this week).`);
      }
      rows = freshInjuries;

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

      // Idempotency: insert fresh rows first, then clear the old copy — an
      // insert failure leaves the previous rows standing (never a dark Wire).
      await replaceDayRows(targetDate, league, rows);
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

  // Every league is attempted independently above, so successful league writes
  // remain intact. Still surface any owned league failure to the scheduler once
  // the full pass is complete; a false-green partial run is not a successful run.
  if (failures > 0) {
    console.error(`\n❌ Wire completed with ${failures} failed league(s); successful league updates were preserved.`);
    process.exit(1);
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Wire items runner crashed:', error);
    process.exit(1);
  });
