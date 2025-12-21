import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, calcRestInfo, calcRecentForm, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'basketball_ncaab';

// Minimum games played threshold to consider a team has adequate data
const MIN_GAMES_THRESHOLD = 3;

/**
 * NCAAB Conference Tier System
 * 
 * College basketball is really ~32 mini-leagues (conferences).
 * Each tier plays differently and requires different analysis.
 * 
 * Tiers:
 * - ELITE: Power conferences with NBA talent, depth, elite coaching
 * - STRONG: Quality mid-majors that produce NCAA tournament teams
 * - MID: Solid conferences but more volatile, fewer stars
 * - SMALL: Low-major conferences with limited data and high variance
 */
const CONFERENCE_TIERS = {
  // ELITE - Power 6 conferences (highest level of competition)
  'Big Ten': 'ELITE',
  'SEC': 'ELITE',
  'Big 12': 'ELITE',
  'Big East': 'ELITE',
  'ACC': 'ELITE',
  'Pac-12': 'ELITE', // Remnants still play at high level
  
  // STRONG - High-quality mid-majors (consistent NCAA tournament presence)
  'Mountain West': 'STRONG',
  'WCC': 'STRONG',           // West Coast Conference (Gonzaga, St. Mary's)
  'AAC': 'STRONG',           // American Athletic Conference
  'Atlantic 10': 'STRONG',   // A-10
  'A-10': 'STRONG',          // Alternate name
  'MVC': 'STRONG',           // Missouri Valley Conference
  'Missouri Valley': 'STRONG',
  'C-USA': 'STRONG',         // Conference USA
  'Conference USA': 'STRONG',
  'MAC': 'STRONG',           // Mid-American Conference
  'Mid-American': 'STRONG',
  'Sun Belt': 'STRONG',
  
  // MID - Solid but volatile conferences
  'WAC': 'MID',              // Western Athletic Conference
  'Big West': 'MID',
  'Horizon': 'MID',          // Horizon League
  'Horizon League': 'MID',
  'CAA': 'MID',              // Colonial Athletic Association
  'Colonial': 'MID',
  'Southern': 'MID',         // Southern Conference
  'SoCon': 'MID',
  'Ivy League': 'MID',       // Ivy League (no scholarships but good academics)
  'Ivy': 'MID',
  'MAAC': 'MID',             // Metro Atlantic Athletic Conference
  'Metro Atlantic': 'MID',
  'Patriot': 'MID',          // Patriot League
  'Patriot League': 'MID',
  'Big Sky': 'MID',
  'Summit League': 'MID',
  'Summit': 'MID',
  'Ohio Valley': 'MID',      // OVC
  'OVC': 'MID',
  'Southland': 'MID',
  'ASUN': 'MID',             // Atlantic Sun
  'Atlantic Sun': 'MID',
  'Big South': 'MID',
  'America East': 'MID',
  'Northeast': 'MID',        // NEC
  'NEC': 'MID',
  
  // SMALL - Low-major conferences (high variance, limited data)
  'MEAC': 'SMALL',           // Mid-Eastern Athletic Conference
  'Mid-Eastern Athletic': 'SMALL',
  'SWAC': 'SMALL',           // Southwestern Athletic Conference
  'Southwestern Athletic': 'SMALL'
};

/**
 * Get conference tier for a team
 * @param {string} conference - Conference name from BDL
 * @returns {string} - Tier: 'ELITE', 'STRONG', 'MID', 'SMALL', or 'UNKNOWN'
 */
const getConferenceTier = (conference) => {
  if (!conference) return 'UNKNOWN';
  
  // Direct lookup
  if (CONFERENCE_TIERS[conference]) {
    return CONFERENCE_TIERS[conference];
  }
  
  // Fuzzy match (handle slight naming variations)
  const normalizedConf = conference.toLowerCase().trim();
  for (const [confName, tier] of Object.entries(CONFERENCE_TIERS)) {
    if (normalizedConf.includes(confName.toLowerCase()) || 
        confName.toLowerCase().includes(normalizedConf)) {
      return tier;
    }
  }
  
  // Default to MID if unknown (safer than SMALL)
  return 'UNKNOWN';
};

/**
 * Get matchup type based on conference tiers
 * @param {string} homeTier - Home team conference tier
 * @param {string} awayTier - Away team conference tier
 * @returns {Object} - Matchup classification and analysis hints
 */
