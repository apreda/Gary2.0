// gary2.0/src/services/insights/computers/wcStakes.js
//
// LANE: wcStakes  (category token emitted: tournament — NEW token; iOS mapping
// handled separately)
// "The context lane: what this World Cup fixture actually decides — where both
//  sides sit in the group, how the market frames their title chances, and the
//  consensus match price."
//
// SCOPE: 2026 FIFA World Cup. league === 'wc'. ctx.games = the day's RAW FIFA
// match objects from fifaWorldCupService.getMatchesForDate(dateStr). One row per
// match, max.
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-04 — quoted,
// not guessed):
//   * RAW MATCH (ctx.games[i]): { id, datetime (ISO UTC), status, stage:{name},
//       group:{name}, round_name,
//       home_team:{id,name,abbreviation,country_code}, away_team:{...} }.
//   * getGroupStandings() -> rows: {
//       team:{id,name,abbreviation}, group:{name}, position, played, won, drawn,
//       lost, goals_for, goals_against, goal_difference, points }.
//   * getFutures() -> rows: {
//       market_type, market_name, subject:{id,name,abbreviation}, vendor,
//       american_odds, decimal_odds }.
//       market_type 'outright' (market_name 'Winner') = TITLE odds (one row per
//       team per vendor). market_type 'group_winner' (market_name 'Group X') =
//       group-winner odds. We use 'outright'/'Winner' for the title framing.
//   * getOdds({ matchIds }) + selectConsensusOdds(rows) ->
//       { vendor, moneyline:{home,draw,away}, spread, total }. 3-way moneyline.
//
// STAKES SCORING (relevance 55-75):
//   - opener / round 1 (both sides 0 GP): lower (a season-opener has the least
//     decided), ~55.
//   - mid group stage (some games played): ~62.
//   - group decider (final round, both sides can still finish top-2 / one can
//     clinch or be eliminated): highest, ~75.
//   - knockout stage (not group): ~70 (win-or-go-home).
//
// Defensive contract: any missing piece -> degrade the copy (drop the missing
// clause) rather than skip; only skip the whole row if we cannot even name the
// two sides. Empty slate -> []. Emits a one-line summary for diagnosability.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore, pickVariant } from '../shared.js';

const wc = fifaWorldCupService;

// Stakes relevance bands.
const SCORE_OPENER = 55;
const SCORE_MID_GROUP = 62;
const SCORE_KNOCKOUT = 70;
const SCORE_GROUP_DECIDER = 75;

