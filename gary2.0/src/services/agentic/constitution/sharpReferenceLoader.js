/**
 * Sharp Reference Loader
 * Loads reference documents for Gary to use during steel man grading.
 * These are REFERENCE materials, not formulas to apply.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache loaded references
let cachedSharpThinking = null;
let cachedSharpPrinciples = null;
let cachedNcaabPrinciples = null;

/**
 * Load the Sharp Thinking Reference (Philosophy - How Sharps Think)
 * This applies to ALL sports.
 */
export function getSharpThinkingReference() {
  if (!cachedSharpThinking) {
    try {
      cachedSharpThinking = readFileSync(join(__dirname, 'sharpThinkingReference.md'), 'utf-8');
    } catch (error) {
      console.error('[Sharp Reference] Failed to load sharpThinkingReference.md:', error.message);
      cachedSharpThinking = '';
    }
  }
  return cachedSharpThinking;
}

/**
 * Load the Sharp Betting Principles (Data - Hard Numbers)
 * This applies to ALL sports.
 */
export function getSharpBettingPrinciples() {
  if (!cachedSharpPrinciples) {
    try {
      cachedSharpPrinciples = readFileSync(join(__dirname, 'sharpBettingPrinciples.md'), 'utf-8');
    } catch (error) {
      console.error('[Sharp Reference] Failed to load sharpBettingPrinciples.md:', error.message);
      cachedSharpPrinciples = '';
    }
  }
  return cachedSharpPrinciples;
}

/**
 * Load the NCAAB Sharp Principles (NCAAB-Specific)
 * Includes margin question framing and spread-based analysis.
 */
export function getNcaabSharpPrinciples() {
  if (!cachedNcaabPrinciples) {
    try {
      cachedNcaabPrinciples = readFileSync(join(__dirname, 'ncaabSharpPrinciples.md'), 'utf-8');
    } catch (error) {
      console.error('[Sharp Reference] Failed to load ncaabSharpPrinciples.md:', error.message);
      cachedNcaabPrinciples = '';
    }
  }
  return cachedNcaabPrinciples;
}

/**
 * Get a condensed version of the key principles for steel man grading.
 * This is what gets injected into Pass 2 for cross-referencing.
 */
