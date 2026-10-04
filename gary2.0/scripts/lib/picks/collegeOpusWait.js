/**
 * COLLEGE WAITS FOR OPUS (founder GO, Oct 3 2026).
 *
 * A college pick that found the Claude subscription at its limit went
 * straight to the GPT recovery login. On Oct 3 the five-hour window ran out
 * at 6:30 PM and reopened at 8:00 PM; three late games were picked on GPT at
 * four and three hours before kickoff, with two more scheduled attempts still
 * ahead of them. College runs at 240, 180, 90 and 30 minutes before kickoff,
 * so when the limit reopens before the 90-minute attempt the game is left to
 * that attempt and Opus makes the pick. A limit that reopens later than that
 * (the weekly limit on a Saturday) changes nothing: the recovery login picks
 * now, as before.
 */
import { CLAUDE_CAP } from '../../../src/services/agentic/orchestrator/subscriptionRoutes.js';

const LAST_FULL_ATTEMPT_MS = 90 * 60_000;
const MARGIN_MS = 2 * 60_000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function easternParts(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(new Date(instant)).map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month - 1, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/** The instant an Eastern wall-clock time names. */
function easternInstant(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month, day, hour, minute);
  const shown = easternParts(guess);
  return guess + (guess - Date.UTC(shown.year, shown.month, shown.day, shown.hour, shown.minute));
}

/**
 * When the Claude CLI says its limit reopens: "resets 8pm (America/New_York)"
 * or "resets Sep 27 at 10pm (America/New_York)". Null when the message names
 * no time or another zone; an unknown reopening never makes a game wait.
 */
export function claudeResetAt(reason, now = Date.now()) {
  const text = String(reason || '');
  const match = /resets\s+(?:([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s+at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*\(([^)]+)\))?/i.exec(text);
  if (!match || (match[6] && match[6] !== 'America/New_York')) return null;
  const hour = (Number(match[3]) % 12) + (match[5].toLowerCase() === 'pm' ? 12 : 0);
  const minute = Number(match[4] || 0);
  const today = easternParts(now);
  if (match[1]) {
    const month = MONTHS.indexOf(match[1].toLowerCase());
    if (month < 0) return null;
    const at = easternInstant(today.year, month, Number(match[2]), hour, minute);
    return at < now - 24 * 60 * 60_000 ? easternInstant(today.year + 1, month, Number(match[2]), hour, minute) : at;
  }
  const at = easternInstant(today.year, today.month, today.day, hour, minute);
  return at > now ? at : easternInstant(today.year, today.month, today.day + 1, hour, minute);
}

/**
 * @returns {null | { resetAt: Date }} the reopening this college game waits
 * for, or null when the pick should proceed on whatever route answers.
 */
export function collegeWaitsForOpus({ league, reason, kickoff, now = Date.now() }) {
  if (league !== 'americanfootball_ncaaf' || !CLAUDE_CAP.test(String(reason || ''))) return null;
  const resetAt = claudeResetAt(reason, now);
  const kick = Date.parse(kickoff || '');
  if (!resetAt || !Number.isFinite(kick)) return null;
  return resetAt + MARGIN_MS <= kick - LAST_FULL_ATTEMPT_MS ? { resetAt: new Date(resetAt) } : null;
}
