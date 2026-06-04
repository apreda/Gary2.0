// gary2.0/src/services/insights/computers/wcGroupValue.js
//
// LANE: wcGroupValue  (category token emitted: tournament)
// "The group-stage markets — group winner and to-advance — read against the field
//  each side is drawn into. The 48-team format makes the group stage unusually
//  open: a single win, or two strong draws, can be enough to reach the Round of 32
//  via the best-third-place sides, so very few rubbers are dead. This lane surfaces
//  the shortest group-winner chalk against the field, the tightest group on the
//  board, and the format fact that frames every to-advance market."
//
// RESEARCH BACK-DROP: to-advance / group-winner is the most underleveraged World
// Cup market. The expanded 48-team bracket sends the eight best third-place sides
// through, compressing the advancement bar and widening the set of live groups.
//
// RUNS IN BOTH SLATE SHAPES (identical RAW FIFA match objects):
//   * PREVIEW: ctx.games = ALL 104 fixtures -> every group is in play; we surface
//     the softest chalk, the most open group, and the format-context row.
//   * MATCH DAY: ctx.games = today's fixtures -> we restrict the group comparisons
//     to the groups actually playing today (and drop the pre-tournament format row).
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-04 — quoted,
// not guessed):
//   * RAW MATCH (ctx.games[i]): { id, datetime, group:{name 'Group A'..'Group L'},
//       home_team:{id,name,abbreviation}, away_team:{...}, stage:{name} }.
//   * getFutures() -> rows incl. market_type 'group_winner' (market_name 'Group X').
//       { subject:{id,name}, american_odds, decimal_odds, vendor }. We read the
//       group-winner market off these rows; the shortest price is the favourite,
//       the spread to the runner-up is how chalky / open the group is.
//   * ID-SPACE GOTCHA: the futures subject.id is a SEPARATE id space from the
//       matches/standings team.id (verified: Argentina is subject.id 2065 in
//       futures but team.id 37 in matches). Team NAMES are stable across every
//       endpoint, so we JOIN BY NAME-KEY throughout this lane.
//
// ROW SHAPE: up to 4 board rows. The two group-comparison rows carry the group
// label as `game` (e.g. 'GROUP C'); the format row is generic. game_id is OMITTED
// on these board rows so they survive the orchestrator slate filter. relevance
// 58-70, tone EDGE on the value rows / NEUTRAL on the format row.
//
// Defensive contract: any missing piece -> drop that row rather than throw. No
// futures -> only the format row (preview) or []. Emits a one-line summary.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore, nameKey } from '../shared.js';

const wc = fifaWorldCupService;

const MAX_ROWS = 4;
const OPEN_GROUP_THRESHOLD = 250; // a side priced at/inside +250 counts as "in contention"
const OPEN_GROUP_MIN_SIDES = 2;   // 2026 reality: no group has 3 sides inside +250; 2+ flags an open group
const SCORE_SOFTEST_CHALK = 70;
const SCORE_OPEN_GROUP = 66;
const SCORE_FORMAT_CONTEXT = 58;

export async function computeWcGroupValue(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) {
    console.log('[wcGroupValue] examined 0, emitted 0');
    return [];
  }

  const isPreview = ctx?.preview === true || games.length >= 60;

  const futures = await safe(() => wc.getFutures(), []);
  const groupWinnerByName = indexGroupWinnerOdds(futures);

  // Which groups are in scope. Preview -> every group present in the slate. Match
  // day -> only the groups whose fixtures play today.
  const groupsInScope = collectGroups(games);

  // Build a per-group view: members (by name), the group-winner favourite, and the
  // set of sides inside the open threshold.
  const groupViews = [];
  for (const groupName of groupsInScope) {
    const view = buildGroupView(groupName, games, groupWinnerByName);
    if (view) groupViews.push(view);
  }

  const rows = [];
  const stats = { examined: groupViews.length, emitted: 0 };

  // (1) Softest chalk: the group whose FAVOURITE is shortest-priced (the market's
  // strongest single-side conviction). In preview this is the chalkiest group of
  // the whole tournament; on a match day it is the chalkiest among today's groups.
  const softest = pickSoftestChalk(groupViews);
  if (softest) rows.push(buildSoftestChalkRow(softest, isPreview));

  // (2) Most open group: the group with the most sides inside the open threshold
  // (tightest top of the market). Skip if it would duplicate the softest-chalk group.
  const openGroup = pickMostOpenGroup(groupViews, softest?.groupName);
  if (openGroup) rows.push(buildOpenGroupRow(openGroup));

  // (3) Format-context row — pre-tournament only (preview).
  if (isPreview && rows.length < MAX_ROWS) {
    rows.push(buildFormatRow());
  }

  const out = rows.slice(0, MAX_ROWS);
  stats.emitted = out.length;
  console.log(`[wcGroupValue] examined ${stats.examined}, emitted ${stats.emitted}`);
  return out;
}

