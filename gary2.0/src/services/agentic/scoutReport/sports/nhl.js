/**
 * NHL desk (founder, Oct 3 2026): the game-pick desk for hockey, built from
 * the league's free feeds (nhlApiService.js / nhlGameData.js).
 *
 * The shape is a port, not a new design. From the MLB desk: the starter in
 * net is read the way a starting pitcher is, the ticket is the moneyline,
 * and small samples are printed as counts. From the NBA desk: the nightly
 * schedule spot (rest, back-to-backs, travel) and the injury report.
 *
 * The league feed does not confirm tonight's starting goalie. The desk says
 * so, shows who has been starting, and carries dated reporting when the
 * search finds it. An unreported starter stays unconfirmed.
 */
import { formatOdds } from '../shared/dataFetchers.js';
import { formatGameTime } from '../shared/utilities.js';
import { groundedWebSearch } from '../shared/grounding.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import { loadNhlGameData } from '../../../nhlGameData.js';
import { nhlSeasonLabel } from '../../../nhlApiService.js';

const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const HEAVY = '══════════════════════════════════════════════════════════════════════';

const num = (value, digits = 2) => (Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : 'n/a');
const pct = (value, digits = 1) => (Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(digits)}%` : 'n/a');
const savePct = value => (Number.isFinite(Number(value)) ? Number(value).toFixed(3).replace(/^0/, '') : 'n/a');
const record = row => (row ? `${row.wins}-${row.losses}-${row.otLosses}` : 'n/a');
const games = count => `${count} game${count === 1 ? '' : 's'}`;
const minutes = seconds => (Number.isFinite(Number(seconds)) ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}` : 'n/a');
const shortDate = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const resultLine = view => `${shortDate(view.date)} ${view.home ? 'vs' : 'at'} ${view.opponentAbbrev}: ${view.result} ${view.goalsFor}-${view.goalsAgainst}${view.decidedIn === 'REG' ? '' : ` (${view.decidedIn})`}`;

function standingsSection(data) {
  const line = team => {
    const row = team.standing;
    if (!row) return `${team.name}: standings row unavailable`;
    const played = row.gamesPlayed;
    const place = `  ${row.division} Division: ${row.divisionRank ?? 'n/a'} | ${row.conference} Conference: ${row.conferenceRank ?? 'n/a'} | League: ${row.leagueRank ?? 'n/a'}`;
    if (!played) return [`${team.name} (${team.abbrev})`, '  Has not played this season', place].join('\n');
    return [
      `${team.name} (${team.abbrev})`,
      `  Record: ${record(row)} in ${games(played)} (${row.points} point${row.points === 1 ? '' : 's'}), ${row.regulationWins} regulation win${row.regulationWins === 1 ? '' : 's'}`,
      `  Home: ${record(row.home)} | Road: ${record(row.road)} | Last ${row.last10.games}: ${record(row.last10)}${row.streak ? ` | Streak: ${row.streak}` : ''}`,
      `  Goals: ${row.goalsFor} for, ${row.goalsAgainst} against (${row.goalDiff >= 0 ? '+' : ''}${row.goalDiff})`,
      place,
    ].join('\n');
  };
  return [line(data.away), '', line(data.home)].join('\n');
}

function teamTableLine(label, summary, percentages) {
  if (!summary) return `  ${label}: not available`;
  const fiveOnFive = percentages
    ? ` | 5-on-5 shot-attempt share ${pct(percentages.satPct)} | 5-on-5 shooting ${pct(percentages.shootingPct5v5)} | 5-on-5 save ${savePct(percentages.savePct5v5)}`
    : '';
  return `  ${label} (${games(summary.gamesPlayed)}): ${num(summary.goalsForPerGame)} goals for/game, ${num(summary.goalsAgainstPerGame)} against/game | `
    + `${num(summary.shotsForPerGame, 1)} shots for/game, ${num(summary.shotsAgainstPerGame, 1)} against/game | `
    + `power play ${pct(summary.powerPlayPct)} | penalty kill ${pct(summary.penaltyKillPct)} | faceoffs ${pct(summary.faceoffWinPct)}${fiveOnFive}`;
}

