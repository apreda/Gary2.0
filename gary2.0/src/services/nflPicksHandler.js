import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { computeRecommendedSportsbook } from './recommendedSportsbookUtil.js';
import { makeGaryPick } from './garyEngine.js';
import { processGameOnce, gameAlreadyHasPick } from './picksService.js';
import { mergeBookmakerOdds } from './agentic/sharedUtils.js';
import { nflSeason } from '../utils/dateUtils.js';

const SPORT_KEY = 'americanfootball_nfl';

/**
 * Parse weather conditions from Gemini Grounding response to determine if adverse
 * and what type of weather we're dealing with
 */
function parseWeatherForQBAnalysis(weatherData) {
  const result = {
    isAdverse: false,
    type: 'normal',
    temp: null,
    wind: null,
    precipitation: null,
    conditions: null
  };
  
  if (!weatherData) return result;
  
  // Handle string format: "32°F, Snow, Wind 15mph" or "Cold (28°F), wind gusts 20mph"
  const weatherStr = typeof weatherData === 'string' ? weatherData : JSON.stringify(weatherData);
  const weatherLower = weatherStr.toLowerCase();
  
  // Extract temperature - more flexible regex patterns
  const tempMatch = weatherStr.match(/(-?\d+)\s*°?\s*[fF]/) ||
                    weatherStr.match(/temp(?:erature)?\s*(?:of|around|near|:)?\s*(-?\d+)/i) ||
                    weatherStr.match(/(-?\d+)\s*degrees/i);
  if (tempMatch) {
    result.temp = parseInt(tempMatch[1], 10);
  }
  
  // Extract wind speed - more flexible patterns
  const windMatch = weatherStr.match(/wind[s]?\s*(?:gusts?)?\s*(?:of|up to|around|:)?\s*(\d+)\s*mph/i) ||
                    weatherStr.match(/(\d+)\s*mph\s*wind/i) ||
                    weatherStr.match(/gusts?\s*(?:of|up to|around)?\s*(\d+)\s*mph/i);
  if (windMatch) {
    result.wind = parseInt(windMatch[1], 10);
  }
  
  // Check for precipitation/conditions
  if (weatherLower.includes('snow') || weatherLower.includes('flurries') || weatherLower.includes('blizzard')) {
    result.precipitation = 'snow';
    result.conditions = 'snow';
  } else if (weatherLower.includes('rain') || weatherLower.includes('drizzle') || weatherLower.includes('showers')) {
    result.precipitation = 'rain';
    result.conditions = 'rain';
  } else if (weatherLower.includes('sleet') || weatherLower.includes('ice') || weatherLower.includes('freezing')) {
    result.precipitation = 'ice';
    result.conditions = 'ice';
  }
  
  // Handle object format with specific fields
  if (typeof weatherData === 'object') {
    if (weatherData.temp || weatherData.temperature) {
      const tempVal = weatherData.temp || weatherData.temperature;
      const numMatch = String(tempVal).match(/(-?\d+)/);
      if (numMatch) result.temp = parseInt(numMatch[1], 10);
    }
    if (weatherData.wind) {
      const windVal = String(weatherData.wind).match(/(\d+)/);
      if (windVal) result.wind = parseInt(windVal[1], 10);
    }
    if (weatherData.precipitation) {
      result.precipitation = weatherData.precipitation;
    }
    if (weatherData.conditions) {
      result.conditions = weatherData.conditions;
    }
  }
  
  // Determine if adverse and what type
  // Cold: below 45°F (more lenient threshold for QB performance impact)
  // Very Cold: below 32°F (freezing)
  // High wind: above 12mph (lowered from 15mph for QB impact)
  // Snow/Ice: any precipitation
  
  // Also check for cold-related keywords if temp wasn't extracted
  const coldKeywords = ['cold', 'freezing', 'frigid', 'bitter', 'arctic', 'icy', 'chilly', 'frost'];
  const hasColdKeyword = coldKeywords.some(kw => weatherLower.includes(kw));
  
  if (result.temp !== null && result.temp < 45) {
    result.isAdverse = true;
    result.type = result.temp < 32 ? 'very_cold' : 'cold';
  } else if (hasColdKeyword && result.temp === null) {
    // If keywords suggest cold but no temp found, assume it's cold
    result.isAdverse = true;
    result.type = 'cold';
    result.temp = 35; // Assume ~35°F when cold keywords present
  }
  
  if (result.precipitation === 'snow' || result.conditions?.toLowerCase().includes('snow')) {
    result.isAdverse = true;
    result.type = 'snow';
  }
  
  if (result.wind !== null && result.wind > 12) {
    result.isAdverse = true;
    if (result.type === 'cold' || result.type === 'very_cold') {
      result.type = result.temp < 32 ? 'very_cold_wind' : 'cold_wind';
    } else if (result.type === 'snow') {
      result.type = 'snow_wind';
    } else {
      result.type = 'wind';
    }
  }
  
  console.log(`[NFL Weather Parse] Input: "${weatherStr.substring(0, 100)}..." -> isAdverse=${result.isAdverse}, type=${result.type}, temp=${result.temp}°F, wind=${result.wind}mph`);
  
  return result;
}

