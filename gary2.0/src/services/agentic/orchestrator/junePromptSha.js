/**
 * The June engine's era stamp — one hash over everything that shapes what
 * Gary reads: the static prompt surface (constitution, factor lenses, pass
 * builders) AND the dossier-surface files themselves (scout builder family,
 * shelf renderers, researcher checklist + factor plan, advisor prompt).
 *
 * Extended Aug 19 2026 (founder's ledger law): twice in 24 hours a dossier
 * generation changed with no era change and the ledger couldn't see it. Any
 * edit to these files — content or code — is a new era by definition; cheap
 * era churn beats an unreadable ledger. Extracted from run-agentic-picks so
 * production-truth prints the live June era without importing the runner.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { MLB_CONSTITUTION } from '../constitution/mlbConstitution.js';
import { getMlbSpreadFactors, getMlbSeasonAwareness } from './spreadEvaluationFactors.js';
import { buildPass1Message, buildPass25Message, buildPass3Unified } from './passBuilders.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER_SURFACE_FILES = [
  '../scoutReport/sports/mlb.js',
  '../scoutReport/sports/mlbPlatoonRecency.js',
  '../scoutReport/sports/mlbSeasonContext.js',
  '../scoutReport/sports/mlbSeriesState.js',
  '../scoutReport/sports/mlbGamesAsWritten.js',
  '../scoutReport/sports/mlbContactQuality.js',
  '../scoutReport/sports/mlbInjuryContext.js',
  '../scoutReport/sports/pitcherArc.js',
  '../tools/statRouters/mlbFetchers.js',
  '../flashInvestigationPrompts.js',
  './researchBriefing.js',
  // The factor PLAN is dossier surface too — its order is the briefing's
  // order (added Aug 19 with the situation-first walk).
  './investigationFactors.js',
];

let _sha = null;

/** 12-char sha of the full June-engine surface. Memoized per process. */
export function junePromptSha() {
  if (_sha) return _sha;
  const dossierSurface = DOSSIER_SURFACE_FILES.map((rel) => {
    try { return readFileSync(path.join(here, rel), 'utf8'); }
    catch { return `missing:${rel}`; }
  }).join('\n⸻\n');
  const staticSurface = [
    // Engine-shape markers: not prompt text, but changes to what Gary
    // receives that live outside the hashed files. Each is a new era.
    'RESEARCHER=OFF, ALL SPORTS (founder kill, Aug 27 2026 — the desk is the evidence, standardized; a second author is banned)',
    'ONE BRAIN PER PICK (founder, Aug 27 2026 — no mid-conversation model switch; a failed brain means the whole game re-runs on the next one)',
    MLB_CONSTITUTION.pass1Context,
    MLB_CONSTITUTION.bilateralCasePrompt('HOME', 'AWAY'),
    getMlbSpreadFactors(),
    getMlbSeasonAwareness(),
    buildPass1Message('SCOUT', 'HOME', 'AWAY', 'DATE', 'baseball_mlb', 0),
    buildPass25Message('HOME', 'AWAY', 'MLB', 0, ''),
    buildPass3Unified('HOME', 'AWAY', { sport: 'MLB' }),
    dossierSurface,
  ].join('\n⸻\n');
  _sha = createHash('sha256').update(staticSurface).digest('hex').slice(0, 12);
  return _sha;
}

export default junePromptSha;
