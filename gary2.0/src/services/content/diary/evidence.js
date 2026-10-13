/** Exact inputs retained for the separate notebook experiment, never public picks. */
export const AUTOPSY_REVIEW_VERSION = 'decision-quality-v2';

export function pregameEvidence({ rationale = null, caseHome = null, caseAway = null, desk = null, briefing = null, notebook = null, pickText = null, price = null, model = null, era = null, capturedAt = null, provenance = null } = {}) {
  return {
    pick_text: pickText, price, model, era, captured_at: capturedAt, provenance,
    rationale, case_home: caseHome, case_away: caseAway,
    desk, research_briefing: briefing, notebook,
  };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** A matchup alone can select the wrong doubleheader/replaced ticket. Require both. */
export function matchingDesk(rows, { homeTeam, awayTeam, pickText, sameMatchupGames = 1 }) {
  // The existing desk table is keyed by date + matchup, not game id. Even
  // an identical ticket cannot identify the right game of a doubleheader.
  if (sameMatchupGames !== 1) return null;
  const matches = (rows || []).filter((r) => norm(r.matchup) === norm(`${awayTeam} @ ${homeTeam}`)
    && String(r.pick || '').trim() === String(pickText || '').trim());
  return matches.length === 1 ? matches[0] : null;
}

export function evidenceSources(input = {}) {
  const e = input.pregameEvidence || {};
  return {
    rationale: e.rationale || input.rationale || '',
    case_home: e.case_home || '', case_away: e.case_away || '',
    case_selected: input.caseText || '',
    desk: e.desk || '', research_briefing: e.research_briefing || '', notebook: e.notebook || '',
    game_story: input.story || '',
  };
}
