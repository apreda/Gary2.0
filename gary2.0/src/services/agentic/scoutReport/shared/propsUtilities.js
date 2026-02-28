/**
 * Props Utilities
 *
 * Props-related functions extracted from the monolithic scoutReportBuilder.js.
 * Includes comprehensive props narrative fetching, line movement tracking,
 * and related parsing utilities.
 */

import { getGeminiClient } from './grounding.js';

// ─── fetchComprehensivePropsNarrative ───────────────────────────────────────

export async function fetchComprehensivePropsNarrative(homeTeam, awayTeam, sport, gameDate, options = {}) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Props Narrative] Gemini not available');
    return null;
  }

  try {
    const today = gameDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Flash for grounding searches (Pro as 429 fallback only)
    const modelName = 'gemini-3-flash-preview';

    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 1.0 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });

    // Sport-specific comprehensive prompts
    let prompt;

    if (sport === 'NBA' || sport === 'basketball_nba') {
      prompt = `For the NBA game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & SITUATIONAL ==
Search for the ABSOLUTE LATEST news (within 24 hours):
- LAST-MINUTE SCRATCHES: Any players ruled OUT after the official injury report?
- TRADE RUMORS: Any active trade talks involving players on either team?
- COACHING CHANGES: Any recent firings, interim coaches, or system changes?
- LOCKER ROOM DRAMA: Any reported chemistry issues, player feuds, or team meetings?
- ROSTER MOVES: Any recent signings, waivers, or 10-day contracts?

== SECTION 2: MOTIVATION FACTORS ==
Search for context that affects player effort/focus:
- REVENGE GAMES: Is any player facing their FORMER TEAM? (e.g., traded in past 2 years)
  * List player name, when they were traded, and any reported comments
- MILESTONE CHASING: Is any player close to a career milestone? (e.g., 20k points, triple-double streak)
- CONTRACT YEAR: Which players are in a contract year (expiring contract) and might be extra motivated?
- JERSEY RETIREMENT / TRIBUTE: Any special ceremony or tribute night?
- RETURN FROM INJURY: Any star returning after missing 3+ games?
- PLAYOFF IMPLICATIONS: Are either team fighting for playoff position, play-in, or seeding?

== SECTION 3: SCHEDULE & TRAVEL CONTEXT ==
- BACK-TO-BACK: Is either team on the 2nd night of a back-to-back?
- 3-IN-4 / 4-IN-5: Is either team in a compressed schedule?
- TRAVEL FATIGUE: Did either team just travel cross-country (e.g., East to West coast)?
- TRAP GAME SPOT: Is a good team playing a lottery team right BEFORE a big rivalry game?
- ALTITUDE FACTOR: Is this game in Denver (elevation affects visiting teams)?
- REST ADVANTAGE: How many days rest does each team have?
- ROAD TRIP: Is either team on an extended road trip (4+ games)?

== SECTION 4: PLAYER-SPECIFIC CONTEXT ==
For the TOP PLAYERS on each team:
- LOAD MANAGEMENT RISK: Which stars typically rest on B2Bs or vs bad teams?
- MATCHUP HISTORY: Any notable player-vs-player history? (e.g., Tatum vs Butler)
- RECENT QUOTES: Any notable coach or player comments about tonight's game?
- OFF-COURT ISSUES: Any reported personal matters affecting a player?
- MINUTES RESTRICTION: Any player returning on a minutes limit?
- ROLE CHANGE: Any player recently moved to starter or bench?

== SECTION 5: TEAM TRENDS & CONTEXT ==
- WIN/LOSE STREAKS: Current streak for each team and context (e.g., "Won 5 straight by avg 15 pts")
- HOME/ROAD SPLITS: Is either team significantly better at home? MSG effect? Denver altitude?
- DIVISION RIVALRY: Are these division rivals? Conference rivals?
- REVENGE SPOT: Did these teams play recently with a controversial ending?

== SECTION 6: GAME ENVIRONMENT (AFFECTS PROP CEILINGS) ==
- GAME TOTAL (O/U): What is the over/under? (High O/U like 235+ = more scoring opportunities)
- SPREAD & BLOWOUT RISK: What is the spread? (Large spread -9+ = starters may rest in 4th quarter)
- PACE OF PLAY: Which team plays faster/slower? (Fast pace = more possessions = higher stat ceilings)
- CLOSE GAME EXPECTED: Is the spread within 5 points? (Starters play 36+ minutes)

== SECTION 7: HISTORICAL PATTERNS (PLAYER-SPECIFIC) ==
- PLAYER VS OPPONENT: Any notable player vs this specific team history? (e.g., "Trae Young averages 28 PPG vs Miami career")
- PRIMETIME PERFORMANCE: Is this a nationally televised game (ESPN/TNT)? Some players elevate on big stages.
- CONSISTENCY/FLOOR-CEILING: Which players have high variance (boom-or-bust) vs consistent outputs?

== SECTION 8: NBA ADVANCED STATS (PREDICTIVE METRICS) ==
Search nba.com/stats and basketball-reference.com for tracking data that PREDICTS future performance:

**For Scorers on ${homeTeam} and ${awayTeam}:**
- USAGE RATE: % of team plays used when on court (high usage 28%+ = volume scorer, more FGA)
- TRUE SHOOTING % (TS%): Efficiency accounting for 3s and FTs (elite is 60%+)
- POINTS PER POSSESSION: How efficient is the player in isolation/P&R?
- SHOT DISTRIBUTION: What % of shots are at rim vs mid-range vs 3? (affects consistency)
- FREE THROW RATE: Does this player get to the line? (boosts points floor)

**For Playmakers on ${homeTeam} and ${awayTeam}:**
- ASSIST %: % of teammate FGs assisted while on court (high = true playmaker)
- POTENTIAL ASSISTS: Passes that should be assists if teammates hit shots
- TIME OF POSSESSION: Ball-dominant guards hold ball longer = more assist opportunities
- PICK & ROLL FREQUENCY: How often do they run P&R? (affects assist upside)

**For Rebounders on ${homeTeam} and ${awayTeam}:**
- REBOUND %: % of available rebounds grabbed (offensive vs defensive split)
- CONTESTED REBOUND %: How many of their boards are contested?
- BOX OUT RATE: Do they create opportunities or just clean up?

**For 3-Point Shooters:**
- 3PA PER GAME: Volume of attempts (more attempts = more variance)
- CATCH & SHOOT %: Are they better spot-up or off-dribble?
- CORNER 3 %: Corner is highest % shot - do they get corner looks?
- WIDE OPEN 3% (defender 6+ feet): How do they shoot when open?

**PACE & ENVIRONMENT FACTORS:**
- TEAM PACE: Possessions per 48 minutes (fast pace 102+ = stat inflation)
- OPPONENT PACE: Will this game be fast or slow?
- DEFENSIVE RATING vs POSITION: How does opponent defend this position?
- MINUTES PROJECTION: Based on rotation, blowout risk, back-to-back status

**MATCHUP-SPECIFIC (Critical for Props):**
- How does ${homeTeam} defense rank in POINTS ALLOWED to guards/forwards/centers?
- How does ${awayTeam} defense rank vs 3-point shooters?
- Any player whose USAGE is spiking due to teammate injuries?
- Any player whose efficiency (TS%) is unsustainably high/low? (regression candidate)

== SECTION 9: BETTING MARKET SIGNALS ==
NOTE: These are SUPPLEMENTARY data points only - NOT decisive factors for picks.
- LINE MOVEMENT: Has the spread moved significantly? (e.g., opened -3, now -5.5)
- PUBLIC BETTING %: What percentage of public is on each team? (Note if lopsided, like 85%)
- SHARP MONEY: Any reports of sharp/professional money on one side?

FORMAT YOUR RESPONSE with clear section headers. Be FACTUAL - if you can't find info, say "No data found" rather than guessing.

CRITICAL RULES:
1. **ACCURACY IS PARAMOUNT**: Double-check all stats, scoring streaks, and injury updates from the last 24-48 hours. If a player had a game yesterday, ENSURE you have those stats.
2. **NO HALLUCINATIONS**: Do NOT repeat narrative "streaks" (e.g., "11 straight games with 30 pts") unless you are 100% certain. If in doubt, stick to general trends.
3. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
4. NO OPINIONS - Do NOT copy predictions like "The Hawks will win because..." from any source
5. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize text from articles
6. VERIFY STATS - Only include stats you can verify from official sources (including nba.com/stats)
7. NO BETTING ADVICE - Gary will make his own decision - you just provide CONTEXT
8. ADVANCED STATS: Prioritize tracking data from nba.com/stats for predictive metrics`;
    }
    else if (sport === 'NHL' || sport === 'icehockey_nhl') {
      prompt = `For the NHL game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & SITUATIONAL ==
- LAST-MINUTE SCRATCHES: Any players ruled OUT after morning skate?
- TRADE RUMORS: Any active trade talks? (especially before trade deadline)
- COACHING CHANGES: Any recent firings or interim coaches?
- ROSTER MOVES: Any recent call-ups from AHL or waivers?

== SECTION 2: MOTIVATION FACTORS ==
- REVENGE GAMES: Is any player facing their FORMER TEAM?
- MILESTONE CHASING: Any player close to career milestone? (e.g., 500 goals)
- CONTRACT YEAR: Which players have expiring contracts?
- RETURN FROM INJURY: Any star returning from LTIR?
- PLAYOFF IMPLICATIONS: Playoff race standings for both teams?

== SECTION 3: GOALIE SITUATION (CRITICAL FOR PROPS) ==
- WHO IS STARTING for ${homeTeam}? (confirmed or expected)
- WHO IS STARTING for ${awayTeam}? (confirmed or expected)
- Is either goalie on a B2B (likely to rest)?
- Any goalie controversies or platoon situations?

== SECTION 4: SCHEDULE & TRAVEL CONTEXT ==
- BACK-TO-BACK: Is either team on 2nd night of B2B?
- ROAD TRIP LENGTH: Is either team on an extended road trip?
- REST ADVANTAGE: Days rest for each team?
- TRAVEL FATIGUE: Cross-country travel?

== SECTION 5: PLAYER-SPECIFIC CONTEXT ==
For top scorers/players:
- LOAD MANAGEMENT: Any stars likely to rest?
- LINE CHANGES: Any recent line combination changes?
- HOT/COLD STREAKS: Any player on a notable scoring streak or slump?
- RECENT QUOTES: Coach comments about specific players?

== SECTION 6: TEAM TRENDS ==
- WIN/LOSE STREAKS: Current streak and context
- DIVISION RIVALRY: Are these division rivals?
- RECENT H2H: Did these teams play recently?

== SECTION 7: GAME ENVIRONMENT ==
- GAME TOTAL (O/U): What is the over/under? (High O/U 6.5+ = more scoring expected)
- SPREAD & GAME SCRIPT: What is the spread? Trailing team may pull goalie late.
- CONSISTENCY: Which players have high floor vs boom-or-bust tendencies?

== SECTION 8: NHL ADVANCED STATS (PREDICTIVE METRICS) ==
Search moneypuck.com, naturalstattrick.com, and nhl.com/stats for tracking data that PREDICTS future performance:

**For Skaters on ${homeTeam} and ${awayTeam}:**
- INDIVIDUAL EXPECTED GOALS (ixG): Shot quality - are they getting HIGH DANGER chances?
- GOALS ABOVE EXPECTED (GAE): Positive = finishing above expected, Negative = finishing below expected.
- HIGH DANGER CHANCES (HDC): Scoring chances from slot/crease area.
- SHOOTING %: Is it unsustainably high (15%+) or low (<5%)? NHL average is ~10%
- INDIVIDUAL CORSI FOR (iCF): Total shot attempts - volume indicator

**For Goal Scorers:**
- ixG vs ACTUAL GOALS: If ixG >> goals, they're UNLUCKY and due for regression UP
- ixG vs ACTUAL GOALS: If goals >> ixG, they're LUCKY and may regress DOWN
- HDC/60: High danger chances per 60 minutes - who's getting quality looks?
- SHOOTING % TREND: Compare career avg to current season (regression candidate?)

**For Assist/Points Props:**
- PRIMARY ASSISTS: More valuable than secondary assists (repeatable skill)
- 5v5 vs PP PRODUCTION: What % comes from power play? (PP1 = high upside)
- ON-ICE xGF: When this player is on ice, how much xG does the team generate?
- LINEMATE QUALITY: Who are they playing with? Elite center = more assists

**For SOG (Shots on Goal) Props:**
- iCF (Individual Corsi For): Total shot ATTEMPTS (more predictive than SOG)
- SHOTS THROUGH %: What % of attempts reach the net? (consistency indicator)
- SHOT RATE/60: Shots per 60 minutes of ice time
- O-ZONE STARTS %: More offensive zone starts = more shot opportunities

**Team-Level Predictive Metrics:**
- ${homeTeam} xGF/60 (expected goals for per 60): Offensive generation quality
- ${awayTeam} xGF/60: Offensive generation quality
- ${homeTeam} xGA/60 (expected goals against per 60): Defensive quality
- ${awayTeam} xGA/60: Defensive quality
- PDO: Team shooting % + save %. If > 102, regression DOWN likely. If < 98, regression UP likely.

**MATCHUP-SPECIFIC (Critical for Props):**
- ${homeTeam} goalie xSV% (expected save %): Is goalie over/under-performing?
- ${awayTeam} goalie xSV%: Is goalie over/under-performing?
- Any player whose GOALS >> ixG? (lucky, may regress down)
- Any player whose ixG >> GOALS? (unlucky, due for regression up - TARGET THESE)

== SECTION 9: BETTING MARKET SIGNALS ==
SUPPLEMENTARY DATA ONLY - not decisive:
- LINE MOVEMENT: Significant spread/total movement?
- PUBLIC %: Lopsided public betting?

FORMAT with clear section headers. Be FACTUAL - say "No data found" if unsure.

CRITICAL RULES:
1. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
2. NO OPINIONS - Do NOT copy predictions from any source
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize
4. NO BETTING ADVICE - Gary will make his own decision - you just provide CONTEXT
5. ADVANCED STATS: Prioritize xG data from moneypuck.com or naturalstattrick.com`;
    }
    else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      prompt = `For the NFL game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & SITUATIONAL ==
- GAMEDAY INACTIVES: Any surprise inactives announced today?
- TRADE RUMORS: Any active trade talks?
- COACHING CHANGES: Any coordinator changes or interim situations?
- LOCKER ROOM DRAMA: Any reported chemistry issues?
- ROSTER MOVES: Any recent signings off practice squad?

== SECTION 2: QB SITUATION (CRITICAL) ==
- STARTING QB for ${homeTeam}: Name, status, any concerns?
- STARTING QB for ${awayTeam}: Name, status, any concerns?
- Any QB injuries or changes from last week?
- Backup QB situation if relevant?

== SECTION 3: MOTIVATION FACTORS ==
- REVENGE GAMES: Any player facing former team? (trades in past 2 years)
- MILESTONE CHASING: Any player close to career milestone?
- CONTRACT YEAR: Which skill players are in contract year?
- PLAYOFF IMPLICATIONS: Playoff standings, division race, seeding implications?

== SECTION 4: SCHEDULE & GAME CONTEXT ==
- GAME TYPE: Is this TNF, SNF, MNF, Saturday, or Sunday?
- SHORT WEEK: Did either team play on Thursday/Monday last week?
- TRAVEL: Cross-country travel or timezone changes?
- DIVISIONAL: Are these division rivals?

== SECTION 5: WEATHER IMPACT (CRITICAL FOR OUTDOOR GAMES) ==
- STADIUM TYPE: Is this a dome or outdoor stadium?
- FORECAST: Temperature, wind speed, precipitation chance at game time
- WIND IMPACT: Is wind 15+ mph? (affects passing, FG accuracy)
- COLD WEATHER: Is it below 35°F? (affects grip, passing games)
- RAIN/SNOW: Any precipitation expected? (favors run game)
- PLAYER WEATHER HISTORY: How do the QBs perform in similar conditions?
  * ${homeTeam} QB: Career stats in cold/wind/rain if relevant
  * ${awayTeam} QB: Career stats in cold/wind/rain if relevant
- WEATHER EDGE: Does either team have a significant weather advantage? (dome team in cold, etc.)

== SECTION 6: PLAYER-SPECIFIC CONTEXT ==
For TOP skill players (QB, RB1, WR1, TE1):
- TARGET SHARE TRENDS: Any recent usage changes?
- SNAP COUNTS: Any player on limited snaps?
- MATCHUP HISTORY: Notable player-vs-defense history?
- RECENT QUOTES: Coach comments about game plan or player usage?
- WEATHER PERFORMANCE: Any players known to struggle/excel in expected conditions?

== SECTION 7: RED ZONE & TD DATA (CRITICAL FOR TD PROPS) ==

**Team Red Zone Efficiency (ANYTIME TD):**
- ${homeTeam}: Red zone TD % (how often do they score TDs vs FGs when inside 20?)
- ${awayTeam}: Red zone TD % (how often do they score TDs vs FGs when inside 20?)
- ${homeTeam}: Red zone DEFENSE - TD % allowed (do they bend but don't break, or give up TDs?)
- ${awayTeam}: Red zone DEFENSE - TD % allowed

**Red Zone Target/Touch Leaders for ${homeTeam}:**
- Who leads in RED ZONE TARGETS? (often different than overall target share)
- Who gets GOAL LINE CARRIES? (inside 5 yards - is there a "vulture"?)
- Who is the preferred red zone TE? (TEs often spike in red zone usage)

**Red Zone Target/Touch Leaders for ${awayTeam}:**
- Who leads in RED ZONE TARGETS?
- Who gets GOAL LINE CARRIES?
- Who is the preferred red zone TE?

**TD Rate Context:**
- Any players with unusually HIGH TD rate that may regress? (lucky TDs)
- Any players with unusually LOW TD rate despite high usage? (unlucky, due for TDs)
- Goal line back vs committee situation for each team

**FIRST TD SCORER DATA (CRITICAL FOR 1ST TD PROPS):**
- ${homeTeam} "Scores First" %: How often does this team score the first TD of the game?
- ${awayTeam} "Scores First" %: How often does this team score the first TD of the game?
- ${homeTeam} 1st Drive TD %: How often do they score a TD on their opening drive?
- ${awayTeam} 1st Drive TD %: How often do they score a TD on their opening drive?
- ${homeTeam} 1st Quarter TD Leaders: Who has scored the most 1st quarter TDs this season?
- ${awayTeam} 1st Quarter TD Leaders: Who has scored the most 1st quarter TDs this season?
- Opening script tendencies: Any coach known for scripted opening drives that feature specific players?
- Historical 1st TD scorers: Any players on either team with notably high 1st TD rate this season?

== SECTION 8: INJURY CONTEXT (BEYOND REPORT) ==
- Players returning from multi-week absences?
- Players "questionable" who are expected to play?
- Any injuries that affect other players' usage (e.g., WR1 out = WR2 boost)?

== SECTION 9: TEAM TRENDS ==
- WIN/LOSE STREAKS: Current streak with context
- HOME/ROAD SPLITS: Significant home/road performance difference?
- DIVISION RIVALRY: Are these division rivals?

== SECTION 10: GAME ENVIRONMENT (AFFECTS PROP CEILINGS) ==
- GAME TOTAL (O/U): What is the over/under? (High O/U 48+ = shootout, more pass yards)
- SPREAD & GAME SCRIPT: What is the spread? Large favorites (-10+) may run clock late, affecting pass yards.
- PROJECTED GAME FLOW: Will trailing team need to throw more? (Good for pass/receiving props)
- PRIMETIME FACTOR: Is this SNF/MNF/TNF? National TV can affect player performance.

== SECTION 11: HISTORICAL PATTERNS (PLAYER-SPECIFIC) ==
- PLAYER VS OPPONENT: Any notable player vs this defense history?
- CONSISTENCY: Which players have high floor (reliable) vs boom-or-bust (high variance)?

== SECTION 12: NFL NEXT GEN STATS (PREDICTIVE METRICS) ==
Search nextgenstats.nfl.com for player tracking data that PREDICTS future performance:

**For WRs/TEs on ${homeTeam} and ${awayTeam}:**
- SEPARATION: Average yards of separation from defenders (higher = more open targets)
- CATCH RATE OVER EXPECTED (CROE): Are they elite at contested catches?
- AVERAGE DEPTH OF TARGET (aDOT): Deep threat (15+ yards) vs possession/slot (under 10)?
- CUSHION: How much space do defenders give them at snap?
- TARGET SHARE: % of team targets - who is the alpha?

**For RBs on ${homeTeam} and ${awayTeam}:**
- YARDS BEFORE CONTACT: How much is O-line creating vs RB creating?
- EXPECTED RUSHING YARDS: Based on blockers and defenders - are they over/under-performing?
- RUSH YARDS OVER EXPECTED (RYOE): Positive = creating, Negative = scheme-dependent
- 8+ DEFENDERS IN BOX %: How often are defenses stacking against them?

**For QBs on ${homeTeam} and ${awayTeam}:**
- COMPLETION % OVER EXPECTED (CPOE): Positive = accurate, Negative = inflated by scheme
- TIME TO THROW: Quick release (<2.5s) vs deep passer (>3.0s)?
- AGGRESSIVENESS: % of throws into tight windows
- PRESSURE RATE: How often is the O-line giving them time?
- CLEAN POCKET PASSER RATING vs UNDER PRESSURE RATING

**MATCHUP-SPECIFIC (Critical for Props):**
- ${homeTeam} defense: SEPARATION ALLOWED to WRs ranking.
- ${awayTeam} defense: PRESSURE RATE ranking.
- Expected vs actual production gaps for key players.

== SECTION 13: BETTING MARKET SIGNALS ==
SUPPLEMENTARY DATA ONLY - not decisive:
- LINE MOVEMENT: Has spread moved significantly?
- PUBLIC %: Lopsided public betting?

FORMAT with clear section headers. Be FACTUAL - say "No data found" if unsure.

CRITICAL RULES:
1. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
2. NO OPINIONS - Do NOT copy predictions like "The Cowboys will cover because..." from any source
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize text from articles
4. VERIFY STATS - Only include stats you can verify from official sources (including nextgenstats.nfl.com)
5. NO BETTING ADVICE - Gary will make his own decision - you just provide CONTEXT
6. NEXT GEN STATS: Prioritize data from nextgenstats.nfl.com for player tracking metrics
7. RED ZONE DATA: Prioritize red zone target/touch leaders for TD prop context`;
    }
    else {
      // Generic fallback for other sports
      prompt = `For the ${sport} game ${awayTeam} @ ${homeTeam} on ${today}:

Provide comprehensive narrative context including:
1. Breaking news and last-minute updates
2. Injuries and lineup changes
3. Motivation factors (revenge games, milestones, contract years)
4. Schedule context (back-to-backs, travel fatigue)
5. Team trends and recent form
6. Any betting line movement (as minor context only)

Be factual. Do NOT make predictions.`;
    }

    // Prepend date anchor to prevent training data contamination
    const dateAnchor = `<date_anchor>Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Use ONLY current 2025-26 season data.</date_anchor>\n`;
    prompt = dateAnchor + prompt;

    console.log(`[Props Narrative] Fetching comprehensive ${sport} context via Gemini...`);

    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.() || '';

    if (!text || text.length < 100) {
      console.warn('[Props Narrative] Gemini returned insufficient content');
      return null;
    }

    console.log(`[Props Narrative] ✓ Got comprehensive context (${text.length} chars)`);

    // Parse into structured sections for easier access
    const sections = parseNarrativeSections(text);

    return {
      raw: text,
      sections: sections,
      sport: sport,
      matchup: `${awayTeam} @ ${homeTeam}`,
      fetchedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('[Props Narrative] Error fetching context:', error.message);
    return null;
  }
}

