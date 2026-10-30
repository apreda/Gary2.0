/**
 * Cash Rail worker pass (Oct 29 2026; every sport with a settlement engine
 * since Oct 30). For each game it watches (every NFL game on the slate; the
 * NBA's big games):
 * in the hour before kickoff, snapshot the pregame props + game odds every
 * 5 minutes (BDL drops them after the game); once the game starts, freeze the
 * last pre-kickoff snapshot, settle every play, and upsert the game's
 * live_boards row. A final game is settled once more, then left alone.
 * Adapters (`db`, `bdl`) are injected so the pass is testable without network.
 */
import { freezeBoard, settleableType } from './prices.js';
import { settleNfl } from './settle.js';
import { nbaSettleable, settleNba } from './settleNba.js';
import { garyBets } from './garyBets.js';

const SNAPSHOT_EVERY_MS = 5 * 60_000;

/** Each sport's engine, its gradeable prop types and where BDL keeps the start time. */
export const SPORTS = {
  NFL: { settle: settleNfl, settleable: settleableType, start: g => g.date },
  NBA: { settle: settleNba, settleable: nbaSettleable, start: g => g.datetime ?? g.date },
};
const SNAPSHOT_WINDOW_MIN = 60;

/** Gary's game pick → the price-board market it matches ({type, side, line}) plus its own market. */
export function garyPickMarket(pick, game) {
  if (!pick || !game) return null;
  const home = game.home_team?.full_name, away = game.visitor_team?.full_name;
  const text = String(pick.pick || '');
  const side = home && text.startsWith(home) ? 'home' : away && text.startsWith(away) ? 'away' : null;
  const price = Number(pick.odds);
  if (!Number.isFinite(price)) return null;
  const type = String(pick.type || '').toLowerCase();
  if (type === 'spread' && side) {
    const line = Number(pick.spread);
    if (!Number.isFinite(line)) return null;
    const label = line > 0 ? `+${line}` : String(line);
    return { garyPick: { type: 'spread', side, line },
      market: { key: `game|spread|${side}|${line}`, playerId: null, propType: `game_spread_${side}`, kind: 'spread', line, label, price } };
  }
  if ((type === 'moneyline' || type === 'ml') && side) {
    return { garyPick: { type: 'ml', side },
      market: { key: `game|ml|${side}`, playerId: null, propType: `game_ml_${side}`, kind: 'ml', line: null, label: 'ML', price } };
  }
  if (type === 'total' && /^over/i.test(text)) {
    const line = Number(pick.total ?? text.match(/[\d.]+/)?.[0]);
    if (!Number.isFinite(line)) return null;
    return { garyPick: { type: 'total', side: 'over', line },
      market: { key: `game|total|over|${line}`, playerId: null, propType: 'game_total', kind: 'over', line, label: `O ${line}`, price } };
  }
  return null;
}

/**
 * @param {{ league?: string, now?: Date, date: string, db: object, bdl: object, log?: Function, only?: string|number, resettle?: boolean }} deps
 * `bdl` reads this league; `only` runs one game; `resettle` settles it again even when its board is final.
 * @returns {Promise<{snapshots: number, boards: number}>}
 */
export async function runPass({ league = 'NFL', now = new Date(), date, db, bdl, log = () => {}, only = null, resettle = false }) {
  const sport = SPORTS[league];
  const done = { snapshots: 0, boards: 0 };
  const ids = only != null ? [only] : league === 'NFL' ? await db.listNflGameIds(date) : await db.listGameIds(league, date);
  for (const gameId of ids) {
    const g = await bdl.game(gameId);
    if (!g) continue;
    const id = String(gameId);
    const start = sport.start(g);
    const kickoff = new Date(start);
    const started = (g.status_state && g.status_state !== 'scheduled') || now >= kickoff;

    if (!started) {
      if ((kickoff - now) / 60_000 > SNAPSHOT_WINDOW_MIN) continue;
      const last = await db.lastSnapshot(league, id);
      if (last && now - new Date(last.captured_at) < SNAPSHOT_EVERY_MS) continue;
      const props = await bdl.props(gameId);
      if (!props?.length) continue;
      const gameOdds = await bdl.gameOdds(gameId);
      // Names for the board; jersey number and team for the celebrations.
      const people = await bdl.players([...new Set(props.map(r => r.player_id).filter(x => x != null))]);
      const players = {}, roster = {};
      for (const [pid, p] of Object.entries(people ?? {})) {
        if (typeof p === 'string') { players[pid] = p; continue; }
        players[pid] = p.name;
        roster[pid] = { number: p.number, team: p.team };
      }
      // Book deep links are most of a row's weight and nothing here reads them.
      const slim = props.map(({ deeplinks, ...r }) => r);
      await db.insertSnapshot({ league, game_id: id, kickoff: start, captured_at: now.toISOString(), props: slim, game_odds: gameOdds ?? [], players, roster });
      done.snapshots++;
      log(`snapshot ${id}: ${props.length} props`);
      continue;
    }

    const board = await db.getBoard(league, id);
    if (board?.status === 'final' && !resettle) continue;
    const snap = await db.frozenSnapshot(league, id, start);
    const markets = snap ? freezeBoard(snap.props, snap.game_odds, { settleable: sport.settleable }).markets : [];
    const gary = garyPickMarket(await db.garyPickRow(g, league), g);
    if (gary && snap && !markets.some(m => m.key === gary.market.key)) markets.push(gary.market);
    // The favorite and its frozen line ("GB -3.5"), for the line under the team names.
    const homeSpread = markets.find(m => m.propType === 'game_spread_home');
    const spread = !homeSpread ? null : homeSpread.line <= 0
      ? `${g.home_team?.abbreviation} ${homeSpread.line}` : `${g.visitor_team?.abbreviation} ${-homeSpread.line}`;
    const plays = await bdl.plays(gameId);
    const out = sport.settle({ markets, plays: plays ?? [], game: g, players: snap?.players ?? {}, garyPick: gary?.garyPick ?? null });
    // Gary's own pick, props and darts on an NFL game, for the strip under the scoreboard.
    const mine = league === 'NFL' && db.garyBets ? await db.garyBets(id, g) : null;
    const gary_bets = league === 'NFL'
      ? garyBets({ plays: plays ?? [], game: g, garyPick: gary?.garyPick ?? null, props: mine?.props ?? [], darts: mine?.darts ?? [] })
      : null;
    await db.upsertBoard({ league, game_id: id, date, ...out, spread, gary_bets, prices_frozen_at: snap?.captured_at ?? null, updated_at: now.toISOString() });
    done.boards++;
    log(`board ${id}: ${out.status} ${out.clock} · ${out.hits.length} hits`);
  }
  return done;
}
