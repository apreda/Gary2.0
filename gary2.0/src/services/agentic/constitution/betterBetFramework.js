/**
 * Better Bet Framework — Centralized
 *
 * Shared framework for bet type selection and spread/moneyline analysis.
 * Update this file once to update all sport constitutions.
 *
 * Used by: nbaConstitution.js, ncaabConstitution.js, nflConstitution.js,
 *          ncaafConstitution.js, nhlConstitution.js
 */

// ═══════════════════════════════════════════════════════════════════════
// SPREAD SPORT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════

const SPREAD_CONFIGS = {
  NBA: {
    coreExample: 'the Lakers are better than the Kings — that\'s WHY the line is -9.5',
    narrativeNoise: 'Revenge game / must-win',
    mlThreshold: 5,
    spreadRanges: [
      ['1-3 pts', 'Essentially "who wins"', 'ML often cleaner — you\'re betting on the winner anyway'],
      ['4-7 pts', 'Moderate margin territory', 'Ask: "Is this margin right?" If yes, consider ML. If wrong, bet spread.'],
      ['8-12 pts', 'Large margin required', 'Ask: "Can they sustain dominance including bench?" Spread is the real bet here.'],
      ['13+ pts', 'Blowout territory', 'Ask: "Is blowout structural (depth, pace) or just narrative?"'],
    ],
    example: `- You believe Lakers are clearly better than Kings and should win
- But -9.5 feels too high — the statistical gap between these teams doesn't support a spread this large
- **Your conviction:** Lakers WIN, but the spread is too big
- **The bet:** Kings +9.5 (you're betting the margin is wrong, not that Kings win)`,
    sportSections: '',
  },

  NCAAB: {
    coreExample: 'Duke is better than Pittsburgh — that\'s WHY the line is -17.5',
    narrativeNoise: 'Rivalry / must-win',
    mlThreshold: 5,
    spreadRanges: [
      ['1-5 pts', 'Essentially "who wins"', 'ML often cleaner — you\'re betting on the winner anyway'],
      ['6-10 pts', 'Moderate margin territory', 'Ask: "Is this margin right?" If yes, consider ML. If wrong, bet spread.'],
      ['11-16 pts', 'Large margin required', 'Ask: "Does the data support a gap this large?"'],
      ['17+ pts', 'Blowout territory', 'Ask: "Is blowout structural (depth, tempo, SOS) or just narrative from ranking gap?"'],
    ],
    example: `- You investigate Kansas (-8.5) ON THE ROAD at Iowa State
- Kansas is clearly the better team by AdjEM — but the spread asks: can they win by 9 on the road?
- Your investigation of Iowa State's home data and Kansas's road data tells a different story than the overall numbers
- **Your conviction:** Kansas wins, but -8.5 on the road is too many points
- **The bet:** Iowa State +8.5 (you're betting the margin is wrong, not that Iowa State wins)`,
    sportSections: `
**INVESTIGATE FOR BOTH TEAMS EQUALLY:**
- Bench depth: Review the roster data in your scout report — does one team's depth create a meaningful advantage?
- 3PT volume and shooting splits: What does the shooting data reveal about a possible mismatch?
- Turnover forcing vs ball security: What does the gap reveal about this matchup?
- Pace control: Does one team's tempo preference create an advantage?
- Situational factors: Rest/travel, sustainability of recent form

Let the stats tell you which side to pick, not find reasons for a predetermined conclusion.
`,
  },

  NFL: {
    coreExample: 'the Chiefs are better than the Panthers — that\'s WHY the line is -10',
    narrativeNoise: 'Revenge game / rivalry week',
    mlThreshold: 4,
    spreadRanges: [
      ['1-3 pts', 'Essentially "who wins" — on a key number', 'ML often cleaner. If spread is exactly 3, investigate if margin crosses or stays below.'],
      ['3.5-6.5 pts', 'One-score game territory', 'Ask: "Is this margin right?" Key number 7 looms — does the data suggest a TD margin?'],
      ['7-9.5 pts', 'Comfortable win required', 'Ask: "Does the data support a multi-score gap?" On 7 exactly, investigate if it crosses.'],
      ['10+ pts', 'Blowout territory — on or near key number 10', 'Ask: "Is dominance sustainable for 60 minutes, or will garbage time compress the margin?"'],
    ],
    example: `- You investigate Chiefs (-10) vs Panthers
- Chiefs are clearly superior by EPA and DVOA — but -10 requires sustained dominance
- Your investigation shows Chiefs tend to build leads and run clock in the 4th, compressing margins
- **Your conviction:** Chiefs WIN, but -10 is too many points given their tendency to ease off
- **The bet:** Panthers +10 (you're betting the margin is wrong, not that Panthers win)`,
    sportSections: `
**KEY NUMBER AWARENESS:**
NFL margins cluster at 3, 7, and 10. When a spread sits on or near a key number, investigate: Does THIS matchup's advanced stats suggest a margin that crosses or stays below the key number? A half-point on either side of 3 or 7 changes everything.
`,
  },

  NCAAF: {
    coreExample: 'Alabama is better than Vanderbilt — that\'s WHY the line is -21',
    narrativeNoise: 'Rivalry week / trap game',
    mlThreshold: 5,
    spreadRanges: [
      ['1-6 pts', 'Essentially "who wins"', 'ML often cleaner — you\'re betting on the winner anyway'],
      ['7-13 pts', 'Moderate margin territory', 'Ask: "Is this margin right?" Does the data show a clear talent gap or is this narrative?'],
      ['14-20 pts', 'Large margin required', 'Ask: "Does the data support sustained dominance? What do depth and bench minutes look like?"'],
      ['21+ pts', 'Blowout territory', 'Ask: "Is blowout structural (depth, talent, SOS) or just ranking narrative? Does garbage time/running clock compress margins?"'],
    ],
    example: `- You investigate Alabama (-21) vs Vanderbilt
- Alabama is clearly superior by most metrics — but -21 requires sustained dominance well into the 4th quarter
- Your investigation shows Vanderbilt's defense has been competitive against top-25 opponents, and Alabama tends to pull starters early in blowouts
- **Your conviction:** Alabama WIN, but -21 is too many points
- **The bet:** Vanderbilt +21 (you're betting the margin is wrong, not that Vanderbilt wins)`,
    sportSections: `
**COLLEGE-SPECIFIC SPREAD CONTEXT:**
College spreads can be massive (20-30+ points). Larger spreads introduce more variance — garbage time, bench players, and running clock all affect whether a blowout covers. Investigate: Does the data show BOTH teams' depth and style? Do they sustain margins or compress them late?
`,
  },
};

