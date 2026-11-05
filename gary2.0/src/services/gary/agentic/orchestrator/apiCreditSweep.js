import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// THE CREDIT SWEEP (founder, Nov 5 2026). Ultra's $200 API credit arrives every
// month and whatever is unused is lost, so in the last days before the next one
// arrives Gary spends what is left before touching the subscription. There is
// little to lose: a fresh $200 lands days later. It never opens on a month the
// credit was already spent, which is most of the point of leaving the normal
// order (subscription, then credit, then GPT) alone the rest of the month.
export const API_CREDIT_USD = 200;
export const CREDIT_ARRIVES_DAY = 12;   // claude.ai billing: "Next credit Nov 12, 2026"
export const SWEEP_DAYS = 3;
export const SWEEP_KEEPS_USD = 5;       // the ledger misses the org's other keys; stop short of empty

const defaultLedger = () => join(homedir(), 'Library', 'Logs', 'Gary2.0', 'model-usage.jsonl');
const easternToday = (now) => {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now).split('-').map(Number);
  return { year, month, day };
};

/** What the ledger shows billed to the API credit since a moment (ISO). */
export function apiCreditSpentSince(sinceIso, ledger = defaultLedger()) {
  let spent = 0;
  for (const line of readFileSync(ledger, 'utf8').split('\n')) {
    if (!line.includes('api_cost_usd')) continue;
    try {
      const row = JSON.parse(line);
      if (row.at >= sinceIso) spent += Number(row.api_cost_usd) || 0;
    } catch { /* a half-written line is not spend */ }
  }
  return spent;
}

let announced = false;

/**
 * True when heavy work should run on the credit first. Any doubt (no ledger, the
 * switch off, tests that name no date) keeps the normal order. A wrong "open"
 * costs little: an empty credit refuses at once and the turn moves to the
 * subscription behind it.
 */
export function creditSweepOpen({ env = process.env, now } = {}) {
  if (env.GARY_CREDIT_SWEEP === 'off') return false;
  if (!now && process.env.VITEST) return false;
  const { year, month, day } = easternToday(now || new Date());
  if (day < CREDIT_ARRIVES_DAY - SWEEP_DAYS || day >= CREDIT_ARRIVES_DAY) return false;
  try {
    const cycleStart = new Date(Date.UTC(year, month - 2, CREDIT_ARRIVES_DAY)).toISOString();
    const left = API_CREDIT_USD - apiCreditSpentSince(cycleStart, env.GARY_USAGE_LEDGER || defaultLedger());
    if (left <= SWEEP_KEEPS_USD) return false;
    if (!announced) {
      announced = true;
      console.warn(`[API credit sweep] about $${left.toFixed(2)} of the credit is left before the ${CREDIT_ARRIVES_DAY}th: heavy work runs on it first`);
    }
    return true;
  } catch {
    return false;
  }
}
