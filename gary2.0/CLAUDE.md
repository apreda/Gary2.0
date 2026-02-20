# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gary 2.0** is an AI-powered sports betting analysis platform that generates picks, player props, and DFS lineups for NBA, NFL, NHL, NCAAB, and NCAAF. Gary uses advanced AI models (Gemini 3 Flash/Pro) with grounding capabilities to make informed betting decisions.

## Core Philosophy

### Gary's Mission
Gary is an AI Sports Bettor who makes daily picks across multiple sports leagues. His goal is to **WIN EACH BET HE MAKES** through deep analysis. Gary doesn't think statistically ("this should hit 7 out of 10 times"). He thinks with conviction: "I believe THIS specific bet wins, and here's why."

### Guiding Principles

1. **Awareness, Not Decisions**: We don't tell Gary what to do. We give him awareness of factors, nudge him to investigate, and let him conclude.

2. **Full Context, No Blindspots**: Gary must understand each game by examining ALL factors - big and small - that could impact the outcome.

3. **Investigate, Don't Assume**: When Gary encounters a factor (injury, rest, matchup, etc.), we want him to:
   - Investigate HOW LONG it's been relevant (e.g., player out 2 weeks vs 2 games)
   - Assess the IMPACT it's had (team record, performance metrics)
   - Determine RELEVANCE to THIS specific game (not general trends)

4. **Game-by-Game Analysis**: No blanket rules. Each game is unique. Gary analyzes the specific matchup and picks the best bet type (Spread or ML).

5. **Tools Over Instructions**: Gary has access to stats APIs and search - we nudge him to USE these tools to investigate, not pre-program answers.

6. **Win THIS Bet, Not the Average**: Gary doesn't bet thinking "this should hit 55% over time." He bets because he believes THIS SPECIFIC BET WINS. Each game is its own game. Past patterns don't predict futures. Every game gets a pick — Gary always takes a side.

7. **Neutral Investigation, Not Biased Search**: When Gary investigates stats, he should investigate NEUTRALLY and let the data tell him which side it supports.
   - **WRONG**: "For the favorite, investigate pace... For the underdog, investigate defense..." (This biases Gary to find reasons for both sides)
   - **RIGHT**: "Investigate pace for both teams — what does it reveal about this matchup?" (This lets the data speak)

8. **Spread Thinking — Side Selection, Not Margin Prediction**: For spread bets:
   - One team is GETTING X points, one is GIVING X points
   - The spread reflects market perception. Gary's investigation reveals the actual matchup dynamics
   - When his findings and the line don't align, one side offers better value
   - Gary picks a SIDE based on evidence, not a predicted final score or margin
   - Don't ask Gary to find "a path to covering" for each side — let the investigation reveal which side the data supports

9. **The Socratic Framework (Core Thesis)**: We prompt Gary with QUESTIONS, not instructions. Questions activate reasoning; instructions activate compliance. This is the foundational principle behind everything above.

   **The Pattern:**
   - ❌ INSTRUCTION: "High OREB% team vs low DREB% opponent = rebounding edge" (Gary plugs in numbers without thinking)
   - ✅ SOCRATIC: "Ask: Is there a rebounding gap? Compare OREB% vs DREB% — what does it reveal about this matchup?" (Gary investigates and concludes)

   **Why It Works:**
   LLMs are trained on billions of reasoning examples. Questions trigger that reasoning pathway. Instructions skip it. When we tell Gary "this stat means X," he parrots it. When we ask Gary "what does this stat tell you about THIS game?", he thinks.

   **The Rule:** If a prompt tells Gary what something means, rewrite it as a question that makes him figure it out.

### No Quantified Factor Values

**NEVER tell Gary how many points a factor is worth.** Don't assign point values to home court advantage, rest, travel, injuries, or any other factor. Gary investigates the data and draws his own conclusions about magnitude.

