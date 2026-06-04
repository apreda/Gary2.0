// gary2.0/src/services/insights/computers/wcForm.js
//
// LANE: wcForm  (category token emitted: streak)
// "A national team is carrying real momentum into a World Cup fixture — a long
//  unbeaten run, a winless skid, or a clean last-5 W-D-L line."
//
// SCOPE: 2026 FIFA World Cup. league === 'wc'. ctx.games = the day's RAW FIFA
// match objects from fifaWorldCupService.getMatchesForDate(dateStr).
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-04 — quoted,
// not guessed):
//   * RAW MATCH object (ctx.games[i]): {
//       id, datetime ("2026-06-11T19:00:00.000Z" UTC ISO), status ('scheduled'
//       |'completed'), stage:{name}, group:{name}, round_name,
//       home_team:{id,name,abbreviation,country_code,confederation},
//       away_team:{...same...}, season:{year}, plus the half-score fields read
//       by getRegulationScore().
//     }
//   * getMatchTeamForm([matchId]): the production soccer fetcher reads
//     f.team_id / f.avg_rating / f.position / f.value off these rows, BUT the
//     endpoint returns [] for not-yet-played fixtures (verified: 0 rows for the
//     June 11 opener). We attempt it first and only use it when it actually
//     carries prior-results form for BOTH sides; otherwise we fall back.
//   * FALLBACK — getMatches({ seasons:[2018,2022,2026], teamIds:[id] }): returns
//     that nation's matches across ALL World Cup editions. TEAM IDS ARE STABLE
//     ACROSS EDITIONS (verified: Argentina = id 37 in 2018, 2022 and 2026), so a
//     team's full tournament history comes back. We keep status === 'completed'
//     rows and read the 90' result via getRegulationScore(match) -> {home,away}.
//
// Form is computed from each side's most recent completed internationals (last
// 5 W-D-L) plus the active unbeaten/winless streak length. We surface the side
// with the more notable run. tone good (unbeaten) / bad (winless).
//
// Defensive contract: any missing piece -> skip that side/match silently and
// never throw. Pre-tournament (today June 4) ctx.games is empty -> return [].
// Emits a one-line examined/emitted summary for 0-row diagnosability.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore, pickVariant } from '../shared.js';

const wc = fifaWorldCupService;

// Tunables.
const FORM_EDITIONS = [2018, 2022, 2026]; // editions to pull a nation's history from
const LAST_N = 5;                          // recent W-D-L window
const MIN_FORM_MATCHES = 3;                // need at least this many completed games
const MIN_NOTABLE_STREAK = 3;              // only surface streaks this long or more
const RELEVANCE_BASE = 55;
const RELEVANCE_PER = 5;                   // +5 per game in the streak
const RELEVANCE_CAP = 85;

