/**
 * THE DART SCREEN (founder GO, Sep 24 2026): "who are the best bets in this
 * category today?" answered the way the props desk answers it — every priced
 * player is run through the prop model (MLB: his own per-plate-appearance
 * rates against tonight's arm; NFL: team volume, opponent, share and
 * efficiency) and priced against the book, then the players the numbers put
 * closest to the top become the menu Gary reads, each with his sheet. The
 * model orders the menu and never writes a card: no probability or gap
 * reaches the ask. Gary picks from the menu and says why.
 */
import { ballDontLieService as bdl } from '../ballDontLieService.js';
import { hitterProfile, hitterDistribution, pitcherProfile, probOver, implied, marketProbabilities, rankScore } from '../pickdesk/propModel.js';
import { hitterMarketLine, homeRunsAllowedLine, pitcherMarketLine } from '../pickdesk/propSheets.js';
import { buildNflGameContext, nflPlayerProfile, screenNflBoard } from '../pickdesk/nflPropModel.js';
import { seasonClause, usageLine } from '../pickdesk/footballPropSheets.js';
import { DART_CATEGORIES, fmtOdds, etClock, normName } from './dartsCommon.js';
import { SIDED_MARKET } from './nflDartsBoard.js';

const ONE_SIDED_MARGIN = 1.07;   // a lone "yes" price carries the book's margin on one side
const PRESCREEN = 45;            // batters per category whose rows are fetched
const FETCH_CONCURRENCY = 6;
const LEAGUE_FIRST_INNING = 0.30; // share of games with a first-inning run, the prior
const PRIOR_GAMES = 10;

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** How many players Gary reads for a category: the whole board when it is
 *  small (a one-game night), else three per throw and never fewer than eight. */
export const menuSize = (count, total = Infinity) => (total <= 24 ? total : Math.max(8, 3 * Math.max(0, Number(count) || 0)));

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const at = i++; out[at] = await fn(items[at], at); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── MLB ────────────────────────────────────────────────────────────────────

