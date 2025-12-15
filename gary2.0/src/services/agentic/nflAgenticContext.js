import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, calcRestInfo, calcRecentForm, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'americanfootball_nfl';

/**
 * Parse weather data to determine if adverse conditions for QB analysis
 * More lenient thresholds to catch cold weather games
 */
function parseNflWeather(weatherData) {
  const result = {
    isAdverse: false,
    type: 'normal',
    temp: null,
    wind: null,
    precipitation: null,
    conditions: null
  };
  
  if (!weatherData) return result;
  
  const weatherStr = typeof weatherData === 'string' ? weatherData : JSON.stringify(weatherData);
  const weatherLower = weatherStr.toLowerCase();
  
  // Extract temperature - more flexible patterns
  const tempMatch = weatherStr.match(/(-?\d+)\s*°?\s*[fF]/) ||
                    weatherStr.match(/temp(?:erature)?\s*(?:of|around|near|:)?\s*(-?\d+)/i) ||
                    weatherStr.match(/(-?\d+)\s*degrees/i);
  if (tempMatch) result.temp = parseInt(tempMatch[1], 10);
  
  // Extract wind - more flexible patterns
  const windMatch = weatherStr.match(/wind[s]?\s*(?:gusts?)?\s*(?:of|up to|around|:)?\s*(\d+)\s*mph/i) ||
                    weatherStr.match(/(\d+)\s*mph\s*wind/i) ||
                    weatherStr.match(/gusts?\s*(?:of|up to|around)?\s*(\d+)\s*mph/i);
  if (windMatch) result.wind = parseInt(windMatch[1], 10);
  
  // Check precipitation - expanded keywords
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
  
  // Handle object format
  if (typeof weatherData === 'object') {
    if (weatherData.temp || weatherData.temperature) {
      const numMatch = String(weatherData.temp || weatherData.temperature).match(/(-?\d+)/);
      if (numMatch) result.temp = parseInt(numMatch[1], 10);
    }
    if (weatherData.wind) {
      const windVal = String(weatherData.wind).match(/(\d+)/);
      if (windVal) result.wind = parseInt(windVal[1], 10);
    }
    if (weatherData.precipitation) result.precipitation = weatherData.precipitation;
    if (weatherData.conditions) result.conditions = weatherData.conditions;
  }
  
  // Check for cold-related keywords if temp wasn't extracted
  const coldKeywords = ['cold', 'freezing', 'frigid', 'bitter', 'arctic', 'icy', 'chilly', 'frost'];
  const hasColdKeyword = coldKeywords.some(kw => weatherLower.includes(kw));
  
  // Determine adverse conditions - more lenient thresholds
  // Cold: below 45°F, Very Cold: below 32°F
  if (result.temp !== null && result.temp < 45) {
    result.isAdverse = true;
    result.type = result.temp < 32 ? 'very_cold' : 'cold';
  } else if (hasColdKeyword && result.temp === null) {
    result.isAdverse = true;
    result.type = 'cold';
    result.temp = 35; // Assume ~35°F
  }
  
  if (result.precipitation === 'snow' || result.conditions?.toLowerCase().includes('snow')) {
    result.isAdverse = true;
    result.type = 'snow';
  }
  
  // Lower wind threshold to 12mph
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
  
  console.log(`[Agentic][NFL Weather Parse] temp=${result.temp}°F, wind=${result.wind}mph, isAdverse=${result.isAdverse}, type=${result.type}`);
  
  return result;
}

