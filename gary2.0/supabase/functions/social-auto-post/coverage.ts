import { selectAudiencePicks, audienceDeadlineOutcomes } from './audience.ts';
import { sameSourceGame, hasLoggedTicket } from './pickSources.js';
import { FULL_COVERAGE_VERSION, COVERAGE_POST_GAP_MS, fullCoverageLeague } from './coveragePolicy.js';
import { slotOf } from './window.ts';

const dayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(ms);
const interrupted = (p: any) => /cancel|postpon|suspend|final|in.progress|^live$/i.test(String(p.game_status ?? ''));
const canceled = (p: any) => /cancel|postpon|suspend/i.test(String(p.game_status ?? ''));
const isPass = (p: any) => /^pass\b/i.test(String(p.pick ?? '').trim());

/** Cover every MLB/NFL pick, earliest deadline first. Other sports retain the
 * audience policy. Neither confidence nor engagement selects baseball/football. */
export function selectGameCoverage(picks: any[], slate: any[], receipts: any[], history: any[], nowMs: number, allPublished = picks) {
  const today = dayOf(nowMs);
  const roots = receipts.filter(r => ['standard', 'top_pick'].includes(r.thread_format));
  const latest = Math.max(0, ...roots.map(r => Date.parse(r.posted_at)).filter(Number.isFinite));
  const candidates = picks.filter(p => {
    const start = Date.parse(p.commence_time), lead = start - nowMs;
    return fullCoverageLeague(p.league) && !isPass(p) && Number.isFinite(start) && dayOf(start) === today
      && lead >= 5 * 60_000 && lead <= 120 * 60_000 && !interrupted(p)
      && !slate.some(row => sameSourceGame(p, row) && interrupted(row)) && !hasLoggedTicket(p, roots);
  }).sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time)
    || String(a.game_id ?? a.pick).localeCompare(String(b.game_id ?? b.pick)));
  const result = { version: FULL_COVERAGE_VERSION, cap: null, eligible: candidates.length, queue: [] as any[], reason: 'no game pick ready in the 5–120 minute window' };
  if (nowMs - latest < COVERAGE_POST_GAP_MS) return { ...result, reason: 'posting interval reserved', next_post_after: new Date(latest + COVERAGE_POST_GAP_MS).toISOString() };
  if (candidates.length) return { ...result, reason: 'every MLB/NFL game; earliest deadline first',
    // One successful root per run. If its primary writer fails, try the next
    // game's primary writer; never substitute copy for the failed game.
    queue: candidates.slice(0, 3).map(p => ({ ...p, audience_selection: {
      version: FULL_COVERAGE_VERSION, basis: 'every_game', cell: `${p.league}:${slotOf(p.commence_time)}`, teams: [p.awayTeam, p.homeTeam],
    } })),
  };
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(nowMs));
  if (hour < 8) return result;
  const other = (rows: any[]) => rows.filter(p => !fullCoverageLeague(p.league));
  return selectAudiencePicks(other(picks), other(slate), other(roots), history, nowMs, other(allPublished));
}

export function coverageDeadlineOutcomes(picks: any[], logs: any[], intents: any[], nowMs: number, slate: any[] = []) {
  const eligible = picks.filter(p => !isPass(p) && !canceled(p) && !slate.some(row => sameSourceGame(p, row) && canceled(row)));
  // September 16's earlier intentional subset must not become a retroactive
  // outage. Explicit every-game reservations apply immediately; unattempted
  // coverage misses are required from the first full day under this policy.
  const required = eligible.filter(p => fullCoverageLeague(p.league) && (
    (Number.isFinite(Date.parse(p.commence_time)) && dayOf(Date.parse(p.commence_time)) >= '2026-09-17')
    || intents.some(i => i.log_payload?.audience_selection?.version === FULL_COVERAGE_VERSION
      && i.log_payload?.pick_text === p.pick && i.log_payload?.commence_time === p.commence_time)));
  const previous = audienceDeadlineOutcomes(eligible.filter(p => !required.includes(p)), logs, intents, nowMs);
  for (const p of required) if (!hasLoggedTicket(p, logs) && Date.parse(p.commence_time) - nowMs < 5 * 60_000) previous.missed.push(p.pick);
  return previous;
}
