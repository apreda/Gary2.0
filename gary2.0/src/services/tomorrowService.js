/**
 * Tomorrow Board Service
 *
 * Pre-assembles the iOS "TOMORROW" tab into ONE snapshot row of the
 * `tomorrow_board` Supabase table (one read for the app). Everything is
 * computed server-side from the SAME real fetchers the rest of the pipeline
 * already pays for, pointed at TOMORROW's ET game day — it adds NO new data
 * sources.
 *
 * WHY a dedicated snapshot (not daily_slate): daily_slate only ever carries
 * TODAY (the scheduler writes it with the 5am plan day = today), so the
 * Tomorrow tab cannot read it. And the board's derived lanes — ranked big
 * games, by-sport probable starters, best-effort key returns, and the
 * earliest-game countdown — don't fit daily_slate's flat per-game shape. A
 * single jsonb snapshot keyed on (date) keeps ranking logic out of Swift.
 *
 * Lanes (each wrapped per-source in try/catch — one flaky source never sinks
 * the board; GROUNDED only — "—"/empty when unposted, never fabricated):
 *   1. SLATE + LINES — reuses dailySlateService.buildLeagueRows for every slate
 *      sport at tomorrow's ET date, so the Tomorrow board never drifts from the
 *      Today slate. Lines null => board renders "—". any_lines=false when ZERO
 *      games have any posted line ("lines open soon" hero).
 *   2. PROBABLE STARTERS — MLB probable pitchers (getMlbSchedule, both sides,
 *      all games) joined to Savant season ERA by name. WC = "<Team> XI", team
 *      name only (no forward projected XI / formation exists the day before).
 *   3. KEY RETURNS — best-effort IL->active roster-status lane; honest-empty
 *      when nothing qualifies (no dedicated return-date feed exists).
 *   4. BIG GAMES — top-3 marquee games by a grounded newsworthiness weight
 *      (standings rank, division rivalry, primetime window, ace starter, WC
 *      stage). NO Layer-3 betting conclusions — just why it's worth watching.
 *   5. COUNTDOWN — earliest commence_time across ALL of tomorrow's slate +
 *      that game's league (drives the hero term + clock).
 *
 * Write path: service-role REST upsert on (date) — idempotent, safe to re-run;
 * a later (evening) run refreshes overnight-posted lines in place.
 */

import axios from 'axios';
import {
  buildLeagueRows,
  SLATE_SPORTS_LIST,
  getETDateStr,
} from './dailySlateService.js';
import { getMlbSchedule, getMlbStandings, getMlbTeams } from './mlbStatsApiService.js';
import { getPitcherXStats } from './baseballSavantService.js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE = 'tomorrow_board';
const CONFLICT_KEY = 'date';
const SEASON = 2026;

// Primetime national window (>= 7pm ET) gives a marquee weight boost.
const PRIMETIME_HOUR_ET = 19;
// A Savant season ERA at/below this marks a game's starter as an "ace" hook.
const ACE_ERA = 3.20;