function teamTables(data) {
  const block = team => [
    `${team.name}`,
    teamTableLine(`${nhlSeasonLabel(data.seasonId)}`, team.summary, team.percentages),
    teamTableLine(`${nhlSeasonLabel(data.prevSeasonId)} full season`, team.lastSeasonSummary, team.lastSeasonPercentages),
  ].join('\n');
  return [block(data.away), '', block(data.home)].join('\n');
}

function goalieLine(goalie, data) {
  const current = goalie.season;
  const last = goalie.lastSeason;
  const lines = [`  ${goalie.name}`];
  lines.push(current
    ? `    ${nhlSeasonLabel(data.seasonId)}: ${current.gamesStarted} start${current.gamesStarted === 1 ? '' : 's'} (${games(current.gamesPlayed)}), ${current.wins}-${current.losses}-${current.overtimeLosses}, save % ${savePct(current.savePercentage)}, ${num(current.goalsAgainstAverage)} goals against average, ${current.shotsAgainst} shots faced`
    : `    ${nhlSeasonLabel(data.seasonId)}: has not played this season`);
  lines.push(last
    ? `    ${nhlSeasonLabel(data.prevSeasonId)} (${last.teamAbbrevs}): ${last.gamesStarted} starts, ${last.wins}-${last.losses}-${last.otLosses}, save % ${savePct(last.savePct)}, ${num(last.goalsAgainstAverage)} goals against average, ${last.shutouts} shutout${last.shutouts === 1 ? '' : 's'}`
    : `    ${nhlSeasonLabel(data.prevSeasonId)}: no NHL games`);
  return lines.join('\n');
}

function goaliesSection(data) {
  const block = team => {
    const lines = [`${team.name}`];
    if (!team.goalies.length) lines.push('  Goalies: roster unavailable');
    for (const goalie of team.goalies) lines.push(goalieLine(goalie, data));
    const started = team.lineups.filter(lineup => lineup.available);
    if (started.length) {
      lines.push(`  In net, last ${games(started.length)}:`);
      for (const lineup of started) {
        const s = lineup.starter;
        lines.push(s
          ? `    ${shortDate(lineup.date)} ${lineup.home ? 'vs' : 'at'} ${lineup.opponentAbbrev}: ${s.name} started, ${s.saves} saves on ${s.shotsAgainst} shots (${s.goalsAgainst} against), team result ${lineup.result} ${lineup.goalsFor}-${lineup.goalsAgainst}${lineup.goalies.length > 1 ? `; ${lineup.goalies.filter(g => !g.starter).map(g => g.name).join(', ')} also played` : ''}`
          : `    ${shortDate(lineup.date)} ${lineup.home ? 'vs' : 'at'} ${lineup.opponentAbbrev}: starter not listed`);
      }
    } else {
      lines.push('  In net: no games played yet this season');
    }
    return lines.join('\n');
  };
  return [
    "Tonight's starters: the league feed does not confirm starting goalies before the game. A starter is confirmed only where the reporting below names him.",
    '',
    block(data.away), '', block(data.home),
  ].join('\n');
}

function restSection(data) {
  const line = team => {
    const rest = team.rest;
    const bits = [];
    if (rest.lastGameDate) {
      bits.push(`Last game ${shortDate(rest.lastGameDate)} (${rest.lastGameWasHome ? 'home vs' : 'at'} ${rest.lastOpponentAbbrev}); ${rest.daysSinceLastGame} day${rest.daysSinceLastGame === 1 ? '' : 's'} since`);
      if (rest.playedYesterday) bits.push('second night of a back-to-back');
    } else {
      bits.push('First game of the season');
    }
    if (rest.playsTomorrow) bits.push(`plays again tomorrow (${rest.nextOpponentAbbrev})`);
    bits.push(`${games(rest.gamesInLast7Days)} in the last 7 days`);
    bits.push(rest.isHomeTonight
      ? (rest.venueRun > 1 ? `game ${rest.venueRun} of a homestand` : 'home tonight')
      : (rest.venueRun > 1 ? `game ${rest.venueRun} of a road trip` : 'on the road tonight'));
    return `${team.name}: ${bits.join('; ')}`;
  };
  return [line(data.away), line(data.home)].join('\n');
}

