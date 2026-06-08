// gary2.0/src/services/insights/computers/wcKnockoutPath.js
//
// LANE: wcKnockoutPath  (category token emitted: tournament — iOS Tournament Stakes)
// "The tournament-wide story the day's fixtures can't tell on their own: who the
//  market makes the title favourites, which side it most expects in the final,
//  who is all but through their group, and which title contender was handed a
//  live group. Board-level context that stays relevant EVERY day of the
//  tournament — the medicine for the match-day Hub going thin once the group
//  stage starts and the preview lanes drop away."
//
// RUNS IN BOTH SLATE SHAPES — these rows are tournament-wide, not fixture-bound,
// so they read identically whether ctx.games is all 104 preview fixtures or just
// today's match(es). game_id is OMITTED on every row so they survive the
// orchestrator's slate filter (same board-row trick as wcGroupValue).
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-08 — quoted,
// not guessed):
//   * getFutures() rows: { market_type, market_name, subject:{id,name,abbreviation},
//       american_odds, decimal_odds, vendor }. Market types present:
//         outright (96) ............ title-winner odds
//         to_reach_final (96) ...... reach-the-final market
//         to_reach_semis/quarters/round_of_16 ... deep-run path markets
//         qualify_from_group (48) .. escape-the-group market (market_name = group)
//         group_winner / win_all_group_games / finish_bottom / stage_of_elimination
//     ID-SPACE GOTCHA (shared with wcGroupValue): futures subject.id is a SEPARATE
//     id space from match/standings team.id. NAMES are stable everywhere, so we
//     JOIN BY NAME-KEY throughout.
//   * getGroupStandings() rows: { team:{name,abbreviation}, group:{name},
//       position, played, won, drawn, lost, goal_difference, points }. played===0
//       pre-tournament; the standings row only fires once played>0.
//
// ROW SHAPE: up to 4 futures board rows (title picture / path to final / surest
// to advance / contender in a tough draw) + 1 optional standings row once games
// are played. game_id OMITTED; game carries a board label. relevance 60-76.
//
// Defensive contract: any missing piece -> drop that row rather than throw.
// No futures -> []. Emits a one-line examined/emitted summary.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore, nameKey } from '../shared.js';

const wc = fifaWorldCupService;

const MAX_FUTURES_ROWS = 4;
const TITLE_CONTENDERS = 8;      // how many short-outright sides count as "title contenders"
const TOUGH_DRAW_MAX_PROB = 0.66; // a contender whose group-escape implied prob is below this was handed a live group
const SCORE_TITLE = 76;
const SCORE_PATH = 70;
const SCORE_ADVANCE = 64;
const SCORE_TOUGH_DRAW = 72;
const SCORE_STANDINGS = 68;

export async function computeWcKnockoutPath(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) {
    console.log('[wcKnockoutPath] examined 0, emitted 0');
    return [];
  }

  const futures = await safe(() => wc.getFutures(), []);
  if (!futures.length) {
    console.log('[wcKnockoutPath] examined 0, emitted 0 (no futures)');
    return [];
  }

  const outright = shortestByName(futures, 'outright');          // name -> {odds,name}
  const reachFinal = shortestByName(futures, 'to_reach_final');
  const qualify = shortestByNameWithGroup(futures, 'qualify_from_group'); // name -> {odds,name,group}

  const outrightRanked = [...outright.values()].sort(byProbDesc);

  const rows = [];
  const stats = { examined: outright.size, emitted: 0 };

  // (1) TITLE PICTURE — the market's shortest outright prices.
  const titleRow = buildTitleRow(outrightRanked);
  if (titleRow) rows.push(titleRow);

  // (2) PATH TO THE FINAL — the side the market most expects to reach the final.
  //     Exclude the title favourite (row 1) so this surfaces a SECOND name
  //     rather than repeating the same side twice back to back.
  const titleFavName = outrightRanked[0]?.name;
  const finalRow = buildReachFinalRow(reachFinal, titleFavName);
  if (finalRow) rows.push(finalRow);

  // (3) SUREST TO ADVANCE — shortest qualify-from-group price on the board.
  const advanceRow = buildAdvanceRow(qualify);
  if (advanceRow) rows.push(advanceRow);

  // (4) CONTENDER IN A TOUGH DRAW — a title contender the market is NOT confident
  //     will even escape its group (a live "group of death" signal).
  const toughRow = buildToughDrawRow(outrightRanked, qualify);
  if (toughRow) rows.push(toughRow);

  const futuresRows = rows.slice(0, MAX_FUTURES_ROWS);

  // (5) STANDINGS MOVER — only once matches have been played: a title contender
  //     sitting outside the top two of its group (genuine early-exit jeopardy).
  const standingsRow = await buildStandingsRow(outright);
  if (standingsRow) futuresRows.push(standingsRow);

  stats.emitted = futuresRows.length;
  console.log(`[wcKnockoutPath] examined ${stats.examined}, emitted ${stats.emitted}`);
  return futuresRows;
}

