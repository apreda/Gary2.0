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
 * Lanes are GROUNDED only — "—"/empty when source facts are genuinely
 * unposted, never fabricated. Data enrichments are best-effort; the generated
 * Arms read is the deliberate exception and must be complete before publish:
 *   1. SLATE + LINES — reuses dailySlateService.buildLeagueRows for every slate
 *      sport at tomorrow's ET date, so the Tomorrow board never drifts from the
 *      Today slate. Lines null => board renders "—". any_lines=false when ZERO
 *      games have any posted line ("lines open soon" hero).
 *   2. PROBABLE STARTERS — MLB probable pitchers ONLY (getMlbSchedule, both
 *      sides, all games) joined to Savant season ERA + xERA by name, each tagged
 *      with its game ("HOU @ DET"), opponent abbr, and home flag. Shape:
 *      {name, team, abbr, era, xera, game, opponent, home, detail}. Plus a
 *      top-level grounded league_avg_era / league_avg_xera (PA-weighted mean of
 *      the same Savant pitcher corpus) so the iOS can color each pitcher's
 *      ERA/xERA relative to league (below = good). era/xera null when Savant
 *      has no row (never fabricated).
 *   3. KEY RETURNS — best-effort IL->active roster-status lane; honest-empty
 *      when nothing qualifies (no dedicated return-date feed exists).
 *   3b. EXTRA TABBED LANES (the iOS Starters/Returns section is now a tab strip —
 *      Starters · Key Returns · +3 more). Three additional GROUNDED day-before
 *      lanes, each a clearly-named array on the snapshot:
 *        • FORM        — per MLB team L10 (W-L) + current streak (standings
 *                        records.splitRecords lastTen + streak.streakCode).
 *        • RUN PROFILE — per MLB team season runs scored / allowed / differential
 *                        + per-game rates (standings). The grounded stand-in for
 *                        an "over/under trend": game_results stores no betting
 *                        total to compute a real O/U record from, so we never
 *                        fabricate one — we surface the team's actual scoring /
 *                        run-prevention shape instead.
 *        • WEATHER     — first-pitch forecast for OUTDOOR MLB games via Open-Meteo
 *                        (key-less, day-before-available); domed/closed parks
 *                        skipped, omitted when no coords / forecast resolve.
 *                        temp_f / wind_mph / precip_pct + note.
 *   4. BIG GAMES — top-3 marquee games by a grounded newsworthiness weight
 *      (standings rank, division rivalry, primetime window, ace starter). The
 *      DISPLAYED context is now each game's ACTUAL current divisional standing
 *      as plain text (e.g. "Brewers 1st · Cubs 2nd, NL Central") via the
 *      `standing` field — not a reason chip. MLB items also carry BOTH probable
 *      starters' last names — `awayPitcher` / `homePitcher` (+ a `pitchers:{away,
 *      home}` mirror) — sourced from the SAME schedule read as the starters lane,
 *      "Undecided" per side when a probable is unposted (never blank, never
 *      fabricated). NO Layer-3 betting conclusions.
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
import {
  getMlbSchedule,
  getMlbStandings,
  getMlbTeams,
  getPitcherLastStarts,
} from './mlbStatsApiService.js';
import { getPitcherXStats } from './baseballSavantService.js';
import { ballDontLieService as bdl } from './ballDontLieService.js';
import {
  DESK_FALLBACK_MODELS,
  GEMINI_PROPS_MODEL,
} from './agentic/orchestrator/orchestratorConfig.js';
import { createGeminiSession, sendToSessionWithRetry } from './agentic/orchestrator/sessionManager.js';

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
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.\-'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// MLB's schedule and the player-stat providers do not always agree about
// whether a suffix is present (or how it is punctuated). Treat suffixes as
// identity metadata, never as the surname. This also prevents a probable such
// as "Luis Severino IV" from rendering as simply "IV" in the app.
const PLAYER_NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);
function playerNameParts(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1) {
    const suffix = parts[parts.length - 1].replace(/[.,]/g, '').toUpperCase();
    if (!PLAYER_NAME_SUFFIXES.has(suffix)) break;
    parts.pop();
  }
  return parts;
}
function playerNameWithoutSuffix(fullName) {
  return playerNameParts(fullName).join(' ');
}
function playerNameKey(fullName) {
  return nameKey(playerNameWithoutSuffix(fullName));
}
function lastNameKey(fullName) {
  const parts = playerNameParts(fullName);
  return nameKey(parts[parts.length - 1] || '');
}
/** "Gerrit Cole" -> "G. Cole" (mock's compact starter name format). */
function abbrevName(fullName) {
  const parts = playerNameParts(fullName);
  if (parts.length < 2) return fullName || '';
  const last = parts[parts.length - 1];
  const first = parts[0];
  return `${first.charAt(0)}. ${last}`;
}
/** "Gerrit Cole" -> "Cole" (probable-pitcher last name); "" when no name. */
function lastNameOf(fullName) {
  const parts = playerNameParts(fullName);
  return parts[parts.length - 1] || '';
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
 * Standings lookup by MLB team id. getMlbStandings returns the raw MLB Stats API
 * payload: records[].teamRecords[] with team.id, divisionRank (string), gamesBack
 * (string, "-" for leader), wins, losses, streak {streakCode}, records.splitRecords
 * (carries the lastTen W-L), runsScored / runsAllowed / runDifferential. We read
 * every field the board's grounded lanes need here, in one pass.
 * => { divisionRank, gamesBack, wins, losses, streakCode, l10W, l10L, runsScored,
 *      runsAllowed, runDiff }
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
      const lastTen = (tr.records?.splitRecords || []).find((s) => s?.type === 'lastTen');
      const rs = Number(tr.runsScored);
      const ra = Number(tr.runsAllowed);
      const rd = Number(tr.runDifferential);
      byTeamId.set(id, {
        divisionRank: Number.isFinite(rank) ? rank : null,
        gamesBack: Number.isFinite(gb) ? gb : null,
        wins: Number(tr.wins),
        losses: Number(tr.losses),
        streakCode: tr.streak?.streakCode || null, // "W3" / "L1"
        l10W: lastTen && Number.isFinite(Number(lastTen.wins)) ? Number(lastTen.wins) : null,
        l10L: lastTen && Number.isFinite(Number(lastTen.losses)) ? Number(lastTen.losses) : null,
        runsScored: Number.isFinite(rs) ? rs : null,
        runsAllowed: Number.isFinite(ra) ? ra : null,
        runDiff: Number.isFinite(rd) ? rd : null,
      });
    }
  }
  return byTeamId;
}

/**
 * Savant pitcher xStats indexed by full-name + last-name key => { era, xera }.
 * The Savant expected-statistics CSV carries BOTH actual season `era` and
 * expected `xera` in the SAME row, so the board gets xERA for free from the
 * fetch that already grounds ERA. xera is null when the CSV row lacks it
 * (never fabricated). Keyed on era presence — a pitcher with no era is skipped.
 */
function indexPitcherEraByName(pitcherX) {
  const map = new Map();
  for (const r of pitcherX || []) {
    const era = Number(r?.era);
    if (!Number.isFinite(era)) continue;
    const xeraNum = Number(r?.xera);
    const rec = { era, xera: null }; // xERA OFF app-wide (Aug 10)
    const last = r?.last_name || '';
    const first = r?.first_name || '';
    if (last) {
      map.set(nameKey(`${first} ${last}`), rec);
      if (!map.has(nameKey(last))) map.set(nameKey(last), rec);
    } else if (r?.name) {
      map.set(nameKey(r.name), rec);
    }
  }
  return map;
}
/** => { era, xera } for a pitcher name (xera null when unavailable), or null. */
function statsForName(fullName, eraByName) {
  if (!fullName) return null;
  const e = eraByName.get(nameKey(fullName));
  if (e) return e;
  const e2 = eraByName.get(lastNameKey(fullName));
  return e2 || null;
}

/**
 * Grounded current MLB LEAGUE-AVERAGE ERA / xERA, derived from the SAME Savant
 * pitcher xStats corpus the starters lane already fetches — a plate-appearance-
 * WEIGHTED mean (weighting by `pa` approximates innings, so workhorse starters
 * count fully and tiny-sample relievers can't distort the average up). Used by
 * the iOS to color each pitcher's ERA/xERA relative to league (below = good).
 * GROUNDED: null when the corpus is empty; never a hardcoded constant.
 * => { league_avg_era: number|null, league_avg_xera: number|null }
 */
function computeLeagueAvgEra(pitcherX) {
  let eraW = 0, eraPa = 0;
  let xeraW = 0, xeraPa = 0;
  for (const r of pitcherX || []) {
    const pa = Number(r?.pa);
    const w = Number.isFinite(pa) && pa > 0 ? pa : 1; // unweighted fallback if pa absent
    const era = Number(r?.era);
    if (Number.isFinite(era)) { eraW += era * w; eraPa += w; }
    const xera = Number(r?.xera);
    if (Number.isFinite(xera)) { xeraW += xera * w; xeraPa += w; }
  }
  return {
    league_avg_era: eraPa > 0 ? Number((eraW / eraPa).toFixed(2)) : null,
    league_avg_xera: null, // xERA OFF app-wide (founder ruling, Aug 10)
  };
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
  // Non-franchise events (the All-Star Game rides BDL with UNK teams) would
  // render "Unknown @ Unknown" on the Tomorrow tab — drop any row whose team
  // names never resolved; dedicated surfaces cover those events. Recount
  // byLeague so the published game_count matches what actually shows.
  const named = board.filter(r =>
    r.away_team && r.home_team && r.away_team !== 'Unknown' && r.home_team !== 'Unknown');
  for (const lg of Object.keys(byLeague)) {
    const n = named.filter(r => r.league === lg).length;
    if (n) byLeague[lg] = n; else delete byLeague[lg];
  }
  // Doubleheader-safe (Jul 22 2026, founder-directed): commence_time is part
  // of a game's identity — a same-matchup doubleheader is TWO board rows.
  // Only exact duplicates (an odds feed emitting the same game twice)
  // collapse here. Rows carry bdl_game_id via dailySlateService.buildLeagueRows.
  const deduped = Object.values(
    named.reduce((acc, r) => {
      const k = `${r.league}|${r.away_team}|${r.home_team}|${r.commence_time}`;
      if (!acc[k]) acc[k] = r;
      return acc;
    }, {}),
  );
  return { rows: deduped, byLeague };
}

/* ──────────────────────── 2. PROBABLE STARTERS (MLB only) ───────────────── */

async function buildStarters(etDateStr, teamIndex, eraByName) {
  const starters = [];
  // Per MLB matchup (keyed "awayAbbr|homeAbbr"): ace label + both-aces flag
  // for the big-games ACE hook, built from the SAME schedule read.
  // Doubleheader-safe (Jul 22 2026): the value is an ARRAY of per-GAME
  // entries, each time-stamped — consumers pick the entry nearest their own
  // row's start time, so game 2's arms never wear game 1's card.
  const acesByGame = new Map();      // "AWY|HOM" -> [{ t, label, both }]
  // Same array shape: BOTH probable starters' last names per GAME =>
  // { t, away, home }. "Undecided" when a side has no posted probable
  // (never blank, never fabricated).
  const pitchersByGame = new Map();  // "AWY|HOM" -> [{ t, away, home }]

  // MLB — every named probable pitcher, both sides, all games.
  try {
    const sched = await getMlbSchedule(etDateStr);
    for (const g of sched || []) {
      const awayName = g?.teams?.away?.team?.name;
      const homeName = g?.teams?.home?.team?.name;
      // Game-level matchup label (abbreviations), built once per game so every
      // starter in it knows which game it's pitching tomorrow (e.g. "HOU @ DET").
      const awayAbbrG = abbrFor(awayName, teamIndex);
      const homeAbbrG = abbrFor(homeName, teamIndex);
      const gameLabel = awayAbbrG && homeAbbrG ? `${awayAbbrG} @ ${homeAbbrG}` : null;
      const gameAces = []; // { lastName, era }
      // Both probable starters' last names, "Undecided" when a side has no
      // posted probable (captured BEFORE the no-name continue below).
      const gamePitchers = { away: 'Undecided', home: 'Undecided' };
      for (const side of ['away', 'home']) {
        const t = g?.teams?.[side];
        const name = t?.probablePitcher?.fullName;
        if (name) gamePitchers[side] = lastNameOf(name);
        if (!name) continue;
        const abbr = abbrFor(t?.team?.name, teamIndex) || '';
        const oppAbbr = side === 'away' ? homeAbbrG : awayAbbrG;
        const home = side === 'home';
        const stats = statsForName(name, eraByName);
        const era = stats?.era ?? null;
        // xERA OFF app-wide (founder ruling, Aug 10) — the field stays in
        // the payload as null so no iOS build is required to go dark.
        const xera = null;
        const detail = era != null ? `${abbr} ${era.toFixed(2)}` : abbr;
        starters.push({
          league: 'MLB',
          name: abbrevName(name),
          full_name: name,              // un-abbreviated (scout-extras id resolution)
          person_id: t?.probablePitcher?.id ?? null, // exact MLB id; avoids fragile name joins
          team: abbr,
          abbr,                         // explicit alias (iOS gold team-name source)
          era,                          // number | null
          xera,                         // number | null (never fabricated)
          game: gameLabel,              // "HOU @ DET" | null
          // Game identity (Jul 22 2026, doubleheader-safe): which GAME this
          // arm starts. Readers select starters BY GAME, never by team alone
          // — a doubleheader puts two same-team arms on one date, and picking
          // by abbr is a coin flip between them (the Max Fried mixup).
          game_time: g?.gameDate ?? null,     // ISO first pitch
          game_number: g?.gameNumber ?? null, // 1 | 2 within the day
          game_pk: g?.gamePk ?? null,         // MLB statsapi game id
          opponent: oppAbbr || null,    // opposing team abbr | null
          home,                         // pitching at home?
          detail,                       // legacy "HOU 4.03" string (kept for back-compat)
        });
        if (era != null && era <= ACE_ERA) {
          const last = lastNameOf(name);
          gameAces.push({ lastName: last, era });
        }
      }
      // Both-pitchers map for the big-games card — keyed by abbreviations so
      // the slate (nicknames) and schedule (full names) resolve to the same
      // matchup; entries are per-GAME (time-stamped array) so a doubleheader
      // holds both games. Stored for EVERY game (unlike aces, which gate on ERA).
      const gameT = Date.parse(g?.gameDate) || null;
      if (awayName && homeName) {
        const aAbbr = abbrFor(awayName, teamIndex);
        const hAbbr = abbrFor(homeName, teamIndex);
        const key = `${aAbbr}|${hAbbr}`;
        const list = pitchersByGame.get(key) || [];
        list.push({ t: gameT, away: gamePitchers.away, home: gamePitchers.home });
        pitchersByGame.set(key, list);
      }
      if (gameAces.length && awayName && homeName) {
        gameAces.sort((a, b) => a.era - b.era);
        const aAbbr = abbrFor(awayName, teamIndex);
        const hAbbr = abbrFor(homeName, teamIndex);
        const key = `${aAbbr}|${hAbbr}`;
        const list = acesByGame.get(key) || [];
        list.push({ t: gameT, label: gameAces.map((a) => a.lastName).join(' vs '), both: gameAces.length >= 2 });
        acesByGame.set(key, list);
      }
    }
  } catch (e) {
    console.warn(`[TomorrowBoard] MLB starters fetch failed: ${e.message}`);
  }

  return { starters, acesByGame, pitchersByGame };
}

/* ────────────────── 2c. SCOUT EXTRAS (last outing · vs opp · series) ─────────────────
 * The Picks-page scouting report's bettor lanes (founder, Jul 7): what did each
 * probable do LAST time out, how has he fared against TONIGHT's opponent this
 * season, and the season series between the clubs with the venue split + the
 * last three meetings. All grounded from BDL box scores + the season game
 * index; every field is omitted (never guessed) when its source is short.
 */

const MONTHS_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function scoutShortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${MONTHS_ABBR[mo - 1]} ${Number(m[3])}`;
}
/** BDL ip notation ("5.2" = 5 innings 2 outs) -> total outs. */
function scoutIpOuts(v) {
  const s = String(v ?? '');
  const m = /^(\d+)(?:\.(\d))?$/.exec(s);
  if (!m) return 0;
  return Number(m[1]) * 3 + Number(m[2] || 0);
}
function scoutOutsToIp(outs) { return `${Math.trunc(outs / 3)}.${outs % 3}`; }
/** Whole days from one ISO date to another (date parts only). */
function scoutDayDiff(fromIso, toIso) {
  const m1 = /^(\d{4}-\d{2}-\d{2})/.exec(String(fromIso || ''));
  const m2 = /^(\d{4}-\d{2}-\d{2})/.exec(String(toIso || ''));
  if (!m1 || !m2) return null;
  const a = new Date(`${m1[1]}T00:00:00Z`).getTime();
  const b = new Date(`${m2[1]}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

// Short ballpark names for the meetings rows ("at Busch"). Curated,
// unambiguous parks only — anything absent falls back to the home team's
// abbreviation ("at TB"), never a guessed name.
const PARK_SHORT = {
  MIL: 'AmFam', STL: 'Busch', NYY: 'Yankee', NYM: 'Citi', BOS: 'Fenway',
  CHC: 'Wrigley', LAD: 'Dodger', SF: 'Oracle', SD: 'Petco', ATL: 'Truist',
  PIT: 'PNC', BAL: 'Camden', DET: 'Comerica', KC: 'Kauffman', SEA: 'T-Mobile',
  MIN: 'Target', COL: 'Coors', CIN: 'GABP', TEX: 'Globe Life', TOR: 'Rogers',
  CLE: 'Progressive', MIA: 'loanDepot', LAA: 'Angel', AZ: 'Chase', ARI: 'Chase',
  HOU: 'Daikin', CWS: 'Rate', CHW: 'Rate',
};
function parkShort(homeAbbr) {
  return PARK_SHORT[String(homeAbbr || '').toUpperCase()] || homeAbbr || '?';
}

/**
 * BDL team maps — the season game index and per-player game rows carry BDL
 * team ids (a DIFFERENT id space from teamIndex's MLB-Stats-API ids), so the
 * scout lanes join through BDL's own teams read.
 */
async function bdlTeamMaps() {
  const teams = await bdl.getTeams('baseball_mlb');
  const list = Array.isArray(teams) ? teams : (teams?.data || []);
  const idByAbbr = new Map();
  const abbrById = new Map();
  for (const t of list) {
    const ab = t?.abbreviation || t?.abbr;
    if (t?.id == null || !ab) continue;
    idByAbbr.set(String(ab).toUpperCase(), t.id);
    abbrById.set(t.id, String(ab).toUpperCase());
  }
  return { idByAbbr, abbrById };
}

/** Resolve a probable's BDL player id by full name (+ team when it can). */
async function resolvePitcherBdlId(fullName, teamId) {
  const last = lastNameOf(fullName);
  if (!last) return null;
  const searches = [...new Set([last, playerNameWithoutSuffix(fullName)].filter(Boolean))];
  const found = await Promise.all(searches.map(async (search) => {
    const res = await bdl.getPlayersGeneric('baseball_mlb', { search, per_page: 100 });
    return Array.isArray(res) ? res : (res?.data || []);
  }));
  const players = [...new Map(found.flat().filter((p) => p?.id != null).map((p) => [p.id, p])).values()];
  if (!players.length) return null;
  const want = playerNameKey(fullName);
  const byName = players.filter((p) => {
    const full = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
    return playerNameKey(full) === want;
  });
  if (byName.length === 1) return byName[0].id;
  if (byName.length > 1 && teamId != null) {
    const onTeam = byName.find((p) => (p.team?.id ?? p.team_id) === teamId);
    if (onTeam) return onTeam.id;
  }
  if (byName.length > 1) return byName[0].id;
  // No exact full-name hit — same last name + the right team is still safe.
  if (teamId != null) {
    const teamHits = players.filter((p) =>
      lastNameKey(p.last_name || '') === lastNameKey(last) && (p.team?.id ?? p.team_id) === teamId);
    if (teamHits.length === 1) return teamHits[0].id;
  }
  // Trades and provider roster lag can make the team id stale. A unique
  // suffix-aware surname hit is still safer than dropping the whole game log.
  const lastHits = players.filter((p) => lastNameKey(p.last_name || '') === lastNameKey(last));
  if (lastHits.length === 1) return lastHits[0].id;
  return null;
}

/** Apply official MLB Stats API start rows to a starter in the board shape. */
function attachOfficialStartRows(st, starts, etDateStr, teamIndex) {
  if (!Array.isArray(starts) || !starts.length) return false;
  const last = starts[starts.length - 1];
  const outs = scoutIpOuts(last.ip);
  st.last_outing = {
    ip: scoutOutsToIp(outs),
    er: Number(last.er) || 0,
    k: Number(last.k) || 0,
    opp: abbrFor(last.opponent, teamIndex) || last.opponent || null,
    at: last.isHome == null ? null : (last.isHome ? 'vs' : 'at'),
    date: scoutShortDate(last.date),
  };
  const restDiff = scoutDayDiff(last.date, etDateStr);
  if (restDiff != null && restDiff >= 1) st.rest = { days: restDiff - 1 };

  const l3rows = starts.slice(-3);
  if (l3rows.length >= 2) {
    let l3o = 0; let l3er = 0; let l3k = 0;
    for (const r of l3rows) {
      l3o += scoutIpOuts(r.ip);
      l3er += Number(r.er) || 0;
      l3k += Number(r.k) || 0;
    }
    st.l3 = { gs: l3rows.length, ip: scoutOutsToIp(l3o), er: l3er, k: l3k };
  }

  const qsWin = starts.slice(-5)
    .map((r) => scoutIpOuts(r.ip) >= 18 && (Number(r.er) || 0) <= 3);
  let qsStreak = 0;
  for (let i = qsWin.length - 1; i >= 0; i--) {
    if (qsWin[i]) qsStreak += 1; else break;
  }
  st.qs_form = {
    streak: qsStreak,
    qs: qsWin.filter(Boolean).length,
    window: qsWin.length,
  };

  const vs = starts.filter((r) => abbrFor(r.opponent, teamIndex) === st.opponent);
  if (vs.length) {
    let vOuts = 0; let vEr = 0;
    for (const r of vs) { vOuts += scoutIpOuts(r.ip); vEr += Number(r.er) || 0; }
    st.vs_opp = {
      gs: vs.length,
      ip: scoutOutsToIp(vOuts),
      er: vEr,
      era: vOuts > 0 ? Number(((vEr * 27) / vOuts).toFixed(2)) : null,
    };
  }
  return true;
}

/**
 * Attach { last_outing, vs_opp } to each MLB starter row IN PLACE.
 * last_outing = his most recent regular-season START (never relief);
 * vs_opp = this season's starts against tonight's opponent, aggregated.
 */
async function enrichStartersWithOutings(starters, etDateStr, teamIndex) {
  let idByAbbr = new Map();
  let abbrById = new Map();
  try {
    ({ idByAbbr, abbrById } = await bdlTeamMaps());
  } catch (e) {
    // Official MLB ids/logs below do not need BDL. A BDL teams outage must not
    // prevent those primary enrichments from filling the starter cards.
    console.warn(`[TomorrowBoard] BDL team map unavailable for outing fallback: ${e.message}`);
  }
  const mlb = starters.filter((st) => st.league === 'MLB' && (st.full_name || st.name));
  const CHUNK = 4;
  for (let i = 0; i < mlb.length; i += CHUNK) {
    await Promise.all(mlb.slice(i, i + CHUNK).map(async (st) => {
      try {
        // The schedule already supplies MLB's exact person id. Its official
        // game log is the primary source, so punctuation, suffixes, trades and
        // third-party roster lag cannot leave one side of the matchup empty.
        if (st.person_id != null) {
          try {
            const official = await getPitcherLastStarts(st.person_id, SEASON, 50);
            if (attachOfficialStartRows(st, official, etDateStr, teamIndex)) return;
            console.warn(`[TomorrowBoard] official start log empty for ${st.full_name || st.name}; trying BDL`);
          } catch (e) {
            console.warn(`[TomorrowBoard] official start log failed for ${st.full_name || st.name}: ${e.message}; trying BDL`);
          }
        }
        const teamId = idByAbbr.get(String(st.team || '').toUpperCase()) ?? null;
        const pid = await resolvePitcherBdlId(st.full_name || st.name, teamId);
        if (!pid) {
          console.warn(`[TomorrowBoard] no stats id for ${st.full_name || st.name}`);
          return;
        }
        const rows = await bdl.getMlbPlayerGameRowsChrono(pid, SEASON);
        const startRows = (rows || []).filter((r) => Number(r.games_started) > 0);
        if (!startRows.length) {
          console.warn(`[TomorrowBoard] no completed starts for ${st.full_name || st.name}`);
          return;
        }
        const last = startRows[startRows.length - 1];
        const outs = scoutIpOuts(last.ip);
        let oppAbbr = null;
        let atHome = null;
        if (teamId != null && last._game) {
          atHome = last._game.homeId === teamId;
          const oppId = atHome ? last._game.awayId : last._game.homeId;
          oppAbbr = abbrById.get(oppId) ?? null;
        }
        st.last_outing = {
          ip: scoutOutsToIp(outs),
          er: Number(last.er) || 0,
          k: Number(last.p_k) || 0,
          opp: oppAbbr,
          at: atHome == null ? null : (atHome ? 'vs' : 'at'),
          date: scoutShortDate(last._game?.date),
        };
        // REST — days between his last start and THIS game day, minus one
        // (pitched Jul 2, starts Jul 7 => "4 days' rest", the standard usage).
        const restDiff = scoutDayDiff(last._game?.date, etDateStr);
        if (restDiff != null && restDiff >= 1) st.rest = { days: restDiff - 1 };
        // LAST 3 (or 2) starts, aggregated — omitted with fewer than 2 starts
        // (a single start would just echo LAST OUTING).
        const l3rows = startRows.slice(-3);
        if (l3rows.length >= 2) {
          let l3o = 0; let l3er = 0; let l3k = 0;
          for (const r of l3rows) {
            l3o += scoutIpOuts(r.ip);
            l3er += Number(r.er) || 0;
            l3k += Number(r.p_k) || 0;
          }
          st.l3 = { gs: l3rows.length, ip: scoutOutsToIp(l3o), er: l3er, k: l3k };
        }
        // Quality-start form over his last (up to) 5 starts — the name-row
        // tag ("3 STRAIGHT QS" / "1 QS IN LAST 4"). Standard QS: 6+ IP, <=3 ER.
        const qsWin = startRows.slice(-5)
          .map((r) => scoutIpOuts(r.ip) >= 18 && (Number(r.er) || 0) <= 3);
        let qsStreak = 0;
        for (let qi = qsWin.length - 1; qi >= 0; qi--) {
          if (qsWin[qi]) qsStreak += 1; else break;
        }
        st.qs_form = {
          streak: qsStreak,
          qs: qsWin.filter(Boolean).length,
          window: qsWin.length,
        };
        const oppTonightId = idByAbbr.get(String(st.opponent || '').toUpperCase());
        if (oppTonightId != null) {
          const vs = startRows.filter((r) => r._game
            && (r._game.homeId === oppTonightId || r._game.awayId === oppTonightId));
          if (vs.length) {
            let vOuts = 0; let vEr = 0;
            for (const r of vs) { vOuts += scoutIpOuts(r.ip); vEr += Number(r.er) || 0; }
            st.vs_opp = {
              gs: vs.length,
              ip: scoutOutsToIp(vOuts),
              er: vEr,
              era: vOuts > 0 ? Number(((vEr * 27) / vOuts).toFixed(2)) : null,
            };
          }
        }
      } catch (e) {
        console.warn(`[TomorrowBoard] outing enrich failed for ${st.name}: ${e.message}`);
      }
    }));
  }
}

/**
 * Attach `series` to each MLB board row IN PLACE: this season's finished
 * meetings between the two clubs — record (from tonight's AWAY side's
 * perspective), the leader's venue split, and the last three meetings.
 */
async function attachSeriesToBoard(board) {
  const mlbRows = board.filter((r) => r.league === 'MLB' && r.away_abbr && r.home_abbr);
  if (!mlbRows.length) return;
  const { idByAbbr, abbrById } = await bdlTeamMaps();
  const index = await bdl.getMlbSeasonGameIndex(SEASON);
  for (const r of mlbRows) {
    const aId = idByAbbr.get(String(r.away_abbr).toUpperCase());
    const hId = idByAbbr.get(String(r.home_abbr).toUpperCase());
    if (aId == null || hId == null) continue;
    const games = [];
    for (const g of index.values()) {
      if (g.status !== 'STATUS_FINAL' || g.seasonType === 'spring_training' || g.postseason) continue;
      const pair = (g.homeId === aId && g.awayId === hId) || (g.homeId === hId && g.awayId === aId);
      if (!pair) continue;
      if (g.homeRuns == null || g.awayRuns == null || g.homeRuns === g.awayRuns) continue;
      games.push(g);
    }
    if (!games.length) continue;
    games.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let awayW = 0; let homeW = 0;
    const perGame = games.map((g) => {
      const awayRuns = g.homeId === aId ? g.homeRuns : g.awayRuns; // tonight's away side
      const homeRuns = g.homeId === aId ? g.awayRuns : g.homeRuns;
      const awayWon = awayRuns > homeRuns;
      if (awayWon) awayW += 1; else homeW += 1;
      return { g, awayRuns, homeRuns, awayWon };
    });
    const leaderIsAway = awayW >= homeW;
    const parks = new Map(); // park (home team's abbr) -> leader's {w, l} there
    for (const pg of perGame) {
      const parkAbbr = abbrById.get(pg.g.homeId) || '?';
      const leaderWon = leaderIsAway ? pg.awayWon : !pg.awayWon;
      const cur = parks.get(parkAbbr) || { w: 0, l: 0 };
      if (leaderWon) cur.w += 1; else cur.l += 1;
      parks.set(parkAbbr, cur);
    }
    const split_line = [...parks.entries()]
      .map(([abbr, rec]) => `${rec.w}-${rec.l} AT ${parkShort(abbr).toUpperCase()}`)
      .join(' · ');
    const meetings = perGame.slice(-3).reverse().map((pg) => ({
      d: scoutShortDate(pg.g.date),
      line: `${r.away_abbr} ${pg.awayRuns} · ${r.home_abbr} ${pg.homeRuns}`,
      venue: `at ${parkShort(abbrById.get(pg.g.homeId))}`,
      won: pg.awayWon ? 'away' : 'home',
    }));
    r.series = {
      away_w: awayW,
      home_w: homeW,
      leader: leaderIsAway ? 'away' : 'home',
      split_line,
      meetings,
    };
  }
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

/* ──────── 3b. EXTRA TABBED LANES (FORM · RUN PROFILE · WEATHER) ──────────── */

/**
 * Build the distinct MLB teams playing tomorrow from the slate rows, each as
 * { team (full name), abbr, id, opp (full name), home (bool) }. One entry per
 * team per appearance (a team in a doubleheader shows once after slate de-dupe).
 */
function slateTeamsMlb(board, teamIndex, idByName) {
  const out = [];
  const seen = new Set();
  for (const row of board) {
    if (row.league !== 'MLB') continue;
    for (const [team, opp, home] of [
      [row.away_team, row.home_team, false],
      [row.home_team, row.away_team, true],
    ]) {
      const id = idByName.get(nameKey(team));
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      out.push({ team, abbr: abbrFor(team, teamIndex), id, opp, home });
    }
  }
  return out;
}

/**
 * FORM — each MLB team's last-10 (W-L) + current streak, straight from standings
 * (records.splitRecords lastTen + streak.streakCode). GROUNDED: a team is omitted
 * when its L10 split is absent. l10 is a "W-L" string; streak is "W3"/"L1" (null
 * when none). Grouped by league for the iOS tab.
 */
function buildForm(mlbTeams, standings) {
  const mlb = [];
  for (const t of mlbTeams) {
    const st = standings.get(t.id);
    if (!st || st.l10W == null || st.l10L == null) continue; // grounded-only
    mlb.push({
      league: 'MLB',
      team: t.team,
      abbr: t.abbr,
      l10: `${st.l10W}-${st.l10L}`,
      streak: st.streakCode || null,
      home: t.home,
    });
  }
  return mlb;
}

const RECENT_METRICS_DAYS = 14;
const RECENT_METRICS_BATCH = 25;

/** MLB/BDL innings use baseball thirds ("1.2" = five outs), not decimals. */
function ipOuts(ip) {
  const n = Number(ip);
  if (!Number.isFinite(n) || n < 0) return 0;
  const whole = Math.trunc(n);
  const thirds = Math.round((n - whole) * 10);
  return thirds >= 0 && thirds <= 2 ? whole * 3 + thirds : 0;
}

/**
 * Recent team facts for THE BIG NUMBERS.
 *
 * One season-index read supplies completed-game dates and scores. BDL box rows
 * then ground the two facts scores alone cannot provide: team homers and the
 * relief staff's earned runs/outs. The windows stop before `etDateStr`, so a
 * morning card remains the same card all day as tonight's games go live.
 *
 * Returns a map keyed by MLB abbreviation. A metric is omitted unless its
 * whole advertised window is present; partial API data never becomes a number.
 */
export async function buildRecentTeamMetrics(mlbTeams, etDateStr) {
  const anchor = new Date(`${etDateStr}T12:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return new Map();
  const shiftedDay = (days) => {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const start14Day = shiftedDay(-RECENT_METRICS_DAYS);
  const earliestDay = shiftedDay(-50);

  const [seasonIndex, bdlTeams] = await Promise.all([
    bdl.getMlbSeasonGameIndex(SEASON),
    bdl.getTeams('baseball_mlb'),
  ]);
  if (!seasonIndex?.size || !bdlTeams?.length) return new Map();

  const bdlByAbbr = new Map(
    bdlTeams
      .filter((t) => t?.id != null && t?.abbreviation)
      .map((t) => [String(t.abbreviation).toUpperCase(), t]),
  );
  // The odds/slate feed uses the franchise's current display codes while BDL
  // retains MLB's legacy API codes for these two clubs.
  const bdlAbbr = (abbr) => ({ AZ: 'ARI', ATH: 'OAK' }[String(abbr || '').toUpperCase()]
    || String(abbr || '').toUpperCase());
  const targets = mlbTeams
    .map((t) => ({ slate: t, bdl: bdlByAbbr.get(bdlAbbr(t.abbr)) }))
    .filter((t) => t.bdl?.id != null);
  if (!targets.length) return new Map();

  const gamesByTeam = new Map(targets.map((t) => [String(t.bdl.id), []]));
  for (const [gameId, g] of seasonIndex) {
    const played = Date.parse(g?.date || '');
    if (!Number.isFinite(played)) continue;
    // BDL timestamps are UTC; slate ownership is ET. A 10:10 PM ET West Coast
    // final lands after midnight UTC but still belongs to the previous ET day.
    const playedDay = getETDateStr(new Date(played));
    if (playedDay >= etDateStr || playedDay < earliestDay) continue;
    if (g?.status !== 'STATUS_FINAL' || g?.seasonType === 'spring_training' || g?.postseason) continue;
    for (const [teamId, mine, theirs] of [
      [g.homeId, g.homeRuns, g.awayRuns],
      [g.awayId, g.awayRuns, g.homeRuns],
    ]) {
      const bucket = gamesByTeam.get(String(teamId));
      if (!bucket || !Number.isFinite(Number(mine)) || !Number.isFinite(Number(theirs))) continue;
      bucket.push({ id: gameId, played, playedDay, mine: Number(mine), theirs: Number(theirs) });
    }
  }
  for (const games of gamesByTeam.values()) games.sort((a, b) => a.played - b.played);

  const neededIds = new Set();
  for (const games of gamesByTeam.values()) {
    for (const g of games.slice(-5)) neededIds.add(g.id);
    for (const g of games.filter((x) => x.playedDay >= start14Day)) neededIds.add(g.id);
  }

  // Keep each query comfortably below getMlbGameStats' 1,000-row safety cap.
  // Three batches at a time is fast without bursting the upstream API.
  const ids = [...neededIds];
  const batches = [];
  for (let i = 0; i < ids.length; i += RECENT_METRICS_BATCH) {
    batches.push(ids.slice(i, i + RECENT_METRICS_BATCH));
  }
  const statRows = [];
  for (let i = 0; i < batches.length; i += 3) {
    const page = await Promise.all(
      batches.slice(i, i + 3).map((gameIds) => bdl.getMlbGameStats({ gameIds })),
    );
    for (const rows of page) statRows.push(...(rows || []));
  }
  const statsByGame = new Map();
  for (const r of statRows) {
    if (!statsByGame.has(r.game_id)) statsByGame.set(r.game_id, []);
    statsByGame.get(r.game_id).push(r);
  }

  const out = new Map();
  for (const { slate, bdl: team } of targets) {
    const games = gamesByTeam.get(String(team.id)) || [];
    const teamKeys = new Set([
      team.display_name, team.short_display_name, team.name,
      team.location && team.name ? `${team.location} ${team.name}` : null,
    ].filter(Boolean).map(nameKey));
    const rowsFor = (gameId) => (statsByGame.get(gameId) || [])
      .filter((r) => teamKeys.has(nameKey(r.team_name)));

    const last5 = games.slice(-5);
    const last10 = games.slice(-10);
    const last14Days = games.filter((g) => g.playedDay >= start14Day);
    const fiveCovered = last5.length === 5 && last5.every((g) =>
      rowsFor(g.id).some((r) => r.at_bats != null));
    const penCovered = last14Days.length > 0 && last14Days.every((g) =>
      rowsFor(g.id).some((r) => ipOuts(r.ip) > 0));

    let homeRunsL5 = null;
    if (fiveCovered) {
      homeRunsL5 = last5.reduce((sum, g) =>
        sum + rowsFor(g.id).reduce((s, r) => s + (Number(r.hr) || 0), 0), 0);
    }

    let bullpenOuts = 0;
    let bullpenEr = 0;
    if (penCovered) {
      for (const g of last14Days) {
        for (const r of rowsFor(g.id)) {
          if (Number(r.games_started) === 1) continue;
          const outs = ipOuts(r.ip);
          if (outs <= 0) continue;
          bullpenOuts += outs;
          bullpenEr += Number(r.er) || 0;
        }
      }
    }

    out.set(String(slate.abbr || '').toUpperCase(), {
      home_runs_l5: homeRunsL5,
      bullpen_era_l14: bullpenOuts > 0
        ? Number(((bullpenEr * 27) / bullpenOuts).toFixed(2))
        : null,
      run_diff_l10: last10.length === 10
        ? last10.reduce((sum, g) => sum + g.mine - g.theirs, 0)
        : null,
    });
  }
  return out;
}

/**
 * RUN PROFILE — the grounded, day-before scoring/run-prevention shape for each MLB
 * team (the honest stand-in for an "over/under trend": game_results stores no
 * betting total to compute a real O/U record from, so we never fabricate one).
 * Season runs scored / allowed / differential + per-game rates, straight from
 * standings (runsScored / runsAllowed / runDifferential / wins+losses). GROUNDED:
 * a team is omitted when its run totals are absent.
 */
function buildRunProfile(mlbTeams, standings, recentMetrics = new Map()) {
  const mlb = [];
  for (const t of mlbTeams) {
    const st = standings.get(t.id);
    const recent = recentMetrics.get(String(t.abbr || '').toUpperCase()) || {};
    const hasSeason = st?.runsScored != null && st?.runsAllowed != null;
    const hasRecent = Object.values(recent).some((v) => v != null);
    if (!hasSeason && !hasRecent) continue; // grounded-only
    const gp = hasSeason ? (Number(st.wins) || 0) + (Number(st.losses) || 0) : 0;
    const rsg = gp > 0 ? st.runsScored / gp : null; // runs scored / game
    const rag = gp > 0 ? st.runsAllowed / gp : null; // runs allowed / game
    mlb.push({
      league: 'MLB',
      team: t.team,
      abbr: t.abbr,
      runs_scored: hasSeason ? st.runsScored : null,
      runs_allowed: hasSeason ? st.runsAllowed : null,
      run_diff: hasSeason ? (st.runDiff != null ? st.runDiff : (st.runsScored - st.runsAllowed)) : null,
      rs_per_game: rsg != null ? Number(rsg.toFixed(2)) : null,
      ra_per_game: rag != null ? Number(rag.toFixed(2)) : null,
      home: t.home,
      ...recent,
    });
  }
  return mlb;
}

/* ──── WEATHER (outdoor MLB, day-before forecast via Open-Meteo) ──────────── */

// Domed / retractable-roof MLB parks — closed/controlled, so the open-air forecast
// never reaches the field. Static fact set (like RIVALRY_PAIRS); skip these games.
const ROOFED_PARKS = new Set([
  'tropicana field',          // Rays (fixed)
  'rogers centre',            // Blue Jays (retractable)
  'chase field',              // Diamondbacks (retractable)
  'minute maid park',         // Astros (retractable) — also "daikin park"
  'daikin park',
  'globe life field',         // Rangers (retractable)
  'american family field',    // Brewers (retractable)
  't-mobile park',            // Mariners (retractable)
  'loandepot park',           // Marlins (retractable)
  'loandepot park ',
]);
function isRoofedPark(name) {
  return ROOFED_PARKS.has(nameKey(name).replace(/\s+/g, ' ').trim());
}

const WEATHER_TEMP_HOT = 88;   // °F — "ball carries" note
const WEATHER_TEMP_COLD = 50;  // °F — "heavy air" note
const WEATHER_WIND_MIN = 12;   // mph — wind "in play"
const WEATHER_RAIN_PCT = 40;   // % — rain watch

/**
 * WEATHER — first-pitch forecast for tomorrow's OUTDOOR MLB games, via Open-Meteo
 * (free, key-less, day-before-available forecast source). Each game's venue
 * lat/lon comes from the MLB Stats API venue feed; the
 * hourly forecast is read at the game's UTC start hour. GROUNDED: domed/closed
 * parks are skipped, and a game with no resolvable coords or forecast is omitted —
 * never a fabricated reading. Each row carries temp_f / wind_mph / precip_pct + a
 * short plain-text `note` for the single most notable factor (or null when calm).
 */
async function buildWeather(schedule, etDateStr, teamIndex) {
  const rows = [];
  const venueCache = new Map(); // venueId -> {lat, lon, name}
  for (const g of schedule || []) {
    try {
      const iso = g?.gameDate;
      if (!iso) continue;
      const start = new Date(iso);
      if (Number.isNaN(start.getTime()) || getETDateStr(start) !== etDateStr) continue;

      const venueName = g?.venue?.name || null;
      if (isRoofedPark(venueName)) continue; // domed/closed — forecast is moot

      const coords = await venueCoords(g?.venue?.id, venueCache);
      if (!coords) continue;
      // Roof flag from the venue feed is the authoritative skip when present.
      if (coords.roofType && /dome|retractable|closed|indoor/i.test(coords.roofType)) continue;

      const hourKey = iso.slice(0, 13); // "2026-06-27T23" (UTC, matches Open-Meteo GMT)
      const dateKey = iso.slice(0, 10);
      const fc = await openMeteoHour(coords.lat, coords.lon, dateKey, hourKey);
      if (!fc) continue;

      const { temp, wind, precip } = fc;
      const awayName = g?.teams?.away?.team?.name;
      const homeName = g?.teams?.home?.team?.name;

      // Single most notable plain-text note (rain > heat > wind > cold), or null.
      let note = null;
      if (Number.isFinite(precip) && precip >= WEATHER_RAIN_PCT) note = `${Math.round(precip)}% rain`;
      else if (Number.isFinite(temp) && temp >= WEATHER_TEMP_HOT) note = `${Math.round(temp)}° — ball carries`;
      else if (Number.isFinite(wind) && wind >= WEATHER_WIND_MIN) note = `${Math.round(wind)} mph wind`;
      else if (Number.isFinite(temp) && temp <= WEATHER_TEMP_COLD) note = `${Math.round(temp)}° — heavy air`;

      rows.push({
        league: 'MLB',
        matchup: awayName && homeName ? `${awayName} @ ${homeName}` : null,
        away_abbr: abbrFor(awayName, teamIndex),
        home_abbr: abbrFor(homeName, teamIndex),
        venue: venueName,
        temp_f: Number.isFinite(temp) ? Math.round(temp) : null,
        wind_mph: Number.isFinite(wind) ? Math.round(wind) : null,
        precip_pct: Number.isFinite(precip) ? Math.round(precip) : null,
        note,
        commence_time: iso,
      });
    } catch (e) {
      console.warn(`[TomorrowBoard] weather game skipped: ${e.message}`);
    }
  }
  return rows;
}

/** MLB venue lat/lon (+ roofType) from the Stats API venue feed; cached per id. Never throws. */
async function venueCoords(venueId, cache) {
  if (venueId == null) return null;
  if (cache.has(venueId)) return cache.get(venueId);
  let result = null;
  try {
    const { data } = await axios.get(
      `https://statsapi.mlb.com/api/v1/venues/${venueId}?hydrate=location`,
      { timeout: 8000 },
    );
    const v = data?.venues?.[0];
    const lat = Number(v?.location?.defaultCoordinates?.latitude);
    const lon = Number(v?.location?.defaultCoordinates?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      result = { lat, lon, name: v?.name || null, roofType: v?.roofType || null };
    }
  } catch (e) {
    console.warn(`[TomorrowBoard] venue ${venueId} coords failed: ${e.message}`);
  }
  cache.set(venueId, result);
  return result;
}

/** Open-Meteo hourly forecast at a UTC hour key -> { temp, wind, precip } or null. Never throws. */
async function openMeteoHour(lat, lon, dateKey, hourKey) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + '&hourly=temperature_2m,precipitation_probability,wind_speed_10m'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=GMT'
      + `&start_date=${dateKey}&end_date=${dateKey}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    const times = data?.hourly?.time;
    if (!Array.isArray(times)) return null;
    const i = times.findIndex((t) => String(t).slice(0, 13) === hourKey);
    if (i < 0) return null;
    return {
      temp: Number(data.hourly.temperature_2m?.[i]),
      wind: Number(data.hourly.wind_speed_10m?.[i]),
      precip: Number(data.hourly.precipitation_probability?.[i]),
    };
  } catch (e) {
    console.warn(`[TomorrowBoard] Open-Meteo fetch failed: ${e.message}`);
    return null;
  }
}

/* ───────────────────────────── 4. BIG GAMES ─────────────────────────────── */

/**
 * Score each slate game for newsworthiness and rank the top 3. Grounded inputs
 * only (standings rank, division rivalry, primetime window, ace starter) — NO
 * Layer-3 betting conclusions; the chip names WHY it's worth watching, the
 * context string is factual. Falls back to primetime + slate order so we
 * always surface 3 when there are >= 3 games.
 */
function buildBigGames(board, { mlb }) {
  const scored = board.map((row) => {
    let weight = 0;
    let reason = null;       // single highest-weight factor -> internal ranking trace
    let bestReasonW = -1;
    let standing = null;     // plain-text divisional standing -> what iOS renders
    const ctxParts = [];
    // BOTH probable starters' last names for MLB cards => { away, home }.
    // null for non-MLB. "Undecided" per side when a probable is unposted.
    let pitchers = null;

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
      // (Ranking heuristic UNCHANGED — these weights still select the top 3.)
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

      // DISPLAYED CONTEXT — the ACTUAL current divisional standing, plain text.
      // (Replaces the old reason-chip / division tag as what iOS shows.)
      standing = bigGameStanding({
        aSt, hSt, aTeam, hTeam, awayTeam: row.away_team, homeTeam: row.home_team,
      });

      // RIVALRY — curated divisional pairs.
      if (isRivalry(awayAbbr, homeAbbr)) { setReason('RIVALRY', 27); weight += 24; }

      // Doubleheader-safe map reads: entries are per-GAME (time-stamped) —
      // take the entry nearest this row's own start time, so game 2's card
      // never wears game 1's arms.
      const rowT = Date.parse(row.commence_time) || null;
      const nearestEntry = (list) => {
        if (!Array.isArray(list) || list.length === 0) return null;
        if (rowT == null || list.length === 1) return list[0];
        return list.slice().sort((a, b) =>
          Math.abs((a.t ?? rowT) - rowT) - Math.abs((b.t ?? rowT) - rowT))[0];
      };

      // ACE — a probable with a season ERA at/below the ace threshold (ranking only).
      const aces = nearestEntry(mlb.acesByGame.get(`${awayAbbr}|${homeAbbr}`));
      if (aces?.label) {
        setReason('ACE', 22);
        weight += aces.both ? 16 : 9;
        ctxParts.push(aces.label);
      }

      // BOTH probable starters (last names) for the card. "Undecided" per side
      // when no probable is posted; falls back to "Undecided"/"Undecided" if
      // the game didn't resolve in the schedule read at all.
      const gp = nearestEntry(mlb.pitchersByGame?.get(`${awayAbbr}|${homeAbbr}`));
      pitchers = {
        away: gp?.away || 'Undecided',
        home: gp?.home || 'Undecided',
      };
    }

    // PRIMETIME — national window weight boost (never a chip alone).
    const h = etHour(row.commence_time);
    if (h != null && h >= PRIMETIME_HOUR_ET) weight += 8;

    // Fallback so a 3+-game slate always fills three slots.
    weight += 1;

    return { row, weight, reason, standing, pitchers, ctx: ctxParts.filter(Boolean).join(' · ') || null };
  });

  scored.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    // tie-break by earliest start (the marquee opener leads)
    return new Date(a.row.commence_time || 0) - new Date(b.row.commence_time || 0);
  });

  // BIG GAMES SIZE + MIX — up to 5 (founder is fine with 4–5, not a hard 3), and
  // always mix in at least one MLB game so other leagues don't crowd the
  // domestic games out entirely.
  const MAX_BIG = 5;
  const picked = scored.slice(0, MAX_BIG);
  if (!picked.some((s) => s.row.league === 'MLB')) {
    const bestMlb = scored.find((s) => s.row.league === 'MLB');
    if (bestMlb) picked[picked.length - 1] = bestMlb;   // swap weakest slot for the top MLB
  }

  return picked.map((s, i) => {
    const item = {
      rank: i + 1,
      league: s.row.league,
      matchup: `${s.row.away_team} @ ${s.row.home_team}`,
      // DISPLAYED divisional context — plain text, e.g. "Brewers 1st · Cubs 2nd, NL
      // Central". null when standings don't resolve (iOS hides it). Replaces the old
      // reason chip as the rendered context.
      standing: s.standing,
      context: s.ctx,
      commence_time: s.row.commence_time || null,
    };
    // MLB only: BOTH probable starters' last names. "Undecided" per side when a
    // probable is unposted (left off entirely for other leagues).
    if (s.pitchers) {
      item.awayPitcher = s.pitchers.away;
      item.homePitcher = s.pitchers.home;
      item.pitchers = { away: s.pitchers.away, home: s.pitchers.home };
    }
    return item;
  });
}

/** "American League East" -> "AL East"; "National League Central" -> "NL Central". */
function shortDivision(name) {
  if (!name) return null;
  return String(name)
    .replace(/^American League\s+/i, 'AL ')
    .replace(/^National League\s+/i, 'NL ');
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 5 -> "5th". */
function ordinal(n) {
  if (!Number.isFinite(n)) return null;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Plain-text divisional standing for a big game, e.g. "Brewers 1st · Cubs 2nd, NL
 * Central" when both lead the same division, else the more newsworthy single team's
 * place ("1st, NL Central"). GROUNDED from standings + team index; null when
 * neither side's rank/division resolves (a standings gap).
 */
function bigGameStanding({ aSt, hSt, aTeam, hTeam, awayTeam, homeTeam }) {
  const aRank = aSt?.divisionRank;
  const hRank = hSt?.divisionRank;
  const sameDivision = aTeam?.divisionId != null && aTeam.divisionId === hTeam?.divisionId;
  const divName = shortDivision(hTeam?.divisionName) || shortDivision(aTeam?.divisionName);

  // Both placed in the SAME division -> show both with one shared division tag.
  if (sameDivision && Number.isFinite(aRank) && Number.isFinite(hRank) && divName) {
    return `${nick(awayTeam)} ${ordinal(aRank)} · ${nick(homeTeam)} ${ordinal(hRank)}, ${divName}`;
  }
  // Different divisions (interleague / cross-division) -> name each side's place.
  const parts = [];
  if (Number.isFinite(aRank) && (shortDivision(aTeam?.divisionName))) {
    parts.push(`${nick(awayTeam)} ${ordinal(aRank)} ${shortDivision(aTeam.divisionName)}`);
  }
  if (Number.isFinite(hRank) && (shortDivision(hTeam?.divisionName))) {
    parts.push(`${nick(homeTeam)} ${ordinal(hRank)} ${shortDivision(hTeam.divisionName)}`);
  }
  if (parts.length) return parts.join(' · ');
  return null;
}

/**
 * Short, unambiguous team nickname ("Milwaukee Brewers" -> "Brewers"). Keeps the
 * two-word nicknames whole so "Boston Red Sox" -> "Red Sox" (not a bare "Sox" that
 * collides with the White Sox) and "Toronto Blue Jays" -> "Blue Jays".
 */
function nick(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length >= 2) {
    const last2 = `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
    if (/^(red sox|white sox|blue jays)$/i.test(last2)) return last2;
  }
  return parts[parts.length - 1] || fullName || '';
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
    // Game identity (Jul 22 2026, doubleheader-safe) — pairs with the
    // starters' game_time so readers join board row ↔ arms BY GAME.
    bdl_game_id: row.bdl_game_id ?? null,
    venue: row.venue ?? null,
    spread: row.spread ?? null,
    ml_home: row.ml_home ?? null,
    ml_away: row.ml_away ?? null,
    total: row.total ?? null,
    is_marquee: marqueeKeys.has(`${row.league}|${row.away_team}|${row.home_team}`),
  };
}

