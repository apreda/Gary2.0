/**
 * MLB Props Constitution v1.0 — Phase-Aligned Sectioned Object
 *
 * Built on the unified Props Sharp Framework (sectioned).
 * Each section is injected at the pass where Gary needs it.
 * Core philosophy: THE FOUR INVESTIGATIONS (Sports-First Approach)
 */

import { getPropsSharpFramework } from './propsSharpFramework.js';

const FRAMEWORK = getPropsSharpFramework();

// ── MLB sport-specific awareness (Pass 1 — investigation context) ────
const MLB_SPORT_AWARENESS = `
## [MLB] MLB-SPECIFIC AWARENESS

### THE SPORT (Props Context)
- Starting pitcher matchup is the primary driver of hitter prop values — the opposing pitcher's handedness, pitch mix, and strikeout rate directly affect hitter production
- Park factors directly affect HR and total bases props — Coors Field inflates, Oracle Park suppresses
- Platoon splits (L/R) matter enormously — a LHB facing a LHP is a fundamentally different prop than vs a RHP
- Weather (wind direction/speed, temperature) affects HR and total bases — wind blowing out at Wrigley is different than wind blowing in
- Lineup position matters — leadoff hitters get more ABs, 3-4-5 hitters get more RBI opportunities
- Bullpen usage affects late-game pitcher strikeout props — if a starter is on a pitch count, the prop line may include bullpen innings
- Game total/implied runs affect scoring-related props (runs, RBIs)

### THE PROP LINE
- Prop lines are set from a player's season averages, recent form, and the opposing pitcher matchup
- Platoon splits can lag in prop line adjustments — a switch hitter facing a LHP vs RHP may not be fully reflected
- Lineup confirmation moves hitter props — a player batting 2nd has different AB expectations than batting 7th
- Pitcher strikeout props are set from the pitcher's K rate and the opposing lineup's K rate — both sides matter
- Prop markets have less betting volume than game spreads and totals — lines can be less precise

### [MLB] MLB PROP TYPES
- **Home Runs:** Park factor + opposing pitcher HR rate + hitter power profile + weather
- **Hits:** Contact rate + opposing pitcher WHIP + platoon split + lineup spot for AB volume
- **Total Bases:** Combines hit probability with extra-base power — park factor and weather compound here
- **RBIs:** Lineup spot (3-4-5 hitters with runners on), team implied runs, opposing pitcher WHIP
- **Runs Scored:** Lineup spot (1-2 hitters score more), team implied runs, OBP of hitters behind them
- **Strikeouts (Pitcher):** Pitcher K/9 vs opposing lineup K rate — the matchup between these two rates is the prop
- **Walks:** Pitcher BB/9, hitter walk rate, plate discipline matchup
- **Stolen Bases:** Runner speed profile, catcher pop time, pitcher slide step, game situation (close games create more SB attempts)

### [MLB] MLB KEY FACTOR EXAMPLES

**Pitcher Matchup Factors:**
- Opposing starter's handedness changes the entire hitting matchup — platoon splits are real in MLB
- Pitch mix matters — a hitter who crushes fastballs facing a fastball-heavy pitcher is a different prop than facing a breaking ball specialist
- Pitcher K rate vs lineup K rate is the strikeout prop matchup — both sides of this equation matter
- Opposing pitcher's HR/FB rate and fly ball tendency affect HR and total bases props

**Venue & Weather Factors:**
- Park dimensions and altitude affect batted ball outcomes — fly balls carry differently at Coors than at Oracle
- Wind direction and speed at outdoor parks affect HR and total bases — wind blowing out inflates, blowing in suppresses
- Temperature affects ball flight — warmer air is less dense, balls carry further
- Retractable roof status (open vs closed) changes the venue's park factor for that game

**Lineup & Role Factors:**
- Lineup position determines AB/PA volume — leadoff gets ~1 more PA per game than the 8-hole
- Lineup position determines RBI/run opportunity — 3-4-5 hitters with baserunners, 1-2 hitters score runs
- Late scratches and lineup changes can shift a player's role and batting order position
- Pinch-hit situations and double switches can cut a player's game short
`;

// ── MLB evaluation specifics (Pass 2.5 — evaluation context) ─────────
const MLB_EVALUATION = `
### [KEY] MLB VOLUME FLOOR AWARENESS

- AB/PA opportunities are the foundation — lineup spot and game total determine how many chances a hitter gets
- Pitcher K props depend on innings pitched — a starter on a pitch count or with a short leash has fewer K opportunities
- Pitcher K rate vs opposing lineup K rate is a two-sided matchup — both rates matter for the prop

### [KEY] MLB BLOWOUT RISK

Unlike NHL, blowouts DO affect MLB props. In lopsided games:
- Star hitters may get pulled in the late innings of blowouts — fewer PA than expected
- Bullpen arms mop up instead of the starter continuing — pitcher K props are affected by early exits
- Position players may pitch in extreme blowouts — scoring environment changes completely
- Pinch runners and defensive replacements remove starters from the game

### [KEY] PARK FACTOR INTEGRATION

- HR props at Coors Field vs Oracle Park require different analysis entirely — the same hitter has different HR probability in different parks
- Total bases props compound with park factor — extra-base hits are more frequent in hitter-friendly parks
- Park factor is not just about HR — some parks suppress doubles (large outfields), others inflate them (short walls)

### [KEY] WEATHER INTEGRATION

- Wind direction + speed + temperature compound with park factors
- Wind blowing out at an already hitter-friendly park amplifies the effect
- Wind blowing in at a pitcher-friendly park amplifies suppression
- Indoor/dome games neutralize weather entirely — only the park factor applies
`;

// ── MLB output format (Pass 3 — output context) ─────────────────────
const MLB_OUTPUT_FORMAT = `
### [OUTPUT] MLB OUTPUT FORMAT

For each pick, provide:
1. **THE PICK:** Player Name OVER/UNDER Stat Line (Odds)
2. **MATCHUP:** Opposing pitcher and L/R matchup
3. **THE KEY FACTOR:** The game-specific evidence supporting your pick
4. **PARK/WEATHER CHECK:** ONLY if park/weather data appears in your provided context — otherwise write exactly "No venue/weather data provided." Never recall a park factor, wind reading, or temperature from memory; an invented "106 park factor" is a fabrication even if it sounds right.
5. **VOLUME FLOOR:** Expected PA/AB, lineup spot, game total context
6. **THE RISK:** Concrete scenario where this loses

### [DATA BOUNDARIES — HARD RULE]
The props pipeline does NOT currently provide: park factors, weather/wind, pitcher pitch-mix percentages, or per-pitch-type batting splits. The awareness sections above explain WHY those factors matter so you can use them WHEN they appear in your context — they are not an invitation to supply values from training memory. If a factor's data is absent, name the factor as unexamined or omit it; never attach a number to it.
`;

// ── Sectioned export ─────────────────────────────────────────────────
export const MLB_PROPS_CONSTITUTION = {
  pass1: FRAMEWORK.pass1 + '\n\n' + MLB_SPORT_AWARENESS.trim(),
  pass2: FRAMEWORK.pass2,
  pass25: FRAMEWORK.pass25 + '\n\n' + MLB_EVALUATION.trim(),
  pass3: FRAMEWORK.pass3 + '\n\n' + MLB_OUTPUT_FORMAT.trim(),
};

export default MLB_PROPS_CONSTITUTION;