// ─── parseNarrativeSections ─────────────────────────────────────────────────

/**
 * Parse the narrative text into structured sections
 */
export function parseNarrativeSections(text) {
  const sections = {
    breakingNews: '',
    motivation: '',
    schedule: '',
    playerContext: '',
    teamTrends: '',
    bettingSignals: '',
    injuries: '',
    qbSituation: '',
    goalies: '',
    weather: ''  // NEW: Weather section for NFL outdoor games
  };

  // Simple section extraction based on headers
  const sectionPatterns = [
    { key: 'breakingNews', patterns: ['BREAKING NEWS', 'SITUATIONAL', 'LAST-MINUTE', 'GAMEDAY INACTIVES'] },
    { key: 'motivation', patterns: ['MOTIVATION', 'REVENGE', 'MILESTONE', 'CONTRACT YEAR'] },
    { key: 'schedule', patterns: ['SCHEDULE', 'TRAVEL', 'BACK-TO-BACK', 'B2B', 'GAME CONTEXT'] },
    { key: 'weather', patterns: ['WEATHER', 'FORECAST', 'TEMPERATURE', 'WIND', 'OUTDOOR'] },
    { key: 'playerContext', patterns: ['PLAYER-SPECIFIC', 'PLAYER CONTEXT', 'TOP PLAYERS', 'TARGET SHARE'] },
    { key: 'teamTrends', patterns: ['TEAM TRENDS', 'STREAKS', 'WIN/LOSE', 'DIVISION'] },
    { key: 'bettingSignals', patterns: ['BETTING', 'LINE MOVEMENT', 'PUBLIC %', 'BETTING MARKET'] },
    { key: 'injuries', patterns: ['INJURY', 'INJURIES', 'INACTIVES'] },
    { key: 'qbSituation', patterns: ['QB SITUATION', 'STARTING QB', 'QUARTERBACK'] },
    { key: 'goalies', patterns: ['GOALIE', 'GOALIES', 'STARTING GOALIE'] }
  ];

  const lines = text.split('\n');
  let currentSection = '';
  let currentContent = [];

  for (const line of lines) {
    const upperLine = line.toUpperCase();

    // Check if this line starts a new section
    let newSection = null;
    for (const { key, patterns } of sectionPatterns) {
      if (patterns.some(p => upperLine.includes(p) && (upperLine.includes('==') || upperLine.includes('SECTION')))) {
        newSection = key;
        break;
      }
    }

    if (newSection) {
      // Save previous section
      if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = newSection;
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Save final section
  if (currentSection && currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

// ─── fetchPropLineMovement ──────────────────────────────────────────────────

/**
 * Fetch prop line movement data via Gemini Grounding
 * Queries ScoresAndOdds and BettingPros for opening vs. current lines
 *
 * @param {string} sport - 'NBA' | 'NFL' | 'NHL'
 * @param {string} gameDate - Game date (YYYY-MM-DD or human readable)
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {Array} playerProps - Optional: specific players to check [{player, prop_type}]
 * @returns {Object} Map of player_propType -> lineMovement data
 */
export async function fetchPropLineMovement(sport, gameDate, homeTeam, awayTeam, playerProps = []) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Line Movement] Gemini not available');
    return { movements: {}, source: 'UNAVAILABLE' };
  }

  try {
    const dateStr = gameDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Use Flash model for efficiency
    const modelName = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';

    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 1.0, // Gemini 3: Keep at 1.0 - lower values cause looping/degraded performance
        maxOutputTokens: 3000
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });

    // Build sport-specific prop types and star players to search
    let propTypes = '';
    let starPlayers = '';
    if (sport === 'NBA' || sport === 'basketball_nba') {
      propTypes = 'points, rebounds, assists, threes made';
    } else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      propTypes = 'passing yards, rushing yards, receiving yards, receptions';
    } else if (sport === 'NHL' || sport === 'icehockey_nhl') {
      propTypes = 'shots on goal, points, goals, assists';
    }

    // Query with a more natural prompt that's easier for Gemini to respond to
    const query = `Search site:scoresandodds.com and site:bettingpros.com for player prop betting lines for the ${sport.toUpperCase()} game: ${awayTeam} at ${homeTeam} on ${dateStr}.

I need to know which player prop lines have MOVED from their opening numbers. Look for props like ${propTypes}.

For each prop where you can find BOTH the opening line AND the current line, tell me:
- Player name
- Prop type (points, rebounds, yards, etc.)
- Opening line (the number it opened at)
- Current line (what it is now)

Example format:
"LeBron James points opened at 25.5, now at 27.5 (moved up 2 points)"
"Jayson Tatum rebounds opened at 8.5, now at 7.5 (moved down 1 point)"

Focus on significant moves (1+ point difference). List as many as you can find from ScoresAndOdds or BettingPros prop pages.`;

    console.log(`[Line Movement] Querying Gemini for ${sport} props: ${awayTeam} @ ${homeTeam}`);

    const result = await model.generateContent(query);
    const response = result.response;
    const text = response.text();

    if (!text) {
      console.log('[Line Movement] No response from Gemini');
      return { movements: {}, source: 'NO_DATA' };
    }

    console.log(`[Line Movement] Response received (${text.length} chars)`);
    // Debug: Log first 500 chars to see format
    console.log(`[Line Movement] Preview: ${text.substring(0, 500).replace(/\n/g, ' | ')}...`);

    // Parse the response into structured format
    const movements = parseLineMovementResponse(text, sport);

    console.log(`[Line Movement] Parsed ${Object.keys(movements).length} line movements`);

    return {
      movements,
      source: 'ScoresAndOdds/BettingPros',
      rawResponse: text,
      gameInfo: { sport, homeTeam, awayTeam, gameDate: dateStr }
    };

  } catch (error) {
    console.error('[Line Movement] Error:', error.message);
    return { movements: {}, source: 'ERROR', error: error.message };
  }
}

