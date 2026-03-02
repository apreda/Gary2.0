/**
 * NFL Props Constitution v4.0 — Phase-Aligned Sectioned Object
 *
 * Built on the unified Props Sharp Framework (sectioned).
 * Each section is injected at the pass where Gary needs it.
 * Core philosophy: THE FOUR INVESTIGATIONS (Sports-First Approach)
 */

import { getPropsSharpFramework } from './propsSharpFramework.js';

const FRAMEWORK = getPropsSharpFramework();

// ── NFL sport-specific awareness (Pass 1 — investigation context) ────
const NFL_SPORT_AWARENESS = `
## [NFL] NFL-SPECIFIC AWARENESS

### THE SPORT (Props Context)
- Game script drives NFL counting stat production — play-calling changes dramatically based on score
- Stars don't sit in NFL blowouts, but their ROLE changes — trailing teams pass more, leading teams run more
- Target share is the foundation for WR/TE props — a player's share of team targets determines opportunity floor
- Carry share is the foundation for RB props — committee splits and game script interact to determine volume
- Snap percentage and route participation measure different types of involvement
- TD props are fundamentally different from yardage props — red zone role matters more than overall volume
- Defensive personnel absences affect coverage assignments and create matchup shifts

### THE PROP LINE
- Prop lines are primarily set from a player's season averages and recent form
- Game script expectations from the spread are partially priced into props — but the degree varies
- Injury news and lineup confirmations move prop lines — the timing of when information becomes available matters
- Prop markets have less betting volume than game spreads and totals — lines can be less precise
- Multiple props on the same player are correlated — receiving yards, receptions, and TDs are not independent outcomes

### [NFL] NFL STAT AWARENESS DETAILS

**Receiving Yards Props:**
- Target share is the driver (not route participation)
- Air yards share reflects target depth and role in the passing attack
- ADOT (Average Depth of Target) for big play potential
- CB matchup affects efficiency and production profile

**Rushing Yards Props:**
- Carry share is the foundation
- Game script determines opportunity
- Box count (light boxes = running lanes)
- O-line performance / run blocking grade

**TD Props (DIFFERENT from counting props):**
- Red zone target/carry share is the driver
- NOT overall volume or yardage efficiency
- TD props are high-variance binary events
- Goal-line role and total touches can tell different stories about a player's scoring profile

### [NFL] NFL STRUCTURAL MISMATCH EXAMPLES

**Role Changes:**
- WR injuries redistribute target share among remaining receivers
- Recent trades change a player's target distribution and role
- RB committee dynamics shift with injuries, benchings, and performance

**Matchup Factors (NFL-specific):**
- Defensive personnel absences affect coverage assignments
- Zone-heavy defenses interact differently with YAC receivers than man coverage
- Run defense quality and box counts affect rushing opportunity
- Slot corner matchups differ from outside corner matchups

**Game Script Factors:**
- The spread implies an expected game flow — play-calling adjusts to score
- Trailing teams increase pass rate, leading teams increase run rate
- Different players see different volume depending on game script
`;

// ── NFL evaluation specifics (Pass 2.5 — evaluation context) ─────────
const NFL_EVALUATION = `
### [KEY] NFL VOLUME FLOOR AWARENESS

**WR/TE Props:**
- Target share is the primary volume driver for receiving production
- Snap percentage and route participation are volume metrics
- Air yards share provides context on role (short dump-offs vs deep shots)

**RB Props:**
- Carry share and snap percentage show the backfield distribution
- Game script interacts with rushing volume — each team adjusts differently

### [KEY] NFL GAME SCRIPT AWARENESS

- Game script affects play-calling ratios — teams that are leading or trailing adjust their approach
- The degree of adjustment varies by team, coach, and situation
- Large spreads create uncertainty about late-game deployment
- The prop line may or may not already account for expected script

### [NFL] TD PROP AWARENESS

TD props are fundamentally different from yardage props.

- Red zone role and overall volume can tell different stories about a player's scoring profile
- TD props are high-variance binary events — different analysis than counting stats
`;

// ── NFL output format (Pass 3 — output context) ─────────────────────
const NFL_OUTPUT_FORMAT = `
### [OUTPUT] NFL OUTPUT FORMAT

For each pick, provide:
1. **THE PICK:** Player Name OVER/UNDER Stat Line (Odds)
2. **THE STRUCTURAL MISMATCH:** One sentence on what the market hasn't priced
3. **VOLUME FLOOR CHECK:** Target share/carry share and projection vs line
4. **GAME SCRIPT:** Expected game flow and effect on this prop
5. **THE RISK:** Concrete scenario where this loses
6. **WHY THE MARKET IS WRONG:** Why your mismatch matters tonight
`;

// ── Sectioned export ─────────────────────────────────────────────────
export const NFL_PROPS_CONSTITUTION = {
  pass1: FRAMEWORK.pass1 + '\n\n' + NFL_SPORT_AWARENESS.trim(),
  pass2: FRAMEWORK.pass2,
  pass25: FRAMEWORK.pass25 + '\n\n' + NFL_EVALUATION.trim(),
  pass3: FRAMEWORK.pass3 + '\n\n' + NFL_OUTPUT_FORMAT.trim(),
};

export default NFL_PROPS_CONSTITUTION;
