/** Current NCAAF prices from the paid BDL feed. Never substitute opening prices. */
import { ballDontLieService, getApiKey } from './ballDontLieService.js';
import { decodeBdlRows } from './bdlResponse.js';
import { resolveTeamIdentity } from './teamIdentity.js';
import { recordPickDataFailure } from './pickDataIntegrity.js';
import { NcaafPropMarketError, normalizeNcaafTeamName } from './ncaafPropOddsService.js';
export { NcaafPropMarketError };
const SPORT = 'americanfootball_ncaaf';
const TYPES = { passing_yards: 'passing_yards', passing_tds: 'passing_touchdowns', rushing_yards: 'rushing_yards', receiving_yards: 'receiving_yards', anytime_td: 'anytime_touchdown' };
const sameTeam = (a,b) => normalizeNcaafTeamName(a) === normalizeNcaafTeamName(b);
const name = player => player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim();

export function transformBdlNcaafMarkets(rows, { gameId, players, allowedBookmakers = null }) {
  const grouped = new Map();
  for (const source of rows) {
    if (String(source.game_id) !== String(gameId)) throw new Error('NCAAF market belongs to another game');
    const type = TYPES[source.prop_type];
    if (!type || (allowedBookmakers && !allowedBookmakers.includes(source.vendor))) continue;
    const player = players.get(String(source.player_id));
    if (!player?.name || !player.team) throw new Error(`NCAAF market player ${source.player_id} missing from the exact matchup rosters`);
    const line = source.line_value == null || source.line_value === '' ? NaN : Number(source.line_value);
    if (!Number.isFinite(line)) throw new Error(`NCAAF market has invalid line for player ${source.player_id}`);
    const market = source.market;
    if (!['over_under', 'milestone'].includes(market?.type)) throw new Error(`Unsupported BDL NCAAF market shape: ${market?.type}`);
    // One-sided yard milestones are >= N; they are not over N. Preserve the
    // offered integer ticket semantics as over N-0.5 for integer counting stats.
    const isMilestone = market.type === 'milestone';
    const ticketLine = isMilestone && type !== 'anytime_touchdown' && Number.isInteger(line) ? line - 0.5 : line;
    const over = isMilestone ? market.odds : market.over_odds;
    const under = isMilestone ? null : market.under_odds;
    if (![over, under].some(v => v != null && Number.isFinite(Number(v)) && Math.abs(Number(v)) >= 100)) throw new Error('NCAAF market has no valid American price');
    const key = `${source.player_id}:${type}:${ticketLine}`;
    const result = grouped.get(key) || { player: player.name, player_id: source.player_id, team: player.team, prop_type: type, line: ticketLine,
      over_odds: null, under_odds: null, over_vendor: null, under_vendor: null,
      vendor: 'balldontlie', source: 'BDL current player props', market_type: type === 'anytime_touchdown' ? 'yes_no' : 'over_under', game_id: gameId, source_markets: [] };
    for (const [side, value] of [['over',over],['under',under]]) {
      if (value == null) continue;
      const price = Number(value);
      if (!Number.isFinite(price) || Math.abs(price) < 100) throw new Error('Invalid NCAAF American odds');
      if (result[`${side}_odds`] == null || price > result[`${side}_odds`]) { result[`${side}_odds`] = price; result[`${side}_vendor`] = source.vendor; result[`${side}_source_market`] = source; }
    }
    result.source_markets.push(source);
    grouped.set(key,result);
  }
  return [...grouped.values()];
}

export const ncaafPropOddsService = {
  async getPlayerPropMarkets({ homeTeam, awayTeam, commenceTime, bdlGameId, allowedBookmakers = null, fetchImpl = fetch, service = ballDontLieService }) {
    try {
      if (!bdlGameId || !Number.isFinite(Date.parse(commenceTime))) throw new Error('NCAAF current props require exact game ID and kickoff');
      const [game, teams] = await Promise.all([service.getGame(SPORT, bdlGameId), service.getTeams(SPORT)]);
      const home = resolveTeamIdentity(teams,homeTeam), away = resolveTeamIdentity(teams,awayTeam);
      const awayGame = game?.visitor_team || game?.away_team;
      if (!home || !away || String(game?.home_team?.id) !== String(home.id) || String(awayGame?.id) !== String(away.id)
        || !sameTeam(home.full_name || home.name,homeTeam) || !sameTeam(away.full_name || away.name,awayTeam)
        || Date.parse(game?.date || game?.start_time) !== Date.parse(commenceTime)) throw new Error('NCAAF prop game identity or kickoff mismatch');
      const response = await fetchImpl(`https://api.balldontlie.io/ncaaf/v1/odds/player_props?game_id=${encodeURIComponent(bdlGameId)}`, { headers: { Authorization: getApiKey() }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw Object.assign(new Error(`BDL NCAAF current props HTTP ${response.status}`),{status:response.status});
      const rows = decodeBdlRows(await response.json(),'BDL NCAAF current props').map(row => ({...row, _gary_observed_at:new Date().toISOString()}));
      if (!rows.length) throw new NcaafPropMarketError('NO_LIVE_PROP_MARKETS','BDL returned a verified empty current NCAAF prop board');
      const [homeRoster,awayRoster] = await Promise.all([service.getActivePlayersComplete(SPORT,home.id),service.getActivePlayersComplete(SPORT,away.id)]);
      if (!homeRoster.length || !awayRoster.length) throw new Error('NCAAF prop roster missing');
      const players = new Map();
      for (const [roster,team] of [[homeRoster,homeTeam],[awayRoster,awayTeam]]) for (const player of roster) {
        if (players.has(String(player.id))) throw new Error('Player appears on both NCAAF matchup rosters');
        players.set(String(player.id),{name:name(player),team});
      }
      const result = transformBdlNcaafMarkets(rows,{gameId:bdlGameId,players,allowedBookmakers});
      if (!result.length) throw new NcaafPropMarketError('NO_LIVE_PROP_MARKETS','BDL has no eligible current NCAAF prop markets');
      return result;
    } catch (error) {
      if (error.code !== 'NO_LIVE_PROP_MARKETS') recordPickDataFailure('BDL:NCAAF current props',error);
      throw error;
    }
  }
};
