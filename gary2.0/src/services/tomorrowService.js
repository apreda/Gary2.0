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
 *   2. PROBABLE STARTERS — MLB probable pitchers ONLY (getMlbSchedule, both
 *      sides, all games) joined to Savant season ERA + xERA by name, each tagged
 *      with its game ("HOU @ DET"), opponent abbr, and home flag. Shape:
 *      {name, team, abbr, era, xera, game, opponent, home, detail}. Plus a
 *      top-level grounded league_avg_era / league_avg_xera (PA-weighted mean of
 *      the same Savant pitcher corpus) so the iOS can color each pitcher's
 *      ERA/xERA relative to league (below = good). era/xera null when Savant
 *      has no row (never fabricated). WC is NO LONGER mixed in here — it has its
 *      own dedicated lane (see WC LOOK-AHEAD below).
 *   2b. WC LOOK-AHEAD — its own iOS tab, one entry per tomorrow World Cup match
 *      (away vs home + kickoff). Each match carries the grounded, day-before,
 *      bettor-useful look-ahead, all from data the app already pays for:
 *        • projected XI + formation per side — reuses previousXI() (each team's
 *          recent-regulars projection; OUT/suspended dropped). Confirmed sheets
 *          don't post until ~2h pre-kickoff, so the day before is PROJECTED.
 *        • recent FORM per side — getRecentForm() L5 (W-D-L + GF/GA per match).
 *        • the LINES for the match — spread / total / 3-way ML straight off the
 *          SAME slate row the board renders ("—" when a book hasn't posted).
 *        • KEY PLAYERS to watch per side — each team's leading cycle scorers from
 *          getSquadStats (goals/assists, grounded); omitted when unavailable.
 *      GROUNDED only — never fabricates an XI/form/line/scorer; a side with no
 *      usable projection or form simply omits that field.
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
 *                        (the same key-less, day-before-available source wcWeather
 *                        uses); domed/closed parks skipped, omitted when no coords
 *                        / forecast resolve. temp_f / wind_mph / precip_pct + note.
 *   4. BIG GAMES — top-3 marquee games by a grounded newsworthiness weight
 *      (standings rank, division rivalry, primetime window, ace starter, WC
 *      stage). The DISPLAYED context is now each game's ACTUAL current divisional
 *      standing as plain text (e.g. "Brewers 1st · Cubs 2nd, NL Central") via the
 *      `standing` field — not a reason chip. WC games (no MLB-style divisions) use
 *      the group/stage as plain text, or omit. MLB items also carry BOTH probable
 *      starters' last names — `awayPitcher` / `homePitcher` (+ a `pitchers:{away,
 *      home}` mirror) — sourced from the SAME schedule read as the starters lane,
 *      "Undecided" per side when a probable is unposted (never blank, never
 *      fabricated). WC items carry no pitcher fields. NO Layer-3 betting conclusions.
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
import { ballDontLieService as bdl } from './ballDontLieService.js';

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
/** "Gerrit Cole" -> "Cole" (probable-pitcher last name); "" when no name. */
function lastNameOf(fullName) {
  return String(fullName || '').trim().split(/\s+/).pop() || '';
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
    const rec = { era, xera: Number.isFinite(xeraNum) ? xeraNum : null };
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
    league_avg_xera: xeraPa > 0 ? Number((xeraW / xeraPa).toFixed(2)) : null,
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

/* ──────────────────────── 2. PROBABLE STARTERS (MLB only) ───────────────── */

async function buildStarters(etDateStr, teamIndex, eraByName) {
  const starters = [];
  // Per MLB game (keyed "awayAbbr|homeAbbr"): ace label + both-aces flag
  // for the big-games ACE hook, built from the SAME schedule read.
  const acesByGame = new Map();
  // Per MLB game (same "awayAbbr|homeAbbr" key): BOTH probable starters'
  // last names for the big-games card => { away, home }. "Undecided" when a
  // side has no posted probable (never blank, never fabricated).
  const pitchersByGame = new Map();

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
        const xera = stats?.xera ?? null;
        const detail = era != null ? `${abbr} ${era.toFixed(2)}` : abbr;
        starters.push({
          league: 'MLB',
          name: abbrevName(name),
          full_name: name,              // un-abbreviated (scout-extras id resolution)
          team: abbr,
          abbr,                         // explicit alias (iOS gold team-name source)
          era,                          // number | null
          xera,                         // number | null (never fabricated)
          game: gameLabel,              // "HOU @ DET" | null
          opponent: oppAbbr || null,    // opposing team abbr | null
          home,                         // pitching at home?
          detail,                       // legacy "HOU 4.03" string (kept for back-compat)
        });
        if (era != null && era <= ACE_ERA) {
          const last = String(name).trim().split(/\s+/).pop();
          gameAces.push({ lastName: last, era });
        }
      }
      // Both-pitchers map for the big-games card — keyed by abbreviations so
      // the slate (nicknames) and schedule (full names) resolve to the same
      // game. Stored for EVERY game (unlike aces, which gate on ERA).
      if (awayName && homeName) {
        const aAbbr = abbrFor(awayName, teamIndex);
        const hAbbr = abbrFor(homeName, teamIndex);
        pitchersByGame.set(`${aAbbr}|${hAbbr}`, {
          away: gamePitchers.away,
          home: gamePitchers.home,
        });
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

  // WC is no longer mixed into starters — it has its own dedicated lane
  // (buildWcLookahead). starters[] is MLB pitchers only.
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
  const last = String(fullName || '').trim().split(/\s+/).pop();
  if (!last) return null;
  const res = await bdl.getPlayersGeneric('baseball_mlb', { search: last, per_page: 100 });
  const players = Array.isArray(res) ? res : (res?.data || []);
  if (!players.length) return null;
  const want = nameKey(fullName);
  const byName = players.filter((p) => {
    const full = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
    return nameKey(full) === want;
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
      nameKey(p.last_name || '') === nameKey(last) && (p.team?.id ?? p.team_id) === teamId);
    if (teamHits.length === 1) return teamHits[0].id;
  }
  return null;
}

/**
 * Attach { last_outing, vs_opp } to each MLB starter row IN PLACE.
 * last_outing = his most recent regular-season START (never relief);
 * vs_opp = this season's starts against tonight's opponent, aggregated.
 */
async function enrichStartersWithOutings(starters) {
  const { idByAbbr, abbrById } = await bdlTeamMaps();
  const mlb = starters.filter((st) => st.league === 'MLB' && (st.full_name || st.name));
  const CHUNK = 4;
  for (let i = 0; i < mlb.length; i += CHUNK) {
    await Promise.all(mlb.slice(i, i + CHUNK).map(async (st) => {
      try {
        const teamId = idByAbbr.get(String(st.team || '').toUpperCase()) ?? null;
        const pid = await resolvePitcherBdlId(st.full_name || st.name, teamId);
        if (!pid) return;
        const rows = await bdl.getMlbPlayerGameRowsChrono(pid, SEASON);
        const startRows = (rows || []).filter((r) => Number(r.games_started) === 1);
        if (!startRows.length) return;
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

/* ─────────────────────── 2b. WC LOOK-AHEAD (own tab) ─────────────────────── */

/**
 * Name normalizer IDENTICAL to wcConfirmedXI.js's internal `norm` (diacritic-strip
 * + alphanumeric collapse). previousXI() looks up its injStatus map with that same
 * `norm`, so the OUT/SUS keys we build here MUST match it byte-for-byte — nameKey()
 * (which keeps accents) would silently never match and drop nobody. Kept in lockstep.
 */
function wcNorm(s) {
  return String(s || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A team's L5 form as a flat, grounded shape, or null. From getRecentForm().l5:
 *  { record: "3-1-1", w, d, l, gf_per_game, ga_per_game, form: "WWDLW" }. */
function formShape(recentForm) {
  const l5 = recentForm?.l5;
  if (!l5 || !Number.isFinite(Number(l5.played)) || Number(l5.played) === 0) return null;
  const out = {
    record: `${l5.w}-${l5.d}-${l5.l}`, // W-D-L
    w: l5.w, d: l5.d, l: l5.l,
    gf_per_game: Number.isFinite(Number(l5.gfPerMatch)) ? Number(l5.gfPerMatch) : null,
    ga_per_game: Number.isFinite(Number(l5.gaPerMatch)) ? Number(l5.gaPerMatch) : null,
    form: l5.form || null, // "WWDLW" most-recent-first
    matches: l5.played,
  };
  // WC-ONLY record — THIS tournament's games (excludes friendlies + qualifiers),
  // for the Big Games preview (founder: "only the WC games"). Null when the team
  // hasn't played a tournament game yet (then iOS falls back to the L5 record).
  const wcFix = (recentForm.fixtures || []).filter(
    (f) => /world cup/i.test(f.league || '') && !/qualif/i.test(f.league || ''),
  );
  if (wcFix.length) {
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    for (const f of wcFix) {
      gf += Number(f.gf) || 0;
      ga += Number(f.ga) || 0;
      const res = f.result || (f.gf > f.ga ? 'W' : f.gf < f.ga ? 'L' : 'D');
      if (res === 'W') w += 1; else if (res === 'L') l += 1; else d += 1;
    }
    out.wc = {
      record: `${w}-${d}-${l}`,
      w, d, l,
      gf_per_game: +(gf / wcFix.length).toFixed(1),
      ga_per_game: +(ga / wcFix.length).toFixed(1),
      matches: wcFix.length,
    };
  }
  return out;
}

/** Projected XI + formation for a side as a flat shape, or null. Reuses
 *  previousXI() — the SAME recent-regulars projection the field view + the
 *  situational lane show (OUT/suspended dropped). Confirmed sheets don't post
 *  until ~2h pre-kickoff, so the day before is necessarily PROJECTED. */
function xiShape(side) {
  if (!side || !Array.isArray(side.starters) || side.starters.length < 11) return null;
  return {
    formation: side.formation || null, // "4-3-3" | null
    keeper: side.keeper || null,
    xi: side.starters
      .map((s) => ({ n: s.player?.name, p: s.position || null, num: s.shirt_number ?? null }))
      .filter((p) => p.n),
  };
}

/** Up to `n` grounded key players for a side from getSquadStats — the leading
 *  cycle scorers (goals desc, then assists). Each { name, goals, assists,
 *  position }. Only players with a real goal/assist tally qualify (no fabricated
 *  rate); [] when the squad map is empty. */
function keyPlayersFrom(squad, n = 3) {
  const players = Object.values(squad || {}).filter(
    (p) => p?.name && (Number(p.goals) > 0 || Number(p.assists) > 0),
  );
  if (!players.length) return [];
  players.sort(
    (a, b) => (Number(b.goals) - Number(a.goals)) || (Number(b.assists) - Number(a.assists)),
  );
  return players.slice(0, n).map((p) => ({
    name: p.name,
    goals: Number.isFinite(Number(p.goals)) ? Number(p.goals) : null,
    assists: Number.isFinite(Number(p.assists)) ? Number(p.assists) : null,
    position: p.position || null,
  }));
}

/**
 * WC LOOK-AHEAD — one entry per tomorrow World Cup match. Joins the WC match feed
 * (for ids/teams/stage) to the SAME slate rows the board renders (for the posted
 * lines), then layers the grounded day-before reads per side:
 *   • projected XI + formation  — previousXI() (recent regulars, OUT/SUS dropped)
 *   • recent form (L5)          — getRecentForm() (W-D-L + GF/GA per game)
 *   • key players to watch      — getSquadStats() leading scorers
 * GROUNDED: a side with no usable projection/form just omits that field; lines
 * are "—"/null when unposted; nothing is ever fabricated. Best-effort per match
 * and per side — one flaky team never sinks the lane.
 *
 * @param {Array} slateRows   the assembled slate rows (carry WC lines per match)
 * @param {string} etDateStr  tomorrow's ET date
 * @param {number} season     WC season (2026)
 */
async function buildWcLookahead(slateRows, etDateStr, season) {
  const out = [];
  // Index the slate's WC line rows by "away|home" so each match reuses the EXACT
  // line the board shows (no second odds fetch, never drifts from the board).
  const lineByPair = new Map();
  for (const r of slateRows) {
    if (r.league !== 'WC') continue;
    lineByPair.set(`${r.away_team}|${r.home_team}`, r);
  }
  if (!lineByPair.size) return out; // no WC tomorrow

  let wc, previousXI, apiFootball;
  try {
    wc = await import('./fifaWorldCupService.js');
    ({ previousXI } = await import('./insights/computers/wcConfirmedXI.js'));
    apiFootball = await import('./apiFootballService.js');
  } catch (e) {
    console.warn(`[TomorrowBoard] WC look-ahead deps failed (skipping lane): ${e.message}`);
    return out;
  }

  // WC injury snapshot once for the slate — lets previousXI drop OUT/suspended
  // regulars from each projection (same map wcConfirmedXI builds). Empty on any
  // gap → no doubts dropped (fails safe).
  let injStatus = new Map();
  try {
    const injRows = await wc.getInjuries({ seasons: [season] });
    for (const r of injRows || []) {
      const nm = r?.player?.name;
      if (nm && r?.status) injStatus.set(wcNorm(nm), String(r.status).toUpperCase());
    }
  } catch (e) {
    console.warn(`[TomorrowBoard] WC injuries fetch failed (no doubts dropped): ${e.message}`);
  }

  let matches = [];
  try { matches = await wc.getMatches({}); } catch (e) {
    console.warn(`[TomorrowBoard] WC matches fetch failed (skipping lane): ${e.message}`);
    return out;
  }

  for (const m of Array.isArray(matches) ? matches : []) {
    try {
      if (!m?.home_team?.name || !m?.away_team?.name || !m?.datetime) continue;
      const start = new Date(m.datetime);
      if (Number.isNaN(start.getTime()) || getETDateStr(start) !== etDateStr) continue;

      const away = m.away_team, home = m.home_team;
      const lineRow = lineByPair.get(`${away.name}|${home.name}`);

      // Projected XI per side — reuse the canonical projection. injStatus is keyed
      // with wcNorm (matching previousXI's internal norm) so OUT/SUS regulars drop.
      const [hXi, aXi] = await Promise.all([
        previousXI(home.id, home.name, m.id, season, injStatus).catch(() => null),
        previousXI(away.id, away.name, m.id, season, injStatus).catch(() => null),
      ]);

      // Recent form per side (L5) — grounded W-D-L + GF/GA per game.
      const [hForm, aForm] = await Promise.all([
        apiFootball.getRecentForm(home.name).catch(() => null),
        apiFootball.getRecentForm(away.name).catch(() => null),
      ]);

      // Key players per side — leading cycle scorers from the squad map.
      const [hSquad, aSquad] = await Promise.all([
        apiFootball.getSquadStats(home.name).catch(() => ({})),
        apiFootball.getSquadStats(away.name).catch(() => ({})),
      ]);

      const entry = {
        league: 'WC',
        match: `${away.name} @ ${home.name}`,
        away_team: away.name,
        home_team: home.name,
        commence_time: m.datetime,
        kickoff: etClock(m.datetime),                 // short ET clock, e.g. "3:00"
        stage: m.round_name || m.stage?.name || null, // plain-text stage/round
        group: m.group?.name || null,
        venue: m.stadium?.name || null,
        // LINES — straight off the board's slate row. "—"/null when unposted.
        lines: {
          spread: lineRow?.spread ?? null,
          total: lineRow?.total ?? null,
          ml_home: lineRow?.ml_home ?? null,
          ml_away: lineRow?.ml_away ?? null,
        },
        // Per side: projected XI + formation, L5 form, key players. Each field is
        // omitted (null/[]) when its grounded source is unavailable.
        home: {
          team: home.name,
          xi: xiShape(hXi),               // { formation, keeper, xi:[...] } | null
          form: formShape(hForm),         // { record, gf_per_game, ... } | null
          key_players: keyPlayersFrom(hSquad),
        },
        away: {
          team: away.name,
          xi: xiShape(aXi),
          form: formShape(aForm),
          key_players: keyPlayersFrom(aSquad),
        },
      };
      out.push(entry);
    } catch (e) {
      console.warn(`[TomorrowBoard] WC look-ahead match skipped: ${e.message}`);
    }
  }

  // Earliest kickoff first.
  out.sort((a, b) => new Date(a.commence_time || 0) - new Date(b.commence_time || 0));
  return out;
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

/**
 * RUN PROFILE — the grounded, day-before scoring/run-prevention shape for each MLB
 * team (the honest stand-in for an "over/under trend": game_results stores no
 * betting total to compute a real O/U record from, so we never fabricate one).
 * Season runs scored / allowed / differential + per-game rates, straight from
 * standings (runsScored / runsAllowed / runDifferential / wins+losses). GROUNDED:
 * a team is omitted when its run totals are absent.
 */
function buildRunProfile(mlbTeams, standings) {
  const mlb = [];
  for (const t of mlbTeams) {
    const st = standings.get(t.id);
    if (!st || st.runsScored == null || st.runsAllowed == null) continue; // grounded-only
    const gp = (Number(st.wins) || 0) + (Number(st.losses) || 0);
    const rsg = gp > 0 ? st.runsScored / gp : null; // runs scored / game
    const rag = gp > 0 ? st.runsAllowed / gp : null; // runs allowed / game
    mlb.push({
      league: 'MLB',
      team: t.team,
      abbr: t.abbr,
      runs_scored: st.runsScored,
      runs_allowed: st.runsAllowed,
      run_diff: st.runDiff != null ? st.runDiff : (st.runsScored - st.runsAllowed),
      rs_per_game: rsg != null ? Number(rsg.toFixed(2)) : null,
      ra_per_game: rag != null ? Number(rag.toFixed(2)) : null,
      home: t.home,
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
 * (the same free, key-less, day-before-available forecast source wcWeather already
 * uses). Each game's venue lat/lon comes from the MLB Stats API venue feed; the
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
 * only (standings rank, division rivalry, primetime window, ace starter, WC
 * stage) — NO Layer-3 betting conclusions; the chip names WHY it's worth
 * watching, the context string is factual. Falls back to primetime + slate
 * order so we always surface 3 when there are >= 3 games.
 */
function buildBigGames(board, { mlb }) {
  const scored = board.map((row) => {
    let weight = 0;
    let reason = null;       // single highest-weight factor -> internal ranking trace
    let bestReasonW = -1;
    let standing = null;     // plain-text divisional standing -> what iOS renders
    const ctxParts = [];
    // BOTH probable starters' last names for MLB cards => { away, home }.
    // null for non-MLB (WC carries no pitchers). "Undecided" per side when a
    // probable is unposted.
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

      // ACE — a probable with a season ERA at/below the ace threshold (ranking only).
      const aces = mlb.acesByGame.get(`${awayAbbr}|${homeAbbr}`);
      if (aces?.label) {
        setReason('ACE', 22);
        weight += aces.both ? 16 : 9;
        ctxParts.push(aces.label);
      }

      // BOTH probable starters (last names) for the card. "Undecided" per side
      // when no probable is posted; falls back to "Undecided"/"Undecided" if
      // the game didn't resolve in the schedule read at all.
      const gp = mlb.pitchersByGame?.get(`${awayAbbr}|${homeAbbr}`);
      pitchers = {
        away: gp?.away || 'Undecided',
        home: gp?.home || 'Undecided',
      };
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
      // WC has no MLB-style divisions — use the group/stage as plain-text standing.
      standing = [row._wc_stage, row._wc_group].filter(Boolean).join(' · ') || null;
    }

    // PRIMETIME — national window weight boost (never a chip alone).
    const h = etHour(row.commence_time);
    if (h != null && h >= PRIMETIME_HOUR_ET) weight += 8;

    // Fallback so a 3+-game slate always fills three slots.
    weight += 1;

    // LEAGUE TIER — the World Cup is a marquee global event; ANY WC match outranks
    // ANY regular-season MLB game (founder: "these should be WC games, those are
    // bigger than regular season MLB"). Tier sorts first, so WC leads Big Games
    // whenever the slate has WC; the intra-league weights above only order within
    // a tier (knockout ahead of group in WC; standings/rivalry/ace in MLB).
    const tier = row.league === 'WC' ? 1 : 0;

    return { row, weight, tier, reason, standing, pitchers, ctx: ctxParts.filter(Boolean).join(' · ') || null };
  });

  scored.sort((a, b) => {
    if (b.tier !== a.tier) return b.tier - a.tier;      // WC ahead of regular-season MLB
    if (b.weight !== a.weight) return b.weight - a.weight;
    // tie-break by earliest start (the marquee opener leads)
    return new Date(a.row.commence_time || 0) - new Date(b.row.commence_time || 0);
  });

  // BIG GAMES SIZE + MIX — up to 5 (founder is fine with 4–5, not a hard 3), and
  // always mix in at least one MLB game so a full WC slate doesn't crowd the
  // domestic games out entirely. WC still leads (tier sort above); MLB rides along.
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
    // probable is unposted. WC carries no pitchers (left off entirely).
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
 * neither side's rank/division resolves (e.g. WC, or a standings gap).
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
 * @returns {Promise<{date,game_count,any_lines,big_games,starters,returns,form,run_profile,weather,wc_lookahead,league_avg_era,league_avg_xera,countdown_sport}>}
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
  const run_profile = buildRunProfile(mlbSlateTeams, standings);
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
    await enrichStartersWithOutings(starters);
  } catch (e) {
    console.warn(`[TomorrowBoard] starter outings failed (honest-empty): ${e.message}`);
  }

  // 2b. WC LOOK-AHEAD — its own iOS tab (projected XI + formation, L5 form, the
  // posted lines, and key players per side). GROUNDED; honest-empty when no WC
  // tomorrow or its sources are short. Joins the slate's WC line rows in place.
  let wc_lookahead = [];
  try {
    wc_lookahead = await buildWcLookahead(slateRows, etDateStr, SEASON);
  } catch (e) {
    console.warn(`[TomorrowBoard] WC look-ahead lane failed (honest-empty): ${e.message}`);
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
    // Dedicated WC day-before look-ahead (its own iOS tab) — one entry per WC
    // match with projected XI + formation, L5 form, lines, and key players per
    // side. Pulled out of starters[] (which is now MLB pitchers only).
    wc_lookahead,
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
    `${wc_lookahead.length} wc-lookahead, ` +
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
    wc_lookahead,
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
