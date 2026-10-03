/**
 * One NHL game's evidence, shaped once from the league's free feeds
 * (nhlApiService.js) for the desk and for Gary's stat tools.
 *
 * Required: both clubs' identities, standings rows and season schedules.
 * Everything else is optional and stays visibly missing when a feed fails;
 * nothing is filled from another source or from memory.
 */
import {
  nhlBoxscore, nhlClubSchedule, nhlClubStats, nhlGoalieSeasons, nhlInjuries, nhlRoster, nhlSkaterSeasons, nhlStandings,
  nhlTeamKey, nhlTeamPercentages, nhlTeamSummaries, nhlSeasonId, previousNhlSeasonId, nhlGameIsFinal,
} from './nhlApiService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const etDate = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const dayNumber = date => Math.round(Date.parse(`${date}T12:00:00Z`) / DAY_MS);

/** One finished game from a club's point of view. */
export function teamView(game, abbrev) {
  const isHome = game.home.abbrev === abbrev;
  const us = isHome ? game.home : game.away;
  const them = isHome ? game.away : game.home;
  if (us.score === null || them.score === null) return null;
  const decidedIn = game.lastPeriodType || 'REG';
  const won = us.score > them.score;
  return {
    id: game.id,
    date: game.gameDate || etDate(game.startTimeUTC),
    home: isHome,
    opponent: them.name,
    opponentAbbrev: them.abbrev,
    goalsFor: us.score,
    goalsAgainst: them.score,
    decidedIn,
    // A loss after regulation is the standings' third column, not a regulation loss.
    result: won ? 'W' : decidedIn === 'REG' ? 'L' : 'OTL',
    venue: game.venue,
    gameType: game.gameType,
  };
}