const buildNflTokenSlices = (homeRates, awayRates, injuries, marketSnapshot, restInfo, recentForm) => {
  const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  return {
    epa_per_play: {
      home: { yardsPerPlay: toNumber(homeRates?.yardsPerPlay), oppYardsPerPlay: toNumber(homeRates?.oppYardsPerPlay) },
      away: { yardsPerPlay: toNumber(awayRates?.yardsPerPlay), oppYardsPerPlay: toNumber(awayRates?.oppYardsPerPlay) }
    },
    success_rate: {
      home: { thirdDownPct: toNumber(homeRates?.thirdDownPct), fourthDownPct: toNumber(homeRates?.fourthDownPct) },
      away: { thirdDownPct: toNumber(awayRates?.thirdDownPct), fourthDownPct: toNumber(awayRates?.fourthDownPct) }
    },
    ol_dl_matchup: {
      home: {
        sacksAllowedPerDropback: toNumber(homeRates?.sacksAllowedPerDropback),
        defensiveSackRate: toNumber(homeRates?.defSackRateProxy)
      },
      away: {
        sacksAllowedPerDropback: toNumber(awayRates?.sacksAllowedPerDropback),
        defensiveSackRate: toNumber(awayRates?.defSackRateProxy)
      }
    },
    turnover_luck: {
      home: { turnoverDiff: toNumber(homeRates?.turnoverDiff) },
      away: { turnoverDiff: toNumber(awayRates?.turnoverDiff) }
    },
    red_zone_efficiency: {
      home: { offense: toNumber(homeRates?.redZoneProxy), defense: toNumber(homeRates?.redZoneDefProxy) },
      away: { offense: toNumber(awayRates?.redZoneProxy), defense: toNumber(awayRates?.redZoneDefProxy) }
    },
    explosiveness: {
      home: { yardsPerPlay: toNumber(homeRates?.yardsPerPlay), pointsPerGame: toNumber(homeRates?.pointsPerGame) },
      away: { yardsPerPlay: toNumber(awayRates?.yardsPerPlay), pointsPerGame: toNumber(awayRates?.pointsPerGame) }
    },
    injury_report: {
      notable: injuries.slice(0, 8),
      total_listed: injuries.length
    },
    market_snapshot: marketSnapshot,
    rest_fatigue: restInfo,
    recent_form: recentForm
  };
};

const formatInjuries = (injuries = []) =>
  (injuries || []).map((injury) => ({
    player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
    status: injury?.status || 'Unknown',
    description: injury?.description || '',
    team: injury?.team?.full_name || ''
  }));

const buildRecordMap = (standings, homeTeam, awayTeam) => {
  if (!Array.isArray(standings)) return { home: 'N/A', away: 'N/A' };
  const findRecord = (teamId) => {
    const row = standings.find((entry) => entry?.team?.id === teamId);
    if (!row) return 'N/A';
    if (row.record) return row.record;
    const wins = row?.wins ?? row?.overall_wins;
    const losses = row?.losses ?? row?.overall_losses;
    const ties = row?.ties ?? row?.overall_ties ?? 0;
    if (wins == null || losses == null) return 'N/A';
    return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  };
  return {
    home: findRecord(homeTeam.id),
    away: findRecord(awayTeam.id)
  };
};

