/**
 * THE SHADOW PICK (founder GO, Sep 3 2026): one call per MLB game, made in
 * the pick child right after Gary's pick is stored. Gathers tonight's facts
 * from the same official sources the desk uses — the pen builder (every
 * arm with pitch counts by date), the probable starters' game logs, the
 * confirmed lineups, and each club's hitters by games played — hands them
 * to the market model, and stores the shadow's bet beside Gary's. Fail-soft
 * end to end: a missing feed skips a feature; a thrown error stores
 * nothing and never touches Gary's pick.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getMlbSchedule, getProbablePitchers, getPitcherGameLogRaw, getConfirmedLineups, findMlbTeam, getTeamRoster } from '../mlbStatsApiService.js';
import { buildPenArmsForTeam } from '../agentic/tools/statRouters/penArms.js';
import { fetchSeasonStatsWithFallback, resolveBdlTeamId } from '../agentic/tools/statRouters/mlbFetchers.js';
import { decide, penAvailability, starterLeash, lineupAbsence, nameKey, DEFAULT_WEIGHTS } from './marketModel.js';
import { readLateNews, newsAdjustment } from './newsReader.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SHADOW_MODEL_VERSION = 'shadow-v1-2026-09-03';

export function loadShadowWeights() {
  try {
    const o = JSON.parse(readFileSync(path.join(HERE, 'weights.json'), 'utf8'));
    const w = { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(DEFAULT_WEIGHTS)) if (Number.isFinite(Number(o?.[k]))) w[k] = Number(o[k]);
    return w;
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TWO_WORD = ['Red Sox', 'White Sox', 'Blue Jays'];
/** "Boston Red Sox" → "Red Sox"; "Athletics" → "Athletics". */
export function clubNick(fullName) {
  const s = String(fullName || '').trim();
  for (const t of TWO_WORD) if (s.endsWith(t)) return t;
  const parts = s.split(/\s+/);
  return parts[parts.length - 1] || s;
}
const fmtPrice = (p) => (Number(p) > 0 ? `+${Number(p)}` : `${Number(p)}`);

/** Resolve the official gamePk for a slate game by club names and date. */
export async function resolveGamePk(game, homeTeam, awayTeam, todayEt) {
  if (game?.gamePk) return game.gamePk;
  const sched = await getMlbSchedule(todayEt);
  const h = norm(homeTeam);
  const a = norm(awayTeam);
  const hits = (sched || []).filter((g) => {
    const gh = norm(g?.teams?.home?.team?.name);
    const ga = norm(g?.teams?.away?.team?.name);
    return gh && ga && (gh === h || gh.endsWith(h) || h.endsWith(gh)) && (ga === a || ga.endsWith(a) || a.endsWith(ga));
  });
  if (!hits.length) return null;
  const start = game?.commence_time ? new Date(game.commence_time).getTime() : null;
  hits.sort((x, y) => (start == null ? 0 : Math.abs(new Date(x.gameDate) - start) - Math.abs(new Date(y.gameDate) - start)));
  return hits[0].gamePk ?? null;
}

/**
 * A club's hitters by games played, limited to the ACTIVE roster: season
 * stats by team include everyone who played for the club this year, and a
 * man traded in July is not a missing regular in September.
 */
async function hittersFor(teamName) {
  try {
    const [teamId, mlbTeam] = await Promise.all([
      resolveBdlTeamId({ full_name: teamName, name: teamName }),
      findMlbTeam(teamName).catch(() => null),
    ]);
    if (!teamId) return null;
    const result = await fetchSeasonStatsWithFallback({ teamId, season: new Date().getFullYear() });
    let hitters = (result?.stats || []).filter((s) => (s.batting_ab || 0) >= 20);
    const roster = mlbTeam?.id ? await getTeamRoster(mlbTeam.id).catch(() => null) : null;
    if (Array.isArray(roster) && roster.length) {
      const active = new Set(roster.map((r) => nameKey(r?.name)));
      hitters = hitters.filter((h) => active.has(nameKey(h?.player?.full_name)));
    }
    return hitters;
  } catch {
    return null;
  }
}

