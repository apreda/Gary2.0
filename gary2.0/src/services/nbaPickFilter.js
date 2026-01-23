/**
 * NBA Pick Filter Service
 *
 * Filters Gary's NBA picks based on simple, effective rules.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Simplified Jan 2026):
 *
 * ALWAYS KEEP:
 * 1. National TV / Primetime games (ESPN, ABC, TNT, Amazon) - MUST HAVE PICKS
 * 2. All underdog spreads (any + spread)
 * 3. All ML picks - EXCEPT if either team is bottom 9 in league overall
 * 4. Road favorites (contrarian value)
 * 5. Small home favorites (-4.5 or less) - ONLY if team is top 6 in conference
 *
 * REMOVE:
 * - Home favorites -5 or more (chalk plays everyone takes - unless National TV)
 * - Small home favorites (-4.5 or less) if team is NOT top 6 in conference
 * - ML picks where EITHER team is bottom 9 in league overall (avoid bad teams)
 *
 * SAFETY:
 * - Minimum 3 picks per day - if filtered below 3, bring back lowest confidence picks
 *
 * Philosophy: Home favorites are the chalk plays everyone takes. We want underdog value,
 * road favorite contrarian plays, and ML conviction - but avoid terrible team matchups.
 */

import { ballDontLieService } from './ballDontLieService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Cache for standings and TV schedule (refreshed per run)
let standingsCache = null;
let nationalTVGamesCache = null;

/**
 * Get NBA standings and cache them for the run
 */
async function getStandings() {
  if (standingsCache) return standingsCache;

  try {
    const currentYear = new Date().getFullYear();
    const season = new Date().getMonth() + 1 <= 6 ? currentYear - 1 : currentYear;

    const standings = await ballDontLieService.getNbaStandings(season);

    if (standings && standings.length > 0) {
      // Organize by conference
      const east = standings
        .filter(t => t.conference === 'East')
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))
        .slice(0, 15); // Top 15 in East

      const west = standings
        .filter(t => t.conference === 'West')
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))
        .slice(0, 15); // Top 15 in West

      standingsCache = { east, west, all: standings };
      console.log(`[NBA Filter] Loaded standings: ${east.length} East, ${west.length} West`);
    }
  } catch (err) {
    console.warn(`[NBA Filter] Could not load standings: ${err.message}`);
    standingsCache = { east: [], west: [], all: [] };
  }

  return standingsCache;
}

/**
 * Check if a team is in the top N of their conference
 */
async function isTopInConference(teamName, topN = 5) {
  const standings = await getStandings();
  if (!standings) return false;

  const normalize = (name) => name?.toLowerCase().replace(/[^a-z]/g, '');
  const normalizedTeam = normalize(teamName);

  // Check East
  const eastRank = standings.east.findIndex(t =>
    normalize(t.team?.full_name)?.includes(normalizedTeam) ||
    normalizedTeam?.includes(normalize(t.team?.full_name)) ||
    normalize(t.team?.name)?.includes(normalizedTeam)
  );
  if (eastRank >= 0 && eastRank < topN) return true;

  // Check West
  const westRank = standings.west.findIndex(t =>
    normalize(t.team?.full_name)?.includes(normalizedTeam) ||
    normalizedTeam?.includes(normalize(t.team?.full_name)) ||
    normalize(t.team?.name)?.includes(normalizedTeam)
  );
  if (westRank >= 0 && westRank < topN) return true;

  return false;
}

/**
 * Check if a team is in the BOTTOM 3 of their conference (bad team)
 */
