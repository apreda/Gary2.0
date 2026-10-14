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
import { ballDontLieService } from '../../../../providers/ballDontLieService.js';
import { nflverseCode } from '../../../../providers/nflverseService.js';
import { getNflSchedule, scheduleRowFor, siteFor, sideFacts, restPhrase, tripPhrase, headCoach, zoneName, markNeutralSites } from '../../../../sports/nfl/nflSchedule.js';
import { getKickoffWeather, windDescription } from '../../../../providers/weatherService.js';
import { getNflHeadCoach } from '../../../../providers/espnNflCoaches.js';
// A failed source is logged before it falls away (round 2 audit, Oct 13 2026: these fell away without a word).
const warnAs = (what, fallback) => (e) => { console.warn(`[Scout Report] NFL ${what} unavailable: ${e?.message || e}`); return fallback; };

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
  return `${tied ? 'tied for ' : ''}${['first', 'second', 'third', 'fourth'][rivals.findIndex((r) => r.wins === row.wins && r.losses === row.losses)] || `#${i + 1}`} in the ${team.conference} ${team.division[0]}${team.division.slice(1).toLowerCase()}${row.division_record ? ` (${row.division_record} in the division${row.conference_record ? `, ${row.conference_record} in the ${team.conference}` : ''})` : ''}${row.playoff_seed ? `, ${row.playoff_seed}${['th', 'st', 'nd', 'rd'][(row.playoff_seed % 10 > 3 || Math.floor(row.playoff_seed / 10) === 1) ? 0 : row.playoff_seed % 10]} in the ${team.conference} playoff order` : ''}`;
}

function conferenceLeaders(standings) {
  if (!standings?.length) return [];
  const top = (conf) => standings.filter((r) => r.team?.conference === conf)
    .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses) || (b.point_differential ?? 0) - (a.point_differential ?? 0)).slice(0, 3)
    .map((r) => `${r.team?.name} (${r.overall_record || `${r.wins}-${r.losses}`})`).join(', ');
  return ['', `League leaders: AFC ${top('AFC')} · NFC ${top('NFC')}.`];
}

function teamLines(name, results, kickoff, atHome, place = null, lastSeason = null) {
  if (!results?.length) return [`${name}: no completed games this season.`];
  // A neutral-site game is neither (Oct 13 2026 audit); this game's own teams are labeled neither when it is one.
  const homeGames = results.filter((r) => r.home && !r.neutral), roadGames = results.filter((r) => !r.home && !r.neutral);
  const neutralGames = results.filter((r) => r.neutral);
  const last = results[0];
  let run = 0;
  const lastTied = last.scored === last.allowed;
  for (const r of results) { if (!lastTied && r.won === last.won && r.scored !== r.allowed) run++; else break; }
  const days = kickoff && last.date ? Math.round((Date.parse(kickoff) - Date.parse(last.date)) / DAY) : null;
  return [
    `${name} (${atHome == null ? 'neutral site' : atHome ? 'home' : 'road'}): ${record(results)} · ${record(homeGames)} at home · ${record(roadGames)} on the road${neutralGames.length ? ` · ${record(neutralGames)} at neutral sites` : ''}${place ? ` · ${place}` : ''}`,
    `  ${lastTied ? 'tied the last game' : run > 1 ? `${last.won ? 'won' : 'lost'} ${run} straight` : `${last.won ? 'won' : 'lost'} the last game`}${days != null ? ` · ${days} days between the last game and this one` : ''}`,
    `  every game this season, newest first:`,
    ...results.map((r) => `    ${etDate(r.date)}: ${gameStoryLine(r)}`),
    ...(lastSeason?.length ? [`  how last season ended: ${lastSeason.slice(0, 2).map((r) => `${r.scored === r.allowed ? 'T' : r.won ? 'W' : 'L'} ${r.scored}-${r.allowed} ${r.home || r.neutral ? 'vs' : '@'} ${r.opponent}${r.neutral ? ' (neutral site)' : ''} (${etDate(r.date)})`).join(' · ')}`] : []),
  ];
}

/**
 * THE SITE, THE CLOCK, THE TRIP, THE COACHES (founder GO, Oct 12 2026, the NFL blind spots). From nflverse's
 * schedule: the stadium and its roof, the kickoff-hour forecast for an open-air or retractable-roof stadium, the
 * local kickoff time and the visitor's home clock, each team's rest and trip, and each head coach's seasons with
 * the club and any change this season. Facts only.
 */