/* ───────────────────────────── main assembler ───────────────────────────── */

// ═══════════════════════════════════════════════════════════════════════════
// THE ARMS, IN GARY'S VOICE (founder GO, Aug 4 2026): the scouting card opens
// straight with the arms, and the arms SPEAK — two sentences from Gary on the
// game's two starters, replacing the stat ladder. ONE batched call for the
// whole slate on the props-lane model (bridge, $0 marginal). Publishing is
// all-or-nothing for every game whose two probable starters are posted: an
// incomplete response is retried per game and never overwrites a good board.
// If only one probable is official, the page still gets an honest one-arm
// read plus an explicit unannounced-starter sentence instead of losing the
// entire section until a club makes its decision.
// The facts below are the take's ONLY world — same prevent-fabrication
// posture as the desks (data in, nothing invented).
// ═══════════════════════════════════════════════════════════════════════════

/** One starter's facts as a compact line. Omits what the data lacks. */
function armsFactLine(st) {
  if (!st) return null;
  const name = st.full_name || st.name;
  if (!name) return null;
  const bits = [];
  if (st.era != null) bits.push(`${st.era} ERA${st.xera != null ? ` (xERA ${st.xera})` : ''}`);
  if (st.last_outing) {
    const lo = st.last_outing;
    bits.push(`last outing${lo.date ? ` ${lo.date}` : ''}${lo.opp ? ` ${lo.at || 'vs'} ${lo.opp}` : ''}: ${lo.ip} IP ${lo.er} ER ${lo.k} K`);
  }
  if (st.l3) bits.push(`last ${st.l3.gs}: ${st.l3.ip} IP ${st.l3.er} ER ${st.l3.k} K`);
  if (st.qs_form?.window >= 2) bits.push(`${st.qs_form.qs} QS in last ${st.qs_form.window}${st.qs_form.streak >= 2 ? ` (${st.qs_form.streak} straight)` : ''}`);
  if (st.vs_opp?.gs) bits.push(`vs tonight's opponent this season: ${st.vs_opp.gs} GS, ${st.vs_opp.ip} IP, ${st.vs_opp.er} ER`);
  if (st.rest?.days != null) bits.push(`${st.rest.days} days' rest`);
  return `${name} (${st.team}): ${bits.join('; ') || 'no season data'}`;
}

