/**
 * THE NFL SCHEDULE FILE AND THE STADIUMS (founder GO, Oct 12 2026: "all those blind spots need fixed").
 *
 * nflverse publishes every game since 1999 in one file (schedules/games.csv, about 2 MB): the stadium, the roof,
 * kickoff temperature and wind for played games, each team's days of rest, both quarterbacks and both head
 * coaches. The desk used none of it, so Gary could not see a short week, a trip across three time zones, a game
 * in the wind or a coach in his first month. This module reads that file once and cached, and carries the one
 * table nflverse does not have: where each stadium is (latitude, longitude, time zone), keyed by nflverse's own
 * stadium id. Facts only; what any of it means for a game is Gary's read.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseCsv, nflverseCode } from '../../providers/nflverseService.js';

const URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const DISK_DIR = join(process.env.TMPDIR || '/tmp', 'gary-nfl-schedule-cache');
const DISK_FILE = join(DISK_DIR, 'games.csv');
const TTL_MS = 6 * 3600_000;
const TIMEOUT_MS = 30_000;
let memo = null;

/**
 * Every stadium nflverse's 2025-26 schedules name, by stadium id. `roof` is the building's: 'dome' (fixed roof),
 * 'retractable' or 'outdoors'. nflverse's own per-game roof value (dome / closed / open / outdoors) wins for a
 * played game; this is the fallback for a game not yet played.
 */
