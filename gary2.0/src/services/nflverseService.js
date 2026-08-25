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

/**
 * nflverse release TAGS do not always equal the file prefix. The roster files
 * live under the tag "rosters" (plural) but are named roster_2025.csv
 * (singular), so deriving the tag from the filename 404s — which loadRelease
 * reports as "the season has not started", a wrong and very believable
 * message. Anything that differs is declared here rather than assumed.
 */
const RELEASE_TAGS = { roster: 'rosters' };

async function loadRelease(asset, season, { fetchImpl = globalThis.fetch } = {}) {
  const key = `${asset}_${season}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const tag = RELEASE_TAGS[asset] || asset;
  const url = `${RELEASE_BASE}/${tag}/${asset}_${season}.csv`;
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


// ═══════════════════════════════════════════════════════════════════════════
// ROSTER TURNOVER — what the prior season's numbers no longer describe
//
// THE OPENING-WEEKEND PROBLEM, second half (Aug 25 2026). On Sep 9 there is
// no 2026 play-by-play, so the season splits come from 2025 and are labelled
// as 2025. That label is honest but incomplete: it says the roster MAY have
// changed without saying what changed, which leaves the desk unable to judge
// how much of last year's profile still applies.
//
// nflverse publishes a roster per season, so the answer is available: name
// the players who produced last year's numbers and are no longer here.
//
// WEIGHTED BY WHO ACTUALLY PLAYED. A raw comparison is useless — Detroit's
// 2025 and 2026 rosters differ by 55 players, almost all camp bodies. Snap
// share is what separates a departed left tackle from a departed sixth
// receiver, so departures are ranked by the share of snaps they took last
// season and anyone below the floor is counted but not named.
// ═══════════════════════════════════════════════════════════════════════════

/** Highest snap share a player reached in a season, offence or defence. */
function peakSnapShare(snapRows, playerName) {
  let best = 0;
  for (const row of snapRows) {
    if (row.player !== playerName) continue;
    const off = Number(row.offense_pct);
    const def = Number(row.defense_pct);
    if (Number.isFinite(off) && off > best) best = off;
    if (Number.isFinite(def) && def > best) best = def;
  }
  return best;
}

/**
 * Who left and who arrived between two seasons.
 *
 * @param {string} teamName
 * @param {number} priorSeason   the season the STATS come from
 * @param {number} currentSeason the season being played
 * @param {{snapFloor?:number}} opts  minimum prior snap share to name a departure
 */
export async function getRosterTurnover(teamName, priorSeason, currentSeason, { snapFloor = 0.3, ...opts } = {}) {
  const code = nflverseCode(teamName);
  if (!code) return { unavailable: true, reason: `No nflverse team code for "${teamName}".` };

  const [prior, current] = await Promise.all([
    loadRelease('roster', priorSeason, opts),
    loadRelease('roster', currentSeason, opts)
  ]);
  if (prior.unavailable) return prior;
  if (current.unavailable) return current;

  // A player with no gsis_id cannot be matched across seasons, and guessing by
  // name would silently merge two people. Unmatched rows are counted, never
  // reported as departures.
  const onTeam = (file) => file.rows.filter((r) => r.team === code);
  const priorRows = onTeam(prior);
  const currentRows = onTeam(current);
  const currentIds = new Set(currentRows.map((r) => r.gsis_id).filter(Boolean));
  const priorIds = new Set(priorRows.map((r) => r.gsis_id).filter(Boolean));

  const unmatched = priorRows.filter((r) => !r.gsis_id).length;

  // Snap share is optional context: a missing snap file must not turn a real
  // departure list into an empty one.
  const snaps = await loadRelease('snap_counts', priorSeason, opts);
  const snapRows = snaps.unavailable ? [] : snaps.rows.filter((r) => r.team === code);

  const departed = priorRows
    .filter((r) => r.gsis_id && !currentIds.has(r.gsis_id))
    .map((r) => ({
      player: r.full_name,
      position: r.depth_chart_position || r.position || null,
      peak_snap_share: snapRows.length ? Number(peakSnapShare(snapRows, r.full_name).toFixed(3)) : null
    }))
    .sort((a, b) => (b.peak_snap_share || 0) - (a.peak_snap_share || 0));

  const significant = snapRows.length
    ? departed.filter((p) => (p.peak_snap_share || 0) >= snapFloor)
    : departed.slice(0, 10);

  const arrived = currentRows
    .filter((r) => r.gsis_id && !priorIds.has(r.gsis_id))
    .map((r) => ({
      player: r.full_name,
      position: r.depth_chart_position || r.position || null,
      years_experience: Number(r.years_exp) || 0
    }))
    // Veterans first: a signed starter changes the profile, a rookie
    // seventh-rounder mostly does not.
    .sort((a, b) => b.years_experience - a.years_experience)
    .slice(0, 10);

  return {
    team: teamName,
    stats_season: priorSeason,
    current_season: currentSeason,
    departed_total: departed.length,
    departed_significant: significant,
    arrived_notable: arrived,
    ...(snapRows.length ? {} : { snap_note: `No ${priorSeason} snap counts, so departures could not be weighted by playing time; the ten listed are unranked.` }),
    ...(unmatched ? { unmatched_prior_rows: unmatched } : {}),
    note: significant.length
      ? `${significant.length} player${significant.length === 1 ? '' : 's'} who took at least ${Math.round(snapFloor * 100)}% of snaps in ${priorSeason} are no longer on the roster. Any ${priorSeason} team rate below describes a unit that included them.`
      : `No player who took at least ${Math.round(snapFloor * 100)}% of ${priorSeason} snaps has left. The ${priorSeason} rates describe substantially the same personnel.`
  };
}

/** Test seam. */
export function _clearNflverseCache() {
  cache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO FOOTBALL REFERENCE ADVANCED STATS — pressure and coverage (Aug 25 2026)
//
// THE GAP THIS CLOSES. PRESSURE_RATE could only report sacks, and said so
// honestly: "QB hits and true pressure rate are charted products. No feed we
// hold publishes them." That was wrong about where to look. nflverse mirrors
// PFR's charting as a free CSV, and it carries pressures, hurries, QB
// knockdowns, blitz counts, pocket time, and — the part with no substitute —
// per-defender COVERAGE: targets, completion rate allowed, yards per target,
// touchdowns and interceptions, and passer rating allowed.
//
// Why pressure matters more than sacks: Zach Allen finished 2025 with 32 QB
// hits and 7 sacks. A desk reading sacks alone calls Denver's rush ordinary.
// It was not ordinary; the finish simply did not land. And Brian Burns was
// blitzed 39 times to Myles Garrett's 1 for comparable production — the same
// number means different things about the scheme behind it.
//
// Why coverage matters: it is the only per-player defensive weakness in any
// feed we hold. Brandon Stephens allowed 10 touchdowns and a 134.3 passer
// rating on 85 targets in 2025. That is a targetable matchup, and until now
// it was invisible to the desk.
//
// A TRAP WORTH NAMING. These two files spell the team column DIFFERENTLY —
// the defensive file uses `tm`, the passing file uses `team`. Cross-reading
// them returns undefined, not an error, which is precisely the silent-blank
// failure this audit keeps finding. The column is therefore declared per
// file below rather than assumed, and a test asserts both resolve.
// ═══════════════════════════════════════════════════════════════════════════

/** Per-file column spellings. Never assume these agree. */
const PFR_FILES = {
  def: { asset: 'advstats_season_def', teamColumn: 'tm' },
  pass: { asset: 'advstats_season_pass', teamColumn: 'team' }
};

/**
 * PFR advanced stats are published as ONE file covering every season, not one
 * file per season, so loadRelease's `${asset}_${season}.csv` shape does not
 * apply here.
 */
async function loadPfr(kind, { fetchImpl = globalThis.fetch } = {}) {
  const spec = PFR_FILES[kind];
  if (!spec) return { unavailable: true, reason: `Unknown PFR file "${kind}".` };
  const key = `pfr_${kind}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = `${RELEASE_BASE}/pfr_advstats/${spec.asset}.csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let value;
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      value = { unavailable: true, reason: `nflverse returned HTTP ${response.status} for ${spec.asset}.csv.` };
    } else {
      const rows = parseCsv(await response.text());
      if (rows.length && !(spec.teamColumn in rows[0])) {
        // The column spelling changed upstream. Say so rather than returning
        // rows whose team can never be matched.
        value = { unavailable: true, reason: `${spec.asset}.csv no longer has a "${spec.teamColumn}" column; PFR advanced stats need remapping.` };
      } else {
        value = { rows, teamColumn: spec.teamColumn };
      }
    }
  } catch (error) {
    return { unavailable: true, reason: `Could not reach nflverse for ${spec.asset}.csv: ${error.message}` };
  } finally {
    clearTimeout(timer);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

const pfrNum = (v) => {
  if (v === '' || v == null || v === 'NA') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * A team's pass rush and coverage for one season.
 *
 * @returns {Promise<{unavailable?:true, reason?:string, pass_rush?:Array, coverage?:Array}>}
 */
export async function getPassRushAndCoverage(teamName, season, opts = {}) {
  const code = nflverseCode(teamName);
  if (!code) return { unavailable: true, reason: `No nflverse team code for "${teamName}".` };

  const file = await loadPfr('def', opts);
  if (file.unavailable) return file;

  const rows = file.rows.filter((r) => String(r.season) === String(season) && r[file.teamColumn] === code);
  if (rows.length === 0) {
    return { unavailable: true, reason: `PFR has no ${season} defensive charting rows for ${teamName} yet.` };
  }

  const pass_rush = rows
    .map((r) => ({
      player: r.player,
      position: r.pos || null,
      games: pfrNum(r.g),
      pressures: pfrNum(r.prss),
      hurries: pfrNum(r.hrry),
      qb_hits: pfrNum(r.qbkd),
      sacks: pfrNum(r.sk),
      blitzes: pfrNum(r.bltz),
      missed_tackle_pct: pfrNum(r.m_tkl_percent)
    }))
    .filter((p) => (p.pressures || 0) > 0 || (p.sacks || 0) > 0)
    .sort((a, b) => (b.pressures || 0) - (a.pressures || 0))
    .slice(0, 8);

  const coverage = rows
    .map((r) => ({
      player: r.player,
      position: r.pos || null,
      targets: pfrNum(r.tgt),
      completions_allowed: pfrNum(r.cmp),
      completion_pct_allowed: pfrNum(r.cmp_percent),
      yards_allowed: pfrNum(r.yds),
      yards_per_target: pfrNum(r.yds_tgt),
      touchdowns_allowed: pfrNum(r.td),
      interceptions: pfrNum(r.int),
      passer_rating_allowed: pfrNum(r.rat),
      average_depth_of_target: pfrNum(r.dadot),
      missed_tackle_pct: pfrNum(r.m_tkl_percent)
    }))
    // A rating allowed over four targets says nothing. Twenty is the floor at
    // which a defender's coverage line starts describing him.
    .filter((c) => (c.targets || 0) >= 20)
    .sort((a, b) => (b.targets || 0) - (a.targets || 0))
    .slice(0, 8);

  return {
    season,
    team: teamName,
    pass_rush,
    coverage,
    source: 'Pro Football Reference charting via nflverse'
  };
}

/**
 * How much pressure a team's quarterbacks actually face, and how they throw
 * under it. This is the offensive-line read that PASS_BLOCK_WIN_RATE had to
 * decline.
 */
export async function getQbPressureProfile(teamName, season, opts = {}) {
  const code = nflverseCode(teamName);
  if (!code) return { unavailable: true, reason: `No nflverse team code for "${teamName}".` };

  const file = await loadPfr('pass', opts);
  if (file.unavailable) return file;

  const rows = file.rows
    .filter((r) => String(r.season) === String(season) && r[file.teamColumn] === code)
    .map((r) => ({
      player: r.player,
      pass_attempts: pfrNum(r.pass_attempts),
      pressure_pct: pfrNum(r.pressure_pct),
      times_pressured: pfrNum(r.times_pressured),
      times_hit: pfrNum(r.times_hit),
      times_hurried: pfrNum(r.times_hurried),
      times_blitzed: pfrNum(r.times_blitzed),
      pocket_time_seconds: pfrNum(r.pocket_time),
      bad_throw_pct: pfrNum(r.bad_throw_pct),
      on_target_pct: pfrNum(r.on_tgt_pct),
      drop_pct: pfrNum(r.drop_pct),
      play_action_attempts: pfrNum(r.pa_pass_att),
      intended_air_yards_per_attempt: pfrNum(r.intended_air_yards_per_pass_attempt)
    }))
    .filter((r) => (r.pass_attempts || 0) > 0)
    .sort((a, b) => (b.pass_attempts || 0) - (a.pass_attempts || 0));

  if (rows.length === 0) {
    return { unavailable: true, reason: `PFR has no ${season} passing charting rows for ${teamName} yet.` };
  }
  return { season, team: teamName, quarterbacks: rows, source: 'Pro Football Reference charting via nflverse' };
}
