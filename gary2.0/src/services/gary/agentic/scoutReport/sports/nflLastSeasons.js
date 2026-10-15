/**
 * THE LAST THREE SEASONS (founder, Oct 14 2026: "who this team is is kind of the missing piece for Gary to connect
 * the dots"). Gary read four games of a team and this week's coverage of what was broken, and one line on last
 * season; a fan knows the Eagles are the Eagles. From nflverse's schedule file, each team's last three seasons in
 * words: the record, a division title or a wild card, how far the playoffs went, the head coach and who started at
 * quarterback. Facts only; what any of it means for this game is Gary's read. (nflverse's coach column for the
 * season in progress is out of date for some clubs, so this section stops at last season.)
 */
import { NFLVERSE_TEAM_CODES, nflverseCode } from '../../../../providers/nflverseService.js';

export const NFL_LAST_SEASONS_TITLE = 'THE LAST THREE SEASONS';

const NAME_OF = Object.fromEntries(Object.entries(NFLVERSE_TEAM_CODES).map(([name, code]) => [code, name]));
const ROUND = { WC: 'the wild-card round', DIV: 'the divisional round', CON: 'the conference championship game' };
const played = (r) => r.home_score !== '' && r.home_score != null && r.home_score !== 'NA';
const side = (r, code) => {
  const home = r.home_team === code;
  const scored = Number(home ? r.home_score : r.away_score), allowed = Number(home ? r.away_score : r.home_score);
  return { home, scored, allowed, won: scored > allowed, tied: scored === allowed, opp: NAME_OF[home ? r.away_team : r.home_team] || (home ? r.away_team : r.home_team),
    qb: (home ? r.home_qb_name : r.away_qb_name) || null, coach: (home ? r.home_coach : r.away_coach) || null };
};
const byCount = (names) => Object.entries(names.filter(Boolean).reduce((m, n) => ({ ...m, [n]: (m[n] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
const list = (xs) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

function seasonLine(rows, code, year) {
  const mine = rows.filter((r) => Number(r.season) === year && (r.home_team === code || r.away_team === code) && played(r))
    .sort((a, b) => Date.parse(a.gameday) - Date.parse(b.gameday));
  const reg = mine.filter((r) => r.game_type === 'REG').map((r) => side(r, code));
  if (!reg.length) return null;
  const w = reg.filter((g) => g.won).length, t = reg.filter((g) => g.tied).length;
  const rec = `${w}-${reg.length - w - t}${t ? `-${t}` : ''}`;
  const post = mine.filter((r) => r.game_type !== 'REG');
  let october;
  if (!post.length) october = `${rec}, missed the playoffs.`;
  else {
    // Seeds 1-4 are the division winners: the 1 seed's first game is in the divisional round, seeds 2-4 host a
    // wild-card game; a wild card plays its first game on the road.
    const first = post[0];
    const divisionWinner = first.game_type === 'DIV' || (first.game_type === 'WC' && first.home_team === code);
    // How far they went, with no opponents or scores: last season's games are not Gary's to read (founder, Oct 14
    // 2026 night: "get rid of anything from last season that is head to head or games from last year").
    const last = { ...side(post.at(-1), code), round: post.at(-1).game_type };
    const end = last.round === 'SB' ? (last.won ? 'won the Super Bowl' : 'lost in the Super Bowl') : `lost in ${ROUND[last.round] || 'the playoffs'}`;
    october = `${rec}, ${divisionWinner ? `won the division${first.game_type === 'DIV' ? ' and had the first-round bye' : ''}` : 'made the playoffs as a wild card'}; ${end}.`;
  }
  const coaches = byCount(reg.map((g) => g.coach));
  const qbs = byCount(reg.map((g) => g.qb));
  const coachText = coaches.length === 1 ? `Head coach ${coaches[0][0]}` : `Head coaches ${list(coaches.map(([n, c]) => `${n} (${c} games)`))}`;
  const qbText = qbs.length ? `Starting quarterback${qbs.length > 1 ? 's' : ''}: ${qbs.map(([n, c], i) => `${n} (${c}${i ? '' : ' games'})`).join(', ')}` : null;
  return `  ${year}: ${october}\n    ${[coachText, qbText].filter(Boolean).join('. ')}.`;
}

/** The section body: each team's last three seasons, the visitors first. Empty when the schedule file is out. */
export function nflLastSeasonsText(schedule, { homeTeam, awayTeam, season }) {
  const rows = schedule?.rows;
  if (!rows?.length) return '';
  const blocks = [awayTeam, homeTeam].map((team) => {
    const code = nflverseCode(team);
    if (!code) return null;
    const seasons = [season - 1, season - 2, season - 3].map((y) => seasonLine(rows, code, y)).filter(Boolean);
    if (!seasons.length) return null;
    return [team, ...seasons].join('\n');
  }).filter(Boolean);
  return blocks.join('\n\n');
}
