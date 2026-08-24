// Grounded next-slate context for an NCAAF dark day.
//
// BDL dates exact kickoff instants by their UTC provider date, while Gary's
// board is grouped by US Eastern calendar date. The discovery request includes
// one provider spillover day, then resolves every returned game through the
// shared NCAAF kickoff policy and keeps only the next 21 ET dates. Date-only
// provider values remain TIME TBD; this computer never manufactures an hour.

import {
  classifyNcaafFbsGames,
  NCAAF_KICKOFF_STATUS,
  ncaafSlateDateForKickoff,
  resolveNcaafKickoff,
} from '../../ncaafGamePolicy.js';
import { makeRow, shiftDateStr, TONES } from '../shared.js';

const SPORT_KEY = 'americanfootball_ncaaf';
export const NCAAF_NEXT_SLATE_WINDOW_DAYS = 21;

function dateWindow(date) {
  const end = shiftDateStr(date, NCAAF_NEXT_SLATE_WINDOW_DAYS);
  if (!end) return null;
  const dates = [];
  // +22 is the UTC spillover for a late ET kickoff on the 21st target day.
  for (let offset = 1; offset <= NCAAF_NEXT_SLATE_WINDOW_DAYS + 1; offset += 1) {
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
  const prefix = `BDL lists ${gameCount} verified FBS-vs-FBS ${noun} on the next college slate.`;
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
export function buildNcaafNextSlateRow({ date, scheduledDate, games }) {
  const kickoffRows = (Array.isArray(games) ? games : []).map((game) => ({
    game,
    kickoff: resolveNcaafKickoff(game),
    slateDate: ncaafSlateDateForKickoff(game),
  }));
  if (!scheduledDate || kickoffRows.length === 0) return null;
  if (kickoffRows.some(({ slateDate }) => slateDate !== scheduledDate)) return null;

  const confirmed = kickoffRows
    .filter(({ kickoff }) => kickoff.status === NCAAF_KICKOFF_STATUS.CONFIRMED && kickoff.iso)
    .map(({ kickoff }) => kickoff.iso)
    .sort();
  const timeTbdCount = kickoffRows.filter(
    ({ kickoff }) => kickoff.status === NCAAF_KICKOFF_STATUS.DATE_ONLY,
  ).length;
  const gameCount = kickoffRows.length;
  const meta = {
    kind: 'next_slate',
    source: 'balldontlie_games+teams',
    league: 'NCAAF',
    date,
    scheduled_date: scheduledDate,
    game_count: gameCount,
    confirmed_count: confirmed.length,
    time_tbd_count: timeTbdCount,
    discovery_window_days: NCAAF_NEXT_SLATE_WINDOW_DAYS,
    team_policy: 'verified_fbs_vs_fbs',
    grade: 'context',
  };
  if (confirmed[0]) meta.first_confirmed_kickoff = confirmed[0];

  return makeRow({
    category: 'next_slate',
    headline: `Next college slate · ${slateDateLabel(scheduledDate)}`,
    detail: detailForCounts(gameCount, confirmed.length, timeTbdCount),
    game: 'NCAAF',
    value: `${gameCount} ${gameCount === 1 ? 'GAME' : 'GAMES'}`,
    tone: TONES.NEUTRAL,
    relevance_score: 72,
    meta,
  });
}

/**
 * Discover the next verified FBS-vs-FBS date after an honest empty NCAAF day.
 * Provider errors and incomplete identity are deliberately allowed to throw so
 * automation cannot misreport a source outage as an empty future schedule.
 */
export async function computeNcaafNextSlate(ctx) {
  if (String(ctx?.league || '').toLowerCase() !== 'ncaaf') return [];
  if (Array.isArray(ctx?.games) && ctx.games.length > 0) return [];
  if (!ctx?.bdl || typeof ctx.bdl.getGames !== 'function') {
    throw new Error('NCAAF next-slate provider is unavailable');
  }

  const window = dateWindow(ctx.date);
  if (!window || window.dates.some((date) => !date)) {
    throw new Error('NCAAF next-slate discovery requires a valid YYYY-MM-DD date');
  }

  const raw = await ctx.bdl.getGames(
    SPORT_KEY,
    { dates: window.dates, per_page: 100 },
  );
  if (!Array.isArray(raw)) {
    throw new Error('NCAAF next-slate provider returned a non-array games payload');
  }
  if (raw.length === 0) return [];

  const candidatesById = new Map();
  for (const game of raw) {
    const id = gameIdentity(game);
    if (!id) throw new Error('NCAAF next-slate provider returned a game without an id');
    const kickoff = resolveNcaafKickoff(game);
    if (!kickoff.scheduledDate) {
      throw new Error(`NCAAF next-slate game ${id} has no provider-grounded scheduled date`);
    }
    const slateDate = ncaafSlateDateForKickoff(game);
    if (!slateDate) {
      throw new Error(`NCAAF next-slate game ${id} has no canonical slate date`);
    }
    if (slateDate < window.start || slateDate > window.end) continue;

    const prior = candidatesById.get(id);
    const incomingConfirmed = kickoff.status === NCAAF_KICKOFF_STATUS.CONFIRMED;
    const priorConfirmed = prior?.kickoff?.status === NCAAF_KICKOFF_STATUS.CONFIRMED;
    if (prior && prior.slateDate !== slateDate && priorConfirmed === incomingConfirmed) {
      throw new Error(`NCAAF next-slate game ${id} has conflicting slate dates`);
    }
    if (!prior || (!priorConfirmed && incomingConfirmed)) {
      candidatesById.set(id, { game, kickoff, slateDate });
    }
  }
  if (candidatesById.size === 0) return [];

  if (typeof ctx.bdl.getTeams !== 'function') {
    throw new Error('NCAAF next-slate provider team directory is unavailable');
  }
  const teams = await ctx.bdl.getTeams(SPORT_KEY);
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error('NCAAF next-slate provider team directory is unavailable');
  }

  const candidateDates = [...new Set(
    [...candidatesById.values()].map(({ slateDate }) => slateDate),
  )].sort();
  let scheduledDate = null;
  let games = [];
  for (const candidateDate of candidateDates) {
    // Classify one date at a time. Once the earliest verified FBS slate is
    // found, incomplete provider identity on a later weekend cannot suppress
    // it. Incomplete identity on this candidate date still fails closed: that
    // game could itself belong to the earliest FBS slate.
    const dateGames = [...candidatesById.values()]
      .filter(({ slateDate }) => slateDate === candidateDate)
      .map(({ game }) => game);
    const classified = classifyNcaafFbsGames(dateGames, teams);
    if (classified.unresolved.length > 0) {
      throw new Error(
        `NCAAF next-slate has ${classified.unresolved.length} game(s) on ${candidateDate} ` +
          'without provider-grounded FBS identity',
      );
    }
    if (classified.accepted.length === 0) continue;
    scheduledDate = candidateDate;
    games = classified.accepted;
    break;
  }
  if (!scheduledDate || games.length === 0) return [];

  const row = buildNcaafNextSlateRow({ date: ctx.date, scheduledDate, games });
  if (!row) throw new Error('NCAAF next-slate could not build a truthful slate row');
  return [row];
}

export default { buildNcaafNextSlateRow, computeNcaafNextSlate };
