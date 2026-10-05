/**
 * THE SITUATION (founder, Oct 5 2026): "Gary isn't getting much outside of stats ... situation, division etc."
 * The desk's GAME CONTEXT & SIGNIFICANCE section printed one label ("Regular Season", "Division Rivals") and
 * the week's situation lived only inside articles near the bottom of a 90,000-character desk. This section
 * opens the desk with the facts of the spot, both teams the same way: where and when the game is played, the
 * division and each team's place in it, the last meeting, each team's record at home and on the road, its last
 * game and its current run. Facts only;
 * what they mean for this game is Gary's read.
 */
import { loadTeamResults, gameStoryLine } from '../../tools/statRouters/footballTeamGames.js';
import { ballDontLieService } from '../../../ballDontLieService.js';

const SPORT = 'americanfootball_nfl';
const DAY = 86400000;
const etDate = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
const record = (games) => {
  const w = games.filter((g) => g.won).length, t = games.filter((g) => g.scored === g.allowed).length;
  return `${w}-${games.length - w - t}${t ? `-${t}` : ''}`;
};

function divisionPlace(standings, team) {
  if (!team?.division || !standings?.length) return null;
  const rivals = standings.filter((r) => r.team?.conference === team.conference && r.team?.division === team.division)
    .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses) || (b.point_differential ?? 0) - (a.point_differential ?? 0));
  const i = rivals.findIndex((r) => r.team?.id === team.id);
  if (i < 0) return null;
  const row = rivals[i];
  const tied = rivals.filter((r) => r.wins === row.wins && r.losses === row.losses).length > 1;
  return `${tied ? 'tied for ' : ''}${['first', 'second', 'third', 'fourth'][rivals.findIndex((r) => r.wins === row.wins && r.losses === row.losses)] || `#${i + 1}`} in the ${team.conference} ${team.division[0]}${team.division.slice(1).toLowerCase()}${row.division_record ? ` (${row.division_record} in the division)` : ''}${row.playoff_seed ? `, ${row.playoff_seed}${['th', 'st', 'nd', 'rd'][(row.playoff_seed % 10 > 3 || Math.floor(row.playoff_seed / 10) === 1) ? 0 : row.playoff_seed % 10]} in the ${team.conference} playoff order` : ''}`;
}

function teamLines(name, results, kickoff, atHome, place = null) {
  if (!results?.length) return [`${name}: no completed games this season.`];
  const homeGames = results.filter((r) => r.home), roadGames = results.filter((r) => !r.home);
  const last = results[0];
  let run = 0;
  for (const r of results) { if (r.won === last.won && r.scored !== r.allowed) run++; else break; }
  const days = kickoff && last.date ? Math.round((Date.parse(kickoff) - Date.parse(last.date)) / DAY) : null;
  return [
    `${name} (${atHome ? 'home' : 'road'}): ${record(results)} · ${record(homeGames)} at home · ${record(roadGames)} on the road${place ? ` · ${place}` : ''}`,
    `  last game, ${etDate(last.date)}: ${gameStoryLine(last)}`,
    `  ${run > 1 ? `${last.won ? 'won' : 'lost'} ${run} straight` : `${last.won ? 'won' : 'lost'} the last game`}${days != null ? ` · ${days} days between that game and this one` : ''}`,
  ];
}

export async function nflSituationSection({ homeTeam, awayTeam, home, away, game = {}, season, slot = null, rule }) {
  const [homeResults, awayResults, standings, lastSeason] = await Promise.all([
    home?.id ? loadTeamResults(SPORT, home.id, season).catch(() => null) : null,
    away?.id ? loadTeamResults(SPORT, away.id, season).catch(() => null) : null,
    ballDontLieService.getStandingsGeneric(SPORT, { season }).catch(() => null),
    home?.id ? loadTeamResults(SPORT, home.id, season - 1).catch(() => null) : null,
  ]);
  // The last time these two teams met, this season or last.
  const met = [...(homeResults || []), ...(lastSeason || [])].find((r) => away?.id && Number(r.opponentId) === Number(away.id));
  const lastMeeting = met ? `Last meeting, ${new Date(met.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })}: ${homeTeam} ${met.won ? 'beat' : 'lost to'} ${awayTeam} ${met.scored}-${met.allowed}${met.home ? ` at home` : ' on the road'}.` : null;
  const where = game.isNeutralSite ? `${awayTeam} vs ${homeTeam} at a neutral site${game.venue ? ` (${game.venue})` : ''}.`
    : `${awayTeam} at ${homeTeam}${game.venue ? `, ${game.venue}` : ''}. ${homeTeam} are at home.`;
  const when = game.commence_time
    ? `${new Date(game.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET${slot ? `, ${slot}` : ''}.`
    : null;
  const division = home?.division && away?.division
    ? (home.conference === away.conference && home.division === away.division
      ? `A division game: both teams play in the ${home.conference} ${home.division[0]}${home.division.slice(1).toLowerCase()}.`
      : home.conference === away.conference ? `Same conference (${home.conference}), different divisions.` : 'Teams from different conferences.')
    : null;
  return [`THE SITUATION`, rule,
    where, when, division, lastMeeting, '',
    ...teamLines(awayTeam, awayResults, game.commence_time, false, divisionPlace(standings, away)), '',
    ...teamLines(homeTeam, homeResults, game.commence_time, true, divisionPlace(standings, home)),
    rule, ''].filter((l) => l !== null).join('\n');
}
