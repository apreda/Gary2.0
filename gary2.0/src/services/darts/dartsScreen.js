/**
 * THE DART SCREEN (founder GO, Sep 24 2026): "who are the best bets in this
 * category today?" Every priced player is on the board Gary reads; no player
 * is hidden (Adam: the seventh hitter on a heater, the "he's due" bet). The
 * prop models (MLB: his own per-plate-appearance rates against tonight's arm;
 * NFL: team volume, opponent, share and efficiency) only put the board in
 * ORDER; their numbers never reach the ask. Each player carries his sheet:
 * his games by date, opponent and arm, the windows side by side, his splits,
 * his own price history; each game carries its frame (both starters, the
 * Arms take, the clubs' form, park and weather). Gary picks and says why.
 */
import { ballDontLieService as bdl } from '../ballDontLieService.js';
import { hitterProfile, hitterDistribution, pitcherProfile, probOver, implied, marketProbabilities, rankScore } from '../pickdesk/propModel.js';
import { buildNflGameContext, nflPlayerProfile, screenNflBoard } from '../pickdesk/nflPropModel.js';
import { seasonClause, usageLine } from '../pickdesk/footballPropSheets.js';
import { priceHistoryLine } from '../pickdesk/priceHistory.js';
import {
  hitterGameLog, hitterWindows, pitcherStartLog, pitcherSeasonLine, platoonLine, slotLine, vsPitcherLine, expectedStatsLine,
  firstInningSeasonLine, firstInningStartsLine, clubFirstInningsLine, clubFormLine,
} from '../mlbGameFrames.js';
import { DART_CATEGORIES, fmtOdds, etClock, normName } from './dartsCommon.js';
import { SIDED_MARKET } from './nflDartsBoard.js';

const ONE_SIDED_MARGIN = 1.07;   // a lone "yes" price carries the book's margin on one side
const FETCH_CONCURRENCY = 6;
const LEAGUE_FIRST_INNING = 0.30; // share of games with a first-inning run, the prior
const PRIOR_GAMES = 10;

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const opsText = (v) => (v == null || v === '' ? null : Number(v).toFixed(3).replace(/^0/, ''));

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const at = i++; out[at] = await fn(items[at], at); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── MLB ────────────────────────────────────────────────────────────────────

/** Season game rows for every needed batter and pitcher, by BDL id. */
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

/** P(HR ≥ 1) or P(hits ≥ 2) from his own rates against tonight's arm; null under five games. The ORDER only. */
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

const MARKET = { hr: { label: 'HOME RUN', prop: 'home_runs', line: 0.5, key: 'hr' }, multihit: { label: '2+ HITS', prop: 'hits', line: 1.5, key: 'hits' } };
const clubOf = (team) => String(team || '').replace(/^.* /, '');

/**
 * Everything a batter's dart sheet reads beyond his own rows (`ctx`):
 * games (mlbGameFrames), splits (loadMlbPlayerSplits), vs (loadVsPitcher),
 * xstats (Savant batter rows by MLBAM id), history (loadPriceHistory),
 * gamePkOf (board game id → MLB gamePk).
 */
