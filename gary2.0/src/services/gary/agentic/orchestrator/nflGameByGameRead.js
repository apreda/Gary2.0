/**
 * THE NFL GAME-BY-GAME READ (Oct 27 2026, founder GO; the second system, run beside the live read and never
 * published). Tonight first (the spread, the quarterbacks, the injury report, who missed or left the last game and is
 * not on it, the schedule, travel and weather), then every team's record before tonight, this season's meetings in
 * full, and each team's last NFL_WINDOW games in full (nflBettorData.js nflGameFull: every player on both sides, snap
 * shares, who each side was without, the opponent coming in), then one line for each older game. No season averages,
 * ranks or totals; the news is the live read's, without recaps of the games shown.
 */
import { sectionOf, matchupHeader, spreadInWords, lineOf } from './footballDeskText.js';
import { injuriesAsReported, backOffReport } from './nflRead.js';
import { newsWithoutRecaps } from './newsWithoutRecaps.js';
import { loadBettorData, quarterbacks, spot, etDate, nflGameFull, nflGameShort, nflLeagueRecords, nflTeamGames, codeOf, rosterMoves, nextUp } from '../../../sports/nfl/nflBettorData.js';
import { nflSeason } from '../../../../utils/dateUtils.js';

export const NFL_WINDOW = 6;

export async function buildNflGameByGameStory(desk, { homeTeam, awayTeam, gameDate, asOf = new Date(), season = nflSeason(), news = '' } = {}) {
  const before = etDate(asOf);
  const data = await loadBettorData(season);
  data.asOf = asOf;
  const qbs = sectionOf(desk, 'STARTING QUARTERBACKS THIS WEEK');
  const where = spot(data, homeTeam, awayTeam, gameDate || before);
  const header = where.neutral
    ? String(matchupHeader(desk)).replace(/^Venue: .*$/m, `Venue: ${where.neutral} (neutral site; ${homeTeam} are the designated home team)`)
    : matchupHeader(desk);
  const situation = [where.text, (desk.match(/^Kickoff: [^\n]*/m) || [])[0], (desk.match(/^Kickoff weather[^\n]*/m) || [])[0]].filter(Boolean).join('\n');
  const tonight = ['TONIGHT',
    `THE QUARTERBACKS\n${quarterbacks(data, qbs, homeTeam, awayTeam, before)}`,
    `THE INJURY REPORT\n${[injuriesAsReported(desk), backOffReport(data, desk, awayTeam, homeTeam, before)].filter(Boolean).join('\n\n')}`,
    `NEXT ON THE DEPTH CHART (ESPN), FOR STARTERS ON THIS WEEK'S REPORT\n${await nextUp(data, homeTeam, awayTeam, before) || 'none on the report at a starting spot'}`,
    `ROSTER MOVES\n${await rosterMoves(data, homeTeam, awayTeam, before)}`,
    `SCHEDULE, TRAVEL AND WEATHER\n${situation || 'not on file'}`].join('\n\n');

  const home = codeOf(homeTeam), away = codeOf(awayTeam);
  const awayGames = nflTeamGames(data, awayTeam, before), homeGames = nflTeamGames(data, homeTeam, before);
  const meetings = awayGames.filter((x) => x.opp === home);
  const meetingIds = new Set(meetings.map((x) => x.g.game_id));
  const teamPart = (team, code, games) => {
    if (!games.length) return `${team.toUpperCase()}: no games yet this season`;
    const w = games.filter((x) => x.won).length, t = games.filter((x) => x.tied).length;
    const newest = games.slice().reverse();
    const full = newest.slice(0, NFL_WINDOW).map((x) => (meetingIds.has(x.g.game_id) ? `Wk ${x.week} ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}: in this season's meetings above` : nflGameFull(data, x, code, before)));
    const older = newest.slice(NFL_WINDOW);
    return [`${team.toUpperCase()}: ${w}-${games.length - w - t}${t ? `-${t}` : ''}${games.length > NFL_WINDOW ? `; the last ${NFL_WINDOW} games in full, newest first, then one line for each older game` : ', newest first'}`,
      // A meeting past the window points to the meetings too (Oct 29 2026 hunt, round 7: the Eagles' Week 1 game with
      // Washington printed in full there and again as an older game).
      full.join('\n\n'), older.length ? `Older games, one line each:\n${older.map((x) => (meetingIds.has(x.g.game_id) ? `  Wk ${x.week} ${x.won ? 'W' : x.tied ? 'T' : 'L'} ${x.pf}-${x.pa}: in this season's meetings above` : nflGameShort(data, x, code, before))).join('\n')}` : null].filter(Boolean).join('\n\n');
  };
  const story = [[header, spreadInWords(lineOf(desk))].filter(Boolean).join('\n'), tonight,
    `LEAGUE RECORDS BEFORE TONIGHT\n${nflLeagueRecords(data, before)}`,
    meetings.length ? `THIS SEASON'S MEETINGS (${meetings.length}), shown from the ${awayTeam.split(' ').pop()}' side\n${meetings.map((x) => nflGameFull(data, x, away, before)).join('\n\n')}` : "THIS SEASON'S MEETINGS: none before tonight",
    teamPart(awayTeam, away, awayGames), teamPart(homeTeam, home, homeGames)].join('\n\n');
  const finals = new Set([...awayGames, ...homeGames].map((x) => `${x.pf}-${x.pa}`));
  return { line: lineOf(desk), story, news: newsWithoutRecaps(news, finals) };
}