// --- row builders ----------------------------------------------------------

function buildSoftestChalkRow(view, isPreview) {
  const fav = view.favourite;
  // How far clear the favourite is: the next-shortest group-winner price in the
  // group. A long gap to the runner-up is what makes this the chalkiest group.
  const runnerUp = view.priced
    .filter((s) => s.name !== fav.name)
    .sort((a, b) => impliedProb(b.american_odds) - impliedProb(a.american_odds))[0];
  const gapClause = runnerUp
    ? ` The next side in ${view.groupName}, ${runnerUp.name}, is out at ${fmtOdds(runnerUp.american_odds)}.`
    : '';
  // Only claim "of the tournament" in preview, where every group is compared.
  const scopeClause = isPreview ? 'the shortest group-winner price of the tournament' : 'the shortest group-winner price on the day';
  return makeRow({
    category: 'tournament',
    headline: `${fav.name} are the shortest group-winner chalk on the board`,
    detail:
      `${fav.name} are ${fmtOdds(fav.american_odds)} to win ${view.groupName} — ${scopeClause}.${gapClause}`,
    game: groupBoardLabel(view.groupName),
    value: fmtOdds(fav.american_odds),
    tone: TONES.EDGE,
    relevance_score: clampScore(SCORE_SOFTEST_CHALK),
    // game_id OMITTED — board row, survives the slate filter.
  });
}

function buildOpenGroupRow(view) {
  const inside = view.insideThreshold; // [{name, american_odds}] sorted shortest-first
  const names = inside.map((s) => s.name);
  const quantifier = names.length === 2 ? 'both' : 'all';
  const listClause = names.length
    ? `${joinNames(names)} ${quantifier} priced inside ${fmtOdds(OPEN_GROUP_THRESHOLD)}`
    : 'multiple sides bunched at the top of the market';
  return makeRow({
    category: 'tournament',
    headline: `${view.groupName} is the tightest group-winner market`,
    detail:
      `${view.groupName}'s group-winner market is the most open on the board: ${listClause}.`,
    game: groupBoardLabel(view.groupName),
    value: `${inside.length} inside ${fmtOdds(OPEN_GROUP_THRESHOLD)}`,
    tone: TONES.EDGE,
    relevance_score: clampScore(SCORE_OPEN_GROUP),
    // game_id OMITTED — board row.
  });
}

function buildFormatRow() {
  return makeRow({
    category: 'tournament',
    headline: 'The eight best third-place sides advance',
    detail:
      'In the 48-team format the eight best third-place finishers reach the Round of 32 — ' +
      'a single win across the group stage can be enough to advance.',
    game: 'GROUP STAGE',
    value: 'FORMAT',
    tone: TONES.NEUTRAL,
    relevance_score: clampScore(SCORE_FORMAT_CONTEXT),
    // game_id OMITTED — board row.
  });
}

// --- group view + selection ------------------------------------------------

/**
 * Build a per-group view: the set of member names (from the slate fixtures), each
 * member's group-winner price, the group favourite (shortest group-winner price),
 * and the sides priced inside the open threshold. Returns null if we cannot price
 * the group at all.
 */
