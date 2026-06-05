/**
 * Soccer (2026 FIFA World Cup) scout report builder. Mirrors sports/mlb.js shape:
 * returns { text, verifiedTaleOfTape, injuries, tokenMenu }.
 *
 * World Cup injuries / suspensions / confirmed lineups / weather come from Flash
 * grounding (no structured injury feed), so injuries is empty here by design.
 */
import * as wc from '../../../fifaWorldCupService.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';

function teamName(side) {
  if (typeof side === 'string') return side;
  return side?.full_name || side?.name || null;
}

// Average the rate stats across a team's COMPLETED matches this edition.
// Returns {} pre-tournament (no matches played) — Tale of Tape shows N/A then.
async function aggregateRateStats(teamId) {
  if (!teamId) return {};
  try {
    const matches = await wc.getMatches({ teamIds: [teamId] });
    const completed = matches.filter(m => m.status === 'completed');
    if (!completed.length) return {};
    const ids = completed.map(m => m.id);
    const allRows = await wc.getTeamMatchStats(ids);
    const stats = allRows.filter(s => s.team_id === teamId);
    if (!stats.length) return {};
    const avg = (f) => {
      const vals = stats.map(s => s[f]).filter(v => typeof v === 'number');
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
    };
    const sum = (f) => stats.map(s => s[f]).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
    const totalPasses = sum('passes_total');
    const accuratePasses = sum('passes_accurate');
    // xGA = the OPPONENT's xG in each of this team's matches. The API has no
    // expected_goals_against field, but the same team_match_stats response
    // carries the other team's row per match — average those.
    const oppXg = allRows
      .filter(s => s.team_id !== teamId && typeof s.expected_goals === 'number')
      .map(s => s.expected_goals);
    return {
      xg: avg('expected_goals'),
      xga: oppXg.length ? oppXg.reduce((a, b) => a + b, 0) / oppXg.length : undefined,
      possession_pct: avg('possession_pct'),
      shots: avg('shots_total'),
      shots_on_target: avg('shots_on_target'),
      big_chances: avg('big_chances'),
      corners: avg('corners'),
      pass_accuracy: totalPasses ? (accuratePasses / totalPasses) * 100 : undefined,
    };
  } catch {
    return {};
  }
}

function standingsFor(standings, teamId) {
  const row = standings.find(s => s.team?.id === teamId);
  if (!row) return {};
  const gp = row.played || 0;
  return {
    group_position: row.position ?? undefined,
    points: row.points ?? undefined,
    // Pre-tournament (0 played) GF/GA must read N/A, not "0.0" — a zero reads
    // as "this team averages 0 goals" and nudges low-total reasoning.
    goals_for: gp > 0 ? row.goals_for / gp : undefined,
    goals_against: gp > 0 ? row.goals_against / gp : undefined,
    record: `${row.won ?? 0}-${row.drawn ?? 0}-${row.lost ?? 0}`,
    group: row.group?.name,
    played: gp,
  };
}

export async function buildSoccerScoutReport(game, options = {}) {
  const homeTeam = teamName(game.home_team) || 'Home';
  const awayTeam = teamName(game.away_team) || 'Away';
  const homeId = game.home_team_data?.id ?? game.home_team?.id ?? null;
  const awayId = game.away_team_data?.id ?? game.away_team?.id ?? null;
  console.log(`[Scout Report] Building WC report: ${homeTeam} vs ${awayTeam}`);

  const [standings, homeAgg, awayAgg] = await Promise.all([
    wc.getGroupStandings().catch(() => []),
    aggregateRateStats(homeId),
    aggregateRateStats(awayId),
  ]);

  const homeStand = standingsFor(standings, homeId);
  const awayStand = standingsFor(standings, awayId);

  const homeProfile = { teamName: homeTeam, record: homeStand.record, seasonStats: { ...homeStand, ...homeAgg } };
  const awayProfile = { teamName: awayTeam, record: awayStand.record, seasonStats: { ...awayStand, ...awayAgg } };

  const stage = game.soccer_stage || 'Group Stage';
  const groupLabel = game.soccer_group ? ` (${game.soccer_group})` : '';
  const ml = game.soccer_three_way_ml;
  const groupRows = standings
    .filter(s => game.soccer_group ? s.group?.name === game.soccer_group : (s.team?.id === homeId || s.team?.id === awayId))
    .map(s => `${s.position}. ${s.team?.name} — ${s.points}pts (${s.won}-${s.drawn}-${s.lost}, GD ${s.goal_difference})`);

  const reportText = [
    `## MATCHUP: ${homeTeam} vs ${awayTeam}`,
    `FIFA World Cup 2026 — ${stage}${groupLabel}. Venue: ${game.venue || 'TBD'}.`,
    groupRows.length ? `\n### GROUP STANDINGS\n${groupRows.join('\n')}` : '',
    `\n### RAW ODDS VALUES (use these EXACT numbers — never approximate odds)`,
    ml ? `3-way moneyline: ${homeTeam} ${ml.home} / Draw ${ml.draw} / ${awayTeam} ${ml.away}` : '3-way moneyline: pending',
    game.soccer_spread
      ? `Asian handicap (main line): ${homeTeam} ${game.soccer_spread.homeValue} @ ${game.soccer_spread.homeOdds} / ${awayTeam} ${game.soccer_spread.awayValue} @ ${game.soccer_spread.awayOdds}`
      : 'Asian handicap: NOT AVAILABLE — do not pick or cite a handicap line',
    game.soccer_total
      ? `Total goals (main line): ${game.soccer_total.line} — Over ${game.soccer_total.over} / Under ${game.soccer_total.under}`
      : 'Total goals: NOT AVAILABLE — do not pick or cite a total',
    `\n(Injuries, suspensions, confirmed lineups, and weather/altitude come from Flash grounding for this match.)`,
  ].filter(Boolean).join('\n');

  const injuries = { home: [], away: [] };
  const verifiedTaleOfTape = buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, 'WC', injuries, [], []);

  return { text: reportText, verifiedTaleOfTape, injuries, tokenMenu: formatTokenMenu('WC') };
}