async function isBottomOfConference(teamName, bottomN = 3) {
  const standings = await getStandings();
  if (!standings) return false;

  const normalize = (name) => name?.toLowerCase().replace(/[^a-z]/g, '');
  const normalizedTeam = normalize(teamName);

  // Check East - bottom 3 means rank 13, 14, 15 (indices 12, 13, 14)
  const eastTeams = standings.east || [];
  const eastRank = eastTeams.findIndex(t =>
    normalize(t.team?.full_name)?.includes(normalizedTeam) ||
    normalizedTeam?.includes(normalize(t.team?.full_name)) ||
    normalize(t.team?.name)?.includes(normalizedTeam)
  );
  if (eastRank >= 0 && eastRank >= eastTeams.length - bottomN) return true;

  // Check West
  const westTeams = standings.west || [];
  const westRank = westTeams.findIndex(t =>
    normalize(t.team?.full_name)?.includes(normalizedTeam) ||
    normalizedTeam?.includes(normalize(t.team?.full_name)) ||
    normalize(t.team?.name)?.includes(normalizedTeam)
  );
  if (westRank >= 0 && westRank >= westTeams.length - bottomN) return true;

  return false;
}

/**
 * Check if both teams are bottom 3 in their conference (bottom-feeder matchup)
 */
async function isBottomFeederMatchup(homeTeam, awayTeam) {
  const homeBottom3 = await isBottomOfConference(homeTeam, 3);
  const awayBottom3 = await isBottomOfConference(awayTeam, 3);
  return homeBottom3 && awayBottom3;
}

/**
 * Check if a team is bottom N in the LEAGUE OVERALL (not by conference)
 * NBA has 30 teams, so bottom 9 = ranks 22-30
 */
async function isBottomOfLeague(teamName, bottomN = 9) {
  const standings = await getStandings();
  if (!standings || !standings.all) return false;

  const normalize = (name) => name?.toLowerCase().replace(/[^a-z]/g, '');
  const normalizedTeam = normalize(teamName);

  // Sort all teams by wins (descending)
  const allTeams = [...(standings.all || [])].sort((a, b) => (b.wins || 0) - (a.wins || 0));

  // Find team's league-wide rank
  const leagueRank = allTeams.findIndex(t =>
    normalize(t.team?.full_name)?.includes(normalizedTeam) ||
    normalizedTeam?.includes(normalize(t.team?.full_name)) ||
    normalize(t.team?.name)?.includes(normalizedTeam)
  );

  // Bottom N means rank >= (total - bottomN)
  // e.g., bottom 9 of 30 = ranks 22-30 (indices 21-29)
  if (leagueRank >= 0 && leagueRank >= allTeams.length - bottomN) {
    return true;
  }

  return false;
}

/**
 * Check if EITHER team in a matchup is bottom 9 in the league
 */
async function hasBottom9Team(homeTeam, awayTeam) {
  const homeBottom9 = await isBottomOfLeague(homeTeam, 9);
  const awayBottom9 = await isBottomOfLeague(awayTeam, 9);
  return { hasBottom9: homeBottom9 || awayBottom9, homeBottom9, awayBottom9 };
}

/**
 * Check if both teams are in the top 5 of their conference (marquee matchup)
 */
async function isMarqueeMatchup(homeTeam, awayTeam) {
  const homeTop5 = await isTopInConference(homeTeam, 5);
  const awayTop5 = await isTopInConference(awayTeam, 5);
  return homeTop5 && awayTop5;
}

/**
 * Get a team's standing rank (1-15 in their conference, lower is better)
 * Returns 99 if not found
 */
async function getTeamStandingRank(teamName) {
  const standings = await getStandings();
  if (!standings) return 99;

  const normalize = (name) => name?.toLowerCase().replace(/[^a-z]/g, '');
  const normalizedTeam = normalize(teamName);

  // Check East
  const eastRank = standings.east.findIndex(t =>
    normalize(t.team?.full_name)?.includes(normalizedTeam) ||
    normalizedTeam?.includes(normalize(t.team?.full_name)) ||
    normalize(t.team?.name)?.includes(normalizedTeam)
  );
  if (eastRank >= 0) return eastRank + 1; // 1-indexed

  // Check West
  const westRank = standings.west.findIndex(t =>
    normalize(t.team?.full_name)?.includes(normalizedTeam) ||
    normalizedTeam?.includes(normalize(t.team?.full_name)) ||
    normalize(t.team?.name)?.includes(normalizedTeam)
  );
  if (westRank >= 0) return westRank + 1; // 1-indexed

  return 99; // Not found
}