export const NFL_STADIUMS = {
  ATL97: { name: 'Mercedes-Benz Stadium', city: 'Atlanta', lat: 33.7554, lon: -84.4008, tz: 'America/New_York', roof: 'retractable' },
  BAL00: { name: 'M&T Bank Stadium', city: 'Baltimore', lat: 39.2780, lon: -76.6227, tz: 'America/New_York', roof: 'outdoors' },
  BOS00: { name: 'Gillette Stadium', city: 'Foxborough, Mass.', lat: 42.0909, lon: -71.2643, tz: 'America/New_York', roof: 'outdoors' },
  BUF00: { name: 'Highmark Stadium', city: 'Orchard Park, N.Y.', lat: 42.7738, lon: -78.7870, tz: 'America/New_York', roof: 'outdoors' },
  CAR00: { name: 'Bank of America Stadium', city: 'Charlotte', lat: 35.2258, lon: -80.8528, tz: 'America/New_York', roof: 'outdoors' },
  CHI98: { name: 'Soldier Field', city: 'Chicago', lat: 41.8623, lon: -87.6167, tz: 'America/Chicago', roof: 'outdoors' },
  CIN00: { name: 'Paycor Stadium', city: 'Cincinnati', lat: 39.0954, lon: -84.5160, tz: 'America/New_York', roof: 'outdoors' },
  CLE00: { name: 'Huntington Bank Field', city: 'Cleveland', lat: 41.5061, lon: -81.6995, tz: 'America/New_York', roof: 'outdoors' },
  DAL00: { name: 'AT&T Stadium', city: 'Arlington, Texas', lat: 32.7473, lon: -97.0945, tz: 'America/Chicago', roof: 'retractable' },
  DEN00: { name: 'Empower Field at Mile High', city: 'Denver', lat: 39.7439, lon: -105.0201, tz: 'America/Denver', roof: 'outdoors' },
  DET00: { name: 'Ford Field', city: 'Detroit', lat: 42.3400, lon: -83.0456, tz: 'America/Detroit', roof: 'dome' },
  GNB00: { name: 'Lambeau Field', city: 'Green Bay', lat: 44.5013, lon: -88.0622, tz: 'America/Chicago', roof: 'outdoors' },
  HOU00: { name: 'NRG Stadium', city: 'Houston', lat: 29.6847, lon: -95.4107, tz: 'America/Chicago', roof: 'retractable' },
  IND00: { name: 'Lucas Oil Stadium', city: 'Indianapolis', lat: 39.7601, lon: -86.1639, tz: 'America/Indiana/Indianapolis', roof: 'retractable' },
  JAX00: { name: 'EverBank Stadium', city: 'Jacksonville', lat: 30.3239, lon: -81.6373, tz: 'America/New_York', roof: 'outdoors' },
  KAN00: { name: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City', lat: 39.0489, lon: -94.4839, tz: 'America/Chicago', roof: 'outdoors' },
  LAX01: { name: 'SoFi Stadium', city: 'Inglewood, Calif.', lat: 33.9535, lon: -118.3392, tz: 'America/Los_Angeles', roof: 'dome' },
  MIA00: { name: 'Hard Rock Stadium', city: 'Miami Gardens, Fla.', lat: 25.9580, lon: -80.2389, tz: 'America/New_York', roof: 'outdoors' },
  MIN01: { name: 'U.S. Bank Stadium', city: 'Minneapolis', lat: 44.9737, lon: -93.2581, tz: 'America/Chicago', roof: 'dome' },
  NAS00: { name: 'Nissan Stadium', city: 'Nashville', lat: 36.1665, lon: -86.7713, tz: 'America/Chicago', roof: 'outdoors' },
  NOR00: { name: 'Caesars Superdome', city: 'New Orleans', lat: 29.9511, lon: -90.0812, tz: 'America/Chicago', roof: 'dome' },
  NYC01: { name: 'MetLife Stadium', city: 'East Rutherford, N.J.', lat: 40.8135, lon: -74.0745, tz: 'America/New_York', roof: 'outdoors' },
  PHI00: { name: 'Lincoln Financial Field', city: 'Philadelphia', lat: 39.9008, lon: -75.1675, tz: 'America/New_York', roof: 'outdoors' },
  PHO00: { name: 'State Farm Stadium', city: 'Glendale, Ariz.', lat: 33.5276, lon: -112.2626, tz: 'America/Phoenix', roof: 'retractable' },
  PIT00: { name: 'Acrisure Stadium', city: 'Pittsburgh', lat: 40.4468, lon: -80.0158, tz: 'America/New_York', roof: 'outdoors' },
  SEA00: { name: 'Lumen Field', city: 'Seattle', lat: 47.5952, lon: -122.3316, tz: 'America/Los_Angeles', roof: 'outdoors' },
  SFO01: { name: "Levi's Stadium", city: 'Santa Clara, Calif.', lat: 37.4030, lon: -121.9700, tz: 'America/Los_Angeles', roof: 'outdoors' },
  TAM00: { name: 'Raymond James Stadium', city: 'Tampa', lat: 27.9759, lon: -82.5033, tz: 'America/New_York', roof: 'outdoors' },
  VEG00: { name: 'Allegiant Stadium', city: 'Las Vegas', lat: 36.0909, lon: -115.1833, tz: 'America/Los_Angeles', roof: 'dome' },
  WAS00: { name: 'Northwest Stadium', city: 'Landover, Md.', lat: 38.9077, lon: -76.8645, tz: 'America/New_York', roof: 'outdoors' },
  // International and neutral sites in the 2025-26 schedules.
  LON00: { name: 'Wembley Stadium', city: 'London', lat: 51.5560, lon: -0.2796, tz: 'Europe/London', roof: 'outdoors' },
  LON02: { name: 'Tottenham Hotspur Stadium', city: 'London', lat: 51.6043, lon: -0.0664, tz: 'Europe/London', roof: 'outdoors' },
  MAD01: { name: 'Santiago Bernabeu', city: 'Madrid', lat: 40.4531, lon: -3.6883, tz: 'Europe/Madrid', roof: 'retractable' },
  MEL00: { name: 'Melbourne Cricket Ground', city: 'Melbourne', lat: -37.8200, lon: 144.9834, tz: 'Australia/Melbourne', roof: 'outdoors' },
  MEX00: { name: 'Estadio Banorte', city: 'Mexico City', lat: 19.3029, lon: -99.1505, tz: 'America/Mexico_City', roof: 'outdoors' },
  MUN01: { name: 'Allianz Arena', city: 'Munich', lat: 48.2188, lon: 11.6247, tz: 'Europe/Berlin', roof: 'outdoors' },
  BER00: { name: 'Olympiastadion', city: 'Berlin', lat: 52.5147, lon: 13.2395, tz: 'Europe/Berlin', roof: 'outdoors' },
  PAR00: { name: 'Stade de France', city: 'Paris', lat: 48.9245, lon: 2.3602, tz: 'Europe/Paris', roof: 'outdoors' },
  RIO00: { name: 'Maracana Stadium', city: 'Rio de Janeiro', lat: -22.9122, lon: -43.2302, tz: 'America/Sao_Paulo', roof: 'outdoors' },
};

/** Each club's home stadium id. */
export const HOME_STADIUM = {
  ARI: 'PHO00', ATL: 'ATL97', BAL: 'BAL00', BUF: 'BUF00', CAR: 'CAR00', CHI: 'CHI98', CIN: 'CIN00', CLE: 'CLE00',
  DAL: 'DAL00', DEN: 'DEN00', DET: 'DET00', GB: 'GNB00', HOU: 'HOU00', IND: 'IND00', JAX: 'JAX00', KC: 'KAN00',
  LA: 'LAX01', LAC: 'LAX01', LV: 'VEG00', MIA: 'MIA00', MIN: 'MIN01', NE: 'BOS00', NO: 'NOR00', NYG: 'NYC01',
  NYJ: 'NYC01', PHI: 'PHI00', PIT: 'PIT00', SEA: 'SEA00', SF: 'SFO01', TB: 'TAM00', TEN: 'NAS00', WAS: 'WAS00',
};

const ZONE = { 'America/New_York': 'Eastern', 'America/Detroit': 'Eastern', 'America/Indiana/Indianapolis': 'Eastern',
  'America/Chicago': 'Central', 'America/Denver': 'Mountain', 'America/Phoenix': 'Arizona', 'America/Los_Angeles': 'Pacific',
  'Europe/London': 'London', 'Europe/Madrid': 'Madrid', 'Europe/Berlin': 'Central European', 'Europe/Paris': 'Central European',
  'Australia/Melbourne': 'Melbourne', 'America/Mexico_City': 'Mexico City', 'America/Sao_Paulo': 'Brasilia' };
export const zoneName = (tz) => ZONE[tz] || tz;

/** Hours a clock in `tz` is ahead of UTC at `when`. */
function utcOffsetHours(tz, when) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(when).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((asUtc - when.getTime()) / 3_600_000);
}

