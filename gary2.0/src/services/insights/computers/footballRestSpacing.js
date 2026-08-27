// Grounded football rest lane — how many days each side has had since its last
// completed game, from the provider game index alone.
//
// The football week makes spacing a real story: a Thursday team is playing on
// four days' rest, a post-bye team on ten or more. Every sentence here is a
// date subtraction on played finals — no fatigue score, no projection, and no
// conclusion about what the spacing means for the pick.
//
// August is skipped outright: preseason exhibitions are spaced by roster
// planning, not competition, and a "rest edge" built on them would be noise
// dressed as evidence. In season the lane emits only when the spacing is a
// story — a short week on either side, a bye just behind one of them, or a
// two-day-plus gap between the sides.

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import { footballDataInternals } from '../footballData.js';

const SPORT_KEY = Object.freeze({
  nfl: 'americanfootball_nfl',
  ncaaf: 'americanfootball_ncaaf',
});

const TEAM_CHUNK_SIZE = 4;
const SHORT_WEEK_MAX_DAYS = 5;   // Thursday after a weekend game
const LONG_REST_MIN_DAYS = 9;    // a bye (or more) behind them
const DIFF_MIN_DAYS = 2;         // asymmetry worth a row on its own

const { finalFootballGame } = footballDataInternals;

function etDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function daysBetween(fromDate, toDate) {
  const a = Date.parse(`${fromDate}T12:00:00Z`);
  const b = Date.parse(`${toDate}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

function sideName(team) {
  return team?.abbreviation || team?.college || team?.name || team?.full_name || null;
}

function restPhrase(days) {
  if (days == null) return null;
  if (days <= SHORT_WEEK_MAX_DAYS) return `a short week (${days} days since its last game)`;
  if (days >= LONG_REST_MIN_DAYS) return `${days} days of rest — a bye behind it`;
  return `${days} days since its last game`;
}

/**
 * One row per slate game where the spacing itself is the story. Emits nothing
 * in August (preseason) and nothing for a team's first game of the season.
 */
export async function computeFootballRestSpacing(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  const sportKey = SPORT_KEY[league];
  if (!sportKey || !Number.isInteger(Number(season))) return [];
  if (Number(String(date).slice(5, 7)) === 8) return [];   // preseason window

  const slate = (games || []).filter((g) => {
    const away = g?.away_team ?? g?.visitor_team;
    return g?.id != null && away?.id != null && g?.home_team?.id != null;
  });
  if (!slate.length) return [];

  const teamIds = [...new Set(slate.flatMap((g) => [
    (g.away_team ?? g.visitor_team).id,
    g.home_team.id,
  ]))];

  // Each team's most recent completed game before today, from the same index
  // the h2h lane reads. Chunked to stay inside the endpoint page.
  const lastGameByTeam = new Map();
  for (let i = 0; i < teamIds.length; i += TEAM_CHUNK_SIZE) {
    const group = teamIds.slice(i, i + TEAM_CHUNK_SIZE);
    let rows = [];
    try {
      rows = await bdl.getGames(
        sportKey,
        { team_ids: group, seasons: [Number(season)], per_page: 100 },
        6,
      );
    } catch (err) {
      console.warn(`[footballRestSpacing] ${league.toUpperCase()} index chunk omitted: ${err?.message || err}`);
      continue;
    }
    for (const g of Array.isArray(rows) ? rows : []) {
      if (!finalFootballGame(g)) continue;
      const day = etDate(g?.date ?? g?.datetime ?? g?.commence_time ?? g?.start_time_utc);
      if (!day || day >= String(date)) continue;
      for (const t of [g.away_team ?? g.visitor_team, g.home_team]) {
        const id = t?.id != null ? String(t.id) : null;
        if (!id || !group.some((x) => String(x) === id)) continue;
        const prior = lastGameByTeam.get(id);
        if (!prior || day > prior) lastGameByTeam.set(id, day);
      }
    }
  }
  if (!lastGameByTeam.size) return [];

  const rows = [];
  for (const game of slate) {
    const awayTeam = game.away_team ?? game.visitor_team;
    const homeTeam = game.home_team;
    const awayLast = lastGameByTeam.get(String(awayTeam.id)) || null;
    const homeLast = lastGameByTeam.get(String(homeTeam.id)) || null;
    const awayDays = awayLast ? daysBetween(awayLast, String(date)) : null;
    const homeDays = homeLast ? daysBetween(homeLast, String(date)) : null;
    if (awayDays == null || homeDays == null) continue;   // a first game has no spacing story

    const diff = Math.abs(awayDays - homeDays);
    const shortSide = Math.min(awayDays, homeDays) <= SHORT_WEEK_MAX_DAYS;
    const byeSide = Math.max(awayDays, homeDays) >= LONG_REST_MIN_DAYS;
    if (!shortSide && !byeSide && diff < DIFF_MIN_DAYS) continue;

    const awayName = sideName(awayTeam);
    const homeName = sideName(homeTeam);
    const facts = [
      `${awayName} comes in on ${restPhrase(awayDays)}`,
      `${homeName} on ${restPhrase(homeDays)}`,
    ];
    const gapLine = diff >= DIFF_MIN_DAYS
      ? ` That is a ${diff}-day spacing gap between the sides.`
      : '';

    const headline = diff >= DIFF_MIN_DAYS
      ? `${awayDays > homeDays ? awayName : homeName} has ${diff} more days of rest`
      : (shortSide
        ? `${awayDays <= homeDays ? awayName : homeName} is on a short week`
        : `${awayDays >= homeDays ? awayName : homeName} comes off a bye`);

    rows.push(makeRow({
      category: 'rest',
      headline,
      detail: `${facts.join('; ')}.${gapLine}`,
      game: helpers.gameLabel(game),
      value: `${awayDays}d vs ${homeDays}d`,
      tone: TONES.NEUTRAL,
      relevance_score: Math.min(80, 42 + diff * 6 + (shortSide ? 10 : 0) + (byeSide ? 6 : 0)),
      team_id: homeTeam.id,
      game_id: game.id,
      meta: {
        source: 'balldontlie_games',
        season,
        away: { team_id: awayTeam.id, last_game: awayLast, rest_days: awayDays },
        home: { team_id: homeTeam.id, last_game: homeLast, rest_days: homeDays },
        rest_gap_days: diff,
      },
    }));
  }

  await attachLaneReads('footballRestSpacing', rows, detailFact, {
    ask: 'what the calendar did to each side — who is coming off the short turnaround, who had the bye, and what a team typically has to manage in that spot',
  });

  console.log(`[footballRestSpacing] ${league.toUpperCase()} ${date}: ${rows.length} row(s)`);
  return rows;
}
