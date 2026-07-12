// gary2.0/src/services/insights/computers/wcPedigree.js
//
// LANE: wcPedigree  (category token emitted: streak)
// "World Cup pedigree from past editions: which contenders carry real momentum —
//  or scar tissue — out of their last tournament. A defending champion's title
//  run, a group-stage exit, a winless skid in their most recent World Cup games.
//  Shown daily before the 2026 tournament opens and on rest days."
//
// PREVIEW MODE: orchestrator passes ctx = { date, season:2026, league:'wc',
// games: ALL 2026 fixtures, slateGameIds, preview:true, helpers }. We read
// ctx.games for fixture-tagging and pull each contender's past-edition history
// via getMatches({ seasons:[2018,2022], teamIds:[id] }).
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-04 — quoted,
// not guessed):
//   * getFutures() -> 'outright'/'Winner' rows { subject:{id,name}, american_odds }
//     used to pick the ~16 shortest-priced nations (cap the per-nation history
//     calls).
//   * getMatches({ seasons:[2018,2022], teamIds:[id] }) -> that nation's matches
//     across both prior editions. TEAM IDS ARE STABLE ACROSS EDITIONS (verified:
//     Argentina = id 37 in 2018/2022/2026). We keep status==='completed' rows and
//     read the 90' result via getRegulationScore() (full-time fallback for
//     knockout draws decided in ET / on penalties).
//   * ctx.games (RAW 2026 fixtures) -> each nation's FIRST 2026 fixture, so a
//     pedigree row deep-links to a real upcoming game (game + game_id set).
//
// We compute each nation's most-recent-World-Cup run (last edition's last-8 W-D-L
// plus the active unbeaten/winless streak) and emit at most 8 of the most notable
// rows in a deterministic order. tone good (unbeaten/title) / bad (winless/skid).
//
// Defensive contract: any missing piece -> skip that nation silently and never
// throw. No futures / no fixtures -> []. Emits a one-line examined/emitted summary.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore, nameKey } from '../shared.js';

const wc = fifaWorldCupService;

// Tunables.
const PAST_EDITIONS = [2018, 2022]; // prior World Cups to read pedigree from
const CONTENDER_CAP = 16;           // cap per-nation history calls to the ~16 shortest title prices
const LAST_N = 8;                   // recent World Cup W-D-L window
const MIN_MATCHES = 3;              // need at least this many completed WC games
const MIN_NOTABLE_STREAK = 2;       // surface streaks this long or more
const MAX_ROWS = 8;
const RELEVANCE_BASE = 55;
const RELEVANCE_PER = 4;            // +4 per game in the streak
const RELEVANCE_CAP = 78;

