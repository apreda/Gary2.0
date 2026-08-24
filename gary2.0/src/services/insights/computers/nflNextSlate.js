// Grounded next-slate context for an NFL dark day (Aug 24 2026).
//
// Parity order (founder): the Hub's football pages share one format — NCAAF
// dark days carried the NEXT SLATE card while NFL dark days fell to a bare
// morning notice. Same contract as computers/ncaafNextSlate.js minus the FBS
// identity classification (every BDL NFL game is an NFL game): discover the
// next ET slate date inside a 21-day window through the shared NFL kickoff
// policy, and never manufacture an hour a provider didn't state.

import {
  NFL_KICKOFF_STATUS,
  nflSlateDateForKickoff,
  resolveNflKickoff,
} from '../../nflGamePolicy.js';
import { makeRow, shiftDateStr, TONES } from '../shared.js';

const SPORT_KEY = 'americanfootball_nfl';
export const NFL_NEXT_SLATE_WINDOW_DAYS = 21;

function dateWindow(date) {
  const end = shiftDateStr(date, NFL_NEXT_SLATE_WINDOW_DAYS);
  if (!end) return null;
  const dates = [];
  // +22 is the UTC spillover for a late ET kickoff on the 21st target day.
  for (let offset = 1; offset <= NFL_NEXT_SLATE_WINDOW_DAYS + 1; offset += 1) {
    dates.push(shiftDateStr(date, offset));
  }
  return { start: dates[0], end, dates };
}

function gameIdentity(game) {
  const id = game?.id ?? game?.game_id;
  return id == null || id === '' ? null : String(id);
}

function slateDateLabel(date) {
  const instant = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(instant.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(instant).toUpperCase();
}

function detailForCounts(gameCount, confirmedCount, timeTbdCount) {
  const noun = gameCount === 1 ? 'game' : 'games';
  const prefix = `BDL lists ${gameCount} NFL ${noun} on the next slate.`;
  if (timeTbdCount === gameCount) {
    return `${prefix} Every kickoff is date-only, so all times remain TBD.`;
  }
  if (timeTbdCount > 0) {
    const verb = timeTbdCount === 1 ? 'remains' : 'remain';
    return `${prefix} ${confirmedCount} have confirmed kickoff times; ${timeTbdCount} ${verb} TIME TBD.`;
  }
  return confirmedCount === 1
    ? `${prefix} Its kickoff time is confirmed.`
    : `${prefix} All ${confirmedCount} kickoff times are confirmed.`;
}

/** Build the single persisted context row after provider validation. */
export function buildNflNextSlateRow({ date, scheduledDate, games }) {
  const kickoffRows = (Array.isArray(games) ? games : []).map((game) => ({
    game,
    kickoff: resolveNflKickoff(game),
    slateDate: nflSlateDateForKickoff(game),
  }));
  if (!scheduledDate || kickoffRows.length === 0) return null;
  if (kickoffRows.some(({ slateDate }) => slateDate !== scheduledDate)) return null;

  const confirmed = kickoffRows
    .filter(({ kickoff }) => kickoff.status === NFL_KICKOFF_STATUS.CONFIRMED && kickoff.iso)
    .map(({ kickoff }) => kickoff.iso)
    .sort();
  const timeTbdCount = kickoffRows.filter(
    ({ kickoff }) => kickoff.status === NFL_KICKOFF_STATUS.DATE_ONLY,
  ).length;
  const gameCount = kickoffRows.length;
  const meta = {
    kind: 'next_slate',
    source: 'balldontlie_games',
    league: 'NFL',
    date,
    scheduled_date: scheduledDate,
    game_count: gameCount,
    confirmed_count: confirmed.length,
    time_tbd_count: timeTbdCount,
    discovery_window_days: NFL_NEXT_SLATE_WINDOW_DAYS,
    grade: 'context',
  };
  if (confirmed[0]) meta.first_confirmed_kickoff = confirmed[0];

  return makeRow({
    category: 'next_slate',
    headline: `Next NFL slate · ${slateDateLabel(scheduledDate)}`,
    detail: detailForCounts(gameCount, confirmed.length, timeTbdCount),
    game: 'NFL',
    value: `${gameCount} ${gameCount === 1 ? 'GAME' : 'GAMES'}`,
    tone: TONES.NEUTRAL,
    relevance_score: 72,
    meta,
  });
}

/**
 * Discover the next NFL slate date after an honest empty NFL day. Provider
 * errors are deliberately allowed to throw so automation cannot misreport a
 * source outage as an empty future schedule.
 */
export async function computeNflNextSlate(ctx) {
  if (String(ctx?.league || '').toLowerCase() !== 'nfl') return [];
  if (Array.isArray(ctx?.games) && ctx.games.length > 0) return [];
  if (!ctx?.bdl || typeof ctx.bdl.getGames !== 'function') {
    throw new Error('NFL next-slate provider is unavailable');
  }

  const window = dateWindow(ctx.date);
  if (!window || window.dates.some((date) => !date)) {
    throw new Error('NFL next-slate discovery requires a valid YYYY-MM-DD date');
  }

  const raw = await ctx.bdl.getGames(
    SPORT_KEY,
    { dates: window.dates, per_page: 100 },
  );
  if (!Array.isArray(raw)) {
    throw new Error('NFL next-slate provider returned a non-array games payload');
  }
  if (raw.length === 0) return [];

  const candidatesById = new Map();
  for (const game of raw) {
    const id = gameIdentity(game);
    if (!id) throw new Error('NFL next-slate provider returned a game without an id');
    const kickoff = resolveNflKickoff(game);
    if (!kickoff.scheduledDate) {
      throw new Error(`NFL next-slate game ${id} has no provider-grounded scheduled date`);
    }
    const slateDate = nflSlateDateForKickoff(game);
    if (!slateDate) {
      throw new Error(`NFL next-slate game ${id} has no canonical slate date`);
    }
    if (slateDate < window.start || slateDate > window.end) continue;

    const prior = candidatesById.get(id);
    const incomingConfirmed = kickoff.status === NFL_KICKOFF_STATUS.CONFIRMED;
    const priorConfirmed = prior?.kickoff?.status === NFL_KICKOFF_STATUS.CONFIRMED;
    if (prior && prior.slateDate !== slateDate && priorConfirmed === incomingConfirmed) {
      throw new Error(`NFL next-slate game ${id} has conflicting slate dates`);
    }
    if (!prior || (!priorConfirmed && incomingConfirmed)) {
      candidatesById.set(id, { game, kickoff, slateDate });
    }
  }
  if (candidatesById.size === 0) return [];

  const scheduledDate = [...new Set(
    [...candidatesById.values()].map(({ slateDate }) => slateDate),
  )].sort()[0];
  const games = [...candidatesById.values()]
    .filter(({ slateDate }) => slateDate === scheduledDate)
    .map(({ game }) => game);
  if (!scheduledDate || games.length === 0) return [];

  const row = buildNflNextSlateRow({ date: ctx.date, scheduledDate, games });
  if (!row) throw new Error('NFL next-slate could not build a truthful slate row');
  return [row];
}

export default { buildNflNextSlateRow, computeNflNextSlate };
