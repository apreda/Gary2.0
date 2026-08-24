import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHARED_SURFACE = [
  './footballPromptSha.js',
  './passBuilders.js',
  './agentLoop.js',
  './orchestratorMain.js',
  './spreadEvaluationFactors.js',
  './footballResearchPolicy.js',
  './researchBriefing.js',
  './investigationFactors.js',
  './responseParser.js',
  '../flashInvestigationPrompts.js',
  '../scoutReport/shared/dataFetchers.js',
  '../scoutReport/shared/anthropicFootballGrounding.js',
  '../../marketTruth.js',
  '../../oddsService.js',
];

const SPORT_SURFACE = {
  NFL: [
    '../constitution/nflConstitution.js',
    '../scoutReport/sports/nfl.js',
  ],
  NCAAF: [
    '../constitution/ncaafConstitution.js',
    '../scoutReport/sports/ncaaf.js',
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
