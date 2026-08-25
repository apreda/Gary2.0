/**
 * nflverse — the NFL practice report and snap counts (Aug 25 2026).
 *
 * THE GAP THIS CLOSES. BDL's injury feed gives a status and a free-text
 * comment and nothing else. "Questionable" on its own is close to noise: in
 * the 2025 season 321 Questionable players had practiced FULLY, 758 were
 * limited, and only 171 did not practice at all. Those are three completely
 * different reads and BDL renders them identically. The practice report is
 * the single most informative pregame availability signal in the NFL, and it
 * is the closest thing football has to MLB's confirmed-lineup gate.
 *
 * Free, public, no key, no account: nflverse publishes season CSVs on GitHub
 * releases. One row per player per week carrying report_status (Out /
 * Doubtful / Questionable) beside practice_status (Did Not Participate /
 * Limited / Full), plus the injury itself — and even non-injury entries like
 * "Not injury related - resting player", which no injury feed reports.
 *
 * NOT A LIVE API. These are files that refresh through the week, so this is
 * week-grain evidence, not minute-grain. The inactives list at 90 minutes
 * before kickoff is still the only truth about who dresses, and nothing here
 * claims otherwise.
 *
 * A season's file does not exist until that season starts (2026 is a 404
 * today; Week 1 is Sep 9). That is reported as a stated fact, never as an
 * empty result — a missing file must not read as "nobody is hurt".
 */

const RELEASE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 30 * 60 * 1000; // files refresh through the week, not by the minute

const cache = new Map();

/** nflverse uses 3-letter codes; the rest of the pipeline uses full names. */
export const NFLVERSE_TEAM_CODES = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LA', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS'
};

export function nflverseCode(teamName) {
  if (!teamName) return null;
  if (NFLVERSE_TEAM_CODES[teamName]) return NFLVERSE_TEAM_CODES[teamName];
  const wanted = String(teamName).trim().toLowerCase();
  const hits = Object.entries(NFLVERSE_TEAM_CODES).filter(([full]) => {
    const n = full.toLowerCase();
    return n === wanted || n.endsWith(` ${wanted}`);
  });
  return hits.length === 1 ? hits[0][1] : null;
}

/** Minimal RFC4180 parse — nflverse quotes fields containing commas. */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function loadRelease(asset, season, { fetchImpl = globalThis.fetch } = {}) {
  const key = `${asset}_${season}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = `${RELEASE_BASE}/${asset}/${asset}_${season}.csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let value;
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (response.status === 404) {
      // The season has not started. A stated fact, never an empty list.
      value = { unavailable: true, reason: `nflverse has not published ${asset}_${season}.csv yet — that file appears once the ${season} season begins.` };
    } else if (!response.ok) {
      value = { unavailable: true, reason: `nflverse returned HTTP ${response.status} for ${asset}_${season}.csv.` };
    } else {
      value = { rows: parseCsv(await response.text()) };
    }
  } catch (error) {
    // A failed fetch is NOT an empty result.
    return { unavailable: true, reason: `Could not reach nflverse for ${asset}_${season}.csv: ${error.message}` };
  } finally {
    clearTimeout(timer);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

const PRACTICE_SHORT = {
  'Did Not Participate In Practice': 'DNP',
  'Limited Participation in Practice': 'Limited',
  'Full Participation in Practice': 'Full'
};

/**
 * The practice report for one team's week.
 *
 * @returns {Promise<{unavailable?:true, reason?:string, week?:number, players?:Array}>}
 */
export async function getPracticeReport(teamName, season, week = null, opts = {}) {
  const code = nflverseCode(teamName);
  if (!code) return { unavailable: true, reason: `No nflverse team code for "${teamName}".` };

  const file = await loadRelease('injuries', season, opts);
  if (file.unavailable) return file;

  const teamRows = file.rows.filter((r) => r.team === code);
  if (teamRows.length === 0) {
    return { unavailable: true, reason: `No ${season} practice rows for ${teamName}.` };
  }
  // week === null means "the most recent report filed", which is what a
  // bettor reads on game week. An explicit week is honoured exactly.
  const targetWeek = (week === null || week === undefined)
    ? Math.max(...teamRows.map((r) => Number(r.week) || 0))
    : Number(week);
  const rows = teamRows.filter((r) => Number(r.week) === targetWeek);
  if (rows.length === 0) {
    return { unavailable: true, reason: `No ${season} week ${targetWeek} practice rows for ${teamName} — that week's report may not be filed yet.` };
  }

  const players = rows.map((r) => ({
    name: r.full_name,
    position: r.position || null,
    game_status: r.report_status || null,
    practice: PRACTICE_SHORT[r.practice_status] || r.practice_status || null,
    injury: r.report_primary_injury || r.practice_primary_injury || null,
    secondary: r.report_secondary_injury || null
  }));

  return { week: targetWeek, team: teamName, players };
}

/**
 * Snap share for one team's most recent games — who is ACTUALLY on the field,
 * which a depth chart cannot tell you.
 */
export async function getSnapShare(teamName, season, { week = null, minPct = 0.25, ...opts } = {}) {
  const code = nflverseCode(teamName);
  if (!code) return { unavailable: true, reason: `No nflverse team code for "${teamName}".` };

  const file = await loadRelease('snap_counts', season, opts);
  if (file.unavailable) return file;

  let rows = file.rows.filter((r) => r.team === code);
  if (week !== null) rows = rows.filter((r) => Number(r.week) === Number(week));
  if (rows.length === 0) {
    return { unavailable: true, reason: `No ${season} snap-count rows for ${teamName}${week !== null ? ` in week ${week}` : ''}.` };
  }

  const latestWeek = Math.max(...rows.map((r) => Number(r.week) || 0));
  const inWeek = rows.filter((r) => Number(r.week) === latestWeek);
  const pct = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : null; };

  const shape = (side) => inWeek
    .filter((r) => Number(r[`${side}_pct`]) >= minPct)
    .sort((a, b) => Number(b[`${side}_pct`]) - Number(a[`${side}_pct`]))
    .slice(0, 12)
    .map((r) => `${r.player} ${r.position || ''} ${pct(r[`${side}_pct`])}%`.replace(/\s+/g, ' ').trim());

  return {
    team: teamName,
    week: latestWeek,
    opponent: inWeek[0]?.opponent || null,
    offense: shape('offense'),
    defense: shape('defense')
  };
}

/** Test seam. */
export function _clearNflverseCache() {
  cache.clear();
}