/** Honest two-sentence Arms copy while exactly one probable is still TBA. */
function partialArmsTake(st, missingTeam) {
  const name = st.full_name || st.name || 'The announced starter';
  let first;
  if (st.l3?.gs && st.l3?.ip != null && st.l3?.er != null) {
    first = `${name} has allowed ${st.l3.er} earned runs across ${st.l3.ip} innings `
      + `in his last ${st.l3.gs} starts${st.l3.k != null ? `, with ${st.l3.k} strikeouts` : ''}`;
    if (st.era != null) {
      first += `, while carrying a ${st.era.toFixed(2)} ERA`
        + `${st.xera != null ? ` against a ${st.xera.toFixed(2)} xERA` : ''}`;
    }
  } else if (st.last_outing?.ip != null) {
    const lo = st.last_outing;
    first = `${name} worked ${lo.ip} innings with ${lo.er ?? 0} earned runs`
      + `${lo.k != null ? ` and ${lo.k} strikeouts` : ''} in his last start`;
  } else if (st.era != null) {
    first = `${name} brings a ${st.era.toFixed(2)} ERA`
      + `${st.xera != null ? ` and ${st.xera.toFixed(2)} xERA` : ''}`;
  } else {
    first = `${name} is the only confirmed arm in this matchup so far`;
  }
  return `${first}. The ${missingTeam} have not announced their starter, so that half of the matchup remains unsettled.`;
}