// --- row builders ----------------------------------------------------------

function buildTitleRow(ranked) {
  if (ranked.length < 1) return null;
  const fav = ranked[0];
  const chasers = ranked.slice(1, 3);
  const chaseClause = chasers.length
    ? ` ${joinNames(chasers.map((c) => `${c.name} (${fmtOdds(c.odds)})`))} ${chasers.length === 1 ? 'is' : 'are'} the next shortest.`
    : '';
  return makeRow({
    category: 'tournament',
    headline: `${fav.name} head the title market at ${fmtOdds(fav.odds)}`,
    detail: `${fav.name} are the market's outright World Cup favourite at ${fmtOdds(fav.odds)}.${chaseClause}`,
    game: 'TO LIFT THE CUP',
    value: fmtOdds(fav.odds),
    tone: TONES.EDGE,
    relevance_score: clampScore(SCORE_TITLE),
    // game_id OMITTED — board row.
  });
}

function buildReachFinalRow(reachFinal, excludeName) {
  const ranked = [...reachFinal.values()]
    .filter((r) => !(excludeName && nameKey(r.name) === nameKey(excludeName)))
    .sort(byProbDesc);
  if (!ranked.length) return null;
  const top = ranked[0];
  return makeRow({
    category: 'tournament',
    headline: `${top.name} are the market's pick to reach the final from the other half`,
    detail:
      `Behind the outright favourite, ${top.name} carry the shortest price to reach the final at ${fmtOdds(top.odds)} — ` +
      `the side the market most expects to come through the other half of the bracket.`,
    game: 'PATH TO THE FINAL',
    value: fmtOdds(top.odds),
    tone: TONES.EDGE,
    relevance_score: clampScore(SCORE_PATH),
  });
}

function buildAdvanceRow(qualify) {
  const ranked = [...qualify.values()].sort(byProbDesc);
  if (!ranked.length) return null;
  const surest = ranked[0];
  const groupClause = surest.group ? ` out of ${surest.group}` : '';
  return makeRow({
    category: 'tournament',
    headline: `${surest.name} are the surest bet to advance`,
    detail:
      `${surest.name} are ${fmtOdds(surest.odds)} to escape their group${groupClause} — the shortest to-advance price on the board.`,
    game: 'SUREST TO ADVANCE',
    value: fmtOdds(surest.odds),
    tone: TONES.EDGE,
    relevance_score: clampScore(SCORE_ADVANCE),
  });
}

function buildToughDrawRow(outrightRanked, qualify) {
  // Walk the title contenders shortest-first; flag the first whose group-escape
  // price the market does NOT make a comfortable favourite.
  const contenders = outrightRanked.slice(0, TITLE_CONTENDERS);
  for (const c of contenders) {
    const q = qualify.get(nameKey(c.name));
    if (!q || q.odds == null) continue;
    const p = impliedProb(q.odds);
    if (p < TOUGH_DRAW_MAX_PROB) {
      const groupClause = q.group ? ` in ${q.group}` : '';
      return makeRow({
        category: 'tournament',
        headline: `${c.name} were handed a live group`,
        detail:
          `${c.name} are a ${fmtOdds(c.odds)} title pick, yet only ${fmtOdds(q.odds)} to advance${groupClause} — ` +
          `the market sees a genuine fight just to escape the group.`,
        game: 'GROUP OF DEATH',
        value: fmtOdds(q.odds),
        tone: TONES.CAUTION,
        relevance_score: clampScore(SCORE_TOUGH_DRAW),
      });
    }
  }
  return null;
}