async function siteLines({ homeTeam, awayTeam, game, season }) {
  const schedule = await getNflSchedule().catch(warnAs('schedule', null));
  if (!schedule || schedule.unavailable) return ['Site, rest and trip: the schedule file could not be read.'];
  const homeCode = nflverseCode(homeTeam), awayCode = nflverseCode(awayTeam);
  const row = scheduleRowFor(schedule, season, homeCode, awayCode, game?.commence_time);
  if (!row) return ['Site, rest and trip: this game is not in the schedule file.'];
  const site = siteFor(row);
  const lines = [];
  if (site) {
    const building = { dome: 'fixed roof, indoors', retractable: 'retractable roof', outdoors: 'open-air' }[site.roof] || site.roof;
    lines.push(`Stadium: ${site.name}, ${site.city} (${building}${row.surface ? `, ${row.surface}` : ''})${site.neutral ? '. NEUTRAL SITE: neither team is at home.' : '.'}`);
    if (game?.commence_time && site.tz) {
      const at = (tz) => new Date(game.commence_time).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
      const away = sideFacts(row, awayCode);
      const visitorClock = away?.ownTz && away.ownTz !== site.tz ? `, ${at(away.ownTz)} on the ${awayTeam}' home clock` : '';
      lines.push(`Kickoff: ${at(site.tz)} ${zoneName(site.tz)} time at the stadium${visitorClock}.`);
    }
    if (site.roof === 'dome') lines.push('Kickoff weather: indoors.');
    else if (game?.commence_time) {
      const w = await getKickoffWeather({ lat: site.lat, lon: site.lon }, game.commence_time).catch(warnAs('kickoff weather', null));
      const lead = site.roof === 'retractable' ? 'Kickoff weather outside the retractable roof (open or closed is decided on game day)' : 'Kickoff weather';
      if (!w) lines.push(`${lead}: the forecast lookup failed.`);
      else if (w.unavailable) lines.push(`${lead}: no forecast yet at this range.`);
      else {
        const r = (v) => (Number.isFinite(v) ? Math.round(v) : null);
        const facts = [r(w.temperature_f) != null ? `${r(w.temperature_f)}°F` : null, w.conditions,
          windDescription(w) ? `wind ${windDescription(w)}` : null,
          r(w.precip_chance_pct) != null ? `${r(w.precip_chance_pct)}% chance of precipitation` : null].filter(Boolean);
        lines.push(`${lead}, forecast for the kickoff hour: ${facts.length ? facts.join(', ') : 'no readings'}.`);
      }
    }
  }
  // This season's head coaches from ESPN; nflverse's column for the season in progress can be out of date.
  const espnCoach = Object.fromEntries(await Promise.all([awayTeam, homeTeam].map(async (t) => [t, await getNflHeadCoach(t, season).catch(warnAs('head coach', null))])));
  for (const [team, code] of [[awayTeam, awayCode], [homeTeam, homeCode]]) {
    const f = sideFacts(row, code);
    const coach = headCoach(schedule, code, season, espnCoach[team]);
    const bits = [f ? restPhrase(f.rest) : null, f ? (tripPhrase(f) || (f.atHome ? 'at home' : null)) : null,
      coach ? `head coach ${coach.name}, his ${ordinal(coach.seasons)} season with the club${coach.change ? `; he replaced ${coach.change.from}${coach.change.sinceWeek ? ` from Wk ${coach.change.sinceWeek}` : ' this season'}` : ''}` : null]
      .filter(Boolean);
    if (bits.length) lines.push(`${team}: ${bits.join(' · ')}`);
  }
  return lines;
}

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;

export async function nflSituationSection({ homeTeam, awayTeam, home, away, game = {}, season, slot = null, rule }) {
  const [rawHome, rawAway, standings, rawHomeLast, schedule] = await Promise.all([
    home?.id ? loadTeamResults(SPORT, home.id, season).catch(warnAs('home results', null)) : null,
    away?.id ? loadTeamResults(SPORT, away.id, season).catch(warnAs('away results', null)) : null,
    ballDontLieService.getStandingsGeneric(SPORT, { season }).catch(warnAs('standings', null)),
    home?.id ? loadTeamResults(SPORT, home.id, season - 1).catch(warnAs('home last season', null)) : null,
    getNflSchedule().catch(warnAs('schedule', null)),
  ]);
  const rawAwayLast = away?.id ? await loadTeamResults(SPORT, away.id, season - 1).catch(warnAs('away last season', null)) : null;
  const homeCode = nflverseCode(homeTeam), awayCode = nflverseCode(awayTeam);
  const homeResults = markNeutralSites(rawHome, schedule, season, homeCode), awayResults = markNeutralSites(rawAway, schedule, season, awayCode);
  const lastSeason = markNeutralSites(rawHomeLast, schedule, season - 1, homeCode), awayLastSeason = markNeutralSites(rawAwayLast, schedule, season - 1, awayCode);
  // The last time these two teams met, this season or last.
  const met = [...(homeResults || []), ...(lastSeason || [])].find((r) => away?.id && Number(r.opponentId) === Number(away.id));
  const lastMeeting = met ? `Last meeting, ${new Date(met.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })}: ${homeTeam} ${met.won ? 'beat' : 'lost to'} ${awayTeam} ${met.scored}-${met.allowed}${met.neutral ? ` at a neutral site (${met.neutral})` : met.home ? ` at home` : ' on the road'}.` : null;
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
  const site = await siteLines({ homeTeam, awayTeam, game, season }).catch(warnAs('site lines', []));
  return [`THE SITUATION`, rule,
    where, when, division, lastMeeting, ...site, '',
    ...teamLines(awayTeam, awayResults, game.commence_time, game.isNeutralSite ? null : false, divisionPlace(standings, away), awayLastSeason), '',
    ...teamLines(homeTeam, homeResults, game.commence_time, game.isNeutralSite ? null : true, divisionPlace(standings, home), lastSeason),
    ...conferenceLeaders(standings),
    rule, ''].filter((l) => l !== null).join('\n');
}
