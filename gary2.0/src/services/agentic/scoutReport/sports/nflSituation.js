/**
 * THE SITUATION (founder, Oct 5 2026): "Gary isn't getting much outside of stats ... situation, division etc."
 * The desk's GAME CONTEXT & SIGNIFICANCE section printed one label ("Regular Season", "Division Rivals") and
 * the week's situation lived only inside articles near the bottom of a 90,000-character desk. This section
 * opens the desk with the facts of the spot, both teams the same way: where and when the game is played, the
 * division, each team's record at home and on the road, its last game and its current run. Facts only;
 * what they mean for this game is Gary's read.
 */
import { loadTeamResults, gameStoryLine } from '../../tools/statRouters/footballTeamGames.js';

const SPORT = 'americanfootball_nfl';
const DAY = 86400000;
const etDate = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
const record = (games) => {
  const w = games.filter((g) => g.won).length, t = games.filter((g) => g.scored === g.allowed).length;
  return `${w}-${games.length - w - t}${t ? `-${t}` : ''}`;
};

function teamLines(name, results, kickoff, atHome) {
  if (!results?.length) return [`${name}: no completed games this season.`];
  const homeGames = results.filter((r) => r.home), roadGames = results.filter((r) => !r.home);
  const last = results[0];
  let run = 0;
  for (const r of results) { if (r.won === last.won && r.scored !== r.allowed) run++; else break; }
  const days = kickoff && last.date ? Math.round((Date.parse(kickoff) - Date.parse(last.date)) / DAY) : null;
  return [
    `${name} (${atHome ? 'home' : 'road'}): ${record(results)} · ${record(homeGames)} at home · ${record(roadGames)} on the road`,
    `  last game, ${etDate(last.date)}: ${gameStoryLine(last)}`,
    `  ${run > 1 ? `${last.won ? 'won' : 'lost'} ${run} straight` : `${last.won ? 'won' : 'lost'} the last game`}${days != null ? ` · ${days} days between that game and this one` : ''}`,
  ];
}

export async function nflSituationSection({ homeTeam, awayTeam, home, away, game = {}, season, slot = null, rule }) {
  const [homeResults, awayResults] = await Promise.all([
    home?.id ? loadTeamResults(SPORT, home.id, season).catch(() => null) : null,
    away?.id ? loadTeamResults(SPORT, away.id, season).catch(() => null) : null,
  ]);
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
    where, when, division, '',
    ...teamLines(awayTeam, awayResults, game.commence_time, false), '',
    ...teamLines(homeTeam, homeResults, game.commence_time, true),
    rule, ''].filter((l) => l !== null).join('\n');
}
