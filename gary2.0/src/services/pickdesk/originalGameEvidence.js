import { winnersPickIsHome, publishedDecisionMatches } from './winnersAdmissions.js';

/** One frozen input envelope for the direct queue and publication recovery. */
export function originalGameEvidence({ result, pick, deskText, first = 'home' }) {
  return {
    snapshotVersion: 2,
    pickSnapshot: pick,
    deskText,
    caseHome: pick.path_home ?? result?.path_home ?? null,
    caseAway: pick.path_away ?? result?.path_away ?? null,
    researchBriefing: result?._context?.researchBriefing || result?._researchBriefing || null,
    toolResponses: result?._originalToolResponses || [],
    homeTeam: pick.homeTeam, awayTeam: pick.awayTeam,
    pickIsHome: winnersPickIsHome(pick), commenceTime: pick.commence_time,
    observedAt: result?._evidenceObservedAt || new Date().toISOString(),
    first,
  };
}

export function originalEvidenceMatches(evidence, pick, date, league) {
  return evidence?.snapshotVersion === 2 && evidence.deskText &&
    publishedDecisionMatches(pick, evidence.pickSnapshot, { date, league, kind: 'game' });
}

export function reviewSourceDesk(evidence) {
  const blocks = [evidence.deskText];
  if (evidence.researchBriefing) blocks.push(
    '## ORIGINAL RESEARCH BRIEFING — reported findings and interpretation, not independent verification\n' + evidence.researchBriefing);
  if (evidence.toolResponses?.length) blocks.push(
    '## ORIGINAL TOOL RESPONSES — exact outputs received during this decision; source limits and errors remain part of the evidence\n' +
    evidence.toolResponses.map(r => `### ${r.name} (${r.observedAt || 'time unavailable'})\n${typeof r.content === 'string' ? r.content : JSON.stringify(r.content)}`).join('\n\n'));
  return blocks.filter(Boolean).join('\n\n');
}
