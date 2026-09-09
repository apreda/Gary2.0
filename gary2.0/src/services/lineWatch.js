/**
 * THE LINE WATCH (founder, Sep 9 2026): "capture open when lines drop, then
 * live capture the change."
 *
 * The odds service already records every board it sees, one row per book per
 * change (odds_snapshots), but football boards were fetched only on game day —
 * a Sunday line that dropped on Monday had no rungs between. This watch runs
 * inside the scheduler daemon and polls the week's NFL and NCAAF boards:
 *   · every 30 minutes through the week,
 *   · every 10 minutes inside the last three hours before a kickoff,
 *   · never 1-6 AM ET.
 * One BDL odds request per league per poll (the week's game ids come from a
 * slate list refreshed every six hours), so the ladder under the pick card and
 * the movers board in The Hub have real rungs. Display only: nothing here
 * reaches Gary's desk.
 */
import { ballDontLieService } from './ballDontLieService.js';
import { ballDontLieOddsService } from './ballDontLieOddsService.js';
import { recordOddsSnapshots } from './oddsSnapshots.js';
import { filterBlockedVendors } from './oddsService.js';
import { resolveNflKickoff } from './nflGamePolicy.js';
import { classifyNcaafFbsGames, resolveNcaafKickoff } from './ncaafGamePolicy.js';

export const LINE_WATCH_SPORTS = ['americanfootball_nfl', 'americanfootball_ncaaf'];
export const BASE_INTERVAL_MS = 30 * 60_000;
export const NEAR_KICKOFF_INTERVAL_MS = 10 * 60_000;
export const NEAR_KICKOFF_WINDOW_MS = 3 * 3600_000;
export const SLATE_TTL_MS = 6 * 3600_000;
export const WEEK_DAYS = 7;
// A game stays on the watch this long past its kickoff so the last pregame
// rung is recorded even when the poll lands a few minutes late.
const KICKOFF_GRACE_MS = 20 * 60_000;

const LABELS = { americanfootball_nfl: 'NFL', americanfootball_ncaaf: 'NCAAF' };
export const sportLabel = (sport) => LABELS[sport] || sport;

export function etHour(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(now));
  return Number.isFinite(h) ? h % 24 : 12;
}

/** 1-6 AM ET: the books are quiet and so is the watch. */
export function inQuietHours(now = new Date()) {
  const h = etHour(now);
  return h >= 1 && h < 6;
}

export function etDateStr(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

/** The next `days` ET dates starting today, as YYYY-MM-DD. */
export function weekDates(now = new Date(), days = WEEK_DAYS) {
  const start = etDateStr(now);
  const base = Date.parse(`${start}T00:00:00Z`);
  const out = [];
  for (let i = 0; i < days; i += 1) out.push(new Date(base + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/** Pure: is a poll due for a league, given when it last polled and its next kickoff? */
export function pollDue({ now = new Date(), lastPollAt = null, nextKickoffAt = null } = {}) {
  if (inQuietHours(now)) return false;
  const since = now.getTime() - (lastPollAt ? lastPollAt.getTime() : 0);
  const untilKick = nextKickoffAt ? nextKickoffAt.getTime() - now.getTime() : null;
  const near = untilKick != null && untilKick <= NEAR_KICKOFF_WINDOW_MS && untilKick >= -KICKOFF_GRACE_MS;
  return since >= (near ? NEAR_KICKOFF_INTERVAL_MS : BASE_INTERVAL_MS);
}

export function kickoffOf(sport, game) {
  const k = sport === 'americanfootball_nfl' ? resolveNflKickoff(game) : resolveNcaafKickoff(game);
  const iso = k?.iso;
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}

const slates = new Map(); // sport → { fetchedAt, games }

/** The week's games still ahead of us, from a slate list cached six hours. */
export async function upcomingWeekGames(sport, now = new Date(), { bdl = ballDontLieService } = {}) {
  const cached = slates.get(sport);
  let games;
  if (cached && now.getTime() - cached.fetchedAt < SLATE_TTL_MS) {
    games = cached.games;
  } else {
    const params = { dates: weekDates(now), per_page: 100 };
    if (sport === 'americanfootball_nfl') params.season_type = [1, 2, 3];
    if (sport === 'americanfootball_ncaaf') params.paginateAll = true;
    let list = (await bdl.getGames(sport, params, 10)) || [];
    if (!Array.isArray(list)) list = [];
    if (sport === 'americanfootball_ncaaf') {
      let classified = classifyNcaafFbsGames(list);
      if (classified.unresolved.length > 0) {
        const teams = await bdl.getTeams(sport);
        classified = classifyNcaafFbsGames(list, teams);
      }
      list = classified.accepted;
    }
    const seen = new Set();
    games = list.filter((g) => {
      if (g?.id == null || seen.has(String(g.id))) return false;
      seen.add(String(g.id));
      return true;
    });
    slates.set(sport, { fetchedAt: now.getTime(), games });
  }
  return games.filter((g) => {
    const k = kickoffOf(sport, g);
    return k && k.getTime() > now.getTime() - KICKOFF_GRACE_MS;
  });
}

/** Test seam: forget the cached slates. */
export function resetLineWatch() {
  slates.clear();
  state.clear();
}

const state = new Map(); // sport → { lastPollAt, nextKickoffAt }

/**
 * One tick of the watch (the scheduler calls this every minute): poll each
 * league that is due, record the boards, remember the next kickoff.
 */
export async function runLineWatchTick({
  now = new Date(),
  log = console.log,
  sports = LINE_WATCH_SPORTS,
  bdl = ballDontLieService,
  odds = ballDontLieOddsService,
  record = recordOddsSnapshots,
} = {}) {
  const results = [];
  for (const sport of sports) {
    const st = state.get(sport) || { lastPollAt: null, nextKickoffAt: null };
    if (!pollDue({ now, lastPollAt: st.lastPollAt, nextKickoffAt: st.nextKickoffAt })) continue;
    // Stamp first: a poll that fails must wait its interval too, not hammer.
    st.lastPollAt = now;
    state.set(sport, st);
    try {
      const games = await upcomingWeekGames(sport, now, { bdl });
      const kicks = games.map((g) => kickoffOf(sport, g)).filter((k) => k && k.getTime() > now.getTime()).sort((a, b) => a - b);
      st.nextKickoffAt = kicks[0] || null;
      if (games.length === 0) {
        results.push({ sport, games: 0, recorded: 0 });
        continue;
      }
      // Prediction markets never reach the app (the odds service's own rule);
      // the ledger keeps the same books the board shows.
      const boards = (await odds.getGamesWithOddsByIds(sport, games))
        .map((g) => ({ ...g, bookmakers: filterBlockedVendors(g.bookmakers) }));
      const recorded = await record(sport, boards);
      results.push({ sport, games: games.length, recorded });
      log(`📈 LINE WATCH ${sportLabel(sport)}: ${games.length} game(s) this week, ${recorded} board change(s) recorded`);
    } catch (e) {
      results.push({ sport, error: e.message });
      log(`⚠️ line watch ${sportLabel(sport)} skipped (${e.message})`);
    }
  }
  return results;
}

export default { runLineWatchTick, pollDue, weekDates, upcomingWeekGames, resetLineWatch };