export async function computeWcStakes(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) {
    console.log('[wcStakes] examined 0, emitted 0');
    return [];
  }

  // Fetch the slate-wide context once (standings + futures), defensively.
  const [standings, futures] = await Promise.all([
    safe(() => wc.getGroupStandings(), []),
    safe(() => wc.getFutures(), []),
  ]);

  const standingByTeamId = indexStandings(standings);
  const titleOddsByTeamId = indexTitleOdds(futures);

  const rows = [];
  const stats = { examined: 0, emitted: 0 };

  for (const match of games) {
    try {
      const row = await stakesRowForMatch(match, { standingByTeamId, titleOddsByTeamId, stats });
      if (row) rows.push(row);
    } catch (err) {
      console.error('[wcStakes] match error:', err?.message || err);
      // continue to next match
    }
  }

  stats.emitted = rows.length;
  console.log(`[wcStakes] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

async function stakesRowForMatch(match, { standingByTeamId, titleOddsByTeamId, stats }) {
  const matchId = match?.id;
  if (matchId == null) return null;

  const home = match.home_team;
  const away = match.away_team;
  if (!home?.id || !away?.id) return null; // TBD knockout slot — cannot name sides
  if (stats) stats.examined += 1;

  const label = wcGameLabel(match);
  const isGroup = /group/i.test(match.stage?.name || '') || !!match.group?.name;

  const homeStand = standingByTeamId.get(String(home.id)) || null;
  const awayStand = standingByTeamId.get(String(away.id)) || null;

  // Build the three context clauses; any may be absent and is simply dropped.
  const stakesClause = buildStakesClause(match, isGroup, homeStand, awayStand, home, away);
  const titleClause = buildTitleClause(home, away, titleOddsByTeamId);
  const marketClause = await buildMarketClause(matchId, home, away);

  const clauses = [stakesClause, titleClause, marketClause].filter(Boolean);
  if (!clauses.length) return null; // nothing to say

  const score = stakesScore(match, isGroup, homeStand, awayStand);
  const headline = buildHeadline(match, isGroup, home, away);

  return makeRow({
    category: 'tournament',
    headline,
    detail: clauses.join(' '),
    game: label,
    value: stakesValue(match, isGroup),
    tone: TONES.NEUTRAL, // context lane — informational, not a directional signal
    relevance_score: clampScore(score),
    game_id: matchId,
  });
}

// --- clause builders -------------------------------------------------------

/** What the match decides, framed off the two sides' group positions/points. */
function buildStakesClause(match, isGroup, homeStand, awayStand, home, away) {
  if (!isGroup) {
    const stage = match.stage?.name || match.round_name || 'the knockout stage';
    return `This is a ${stage.toLowerCase()} tie — win or go home.`;
  }

  const groupName = match.group?.name || homeStand?.group?.name || awayStand?.group?.name;
  const homeName = home.name || 'Home';
  const awayName = away.name || 'Away';

  // Pre-tournament / round 1: nobody has played yet.
  const homeGp = num(homeStand?.played) ?? 0;
  const awayGp = num(awayStand?.played) ?? 0;
  if (homeGp === 0 && awayGp === 0) {
    return groupName
      ? `Both ${homeName} and ${awayName} open their ${groupName} campaign here.`
      : `${homeName} and ${awayName} open their group campaign here.`;
  }

  const homePos = num(homeStand?.position);
  const awayPos = num(awayStand?.position);
  const homePts = num(homeStand?.points);
  const awayPts = num(awayStand?.points);

  const posPhrase = (name, pos, pts) => {
    if (pos != null && pts != null) return `${name} sit ${ordinal(pos)} on ${pts} point${pts === 1 ? '' : 's'}`;
    if (pts != null) return `${name} have ${pts} point${pts === 1 ? '' : 's'}`;
    return name;
  };

  const groupLabel = groupName ? `In ${groupName}, ` : '';
  return `${groupLabel}${posPhrase(homeName, homePos, homePts)} and ${posPhrase(awayName, awayPos, awayPts)} — three points reshape who advances.`;
}

/** Title-odds framing from the 'outright'/'Winner' futures market. */
function buildTitleClause(home, away, titleOddsByTeamId) {
  const ho = titleOddsByTeamId.get(String(home.id));
  const ao = titleOddsByTeamId.get(String(away.id));
  const parts = [];
  if (ho) parts.push(`${home.name} ${titlePhrase(ho)}`);
  if (ao) parts.push(`${away.name} ${titlePhrase(ao)}`);
  if (!parts.length) return '';
  return `To lift the trophy: ${parts.join(', ')}.`;
}

/** Consensus 3-way match odds clause. */
async function buildMarketClause(matchId, home, away) {
  const odds = await safe(() => wc.getOdds({ matchIds: [matchId] }), []);
  const forMatch = Array.isArray(odds) ? odds.filter((o) => o.match_id === matchId) : [];
  const consensus = wc.selectConsensusOdds(forMatch);
  const ml = consensus?.moneyline;
  if (!ml) return '';
  const bits = [];
  if (ml.home != null) bits.push(`${home.name} ${fmtOdds(ml.home)}`);
  if (ml.draw != null) bits.push(`the draw ${fmtOdds(ml.draw)}`);
  if (ml.away != null) bits.push(`${away.name} ${fmtOdds(ml.away)}`);
  if (bits.length < 2) return '';
  return `The market has it ${bits.join(' / ')}.`;
}

// --- copy + scoring helpers ------------------------------------------------

function buildHeadline(match, isGroup, home, away) {
  const homeName = home.name || 'Home';
  const awayName = away.name || 'Away';
  if (!isGroup) {
    const stage = match.stage?.name || match.round_name || 'Knockout';
    return `${homeName} vs ${awayName}: ${stage} stakes`;
  }
  const groupName = match.group?.name;
  const variants = [
    `What ${homeName} vs ${awayName} decides`,
    `${homeName} vs ${awayName}: the group picture`,
    `${homeName} vs ${awayName}${groupName ? ` — ${groupName}` : ''} at stake`,
  ];
  return pickVariant(variants, String(match.id));
}

function stakesValue(match, isGroup) {
  if (!isGroup) return match.stage?.name || match.round_name || 'Knockout';
  return match.group?.name || 'Group stage';
}

/**
 * Relevance by how much the fixture decides. A final group-round decider (both
 * sides have played and standings are live) outranks an opener.
 */
function stakesScore(match, isGroup, homeStand, awayStand) {
  if (!isGroup) return SCORE_KNOCKOUT;

  const homeGp = num(homeStand?.played) ?? 0;
  const awayGp = num(awayStand?.played) ?? 0;

  if (homeGp === 0 && awayGp === 0) return SCORE_OPENER;
  // A group-stage team plays 3 games: 2+ played means this is (likely) the
  // decisive final round where advancement is on the line.
  if (homeGp >= 2 || awayGp >= 2) return SCORE_GROUP_DECIDER;
  return SCORE_MID_GROUP;
}

// --- indexing + formatting -------------------------------------------------

function indexStandings(standings) {
  const map = new Map();
  for (const row of standings || []) {
    const id = row?.team?.id;
    if (id == null) continue;
    map.set(String(id), row);
  }
  return map;
}

/**
 * Index the BEST (shortest-priced) title-winner future per team from the
 * 'outright'/'Winner' market. Keeps the rank (1 = favourite) for framing copy.
 */
function indexTitleOdds(futures) {
  const byTeam = new Map();
  for (const f of futures || []) {
    if (f?.market_type !== 'outright') continue;
    if (!/winner/i.test(f.market_name || '')) continue;
    const id = f.subject?.id;
    const odds = num(f.american_odds);
    if (id == null || odds == null) continue;
    const k = String(id);
    const cur = byTeam.get(k);
    // Prefer the shortest price (best implied probability) across vendors.
    if (!cur || impliedProb(odds) > impliedProb(cur.american_odds)) {
      byTeam.set(k, { american_odds: odds, name: f.subject?.name });
    }
  }
  // Assign a rank by implied probability (1 = strongest title favourite).
  const ranked = [...byTeam.entries()].sort(
    (a, b) => impliedProb(b[1].american_odds) - impliedProb(a[1].american_odds),
  );
  ranked.forEach(([, v], i) => { v.rank = i + 1; });
  return byTeam;
}

/** "are the No. 4 title choice at +650" / "are 250-1 outsiders". */
function titlePhrase(entry) {
  const odds = entry.american_odds;
  const longShot = odds >= 2000; // +2000 or longer reads better as "X-1 outsiders"
  if (longShot) return `are ${toFractionalish(odds)} outsiders`;
  if (entry.rank != null && entry.rank <= 8) {
    return `are the No. ${entry.rank} title choice at ${fmtOdds(odds)}`;
  }
  return `are ${fmtOdds(odds)} for the title`;
}

/** American odds -> "250-1" style for long shots (e.g. +25000 -> "250-1"). */
function toFractionalish(american) {
  if (american >= 100) {
    const x = Math.round(american / 100);
    return `${x}-1`;
  }
  return fmtOdds(american);
}

/** American odds with explicit sign. */
function fmtOdds(o) {
  const n = Number(o);
  if (!Number.isFinite(n)) return String(o);
  return n > 0 ? `+${n}` : `${n}`;
}

/** Implied probability from American odds (no-vig-naive, for ranking only). */
function impliedProb(american) {
  const n = Number(american);
  if (!Number.isFinite(n)) return 0;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}

/** 1 -> "1st", 2 -> "2nd", etc. */
function ordinal(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const m = v % 100;
  return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`;
}

/** Coerce a value to a finite number, or null. */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

export default { computeWcStakes };