/** Hours between two time zones at a moment (positive: `to` is ahead of `from`). */
export function hoursApart(fromTz, toTz, when = new Date()) {
  if (!fromTz || !toTz) return null;
  return utcOffsetHours(toTz, when) - utcOffsetHours(fromTz, when);
}

export function milesBetween(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return null;
  const rad = (d) => d * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.asin(Math.sqrt(h)) / 10) * 10;
}

async function fetchText(fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

/**
 * Every game in nflverse's schedule file, all seasons, as parsed rows. A failed download serves the last copy on
 * disk; with no copy at all the result says so instead of reading as an empty schedule.
 */
export async function getNflSchedule({ fetchImpl = globalThis.fetch, force = false } = {}) {
  if (!force && memo && memo.expires > Date.now()) return memo.value;
  let text = null;
  let stale = false;
  try {
    if (!force && existsSync(DISK_FILE) && Date.now() - statSync(DISK_FILE).mtimeMs < TTL_MS) text = readFileSync(DISK_FILE, 'utf8');
  } catch { /* fall through to the download */ }
  if (!text) {
    try {
      text = await fetchText(fetchImpl);
      try { if (!existsSync(DISK_DIR)) mkdirSync(DISK_DIR, { recursive: true }); writeFileSync(DISK_FILE, text); } catch { /* cache only */ }
    } catch (error) {
      try { if (existsSync(DISK_FILE)) { text = readFileSync(DISK_FILE, 'utf8'); stale = true; } } catch { /* honest failure below */ }
      if (!text) return { unavailable: true, reason: `Could not read nflverse's schedule file: ${error.message}` };
    }
  }
  const value = { rows: parseCsv(text), stale };
  memo = { value, expires: Date.now() + TTL_MS };
  return value;
}

/** This game's schedule row: the season's game between these two clubs nearest the kickoff. */
export function scheduleRowFor(schedule, season, homeCode, awayCode, kickoff = null) {
  const rows = (schedule?.rows || []).filter((r) => Number(r.season) === Number(season)
    && ((r.home_team === homeCode && r.away_team === awayCode) || (r.home_team === awayCode && r.away_team === homeCode)));
  if (!rows.length) return null;
  if (!kickoff) return rows[0];
  const t = Date.parse(kickoff);
  return rows.sort((a, b) => Math.abs(Date.parse(a.gameday) - t) - Math.abs(Date.parse(b.gameday) - t))[0];
}

/**
 * Marks each of a team's results that was played at a neutral site (London, Rio, Melbourne...) from the schedule:
 * BDL lists one club as home for those games, so a Wembley game read as a home game in the records and the game
 * lines (Oct 13 2026 audit). `neutral` carries the city.
 */
export function markNeutralSites(results, schedule, season, teamCode) {
  if (!Array.isArray(results) || !schedule?.rows || !teamCode) return results;
  return results.map((r) => {
    const opp = nflverseCode(r?.opponent);
    const row = opp ? scheduleRowFor(schedule, season, teamCode, opp, r.date) : null;
    if (row?.location !== 'Neutral' || (r.date && Math.abs(Date.parse(row.gameday) - Date.parse(r.date)) > 3 * 86400000)) return r;
    return { ...r, neutral: siteFor(row)?.city || row.stadium || 'neutral site' };
  });
}

/** The stadium a schedule row names, from the table above; the home club's own stadium when the id is unknown. */
export function siteFor(row) {
  if (!row) return null;
  // A neutral-site game can carry the home club's stadium id with the real stadium's name (audit, Oct 13 2026:
  // 2026_05_PHI_JAX in London carried JAX00), so a neutral site is matched by name first.
  if (row.location === 'Neutral') {
    const byName = Object.entries(NFL_STADIUMS).find(([, v]) => v.name === row.stadium);
    if (byName) return { id: byName[0], ...byName[1], neutral: true };
  }
  const known = NFL_STADIUMS[row.stadium_id];
  if (known) return { id: row.stadium_id, ...known, neutral: row.location === 'Neutral' };
  const home = NFL_STADIUMS[HOME_STADIUM[row.home_team]];
  return home ? { id: HOME_STADIUM[row.home_team], ...home, name: row.stadium || home.name, neutral: row.location === 'Neutral', assumed: true } : null;
}

/** One club's side of a schedule row: its rest days, whether it was home, and its trip. */
export function sideFacts(row, code) {
  if (!row || !code) return null;
  const home = row.home_team === code;
  const rest = Number(home ? row.home_rest : row.away_rest);
  const site = siteFor(row);
  const own = NFL_STADIUMS[HOME_STADIUM[code]];
  const atHome = home && row.location !== 'Neutral';
  const miles = atHome ? 0 : milesBetween(own, site);
  const kickoff = row.gameday ? new Date(`${row.gameday}T12:00:00Z`) : new Date();
  const zones = own && site && !atHome ? hoursApart(own.tz, site.tz, kickoff) : 0;
  return { home, atHome, rest: Number.isFinite(rest) ? rest : null, site, miles, zones, ownTz: own?.tz || null };
}

/** "6 days' rest", "off a bye (13 days)", "a short week (4 days)". */
export function restPhrase(days) {
  if (!Number.isFinite(days)) return null;
  if (days >= 13) return `off a bye (${days} days)`;
  if (days <= 5) return `a short week (${days} days)`;
  return `${days} days' rest`;
}

/** "about 2,450 miles, 3 hours behind home" for a club away from home; null at home. */
export function tripPhrase(facts) {
  if (!facts || facts.atHome || facts.miles == null) return null;
  if (facts.miles === 0) return 'the visitor in its own stadium';
  const n = Math.abs(facts.zones || 0);
  const zones = facts.zones
    ? `, ${zoneName(facts.site?.tz)} time, ${n} hour${n === 1 ? '' : 's'} ${facts.zones > 0 ? 'ahead of' : 'behind'} their home clock`
    : ', same time zone';
  return `about ${facts.miles.toLocaleString('en-US')} miles from home${zones}`;
}

/**
 * The head coach of `code` in this season's schedule: his name, how many seasons in a row he has coached the club
 * through this one, and any change of head coach during this season.
 */
export function headCoach(schedule, code, season) {
  const rows = (schedule?.rows || []).filter((r) => r.home_team === code || r.away_team === code);
  const coachOf = (r) => (r.home_team === code ? r.home_coach : r.away_coach) || null;
  const thisSeason = rows.filter((r) => Number(r.season) === Number(season) && r.game_type === 'REG').sort((a, b) => Number(a.week) - Number(b.week));
  if (!thisSeason.length) return null;
  const played = thisSeason.filter((r) => r.home_score !== '' && r.home_score != null && r.home_score !== 'NA');
  const current = coachOf(played.at(-1) || thisSeason[0]);
  if (!current) return null;
  // Seasons in a row, through this one, in which he coached the club at least one game.
  let seasons = 0;
  for (let y = Number(season); rows.some((r) => Number(r.season) === y && coachOf(r) === current); y -= 1) seasons += 1;
  const replaced = played.filter((r) => coachOf(r) !== current);
  const change = replaced.length ? { from: coachOf(replaced.at(-1)), sinceWeek: Number(played.find((r, i) => i > played.indexOf(replaced.at(-1)) && coachOf(r) === current)?.week) || null } : null;
  return { name: current, seasons, change };
}