// ═══════════════════════════════════════════════════════════════════════
// NHL FRAMEWORK (Moneyline paradigm — separate builder)
// ═══════════════════════════════════════════════════════════════════════

function buildNHLFramework() {
  return `### [KEY] THE BETTER BET FRAMEWORK (NHL — MONEYLINE ONLY)

**THE CORE PRINCIPLE:**
The moneyline already reflects "who is better." Vegas knows the Avalanche are better than the Blue Jackets — that's WHY they're -180. The question isn't who wins — it's whether THIS price reflects the matchup.

**FOR EVERY GAME — ASK:**
1. "What does this moneyline imply about win probability?"
2. "Does my investigation data (xG, CF%, GSAx, goalie matchup) support that probability?"
3. "Is there a specific reason the price might be mispriced — goalie news, B2B fatigue, lineup changes?"

**AVOID THE NOISE:**
- "Team A is better" → That's why the price exists, not analysis
- "They won 5-1 last time" → One game is noise in hockey
- "Rivalry game" → Narrative, not edge
- "They're on a winning streak" → Already priced in

**THE QUESTION FOR EVERY GAME:**
"Is this price accurate? Or does the DATA show one side is mispriced?"

**EXAMPLE:**
- You investigate Avalanche (-180) vs Blue Jackets (+155)
- Your data shows Avalanche have a clear xG and CF% edge, but their goalie has a .905 SV% in the last 5 starts
- The implied win probability at -180 is ~64%, but your data suggests it's closer to 58%
- **Your conviction:** Avalanche probably win, but -180 is overpriced given the goalie situation
- **The bet:** Blue Jackets +155 (you're betting the price is wrong, not that Blue Jackets are better)

**THE KEY:** Your bet is always Moneyline. The question is which side the data supports at the given price.`;
}

// ═══════════════════════════════════════════════════════════════════════
// SPREAD FRAMEWORK BUILDER (NBA, NCAAB, NFL, NCAAF)
// ═══════════════════════════════════════════════════════════════════════

