# NBA Constitution — Removed Content (March 20, 2026)

Removed during NBA game picks audit. These sections were causing Gary to default to contrarian pattern-matching instead of genuine game analysis.

## Removed: NBA BETTING AWARENESS (full section)
```
The NBA is a star-driven league where individual player availability and performance on a given night can override any team-level stat. Teams play 82 games and the effort, focus, and motivation can vary from night to night. Streaks, slumps, and schedule spots are a regular part of the NBA season.

When betting NBA, do not default to the side the stats favor. Stats and data are part of the picture but not the whole picture — they are a part of making a pick for THIS game, which you will do at the very end. Sometimes going against the paper stats is the right play when you have real reasoning to back it up, can see a motivational or schedule edge, or see a matchup dynamic that the season averages don't capture.
```

## Removed: THE SPREAD (full section)
```
- NBA spreads move quickly once injury news breaks — by tip-off, most absences are fully reflected in the number
- Public betting volume in the NBA gravitates toward big-market teams, nationally televised games, and teams on winning streaks — lines for those games reflect different market dynamics than under-the-radar matchups
- Rest advantages (opponent on a back-to-back, long road trip) are widely known and typically priced — the edge is in HOW a team performs in those spots, not that the spot exists
- Home court advantage in the NBA is real but varies significantly by arena and team
```

## Removed: Partial bullet edits in NBA AWARENESS
```
Original: "Back-to-backs, travel burden, and schedule density are widely known and often priced quickly"
Changed to: "Back-to-backs, travel burden, and schedule density affect teams differently depending on roster depth and playing style"

Original: "Public attention concentrates on marquee teams and nationally televised games — narrative pressure can affect how numbers are set"
Removed entirely.

Original: "Roster depth matters more than casual observers realize — when stars sit..."
Changed to: "Roster depth matters — when stars sit..."
```

## Removed: 6 Spread Evaluation Factors (from spreadEvaluationFactors.js → getNbaSpreadFactors)
```
### 1. STREAKS & FORM
Streaks move public perception and move lines. What's driving a streak — whether it's sustainable or circumstantial — is not always reflected in the adjustment.

### 2. REST & TRAVEL
Rest and travel narratives are loud and the line always adjusts for them. The size of the adjustment itself varies.

### 3. INJURY IMPACT ON PRICE
FRESH injuries (0-2 games missed) may not be fully reflected in the spread. Established absences are already baked into the line and the team's current stats.

### 4. PUBLIC NARRATIVE VS DATA
Every game has a public storyline that moves betting action and moves lines.

### 5. UPSET POTENTIAL
The spread implies a gap between these teams. The matchup data may or may not support that gap.

### 6. RETURNING PLAYERS
When a key player returns from absence, the line moves. A return after a longer absence can also change team dynamics in either direction.
```
Replaced with a single paragraph that frames narrative factors as context (not edges) and tells Gary to focus on the actual basketball matchup.

## Removed: "MATCHUP EVALUATION FACTORS" header + intro text
```
## MATCHUP EVALUATION FACTORS

These factors can affect tonight's game and spread outcome differently depending on the matchup.
```
Replaced with just "## MATCHUP EVALUATION" since it's now a single paragraph, not a factor list.

## Removed: Spread Size Blocks (from passBuilders.js → buildNbaPass1)
```
TONIGHT'S SPREAD SIZE: LARGE (X points)
At this spread size, the matchup gap on paper is obvious — the question is not who wins, but what the margin looks like. Large-spread NBA games have different dynamics than close games: when a team builds a big lead, starters get rest minutes, rotations change, pace shifts, and the trailing team's bench often plays extended minutes with different intensity.

TONIGHT'S SPREAD SIZE: CLOSE (X points)
At this spread size, the handicap is small — the market sees these teams as closely matched or within a few points of each other for this game. The spread still accounts for all the same factors — narratives, rest, injuries, public perception, and more. The market doesn't see much separation between these two teams today.

TONIGHT'S SPREAD SIZE: MEDIUM (X points)
At this spread size, the handicap reflects clear separation between the teams — the market sees one side as meaningfully better for this game. The spread accounts for narratives, rest, injuries, public perception, and more. Season records, reputation, and situational context are already baked into the spread.
```

## Removed: "THE SPREAD AND THE MATCHUP" section (from passBuilders.js → buildNbaPass1)
```
The spread is the market's handicap for this game. It reflects recent performance, reputation, standings, public perception, rest, travel, injuries, and schedule density.
```

## Removed: NARRATIVE FACTORS paragraph
```
Narrative factors — rest vs rust, back-to-backs, streaks, revenge spots, travel, emotional storylines, hot/cold stretches, returning players, head-to-head recent results — are context for the matchup. Rest and schedule context affect preparation differently for each team. A returning player can boost or disrupt rotations and chemistry — investigate the specifics. Use narratives as supporting context, not as standalone reasons for picking a side.
```

## Removed: DESCRIPTIVE vs CAUSAL section
```
**DESCRIPTIVE vs CAUSAL:**
- **Descriptive factors** (records, rankings, standings, streaks, reputation) describe what has happened so far.
- **Causal factors** (how each team plays, matchup dynamics, situational context) reveal the actual matchup dynamics tonight.
- Prioritize causal factors. When you cite a record, ranking, or situation — ask yourself: "Is this describing what happened, or explaining what will happen tonight?"
```

## Removed: TREND AWARENESS
```
TREND AWARENESS (L5/L10): Treat recent trend data as a clue, not a conclusion. A trend can be driven by opponent quality, roster changes, shooting variance, or genuine process improvement.
```

## Removed: Pass 1 task framing (replaced with simpler version)
```
Your end goal is to choose the best side of this spread. During Pass 1, investigate the matchup thoroughly and build decision-ready evidence for both teams.

In this pass, stay neutral: verify/disconfirm key claims from the briefing, pressure-test narratives with data, and build evidence for both teams.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need additional evidence to verify, disconfirm, or clarify critical gaps before synthesis.

Make reasoned judgment calls where uncertainty exists. Final side selection comes later.
```

## Removed: Motivation from Flash Investigation (March 21, 2026)
```
### 6. STANDINGS & CONTEXT
- Is either team in a motivational spot (clinch, elimination, meaningless)?
```
Changed to only ask about standings position and whether it affects lineup decisions (resting players). Motivation is narrative, not data.

## Removed: B2B W/L record investigation from Flash (March 21, 2026)
```
- What is this team's ACTUAL record and efficiency on B2Bs/short rest this season?
```
Changed to investigate actual stat changes (shooting, pace, defensive rating) on B2Bs instead of W/L records. Also added clarification that first night of B2B ≠ fatigue.

## Why removed
Gary was using these sections as a formula: find a narrative factor → call it "overreaction" or "already priced in" → take the other side. This produced predictable contrarian picks that lost consistently (0-7 on March 17, 1-7 on March 19). The spread awareness was needed but became the primary driver of picks instead of actual game analysis.