/** Tomorrow's ET game day = today's en-CA America/New_York date + 1 (UTC math, no tz drift). */
export function tomorrowET() {
  const todayET = getETDateStr(new Date());
  const d = new Date(`${todayET}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────── name / key helpers ─────────────────────────── */

function nameKey(s) {
  return String(s || '').toLowerCase().replace(/[.\-']/g, '').replace(/\s+/g, ' ').trim();
}
function lastNameKey(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return nameKey(parts[parts.length - 1] || '');
}
/** "Gerrit Cole" -> "G. Cole" (mock's compact starter name format). */
function abbrevName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length < 2) return fullName || '';
  const last = parts[parts.length - 1];
  const first = parts[0];
  return `${first.charAt(0)}. ${last}`;
}

/* ─────────────────────────── ET time formatting ─────────────────────────── */

/** ISO -> short ET clock like "7:10" (no am/pm — board row time chip). */
function etClock(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d).replace(/\s?[AP]M$/i, '');
}

/** ET hour (0-23) of an ISO instant — for the primetime test. */
function etHour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false,
  }).format(d);
  const n = Number(h);
  return Number.isFinite(n) ? (n === 24 ? 0 : n) : null;
}

/* ─────────────────────────── MLB team indexes ─────────────────────────── */

/**
 * Index MLB teams by id => { abbr, fullName, nickname, divisionId, divisionName }.
 * getMlbTeams() is the only source that carries BOTH the abbreviation and the
 * division name; standings + schedule only carry the team id + nickname/full
 * name, so we join everything through this id-keyed index.
 */
function indexMlbTeams(teams) {
  const byId = new Map();
  const abbrByName = new Map();
  for (const t of teams || []) {
    if (t?.id == null) continue;
    const rec = {
      id: t.id,
      abbr: t.abbreviation || null,
      fullName: t.name || null,        // "Houston Astros"
      nickname: t.teamName || t.clubName || null, // "Astros"
      divisionId: t.division?.id ?? null,
      divisionName: t.division?.name ?? null, // "American League East"
    };
    byId.set(t.id, rec);
    for (const nm of [t.name, t.teamName, t.clubName, t.shortName, t.locationName && t.teamName ? `${t.locationName} ${t.teamName}` : null]) {
      if (nm) abbrByName.set(nameKey(nm), t.abbr || t.abbreviation || null);
    }
  }
  return { byId, abbrByName };
}

/** Resolve a team's abbreviation from a full/nick name via the team index. */
function abbrFor(name, teamIndex) {
  if (!name) return null;
  return teamIndex.abbrByName.get(nameKey(name)) || name;
}

/**
 * Standings lookup by MLB team id => { divisionRank, gamesBack, wins, losses }.
 * getMlbStandings returns the raw MLB Stats API payload: records[].teamRecords[]
 * with team.id, divisionRank (string), gamesBack (string, "-" for leader),
 * wins, losses.
 */
function indexStandings(standingsRaw) {
  const byTeamId = new Map();
  const records = standingsRaw?.records || [];
  for (const rec of records) {
    for (const tr of rec.teamRecords || []) {
      const id = tr?.team?.id;
      if (id == null) continue;
      const rank = Number(tr.divisionRank);
      const gb = tr.gamesBack === '-' ? 0 : Number(tr.gamesBack);
      byTeamId.set(id, {
        divisionRank: Number.isFinite(rank) ? rank : null,
        gamesBack: Number.isFinite(gb) ? gb : null,
        wins: Number(tr.wins),
        losses: Number(tr.losses),
      });
    }
  }
  return byTeamId;
}

/** Savant pitcher xStats indexed by full-name + last-name key => season ERA. */
function indexPitcherEraByName(pitcherX) {
  const map = new Map();
  for (const r of pitcherX || []) {
    const era = Number(r?.era);
    if (!Number.isFinite(era)) continue;
    const last = r?.last_name || '';
    const first = r?.first_name || '';
    if (last) {
      map.set(nameKey(`${first} ${last}`), era);
      if (!map.has(nameKey(last))) map.set(nameKey(last), era);
    } else if (r?.name) {
      map.set(nameKey(r.name), era);
    }
  }
  return map;
}
function eraForName(fullName, eraByName) {
  if (!fullName) return null;
  const e = eraByName.get(nameKey(fullName));
  if (Number.isFinite(e)) return e;
  const e2 = eraByName.get(lastNameKey(fullName));
  return Number.isFinite(e2) ? e2 : null;
}

/* ─────────────────────── curated division rivalries ─────────────────────── */
// Static, factual divisional-rivalry pairs (abbreviation sets). Newsworthiness
// only — never a betting conclusion.
const RIVALRY_PAIRS = [
  ['NYY', 'BOS'], ['LAD', 'SF'], ['LAD', 'SD'], ['SF', 'SD'],
  ['CHC', 'STL'], ['NYM', 'PHA'], ['NYM', 'PHI'], ['ATL', 'NYM'],
  ['HOU', 'TEX'], ['CLE', 'CHW'], ['CWS', 'CLE'], ['SEA', 'HOU'],
  ['TBR', 'TB'], ['BAL', 'NYY'], ['MIL', 'CHC'], ['CIN', 'STL'],
];
function isRivalry(a, b) {
  if (!a || !b) return false;
  return RIVALRY_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

/* ───────────────────────────── 1. SLATE + LINES ─────────────────────────── */

async function buildSlate(etDateStr) {
  const board = [];
  const byLeague = {};
  for (const sport of SLATE_SPORTS_LIST) {
    try {
      const rows = await buildLeagueRows(sport, etDateStr);
      if (rows.length) byLeague[sport.league] = rows.length;
      board.push(...rows);
    } catch (e) {
      console.warn(`[TomorrowBoard] ${sport.league} slate fetch failed (skipping league): ${e.message}`);
    }
  }
  // Doubleheader de-dupe — keep earliest kickoff per (league|away|home), same
  // guard dailySlateService applies before its upsert.
  const deduped = Object.values(
    board.slice()
      .sort((a, b) => new Date(a.commence_time || 0) - new Date(b.commence_time || 0))
      .reduce((acc, r) => {
        const k = `${r.league}|${r.away_team}|${r.home_team}`;
        if (!acc[k]) acc[k] = r;
        return acc;
      }, {}),
  );
  return { rows: deduped, byLeague };
}

/* ──────────────────────── 2. PROBABLE STARTERS (MLB/WC) ─────────────────── */

async function buildStarters(etDateStr, teamIndex, eraByName) {
  const starters = [];
  // Per MLB game (keyed "awayFullName|homeFullName"): ace label + both-aces flag
  // for the big-games ACE hook, built from the SAME schedule read.
  const acesByGame = new Map();

  // MLB — every named probable pitcher, both sides, all games.
  try {
    const sched = await getMlbSchedule(etDateStr);
    for (const g of sched || []) {
      const awayName = g?.teams?.away?.team?.name;
      const homeName = g?.teams?.home?.team?.name;
      const gameAces = []; // { lastName, era }
      for (const side of ['away', 'home']) {
        const t = g?.teams?.[side];
        const name = t?.probablePitcher?.fullName;
        if (!name) continue;
        const abbr = abbrFor(t?.team?.name, teamIndex) || '';
        const era = eraForName(name, eraByName);
        const detail = era != null ? `${abbr} ${era.toFixed(2)}` : abbr;
        starters.push({ league: 'MLB', name: abbrevName(name), team: abbr, detail });
        if (era != null && era <= ACE_ERA) {
          const last = String(name).trim().split(/\s+/).pop();
          gameAces.push({ lastName: last, era });
        }
      }
      if (gameAces.length && awayName && homeName) {
        gameAces.sort((a, b) => a.era - b.era);
        // Key by abbreviations so the slate (nicknames) and schedule (full
        // names) resolve to the same game.
        const aAbbr = abbrFor(awayName, teamIndex);
        const hAbbr = abbrFor(homeName, teamIndex);
        acesByGame.set(`${aAbbr}|${hAbbr}`, {
          label: gameAces.map((a) => a.lastName).join(' vs '),
          both: gameAces.length >= 2,
        });
      }
    }
  } catch (e) {
    console.warn(`[TomorrowBoard] MLB starters fetch failed: ${e.message}`);
  }

  // WC — team name only ("<Team> XI"). No forward projected XI / formation
  // exists the day before; never fabricate a shape.
  try {
    const wc = await import('./fifaWorldCupService.js');
    const matches = await wc.getMatches({});
    for (const m of Array.isArray(matches) ? matches : []) {
      if (!m?.home_team?.name || !m?.away_team?.name || !m?.datetime) continue;
      const start = new Date(m.datetime);
      if (Number.isNaN(start.getTime()) || getETDateStr(start) !== etDateStr) continue;
      for (const teamName of [m.away_team.name, m.home_team.name]) {
        starters.push({ league: 'WC', name: `${teamName} XI`, team: teamName, detail: '' });
      }
    }
  } catch (e) {
    console.warn(`[TomorrowBoard] WC starters fetch failed: ${e.message}`);
  }

  return { starters, acesByGame };
}

/* ──────────────────────────── 3. KEY RETURNS ────────────────────────────── */

/**
 * Best-effort IL->active "key returns" lane. No dedicated return-date feed
 * exists, and an IL->active diff needs a prior-day roster snapshot we don't
 * persist — so this honestly yields [] today rather than inventing returns.
 * Structured as its own try/catch lane so it can be populated later (when a
 * roster-status snapshot store is added) WITHOUT ever blocking the board.
 * GROUNDED: returns only real status-change rows; empty otherwise.
 */
async function buildReturns() {
  try {
    // Intentionally empty until a prior-day roster-status snapshot exists to
    // diff against. Never fabricate a return.
    return [];
  } catch (e) {
    console.warn(`[TomorrowBoard] returns lane failed (honest-empty): ${e.message}`);
    return [];
  }
}

/* ───────────────────────────── 4. BIG GAMES ─────────────────────────────── */

/**
 * Score each slate game for newsworthiness and rank the top 3. Grounded inputs
 * only (standings rank, division rivalry, primetime window, ace starter, WC
 * stage) — NO Layer-3 betting conclusions; the chip names WHY it's worth
 * watching, the context string is factual. Falls back to primetime + slate
 * order so we always surface 3 when there are >= 3 games.
 */
function buildBigGames(board, { mlb }) {
  const scored = board.map((row) => {
    let weight = 0;
    let reason = null;       // single highest-weight factor -> chip
    let bestReasonW = -1;
    const ctxParts = [];

    const setReason = (label, w) => {
      if (w > bestReasonW) { bestReasonW = w; reason = label; }
    };

    if (row.league === 'MLB' && mlb) {
      const awayAbbr = abbrFor(row.away_team, mlb.teamIndex);
      const homeAbbr = abbrFor(row.home_team, mlb.teamIndex);
      const awayId = mlb.idByName.get(nameKey(row.away_team));
      const homeId = mlb.idByName.get(nameKey(row.home_team));
      const aSt = awayId != null ? mlb.standings.get(awayId) : null;
      const hSt = homeId != null ? mlb.standings.get(homeId) : null;
      const aTeam = awayId != null ? mlb.teamIndex.byId.get(awayId) : null;
      const hTeam = homeId != null ? mlb.teamIndex.byId.get(homeId) : null;

      // STANDINGS — both first/second in division, or a tight in-division race.
      const bothTop2 = aSt?.divisionRank && hSt?.divisionRank && aSt.divisionRank <= 2 && hSt.divisionRank <= 2;
      const sameDivision = aTeam?.divisionId != null && aTeam.divisionId === hTeam?.divisionId;
      if (aSt?.divisionRank === 1 || hSt?.divisionRank === 1) {
        setReason('FIRST PLACE', 30);
        weight += 30;
      }
      if (bothTop2 && sameDivision) {
        setReason('DIVISION', 28);
        weight += 26;
        const small = (aSt?.gamesBack != null && aSt.gamesBack <= 3) || (hSt?.gamesBack != null && hSt.gamesBack <= 3);
        if (small) { setReason('PENNANT RACE', 32); weight += 10; }
      }
      if (sameDivision && hTeam?.divisionName) {
        // Short division tag for context ("AL East").
        ctxParts.push(shortDivision(hTeam.divisionName));
      }

      // RIVALRY — curated divisional pairs.
      if (isRivalry(awayAbbr, homeAbbr)) { setReason('RIVALRY', 27); weight += 24; }

      // ACE — a probable with a season ERA at/below the ace threshold.
      const aces = mlb.acesByGame.get(`${awayAbbr}|${homeAbbr}`);
      if (aces?.label) {
        setReason('ACE', 22);
        weight += aces.both ? 16 : 9;
        ctxParts.push(aces.label);
      }
    }

    if (row.league === 'WC') {
      const wcStage = row._wc_stage;
      if (wcStage && /knock|round of|quarter|semi|final/i.test(wcStage)) {
        setReason('KNOCKOUT', 34); weight += 34;
        ctxParts.push(wcStage);
      } else if (wcStage && /group/i.test(wcStage)) {
        setReason('GROUP STAGE', 14); weight += 12;
        if (row._wc_group) ctxParts.push(row._wc_group);
      }
    }

    // PRIMETIME — national window weight boost (never a chip alone).
    const h = etHour(row.commence_time);
    if (h != null && h >= PRIMETIME_HOUR_ET) weight += 8;

    // Fallback so a 3+-game slate always fills three slots.
    weight += 1;

    return { row, weight, reason, ctx: ctxParts.filter(Boolean).join(' · ') || null };
  });

  scored.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    // tie-break by earliest start (the marquee opener leads)
    return new Date(a.row.commence_time || 0) - new Date(b.row.commence_time || 0);
  });

  return scored.slice(0, 3).map((s, i) => ({
    rank: i + 1,
    league: s.row.league,
    matchup: `${s.row.away_team} @ ${s.row.home_team}`,
    reason: s.reason || (etHour(s.row.commence_time) >= PRIMETIME_HOUR_ET ? 'PRIMETIME' : 'MARQUEE'),
    context: s.ctx,
    commence_time: s.row.commence_time || null,
  }));
}

/** "American League East" -> "AL East"; "National League Central" -> "NL Central". */
function shortDivision(name) {
  if (!name) return null;
  return String(name)
    .replace(/^American League\s+/i, 'AL ')
    .replace(/^National League\s+/i, 'NL ');
}

/* ──────────────────────── presentation: board rows ──────────────────────── */

/**
 * Map an internal slate row to the persisted board[] row shape (mirrors
 * DailySlateRow + precomputed abbreviations + is_marquee). All line fields stay
 * nullable => Swift renders "—".
 */
function toBoardRow(row, marqueeKeys, teamIndex) {
  const awayAbbr = row.league === 'MLB' ? abbrFor(row.away_team, teamIndex) : null;
  const homeAbbr = row.league === 'MLB' ? abbrFor(row.home_team, teamIndex) : null;
  return {
    league: row.league ?? null,
    away_team: row.away_team ?? null,
    home_team: row.home_team ?? null,
    away_abbr: awayAbbr,
    home_abbr: homeAbbr,
    commence_time: row.commence_time ?? null,
    venue: row.venue ?? null,
    spread: row.spread ?? null,
    ml_home: row.ml_home ?? null,
    ml_away: row.ml_away ?? null,
    total: row.total ?? null,
    is_marquee: marqueeKeys.has(`${row.league}|${row.away_team}|${row.home_team}`),
  };
}

/* ───────────────────────────── main assembler ───────────────────────────── */

/**
 * Assemble + persist tomorrow's board snapshot. Idempotent upsert on (date) —
 * re-runs (e.g. the evening line refresh) overwrite in place so overnight-posted
 * lines flip "—" to real numbers before users wake.
 *
 * @returns {Promise<{date,game_count,any_lines,big_games,starters,returns,countdown_sport}>}
 */
export async function writeTomorrowBoard(etDateStr = tomorrowET()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etDateStr)) {
    throw new Error(`writeTomorrowBoard: invalid date "${etDateStr}" (expected YYYY-MM-DD)`);
  }
  const adminKey = supabaseServiceKey || supabaseAnonKey;
  if (!supabaseUrl || !adminKey) {
    throw new Error(
      'writeTomorrowBoard: Supabase config missing — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  // 1. SLATE + LINES (single source of truth, in lockstep with the Today slate).
  const { rows: slateRows, byLeague } = await buildSlate(etDateStr);

  // Annotate WC rows with stage/group for big-games (fetched once here).
  await annotateWcStages(slateRows, etDateStr);

  // MLB join indexes (teams / standings / aces) — each best-effort.
  let teams = [];
  try { teams = await getMlbTeams(); } catch (e) { console.warn(`[TomorrowBoard] teams fetch failed: ${e.message}`); }
  const teamIndex = indexMlbTeams(teams);
  const idByName = buildIdByName(teams);

  let standings = new Map();
  try { standings = indexStandings(await getMlbStandings(SEASON)); }
  catch (e) { console.warn(`[TomorrowBoard] standings fetch failed: ${e.message}`); }

  let eraByName = new Map();
  try { eraByName = indexPitcherEraByName(await getPitcherXStats(SEASON)); }
  catch (e) { console.warn(`[TomorrowBoard] savant ERA fetch failed: ${e.message}`); }

  // 2. STARTERS (+ ace-by-game map from the same schedule read).
  const { starters, acesByGame } = await buildStarters(etDateStr, teamIndex, eraByName);

  // 3. RETURNS (best-effort, honest-empty).
  const returns = await buildReturns();

  // 4. BIG GAMES.
  const bigGames = buildBigGames(slateRows, {
    mlb: { teamIndex, standings, idByName, acesByGame },
  });
  const marqueeKeys = new Set(
    bigGames.map((b) => {
      const [away, home] = String(b.matchup).split(' @ ');
      return `${b.league}|${away}|${home}`;
    }),
  );

  // 5. COUNTDOWN — earliest commence_time across ALL slate rows + its league.
  let countdown_iso = null;
  let countdown_sport = null;
  for (const r of slateRows) {
    if (!r.commence_time) continue;
    const t = new Date(r.commence_time).getTime();
    if (Number.isNaN(t)) continue;
    if (countdown_iso == null || t < new Date(countdown_iso).getTime()) {
      countdown_iso = r.commence_time;
      countdown_sport = r.league;
    }
  }

  // board[] presentation rows.
  const board = slateRows.map((r) => toBoardRow(r, marqueeKeys, teamIndex));
  const any_lines = board.some(
    (r) => r.spread != null || r.ml_home != null || r.ml_away != null || r.total != null,
  );

  const record = {
    date: etDateStr,
    countdown_iso,
    countdown_sport,
    game_count: board.length,
    any_lines,
    board,
    big_games: bigGames,
    starters,
    returns,
    updated_at: new Date().toISOString(),
  };

  const sanitized = JSON.parse(JSON.stringify(record));
  await axios({
    method: 'POST',
    url: `${supabaseUrl}/rest/v1/${TABLE}`,
    data: sanitized,
    params: { on_conflict: CONFLICT_KEY },
    headers: {
      apikey: adminKey,
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
  });

  const summary = Object.entries(byLeague).map(([l, n]) => `${l}=${n}`).join(', ');
  console.log(
    `[TomorrowBoard] ✅ ${etDateStr}: ${board.length} game(s)${summary ? ` (${summary})` : ''}, ` +
    `${bigGames.length} big game(s), ${starters.length} starter(s), ${returns.length} return(s), ` +
    `lines=${any_lines ? 'posted' : 'open soon'}, countdown=${countdown_sport || 'none'}`,
  );

  return {
    date: etDateStr,
    game_count: board.length,
    any_lines,
    big_games: bigGames,
    starters,
    returns,
    countdown_sport,
  };
}

/* ───────────────────────── supporting builders ──────────────────────────── */

/** team-name (full/nick) -> id, from getMlbTeams (so slate names resolve to ids). */
function buildIdByName(teams) {
  const map = new Map();
  for (const t of teams || []) {
    if (t?.id == null) continue;
    for (const nm of [t.name, t.teamName, t.clubName, t.shortName, t.locationName && t.teamName ? `${t.locationName} ${t.teamName}` : null]) {
      if (nm) map.set(nameKey(nm), t.id);
    }
  }
  return map;
}

/**
 * Annotate WC slate rows in place with _wc_stage / _wc_group for big-games
 * weighting (knockout vs group). Best-effort; MLB rows untouched.
 */
async function annotateWcStages(slateRows, etDateStr) {
  if (!slateRows.some((r) => r.league === 'WC')) return;
  try {
    const wc = await import('./fifaWorldCupService.js');
    const matches = await wc.getMatches({});
    const byPair = new Map();
    for (const m of Array.isArray(matches) ? matches : []) {
      if (!m?.home_team?.name || !m?.away_team?.name) continue;
      byPair.set(`${m.away_team.name}|${m.home_team.name}`, {
        stage: m.stage?.name || null,
        group: m.group?.name || null,
        round: m.round_name || null,
      });
    }
    for (const r of slateRows) {
      if (r.league !== 'WC') continue;
      const info = byPair.get(`${r.away_team}|${r.home_team}`);
      if (info) {
        r._wc_stage = info.round || info.stage;
        r._wc_group = info.group;
      }
    }
  } catch (e) {
    console.warn(`[TomorrowBoard] WC stage annotate failed: ${e.message}`);
  }
}

export default { writeTomorrowBoard, tomorrowET };