function buildSpreadFramework(config) {
  const spreadSizeTable = config.spreadRanges.map(([range, meaning, thinking]) =>
    `| ${range} | ${meaning} | ${thinking} |`
  ).join('\n');

  return `### [KEY] THE BETTER BET FRAMEWORK (APPLIES TO ALL SPREADS)

**THE CORE PRINCIPLE:**
The spread already reflects "who is better." Vegas knows ${config.coreExample}. The question isn't who wins — it's whether THIS spread reflects the matchup.

**FOR EVERY SPREAD — LARGE OR SMALL — ASK:**
1. "What does this line assume about the margin?"
2. "Does my investigation data support that margin?"
3. "Is there a specific reason the line might be mispriced?"

**AVOID THE NOISE:**
- "Team A is better" → That's why the spread exists, not analysis
- "They beat them by 20 last time" → One game is noise
- "${config.narrativeNoise}" → Narrative, not edge
- "They're on a streak" → Already priced in

**SPREAD THINKING:**
- One team is GETTING X points (they start ahead on the scoreboard)
- One team is GIVING X points (they must win by more than X)
- Investigate the stats — which side do they actually support?
- Pick a SIDE based on evidence, not a predicted final score
${config.sportSections}
**SPREAD SIZE CONTEXT:**
Different spread sizes ask different questions. Investigate accordingly:
- Ask: What does a spread of this size imply about the matchup? Does your data agree?
- Ask: What mechanical factors in this matchup would affect whether the actual gap is larger or smaller than the spread?
- Ask: Does this spread accurately reflect what your investigation reveals about this matchup?

**HOW SPREADS CAN BE MISPRICED:**
- Stats show close matchup but spread is large → Ask: Is the spread driven by narrative or by factors the stats don't capture?
- Stats show clear mismatch but spread is small → Ask: Is the market seeing something your data doesn't capture?
- Star ruled out, line moved significantly → Investigate what the team's data without the star shows — does it support the move?

**THE QUESTION FOR EVERY GAME:**
"Is this spread accurate? Or does the DATA show one side is mispriced?"
- If the line looks right → find a different angle
- If the line is off → That's your edge, bet accordingly

**CHOOSING SPREAD VS MONEYLINE — VALUE COMPARISON:**
- Spread: When you believe the MARGIN is mispriced
- Moneyline: When you're confident in the WINNER but margin is uncertain
- For tight spreads (under ${config.mlThreshold}), ML often offers cleaner value since you're essentially betting "who wins"

**SPREAD VS ML — CONVICTION-BASED SELECTION:**

When you have conviction on a side, ask: "What am I actually confident about?"

| Your Conviction | Choose This Bet | Why |
|-----------------|-----------------|-----|
| "This team WINS, but margin is uncertain" | **Moneyline** | You're betting on the winner, not the margin |
| "This spread is WRONG — the margin should be different" | **Spread** | You're betting on the margin being mispriced |
| "This team wins AND covers easily" | **Either works** | Strong conviction on both |

**SPREAD SIZE GUIDANCE:**

| Spread | What It Means | Spread vs ML Thinking |
|--------|---------------|----------------------|
${spreadSizeTable}

**THE CONVICTION QUESTIONS:**
1. **Am I confident this team WINS?** → Investigate if ML makes sense
2. **Am I confident the MARGIN is mispriced?** → Investigate if Spread makes sense
3. **Am I confident about BOTH?** → Choose based on where conviction is stronger

**EXAMPLE:**
${config.example}

**THE KEY:** Match the bet type to what you're actually confident about.`;
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the Better Bet Framework for a sport.
 * @param {string} sport - Sport identifier (NBA, NCAAB, NFL, NCAAF, NHL, or aliased forms)
 * @returns {string} The complete Better Bet Framework text for the sport
 */
export function getBetterBetFramework(sport) {
  const normalized = sport?.toUpperCase?.()
    .replace('BASKETBALL_', '')
    .replace('AMERICANFOOTBALL_', '')
    .replace('ICEHOCKEY_', '') || sport;

  if (normalized === 'NHL') {
    return buildNHLFramework();
  }

  const config = SPREAD_CONFIGS[normalized];
  if (!config) {
    console.warn(`[BetterBetFramework] Unknown sport: ${sport}, returning empty`);
    return '';
  }

  return buildSpreadFramework(config);
}