export async function buildNflAgenticContext(game, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const season = commenceDate.getFullYear();

  const [homeTeam, awayTeam] = await Promise.all([
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team)
  ]);
  if (!homeTeam || !awayTeam) {
    throw new Error('Unable to resolve NFL teams for agentic context');
  }

  const lookbackStart = new Date(commenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - 28);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = commenceDate.toISOString().slice(0, 10);

  const [homeRecent, awayRecent, injuries, standings, homeSeason, awaySeason] = await Promise.all([
    ballDontLieService.getGames(
      SPORT_KEY,
      { seasons: [season], team_ids: [homeTeam.id], start_date: startStr, end_date: endStr, per_page: 50 },
      options.nocache ? 0 : 5
    ),
    ballDontLieService.getGames(
      SPORT_KEY,
      { seasons: [season], team_ids: [awayTeam.id], start_date: startStr, end_date: endStr, per_page: 50 },
      options.nocache ? 0 : 5
    ),
    ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: [homeTeam.id, awayTeam.id] }, options.nocache ? 0 : 5),
    ballDontLieService.getStandingsGeneric(SPORT_KEY, { season }),
    ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season, postseason: false }),
    ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season, postseason: false })
  ]);

  const restInfo = {
    home: calcRestInfo(homeRecent, homeTeam.id, commenceDate),
    away: calcRestInfo(awayRecent, awayTeam.id, commenceDate)
  };
  const recentForm = {
    home: calcRecentForm(homeRecent, homeTeam.id, 5),
    away: calcRecentForm(awayRecent, awayTeam.id, 5)
  };

  const homeRates = ballDontLieService.deriveNflTeamRates(homeSeason);
  const awayRates = ballDontLieService.deriveNflTeamRates(awaySeason);

  const injuriesList = formatInjuries(injuries || []);
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], homeTeam.full_name, awayTeam.full_name);

  let richContext = null;
  let weatherConditions = null;
  let qbWeatherAnalysis = null;
  
  try {
    const dateStr = commenceDate.toISOString().slice(0, 10);
    richContext = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'nfl', dateStr);
    
    // Extract weather from rich context
    if (richContext?.weather) {
      weatherConditions = richContext.weather;
      console.log(`[Agentic][NFL] Weather from rich context for ${game.away_team} @ ${game.home_team}:`, weatherConditions);
    }
    
    // FALLBACK: If no weather from rich context OR if parsing fails, use dedicated weather fetch
    let weatherData = weatherConditions ? parseNflWeather(weatherConditions) : null;
    if (!weatherData || weatherData.temp === null) {
      console.log(`[Agentic][NFL] Rich context weather insufficient, fetching dedicated NFL weather...`);
      const dedicatedWeather = await perplexityService.getNFLGameWeather(
        game.home_team,
        game.away_team,
        null,
        'tonight'
      );
      if (dedicatedWeather && dedicatedWeather.temperature !== null) {
        const tempStr = `${dedicatedWeather.temperature}°F`;
        const windStr = dedicatedWeather.wind_speed ? `, wind ${dedicatedWeather.wind_speed} mph` : '';
        const condStr = dedicatedWeather.conditions ? `, ${dedicatedWeather.conditions}` : '';
        const domeStr = dedicatedWeather.is_dome ? ' (Dome stadium)' : '';
        weatherConditions = `${tempStr}${windStr}${condStr}${domeStr}`;
        console.log(`[Agentic][NFL] Dedicated weather result: ${weatherConditions}`);
        weatherData = parseNflWeather(weatherConditions);
        
        // Skip weather analysis if dome
        if (dedicatedWeather.is_dome) {
          console.log(`[Agentic][NFL] Dome stadium - weather won't affect gameplay`);
          weatherData.isAdverse = false;
        }
      }
    }
    
    // Fetch QB weather performance if adverse conditions detected
    if (weatherData?.isAdverse) {
      console.log(`[Agentic][NFL] Adverse weather (${weatherData.type}), fetching QB weather performance...`);
      // Note: Would need QB names from roster - using team names as fallback for agentic context
      qbWeatherAnalysis = await perplexityService.getQBWeatherPerformance(
        `${game.home_team} QB`,
        `${game.away_team} QB`,
        game.home_team,
        game.away_team,
        weatherData
      );
    }
  } catch (error) {
    console.warn('[Agentic][NFL] Perplexity context failed:', error.message);
  }

  const records = buildRecordMap(standings, homeTeam, awayTeam);
  const tokenData = buildNflTokenSlices(homeRates, awayRates, injuriesList, marketSnapshot, restInfo, recentForm);
  
  // Add weather data to token slices if available
  if (weatherConditions || qbWeatherAnalysis) {
    tokenData.weather_factor = {
      conditions: weatherConditions,
      qbAnalysis: qbWeatherAnalysis ? {
        homeQB: qbWeatherAnalysis.home_qb_weather,
        awayQB: qbWeatherAnalysis.away_qb_weather,
        impact: qbWeatherAnalysis.weather_impact_summary,
        edge: qbWeatherAnalysis.edge_assessment,
        confidenceAdjustment: qbWeatherAnalysis.confidence_adjustment
      } : null
    };
  }

  const gameSummary = {
    gameId: `nfl-${game.id}`,
    sport: SPORT_KEY,
    league: 'NFL',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam.full_name,
    awayTeam: awayTeam.full_name,
    tipoff: formatGameTimeEST(game.commence_time),
    location: homeTeam.city || homeTeam.full_name,
    odds: {
      spread: marketSnapshot.spread,
      moneyline: marketSnapshot.moneyline
    },
    records,
    narrative: {
      home: richContext?.home_storyline || null,
      away: richContext?.away_storyline || null,
      notes: richContext?.summary || null
    }
  };

  return {
    gameSummary,
    tokenData,
    oddsSummary: marketSnapshot,
    meta: {
      homeTeam,
      awayTeam,
      season,
      window: { start: startStr, end: endStr },
      richKeyFindings: richContext?.key_findings || []
    }
  };
}