/**
 * Fetch national TV games for today via Gemini grounding
 */
async function fetchNationalTVGames() {
  if (nationalTVGamesCache) return nationalTVGamesCache;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[NBA Filter] No Gemini API key for TV schedule lookup');
      return [];
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ googleSearch: {} }]
    });

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York'
    });

    const prompt = `What NBA games are on national TV tonight (${today})? List the teams playing on ESPN, ABC, TNT, or Amazon Prime Video. Just list the matchups (e.g., "Lakers vs Celtics").`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Parse team names from response
    const teamPatterns = [
      /(\w+(?:\s+\w+)?)\s+(?:vs\.?|@|at)\s+(\w+(?:\s+\w+)?)/gi,
      /(\w+)\s+(?:vs\.?|@|at)\s+(\w+)/gi
    ];

    const games = [];
    for (const pattern of teamPatterns) {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        games.push({
          team1: match[1].toLowerCase().trim(),
          team2: match[2].toLowerCase().trim()
        });
      }
    }

    nationalTVGamesCache = games;
    console.log(`[NBA Filter] Found ${games.length} national TV games: ${games.map(g => `${g.team1} vs ${g.team2}`).join(', ') || 'none'}`);

    return games;
  } catch (err) {
    console.warn(`[NBA Filter] Could not fetch TV schedule: ${err.message}`);
    nationalTVGamesCache = [];
    return [];
  }
}

/**
 * Check if a game is on national TV
 */
async function isNationalTVGame(homeTeam, awayTeam) {
  const tvGames = await fetchNationalTVGames();
  if (!tvGames || tvGames.length === 0) return false;

  const normalize = (name) => name?.toLowerCase().replace(/[^a-z]/g, '');
  const normalizedHome = normalize(homeTeam);
  const normalizedAway = normalize(awayTeam);

  return tvGames.some(game => {
    const t1 = normalize(game.team1);
    const t2 = normalize(game.team2);
    return (
      (normalizedHome.includes(t1) || t1.includes(normalizedHome) ||
       normalizedHome.includes(t2) || t2.includes(normalizedHome)) &&
      (normalizedAway.includes(t1) || t1.includes(normalizedAway) ||
       normalizedAway.includes(t2) || t2.includes(normalizedAway))
    );
  });
}

/**
 * Parse spread value and determine pick characteristics
 */
function parsePickDetails(pick) {
  const details = {
    isML: false,
    isSpread: false,
    spreadValue: 0,
    isHomeTeam: false,
    isFavorite: false,
    isUnderdog: false
  };

  if (!pick.pick || pick.pick === 'PASS') return details;

  // Check if ML
  if (pick.type === 'moneyline') {
    details.isML = true;
    // Determine if favorite or underdog by odds
    const odds = parseInt(pick.odds) || 0;
    details.isFavorite = odds < 0 || (typeof pick.odds === 'string' && pick.odds.startsWith('-'));
    details.isUnderdog = !details.isFavorite;
  } else if (pick.type === 'spread') {
    details.isSpread = true;
    // Extract spread value from pick string (e.g., "Lakers -7.5 -110")
    const spreadMatch = pick.pick.match(/([+-]?\d+\.?\d*)\s*[+-]\d+$/);
    if (spreadMatch) {
      details.spreadValue = parseFloat(spreadMatch[1]);
      details.isFavorite = details.spreadValue < 0;
      details.isUnderdog = details.spreadValue > 0;
    }
  }

  // Determine if home team
  const pickTeamName = pick.pick.split(/\s+[+-]/)[0].trim();
  const homeTeamName = pick.homeTeam || '';
  details.isHomeTeam = pickTeamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop()) ||
                       homeTeamName.toLowerCase().includes(pickTeamName.toLowerCase().split(' ').pop());

  return details;
}

