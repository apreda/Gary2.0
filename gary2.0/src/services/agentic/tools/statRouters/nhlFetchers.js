/**
 * NHL stat tools (founder, Oct 3 2026). Every token reads the league's free
 * feeds through nhlGameData.js: the same evidence the desk prints, plus the
 * game-by-game detail the desk leaves out. Each result names its season and
 * its sample so a two-game table is never read as a season.
 */
import { loadNhlGameData } from '../../../nhlGameData.js';
import { nhlPlayerGameLog, nhlSeasonLabel } from '../../../nhlApiService.js';

const SOURCE = 'NHL league feeds (api-web.nhle.com, api.nhle.com/stats)';
const record = row => (row ? `${row.wins}-${row.losses}-${row.otLosses}` : null);
const round = (value, digits = 3) => (Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null);

async function gameData(options) {
  if (!options?.game) throw new Error('NHL stat tools need the game being analyzed');
  return loadNhlGameData(options.game);
}

/** Shape one answer: a short value per side for the tool ledger, the full records beside it. */
const answer = (data, build, describe) => {
  const home = build(data.home), away = build(data.away);
  return { source: SOURCE, season: nhlSeasonLabel(data.seasonId),
    homeValue: describe(home, data.home), awayValue: describe(away, data.away), home, away };
};

const summaryRecord = (summary, percentages, label) => (summary ? {
  season: label,
  games_played: summary.gamesPlayed,
  goals_for_per_game: round(summary.goalsForPerGame, 2),
  goals_against_per_game: round(summary.goalsAgainstPerGame, 2),
  shots_for_per_game: round(summary.shotsForPerGame, 1),
  shots_against_per_game: round(summary.shotsAgainstPerGame, 1),
  power_play_pct: round(summary.powerPlayPct),
  penalty_kill_pct: round(summary.penaltyKillPct),
  faceoff_win_pct: round(summary.faceoffWinPct),
  ...(percentages ? {
    five_on_five_shot_attempt_share: round(percentages.satPct),
    five_on_five_shot_attempt_share_score_close: round(percentages.satPctClose),
    five_on_five_shooting_pct: round(percentages.shootingPct5v5),
    five_on_five_save_pct: round(percentages.savePct5v5),
  } : {}),
} : null);

const goalieSeason = (goalie, data) => ({
  name: goalie.name,
  [nhlSeasonLabel(data.seasonId)]: goalie.season ? {
    starts: goalie.season.gamesStarted, games: goalie.season.gamesPlayed,
    record: `${goalie.season.wins}-${goalie.season.losses}-${goalie.season.overtimeLosses}`,
    save_pct: round(goalie.season.savePercentage), goals_against_average: round(goalie.season.goalsAgainstAverage, 2),
    shots_against: goalie.season.shotsAgainst, shutouts: goalie.season.shutouts,
  } : 'has not played this season',
  [nhlSeasonLabel(data.prevSeasonId)]: goalie.lastSeason ? {
    club: goalie.lastSeason.teamAbbrevs, starts: goalie.lastSeason.gamesStarted,
    record: `${goalie.lastSeason.wins}-${goalie.lastSeason.losses}-${goalie.lastSeason.otLosses}`,
    save_pct: round(goalie.lastSeason.savePct), goals_against_average: round(goalie.lastSeason.goalsAgainstAverage, 2),
    shutouts: goalie.lastSeason.shutouts,
  } : 'no NHL games',
  started_club_last_game: goalie.startedLastGame,
});

const viewRecord = view => ({ date: view.date, site: view.home ? 'home' : 'road', opponent: view.opponentAbbrev,
  result: view.result, score: `${view.goalsFor}-${view.goalsAgainst}`, decided_in: view.decidedIn });

