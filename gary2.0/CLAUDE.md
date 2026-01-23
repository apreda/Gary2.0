# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gary 2.0** is an AI-powered sports betting analysis platform that generates picks, player props, and DFS lineups for NBA, NFL, NHL, NCAAB, and NCAAF. Gary uses advanced AI models (Gemini 3 Flash/Pro) with grounding capabilities to make informed betting decisions.

## Core Philosophy

### Gary's Mission
Gary is an AI Sports Bettor who makes daily picks across multiple sports leagues. His goal is to **WIN EACH BET HE MAKES** through deep analysis. Gary doesn't think statistically ("this should hit 7 out of 10 times"). He thinks with conviction: "I believe THIS specific bet wins, and here's why." If he can't make that case, he passes.

### Guiding Principles

1. **Awareness, Not Decisions**: We don't tell Gary what to do. We give him awareness of factors, nudge him to investigate, and let him conclude.

2. **Full Context, No Blindspots**: Gary must understand each game by examining ALL factors - big and small - that could impact the outcome.

3. **Investigate, Don't Assume**: When Gary encounters a factor (injury, rest, matchup, etc.), we want him to:
   - Investigate HOW LONG it's been relevant (e.g., player out 2 weeks vs 2 games)
   - Assess the IMPACT it's had (team record, performance metrics)
   - Determine RELEVANCE to THIS specific game (not general trends)

4. **Game-by-Game Analysis**: No blanket rules. Each game is unique. Gary analyzes the specific matchup and picks the best bet type (Spread or ML).

5. **Tools Over Instructions**: Gary has access to stats APIs and search - we nudge him to USE these tools to investigate, not pre-program answers.

6. **Win THIS Bet, Not the Average**: Gary doesn't bet thinking "this should hit 55% over time." He bets because he believes THIS SPECIFIC BET WINS. Each game is its own game. Past patterns don't predict futures. If Gary can't articulate why THIS bet wins tonight, he passes.

7. **Neutral Investigation, Not Biased Search**: When Gary investigates stats, he should investigate NEUTRALLY and let the data tell him which side it supports.
   - **WRONG**: "For the favorite, investigate pace... For the underdog, investigate defense..." (This biases Gary to find reasons for both sides)
   - **RIGHT**: "Investigate pace for both teams - which side of the spread does it support?" (This lets the data speak)

8. **Spread Thinking**: For spread bets, frame the question correctly:
   - One team is GETTING X points (underdog starts ahead on the scoreboard)
   - One team is GIVING X points (favorite must win by more than X)
   - Gary's job: Investigate the stats and determine which side they actually support
   - Don't ask Gary to find "a path to covering" for each side - ask him to investigate and conclude which side the stats favor

9. **Side Selection, Not Margin Prediction**: Gary does NOT predict his own spread or margin number.
   - ❌ WRONG: "I think the favorite wins by 8 points" (predicting a margin)
   - ✅ RIGHT: "The stats support the favorite side of this spread" (selecting a side)
   - The stats and data GUIDE Gary toward which SIDE of the spread to take
   - Don't ask "by how much" - ask "is the difference significant enough to favor one side?"
   - Gary picks a SIDE based on evidence, not a predicted final score

## Tech Stack

**AI/LLM:**
- Gemini 3 Flash (fast analysis, tool calling)
- Gemini 3 Pro (deep reasoning, final decisions)
- Google Search Grounding (real-time news/context)

## 2026 Grounding Freshness Protocol

To prevent "Concept Drift" where Gemini's 2024 training data clashes with 2026 reality, Gary uses the **Ground Truth Hierarchy**:

### Ground Truth Hierarchy
1. **PRIMARY TRUTH**: System Date + Google Search results = absolute "Present"
2. **SECONDARY TRUTH**: Gemini's internal training data = "Historical Archive" (2024 or earlier)
3. **CONFLICT RESOLUTION**: If training says Player X on Team A but Search shows a trade to Team B, the training is an "Amnesia Gap" - **USE SEARCH RESULT**

### Evidence Supremacy Protocol
- All grounding queries include XML-style `<date_anchor>` and `<grounding_instructions>` tags
- Gemini MUST use Google Search - cannot skip and rely on training data
- Results dated before 2026 are flagged as "Historical" and not used for current analysis
- Injury updates must include ORIGINAL DATE + GAMES MISSED to distinguish fresh vs stale news

### Anti-Lazy Commands
- "Verify claims using Search" - prevents relying on outdated training
- "Demand specific citations" - forces grounded evidence
- "Search Tool Over Intuition" - explicit instruction to use search, not internal knowledge

## Gemini Best Practices

### 1. Temperature 1.0 (Default)
For Gemini 3, keep temperature at 1.0. Unlike earlier models where you lowered temperature for "accuracy," Gemini 3's reasoning engine is calibrated for 1.0. Lowering it can cause logic loops or make the model ignore complex constraints.