/**
 * Main filter function - applies simplified NBA filtering rules (Jan 2026)
 *
 * RULES:
 * 1. National TV games - ALWAYS KEEP (must have picks for primetime)
 * 2. All underdog spreads - ALWAYS KEEP
 * 3. All ML picks - KEEP unless both teams are bottom 3 in conference
 * 4. Road favorites - KEEP (contrarian value)
 * 5. Small favorites (-4.5 or less) - KEEP (close games)
 * 6. Home favorites -5 or more - REMOVE (chalk plays - unless National TV)
 *
 * @param {Array} picks - Array of Gary's picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNBAPicks(picks) {
  console.log(`\n[NBA Filter] Analyzing ${picks.length} picks (Simplified Rules v2)...`);

  // Pre-fetch standings and TV schedule
  await getStandings();
  await fetchNationalTVGames();

  const kept = [];
  const removed = [];
  const reasons = {
    nationalTV: 0,
    underdogSpread: 0,
    mlKept: 0,
    roadFavorite: 0,
    smallFavoriteTop6: 0,
    removedSmallFavoriteNotTop6: 0,
    removedHomeFavorite: 0,
    removedMLBottom9: 0,
    restoredForMinimum: 0
  };

  for (const pick of picks) {
    // Skip PASS picks
    if (pick.pick === 'PASS' || pick.type === 'pass') {
      continue;
    }

    const details = parsePickDetails(pick);
    const homeTeam = pick.homeTeam;
    const awayTeam = pick.awayTeam;

    // Check context
    const isNationalTV = await isNationalTVGame(homeTeam, awayTeam);
    const bottom9Check = await hasBottom9Team(homeTeam, awayTeam);

    let keepPick = false;
    let reason = '';

    // RULE 1: National TV games - ALWAYS KEEP (must have primetime picks)
    if (isNationalTV) {
      keepPick = true;
      reason = 'National TV game (required)';
      reasons.nationalTV++;
      pick.filterTags = ['NATIONAL TV'];
    }
    // RULE 2: All underdog spreads - ALWAYS KEEP
    else if (details.isSpread && details.isUnderdog) {
      keepPick = true;
      reason = `Underdog spread (+${Math.abs(details.spreadValue)})`;
      reasons.underdogSpread++;
    }
    // RULE 3: ML picks - KEEP unless EITHER team is bottom 9 in league
    else if (details.isML) {
      if (bottom9Check.hasBottom9) {
        const badTeam = bottom9Check.homeBottom9 ? homeTeam : awayTeam;
        keepPick = false;
        reason = `ML bet - ${badTeam} is bottom 9 in league (avoid bad teams)`;
        reasons.removedMLBottom9++;
      } else {
        keepPick = true;
        reason = 'ML bet';
        reasons.mlKept++;
      }
    }
    // RULE 4: Road favorites - KEEP (contrarian value)
    else if (details.isFavorite && !details.isHomeTeam) {
      keepPick = true;
      reason = `Road favorite (${details.spreadValue}) - contrarian value`;
      reasons.roadFavorite++;
    }
    // RULE 5: Small home favorites (-4.5 or less) - ONLY KEEP if team is top 6 in conference
    else if (details.isFavorite && details.isHomeTeam && Math.abs(details.spreadValue) <= 4.5) {
      // Extract picked team name
      const pickTeamName = pick.pick.split(/\s+[+-]/)[0].trim();
      const isTop6 = await isTopInConference(pickTeamName, 6);
      if (isTop6) {
        keepPick = true;
        reason = `Small home favorite (${details.spreadValue}) - top 6 in conference`;
        reasons.smallFavoriteTop6++;
      } else {
        keepPick = false;
        reason = `Small home favorite (${details.spreadValue}) - NOT top 6 in conference`;
        reasons.removedSmallFavoriteNotTop6++;
      }
    }
    // RULE 6: Home favorites -5 or more - REMOVE (chalk plays everyone takes)
    else if (details.isFavorite && details.isHomeTeam && Math.abs(details.spreadValue) >= 5) {
      keepPick = false;
      reason = `Home favorite (${details.spreadValue}) - chalk play`;
      reasons.removedHomeFavorite++;
    }
    // DEFAULT: Keep anything else (shouldn't hit this often)
    else {
      keepPick = true;
      reason = 'Default keep';
    }

    if (keepPick) {
      pick.filterReason = reason;
      kept.push(pick);
      console.log(`  [KEEP] ${pick.pick} - ${reason}`);
    } else {
      removed.push({ pick, reason });
      console.log(`  [REMOVE] ${pick.pick} - ${reason}`);
    }
  }

  // SAFETY: Minimum 3 picks per day - bring back lowest confidence picks if needed
  const MIN_PICKS = 3;
  if (kept.length < MIN_PICKS && removed.length > 0) {
    console.log(`\n[NBA Filter] Only ${kept.length} picks remaining - need minimum ${MIN_PICKS}...`);

    // Sort removed picks by confidence (lowest first - bring those back)
    const removedWithConfidence = removed.map(r => ({
      ...r,
      confidence: r.pick.confidence || r.pick.confidence_score || 0.5
    }));
    removedWithConfidence.sort((a, b) => a.confidence - b.confidence);

    // Bring back picks until we hit minimum
    while (kept.length < MIN_PICKS && removedWithConfidence.length > 0) {
      const restored = removedWithConfidence.shift();
      kept.push(restored.pick);
      restored.pick.filterReason = `RESTORED (min ${MIN_PICKS} picks) - was: ${restored.reason}`;
      restored.pick.filterTags = [...(restored.pick.filterTags || []), 'RESTORED'];
      reasons.restoredForMinimum++;
      console.log(`  [RESTORE] ${restored.pick.pick} (conf: ${restored.confidence}) - minimum picks safety`);

      // Remove from removed array
      const idx = removed.findIndex(r => r.pick === restored.pick);
      if (idx > -1) removed.splice(idx, 1);
    }
  }

  // Summary
  console.log(`\n[NBA Filter] Summary:`);
  console.log(`  KEPT: ${kept.length} picks`);
  if (reasons.nationalTV > 0) console.log(`    - National TV (required): ${reasons.nationalTV}`);
  if (reasons.underdogSpread > 0) console.log(`    - Underdog spreads: ${reasons.underdogSpread}`);
  if (reasons.mlKept > 0) console.log(`    - ML bets: ${reasons.mlKept}`);
  if (reasons.roadFavorite > 0) console.log(`    - Road favorites: ${reasons.roadFavorite}`);
  if (reasons.smallFavoriteTop6 > 0) console.log(`    - Small home favorites (top 6): ${reasons.smallFavoriteTop6}`);
  if (reasons.restoredForMinimum > 0) console.log(`    - Restored (min 3 picks): ${reasons.restoredForMinimum}`);

  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.removedHomeFavorite > 0) console.log(`    - Home favorites -5+ (chalk): ${reasons.removedHomeFavorite}`);
  if (reasons.removedSmallFavoriteNotTop6 > 0) console.log(`    - Small home favorites (not top 6): ${reasons.removedSmallFavoriteNotTop6}`);
  if (reasons.removedMLBottom9 > 0) console.log(`    - ML w/ bottom 9 team: ${reasons.removedMLBottom9}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

/**
 * Clear caches (call at start of new run)
 */
export function clearFilterCache() {
  standingsCache = null;
  nationalTVGamesCache = null;
}

export default {
  filterNBAPicks,
  clearFilterCache,
  isMarqueeMatchup,
  isNationalTVGame,
  isBottomFeederMatchup,
  isBottomOfConference
};