function buildGroupView(groupName, games, groupWinnerByName) {
  const members = groupMembers(groupName, games);
  if (!members.length) return null;

  const priced = [];
  for (const name of members) {
    const gw = groupWinnerByName.get(nameKey(name));
    if (gw?.american_odds != null) priced.push({ name, american_odds: gw.american_odds });
  }
  if (!priced.length) return null;

  // Group favourite = shortest group-winner price (highest implied probability).
  const favourite = [...priced].sort((a, b) => impliedProb(b.american_odds) - impliedProb(a.american_odds))[0];

  // Sides inside the open threshold (price at or shorter than +THRESHOLD), shortest-first.
  const insideThreshold = priced
    .filter((s) => impliedProb(s.american_odds) >= impliedProb(OPEN_GROUP_THRESHOLD))
    .sort((a, b) => impliedProb(b.american_odds) - impliedProb(a.american_odds));

  return { groupName, members, priced, favourite, insideThreshold };
}

/** The group with the SHORTEST favourite price across all groups (softest chalk). */
function pickSoftestChalk(views) {
  let best = null;
  for (const v of views) {
    if (!v.favourite) continue;
    if (!best || impliedProb(v.favourite.american_odds) > impliedProb(best.favourite.american_odds)) {
      best = v;
    }
  }
  return best;
}

/**
 * The most open group: most sides inside the threshold, requiring at least
 * OPEN_GROUP_MIN_SIDES. Tie-break toward the group whose Nth-best price is shortest
 * (genuinely bunched). Optionally excludes the softest-chalk group to avoid a dup.
 */
function pickMostOpenGroup(views, excludeGroup) {
  let best = null;
  for (const v of views) {
    if (excludeGroup && v.groupName === excludeGroup) continue;
    if (v.insideThreshold.length < OPEN_GROUP_MIN_SIDES) continue;
    if (!best) { best = v; continue; }
    if (v.insideThreshold.length !== best.insideThreshold.length) {
      if (v.insideThreshold.length > best.insideThreshold.length) best = v;
      continue;
    }
    // Same count -> the group whose LAST inside-price is shortest is tighter.
    const vLast = v.insideThreshold[v.insideThreshold.length - 1].american_odds;
    const bLast = best.insideThreshold[best.insideThreshold.length - 1].american_odds;
    if (impliedProb(vLast) > impliedProb(bLast)) best = v;
  }
  return best;
}

// --- slate -> group structure ----------------------------------------------

/** Distinct group names present in the slate, ordered A..L. */
function collectGroups(games) {
  const set = new Set();
  for (const m of games || []) {
    const g = m?.group?.name;
    if (g) set.add(g);
  }
  return [...set].sort(byGroupLetter);
}

/** Distinct member team names of a group, from the slate's fixtures. */
function groupMembers(groupName, games) {
  const set = new Set();
  for (const m of games || []) {
    if (m?.group?.name !== groupName) continue;
    for (const team of [m.home_team, m.away_team]) {
      if (team?.name) set.add(team.name);
    }
  }
  return [...set];
}

// --- futures indexing (JOIN BY NAME) ---------------------------------------

/** Shortest-priced group-winner future per team, keyed by NAME-KEY. */
function indexGroupWinnerOdds(futures) {
  const byName = new Map();
  for (const f of futures || []) {
    if (f?.market_type !== 'group_winner') continue;
    const name = f.subject?.name;
    const odds = num(f.american_odds);
    if (!name || odds == null) continue;
    const k = nameKey(name);
    const cur = byName.get(k);
    if (!cur || impliedProb(odds) > impliedProb(cur.american_odds)) {
      byName.set(k, { american_odds: odds, name });
    }
  }
  return byName;
}

// --- formatting + small utils ----------------------------------------------

/** 'Group C' -> 'GROUP C' board label. */
function groupBoardLabel(groupName) {
  const mt = String(groupName || '').match(/group\s+([a-z])/i);
  return mt ? `GROUP ${mt[1].toUpperCase()}` : String(groupName || 'GROUP').toUpperCase();
}

/** Sort two group names by letter (A..L). */
function byGroupLetter(a, b) {
  const la = (String(a).match(/group\s+([a-z])/i) || [])[1] || a;
  const lb = (String(b).match(/group\s+([a-z])/i) || [])[1] || b;
  return String(la).localeCompare(String(lb));
}

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

export default { computeWcGroupValue };
