# Gary 2.0 - Codebase Architecture Reference

> This document helps Claude understand the Gary 2.0 codebase across sessions.

## What Gary Does
An AI sports betting platform that generates **game picks**, **player props**, and **DFS lineups** for NBA, NFL, NHL, NCAAB, and NCAAF.

---

## Project Structure

```
Gary2.0/
├── .github/workflows/          # GitHub Actions automated pick generation
├── gary2.0/                    # Main application
│   ├── api/                    # Vercel serverless functions
│   ├── scripts/                # CLI scripts for pick/prop/results generation
│   ├── src/
│   │   ├── components/         # React UI components
│   │   ├── pages/              # React pages (Home, Results, etc.)
│   │   ├── services/           # Core business logic
│   │   │   ├── agentic/        # Multi-pass AI reasoning system
│   │   │   ├── ballDontLieService.js     # Primary stats API
│   │   │   ├── oddsService.js            # Betting odds aggregation
│   │   │   ├── picksService.js           # Pick storage/retrieval
│   │   │   ├── dfsLineupService.js       # DFS optimization
│   │   │   └── [other services]
│   │   ├── utils/              # Helper utilities
│   │   └── supabaseClient.js   # Supabase integration
│   ├── supabase/migrations/    # Database schema migrations
│   ├── CLAUDE.md               # Development guidelines
│   └── package.json
├── ios/                        # iOS app (React Native)
└── package.json                # Root package
```

---

## Core Architecture - Multi-Pass Agentic System

Location: `/src/services/agentic/agenticOrchestrator.js`

```
PASS 1: Investigation (Gemini 3 Flash)
   ↓ Gary requests stats via function calling

PASS 2: Steel Man (Gemini 3 Flash)
   ↓ Gary builds arguments for BOTH sides without bias

PASS 2.5: Conviction Rating (Gemini 3 Pro)
   ↓ Gary stress-tests arguments, evaluates which side data supports

PASS 3: Final Decision (Gemini 3 Pro)
   ↓ Gary PICKS: Spread, Moneyline, or PASS
```

**Model Selection:**
- NBA/NFL/NHL: Flash for investigation, Pro for conviction/decision
- NCAAB/NCAAF: Flash throughout (high volume)

---

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| Orchestrator | `agentic/agenticOrchestrator.js` | Multi-pass AI coordination |
| Stat Router | `agentic/tools/statRouter.js` | Routes stat requests to data sources |
| Scout Reports | `agentic/scoutReport/scoutReportBuilder.js` | Initial game context |
| Ball Don't Lie | `ballDontLieService.js` | Primary stats/odds API (6461 lines) |
| Odds Service | `ballDontLieOddsService.js` | Betting odds from BDL |
| Pick Storage | `picksService.js` | Pick storage/deduplication |
| DFS | `agentic/dfs/dfsAgenticOrchestrator.js` | DFS lineup generation |
| Props | `agentic/propsAgenticRunner.js` | Player props generation |

---

## Constitution Files (Sport-Specific Frameworks)

Location: `/src/services/agentic/constitution/`

| File | Purpose |
|------|---------|
| `nbaConstitution.js` | NBA analysis framework |
| `nflConstitution.js` | NFL framework |
| `nhlConstitution.js` | NHL framework |
| `ncaabConstitution.js` | College basketball |
| `ncaafConstitution.js` | College football |
| `nbaPropsConstitution.js` | NBA props specific |
| `nflPropsConstitution.js` | NFL props specific |
| `nhlPropsConstitution.js` | NHL props specific |
| `MASTER_SHARP_REFERENCE.md` | Sharp betting principles |

---

## Tech Stack

- **AI**: Gemini 3 Flash/Pro with Google Search Grounding
- **Backend**: Node.js, Vercel serverless
- **Database**: Supabase (PostgreSQL)
- **Frontend**: React 18, Vite, Tailwind, Shadcn UI
- **Data Sources**: Ball Don't Lie API, Rotowire, Tank01

---

## Database Tables (Supabase)

| Table | Purpose |
|-------|---------|
| `daily_picks` | Game picks (spread/ML) |
| `prop_picks` | Player props |
| `game_results` | Outcome tracking |
| `user_picks` | User selections |
| `dfs_lineups` | DFS lineup storage |

---

## GitHub Actions Schedule (EST)

| Time | Workflow | What it does |
|------|----------|--------------|
| 4:00 AM | Daily Results | Check previous day's results |
| 8:00 AM | NBA Game Picks | NBA picks |
| 8:10 AM | NHL Game Picks | NHL picks |
| 8:20 AM | NCAAB Game Picks | NCAAB picks |
| 8:30 AM | NBA Props | NBA props |
| 8:40 AM | NHL Props | NHL props |
| Manual | NFL Only | NFL picks + props |
| Manual | NFL Picks Only | Single NFL game |

---

