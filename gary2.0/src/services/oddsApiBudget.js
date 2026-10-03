/** The Odds API backup: free 500-credit month, daily allowance and reserve.
 * Saturday, college football's day, may spend up to 60 credits (founder, Oct 3
 * 2026: big games only, so the free plan still carries real college prop odds).
 * Every paid request is costed before it starts, under a shared process lock.
 * College backup boards also reserve the selected quote's final recheck.
 */
import { mkdir, readFile, writeFile, rename, rmdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const CACHE = new URL('../../.cache/', import.meta.url);
const LEDGER = fileURLToPath(new URL('odds-api-budget.json', CACHE));
const LOCK = `${LEDGER}.lock`;
export const ODDS_API_RESERVE = 25;
const MIN_DAILY = 15;
const SATURDAY_DAILY = 60;

export class OddsApiBudgetError extends Error {
  constructor(message) { super(message); this.name = 'OddsApiBudgetError'; this.code = 'ODDS_API_BUDGET'; }
}
const monthKey = now => new Date(now).toISOString().slice(0, 7);
const dayKey = now => new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const saturdayEt = now => new Date(now).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' }) === 'Sat';
function daysLeftInMonth(now) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() - d.getUTCDate() + 1;
}
const parts = value => [...new Set(String(value || '').split(',').filter(Boolean))];
export function oddsApiRequestCredits(url) {
  const u = new URL(url);
  if (/\/(?:sports|events)\/?$/.test(u.pathname)) return 0;
  const markets = parts(u.searchParams.get('markets'));
  const bookmakers = parts(u.searchParams.get('bookmakers'));
  const regions = bookmakers.length ? Math.ceil(bookmakers.length / 10) : Math.max(1, parts(u.searchParams.get('regions')).length);
  return Math.max(1, markets.length) * regions;
}
function verificationKey(url) {
  const m = new URL(url).pathname.match(/\/sports\/([^/]+)\/events\/([^/]+)\/odds\/?$/);
  return m ? `${m[1]}:${m[2]}:${process.pid}` : null;
}
function reservations(ledger, now) {
  return Object.fromEntries(Object.entries(ledger.month === monthKey(now) ? ledger.reservations || {} : {})
    .filter(([, r]) => Number.isInteger(r?.credits) && r.credits > 0 && r.expires_at > now));
}
function headerNumber(response, name) {
  const raw = response.headers?.get?.(name);
  return raw != null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;
}
async function readLedger() {
  try { return JSON.parse(await readFile(LEDGER, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return {}; throw error; }
}
async function writeLedger(ledger) {
  const temp = `${LEDGER}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(ledger), { mode: 0o600 });
  await rename(temp, LEDGER);
}
async function acquireLock(signal) {
  await mkdir(CACHE, { recursive: true });
  const started = Date.now();
  for (;;) {
    signal?.throwIfAborted();
    try { await mkdir(LOCK); return; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - (await stat(LOCK)).mtimeMs > 60_000) { await rmdir(LOCK); continue; } }
      catch (e) { if (e.code === 'ENOENT') continue; }
      if (Date.now() - started > 30_000) throw new OddsApiBudgetError('The shared Odds API budget is busy; retry later');
      await delay(50, undefined, { signal });
    }
  }
}

/** Requested credits plus outstanding completion reservations must fit. */
export function budgetRefusal(ledger, now = Date.now(), credits = 1, reservedCredits = 0) {
  if (credits === 0) return null; // The provider's event list is free.
  if (ledger?.month !== monthKey(now) || !Number.isFinite(ledger?.remaining)) return null;
  if (ledger.remaining - credits - reservedCredits < ODDS_API_RESERVE) return `The Odds API backup needs its ${ODDS_API_RESERVE}-credit reserve for ${ledger.month}`;
  const dayStart = ledger.day === dayKey(now) && Number.isFinite(ledger.dayStartRemaining) ? ledger.dayStartRemaining : ledger.remaining;
  const even = Math.max(MIN_DAILY, Math.floor((dayStart - ODDS_API_RESERVE) / daysLeftInMonth(now)));
  const allowance = saturdayEt(now) ? Math.max(SATURDAY_DAILY, even) : even;
  if (dayStart - ledger.remaining + credits + reservedCredits > allowance) return `The Odds API backup cannot fit this request and its quote recheck in today's ${allowance} credits`;
  return null;
}

export async function oddsApiFetch(url, init = {}, fetchImpl = globalThis.fetch,
  { reserveVerification = false, useVerificationReserve = false } = {}) {
  if (process.env.NODE_ENV === 'test') return fetchImpl(url, init);
  await acquireLock(init.signal);
  try {
    const now = Date.now(), month = monthKey(now), today = dayKey(now);
    const saved = await readLedger();
    const ledger = saved.month === month && Number.isFinite(saved.remaining) ? saved : { month, remaining: 500 };
    const held = reservations(ledger, now), key = verificationKey(url);
    const credits = oddsApiRequestCredits(url);
    const own = useVerificationReserve && key ? held[key]?.credits || 0 : 0;
    const extra = reserveVerification && key && !held[key] ? 1 : 0;
    const reserved = Object.values(held).reduce((sum, r) => sum + r.credits, 0) - Math.min(own, credits) + extra;
    const refusal = budgetRefusal(ledger, now, credits, reserved);
    if (refusal) throw new OddsApiBudgetError(refusal);
    const response = await fetchImpl(url, init);
    const last = headerNumber(response, 'x-requests-last') ?? (response.ok ? credits : 0);
    const remaining = headerNumber(response, 'x-requests-remaining') ?? ledger.remaining - last;
    if (reserveVerification && key && response.ok) held[key] = { credits: 1, expires_at: now + 60 * 60_000 };
    if (own && key && response.ok) {
      const left = held[key].credits - credits;
      if (left > 0) held[key].credits = left;
      else delete held[key];
    }
    const sameDay = ledger.day === today && Number.isFinite(ledger.dayStartRemaining);
    await writeLedger({ month, day: today, dayStartRemaining: sameDay ? ledger.dayStartRemaining : ledger.remaining,
      remaining, used: headerNumber(response, 'x-requests-used'), reservations: held, updated_at: new Date(now).toISOString() });
    if (last > 0) console.log(`[Odds API backup] ${last} credit(s) spent; ${remaining} left this month`);
    return response;
  } finally { await rmdir(LOCK); }
}