const getMatchupType = (homeTier, awayTier) => {
  const tiers = [homeTier, awayTier].sort();
  const key = `${tiers[0]}_vs_${tiers[1]}`;
  
  const matchupTypes = {
    'ELITE_vs_ELITE': {
      type: 'ELITE_VS_ELITE',
      description: 'Premier matchup - trust efficiency metrics and depth',
      hints: [
        'KenPom/efficiency metrics are reliable',
        'Depth matters - check bench scoring',
        'Coaching adjustments likely in close games',
        'Experience advantage is significant'
      ],
      spreadReliability: 'HIGH',
      overUnderReliability: 'HIGH'
    },
    'ELITE_vs_STRONG': {
      type: 'ELITE_VS_STRONG',
      description: 'Upset watch - mid-major can hang if star player performs',
      hints: [
        'Check if mid-major has a star (20+ PPG scorer)',
        'Home court for mid-major = major factor',
        'Early season = more variance, mid-major might not be ready',
        'Conference play = mid-major battle-tested'
      ],
      spreadReliability: 'MEDIUM',
      overUnderReliability: 'MEDIUM'
    },
    'ELITE_vs_MID': {
      type: 'ELITE_VS_MID',
      description: 'Big favorite territory - cover depends on effort',
      hints: [
        'Trap game potential if Elite team is looking ahead',
        'Check for "buy games" (paid non-conference games)',
        'Garbage time variance is HIGH',
        'Early foul trouble can extend the game'
      ],
      spreadReliability: 'LOW',
      overUnderReliability: 'MEDIUM'
    },
    'ELITE_vs_SMALL': {
      type: 'ELITE_VS_SMALL',
      description: 'Avoid or extreme caution - unpredictable blowout dynamics',
      hints: [
        'CAUTION: These games are coin flips ATS',
        'Elite team may rest starters early',
        'Small conference team may play loose and score',
        'Data quality for small team is likely poor'
      ],
      spreadReliability: 'VERY_LOW',
      overUnderReliability: 'LOW'
    },
    'ELITE_vs_UNKNOWN': {
      type: 'ELITE_VS_UNKNOWN',
      description: 'Unknown opponent tier - proceed with caution',
      hints: [
        'Cannot verify opponent quality',
        'Treat like MID tier as baseline',
        'Check opponent record carefully'
      ],
      spreadReliability: 'LOW',
      overUnderReliability: 'LOW'
    },
    'STRONG_vs_STRONG': {
      type: 'STRONG_VS_STRONG',
      description: 'Mid-major showdown - star power and home court dominate',
      hints: [
        'Best player often decides outcome',
        'Home court worth 4-5 points',
        'Conference familiarity = execution edge',
        'These games are often under-bet (value potential)'
      ],
      spreadReliability: 'MEDIUM',
      overUnderReliability: 'MEDIUM'
    },
    'STRONG_vs_MID': {
      type: 'STRONG_VS_MID',
      description: 'Quality gap exists but variance is high',
      hints: [
        'Mid-major hierarchy matters',
        'Check motivation (conference tournament seeding)',
        'Travel fatigue can level the playing field'
      ],
      spreadReliability: 'MEDIUM',
      overUnderReliability: 'MEDIUM'
    },
    'STRONG_vs_SMALL': {
      type: 'STRONG_VS_SMALL',
      description: 'Mismatch but small team can hang for a half',
      hints: [
        'First half might be close',
        'Depth wins in second half',
        'Garbage time variance applies'
      ],
      spreadReliability: 'LOW',
      overUnderReliability: 'MEDIUM'
    },
    'MID_vs_MID': {
      type: 'MID_VS_MID',
      description: 'High variance - home court and momentum critical',
      hints: [
        'Home court worth 5-6 points at this level',
        'Look for hot/cold streaks',
        'Single player can dominate',
        'Limited public betting = potentially softer lines'
      ],
      spreadReliability: 'MEDIUM',
      overUnderReliability: 'LOW'
    },
    'MID_vs_SMALL': {
      type: 'MID_VS_SMALL',
      description: 'Likely mismatch but data is unreliable',
      hints: [
        'Fade public favorites at big numbers',
        'Check if teams have played before',
        'Limited data = limited confidence'
      ],
      spreadReliability: 'LOW',
      overUnderReliability: 'LOW'
    },
    'SMALL_vs_SMALL': {
      type: 'SMALL_VS_SMALL',
      description: 'Avoid - insufficient data for confident picks',
      hints: [
        'RECOMMENDATION: PASS on this game',
        'Data quality too poor for analysis',
        'Random variance dominates'
      ],
      spreadReliability: 'VERY_LOW',
      overUnderReliability: 'VERY_LOW'
    }
  };
  
  // Handle various combinations
  return matchupTypes[key] || matchupTypes[`${tiers[1]}_vs_${tiers[0]}`] || {
    type: 'UNKNOWN_MATCHUP',
    description: 'Unable to classify matchup',
    hints: ['Proceed with caution', 'Verify data quality'],
    spreadReliability: 'LOW',
    overUnderReliability: 'LOW'
  };
};

