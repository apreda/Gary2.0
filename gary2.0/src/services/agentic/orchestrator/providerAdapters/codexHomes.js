/** Gary discovers its business login first. The shared subscription route adds
 * the explicitly authorized personal account after the business account. */
import { homedir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const DEFAULT_CAP_MS = 60 * 60 * 1000;
const cappedUntil = new Map(); // home → epoch ms

// A cap the CLI dated ("try again at Sep 26th, 2026 10:48 AM") outlives the
// process that learned it. Every scheduled pass is a fresh process, so the
// memory lives on disk (Sep 21 2026: each pass re-gave a capped login its
// share of the search window, then re-learned the cap the slow way).
const capFile = () => process.env.GARY_CODEX_CAP_FILE
  || join(process.env.GARY_LOG_DIR || join(homedir(), 'Library/Logs/Gary2.0'), 'codex-caps.json');
function loadCaps() {
  try {
    if (!existsSync(capFile())) return;
    for (const [dir, until] of Object.entries(JSON.parse(readFileSync(capFile(), 'utf8')) || {})) {
      if (Number.isFinite(until) && until > Date.now()) cappedUntil.set(dir, until);
    }
  } catch { /* an unreadable memory only means learning the cap again */ }
}
function saveCaps() {
  try {
    mkdirSync(dirname(capFile()), { recursive: true });
    writeFileSync(capFile(), JSON.stringify(Object.fromEntries(cappedUntil)));
  } catch { /* best effort */ }
}
loadCaps();

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
  saveCaps();
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
export function _resetCodexHomeCaps() { cappedUntil.clear(); saveCaps(); }

export default { discoverCodexHomes, parseCodexResetTime, markCodexHomeCapped, isCodexHomeCapped, availableCodexHomes, codexHomeLabel };
