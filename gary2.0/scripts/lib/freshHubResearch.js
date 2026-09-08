import { oneRunResearchDetail, RESEARCH_FACTS_VERSION, observedCount } from '../../src/services/insights/researchFacts.js';
import { HUB_RESEARCH_COPY_VERSION, researchCopyIsSupported } from '../../src/services/insights/researchCopyPolicy.js';

/** Explicit reviewed artifact only. No broad recollection or extraction from
 * old prose: the separately verified source supplies typed completed records. */
export function reviewedFreshOneRunPatch(row, artifact, today, upgradedAt = new Date().toISOString()) {
  const fresh = artifact?.fresh, facts = fresh?.meta;
  if (!row || row.date !== today || artifact?.date !== today || fresh?.date !== today
    || row.league !== 'MLB' || fresh.league !== 'MLB' || row.result !== null || row.graded_at != null
    || row.generated_by !== 'insights-cli' || row.category !== 'regression_watch' || fresh.category !== row.category
    || String(row.id) !== String(artifact.target_row_id) || row.meta?.research_copy_version != null
    || row.team_id == null || row.game_id == null || row.player_id != null
    || String(row.team_id) !== String(fresh.team_id) || String(row.game_id) !== String(fresh.game_id)
    || facts?.kind !== 'one_run_record' || facts.research_facts_version !== RESEARCH_FACTS_VERSION
    || facts.history_before !== today || String(facts.season) !== today.slice(0, 4)) return null;
  const counts = [facts.one_run_wins, facts.one_run_losses, facts.other_wins, facts.other_losses].map(observedCount);
  const games = facts.source_game_ids;
  if (counts.includes(null) || !Array.isArray(games) || games.some(id => observedCount(id) === null || Number(id) <= 0)
    || new Set(games.map(String)).size !== games.length || games.length !== counts.reduce((sum, count) => sum + count, 0)) return null;
  const detail = oneRunResearchDetail(facts);
  if (!detail || fresh.detail !== detail || !researchCopyIsSupported(detail, detail)) return null;
  return { detail, meta: { ...row.meta, ...facts, computed_detail: detail, read: detail, evidence: detail,
    research_copy_version: HUB_RESEARCH_COPY_VERSION, research_copy_source: 'reviewed_fresh_source_measurements',
    research_copy_upgraded_at: upgradedAt } };
}