function recentSection(data) {
  const block = team => {
    const views = team.recent.slice(0, 10);
    if (!views.length) return `${team.name}: no games played yet this season`;
    const shots = new Map(team.lineups.filter(l => l.available && l.shotsFor !== null).map(l => [l.id, l]));
    return [`${team.name} (${games(views.length)}, newest first)`,
      ...views.map(view => {
        const s = shots.get(view.id);
        return `  ${resultLine(view)}${s ? `, shots ${s.shotsFor}-${s.shotsAgainst}` : ''}`;
      })].join('\n');
  };
  return [block(data.away), '', block(data.home)].join('\n');
}

function skaterRow(player) {
  return `    ${player.name} (${player.positionCode}): ${player.goals} G, ${player.assists} A, ${player.points} P in ${games(player.gamesPlayed)}, ${player.shots} shot${player.shots === 1 ? '' : 's'} on goal, ${minutes(player.avgTimeOnIcePerGame)} ice time/game`;
}
function lastSeasonSkaterRow(player) {
  return `    ${player.skaterFullName} (${player.positionCode}, ${player.teamAbbrevs}): ${player.goals} G, ${player.assists} A, ${player.points} P in ${games(player.gamesPlayed)}, ${player.ppPoints} power-play points, ${minutes(player.timeOnIcePerGame)} ice time/game`;
}

function skatersSection(data) {
  const block = team => {
    const lines = [`${team.name}`];
    const current = [...team.skaters].sort((a, b) => b.points - a.points || b.goals - a.goals).slice(0, 8);
    lines.push(current.length
      ? `  ${nhlSeasonLabel(data.seasonId)} scoring leaders:` : `  ${nhlSeasonLabel(data.seasonId)}: no games played yet`);
    lines.push(...current.map(skaterRow));
    const last = [...team.lastSeasonSkaters].sort((a, b) => b.points - a.points).slice(0, 8);
    if (last.length) {
      lines.push(`  ${nhlSeasonLabel(data.prevSeasonId)} lines for players on tonight's roster (club shown is where he played):`);
      lines.push(...last.map(lastSeasonSkaterRow));
    }
    return lines.join('\n');
  };
  return [block(data.away), '', block(data.home)].join('\n');
}

function rostersSection(data) {
  const block = team => {
    if (!team.roster) return `${team.name}: roster unavailable`;
    const names = list => list.map(player => player.name).join(', ') || 'none listed';
    return [`${team.name}`, `  Forwards: ${names(team.roster.forwards)}`, `  Defensemen: ${names(team.roster.defensemen)}`,
      `  Goalies: ${names(team.roster.goalies)}`].join('\n');
  };
  return [block(data.away), '', block(data.home)].join('\n');
}

/** Games a listed player has sat out, counted from the club's recent lineups. */
function absenceCount(team, playerName) {
  // The two feeds spell accented names differently; compare them folded.
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const rosterPlayer = team.roster && [...team.roster.forwards, ...team.roster.defensemen, ...team.roster.goalies]
    .find(player => fold(player.name) === fold(playerName));
  const lineups = team.lineups.filter(lineup => lineup.available);
  if (!rosterPlayer || !lineups.length) return null;
  let missed = 0;
  for (const lineup of lineups) {
    if (lineup.dressedIds.has(rosterPlayer.id)) return { missed, of: lineups.length, lastPlayed: lineup.date };
    missed += 1;
  }
  return { missed, of: lineups.length, lastPlayed: null };
}