const ARMS_VOICE_CONTRACT = `You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system.

Your training data is old; the pitcher data provided is current — say nothing it can't back.

For each game: TWO sentences on the game's two starting pitchers — whatever you'd actually say about these arms tonight. No emojis.`;

/**
 * Attach `arms_take` to MLB board rows — one batched voice call, JSON out,
 * then focused retries for any missed game. Throws while any eligible game is
 * incomplete so the caller cannot silently publish an old/template treatment.
 */
async function attachArmsTakes(board, starters) {
  const starterFor = (row, team) => {
    const matchup = `${row.away_abbr || row.away_team} @ ${row.home_abbr || row.home_team}`;
    const candidates = starters.filter((st) => st.league === 'MLB'
      && String(st.team || '').toUpperCase() === String(team || '').toUpperCase()
      && (!st.game || st.game === matchup));
    if (candidates.length <= 1) return candidates[0] || null;
    const rowTime = Date.parse(row.commence_time);
    if (!Number.isFinite(rowTime)) return candidates[0];
    return [...candidates].sort((a, b) => {
      const aDelta = Math.abs((Date.parse(a.game_time) || rowTime) - rowTime);
      const bDelta = Math.abs((Date.parse(b.game_time) || rowTime) - rowTime);
      return aDelta - bDelta;
    })[0];
  };
  const jobs = [];
  let partialCount = 0;
  for (const r of board) {
    if (r.league !== 'MLB') continue;
    const awayStarter = starterFor(r, r.away_abbr);
    const homeStarter = starterFor(r, r.home_abbr);
    const a = armsFactLine(awayStarter);
    const h = armsFactLine(homeStarter);
    // With neither arm posted there is still no grounded pitcher story. With
    // exactly one, publish the known arm and state the other club's status
    // plainly; this is not the retired quality-starts fallback.
    if (!a && !h) continue;
    if (!a || !h) {
      const known = awayStarter || homeStarter;
      const missingTeam = a ? (r.home_team || r.home_abbr) : (r.away_team || r.away_abbr);
      r.arms_take = partialArmsTake(known, missingTeam);
      partialCount++;
      continue;
    }
    const matchup = `${r.away_abbr || r.away_team} @ ${r.home_abbr || r.home_team}`;
    jobs.push({ row: r, matchup, facts: [a, h].filter(Boolean).join('\n') });
  }
  if (!jobs.length) {
    if (partialCount) console.log(`[TomorrowBoard] arms takes attached: 0 paired + ${partialCount} partial`);
    return;
  }

  const requestTakes = async (pending) => {
    const userMessage = `${pending.map((j) => `## ${j.matchup}\n${j.facts}`).join('\n\n')}

Output JSON only:

\`\`\`json
[{ "matchup": "AWY @ HOM", "take": "[the two sentences]" }]
\`\`\`

One entry per game listed above.`;

    // Arms used to retry only GEMINI_PROPS_MODEL. When that points at the
    // Claude subscription and its weekly tank is empty, every retry hits the
    // same wall and the entire day stays blank. Use the same independent
    // provider chain as Gary's desks: Claude -> Codex/GPT -> Gemini.
    const models = [...new Set([GEMINI_PROPS_MODEL, ...DESK_FALLBACK_MODELS])];
    const failures = [];
    for (const modelName of models) {
      try {
        const session = await createGeminiSession({
          modelName,
          systemPrompt: ARMS_VOICE_CONTRACT,
          tools: [],
          thinkingLevel: 'low',
        });
        const res = await sendToSessionWithRetry(session, userMessage, {});
        const m = String(res.content || '').match(/```json\s*([\s\S]*?)```/i)
          || String(res.content || '').match(/(\[[\s\S]*\])/);
        if (!m) throw new Error('no JSON in response');
        const entries = JSON.parse(m[1]);
        if (!Array.isArray(entries)) throw new Error('JSON was not an array');
        if (modelName !== GEMINI_PROPS_MODEL) {
          console.warn(`[TomorrowBoard] arms provider recovered on ${modelName}`);
        }
        return entries;
      } catch (e) {
        failures.push(`${modelName}: ${e.message}`);
        console.warn(`[TomorrowBoard] arms provider ${modelName} failed: ${e.message}`);
      }
    }
    throw new Error(`arms takes: all providers failed (${failures.join(' | ')})`);
  };

  const keyOf = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const validTake = (take) => typeof take === 'string'
    && take.trim().length >= 40
    && take.trim().length <= 420
    && !take.includes('…')
    && !take.includes('...')
    && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(take);
  const attachEntries = (pending, entries) => {
    const takeByMatchup = new Map();
    const inOrder = [];
    for (const e of entries) {
      if (e?.matchup && typeof e.take === 'string') {
        takeByMatchup.set(keyOf(e.matchup), e.take.trim());
        inOrder.push(e.take.trim());
      }
    }
    for (const [i, j] of pending.entries()) {
      const take = takeByMatchup.get(keyOf(j.matchup))
        ?? (inOrder.length === pending.length ? inOrder[i] : undefined);
      if (validTake(take)) j.row.arms_take = take.trim();
    }
  };

  try {
    attachEntries(jobs, await requestTakes(jobs));
  } catch (e) {
    console.warn(`[TomorrowBoard] batched arms write failed: ${e.message}; retrying per game`);
  }

  // A malformed/missing entry in a large batch should not poison the slate.
  // Retry each miss in isolation twice; the session send already performs its
  // own network/server retry policy inside each attempt.
  for (const job of jobs.filter((j) => !j.row.arms_take)) {
    for (let attempt = 1; attempt <= 2 && !job.row.arms_take; attempt++) {
      try {
        attachEntries([job], await requestTakes([job]));
      } catch (e) {
        console.warn(`[TomorrowBoard] arms retry ${attempt}/2 failed for ${job.matchup}: ${e.message}`);
      }
    }
  }

  const missed = jobs.filter((j) => !j.row.arms_take);
  if (missed.length) {
    throw new Error(`arms takes incomplete for ${missed.map((j) => j.matchup).join(', ')}`);
  }
  console.log(`[TomorrowBoard] arms takes attached: ${jobs.length}/${jobs.length} paired + ${partialCount} partial`);
}