### 2. Anchoring (Long Context Strategy)
When giving Gemini large amounts of data, use Context Anchoring:
- **The Rule**: Put data/files FIRST, specific question/instruction LAST
- **Bridge Phrase**: Start final instruction with "Based on the information provided above..." or "Referencing the data in the context..."

### 3. XML Tagging
Use XML-style tags to create hard boundaries between prompt sections. Prevents "instruction drift" where the model confuses data with commands.

### 4. No Emojis & Fluff Removal
Gemini 3 treats prompts as executable code, not conversation.
- Remove emojis, "please," and polite filler
- Direct, neutral, factual language yields highest instruction adherence

### 5. Negative Constraint Anchor
Place "Don't" rules at the END of the prompt. Gemini 3 prioritizes the last few sentences as highest-priority constraints.

**Data Sources:**
- Ball Don't Lie API (stats, betting odds, AND player props for all sports)
- Rotowire API (DFS data, injury reports)

**Backend:**
- Supabase (PostgreSQL database)
- Node.js scripts for pick generation
- Vercel for deployment

**Frontend:**
- React 18 + Vite
- Tailwind CSS + Shadcn UI

## Architecture

### Agentic System
Gary uses a **multi-pass agentic system** located in `/src/services/agentic/`:

1. **Pass 1 - Investigation**: Gary requests stats via function calling (Gemini Flash)
2. **Pass 2 - Steel Man**: Builds arguments for BOTH sides without bias (Gemini Flash) - these are Gary's "advisors"
3. **Pass 2.5 - Evaluation**: Evaluates Steel Man cases, investigates which factors the stats actually support, stress tests, makes decision (Gemini Pro) - Gary is the "sharp" who filters what's real vs fluff
4. **Pass 3 - Output**: Formats final pick with rationale (Gemini Pro)

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
- `src/services/agentic/constitution/MASTER_SHARP_REFERENCE.md` - Sharp betting principles

**Data Services:**
- `src/services/picksService.js` - Pick storage/retrieval (Supabase)
- `src/services/oddsService.js` - Betting odds from The Odds API
- `src/services/ballDontLieService.js` - NBA/NHL stats

## Development Guidelines

### DO's ✅

1. **Add Awareness, Not Rules**: When improving Gary, add prompts that make him AWARE of factors to investigate, don't hard-code decisions.

2. **Nudge to Investigate**: Use prompts like:
   - "Investigate how this injury has impacted the team's last 5 games"
   - "Consider whether rest advantage is relevant given travel schedule"
   - "Check if this team's recent shooting is sustainable or variance"
   - NOT: "If team has rest advantage, pick them"

   **For Spread Analysis - Keep It Neutral**:
   - ✅ "Investigate pace for both teams - which side of the spread does it support?"
   - ✅ "Investigate the efficiency gap - does it favor the team getting points or giving points?"
   - ❌ "For the favorite, find reasons they cover... For the underdog, find reasons they cover..."
   - ❌ "What's the path to covering for each side?" (forces Gary to find reasons for both)

   The goal is to let the stats tell Gary which side to pick, not to find reasons for a predetermined conclusion.

3. **The Guiding Gary Framework**: When writing prompts, think in three layers:

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

   Instead write: "Ask: Does the pace of this game favor higher variance (more possessions = more chances for upset) or does it not matter for THIS specific matchup?"

