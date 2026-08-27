/**
 * THE DESK MANIFEST (founder, Aug 27: "make sure that nothing is silently
 * breaking"). A deterministic completeness check that runs at the end of
 * every MLB desk build: every section the desk is supposed to carry is
 * graded PRESENT (real content), HONEST-ABSENT (carries its own
 * retrieval-failed line), or MISSING — and MISSING is LOUD: it errors into
 * the game log and appends to logs/desk-manifest.log, the same
 * ledger pattern as era-runs, so a broken lane can survive one build but
 * never a quiet week. This module checks the desk; it never changes it —
 * deliberately OUTSIDE the era hash.
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const REQUIRED = [
  ['THE SITUATION', '═══ THE SITUATION ═══'],
  ['PROBABLE PITCHERS', '═══ PROBABLE PITCHERS ═══'],
  ['CONFIRMED LINEUPS', '═══ CONFIRMED LINEUPS ═══'],
  ['THE PEN', '═══ THE PEN — high-leverage arms ═══'],
  ['BULLPEN WORKLOAD', '═══ BULLPEN WORKLOAD'],
  ['THE PARK', '═══ THE PARK ═══'],
  ['BETTING CONTEXT', '═══ BETTING CONTEXT ═══'],
  ['TEAM SEASON STATS', '═══ TEAM SEASON STATS ═══'],
  ['STANDINGS', '═══ STANDINGS & SEASON SHAPE ═══'],
  ['INJURIES', '═══ INJURIES'],
  ['RECENT FORM', '═══ RECENT FORM ═══'],
  ['SERIES STATE', '═══ SERIES STATE ═══'],
  ['ROSTER MOVES', '═══ ROSTER MOVES'],
  ['SCHEDULE SHAPE', '═══ SCHEDULE SHAPE ═══'],
  ['REST SITUATION', '═══ REST & SCHEDULE SITUATION ═══'],
  ['BREAKING NEWS', "═══ TODAY'S BREAKING NEWS ═══"],
];

const OPTIONAL = [
  ['PITCHER SAMPLE CONTEXT', '═══ PITCHER SAMPLE CONTEXT ═══'],
  ['BATS VS ARMS', "═══ TONIGHT'S BATS VS TONIGHT'S ARMS"],
  ['THE BENCH', '═══ THE BENCH TONIGHT ═══'],
  ['SP PITCH TYPES', '═══ SP PITCH TYPES'],
  ['TEAM DEFENSE', '═══ TEAM DEFENSE ═══'],
  ['CATCHERS', '═══ CATCHERS'],
  ['SITUATION FLAGS', '═══ SITUATION FLAGS ═══'],
  ['LAST NIGHT, AS WRITTEN', '═══ LAST NIGHT, AS WRITTEN ═══'],
  ['THE BOX SCORES', '═══ THE BOX SCORES ═══'],
  ['THE PEN, AS REPORTED', '═══ THE PEN, AS REPORTED ═══'],
];

const ABSENCE_RX = /failed this run|retrieval failed|treat as missing/i;

/** Body of the section that starts at `idx`: text up to the next ═══ header. */
function sectionBody(text, idx) {
  const start = text.indexOf('\n', idx);
  if (start === -1) return '';
  const next = text.indexOf('═══', start);
  return text.slice(start, next === -1 ? undefined : next);
}

/**
 * Grade a built desk. Returns { missing, empty, honestAbsent, present,
 * optionalAbsent } — arrays of section names. `missing` and `empty` are the
 * alarm states for required sections.
 */
export function auditDeskManifest(text) {
  const t = String(text || '');
  const res = { missing: [], empty: [], honestAbsent: [], present: [], optionalAbsent: [] };
  for (const [name, marker] of REQUIRED) {
    const i = t.indexOf(marker);
    if (i === -1) { res.missing.push(name); continue; }
    const body = sectionBody(t, i);
    if (ABSENCE_RX.test(body)) res.honestAbsent.push(name);
    else if (body.trim().length < 40) res.empty.push(name);
    else res.present.push(name);
  }
  for (const [name, marker] of OPTIONAL) {
    const i = t.indexOf(marker);
    if (i === -1) { res.optionalAbsent.push(name); continue; }
    const body = sectionBody(t, i);
    if (ABSENCE_RX.test(body)) res.honestAbsent.push(name);
    else res.present.push(name);
  }
  return res;
}

const LEDGER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'logs', 'desk-manifest.log');

/**
 * Log the audit — LOUD on any missing/empty required section — and append
 * the ledger line. Fail-open: the ledger must never sink a desk build.
 */
export function recordDeskManifest(matchup, audit) {
  const bad = [...audit.missing, ...audit.empty];
  const line = `${new Date().toISOString()} | ${matchup} | missing:[${audit.missing.join(',')}] empty:[${audit.empty.join(',')}] honest-absent:[${audit.honestAbsent.join(',')}] present:${audit.present.length}`;
  if (bad.length > 0) {
    console.error(`[Desk Manifest] 🚨 REQUIRED SECTION(S) NOT ON THE DESK for ${matchup}: ${bad.join(', ')} — a missing lane is a broken lane, never a quiet one.`);
  } else if (audit.honestAbsent.length > 0) {
    console.warn(`[Desk Manifest] ⚠️ honest-absence on ${matchup}: ${audit.honestAbsent.join(', ')}`);
  } else {
    console.log(`[Desk Manifest] ✅ ${matchup}: all ${audit.present.length} sections present.`);
  }
  try {
    const dir = dirname(LEDGER);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(LEDGER, line + '\n');
  } catch { /* fail-open */ }
  return line;
}