export async function computeWcPedigree(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) {
    console.log('[wcPedigree] examined 0, emitted 0');
    return [];
  }

  // TOURNAMENT GATE (founder, Jul 12): once the current edition is underway,
  // this lane goes SILENT — past-edition streaks are stale trivia mid-
  // tournament, and current-edition win streaks are survivorship (every team
  // still alive is on one). Pedigree is preview-phase content only; it comes
  // back before the next edition's first kickoff.
  const currentYear = games[0]?.season?.year
    ?? new Date(games[0]?.datetime || Date.now()).getUTCFullYear();
  const currentEdition = await safe(() => wc.getMatches({ seasons: [currentYear] }), []);
  if ((currentEdition || []).some((m) => m?.status === 'completed')) {
    console.log('[wcPedigree] current edition underway — lane silent (preview-phase content only)');
    return [];
  }

  const futures = await safe(() => wc.getFutures(), []);
  const contenders = topContenders(futures, CONTENDER_CAP);
  if (!contenders.length) {
    console.log('[wcPedigree] examined 0, emitted 0');
    return [];
  }

  // IMPORTANT id-space note: the FUTURES endpoint's subject.id is a SEPARATE id
  // space from the matches/standings team.id (verified 2026-06-04: Argentina is
  // subject.id 2065 in futures but team.id 37 in matches). We therefore resolve
  // each contender's CANONICAL matches team id by NAME (names are stable across
  // every endpoint), and use that id for history + fixture lookups.
  const { idByName, firstFixtureById } = indexTeamsFromGames(games);

  const candidates = [];
  const stats = { examined: 0, emitted: 0 };

  for (const c of contenders) {
    stats.examined += 1;
    try {
      const teamId = idByName.get(nameKey(c.name));
      if (teamId == null) continue; // contender not in the 2026 fixture list
      const fixture = firstFixtureById.get(String(teamId));
      if (!fixture) continue; // must tag to a real upcoming fixture
      const ped = await pedigreeForNation(teamId, c.name);
      if (!ped) continue;
      // The streak IS the insight — a title alone doesn't clear the bar
      // (headlines state data, never trivia; the title is detail context).
      if (ped.streakLen < MIN_NOTABLE_STREAK) continue;
      candidates.push({ ...ped, id: teamId, name: c.name, fixture });
    } catch (err) {
      console.error('[wcPedigree] nation error:', err?.message || err);
      // continue to next nation
    }
  }

  // Most notable first: title winners, then longest streak, then better record.
  // Deterministic tie-break on team id keeps re-runs stable.
  candidates.sort((a, b) => {
    if (!!b.wonTitle !== !!a.wonTitle) return b.wonTitle ? 1 : -1;
    if (b.streakLen !== a.streakLen) return b.streakLen - a.streakLen;
    if (b.w !== a.w) return b.w - a.w;
    return Number(a.id) - Number(b.id);
  });

  const rows = candidates.slice(0, MAX_ROWS).map((c) => buildRow(c));

  stats.emitted = rows.length;
  console.log(`[wcPedigree] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

function buildRow(c) {
  const unbeaten = c.streakType === 'unbeaten';
  const tone = c.wonTitle || unbeaten ? TONES.HOT : TONES.COLD;
  const value = unbeaten ? `W${c.streakLen}` : `L${c.streakLen}`;
  const label = wcGameLabel(c.fixture);

  return makeRow({
    category: 'streak',
    headline: buildHeadline(c),
    detail: buildDetail(c),
    game: label,
    value,
    tone,
    relevance_score: clampScore(
      Math.min(RELEVANCE_CAP, RELEVANCE_BASE + RELEVANCE_PER * c.streakLen),
    ),
    team_id: c.id,
    game_id: c.fixture.id,
  });
}

/**
 * Pull a nation's completed matches from prior editions and reduce to its most
 * recent World Cup edition's run: last-N W-D-L, active unbeaten/winless streak,
 * the edition year, and whether that edition was won outright (knockout final
 * win in the team's latest edition).
 */
async function pedigreeForNation(teamId, teamName) {
  let matches = [];
  try {
    matches = (await wc.getMatches({ seasons: PAST_EDITIONS, teamIds: [teamId] })) || [];
  } catch {
    return null;
  }

  const completed = matches
    .filter((m) => m && m.status === 'completed' && (m.home_team?.id === teamId || m.away_team?.id === teamId))
    .sort((a, b) => String(b.datetime || '').localeCompare(String(a.datetime || '')));

  if (completed.length < MIN_MATCHES) return null;

  // The nation's MOST RECENT edition is what "pedigree" reads off.
  const latestYear = completed[0]?.season?.year ?? null;

  // Per-match W/D/L from this team's perspective (90' regulation, full-time
  // fallback so a knockout decided in ET/penalties still resolves to W/L).
  const results = [];
  for (const m of completed) {
    const r = resultFor(m, teamId);
    if (!r) continue;
    results.push(r);
  }
  if (results.length < MIN_MATCHES) return null;

  const last = results.slice(0, LAST_N).map((r) => r.wdl);
  const w = last.filter((x) => x === 'W').length;
  const d = last.filter((x) => x === 'D').length;
  const l = last.filter((x) => x === 'L').length;

  // Active streak from the most recent match backward.
  const unbeatenLen = leadingCount(last, (x) => x === 'W' || x === 'D');
  const winlessLen = leadingCount(last, (x) => x === 'L' || x === 'D');
  let streakType = null;
  let streakLen = 0;
  if (last[0] === 'W') {
    streakType = 'unbeaten';
    streakLen = unbeatenLen;
  } else if (last[0] === 'L') {
    streakType = 'winless';
    streakLen = winlessLen;
  } else {
    // Leading draw — classify by the longer leading run.
    if (unbeatenLen >= winlessLen) { streakType = 'unbeaten'; streakLen = unbeatenLen; }
    else { streakType = 'winless'; streakLen = winlessLen; }
  }

  // Did the nation WIN its most recent edition? In their latest edition, the very
  // last completed match (chronologically last) was a knockout win for them.
  const wonTitle = detectTitle(completed, teamId, latestYear);

  return {
    w, d, l, lastN: last, streakType, streakLen, latestYear, wonTitle, sampleSize: results.length,
  };
}

/**
 * Heuristic title detection: in the nation's latest edition, the chronologically
 * final completed match is a knockout-stage win for them. The 2026 service only
 * carries 2018/2022 so this maps to Argentina (2022) / France (2018) cleanly.
 */
function detectTitle(completed, teamId, latestYear) {
  if (latestYear == null) return false;
  const inEdition = completed.filter((m) => m?.season?.year === latestYear);
  if (!inEdition.length) return false;
  // chronologically last in that edition
  const lastMatch = [...inEdition].sort((a, b) => String(a.datetime || '').localeCompare(String(b.datetime || '')))
    .slice(-1)[0];
  if (!lastMatch) return false;
  const stage = String(lastMatch.stage?.name || lastMatch.round_name || '').toLowerCase();
  const isFinal = stage.includes('final') && !stage.includes('semi') && !stage.includes('quarter');
  if (!isFinal) return false;
  const adv = safeAdvance(lastMatch);
  return adv?.teamId === teamId;
}

function safeAdvance(match) {
  try { return wc.getAdvanceResult(match); } catch { return null; }
}

/** W/D/L for `teamId` in a completed match (90' regulation, full-time fallback). */
function resultFor(m, teamId) {
  const reg = wc.getRegulationScore(m);
  const isHome = m.home_team?.id === teamId;
  if (reg.home != null && reg.away != null) {
    if (reg.home !== reg.away) {
      const teamWon = isHome ? reg.home > reg.away : reg.away > reg.home;
      return { wdl: teamWon ? 'W' : 'L' };
    }
    // Level at 90' — full-time incl. ET, then penalties (knockout decision).
    const fh = num(m.home_score);
    const fa = num(m.away_score);
    if (fh != null && fa != null && fh !== fa) {
      const teamWon = isHome ? fh > fa : fa > fh;
      return { wdl: teamWon ? 'W' : 'L' };
    }
    if (m.has_penalty_shootout) {
      const ph = num(m.home_score_penalties);
      const pa = num(m.away_score_penalties);
      if (ph != null && pa != null && ph !== pa) {
        const teamWon = isHome ? ph > pa : pa > ph;
        return { wdl: teamWon ? 'W' : 'L' };
      }
    }
    return { wdl: 'D' };
  }
  // No regulation score — full-time fallback only.
  const fh = num(m.home_score);
  const fa = num(m.away_score);
  if (fh != null && fa != null) {
    if (fh === fa) return { wdl: 'D' };
    const teamWon = isHome ? fh > fa : fa > fh;
    return { wdl: teamWon ? 'W' : 'L' };
  }
  return null;
}

// --- contender selection + fixture indexing --------------------------------

/** The N shortest-priced nations from the 'outright'/'Winner' futures market. */
function topContenders(futures, cap) {
  const byTeam = new Map();
  for (const f of futures || []) {
    if (f?.market_type !== 'outright') continue;
    if (!/winner/i.test(f.market_name || '')) continue;
    const id = f.subject?.id;
    const odds = num(f.american_odds);
    if (id == null || odds == null) continue;
    const k = String(id);
    const cur = byTeam.get(k);
    if (!cur || impliedProb(odds) > impliedProb(cur.odds)) {
      byTeam.set(k, { id, name: f.subject?.name, odds });
    }
  }
  return [...byTeam.values()]
    .sort((a, b) => impliedProb(b.odds) - impliedProb(a.odds))
    .slice(0, cap);
}

/**
 * From the 2026 fixture list, build (a) name-key -> canonical matches team id and
 * (b) team id -> that nation's earliest 2026 fixture (the side it first plays).
 * The name index lets us bridge the futures id space (different) back to the
 * matches/standings id space via the stable team name.
 */
function indexTeamsFromGames(games) {
  const idByName = new Map();
  const firstFixtureById = new Map();
  for (const m of games || []) {
    if (!m?.datetime) continue;
    for (const team of [m.home_team, m.away_team]) {
      if (!team?.id || !team?.name) continue;
      idByName.set(nameKey(team.name), team.id);
      const k = String(team.id);
      const cur = firstFixtureById.get(k);
      if (!cur || String(m.datetime).localeCompare(String(cur.datetime)) < 0) firstFixtureById.set(k, m);
    }
  }
  return { idByName, firstFixtureById };
}

// --- copy ------------------------------------------------------------------

// The headline states the DATA (the streak). A won title is context and lives
// in the detail line ("Defending champions from YYYY — ...") — never up top,
// where it read as the insight itself under a STREAK badge (founder, Jul 12).
function buildHeadline(c) {
  if (c.streakType === 'unbeaten') {
    return `${c.name} are unbeaten in their last ${c.streakLen} World Cup matches`;
  }
  return `${c.name} are winless in their last ${c.streakLen} World Cup matches`;
}

function buildDetail(c) {
  const rec = `${c.w}-${c.d}-${c.l}`;
  const windowN = c.lastN.length;
  const seq = c.lastN.join('-');
  const ed = c.latestYear ? `${c.latestYear} ` : '';

  if (c.wonTitle && c.latestYear) {
    const run = c.streakType === 'unbeaten'
      ? `${c.streakLen} wins in their last ${windowN} World Cup matches`
      : `a ${rec} record across their last ${windowN} World Cup matches`;
    return `Defending champions from ${c.latestYear} — ${run} (${seq}).`;
  }

  const run = c.streakType === 'unbeaten'
    ? `a ${c.streakLen}-match unbeaten run`
    : `${c.streakLen} straight World Cup games without a win`;
  return `Across their last ${windowN} ${ed}World Cup matches they are ${rec} (${seq}), carrying ${run}.`;
}

// --- small utils -----------------------------------------------------------

/** Count leading elements satisfying pred. */
function leadingCount(arr, pred) {
  let n = 0;
  for (const x of arr) {
    if (pred(x)) n += 1;
    else break;
  }
  return n;
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

/** Implied probability from American odds (no-vig-naive, for ranking only). */
function impliedProb(american) {
  const v = Number(american);
  if (!Number.isFinite(v)) return 0;
  return v > 0 ? 100 / (v + 100) : -v / (-v + 100);
}

/** Coerce a value to a finite number, or null. */
function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/** Run an async producer, returning fallback on any throw. */
async function safe(fn, fallback) {
  try {
    const v = await fn();
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export default { computeWcPedigree };