/**
 * Assemble + persist tomorrow's board snapshot. Idempotent upsert on (date) —
 * re-runs (e.g. the evening line refresh) overwrite in place so overnight-posted
 * lines flip "—" to real numbers before users wake.
 *
 * @returns {Promise<{date,game_count,any_lines,big_games,starters,returns,form,run_profile,weather,league_avg_era,league_avg_xera,countdown_sport}>}
 */
export async function writeTomorrowBoard(etDateStr = tomorrowET(), table = TABLE) {
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

  // MLB join indexes (teams / standings / aces) — each best-effort.
  let teams = [];
  try { teams = await getMlbTeams(); } catch (e) { console.warn(`[TomorrowBoard] teams fetch failed: ${e.message}`); }
  const teamIndex = indexMlbTeams(teams);
  const idByName = buildIdByName(teams);

  let standings = new Map();
  try { standings = indexStandings(await getMlbStandings(SEASON)); }
  catch (e) { console.warn(`[TomorrowBoard] standings fetch failed: ${e.message}`); }

  // Savant pitcher xStats — one fetch grounds BOTH the per-starter ERA/xERA index
  // AND the top-level league-average ERA/xERA (PA-weighted mean of this corpus).
  let eraByName = new Map();
  let leagueAvg = { league_avg_era: null, league_avg_xera: null };
  try {
    const pitcherX = await getPitcherXStats(SEASON);
    eraByName = indexPitcherEraByName(pitcherX);
    leagueAvg = computeLeagueAvgEra(pitcherX);
  } catch (e) { console.warn(`[TomorrowBoard] savant ERA fetch failed: ${e.message}`); }

  // 2. STARTERS (+ ace-by-game AND both-pitchers-by-game maps from the same
  // schedule read).
  const { starters, acesByGame, pitchersByGame } = await buildStarters(etDateStr, teamIndex, eraByName);

  // 3. RETURNS (best-effort, honest-empty).
  const returns = await buildReturns();

  // 3b. EXTRA TABBED LANES — FORM · RUN PROFILE · WEATHER. All GROUNDED-only
  // (omit a team/game when its source data is absent; never fabricate).
  const mlbSlateTeams = slateTeamsMlb(slateRows, teamIndex, idByName);
  const form = buildForm(mlbSlateTeams, standings);
  let recentMetrics = new Map();
  try {
    recentMetrics = await buildRecentTeamMetrics(mlbSlateTeams, etDateStr);
  } catch (e) {
    console.warn(`[TomorrowBoard] recent team metrics failed (honest-empty): ${e.message}`);
  }
  const run_profile = buildRunProfile(mlbSlateTeams, standings, recentMetrics);
  let weather = [];
  try {
    // getMlbSchedule is 2-hr cached (already read in buildStarters) → free here.
    const sched = await getMlbSchedule(etDateStr);
    weather = await buildWeather(sched, etDateStr, teamIndex);
  } catch (e) {
    console.warn(`[TomorrowBoard] weather lane failed (honest-empty): ${e.message}`);
  }

  // 2c. SCOUT EXTRAS — each probable's last outing + this-season record vs
  // tonight's opponent (BDL box scores; grounded, omit-when-short).
  try {
    await enrichStartersWithOutings(starters, etDateStr, teamIndex);
  } catch (e) {
    console.warn(`[TomorrowBoard] starter outings failed (honest-empty): ${e.message}`);
  }

  // 4. BIG GAMES.
  const bigGames = buildBigGames(slateRows, {
    mlb: { teamIndex, standings, idByName, acesByGame, pitchersByGame },
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
  // SCOUT EXTRAS — per-MLB-game season series (record + venue split + last
  // three meetings) off the season game index. Grounded; omit-when-short.
  try {
    await attachSeriesToBoard(board);
  } catch (e) {
    console.warn(`[TomorrowBoard] season series failed (honest-empty): ${e.message}`);
  }
  // THE ARMS IN GARY'S VOICE (Aug 4) — two sentences per game on the two
  // posted starters. This intentionally throws before the upsert if generation
  // is incomplete, preserving the last good snapshot for the scheduler retry.
  await attachArmsTakes(board, starters);
  const any_lines = board.some(
    (r) => r.spread != null || r.ml_home != null || r.ml_away != null || r.total != null,
  );

  // The opening matchup(s) — the game(s) at the earliest commence time, named
  // (abbreviations) for the countdown hero (founder: "whatever game or games
  // kick off the day"). De-duped, up to 3 joined with " · ".
  let countdown_matchup = null;
  if (countdown_iso != null) {
    const openers = board
      .filter((r) => r.commence_time === countdown_iso)
      .map((r) => {
        const away = r.away_abbr || r.away_team;
        const home = r.home_abbr || r.home_team;
        return away && home ? `${away} @ ${home}` : null;
      })
      .filter(Boolean);
    if (openers.length) countdown_matchup = [...new Set(openers)].slice(0, 3).join(' · ');
  }

  const record = {
    date: etDateStr,
    countdown_iso,
    countdown_sport,
    countdown_matchup,
    game_count: board.length,
    any_lines,
    board,
    big_games: bigGames,
    starters,
    returns,
    form,
    run_profile,
    weather,
    // Grounded current MLB league-average ERA / xERA (PA-weighted mean of the
    // Savant pitcher corpus) — the reference the iOS colors each starter's
    // ERA/xERA against (below avg = good/green, above = bad/red).
    league_avg_era: leagueAvg.league_avg_era,
    league_avg_xera: leagueAvg.league_avg_xera,
    updated_at: new Date().toISOString(),
  };

  const sanitized = JSON.parse(JSON.stringify(record));
  await axios({
    method: 'POST',
    url: `${supabaseUrl}/rest/v1/${table}`,
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
    `${form.length} form, ${run_profile.length} run-profile, ${weather.length} weather, ` +
    `lgERA=${leagueAvg.league_avg_era ?? '—'}/xERA=${leagueAvg.league_avg_xera ?? '—'}, ` +
    `lines=${any_lines ? 'posted' : 'open soon'}, countdown=${countdown_sport || 'none'}`,
  );

  return {
    date: etDateStr,
    game_count: board.length,
    any_lines,
    big_games: bigGames,
    starters,
    returns,
    form,
    run_profile,
    weather,
    league_avg_era: leagueAvg.league_avg_era,
    league_avg_xera: leagueAvg.league_avg_xera,
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

export default { writeTomorrowBoard, tomorrowET };