/**
 * Check if a team profile has adequate data for analysis
 * @param {Object} profile - Team profile built from season stats
 * @param {Array} seasonRows - Raw season stats rows from API
 * @returns {boolean} - True if team has sufficient data
 */
const hasAdequateData = (profile, seasonRows) => {
  const map = seasonRowToMap(seasonRows);
  const gamesPlayed = map.games_played ?? map.games ?? 0;
  
  // Must have played at least MIN_GAMES_THRESHOLD games
  if (gamesPlayed < MIN_GAMES_THRESHOLD) return false;
  
  // Check for essential stats being present
  const hasFGData = profile.shooting?.fgPct != null && profile.shooting.fgPct > 0;
  const hasTempo = profile.tempo != null && profile.tempo > 0;
  const hasRecord = profile.record != null && profile.record !== 'N/A';
  
  // Need at least shooting stats and games played
  return hasFGData || (hasRecord && gamesPlayed >= MIN_GAMES_THRESHOLD);
};

const seasonRowToMap = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return {};
  if (rows[0]?.name && typeof rows[0]?.value !== 'undefined') {
    const map = {};
    rows.forEach((row) => {
      map[row.name] = row.value;
    });
    return map;
  }
  return rows[0] || {};
};

const safeDiv = (num, den) => {
  if (typeof num !== 'number' || typeof den !== 'number' || den === 0) return null;
  return num / den;
};

const buildTeamProfile = (seasonRows = [], standingsRow = null) => {
  const map = seasonRowToMap(seasonRows);
  const games = map.games_played ?? map.games ?? null;
  const points = map.points ?? map.total_points ?? null;
  const oppPoints = map.points_against ?? map.opp_total_points ?? null;
  const fga = map.field_goals_attempted ?? map.fga ?? null;
  const fgm = map.field_goals_made ?? map.fgm ?? null;
  const fg3a = map.three_point_field_goals_attempted ?? map.fg3a ?? null;
  const fg3m = map.three_point_field_goals_made ?? map.fg3m ?? null;
  const fta = map.free_throws_attempted ?? map.fta ?? null;
  const ftm = map.free_throws_made ?? map.ftm ?? null;
  const oreb = map.offensive_rebounds ?? map.oreb ?? null;
  const dreb = map.defensive_rebounds ?? map.dreb ?? null;
  const treb = (typeof oreb === 'number' && typeof dreb === 'number') ? oreb + dreb : null;
  const turnovers = map.turnovers ?? map.tov ?? null;
  const possessions = (typeof fga === 'number' && typeof fta === 'number' && typeof oreb === 'number' && typeof turnovers === 'number')
    ? fga + 0.44 * fta - oreb + turnovers
    : null;

  const record = standingsRow?.record || map.record || null;
  const homeRecord =
    standingsRow?.home_record ||
    (standingsRow?.home_wins != null && standingsRow?.home_losses != null
      ? `${standingsRow.home_wins}-${standingsRow.home_losses}`
      : null);
  const roadRecord =
    standingsRow?.away_record ||
    (standingsRow?.away_wins != null && standingsRow?.away_losses != null
      ? `${standingsRow.away_wins}-${standingsRow.away_losses}`
      : null);

  return {
    record,
    homeRecord,
    roadRecord,
    adjEfficiency: points != null && possessions
      ? {
          offensiveRating: safeDiv(points, possessions) != null ? safeDiv(points, possessions) * 100 : null,
          defensiveRating: (oppPoints != null && possessions) ? (oppPoints / possessions) * 100 : null,
          netRating:
            (points != null && oppPoints != null && possessions)
              ? ((points - oppPoints) / possessions) * 100
              : null
        }
      : {},
    tempo: games ? safeDiv(possessions, games) : possessions,
    turnoverRate: possessions ? safeDiv(turnovers, possessions) : null,
    offensiveRebRate: treb ? safeDiv(oreb, treb) : null,
    threePointDependency: (typeof fg3a === 'number' && typeof fga === 'number' && fga > 0) ? fg3a / fga : null,
    ftRate: (typeof fta === 'number' && typeof fga === 'number' && fga > 0) ? fta / fga : null,
    shooting: {
      fgPct: (typeof fgm === 'number' && typeof fga === 'number' && fga > 0) ? fgm / fga : null,
      threePct: (typeof fg3m === 'number' && typeof fg3a === 'number' && fg3a > 0) ? fg3m / fg3a : null,
      ftPct: (typeof ftm === 'number' && typeof fta === 'number' && fta > 0) ? ftm / fta : null
    }
  };
};

