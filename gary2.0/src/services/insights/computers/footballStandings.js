// Football form and record lanes, straight off the BDL standings row.
//
// Source contract: BDL /nfl/v1/standings for the exact current football season.
// Every field rendered here — win_streak, overall/home/road/division record,
// points_for, points_against, point_differential — is read verbatim off that
// row. Nothing is projected, ranked, or inferred; a team missing from the
// response simply drops its facts instead of being estimated.
//
// NCAAF is absent by design: its standings route requires a conference_id and
// returns one conference at a time, so a college slate has no single
// authoritative call to read. The lane no-ops rather than half-cover Saturday.

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';

/** A streak has to be real form, not a coin flip — three games either way. */
const MIN_STREAK = 3;
/** Split records only speak once both teams have played enough at that site. */
const MIN_SITE_GAMES = 3;

function teamName(team) {
  return team?.abbreviation || team?.name || team?.full_name || 'TEAM';
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "6-3" -> { wins: 6, losses: 3, games: 9 }; anything else -> null. */
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
  if (!record) return null;
  return (record.wins + record.ties * 0.5) / record.games;
}

function sampleWord(n) {
  return `${n} game${n === 1 ? '' : 's'}`;
}

function streakRow({ side, opponent, game, helpers, season, through }) {
  const streak = finite(side.row?.win_streak);
  if (streak == null || Math.abs(streak) < MIN_STREAK) return null;

  const won = streak > 0;
  const length = Math.abs(streak);
  const overall = parseRecord(side.row?.overall_record);
  const name = teamName(side.team);

  return makeRow({
    category: 'streak',
    headline: won
      ? `${name} has won ${length} straight`
      : `${name} has lost ${length} straight`,
    detail:
      `${name} carries a ${length}-game ${won ? 'winning' : 'losing'} streak into this one` +
      `${overall ? `, sitting at ${overall.text} on the season` : ''}. ` +
      `They face ${teamName(opponent.team)} in ${game ? helpers.gameLabel(game) : 'this matchup'}. ` +
      `Current-${season} standings through ${through}.`,
    game: helpers.gameLabel(game),
    value: `${won ? 'W' : 'L'}${length}`,
    tone: won ? TONES.HOT : TONES.COLD,
    // A longer run is a louder fact; six straight caps the scale.
    relevance_score: Math.min(88, 56 + length * 5),
    // The football grader's contract: row.team_id names the side that held
    // the EDGE, graded hit iff that side won. A winning streak is that claim;
    // a losing streak is a caution about the same team — attaching its id
    // would stamp "hit" when the cold team wins. Cold rows stay context.
    ...(won ? { team_id: side.team?.id } : {}),
    game_id: game?.id,
    meta: {
      source: 'balldontlie_standings',
      league: 'NFL',
      season,
      through,
      metric: 'win_streak',
      team_id: side.team?.id,
      abbreviation: name,
      win_streak: streak,
      overall_record: overall?.text ?? null,
    },
  });
}

/**
 * The site split: the home team's home record against the visitor's road
 * record. That is the comparison this game actually asks, and both halves come
 * off the same standings row.
 */
function siteRecordRow({ away, home, game, helpers, season, through }) {
  const homeRecord = parseRecord(home.row?.home_record);
  const awayRecord = parseRecord(away.row?.road_record);
  if (!homeRecord || !awayRecord) return null;
  if (homeRecord.games < MIN_SITE_GAMES || awayRecord.games < MIN_SITE_GAMES) return null;

  const homePct = winPct(homeRecord);
  const awayPct = winPct(awayRecord);
  if (homePct == null || awayPct == null) return null;
  const gap = Math.abs(homePct - awayPct);
  // Under a fifth of a win, the split is noise dressed as a trend.
  if (gap < 0.2) return null;

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
      `Current-${season} standings through ${through}.`,
    game: helpers.gameLabel(game),
    value: homeLeads ? homeRecord.text : awayRecord.text,
    tone: TONES.EDGE,
    relevance_score: Math.min(84, Math.round(52 + gap * 60)),
    team_id: leader.team?.id,
    game_id: game?.id,
    meta: {
      source: 'balldontlie_standings',
      league: 'NFL',
      season,
      through,
      metric: 'site_record',
      home: {
        team_id: home.team?.id,
        abbreviation: teamName(home.team),
        home_record: homeRecord.text,
      },
      away: {
        team_id: away.team?.id,
        abbreviation: teamName(away.team),
        road_record: awayRecord.text,
      },
    },
  });
}