/** The batters worth a fetch for a category, by the cheap lineup facts. */
export function prescreenMlb(kind, candidates, eligibleIds, limit = PRESCREEN) {
  const rows = eligibleIds.map((id) => candidates.get(id)).filter(Boolean);
  const heat = (c) => (c.heat === 'hot' ? 1 : c.heat === 'cold' ? -1 : 0);
  const score = kind === 'hr'
    ? (c) => (num(c.seasonHr) || 0) * 10 + heat(c) * 3 + (num(c.ops) || 0)
    : (c) => (num(c.ops) || 0) * 10 + heat(c) - (num(c.order) || 9) * 0.1;
  return rows.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

/** Season game rows for every needed batter and facing pitcher, by BDL id. */
export async function loadMlbRows(playerIds, season, { service = bdl, log = console } = {}) {
  const ids = [...new Set(playerIds.map(String).filter((id) => id && id !== 'null' && id !== 'undefined'))];
  const rows = new Map();
  let failed = 0;
  await mapLimit(ids, FETCH_CONCURRENCY, async (id) => {
    try {
      const r = await service.getMlbPlayerGameRowsChrono(Number(id), season);
      if (Array.isArray(r) && r.length) rows.set(id, r);
    } catch (e) { failed++; }
  });
  if (failed) log.warn(`[Darts] ${failed} of ${ids.length} MLB player row fetches failed; those players are read without a sheet`);
  return rows;
}

/** P(HR ≥ 1) or P(hits ≥ 2) from his own rates against tonight's arm; null under five games. */
export function mlbChance(kind, rows, { slot = null, pitcherRows = null } = {}) {
  if (!rows?.length) return null;
  const profile = hitterProfile(rows, { slot });
  if (!profile || profile.games < 5) return null;
  let opp = null;
  if (pitcherRows?.length) {
    const p = pitcherProfile(pitcherRows);
    if (p?.starts) opp = { hr: p.rates.hr, expectedBf: p.expectedBf };
  }
  const dist = hitterDistribution(profile, kind === 'hr' ? 'home_runs' : 'hits', opp);
  if (!dist) return null;
  return { p: probOver(dist, kind === 'hr' ? 0.5 : 1.5), games: profile.games };
}

/** One batter's sheet for a category: numbers only, newest first. */
export function mlbSheet(kind, c, rows, pitcherRows, game) {
  const lines = [];
  const bio = [`${c.player} ${c.position || ''}`.trim(), c.team ? c.team.replace(/^.* /, '') : null, c.bats ? `bats ${c.bats}` : null, c.order ? `${c.order}${['st','nd','rd'][c.order - 1] || 'th'} in the order` : null].filter(Boolean).join(' · ');
  lines.push(bio);
  const price = kind === 'hr' ? c.hr : c.hits;
  const market = kind === 'hr' ? hitterMarketLine(rows, 'home_runs', 0.5, fmtOdds(price?.odds)) : hitterMarketLine(rows, 'hits', 1.5, fmtOdds(price?.odds));
  if (market) lines.push(market);
  else lines.push(`${kind === 'hr' ? 'HOME RUN' : '2+ HITS'} ${fmtOdds(price?.odds)} — no game rows this season`);
  const season = [c.seasonHr != null ? `${c.seasonHr} HR this season` : null, c.ops ? `${String(c.ops).replace(/^0/, '')} OPS` : null, c.heat && c.heat !== 'steady' ? c.heat : null].filter(Boolean).join(', ');
  if (season) lines.push(season);
  if (c.facing?.name) {
    const arm = [`vs ${c.facing.name}${c.facing.hand ? ` (${c.facing.hand})` : ''}`];
    if (pitcherRows?.length) {
      const hrLine = homeRunsAllowedLine(pitcherRows); if (hrLine) arm.push(hrLine);
      const hits = pitcherMarketLine(pitcherRows, 'pitcher_hits_allowed', null, null); if (hits && kind === 'multihit') arm.push(hits.replace(/^pitcher_hits_allowed null/, 'hits allowed'));
    }
    lines.push(arm.join(' · '));
  }
  if (c.vsHand) lines.push(c.vsHand);
  if (game?.park) lines.push(game.park);
  if (game?.weather) lines.push(game.weather);
  return lines.join('\n    ');
}

/**
 * Screen one MLB category. Returns the menu (top of the model's order) with
 * sheets, plus the model's read per id for the record.
 */
export async function screenMlbCategory({ kind, board, count, rowsByPlayer, pitcherRowsByPlayer, log = console }) {
  const ids = board.eligible[kind] || [];
  if (kind === 'first_inning') return screenFirstInning({ board, count });
  const pre = prescreenMlb(kind, board.candidates, ids);
  const read = pre.map((c) => {
    const rows = rowsByPlayer.get(String(c.playerId)) || null;
    const pitcherRows = c.facing?.playerId ? pitcherRowsByPlayer.get(String(c.facing.playerId)) || null : null;
    const chance = mlbChance(kind, rows, { slot: num(c.order), pitcherRows });
    const odds = kind === 'hr' ? c.hr?.odds : c.hits?.odds;
    const fair = implied(odds) != null ? implied(odds) / ONE_SIDED_MARGIN : null;
    const edge = chance && fair != null ? chance.p - fair : null;
    return { id: c.id, c, rows, pitcherRows, chance, fair, edge, sheet: mlbSheet(kind, c, rows, pitcherRows, board.gamesById?.get(c.gameId)) };
  });
  // The model's order first; players it could not read (no rows) follow, by the cheap facts.
  const priced = read.filter((r) => r.edge != null).sort((a, b) => rankScore(b.edge) - rankScore(a.edge));
  const blind = read.filter((r) => r.edge == null);
  const menu = [...priced, ...blind].slice(0, menuSize(count, read.length));
  log.log(`   [Darts] ${kind}: ${ids.length} priced, ${pre.length} pre-screened, ${priced.length} read by the model, menu ${menu.length}`);
  return { kind, menu, screen: Object.fromEntries(read.map((r) => [r.id, { p: r.chance?.p ?? null, fair: r.fair, edge: r.edge, games: r.chance?.games ?? null }])) };
}

/** First-inning run: both clubs' recent first-inning scoring, shrunk to the league, against the yes/no price. */
export function firstInningChance(awayScoredL10, homeScoredL10) {
  const rate = (x) => ((num(x) ?? LEAGUE_FIRST_INNING * 10) + LEAGUE_FIRST_INNING * PRIOR_GAMES) / (10 + PRIOR_GAMES);
  const a = rate(awayScoredL10), h = rate(homeScoredL10);
  return 1 - (1 - a) * (1 - h);
}

export function screenFirstInning({ board, count }) {
  const ids = board.eligible.first_inning || [];
  const read = ids.map((id) => {
    const c = board.candidates.get(id);
    const g = board.gamesById?.get(c.gameId) || {};
    const p = firstInningChance(g.awayFirstL10, g.homeFirstL10);
    const mkt = marketProbabilities(c.yes, c.no);
    const edgeYes = mkt ? p - mkt.over : null, edgeNo = mkt ? (1 - p) - mkt.under : null;
    const side = edgeNo != null && edgeNo > edgeYes ? 'no' : 'yes';
    const edge = side === 'no' ? edgeNo : edgeYes;
    const sheet = [
      `${c.matchup} · ${etClock(c.commence)} · yes ${fmtOdds(c.yes)} / no ${fmtOdds(c.no)}`,
      g.awayFirstL10 != null ? `${g.awayAbbr || 'away'} scored in the 1st in ${g.awayFirstL10} of its last 10` : null,
      g.homeFirstL10 != null ? `${g.homeAbbr || 'home'} scored in the 1st in ${g.homeFirstL10} of its last 10` : null,
      g.starters ? g.starters : null,
      g.park || null, g.weather || null,
    ].filter(Boolean).join('\n    ');
    return { id, c, edge, side, sheet, chance: { p } };
  }).sort((a, b) => rankScore(b.edge ?? -1) - rankScore(a.edge ?? -1));
  return { kind: 'first_inning', menu: read, screen: Object.fromEntries(read.map((r) => [r.id, { p: r.chance.p, edge: r.edge, side: r.side }])) };
}

// ── NFL ────────────────────────────────────────────────────────────────────

const NFL_PROP = { td: 'anytime_td', qbtd: 'anytime_td', recyds: 'receiving_yards', rushyds: 'rushing_yards', passtd: 'passing_tds', int: 'interceptions' };

/** nflverse weekly rows → the game shape the sheets and the volume model read (newest first). */
export function nflGameFromRow(r) {
  const n = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
  return { week: n(r.week), opp: r.opponent_team, pass_comp: n(r.completions), pass_att: n(r.attempts), pass_yds: n(r.passing_yards), pass_tds: n(r.passing_tds), ints: n(r.passing_interceptions),
    rush_att: n(r.carries), rush_yds: n(r.rushing_yards), rush_tds: n(r.rushing_tds), receptions: n(r.receptions), targets: n(r.targets), rec_yds: n(r.receiving_yards), rec_tds: n(r.receiving_tds) };
}

/** The market rows the volume model prices for one category. */
export function nflMarkets(kind, board) {
  const ids = board.eligible[kind] || [];
  return ids.map((id) => {
    const c = board.candidates.get(id);
    if (kind === 'td' || kind === 'qbtd') return { id, player: c.player, team: c.team, game_id: c.gameId, prop_type: 'anytime_td', line: 0.5, over_odds: c.td?.odds, under_odds: null };
    const m = c[SIDED_MARKET[kind].key];
    return { id, player: c.player, team: c.team, game_id: c.gameId, prop_type: NFL_PROP[kind], line: m.line, over_odds: m.over, under_odds: m.under };
  });
}

/** One player's sheet for a category: this season beside last, usage, injury tag, the line. */
export function nflSheet(kind, c, games, prior, seasonLabel, priorLabel) {
  const propType = kind === 'qbtd' ? 'rushing_touchdowns' : NFL_PROP[kind];
  const priceText = kind === 'td' || kind === 'qbtd' ? fmtOdds(c.td?.odds) : (() => { const m = c[SIDED_MARKET[kind].key]; return `${m.line} over ${fmtOdds(m.over)} / under ${fmtOdds(m.under)}`; })();
  const lines = [`${c.player} ${c.position || ''} · ${c.team ? c.team.replace(/^.* /, '') : ''}${c.status ? ` · ${c.status}` : ''} · ${c.matchup} ${etClock(c.commence)}`.replace(/\s+·\s+·/g, ' ·')];
  lines.push(`${kind === 'td' ? 'ANYTIME TD' : kind === 'qbtd' ? 'QB RUSHING TD' : NFL_PROP[kind].replace('_', ' ')} ${priceText}`);
  const cur = seasonClause(games, propType, seasonLabel), prev = seasonClause(prior, propType, priorLabel);
  if (cur) lines.push(cur); else lines.push(`${seasonLabel}: no games yet`);
  if (prev) lines.push(prev);
  const use = usageLine(games, seasonLabel) || usageLine(prior, priorLabel);
  if (use) lines.push(use);
  if (c.gameLine) lines.push(c.gameLine);
  return lines.join('\n    ');
}

/**
 * Screen one NFL category with the volume model. `gamesByName` / `priorByName`
 * map normalized player names to game arrays (newest first); `contexts` maps
 * BDL game id → buildNflGameContext result (or null).
 */
export function screenNflCategory({ kind, board, count, gamesByName, priorByName, contexts, season, log = console }) {
  const markets = nflMarkets(kind, board);
  const profiles = new Map();
  const sideOf = (ctx, team) => {
    const t = normName(team);
    if (!ctx || !t) return null;
    if (t === ctx.names.home || ctx.names.home.includes(t) || t.includes(ctx.names.home)) return ctx.home;
    if (t === ctx.names.away || ctx.names.away.includes(t) || t.includes(ctx.names.away)) return ctx.away;
    return null;
  };
  const profileFor = (key, m) => {
    const k = `${key}|${m.game_id}`;
    if (!profiles.has(k)) {
      const c = board.candidates.get(m.id);
      const side = sideOf(contexts.get(String(m.game_id)), m.team);
      const current = gamesByName.get(key) || [], prior = priorByName.get(key) || [];
      profiles.set(k, { side, profile: side && (current.length || prior.length) ? nflPlayerProfile({ current, prior, position: c?.position, teamSide: side }) : null });
    }
    return profiles.get(k);
  };
  const screened = screenNflBoard(markets, { context: null, profileFor });
  const byId = new Map(screened.map((s) => [s.market.id, s]));
  const read = markets.map((m) => {
    const c = board.candidates.get(m.id);
    const s = byId.get(m.id) || null;
    const key = normName(c.player);
    return { id: m.id, c, edge: s?.edge ?? null, side: s?.side ?? (m.under_odds != null ? null : 'over'), chance: s ? { p: s.pModel, games: s.sample } : null,
      sheet: nflSheet(kind, c, gamesByName.get(key) || [], priorByName.get(key) || [], String(season), String(season - 1)) };
  });
  const priced = read.filter((r) => r.edge != null).sort((a, b) => rankScore(b.edge) - rankScore(a.edge));
  const blind = read.filter((r) => r.edge == null);
  const menu = [...priced, ...blind].slice(0, menuSize(count, read.length));
  log.log(`   [Darts] ${kind}: ${markets.length} priced, ${priced.length} read by the model, menu ${menu.length}`);
  return { kind, menu, screen: Object.fromEntries(read.map((r) => [r.id, { p: r.chance?.p ?? null, edge: r.edge, side: r.side, games: r.chance?.games ?? null }])) };
}

/** Team context per game for the volume model; a failed read leaves that game's players unpriced. */
export async function loadNflContexts(games, season, { log = console } = {}) {
  const out = new Map();
  await mapLimit(games, 3, async (g) => {
    try {
      const ctx = await buildNflGameContext({ game: { home_team: g.homeFull, away_team: g.awayFull }, season, spreadHome: g.spreadHome, total: g.total });
      out.set(String(g.gameId), ctx);
    } catch (e) { log.warn(`[Darts] NFL context for ${g.matchup} unavailable: ${e.message}`); out.set(String(g.gameId), null); }
  });
  return out;
}

export const CATEGORY_LABEL = Object.fromEntries(Object.values(DART_CATEGORIES).flat().map((c) => [c.kind, c.label]));
