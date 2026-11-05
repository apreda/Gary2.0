// ROSTER TALENT AND THE AP POLL (Oct 31 2026). College's read had no team strength in it after the Oct 23-29 removals
// (rankings, season averages, "how good"), so the reasons a team is a 20-point favorite (talent, depth, where it stands
// this season) were nowhere on Gary's desk; the Oct 31 slate read "Michigan hasn't won by 17 against anyone but UTEP"
// with nothing to weigh it against. Both teams alike, data only (founder, Oct 31: "we give him the data and let him
// figure it out"): the 247Sports talent composite of this season's rosters and this season's AP poll. No ratings that
// carry past seasons (Elo, SP+ and FPI priors): the no-last-season law. Tested on the Oct 31 slate (30 games): Gary's
// own spreads 4 reads to 1, and his reads argued with the reason a number is big ("the market is pricing Oregon's
// roster ... I'm pricing what Oregon's offense has done since Dante Moore went down"). An opponent-average section
// tested beside it made him build his own lines and is left out.
import { cfbdTeamMatches, getTeamTalent, getRankings } from '../../../providers/cfbdService.js';

/** CFBD's school name for a pipeline team name ("UCLA Bruins" → "UCLA"); the longest match wins. */
export function cfbdSchoolFor(names, teamName) {
  return [...names].filter((n) => cfbdTeamMatches(n, teamName)).sort((a, b) => b.length - a.length)[0] || null;
}

/** The section's two lines from CFBD's rows; a source that did not load is said. */
export function rosterAndPollLines(talentRows, rankingRows, { awayTeam, homeTeam }, missing = {}) {
  const lines = [];
  const talent = (talentRows || []).filter((r) => Number.isFinite(Number(r.talent))).sort((a, b) => Number(b.talent) - Number(a.talent));
  if (talent.length) {
    const say = (team) => {
      const school = cfbdSchoolFor(talent.map((r) => r.team), team);
      const i = school ? talent.findIndex((r) => r.team === school) : -1;
      return i < 0 ? `${team} not on file` : `${team} ${Number(talent[i].talent).toFixed(1)}, No. ${i + 1} of ${talent.length}`;
    };
    lines.push(`247Sports team talent composite (this season's rosters): ${say(awayTeam)}; ${say(homeTeam)}`);
  } else lines.push(`247Sports team talent composite: not on file${missing.talent ? ` (${missing.talent})` : ''}`);
  const latest = (rankingRows || []).filter((w) => (w.polls || []).some((p) => p.poll === 'AP Top 25')).sort((a, b) => b.week - a.week)[0];
  if (latest) {
    const ap = latest.polls.find((p) => p.poll === 'AP Top 25').ranks || [];
    const say = (team) => {
      const school = cfbdSchoolFor(ap.map((r) => r.school), team);
      const row = school && ap.find((r) => r.school === school);
      return row ? `${team} No. ${row.rank}` : `${team} not ranked`;
    };
    lines.push(`AP Top 25 (this season, week ${latest.week}): ${say(awayTeam)}; ${say(homeTeam)}`);
  } else lines.push(`AP Top 25: not on file${missing.poll ? ` (${missing.poll})` : ''}`);
  // Each team's path through this season's poll (Nov 5 2026 college data round: where it started and how far it has moved
  // is what anyone following the sport knows about a team; the read had this week's place alone).
  const apWeeks = (rankingRows || []).filter((w) => (w.polls || []).some((p) => p.poll === 'AP Top 25')).sort((a, b) => a.week - b.week);
  if (apWeeks.length > 1) {
    const path = (team) => `${team} ${apWeeks.map((w) => { const ap = w.polls.find((p) => p.poll === 'AP Top 25').ranks || []; const school = cfbdSchoolFor(ap.map((r) => r.school), team); return ap.find((r) => r.school === school)?.rank ?? 'NR'; }).join(', ')}`;
    lines.push(`AP poll week by week (weeks ${apWeeks[0].week}-${apWeeks.at(-1).week}; NR = not ranked): ${path(awayTeam)}; ${path(homeTeam)}`);
  }
  // The committee's rankings from when they start each November (Nov 5 2026 college data round: AP only, while the slate
  // is played under the committee's). None yet: no line.
  const committee = (rankingRows || []).filter((w) => (w.polls || []).some((p) => p.poll === 'Playoff Committee Rankings')).sort((a, b) => b.week - a.week)[0];
  if (committee) {
    const cfp = committee.polls.find((p) => p.poll === 'Playoff Committee Rankings').ranks || [];
    const say = (team) => {
      const school = cfbdSchoolFor(cfp.map((r) => r.school), team);
      const row = school && cfp.find((r) => r.school === school);
      return row ? `${team} No. ${row.rank}` : `${team} not ranked`;
    };
    lines.push(`Playoff committee rankings (week ${committee.week}): ${say(awayTeam)}; ${say(homeTeam)}`);
  }
  return lines.join('\n');
}

/** The college season a date belongs to (a January bowl is the season before). */
export const ncaafSeasonOf = (asOf = new Date()) => { const d = new Date(asOf); return d.getUTCMonth() < 6 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(); };

/** Both teams' talent and poll lines, fetched (two bulk CFBD requests, cached). */
export async function rosterAndPoll({ awayTeam, homeTeam, asOf = new Date() }) {
  const season = ncaafSeasonOf(asOf);
  const [talent, ranks] = await Promise.all([getTeamTalent(season).catch((e) => ({ unavailable: true, reason: e.message })), getRankings(season).catch((e) => ({ unavailable: true, reason: e.message }))]);
  return rosterAndPollLines(talent?.rows, ranks?.rows, { awayTeam, homeTeam }, { talent: talent?.unavailable ? talent.reason : null, poll: ranks?.unavailable ? ranks.reason : null });
}