export async function computeWcForm(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  const rows = [];
  const stats = { examined: 0, emitted: 0 };

  for (const match of games) {
    try {
      const row = await formRowForMatch(match, stats);
      if (row) rows.push(row);
    } catch (err) {
      console.error('[wcForm] match error:', err?.message || err);
      // continue to next match
    }
  }

  stats.emitted = rows.length;
  console.log(`[wcForm] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

async function formRowForMatch(match, stats) {
  const matchId = match?.id;
  if (matchId == null) return null;

  const home = match.home_team;
  const away = match.away_team;
  if (!home?.id || !away?.id) return null; // TBD knockout slot — skip
  if (stats) stats.examined += 1;

  const label = wcGameLabel(match);

  // Build form for each side. Prefer the structured form endpoint when it
  // actually carries prior-results form for the side; otherwise fall back to
  // completed-match history.
  const [homeForm, awayForm] = await Promise.all([
    buildSideForm(matchId, home.id),
    buildSideForm(matchId, away.id),
  ]);

  // Choose the more notable run between the two sides. Notability = streak
  // length first, then the form-window record. A side with no usable history
  // contributes nothing.
  const candidates = [];
  if (homeForm) candidates.push({ side: home, form: homeForm });
  if (awayForm) candidates.push({ side: away, form: awayForm });
  if (!candidates.length) return null;

  candidates.sort((a, b) => streakRank(b.form) - streakRank(a.form));
  const top = candidates[0];
  const f = top.form;

  // Only emit when there is a genuinely notable streak; a flat 2-2-1 line with
  // no run is not a hub-worthy edge.
  if (f.streakLen < MIN_NOTABLE_STREAK) return null;

  const teamName = top.side.name || 'The side';
  const unbeaten = f.streakType === 'unbeaten';
  const tone = unbeaten ? TONES.HOT : TONES.COLD;
  const value = unbeaten ? `${f.streakLen}-game unbeaten` : `${f.streakLen}-game winless`;

  return makeRow({
    category: 'streak',
    headline: buildHeadline(teamName, f),
    detail: buildDetail(teamName, f),
    game: label,
    value,
    tone,
    relevance_score: clampScore(
      Math.min(RELEVANCE_CAP, RELEVANCE_BASE + RELEVANCE_PER * f.streakLen),
    ),
    team_id: top.side.id,
    game_id: matchId,
  });
}

/**
 * Form for one side. Tries the structured form endpoint first; if it does not
 * return a usable prior-results form, falls back to the nation's completed
 * World Cup matches (across editions). Returns a form summary object or null.
 */
async function buildSideForm(matchId, teamId) {
  // The endpoint is per-MATCH but its rows describe both participating teams'
  // pre-match form (team_id keyed). It is empty for unplayed fixtures.
  let formRows = [];
  try {
    formRows = (await wc.getMatchTeamForm([matchId])) || [];
  } catch {
    formRows = [];
  }
  // Only trust it if it actually carries a recent-results breakdown we can read
  // into a W-D-L line. The documented soccer fetcher only reads scalar summary
  // fields (avg_rating / position / value) off these rows — none of which is a
  // results sequence — so we do NOT attempt to derive a streak from them and
  // always fall back to completed-match history for the W-D-L + streak math.
  void formRows;

  return formFromCompletedMatches(teamId);
}

/**
 * Pull a nation's completed World Cup matches across editions and reduce to a
 * last-N W-D-L line plus the active unbeaten/winless streak.
 */
async function formFromCompletedMatches(teamId) {
  let matches = [];
  try {
    matches = (await wc.getMatches({ seasons: FORM_EDITIONS, teamIds: [teamId] })) || [];
  } catch {
    return null;
  }

  // Completed matches only, most recent first (datetime is an ISO UTC string).
  const completed = matches
    .filter((m) => m && m.status === 'completed' && (m.home_team?.id === teamId || m.away_team?.id === teamId))
    .sort((a, b) => String(b.datetime || '').localeCompare(String(a.datetime || '')));

  if (completed.length < MIN_FORM_MATCHES) return null;

  // Per-match result from this team's perspective, using the 90' regulation
  // score (getRegulationScore excludes extra time). Skip matches with no usable
  // regulation score rather than guess.
  const results = [];
  for (const m of completed) {
    const reg = wc.getRegulationScore(m);
    if (reg.home == null || reg.away == null) continue;
    const isHome = m.home_team?.id === teamId;
    const gf = isHome ? reg.home : reg.away;
    const ga = isHome ? reg.away : reg.home;
    results.push(gf > ga ? 'W' : gf === ga ? 'D' : 'L');
  }
  if (results.length < MIN_FORM_MATCHES) return null;

  const last = results.slice(0, LAST_N);
  const w = last.filter((r) => r === 'W').length;
  const d = last.filter((r) => r === 'D').length;
  const l = last.filter((r) => r === 'L').length;

  // Active streak from the most recent match backward.
  const unbeatenLen = leadingCount(results, (r) => r === 'W' || r === 'D');
  const winlessLen = leadingCount(results, (r) => r === 'L' || r === 'D');
  let streakType = null;
  let streakLen = 0;
  if (results[0] === 'D') {
    // A draw is ambiguous; classify the run by which leading streak is longer.
    if (unbeatenLen >= winlessLen) { streakType = 'unbeaten'; streakLen = unbeatenLen; }
    else { streakType = 'winless'; streakLen = winlessLen; }
  } else if (results[0] === 'W') {
    streakType = 'unbeaten';
    streakLen = unbeatenLen;
  } else {
    streakType = 'winless';
    streakLen = winlessLen;
  }

  return {
    w, d, l,
    lastN: last,
    streakType,
    streakLen,
    sampleSize: results.length,
  };
}

/** Count leading elements that satisfy pred, from the front of the array. */
function leadingCount(arr, pred) {
  let n = 0;
  for (const x of arr) {
    if (pred(x)) n += 1;
    else break;
  }
  return n;
}

/** Rank a form object for "most notable run" selection (streak first). */
function streakRank(form) {
  if (!form) return -1;
  return form.streakLen * 10 + form.w;
}

/** "AWY @ HOM" using 3-letter FIFA codes (split on ' @ ' by the iOS tokenizer). */
function wcGameLabel(match) {
  return `${fifaCode(match?.away_team)} @ ${fifaCode(match?.home_team)}`;
}

/** 3-letter FIFA code: abbreviation -> country_code -> first 3 of name uppercased. */
function fifaCode(team) {
  const code = team?.abbreviation || team?.country_code;
  if (code) return String(code).toUpperCase().slice(0, 3);
  return String(team?.name || 'TBD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'TBD';
}

function buildHeadline(teamName, f) {
  if (f.streakType === 'unbeaten') {
    return `${teamName} are unbeaten in ${f.streakLen} internationals`;
  }
  return `${teamName} are winless in ${f.streakLen} internationals`;
}

/**
 * Plain, factual detail. Adds the last-N W-D-L record and sample size the
 * headline lacks. Three deterministic variants keyed off team id so a slate of
 * fixtures does not read machine-stamped.
 */
function buildDetail(teamName, f) {
  const rec = `${f.w}-${f.d}-${f.l}`;
  const windowN = f.lastN.length;
  const seq = f.lastN.join('-');
  const run = f.streakType === 'unbeaten'
    ? `a ${f.streakLen}-match unbeaten run`
    : `a ${f.streakLen}-match run without a win`;

  const variants = [
    `Across their last ${windowN} World Cup matches they are ${rec} (${seq}), carrying ${run} into this fixture.`,
    `Their last ${windowN} at the World Cup read ${seq} — a ${rec} record and ${run}.`,
    `Recent tournament form sits ${rec} over the last ${windowN} (${seq}), with ${run} live.`,
  ];
  return pickVariant(variants, String(teamName));
}

export default { computeWcForm };
