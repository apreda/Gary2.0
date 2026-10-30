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
 *   - the schedule behind the season totals;
 *   - who carried and caught the ball in each game, and the regulars with no
 *     stat row in the last game (Oct 23 2026), from ESPN's box scores.
 *
 * Facts only. Nothing here says what a home field, a trip or a schedule is
 * worth; a source that does not answer is named as missing, never left out.
 */
import { teamReportHistory, historyLine, backFromReports, outOnGameDay, gameTimeOnGameDay } from '../../../../sports/ncaaf/ncaafAvailabilityReports.js';
import { ballDontLieService } from '../../../../providers/ballDontLieService.js';
import { getFbsTeams, fbsVenueFor, getSeasonGames, seasonGameFor, getVenues, venueById, getSeasonWeather, gameWeatherFor,
  getWeekBoxScores, cfbdTeamMatches } from '../../../../providers/cfbdService.js';
import { getKickoffWeather, windDescription, gameHoursDescription } from '../../../../providers/weatherService.js';
import { findTeam } from '../shared/utilities.js';
import { loadTeamResults, gameStoryLine, homeAwaySplit } from '../../tools/statRouters/footballTeamGames.js';
import { CONF_NAME, FBS } from './ncaafFcsGap.js';
import { loadNcaafLeagueContext, opponentSeasonClause } from '../../tools/statRouters/footballLeagueContext.js';
import { ncaafTeamConferenceId } from '../../../../sports/ncaaf/ncaafGamePolicy.js';
import { getNcaafGameBox, getNcaafRosterPositions, boxAddsUp, playerGameRows, pointsByKind, kindsInWords, namedInPlays, ncaafDriveTally, ncaafFlowLines, espnUnitTotals, espnGameClause, placeHurt, ncaafRedZone, ncaafReturns } from './ncaafGameBox.js';
import { teamStarters, startedIn, nameKey as starterKey, officialSacks } from '../../../../sports/ncaaf/ncaafStarters.js';

const SPORT = 'americanfootball_ncaaf';
const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const ZONE = { 'America/New_York': 'Eastern', 'America/Detroit': 'Eastern', 'America/Indiana/Indianapolis': 'Eastern',
  'America/Kentucky/Louisville': 'Eastern', 'America/Chicago': 'Central', 'America/Denver': 'Mountain',
  'America/Boise': 'Mountain', 'America/Phoenix': 'Mountain Standard', 'America/Los_Angeles': 'Pacific',
  'Pacific/Honolulu': 'Hawaii' };

