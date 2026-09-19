/** Gary uses its dedicated login by default. The personal profile is reserved
 * for the explicit final game-pick route, never general account discovery. */
import { homedir } from 'os';
import { basename, join, resolve } from 'path';

const DEFAULT_CAP_MS = 60 * 60 * 1000;
const cappedUntil = new Map(); // home → epoch ms

export const personalCodexHome = ({ env = process.env, home = homedir() } = {}) =>
  env.GARY_PERSONAL_CODEX_HOME || join(home, '.codex');

export function restrictCodexHomes(homes, { allowPersonalAccount = false, env = process.env, home = homedir() } = {}) {
  const personal = resolve(personalCodexHome({ env, home }));
  return [...new Set(homes)].filter(dir => allowPersonalAccount || resolve(dir) !== personal);
}

/**
 * Homes for new work, Gary's own Plus login first.
 *
 * `includePersonal` appends the personal Pro login LAST (founder, Sep 18 2026:
 * "we have 2 GPT accounts you can use for the fallback a plus and a pro").
 * It is only a candidate — `restrictCodexHomes` still drops it unless the
 * caller passes allowPersonalAccount, and `availableCodexHomes` drops a capped
 * home, so Pro is reached only when Plus cannot serve. Default is unchanged:
 * the dedicated login alone.
 */
export function discoverCodexHomes({ env = process.env, home = homedir(), includePersonal = false } = {}) {
  const configured = String(env.GARY_CODEX_HOMES || '').split(',').map(s => s.trim()).filter(Boolean);
  const base = configured.length ? configured : [join(home, '.codex-plus')];
  const gary = restrictCodexHomes(base, { env, home });
  if (!includePersonal) return gary;
  return [...new Set([...gary, personalCodexHome({ env, home })])];
}

/** "Sep 15th, 2026 11:17 AM" (the CLI's own wording) → epoch ms, or null. */
export function parseCodexResetTime(message, now = Date.now()) {
  const text = String(message || '');
  const dated = text.match(/try again (?:at|after) ([A-Za-z]{3,9} \d{1,2})(?:st|nd|rd|th)?,? (\d{4})(?: (\d{1,2}:\d{2}) ?([AP]M))?/i);
  if (dated) {
    const when = Date.parse(`${dated[1]}, ${dated[2]}${dated[3] ? ` ${dated[3]} ${dated[4].toUpperCase()}` : ' 12:00 PM'}`);
    return Number.isFinite(when) && when > now ? when : null;
  }
  // The five-hour window's wording carries only a clock: "try again at 7:30 PM"
  // — today in ET, or tomorrow when that time has already passed.
  const clock = text.match(/try again (?:at|after) (\d{1,2}:\d{2}) ?([AP]M)/i);
  if (!clock) return null;
  const etDay = new Date(now).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
  let when = Date.parse(`${etDay} ${clock[1]} ${clock[2].toUpperCase()}`);
  if (!Number.isFinite(when)) return null;
  if (when <= now) when += 24 * 60 * 60 * 1000;
  return when;
}

export function markCodexHomeCapped(dir, message, now = Date.now()) {
  const until = parseCodexResetTime(message, now) ?? (now + DEFAULT_CAP_MS);
  cappedUntil.set(dir, until);
  return until;
}

export function isCodexHomeCapped(dir, now = Date.now()) {
  const until = cappedUntil.get(dir);
  if (!until) return false;
  if (until <= now) { cappedUntil.delete(dir); return false; }
  return true;
}

/** Homes to try for NEW work, preferred first, capped ones excluded. */
export function availableCodexHomes({ preferred = null, now = Date.now(), homes = discoverCodexHomes() } = {}) {
  const ordered = preferred && homes.includes(preferred) ? [preferred, ...homes.filter((h) => h !== preferred)] : homes;
  return ordered.filter((h) => !isCodexHomeCapped(h, now));
}

/** ~/.codex → "codex"; ~/.codex-plus → "codex-plus" — the log label. */
export function codexHomeLabel(dir) {
  const name = basename(String(dir || '')).replace(/^\./, '');
  return name || 'codex';
}

/** Test seam. */
export function _resetCodexHomeCaps() { cappedUntil.clear(); }

export default { discoverCodexHomes, parseCodexResetTime, markCodexHomeCapped, isCodexHomeCapped, availableCodexHomes, codexHomeLabel };