/** Tonight's features for both clubs. Each feature is null when its feed is missing. */
export async function gatherFeatures({ gamePk, homeTeam, awayTeam, todayEt, deskText = null, weights = null }) {
  const year = new Date().getFullYear();
  const notes = [];
  const [probables, lineups, homePen, awayPen, homeHitters, awayHitters] = await Promise.all([
    gamePk ? getProbablePitchers(gamePk).catch(() => null) : null,
    gamePk ? getConfirmedLineups(gamePk).catch(() => null) : null,
    buildPenArmsForTeam({ full_name: homeTeam }, homeTeam, { todayEt }).catch(() => null),
    buildPenArmsForTeam({ full_name: awayTeam }, awayTeam, { todayEt }).catch(() => null),
    hittersFor(homeTeam),
    hittersFor(awayTeam),
  ]);
  const logFor = async (p) => (p?.id ? getPitcherGameLogRaw(p.id, year).catch(() => null) : null);
  const [homeLog, awayLog] = await Promise.all([logFor(probables?.home), logFor(probables?.away)]);
  if (!gamePk) notes.push('no gamePk: lineups and starters skipped');
  if (!probables?.home || !probables?.away) notes.push('a probable starter is missing');
  if (!lineups?.home || !lineups?.away) notes.push('confirmed lineups not posted');
  const side = (pen, log, lineup, hitters, starter) => ({
    pen: pen?.ok ? penAvailability(pen.arms, todayEt) : { score: null, available: 0, of: 0, down: [] },
    leash: { ...starterLeash(log, todayEt), starter: starter?.fullName || null },
    lineup: lineupAbsence(lineup, hitters),
  });
  const home = side(homePen, homeLog, lineups?.home, homeHitters, probables?.home);
  const away = side(awayPen, awayLog, lineups?.away, awayHitters, probables?.away);
  // THE LATE-NEWS READER: the fourth fact, what the feeds cannot show. One
  // LLM call with web search → typed facts → points, de-duplicated against
  // the three feed features above. Skipped when there is no desk to read.
  let news = { facts: [], pts: 0, drivers: [], error: deskText ? null : 'no desk text', ms: 0 };
  if (deskText) {
    const read = await readLateNews({ homeTeam, awayTeam, todayEt, deskText });
    const adj = newsAdjustment(read.facts, { home, away }, weights || DEFAULT_WEIGHTS);
    news = { facts: read.facts, pts: adj.pts, drivers: adj.drivers, error: read.error || null, ms: read.ms };
    if (read.error) notes.push(`news reader: ${read.error}`);
  }
  return { home, away, news, notes };
}

/**
 * Build and store the shadow pick for one game. `game` is the slate game the
 * child analyzed (board prices, bookmakers, commence_time, id). Returns the
 * stored row or { ok:false, error }.
 */
export async function buildShadowPick({ game, homeTeam, awayTeam, gamePk = null, todayEt, garyPick = null, deskText = null, db }) {
  try {
    const board = {
      moneyline_home: game?.moneyline_home ?? null,
      moneyline_away: game?.moneyline_away ?? null,
      spread_home: game?.spread_home ?? null,
      spread_home_odds: game?.spread_home_odds ?? null,
      spread_away: game?.spread_away ?? null,
      spread_away_odds: game?.spread_away_odds ?? null,
      line_vendor: game?.line_vendor ?? null,
    };
    const pk = gamePk || await resolveGamePk(game, homeTeam, awayTeam, todayEt).catch(() => null);
    const weights = loadShadowWeights();
    const features = await gatherFeatures({ gamePk: pk, homeTeam, awayTeam, todayEt, deskText, weights });
    const d = decide({ board, bookmakers: game?.bookmakers || null, features, weights, homeName: clubNick(homeTeam), awayName: clubNick(awayTeam) });
    if (!d.ok) return { ok: false, error: d.error };
    const c = d.choice;
    const pickText = `${c.label} ${fmtPrice(c.price)}`;
    const garySide = garyPick ? (norm(garyPick).startsWith(norm(clubNick(homeTeam))) ? 'home' : norm(garyPick).startsWith(norm(clubNick(awayTeam))) ? 'away' : null) : null;
    const row = {
      game_date: todayEt,
      league: 'MLB',
      game_id: String(game?.id ?? game?.bdl_game_id ?? ''),
      game_pk: pk != null ? String(pk) : null,
      matchup: `${awayTeam} @ ${homeTeam}`,
      home_team: homeTeam,
      away_team: awayTeam,
      pick_text: pickText,
      side: c.side,
      bet_type: c.type,
      point: c.type === 'spread' ? (c.label.includes('-1.5') ? -1.5 : 1.5) : null,
      price: c.price,
      p_market: d.pHomeMarket,
      p_adj: d.pHomeAdj,
      ev: c.ev,
      adjustment_pts: d.adjustment.pts,
      drivers: d.adjustment.drivers,
      tickets: d.tickets,
      features,
      weights,
      board: { ...board, consensus_books: d.consensusBooks },
      gary_pick: garyPick,
      agree_with_gary: garySide ? garySide === c.side : null,
      model_version: SHADOW_MODEL_VERSION,
      computed_at: new Date().toISOString(),
    };
    if (db) {
      const { error } = await db.from('shadow_picks').upsert(row, { onConflict: 'game_date,league,game_id' });
      if (error) return { ok: false, error: error.message, row };
    }
    return { ok: true, row };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
