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
import { teamReportHistory, historyLine } from '../../../../sports/ncaaf/ncaafAvailabilityReports.js';
import { ballDontLieService } from '../../../../providers/ballDontLieService.js';
import { getFbsTeams, fbsVenueFor, getSeasonGames, seasonGameFor, getVenues, venueById,
  getWeekBoxScores, cfbdTeamMatches } from '../../../../providers/cfbdService.js';
import { getKickoffWeather, windDescription } from '../../../../providers/weatherService.js';
import { findTeam } from '../shared/utilities.js';
import { loadTeamResults, gameStoryLine, homeAwaySplit } from '../../tools/statRouters/footballTeamGames.js';
import { CONF_NAME, FBS } from './ncaafFcsGap.js';
import { loadNcaafLeagueContext, opponentSeasonClause } from '../../tools/statRouters/footballLeagueContext.js';
import { ncaafTeamConferenceId } from '../../../../sports/ncaaf/ncaafGamePolicy.js';
import { getNcaafGameBox, getNcaafRosterPositions, boxAddsUp, playerGameRows, pointsByKind, kindsInWords } from './ncaafGameBox.js';

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
const nameKey = (value) => String(value || '').toLowerCase().replace(/\b(?:jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
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

/**
 * "SEC, now 3-1, AP No. 14, allows 17.8 pts/game (12th of 134), scores 27.4
 * (70th)" for one opponent; pieces that are unknown are left out. The season
 * figures (founder GO, Oct 12 2026) ride on every game line; `full: false`
 * gives the short form for the one-line schedule behind the season totals.
 */
function opponentLabel(opponentId, { teamsById, records, apRankOf, league = null, full = true }) {
  const team = teamsById.get(Number(opponentId));
  const conf = ncaafTeamConferenceId(team);   // 2026 membership, not BDL's stale directory (Oct 13 2026)
  const rank = team ? apRankOf(team.full_name, team) : null;
  // The rank is this week's, like the record, and says so: on a past game's line "AP No. 22" read as the rank that day
  // (Kentucky beat No. 10 LSU; Oct 23 2026 data audit).
  const record = records.get(Number(opponentId));
  return [Number.isFinite(conf) ? (FBS.has(conf) ? CONF_NAME[conf] : 'FCS') : null,
    record || rank ? `now ${[record, rank ? `No. ${rank} in the AP poll` : null].filter(Boolean).join(' and ')}` : null,
    full ? opponentSeasonClause(league, opponentId) : null].filter(Boolean).join(', ');
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
export async function opponentContext({ teams, resultLists, season, cutoff = null, apRankOf = () => null, known = new Map() }) {
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
  return (opponentId, { full = true } = {}) => opponentLabel(opponentId, { teamsById, records, apRankOf, league, full });
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
function quarterbackOfGame(rows, result, onFile) {
  if (!onFile.has(String(result.gameId))) return 'quarterback: the box score\'s player lines are not on file for this game';
  const passers = (rows || [])
    .filter((row) => String(row?.game?.id) === String(result.gameId) && row?.player?.first_name && Number(row.passing_attempts) > 0)
    .sort((a, b) => Number(b.passing_attempts) - Number(a.passing_attempts));
  if (!passers.length) return 'quarterback: no passing rows for this game';
  // Everyone with five or more passes, as the NFL's line reads (Oct 24 2026: Michigan's Tommy Carr played the second half
  // against Penn State, 7 passes, and the 10-pass floor left the only look at today's starter out of the line).
  const shown = passers.filter((row, index) => index === 0 || Number(row.passing_attempts) >= 5);
  // His running too (Oct 23 2026 data check: a dual-threat quarterback's line showed passing only, in four of nine
  // games); college box scores count sacks as runs, so the line says so.
  const runs = (row) => (Number(row.rushing_attempts) > 0 ? `; ${plural(row.rushing_attempts, 'run')} for ${row.rushing_yards ?? '?'} yds${Number(row.rushing_touchdowns) > 0 ? `, ${row.rushing_touchdowns} TD` : ''} (sacks included)` : '');
  return `quarterback: ${shown.map((row) => `${row.player.first_name} ${row.player.last_name} ${row.passing_completions ?? '?'}-of-${row.passing_attempts}, `
    + `${row.passing_yards ?? '?'} yds, ${row.passing_touchdowns ?? '?'} TD, ${row.passing_interceptions ?? '?'} INT${runs(row)}`).join('; ')}`;
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
function quarterbackLines(team, quarterback, rows, results, onFile) {
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
  const site = (label) => {
    const list = games.filter((g) => siteOf(g.result) === label);
    return `  ${label}, ${plural(list.length, 'game')}: ${list.length ? list.map(passingLine).join('; ') : 'none'}`;
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
  const lines = (team, result) => {
    const found = find(team, result);
    if (!found) return ['      units: the per-game unit lines are not available for this game'];
    const { own, opp } = found;
    const count = (n, word) => `${n ?? '—'} ${word}${String(n) === '1' ? '' : 's'}`;
    // College box scores count sacks as runs (Oct 23 2026 data audit: Virginia's "40 runs for 37" held 10 sacks for 68
    // yards), so the run line says how many of them were sacks.
    const sacked = (n) => (Number(n) > 0 ? ` (${String(n) === '1' ? '1 of them a sack' : `${n} of them sacks`})` : '');
    // Box-score counts only: the play-by-play success and stuff rates and the per-carry and per-attempt averages are gone
    // (founder, Oct 23 2026: "just use stats, not play by play data"), and so is the play-by-play play count (it ran 1 to
    // 7 off the box score).
    const side = (box, sacks) => `${box.get('rushingAttempts') ?? '—'} runs for ${box.get('rushingYards') ?? '—'}${sacked(sacks)}`
      + ` · passing ${box.get('completionAttempts') ?? '—'} for ${box.get('netPassingYards') ?? '—'}`;
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
      `      offense: ${side(own, opp.get('sacks'))} · ${lost(own, 'giveaway')} · third down ${own.get('thirdDownEff') ?? '—'} · fourth down ${own.get('fourthDownEff') ?? '—'} · team penalties ${penalties(own)}`,
      `      defense: ${side(opp, own.get('sacks'))} · ${count(own.get('sacks'), 'sack')}, ${count(own.get('tacklesForLoss'), 'tackle')} for loss · ${lost(opp, 'takeaway')} · opponent third down ${opp.get('thirdDownEff') ?? '—'} · opponent fourth down ${opp.get('fourthDownEff') ?? '—'} · opponent penalties ${penalties(opp)}`,
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
    const rows = [], onFile = new Set(), points = new Map();
    for (const r of s.results) {
      const found = boxes.find(s.team, r);
      const box = found ? byId.get(found.game.id) : null;
      if (!box || box.unavailable) continue;
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
    }
    return { rows, onFile, points };
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
const SUMMED = ['passing_attempts', 'passing_completions', 'passing_yards', 'passing_touchdowns', 'passing_interceptions', 'rushing_attempts', 'rushing_yards',
  'rushing_touchdowns', 'receptions', 'receiving_yards', 'receiving_touchdowns', 'fumbles_lost', 'total_tackles', 'sacks', 'tackles_for_loss', 'interceptions',
  'passes_defended', 'qb_hurries', 'fumbles_recovered',
  'field_goals_made', 'field_goal_attempts', 'extra_points_made', 'extra_point_attempts', 'punts', 'kick_returns', 'punt_returns'];
const totalsOf = (entry) => Object.fromEntries(SUMMED.map((k) => [k, [...entry.games.values()].reduce((a, row) => a + (Number(row[k]) || 0), 0)]));
const reportName = (i) => i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();

/** Each player's rows in these games: name to { position, games: Map game id -> row }. */
function playersOf(rows, results) {
  const inGames = new Set(results.map((r) => String(r.gameId)));
  const byPlayer = new Map();
  for (const row of rows || []) {
    if (!row?.player?.first_name || !inGames.has(String(row?.game?.id))) continue;
    const name = `${row.player.first_name} ${row.player.last_name}`.trim();
    if (!byPlayer.has(name)) byPlayer.set(name, { position: row.player.position_abbreviation || row.player.position || '', games: new Map() });
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
 * three with the most catches in the games with player lines on file, quarterbacks left out (Oct 23 2026 data audit).
 * The availability and regulars sections name these players and point to that section instead of repeating them.
 */
function offenseCore(rows, results, onFile) {
  const byPlayer = playersOf(rows, results.filter((r) => onFile.has(String(r.gameId))));
  const total = (entry, key) => [...entry.games.values()].reduce((a, row) => a + (Number(row[key]) || 0), 0);
  const passer = (entry) => /^QB$/i.test(entry.position) || total(entry, 'passing_attempts') >= 10;
  const top = (key, n) => [...byPlayer].filter(([, e]) => !passer(e) && total(e, key) > 0).sort((a, b) => total(b[1], key) - total(a[1], key)).slice(0, n);
  return new Map([...top('rushing_attempts', 2), ...top('receptions', 3)]);
}
const UNDER_OFFENSE = 'game by game under CARRIES AND CATCHES, GAME BY GAME';

/**
 * The availability report's players beside what they did this season, and
 * the other players at the position (founder GO, Oct 4 2026: a number is only
 * as good as who produced it and whether he plays today). College has no snap
 * counts; the per-game stat rows are the record of who played. Games without
 * player lines on file are left out of the counts and named once beside the
 * team.
 */
function availabilityLines(team, reported, rows, results, state = 'checked', onFile = new Set(), core = new Map(), history = null) {
  const games = [...results].sort((a, b) => new Date(a.date) - new Date(b.date)).filter((r) => onFile.has(String(r.gameId)));
  const byPlayer = playersOf(rows, games);
  // One line per player: the games he has a stat row in, the last one, and his season's totals (Oct 23 2026 data review:
  // every defender's tackles game by game, and three backups' logs at every position, buried the report under noise).
  // A player CARRIES AND CATCHES, GAME BY GAME lists game by game is pointed there, not repeated.
  const gameByGame = (name, entry) => {
    const played = games.filter((r) => entry.games.has(String(r.gameId)));
    const sinceLast = games.length - 1 - games.indexOf(played.at(-1));
    return `stat rows in ${played.length} of ${games.length} games, the last ${day(played.at(-1))}${sinceLast ? ` (none in the last ${sinceLast === 1 ? 'game' : `${sinceLast} games`})` : ''}; `
      + (core.has(name) ? UNDER_OFFENSE : `season: ${productionLine(totalsOf(entry))}`);
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
  const reportedKeys = new Set((reported || []).map((i) => nameKey(reportName(i))));
  for (const injury of reported || []) {
    const name = reportName(injury);
    const found = [...byPlayer].find(([player]) => nameKey(player) === nameKey(name));
    const position = found?.[1].position || injury.player?.position_abbreviation || injury.player?.position || '';
    if (found) {
      const said = note(injury);
      // Whether the absence is new or already in the numbers (Oct 24 2026): his game-day status on the season's earlier
      // reports, from the conference's report archive.
      const earlier = historyLine(history, name);
      lines.push(`  ${name}${position ? ` ${position}` : ''} — ${status(injury)} · ${gameByGame(found[0], found[1])}${said ? ` · report: ${said}` : ''}${earlier ? ` · ${earlier}` : ''}`);
      if (!positions.includes(position)) positions.push(position);
      continue;
    }
    // Players with no stat row this season, and offensive linemen (the box score counts nothing they do), one list each
    // with their status (Oct 23 2026 data audit: Virginia's 24-player report printed "no stat row in any game this season
    // (no pass, carry, catch or tackle recorded)" on ten lines; the searched notes beside them only restated the status,
    // "listed out Friday; reason unspecified").
    const earlier = historyLine(history, name, { short: true });
    const entry = `${name}${position ? ` ${position}` : ''} (${status(injury)}${earlier ? `; ${earlier}` : ''})`;
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
  return [`${team}${lines.length ? notOnFile(results, onFile) : ''}`, ...(lines.length ? lines : [empty])];
}

/** A player's line on this week's report: { status: "out", position }, or null when he is not on it. */
function onReport(name, reported) {
  const hit = (reported || []).find((i) => nameKey(reportName(i)) === nameKey(name));
  return hit ? { status: String(hit.status || 'listed').toLowerCase(), position: hit.player?.position_abbreviation || hit.player?.position || '' } : null;
}

/**
 * CARRIES AND CATCHES, GAME BY GAME (Oct 23 2026 data audit: Duke read as a 40-pass team with Nate Sheppard, 20 carries
 * and 11 catches against North Carolina, nowhere in the story). The offenseCore players, each game newest first: every
 * game when there are five or fewer, else the latest five and the season's totals. A game with no row for him reads
 * "no stat row" (college publishes no snap counts, so it is not "did not play"); a game whose player lines are not on
 * file says so.
 */
function offenseLines(team, reported, rows, results, onFile, core) {
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
    const report = onReport(name, reported);
    const position = entry.position || report?.position;
    const list = games.slice(0, 5).map((r) => `${day(r)} ${versus(r)}: ${!onFile.has(String(r.gameId)) ? 'player lines not on file'
      : entry.games.has(String(r.gameId)) ? cell(entry.games.get(String(r.gameId))) : 'no stat row'}`);
    const season = games.length > 5 ? ` | season, ${plural(counted.length, 'game')} with player lines: ${cell(totalsOf(entry))}` : '';
    return `  ${name}${position ? ` (${position})` : ''}${report ? `, ${report.status} on this week's availability report` : ''} — ${list.join(' | ')}${season}`;
  });
  return [`${team}${notOnFile(results, onFile)}`, ...(lines.length ? lines : ['  no carries or catches by anyone but the quarterbacks'])];
}

/**
 * The team's regulars with no stat row in its last game (Oct 23 2026 data audit: a starter who sat the last game
 * changes what that game's lines say, and the report may not list him). Regulars are the box score's lineup in the
 * games before the last one: the most passes, the two most carries, the four most catches, the eleven most tackles,
 * the most kicks and the most punts, each with a stat row in more than half of those games (and at least two). A
 * looser "most earlier games" listed fifteen Nebraska players, most of them backups with a tackle or two. Each says
 * whether he is on this week's report; a player on it has his season beside his status in the availability section,
 * so here he gets his status only.
 */
function regularsLines(team, reported, rows, results, onFile, core) {
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
  const kept = before.filter(([name]) => regular.has(name) && !lastGame.has(name))
    .map(([name, entry]) => ({ name, entry, played: earlier.filter((r) => entry.games.has(String(r.gameId))) }))
    .filter((p) => p.played.length >= 2 && p.played.length * 2 > earlier.length)
    .sort((a, b) => b.played.length - a.played.length || a.name.localeCompare(b.name));
  return [`${head}${notOnFile(games.slice(0, -1), onFile)}:`, ...(kept.length ? kept.map((p) => {
    const report = onReport(p.name, reported);
    const who = `  ${p.name}${p.entry.position || report?.position ? ` (${p.entry.position || report.position})` : ''}`;
    if (report) return `${who}: ${report.status} on this week's availability report`;
    return `${who}: stat rows in ${p.played.length} of ${earlier.length} earlier games, the last ${day(p.played.at(-1))} ${versus(p.played.at(-1))}; `
      + `${core.has(p.name) ? UNDER_OFFENSE : `season: ${productionLine(totalsOf(p.entry))}`} · not on this week's availability report`;
  }) : ['  none'])];
}

/**
 * Everything the desk prints about the site, the two schedules and who played in them.
 * @returns {Promise<{site:Object|null, seasonGames:string, homeRoad:string, whoProduced:string, offense:string, regulars:string,
 *   scheduleBehind:{home:string|null, away:string|null}}>}
 */
export async function ncaafScheduleSections({ homeTeam, awayTeam, season, game, apRankOf = () => null,
  quarterbacks = {}, availability = {}, availabilityState = {}, service = ballDontLieService }) {
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

  const weeks = [...new Set(sides.flatMap((s) => s.results.map((r) => Number(r.week))).filter((w) => Number.isFinite(w) && w > 0 && w < 900))];
  const noBoxes = { find: () => null, lines: () => ['      units: the per-game unit lines are not available for this game'] };
  const [weather, boxes] = await Promise.all([weatherLine(site, game), teamBoxBuilder(season, weeks).catch(() => noBoxes)]);
  // The player lines and the scoring plays, from ESPN's box of each game the team box found.
  const played = await playerGames(sides, boxes).catch((e) => {
    console.warn(`[Scout Report] College player lines unavailable: ${e.message}`);
    return sides.map(() => ({ rows: [], onFile: new Set(), points: new Map() }));
  });
  const rows = played.map((p) => p.rows);

  const seasonGames = `THIS SEASON GAME BY GAME (${season})
${RULE}
Every completed game this season, newest first: date, site, score, how the
halves went, the opponent's conference, current record and AP rank, what the
opponent allows and scores per game this season with its rank among FBS
teams, who played quarterback (the most pass attempts), each unit's box
score (runs, passing, turnovers, third and fourth downs, penalties) and where
each side's points came from.

${sides.map((s, i) => `${s.team} (${record(s.results)}):\n${s.results.length
    ? s.results.map((r) => {
      const units = boxes.lines(s.team, r);
      const points = played[i].points.get(String(r.gameId));
      return `  ${etDay(r.date)} · ${gameStoryLine(r.neutral ? { ...r, home: true, neutral: false, opponent: `${r.opponent} (neutral site)` } : r, { opponentContext: label(r.opponentId) ? `opponent: ${label(r.opponentId)}` : null })}\n      ${checkedQuarterback(quarterbackOfGame(rows[i], r, played[i].onFile), rows[i], r, units)}\n${units.join('\n')}`
        + `\n      ${points || 'points from: not on file for this game'}`;
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

${sides.map((s, i) => quarterbackLines(s.team, quarterbacks[s.atHome ? 'home' : 'away'], rows[i], s.results, played[i].onFile).join('\n')).join('\n')}
${RULE}`;

  const reportOf = (s) => availability[s.atHome ? 'home' : 'away'];
  const cores = sides.map((s, i) => offenseCore(rows[i], s.results, played[i].onFile));
  // Each side's earlier conference reports this season (the SEC, ACC, Big Ten and Big 12 keep an archive).
  const reportDate = game?.commence_time ? new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
  const histories = await Promise.all(sides.map((s) => teamReportHistory(s.atHome ? home : away, { date: reportDate }).catch(() => ({ found: false }))));
  const whoProduced = `WHO PRODUCED IT, AND WHO IS ON TODAY'S AVAILABILITY REPORT
${RULE}
Each player on this game's availability report beside what he did this
season, and the other players at his position with theirs. College publishes
no snap counts; these stat rows are the record of who played.

${sides.map((s, i) => availabilityLines(s.team, reportOf(s), rows[i], s.results, availabilityState[s.atHome ? 'home' : 'away'] || 'checked', played[i].onFile, cores[i], histories[i]).join('\n')).join('\n\n')}
${RULE}`;

  // One intro paragraph each, which the read leaves out: "no stat row" says what the box score shows and no more.
  const offense = `CARRIES AND CATCHES, GAME BY GAME
${RULE}
Each team's two players with the most carries and three with the most catches
this season, quarterbacks left out, each game newest first (the latest five
and the season's totals after five games). A stat row is the player's line
in the game's box score; college publishes no snap counts, so "no stat row" is
not proof that a player did not play.

${sides.map((s, i) => offenseLines(s.team, reportOf(s), rows[i], s.results, played[i].onFile, cores[i]).join('\n')).join('\n\n')}
${RULE}`;

  const regulars = `REGULARS WITH NO STAT ROW IN THE LAST GAME
${RULE}
Each team's regulars in the games before its last one (the most passes, the
two most carries, the four most catches, the eleven most tackles, the most
kicks and the most punts, each with a stat row in most of those games) who
have no stat row in the last game, and whether each is on this week's
availability report. A stat row is the player's line in the game's box score;
college publishes no snap counts, so "no stat row" is not proof that a player
did not play.

${sides.map((s, i) => regularsLines(s.team, reportOf(s), rows[i], s.results, played[i].onFile, cores[i]).join('\n')).join('\n\n')}
${RULE}`;

  const behind = (s) => (s.results.length
    ? [...s.results].reverse().map((r) => `${versus(r)}${label(r.opponentId, { full: false }) ? ` (${label(r.opponentId, { full: false })})` : ''}`).join(', ')
    : null);
  return { site: site?.missing ? null : site, seasonGames, homeRoad, whoProduced, offense, regulars,
    scheduleBehind: { home: behind(sides[0]), away: behind(sides[1]) } };
}
