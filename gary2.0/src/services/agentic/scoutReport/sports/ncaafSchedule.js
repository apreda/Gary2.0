/**
 * HOME, ROAD AND THE SCHEDULE ON THE COLLEGE DESK (founder GO, Oct 3 2026).
 *
 * The college desk printed no venue, a five-game form line with mascots only
 * and no dates (it ran into last season), "7 days rest" as the whole schedule
 * section, and raw four-game totals with nothing saying who they were compiled
 * against. This module supplies what the NFL desk already carries, with
 * college's sources:
 *
 *   - the site: stadium, city, capacity, surface, elevation, neutral or not,
 *     the visitor's trip, the local kickoff time and the kickoff-hour
 *     forecast at the stadium actually hosting the game (Gary asked for
 *     weather on 28 of 31 college games on Oct 3 2026 and the tool was not on
 *     college's list, so each one cost him a web search);
 *   - this season game by game: date, site, score, how the halves went, and
 *     each opponent's conference, current record and AP rank;
 *   - each team's home and road results with their counts, who played
 *     quarterback in every game, and the starting quarterback's games split
 *     by site;
 *   - the schedule behind the season totals.
 *
 * Facts only. Nothing here says what a home field, a trip or a schedule is
 * worth; a source that does not answer is named as missing, never left out.
 */
import { ballDontLieService } from '../../../ballDontLieService.js';
import { getFbsTeams, fbsVenueFor, getSeasonGames, seasonGameFor, getVenues, venueById } from '../../../cfbdService.js';
import { getKickoffWeather, windDescription } from '../../../weatherService.js';
import { findTeam } from '../shared/utilities.js';
import { loadTeamResults, gameStoryLine, homeAwaySplit } from '../../tools/statRouters/footballTeamGames.js';
import { CONF_NAME, FBS } from './ncaafFcsGap.js';

const SPORT = 'americanfootball_ncaaf';
const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const ZONE = { 'America/New_York': 'Eastern', 'America/Detroit': 'Eastern', 'America/Indiana/Indianapolis': 'Eastern',
  'America/Kentucky/Louisville': 'Eastern', 'America/Chicago': 'Central', 'America/Denver': 'Mountain',
  'America/Boise': 'Mountain', 'America/Phoenix': 'Mountain Standard', 'America/Los_Angeles': 'Pacific',
  'Pacific/Honolulu': 'Hawaii' };

const etDay = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;
const nameKey = (value) => String(value || '').toLowerCase().replace(/[^a-z]/g, '');
const record = (results) => `${results.filter((r) => r.won).length}-${results.filter((r) => !r.won).length}`;

function miles(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return null;
  const rad = (d) => d * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return Math.round(3958.8 * 2 * Math.asin(Math.sqrt(h)) / 10) * 10;
}

/** The stadium this game is played at, from the schedule provider; the home team's own stadium otherwise. */
async function resolveSite({ homeTeam, awayTeam, season, game, seasonGames }) {
  const [fbsTeams, venues] = await Promise.all([getFbsTeams(season), getVenues()]);
  const homeStadium = fbsVenueFor(fbsTeams, homeTeam);
  const awayStadium = fbsVenueFor(fbsTeams, awayTeam);
  const row = seasonGameFor(seasonGames, homeTeam, awayTeam, game?.commence_time);
  const venue = row ? venueById(venues, row.venueId) : null;
  if (venue) {
    return { confirmed: true, neutral: row.neutralSite === true, conferenceGame: row.conferenceGame === true,
      name: venue.name || row.venue, city: venue.city || null, state: venue.state || null,
      capacity: Number(venue.capacity) || null, surface: venue.grass === true ? 'grass' : venue.grass === false ? 'turf' : null,
      dome: venue.dome === true, elevationFt: Number.isFinite(Number(venue.elevation)) ? Math.round(Number(venue.elevation) * 3.281 / 10) * 10 : null,
      tz: venue.timezone || null, lat: Number(venue.latitude), lon: Number(venue.longitude), homeStadium, awayStadium };
  }
  if (!homeStadium) return { confirmed: false, missing: true, homeStadium, awayStadium };
  return { confirmed: false, neutral: false, name: homeStadium.venue, city: homeStadium.city, state: homeStadium.state,
    capacity: homeStadium.capacity, surface: homeStadium.surface, dome: homeStadium.roof === 'dome',
    elevationFt: Number.isFinite(homeStadium.elevation_m) ? Math.round(homeStadium.elevation_m * 3.281 / 10) * 10 : null,
    tz: homeStadium.tz, lat: homeStadium.lat, lon: homeStadium.lon, homeStadium, awayStadium };
}