function injuriesSection(data) {
  const block = team => {
    if (team.injuries === null) return `${team.name}: injury list unavailable`;
    if (!team.injuries.length) return `${team.name}: no players listed`;
    return [`${team.name}`, ...team.injuries.map(row => {
      const absence = absenceCount(team, row.player);
      const bits = [`${row.player}${row.position ? ` (${row.position})` : ''}: ${row.status || 'listed'}`];
      if (row.detail) bits.push(row.detail);
      if (row.updatedAt) bits.push(`listing updated ${shortDate(row.updatedAt.slice(0, 10))}`);
      if (row.returnDate) bits.push(`listed return ${shortDate(row.returnDate)}`);
      if (absence) {
        bits.push(absence.lastPlayed
          ? `last dressed ${shortDate(absence.lastPlayed)}, missed ${games(absence.missed)} since`
          : `did not dress in the club's last ${games(absence.of)}`);
      }
      return `  ${bits.join('; ')}${row.comment ? `\n    ${row.comment}` : ''}`;
    })].join('\n');
  };
  return [block(data.away), '', block(data.home)].join('\n');
}

function meetingsSection(data) {
  const lines = [];
  const current = data.home.meetings;
  lines.push(current.length
    ? `${nhlSeasonLabel(data.seasonId)} (${data.home.name} view): ${current.map(resultLine).join(' | ')}`
    : `${nhlSeasonLabel(data.seasonId)}: no meetings yet`);
  const last = data.home.lastSeasonMeetings;
  if (last.length) lines.push(`${nhlSeasonLabel(data.prevSeasonId)} (${data.home.name} view): ${last.map(resultLine).join(' | ')}`);
  return lines.join('\n');
}

async function reportingSection(game, data) {
  const when = new Date(game.commence_time).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const query = `NHL, ${when}: ${data.away.name} at ${data.home.name}. Find reporting on this game: `
    + `(1) each team's confirmed or expected starting goalie tonight and who reported it; `
    + `(2) each team's lineup news: scratches, injuries, returns, call-ups and line changes; `
    + `(3) anything else reported about this specific game, such as travel or schedule. `
    + 'Give player names, each report\'s publication date and time, and its source. Report facts only: no predictions, picks or betting opinions.';
  try {
    const result = await groundedWebSearch(query, { freshnessHours: 24 });
    const text = result?.success ? String(result.data || '').trim() : '';
    return text || null;
  } catch (error) {
    console.warn(`[NHL Desk] Reporting search unavailable: ${error.message}`);
    return null;
  }
}

/** Card rows for the app's Tale of the Tape. Tokens match the app's NHL fields. */
function buildNhlTape(data) {
  const row = (name, token, pick) => ({ name, token,
    home: { team: data.home.name, value: pick(data.home) }, away: { team: data.away.name, value: pick(data.away) } });
  const shown = (v, format) => (Number.isFinite(Number(v)) ? format(Number(v)) : 'N/A');
  const hasValue = r => r.home.value !== 'N/A' || r.away.value !== 'N/A';
  const statRows = (suffix, source) => {
    const stat = pick => team => { const summary = source(team); return summary ? pick(summary) : 'N/A'; };
    return [
      row(`Goals For / Game${suffix}`, 'GOALS_FOR_GM', stat(s => shown(s.goalsForPerGame, v => v.toFixed(2)))),
      row(`Goals Against / Game${suffix}`, 'GOALS_AGST_GM', stat(s => shown(s.goalsAgainstPerGame, v => v.toFixed(2)))),
      row(`Shots For / Game${suffix}`, 'SHOTS_FOR_GM', stat(s => shown(s.shotsForPerGame, v => v.toFixed(1)))),
      row(`Shots Against / Game${suffix}`, 'SHOTS_AGAINST', stat(s => shown(s.shotsAgainstPerGame, v => v.toFixed(1)))),
      row(`Power Play${suffix}`, 'PP_PCT', stat(s => shown(s.powerPlayPct, v => `${(v * 100).toFixed(1)}%`))),
      row(`Penalty Kill${suffix}`, 'PK_PCT', stat(s => shown(s.penaltyKillPct, v => `${(v * 100).toFixed(1)}%`))),
      row(`Faceoffs${suffix}`, 'FO_PCT', stat(s => shown(s.faceoffWinPct, v => `${(v * 100).toFixed(1)}%`))),
    ];
  };
  const records = [
    row('Record', 'RECORD', team => (team.standing ? record(team.standing) : 'N/A')),
    row('Last 10', 'L10_RECORD', team => (team.standing?.last10.games ? record(team.standing.last10) : 'N/A')),
    row('Home / Road', 'HOME_AWAY', team => (team.standing
      ? record(team.rest.isHomeTonight ? team.standing.home : team.standing.road) : 'N/A')),
  ];
  // Before either club has played, the card carries last season's numbers, named as such.
  const current = statRows('', team => (team.summary?.gamesPlayed > 0 ? team.summary : null));
  const stats = current.some(hasValue) ? current
    : statRows(` · ${nhlSeasonLabel(data.prevSeasonId)}`, team => team.lastSeasonSummary);
  return { rows: [...records, ...stats].filter(hasValue) };
}

