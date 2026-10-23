/** Scout-report data: The current-state narrative search and its scrub. (split from dataFetchers.js, Oct 13 2026) */
import { formatSeason } from '../../../../../../utils/dateUtils.js';
import { seasonForSport } from '../utilities.js';
import { groundingSearch } from '../grounding.js';
import { generateSolText } from '../../../../../content/insights/solText.js';
import { fetchAnthropicFootballCurrentState } from '../anthropicFootballGrounding.js';

// ============================================================================
// CURRENT STATE / NARRATIVE
// ============================================================================

export async function fetchCurrentState(homeTeam, awayTeam, sport, gameDate) {
  const isNFL = sport === 'NFL' || sport === 'americanfootball_nfl';
  const isNCAAF = sport === 'NCAAF' || sport === 'americanfootball_ncaaf';
  const isFootball = isNFL || isNCAAF;
  const footballFallback = async (reason) => {
    console.warn(`[Scout Report] Football current state falling back to Anthropic (${reason})`);
    const result = await fetchAnthropicFootballCurrentState({
      homeTeam, awayTeam, sport, gameDate,
    });
    return result ? {
      groundedRaw: result.data,
      groundingUsed: true,
      groundingProvider: result.provider,
    } : null;
  };

  try {
    const now = new Date();
    const today = gameDate || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const todayFull = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const seasonContext = formatSeason(seasonForSport(sport));

    const sportName = {
      'NFL': 'NFL', 'americanfootball_nfl': 'NFL',
      'NBA': 'NBA', 'basketball_nba': 'NBA',
      'NHL': 'NHL', 'icehockey_nhl': 'NHL',
      'NCAAB': 'college basketball', 'basketball_ncaab': 'college basketball',
      'NCAAF': 'college football', 'americanfootball_ncaaf': 'college football'
    }[sport] || sport;

    const isNBA = sport === 'NBA' || sport === 'basketball_nba';

    console.log(`[Scout Report] Fetching CURRENT STATE for ${awayTeam} @ ${homeTeam} (2-phase: Flash search → narrative)...`);
    const startTime = Date.now();

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentWindow = `${sevenDaysAgo.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} to ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    const searchQueries = [
      `${homeTeam} ${sportName} news ${recentWindow}. Recent games, results, scores, who played and who sat, trades, roster moves, injuries and returns.`,
      `${awayTeam} ${sportName} news ${recentWindow}. Recent games, results, scores, who played and who sat, trades, roster moves, injuries and returns.`,
      `${awayTeam} vs ${homeTeam} ${sportName} game ${today}. Tip time, venue, broadcast, who is expected to play and who is out, breaking news.`
    ];
    const queryLabels = ['HOME', 'AWAY', 'MATCHUP'];

    if (isFootball) {
      searchQueries.push(`${homeTeam} stadium weather forecast ${today}. Temperature, wind, precipitation for tonight's game.`);
      queryLabels.push('WEATHER');
    }

    if (isNBA) {
      searchQueries.push(`${homeTeam} ${awayTeam} NBA game tonight ${today}. Player availability, rest decisions, load management, who is sitting out, who is playing, game-day status, lineup decisions.`);
      queryLabels.push('AVAILABILITY');
    }

    const searchResults = await Promise.all(
      searchQueries.map((q, i) => {
        const label = queryLabels[i] || `QUERY_${i}`;
        return groundingSearch(null, q, todayFull)
          .then(text => {
            if (!text) {
              console.warn(`[Scout Report] Search ${label}: returned null/empty`);
              return { label, text: '' };
            }
            console.log(`[Scout Report] Search ${label}: ${text.length} chars`);
            return { label, text };
          })
          .catch(e => {
            console.warn(`[Scout Report] Search ${label} failed: ${e.message}`);
            return { label, text: '' };
          });
      })
    );

    const searchDuration = Date.now() - startTime;
    console.log(`[Scout Report] Phase 1 (search) completed in ${searchDuration}ms`);

    const homeContext = searchResults.find(r => r.label === 'HOME')?.text || '';
    const awayContext = searchResults.find(r => r.label === 'AWAY')?.text || '';
    const matchupContext = searchResults.find(r => r.label === 'MATCHUP')?.text || '';
    const weatherContext = searchResults.find(r => r.label === 'WEATHER')?.text || '';
    const availabilityContext = searchResults.find(r => r.label === 'AVAILABILITY')?.text || '';

    const totalSearchChars = homeContext.length + awayContext.length + matchupContext.length;
    if (totalSearchChars < 200) {
      throw new Error(`Search phase returned insufficient data (${totalSearchChars} chars total). Searches may have failed.`);
    }
    // A search that came back empty is a retrieval failure, and the report
    // must say so: with one team's news missing the write-up covered only the
    // other team and nothing told the reader why (Oct 3 2026).
    const reportingGaps = [[homeContext, `${homeTeam} news`], [awayContext, `${awayTeam} news`], [matchupContext, 'the matchup preview']]
      .filter(([text]) => !text).map(([, what]) => what);
    const reportingGapNote = reportingGaps.length
      ? `REPORTING GAP: the search for ${reportingGaps.join(' and ')} returned nothing for this game. This is a retrieval failure, not a quiet week; what follows covers only what was retrieved.\n\n`
      : '';

    const isNHL = sport === 'NHL' || sport === 'icehockey_nhl';

    const footballNarrativeInstructions = isFootball ? `
Also include (if found in the search results):
- **WEATHER:** Game-time conditions — only mention if SEVERE (blizzard, 25+ mph sustained wind, sub-15°F, heavy rain). Skip if dome/indoor.
- **GAME CONTEXT:** Game type (TNF/SNF/MNF/Saturday${isNCAAF ? '/Bowl/CFP' : ''}), divisional/conference matchup, playoff implications, what's at stake.
` : '';

    const narrativePrompt = `You are a sports journalist writing a current state report for a ${sportName} game.
Today is ${todayFull}. Season: ${seasonContext}.

Below are raw search results about both teams and tonight's matchup. Use this information to write a rich, detailed current state report.

<search_results>
--- ${homeTeam} NEWS & CONTEXT ---
${homeContext || '[No results found]'}

--- ${awayTeam} NEWS & CONTEXT ---
${awayContext || '[No results found]'}

--- MATCHUP: ${awayTeam} @ ${homeTeam} (${today}) ---
${matchupContext || '[No results found]'}
${weatherContext ? `\n--- WEATHER ---\n${weatherContext}` : ''}
${availabilityContext ? `\n--- GAME-DAY AVAILABILITY ---\n${availabilityContext}` : ''}
</search_results>

Based on the search results above, write the current state report. For EACH team, cover:

**${homeTeam} — What's going on with this team right now?**
- **RECENT GAMES:** This season's record, and each of the last few games: the date, the score, who played and who didn't, and the key performances.
- **LAST GAME:** What happened, with its date: the score, who played and for how long if reported, who left the game or didn't play, key performances.
- **TOP STORYLINES & HEADLINES:** The big stories around this team RIGHT NOW:
  * Recent trades, acquisitions, roster moves
  * Coaching news, fines, controversies, front office moves
  * Players RETURNING tonight who missed recent games (rest, minor injury, suspension)
  * Anything a knowledgeable fan would know about this team this week
  * Roster notes — key players emerging, role changes

**${awayTeam} — What's going on with this team right now?**
- Same categories as above.
${footballNarrativeInstructions}
**TODAY'S MATCHUP NEWS (${today}):**
- Game preview context: time, broadcast, venue
- Announcements about who plays tonight (starters, returns, rest)
- Any breaking news affecting tonight's game

RULES:
- Do NOT mention injuries or injury statuses (e.g., "OUT", "questionable", "OFS"). Injury data comes from a dedicated real-time source and is handled separately. EXCEPTIONS: (1) You MAY mention a player RETURNING tonight from absence as a storyline. (2) You MAY mention load management, rest decisions, or DNP-Rest — these game-day decisions do NOT appear on injury reports and are important context.
- Do NOT include ATS records, betting trends, cover percentages, or any against-the-spread statistics.
- Do NOT include HISTORICAL records or series history (e.g., "Team is 28-49 all-time at...", "first win since 2019", "lost 13 of last 19 trips"). These are descriptive, not predictive.
- Do NOT include conditional records (e.g., "15-0 when scoring 80+", "2-6 in Quad 1 games"). Focus on HOW they are playing, not won-loss tallies.
- Do NOT include future-tense content — no recruiting commitments, no next-season roster plans, no draft projections. Only cover what has ALREADY happened and what is relevant to TODAY'S game.
- Do NOT make betting predictions or pick a winner.
- Use specific details — names, dates, scores, quotes. No vague generalities.
- Only use information from the search results above. Do not make anything up.
- Write in a knowledgeable, factual tone. Think beat writer, not hype man.
- THIS SEASON ONLY: nothing about last season, earlier seasons or the preseason (no last-season records, finishes, playoff runs, averages or rankings, and no preseason games or numbers).
- Report what happened, each item with its date. No opinions, analysis, predictions or takes from anyone, no "the key question tonight is" framing, and no game plans or scheme breakdowns.
- No rates from a game or a short stretch (points per 100 possessions, shooting or efficiency percentages over a few games). Scores and box-score lines from specific games are fine.`;

    const narrativeStart = Date.now();
    // Narrative synthesis is a pure content pass over the search results —
    // it rides the content cascade (GPT 6.1 Sol first, Oct 1 2026) like every
    // other background content lane.
    const text = await generateSolText(narrativePrompt, { maxTokens: 8000, effort: 'high' });
    const narrativeDuration = Date.now() - narrativeStart;
    const totalDuration = Date.now() - startTime;
    console.log(`[Scout Report] Phase 2 (narrative) completed in ${narrativeDuration}ms. Total: ${totalDuration}ms`);

    const MIN_RESPONSE_LENGTH = 200;
    if (!text || text.length < MIN_RESPONSE_LENGTH) {
      const errorMsg = `Narrative too short (${text?.length || 0} chars). Response: "${text?.substring(0, 100) || 'empty'}"`;
      console.error(`[Scout Report] [NARRATIVE FAIL] ${errorMsg}`);
      throw new Error(`Current state narrative failed: ${errorMsg}`);
    }

    const textLower = text.toLowerCase();
    const homeMascot = homeTeam.split(' ').pop().toLowerCase();
    const awayMascot = awayTeam.split(' ').pop().toLowerCase();
    const mentionsHome = textLower.includes(homeTeam.toLowerCase()) || textLower.includes(homeMascot);
    const mentionsAway = textLower.includes(awayTeam.toLowerCase()) || textLower.includes(awayMascot);

    if (!mentionsHome && !mentionsAway) {
      throw new Error(`Narrative does not mention either team. Expected "${homeTeam}" or "${awayTeam}".`);
    }

    console.log(`[Scout Report] [NARRATIVE OK] ${text.length} chars, mentions: home=${mentionsHome}, away=${mentionsAway}`);

    let cleanedText = `${reportingGapNote}${text}`;
    const atsPattern = /^[^\n]*\b(\d+-\d+(?:-\d+)?\s+ATS|ATS\s+record|ATS\s+in|against the spread|cover\s+(?:percentage|pct|rate)|covers?\s+the\s+spread|betting\s+trend|public\s+betting|action\s+on)\b[^\n]*$/gim;
    const atsMatches = cleanedText.match(atsPattern);
    if (atsMatches) {
      console.log(`[Scout Report] Stripped ${atsMatches.length} ATS/betting line(s) from narrative`);
      cleanedText = cleanedText.replace(atsPattern, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    const preview = cleanedText.substring(0, 300).replace(/\n/g, ' ');
    console.log(`[Scout Report] Current state preview: ${preview}...`);
    console.log(`[Scout Report] === FULL CURRENT STATE START ===`);
    console.log(cleanedText);
    console.log(`[Scout Report] === FULL CURRENT STATE END ===`);

    return {
      groundedRaw: cleanedText,
      groundingUsed: true
    };

  } catch (error) {
    console.warn(`[Scout Report] Current state fetch failed: ${error.message}`);
    return isFootball ? footballFallback(error.message) : null;
  }
}

export async function scrubNarrative(narrative, allowedPlayers, homeTeam, awayTeam, excludedPlayers = []) {
  if (!narrative || !allowedPlayers || allowedPlayers.length === 0) return narrative;

  const scrubCheck = evaluateNarrativeScrubNeed(narrative, allowedPlayers, homeTeam, awayTeam, excludedPlayers);
  if (!scrubCheck.shouldScrub) {
    console.log('[Scout Report] Narrative scrub skipped - no invalid names or betting noise detected');
    return narrative;
  }

  console.log(`[Scout Report] Narrative scrub triggered: ${scrubCheck.reasons.join(', ')}`);

  try {
    const excludedSection = excludedPlayers.length > 0
      ? `\n### EXCLUDED PLAYERS (NEVER PLAYED THIS SEASON - 0 GAMES - ALWAYS REMOVE):\n${excludedPlayers.join(', ')}\nThese players have 0 games played this season. They have been out all year — the team has fully adjusted and the line reflects their absence. Remove ALL mentions.\n`
      : '';

    const prompt = `You are a data integrity tool. I will provide a news report about a sports matchup.

### TASK:
1. Remove any mentions of players in the EXCLUDED list (never played this season - 0 games, team has adjusted, absence is priced in)
2. Remove any mentions of players NOT in the VALID list
${excludedSection}
### VALID PLAYERS:
${allowedPlayers.join(', ')}

### NEWS REPORT TO CLEAN:
${narrative}

### STRICT RULES:
1. PRIORITY: If a sentence/bullet mentions ANY player in the EXCLUDED list, DELETE the entire sentence/bullet.
2. If a sentence mentions a player NOT in the VALID list, DELETE the entire sentence.
3. If a bullet point discusses a "ghost" player (not on the current roster), DELETE the entire bullet.
4. If a paragraph discusses the impact of an EXCLUDED player, DELETE that paragraph.
5. KEEP mentions of players who recently got injured (even season-ending injuries) IF they are in the VALID list.
6. DELETE any lines with ATS records, against-the-spread stats, cover percentages, or betting trends. These are FORBIDDEN.
7. DO NOT add any new info.
8. DO NOT explain your changes.
9. Return ONLY the cleaned text.
10. Preserve the headers and bullets for players who ARE in the valid list and NOT in excluded.

Cleaned Report:`;

    // Content pass on the cascade (Aug 24 2026, Gemini retired).
    const scrubbed = await generateSolText(prompt, { maxTokens: 8000, effort: 'low' }).catch(() => null);
    const cleaned = (scrubbed || narrative).trim();

    if (cleaned.length < 50 && narrative.length > 500) {
      console.warn(`[Scout Report] Scrubbing was too aggressive, falling back to original narrative`);
      return narrative;
    }
    
    return cleaned;
  } catch (e) {
    console.warn(`[Scout Report] Narrative scrubbing failed: ${e.message}`);
    return narrative;
  }
}

const NARRATIVE_ATS_PATTERN = /\b(?:ATS|against the spread|cover(?:s|ing| percentage| pct| rate)?|betting trend|public betting|action on)\b/i;
const NARRATIVE_NAME_PATTERN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g;
const NARRATIVE_IGNORED_PHRASES = new Set([
  'Recent Trajectory',
  'Last Game',
  'Top Storylines',
  'Top Storylines Headlines',
  'Todays Matchup News',
  'Today Matchup News',
  'Game Context',
  'Current State',
  'No Results Found',
  'Home Team',
  'Away Team'
]);

function normalizeNarrativeEntity(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildTeamWordSet(homeTeam = '', awayTeam = '') {
  return new Set(
    `${homeTeam} ${awayTeam}`
      .split(/\s+/)
      .map(word => word.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isTeamLikePhrase(candidate = '', teamWords = new Set()) {
  const words = String(candidate || '')
    .split(/\s+/)
    .map(word => word.trim().toLowerCase())
    .filter(Boolean);
  return words.length > 0 && words.every(word => teamWords.has(word));
}

function evaluateNarrativeScrubNeed(narrative, allowedPlayers, homeTeam, awayTeam, excludedPlayers = []) {
  const reasons = [];
  const normalizedNarrative = String(narrative || '');

  if (NARRATIVE_ATS_PATTERN.test(normalizedNarrative)) {
    reasons.push('betting-noise');
  }

  const excluded = excludedPlayers
    .map(name => normalizeNarrativeEntity(name))
    .filter(Boolean);

  if (excluded.some(name => normalizedNarrative.toLowerCase().includes(name))) {
    reasons.push('excluded-player');
  }

  const allowedSet = new Set(
    allowedPlayers
      .map(name => normalizeNarrativeEntity(name))
      .filter(Boolean)
  );
  const teamWords = buildTeamWordSet(homeTeam, awayTeam);
  const unknownNames = new Set();
  const matches = normalizedNarrative.match(NARRATIVE_NAME_PATTERN) || [];

  for (const rawMatch of matches) {
    const candidate = String(rawMatch || '').trim();
    const normalized = normalizeNarrativeEntity(candidate);
    if (!normalized) continue;
    if (allowedSet.has(normalized)) continue;
    if (normalizeNarrativeEntity(homeTeam) === normalized || normalizeNarrativeEntity(awayTeam) === normalized) continue;
    if (NARRATIVE_IGNORED_PHRASES.has(candidate)) continue;
    if (isTeamLikePhrase(candidate, teamWords)) continue;
    unknownNames.add(candidate);
  }

  if (unknownNames.size > 0) {
    reasons.push(`unknown-names:${Array.from(unknownNames).slice(0, 3).join('|')}`);
  }

  return {
    shouldScrub: reasons.length > 0,
    reasons
  };
}