export function mlbPlayerSheet(kind, c, rows, ctx = {}) {
  const m = MARKET[kind];
  const gamePk = ctx.gamePkOf?.(c.gameId) ?? null;
  const split = gamePk ? ctx.splits?.hitter(gamePk, c.player) : null;
  const lines = [];
  lines.push([`${c.player} ${c.position || ''}`.trim(), clubOf(c.team), c.bats ? `bats ${c.bats}` : null, slotLine(c.order, split)].filter(Boolean).join(' · '));
  const price = c[m.key];
  lines.push(`${m.label} ${fmtOdds(price?.odds)}${price?.book ? ` (${price.book})` : ''}`);
  const hist = priceHistoryLine(ctx.history, c.player, m.prop, { line: m.line, label: `${m.label.toLowerCase()} price` });
  if (hist) lines.push(hist);
  const season = [c.seasonHr != null ? `${c.seasonHr} HR` : null, c.ops ? `${String(c.ops).replace(/^0/, '')} OPS` : null].filter(Boolean).join(', ');
  if (season) lines.push(`season line: ${season}`);
  const plat = platoonLine(split);
  if (plat) lines.push(plat);
  if (c.facing?.name && gamePk && ctx.vs && ctx.splits) {
    const vs = ctx.vs.get(`${ctx.splits.idOf(gamePk, c.player)}|${ctx.splits.idOf(gamePk, c.facing.name)}`);
    const v = vsPitcherLine(vs, c.facing.name);
    if (v) lines.push(v);
  }
  const x = gamePk && ctx.xstats ? ctx.xstats.get(String(ctx.splits?.idOf(gamePk, c.player))) : null;
  const xl = expectedStatsLine(x);
  if (xl) lines.push(xl);
  const windows = hitterWindows(rows);
  if (windows) lines.push(windows);
  const log = hitterGameLog(rows, ctx.games, { limit: 10 });
  if (log.length) lines.push(`by game, newest first:\n      ${log.join('\n      ')}`);
  else lines.push('no games this season');
  return lines.join('\n    ');
}

