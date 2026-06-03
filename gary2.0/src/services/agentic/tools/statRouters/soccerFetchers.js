/**
 * Soccer (World Cup) stat fetchers. Token → async (ctx) => string finding.
 * ctx provides { matchId, homeTeamId, awayTeamId, seasons }. Backed by
 * fifaWorldCupService. Most game-pick depth comes from the scout report; these
 * give Gary/Flash on-demand pulls for specific factors.
 */
import * as wc from '../../../fifaWorldCupService.js';

async function teamFormSummary(ctx = {}) {
  const { matchId } = ctx;
  if (!matchId) return 'No match id available for team form.';
  const form = await wc.getMatchTeamForm([matchId]);
  if (!form.length) return 'No pre-match form data available yet.';
  return form
    .map(f => `team ${f.team_id}: avg rating ${f.avg_rating ?? 'n/a'}, group pos ${f.position ?? 'n/a'}, recent pts ${f.value ?? 'n/a'}`)
    .join(' | ');
}

async function groupStandings() {
  const rows = await wc.getGroupStandings();
  if (!rows.length) return 'Group standings not yet available.';
  return rows
    .map(r => `${r.group?.name} #${r.position} ${r.team?.name}: ${r.points}pts (GD ${r.goal_difference}, ${r.played}gp)`)
    .join(' | ');
}

async function teamMatchStatsSummary(ctx = {}) {
  const { matchId } = ctx;
  if (!matchId) return 'No match id for team match stats.';
  const rows = await wc.getTeamMatchStats([matchId]);
  if (!rows.length) return 'No team match stats yet (match not played).';
  return rows
    .map(s => `team ${s.team_id}: poss ${s.possession_pct}%, xG ${s.expected_goals}, shots ${s.shots_total}/${s.shots_on_target} on target, corners ${s.corners}`)
    .join(' | ');
}

export const soccerFetchers = {
  TEAM_FORM: teamFormSummary,
  RECENT_FORM: teamFormSummary,
  GROUP_STANDINGS: groupStandings,
  GROUP_STAGE_CONTEXT: groupStandings,
  TEAM_MATCH_STATS: teamMatchStatsSummary,
  POSSESSION_STATS: teamMatchStatsSummary,
  EXPECTED_GOALS: teamMatchStatsSummary,
};