const injuriesForStorage = data => {
  const list = team => (team.injuries || []).map(row => ({
    name: row.player, status: row.status || 'Listed', description: [row.detail, row.comment].filter(Boolean).join('. ') || null,
  }));
  return { home: list(data.home), away: list(data.away) };
};

export async function buildNhlScoutReport(game, options = {}) {
  const sportKey = 'NHL';
  const data = await loadNhlGameData(game);
  const reporting = options.skipReporting ? null : await reportingSection(game, data);
  const playoff = game.postseason ? 'Stanley Cup Playoffs' : null;
  const missing = [...data.missing, ...data.away.missing.map(m => `${data.away.name} ${m}`), ...data.home.missing.map(m => `${data.home.name} ${m}`)];

  const text = `
${HEAVY}
MATCHUP: ${data.away.name} @ ${data.home.name}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
${game.venue ? `Venue: ${game.venue}` : ''}${playoff ? `\n${playoff}` : ''}
${HEAVY}

STANDINGS & RECORDS
${RULE}
${standingsSection(data)}

GOALIES
${RULE}
${goaliesSection(data)}

TEAM NUMBERS
${RULE}
${teamTables(data)}

RECENT GAMES
${RULE}
${recentSection(data)}

REST & SCHEDULE
${RULE}
${restSection(data)}

SKATERS
${RULE}
${skatersSection(data)}

CURRENT ROSTERS
${RULE}
${rostersSection(data)}

INJURY REPORT
${RULE}
${injuriesSection(data)}

HEAD-TO-HEAD
${RULE}
${meetingsSection(data)}
${reporting ? `
REPORTING (searched ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET)
${RULE}
${reporting}
` : `
REPORTING
${RULE}
No current reporting was retrieved for this game. Starting goalies are unconfirmed.
`}${missing.length ? `
NOT AVAILABLE TONIGHT
${RULE}
${missing.join('; ')}
` : ''}
BETTING CONTEXT
${RULE}
${formatOdds(game, sportKey)}
`.trim();

  return {
    text,
    tokenMenu: formatTokenMenu(sportKey),
    injuries: injuriesForStorage(data),
    verifiedTaleOfTape: buildNhlTape(data),
    homeRecord: data.home.standing ? record(data.home.standing) : null,
    awayRecord: data.away.standing ? record(data.away.standing) : null,
    venue: game.venue || null,
    isNeutralSite: game.isNeutralSite || false,
    tournamentContext: playoff,
    gameSignificance: game.gameSignificance || null,
    cfpRound: null, homeSeed: null, awaySeed: null, homeConference: null, awayConference: null,
  };
}