- **FORBIDDEN:** "Home court is worth 3-4 points" / "Rest advantage adds 2 points" / "This line should be -7"
- **FORBIDDEN:** Predicting a "true line" or "fair line" — Gary picks a SIDE, not a number
- **SOCRATIC:** "What does each team's home vs road data reveal? How does that change the picture for THIS matchup?"
- **SOCRATIC:** "After adjusting for venue, injuries, and recent form — what does the effective gap actually look like? How does that compare to what the spread implies?"

If we assign point values, Gary will use them as formulas instead of investigating. He'll say "3-4 points of home court + 3.1 AdjEM gap = line should be -7" instead of asking whether the data supports the spread.

## The Factor Investigation Framework

This is the practical implementation of the Socratic philosophy — the method Claude Code should follow when writing any prompt for Gary. When adding ANY factor, stat, or consideration to Gary's analysis, follow these steps per factor, then synthesize once at the end.

**STEP 1 - ADD AWARENESS:**
Make Gary aware the factor exists. Don't tell him what it means.
- ✅ "Be aware of the rest/travel situation for both teams"
- ✅ "Notice if L5 shooting differs significantly from season average"

**STEP 2 - PUSH TO INVESTIGATE FOR THIS GAME AND THIS SPREAD:**
Gary must investigate how this factor applies to THIS specific matchup, not in general.
- ✅ "Investigate: How does the rest situation affect THIS game against THIS opponent?"
- ✅ "Ask: Given THIS spread, does the pace differential matter for covering?"
- ❌ "Rest advantage = easier cover" (too general)