export async function generateNFLPicks(options = {}) {
  console.log('Processing NFL games');
  if (options.nocache) {
    console.log('NFL nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache: options.nocache === true });
  console.log(`Found ${games.length} NFL games from odds service`);

  // Weekly window: include games in the next 6 days (Thu–Tue coverage)
  const now = new Date();
  const end = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
  console.log(`NFL 6-day window: ${now.toISOString()} to ${end.toISOString()}`);

  let todayGames = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${todayGames.length} NFL games in next 6 days`);

  // Track total games for cursor logic
  const totalGamesCount = todayGames.length;
  
  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    // If cursor is beyond available games, return early with metadata
    if (idx >= todayGames.length) {
      console.log(`[NFL] Cursor ${idx} exceeds available games (${todayGames.length}) - no more games`);
      return { picks: [], noMoreGames: true, totalGames: totalGamesCount };
    }
    todayGames = [todayGames[idx]];
  }

  const season = nflSeason();
  const picks = [];

  for (const game of todayGames) {
    const gameId = `nfl-${game.id}`;

    // EARLY CHECK: Skip if this game already has a pick (prevents both sides being picked)
    const { exists: alreadyPicked, existingPick } = await gameAlreadyHasPick('NFL', game.home_team, game.away_team);
    if (alreadyPicked) {
      console.log(`⏭️ SKIPPING ${game.away_team} @ ${game.home_team} - already have pick: "${existingPick}"`);
      continue;
    }

    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing NFL game: ${game.away_team} @ ${game.home_team}`);

      // Map teams to BDL IDs
      const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
      const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);

      if (!homeTeam || !awayTeam) {
        console.warn(`NFL: Could not resolve teams for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      // Fetch team stats and injuries (fail if no stats for both teams)
      const [homeTeamStats, awayTeamStats, injuries] = await Promise.all([
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [homeTeam.id], per_page: 100 }),
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [awayTeam.id], per_page: 100 }),
        ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: [homeTeam.id, awayTeam.id] })
      ]);

      // Strictly scope any returned rows to the actual matchup teams
      const filterByTeamId = (rows, teamId) => {
        if (!Array.isArray(rows)) return [];
        return rows.filter(r => {
          const id = r?.team?.id ?? r?.team_id ?? r?.team?.team_id;
          return id === teamId;
        });
      };
      const homeTeamStatsScoped = filterByTeamId(homeTeamStats, homeTeam.id);
      const awayTeamStatsScoped = filterByTeamId(awayTeamStats, awayTeam.id);

      // Fallback: if scoped team_stats are empty, fetch recent games and query by game_ids
      let finalHomeTeamStats = homeTeamStatsScoped;
      let finalAwayTeamStats = awayTeamStatsScoped;
      if (finalHomeTeamStats.length === 0 || finalAwayTeamStats.length === 0) {
        try {
          const recentWindowStart = new Date();
          recentWindowStart.setDate(recentWindowStart.getDate() - 35); // last ~5 weeks
          const startStr = recentWindowStart.toISOString().slice(0, 10);
          const endStr = new Date().toISOString().slice(0, 10);
          const [homeGames, awayGames] = await Promise.all([
            ballDontLieService.getGames(SPORT_KEY, { seasons: [season], team_ids: [homeTeam.id], start_date: startStr, end_date: endStr, postseason: false, per_page: 100 }, options.nocache ? 0 : 10),
            ballDontLieService.getGames(SPORT_KEY, { seasons: [season], team_ids: [awayTeam.id], start_date: startStr, end_date: endStr, postseason: false, per_page: 100 }, options.nocache ? 0 : 10)
          ]);
          const homeGameIds = (homeGames || []).map(g => g?.id).filter(Boolean).slice(-8);
          const awayGameIds = (awayGames || []).map(g => g?.id).filter(Boolean).slice(-8);
          const [homeByGames, awayByGames] = await Promise.all([
            homeGameIds.length ? ballDontLieService.getTeamStats(SPORT_KEY, { game_ids: homeGameIds, per_page: 100 }) : Promise.resolve([]),
            awayGameIds.length ? ballDontLieService.getTeamStats(SPORT_KEY, { game_ids: awayGameIds, per_page: 100 }) : Promise.resolve([])
          ]);
          const scopedHomeByGames = filterByTeamId(homeByGames, homeTeam.id);
          const scopedAwayByGames = filterByTeamId(awayByGames, awayTeam.id);
          if (finalHomeTeamStats.length === 0 && scopedHomeByGames.length > 0) finalHomeTeamStats = scopedHomeByGames;
          if (finalAwayTeamStats.length === 0 && scopedAwayByGames.length > 0) finalAwayTeamStats = scopedAwayByGames;
          if (finalHomeTeamStats.length === 0 || finalAwayTeamStats.length === 0) {
            console.warn(`NFL fallback by game_ids still empty for ${game.away_team} @ ${game.home_team}`);
            // Final fallback: derive samples from player game stats over recent games
            try {
              if (finalHomeTeamStats.length === 0 && homeGameIds.length) {
                const derivedHome = await ballDontLieService.getPlayerStats(SPORT_KEY, { game_ids: homeGameIds, team_ids: [homeTeam.id], per_page: 100 });
                if (Array.isArray(derivedHome) && derivedHome.length) {
                  finalHomeTeamStats = derivedHome.slice(0, 3);
                }
              }
              if (finalAwayTeamStats.length === 0 && awayGameIds.length) {
                const derivedAway = await ballDontLieService.getPlayerStats(SPORT_KEY, { game_ids: awayGameIds, team_ids: [awayTeam.id], per_page: 100 });
                if (Array.isArray(derivedAway) && derivedAway.length) {
                  finalAwayTeamStats = derivedAway.slice(0, 3);
                }
              }
            } catch (dErr) {
              console.warn('NFL derived team stats fallback failed:', dErr?.message || dErr);
            }
          }
        } catch (e) {
          console.warn('NFL team_stats fallback failed:', e?.message || e);
        }
      }

      // Season aggregates for offense/defense summary
      const [homeSeason, awaySeason] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season, postseason: false })
      ]);
      let homeRates = ballDontLieService.deriveNflTeamRates(homeSeason);
      let awayRates = ballDontLieService.deriveNflTeamRates(awaySeason);

      // Fallbacks: derive missing yards/play and red-zone proxies from aggregated team game_stats
      const deriveFromGameStats = (rows = []) => {
        if (!Array.isArray(rows) || rows.length === 0) return {};
        const toNum = (v) => (typeof v === 'number' && isFinite(v)) ? v : undefined;
        let yppVals = [];
        let rzMade = 0, rzAtt = 0;
        let oppRzMade = 0, oppRzAtt = 0;
        let totalY = 0, totalPlays = 0;
        let passAttSum = 0, rushAttSum = 0, sacksAllowedSum = 0;
        for (const r of rows) {
          const ypp = toNum(r?.yards_per_play ?? r?.ypp);
          if (typeof ypp === 'number') yppVals.push(ypp);
          const ty = toNum(r?.total_yards);
          const plays = toNum(r?.total_plays ?? r?.plays);
          if (typeof ty === 'number' && typeof plays === 'number') {
            totalY += ty;
            totalPlays += plays;
          }
          passAttSum += Number(r?.passing_attempts ?? r?.pass_attempts ?? 0);
          rushAttSum += Number(r?.rushing_attempts ?? r?.rush_attempts ?? 0);
          sacksAllowedSum += Number(r?.sacks_allowed ?? r?.misc_sacks_allowed ?? 0);
          // Red zone (offense)
          if (typeof r?.red_zone_scores === 'number' && typeof r?.red_zone_attempts === 'number') {
            rzMade += r.red_zone_scores;
            rzAtt += r.red_zone_attempts;
          } else if (typeof r?.red_zone_efficiency === 'string') {
            const parts = r.red_zone_efficiency.split('-').map(n => Number(n));
            if (parts.length === 2 && parts.every(n => Number.isFinite(n))) {
              rzMade += parts[0];
              rzAtt += parts[1];
            }
          }
          // Red zone (defense / opponent)
          if (typeof r?.opp_red_zone_scores === 'number' && typeof r?.opp_red_zone_attempts === 'number') {
            oppRzMade += r.opp_red_zone_scores;
            oppRzAtt += r.opp_red_zone_attempts;
          } else if (typeof r?.opp_red_zone_efficiency === 'string' || typeof r?.opponent_red_zone_efficiency === 'string') {
            const s = r?.opp_red_zone_efficiency || r?.opponent_red_zone_efficiency || '';
            const parts = s.split('-').map(n => Number(n));
            if (parts.length === 2 && parts.every(n => Number.isFinite(n))) {
              oppRzMade += parts[0];
              oppRzAtt += parts[1];
            }
          }
        }
        let yardsPerPlay = undefined;
        if (yppVals.length) {
          yardsPerPlay = yppVals.reduce((a, b) => a + b, 0) / yppVals.length;
        } else {
          const approxPlays = totalPlays || (passAttSum + rushAttSum + sacksAllowedSum);
          yardsPerPlay = approxPlays > 0 ? totalY / approxPlays : undefined;
        }
        const redZoneProxy = rzAtt > 0 ? (rzMade / rzAtt) : undefined;
        const redZoneDefProxy = oppRzAtt > 0 ? (oppRzMade / oppRzAtt) : undefined;
        return { yardsPerPlay, redZoneProxy, redZoneDefProxy };
      };
      if (homeRates?.yardsPerPlay == null || homeRates?.redZoneProxy == null || homeRates?.redZoneDefProxy == null) {
        const fall = deriveFromGameStats(finalHomeTeamStats);
        homeRates = {
          ...homeRates,
          yardsPerPlay: homeRates?.yardsPerPlay ?? fall.yardsPerPlay,
          redZoneProxy: homeRates?.redZoneProxy ?? fall.redZoneProxy,
          redZoneDefProxy: homeRates?.redZoneDefProxy ?? fall.redZoneDefProxy
        };
      }
      if (awayRates?.yardsPerPlay == null || awayRates?.redZoneProxy == null || awayRates?.redZoneDefProxy == null) {
        const fall = deriveFromGameStats(finalAwayTeamStats);
        awayRates = {
          ...awayRates,
          yardsPerPlay: awayRates?.yardsPerPlay ?? fall.yardsPerPlay,
          redZoneProxy: awayRates?.redZoneProxy ?? fall.redZoneProxy,
          redZoneDefProxy: awayRates?.redZoneDefProxy ?? fall.redZoneDefProxy
        };
      }

      // Require season-level stats (per-game team_stats may be empty on some weeks)
      const hasHomeSeason = Array.isArray(homeSeason) && homeSeason.length > 0;
      const hasAwaySeason = Array.isArray(awaySeason) && awaySeason.length > 0;
      if (!hasHomeSeason || !hasAwaySeason) {
        console.warn(`NFL: Missing required season stats for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      // Helper: pick likely starting QB using attempts (advanced > season > fallback)
      const selectStartingQb = async (teamId) => {
        let qbs = await ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [teamId], position: 'QB', per_page: 10 });
        const isQB = (p) => {
          const pos = (p?.position || '').toLowerCase();
          const abbr = (p?.position_abbreviation || '').toLowerCase();
          return abbr === 'qb' || pos.includes('quarterback');
        };
        qbs = Array.isArray(qbs) ? qbs.filter(isQB) : [];
        if (qbs.length === 0) return null;
        const scored = await Promise.all(qbs.map(async (qb) => {
          let adv = [];
          let seasonAgg = [];
          try { adv = await ballDontLieService.getNflAdvancedPassingStats({ season, playerId: qb.id, week: 0 }); } catch (e) { console.warn(`NFL QB adv passing stats failed for ${qb.id}:`, e?.message); }
          try { seasonAgg = await ballDontLieService.getNflPlayerSeasonStats({ playerId: qb.id, season, postseason: false }); } catch (e) { console.warn(`NFL QB season stats failed for ${qb.id}:`, e?.message); }
          const advAttempts = Array.isArray(adv) && adv[0]?.attempts ? Number(adv[0].attempts) : 0;
          const seasonAttempts = Array.isArray(seasonAgg) && seasonAgg[0]?.passing_attempts ? Number(seasonAgg[0].passing_attempts) : 0;
          return { qb, score: advAttempts || seasonAttempts || 0 };
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored[0]?.qb || qbs[0];
      };

      // Helper: choose a WR with available advanced receiving; fallback to top season receptions/yards
      const selectLeadReceiver = async (teamId) => {
        const isWR = (p) => {
          const pos = (p?.position || '').toLowerCase();
          const abbr = (p?.position_abbreviation || '').toLowerCase();
          return abbr === 'wr' || pos.includes('wide receiver');
        };
        let wrs = await ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [teamId], position: 'WR', per_page: 10 });
        wrs = Array.isArray(wrs) ? wrs.filter(isWR) : [];
        if (wrs.length === 0) return { player: null, adv: [] };
        for (const wr of wrs) {
          try {
            const adv = await ballDontLieService.getNflAdvancedReceivingStats({ season, playerId: wr.id, week: 0 });
            if (Array.isArray(adv) && adv.length) return { player: wr, adv };
          } catch (e) { console.warn(`NFL WR adv receiving stats failed for ${wr.id}:`, e?.message); }
        }
        let best = null;
        for (const wr of wrs) {
          try {
            const ss = await ballDontLieService.getNflPlayerSeasonStats({ playerId: wr.id, season, postseason: false });
            const rec = Array.isArray(ss) && ss[0]?.receptions ? Number(ss[0].receptions) : 0;
            const yards = Array.isArray(ss) && ss[0]?.receiving_yards ? Number(ss[0].receiving_yards) : 0;
            const score = rec * 1000 + yards;
            if (!best || score > best.score) best = { wr, score };
          } catch (e) { console.warn(`NFL WR season stats failed for ${wr.id}:`, e?.message); }
        }
        if (best?.wr) {
          const adv = await ballDontLieService.getNflAdvancedReceivingStats({ season, playerId: best.wr.id, week: 0 }).catch(() => []);
          return { player: best.wr, adv: Array.isArray(adv) ? adv : [] };
        }
        return { player: wrs[0], adv: [] };
      };

      // Identify probable QBs and fetch season stats
      let homeQb = null;
      let awayQb = null;
      let homeQbSeason = [];
      let awayQbSeason = [];
      let homeQbAdvanced = [];
      let awayQbAdvanced = [];
      // Optional skill players with advanced rushing/receiving
      let homeLeadRb = null;
      let awayLeadRb = null;
      let homeLeadWr = null;
      let awayLeadWr = null;
      let homeRbAdvanced = [];
      let awayRbAdvanced = [];
      let homeWrAdvanced = [];
      let awayWrAdvanced = [];
      try {
        const [homeQbChosen, awayQbChosen] = await Promise.all([
          selectStartingQb(homeTeam.id),
          selectStartingQb(awayTeam.id)
        ]);
        homeQb = homeQbChosen;
        awayQb = awayQbChosen;
        const isRB = (p) => {
          const pos = (p?.position || '').toLowerCase();
          const abbr = (p?.position_abbreviation || '').toLowerCase();
          return abbr === 'rb' || pos.includes('running back');
        };
        const [homeQbSeasonRes, awayQbSeasonRes, homeQbAdvRes, awayQbAdvRes] = await Promise.all([
          homeQb ? ballDontLieService.getNflPlayerSeasonStats({ playerId: homeQb.id, season, postseason: false }) : Promise.resolve([]),
          awayQb ? ballDontLieService.getNflPlayerSeasonStats({ playerId: awayQb.id, season, postseason: false }) : Promise.resolve([]),
          homeQb ? ballDontLieService.getNflAdvancedPassingStats({ season, playerId: homeQb.id, postseason: false, week: 0 }) : Promise.resolve([]),
          awayQb ? ballDontLieService.getNflAdvancedPassingStats({ season, playerId: awayQb.id, postseason: false, week: 0 }) : Promise.resolve([])
        ]);
        homeQbSeason = homeQbSeasonRes;
        awayQbSeason = awayQbSeasonRes;
        homeQbAdvanced = homeQbAdvRes;
        awayQbAdvanced = awayQbAdvRes;

        // Try to identify a lead RB and WR per team, then pull advanced rushing/receiving (season-level)
        let [homeRbs, awayRbs] = await Promise.all([
          ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [homeTeam.id], position: 'RB', per_page: 5 }),
          ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [awayTeam.id], position: 'RB', per_page: 5 })
        ]);
        if (Array.isArray(homeRbs)) homeRbs = homeRbs.filter(isRB);
        if (Array.isArray(awayRbs)) awayRbs = awayRbs.filter(isRB);
        homeLeadRb = Array.isArray(homeRbs) && homeRbs[0] ? homeRbs[0] : null;
        awayLeadRb = Array.isArray(awayRbs) && awayRbs[0] ? awayRbs[0] : null;
        const [{ player: homeWrSel, adv: homeWrAdv }, { player: awayWrSel, adv: awayWrAdv }] = await Promise.all([
          selectLeadReceiver(homeTeam.id),
          selectLeadReceiver(awayTeam.id)
        ]);
        homeLeadWr = homeWrSel;
        awayLeadWr = awayWrSel;
        const [homeRbAdvRes, awayRbAdvRes, homeWrAdvRes, awayWrAdvRes] = await Promise.all([
          homeLeadRb ? ballDontLieService.getNflAdvancedRushingStats({ season, playerId: homeLeadRb.id, postseason: false, week: 0 }) : Promise.resolve([]),
          awayLeadRb ? ballDontLieService.getNflAdvancedRushingStats({ season, playerId: awayLeadRb.id, postseason: false, week: 0 }) : Promise.resolve([]),
          homeLeadWr ? (homeWrAdv?.length ? Promise.resolve(homeWrAdv) : ballDontLieService.getNflAdvancedReceivingStats({ season, playerId: homeLeadWr.id, postseason: false, week: 0 })) : Promise.resolve([]),
          awayLeadWr ? (awayWrAdv?.length ? Promise.resolve(awayWrAdv) : ballDontLieService.getNflAdvancedReceivingStats({ season, playerId: awayLeadWr.id, postseason: false, week: 0 })) : Promise.resolve([])
        ]);
        homeRbAdvanced = homeRbAdvRes;
        awayRbAdvanced = awayRbAdvRes;
        homeWrAdvanced = homeWrAdvRes;
        awayWrAdvanced = awayWrAdvRes;
      } catch (e) { console.warn('NFL advanced player stats batch failed:', e?.message); }

      const statsReport = {
        season,
        home: { team: homeTeam, sample: finalHomeTeamStats.slice(0, 3) },
        away: { team: awayTeam, sample: finalAwayTeamStats.slice(0, 3) },
        injuriesSample: injuries?.slice?.(0, 6) || [],
        seasonSummary: {
          home: homeRates,
          away: awayRates
        },
        qbSeason: {
          home: { qb: homeQb ? { id: homeQb.id, name: homeQb.full_name || `${homeQb.first_name || ''} ${homeQb.last_name || ''}`.trim() } : null, stats: homeQbSeason },
          away: { qb: awayQb ? { id: awayQb.id, name: awayQb.full_name || `${awayQb.first_name || ''} ${awayQb.last_name || ''}`.trim() } : null, stats: awayQbSeason }
        },
        advanced: {
          passing: {
            home: homeQbAdvanced,
            away: awayQbAdvanced
          },
          rushing: {
            home: { player: homeLeadRb ? { id: homeLeadRb.id, name: homeLeadRb.full_name || `${homeLeadRb.first_name || ''} ${homeLeadRb.last_name || ''}`.trim() } : null, stats: homeRbAdvanced },
            away: { player: awayLeadRb ? { id: awayLeadRb.id, name: awayLeadRb.full_name || `${awayLeadRb.first_name || ''} ${awayLeadRb.last_name || ''}`.trim() } : null, stats: awayRbAdvanced }
          },
          receiving: {
            home: { player: homeLeadWr ? { id: homeLeadWr.id, name: homeLeadWr.full_name || `${homeLeadWr.first_name || ''} ${homeLeadWr.last_name || ''}`.trim() } : null, stats: homeWrAdvanced },
            away: { player: awayLeadWr ? { id: awayLeadWr.id, name: awayLeadWr.full_name || `${awayLeadWr.first_name || ''} ${awayLeadWr.last_name || ''}`.trim() } : null, stats: awayWrAdvanced }
          }
        }
      };

      // Odds payload: merge markets across all bookmakers to avoid missing ML/spread
      const oddsData = mergeBookmakerOdds(game.bookmakers);

      // Note: no baseline model edge. Decisions are angle- and price-driven only.

      // Rich context, weather, and QB analysis now provided by Gemini Grounding in the agentic pipeline
      const richKeyFindings = [];
      const realTimeNewsText = '';
      const weatherConditions = null;
      const weatherData = null;
      const qbWeatherAnalysis = null;

      // QB venue and head-to-head samples (last two seasons)
      let qbVenueH2H = { home: {}, away: {} };
      try {
        const seasons = [season, season - 1];
        const teamGames = await ballDontLieService.getGames(SPORT_KEY, { seasons, team_ids: [homeTeam.id, awayTeam.id], postseason: false, per_page: 100 }, options.nocache ? 0 : 10);
        const isH2H = (g) => {
          const hId = g?.home_team?.id || g?.home_team?.team_id || g?.home_team_id;
          const aId = g?.away_team?.id || g?.away_team?.team_id || g?.away_team_id;
          return (hId === homeTeam.id && aId === awayTeam.id) || (hId === awayTeam.id && aId === homeTeam.id);
        };
        const homeVenue = teamGames.filter(g => {
          const hId = g?.home_team?.id || g?.home_team?.team_id || g?.home_team_id;
          return hId === homeTeam.id;
        }).slice(0, 5).map(g => g.id).filter(Boolean);
        const awayVenue = teamGames.filter(g => {
          const hId = g?.home_team?.id || g?.home_team?.team_id || g?.home_team_id;
          return hId === awayTeam.id;
        }).slice(0, 5).map(g => g.id).filter(Boolean);
        const h2hIds = teamGames.filter(isH2H).slice(0, 6).map(g => g.id).filter(Boolean);
        if (homeQb?.id) {
          const [homeVenueStats, h2hStats] = await Promise.all([
            homeVenue.length ? ballDontLieService.getNflPlayerGameStats({ playerId: homeQb.id, gameIds: homeVenue }) : Promise.resolve([]),
            h2hIds.length ? ballDontLieService.getNflPlayerGameStats({ playerId: homeQb.id, gameIds: h2hIds }) : Promise.resolve([])
          ]);
          qbVenueH2H.home = { qbId: homeQb.id, venueSample: homeVenueStats, h2hSample: h2hStats };
        }
        if (awayQb?.id) {
          const [awayVenueStats, h2hStatsA] = await Promise.all([
            awayVenue.length ? ballDontLieService.getNflPlayerGameStats({ playerId: awayQb.id, gameIds: awayVenue }) : Promise.resolve([]),
            h2hIds.length ? ballDontLieService.getNflPlayerGameStats({ playerId: awayQb.id, gameIds: h2hIds }) : Promise.resolve([])
          ]);
          qbVenueH2H.away = { qbId: awayQb.id, venueSample: awayVenueStats, h2hSample: h2hStatsA };
        }
      } catch (e) { console.warn('NFL QB venue/H2H stats failed:', e?.message); }

      // Provide combined teamStats and minimal gameContext
      const teamStats = {
        home: finalHomeTeamStats,
        away: finalAwayTeamStats
      };
      const gameContext = {
        injuries: Array.isArray(injuries) ? injuries : [],
        season,
        postseason: false,
        notes: 'Regular season context from BDL NFL',
        richKeyFindings,
        qbVenueH2H,
        // Weather data for Gary's decision making
        weatherConditions: weatherConditions || null,
        qbWeatherAnalysis: qbWeatherAnalysis || null
      };

      const gameObj = {
        id: gameId,
        sport: 'nfl',
        league: 'NFL',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        teamStats,
        gameContext,
        statsReport,
        // Pass real-time news summary so LLM "REAL-TIME NEWS AND TRENDS" section is populated
        realTimeNews: realTimeNewsText || undefined,
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      const pick = await makeGaryPick(gameObj);
      if (!pick?.success) return null;
      // Recommended sportsbook from bookmakers
      let recommendedSportsbook = null;
      try {
        const extract = pick.rawAnalysis?.rawOpenAIOutput || pick.pick || {};
        recommendedSportsbook = computeRecommendedSportsbook({
          pickType: (extract.type || '').toLowerCase(),
          pickStr: extract.pick || '',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          bookmakers: Array.isArray(game.bookmakers) ? game.bookmakers : []
        });
      } catch (e) {
        console.warn('Failed to compute recommended sportsbook (NFL):', e?.message || e);
      }

      return {
        ...pick,
        recommendedSportsbook: recommendedSportsbook || undefined,
        game: `${game.away_team} @ ${game.home_team}`,
        sport: SPORT_KEY,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        gameTime: game.commence_time,
        pickType: 'normal',
        timestamp: new Date().toISOString()
      };
    });

    if (result && result.success) picks.push(result);
  }

  if (picks.length > 0) {
    console.log(`Total NFL picks generated: ${picks.length}`);
  }
  // Return with metadata for cursor logic
  return { 
    picks, 
    noMoreGames: false, 
    totalGames: totalGamesCount,
    processedIndex: typeof options.onlyAtIndex === 'number' ? options.onlyAtIndex : null
  };
}


