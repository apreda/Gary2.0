// THE COLLEGE STANDINGS LANE — the NFL page's record rows, for college
// (NCAAF Picks page parity, founder Sep 3-4 2026).
//
// Source contract: BDL /ncaaf/v1/standings answers ONE conference per call, so
// this lane reads the slate's conferences one at a time and joins each side to
// its own conference table. Every printed record — wins, losses, home,
// away, conference — is the row's own field. A side missing from its table
// drops its facts; nothing is estimated. No streak row: the college standings
// row carries no streak, and counting one off the game index costs a fetch
// per team under BDL's three-a-minute gate.
//
// NCAAF-owned: this file never reads an NFL feed (league isolation law).

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';

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

function conferenceLabel(row, team) {
  return row?.conference?.abbreviation || row?.conference?.name || team?.conference_name || null;
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

/**
 * Site split and conference-game rows for every slate game whose sides both
 * appear in their conference tables.
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

  for (const game of slate) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    if (!awayTeam?.id || !homeTeam?.id) continue;
    const awayRow = byTeam.get(String(awayTeam.id));
    const homeRow = byTeam.get(String(homeTeam.id));
    // Both sides or nothing — a one-sided record is a guess about the other.
    if (!awayRow || !homeRow) continue;

    const away = { team: awayTeam, row: awayRow };
    const home = { team: homeTeam, row: homeRow };
    const shared = { game, helpers, season, through };

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