async function buildStandingsRow(outright) {
  const standings = await safe(() => wc.getGroupStandings(), []);
  const played = standings.filter((s) => Number(s?.played) > 0);
  if (!played.length) return null; // pre-tournament — nothing has been played yet

  // A title contender (priced inside +1500 outright) sitting 3rd or 4th in its
  // group after at least one match — early-exit jeopardy the table now shows.
  let pick = null;
  for (const s of played) {
    const name = s?.team?.name;
    const o = name ? outright.get(nameKey(name)) : null;
    if (!o || impliedProb(o.odds) < impliedProb(1500)) continue; // not a real contender
    if (Number(s.position) < 3) continue; // top two are fine
    if (!pick || impliedProb(o.odds) > impliedProb(pick.o.odds)) pick = { s, o, name };
  }
  if (!pick) return null;

  const { s, o, name } = pick;
  return makeRow({
    category: 'tournament',
    headline: `${name} are slipping in ${s.group?.name || 'their group'}`,
    detail:
      `${name}, a ${fmtOdds(o.odds)} title pick, sit ${ordinal(s.position)} in ${s.group?.name || 'their group'} ` +
      `on ${s.points} point${Number(s.points) === 1 ? '' : 's'} after ${s.played} — outside the automatic places.`,
    game: 'GROUP JEOPARDY',
    value: ordinal(s.position),
    tone: TONES.CAUTION,
    relevance_score: clampScore(SCORE_STANDINGS),
  });
}

// --- futures indexing (JOIN BY NAME) ---------------------------------------

/** Shortest-priced future of a market_type per team, keyed by NAME-KEY. */
function shortestByName(futures, marketType) {
  const byName = new Map();
  for (const f of futures || []) {
    if (f?.market_type !== marketType) continue;
    const name = f.subject?.name;
    const odds = num(f.american_odds);
    if (!name || odds == null) continue;
    const k = nameKey(name);
    const cur = byName.get(k);
    if (!cur || impliedProb(odds) > impliedProb(cur.odds)) byName.set(k, { odds, name });
  }
  return byName;
}

/** Same as shortestByName, but also carries the market_name (the group label). */
function shortestByNameWithGroup(futures, marketType) {
  const byName = new Map();
  for (const f of futures || []) {
    if (f?.market_type !== marketType) continue;
    const name = f.subject?.name;
    const odds = num(f.american_odds);
    if (!name || odds == null) continue;
    const k = nameKey(name);
    const cur = byName.get(k);
    if (!cur || impliedProb(odds) > impliedProb(cur.odds)) {
      byName.set(k, { odds, name, group: f.market_name || null });
    }
  }
  return byName;
}

// --- formatting + small utils ----------------------------------------------

function byProbDesc(a, b) { return impliedProb(b.odds) - impliedProb(a.odds); }

/** Join names as "A, B and C". */
function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** American odds with explicit sign. */
function fmtOdds(o) {
  const v = Number(o);
  if (!Number.isFinite(v)) return String(o);
  return v > 0 ? `+${v}` : `${v}`;
}

/** Implied probability from American odds (no-vig-naive, for ranking only). */
function impliedProb(american) {
  const v = Number(american);
  if (!Number.isFinite(v)) return 0;
  return v > 0 ? 100 / (v + 100) : -v / (-v + 100);
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
function ordinal(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const m = v % 100;
  return v + (s[(m - 20) % 10] || s[m] || s[0]);
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

export default { computeWcKnockoutPath };
