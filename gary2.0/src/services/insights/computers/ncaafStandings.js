// THE COLLEGE STANDINGS LANE — the NFL page's form and record rows, for
// college (NCAAF Picks page parity, founder Sep 3-4 2026).
//
// Source contract: BDL /ncaaf/v1/standings answers ONE conference per call, so
// this lane reads the slate's conferences one at a time and joins each side to
// its own conference table. Every printed record — wins, losses, home,
// away, conference — is the row's own field. The streak is counted off the
// team's final games in the provider game index, newest first. A side missing
// from its table drops its facts; nothing is estimated.
//
// NCAAF-owned: this file never reads an NFL feed (league isolation law).

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import { toTeamResults } from '../../agentic/tools/statRouters/footballTeamGames.js';

const SPORT_KEY = 'americanfootball_ncaaf';
/** A streak has to be real form, not a coin flip — three games either way. */
const MIN_STREAK = 3;
/** Split records only speak once both teams have played enough at that site. */
const MIN_SITE_GAMES = 3;
/** Under a fifth of a win, a site split is noise dressed as a trend. */
const MIN_SITE_GAP = 0.2;

function teamName(team) {
  return team?.abbreviation || team?.college || team?.name || team?.full_name || 'TEAM';
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "6-3" -> { wins, losses, games, text }; anything else -> null. */
function parseRecord(value) {
  const match = String(value ?? '').trim().match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const ties = match[3] ? Number(match[3]) : 0;
  const games = wins + losses + ties;
  return games > 0 ? { wins, losses, ties, games, text: String(value).trim() } : null;
}

function winPct(record) {
  return record ? (record.wins + record.ties * 0.5) / record.games : null;
}

function sampleWord(n) {
  return `${n} game${n === 1 ? '' : 's'}`;
}

function overallRecord(row) {
  const wins = finite(row?.wins);
  const losses = finite(row?.losses);
  if (wins == null || losses == null) return null;
  return `${wins}-${losses}`;
}

function conferenceLabel(row, team) {
  return row?.conference?.abbreviation || row?.conference?.name || team?.conference_name || null;
}

/** Consecutive wins (+) or losses (-) off the team's finals, newest first. */
function currentStreak(results) {
  if (!results.length) return 0;
  const won = results[0].won;
  let n = 0;
  for (const r of results) {
    if (r.won !== won) break;
    n += 1;
  }
  return won ? n : -n;
}

function streakRow({ side, opponent, game, helpers, season, through }) {
  const streak = side.streak;
  if (!Number.isFinite(streak) || Math.abs(streak) < MIN_STREAK) return null;
  const won = streak > 0;
  const length = Math.abs(streak);
  const overall = overallRecord(side.row);
  const name = teamName(side.team);

  return makeRow({
    category: 'streak',
    headline: won ? `${name} has won ${length} straight` : `${name} has lost ${length} straight`,
    detail:
      `${name} carries a ${length}-game ${won ? 'winning' : 'losing'} streak into this one` +
      `${overall ? `, sitting at ${overall} on the season` : ''}. ` +
      `They face ${teamName(opponent.team)} in ${game ? helpers.gameLabel(game) : 'this matchup'}. ` +
      `${season} results through ${through}.`,
    game: helpers.gameLabel(game),
    value: `${won ? 'W' : 'L'}${length}`,
    tone: won ? TONES.HOT : TONES.COLD,
    relevance_score: Math.min(88, 56 + length * 5),
    // The football grader's contract: row.team_id names the side that held
    // the edge. A winning streak is that claim; a losing streak is context.
    ...(won ? { team_id: side.team?.id } : {}),
    game_id: game?.id,
    meta: {
      source: 'balldontlie_ncaaf_standings',
      league: 'NCAAF',
      season,
      through,
      metric: 'win_streak',
      team_id: side.team?.id,
      abbreviation: name,
      win_streak: streak,
      overall_record: overall,
    },
  });
}

/** The home team's home record against the visitor's road record. */
function siteRecordRow({ away, home, game, helpers, season, through }) {
  const homeRecord = parseRecord(home.row?.home_record);
  const awayRecord = parseRecord(away.row?.away_record);
  if (!homeRecord || !awayRecord) return null;
  if (homeRecord.games < MIN_SITE_GAMES || awayRecord.games < MIN_SITE_GAMES) return null;
  const homePct = winPct(homeRecord);
  const awayPct = winPct(awayRecord);
  const gap = Math.abs(homePct - awayPct);
  if (gap < MIN_SITE_GAP) return null;

  const homeLeads = homePct > awayPct;
  const leader = homeLeads ? home : away;

  return makeRow({
    category: 'team_record',
    headline: homeLeads
      ? `${teamName(home.team)} is ${homeRecord.text} at home; ${teamName(away.team)} is ${awayRecord.text} on the road`
      : `${teamName(away.team)} is ${awayRecord.text} on the road; ${teamName(home.team)} is ${homeRecord.text} at home`,
    detail:
      `The site split favours ${teamName(leader.team)}: ${teamName(home.team)} has played ${sampleWord(homeRecord.games)} ` +
      `at home this season and ${teamName(away.team)} ${sampleWord(awayRecord.games)} away from it. ` +
      `${season} standings through ${through}.`,
    game: helpers.gameLabel(game),
    value: homeLeads ? homeRecord.text : awayRecord.text,
    tone: TONES.EDGE,
    relevance_score: Math.min(84, Math.round(52 + gap * 60)),
    team_id: leader.team?.id,
    game_id: game?.id,
    meta: {
      source: 'balldontlie_ncaaf_standings',
      league: 'NCAAF',
      season,
      through,
      metric: 'site_record',
      home: { team_id: home.team?.id, abbreviation: teamName(home.team), home_record: homeRecord.text },
      away: { team_id: away.team?.id, abbreviation: teamName(away.team), road_record: awayRecord.text },
    },
  });
}

/**
 * A conference game gets its own fact. The two standings rows' conference
 * ids are the authority for whether this is one; `conference_record` is the
 * record inside it — no schedule inference.
 */
function conferenceRow({ away, home, game, helpers, season, through }) {
  const awayConf = away.row?.conference?.id ?? away.team?.conference;
  const homeConf = home.row?.conference?.id ?? home.team?.conference;
  if (awayConf == null || homeConf == null || String(awayConf) !== String(homeConf)) return null;
  const awayRecord = parseRecord(away.row?.conference_record);
  const homeRecord = parseRecord(home.row?.conference_record);
  if (!awayRecord || !homeRecord) return null;
  const label = conferenceLabel(home.row, home.team) || conferenceLabel(away.row, away.team) || 'Conference';

  return makeRow({
    category: 'team_record',
    headline: `${label} game: ${teamName(away.team)} ${awayRecord.text}, ${teamName(home.team)} ${homeRecord.text} in conference`,
    detail:
      `These two share the ${label}. ${teamName(away.team)} is ${awayRecord.text} against it, ` +
      `${teamName(home.team)} is ${homeRecord.text}. ${season} standings through ${through}.`,
    game: helpers.gameLabel(game),
    value: 'CONFERENCE',
    tone: TONES.EDGE,
    relevance_score: 74,
    // Neutral context — naming either side as row.team_id would make the
    // grader read this as "that side held the edge". No side did.
    game_id: game?.id,
    meta: {
      source: 'balldontlie_ncaaf_standings',
      league: 'NCAAF',
      season,
      through,
      metric: 'conference_record',
      conference: label,
      away: { team_id: away.team?.id, abbreviation: teamName(away.team), conference_record: awayRecord.text },
      home: { team_id: home.team?.id, abbreviation: teamName(home.team), conference_record: homeRecord.text },
    },
  });
}

/** Every conference table the slate needs, one call each, indexed by team id. */
async function loadStandingsByTeam(bdl, season, games) {
  const conferenceIds = [...new Set(games.flatMap((g) => [
    (g?.away_team ?? g?.visitor_team)?.conference, g?.home_team?.conference,
  ]).filter((id) => id != null))];
  const byTeam = new Map();
  for (const conferenceId of conferenceIds) {
    let rows = [];
    try {
      rows = (await bdl.getNcaafStandings(season, conferenceId)) || [];
    } catch (err) {
      console.warn(`[ncaafStandings] conference ${conferenceId} standings failed: ${err?.message || err}`);
      continue;
    }
    for (const row of rows) {
      if (row?.team?.id != null) byTeam.set(String(row.team.id), row);
    }
  }
  return byTeam;
}

/** The team's finals this season, newest first (streak input). */
async function loadResults(bdl, teamId, season) {
  try {
    const games = await bdl.getGames(SPORT_KEY, { team_ids: [teamId], seasons: [season], per_page: 100 });
    return toTeamResults(games, teamId);
  } catch (err) {
    console.warn(`[ncaafStandings] game index for team ${teamId} failed: ${err?.message || err}`);
    return [];
  }
}

/**
 * Streak, site split, and conference-game rows for every slate game whose
 * sides both appear in their conference tables.
 */
export async function computeNcaafStandings(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league !== 'ncaaf') return [];
  if (!bdl || !Number.isInteger(Number(season)) || !(games || []).length) return [];

  const slate = (games || []).filter((g) => g?.id != null);
  const byTeam = await loadStandingsByTeam(bdl, season, slate);
  if (byTeam.size === 0) return [];

  const through = date;
  const rows = [];
  const resultsCache = new Map();
  const resultsFor = async (teamId) => {
    const key = String(teamId);
    if (!resultsCache.has(key)) resultsCache.set(key, await loadResults(bdl, teamId, season));
    return resultsCache.get(key);
  };

  for (const game of slate) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    if (!awayTeam?.id || !homeTeam?.id) continue;
    const awayRow = byTeam.get(String(awayTeam.id));
    const homeRow = byTeam.get(String(homeTeam.id));
    // Both sides or nothing — a one-sided record is a guess about the other.
    if (!awayRow || !homeRow) continue;

    const away = { team: awayTeam, row: awayRow, streak: currentStreak(await resultsFor(awayTeam.id)) };
    const home = { team: homeTeam, row: homeRow, streak: currentStreak(await resultsFor(homeTeam.id)) };
    const shared = { game, helpers, season, through };

    for (const [side, opponent] of [[away, home], [home, away]]) {
      const streak = streakRow({ side, opponent, ...shared });
      if (streak) rows.push(streak);
    }
    const site = siteRecordRow({ away, home, ...shared });
    if (site) rows.push(site);
    const conference = conferenceRow({ away, home, ...shared });
    if (conference) rows.push(conference);
  }

  await attachLaneReads('ncaafStandings', rows, detailFact, {
    ask: 'what this record actually says about how the team has been winning or losing, and what it sets up in this matchup',
  });

  console.log(`[ncaafStandings] NCAAF ${date}: ${byTeam.size} standings row(s) -> ${rows.length} row(s)`);
  return rows;
}

export default { computeNcaafStandings };
