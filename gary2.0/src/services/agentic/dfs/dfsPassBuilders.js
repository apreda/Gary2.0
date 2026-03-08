/**
 * DFS Pass Builders
 *
 * Pass message constructors for Gary's DFS agent loop.
 * Mirrors orchestrator/passBuilders.js but tailored for DFS.
 *
 * Pass 1: All scouting reports + Flash research + investigation instructions
 * Pass 2.5: Competing theses + evaluation prompt + submit instructions
 * Submit Nudge: Structural issues from failed submission
 */

import { getSalaryCap, getRosterSlots } from './dfsSportConfig.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 1: INVESTIGATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build Pass 1 message: all scouting reports + Flash research + investigation prompt.
 *
 * @param {Array} scoutReports - Per-game scouting reports from dfsScoutReportBuilder
 * @param {Array} flashResearch - Per-game Flash research findings
 * @param {Object} context - DFS context
 * @returns {string} Pass 1 user message
 */
export function buildDfsPass1Message(scoutReports, flashResearch, context) {
  const { platform, sport, winningTargets } = context;
  const salaryCap = getSalaryCap(platform, sport);
  const rosterSlots = getRosterSlots(platform, sport);
  const platformName = (platform || 'draftkings').toLowerCase() === 'fanduel' ? 'FanDuel' : 'DraftKings';

  const sections = [];

  // Salary cap and roster structure
  sections.push(`## SLATE OVERVIEW
Platform: ${platformName} ${(sport || 'NBA').toUpperCase()}
Salary Cap: $${salaryCap.toLocaleString()}
Roster Slots: ${rosterSlots.join(', ')} (${rosterSlots.length} players)
Games on Slate: ${scoutReports.length}

## WINNING TARGETS
- To WIN first place: ${winningTargets.toWin} pts
- Top 1%: ${winningTargets.top1Percent} pts`);

  // Per-game scouting reports
  sections.push(`\n${'═'.repeat(80)}\nPER-GAME SCOUTING REPORTS\n${'═'.repeat(80)}`);

  for (const report of scoutReports) {
    sections.push(`\n${'─'.repeat(60)}\nGAME: ${report.game}\n${'─'.repeat(60)}`);
    sections.push(report.garyText);

    // Attach Flash research findings for this game
    const research = (flashResearch || []).find(r =>
      r.homeTeam === report.homeTeam && r.awayTeam === report.awayTeam
    );
    if (research?.briefing) {
      sections.push(`\n### FLASH RESEARCH FINDINGS — ${report.game}\n${research.briefing}`);
    }
  }

  // Investigation instructions
  sections.push(`
${'═'.repeat(80)}
YOUR TASK — INVESTIGATION PHASE
${'═'.repeat(80)}

You have the full scouting report and Flash research for every game on this slate.
Your job now is to INVESTIGATE.

1. Read everything above carefully
2. Use your tools to dig deeper on players, matchups, usage, and injuries that interest you
3. Investigate salary value — compare each player's recent production and ceiling to what their salary implies. The salary IS the market's price. Where is the market wrong?
4. Form your thesis for how to attack this slate — which games to stack, which players offer ceiling, and where production exceeds salary pricing
5. Do NOT submit your lineup yet — investigate first

You have access to tools: GET_PLAYER_GAME_LOGS, GET_TEAM_USAGE_STATS, GET_PLAYER_SEASON_STATS, GET_MATCHUP_DATA, GET_PLAYER_RECENT_VS_OPPONENT, GET_GAME_ENVIRONMENT, GET_TEAM_INJURIES, GET_PLAYER_SALARY, SEARCH_LIVE_NEWS.

Begin your investigation now.`);

  return sections.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASS 2.5: THESIS EVALUATION + SUBMIT INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build Pass 2.5 message: competing theses from advisor + lineup submission prompt.
 *
 * @param {string} advisorTheses - Competing lineup theses from Flash advisor
 * @param {Object} context - DFS context
 * @returns {string} Pass 2.5 user message
 */
export function buildDfsPass25Message(advisorTheses, context) {
  const { platform, sport, winningTargets } = context;
  const salaryCap = getSalaryCap(platform, sport);
  const rosterSlots = getRosterSlots(platform, sport);

  const sections = [];

  // Competing theses
  if (advisorTheses) {
    sections.push(`## COMPETING LINEUP THESES (from independent analyst)
Another analyst reviewed the same data and proposed these competing approaches.
Evaluate them against your own analysis. You are NOT required to follow any —
they are inputs to your decision, not instructions.

${advisorTheses}`);
  }

  // Submit instructions
  sections.push(`## BUILD YOUR LINEUP

Your investigation is thorough. Now build your lineup.

RULES:
- ${rosterSlots.length} players: ${rosterSlots.join(', ')}
- Salary cap: $${salaryCap.toLocaleString()}
- Players from at least 2 different teams
- All players must be from the slate player pool
- Target: ${winningTargets.toWin}+ pts to win first place

When you're ready, call SUBMIT_LINEUP with your final lineup.
You can continue investigating with tools if you need more data before submitting.`);

  return sections.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMIT NUDGE: STRUCTURAL ISSUES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build nudge message when SUBMIT_LINEUP has structural issues.
 *
 * @param {string[]} issues - Structural issues found
 * @param {Object} context - DFS context
 * @returns {string} Correction message
 */
export function buildDfsSubmitNudge(issues, context) {
  const { platform, sport } = context;
  const salaryCap = getSalaryCap(platform, sport);
  const rosterSlots = getRosterSlots(platform, sport);

  return `Your lineup has these issues that MUST be fixed:
${issues.map((iss, i) => `${i + 1}. ${iss}`).join('\n')}

RULES:
- You MUST select exactly ${rosterSlots.length} players for slots: ${rosterSlots.join(', ')}
- All players MUST be from the slate player pool — do NOT invent players
- You MUST use players from at least 2 different teams
- Stay under $${salaryCap.toLocaleString()} salary cap

Fix the issues and call SUBMIT_LINEUP again with the corrected lineup.`;
}