export const nhlFetchers = {
  NHL_STANDINGS: async (_sport, _home, _away, _season, options) => answer(await gameData(options), team => (team.standing ? {
    record: record(team.standing), games_played: team.standing.gamesPlayed, points: team.standing.points,
    regulation_wins: team.standing.regulationWins, home_record: record(team.standing.home), road_record: record(team.standing.road),
    last_10: { games: team.standing.last10.games, record: record(team.standing.last10) }, streak: team.standing.streak,
    goals_for: team.standing.goalsFor, goals_against: team.standing.goalsAgainst,
    division: team.standing.division, division_rank: team.standing.divisionRank,
    conference: team.standing.conference, conference_rank: team.standing.conferenceRank, league_rank: team.standing.leagueRank,
    shootout_record: `${team.standing.shootoutWins}-${team.standing.shootoutLosses}`,
  } : null), value => (value ? `${value.record} (${value.points} pts, ${value.games_played} GP)` : 'N/A')),

  NHL_TEAM_NUMBERS: async (_sport, _home, _away, _season, options) => {
    const data = await gameData(options);
    return answer(data, team => ({
      this_season: summaryRecord(team.summary, team.percentages, nhlSeasonLabel(data.seasonId)),
      last_season: summaryRecord(team.lastSeasonSummary, team.lastSeasonPercentages, nhlSeasonLabel(data.prevSeasonId)),
    }), value => (value.this_season
      ? `${value.this_season.goals_for_per_game} GF/G, ${value.this_season.goals_against_per_game} GA/G (${value.this_season.games_played} GP)`
      : value.last_season ? `no games yet; last season ${value.last_season.goals_for_per_game} GF/G` : 'N/A'));
  },

  NHL_GOALIES: async (_sport, _home, _away, _season, options) => {
    const data = await gameData(options);
    return { ...answer(data, team => ({
      goalies: team.goalies.map(goalie => goalieSeason(goalie, data)),
      in_net_recent_games: team.lineups.filter(lineup => lineup.available).map(lineup => ({
        ...viewRecord(lineup), starter: lineup.starter?.name || null, saves: lineup.starter?.saves ?? null,
        shots_against: lineup.starter?.shotsAgainst ?? null, goals_against: lineup.starter?.goalsAgainst ?? null,
      })),
    }), value => (value.goalies.length ? value.goalies.map(goalie => goalie.name).join(' / ') : 'N/A')),
    note: "Tonight's starter is not confirmed by the league feed before the game." };
  },

  NHL_GOALIE_GAME_LOG: async (_sport, _home, _away, _season, options) => {
    const data = await gameData(options);
    const logFor = async goalie => {
      const [current, last] = await Promise.allSettled([
        nhlPlayerGameLog(goalie.id, data.seasonId), nhlPlayerGameLog(goalie.id, data.prevSeasonId)]);
      const rows = list => list.map(game => ({ date: game.gameDate, site: game.homeRoadFlag === 'H' ? 'home' : 'road',
        opponent: game.opponentAbbrev, started: Boolean(game.gamesStarted), decision: game.decision || null,
        shots_against: game.shotsAgainst, goals_against: game.goalsAgainst, save_pct: round(game.savePctg), time_on_ice: game.toi }));
      return { name: goalie.name,
        [nhlSeasonLabel(data.seasonId)]: current.status === 'fulfilled' ? rows(current.value) : 'unavailable',
        [`${nhlSeasonLabel(data.prevSeasonId)} last 10 appearances`]: last.status === 'fulfilled' ? rows(last.value.slice(0, 10)) : 'unavailable' };
    };
    const [home, away] = await Promise.all([data.home, data.away].map(team => Promise.all(team.goalies.map(logFor))));
    const names = list => (list.length ? list.map(goalie => goalie.name).join(' / ') : 'N/A');
    return { source: SOURCE, season: nhlSeasonLabel(data.seasonId), homeValue: names(home), awayValue: names(away), home, away };
  },

  NHL_RECENT_GAMES: async (_sport, _home, _away, _season, options) => answer(await gameData(options), team => {
    const lineups = new Map(team.lineups.filter(lineup => lineup.available).map(lineup => [lineup.id, lineup]));
    return { games_played_this_season: team.recent.length, games: team.recent.slice(0, 10).map(view => {
      const lineup = lineups.get(view.id);
      return { ...viewRecord(view), ...(lineup ? { shots_for: lineup.shotsFor, shots_against: lineup.shotsAgainst,
        starting_goalie: lineup.starter?.name || null } : {}) };
    }) };
  }, value => (value.games.length ? `${value.games.length} game(s): ${value.games.map(game => game.result).join(' ')}` : 'no games yet')),

  NHL_REST_SCHEDULE: async (_sport, _home, _away, _season, options) => answer(await gameData(options), team => ({
    site_tonight: team.rest.isHomeTonight ? 'home' : 'road',
    last_game: team.rest.lastGameDate ? { date: team.rest.lastGameDate, site: team.rest.lastGameWasHome ? 'home' : 'road',
      opponent: team.rest.lastOpponentAbbrev } : null,
    days_since_last_game: team.rest.daysSinceLastGame,
    second_night_of_back_to_back: team.rest.playedYesterday,
    plays_again_tomorrow: team.rest.playsTomorrow,
    games_in_last_7_days: team.rest.gamesInLast7Days,
    consecutive_games_at_this_kind_of_site_including_tonight: team.rest.venueRun,
  }), value => (value.last_game
    ? `${value.days_since_last_game} day(s) since last game${value.second_night_of_back_to_back ? ', back-to-back' : ''}` : 'season opener')),

  NHL_SKATERS: async (_sport, _home, _away, _season, options) => {
    const data = await gameData(options);
    return answer(data, team => ({
      [`${nhlSeasonLabel(data.seasonId)} (this club)`]: [...team.skaters].sort((a, b) => b.points - a.points).slice(0, 12).map(player => ({
        name: player.name, position: player.positionCode, games: player.gamesPlayed, goals: player.goals, assists: player.assists,
        points: player.points, shots: player.shots, power_play_goals: player.powerPlayGoals, plus_minus: player.plusMinus,
        ice_time_per_game_seconds: round(player.avgTimeOnIcePerGame, 0) })),
      [`${nhlSeasonLabel(data.prevSeasonId)} (players on tonight's roster; club is where he played)`]:
        [...team.lastSeasonSkaters].sort((a, b) => b.points - a.points).slice(0, 12).map(player => ({
          name: player.skaterFullName, position: player.positionCode, club: player.teamAbbrevs, games: player.gamesPlayed,
          goals: player.goals, assists: player.assists, points: player.points, shots: player.shots,
          power_play_points: player.ppPoints, ice_time_per_game_seconds: round(player.timeOnIcePerGame, 0) })),
    }), (_value, team) => (team.skaters.length ? `${team.skaters.length} skaters with games this season` : 'no games yet this season'));
  },

  NHL_INJURIES: async (_sport, _home, _away, _season, options) => answer(await gameData(options), team => (team.injuries === null
    ? 'injury list unavailable'
    : team.injuries.map(row => ({ player: row.player, position: row.position, status: row.status, detail: row.detail,
      listing_updated: row.updatedAt, listed_return: row.returnDate, note: row.comment }))),
  value => (Array.isArray(value) ? `${value.length} listed` : 'N/A')),

  NHL_HEAD_TO_HEAD: async (_sport, _home, _away, _season, options) => {
    const data = await gameData(options);
    const home = { [nhlSeasonLabel(data.seasonId)]: data.home.meetings.map(viewRecord),
      [nhlSeasonLabel(data.prevSeasonId)]: data.home.lastSeasonMeetings.map(viewRecord) };
    const count = data.home.meetings.length + data.home.lastSeasonMeetings.length;
    return { source: SOURCE, season: nhlSeasonLabel(data.seasonId), perspective: data.home.name,
      homeValue: count ? `${count} meeting(s) across two seasons` : 'no meetings in either season', awayValue: 'see home view', home };
  },
};