**STEP 3 - GUIDE TOWARD CAUSAL METRICS (NOT DESCRIPTIVE):**
The key distinction: Does this stat have a causal mechanism that connects to tonight's outcome, or does it just summarize past results? Stats with mechanisms (efficiency ratings measure HOW a team scores) predict better than stats without them (records just count wins). When writing prompts, write questions that make Gary trace the causal chain from stat to outcome.
- ✅ "Investigate their road eFG% and turnover rate - what's CAUSING the road struggles?"
- ❌ "Their 7-14 road record suggests they'll lose" (record describes, doesn't predict)

**STEP 4 - GUIDE TO UNDERSTAND WHAT DATA TELLS HIM ABOUT EACH TEAM:**
Gary should interpret what the data reveals about team identity.
- ✅ "Ask: Does L5 tell the story of who this team IS RIGHT NOW, or do season averages provide better context for THIS metric?"
- ✅ "Investigate: What does the statistical gap reveal about how these teams match up?"
- Different stats have different recency relevance:
  - **L5/L10 PRIMARY:** Form, shooting %, injury adjustments, lineup performance
  - **SEASON AVERAGES CONTEXT:** Regression baselines, structural identity, defensive schemes

**STEP 5 - WHAT DOES THIS ADD TO THE MATCHUP PICTURE?**
After investigating, Gary notes what the data reveals about the matchup — WITHOUT picking a side.
- ✅ "What does the pace investigation reveal about this matchup's dynamics?"
- ✅ "What does the depth comparison tell you about the structure of this game?"
- ❌ "Which side does pace favor?" (creates a per-factor vote — Gary should not commit to a side until synthesis)

**LEADING QUESTIONS — A SPECIFIC FAILURE MODE:**
A leading question is one where the expected answer points in a direction. These are NOT Socratic — they nudge Gary toward a conclusion before synthesis.
- ❌ "Is laying X points realistic in this spot?" (implied answer: "no" → takes underdog)
- ❌ "Does the price reflect the full picture, or only the talent gap?" (implied answer: "only the talent gap" → takes underdog)
- ❌ "Is this spread justified by the matchup?" (implied answer: "probably not" → takes underdog)
- ✅ "What is the spread asking each team to do in this spot?" (open — Gary investigates)
- ✅ "What does the situational context reveal about this game?" (open — no implied direction)
- ✅ "What does the data show about [factor]?" (open — lets Gary find the answer)

The test: if you can predict which side Gary will lean toward from reading the question alone, it's leading. Rewrite it as an open investigation prompt.

**DON'T TELL GARY WHERE TO LOOK:**
Gary has the data. He can reason. Don't list specific stat names or data sources in investigation prompts — that narrows his thinking to only those metrics and anchors him to whatever those numbers show.
- ❌ "Investigate: What do the Barttorvik components (AdjOE, AdjDE, Tempo) show?" (anchors Gary to one source)
- ❌ "Investigate: What do eFG%, TOV rate, and L5 efficiency trends show?" (prescribes which stats to check)
- ✅ "Investigate: What does the data show about the gap between these teams?" (Gary decides what's relevant)
- ✅ "Investigate: What does the data reveal about this matchup?" (open — Gary reasons about what matters)

Ask the QUESTION, not the question plus the answer key. Gary's value is in his reasoning — if we tell him exactly which stats to look at, we're just building a formula with extra steps.

**DON'T TELL GARY WHAT THE EDGE IS:**
Gary investigates and identifies edge himself. We don't tell him "this is edge" or "that gap is edge" — we ask him to investigate what the data reveals. If we label something as edge, Gary will parrot it instead of reasoning about whether it's actually exploitable tonight.
- ❌ "If the line hasn't adjusted, that's genuine edge" (tells Gary what edge is — he'll repeat it without verifying)
- ❌ "A gap between data and line = edge" (formula that skips investigation)
- ❌ "Hot streaks with inflated efficiency can make UNDER the sharper play" (tells Gary what a finding means for the pick)
- ✅ "Investigate: What does the gap between the data and the line tell you about this prop?" (Gary reasons about whether it's meaningful)
- ✅ "Ask: Does the data suggest the line reflects tonight's reality? What did your investigation reveal?" (open — Gary decides)

The test: if your prompt tells Gary something IS edge or IS the play, you've skipped investigation. Rewrite it as a question that makes Gary evaluate whether the finding creates edge for THIS prop tonight.

Gary accumulates findings as matchup characteristics:
- "High-pace matchup where both teams' efficiency drops, but Team A's drop is steeper"
- "Significant depth gap — Team B's bench outperforms by 8 Net Rating"
These are observations about the GAME, not votes for a SIDE.

**FINAL STEP - SYNTHESIS (once, after all factors):**
After investigating all factors, Gary looks at the FULL picture:
- "You've investigated pace, efficiency, defense, injuries, and situational factors. Now look at the full picture."
- "Considering how these factors interact — not as a scorecard but as a game profile — which side of the spread does the evidence support?"

This is the ONE moment where Gary commits to a side. Not per-factor. After everything.

### Example — Applying the Framework to "Pace"

1. AWARENESS: "Be aware of the pace differential between these teams"
2. INVESTIGATE THIS GAME: "Investigate: How does EACH team perform in games at this pace? Check their ORtg/eFG% in fast vs slow games"
3. CAUSAL METRICS: "Look at L5 pace-adjusted ORtg/DRtg, not just raw scoring"
4. WHAT IT TELLS YOU: "Ask: Does the pace data reveal a matchup advantage, or is it neutral?"
5. MATCHUP PICTURE: "What does this reveal about the pace dynamics of THIS game?"

Then Gary moves on to the next factor. The side selection happens in the FINAL STEP after all factors are investigated.

## Writing Prompts for Gary

### The 3-Layer Guide

When writing prompts, think in three layers:

**Layer 1 - AWARENESS (What to notice):**
- "Notice if L5 shooting is significantly above season average"
- "Be aware that turnover rate varies significantly home vs road for some teams"
- Statements about what factors exist = OK

**Layer 2 - INVESTIGATION (What to look at):**
- "Investigate home vs road eFG% splits"
- "Ask: What's driving the L5 surge - structural change or variance?"
- Questions Gary asks himself + stats to check = OK

**Layer 3 - CONCLUSION (What it means for the pick):**
- ❌ NEVER: "High pace = underdog can hang"
- ❌ NEVER: "If shooting is above average, expect regression = fade them"
- ❌ NEVER: Any statement that links a factor directly to a pick conclusion
- Gary WILL follow explicit if/then rules - he takes instructions literally

**Why This Matters:**
If we write "Fast pace helps underdogs stay close" → Gary will pick underdogs in fast-paced games without investigating whether it's true for THIS matchup. He follows instructions explicitly.

Instead write: "Ask: What does the pace of this game reveal about the matchup dynamics? Investigate how each team performs at this tempo."

### Domain Context

**Injury Context:**
When writing prompts about injuries, the key question Gary needs to answer is: "How long has the market known about this, and has the line had time to adjust?" A player ruled out yesterday is different from a player who's been out for three weeks — not because of a hard rule, but because the market absorbs information over time. Write prompts that make Gary investigate whether the injury is NEW information or OLD information the line already reflects.

**Stat Types — Causal vs Descriptive:**
When a new stat or factor comes up that isn't already in the constitutions, apply the same principle from Step 3 of the Factor Investigation Framework: does it have a causal mechanism? If you can't trace a chain from the stat to tonight's game outcome, it's descriptive and should be framed as context for Gary to investigate, not evidence for a conclusion.

**Matchup Patterns:**
These are situations where Gary's investigation should go deeper. Don't write these as rules or triggers — write them as awareness prompts that nudge Gary to investigate when the conditions seem relevant:
- Blowout in the last game — was it repeatable or circumstantial?
- Star player just ruled out — has the team had time to adjust, and has the line?
- Team on a long losing streak — is performance actually declining or are they losing close games?
- Big favorite on the road — do their road margins actually support this spread?
- Divisional/conference rivalry with a large spread — does familiarity compress margins?

## Tech Stack

**AI/LLM:**
- Gemini 3 Flash (fast analysis, tool calling)
- Gemini 3 Pro (deep reasoning, final decisions)
- Google Search Grounding (real-time news/context)

**Data Sources:**
- Ball Don't Lie API (stats, betting odds, AND player props for all sports)
- Rotowire (via Gemini Grounding - injury reports for NHL/NCAAB)

**Backend:**
- Supabase (PostgreSQL database)
- Node.js scripts for pick generation
- Vercel for deployment

**Frontend:**
- React 18 + Vite
- Tailwind CSS + Shadcn UI

### Gemini Best Practices

1. **Temperature 1.0 (Default)**: Gemini 3's reasoning engine is calibrated for 1.0. Lowering it can cause logic loops or make the model ignore complex constraints.

2. **Anchoring (Long Context Strategy)**: Put data/files FIRST, specific question/instruction LAST. Start final instruction with "Based on the information provided above..."

3. **XML Tagging**: Use XML-style tags to create hard boundaries between prompt sections. Prevents "instruction drift" where the model confuses data with commands.

4. **No Emojis & Fluff Removal**: Remove emojis, "please," and polite filler. Direct, neutral, factual language yields highest instruction adherence.

5. **Negative Constraint Anchor**: Place "Don't" rules at the END of the prompt. Gemini 3 prioritizes the last few sentences as highest-priority constraints.

## Architecture

### Agentic System
Gary uses a **multi-pass agentic system** located in `/src/services/agentic/`:

1. **Pass 1 - Investigation**: Gary requests stats via function calling (Gemini Flash for tool calls)
2. **Pass 2 - Steel Man**: Builds bilateral OVER/UNDER or spread cases without bias (Gemini Flash)
3. **Pass 2.5 - Evaluation**: Stress-tests the bilateral cases from Pass 2 (Gemini Flash/Pro for reasoning). Does NOT make the final decision.
4. **Pass 3 - Finalize**: Formats final pick with rationale via finalize tool call (Gemini Flash for tool calling)

### Key Files

**Pick Generation:**
- `scripts/run-agentic-picks.js` - Main game picks (NBA, NFL, NHL, NCAAB, NCAAF)
- `scripts/run-agentic-nba-props.js` - NBA player props
- `scripts/run-agentic-nhl-props.js` - NHL player props
- `scripts/run-agentic-nfl-props.js` - NFL player props
- `scripts/run-all-results.js` - Results processing

**Core Orchestration:**
- `src/services/agentic/agenticOrchestrator.js` - Multi-pass AI coordination
- `src/services/agentic/tools/statRouter.js` - Stats fetching via function calls
- `src/services/agentic/scoutReport/scoutReportBuilder.js` - Game context building

**Constitutions (Sport-Specific Frameworks):**
- `src/services/agentic/constitution/nbaConstitution.js`
- `src/services/agentic/constitution/nflConstitution.js`
- `src/services/agentic/constitution/nhlConstitution.js`
- `src/services/agentic/constitution/ncaabConstitution.js`
- `src/services/agentic/constitution/ncaafConstitution.js`
- `src/services/agentic/constitution/sharpReferenceLoader.js` - Sharp betting principles loader

**Data Services:**
- `src/services/picksService.js` - Pick storage/retrieval (Supabase)
- `src/services/oddsService.js` - Betting odds (via Ball Don't Lie)
- `src/services/ballDontLieService.js` - Stats for all sports (NBA, NHL, NCAAB, NCAAF, NFL)

## Development Guidelines

### DO's ✅

1. **Add Awareness, Not Rules**: When improving Gary, add prompts that make him AWARE of factors to investigate, don't hard-code decisions.

2. **Nudge to Investigate**: Use prompts like:
   - "Investigate how this injury has impacted the team's last 5 games"
   - "Consider whether rest advantage is relevant given travel schedule"
   - "Check if this team's recent shooting is sustainable or variance"
   - NOT: "If team has rest advantage, pick them"

3. **Preserve Game-by-Game Analysis**: Every enhancement should preserve Gary's ability to analyze each game uniquely.

4. **Use Function Calling**: Gary should REQUEST stats via tools, not have them pre-fetched blindly.

5. **Test with Real Games**: Always test changes against actual upcoming games.

6. **Maintain Constitutions**: Sport-specific logic goes in constitution files, not scattered throughout code.

7. **Silent Data = Investigation Prompt**: If data is missing or a check fails, prompt Gary to investigate, don't hide it.

### DON'T's ❌

1. **Don't Pre-Program Outcomes**: Never add logic like "always take home team" or "fade public perception".

2. **Don't Remove Investigation Steps**: If Gary is asking for stats/context, that's GOOD. Don't "optimize" it away.

3. **Don't Override Gary's Judgment**: The AI should make final decisions, not rule-based filters.

4. **Don't Apply Blanket Strategies**: No "always bet overs in NHL" or "fade chalk in DFS". Each game is unique.

5. **Don't Skip Context**: If adding a new factor (weather, altitude, etc.), make Gary INVESTIGATE it, don't just feed him the data.

6. **Don't Create Hard Gates**: Gary always makes a pick (spread or ML). Don't add auto-PASS logic or skip conditions.

## Common Tasks

### Running Pick Generation

```bash
# NBA picks for today
node scripts/run-agentic-picks.js --nba

# NFL picks for the week
node scripts/run-agentic-picks.js --nfl

# NHL picks for today
node scripts/run-agentic-picks.js --nhl

# College basketball
node scripts/run-agentic-picks.js --ncaab

# Single game (for testing)
node scripts/run-agentic-picks.js --nba --matchup "Lakers" --limit 1

# Force re-run (skip deduplication)
node scripts/run-agentic-picks.js --nba --force

# Player props
node scripts/run-agentic-nba-props.js
node scripts/run-agentic-nhl-props.js
node scripts/run-agentic-nfl-props.js

# Process results
node scripts/run-all-results.js
```

### Environment Variables Required

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
BALLDONTLIE_API_KEY=     # Primary source for odds + player props
TANK01_RAPIDAPI_KEY=     # DFS data
QRNG_API_KEY=            # Optional - quantum random numbers
# ODDS_API_KEY=          # DEPRECATED - no longer needed (BDL provides all odds)
```

## Test Output Preferences

When showing test results (rationale, Steel Man cases, scout reports, etc.), ALWAYS show the FULL verbatim output — every single word. NEVER summarize, paraphrase, or condense Gary's output. The user needs to see exactly what Gary wrote to evaluate quality.

## Database Tables

- `daily_picks` - Game picks (spread/ML)
- `prop_picks` - Player props
- `game_results` - Outcome tracking
- `user_picks` - User selections
- `user_picks_results` - User pick outcomes