4. **The 6-Step Factor Implementation Framework**: When adding ANY factor, stat, or consideration to Gary's analysis, follow these 6 steps:

   **STEP 1 - ADD AWARENESS:**
   Make Gary aware the factor exists. Don't tell him what it means.
   - ✅ "Be aware of the rest/travel situation for both teams"
   - ✅ "Notice if L5 shooting differs significantly from season average"

   **STEP 2 - PUSH TO INVESTIGATE FOR THIS GAME AND THIS SPREAD:**
   Gary must investigate how this factor applies to THIS specific matchup, not in general.
   - ✅ "Investigate: How does the rest situation affect THIS game against THIS opponent?"
   - ✅ "Ask: Given THIS spread, does the pace differential matter for covering?"
   - ❌ "Rest advantage = easier cover" (too general)

   **STEP 3 - GUIDE TOWARD PREDICTIVE METRICS (NOT DESCRIPTIVE):**
   Help Gary understand which metrics predict outcomes vs which just describe the past.
   - **DESCRIPTIVE (what happened):** Records, win streaks, "they're 7-14 on the road"
   - **PREDICTIVE (what's likely to happen):** Efficiency gaps, L5 margins, pace-adjusted stats
   - ✅ "Investigate their road eFG% and turnover rate - what's CAUSING the road struggles?"
   - ❌ "Their 7-14 road record suggests they'll lose" (record describes, doesn't predict)

   **STEP 4 - GUIDE TO UNDERSTAND WHAT DATA TELLS HIM ABOUT EACH TEAM:**
   Gary should interpret what the data reveals about team identity.
   - ✅ "Ask: Does L5 tell the story of who this team IS RIGHT NOW, or do season averages provide better context for THIS metric?"
   - ✅ "Investigate: What does this efficiency gap reveal about how these teams match up?"
   - Different stats have different recency relevance:
     - **L5/L10 PRIMARY:** Form, shooting %, injury adjustments, lineup performance
     - **SEASON AVERAGES CONTEXT:** Regression baselines, structural identity, defensive schemes

   **STEP 5 - ASK WHICH SIDE OF THE SPREAD THIS BENEFITS:**
   After investigation, Gary decides which side the factor supports.
   - ✅ "Based on your investigation of pace, which side of the spread does it favor?"
   - ✅ "Does the efficiency gap support the team getting points or giving points?"
   - ❌ "High pace favors underdogs" (we decide for him - NEVER)

   **STEP 6 - GUIDE TO THINK ABOUT WHETHER THIS SHOWS UP TONIGHT:**
   Not all factors will materialize in every game. Gary decides what he can rely on.
   - ✅ "Ask: Which of these factors do you believe will actually show up TONIGHT?"
   - ✅ "Which factors can you rely on for your decision vs which are uncertain?"
   - ✅ "Of everything you investigated, what do you have CONVICTION about for THIS game?"

   **EXAMPLE - Applying the 6 Steps to "Pace":**
   1. AWARENESS: "Be aware of the pace differential between these teams"
   2. INVESTIGATE THIS GAME: "Investigate: How does EACH team perform in games at this pace? Check their efficiency in fast vs slow games"
   3. PREDICTIVE METRICS: "Look at L5 pace-adjusted efficiency, not just raw scoring"
   4. WHAT IT TELLS YOU: "Ask: Does the pace data reveal a matchup advantage, or is it neutral?"
   5. WHICH SIDE: "Based on your investigation, which side of the spread does pace favor (if any)?"
   6. WILL IT SHOW UP: "Do you believe pace will be a determining factor TONIGHT, or will other factors override it?"

5. **Preserve Game-by-Game Analysis**: Every enhancement should preserve Gary's ability to analyze each game uniquely.

6. **Use Function Calling**: Gary should REQUEST stats via tools, not have them pre-fetched blindly.

7. **Test with Real Games**: Always test changes against actual upcoming games.

8. **Maintain Constitutions**: Sport-specific logic goes in constitution files, not scattered throughout code.

9. **Silent Data = Investigation Prompt**: If data is missing or a check fails, prompt Gary to investigate, don't hide it.

### DON'T's ❌

1. **Don't Pre-Program Outcomes**: Never add logic like "always take home team" or "fade public perception".

2. **Don't Remove Investigation Steps**: If Gary is asking for stats/context, that's GOOD. Don't "optimize" it away.

3. **Don't Override Gary's Judgment**: The AI should make final decisions, not rule-based filters.

4. **Don't Apply Blanket Strategies**: No "always bet overs in NHL" or "fade chalk in DFS". Each game is unique.

5. **Don't Skip Context**: If adding a new factor (weather, altitude, etc.), make Gary INVESTIGATE it, don't just feed him the data.

6. **Don't Create Hard Gates**: Except for the Questionable Player rule (true uncertainty), avoid auto-PASS logic.

## Trap Pattern Awareness

Gary should be AWARE of these trap patterns to investigate when conditions apply:

### 1. Blowout Recency Gap
- **Trigger**: Team won/lost by >15 points last game
- **Investigation**: Was this repeatable structural mismatch or shooting variance?

### 2. Ewing Effect (Injury Overreaction)
- **Trigger**: Top-3 usage player is OUT
- **Investigation**: How has team performed without them? Does bench depth fill the void?

### 3. Regression Check
- **Trigger**: Recent eFG% significantly above season average (>5%)
- **Investigation**: Is shooting spike structural (improved personnel) or variance?

### 4. Overlook/Lookahead Trigger
- **Trigger**: Dominant favorite plays high-stakes rival NEXT game
- **Investigation**: Might they coast tonight? Does underdog have defensive depth?

### 5. Desperation Flip
- **Trigger**: Team on long losing streak (market "bottoming out")
- **Investigation**: Is Net Rating improving despite losses? Close games vs elite teams?

### 6. Divisional Grinders
- **Trigger**: Large favorite spread (8.5+) in divisional game
- **Investigation**: High familiarity shrinks talent gap. Does favorite have bench depth advantage?

### 7. Line Inflation ("Begging for a Bet")
- **Trigger**: Elite team is suspiciously narrow favorite vs bad team
- **Investigation**: What hidden disadvantage are oddsmakers pricing in?

### 8. Narrative Vacuum (Returning Star)
- **Trigger**: Star returns after missing 3+ games
- **Investigation**: Minutes restriction? Conditioning rust? Disrupts bench rhythm?

**Key Principle**: These are AWARENESS prompts, not rules. Gary investigates if they apply.

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

## Database Tables

- `daily_picks` - Game picks (spread/ML)
- `prop_picks` - Player props
- `game_results` - Outcome tracking
- `user_picks` - User selections
- `user_picks_results` - User pick outcomes
