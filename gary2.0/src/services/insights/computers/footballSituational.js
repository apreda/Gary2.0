// Grounded football situational lane — where each side actually stands.
//
// NFL contract: BDL /nfl/v1/standings for the exact current season:
// records, home/road splits, streaks, points for/against. Through August the
// standings ARE the preseason ledger, and every sentence says so — a 1-0
// August is never dressed up as regular-season form. In season the same lane
// becomes the real standings read: records, streak, division context.
//
// NCAAF contract (Aug 20): college has no BDL standings feed — its
// situational truth is the AP POLL. /ncaaf/v1/rankings for the current
// season leads; when the current season has no poll yet (Week 0 window),
// the PRIOR season's final poll rides instead and every sentence says
// "finished last season ranked" — a 2025 ranking is never dressed up as a
// current one. Unranked-vs-unranked games get no row (absence stays absent).

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';

function isPreseason(dateStr) {
  const month = Number(String(dateStr || '').slice(5, 7));
  return month === 8; // August: the season has cut over but real football hasn't.
}

function streakText(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return null;
  return v > 0 ? `won ${v} straight` : `lost ${Math.abs(v)} straight`;
}

function sideFacts(entry, label) {
  if (!entry) return null;
  const bits = [`${label} is ${entry.overall_record || `${entry.wins}-${entry.losses}`}`];
  const diff = Number(entry.point_differential);
  if (Number.isFinite(diff) && (Number(entry.wins) + Number(entry.losses)) > 0) {
    bits.push(`${diff >= 0 ? '+' : ''}${diff} points on the year`);
  }
  const streak = streakText(entry.win_streak);
  if (streak) bits.push(`has ${streak}`);
  return bits.join(', ');
}

/**
 * One row per slate game once either side has played a game: both records,
 * the differential gap, streaks, and (in season) the division stakes.
 */
export async function computeFootballSituational(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league === 'ncaaf') return computeNcaafRankings(ctx);
  if (league !== 'nfl') return [];

  let standings = [];
  try {
    standings = (await bdl.getNflStandings(season)) || [];
  } catch (err) {
    console.warn(`[footballSituational] standings fetch failed: ${err?.message || err}`);
    return [];
  }
  const byTeam = new Map(standings.map((s) => [String(s?.team?.id), s]).filter(([k]) => k !== 'undefined'));
  const pre = isPreseason(date);

  const rows = [];
  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id) continue;
    const awayStanding = byTeam.get(String(awayTeam.id));
    const homeStanding = byTeam.get(String(homeTeam.id));
    if (!awayStanding || !homeStanding) continue;
    const gamesPlayed = (s) => Number(s.wins || 0) + Number(s.losses || 0) + Number(s.ties || 0);
    if (gamesPlayed(awayStanding) < 1 && gamesPlayed(homeStanding) < 1) continue;

    const awayAbbr = awayTeam.abbreviation || awayTeam.name;
    const homeAbbr = homeTeam.abbreviation || homeTeam.name;
    const scope = pre ? 'in the preseason' : 'this season';

    const divisionGame = !pre
      && awayStanding?.team?.conference === homeStanding?.team?.conference
      && awayStanding?.team?.division === homeStanding?.team?.division;

    const facts = [sideFacts(awayStanding, awayAbbr), sideFacts(homeStanding, homeAbbr)]
      .filter(Boolean)
      .map((f) => `${f} ${scope}`);
    if (!facts.length) continue;

    const homeSplit = homeStanding.home_record ? `${homeAbbr} is ${homeStanding.home_record} at home` : null;
    const roadSplit = awayStanding.road_record ? `${awayAbbr} is ${awayStanding.road_record} on the road` : null;
    const splits = [roadSplit, homeSplit].filter(Boolean).join('; ');

    const diffGap = Number(homeStanding.point_differential) - Number(awayStanding.point_differential);

    rows.push(makeRow({
      category: 'situational',
      headline: `${awayAbbr} (${awayStanding.overall_record}) at ${homeAbbr} (${homeStanding.overall_record})${divisionGame ? ' — a division game' : ''}`,
      detail: `${facts.join('. ')}.${splits ? ` ${splits}.` : ''}${divisionGame ? ` Both live in the ${homeStanding.team.conference} ${homeStanding.team.division}.` : ''}`,
      game: helpers.gameLabel(game),
      value: Number.isFinite(diffGap) && diffGap !== 0
        ? `${diffGap > 0 ? '+' : ''}${diffGap} PT GAP`
        : (pre ? 'PRESEASON' : 'RECORDS'),
      tone: TONES.NEUTRAL,
      relevance_score: Math.min(84, 46 + Math.min(24, Math.abs(Number.isFinite(diffGap) ? diffGap : 0)) + (divisionGame ? 8 : 0)),
      team_id: homeTeam.id,
      game_id: game.id,
      meta: {
        source: 'balldontlie_standings',
        season,
        preseason: pre,
        away: { team_id: awayTeam.id, record: awayStanding.overall_record, streak: awayStanding.win_streak, diff: awayStanding.point_differential },
        home: { team_id: homeTeam.id, record: homeStanding.overall_record, streak: homeStanding.win_streak, diff: homeStanding.point_differential },
        division_game: divisionGame,
        through: date,
      },
    }));
  }

  await attachLaneReads('footballSituational', rows, detailFact, {
    ask: 'what these records and streaks say about the spot itself — who arrives with momentum, what the home and road splits add, and where a record can flatter or undersell a team',
  });

  console.log(`[footballSituational] NFL ${date}: ${rows.length} row(s)${pre ? ' (preseason ledger)' : ''}`);
  return rows;
}

