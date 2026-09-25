/**
 * THE ODDS API IS THE BACKUP, ON A FREE PLAN (founder, Sep 25 2026: "ideally
 * we get it from BDL ... use the free Odds API to fill the gaps"; 500 credits
 * a month, resetting the 1st at 00:00 UTC). Every Odds API request goes
 * through here so a refresh loop can never spend the month:
 *
 *   - the provider's own x-requests-remaining header is the ledger's truth,
 *     saved after every answer (.cache/odds-api-budget.json);
 *   - a reserve is never spent, so a later gap still has credits;
 *   - one day may spend at most the remaining credits spread over the days
 *     left in the month (never less than MIN_DAILY).
 *
 * Event lists cost nothing on The Odds API; a board costs its markets times
 * its regions. A refused request throws OddsApiBudgetError, which every
 * caller already treats as "the backup is unavailable".
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const LEDGER = fileURLToPath(new URL('../../.cache/odds-api-budget.json', import.meta.url));
export const ODDS_API_RESERVE = 25;
const MIN_DAILY = 15;

export class OddsApiBudgetError extends Error {
  constructor(message) { super(message); this.name = 'OddsApiBudgetError'; this.code = 'ODDS_API_BUDGET'; }
}

const monthKey = (now) => new Date(now).toISOString().slice(0, 7);
const dayKey = (now) => new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
function daysLeftInMonth(now) {
  const d = new Date(now);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return last - d.getUTCDate() + 1;
}

async function readLedger() {
  try { return JSON.parse(await readFile(LEDGER, 'utf8')); } catch { return {}; }
}
async function writeLedger(ledger) {
  try {
    await mkdir(new URL('../../.cache/', import.meta.url), { recursive: true });
    const temp = `${LEDGER}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(ledger), { mode: 0o600 });
    await rename(temp, LEDGER);
  } catch { /* the header is read again on the next request */ }
}

/** Why a request would be refused right now, or null when it may go. */
export function budgetRefusal(ledger, now = Date.now()) {
  if (ledger?.month !== monthKey(now) || !Number.isFinite(ledger?.remaining)) return null;
  if (ledger.remaining <= ODDS_API_RESERVE) return `The Odds API backup is down to its ${ODDS_API_RESERVE}-credit reserve for ${ledger.month}`;
  const dayStart = ledger.day === dayKey(now) && Number.isFinite(ledger.dayStartRemaining) ? ledger.dayStartRemaining : ledger.remaining;
  const allowance = Math.max(MIN_DAILY, Math.floor((dayStart - ODDS_API_RESERVE) / daysLeftInMonth(now)));
  if (dayStart - ledger.remaining >= allowance) return `The Odds API backup spent today's ${allowance} credits`;
  return null;
}

/** fetch() for The Odds API, inside the month's budget. Returns the Response. */
export async function oddsApiFetch(url, init = {}, fetchImpl = globalThis.fetch) {
  if (process.env.NODE_ENV === 'test') return fetchImpl(url, init);
  const now = Date.now();
  const ledger = await readLedger();
  const refusal = budgetRefusal(ledger, now);
  if (refusal) throw new OddsApiBudgetError(refusal);
  const response = await fetchImpl(url, init);
  const remaining = Number(response.headers?.get?.('x-requests-remaining'));
  if (Number.isFinite(remaining)) {
    const today = dayKey(now), month = monthKey(now);
    const sameDay = ledger.month === month && ledger.day === today && Number.isFinite(ledger.dayStartRemaining);
    const before = ledger.month === month && Number.isFinite(ledger.remaining) ? ledger.remaining : remaining + (Number(response.headers.get('x-requests-last')) || 0);
    await writeLedger({ month, day: today, dayStartRemaining: sameDay ? ledger.dayStartRemaining : before,
      remaining, used: Number.isFinite(Number(response.headers.get('x-requests-used'))) ? Number(response.headers.get('x-requests-used')) : null, updated_at: new Date(now).toISOString() });
    const last = Number(response.headers.get('x-requests-last')) || 0;
    if (last > 0) console.log(`[Odds API backup] ${last} credit(s) spent; ${remaining} left this month`);
  }
  return response;
}