/** One batter in a line for the whole-board read. */
export function mlbBoardLine(kind, c, rows) {
  const m = MARKET[kind];
  const played = (rows || []).filter((r) => Number(r?.plate_appearances ?? r?.at_bats ?? 0) > 0);
  const last7 = (() => {
    if (!played.length) return null;
    const end = String(played[played.length - 1]._game?.date || '').slice(0, 10);
    const start = new Date(Date.parse(`${end}T12:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
    const wk = played.filter((r) => String(r._game?.date || '').slice(0, 10) >= start);
    const sum = (k) => wk.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    return wk.length ? `last 7 days ${sum('hits')} for ${sum('at_bats')}, ${sum('hr')} HR in ${wk.length} games` : null;
  })();
  return [
    `${c.player} (${clubOf(c.team)}${c.bats ? `, bats ${c.bats}` : ''}${c.order ? `, ${c.order}${['st', 'nd', 'rd'][c.order - 1] || 'th'}` : ''})${c.facing?.name ? ` vs ${c.facing.name}${c.facing.hand ? ` (${c.facing.hand})` : ''}` : ''}`,
    `${m.label} ${fmtOdds(c[m.key]?.odds)}`,
    [c.seasonHr != null ? `${c.seasonHr} HR` : null, c.ops ? `${String(c.ops).replace(/^0/, '')} OPS` : null].filter(Boolean).join(', ') || null,
    last7,
  ].filter(Boolean).join(' · ');
}

/** One starter's profile on a game frame. */
function starterBlock(abbr, s, rows, ctx, gamePk) {
  if (!s?.name) return [`${abbr} starter: not announced`];
  const head = [`${abbr} starter: ${s.name}${s.hand ? ` (${s.hand})` : ''}`];
  if (s.era != null) head.push(`${s.era} ERA`);
  if (s.restDays != null) head.push(`${s.restDays} days' rest`);
  const out = [head.join(' · ')];
  const season = pitcherSeasonLine(rows);
  if (season) out.push(`  ${season}`);
  const fiSeason = gamePk ? firstInningSeasonLine(ctx.splits?.firstInning(gamePk, s.name)) : null;
  if (fiSeason) out.push(`  ${fiSeason}`);
  const fiStarts = firstInningStartsLine(ctx.games, s.name);
  if (fiStarts) out.push(`  ${fiStarts}`);
  const log = pitcherStartLog(rows, ctx.games, { limit: 8 });
  if (log.length) out.push(`  last starts, newest first:\n      ${log.join('\n      ')}`);
  return out;
}

/** The frame of one game, printed once above its players' sheets. */
export function mlbGameBlock(frame, ctx = {}, rowsByPlayer = new Map()) {
  const gamePk = ctx.gamePkOf?.(frame.gameId) ?? null;
  const head = [`${frame.matchup} · ${etClock(frame.commence)}`, frame.park, frame.weather, frame.total != null ? `total ${frame.total}` : null, frame.moneyline].filter(Boolean);
  const lines = [head.join(' · ')];
  for (const side of ['away', 'home']) {
    const s = frame[`${side}Starter`];
    lines.push(...starterBlock(frame[`${side}Abbr`], s, s?.playerId ? rowsByPlayer.get(String(s.playerId)) : null, ctx, gamePk));
  }
  if (frame.armsTake) lines.push(`The Arms take: ${frame.armsTake}`);
  for (const side of ['away', 'home']) {
    const club = [frame[`${side}Offense`], frame[`${side}VsHand`] ? frame[`${side}VsHand`].replace(/^\S+ hitters/, 'hitters') : null].filter(Boolean).join('; ');
    if (club) lines.push(`${frame[`${side}Abbr`]}: ${club}`);
    const form = clubFormLine(ctx.games, frame[`${side}Name`]);
    if (form) lines.push(`${frame[`${side}Abbr`]} ${form}`);
    const fi = clubFirstInningsLine(ctx.games, frame[`${side}Name`]);
    if (fi) lines.push(`${frame[`${side}Abbr`]} ${fi}`);
  }
  return lines.join('\n    ');
}

/**
 * Screen one MLB category: every priced batter, in the model's order (players
 * it could not read follow). The model's numbers go to the record, never the ask.
 */
export function screenMlbCategory({ kind, board, rowsByPlayer, ctx = {}, log = console }) {
  if (kind === 'first_inning') return screenFirstInning({ board, ctx, rowsByPlayer });
  const ids = board.eligible[kind] || [];
  const read = ids.map((id) => {
    const c = board.candidates.get(id);
    const rows = rowsByPlayer.get(String(c.playerId)) || null;
    const pitcherRows = c.facing?.playerId ? rowsByPlayer.get(String(c.facing.playerId)) || null : null;
    const chance = mlbChance(kind, rows, { slot: num(c.order), pitcherRows });
    const odds = kind === 'hr' ? c.hr?.odds : c.hits?.odds;
    const fair = implied(odds) != null ? implied(odds) / ONE_SIDED_MARGIN : null;
    const edge = chance && fair != null ? chance.p - fair : null;
    return { id, c, gameId: c.gameId, chance, fair, edge, sheet: mlbPlayerSheet(kind, c, rows, ctx), line: mlbBoardLine(kind, c, rows) };
  });
  const priced = read.filter((r) => r.edge != null).sort((a, b) => rankScore(b.edge) - rankScore(a.edge));
  const blind = read.filter((r) => r.edge == null);
  const menu = [...priced, ...blind];
  log.log(`   [Darts] ${kind}: ${ids.length} priced, ${priced.length} read by the model, all ${menu.length} on the board`);
  return { kind, menu, screen: Object.fromEntries(read.map((r) => [r.id, { p: r.chance?.p ?? null, fair: r.fair, edge: r.edge, games: r.chance?.games ?? null }])) };
}

/** First-inning run: both clubs' recent first-inning scoring, shrunk to the league, against the yes/no price. The ORDER only. */
export function firstInningChance(awayScoredL10, homeScoredL10) {
  const rate = (x) => ((num(x) ?? LEAGUE_FIRST_INNING * 10) + LEAGUE_FIRST_INNING * PRIOR_GAMES) / (10 + PRIOR_GAMES);
  const a = rate(awayScoredL10), h = rate(homeScoredL10);
  return 1 - (1 - a) * (1 - h);
}

/** Every first-inning market; each game's sheet is its whole frame (both starters' first innings, both clubs'). */
export function screenFirstInning({ board, ctx = {}, rowsByPlayer = new Map() }) {
  const ids = board.eligible.first_inning || [];
  const read = ids.map((id) => {
    const c = board.candidates.get(id);
    const g = board.gamesById?.get(c.gameId) || {};
    const p = firstInningChance(g.awayFirstL10, g.homeFirstL10);
    const mkt = marketProbabilities(c.yes, c.no);
    const edgeYes = mkt ? p - mkt.over : null, edgeNo = mkt ? (1 - p) - mkt.under : null;
    const side = edgeNo != null && edgeNo > edgeYes ? 'no' : 'yes';
    const edge = side === 'no' ? edgeNo : edgeYes;
    const sheet = `FIRST-INNING RUN yes ${fmtOdds(c.yes)} / no ${fmtOdds(c.no)}\n    ${g.gameId ? mlbGameBlock(g, ctx, rowsByPlayer) : c.matchup}`;
    return { id, c, gameId: c.gameId, standalone: true, edge, side, sheet, line: `${c.matchup} ${etClock(c.commence)} · yes ${fmtOdds(c.yes)} / no ${fmtOdds(c.no)}`, chance: { p } };
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
const nflPriceText = (kind, c) => (kind === 'td' || kind === 'qbtd' ? fmtOdds(c.td?.odds) : (() => { const m = c[SIDED_MARKET[kind].key]; return `${m.line} over ${fmtOdds(m.over)} / under ${fmtOdds(m.under)}`; })());
const nflLabel = (kind) => (kind === 'td' ? 'ANYTIME TD' : kind === 'qbtd' ? 'QB RUSHING TD' : NFL_PROP[kind].replace('_', ' '));

/** The frame of one NFL game, printed once above its players' sheets. */
export function nflGameBlock(frame) {
  const sp = frame.spreadHome;
  const spread = sp == null ? null : sp < 0 ? `${frame.homeFull?.replace(/^.* /, '')} ${sp}` : sp > 0 ? `${frame.awayFull?.replace(/^.* /, '')} ${-sp}` : 'pick em';
  const lines = [[`${frame.matchup} · ${new Date(frame.commence).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' })} ${etClock(frame.commence)}`, spread, frame.total != null ? `total ${frame.total}` : null].filter(Boolean).join(' · ')];
  for (const extra of frame.extra || []) lines.push(extra);
  return lines.join('\n    ');
}

/** One NFL player in a line for the whole-board read. */
export function nflBoardLine(kind, c, games, seasonLabel) {
  return `${c.player} (${[c.position, c.team ? c.team.replace(/^.* /, '') : null, c.status].filter(Boolean).join(', ')}) · ${c.matchup} · ${nflLabel(kind)} ${nflPriceText(kind, c)} · ${seasonLabel}: ${games.length} game${games.length === 1 ? '' : 's'}`;
}

export function nflSheet(kind, c, games, prior, seasonLabel, priorLabel, ctx = {}) {
  const propType = kind === 'qbtd' ? 'rushing_touchdowns' : NFL_PROP[kind];
  const priceText = nflPriceText(kind, c);
  const lines = [`${c.player} ${c.position || ''} · ${c.team ? c.team.replace(/^.* /, '') : ''}${c.status ? ` · ${c.status}` : ''} · ${c.matchup} ${etClock(c.commence)}`.replace(/\s+·\s+·/g, ' ·')];
  lines.push(`${nflLabel(kind)} ${priceText}`);
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
export function screenNflCategory({ kind, board, gamesByName, priorByName, contexts, season, ctx = {}, log = console }) {
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
    const sheet = nflSheet(kind, c, gamesByName.get(key) || [], priorByName.get(key) || [], String(season), String(season - 1), ctx);
    return { id: m.id, c, gameId: c.gameId, edge: s?.edge ?? null, side: s?.side ?? (m.under_odds != null ? null : 'over'), chance: s ? { p: s.pModel, games: s.sample } : null,
      sheet, line: nflBoardLine(kind, c, gamesByName.get(key) || [], String(season)) };
  });
  const priced = read.filter((r) => r.edge != null).sort((a, b) => rankScore(b.edge) - rankScore(a.edge));
  const blind = read.filter((r) => r.edge == null);
  const menu = [...priced, ...blind];
  log.log(`   [Darts] ${kind}: ${markets.length} priced, ${priced.length} read by the model, all ${menu.length} on the board`);
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
