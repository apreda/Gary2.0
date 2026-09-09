/**
 * Codex CLI logins, one per ChatGPT account (founder, Sep 9 2026: the Pro
 * login hit its weekly cap until Sep 15, and a second account was created so
 * "Gary can fully return" on the bridge).
 *
 * Each login lives in its own CODEX_HOME (auth.json + the thread store the
 * CLI resumes from). A thread started under one home can only be resumed
 * under that home, so a session is pinned to the home that answered its first
 * turn; a capped home is skipped for NEW work until the reset time the CLI
 * itself reports ("try again at Sep 15th, 2026 11:17 AM"), or for an hour
 * when it reports none.
 *
 * Discovery: GARY_CODEX_HOMES (comma-separated directories, in preference
 * order) wins; otherwise the CLI's default home (~/.codex, or CODEX_HOME)
 * first, then every ~/.codex-* directory holding an auth.json, sorted.
 */
import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { basename, join } from 'path';

const DEFAULT_CAP_MS = 60 * 60 * 1000;
const cappedUntil = new Map(); // home → epoch ms

function hasLogin(dir) {
  try { return existsSync(join(dir, 'auth.json')); } catch { return false; }
}

export function discoverCodexHomes({ env = process.env, home = homedir() } = {}) {
  const configured = String(env.GARY_CODEX_HOMES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length) return [...new Set(configured)];
  const primary = env.CODEX_HOME || join(home, '.codex');
  let extras = [];
  try {
    extras = readdirSync(home, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('.codex-') && hasLogin(join(home, d.name)))
      .map((d) => join(home, d.name))
      .sort();
  } catch { extras = []; }
  return [...new Set([primary, ...extras.filter((dir) => dir !== primary)])];
}

/** "Sep 15th, 2026 11:17 AM" (the CLI's own wording) → epoch ms, or null. */
export function parseCodexResetTime(message, now = Date.now()) {
  const m = String(message || '').match(/try again (?:at|after) ([A-Za-z]{3,9} \d{1,2})(?:st|nd|rd|th)?,? (\d{4})(?: (\d{1,2}:\d{2}) ?([AP]M))?/i);
  if (!m) return null;
  const when = Date.parse(`${m[1]}, ${m[2]}${m[3] ? ` ${m[3]} ${m[4].toUpperCase()}` : ' 12:00 PM'}`);
  if (!Number.isFinite(when) || when <= now) return null;
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
