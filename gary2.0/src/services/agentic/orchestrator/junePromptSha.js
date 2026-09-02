/**
 * The June engine's era stamp — one hash over everything that shapes what
 * Gary reads: the static prompt surface (rendered system prompt, constitution,
 * factor lenses, pass builders) AND the dossier-surface files themselves
 * (scout builder family, shelf renderers).
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
import { getConstitution } from '../constitution/index.js';
import { buildSystemPrompt } from './garySystemPrompt.js';
import { getMlbSpreadFactors, getMlbSeasonAwareness } from './spreadEvaluationFactors.js';
import { buildPass1Message, buildPass2Message, buildPass3Unified } from './passBuilders.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER_SURFACE_FILES = [
  '../scoutReport/sports/mlb.js',
  // The four-bucket desk layout (Sep 1 2026) arranges what Gary reads —
  // its order and headers are desk content.
  '../scoutReport/sports/mlbDeskLayout.js',
  '../scoutReport/sports/mlbPlatoonRecency.js',
  '../scoutReport/sports/mlbSeasonContext.js',
  '../scoutReport/sports/mlbSeriesState.js',
  '../scoutReport/sports/mlbGamesAsWritten.js',
  '../scoutReport/sports/mlbContactQuality.js',
  '../scoutReport/sports/mlbInjuryContext.js',
  '../scoutReport/sports/pitcherArc.js',
  '../tools/statRouters/mlbFetchers.js',
  // The pen renderers (Sep 2 2026): every arm newest work first, the games
  // as games — desk text, so an edit there is an era.
  '../tools/statRouters/bullpenLedger.js',
  '../tools/statRouters/penArms.js',
  // The grounded-search facades shape desk content (breaking news, press
  // lanes) — retriever changes are era changes (added Sep 1 2026 with the
  // codex-first grounding cutover).
  '../scoutReport/shared/grounding.js',
  '../../pickdesk/webSearch.js',
  // The parser/normalizer decides how a pick's ticket is read and repriced —
  // mechanics changes there are era changes (added Sep 1 2026 when the
  // legacy -200 ML force was removed).
  './responseParser.js',
  // The ticket menu and the case headings (Sep 1 2026): the "House limit"
  // and "Tickets on this game" sentences every desk prints live here.
  './mlbCaseMenu.js',
  // The line-history sentence in BETTING CONTEXT is worded here (Sep 1 2026).
  '../../oddsSnapshots.js',
  // (flashInvestigationPrompts.js, researchBriefing.js, investigationFactors.js
  // deleted Sep 1 2026 — the researcher's corpse left the tree.)
];

// A representative capped board for hashing the case-menu variants.
const CAPPED_GAME = { moneyline_home: -230, moneyline_away: 210, spread_home: -1.5, spread_home_odds: -111, spread_away: 1.5, spread_away_odds: -109 };

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
    'PASS1 NUDGES=DESK-ONLY v2 (Sep 1 2026 — stall/reminder messages AND the empty-response + fallback nudges in agentLoop.js are desk-only for game lanes; agentLoop is outside this hash, so wording changes there must bump this marker)',
    // The RENDERED system prompt (identity + FACT-CHECKING + BASE_RULES).
    // Until Sep 1 2026 this surface sat outside the hash — a system-prompt
    // edit did not move the era ledger (Aug 19 law violation, found in the
    // Sep 1 process audit).
    buildSystemPrompt(getConstitution('baseball_mlb'), 'baseball_mlb'),
    MLB_CONSTITUTION.pass1Context,
    MLB_CONSTITUTION.bilateralCasePrompt('HOME', 'AWAY'),
    // THE CASE MENU (Sep 1 2026): the capped-game variant of the headings
    // and Pass 1 opening — hash it too, or its wording could drift unseen.
    MLB_CONSTITUTION.bilateralCasePrompt('HOME', 'AWAY', CAPPED_GAME),
    getMlbSpreadFactors(),
    getMlbSeasonAwareness(),
    buildPass1Message('SCOUT', 'HOME', 'AWAY', 'DATE', 'baseball_mlb', 0),
    buildPass1Message('SCOUT', 'HOME', 'AWAY', 'DATE', 'baseball_mlb', 0, { game: CAPPED_GAME }),
    buildPass2Message('HOME', 'AWAY', 'MLB', 0, ''),
    // The unpriced-spread MENU TRUTH branch (Sep 1 2026) renders only when a
    // recovery board carries a spread with no price — hash that variant too,
    // or edits to its wording would never move the era.
    buildPass2Message('HOME', 'AWAY', 'MLB', -1.5, '', { moneyline_home: -100, spread_home: -1.5 }),
    buildPass3Unified('HOME', 'AWAY', { sport: 'MLB' }),
    dossierSurface,
  ].join('\n⸻\n');
  _sha = createHash('sha256').update(staticSurface).digest('hex').slice(0, 12);
  return _sha;
}

export default junePromptSha;
