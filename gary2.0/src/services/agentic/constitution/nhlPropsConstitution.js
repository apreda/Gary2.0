/**
 * NHL Props Constitution v4.0 — Phase-Aligned Sectioned Object
 *
 * Built on the unified Props Sharp Framework (sectioned).
 * Each section is injected at the pass where Gary needs it.
 * Core philosophy: THE FOUR INVESTIGATIONS (Sports-First Approach)
 */

import { getPropsSharpFramework } from './propsSharpFramework.js';

const FRAMEWORK = getPropsSharpFramework();

// ── NHL sport-specific awareness (Pass 1 — investigation context) ────
const NHL_SPORT_AWARENESS = `
## [NHL] NHL-SPECIFIC AWARENESS

### THE SPORT (Props Context)
- Ice time drives counting stat production — a player's output in shots, points, and goals scales directly with minutes on ice
- PP1 status is the primary separator — a player on the first power play unit lives in a different production tier than an even-strength grinder
- 5-on-4 creates shooting lanes and set plays designed to generate high-quality chances
- Pace of play varies by team — some play high-event hockey, others play low-event
- NHL blowouts barely affect player props — stars play their normal shifts even in lopsided games (no "garbage time" in hockey)
- Goalie deployment on back-to-backs changes the saves landscape — backup goalies have different profiles than starters
- Pulled goalies in the final minutes create empty-net scoring opportunities and change shot dynamics

### THE PROP LINE
- Prop lines are primarily set from a player's season averages and recent form
- PP1 status changes can lag in prop line adjustments — promotions and demotions take time to reflect
- Goalie confirmation (starter vs backup) moves saves and goal-scoring environment props
- Prop markets have less betting volume than game spreads and totals — lines can be less precise
- Multiple props on the same player are correlated — SOG, points, and goals are not independent outcomes

### [NHL] NHL STAT AWARENESS DETAILS

**Shots on Goal (SOG) Props:**
- iCF (shot attempts) is the driver, not shooting %
- PP TOI creates shot opportunities
- SOG conversion rate (attempts → on goal) is ~50-55%
- Opponent shot suppression affects volume

**Points Props:**
- PP1 status + PP TOI is the foundation
- Linemate quality (who converts your passes?)
- Team scoring environment (implied goals)
- Opponent's PK quality

**Anytime Goal Props:**
- Shooting % is highly variable — 3-game trends are noise
- High-danger chance rate matters more than overall shot volume
- PP1 creates goal opportunities
- Opponent goalie's performance affects goal-scoring environment

**Goalie Saves Props:**
- Opponent shot volume is the primary driver
- Opponent pace of play affects shot totals
- Own team's PK performance affects shot volume faced
- Backup goalie starts change the saves landscape

### [NHL] NHL STRUCTURAL MISMATCH EXAMPLES

**Role Changes:**
- PP1 promotions change a player's shot and point opportunity
- Linemate injuries redistribute ice time and offensive role
- Recent trades change a player's role and deployment

**Matchup Factors (NHL-specific):**
- Backup goalies have different save percentages than starters
- Teams with high penalty differentials create more special teams time
- Pace of play varies by team — some play high-event hockey, others play low-event
- PK quality varies and affects PP production

**Schedule Factors:**
- Back-to-back games affect goalie deployment and skater fatigue
- Travel distance and time zones affect performance
- Rest differentials exist between teams on different schedules
`;

// ── NHL evaluation specifics (Pass 2.5 — evaluation context) ─────────
const NHL_EVALUATION = `
### [KEY] NHL VOLUME FLOOR AWARENESS

- Ice time, power play deployment, and shot generation rate are the foundation of NHL counting stats
- PP1 status separates production tiers — power play time creates different opportunity than even-strength

### [KEY] NHL SCHEDULE CONTEXT (Instead of Blowout Risk)

Unlike NBA/NFL, NHL blowouts barely affect player props. Stars play their normal shifts even in 5-1 games.
There's no "garbage time" in hockey.

**WHAT ACTUALLY MOVES THE NEEDLE IN NHL:**

**1. BACK-TO-BACKS (B2B)**
- Starting goalie often rests on B2B — backup goalie starts
- Top-line forwards may see reduced TOI on the second night
- PP1 usage typically remains unchanged

**2. TRAVEL**
- Cross-country travel and early starts affect performance
- Road trips compound fatigue over multiple games

**3. BACKUP GOALIE**
- Backup goalies have different save percentages than starters
- The goalie matchup affects the scoring environment for both teams

### [GOALIE] PULLED GOALIE AWARENESS
- Trailing teams pull their goalie in the final minutes for an extra skater — the goalie stops facing shots during that window
- Empty-net situations create scoring opportunities for the leading team's forwards
- Trailing teams may generate more shot attempts in desperation, but the goalie is off the ice for the final stretch
`;

// ── NHL output format (Pass 3 — output context) ─────────────────────
const NHL_OUTPUT_FORMAT = `
### [OUTPUT] NHL OUTPUT FORMAT

For each pick, provide:
1. **THE PICK:** Player Name OVER/UNDER Stat Line (Odds)
2. **PP1 STATUS:** Yes/No (critical context)
3. **THE STRUCTURAL MISMATCH:** One sentence on what the market hasn't priced
4. **VOLUME FLOOR CHECK:** TOI, PP TOI, iCF, and projection vs line
5. **SCHEDULE CONTEXT:** B2B, travel, backup goalie, or N/A
6. **THE RISK:** Concrete scenario where this loses
7. **WHY THE MARKET IS WRONG:** Why your mismatch matters tonight
`;

// ── Sectioned export ─────────────────────────────────────────────────
export const NHL_PROPS_CONSTITUTION = {
  pass1: FRAMEWORK.pass1 + '\n\n' + NHL_SPORT_AWARENESS.trim(),
  pass2: FRAMEWORK.pass2,
  pass25: FRAMEWORK.pass25 + '\n\n' + NHL_EVALUATION.trim(),
  pass3: FRAMEWORK.pass3 + '\n\n' + NHL_OUTPUT_FORMAT.trim(),
};

export default NHL_PROPS_CONSTITUTION;