/**
 * NCAAF: the AP poll as the situational lane. One row per slate game with at
 * least one ranked side. Verified payload shape (probed live Aug 20):
 * { team: {id, college, name, full_name, abbreviation}, season, week, rank,
 *   first_place_votes, points, trend, record }.
 */
async function computeNcaafRankings(ctx) {
  const { games, season, bdl, helpers, date } = ctx;

  let poll = [];
  let pollSeason = season;
  try {
    poll = (await bdl.getNcaafRankings(season)) || [];
    if (!poll.length && isPreseason(date)) {
      // Week-0 window before the current-season poll posts: the prior
      // season's FINAL poll, always worded as last season's finish.
      pollSeason = season - 1;
      poll = (await bdl.getNcaafRankings(pollSeason)) || [];
    }
  } catch (err) {
    console.warn(`[footballSituational] NCAAF rankings fetch failed: ${err?.message || err}`);
    return [];
  }
  if (!poll.length) {
    console.log(`[footballSituational] NCAAF ${date}: no poll rows for ${season}${isPreseason(date) ? ` or ${season - 1}` : ''}.`);
    return [];
  }

  const isPriorPoll = pollSeason !== season;
  const byTeam = new Map(poll.map((r) => [String(r?.team?.id), r]).filter(([k]) => k !== 'undefined'));
  const pollWeek = poll[0]?.week;

  const teamLabel = (t) => t?.college || t?.full_name || t?.name || t?.abbreviation || 'the team';
  const rankedBit = (r, t) => {
    if (!r) return `${teamLabel(t)} is unranked`;
    const votes = Number(r.first_place_votes);
    const fp = Number.isFinite(votes) && votes > 0 ? `, ${votes} first-place vote${votes === 1 ? '' : 's'}` : '';
    const rec = r.record ? ` at ${r.record}` : '';
    return isPriorPoll
      ? `${teamLabel(t)} finished last season ranked No. ${r.rank}${rec} (${r.points} poll points${fp})`
      : `${teamLabel(t)} is No. ${r.rank} in the AP poll${rec} (${r.points} points${fp}${r.trend ? `, trend ${r.trend}` : ''})`;
  };

  const rows = [];
  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id) continue;
    const awayRank = byTeam.get(String(awayTeam.id));
    const homeRank = byTeam.get(String(homeTeam.id));
    if (!awayRank && !homeRank) continue; // unranked matchup: no row, honestly

    const tag = (r, t) => (r ? `No. ${r.rank} ${teamLabel(t)}` : teamLabel(t));
    const bothRanked = Boolean(awayRank && homeRank);
    const bestRank = Math.min(awayRank?.rank ?? 99, homeRank?.rank ?? 99);

    rows.push(makeRow({
      category: 'situational',
      headline: `${tag(awayRank, awayTeam)} at ${tag(homeRank, homeTeam)}${isPriorPoll ? ' — last season’s final poll' : ''}`,
      detail: `${[rankedBit(awayRank, awayTeam), rankedBit(homeRank, homeTeam)].join('. ')}.`,
      game: helpers.gameLabel(game),
      value: bothRanked
        ? `#${awayRank.rank} VS #${homeRank.rank}`
        : `#${(awayRank || homeRank).rank} AP`,
      tone: TONES.NEUTRAL,
      relevance_score: Math.min(88, 50 + (bothRanked ? 20 : 0) + Math.max(0, 15 - bestRank)),
      team_id: homeTeam.id,
      game_id: game.id,
      meta: {
        source: 'balldontlie_ncaaf_rankings',
        poll_season: pollSeason,
        poll_week: pollWeek,
        prior_season_poll: isPriorPoll,
        away: awayRank ? { team_id: awayTeam.id, rank: awayRank.rank, points: awayRank.points, record: awayRank.record } : null,
        home: homeRank ? { team_id: homeTeam.id, rank: homeRank.rank, points: homeRank.points, record: homeRank.record } : null,
        through: date,
      },
    }));
  }

  await attachLaneReads('footballSituational', rows, detailFact, {
    ask: 'what the poll standing means for the spot — the respect gap between the sides, whether a ranking looks earned or inherited, and what a ranked side has to lose here',
  });

  console.log(`[footballSituational] NCAAF ${date}: ${rows.length} ranking row(s)${isPriorPoll ? ' (prior-season final poll)' : ''}`);
  return rows;
}

export default { computeFootballSituational };