/** The kickoff-hour forecast at the site, as one line of facts. */
async function weatherLine(site, game) {
  if (!site || site.missing || !game?.commence_time) return null;
  if (site.dome) return 'Kickoff weather: indoors, fixed roof.';
  const weather = await getKickoffWeather({ lat: site.lat, lon: site.lon }, game.commence_time).catch(() => null);
  if (!weather) return 'Kickoff weather: the forecast lookup failed for this kickoff.';
  if (weather.unavailable) return 'Kickoff weather: no forecast yet at this range.';
  const round = (value) => (Number.isFinite(value) ? Math.round(value) : null);
  const facts = [round(weather.temperature_f) != null ? `${round(weather.temperature_f)}°F` : null,
    round(weather.feels_like_f) != null && round(weather.feels_like_f) !== round(weather.temperature_f) ? `feels like ${round(weather.feels_like_f)}°F` : null,
    weather.conditions, windDescription(weather) ? `wind ${windDescription(weather)}` : null,
    round(weather.precip_chance_pct) != null ? `${round(weather.precip_chance_pct)}% chance of precipitation` : null,
    round(weather.humidity_pct) != null ? `humidity ${round(weather.humidity_pct)}%` : null].filter(Boolean);
  if (!facts.length) return 'Kickoff weather: the forecast carried no readings for this kickoff.';
  return `Kickoff weather (forecast for the kickoff hour, issued about ${plural(weather.forecast_lead_hours, 'hour')} ahead): ${facts.join(', ')}.`;
}

function siteLines(site, { homeTeam, awayTeam, game }) {
  if (!site || site.missing) return ['Site: the stadium for this game could not be resolved from the schedule provider.'];
  const place = [site.name, site.city, site.state].filter(Boolean).join(', ');
  const facts = [site.capacity ? `capacity ${site.capacity.toLocaleString('en-US')}` : null, site.dome ? 'dome' : null,
    site.surface, Number.isFinite(site.elevationFt) ? `elevation ${site.elevationFt.toLocaleString('en-US')} ft` : null].filter(Boolean);
  const lines = [`Site: ${place}${facts.length ? ` (${facts.join(', ')})` : ''}.`
    + (site.neutral ? ' NEUTRAL SITE: neither team is at home.' : ` ${homeTeam} are at home; ${awayTeam} are the visitors.`)
    + (site.confirmed ? '' : ' This is the home team\'s stadium on file; the schedule provider did not confirm the site of this game.')];
  if (site.tz && game?.commence_time) {
    const local = new Date(game.commence_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: site.tz });
    lines.push(`Local kickoff: ${local} ${ZONE[site.tz] || site.tz} time.`);
  }
  const trip = (team, stadium) => {
    const far = miles(stadium, site);
    if (far == null) return null;
    const from = [stadium.city, stadium.state].filter(Boolean).join(', ') || stadium.venue;
    const zones = stadium.tz && site.tz && stadium.tz !== site.tz
      ? `, ${ZONE[stadium.tz] || stadium.tz} to ${ZONE[site.tz] || site.tz} time` : '';
    return `Trip: ${team} play about ${far.toLocaleString('en-US')} miles from their own stadium (${from})${zones}.`;
  };
  lines.push(...[site.neutral ? trip(homeTeam, site.homeStadium) : null, trip(awayTeam, site.awayStadium)].filter(Boolean));
  return lines;
}

/** "SEC, now 3-1, AP No. 14" for one opponent; pieces that are unknown are left out. */
function opponentLabel(opponentId, { teamsById, records, apRankOf }) {
  const team = teamsById.get(Number(opponentId));
  const conf = Number(team?.conference);
  const rank = team ? apRankOf(team.full_name, team) : null;
  return [Number.isFinite(conf) ? (FBS.has(conf) ? CONF_NAME[conf] : 'FCS') : null,
    records.get(Number(opponentId)) ? `now ${records.get(Number(opponentId))}` : null,
    rank ? `AP No. ${rank}` : null].filter(Boolean).join(', ');
}

/**
 * Who each opponent was (founder, Oct 3 2026: "records don't help really", a
 * record needs the games behind it and who they were against). Returns a
 * describer: opponent id to "SEC, now 3-1, AP No. 14". Each opponent's record
 * comes from its own game list, counted up to `cutoff`. Shared by the desk and
 * by the stat tools, so both say the same thing about the same opponent.
 */
