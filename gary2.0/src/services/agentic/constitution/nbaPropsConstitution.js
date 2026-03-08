/**
 * NBA Props Constitution v4.0 — Phase-Aligned Sectioned Object
 *
 * Built on the unified Props Sharp Framework (sectioned).
 * Each section is injected at the pass where Gary needs it.
 * Core philosophy: THE FOUR INVESTIGATIONS (Sports-First Approach)
 */

import { getPropsSharpFramework } from './propsSharpFramework.js';

const FRAMEWORK = getPropsSharpFramework();

// ── NBA sport-specific awareness (Pass 1 — investigation context) ────
const NBA_SPORT_AWARENESS = `
## [NBA] NBA-SPECIFIC AWARENESS

### THE SPORT (Props Context)
- Minutes on the floor drive counting stat production — a player's output in points, rebounds, assists, and other categories scales directly with playing time
- Usage within a team is zero-sum — when one player handles more possessions, others handle fewer
- Pace creates or suppresses counting stat opportunity — faster-paced games produce more total possessions and more stat opportunity for all players
- Blowouts compress star minutes — large leads in the fourth quarter lead to bench lineups and reduced playing time for starters
- Role changes from injuries, trades, or lineup shifts redistribute opportunity — the remaining players' usage and minutes adjust
- Back-to-back games can reduce star minutes through load management or fatigue
- Foul trouble is an unpredictable risk that can cap any player's minutes in any game

### THE PROP LINE
- Prop lines are primarily set from a player's season averages and recent form
- Prop markets have less betting volume than game spreads and totals — lines can be less precise
- Injury news and lineup confirmations move prop lines — the timing of when information becomes available matters
- Star player props attract more public betting attention than role player props
- Multiple props on the same player are correlated — points, rebounds, and assists are not independent outcomes

### [NBA] NBA STRUCTURAL AWARENESS
- Role changes from injuries, trades, or lineup shifts take time to show up in season averages — recent game logs may tell a different story
- Tonight's matchup interacts with each player's specific production profile
`;

// ── NBA evaluation specifics (Pass 2.5 — evaluation context) ─────────
const NBA_EVALUATION = `
### [KEY] NBA VOLUME FLOOR AWARENESS

- Minutes and usage are the foundation of counting stat production
- Recent minute trends (L5 vs season) reveal whether playing time is stable or shifting

### [KEY] NBA DOWNSIDE AWARENESS
- Large spreads imply blowout probability — starters see reduced minutes
- Foul trouble can cap minutes in any game
- Back-to-back games can reduce star minutes through load management
- Teams distribute minutes differently in blowout scenarios
`;

// ── NBA output format (Pass 3 — output context) ─────────────────────
const NBA_OUTPUT_FORMAT = `
### [OUTPUT] NBA OUTPUT FORMAT

For each pick, provide:
1. **THE PICK:** Player Name OVER/UNDER Stat Line (Odds)
2. **THE KEY FACTOR:** The game-specific evidence supporting your pick
3. **VOLUME FLOOR CHECK:** MPG, USG%, and how they interact with tonight's matchup
4. **THE RISK:** Concrete scenario where this loses
5. **KEY FACTOR:** The game-specific evidence supporting your pick
`;

// ── Sectioned export ─────────────────────────────────────────────────
export const NBA_PROPS_CONSTITUTION = {
  pass1: FRAMEWORK.pass1 + '\n\n' + NBA_SPORT_AWARENESS.trim(),
  pass2: FRAMEWORK.pass2,
  pass25: FRAMEWORK.pass25 + '\n\n' + NBA_EVALUATION.trim(),
  pass3: FRAMEWORK.pass3 + '\n\n' + NBA_OUTPUT_FORMAT.trim(),
};

export default NBA_PROPS_CONSTITUTION;
