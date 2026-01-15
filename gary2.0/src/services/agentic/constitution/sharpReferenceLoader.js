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

⚠️ THIS IS REFERENCE MATERIAL, NOT FORMULAS TO APPLY.
The market knows all of this. Use it to CHECK your reasoning, not to BUILD your reasoning.

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
❌ Wrong question: "Can they win?"
✅ Right question: "Can they lose by 10 or fewer? What prevents a blowout?"

**FOR FAVORITE -10.5:**
❌ Wrong question: "Will they win?"
✅ Right question: "Will they win by 11+? What's the mechanism for margin EXPANSION?"

---

## PROHIBITED REASONING (Do NOT Cite as Edge):

🚫 Historical ATS trends ("They've covered 19 straight at home")
🚫 Line movement analysis ("Reverse line movement suggests...")
🚫 Public betting percentages ("80% on one side")
🚫 Sharp money claims ("Sharps are on...")
🚫 One previous matchup result ("They beat them by 20 last time")
🚫 Season-long stats as sole evidence (market has these)
🚫 Injuries older than 2 weeks (fully priced in)

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

**Without this comparison, you cannot grade the case.** Goalie is the biggest single factor.

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

## 🚫 NHL BANNED PHRASES (These are narratives, NOT mechanisms)

❌ "Mud fight" → Replace with: "Both teams average <28 shots/game, creating a low-event environment"
❌ "Backs against the wall" → This is motivation narrative with no data
❌ "Recipe for disaster" → Replace with specific xG or CF% differential
❌ "Overwhelming advantage" → Replace with: "CF% gap of X.X% translates to Y extra shot attempts"
❌ "Hot streak / on fire" → Replace with: "X-X-X in L5 with X.XX xGF/game"

---

## NHL "PRICED IN?" CHECK (REQUIRED)

Before finalizing each case, answer:

| Factor I'm Citing | Is It Priced In? | Evidence |
|-------------------|------------------|----------|
| Team A is better | YES - that's why they're favored | Line reflects talent gap |
| Goalie A > Goalie B | MAYBE - check goalie-specific props | Compare ML to goalie GAA gap |
| Player X is out | If out 5+ days, YES | Team has played X games without them |
| Recent form (W4) | PARTIALLY | Line moves with public, but xG may differ |

**The edge must be something the market HASN'T fully absorbed.**

---

## NHL MONEYLINE GRADING (Most NHL Bets)

**The Question:** "Who wins outright?" in a HIGH-VARIANCE sport.
- Underdogs win 35-40% of NHL games outright
- One bad bounce, one hot goalie run can decide it
- This is NOT a margin question - it's a win probability question

**WHAT TO EVALUATE (Examples, not a checklist):**
- Goaltending matchup (often the biggest single factor)
- When goalies are CLOSE → what else differentiates?
- Special teams (PP% vs PK%) - can swing 1-2 goals
- Home ice (last change advantage, crowd energy)
- Rest/travel in a physically demanding sport
- Lineup confirmations vs projections

**GRADING NHL CASES:**
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

## NHL PUCK LINE GRADING (-1.5)

**The Question:** "Can they win by 2+ goals?"
- This IS a margin question - different from moneyline
- Empty net factor inflates late margins
- Requires sustained offensive pressure

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