export function getSteelManGradingReference(sport) {
  const isNcaab = sport?.toLowerCase()?.includes('ncaab') || sport?.toLowerCase()?.includes('ncaa');
  const isNba = sport?.toLowerCase()?.includes('nba') && !isNcaab;
  const isNhl = sport?.toLowerCase()?.includes('nhl') || sport?.toLowerCase()?.includes('hockey');
  
  // Core philosophy (applies to all sports) - condensed key points
  const corePhilosophy = `
═══════════════════════════════════════════════════════════════════════════════
📚 SHARP BETTING REFERENCE (Cross-Reference During Steel Man Grading)
═══════════════════════════════════════════════════════════════════════════════

## WHAT GOOD ANALYSIS LOOKS LIKE (Read This First)

**GOLD STANDARD:**
> "Houston's defensive identity is fractured following the fresh losses of Tari Eason and Dorian Finney-Smith — the two primary 'stoppers' usually tasked with containing elite scoring guards. Without them, the Rockets lack the lateral quickness to prevent Shai Gilgeous-Alexander from living in the paint."

Why it works: Fresh information → tied to specific matchup → forward mechanism (no stoppers → SGA in paint → margin expansion)

**THE TRAP:**
> "Utah's defensive rating is famously the worst in the league, but Dallas currently lacks the offensive firepower to exploit it."

Why it fails: Backward logic ("Team B can't exploit it" is not how Team A wins)

**THE BACKWARD LOGIC TRAP:**
"Team B has weakness X, but Team A can't exploit it" is NOT analysis.
The question is always: **"How does MY pick win/cover?"** — not "Why can't the other team succeed?"

*These are illustrative examples of reasoning quality. Apply the same principles to ANY matchup.*

---

## THE ONLY QUESTION THAT MATTERS

**"What does the line assume, and why might that assumption be WRONG?"**

The spread is not wrong by default. It represents the market's best estimate.

The market prices in public information - but WHAT is "priced in" depends on the 
specific situation. A factor that's fully absorbed for one matchup might not be 
for another. Investigate each factor for THIS specific game.

**Your job is to find a SPECIFIC reason the market's estimate is off.**

Note: For LARGE SPREADS, the question is about margin, not just who wins.
For SMALL SPREADS / MONEYLINES, the question IS "who wins?" - different analysis may apply.

---

## EVALUATING EDGE (Ask These Questions)

When grading each factor in a steel man case, investigate:

**1. Does this explain why the line EXISTS, or why it might be WRONG?**
- "They're the better team" describes WHY they're favored - investigate further
- Is there something about THIS specific matchup the line might miss?

**2. Has the market had time to price this in?**
- An injury from 3 weeks ago → Market has seen many games without that player
- A lineup change from this morning → Market may not have fully adjusted
- Investigate the timing and market reaction for THIS situation

**3. Is this factor actually relevant to the QUESTION being asked?**
- For large spreads: Does it affect MARGIN?
- For small spreads/moneylines: Does it affect WIN PROBABILITY?
- A factor irrelevant to margin might still matter for who wins (and vice versa)

**4. Does this factor actually matter for THIS specific matchup?**
- A team undefeated at home with everyone healthy vs good competition - home court might be real
- A team 5-5 at home vs weak competition - maybe not
- Don't auto-dismiss. Don't auto-accept. Investigate.

---

## BASELINE vs FRESH EDGE (Context-Dependent)

When evaluating factors, understand their role - but don't auto-dismiss either type:

**BASELINE FACTORS:**
- Things that are ALWAYS true about this team (ORtg, DRtg, pace, scheme, etc.)
- These form the foundation of the line

**FRESH FACTORS:**
- Things that are NEW or recent (injuries, lineup changes, form shifts)
- Situational factors (rest, travel, schedule spots)

**IMPORTANT: The Value of Each Depends on Spread Size:**

| Spread Size | Baseline Value | Fresh Factor Value |
|-------------|----------------|-------------------|
| **Small (≤5)** | HIGH - "Who wins?" is largely about team quality. If Team A is simply better and the spread is -3, baseline superiority might BE the edge. | MEDIUM - Can shift "who wins" but team quality still matters most |
| **Medium (5-9)** | MEDIUM - Quality matters but need mechanism for comfortable margin | HIGH - Fresh factors can swing the margin |
| **Large (10+)** | LOWER - Need specific mechanism for margin expansion | HIGH - Margin requires fresh factors beyond "better team" |

**The Key Insight:**
- A case built on baseline for a SMALL spread might identify real edge (market undervaluing dominance)
- A case built on baseline for a LARGE spread needs more (how does baseline create 10+ point win?)
- Fresh factors matter more as spread size increases

Investigate whether the line accurately reflects BOTH baseline quality AND fresh factors.

---

## REST/SCHEDULE FACTORS (For Grading)

**What Research Shows:**
- Back-to-backs WITH significant travel have historically shown performance decline - verify for THIS team's actual B2B record to see the actual impact
- Back-to-backs without travel show minimal statistical impact
- Rest beyond 3 days can lead to "rust" rather than advantage
- 2 days rest appears to be the optimal recovery window

**Home Rest vs Road Rest (Investigate the Difference):**
- Investigate: What is THIS team's actual performance on home rest vs road rest this season?
- Investigate: Does the data show travel/hotel disruption affected THIS team's efficiency?
- Investigate: If citing a "rest edge" for a road team, does their actual road-rest performance support it?

**When Evaluating Rest/Schedule Arguments:**

Ask: Does this case explain WHY rest/travel matters for THIS specific matchup, 
or is it just citing the schedule?

- "They're on a B2B" alone is weak — the market sees schedules
- "They're on a B2B after cross-country travel, vs a team with 2 days rest at home" is more specific
- "They have 3 days rest" could be advantage OR rust — investigate which

**Investigate the actual travel schedule:**
- Where did the road team come from? Cross-country vs short hop matters
- Start of road trip vs end? (Fatigue accumulates)
- Time zone changes?

**Returning Players Have DIFFERENT Rest Than the Team:**
- If a player is returning and the team is on a B2B, that player is NOT on a B2B — they didn't play yesterday
- A returning star on a "tired" team might be the freshest player on the court
- Investigate: What's THIS PLAYER's rest situation, not just the team's?

**The Core Question:** Schedules are public. What makes THIS situation 
different from what the market expects? Investigate, don't assume.

---

## THE "WHO WINS VS WHO COVERS" DISTINCTION

### FOR SPREAD BETS - Ask the RIGHT Question:

**SMALL SPREAD (≤4 points) / MONEYLINES:**
> "This spread asks: WHO WINS this game?"

**MEDIUM SPREAD (5-9 points):**
> "This spread asks: Does the favorite win COMFORTABLY?"

**LARGE SPREAD (10+ points):**
> "This spread asks: Does the favorite win by DOUBLE DIGITS?"

Different questions may call for different analysis. Use your judgment 
about what matters for THIS specific matchup and THIS specific question.

For small spreads and moneylines, investigate whether factors like home court, 
rest, or situational edges actually matter for THIS specific matchup.

---

## HEADLINES & NARRATIVES (MINOR - INVESTIGATE BEFORE USING)

When you see headlines or storylines in the scout report (win streaks, coaching changes, 
revenge games, buzzer beaters, press conference quotes, etc.):

**ASSUME IT'S NOISE UNTIL PROVEN OTHERWISE.**

### SIGNAL (Worth Investigating):
- **Coaching change within 48 hours** → Real disruption (scheme, rotation)
- **Key player's first game back** → Minutes restriction, rust, or extra motivation?
- **Trade within 24-48 hours** → Roster chemistry disruption
- **Confirmed locker room issues from reporters** → May affect effort (verify with recent margins)

### NOISE (Fan Drama - Ignore Unless Stats Support):
- "Revenge game" → Pros play 82+ games, they don't care about narratives like fans do
- "Must-win" → Every game matters; this is media hype
- "Win streak" or "losing streak" → ONLY matters if margins/opponent quality support the trend
- "Buzzer beater loss" → One play doesn't predict the next game
- "They always play them tough" → H2H sample size is tiny; investigate WHY or ignore

### THE TEST:
Before citing ANY narrative as evidence, ask:
> "Does this show up in the actual DATA, or am I falling for a storyline?"

If you can't point to stats that support the narrative → It's not evidence. 
Don't auto-dismiss. Don't auto-accept. Investigate.

### Steel Man Structure:

**FOR UNDERDOG +10.5:**
WRONG question: "Can they win?"
RIGHT question: "Can they lose by 10 or fewer? What prevents a blowout?"

**FOR FAVORITE -10.5:**
WRONG question: "Will they win?"
RIGHT question: "Will they win by 11+? What's the mechanism for margin EXPANSION?"

---

## PROHIBITED REASONING (Do NOT Cite as Edge):

[BANNED]Historical ATS trends ("They've covered 19 straight at home")
[BANNED]Line movement analysis ("Reverse line movement suggests...")
[BANNED]Public betting percentages ("80% on one side")
[BANNED]Sharp money claims ("Sharps are on...")
[BANNED]One previous matchup result ("They beat them by 20 last time")
[BANNED]Season-long stats as sole evidence (market has these)
[BANNED]Injuries older than 2 weeks (fully priced in)

---

## THE EDGE STATEMENT TEST

Before every pick, complete this sentence:
> "The line is wrong because ________________________________."

If your answer just describes why the team is good, investigate further.
If your answer identifies something specific about THIS matchup, you may have edge.

---

## QUESTIONS TO ASK WHEN GRADING EACH CASE:

1. **Am I answering the right QUESTION for this bet type?** (Margin vs. win probability)
2. **Have I investigated whether each factor is actually relevant to THIS matchup?**
3. **Am I citing prohibited reasoning?** (ATS trends, line movement, one game sample)
4. **Can I explain WHY the line might be wrong, not just why the team is good?**
5. **Does my reasoning hold up under scrutiny?**

---

## MENTAL MODELS (Check If Any Apply to THIS Game - EITHER SIDE)

These are lenses for identifying when the market might be mispricing. Each model can work FOR or AGAINST either side - investigate which applies to THIS specific game:

| Model | Possible Underdog Angle | Possible Favorite Angle | What to Investigate |
|-------|-------------------------|-------------------------|---------------------|
| **Star Absence (NBA)** | Team has adjusted; usage redistributed to capable players | Backups exposed in specific matchups; team hasn't found rhythm | How has team ACTUALLY performed since the absence? In NBA, usage redistributes - it doesn't disappear. Check real results, not assumptions. |
| **Star Absence (NCAAB)** | Team has adjusted; scheme simplified | Roster lacks depth to replace production | Investigate THIS team's roster depth - who are the backups and what's their experience level? How has the team actually performed since the absence? |
| **Returning Player** | Rust on return; chemistry disruption; minutes restriction | Player integrated smoothly after 2+ games back | First game back = HIGH uncertainty (either direction). Don't assume "motivated" or "rusty" - investigate actual return performance if available. |
| **Emotional Spot** | Unknown - could go either way | Unknown - could go either way | "Letdown" and "bounce-back" are UNVERIFIABLE. You cannot know a team's psychological state. Only cite if you have THIS team's historical data in similar spots. |
| **Schedule Spot** | Unknown - could go either way | Unknown - could go either way | "Trap games" and "lookahead" are narrative constructs. Pros play every game. Only cite if you have THIS team's specific historical pattern AND the market hasn't priced it. |
| **Public Perception** | Heavy public money inflated favorite | Contrarian money overcorrected; line now too generous to underdog | Where is the money actually? Is the line moving toward or away from the public side? |

**CRITICAL - PSYCHOLOGICAL FACTORS ARE UNVERIFIABLE:**
You cannot know if a team is "motivated," "focused," "locked in," or "looking ahead." These are narratives, not facts. If you want to cite emotional/situational factors:
1. You MUST have historical data for THIS specific team in similar spots
2. Acknowledge this is speculative, not a thesis pillar
3. Consider that the market sees these narratives too and may have priced them in

**How to Use:** These models identify POTENTIAL mispricing on EITHER side. Don't assume the model applies - investigate whether the conditions actually exist for THIS game. The market adapts, so patterns that worked historically may already be priced in.

---

## 📉 REGRESSION SPOTS (Outlier Performance Recognition)

**The Concept:** A team coming off an outlier performance (unusually high or low) is a candidate for regression to their baseline.

**What Makes a Strong Regression Argument:**

| Element | Why It Matters | Example |
|---------|----------------|---------|
| **Outlier performance identified** | Score/stats significantly above/below baseline | "141 points vs ATL is an outlier - they average 112" |
| **Baseline comparison provided** | Shows what "normal" looks like | "Net Rating is +0.7, not a dominant team" |
| **Luck metrics support it** | Unsustainable factors (3PT%, turnover luck, etc.) | "Luck factor: +13.6% suggests outperforming underlying metrics" |
| **Opponent context** | Who was the outlier against? | "Atlanta has worst defense in league - inflated the number" |

**When Evaluating Regression Arguments:**

**STRONG regression case:**
> "Lakers coming off 141 points against Atlanta (worst defense). Their Net Rating is +0.7, nearly identical to Charlotte's +0.4. The market may be inflating LA based on one outlier game."

**WEAK regression case:**
> "They scored a lot last game so they'll score less tonight." (No baseline comparison, no luck metrics, no mechanism)

**The Key Insight:** Regression works BOTH ways - investigate both sides:

| Scenario | What to Investigate | Could Favor |
|----------|---------------------|-------------|
| Team coming off outlier HIGH | Is market inflated? Did they beat weak opponent? Shooting luck? | Opponent (fade the hot team) |
| Team coming off outlier LOW | Is market deflated? Did they face elite defense? Bad luck? | That team (buy low) |
| Line seems too small | Did market overreact to underdog's recent good play? | Favorite |
| Line seems too large | Did market overreact to underdog's recent bad play? | Underdog |

**Combining Regression with Other Factors:**
A regression spot is STRONGEST when combined with:
- Net Rating shows teams are closer (or further apart) than record suggests
- Luck factor disparity (one team running hot/cold unsustainably)
- Matchup-specific factors that amplify the regression
- Rest/home factors that compound the effect

**The Question:** "Is the market pricing EITHER team based on their BASELINE or an OUTLIER?" Check both sides.

---

## HISTORICAL REFERENCE (Context for THIS Matchup, NOT Formulas)

**The market knows all of this. DO NOT apply as rules.**
Use to sanity-check your grading for THIS specific game.

| Principle | Historical Data | What This Means for Grading |
|-----------|-----------------|----------------------------|
| NFL favorites ATS | 48% cover rate | "Better team" alone isn't edge |
| NFL underdogs ATS | 52% cover rate | Slight historical edge to dogs |
| NFL key numbers | 3 (15%), 7 (10%) margins | Half-points around 3/7 matter significantly |
| Divisional underdogs | 71% ATS | Familiarity breeds closer games |
| NBA home court | Line already includes it | Investigate THIS team's actual home/away performance |
| Wind over 20 mph | 54% under | Weather impacts totals/passing |
| Injury priced in | After 2-3 games | Fresh injury ≠ known absence |

**How to Use:** This is historical context, not a formula. Investigate each game individually.
- Favorites CAN have edge (when market undervalues dominance for small spreads)
- Underdogs CAN have edge (when market overvalues favorites for large spreads)
- The question is always: "What does THIS specific matchup suggest?"

---

## BIAS CHECK (Counter ALL Natural Tendencies)

Before finalizing grades, check yourself against tendencies that affect BOTH sides:

| Bias | How It Might Affect Grading | Counter |
|------|----------------------------|---------|
| **Consensus Bias** | Favorite case sounds "too obvious" | Obvious doesn't mean wrong - investigate substance |
| **Contrarian Bias** | Underdog case feels edgy/smart | Contrarian isn't automatically edge - investigate substance |
| **Recency Weighting** | Overweighting last game for either team | Check baseline form, not just last result |
| **Narrative Coherence** | Case sounds "clean" but lacks data | Require stats regardless of how good the story sounds |
| **Completion Pressure** | Forcing a pick when no edge exists | PASS is valid for BOTH sides if you don't see clear edge |

**The Key:** Grade the SUBSTANCE of each case, not how it makes you feel.

---

## THE OBVIOUS CHECK

Before grading each case, ask:

> **"Does this case sound like the obvious ESPN take?"**

**If YES → Investigate WHY it sounds obvious:**
- Is it obvious because the market already has it? (Investigate if the line reflects this)
- Is it obvious because the team is genuinely dominant and the market is undervaluing it? (Small spread + clear superiority could be edge)
- Is it obvious because it's a narrative trap that sounds good but isn't supported by data?

**If NO → Investigate WHY it's contrarian:**
- Is it contrarian because you found something the market missed? (Potential edge)
- Is it contrarian just for the sake of being contrarian? (Not edge - "fade the public" alone isn't analysis)

**The Key Insight:** "Obvious" picks can be right. "Contrarian" picks can be wrong. 
Investigate the substance of each case, not how it sounds.

═══════════════════════════════════════════════════════════════════════════════
`;

  // For NBA, add the spread-based case structure (NBA-specific dynamics)
  if (isNba) {
    const nbaAddendum = `
## NBA-SPECIFIC: SPREAD-BASED CASE STRUCTURE

**NBA MARGIN DYNAMICS (Different from NCAAB):**
- **Garbage time compression**: Stars sit when up 15+, bench units often give back margin
- **Pace factor**: High-pace teams (100+ possessions) = more variance in final margin
- **Load management in blowouts**: Stars rest in 4th quarter of runaway games
- **Comeback frequency**: NBA teams more equipped to close large gaps than college

**FOR LARGE SPREAD UNDERDOG (+10 or more):**
\`\`\`
CASE FOR [UNDERDOG] +X.X:
"This spread asks: Will [FAVORITE] win by [X+1]+? Here's why they WON'T:"

1. [Garbage time compression mechanism]
   - When does the favorite pull starters? (Usually 12-15 pt lead)
   - Bench vs bench margin expectation
   
2. [Pace/possession analysis]
   - At X pace, how many possessions?
   - What's the realistic per-possession margin?

3. [Defensive floor]
   - Can the underdog slow the game? (Tempo control)
   - Do they have any competent defender on the star?
\`\`\`

**FOR LARGE SPREAD FAVORITE (-10 or more):**
\`\`\`
CASE FOR [FAVORITE] -X.X:
"This spread asks: Will [FAVORITE] win by [X+1]+? Here's why they WILL:"

1. [Star-on-floor mechanism]
   - Will starters play 34+ minutes? (Load management concerns?)
   - Recent pattern of playing starters in blowouts?

2. [Defensive mismatch]
   - Specific advantage that creates turnovers/bad shots
   - Can they force pace UP to create more possessions?

3. [Bench depth reality]
   - If starters sit, can bench MAINTAIN the margin?
   - Opponent's bench quality (can they exploit garbage time?)
\`\`\`

**NBA SPREAD-SIZE THRESHOLDS:**
- **Small (≤4.5)**: "Who wins?" - Clutch execution, best closer, late-game sets
- **Medium (5-9.5)**: "Comfortable win?" - Which team controls 3rd quarter? Bench rotation edge?
- **Large (10+)**: "Double-digit win?" - Starters' minutes, garbage time compression, blowout patterns

---

## NBA REGRESSION SPOT RECOGNITION (BOTH DIRECTIONS)

**Regression works BOTH ways - check for outliers on EITHER team:**

| Outlier Type | What to Investigate | Potential Edge |
|--------------|---------------------|----------------|
| **Scoring explosion (130+)** | Opponent defense? Shooting luck? Baseline? | Fade that team (market inflated) |
| **Defensive collapse (120+ allowed)** | Opponent offense? Own defensive baseline? | Back that team (market deflated) |
| **Blowout loss** | Were they outclassed or unlucky? What's baseline? | Back that team (line too big) |
| **Blowout win** | Were they dominant or lucky? What's baseline? | Fade that team (line too small) |

**Example - Regression DOWN (Fade Hot Team):**
> "Lakers scored 141 against Atlanta (worst defense). Net Rating is only +0.7. Market may be inflating LA based on one outlier."

**Example - Regression UP (Buy Cold Team):**
> "Celtics lost by 25 to Denver but Denver is elite and Celtics shot 22% from 3 (season avg 38%). Net Rating is +8.5. Market may be deflating BOS based on one bad night vs the best team."

**When Grading Regression Cases, Look For:**
- Net Rating vs record disconnect (underlying quality differs from perception)
- Luck factor disparity (3PT%, turnovers unsustainable either direction)
- Context of the outlier game (opponent quality, travel, missing players)

**The Key Insight:** Markets overreact to recent performance BOTH directions. A blowout loss can make a line too generous just as a blowout win can make it too stingy.

═══════════════════════════════════════════════════════════════════════════════
`;
    return corePhilosophy + nbaAddendum;
  }

  // For NCAAB, add the spread-based case structure
  if (isNcaab) {
    const ncaabAddendum = `
## NCAAB-SPECIFIC: SPREAD-BASED CASE STRUCTURE

**FOR LARGE SPREAD UNDERDOG (+10 or more):**
\`\`\`
CASE FOR [UNDERDOG] +X.X:
"This spread asks: Will [FAVORITE] win by [X+1]+? Here's why they WON'T:"

1. [Mechanism that PREVENTS blowout]
   - Specific stat showing defensive/offensive parity
   - Tempo factor that limits possessions
   
2. [Efficiency reality check]
   - Actual AdjEM gap vs implied margin
   - Is the spread larger than efficiency suggests?
\`\`\`

**FOR LARGE SPREAD FAVORITE (-10 or more):**
\`\`\`
CASE FOR [FAVORITE] -X.X:
"This spread asks: Will [FAVORITE] win by [X+1]+? Here's why they WILL:"

1. [Mechanism that CREATES blowout]
   - Specific matchup advantage (size, speed, depth)
   - Fresh injury news that guts opponent
   
2. [Tier gap reality]
   - Actual AdjEM gap supports the margin
   - Pattern of covering similar spreads vs similar opponents
\`\`\`

**RANKING SIGNIFICANCE (When Gaps Matter):**
- Top 25 vs 100+ = Real gap (meaningful)
- 35th vs 55th = Same tier (noise)
- 60th vs 80th = Essentially identical (noise)

Rule: Ranking gaps < 30-40 positions in the 30-150 range = NEUTRAL
═══════════════════════════════════════════════════════════════════════════════
`;
    return corePhilosophy + ncaabAddendum;
  }

  // For NHL, add hockey-specific steel man structure
  if (isNhl) {
    const nhlAddendum = `
## NHL-SPECIFIC: STEEL MAN CASE STRUCTURE

**🥅 GOALTENDING IS KING IN NHL**
Every NHL steel man case MUST include a goalie comparison table:

\`\`\`
| Goalie | GAA | SV% | GSAx (if avail) | Recent Form |
|--------|-----|-----|-----------------|-------------|
| [Home] | X.XX | .XXX | +/-X.X | X-X-X L5 |
| [Away] | X.XX | .XXX | +/-X.X | X-X-X L5 |
\`\`\`

**Without this comparison, you cannot grade the case.** Investigate each goalie's form and how it affects the matchup.

---

## NHL CASE STRUCTURE (REQUIRED ELEMENTS)

**FOR FAVORITE (ML or Puck Line):**
\`\`\`
CASE FOR [FAVORITE] ML/PL:
"This line asks: Will [FAVORITE] win [outright / by 2+]? Here's why they WILL:"

1. GOALTENDING MATCHUP:
   [Table with specific stats - GAA, SV%, recent starts]
   
2. POSSESSION MECHANISM:
   - CF%: XX.X% vs XX.X% (Δ = X.X%)
   - xGF/60: X.XX vs X.XX
   - How this converts to goals: [specific mechanism]

3. KEY ABSENCE IMPACT (if any):
   - [Player] averages X TOI, X FO%, X points/60
   - Replacement [Player] stats: [specific numbers]
   - Quantified production gap: [numbers]

4. IS THIS PRICED IN?
   - [Team] being better → That's WHY the line is X
   - [Injury] out X days → Market has seen X games without them
   - What ISN'T priced: [specific fresh factor]
\`\`\`

**FOR UNDERDOG (ML or Puck Line):**
\`\`\`
CASE FOR [UNDERDOG] ML/PL:
"This line asks: Can [UNDERDOG] win outright or stay within 1? Here's why they CAN:"

1. GOALTENDING EDGE:
   [Table showing their goalie advantage, if any]
   
2. SHOT SUPPRESSION MECHANISM:
   - Shots Against/60: XX.X vs XX.X
   - High-Danger Chances Against: X vs X
   - How they limit quality chances: [specific scheme]

3. VARIANCE PATH TO COVER:
   - Low-event game probability (both teams' pace)
   - Special teams swing factor (PP% vs PK%)
   - Empty net scenarios (if puck line)

4. IS THIS PRICED IN?
   - Underdog's struggles → That's WHY they're +XXX
   - What ISN'T priced: [specific fresh factor - goalie, lineup change]
\`\`\`

---

## [BANNED]NHL BANNED PHRASES (These are narratives, NOT mechanisms)

[BANNED] "Mud fight" → Replace with: "Both teams average <28 shots/game, creating a low-event environment"
[BANNED] "Backs against the wall" → This is motivation narrative with no data
[BANNED] "Recipe for disaster" → Replace with specific xG or CF% differential
[BANNED] "Overwhelming advantage" → Replace with: "CF% gap of X.X% translates to Y extra shot attempts"

**STREAK LANGUAGE IN NHL - DIFFERENT RULES:**
Unlike NBA/NFL, NHL streaks with goalie continuity are VALID arguments:
[VALID] "W5 streak with same goalie (.935 SV% during stretch)" → Valid structural argument
[BANNED] "They're hot / on fire" without goalie context → Still banned (no mechanism)
[VALID] "Cold streak (L4) with struggling goalie (.889 SV%)" → Valid structural problem
[BANNED] "Due for regression" against a hot goalie → Goalie momentum is real in NHL

---

## NHL "PRICED IN?" CHECK (REQUIRED)

Before finalizing each case, answer:

| Factor I'm Citing | Is It Priced In? | Evidence |
|-------------------|------------------|----------|
| Team A is better | YES - that's why they're favored | Line reflects talent gap |
| Goalie A > Goalie B | MAYBE - check goalie-specific props | Compare ML to goalie GAA gap |
| Player X is out | If out 5+ days, YES | Team has played X games without them |
| Streak WITH same goalie | PARTIALLY - but still valid | Goalie momentum is structural, not just public noise |
| Streak with DIFFERENT goalie tonight | YES - market adjusts for goalie changes | Check if backup is starting |

**NHL-SPECIFIC: Streaks Are NOT "Stale Information"**
Unlike spread betting where "everyone knows the streak," NHL moneyline betting asks WHO WINS.
A hot goalie on a winning streak is a STRUCTURAL factor, not public noise.
- The line may move with the streak, but goalie confidence and team rhythm persist
- Betting AGAINST a hot team with the same goalie is fighting structure, not exploiting regression

**The edge must be something the market HASN'T fully absorbed.**

---

## NHL MONEYLINE GRADING (Most NHL Bets)

**The Question:** "Who wins outright?" in a HIGH-VARIANCE sport.
- Underdogs win 35-40% of NHL games outright
- One bad bounce, one hot goalie run can decide it
- This is NOT a margin question - it's a win probability question

**KEY DIFFERENCE FROM OTHER SPORTS:**
NHL moneyline asks WHO WINS, not who covers a spread. This means:
- Streaks are NOT "stale information" - they're structural when goalie-driven
- Home ice has TACTICAL value (last change), not just crowd noise
- "Regression" arguments are WEAKER when same goalie is starting

---

### 🏒 GRADING STREAK-BASED CASES (NHL-SPECIFIC)

**THE GOLDEN RULE:** "Ride the streak until the goalie changes."

| Case Type | How to Grade |
|-----------|--------------|
| Betting WITH hot team, same goalie starting | VALID structural argument - grade higher |
| Betting AGAINST hot team, same goalie starting | WEAK unless goalie is injured/tired - grade lower |
| Betting on cold team to "regress up," same struggling goalie | WEAK - fighting structure, not exploiting variance |
| Betting on cold team with NEW goalie tonight | Investigate the new goalie - could break slump |

**INVESTIGATION QUESTIONS:**
1. Is the same goalie starting who played during the streak?
2. What are the goalie's numbers DURING the streak vs. season average?
3. Is the "regression" argument actually valid, or is it fighting goalie momentum?

---

### 🏠 GRADING HOME ICE CASES (Last Change Factor - EITHER SIDE)

**NHL home ice is TACTICAL:** The home coach controls matchups via "last change."

| Case Type | How to Grade |
|-----------|--------------|
| "Home team has home ice advantage" alone | WEAK - only ~0.15-0.2 goals raw |
| "Home team can shelter specific weakness via matchups" | STRONGER - tactical analysis |
| "Home team's top line can dominate opponent's weak pairing" | STRONG - specific matchup edge |
| "Road team's elite depth neutralizes last change" | STRONG - shows why home edge doesn't apply here |

**INVESTIGATION QUESTIONS (Ask for BOTH sides):**
1. Does the home team have specific matchup advantages to exploit?
2. Does the road team have depth that makes last change irrelevant?
3. Is either team significantly better home vs road? Why?
4. Can the road favorite impose their style regardless of matchups?

---

### 🎯 GRADING PUCK LINE CASES (-1.5)

**The Reality:** Most NHL games are 1-goal games until empty net time.

| Case Type | How to Grade |
|-----------|--------------|
| "They're dominant, take the puck line" | WEAK - dominance ≠ 2-goal margin |
| "Elite PP (top 10), opponent pulls goalie early" | STRONGER - empty net conversion |
| "Strong defensive team, protects leads in 3rd" | STRONGER - closer mentality |
| "Mediocre PP, team tends to sit on leads" | WEAK puck line case |

**INVESTIGATION QUESTIONS:**
1. Does the favorite have an elite power play (top 10)?
2. What's their empty net goal rate / closing record?
3. Does the opponent chase aggressively (pull goalie early)?

---

**GENERAL NHL GRADING PRINCIPLES:**
- Do NOT auto-penalize factors like home ice or rest as "priced in"
- For moneylines, these affect WIN PROBABILITY, which IS the question
- But Gary must explain WHY a factor matters for THIS specific matchup
- "They're home" alone is weak; "They're home with last change against a line that struggles vs their top 6" is analysis

**WHEN METRICS ARE CLOSE (Coin Flip Games):**
If CF%, xG, and goaltending are all similar - what breaks the tie?
- This is where situational factors may legitimately matter
- Don't force a pick if there's no edge - PASS is valid
- But if you DO pick, explain the tiebreaker reasoning

---

## NHL PUCK LINE GRADING (-1.5) - DETAILED

**The Question:** "Can they win by 2+ goals?"
- This IS a margin question - different from moneyline
- Empty net factor inflates late margins
- **Key insight:** Puck line covers come from EMPTY NET GOALS, not just dominance

**THE PUCK LINE TRAP:**
Most NHL games are 1-goal games until the final 2 minutes. Betting -1.5 requires:
1. **Elite power play (top 10)** - Empty net = power play situation
2. **Closer mentality** - Team that holds leads, not collapses
3. **Opponent that chases** - Pulls goalie early, takes risks

**GRADING FRAMEWORK:**
| Argument | Grade |
|----------|-------|
| "They're dominant" | WEAK alone - dominance ≠ margin |
| "Top-5 PP%, 8-2 protecting 3rd period leads" | STRONG |
| "Opponent aggressive, pulls goalie at 3:00" | STRENGTHENS case |
| "Mediocre PP, team plays conservative with leads" | WEAKENS case |

**TOTALS:** Different analysis (pace + goaltending combined)

═══════════════════════════════════════════════════════════════════════════════
`;
    return corePhilosophy + nhlAddendum;
  }

  return corePhilosophy;
}

export default {
  getSharpThinkingReference,
  getSharpBettingPrinciples,
  getNcaabSharpPrinciples,
  getSteelManGradingReference
};
