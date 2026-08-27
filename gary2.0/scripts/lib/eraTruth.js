/**
 * Era truth + drift guard (born Aug 12 2026).
 *
 * For two weeks (Jul 29 – Aug 12 2026) the pick daemon launched from a SECOND
 * clone of this repo, so every edit here was committed, pushed, tested — and
 * never ran. The only witness was the prompt_sha stamped on stored picks.
 * These helpers close that loop from both ends:
 *
 *   1. diskEras()      — what a FRESH pick run from THIS folder would stamp,
 *                        computed by a clean node process (no module cache).
 *   2. recordEraRun()  — every pick run appends {date, era, commit, folder}
 *                        to logs/era-runs.log, a local ledger of what this
 *                        folder actually produced.
 *   3. checkEraDrift() — grading reads back the eras stamped in the database
 *                        and verifies every one was produced by a run recorded
 *                        in the ledger. A stamp no local run produced means
 *                        ANOTHER writer (another clone, Railway, a stale
 *                        process) is making production picks. Loud, non-fatal.
 *
 * The ledger — not "stored era == current disk era" — is the invariant, so a
 * legitimate mid-day prompt change (morning picks on the older era) never
 * false-alarms.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';

export const PROJECT_DIR = join(import.meta.dirname, '..', '..');
const LEDGER_DIR = join(PROJECT_DIR, 'logs');
const LEDGER_FILE = join(LEDGER_DIR, 'era-runs.log');

/** Short git commit of this folder, with a dirty marker. Never throws. */
export function gitStamp() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: PROJECT_DIR }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: PROJECT_DIR }).toString().trim() ? '+dirty' : '';
    return `${sha}${dirty}`;
  } catch {
    return 'no-git';
  }
}

/**
 * The eras a fresh pick run from THIS folder would stamp, read by spawning a
 * clean node process so a long-running caller's module cache can't lie.
 * Import side effects print banners, so only the last stdout line is parsed.
 */
export function diskEras() {
  // Game era = the June engine's surface hash (the pickdesk game brain and
  // its PROMPT_SHA are retired — founder, Aug 27: one pick system).
  const code = `
    process.env.BALLDONTLIE_API_KEY ||= 'x';
    const g = await import('${PROJECT_DIR}/src/services/agentic/orchestrator/junePromptSha.js');
    const p = await import('${PROJECT_DIR}/src/services/pickdesk/propsBrain.js');
    console.log(JSON.stringify({ game: g.junePromptSha(), props: p.PROPS_PROMPT_SHA }));
  `;
  const out = execSync('node --input-type=module', {
    cwd: PROJECT_DIR,
    input: code,
    timeout: 60000,
  }).toString().trim();
  const lastLine = out.split('\n').filter(Boolean).pop();
  return JSON.parse(lastLine);
}

/**
 * Append this run's era to the local ledger. Called at the top of every pick
 * run (game and props) — BEFORE any dedup short-circuit, so even a run that
 * stores nothing leaves a record that this folder was the active writer.
 * Fail-open: a ledger problem must never block picks.
 */
export function recordEraRun(lane, etDate, era) {
  try {
    if (!existsSync(LEDGER_DIR)) mkdirSync(LEDGER_DIR, { recursive: true });
    if (!existsSync(LEDGER_FILE)) {
      appendFileSync(LEDGER_FILE, `GUARD BORN ${new Date().toISOString()}\n`);
    }
    appendFileSync(LEDGER_FILE, `${etDate} ${lane} ${era} ${gitStamp()} ${PROJECT_DIR}\n`);
  } catch {}
}

/** Ledger entries for one ET date: { born: 'YYYY-MM-DD'|null, eras: Set }. */
function readLedger(etDate, lane) {
  if (!existsSync(LEDGER_FILE)) return { born: null, eras: null };
  const lines = readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean);
  let born = null;
  const eras = new Set();
  for (const line of lines) {
    if (line.startsWith('GUARD BORN ')) {
      born = line.slice('GUARD BORN '.length, 'GUARD BORN '.length + 10);
      continue;
    }
    const [date, laneTok, era] = line.split(' ');
    if (date === etDate && laneTok === lane && era) eras.add(era);
  }
  return { born, eras };
}

/**
 * Verify every era stamped on stored picks for `etDate` was produced by a run
 * recorded in this folder's ledger. `storedEras` is the array of prompt_sha
 * values read from the database (nulls filtered by the caller). Returns a list
 * of human-readable problem strings — empty means clean. Dates before the
 * guard was born are skipped (no ledger existed to record them).
 */
export function checkEraDrift(lane, etDate, storedEras) {
  const stamped = [...new Set(storedEras.filter(Boolean))];
  if (stamped.length === 0) return [];
  const { born, eras } = readLedger(etDate, lane);
  if (!eras) return []; // guard not born yet — nothing to compare against
  if (born && etDate < born) return []; // pre-guard history
  const problems = [];
  if (eras.size === 0) {
    problems.push(`${lane} picks exist for ${etDate} stamped [${stamped.join(', ')}] but NO ${lane} run from ${PROJECT_DIR} is on record — another writer made production picks`);
    return problems;
  }
  for (const era of stamped) {
    if (!eras.has(era)) {
      problems.push(`${lane} pick era ${era} on ${etDate} was NOT produced by any recorded run from ${PROJECT_DIR} (local runs: [${[...eras].join(', ')}]) — another writer made production picks`);
    }
  }
  return problems;
}