// ─── parseLineMovementResponse ──────────────────────────────────────────────

/**
 * Parse the Gemini response for line movement data
 * Uses multiple parsing strategies to handle different response formats
 * @param {string} text - Raw response text
 * @param {string} sport - Sport for context
 * @returns {Object} Map of player_prop -> movement data
 */
export function parseLineMovementResponse(text, sport = '') {
  const movements = {};

  // FIRST: Strip markdown formatting that breaks regex
  // Remove bold (**text**), italic (*text*), and other markdown
  let cleanText = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
    .replace(/\*([^*]+)\*/g, '$1')       // Remove *italic*
    .replace(/`([^`]+)`/g, '$1')         // Remove `code`
    .replace(/###?\s*/g, '')             // Remove ### headers
    .replace(/\|\s*\|/g, '\n')           // Convert table separators to newlines
    .replace(/\|/g, ' ')                 // Remove remaining pipes
    .replace(/\s+/g, ' ')                // Collapse multiple spaces
    .trim();

  console.log(`[Line Movement] Clean text preview: ${cleanText.substring(0, 300)}...`);

  // Strategy 1: Look for structured format (PLAYER:, PROP:, etc.)
  const structuredEntries = cleanText.split(/PLAYER:\s*/i).filter(e => e.trim());

  for (const entry of structuredEntries) {
    try {
      const playerMatch = entry.match(/^([A-Za-z\s\.\-']+?)(?:\n|PROP:)/i);
      if (!playerMatch) continue;
      const player = playerMatch[1].trim();

      const propMatch = entry.match(/PROP:\s*([^\n]+)/i);
      if (!propMatch) continue;
      const prop = propMatch[1].trim().toLowerCase();

      const openMatch = entry.match(/OPEN(?:ED)?(?:\s*(?:AT|:))?\s*([\d.]+)/i);
      if (!openMatch) continue;
      const open = parseFloat(openMatch[1]);

      const currentMatch = entry.match(/CURRENT(?:\s*(?:AT|:|\s+LINE))?\s*([\d.]+)/i);
      if (!currentMatch) continue;
      const current = parseFloat(currentMatch[1]);

      const directionMatch = entry.match(/DIRECTION:\s*(UP|DOWN)/i);
      const direction = directionMatch ? directionMatch[1].toUpperCase() : (current > open ? 'UP' : 'DOWN');

      addMovement(movements, player, prop, open, current, direction);
    } catch (e) {
      continue;
    }
  }

  // Strategy 2: Look for natural language patterns
  // Pattern: "Player Name prop opened at X, now at Y"
  const naturalPatterns = [
    // "Norman Powell (Heat) points opened at 20.5, now at 23.5" - with team in parens
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)*)\s*\([^)]+\)\s*(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing\s*yards?|rushing\s*yards?|receiving\s*yards?)(?:\s+(?:prop|line))?\s+opened\s+(?:at\s+)?([\d.]+)[,\s]+(?:now|currently)\s+(?:at\s+)?([\d.]+)/gi,

    // "LeBron James points opened at 25.5, now at 27.5" - without team
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s+(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing\s*yards?|rushing\s*yards?|receiving\s*yards?)(?:\s+(?:prop|line))?\s+opened\s+(?:at\s+)?([\d.]+)[,\s]+(?:now|currently)\s+(?:at\s+)?([\d.]+)/gi,

    // "Player Name's points line moved from 25.5 to 27.5"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)(?:'s)?\s+(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing\s*yards?|rushing\s*yards?|receiving\s*yards?)(?:\s+(?:prop|line))?\s+(?:moved|went)\s+(?:from\s+)?([\d.]+)\s+to\s+([\d.]+)/gi,

    // "Points: 25.5 → 27.5" with player context
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)[:\s-]+\s*(points?|rebounds?|assists?|threes?|shots?|goals?|assists?|saves?|yards?|receptions?)[:\s]*([\d.]+)\s*(?:→|->|to|=>)\s*([\d.]+)/gi,

    // "Player Name - points 25.5 to 27.5" or "Player Name points: 25.5 -> 27.5"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–:]\s*(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?)\s*(?::|prop|line)?\s*([\d.]+)\s*(?:→|->|to|=>|,\s*now)\s*([\d.]+)/gi,

    // Table format: "| Player Name | points | 25.5 | 27.5 |"
    /\|\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*\|\s*(points?|rebounds?|assists?|threes?|shots?|goals?|yards?|receptions?|saves?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/gi,
  ];

  // Strategy 2.5: Parse Gemini's structured format with "Opening Line:" and "Current Line:"
  // This handles output like: "Bam Adebayo (Heat) Prop Type: Points Opening Line: 14.5 Current Line: 15.5"
  const geminiStructuredPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)*)\s*\([^)]+\).*?Prop\s*Type:\s*(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?).*?Opening\s*Line:\s*([\d.]+).*?Current\s*Line:\s*([\d.]+)/gi;

  let geminiMatch;
  while ((geminiMatch = geminiStructuredPattern.exec(cleanText)) !== null) {
    try {
      const [, player, prop, openStr, currentStr] = geminiMatch;
      const open = parseFloat(openStr);
      const current = parseFloat(currentStr);

      if (!isNaN(open) && !isNaN(current) && open !== current) {
        const direction = current > open ? 'UP' : 'DOWN';
        addMovement(movements, player.trim(), prop.trim().toLowerCase(), open, current, direction);
      }
    } catch (e) {
      continue;
    }
  }

  // Also try to find standalone "Opening Line: X Current Line: Y" with player context nearby
  const openingCurrentPattern = /Opening\s*Line:\s*([\d.]+).*?Current\s*Line:\s*([\d.]+)/gi;
  let ocMatch;
  while ((ocMatch = openingCurrentPattern.exec(cleanText)) !== null) {
    try {
      const open = parseFloat(ocMatch[1]);
      const current = parseFloat(ocMatch[2]);

      if (isNaN(open) || isNaN(current) || open === current) continue;

      // Look backwards for player and prop type
      const beforeText = cleanText.substring(Math.max(0, ocMatch.index - 200), ocMatch.index);

      // Find player name (with team in parens)
      const playerMatch = beforeText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z']+)*)\s*\([^)]+\)/);
      const playerWithoutTeam = beforeText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*$/);
      const player = playerMatch ? playerMatch[1] : (playerWithoutTeam ? playerWithoutTeam[1] : null);

      // Find prop type
      const propMatch = beforeText.match(/Prop\s*Type:\s*(points?|rebounds?|assists?|threes?|shots?|goals?|yards?|receptions?|saves?)/i) ||
                        beforeText.match(/(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?)\s*$/i);
      const prop = propMatch ? propMatch[1] : null;

      if (player && prop) {
        const direction = current > open ? 'UP' : 'DOWN';
        addMovement(movements, player.trim(), prop.trim().toLowerCase(), open, current, direction);
      }
    } catch (e) {
      continue;
    }
  }

  for (const pattern of naturalPatterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    while ((match = pattern.exec(cleanText)) !== null) {
      try {
        const [, player, prop, openStr, currentStr] = match;
        const open = parseFloat(openStr);
        const current = parseFloat(currentStr);

        if (!isNaN(open) && !isNaN(current) && open !== current) {
          const direction = current > open ? 'UP' : 'DOWN';
          addMovement(movements, player.trim(), prop.trim().toLowerCase(), open, current, direction);
        }
      } catch (e) {
        continue;
      }
    }
  }

  // Strategy 3: Look for any "opened/open" and "now/current" numbers near player names
  const lines = cleanText.split(/\n|(?:\.\s+)/); // Split on newlines or sentence endings
  let currentPlayer = null;

  for (const line of lines) {
    // Check if line mentions a player (capitalized name pattern)
    const playerInLine = line.match(/^[•\-\*]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)/);
    if (playerInLine) {
      currentPlayer = playerInLine[1].trim();
    }

    // Also check for player with team in parens: "Norman Powell (Heat)"
    const playerWithTeam = line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z']+)*)\s*\([^)]+\)/);
    if (playerWithTeam) {
      currentPlayer = playerWithTeam[1].trim();
    }

    // Look for open/current pattern in the line
    const openCurrentMatch = line.match(/open(?:ed|ing)?\s*(?:at|:)?\s*([\d.]+).*?(?:now|current(?:ly)?|moved\s+to)\s*(?:at|:)?\s*([\d.]+)/i);
    if (openCurrentMatch && currentPlayer) {
      const open = parseFloat(openCurrentMatch[1]);
      const current = parseFloat(openCurrentMatch[2]);

      // Try to find prop type in the line
      const propMatch = line.match(/(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing|rushing|receiving)/i);
      const prop = propMatch ? propMatch[1].toLowerCase() : 'unknown';

      if (!isNaN(open) && !isNaN(current) && open !== current) {
        const direction = current > open ? 'UP' : 'DOWN';
        addMovement(movements, currentPlayer, prop, open, current, direction);
      }
    }
  }

  // Strategy 4: Look for "X.5 to Y.5" or "X.5 → Y.5" patterns with nearby player names
  const numberMovePattern = /([\d.]+)\s*(?:→|->|to|=>)\s*([\d.]+)/g;
  let numberMatch;
  while ((numberMatch = numberMovePattern.exec(cleanText)) !== null) {
    const open = parseFloat(numberMatch[1]);
    const current = parseFloat(numberMatch[2]);

    if (isNaN(open) || isNaN(current) || open === current) continue;

    // Look backwards for player name (within 100 chars)
    const beforeText = cleanText.substring(Math.max(0, numberMatch.index - 100), numberMatch.index);
    const playerBefore = beforeText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*(?:[-–:]|'s)?\s*$/);

    // Look for prop type nearby
    const contextText = cleanText.substring(Math.max(0, numberMatch.index - 50), Math.min(cleanText.length, numberMatch.index + 50));
    const propNearby = contextText.match(/(points?|rebounds?|assists?|threes?|shots?\s*(?:on\s*goal)?|goals?|yards?|receptions?|saves?|passing|rushing|receiving)/i);

    if (playerBefore && propNearby) {
      const direction = current > open ? 'UP' : 'DOWN';
      addMovement(movements, playerBefore[1].trim(), propNearby[1].toLowerCase(), open, current, direction);
    }
  }

  return movements;
}

// ─── addMovement ────────────────────────────────────────────────────────────

/**
 * Helper to add a movement entry, avoiding duplicates
 */
export function addMovement(movements, player, prop, open, current, direction) {
  // Normalize prop name
  prop = prop.replace(/\s+/g, '_').toLowerCase();
  if (prop.includes('shot') && !prop.includes('goal')) prop = 'shots_on_goal';
  if (prop === 'three' || prop === 'threes') prop = 'threes';
  if (prop === 'point' || prop === 'pts') prop = 'points';
  if (prop === 'rebound' || prop === 'reb') prop = 'rebounds';
  if (prop === 'assist' || prop === 'ast') prop = 'assists';

  const key = `${player}_${prop}`.toLowerCase().replace(/\s+/g, '_');

  // Only add if not already present (avoid duplicates from multiple strategies)
  if (!movements[key]) {
    const magnitude = parseFloat((current - open).toFixed(1));

    movements[key] = {
      player,
      prop,
      open,
      current,
      direction,
      magnitude,
      signal: Math.abs(magnitude) >= 2.0 ? `MOVED_${direction}` : 'STABLE',
      killCondition: {
        triggered: false,
        reason: null
      }
    };

    console.log(`[Line Movement] Found: ${player} ${prop}: ${open} → ${current} (${direction} ${Math.abs(magnitude)})`);
  }
}

// ─── getPlayerPropMovement ──────────────────────────────────────────────────

/**
 * Get line movement for a specific player prop
 * @param {Object} movements - Full movements map from fetchPropLineMovement
 * @param {string} playerName - Player name to look up
 * @param {string} propType - Prop type (points, rebounds, etc.)
 * @returns {Object|null} Line movement data or null if not found
 */
export function getPlayerPropMovement(movements, playerName, propType) {
  if (!movements || !playerName || !propType) return null;

  const key = `${playerName}_${propType}`.toLowerCase().replace(/\s+/g, '_');

  // Try exact match first
  if (movements[key]) return movements[key];

  // Try partial match on player name
  const keys = Object.keys(movements);
  for (const k of keys) {
    const data = movements[k];
    if (data.player.toLowerCase().includes(playerName.toLowerCase()) &&
        data.prop.toLowerCase().includes(propType.toLowerCase())) {
      return data;
    }
  }

  return null;
}