/** A club's finished games before an instant, newest first. */
export function finishedGamesBefore(schedule, abbrev, before) {
  const cutoff = Date.parse(before);
  return (schedule || [])
    .filter(game => nhlGameIsFinal(game) && Date.parse(game.startTimeUTC) < cutoff)
    .map(game => teamView(game, abbrev))
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

/** Calendar facts around this game: rest, a back-to-back, the trip or homestand it sits in. */
export function restSituation(schedule, abbrev, game, isHomeTonight) {
  const today = etDate(game.commence_time);
  const start = Date.parse(game.commence_time);
  const counted = (schedule || []).map(row => ({ ...row, date: row.gameDate || etDate(row.startTimeUTC) }));
  const before = counted.filter(row => Date.parse(row.startTimeUTC) < start && row.scheduleState !== 'PPD')
    .sort((a, b) => b.date.localeCompare(a.date));
  const after = counted.filter(row => Date.parse(row.startTimeUTC) > start && row.scheduleState !== 'PPD')
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = before[0] || null;
  const next = after[0] || null;
  // Consecutive games at the same kind of venue, ending with tonight.
  let run = 1;
  for (const row of before) {
    if ((row.home.abbrev === abbrev) !== isHomeTonight) break;
    run += 1;
  }
  return {
    lastGameDate: last?.date || null,
    lastGameWasHome: last ? last.home.abbrev === abbrev : null,
    lastOpponentAbbrev: last ? (last.home.abbrev === abbrev ? last.away.abbrev : last.home.abbrev) : null,
    daysSinceLastGame: last ? dayNumber(today) - dayNumber(last.date) : null,
    playedYesterday: last ? dayNumber(today) - dayNumber(last.date) === 1 : false,
    playsTomorrow: next ? dayNumber(next.date) - dayNumber(today) === 1 : false,
    nextOpponentAbbrev: next ? (next.home.abbrev === abbrev ? next.away.abbrev : next.home.abbrev) : null,
    gamesInLast7Days: before.filter(row => dayNumber(today) - dayNumber(row.date) <= 7).length,
    isHomeTonight,
    venueRun: run,
    seasonGamesPlayed: before.filter(nhlGameIsFinal).length,
  };
}

/** Who dressed and who started in goal in a club's most recent games (box scores). */
export async function recentLineups(abbrev, views, count = 5) {
  const games = views.slice(0, count);
  const boxes = await Promise.allSettled(games.map(view => nhlBoxscore(view.id)));
  return games.map((view, index) => {
    const box = boxes[index].status === 'fulfilled' ? boxes[index].value : null;
    const side = box ? (box.home.abbrev === abbrev ? box.home : box.away) : null;
    const starter = side?.goalies.find(goalie => goalie.starter) || null;
    return {
      ...view,
      available: Boolean(side),
      starter,
      goalies: side?.goalies.filter(goalie => goalie.toi && goalie.toi !== '00:00') || [],
      shotsFor: side?.sog ?? null,
      shotsAgainst: box ? (box.home.abbrev === abbrev ? box.away.sog : box.home.sog) : null,
      dressedIds: new Set([...(side?.skaters || []), ...(side?.goalies || []).filter(goalie => goalie.toi && goalie.toi !== '00:00')]
        .map(player => player.id)),
    };
  });
}

const settled = (result, fallback = null) => (result.status === 'fulfilled' ? result.value : fallback);

async function loadTeam({ name, abbrev, opponentAbbrev, game, standings, summaries, percentages, prevSummaries, prevPercentages,
  prevGoalies, prevSkaters, injuries, prevSeasonId }) {
  const [scheduleResult, clubResult, rosterResult, prevScheduleResult] = await Promise.allSettled([
    nhlClubSchedule(abbrev),
    nhlClubStats(abbrev),
    nhlRoster(abbrev),
    nhlClubSchedule(abbrev, prevSeasonId),
  ]);
  if (scheduleResult.status !== 'fulfilled') throw new Error(`NHL schedule unavailable for ${name}: ${scheduleResult.reason?.message}`);
  const schedule = scheduleResult.value;
  const recent = finishedGamesBefore(schedule, abbrev, game.commence_time);
  const lineups = await recentLineups(abbrev, recent, 5);
  const roster = settled(rosterResult);
  const club = settled(clubResult);
  const key = nhlTeamKey(name);
  const rosterIds = roster ? new Set([...roster.forwards, ...roster.defensemen, ...roster.goalies].map(player => player.id)) : null;

  const currentGoalies = new Map((club?.goalies || []).map(goalie => [goalie.playerId, goalie]));
  const goalieIds = roster ? roster.goalies.map(goalie => goalie.id) : [...currentGoalies.keys()];
  const goalies = goalieIds.map(id => {
    const rosterRow = roster?.goalies.find(goalie => goalie.id === id);
    const starts = lineups.filter(lineup => lineup.starter?.id === id);
    return {
      id,
      name: rosterRow?.name || currentGoalies.get(id)?.name || null,
      season: currentGoalies.get(id) || null,
      lastSeason: prevGoalies?.get(id) || null,
      recentStarts: starts,
      startedLastGame: lineups[0]?.starter?.id === id,
    };
  }).filter(goalie => goalie.name);

  const previousMeetings = finishedGamesBefore(settled(prevScheduleResult, []), abbrev, game.commence_time)
    .filter(view => view.opponentAbbrev === opponentAbbrev);

  return {
    name, abbrev,
    standing: standings.find(row => row.abbrev === abbrev) || null,
    summary: summaries?.get(key) || null,
    percentages: percentages?.get(key) || null,
    lastSeasonSummary: prevSummaries?.get(key) || null,
    lastSeasonPercentages: prevPercentages?.get(key) || null,
    schedule,
    recent,
    lineups,
    rest: restSituation(schedule, abbrev, game, nhlTeamKey(game.home_team) === key),
    roster,
    rosterIds,
    skaters: (club?.skaters || []).filter(player => !rosterIds || rosterIds.has(player.playerId)),
    // Last season's line for each skater on tonight's roster, wherever he played it.
    lastSeasonSkaters: roster && prevSkaters
      ? [...roster.forwards, ...roster.defensemen].map(player => prevSkaters.get(player.id)).filter(Boolean) : [],
    goalies,
    injuries: injuries?.get(key) || (injuries ? [] : null),
    meetings: recent.filter(view => view.opponentAbbrev === opponentAbbrev),
    lastSeasonMeetings: previousMeetings,
    missing: [
      !club && 'season player table', !roster && 'roster',
      lineups.some(lineup => !lineup.available) && 'some recent box scores',
    ].filter(Boolean),
  };
}

const pendingGames = new Map();

/**
 * Everything the desk prints for one game. `game` is the pick engine's game
 * object (home_team, away_team, commence_time, optional home_abbrev/away_abbrev).
 */
export async function loadNhlGameData(game) {
  const cacheKey = `${game.bdl_game_id ?? game.id}|${game.commence_time}`;
  if (pendingGames.has(cacheKey)) return pendingGames.get(cacheKey);
  const request = (async () => {
    const seasonId = nhlSeasonId(new Date(game.commence_time));
    const prevSeasonId = previousNhlSeasonId(seasonId);
    const standings = await nhlStandings();
    const identify = (name, abbrev) => standings.find(row => row.abbrev === abbrev)
      || standings.find(row => nhlTeamKey(row.team) === nhlTeamKey(name));
    const home = identify(game.home_team, game.home_abbrev);
    const away = identify(game.away_team, game.away_abbrev);
    if (!home || !away) throw new Error(`NHL team identity unavailable for ${game.away_team} @ ${game.home_team}`);

    const [summaries, percentages, prevSummaries, prevPercentages, prevGoalies, prevSkaters, injuries] = (await Promise.allSettled([
      nhlTeamSummaries(seasonId), nhlTeamPercentages(seasonId), nhlTeamSummaries(prevSeasonId),
      nhlTeamPercentages(prevSeasonId), nhlGoalieSeasons(prevSeasonId), nhlSkaterSeasons(prevSeasonId), nhlInjuries(),
    ])).map(result => settled(result));

    const shared = { game, standings, summaries, percentages, prevSummaries, prevPercentages, prevGoalies, prevSkaters, injuries, prevSeasonId };
    const [homeData, awayData] = await Promise.all([
      loadTeam({ ...shared, name: home.team, abbrev: home.abbrev, opponentAbbrev: away.abbrev }),
      loadTeam({ ...shared, name: away.team, abbrev: away.abbrev, opponentAbbrev: home.abbrev }),
    ]);
    return {
      seasonId, prevSeasonId, date: etDate(game.commence_time), home: homeData, away: awayData,
      missing: [!summaries && 'season team table', !percentages && '5-on-5 team table',
        !prevSummaries && 'last season team table', !prevSkaters && 'last season skater table', !injuries && 'injury list'].filter(Boolean),
    };
  })();
  pendingGames.set(cacheKey, request);
  try {
    const data = await request;
    setTimeout(() => pendingGames.delete(cacheKey), 5 * 60_000).unref?.();
    return data;
  } catch (error) {
    pendingGames.delete(cacheKey);
    throw error;
  }
}