## Environment Variables Required

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
BALLDONTLIE_API_KEY=
TANK01_RAPIDAPI_KEY=     # Optional - DFS data
QRNG_API_KEY=            # Optional
```

---

## Key Scripts

```bash
# Game picks
node scripts/run-agentic-picks.js --nba
node scripts/run-agentic-picks.js --nhl
node scripts/run-agentic-picks.js --ncaab
node scripts/run-agentic-picks.js --nfl

# Player props
node scripts/run-agentic-nba-props.js --store=1
node scripts/run-agentic-nhl-props.js --store=1
node scripts/run-agentic-nfl-props.js --store=1

# Results
node scripts/run-all-results.js

# Single game (testing)
node scripts/run-agentic-picks.js --nba --matchup "Lakers" --limit 1
```

---

## Stat Hierarchy (CRITICAL)

**TIER 1 - PREDICTIVE (Use as PRIMARY evidence):**
- NBA: Net Rating, ORtg, DRtg, eFG%, TS%, Pace, TOV Rate
- NFL: EPA/Play, DVOA, CPOE, PFF Grades, Success Rate
- NHL: xG, GSAx, Corsi %, HDCF%, xPts
- NCAAB: KenPom AdjEM, T-Rank, Barthag

**TIER 2 - INVESTIGATION/CONTEXT:**
- Fresh injuries (0-3 days only)
- Matchup-specific data
- Situational factors (rest, travel)

**TIER 3 - DESCRIPTIVE (FORBIDDEN as reasons):**
- Records (Home/Away, ATS)
- PPG / Points Allowed
- Win/Loss Streaks

---

## Injury Timing Rules (ABSOLUTE)

| Sport | Fresh Window | Notes |
|-------|-------------|-------|
| NBA | 0-3 days | Any player |
| NFL | 0-10 days | Weekly schedule |
| NHL | 0-3 days | Any player |
| NCAAB | 0-21 days | TOP 2 players only |

- **FRESH** (within window): May be an edge, line might not have adjusted
- **STALE** (beyond window): FORBIDDEN - already priced in
- **SEASON-LONG**: 100% IRRELEVANT - don't mention

---

## Core Philosophy

1. **Gary investigates**, doesn't follow rules
2. Uses **conviction-based** decisions ("I believe THIS bet wins")
3. **Predictive stats** over descriptive stats
4. **2026 Grounding** via Google Search prevents hallucinations
5. **No blanket strategies** - each game is unique
6. **Value finding** - is the line mispriced?

---

## Pick Generation Flow

```
run-agentic-picks.js
├── Parse args (--nba, --nfl, etc.)
├── Fetch upcoming games via BDL API
├── Per game:
│   ├── Check for existing pick (dedup)
│   ├── Build Scout Report
│   ├── Run agenticOrchestrator()
│   │   ├── Pass 1: Investigation
│   │   ├── Pass 2: Steel Man
│   │   ├── Pass 2.5: Conviction
│   │   └── Pass 3: Final Decision
│   └── Store pick to Supabase
└── Summary report
```

---

## DFS System

Location: `/src/services/agentic/dfs/`

Key files:
- `dfsAgenticOrchestrator.js` - Main orchestrator
- `dfsAgenticSlateAnalyzer.js` - Slate analysis
- `dfsAgenticThesisBuilder.js` - Strategy formation
- `dfsAgenticPlayerInvestigator.js` - Player analysis
- `dfsAgenticLineupDecider.js` - Final lineup
- `dfsAgenticAudit.js` - Self-review

---

## Props System

Location: `/src/services/agentic/`

Key files:
- `propsAgenticRunner.js` - Main orchestrator
- `nbaPropsAgenticContext.js` - NBA props context
- `nflPropsAgenticContext.js` - NFL props context
- `nhlPropsAgenticContext.js` - NHL props context
- `propsSharpFramework.js` - Sharp grading criteria

**5 Edge Types for Props:**
1. Information Speed - News <6 hours ago
2. Derivative Laziness - Low-volume prop, bad line
3. Median vs Mean - Distribution-based edge
4. Public Bias Fade - Casual money wrong
5. Game Script Correlation - Flow differs from market

---

## Frontend

Location: `/src/pages/` and `/src/components/`

- **Home.jsx** - Main landing with picks
- **PickCard.jsx** - Individual pick display
- **ResultsAdmin.jsx** - Admin results grading

Stack: React 18, Vite, Tailwind, Shadcn UI, Framer Motion

---

## Key Constants

**SPORT_CONFIG** (in run-agentic-picks.js):
```javascript
{
  nba: { key: 'basketball_nba', name: 'NBA', useToday: true },
  nfl: { key: 'americanfootball_nfl', name: 'NFL', daysAhead: 7 },
  nhl: { key: 'icehockey_nhl', name: 'NHL', useToday: true },
  ncaab: { key: 'basketball_ncaab', name: 'NCAAB', useToday: true },
  ncaaf: { key: 'americanfootball_ncaaf', name: 'NCAAF', useToday: true }
}
```

---

*Last updated: February 2026*
