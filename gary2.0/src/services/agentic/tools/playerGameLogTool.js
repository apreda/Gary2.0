import { nbaSeason, nflSeason, ncaafSeason } from '../../../utils/dateUtils.js';
import { completedGameStatus } from '../../playerGameLogFacts.js';
import { cleanNcaafPlayerRows } from '../scoutReport/sports/ncaafPlayerEvidence.js';

const LEAGUES = {
  NBA: 'basketball_nba', NFL: 'americanfootball_nfl',
  NCAAF: 'americanfootball_ncaaf', MLB: 'baseball_mlb',
};
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
const playerName = player => player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim();
const withoutSuffix = value => normalize(value).replace(/\s+(jr|sr|ii|iii|iv)$/, '');
const array = value => Array.isArray(value) ? value : (value?.data || []);
const dateOf = row => row?._game?.date || row?.game?.date || row?.date;
const gameId = row => row?._game?.id ?? row?.game?.id ?? row?.game_id ?? row?.gameId;
const isCompletedOrUnspecified = row => {
  return completedGameStatus(row?._game?.status ?? row?.game?.status ?? row?.status);
};

/** One league-bound contract for Gary and the research assistant. Never substitute
 * a different first name or use professional stats for a college player ID. */
export async function fetchPlayerGameLogEvidence({
  sport, player: requestedName, homeTeam, awayTeam, numGames = 5, season,
  dataWindow, asOf = new Date(), service, request = operation => operation(),
}) {
  const league = Object.keys(LEAGUES).find(key => key === sport || LEAGUES[key] === sport);
  const requested = numGames == null || numGames === '' ? 5 : Number(numGames);
  const count = Number.isFinite(requested) ? Math.max(1, Math.min(15, Math.trunc(requested))) : 5;
  const envelope = { sport: league || sport, requested_player: requestedName, games_requested: count };
  const finish = (quality, fields) => {
    const evidence = { ...envelope, quality, ...fields };
    return { ...evidence, content: JSON.stringify(evidence) };
  };
  if (!league) return finish('unavailable', { error: `Unsupported player-log league: ${sport}`, games_used: 0 });
  if (!normalize(requestedName)) return finish('unavailable', { error: 'A full player name is required', games_used: 0 });
  const bdl = service || (await import('../../ballDontLieService.js')).ballDontLieService;
  const search = async term => array(await request(() => bdl.getPlayersGeneric(LEAGUES[league], { search: term, per_page: 25 })));
  let players = await search(String(requestedName).trim());
  const exactMatches = rows => rows.filter(p => withoutSuffix(playerName(p)) === withoutSuffix(requestedName));
  let matches = exactMatches(players);
  const lastName = withoutSuffix(requestedName).split(' ').at(-1);
  if (!matches.length && lastName !== normalize(requestedName)) {
    players = await search(lastName);
    matches = exactMatches(players);
  }
  matches = [...new Map(matches.map(p => [String(p.id), p])).values()];
  if (matches.length > 1) {
    const teams = [homeTeam, awayTeam].map(normalize).filter(Boolean);
    const onGameTeam = matches.filter(p => teams.includes(normalize(p.team?.full_name || p.team?.name)));
    if (onGameTeam.length === 1) matches = onGameTeam;
  }
  if (matches.length !== 1 || matches[0].id == null) return finish('unavailable', {
    error: matches.length > 1 ? `Ambiguous player identity: ${requestedName}` : `No exact player match for ${requestedName} in ${league}`,
    games_used: 0,
  });
  const player = matches[0];
  envelope.player = { id: player.id, name: playerName(player), team: player.team || null };
  const year = new Date(asOf).getUTCFullYear();
  const date = new Date(asOf);
  const defaultSeason = league === 'NFL' ? nflSeason(date) : league === 'NCAAF' ? ncaafSeason(date) : league === 'NBA' ? nbaSeason(date) : year;
  const selectedSeason = season != null && season !== '' && Number.isInteger(Number(season)) ? Number(season) : defaultSeason;
  let rows, diagnostics;
  if (league === 'NCAAF') {
    const raw = await request(() => bdl.getNcaafPlayerGameStats({ playerId: player.id, season: selectedSeason }));
    const cleaned = cleanNcaafPlayerRows(raw, { season: selectedSeason, playerIds: [player.id], asOf });
    rows = cleaned.rows;
    diagnostics = cleaned.diagnostics;
  } else if (league === 'NFL') {
    const logs = await request(() => bdl.getNflPlayerGameLogsBatch([player.id], selectedSeason, count));
    rows = logs?.[player.id]?.games || [];
  } else if (league === 'MLB') {
    rows = await request(() => bdl.getMlbPlayerGameRowsChrono(player.id, selectedSeason));
  } else {
    const logs = await request(() => bdl.getNbaPlayerGameLogs(player.id, count, {}, { season: selectedSeason, asOf, throwOnError: true }));
    rows = Array.isArray(logs) ? logs : (logs?.games || []);
    diagnostics = logs?.diagnostics;
  }
  // Keep every stat row for a selected game: two-way players can have batting
  // and pitching rows. Relievers and walk-only batting appearances also count.
  const dated = (rows || []).filter(row => {
    const date = Date.parse(dateOf(row) || '');
    return Number.isFinite(date) && date < new Date(asOf).getTime() && isCompletedOrUnspecified(row);
  }).sort((a, b) => Date.parse(dateOf(b)) - Date.parse(dateOf(a)));
  const selected = new Set();
  const games = dated.filter(row => {
    const key = String(gameId(row) ?? dateOf(row));
    if (!selected.has(key) && selected.size >= count) return false;
    selected.add(key);
    return true;
  });
  return finish(games.length ? 'available' : 'unavailable', {
    source: `Ball Don't Lie ${league} player game logs`,
    data_window: dataWindow || String(selectedSeason),
    season: selectedSeason,
    games_used: selected.size, games, ...(diagnostics ? { diagnostics } : {}),
    note: games.length ? 'Only returned fields are evidence; missing fields are unknown. Dates and team identity belong to each game row.'
      : 'No eligible dated player-game rows returned; this is unavailable evidence, not zero production.',
  });
}
