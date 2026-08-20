// Grounded NFL situational lane — where each side actually stands.
//
// Source contract: BDL /nfl/v1/standings for the exact current season:
// records, home/road splits, streaks, points for/against. Through August the
// standings ARE the preseason ledger, and every sentence says so — a 1-0
// August is never dressed up as regular-season form. In season the same lane
// becomes the real standings read: records, streak, division context.
// NFL-only: the standings feed is an NFL endpoint.

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

export default { computeFootballSituational };
