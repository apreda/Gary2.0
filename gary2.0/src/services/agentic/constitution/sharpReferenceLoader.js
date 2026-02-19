/**
 * Sharp Reference Loader
 * Provides condensed reference for Gary during steel man evaluation (Pass 2.5).
 * getSteelManGradingReference(sport) is the only function used at runtime.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get a condensed version of the key principles for steel man evaluation.
 * This is what gets injected into Pass 2 for cross-referencing.
 */
export function getSteelManGradingReference(sport) {
  const isNcaab = sport?.toLowerCase()?.includes('ncaab') || sport?.toLowerCase()?.includes('ncaa');
  const isNba = sport?.toLowerCase()?.includes('nba') && !isNcaab;
  const isNhl = sport?.toLowerCase()?.includes('nhl') || sport?.toLowerCase()?.includes('hockey');
  
  // Core philosophy (applies to all sports) - condensed key points
  const corePhilosophy = `
═══════════════════════════════════════════════════════════════════════════════
[REFERENCE] SHARP THINKING REFERENCE
═══════════════════════════════════════════════════════════════════════════════

Use this as a REFERENCE when evaluating your Steel Man cases - like a lawyer uses case law.
It helps you identify what's real vs fluff, what's relevant vs noise, so YOU can decide which side to take.

## WHAT GOOD ANALYSIS LOOKS LIKE (Examples to Reference)

**STRONG EXAMPLE:**
> "Houston's DRtg has dropped from 108.1 to 115.6 over L5 following the fresh losses of Tari Eason and Dorian Finney-Smith. OKC's ORtg of 118.4 against teams with DRtg above 113 this season suggests the matchup has shifted. The line moved 3 points — but the DRtg data suggests the impact may not be fully captured in the spread."

Why it works: Fresh information → quantified with specific stats → statistical gap measured with data, not assumed → line questioned with evidence

**THE TRAP:**
> "Utah's defensive rating is famously the worst in the league, but Dallas currently lacks the offensive firepower to exploit it."

Why it fails: Backward logic ("Team B can't exploit it" is not how Team A wins)

**THE BACKWARD LOGIC TRAP:**
"Team B has weakness X, but Team A can't exploit it" is NOT analysis.
The question is always: **"How does MY pick win/cover?"** — not "Why can't the other team succeed?"

---

## RATIONALE QUALITY EXAMPLES (Reference These)

**BAD RATIONALE:**
> "I like the Lakers -9.5. They're the better team, they beat the Kings by 24 last time, Sabonis is out, and the Kings have the worst net rating in the league. Lakers are rested and Sacramento is on a back-to-back."

Why it's bad: Every point is public information the line already reflects. This explains why -9.5 EXISTS, not why it's WRONG.

**BETTER RATIONALE:**
> "I'm taking Kings +9.5 but conviction is low. The line looks right and I don't see a clear edge, but the Lakers' bench Net Rating (-4.2) suggests they can't sustain a double-digit margin — that gives a slight lean to the points."

Why it's better: Acknowledges the line is probably accurate. Still takes a side but honestly notes low conviction with a specific reason for the lean.

**BEST RATIONALE:**
> "Kings +9.5. The market is pricing Sacramento's recent struggles, but those games were against elite competition (Celtics, Thunder, Nuggets). Against non-elite teams, they've been competitive - 4 of their last 5 losses to non-top-10 teams were by single digits. The Lakers have covered large spreads only twice this season despite being favored by 7+ six times - they tend to take their foot off the gas."

Why it's best: Identifies SPECIFIC reasons the line might be off - opponent quality context for the form, specific data about margin tendencies. These are concrete factors, not narratives.

*Use these as your quality standard when writing your rationale.*

---

## BET TYPE DETERMINES THE QUESTION

**SPREAD:** "What does the spread assume, and why might it be wrong?"
- Edge = something the spread doesn't fully reflect (fresh injury, matchup-specific data)
- "They're the better team" explains WHY the spread exists, not why it's WRONG
- Stale information (2+ week injuries, schedule) is already in the line

**MONEYLINE:** "Who wins this game?"
- You're picking a winner, not claiming the market mispriced a margin
- Team quality, form, home ice/court matter for WHO WINS even if "public"
- Focus on matchup factors, goaltending (NHL), recent form

**FOR BOTH:** Don't auto-dismiss or auto-accept any factor. Investigate whether it matters for THIS specific matchup.

---

## BASELINE vs FRESH — SPREAD SIZE MATTERS

| Spread Size | Baseline (team quality) | Fresh (injuries, form shifts) |
|-------------|------------------------|-------------------------------|
| **Small (≤5)** | HIGH — "Who wins?" is about quality. Baseline superiority might BE the edge. | MEDIUM — Can shift who wins |
| **Medium (5-9)** | MEDIUM — Need mechanism for comfortable margin | HIGH — Fresh factors swing margin |
| **Large (10+)** | LOWER — Need specific mechanism for 10+ pt win | HIGH — Margin requires fresh factors |

Fresh factors matter more as spread size increases.

---

## SPREAD SIZE DETERMINES THE QUESTION

- **Small (≤4):** "Who wins this game?"
- **Medium (5-9):** "Does the data support this margin, or are these teams closer/further apart than the spread implies?"
- **Large (10+):** "Does the data support a gap this size, or is the spread reflecting something the stats don't show?"

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

**FOR THE TEAM GETTING +10.5:**
WRONG question: "Can they win?"
RIGHT question: "Can they lose by 10 or fewer? What does the data show about the gap between these teams?"

**FOR THE TEAM LAYING -10.5:**
WRONG question: "Will they win?"
RIGHT question: "Will they win by 11+? What does the data show about the gap between these teams?"

---

## PROHIBITED REASONING (Do NOT Cite as Edge):

[BANNED]Historical ATS trends ("They've covered 19 straight at home")
[BANNED]Line movement analysis ("Reverse line movement suggests...")
[BANNED]Public betting percentages ("80% on one side")
[BANNED]Sharp money claims ("Sharps are on...")
[BANNED]One previous matchup result ("They beat them by 20 last time")
[BANNED]Season-long stats as sole evidence (market has these)
[BANNED]Season-long injuries already reflected in team stats

---

## THE CONVICTION TEST (Depends on Bet Type)

### FOR SPREAD BETS:
Complete this sentence:
> "The spread is wrong because ________________________________."

If your answer just describes why the team is good, that's not spread edge.
If your answer identifies something the SPREAD doesn't reflect, you may have edge.

### FOR MONEYLINE BETS:
Complete this sentence:
> "I believe _________ wins tonight because ________________________________."

You're not claiming the market is wrong - you're predicting a winner.
If your answer identifies clear factors favoring one side to WIN, that's your pick.

---

## QUESTIONS TO ASK WHEN EVALUATING EACH CASE:

1. **Am I answering the right QUESTION for this bet type?** (Margin vs. win probability)
2. **Have I investigated whether each factor is actually relevant to THIS matchup?**
3. **What specific evidence supports each claim, and does it trace to my investigation data?** (Not ATS trends, line movement, or one game samples)
4. **What is my explanation for WHY the line might be wrong — not just why the team is good?**
5. **What would someone arguing the other side say about my reasoning?**

---

## MENTAL MODELS (Check If Any Apply)

| Model | What to Investigate |
|-------|---------------------|
| **Star Absence** | How has team ACTUALLY performed since? Usage redistributes (NBA) — check real results. |
| **Returning Player** | First game back = HIGH uncertainty. Investigate actual return performance, not "motivated/rusty" narratives. |
| **Emotional/Schedule Spot** | "Letdown," "bounce-back," "trap game" are UNVERIFIABLE. Only cite with THIS team's historical data. |

**Psychological factors are unverifiable.** You cannot know if a team is "motivated" or "looking ahead." These are narratives, not facts.

---

## REGRESSION SPOTS (Outlier Performance)

Regression works BOTH ways — check for outliers on EITHER team:

**STRONG:** Outlier identified + baseline comparison + luck metrics + opponent context.
> "Lakers scored 141 vs ATL (worst defense). Net Rating is +0.7. Market may be inflating based on one outlier."

**WEAK:** "They scored a lot so they'll score less tonight." (No data)

| Scenario | Could Favor |
|----------|-------------|
| Outlier HIGH (beat weak opponent, shooting luck) | Opponent (fade) |
| Outlier LOW (faced elite defense, bad luck) | That team (buy low) |

Strongest when combined with: Net Rating vs record disconnect, luck factor disparity, matchup amplifiers.

---

## BIAS CHECK & QUALITY CONTROL

Before finalizing, ask:
1. **Am I answering the right question?** Spread = "Why is the line wrong?" ML = "Who wins?"
2. **Am I citing prohibited reasoning?** (ATS trends, line movement, public %, sharp money, one-game sample, stale injuries)
3. **Obvious vs contrarian:** "Obvious" picks can be right. "Contrarian" picks can be wrong. Evaluate SUBSTANCE, not how it sounds.
4. **Recency bias:** Am I overweighting one game? Check baseline form.
5. **Narrative coherence:** Does the case sound "clean" but lack stats? Require data.

═══════════════════════════════════════════════════════════════════════════════
`;

  // For NBA, add the spread-based case structure (NBA-specific dynamics)
  if (isNba) {
    const nbaAddendum = `
## NBA-SPECIFIC: SPREAD-BASED CASE STRUCTURE

**NBA MARGIN DYNAMICS (Different from NCAAB):**
- **Garbage time compression**: Stars sit when up 15+, bench units often give back margin
- **Pace factor**: Investigate how pace affects margin variance in THIS matchup
- **Load management in blowouts**: Stars rest in 4th quarter of runaway games
- **Comeback frequency**: NBA teams more equipped to close large gaps than college

**FOR LARGE SPREADS (+10 or more):**
\`\`\`
CASE FOR [TEAM] [SPREAD]:
"This spread asks: Does the data support a gap this large?"

1. [Data assessment]
   - What does the data show about the gap between these teams?
   - Does the data support this margin, or is it closer/wider than the spread implies?

2. [Depth and structure]
   - How does each team's depth affect margin sustainability?
   - What happens when starters rest? How do the benches compare?

3. [Style matchup]
   - Does the pace/style matchup affect how this game plays out?
   - What does the data show about margin patterns for each team?
\`\`\`

**NBA SPREAD-SIZE CONTEXT:**
- **Small (≤4.5)**: "Who wins?" — Investigate what the data shows about each team in close-game situations
- **Medium (5-9.5)**: "Is this margin right?" — Investigate what the data shows about the gap between these teams
- **Large (10+)**: "Does the data support a gap this size?" — Investigate depth, sustainability, and margin patterns

---

## NBA REGRESSION (See core regression section above)

NBA-specific triggers: Scoring explosion (130+), defensive collapse (120+ allowed), blowout win/loss.
Always check: Net Rating vs record disconnect, 3PT% luck, opponent quality of the outlier game.
Markets overreact BOTH directions — a blowout loss can make a line too generous just as a blowout win can make it too stingy.

═══════════════════════════════════════════════════════════════════════════════
`;
    return corePhilosophy + nbaAddendum;
  }

  // For NCAAB, add the spread-based case structure
  if (isNcaab) {
    const ncaabAddendum = `
## NCAAB-SPECIFIC: CASE STRUCTURE

### HOME COURT — A STRUCTURAL FACTOR IN NCAAB
Home court in college basketball is NOT just a narrative — it's a measurable structural advantage. Investigate its actual size for THIS matchup:
- What does this team's home data show vs their overall numbers?
- What does the road team's away data reveal?
- What does the venue data reveal about this matchup?
- Ask: What does this team's home performance data show compared to their overall numbers?
- Ask: What does the road team's away performance data reveal about how they perform on the road?
- SOS context is critical — were the home wins against quality opponents or weak schedules?

### NCAAB MARGIN DYNAMICS (Different from NBA)

**COLLEGE-SPECIFIC MARGIN FACTORS:**
- **Late-game dynamics**: Starters stay in longer in college (no garbage time like NBA), but trailing teams foul aggressively and hit 3s to close gaps. Investigate: Do this team's margins hold late or compress?
- **3PT variance**: College games have higher shooting variance — a team can go on a 12-0 run fueled by 3-point shooting
- **Tempo control**: The team that controls pace controls margin — investigate tempo for BOTH teams
- **Foul trouble in short rotations**: With only 7-8 players, foul trouble can collapse a team's margin — investigate which team has depth to absorb fouls
- **Free throw shooting**: In close games and late-game situations, FT% can swing margins by 4-6 points

**FOR LARGE SPREADS (+11 or more):**
\`\`\`
CASE FOR [TEAM] [SPREAD]:
"This spread asks: Does the data support a gap this large?"

1. [Data assessment]
   - What do the matchup-specific factors show about this margin?
   - Does the data support this margin, or is it wider/closer than the spread implies?

2. [Depth and structure]
   - How does each team's roster depth affect margin sustainability?
   - With 7-8 man rotations, can the deeper team pile on or does the shorter rotation hold?

3. [Style matchup]
   - Does the tempo/style matchup affect how this game plays out?
   - What does the data show about margin patterns for each team?
\`\`\`

**NCAAB SPREAD-SIZE CONTEXT:**
- **Small (≤4.5)**: "Who wins?" — Investigate what the data shows about close-game factors and home court
- **Medium (5-10.5)**: "Is this margin right?" — Investigate what the data shows about the gap between these teams and whether venue is fully captured
- **Large (11+)**: "Does the data support a gap this size?" — Investigate depth, sustainability, SOS context, and whether the matchup-specific factors support this margin

---

### RANKING SIGNIFICANCE (When Gaps Matter)
- Top 25 vs 100+ = Real gap (meaningful)
- 35th vs 55th = Same tier (noise)
- 60th vs 80th = Essentially identical (noise)

Ask: What are the ACTUAL AdjEM values behind each rank? A 30-position gap might be 1 point of AdjEM (noise) or 10 points (real).

---

## NCAAB REGRESSION (Outlier Detection)

NCAAB-specific regression triggers: Shooting explosion (85+ in a low-tempo game), defensive collapse (80+ allowed by a good defense), SOS inflation (big numbers against weak opponents).

Always check:
- AdjEM vs record disconnect — what does the gap between AdjEM and record tell you about this team?
- L5 shooting vs season baseline — is the recent performance sustainable or variance?
- SOS of recent opponents — were the inflated stats against quality teams or weak schedules?
- Markets can overreact BOTH directions — a blowout loss to a ranked team can make a line too generous, just as a blowout win over a weak team can make it too stingy

═══════════════════════════════════════════════════════════════════════════════
`;
    return corePhilosophy + ncaabAddendum;
  }

  // For NHL, add hockey-specific steel man structure
  if (isNhl) {
    const nhlAddendum = `
## NHL-SPECIFIC: STEEL MAN CASE STRUCTURE

**[GOALIE] GOALTENDING IS KING** — Every case MUST include a goalie comparison table:

\`\`\`
| Goalie | GAA | SV% | GSAx (if avail) | Recent Form |
|--------|-----|-----|-----------------|-------------|
| [Home] | X.XX | .XXX | +/-X.X | X-X-X L5 |
| [Away] | X.XX | .XXX | +/-X.X | X-X-X L5 |
\`\`\`

---

## NHL CASE STRUCTURE

**FOR EACH TEAM:**
\`\`\`
CASE FOR [TEAM] ML/PL:
"What does the data show about this team's ability to win?"

1. GOALTENDING: [Table — both goalies' stats side by side]
2. POSSESSION & SHOT QUALITY: CF%, xGF/60, HDCF% — what does the data show?
3. KEY PERSONNEL IMPACT (if any): Quantified gap from absences or returns
4. FRESH FACTOR: What ISN'T priced in? [specific recent change]
\`\`\`

---

## NHL GRADING PRINCIPLES

**MONEYLINE (all NHL bets):** "Who wins?" — underdogs win 35-40% outright. One bounce decides it. NHL is moneyline only.

**STREAK INVESTIGATION:** Is the same goalie starting who played during the streak? How does goalie continuity affect the streak's structural validity?
- Same goalie starting as during the streak? Investigate: Does goalie continuity affect how much weight you give the streak?
- What do the underlying possession and shot quality numbers show during the streak?
- See NHL constitution for full goalie-streak and home ice/last change frameworks

**COIN FLIP GAMES:** If CF%, xG, and goaltending are all similar, note low conviction but explain your tiebreaker.

═══════════════════════════════════════════════════════════════════════════════
`;
    return corePhilosophy + nhlAddendum;
  }

  return corePhilosophy;
}

export default {
  getSteelManGradingReference
};