export async function opponentContext({ teams, resultLists, season, cutoff = null, apRankOf = () => null, known = new Map() }) {
  const teamsById = new Map((teams || []).map((t) => [Number(t.id), t]));
  const counted = (results) => results.filter((r) => !cutoff || new Date(r.date) < new Date(cutoff));
  const records = new Map(known);
  const opponentIds = [...new Set(resultLists.flatMap((list) => list.map((r) => Number(r.opponentId))).filter(Number.isFinite))];
  await Promise.all(opponentIds.filter((id) => !records.has(id)).map(async (id) => {
    const results = counted(await loadTeamResults(SPORT, id, season).catch(() => []));
    if (results.length) records.set(id, record(results));
  }));
  return (opponentId) => opponentLabel(opponentId, { teamsById, records, apRankOf });
}

function splitLine(team, label, results, describe) {
  // One builder for all three sites: the shared split reads `home`.
  const split = homeAwaySplit(results.map((r) => ({ ...r, home: true }))).home;
  if (!split) return `${team} ${label} this season: no games yet.`;
  // A record is only as good as the games behind it: each one is listed with
  // its date, score and who the opponent was.
  const games = results.map((r) => `${etDay(r.date).replace(/^\w+, /, '')} ${r.won ? 'W' : 'L'} ${r.scored}-${r.allowed} ${r.home || r.neutral ? 'vs' : '@'} ${r.opponent}${describe(r.opponentId) ? ` (${describe(r.opponentId)})` : ''}`).join('; ');
  return `${team} ${label} this season: ${split.record} in ${plural(split.games_used, 'game')}, ${split.points_per_game} scored and ${split.points_allowed_per_game} allowed per game: ${games}.`;
}

/** "vs Opp", "@ Opp" or "vs Opp (neutral site)". */
const versus = (result) => (result.neutral ? `vs ${result.opponent} (neutral site)` : `${result.home ? 'vs' : '@'} ${result.opponent}`);
const siteOf = (result) => (result.neutral ? 'neutral' : result.home ? 'home' : 'road');

const passingLine = ({ row, result }) => `${etDay(result.date).replace(/^\w+, /, '')} ${versus(result)} `
  + `${row.passing_completions ?? '?'}-of-${row.passing_attempts}, ${row.passing_yards ?? '?'} yds, ${row.passing_touchdowns ?? '?'} TD, ${row.passing_interceptions ?? '?'} INT`;

/**
 * Who played quarterback in one game (founder, Oct 3 2026: "QB starter for
 * prior games this season"). The box score does not say who started, so this
 * names whoever threw the most passes, plus anyone else with ten or more:
 * a season's passing numbers are sometimes two quarterbacks' work (Baylor
 * 2026: two games each).
 */
function quarterbackOfGame(rows, result) {
  const passers = (rows || [])
    .filter((row) => String(row?.game?.id) === String(result.gameId) && row?.player?.first_name && Number(row.passing_attempts) > 0)
    .sort((a, b) => Number(b.passing_attempts) - Number(a.passing_attempts));
  if (!passers.length) return 'quarterback: no passing rows for this game';
  const shown = passers.filter((row, index) => index === 0 || Number(row.passing_attempts) >= 10);
  return `quarterback: ${shown.map((row) => `${row.player.first_name} ${row.player.last_name} ${row.passing_completions ?? '?'}-of-${row.passing_attempts}, `
    + `${row.passing_yards ?? '?'} yds, ${row.passing_touchdowns ?? '?'} TD, ${row.passing_interceptions ?? '?'} INT`).join('; ')}`;
}

/** The named starter's games this season, split by site. */
function quarterbackLines(team, quarterback, rows, results) {
  if (!quarterback?.name) return [`${team}: this week's starting quarterback is not established, so no quarterback site split is shown. The game-by-game lines above name who played quarterback in each game.`];
  const byGame = new Map(results.map((r) => [String(r.gameId), r]));
  const games = (rows || [])
    .filter((row) => nameKey(`${row?.player?.first_name}${row?.player?.last_name}`) === nameKey(quarterback.name) && Number(row.passing_attempts) > 0)
    .map((row) => ({ row, result: byGame.get(String(row?.game?.id)) }))
    .filter((g) => g.result)
    .sort((a, b) => new Date(a.result.date) - new Date(b.result.date));
  const head = `${quarterback.name} (${team}, ${quarterback.status} starter in this week's reporting)`;
  if (!games.length) return [`${head}: no passing rows in this team's games this season.`];
  const site = (label) => {
    const list = games.filter((g) => siteOf(g.result) === label);
    return `  ${label}, ${plural(list.length, 'game')}: ${list.length ? list.map(passingLine).join('; ') : 'none'}`;
  };
  return [`${head}, games with a pass attempt this season by site:`, site('road'), site('home'),
    ...(games.some((g) => g.result.neutral) ? [site('neutral')] : [])];
}

