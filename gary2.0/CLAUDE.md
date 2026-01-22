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
2. **Pass 2 - Steel Man**: Builds arguments for BOTH sides without bias (Gemini Flash)
3. **Pass 2.5 - Grading**: Grades his own analysis, stress tests, makes decision (Gemini Pro)
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