export async function buildNcaabAgenticContext(game, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const season = commenceDate.getMonth() + 1 <= 4 ? commenceDate.getFullYear() - 1 : commenceDate.getFullYear();

  const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
  const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);

  if (!homeTeam || !awayTeam) {
    throw new Error('Unable to resolve NCAAB teams for agentic context');
  }

  const lookbackStart = new Date(commenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - 21);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = commenceDate.toISOString().slice(0, 10);

  const [homeRecent, awayRecent, injuries, homeStandings, awayStandings, homeSeasonRows, awaySeasonRows] = await Promise.all([
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
    // Avoid passing conference_id for NCAAB: BDL is strict about accepted values and
    // team objects are not always aligned with the standings conference_id parameter.
    ballDontLieService.getStandingsGeneric(SPORT_KEY, { season }),
    ballDontLieService.getStandingsGeneric(SPORT_KEY, { season }),
    ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season }),
    ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season })
  ]);

  const restInfo = {
    home: calcRestInfo(homeRecent, homeTeam.id, commenceDate),
    away: calcRestInfo(awayRecent, awayTeam.id, commenceDate)
  };
  const recentForm = {
    home: calcRecentForm(homeRecent, homeTeam.id, 5),
    away: calcRecentForm(awayRecent, awayTeam.id, 5)
  };

  const homeProfile = buildTeamProfile(homeSeasonRows, Array.isArray(homeStandings) ? homeStandings.find((r) => r?.team?.id === homeTeam.id) : null);
  const awayProfile = buildTeamProfile(awaySeasonRows, Array.isArray(awayStandings) ? awayStandings.find((r) => r?.team?.id === awayTeam.id) : null);

  // Get conference tier information
  const homeConference = homeTeam.conference || null;
  const awayConference = awayTeam.conference || null;
  const homeTier = getConferenceTier(homeConference);
  const awayTier = getConferenceTier(awayConference);
  const matchupType = getMatchupType(homeTier, awayTier);
  
  console.log(`[Agentic][NCAAB] Conference analysis: ${game.away_team} (${awayConference || 'Unknown'} - ${awayTier}) @ ${game.home_team} (${homeConference || 'Unknown'} - ${homeTier})`);
  console.log(`[Agentic][NCAAB] Matchup type: ${matchupType.type} - ${matchupType.description}`);

  // Check data quality for both teams
  const homeHasData = hasAdequateData(homeProfile, homeSeasonRows);
  const awayHasData = hasAdequateData(awayProfile, awaySeasonRows);
  const dataQuality = {
    homeHasAdequateData: homeHasData,
    awayHasAdequateData: awayHasData,
    bothTeamsHaveData: homeHasData && awayHasData,
    homeGamesPlayed: seasonRowToMap(homeSeasonRows).games_played ?? seasonRowToMap(homeSeasonRows).games ?? 0,
    awayGamesPlayed: seasonRowToMap(awaySeasonRows).games_played ?? seasonRowToMap(awaySeasonRows).games ?? 0
  };
  
  if (!dataQuality.bothTeamsHaveData) {
    console.warn(`[Agentic][NCAAB] ⚠️ Insufficient data for game: ${game.away_team} @ ${game.home_team}`);
    console.warn(`  - ${game.home_team}: ${homeHasData ? '✓' : '✗'} (${dataQuality.homeGamesPlayed} games)`);
    console.warn(`  - ${game.away_team}: ${awayHasData ? '✓' : '✗'} (${dataQuality.awayGamesPlayed} games)`);
  }

  const injuriesList = (injuries || []).map((injury) => ({
    player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
    status: injury?.status,
    description: injury?.description || '',
    team: injury?.team?.full_name || ''
  }));

  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], homeTeam.full_name, awayTeam.full_name);

  let richContext = null;
  try {
    const dateStr = commenceDate.toISOString().slice(0, 10);
    richContext = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'ncaab', dateStr);
  } catch (error) {
    console.warn('[Agentic][NCAAB] Perplexity context failed:', error.message);
  }

  const tokenData = {
    // CONFERENCE CONTEXT - Critical for NCAAB analysis
    conference_context: {
      home: {
        conference: homeConference,
        tier: homeTier,
        tierDescription: homeTier === 'ELITE' ? 'Power conference (Big Ten/SEC/Big 12/Big East/ACC/Pac-12)' :
                         homeTier === 'STRONG' ? 'Quality mid-major (MWC/WCC/AAC/A-10/MVC)' :
                         homeTier === 'MID' ? 'Mid-tier conference (moderate data reliability)' :
                         homeTier === 'SMALL' ? 'Low-major conference (limited data, high variance)' :
                         'Unknown conference tier'
      },
      away: {
        conference: awayConference,
        tier: awayTier,
        tierDescription: awayTier === 'ELITE' ? 'Power conference (Big Ten/SEC/Big 12/Big East/ACC/Pac-12)' :
                         awayTier === 'STRONG' ? 'Quality mid-major (MWC/WCC/AAC/A-10/MVC)' :
                         awayTier === 'MID' ? 'Mid-tier conference (moderate data reliability)' :
                         awayTier === 'SMALL' ? 'Low-major conference (limited data, high variance)' :
                         'Unknown conference tier'
      },
      matchupType: matchupType.type,
      matchupDescription: matchupType.description,
      analysisHints: matchupType.hints,
      spreadReliability: matchupType.spreadReliability,
      overUnderReliability: matchupType.overUnderReliability
    },
    adj_efficiency: {
      home: homeProfile.adjEfficiency,
      away: awayProfile.adjEfficiency
    },
    tempo: {
      home: { possessionsPerGame: homeProfile.tempo },
      away: { possessionsPerGame: awayProfile.tempo }
    },
    turnover_rate: {
      home: { turnoverRate: homeProfile.turnoverRate },
      away: { turnoverRate: awayProfile.turnoverRate }
    },
    offensive_rebounding: {
      home: { offensiveRebRate: homeProfile.offensiveRebRate },
      away: { offensiveRebRate: awayProfile.offensiveRebRate }
    },
    three_pt_dependency: {
      home: { attemptRate: homeProfile.threePointDependency },
      away: { attemptRate: awayProfile.threePointDependency }
    },
    home_court_value: {
      home: { record: homeProfile.homeRecord, roadRecord: homeProfile.roadRecord },
      away: { record: awayProfile.homeRecord, roadRecord: awayProfile.roadRecord }
    },
    ft_rate: {
      home: { rate: homeProfile.ftRate, ftPct: homeProfile.shooting.ftPct },
      away: { rate: awayProfile.ftRate, ftPct: awayProfile.shooting.ftPct }
    },
    injury_report: {
      notable: injuriesList.slice(0, 6),
      total_listed: injuriesList.length
    },
    market_snapshot: marketSnapshot,
    recent_form: recentForm
  };

  const records = {
    home: homeProfile.record || 'N/A',
    away: awayProfile.record || 'N/A'
  };

  const gameSummary = {
    gameId: `ncaab-${game.id}`,
    sport: SPORT_KEY,
    league: 'NCAAB',
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
    // Conference context for the model
    conferenceContext: {
      home: { conference: homeConference, tier: homeTier },
      away: { conference: awayConference, tier: awayTier },
      matchupType: matchupType.type,
      matchupDescription: matchupType.description
    },
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
      richKeyFindings: richContext?.key_findings || [],
      dataQuality
    }
  };
}