const etDay = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;
// Without the suffix: a report's "Dierre Hill" is the box score's "Dierre Hill Jr.".
// A quoted nickname is left out (Oct 29 2026 hunt, round 7: the report's 'Brenten "Inky" Jones', with two tackles this
// season, read "no stat row this season").
const nameKey = (value) => String(value || '').replace(/\s*["“”][^"“”]*["“”]\s*/g, ' ').toLowerCase().replace(/\b(?:jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
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
      name: RENAMED_VENUES[venue.name || row.venue] || venue.name || row.venue, city: venue.city || null, state: venue.state || null,
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

/**
 * A played game's weather at kickoff, as CFBD recorded it, when it was more than a dry, calm day (Oct 24 2026 read check:
 * SMU's 25 points against Boston College came in heavy rain, BYU's 62 passing yards at TCU in rain, and the game log
 * read them as ordinary games). Indoors or ordinary weather: null.
 */
export function playedInWeather(row) {
  if (!row || row.gameIndoors) return null;
  const condition = String(row.weatherCondition || '').trim();
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const precip = n(row.precipitation), snow = n(row.snowfall), wind = n(row.windSpeed), temp = n(row.temperature);
  // A row whose condition says clear or fair and whose precipitation says otherwise contradicts itself: its precipitation is
  // left out (round 11: Tucson's dry 8 PM kickoff read "clear, 0.09 in. of precipitation").
  const dryWord = /^(clear|fair|sunny|mostly clear|mostly sunny|partly cloudy|cloudy|overcast)$/i.test(condition);
  const precipOk = dryWord ? null : precip;
  const wet = /rain|drizzle|snow|sleet|thunder|storm|shower|freez|hail/i.test(condition) || (precipOk ?? 0) >= 0.05 || (snow ?? 0) > 0;
  if (!wet && !((wind ?? 0) >= 15) && !(temp != null && temp <= 32)) return null;
  return `weather at kickoff: ${[condition ? condition.toLowerCase() : (precipOk ?? 0) >= 0.05 ? 'precipitation' : null,
    (precipOk ?? 0) >= 0.01 ? `${precipOk.toFixed(2)} in. of precipitation that hour` : null,
    temp != null ? `${Math.round(temp)}°F` : null, wind != null ? `wind ${Math.round(wind)} mph` : null].filter(Boolean).join(', ')}`;
}

// Venues the data still lists under an old name (Oct 29 2026 hunt: UCF's stadium is Acrisure Bounce House since July
// 2025; the game-by-game read, from ESPN, named it so).
const RENAMED_VENUES = { 'FBC Mortgage Stadium': 'Acrisure Bounce House' };

// The data's dome flag covers retractable roofs too (Oct 29 2026 hunt: Mercedes-Benz Stadium read "fixed roof"); one test
// for the site line and the weather line (round 16: "dome" on one, "retractable roof" on the next).
const retractable = (site) => Boolean(site?.dome) && /Mercedes-Benz Stadium|AT&T Stadium|NRG Stadium|Lucas Oil Stadium|State Farm Stadium/i.test(String(site.name || site.venue || ''));
/** The kickoff-hour forecast at the site, as one line of facts. */
async function weatherLine(site, game) {
  if (!site || site.missing || !game?.commence_time) return null;
  if (retractable(site)) return 'Kickoff weather: retractable roof (open or closed not on file).';
  if (site.dome) return 'Kickoff weather: indoors, fixed roof.';
  const weather = await getKickoffWeather({ lat: site.lat, lon: site.lon }, game.commence_time).catch(() => null);
  if (!weather) return 'Kickoff weather: the forecast lookup failed for this kickoff.';
  if (weather.unavailable) return 'Kickoff weather: no forecast yet at this range.';
  const round = (value) => (Number.isFinite(value) ? Math.round(value) : null);
  const facts = [round(weather.temperature_f) != null ? `${round(weather.temperature_f)}°F` : null,
    round(weather.feels_like_f) != null && round(weather.feels_like_f) !== round(weather.temperature_f) ? `feels like ${round(weather.feels_like_f)}°F` : null,
    weather.conditions, windDescription(weather) ? `wind ${windDescription(weather)}` : null,
    round(weather.humidity_pct) != null ? `humidity ${round(weather.humidity_pct)}%` : null].filter(Boolean);
  if (!facts.length) return 'Kickoff weather: the forecast carried no readings for this kickoff.';
  const hours = gameHoursDescription(weather);
  return `Kickoff weather (forecast for the kickoff hour, issued about ${plural(weather.forecast_lead_hours, 'hour')} ahead): ${facts.join(', ')}${hours ? `; ${hours}` : ''}.`;
}

function siteLines(site, { homeTeam, awayTeam, game }) {
  if (!site || site.missing) return ['Site: the stadium for this game could not be resolved from the schedule provider.'];
  const place = [site.name, site.city, site.state].filter(Boolean).join(', ');
  const facts = [site.capacity ? `capacity ${site.capacity.toLocaleString('en-US')}` : null, site.dome ? (retractable(site) ? 'retractable roof' : 'dome') : null,
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

/**
 * "SEC, now 3-1, AP No. 14, allows 17.8 pts/game (12th of 134), scores 27.4
 * (70th)" for one opponent; pieces that are unknown are left out. The season
 * figures (founder GO, Oct 12 2026) ride on every game line; `full: false`
 * gives the short form for the one-line schedule behind the season totals.
 */
function opponentLabel(opponentId, { teamsById, records, league = null, leagueGames = null, unitsOf = null, full = true, exclude = null }) {
  const team = teamsById.get(Number(opponentId));
  const conf = ncaafTeamConferenceId(team);   // 2026 membership, not BDL's stale directory (Oct 13 2026)
  // Its record now and its games; no AP poll place (round 9, Oct 29 2026: ranks and places are out of what Gary reads).
  const record = records.get(Number(opponentId));
  return [Number.isFinite(conf) ? (FBS.has(conf) ? CONF_NAME[conf] : 'FCS') : null,
    record ? `now ${record}` : null,
    // A league table that did not load is said (round 15: every opponent's games went without a word).
    full && !league ? "its other games: not on file (the season's games could not be loaded)" : full ? opponentSeasonClause(league, opponentId, { neutral: (r) => (team && leagueGames ? seasonGameFor(leagueGames, team.full_name, r.opponent, r.date)?.neutralSite === true : null),
      units: (r) => (team && unitsOf?.fn ? unitsOf.fn(team.full_name, r) : null), exclude }) : null].filter(Boolean).join(', ');
}

/**
 * Who each opponent was (founder, Oct 3 2026: "records don't help really", a
 * record needs the games behind it and who they were against). Returns a
 * describer: opponent id to "SEC, now 3-1, AP No. 14, allows 17.8 pts/game
 * (12th of 134), scores 27.4 (70th)". Each opponent's record comes from its
 * own game list, counted up to `cutoff`; its points per game and FBS rank come
 * from the league table counted to the same cutoff (founder GO, Oct 12 2026:
 * Gary could not tell a 21-point game against the 12th defense from one
 * against the 120th). Shared by the desk and by the stat tools, so both say
 * the same thing about the same opponent.
 */
export async function opponentContext({ teams, resultLists, season, cutoff = null, leagueGames = null, unitsOf = null, known = new Map() }) {
  const teamsById = new Map((teams || []).map((t) => [Number(t.id), t]));
  const counted = (results) => results.filter((r) => !cutoff || new Date(r.date) < new Date(cutoff));
  const records = new Map(known);
  const opponentIds = [...new Set(resultLists.flatMap((list) => list.map((r) => Number(r.opponentId))).filter(Number.isFinite))];
  const [league] = await Promise.all([
    loadNcaafLeagueContext({ season, cutoff, teams }).catch(() => null),
    ...opponentIds.filter((id) => !records.has(id)).map(async (id) => {
      const results = counted(await loadTeamResults(SPORT, id, season).catch(() => []));
      if (results.length) records.set(id, record(results));
    }),
  ]);
  return (opponentId, { full = true, exclude = null } = {}) => opponentLabel(opponentId, { teamsById, records, league, leagueGames, unitsOf, full, exclude });
}

function splitLine(team, label, results, describe) {
  // One builder for all three sites: the shared split reads `home`.
  const split = homeAwaySplit(results.map((r) => ({ ...r, home: true }))).home;
  if (!split) return `${team} ${label} this season: no games yet.`;
  // A record is only as good as the games behind it: each one is listed with
  // its date, score and who the opponent was.
  const games = results.map((r) => `${etDay(r.date).replace(/^\w+, /, '')} ${r.won ? 'W' : 'L'} ${r.scored}-${r.allowed} ${r.home || r.neutral ? 'vs' : '@'} ${r.opponent}${describe(r.opponentId) ? ` (${describe(r.opponentId)})` : ''}`).join('; ');
  // The record and the games, no points a game (Oct 29 2026, founder: the numbers behind the average).
  return `${team} ${label} this season: ${split.record} in ${plural(split.games_used, 'game')}: ${games}.`;
}

/** "vs Opp", "@ Opp" or "vs Opp (neutral site)". */
const versus = (result) => (result.neutral ? `vs ${result.opponent} (neutral site)` : `${result.home ? 'vs' : '@'} ${result.opponent}`);
const siteOf = (result) => (result.neutral ? 'neutral' : result.home ? 'home' : 'road');

const passingLine = ({ row, result }) => `${etDay(result.date).replace(/^\w+, /, '')} ${versus(result)} `
  + `${row.passing_completions ?? '?'}-of-${row.passing_attempts}, ${row.passing_yards ?? '?'} yds, ${row.passing_touchdowns ?? '?'} TD, ${row.passing_interceptions ?? '?'} INT`;

/**
 * Who played quarterback in one game (founder, Oct 3 2026: "QB starter for
 * prior games this season"): whoever threw the most passes, plus every other
 * quarterback who threw and anyone else with five or more, as a season's passing numbers are sometimes two
 * quarterbacks' work (Baylor 2026: two games each). ESPN's box does not say who
 * started; the official box's lineup does, where a school posts it (Oct 27
 * 2026), and marks him.
 */
function quarterbackOfGame(rows, result, onFile, starters = null) {
  if (!onFile.has(String(result.gameId))) return 'quarterback: the box score\'s player lines are not on file for this game';
  const passers = (rows || [])
    .filter((row) => String(row?.game?.id) === String(result.gameId) && row?.player?.first_name && Number(row.passing_attempts) > 0)
    .sort((a, b) => Number(b.passing_attempts) - Number(a.passing_attempts));
  if (!passers.length) return 'quarterback: no passing rows for this game';
  // Everyone with five or more passes, as the NFL's line reads (Oct 24 2026: Michigan's Tommy Carr played the second half
  // against Penn State, 7 passes, and the 10-pass floor left the only look at today's starter out of the line).
  const qbs = (starters || []).filter((x) => /^QB$/i.test(x.position || ''));
  const nameOf = (row) => `${row.player.first_name} ${row.player.last_name}`;
  const started = (row) => qbs.length > 0 && startedIn(qbs, nameOf(row));
  // Every quarterback who threw, whatever the count (Oct 28 2026 sweep: Ohio State's line at Indiana showed Sayin alone;
  // Fahey's two passes after Sayin's shoulder injury were the only sign of the change); another position's pass only at five.
  const shown = passers.filter((row, index) => index === 0 || Number(row.passing_attempts) >= 5 || started(row)
    || /^QB$/i.test(row.player.position_abbreviation || row.player.position || ''));
  // A starter who threw no pass (hurt on the first series) is named too.
  const unseen = qbs.filter((x) => !passers.some((row) => startedIn([x], nameOf(row)))).map((x) => `${x.name} started, no pass`);
  // His running too (Oct 23 2026 data check: a dual-threat quarterback's line showed passing only, in four of nine
  // games); college box scores count sacks as runs, so the line says so.
  const runs = (row) => (Number(row.rushing_attempts) > 0 ? `; ${plural(row.rushing_attempts, 'run')} for ${row.rushing_yards ?? '?'} yds${Number(row.rushing_touchdowns) > 0 ? `, ${row.rushing_touchdowns} TD` : ''} (sacks included)` : '');
  return `quarterback: ${[...unseen, ...shown.map((row) => `${nameOf(row)}${started(row) ? ' (started)' : ''} ${row.passing_completions ?? '?'}-of-${row.passing_attempts}, `
    + `${row.passing_yards ?? '?'} yds, ${row.passing_touchdowns ?? '?'} TD, ${row.passing_interceptions ?? '?'} INT${runs(row)}`)].join('; ')}`;
}

// The player rows against the team's own box (Oct 23 2026 source audit: BDL's college player rows missed overtime
// and disagreed with the team line in 6 of 9 games, Minchey 22-of-34 for 224 against 23-of-36 for 246). The rows
// come from ESPN's box since then and must add up to the team line before they are used; this stays as the check on
// yards. When the passers' completions or attempts differ from the team's, or their yards by more than 5, the line
// says so and shows the team's numbers.
function checkedQuarterback(text, rows, result, units) {
  const team = String(units?.[0] || '').match(/passing (\d+)-(\d+) for (-?\d+)/);
  if (!team || /no passing rows|not on file/.test(text)) return text;
  const passers = (rows || []).filter((row) => String(row?.game?.id) === String(result.gameId) && Number(row.passing_attempts) > 0);
  const sum = (k) => passers.reduce((total, row) => total + Number(row[k] || 0), 0);
  // Completions and attempts must match; yards within 5 (Oregon Oct 10: 34 of 35 attempts passed, 169 against 199 did not).
  if (sum('passing_completions') !== Number(team[1]) || sum('passing_attempts') !== Number(team[2])) {
    return `${text} (these player lines do not match the team's passing, ${team[1]}-of-${team[2]} for ${team[3]}; the player numbers are not reliable for this game)`;
  }
  // When only the yards differ, the two sources' yards are named (Oct 23 2026: Virginia-Syracuse, ESPN's box 113 and
  // the team line 119, with every pass counted alike).
  return Math.abs(sum('passing_yards') - Number(team[3])) > 5
    ? `${text} (the box score's player lines give ${sum('passing_yards')} passing yards; the team line gives ${team[3]})` : text;
}

/** The named starter's games this season, split by site. */
function quarterbackLines(team, quarterback, rows, results, onFile, starts = new Map()) {
  if (!quarterback?.name) return [`${team}: this week's starting quarterback is not established, so no quarterback site split is shown. The game-by-game lines above name who played quarterback in each game.`];
  const byGame = new Map(results.map((r) => [String(r.gameId), r]));
  const games = (rows || [])
    .filter((row) => nameKey(`${row?.player?.first_name}${row?.player?.last_name}`) === nameKey(quarterback.name) && Number(row.passing_attempts) > 0)
    .map((row) => ({ row, result: byGame.get(String(row?.game?.id)) }))
    .filter((g) => g.result)
    .sort((a, b) => new Date(a.result.date) - new Date(b.result.date));
  const missing = results.filter((r) => !onFile.has(String(r.gameId)));
  const head = `${quarterback.name} (${team}, ${quarterback.status} starter in this week's reporting)${missing.length ? ` (player lines not on file for ${missing.map((r) => `${etDay(r.date).replace(/^\w+, /, '')} ${versus(r)}`).join(', ')})` : ''}`;
  if (!games.length) return [`${head}: no passing rows in this team's games this season.`];
  // Whether he started each of them, where the game's lineup is on file (Oct 27 2026 data loop: Dylan Raiola's 19-of-25
  // at USC came in relief of Dante Moore, and read like a start).
  const tag = (g) => { const lineup = starts.get(String(g.result.gameId)); return !lineup ? '' : startedIn(lineup, quarterback.name, 'QB') ? ' (started)' : ' (came in; did not start)'; };
  const site = (label) => {
    const list = games.filter((g) => siteOf(g.result) === label);
    return `  ${label}, ${plural(list.length, 'game')}: ${list.length ? list.map((g) => `${passingLine(g)}${tag(g)}`).join('; ') : 'none'}`;
  };
  return [`${head}, games with a pass attempt this season by site:`, site('road'), site('home'),
    ...(games.some((g) => g.result.neutral) ? [site('neutral')] : [])];
}

/**
 * Each unit's game on its own line (founder GO, Oct 4 2026: season totals
 * "only tell a small amount of the story"). One week of the schedule
 * provider's box scores serves every desk that day. Returns `lines(team,
 * result)`, the two lines or a line saying they are missing, and `find(team,
 * result)`, the game's provider row with both teams' box (its id is ESPN's).
 */
async function teamBoxBuilder(season, weeks) {
  // The two providers number the early weeks differently, so every week up to
  // the latest is read and a game is found by its two teams, not its week.
  const through = Math.max(1, ...weeks) + 1;
  // One week at a time: CFBD refuses concurrent requests to one endpoint (Oct 13 2026 college review: a parallel
  // burst lost four of six weeks of unit lines on five desks).
  const boxRows = [];
  for (let week = 0; week <= through; week++) boxRows.push(...((await getWeekBoxScores(season, week).catch(() => null))?.rows || []));
  const stats = (entry) => new Map((entry?.stats || []).map((row) => [row.category, row.stat]));
  const find = (team, result) => {
    const game = boxRows.find((row) => (row.teams || []).some((t) => cfbdTeamMatches(t.team, team))
      && (row.teams || []).some((t) => cfbdTeamMatches(t.team, result.opponent)));
    if (!game) return null;
    const ownEntry = game.teams.find((t) => cfbdTeamMatches(t.team, team));
    return { game, teamId: ownEntry?.teamId, own: stats(ownEntry), opp: stats(game.teams.find((t) => !cfbdTeamMatches(t.team, team))) };
  };
  // ESPN's team totals over CFBD's where ESPN has them (round 8: CFBD's box was wrong in games where the official
  // school box agrees with ESPN); CFBD's sacks and tackles for loss, which ESPN's team totals lack, stay.
  const lines = (team, result, sackPlays = null, espn = null) => {
    const found = find(team, result);
    if (!found && !espn) return ['      units: the per-game unit lines are not available for this game'];
    const own = new Map([...(found?.own || []), ...(espn?.own || [])]), opp = new Map([...(found?.opp || []), ...(espn?.opp || [])]);
    const count = (n, word) => `${n ?? '—'} ${word}${String(n) === '1' ? '' : 's'}`;
    // College box scores count sacks as runs (Oct 23 2026 data audit: Virginia's "40 runs for 37" held 10 sacks for 68
    // yards), so the run line says how many of them were sacks.
    const sacked = (n) => (Number(n) > 0 ? ` (${String(n) === '1' ? '1 of them a sack' : `${n} of them sacks`})` : '');
    // Box-score counts only: the play-by-play success and stuff rates and the per-carry and per-attempt averages are gone
    // (founder, Oct 23 2026: "just use stats, not play by play data"), and so is the play-by-play play count (it ran 1 to
    // 7 off the box score).
    // With the play-by-play's sack yards (when its count matches the box's), the runs without the sacks and the sacks
    // apart (Oct 25 2026 read review).
    const runs = (box, sacks, plays) => {
      const att = Number(box.get('rushingAttempts')), yds = Number(box.get('rushingYards'));
      if (plays && !plays.unknownYards && plays.n === Number(sacks) && Number.isFinite(att) && Number.isFinite(yds)) {
        return `${att - plays.n} runs for ${yds - plays.yards}${plays.n ? ` · ${plays.n === 1 ? '1 sack' : `${plays.n} sacks`} for ${plays.yards} yards` : ''}`;
      }
      return `${box.get('rushingAttempts') ?? '—'} runs for ${box.get('rushingYards') ?? '—'}${sacked(sacks)}`;
    };
    const side = (box, sacks, plays) => `${runs(box, sacks, plays)} · passing ${box.get('completionAttempts') ?? '—'} for ${box.get('netPassingYards') ?? '—'}`;
    // How each side gave the ball away (Oct 23 2026 data audit: Oregon's 7 giveaways against UCLA were 5 lost fumbles and
    // 2 interceptions). In CFBD's box `interceptions` are the ones a team threw and `passesIntercepted` the ones its
    // defense made: turnovers equal fumblesLost plus interceptions in all 358 team-games of weeks 5-7. The split shows
    // only when it adds up to the total.
    const lost = (box, word) => {
      const total = box.get('turnovers');
      if (total == null) return `— ${word}s`;
      const fumbles = Number(box.get('fumblesLost')), picks = Number(box.get('interceptions'));
      const split = Number(total) > 0 && Number.isFinite(fumbles) && Number.isFinite(picks) && fumbles + picks === Number(total)
        ? ` (${[fumbles ? `${plural(fumbles, 'fumble')} ${word === 'giveaway' ? 'lost' : 'recovered'}` : null, picks ? `${picks} INT` : null].filter(Boolean).join(', ')})` : '';
      return `${count(total, word)}${split}`;
    };
    // Penalties and fourth downs from the same box (Oct 23 2026 data audit: SMU went 4-for-5 on fourth down against
    // Virginia; third downs alone undercounted how drives were kept alive). Penalties are the whole team's, every unit.
    const penalties = (box) => { const m = String(box.get('totalPenaltiesYards') ?? '').match(/^(\d+)-(-?\d+)$/); return m ? `${m[1]} for ${m[2]} yards` : '—'; };
    return [
      `      offense: ${side(own, opp.get('sacks'), sackPlays?.mine)} · ${lost(own, 'giveaway')} · third down ${own.get('thirdDownEff') ?? '—'} · fourth down ${own.get('fourthDownEff') ?? '—'} · team penalties ${penalties(own)}`,
      `      defense: ${side(opp, own.get('sacks'), sackPlays?.theirs)} · ${count(own.get('sacks'), 'sack')}, ${count(own.get('tacklesForLoss'), 'tackle')} for loss · ${lost(opp, 'takeaway')} · opponent third down ${opp.get('thirdDownEff') ?? '—'} · opponent fourth down ${opp.get('fourthDownEff') ?? '—'} · opponent penalties ${penalties(opp)}`,
    ];
  };
  return { find, lines };
}

/**
 * The player lines for both teams' games, from ESPN's box score (Oct 23 2026 source audit: BDL's college player rows
 * did not add up to the team's box in 29 of 39 team-games). A game's player lines are used only when its carries,
 * catches and pass attempts add up to the team's CFBD line; otherwise, or when the box is not retrieved, that game
 * reads "not on file" (never another source's rows). Also where each side's points came from, from the same summary's
 * scoring plays, only when they add up to the final.
 * Returns, per side: { rows, onFile: Set of game ids, points: Map game id -> line }.
 */
async function playerGames(sides, boxes) {
  const ids = [...new Set(sides.flatMap((s) => s.results.map((r) => boxes.find(s.team, r)?.game?.id)).filter((id) => id != null))];
  const byId = new Map();
  // Four at a time: about a dozen summaries a desk, and a finished game's box is cached for every desk that day.
  for (let i = 0; i < ids.length; i += 4) {
    await Promise.all(ids.slice(i, i + 4).map(async (id) => byId.set(id, await getNcaafGameBox(id).catch((e) => ({ unavailable: true, reason: e.message })))));
  }
  return Promise.all(sides.map(async (s) => {
    const teamId = s.results.map((r) => boxes.find(s.team, r)?.teamId).find((id) => id != null);
    const roster = teamId != null ? await getNcaafRosterPositions(teamId).catch(() => null) : null;
    const positions = roster?.positions || {};
    const rows = [], onFile = new Set(), points = new Map(), kicking = new Map(), drives = new Map(), oppQb = new Map(), named = new Map(), sackPlays = new Map(), flow = new Map(), unitTotals = new Map();
    for (const r of s.results) {
      const found = boxes.find(s.team, r);
      const box = found ? byId.get(found.game.id) : null;
      if (!box || box.unavailable) continue;
      if (box.named?.length) named.set(String(r.gameId), box.named);
      if (box.sacks) {
        const oppSide = (box.teams || []).find((t) => t.id !== String(found.teamId))?.id;
        const none = { n: 0, yards: 0 };
        sackPlays.set(String(r.gameId), { mine: box.sacks[String(found.teamId)] || none, theirs: (oppSide && box.sacks[oppSide]) || none });
      }
      const oppSideId = (box.teams || []).find((t) => t.id && t.id !== String(found.teamId))?.id;
      const ownT = espnUnitTotals(box, found.teamId), oppT = oppSideId ? espnUnitTotals(box, oppSideId) : null;
      if (ownT && oppT) unitTotals.set(String(r.gameId), { own: ownT, opp: oppT });
      if (boxAddsUp(box, found.teamId, found.own)) {
        rows.push(...playerGameRows(box, found.teamId, r.gameId, positions));
        onFile.add(String(r.gameId));
      }
      // The score is on the game's line above, so this line gives only how each side's points came (Duke's 20 against
      // North Carolina: 1 passing TD, 1 fumble-return TD, 2 field goals).
      const scored = pointsByKind(box);
      const mine = scored?.[String(found.teamId)], theirs = scored && Object.entries(scored).find(([id]) => id !== String(found.teamId))?.[1];
      if (mine && theirs && mine.points === r.scored && theirs.points === r.allowed) {
        points.set(String(r.gameId), `points from: ${kindsInWords(mine.kinds)} · opponent's points from: ${kindsInWords(theirs.kinds)}`);
      }
      // Both kickers' field goals and extra points (Oct 24 2026 read check: Indiana's kicker missed from 32 and 55 in a
      // four-point loss to Ohio State, and nothing Gary read had kicking).
      // The opponent from the box's own two teams (round 8: one wrong scoring-play score emptied pointsByKind and took the
      // opponent's quarterback, both kicking lines and both drive lines with it).
      const oppId = (box.teams || []).find((t) => t.id && t.id !== String(found.teamId))?.id || null;
      const kicks = (teamId) => {
        const rs = playerGameRows(box, teamId, r.gameId, positions);
        const sum = (k) => rs.reduce((a, x) => a + (Number(x[k]) || 0), 0);
        const fga = sum('field_goal_attempts'), xpa = sum('extra_point_attempts');
        // Each try's distance when the play-by-play has them all (made 26, 29; missed 32, 55; blocked 41).
        // A try told only as its return names no kicker: it is the one kicker's when the team used one that day.
        const raw = (box.fieldGoals || []).filter((f) => f.teamId === String(teamId));
        const named = [...new Set(raw.map((f) => f.kicker).filter(Boolean))];
        const tries = raw.map((f) => (!f.kicker && named.length === 1 ? { ...f, kicker: named[0] } : f));
        const yards = (list) => list.map((f) => f.yards ?? '?').join(', ');
        const split = (list) => [['made', list.filter((f) => f.made)], ['missed', list.filter((f) => !f.made && !f.blocked)], ['blocked', list.filter((f) => f.blocked)]]
          .filter(([, l]) => l.length).map(([word, l]) => `${word} ${yards(l)}`).join('; ');
        // By kicker, each try's distance and result (made 26, 29; missed 32, 55), when the play-by-play has every try.
        const kickers = [...new Set(tries.map((f) => f.kicker || 'kicker not named'))];
        const byKicker = tries.length === fga && fga ? kickers.map((k) => {
          const mine = tries.filter((f) => (f.kicker || 'kicker not named') === k);
          return `${k} ${mine.filter((f) => f.made).length}-of-${mine.length} (${split(mine)})`;
        }).join(', ') : null;
        // Punting from the box's punting group, as the second system and the NFL read have it (round 13).
        // ESPN's "Team" row is no punter (round 14: a blocked punt read "Team 1 punt for 0 yds"); blocked punts from the drives.
        const blocked = (box.drives || []).filter((x) => x.teamId === String(teamId) && /^BLOCKED PUNT/.test(String(x.result || ''))).length;
        const punts = (box.players || []).filter((p) => p.teamId === String(teamId) && Number(p.stats?.punting?.punts) > 0 && !/^\s*team\s*$/i.test(String(p.name || '')))
          .map((p) => `${p.name} ${p.stats.punting.punts} punt${Number(p.stats.punting.punts) === 1 ? '' : 's'} for ${p.stats.punting.puntYards ?? '?'} yds, ${p.stats.punting.puntsInside20 || 0} inside the 20`).join('; ');
        return `${fga || xpa ? `${fga ? (byKicker ? `FG ${byKicker}` : `FG ${sum('field_goals_made')}-of-${fga}`) : 'no field goal tries'}, XP ${sum('extra_points_made')}-of-${xpa}` : 'no kicks'}${punts ? `; punting: ${punts}${blocked ? `; ${blocked} blocked` : ''}` : blocked ? `; punting: ${blocked} blocked` : '; no punts'}`;
      };
      // How the drives ended, and the ones that began in the other team's half with how they ended.
      const driveLine = (teamId) => {
        const ds = (box.drives || []).filter((d) => d.teamId === String(teamId));
        if (!ds.length) return null;
        const counted = ds.filter((d) => !/^END OF/.test(d.result));
        const tally = (list) => ncaafDriveTally(list.map((d) => d.result));
        // Overtime possessions start at the 25 by rule: named apart, not short fields (round 10).
        const ot = counted.filter((d) => d.ot), short = counted.filter((d) => d.oppHalf && !d.ot);
        const ended = ds.length - counted.length;
        const rz = ncaafRedZone(ds.filter((d) => !d.ot));
        return `${counted.length - ot.length} drives (${tally(counted.filter((d) => !d.ot))}${ended ? `; ${ended} more ended a half` : ''})${rz ? `; ${rz}` : ''}${short.length ? `, ${short.length} began in the other team's half (${tally(short)})` : ''}${ot.length ? `; ${ot.length} overtime possession${ot.length === 1 ? '' : 's'} from the 25 (${tally(ot)})` : ''}`;
      };
      // Who played quarterback for the opponent that day, everyone with five or more passes (Oct 24 2026: a win over a
      // team playing its backup is not a win over the team; the NFL's line has said so since Oct 23).
      if (oppId) {
        const passers = playerGameRows(box, oppId, r.gameId, positions).filter((x) => Number(x.passing_attempts) >= 5)
          .sort((a, b) => Number(b.passing_attempts) - Number(a.passing_attempts));
        // With his runs, sacks inside them as college counts them (round 14: Louisiana's Lunch Winfield ran for 91 of the
        // 146 USC allowed, and the read gave his passing only), after a comma: the passers are split on "; " (round 15).
        if (passers.length) oppQb.set(String(r.gameId), passers.map((x) => `${x.player.first_name} ${x.player.last_name} ${x.passing_completions}-of-${x.passing_attempts}, ${x.passing_yards} yds${Number(x.rushing_attempts) ? `, ${x.rushing_attempts} run${Number(x.rushing_attempts) === 1 ? '' : 's'} for ${x.rushing_yards} (sacks included)` : ''}`).join('; '));
      }
      if (oppId) {
        kicking.set(String(r.gameId), `kicking: ${kicks(found.teamId)} · opponent's kicking: ${kicks(oppId)}`);
        const mineD = driveLine(found.teamId), theirsD = driveLine(oppId);
        // Each side's kickoff and punt returns (round 10: the return game was in neither read).
        const ret = (id) => ncaafReturns(box, id);
        if (mineD && theirsD) drives.set(String(r.gameId), `drives: ${mineD} · opponent: ${theirsD}${ret(found.teamId) ? `\n      returns: ${ret(found.teamId)} · opponent: ${ret(oppId)}` : ''}`);
        // The game's flow (ncaafFlowLines; Oct 29 2026, founder: who got ahead, how and when).
        await placeHurt(box, [found.teamId, oppId]);
        // Labeled by school (round 16: the full "School Mascot" on every score, lead, big play and hurt player).
        const shortOf = (id) => (box.teams || []).find((t) => t.id === String(id))?.short;
        const lines = ncaafFlowLines(box, found.teamId, { [String(found.teamId)]: shortOf(found.teamId) || s.team, [oppId]: shortOf(oppId) || r.opponent || 'opponent' });
        if (lines) flow.set(String(r.gameId), lines.join('\n      '));
      }
    }
    return { rows, onFile, points, kicking, drives, oppQb, named, sackPlays, flow, unitTotals, jerseys: roster?.jerseys || {} };
  }));
}

/** One player's game as a short stat line, from whatever his rows carry. */
function productionLine(row) {
  const has = (key) => Number(row?.[key]) > 0;
  const n = (key, one, many) => `${row[key]} ${Number(row[key]) === 1 ? one : many}`;
  const parts = [
    has('passing_attempts') ? `${row.passing_completions ?? '?'}-of-${row.passing_attempts}, ${row.passing_yards ?? '?'} yds, ${row.passing_touchdowns ?? 0} TD, ${row.passing_interceptions ?? 0} INT` : null,
    has('rushing_attempts') ? `${n('rushing_attempts', 'carry', 'carries')}, ${row.rushing_yards ?? '?'} yds${has('rushing_touchdowns') ? `, ${row.rushing_touchdowns} TD` : ''}` : null,
    has('receptions') ? `${n('receptions', 'catch', 'catches')}, ${row.receiving_yards ?? '?'} yds${has('receiving_touchdowns') ? `, ${row.receiving_touchdowns} TD` : ''}` : null,
    // A defender's row is often only a pass broken up, a hurry or a recovered fumble (491 of the uncounted rows in weeks
    // 0-8 of 2026), so those count too.
    ['total_tackles', 'interceptions', 'passes_defended', 'qb_hurries', 'fumbles_recovered'].some(has) ? [has('total_tackles') ? n('total_tackles', 'tackle', 'tackles') : null,
      has('sacks') ? n('sacks', 'sack', 'sacks') : null, has('tackles_for_loss') ? `${row.tackles_for_loss} for loss` : null, has('interceptions') ? `${row.interceptions} INT` : null,
      has('passes_defended') ? n('passes_defended', 'pass defended', 'passes defended') : null, has('qb_hurries') ? n('qb_hurries', 'quarterback hurry', 'quarterback hurries') : null,
      has('fumbles_recovered') ? n('fumbles_recovered', 'fumble recovered', 'fumbles recovered') : null].filter(Boolean).join(', ') : null,
    // The box score counts kicking and returns (a kicker's season read "played, no counted stats" from the old feed).
    has('field_goal_attempts') || has('extra_point_attempts') ? `field goals ${row.field_goals_made ?? 0}-of-${row.field_goal_attempts ?? 0}, extra points ${row.extra_points_made ?? 0}-of-${row.extra_point_attempts ?? 0}` : null,
    has('punts') ? n('punts', 'punt', 'punts') : null,
    has('kick_returns') ? n('kick_returns', 'kickoff return', 'kickoff returns') : null,
    has('punt_returns') ? n('punt_returns', 'punt return', 'punt returns') : null,
  ].filter(Boolean);
  return parts.join('; ') || 'a stat row with no counted play';
}

const day = (r) => etDay(r.date).replace(/^\w+, /, '');
const reportName = (i) => i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();
// A player's last three games with a stat row, newest first, each with its opponent, in place of a season total
// (Oct 26 2026, founder: "all they do is play games"; a total says nothing of who it came against or whether his role
// has changed since). Three, not every game: every defender game by game buried the report (Oct 23 2026 data review).
function recentGames(entry, games) {
  const mine = games.filter((r) => entry.games.has(String(r.gameId))).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
  return `${mine.length === 1 ? 'his game' : `his last ${mine.length} games, newest first`}: ${mine.map((r) => `${day(r)} ${versus(r)}: ${productionLine(entry.games.get(String(r.gameId)))}`).join('; ')}`;
}

/** Each player's rows in these games: name to { position, games: Map game id -> row }. */
function playersOf(rows, results) {
  const inGames = new Set(results.map((r) => String(r.gameId)));
  const byPlayer = new Map();
  for (const row of rows || []) {
    if (!row?.player?.first_name || !inGames.has(String(row?.game?.id))) continue;
    const name = `${row.player.first_name} ${row.player.last_name}`.trim();
    if (!byPlayer.has(name)) byPlayer.set(name, { id: row.player.id, first: row.player.first_name, last: row.player.last_name, position: row.player.position_abbreviation || row.player.position || '', games: new Map() });
    byPlayer.get(name).games.set(String(row.game.id), row);
  }
  return byPlayer;
}

/** " (player lines not on file for Sep 5 vs Ohio Bobcats)" when any of these games has none, else ''. */
function notOnFile(results, onFile) {
  const missing = [...results].sort((a, b) => new Date(a.date) - new Date(b.date)).filter((r) => !onFile.has(String(r.gameId)));
  return missing.length ? ` (player lines not on file for ${missing.map((r) => `${day(r)} ${versus(r)}`).join(', ')})` : '';
}

/**
 * The players CARRIES AND CATCHES, GAME BY GAME lists for one team, name to entry: the two with the most carries and the
 * three with the most catches in the games with player lines on file, and in each of the last three of them,
 * quarterbacks left out (Oct 23 2026 data audit; Oct 27 the last three games).
 * The availability and regulars sections name these players and point to that section instead of repeating them.
 */
function offenseCore(rows, results, onFile) {
  const byPlayer = playersOf(rows, results.filter((r) => onFile.has(String(r.gameId))));
  const total = (entry, key) => [...entry.games.values()].reduce((a, row) => a + (Number(row[key]) || 0), 0);
  const passer = (entry) => /^QB$/i.test(entry.position) || total(entry, 'passing_attempts') >= 10;
  const top = (key, n) => [...byPlayer].filter(([, e]) => !passer(e) && total(e, key) > 0).sort((a, b) => total(b[1], key) - total(a[1], key)).slice(0, n);
  // And each of the last three games' (Oct 27 2026 data check: the season's leaders alone left out the players taking the
  // work now, TCU's Jordan Dwyer, LSU's Trey'Dez Green, Arizona's and Oklahoma's backs).
  const recent = results.filter((r) => onFile.has(String(r.gameId))).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
  const floor = { rushing_attempts: 3, receptions: 2 };
  const gameTop = (gameId, key, n) => [...byPlayer].filter(([, e]) => !passer(e) && Number(e.games.get(String(gameId))?.[key]) >= floor[key])
    .sort((a, b) => Number(b[1].games.get(String(gameId))[key]) - Number(a[1].games.get(String(gameId))[key])).slice(0, n);
  return new Map([...top('rushing_attempts', 2), ...top('receptions', 3), ...recent.flatMap((r) => [...gameTop(r.gameId, 'rushing_attempts', 2), ...gameTop(r.gameId, 'receptions', 3)])]);
}
const UNDER_OFFENSE = 'game by game under CARRIES AND CATCHES, GAME BY GAME';

/** Whether a game's play-by-play names this player (a tackle, a target, a return): `plays` is { named, jerseys }. */
const playedPerPlays = (plays, gameId, entry) => namedInPlays(plays?.named?.get(String(gameId)), { first: entry.first, last: entry.last, jersey: plays?.jerseys?.[String(entry.id)] });

/**
 * The availability report's players beside what they did this season, and
 * the other players at the position (founder GO, Oct 4 2026: a number is only
 * as good as who produced it and whether he plays today). College has no snap
 * counts; the per-game stat rows are the record of who played. Games without
 * player lines on file are left out of the counts and named once beside the
 * team.
 */
function availabilityLines(team, reported, rows, results, state = 'checked', onFile = new Set(), core = new Map(), history = null, plays = null, starts = new Map(), exempt = []) {
  const games = [...results].sort((a, b) => new Date(a.date) - new Date(b.date)).filter((r) => onFile.has(String(r.gameId)));
  // Whether he started (Oct 27 2026 data loop: an offensive lineman read "OL (out)" with nothing to say whether he was
  // the starting left tackle or a reserve): the official box's starting lineup of each game the schools post one for.
  const lineups = [...results].sort((a, b) => new Date(a.date) - new Date(b.date)).filter((r) => starts.has(String(r.gameId)));
  // A lineup is the 11 on offense and 11 on defense: kickers, punters and snappers are never in it.
  const started = (name, position) => {
    if (!lineups.length || /^(PK|K|P|LS)$/i.test(position || '')) return '';
    const mine = lineups.filter((r) => startedIn(starts.get(String(r.gameId)), name, position));
    return `started ${mine.length} of ${lineups.length < results.length ? `the ${lineups.length} games with a starting lineup on file` : `${lineups.length} games`}${mine.length ? `, the last ${day(mine.at(-1))}` : ''}`;
  };
  const byPlayer = playersOf(rows, games);
  // One line per player: the games he has a stat row in, the last one, and his last three games (Oct 23 2026 data review:
  // every defender's tackles game by game, and three backups' logs at every position, buried the report under noise).
  // A player CARRIES AND CATCHES, GAME BY GAME lists game by game is pointed there, not repeated.
  const gameByGame = (name, entry) => {
    const played = games.filter((r) => entry.games.has(String(r.gameId)));
    const sinceLast = games.length - 1 - games.indexOf(played.at(-1));
    // A game with no stat row whose play-by-play names him: he played in it (Oct 24 2026 read check).
    const inPlays = sinceLast ? games.slice(-sinceLast).filter((r) => playedPerPlays(plays, r.gameId, entry)) : [];
    const plays_ = inPlays.length ? `; the play-by-play names him in ${inPlays.length === sinceLast ? (sinceLast === 1 ? 'it' : 'each of them') : inPlays.map(day).join(', ')}` : '';
    return `stat rows in ${played.length} of ${games.length} games, the last ${day(played.at(-1))}${sinceLast ? ` (none in the last ${sinceLast === 1 ? 'game' : `${sinceLast} games`}${plays_})` : ''}; `
      + (core.has(name) ? UNDER_OFFENSE : recentGames(entry, games));
  };
  // What the report itself says beyond the status: a conference report's row only repeats it ("RB #2 listed Doubtful on
  // the ACC Update 2 report"), so only a searched report's note is kept.
  const note = (injury) => {
    const text = String(injury.description || '').replace(/\s+/g, ' ').trim();
    return text && !(injury.sources || []).includes('official') && !/^\S+(?: #\d+)? listed .+ on the .+ report$/i.test(text) ? text : '';
  };
  const status = (injury) => String(injury.status || 'on the report').toLowerCase();
  // Kickers and punters weigh by the games they have a row in (Oct 23 2026 data audit: with no "others at PK", a
  // reserve kicker on the report read as "both teams list theirs out").
  const kicking = (position) => /^(PK|K|P|LS)$/i.test(position || '');
  const weight = (entry) => (kicking(entry.position) ? entry.games.size : [...entry.games.values()].reduce((sum, row) => sum + (Number(row.passing_attempts) || 0) + (Number(row.rushing_attempts) || 0)
    + (Number(row.receptions) || 0) + (Number(row.total_tackles) || 0), 0));
  const lines = [], none = [], linemen = [], positions = [];
  const reportedKeys = new Set([...(reported || []).map((i) => nameKey(reportName(i))), ...exempt.map(nameKey)]);
  for (const injury of reported || []) {
    const name = reportName(injury);
    const found = [...byPlayer].find(([player]) => nameKey(player) === nameKey(name));
    const position = found?.[1].position || injury.player?.position_abbreviation || injury.player?.position || '';
    if (found) {
      const said = note(injury);
      // Whether the absence is new or already in the numbers (Oct 24 2026): his game-day status on the season's earlier
      // reports, from the conference's report archive.
      const earlier = historyLine(history, name);
      lines.push(`  ${name}${position ? ` ${position}` : ''} — ${status(injury)} · ${started(name, position) ? `${started(name, position)} · ` : ''}${gameByGame(found[0], found[1])}${said ? ` · report: ${said}` : ''}${earlier ? ` · ${earlier}` : ''}`);
      if (!positions.includes(position)) positions.push(position);
      continue;
    }
    // Players with no stat row this season, and offensive linemen (the box score counts nothing they do), one list each
    // with their status (Oct 23 2026 data audit: Virginia's 24-player report printed "no stat row in any game this season
    // (no pass, carry, catch or tackle recorded)" on ten lines; the searched notes beside them only restated the status,
    // "listed out Friday; reason unspecified").
    const earlier = historyLine(history, name, { short: true });
    const entry = `${name}${position ? ` ${position}` : ''} (${status(injury)}${started(name, position) ? `; ${started(name, position)}` : ''}${earlier ? `; ${earlier}` : ''})`;
    if (/^(OL|OT|OG|T|G|C|LT|RT|LG|RG|IOL)$/i.test(position)) linemen.push(entry); else none.push(entry);
  }
  if (none.length) lines.push(`  ${games.length ? 'no stat row this season' : 'player lines not on file for any game this season'}: ${none.join(', ')}`);
  if (linemen.length) lines.push(`  offensive linemen (no box-score stats): ${linemen.join(', ')}`);
  // "Others at" once per position, without players on the report, only where the box score says who carries the load
  // (quarterback, running back, receiver, tight end) and only beside a reported player who has played this season: a
  // defender's or kicker's "others" were tackle counts, and a player out all season changes nothing about who plays.
  for (const position of positions.filter((p) => /^(QB|RB|FB|WR|TE)$/i.test(p))) {
    const others = [...byPlayer].filter(([player, entry]) => entry.position === position && !reportedKeys.has(nameKey(player)) && weight(entry) > 0)
      .sort((a, b) => weight(b[1]) - weight(a[1])).slice(0, 2)
      .map(([player, entry]) => (core.has(player) ? `${player} (${UNDER_OFFENSE})` : `${player}: ${gameByGame(player, entry)}`));
    if (others.length) lines.push(`  others at ${position}: ${others.join(' || ')}`);
  }
  // An empty list is "no absences" only when the side's availability was checked (college review, Oct 13 2026: BYU,
  // Washington State, Illinois and Oregon State read "no player on the report" when no report had been read).
  const empty = state === 'checked' ? '  No player on the availability report for this game.'
    : state === 'partial' ? '  Availability only partly retrieved: the reported absences could not be verified; absences unknown.'
      : '  Availability report not retrieved for this team; absences unknown.';
  // Back, or coming back (Oct 24 2026 read check: Indiana's starting corner A.J. Harris had returned two games earlier,
  // and the story only said his replacement was missing): out on an earlier game day, not on this week's report, and
  // the games he has played since.
  // A player the report lists Exempt is on this week's report: he is named apart, with his earlier outs (Oct 29 2026
  // hunt, round 7: Clemson's Peyton Streko and five more read "out on an earlier report, not on this week's").
  const exemptKeys = new Set(exempt.map(nameKey));
  const backAll = backFromReports(history, (reported || []).map(reportName));
  const exemptBack = backAll.filter((b) => exemptKeys.has(nameKey(b.name))).map((b) => `${b.name} (out on game day Wk ${b.outWeeks.join(', ')})`);
  const back = backAll.filter((b) => !exemptKeys.has(nameKey(b.name))).map((b) => {
    const entry = [...byPlayer].find(([player]) => nameKey(player) === nameKey(b.name));
    const after = (r) => !b.lastOutDate || new Date(r.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) > b.lastOutDate;
    const since = entry ? games.filter((r) => entry[1].games.has(String(r.gameId)) && after(r)) : [];
    // The games he started since, from the starting lineups: the box never credits a lineman with a stat (Oct 29 2026
    // hunt: Ohio State's Phillip Daniels, starting at tackle again, read "no stat row since").
    const startedSince = lineups.filter((r) => after(r) && startedIn(starts.get(String(r.gameId)), b.name));
    const parts = [startedSince.length ? `started since: ${startedSince.map(day).join(', ')}` : null, since.length ? `stat rows since: ${since.map(day).join(', ')}` : null].filter(Boolean);
    return `${b.name}${entry?.[1].position ? ` ${entry[1].position}` : ''} (out on game day Wk ${b.outWeeks.join(', ')}; ${parts.length ? parts.join('; ') : `no stat row since${lineups.some(after) ? ' and no start in a lineup on file' : ''}`})`;
  });
  // When this week's report was not read, that comes first, and the earlier outs are not set against it (Oct 29 2026
  // hunt, round 7: Fresno State's "absences unknown" was hidden under its earlier outs, and North Carolina's six "not on
  // this week's" were Out on the ACC's report that the build had not read).
  if (back.length) lines.push(state === 'checked' ? `  out on an earlier report, not on this week's: ${back.join('; ')}` : `  out on an earlier game day (this week's report not read): ${back.join('; ')}`);
  if (exemptBack.length) lines.push(`  listed Exempt on this week's report (the report gives no reason): ${exemptBack.join('; ')}`);
  if (state !== 'checked' && lines.length) lines.unshift(empty);
  return [`${team}${lines.length ? notOnFile(results, onFile) : ''}`, ...(lines.length ? lines : [empty])];
}

/** A player's line on this week's report: { status: "out", position }, or null when he is not on it. A player the report
 * lists Exempt reads { status: "Exempt" } (Oct 29 2026 hunt, round 7). */
function onReport(name, reported, exempt = []) {
  const hit = (reported || []).find((i) => nameKey(reportName(i)) === nameKey(name));
  if (!hit && exempt.some((x) => nameKey(x) === nameKey(name))) return { status: 'Exempt', position: '' };
  return hit ? { status: String(hit.status || 'listed').toLowerCase(), position: hit.player?.position_abbreviation || hit.player?.position || '' } : null;
}

/**
 * CARRIES AND CATCHES, GAME BY GAME (Oct 23 2026 data audit: Duke read as a 40-pass team with Nate Sheppard, 20 carries
 * and 11 catches against North Carolina, nowhere in the story). The offenseCore players, every game newest first, with
 * no season total (Oct 26 2026: the total was the games added up and said nothing of who they came against). A game with no row for him reads
 * "no stat row" (college publishes no snap counts, so it is not "did not play"); a game whose player lines are not on
 * file says so.
 */
function offenseLines(team, reported, rows, results, onFile, core, exempt = []) {
  const games = [...results].sort((a, b) => new Date(b.date) - new Date(a.date));
  const counted = games.filter((r) => onFile.has(String(r.gameId)));
  if (!counted.length) return [team, '  player lines not on file for any game this season'];
  const cell = (row) => {
    const has = (key) => Number(row?.[key]) > 0;
    return [
      has('rushing_attempts') ? `${row.rushing_attempts} ${Number(row.rushing_attempts) === 1 ? 'carry' : 'carries'} ${row.rushing_yards ?? '?'} yds${has('rushing_touchdowns') ? ` ${row.rushing_touchdowns} TD` : ''}` : null,
      has('receptions') ? `${row.receptions} ${Number(row.receptions) === 1 ? 'catch' : 'catches'} ${row.receiving_yards ?? '?'} yds${has('receiving_touchdowns') ? ` ${row.receiving_touchdowns} TD` : ''}` : null,
      has('passing_attempts') ? `passing ${row.passing_completions ?? '?'}-of-${row.passing_attempts} ${row.passing_yards ?? '?'} yds` : null,
      has('fumbles_lost') ? `${plural(row.fumbles_lost, 'fumble')} lost` : null,
    ].filter(Boolean).join(', ') || 'no carry or catch';
  };
  const lines = [...core].map(([name, entry]) => {
    const report = onReport(name, reported, exempt);
    const position = entry.position || report?.position;
    const list = games.map((r) => `${day(r)} ${versus(r)}: ${!onFile.has(String(r.gameId)) ? 'player lines not on file'
      : entry.games.has(String(r.gameId)) ? cell(entry.games.get(String(r.gameId))) : 'no stat row'}`);
    return `  ${name}${position ? ` (${position})` : ''}${report ? `, ${report.status} on this week's availability report` : ''} — ${list.join(' | ')}`;
  });
  return [`${team}${notOnFile(results, onFile)}`, ...(lines.length ? lines : ['  no carries or catches by anyone but the quarterbacks'])];
}

/**
 * The team's regulars with no stat row in its last game (Oct 23 2026 data audit: a starter who sat the last game
 * changes what that game's lines say, and the report may not list him). Regulars are the box score's lineup in the
 * games before the last one: the most passes, the two most carries, the four most catches, the eleven most tackles,
 * the most kicks and the most punts, each with a stat row in more than half of those games (and at least two). A
 * looser "most earlier games" listed fifteen Nebraska players, most of them backups with a tackle or two. Each says
 * whether he is on this week's report; a player on it has his last games beside his status in the availability section,
 * so here he gets his status only.
 */
function regularsLines(team, reported, rows, results, onFile, core, plays = null, starts = new Map(), state = 'checked', exempt = []) {
  // Not on the report only when the report was read (Oct 29 2026 hunt, round 7: Kansas State's Avery Johnson, Out on the
  // Big 12's report the build had not read, read "not on this week's availability report").
  const offReport = state === 'checked' ? "not on this week's availability report" : "this week's availability report not read";
  const games = [...results].sort((a, b) => new Date(a.date) - new Date(b.date));
  const last = games.at(-1);
  if (!last) return [`${team}: no completed games this season.`];
  const head = `${team}, last game ${day(last)} ${versus(last)}`;
  if (!onFile.has(String(last.gameId))) return [`${head}: the last game's player lines are not on file.`];
  const earlier = games.slice(0, -1).filter((r) => onFile.has(String(r.gameId)));
  if (earlier.length < 2) return [`${head}: fewer than two earlier games with player lines, so no regulars to compare.`];
  const before = [...playersOf(rows, earlier)];
  const total = (entry, ...keys) => [...entry.games.values()].reduce((a, row) => a + keys.reduce((b, k) => b + (Number(row[k]) || 0), 0), 0);
  const leaders = (n, ...keys) => before.filter(([, e]) => total(e, ...keys) > 0).sort((a, b) => total(b[1], ...keys) - total(a[1], ...keys)).slice(0, n).map(([name]) => name);
  const lastGame = playersOf(rows, [last]);
  // A kicker or punter with no row kicked or punted nothing; he is missing only when someone else did (Oct 23 2026:
  // Kentucky's punter read as a missing regular after a game Kentucky never punted in).
  const someoneDid = (...keys) => [...lastGame.values()].some((e) => [...e.games.values()].some((row) => keys.some((k) => Number(row[k]) > 0)));
  const regular = new Set([...leaders(1, 'passing_attempts'), ...leaders(2, 'rushing_attempts'), ...leaders(4, 'receptions'), ...leaders(11, 'total_tackles'),
    ...(someoneDid('field_goal_attempts', 'extra_point_attempts') ? leaders(1, 'field_goal_attempts', 'extra_point_attempts') : []),
    ...(someoneDid('punts') ? leaders(1, 'punts') : [])]);
  // One the last game's play-by-play names played it without a stat (Oct 24 2026 read check: Rutgers' Rondo Porter and
  // Northwestern's Brendan Flakes read as absent; Porter made a tackle for loss, Flakes blocked a field goal).
  const kept = before.filter(([name, entry]) => regular.has(name) && !lastGame.has(name) && !playedPerPlays(plays, last.gameId, entry))
    .map(([name, entry]) => ({ name, entry, played: earlier.filter((r) => entry.games.has(String(r.gameId))) }))
    .filter((p) => p.played.length >= 2 && p.played.length * 2 > earlier.length)
    .sort((a, b) => b.played.length - a.played.length || a.name.localeCompare(b.name));
  // Starters of the earlier games who did not start the last one (Oct 27 2026 data loop): the official box's lineups
  // name the linemen, and the defenders a stat row misses, that a stat row cannot.
  const lineup = [];
  const lastLineup = starts.get(String(last.gameId));
  const earlierLineups = games.slice(0, -1).filter((r) => starts.has(String(r.gameId)));
  if (starts.size && !lastLineup) lineup.push("  the last game's starting lineup: not on file");
  else if (lastLineup && earlierLineups.length >= 2) {
    const byStarter = new Map();
    for (const r of earlierLineups) for (const x of starts.get(String(r.gameId))) {
      const e = byStarter.get(x.key) || { name: x.name, position: x.position, games: [] };
      e.games.push(r); byStarter.set(x.key, e);
    }
    const listed = kept.map((p) => ({ name: p.name, key: starterKey(p.name) }));
    for (const e of [...byStarter.values()].filter((x) => x.games.length >= 2 && x.games.length * 2 > earlierLineups.length && !startedIn(lastLineup, x.name, x.position) && !startedIn(listed, x.name))
      .sort((a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name))) {
      const report = onReport(e.name, reported, exempt);
      // What he did in the last game off the bench, when he played (round 16: Cincinnati's Simeon Coleman, 11 tackles and
      // a sack at linebacker, read like a dropped starter).
      const row = [...lastGame.entries()].find(([name]) => starterKey(name) === starterKey(e.name))?.[1]?.games.get(String(last.gameId));
      const off = row ? `came off the bench: ${productionLine(row)}` : playedPerPlays(plays, last.gameId, { first: e.name.split(' ')[0], last: e.name.split(' ').slice(1).join(' ') }) ? 'named in its play-by-play' : null;
      lineup.push(`  ${e.name}${e.position ? ` (${e.position})` : ''}: started ${e.games.length} of the ${earlierLineups.length} earlier games with a starting lineup on file, the last ${day(e.games.at(-1))} ${versus(e.games.at(-1))}; `
        + `not in the last game's starting lineup${off ? ` (${off})` : ''} · ${report ? `${report.status} on this week's availability report` : offReport}`);
    }
  }
  // A regular with no stat row who is in the last game's official starting lineup played it (round 11: Brandon Finney
  // Jr., an Oregon starter at Illinois, read as a regular with no row).
  const startedLast = (p) => Boolean(lastLineup && startedIn(lastLineup, p.name, p.entry.position));
  const missing = kept.map((p) => {
    const report = onReport(p.name, reported, exempt);
    if (startedLast(p)) return `  ${p.name}${p.entry.position ? ` (${p.entry.position})` : ''}: no stat row, but in the last game's official starting lineup${report ? ` · ${report.status} on this week's availability report` : ''}`;
    const who = `  ${p.name}${p.entry.position || report?.position ? ` (${p.entry.position || report.position})` : ''}`;
    if (report) return `${who}: ${report.status} on this week's availability report`;
    return `${who}: stat rows in ${p.played.length} of ${earlier.length} earlier games, the last ${day(p.played.at(-1))} ${versus(p.played.at(-1))}; `
      + `${core.has(p.name) ? UNDER_OFFENSE : recentGames(p.entry, earlier)} · ${offReport}`;
  });
  return [`${head}${notOnFile(games.slice(0, -1), onFile)}:`, ...(missing.length ? missing : [lineup.length ? '  no regular without a stat row' : '  none']),
    ...(lineup.some((l) => !/not on file/.test(l)) ? ["  starters of the earlier games who did not start the last one:", ...lineup] : lineup)];
}

/**
 * Everything the desk prints about the site, the two schedules and who played in them.
 * @returns {Promise<{site:Object|null, seasonGames:string, homeRoad:string, whoProduced:string, offense:string, regulars:string,
 *   scheduleBehind:{home:string|null, away:string|null}}>}
 */
export async function ncaafScheduleSections({ homeTeam, awayTeam, season, game, apRankOf = () => null,
  quarterbacks = {}, availability = {}, availabilityState = {}, exempt = {}, service = ballDontLieService }) {
  const teams = await service.getTeams(SPORT);
  const teamsById = new Map((teams || []).map((t) => [Number(t.id), t]));
  const home = findTeam(teams, homeTeam), away = findTeam(teams, awayTeam);
  if (!home?.id || !away?.id) throw new Error('college team identities unavailable for the schedule sections');

  const [leagueGames, leagueWeather] = await Promise.all([getSeasonGames(season).catch(() => null), getSeasonWeather(season).catch(() => null)]);
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
  // Each opponent's own unit numbers in its other games, once the week's boxes are read (round 12: a run defense's
  // numbers could not be read against what those opponents usually run for).
  const unitsOf = { fn: null };
  const label = await opponentContext({ teams, resultLists: sides.map((s) => s.results), season, cutoff: game?.commence_time, leagueGames, unitsOf,
    known: new Map([[Number(home.id), record(sides[0].results)], [Number(away.id), record(sides[1].results)]]) });

  // Through the latest week the league has played, not only these two teams' (round 14: with both off last week, the
  // opponents' games this week read "units not on file").
  const leagueWeeks = (Array.isArray(leagueGames) ? leagueGames : leagueGames?.rows || leagueGames?.games || []).filter((g) => g?.startDate && (!game?.commence_time || Date.parse(g.startDate) < Date.parse(game.commence_time)) && String(g.seasonType || 'regular') === 'regular').map((g) => Number(g.week));
  const weeks = [...new Set([...sides.flatMap((s) => s.results.map((r) => Number(r.week))), ...(leagueWeeks.length ? [Math.max(...leagueWeeks)] : [])].filter((w) => Number.isFinite(w) && w > 0 && w < 900))];
  const noBoxes = { find: () => null, lines: () => ['      units: the per-game unit lines are not available for this game'] };
  const [weather, boxes] = await Promise.all([weatherLine(site, game), teamBoxBuilder(season, weeks).catch(() => noBoxes)]);
  // The opponent's game against this team is the row itself, with its own unit lines (round 13: CFBD's numbers for that
  // game sat beside ESPN's in the same row).
  const ourNames = new Set([homeTeam, awayTeam].map((x) => String(x).toLowerCase()));
  // From ESPN's box of each of those games, as the team's own lines (round 13: CFBD's team numbers differed from the
  // official box in about one entry in eight), with who threw most and the sacks split out of the runs. A first pass
  // through the labels collects the games; their boxes are read four at a time.
  const wanted = new Map();
  unitsOf.fn = (teamName, r) => { if (ourNames.has(String(r.opponent || '').toLowerCase())) return null; const f = boxes.find(teamName, r); if (f?.game?.id != null) wanted.set(String(f.game.id), null); return null; };
  for (const sd of sides) for (const r of sd.results) label(r.opponentId);
  const wantedIds = [...wanted.keys()];
  for (let i = 0; i < wantedIds.length; i += 4) await Promise.all(wantedIds.slice(i, i + 4).map(async (id) => wanted.set(id, await getNcaafGameBox(id).catch(() => null))));
  unitsOf.fn = (teamName, r) => {
    if (ourNames.has(String(r.opponent || '').toLowerCase())) return null;
    const f = boxes.find(teamName, r); const b = f?.game?.id != null ? wanted.get(String(f.game.id)) : null;
    return (f && espnGameClause(b, f.teamId)) || 'units not on file';
  };
  // The player lines and the scoring plays, from ESPN's box of each game the team box found.
  const played = await playerGames(sides, boxes).catch((e) => {
    console.warn(`[Scout Report] College player lines unavailable: ${e.message}`);
    return sides.map(() => ({ rows: [], onFile: new Set(), points: new Map() }));
  });
  const rows = played.map((p) => p.rows);
  // Each game's starting lineup, from the official box on either school's site.
  const school = (t) => ({ college: t?.college, abbr: t?.abbreviation });
  const starts = await Promise.all(sides.map((s) => teamStarters(school(s.atHome ? home : away),
    s.results.map((r) => ({ gameId: r.gameId, date: r.date, opponent: school(teamsById.get(Number(r.opponentId))) })), season).catch(() => new Map())));
  // Each game's sacks from the official box, the stat crew's count (round 13), over ESPN's and CFBD's.
  const sackBoxes = await Promise.all(sides.map((s) => officialSacks(school(s.atHome ? home : away),
    s.results.map((r) => ({ gameId: r.gameId, date: r.date, opponent: school(teamsById.get(Number(r.opponentId))) })), season).catch(() => new Map())));

  // Each game's usual starters who did not start, for the team and, in its last three games, for the opponent (Oct 28
  // 2026 data check: Alabama's center and Kansas State's back out, Oregon's leading receiver suspended, all in games
  // outside a conference report). A usual starter started 60% or more of the team's earlier games with a lineup on file;
  // it takes two such games. From the official boxes the starting lineups already come from. Quarterbacks and offensive
  // linemen only: who else "starts" follows the opening formation (a second tight end, a nickel back), not who played.
  const STEADY = /^(QB|OL|C|G|T|OT|OG|LT|LG|RT|RG)$/i;
  const usualMissing = (map, gameIds, gameId) => {
    const that = map?.get(String(gameId));
    const earlier = gameIds.filter((id) => String(id) !== String(gameId) && map.has(String(id)));
    if (!that || earlier.length < 2) return null;
    const count = new Map();
    for (const id of earlier) for (const p of map.get(String(id))) count.set(p.key, { p, n: (count.get(p.key)?.n || 0) + 1 });
    const missing = [...count.values()].filter(({ n }) => n >= Math.ceil(earlier.length * 0.6)).map(({ p }) => p)
      .filter((p) => STEADY.test(String(p.position || '')) && !startedIn(that, p.name, p.position));
    return missing.length ? `${missing.map((p) => `${p.name} (${p.position})`).join(', ')} (each started most of their ${earlier.length} earlier games with a lineup on file)` : null;
  };
  const ownMissing = sides.map((s, i) => new Map(s.results.map((r) => {
    const earlierIds = s.results.filter((x) => new Date(x.date) < new Date(r.date)).map((x) => x.gameId);
    return [String(r.gameId), usualMissing(starts[i], [...earlierIds, r.gameId], r.gameId)];
  })));
  // Who started at quarterback for each opponent, from that school's official box of the game (round 12: the opponent
  // line listed a reliever first and dropped a starter with under five passes).
  const oppStarter = new Map();
  await Promise.all(sides.map(async (s, i) => {
    const us = teamsById.get(Number(s.id));
    for (const r of s.results) {
      const opp = teamsById.get(Number(r.opponentId));
      if (!opp || !us) continue;
      const map = await teamStarters(school(opp), [{ gameId: r.gameId, date: r.date, opponent: school(us) }], season).catch(() => null);
      const qb = (map?.get(String(r.gameId)) || []).find((x) => /^QB$/i.test(String(x.position || '')));
      if (qb) oppStarter.set(`${i}|${r.gameId}`, qb.name);
    }
  }));
  const oppMissing = new Map();
  await Promise.all(sides.map(async (s, i) => {
    for (const r of [...s.results].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3)) {
      const opp = teamsById.get(Number(r.opponentId));
      if (!opp) continue;
      const theirs = (await loadTeamResults(SPORT, opp.id, season).catch(() => null))?.filter((x) => new Date(x.date) <= new Date(r.date));
      if (!theirs?.length) continue;
      const map = await teamStarters(school(opp), theirs.map((x) => ({ gameId: x.gameId, date: x.date, opponent: school(teamsById.get(Number(x.opponentId))) })), season).catch(() => null);
      const line = map ? usualMissing(map, theirs.map((x) => x.gameId), r.gameId) : null;
      if (line) oppMissing.set(`${i}|${r.gameId}`, line);
    }
  }));

  // Who each side was without on each game day (Oct 24 2026: the college game log never said who was missing, the
  // Bears' blended-season problem in college form): the conferences' report archives, for the team and each opponent.
  const reportDate = game?.commence_time ? new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
  const histories = await Promise.all(sides.map((s) => teamReportHistory(s.atHome ? home : away, { date: reportDate }).catch(() => ({ found: false }))));
  const opponentHistory = new Map();
  for (const s of sides) for (const r of s.results) {
    const id = Number(r.opponentId);
    if (!Number.isFinite(id) || opponentHistory.has(id)) continue;
    const team = teamsById.get(id);
    opponentHistory.set(id, team ? await teamReportHistory(team, { date: reportDate }).catch(() => ({ found: false })) : { found: false });
  }
  // Each game-time decision, whether he played: a box row, a play-by-play mention, or neither (round 16: Texas's Kobe Black
  // and Georgia Tech's Justice Haynes sat, and the game rows named only the outs).
  const etOf = (r) => (r.date ? new Date(r.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '');
  const gtdBoxes = new Map();
  await Promise.all(sides.flatMap((s, i) => s.results.map(async (r) => {
    if (!gameTimeOnGameDay(histories[i], etOf(r)).length && !gameTimeOnGameDay(opponentHistory.get(Number(r.opponentId)), etOf(r)).length) return;
    const f = boxes.find(s.team, r);
    if (f?.game?.id != null) gtdBoxes.set(`${i}|${r.gameId}`, await getNcaafGameBox(f.game.id).catch(() => null));
  })));
  const gtdWords = (box, names) => names.map((name) => {
    if (!box || box.unavailable) return `${name} (whether he played not on file)`;
    const [first, ...rest] = String(name).trim().split(/\s+/); const last = rest.join(' ').replace(/\s+(?:jr\.?|sr\.?|ii|iii|iv)$/i, '');
    const inBox = (box.players || []).some((p) => String(p.last || '').toLowerCase() === last.toLowerCase() && String(p.first || '')[0]?.toLowerCase() === first[0]?.toLowerCase());
    return `${name} (${inBox ? 'played' : namedInPlays(box.named, { first, last }) ? 'named in the play-by-play' : 'did not play: no box row, not in the play-by-play'})`;
  }).join(', ');
  // A report exists only for a game against a team of the same conference (the Big Ten and Big 12 report conference games
  // only), so outside one there is no list, not an empty one.
  const outLine = (i, r) => {
    // The game's Eastern date, the date the reports carry (Oct 29 2026 hunt: a kickoff at 8 PM ET or later is the next day
    // in UTC, and 21 conference games read "nobody · opponent: nobody").
    const day = r.date ? new Date(r.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : '';
    const sameConference = ncaafTeamConferenceId(sides[i].atHome ? home : away) === ncaafTeamConferenceId(teamsById.get(Number(r.opponentId)));
    if (!sameConference) return null;
    const mine = histories[i]?.found ? outOnGameDay(histories[i], day) : null;
    const theirs = opponentHistory.get(Number(r.opponentId));
    const opp = theirs?.found ? outOnGameDay(theirs, day) : null;
    if (mine == null && opp == null) return null;
    // Every name (round 8: the list stopped at 8 and hid starters who missed only that game behind season-long absentees).
    const list = (names) => (names.length ? names.join(', ') : 'nobody');
    const box = gtdBoxes.get(`${i}|${r.gameId}`);
    const gtd = (h) => { const names = h?.found ? gameTimeOnGameDay(h, day) : []; return names.length ? `; game-time decision: ${gtdWords(box, names)}` : ''; };
    return `out on game day (conference reports): ${mine == null ? 'not on file' : list(mine)}${gtd(histories[i])} · opponent: ${opp == null ? 'not on file' : list(opp)}${gtd(theirs)}`;
  };

  // A game with no weather row says so: without the line, silence would read as a dry, calm day.
  const shownOpponents = new Map();
  const weatherLine_ = (row) => (!row ? '\n      weather: not on file' : playedInWeather(row) ? `\n      ${playedInWeather(row)}` : '');
  const seasonGames = `THIS SEASON GAME BY GAME (${season})
${RULE}
Every completed game this season, newest first: date, site, score, the
score by quarter, the opponent (its conference, record now and other games),
each unit's box score (runs, passing, turnovers, third and fourth downs,
penalties), where each side's points came from, kicking, drives, scoring and
flow, who was out, and the weather at kickoff when it was rain, snow, a
storm, wind of 15 mph or more, or freezing.

${(shownOpponents.clear(), sides).map((s, i) => `${s.team} (${record(s.results)}):\n${s.results.length
    ? s.results.map((r) => {
      const official = sackBoxes[i]?.get(String(r.gameId));
      const totals = played[i].unitTotals?.get(String(r.gameId));
      const withSacks = official ? { own: new Map([...(totals?.own || []), ['sacks', official.made[0]]]), opp: new Map([...(totals?.opp || []), ['sacks', official.taken[0]]]) } : totals;
      const units = boxes.lines(s.team, r, played[i].sackPlays?.get(String(r.gameId)), withSacks);
      const points = played[i].points.get(String(r.gameId));
      const listedQb = played[i].oppQb?.get(String(r.gameId)), starter = oppStarter.get(`${i}|${r.gameId}`);
      const lastName = (nm) => String(nm || '').trim().split(/\s+/).filter((w) => !/^(jr|sr|ii|iii|iv)\.?$/i.test(w)).pop()?.toLowerCase();
      const starterListed = starter && listedQb && listedQb.toLowerCase().includes(lastName(starter));
      const theirQb = starter
        ? (starterListed ? listedQb.split('; ').map((x) => (x.toLowerCase().includes(lastName(starter)) ? x.replace(/^([^0-9]+?) (\d+-of-)/, '$1 (started) $2') : x)).sort((a, b) => /\(started\)/.test(b) - /\(started\)/.test(a)).join('; ')
          : `${starter} started (under five passes)${listedQb ? `; ${listedQb}` : ''}`)
        : listedQb;
      // Each opponent's games in full once, later rows pointing to them, and never the game the row is (round 16: an
      // opponent both teams played printed its season twice, and each list opened with the row's own score).
      const etDayOf = (x) => new Date(x).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const seen = shownOpponents.get(Number(r.opponentId));
      const oppText = seen ? `${label(r.opponentId, { full: false })}${label(r.opponentId, { full: false }) ? '; ' : ''}its games: under ${seen} above`
        : label(r.opponentId, { exclude: (x) => etDayOf(x.date) === etDayOf(r.date) });
      if (!seen) shownOpponents.set(Number(r.opponentId), `${s.team}${/s$/.test(s.team) ? "'" : "'s"} ${etDay(r.date)} game`);
      return `  ${etDay(r.date)} · ${gameStoryLine(r.neutral ? { ...r, home: true, neutral: false, opponent: `${r.opponent} (neutral site)` } : r, { opponentContext: oppText ? `opponent: ${oppText}` : null })}\n      ${checkedQuarterback(quarterbackOfGame(rows[i], r, played[i].onFile, starts[i].get(String(r.gameId))), rows[i], r, units)}${theirQb ? ` · opponent's quarterback: ${theirQb}` : ''}\n${units.join('\n')}`
        // The scoring line says every score's kind; "points from" only stands in when that line is missing (round 16).
        + (played[i].flow?.get(String(r.gameId)) ? '' : `\n      ${points || 'points from: not on file for this game'}`)
        + `\n      ${played[i].kicking?.get(String(r.gameId)) || 'kicking: not on file for this game'}`
        + `\n      ${played[i].drives?.get(String(r.gameId)) || 'drives: not on file for this game'}`
        + `\n      ${played[i].flow?.get(String(r.gameId)) || 'scoring and flow: not on file for this game'}`
        + (outLine(i, r) ? `\n      ${outLine(i, r)}` : '')
        + (ownMissing[i].get(String(r.gameId)) ? `\n      usual starting quarterback or linemen who did not start: ${ownMissing[i].get(String(r.gameId))}` : '')
        + (oppMissing.get(`${i}|${r.gameId}`) ? `\n      opponent's usual starting quarterback or linemen who did not start: ${oppMissing.get(`${i}|${r.gameId}`)}` : '')
        + weatherLine_(gameWeatherFor(leagueWeather, s.team, r.opponent, r.date));
    }).join('\n')
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

${sides.map((s, i) => quarterbackLines(s.team, quarterbacks[s.atHome ? 'home' : 'away'], rows[i], s.results, played[i].onFile, starts[i]).join('\n')).join('\n')}
${RULE}`;

  const reportOf = (s) => availability[s.atHome ? 'home' : 'away'];
  const cores = sides.map((s, i) => offenseCore(rows[i], s.results, played[i].onFile));

  const whoProduced = `WHO PRODUCED IT, AND WHO IS ON TODAY'S AVAILABILITY REPORT
${RULE}
Each player on this game's availability report beside the games he started
(the official box's starting lineups, where a school posts them) and his last
three games, and the other players at his position with theirs. College
publishes no snap counts; these stat rows are the record of who played.

${sides.map((s, i) => availabilityLines(s.team, reportOf(s), rows[i], s.results, availabilityState[s.atHome ? 'home' : 'away'] || 'checked', played[i].onFile, cores[i], histories[i], played[i], starts[i], exempt[s.atHome ? 'home' : 'away'] || []).join('\n')).join('\n\n')}
${RULE}`;

  // One intro paragraph each, which the read leaves out: "no stat row" says what the box score shows and no more.
  const offense = `CARRIES AND CATCHES, GAME BY GAME
${RULE}
Each team's two players with the most carries and three with the most catches
this season, quarterbacks left out, every game newest first. A stat row is
the player's line
in the game's box score; college publishes no snap counts, so "no stat row" is
not proof that a player did not play.

${sides.map((s, i) => offenseLines(s.team, reportOf(s), rows[i], s.results, played[i].onFile, cores[i], exempt[s.atHome ? 'home' : 'away'] || []).join('\n')).join('\n\n')}
${RULE}`;

  const regulars = `REGULARS WITH NO STAT ROW IN THE LAST GAME
${RULE}
Each team's regulars in the games before its last one (the most passes, the
two most carries, the four most catches, the eleven most tackles, the most
kicks and the most punts, each with a stat row in most of those games) who
have no stat row in the last game, then the starters of the earlier games who
did not start the last one (the official box's lineups, where a school posts
them), and whether each is on this week's availability report. A stat row is
the player's line in the game's box score; college publishes no snap counts,
so "no stat row" is not proof that a player did not play.

${sides.map((s, i) => regularsLines(s.team, reportOf(s), rows[i], s.results, played[i].onFile, cores[i], played[i], starts[i], availabilityState[s.atHome ? 'home' : 'away'] || 'checked', exempt[s.atHome ? 'home' : 'away'] || []).join('\n')).join('\n\n')}
${RULE}`;

  const behind = (s) => (s.results.length
    ? [...s.results].reverse().map((r) => `${versus(r)}${label(r.opponentId, { full: false }) ? ` (${label(r.opponentId, { full: false })})` : ''}`).join(', ')
    : null);
  return { site: site?.missing ? null : site, seasonGames, homeRoad, whoProduced, offense, regulars,
    scheduleBehind: { home: behind(sides[0]), away: behind(sides[1]) } };
}
