/**
 * DFS Investigation Prompts — Per-Sport Factor Lists
 *
 * DFS-specific investigation methodology for the Phase 2 Flash research assistant.
 * Unlike game pick investigation (single-game deep dive), DFS investigation covers
 * an entire SLATE of games — broader but targeted at DFS-relevant factors.
 *
 * Modeled after flashInvestigationPrompts.js but adapted for multi-game slate analysis.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// NBA DFS INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════════════

const NBA_DFS_FACTORS = `## DFS INVESTIGATION CHECKLIST — NBA

Work through each factor below for the ENTIRE SLATE. Do NOT skip any. For each factor, investigate all relevant teams and report findings with specific numbers.

### 1. INJURY LANDSCAPE
**Tools:** GET_TEAM_INJURIES for EVERY team on the slate
- Check injury status for ALL teams — document who is OUT, GTD, Questionable
- Note duration tags: RECENT (0-2 games, <5 days), ESTABLISHED (3-10 games), LONG-TERM (11+ games)
- RECENT absences are the most DFS-relevant — salaries and ownership may not fully reflect them
- ESTABLISHED/LONG-TERM absences are already priced into salaries and teammate production

### 2. GAME ENVIRONMENTS
**Tools:** GET_GAME_ENVIRONMENT for each game
- Document O/U, spread, implied totals, pace for every game
- Rank games by total scoring environment (highest O/U = most fantasy opportunity)
- Note the slate average O/U and each game's position relative to it

### 3. USAGE SHIFTS
**Tools:** GET_TEAM_USAGE_STATS for teams with notable absences
- For teams missing key players (especially RECENT absences), investigate who absorbs the workload
- Compare L5 usage/minutes to season averages — rising usage + stable minutes = real shift
- Report the specific numbers: "Player X has 28% USG L5 vs 22% season since Player Y went out"

### 4. PACE MATCHUPS
**Tools:** GET_GAME_ENVIRONMENT (pace data)
- Identify the fastest and slowest pace matchups on the slate
- Combined pace (home + away) indicates possession volume — more possessions = more fantasy opportunity
- Note mismatches: fast team hosting slow team — who controls tempo?

### 5. VALUE-SALARY GAPS
**Tools:** GET_PLAYER_SALARY, GET_TEAM_USAGE_STATS
- Where does recent production (L5 FPTS) diverge from current salary pricing?
- Players with rising roles but lagging salary adjustments represent value
- Players with declining production but high salary represent potential fades

### 6. BLOWOUT RISK
**Tools:** GET_GAME_ENVIRONMENT (spread data)
- Identify games with spreads of 8+ points — starters in blowouts lose late-game minutes
- For large favorites: star players may sit Q4 in blowouts, capping ceiling
- For large underdogs: garbage time can inflate stats but minutes are less predictable

### 7. BACK-TO-BACK SITUATIONS
**Tools:** GET_GAME_ENVIRONMENT (B2B flags)
- Document which teams are on the second night of a B2B
- B2B teams may rest players or manage minutes — check for any rest news
- B2B can also create opportunity: if a star sits, teammates get expanded roles

### 8. STACKING ENVIRONMENTS
No direct tool — SYNTHESIZE from game environment + injury data
- Identify the best stacking candidates: games with HIGH O/U + COMPETITIVE spread + HIGH pace
- Note games with O/U above slate average AND spread under 6 points
- Note which games have both sides with high implied totals (bring-back stack potential)

### 9. BREAKING NEWS
**Tools:** SEARCH_LIVE_NEWS
- Search for late scratches, rest decisions, lineup changes for today's slate
- Focus on news from the last 6 hours — anything not yet reflected in injury reports
- Late-breaking absences are the highest-value DFS information (ownership hasn't adjusted)
`;

// ═══════════════════════════════════════════════════════════════════════════════
// NFL DFS INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════════════

const NFL_DFS_FACTORS = `## DFS INVESTIGATION CHECKLIST — NFL

Work through each factor below for the ENTIRE SLATE. Do NOT skip any. For each factor, investigate all relevant teams and report findings with specific numbers.

### 1. INJURY LANDSCAPE
**Tools:** GET_TEAM_INJURIES for EVERY team on the slate
- Focus on skill position players: QB, RB1, WR1/WR2/WR3, TE1
- Note duration tags: RECENT vs ESTABLISHED vs LONG-TERM
- QB injuries cascade — backup QBs change the entire passing game environment
- RB1 injuries create clear workload redistribution to RB2

### 2. GAME ENVIRONMENTS
**Tools:** GET_GAME_ENVIRONMENT for each game
- Document O/U, spread, implied totals for every game
- Rank games by implied total (both sides) — highest-scoring projected games have the most fantasy equity
- Note the slate average O/U and each game's position relative to it

### 3. USAGE SHIFTS
**Tools:** GET_TEAM_USAGE_STATS for teams with notable absences
- When a WR1 is out, target share redistributes — investigate who benefits
- When an RB1 is out, rush share goes to backup — check snap count trends
- Compare recent target share / rush share to season baselines

### 4. GAME SCRIPT PROJECTIONS
**Tools:** GET_GAME_ENVIRONMENT (spread + implied totals)
- Large favorites (spread 7+) tend toward run-heavy game scripts
- Large underdogs tend toward pass-heavy game scripts (playing from behind)
- Competitive games (spread under 3) tend toward balanced game scripts

### 5. RED ZONE OPPORTUNITIES
No direct tool — SYNTHESIZE from game environments + usage
- Teams with high implied totals project more red zone trips
- TD-dependent positions (RB, goal-line TE) benefit most from high implied totals
- Identify which teams project the most scoring opportunities

### 6. VALUE-SALARY GAPS
**Tools:** GET_PLAYER_SALARY, GET_TEAM_USAGE_STATS
- Where does recent usage (target share, snap count) diverge from salary?
- Newly elevated players (WR3 becomes WR1 due to injury) often have mispriced salaries
- Compare L5 production to current salary — rising production + low salary = value

### 7. STACKING ENVIRONMENTS
No direct tool — SYNTHESIZE from game environment + injury data
- Note games with O/U above slate average AND spread under 6 points
- QB-WR1/WR2 stacks in high-total games link outcomes and raise ceiling
- Bring-back potential: games where both offenses project to score create stack + bring-back opportunity

### 8. WEATHER
**Tools:** SEARCH_LIVE_NEWS
- Search for weather conditions at outdoor game venues for today
- Wind 15+ MPH affects passing conditions
- Rain/snow creates variable conditions
- Dome games are weather-neutral

### 9. BREAKING NEWS
**Tools:** SEARCH_LIVE_NEWS
- Search for today's inactive lists, late scratches, and game-time decisions
- NFL inactive lists are released ~90 minutes before kickoff — this is premium DFS information
- Focus on skill position inactives that create workload redistribution
`;

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

const DFS_INVESTIGATION_MAP = {
  NBA: NBA_DFS_FACTORS,
  NFL: NFL_DFS_FACTORS,
};

/**
 * Get the DFS investigation methodology for a sport.
 *
 * @param {string} sport - 'NBA', 'NFL', etc.
 * @returns {string} Investigation methodology string, or empty string if sport not supported
 */
export function getDFSInvestigationPrompt(sport) {
  const key = (sport || '').toUpperCase();
  return DFS_INVESTIGATION_MAP[key] || '';
}
