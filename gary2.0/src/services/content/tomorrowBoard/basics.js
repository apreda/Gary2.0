/** The board's configuration and shared helpers: names, times, team and standings indexes (split from tomorrowService.js, Oct 13 2026). */
import { getETDateStr } from '../dailySlateService.js';

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const TABLE = 'tomorrow_board';
export const CONFLICT_KEY = 'date';
export const SEASON = 2026;

// Primetime national window (>= 7pm ET) gives a marquee weight boost.
export const PRIMETIME_HOUR_ET = 19;
// A Savant season ERA at/below this marks a game's starter as an "ace" hook.
export const ACE_ERA = 3.20;

/** Tomorrow's ET game day = today's en-CA America/New_York date + 1 (UTC math, no tz drift). */
export function tomorrowET() {
  const todayET = getETDateStr(new Date());
  const d = new Date(`${todayET}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────── name / key helpers ─────────────────────────── */

export function nameKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.\-'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// The iOS game identity uses the same 30-minute bucket. MLB's schedule and
// odds feeds can disagree by a few minutes after a first-pitch adjustment, but
// doubleheader games remain hours apart. Bucketing preserves that safe join
// without treating a harmless 5-minute feed skew as a different game.
const GAME_TIME_BUCKET_MS = 30 * 60 * 1000;
export function gameTimeBucket(value) {
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? Math.floor(time / GAME_TIME_BUCKET_MS) : null;
}

export function rowMatchup(row) {
  return `${row?.away_abbr || row?.away_team || ''} @ ${row?.home_abbr || row?.home_team || ''}`;
}

export function rowMatchupKey(row) {
  return [row?.league, row?.away_abbr || row?.away_team, row?.home_abbr || row?.home_team]
    .map(nameKey)
    .join('|');
}

export function repeatedMatchupKeys(rows) {
  const counts = new Map();
  for (const row of rows || []) {
    const key = rowMatchupKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

// Stable identity carried through the model request/response. Prefer the
// slate provider id; older rows still remain exact through matchup + start.
export function rowGameIdentity(row) {
  if (row?.bdl_game_id != null) return `bdl:${row.bdl_game_id}`;
  return `matchup:${rowMatchupKey(row)}|time:${row?.commence_time || 'unknown'}`;
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
export function playerNameWithoutSuffix(fullName) {
  return playerNameParts(fullName).join(' ');
}
export function playerNameKey(fullName) {
  return nameKey(playerNameWithoutSuffix(fullName));
}
export function lastNameKey(fullName) {
  const parts = playerNameParts(fullName);
  return nameKey(parts[parts.length - 1] || '');
}
/** "Gerrit Cole" -> "G. Cole" (mock's compact starter name format). */
export function abbrevName(fullName) {
  const parts = playerNameParts(fullName);
  if (parts.length < 2) return fullName || '';
  const last = parts[parts.length - 1];
  const first = parts[0];
  return `${first.charAt(0)}. ${last}`;
}
/** "Gerrit Cole" -> "Cole" (probable-pitcher last name); "" when no name. */
export function lastNameOf(fullName) {
  const parts = playerNameParts(fullName);
  return parts[parts.length - 1] || '';
}

/** ET hour (0-23) of an ISO instant — for the primetime test. */
export function etHour(iso) {
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
export function indexMlbTeams(teams) {
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
export function abbrFor(name, teamIndex) {
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
export function indexStandings(standingsRaw) {
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

/** Actual season ERA indexed by the provider's pitcher name. */
export function indexPitcherEraByName(pitcherX) {
  const map = new Map();
  for (const r of pitcherX || []) {
    const era = Number(r?.era);
    if (!Number.isFinite(era)) continue;
    const rec = { era };
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
/** Actual ERA for a pitcher name, or null. */
export function statsForName(fullName, eraByName) {
  if (!fullName) return null;
  const e = eraByName.get(nameKey(fullName));
  if (e) return e;
  const e2 = eraByName.get(lastNameKey(fullName));
  return e2 || null;
}

/**
 * Grounded current MLB LEAGUE-AVERAGE ERA, derived from the SAME Savant
 * pitcher xStats corpus the starters lane already fetches — a plate-appearance-
 * WEIGHTED mean (weighting by `pa` approximates innings, so workhorse starters
 * count fully and tiny-sample relievers can't distort the average up). Used by
 * the iOS to color each pitcher's ERA relative to league (below = good).
 * GROUNDED: null when the corpus is empty; never a hardcoded constant.
 * => { league_avg_era: number|null }
 */
export function computeLeagueAvgEra(pitcherX) {
  let eraW = 0, eraPa = 0;
  for (const r of pitcherX || []) {
    const pa = Number(r?.pa);
    const w = Number.isFinite(pa) && pa > 0 ? pa : 1; // unweighted fallback if pa absent
    const era = Number(r?.era);
    if (Number.isFinite(era)) { eraW += era * w; eraPa += w; }
  }
  return {
    league_avg_era: eraPa > 0 ? Number((eraW / eraPa).toFixed(2)) : null,
  };
}

/* ─────────────────────── curated division rivalries ─────────────────────── */
// Static, factual divisional-rivalry pairs (abbreviation sets). Newsworthiness
// only — never a betting conclusion.
export const RIVALRY_PAIRS = [
  ['NYY', 'BOS'], ['LAD', 'SF'], ['LAD', 'SD'], ['SF', 'SD'],
  ['CHC', 'STL'], ['NYM', 'PHA'], ['NYM', 'PHI'], ['ATL', 'NYM'],
  ['HOU', 'TEX'], ['CLE', 'CHW'], ['CWS', 'CLE'], ['SEA', 'HOU'],
  ['TBR', 'TB'], ['BAL', 'NYY'], ['MIL', 'CHC'], ['CIN', 'STL'],
];
export function isRivalry(a, b) {
  if (!a || !b) return false;
  return RIVALRY_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}