/**
 * Division week gets its own fact. `division` on the standings team object is
 * the authority for whether this is one, and `division_record` is the record
 * inside it — no schedule inference.
 */
function divisionRow({ away, home, game, helpers, season, through }) {
  const awayDivision = away.team?.division;
  const homeDivision = home.team?.division;
  const awayConference = away.team?.conference;
  const homeConference = home.team?.conference;
  if (!awayDivision || !homeDivision) return null;
  if (awayDivision !== homeDivision || awayConference !== homeConference) return null;

  const awayRecord = parseRecord(away.row?.division_record);
  const homeRecord = parseRecord(home.row?.division_record);
  if (!awayRecord || !homeRecord) return null;

  const label = `${String(homeConference).toUpperCase()} ${String(homeDivision).toUpperCase()}`;

  return makeRow({
    category: 'team_record',
    headline: `${label} game: ${teamName(away.team)} ${awayRecord.text}, ${teamName(home.team)} ${homeRecord.text} in the division`,
    detail:
      `These two share the ${label}. ${teamName(away.team)} is ${awayRecord.text} against it, ` +
      `${teamName(home.team)} is ${homeRecord.text}. Current-${season} standings through ${through}.`,
    game: helpers.gameLabel(game),
    value: 'DIVISION',
    tone: TONES.EDGE,
    relevance_score: 74,
    // Neutral context — naming either side as row.team_id would make the
    // grader read this as "that side held the edge". No side did.
    game_id: game?.id,
    meta: {
      source: 'balldontlie_standings',
      league: 'NFL',
      season,
      through,
      metric: 'division_record',
      division: label,
      away: { team_id: away.team?.id, abbreviation: teamName(away.team), division_record: awayRecord.text },
      home: { team_id: home.team?.id, abbreviation: teamName(home.team), division_record: homeRecord.text },
    },
  });
}

export async function computeFootballStandings(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league !== 'nfl') return [];
  if (!bdl || !Number.isInteger(Number(season)) || !(games || []).length) return [];

  let standings = [];
  try {
    standings = await bdl.getStandingsGeneric('americanfootball_nfl', { season: Number(season) }, 30);
  } catch (err) {
    console.warn(`[footballStandings] NFL standings unavailable: ${err?.message || err}`);
    return [];
  }

  const byTeam = new Map();
  for (const row of Array.isArray(standings) ? standings : []) {
    const id = row?.team?.id;
    if (id == null) continue;
    if (Number(row?.season) !== Number(season)) continue;
    byTeam.set(String(id), row);
  }
  if (byTeam.size === 0) return [];

  const through = (() => {
    const d = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(d) ? new Date(d - 86400000).toISOString().slice(0, 10) : date;
  })();

  const rows = [];
  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id) continue;
    const awayRow = byTeam.get(String(awayTeam.id));
    const homeRow = byTeam.get(String(homeTeam.id));
    if (!awayRow || !homeRow) continue;

    // The standings team object carries division/conference; the slate's may not.
    const away = { team: { ...awayTeam, ...(awayRow.team || {}) }, row: awayRow };
    const home = { team: { ...homeTeam, ...(homeRow.team || {}) }, row: homeRow };
    const shared = { game, helpers, season, through };

    for (const built of [
      streakRow({ side: away, opponent: home, ...shared }),
      streakRow({ side: home, opponent: away, ...shared }),
      siteRecordRow({ away, home, ...shared }),
      divisionRow({ away, home, ...shared }),
    ]) {
      if (built) rows.push(built);
    }
  }

  await attachLaneReads('footballStandings', rows, detailFact, {
    ask: "what this run of form or split actually says about the team right now — whether the record was earned against real opponents, what it usually does to a team's approach, and where it stops being predictive",
  });

  console.log(`[footballStandings] NFL ${date}: ${byTeam.size} standings rows -> ${rows.length} row(s)`);
  return rows;
}

export default { computeFootballStandings };
