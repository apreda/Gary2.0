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
import { TEAM_SUBSECTIONS, MATCHUP_SUBSECTIONS, MARKET_SUBSECTIONS } from './mlbDeskLayout.js';

const REQUIRED = [
  ['THE SITUATION', '═══ THE SITUATION ═══'],
  ['PROBABLE PITCHERS', '═══ PROBABLE PITCHERS ═══'],
  ['CONFIRMED LINEUPS', '═══ CONFIRMED LINEUPS ═══'],
  ['THE PEN', '═══ THE PEN — every arm, newest work first ═══'],
  ['BULLPEN WORKLOAD', '═══ BULLPEN WORKLOAD'],
  ['THE PARK', '═══ THE PARK ═══'],
  ['BETTING CONTEXT', '═══ BETTING CONTEXT ═══'],
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
  ['CATCHERS', '═══ CATCHERS'],
  ['SITUATION FLAGS', '═══ SITUATION FLAGS ═══'],
  ['LAST NIGHT, AS WRITTEN', '═══ LAST NIGHT, AS WRITTEN ═══'],
  ['THE BOX SCORES', '═══ THE BOX SCORES ═══'],
  ['THE PEN, AS REPORTED', '═══ THE PEN, AS REPORTED ═══'],
];

// THE THREE-BUCKET DESK (Sep 1 2026) grades by subsection marker instead:
// each team subsection must appear once per club, the rest once. Labels
// are the layout module's own (mlbDeskLayout.js); `count` is how many
// occurrences a complete desk carries. (Weather rides The park and posts
// only near first pitch; its pending line is not absence language.)
const REQUIRED_BUCKETS = [
  ...TEAM_SUBSECTIONS.map((label) => [label, `── ${label} ──`, 2]),
  ...MATCHUP_SUBSECTIONS.map((label) => [label, `── ${label} ──`, 1]),
  ...MARKET_SUBSECTIONS.map((label) => [label, `── ${label} ──`, 1]),
];
const OPTIONAL_BUCKETS = [];

const ABSENCE_RX = /failed this run|retrieval failed|treat as missing/i;

/** Body of the section that starts at `idx`: text up to the next ═══ header. */
function sectionBody(text, idx) {
  const start = text.indexOf('\n', idx);
  if (start === -1) return '';
  const next = text.indexOf('═══', start);
  return text.slice(start, next === -1 ? undefined : next);
}

/** Bucket-layout body: text up to the next subsection, team, or bucket header. */
function bucketBody(text, idx) {
  const start = text.indexOf('\n', idx);
  if (start === -1) return '';
  const m = /\n(── |═══ |━━━)/.exec(text.slice(start + 1));
  return m ? text.slice(start, start + 1 + m.index) : text.slice(start);
}

function everyIndex(text, marker) {
  const out = [];
  let i = text.indexOf(marker);
  while (i !== -1) { out.push(i); i = text.indexOf(marker, i + marker.length); }
  return out;
}

function auditBuckets(t) {
  const res = { missing: [], empty: [], honestAbsent: [], present: [], optionalAbsent: [] };
  const grade = (name, marker, count, required) => {
    const hits = everyIndex(t, marker);
    // A subsection short of its expected count is MISSING and nothing else —
    // the arrays partition the lanes (one verdict per name).
    if (hits.length < count) {
      (required ? res.missing : res.optionalAbsent).push(name);
      return;
    }
    const bodies = hits.map((i) => bucketBody(t, i));
    if (bodies.some((b) => ABSENCE_RX.test(b))) res.honestAbsent.push(name);
    else if (required && bodies.some((b) => b.trim().length < 40)) res.empty.push(name);
    else res.present.push(name);
  };
  for (const [name, marker, count] of REQUIRED_BUCKETS) grade(name, marker, count, true);
  for (const [name, marker, count] of OPTIONAL_BUCKETS) grade(name, marker, count, false);
  return res;
}

/**
 * Grade a built desk. Returns { missing, empty, honestAbsent, present,
 * optionalAbsent } — arrays of section names. `missing` and `empty` are the
 * alarm states for required sections. `layout` selects the header grammar
 * ('legacy' flat ═══ sections, or 'buckets').
 */
export function auditDeskManifest(text, layout = 'legacy') {
  const t = String(text || '');
  if (layout === 'buckets') return auditBuckets(t);
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
export function recordDeskManifest(matchup, audit, layout = 'legacy') {
  const bad = [...audit.missing, ...audit.empty];
  const tag = layout === 'legacy' ? '' : ` [${layout}]`;
  const line = `${new Date().toISOString()} | ${matchup}${tag} | missing:[${audit.missing.join(',')}] empty:[${audit.empty.join(',')}] honest-absent:[${audit.honestAbsent.join(',')}] present:${audit.present.length}`;
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