/**
 * Everything the desk prints about the site and the two schedules.
 * @returns {Promise<{site:Object|null, seasonGames:string, homeRoad:string, scheduleBehind:{home:string|null, away:string|null}}>}
 */
export async function ncaafScheduleSections({ homeTeam, awayTeam, season, game, apRankOf = () => null,
  quarterbacks = {}, service = ballDontLieService }) {
  const teams = await service.getTeams(SPORT);
  const teamsById = new Map((teams || []).map((t) => [Number(t.id), t]));
  const home = findTeam(teams, homeTeam), away = findTeam(teams, awayTeam);
  if (!home?.id || !away?.id) throw new Error('college team identities unavailable for the schedule sections');

  const leagueGames = await getSeasonGames(season).catch(() => null);
  const [homeResults, awayResults, site] = await Promise.all([
    loadTeamResults(SPORT, home.id, season), loadTeamResults(SPORT, away.id, season),
    resolveSite({ homeTeam, awayTeam, season, game, seasonGames: leagueGames }).catch((e) => ({ missing: true, reason: e.message })),
  ]);
  // The game feed calls one team "home" at a neutral site (a kickoff classic,
  // the Cotton Bowl); the schedule provider says which games those were, so
  // they are never counted as a home or a road game.
  const before = (team, results) => results
    .filter((r) => !game?.commence_time || new Date(r.date) < new Date(game.commence_time))
    .map((r) => ({ ...r, neutral: seasonGameFor(leagueGames, team, r.opponent, r.date)?.neutralSite === true }));
  const sides = [{ team: homeTeam, id: home.id, results: before(homeTeam, homeResults), atHome: true },
    { team: awayTeam, id: away.id, results: before(awayTeam, awayResults), atHome: false }];

  // Each opponent's current record, from its own game list.
  const label = await opponentContext({ teams, resultLists: sides.map((s) => s.results), season, cutoff: game?.commence_time, apRankOf,
    known: new Map([[Number(home.id), record(sides[0].results)], [Number(away.id), record(sides[1].results)]]) });

  const [rows, weather] = await Promise.all([
    Promise.all(sides.map((s) => service.getNcaafPlayerGameStats({ teamId: s.id, season }).catch(() => []))),
    weatherLine(site, game),
  ]);

  const seasonGames = `THIS SEASON GAME BY GAME (${season})
${RULE}
Every completed game this season, newest first: date, site, score, how the
halves went, the opponent's conference, current record and AP rank, and who
played quarterback (the most pass attempts; the box score does not record
who started).

${sides.map((s, i) => `${s.team} (${record(s.results)}):\n${s.results.length
    ? s.results.map((r) => `  ${etDay(r.date)} · ${gameStoryLine(r.neutral ? { ...r, home: true, opponent: `${r.opponent} (neutral site)` } : r, { opponentContext: label(r.opponentId) ? `opponent: ${label(r.opponentId)}` : null })}\n      ${quarterbackOfGame(rows[i], r)}`).join('\n')
    : '  no completed games this season'}`).join('\n\n')}
${RULE}`;

  const homeRoad = `HOME AND ROAD
${RULE}
${[...siteLines(site, { homeTeam, awayTeam, game }), weather].filter(Boolean).join('\n')}

${sides.map((s) => {
    const at = (where) => s.results.filter((r) => siteOf(r) === where);
    const here = site?.neutral ? null : at(s.atHome ? 'home' : 'road').length + 1;
    return [here ? `${s.team}: ${ordinal(here)} ${s.atHome ? 'home' : 'road'} game of the season today.` : null,
      splitLine(s.team, 'at home', at('home'), label), splitLine(s.team, 'on the road', at('road'), label),
      at('neutral').length ? splitLine(s.team, 'at neutral sites', at('neutral'), label) : null].filter(Boolean).join('\n');
  }).join('\n\n')}

${sides.map((s, i) => quarterbackLines(s.team, quarterbacks[s.atHome ? 'home' : 'away'], rows[i], s.results).join('\n')).join('\n')}
${RULE}`;

  const behind = (s) => (s.results.length
    ? [...s.results].reverse().map((r) => `${versus(r)}${label(r.opponentId) ? ` (${label(r.opponentId)})` : ''}`).join(', ')
    : null);
  return { site: site?.missing ? null : site, seasonGames, homeRoad,
    scheduleBehind: { home: behind(sides[0]), away: behind(sides[1]) } };
}
