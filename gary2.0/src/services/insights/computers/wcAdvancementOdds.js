// gary2.0/src/services/insights/computers/wcAdvancementOdds.js
//
// LANE: wcAdvancementOdds  (category token emitted: advancement — iOS ADVANCEMENT lane)
// "Who's going through. The group stage is a race for the top two (plus the best
//  third-placed sides). This lane reads the bookmakers' 'to qualify from group'
//  market for both sides of TODAY'S fixtures — who's all but through, who's a
//  coin-flip, who's up against it — alongside where they sit in the table."
//
// SCOPE: group-stage fixtures only (the qualify market only exists pre-knockout).
// Scores ctx.games (today's fixtures); the qualify_from_group futures + group
// standings are the lookup tables. No qualify market for either side -> skip.
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-25):
//   * getFutures() -> rows incl. { market_type:'qualify_from_group',
//       market_name:'Group X', subject:{id,name,abbreviation}, american_odds }.
//   * getGroupStandings() -> { team:{id,name}, group:{name}, position, played, points }.
//
// ROW SHAPE: one row per qualifying group fixture. game = 'AWY @ HOM', game_id set.
// value = the advancement-favorite's odds. relevance 56-72 (a true coin-flip ranks
// highest). Defensive: skip silently on any gap, never throw.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore } from '../shared.js';

const wc = fifaWorldCupService;
const SCORE_BASE = 56;
const SCORE_TIGHT = 72; // both sides near even to advance = the most actionable

export async function computeWcAdvancementOdds(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) { console.log('[wcAdvancementOdds] examined 0, emitted 0'); return []; }

  const [futures, standings] = await Promise.all([
    safe(() => wc.getFutures(), []),
    safe(() => wc.getGroupStandings(), []),
  ]);
  const qualifyByTeam = indexQualify(futures);
  const standByTeam = indexStandings(standings);
  if (!qualifyByTeam.size) { console.log('[wcAdvancementOdds] examined 0, emitted 0 (no qualify market)'); return []; }

  const rows = [];
  let examined = 0;
  for (const match of games) {
    examined += 1;
    const row = buildRow(match, qualifyByTeam, standByTeam);
    if (row) rows.push(row);
  }
  console.log(`[wcAdvancementOdds] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

function buildRow(match, qualifyByTeam, standByTeam) {
  const home = match?.home_team, away = match?.away_team;
  if (!home?.id || !away?.id) return null;
  const isGroup = /group/i.test(match.stage?.name || '') || !!match.group?.name;
  if (!isGroup) return null; // qualify market is group-stage only

  const hq = qualifyByTeam.get(String(home.id));
  const aq = qualifyByTeam.get(String(away.id));
  if (!hq && !aq) return null;

  // The shorter-priced side is the advancement favorite.
  const sides = [hq && { team: home, ...hq }, aq && { team: away, ...aq }]
    .filter(Boolean)
    .sort((x, y) => impliedProb(y.odds) - impliedProb(x.odds));
  const fav = sides[0];
  const dog = sides[1] || null;

  const favStand = standByTeam.get(String(fav.team.id));
  const dogStand = dog ? standByTeam.get(String(dog.team.id)) : null;
  const favProb = impliedProb(fav.odds);
  const dogProb = dog ? impliedProb(dog.odds) : 0;
  const tight = dog && Math.abs(favProb - dogProb) < 0.2; // both near even = most actionable
  const grp = (match.group?.name || favStand?.group?.name || '').trim();
  const grpPart = grp ? ` from ${grp}` : '';

  // Headline must match the FAVORITE's true advancement likelihood — never claim an "edge"
  // when even the shorter-priced side is an underdog to go through, or when only one side
  // has a quote (the other already clinched / has no market).
  let headline;
  if (!dog) {
    headline = grp ? `${fav.team.name}'s route through ${grp}` : `${fav.team.name}'s road to the last 16`;
  } else if (favProb >= 0.7 && dogProb >= 0.7) {
    headline = `${fav.team.name} and ${dog.team.name} both set to advance${grpPart}`;
  } else if (Math.abs(favProb - dogProb) < 0.18) {
    headline = `${fav.team.name} and ${dog.team.name} scrap to advance${grpPart}`;
  } else {
    headline = `${fav.team.name} hold the edge to advance${grpPart}`;
  }

  const dogClause = dog ? ` ${dog.team.name} are ${fmtOdds(dog.odds)}${posTail(dogStand)} to join them.` : '';
  const detail = `The market has ${fav.team.name} ${qualifyPhrase(fav.odds)} to reach the last 16 at ${fmtOdds(fav.odds)}${posTail(favStand)}.${dogClause}`;

  return makeRow({
    category: 'advancement',
    headline,
    detail,
    game: `${fifaCode(away)} @ ${fifaCode(home)}`,
    value: fmtOdds(fav.odds),
    tone: TONES.NEUTRAL,
    relevance_score: clampScore(tight ? SCORE_TIGHT : SCORE_BASE),
    game_id: match.id,
  });
}

/** Plain-English read of a to-qualify price. */
function qualifyPhrase(odds) {
  const p = impliedProb(odds);
  if (p >= 0.85) return 'all but through';
  if (p >= 0.6) return 'strong favorites';
  if (p >= 0.42) return 'roughly even money';
  return 'up against it';
}

/** " (2nd, 4 pts)" group-table tail, or '' when standings are missing. */
function posTail(stand) {
  if (!stand) return '';
  const pos = num(stand.position), pts = num(stand.points);
  if (pos == null || pts == null) return '';
  return ` (${ordinal(pos)}, ${pts} pt${pts === 1 ? '' : 's'})`;
}

/** Index the BEST (shortest) qualify_from_group price per team across vendors. */
function indexQualify(futures) {
  const byTeam = new Map();
  for (const f of futures || []) {
    if (f?.market_type !== 'qualify_from_group') continue;
    const id = f.subject?.id;
    const odds = num(f.american_odds);
    if (id == null || odds == null) continue;
    const k = String(id);
    const cur = byTeam.get(k);
    if (!cur || impliedProb(odds) > impliedProb(cur.odds)) byTeam.set(k, { odds, name: f.subject?.name });
  }
  return byTeam;
}

function indexStandings(standings) {
  const m = new Map();
  for (const row of standings || []) { const id = row?.team?.id; if (id != null) m.set(String(id), row); }
  return m;
}

function fmtOdds(o) { const n = Number(o); if (!Number.isFinite(n)) return String(o); return n > 0 ? `+${n}` : `${n}`; }
function impliedProb(american) { const n = Number(american); if (!Number.isFinite(n)) return 0; return n > 0 ? 100 / (n + 100) : -n / (-n + 100); }
function ordinal(n) { const v = Number(n); if (!Number.isFinite(v)) return String(n); const s = ['th', 'st', 'nd', 'rd']; const m = v % 100; return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function fifaCode(team) { const c = team?.abbreviation || team?.country_code; if (c) return String(c).toUpperCase().slice(0, 3); return String(team?.name || 'TBD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'TBD'; }
async function safe(fn, fallback) { try { const v = await fn(); return v == null ? fallback : v; } catch { return fallback; } }

export default { computeWcAdvancementOdds };
