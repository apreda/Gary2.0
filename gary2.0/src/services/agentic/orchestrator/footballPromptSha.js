import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHARED_SURFACE = [
  './footballPromptSha.js',
  './passBuilders.js',
  './evidenceQuality.js',
  './agentLoop.js',
  './orchestratorMain.js',
  './orchestratorHelpers.js',
  '../tools/playerGameLogTool.js',
  '../../playerGameLogFacts.js',
  '../../ballDontLieService.js',
  // The system prompt file (extracted from orchestratorMain Sep 1 2026 —
  // without this line the extraction would have dropped the identity +
  // FACT-CHECKING + BASE_RULES surface out of the football era).
  './garySystemPrompt.js',
  '../constitution/index.js',
  './spreadEvaluationFactors.js',
  // (researchBriefing.js, investigationFactors.js, flashInvestigationPrompts.js,
  // footballResearchPolicy.js deleted Sep 1 2026 — the researcher's corpse
  // left the tree.)
  './responseParser.js',
  '../scoutReport/shared/dataFetchers.js',
  '../scoutReport/shared/anthropicFootballGrounding.js',
  // Grounded-search facades (Sep 1 2026 codex-first cutover) — the
  // retriever shapes desk content, so it rides the era.
  '../scoutReport/shared/grounding.js',
  '../scoutReport/shared/anthropicWebSearch.js',
  './requestCancellation.js',
  '../../pickdesk/webSearch.js',
  // The stat routers ARE the evidence surface: what a factor returns decides
  // what Gary reads. Before Aug 24 2026 they were unhashed, so ten fetchers
  // reading nonexistent BDL fields — and their repair — left the era stamp
  // unchanged. MLB extended junePromptSha over its dossier surface for the
  // same reason (e3f5e350); football now matches. Refactors churn the era too,
  // which is intended.
  '../tools/statRouters/index.js',
  '../tools/statRouters/statRouterCommon.js',
  '../tools/statRouters/footballTeamGames.js',
  '../tools/toolDefinitions.js',
  '../../marketTruth.js',
  '../../oddsService.js',
  // The line-history sentence on every football desk (Sep 1 2026) — its
  // wording is desk content.
  '../../oddsSnapshots.js',
  // The ticket menu the football desk prints (menuTruthLines) is defined
  // here — desk content, so the football era moves with it.
  './mlbCaseMenu.js',
  // The 15 ledger tokens are assigned into nflFetchers at load; the file
  // that defines them shapes the desk as much as the fetcher file does.
  '../tools/statRouters/footballAdvancedTokens.js',
];

const SPORT_SURFACE = {
  NFL: [
    '../constitution/nflConstitution.js',
    '../scoutReport/sports/nfl.js',
    '../tools/statRouters/nflFetchers.js',
  ],
  NCAAF: [
    '../tools/ncaafTokenContract.js',
    '../constitution/ncaafConstitution.js',
    '../scoutReport/sports/ncaaf.js',
    '../scoutReport/sports/ncaafPlayerEvidence.js',
    '../tools/statRouters/ncaafFetchers.js',
    // (nflFetchers.js left this list Sep 1 2026: LEAGUE_ISOLATED in the
    // router blocks NCAAF from the NFL fetchers — the Aug 25 isolation law —
    // so NFL-only edits no longer move the NCAAF era.)
  ],
};

const memo = new Map();

/** Stable 12-character fingerprint of the complete football decision surface. */
export function footballPromptSha(sport) {
  const league = sport === 'NCAAF' || sport === 'americanfootball_ncaaf' ? 'NCAAF' : 'NFL';
  if (memo.has(league)) return memo.get(league);
  const files = [...SHARED_SURFACE, ...SPORT_SURFACE[league]];
  const surface = files.map((relative) => {
    try { return `${relative}\n${readFileSync(path.join(here, relative), 'utf8')}`; }
    catch { return `missing:${relative}`; }
  }).join('\n⸻\n');
  const sha = createHash('sha256').update(`${league}\n${surface}`).digest('hex').slice(0, 12);
  memo.set(league, sha);
  return sha;
}

export default footballPromptSha;
