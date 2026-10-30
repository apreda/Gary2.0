/**
 * Cash Rail worker pass (Oct 29 2026). For each NFL game on today's slate:
 * in the hour before kickoff, snapshot the pregame props + game odds every
 * 5 minutes (BDL drops them after the game); once the game starts, freeze the
 * last pre-kickoff snapshot, settle every play, and upsert the game's
 * live_boards row. A final game is settled once more, then left alone.
 * Adapters (`db`, `bdl`) are injected so the pass is testable without network.
 */
import { freezeBoard } from './prices.js';
import { settleNfl } from './settle.js';

const SNAPSHOT_EVERY_MS = 5 * 60_000;
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
 * @param {{ now?: Date, date: string, db: object, bdl: object, log?: Function }} deps
 * @returns {Promise<{snapshots: number, boards: number}>}
 */
export async function runPass({ now = new Date(), date, db, bdl, log = () => {} }) {
  const done = { snapshots: 0, boards: 0 };
  for (const gameId of await db.listNflGameIds(date)) {
    const g = await bdl.game(gameId);
    if (!g) continue;
    const id = String(gameId);
    const kickoff = new Date(g.date);
    const started = (g.status_state && g.status_state !== 'scheduled') || now >= kickoff;

    if (!started) {
      if ((kickoff - now) / 60_000 > SNAPSHOT_WINDOW_MIN) continue;
      const last = await db.lastSnapshot('NFL', id);
      if (last && now - new Date(last.captured_at) < SNAPSHOT_EVERY_MS) continue;
      const props = await bdl.props(gameId);
      if (!props?.length) continue;
      const gameOdds = await bdl.gameOdds(gameId);
      const players = await bdl.players([...new Set(props.map(r => r.player_id).filter(x => x != null))]);
      await db.insertSnapshot({ league: 'NFL', game_id: id, kickoff: g.date, captured_at: now.toISOString(), props, game_odds: gameOdds ?? [], players });
      done.snapshots++;
      log(`snapshot ${id}: ${props.length} props`);
      continue;
    }

    const board = await db.getBoard('NFL', id);
    if (board?.status === 'final') continue;
    const snap = await db.frozenSnapshot('NFL', id, g.date);
    const markets = snap ? freezeBoard(snap.props, snap.game_odds).markets : [];
    const gary = garyPickMarket(await db.garyPickRow(g), g);
    if (gary && snap && !markets.some(m => m.key === gary.market.key)) markets.push(gary.market);
    // The favorite and its frozen line ("GB -3.5"), for the line under the team names.
    const homeSpread = markets.find(m => m.propType === 'game_spread_home');
    const spread = !homeSpread ? null : homeSpread.line <= 0
      ? `${g.home_team?.abbreviation} ${homeSpread.line}` : `${g.visitor_team?.abbreviation} ${-homeSpread.line}`;
    const plays = await bdl.plays(gameId);
    const out = settleNfl({ markets, plays: plays ?? [], game: g, players: snap?.players ?? {}, garyPick: gary?.garyPick ?? null });
    await db.upsertBoard({ league: 'NFL', game_id: id, date, ...out, spread, prices_frozen_at: snap?.captured_at ?? null, updated_at: now.toISOString() });
    done.boards++;
    log(`board ${id}: ${out.status} ${out.clock} · ${out.hits.length} hits`);
  }
  return done;
}
