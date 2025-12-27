import { ballDontLieService } from '../ballDontLieService.js';
// Context sourced from Gemini 3 Flash Grounding
import { formatGameTimeEST, buildMarketSnapshot, calcRestInfo, calcRecentForm, parseGameDate } from './sharedUtils.js';
import { fetchGroundedContext, getGroundedRichContext } from './scoutReport/scoutReportBuilder.js';

const SPORT_KEY = 'americanfootball_ncaaf';

// Calculate NCAAF season dynamically: Aug-Feb spans years
// In Jan-Jul we're in the second half of previous year's season
function getCurrentNcaafSeason() {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  return month <= 7 ? year - 1 : year;
}

/**
 * NCAAF Conference Tier Mapping (2024-25 Season)
 * Uses BDL conference IDs for accurate mapping
 * 
 * Tier 1: Elite Power 4 (SEC, Big Ten) - Top recruiting, NFL talent pipelines
 * Tier 2: Power 4 (Big 12, ACC, Pac-12) - Strong programs, good recruiting
 * Tier 3: Upper G5 (AAC, Mountain West) - Best of Group of 5, occasional NY6 teams
 * Tier 4: Lower G5 (MAC, Sun Belt, C-USA) - Limited resources, lower talent floor
 * 
 * Note: Tiers reflect TYPICAL talent/resources, NOT current season performance.
 * A bad Tier 1 team can lose to a good Tier 4 team - always verify with actual stats.
 */

// BDL Conference ID to Tier Mapping (from /ncaaf/v1/conferences)
const CONFERENCE_ID_TIERS = {
  // Tier 1: Elite Power 4
  10: { tier: 1, name: 'SEC', label: 'Elite Power 4', description: 'Top recruiting, deepest talent, NFL pipeline' },
  4: { tier: 1, name: 'Big Ten', label: 'Elite Power 4', description: 'Blue-chip recruiting, elite resources' },
  
  // Tier 2: Power 4
  1: { tier: 2, name: 'ACC', label: 'Power 4', description: 'Historic programs, solid recruiting' },
  3: { tier: 2, name: 'Big 12', label: 'Power 4', description: 'Strong programs, good depth' },
  9: { tier: 2, name: 'Pac-12', label: 'Power 4', description: 'Rebuilding after realignment' },
  6: { tier: 2, name: 'FBS Indep.', label: 'FBS Independent', description: 'Varies (Notre Dame elite, others less so)' },
  
  // Tier 3: Upper G5
  2: { tier: 3, name: 'American', label: 'Upper G5', description: 'Best G5, occasional NY6 contenders' },
  8: { tier: 3, name: 'Mountain West', label: 'Upper G5', description: 'Competitive G5, Boise State tier' },
  
  // Tier 4: Lower G5
  5: { tier: 4, name: 'CUSA', label: 'Lower G5', description: 'Rebuilding after realignment' },
  7: { tier: 4, name: 'MAC', label: 'Lower G5', description: 'MACtion, limited recruiting reach' },
  11: { tier: 4, name: 'Sun Belt', label: 'Lower G5', description: 'Rising but still limited resources' },
  
  // FCS Conferences (Tier 5 - not FBS)
  12: { tier: 5, name: 'Big Sky', label: 'FCS', description: 'FCS conference' },
  13: { tier: 5, name: 'CAA', label: 'FCS', description: 'FCS conference' },
  14: { tier: 5, name: 'FCS Indep.', label: 'FCS', description: 'FCS Independent' },
  15: { tier: 5, name: 'Ivy', label: 'FCS', description: 'FCS - Ivy League' },
  16: { tier: 5, name: 'MEAC', label: 'FCS', description: 'FCS conference' },
  17: { tier: 5, name: 'MVFC', label: 'FCS', description: 'FCS conference' },
  18: { tier: 5, name: 'NEC', label: 'FCS', description: 'FCS conference' },
  19: { tier: 5, name: 'OVC-Big South', label: 'FCS', description: 'FCS conference' },
  20: { tier: 5, name: 'Patriot', label: 'FCS', description: 'FCS conference' },
  21: { tier: 5, name: 'Pioneer', label: 'FCS', description: 'FCS conference' },
  22: { tier: 5, name: 'Southern', label: 'FCS', description: 'FCS conference' },
  23: { tier: 5, name: 'Southland', label: 'FCS', description: 'FCS conference' },
  24: { tier: 5, name: 'SWAC', label: 'FCS', description: 'FCS conference' },
  25: { tier: 5, name: 'UAC', label: 'FCS', description: 'FCS conference' },
};

// Fallback mapping by conference name (for when ID isn't available)
const NCAAF_CONFERENCE_TIERS = {
  // Tier 1: Elite Power 4
  'SEC': { tier: 1, label: 'Elite Power 4', description: 'Top recruiting, deepest talent, NFL pipeline' },
  'Big Ten': { tier: 1, label: 'Elite Power 4', description: 'Blue-chip recruiting, elite resources' },
  
  // Tier 2: Power 4
  'Big 12': { tier: 2, label: 'Power 4', description: 'Strong programs, good depth' },
  'ACC': { tier: 2, label: 'Power 4', description: 'Historic programs, solid recruiting' },
  'Pac-12': { tier: 2, label: 'Power 4', description: 'Rebuilding after realignment' },
  'FBS Indep.': { tier: 2, label: 'FBS Independent', description: 'Varies widely' },
  
  // Tier 3: Upper G5
  'American': { tier: 3, label: 'Upper G5', description: 'Best G5, occasional NY6 contenders' },
  'AAC': { tier: 3, label: 'Upper G5', description: 'Best G5, occasional NY6 contenders' },
  'Mountain West': { tier: 3, label: 'Upper G5', description: 'Competitive G5, Boise State tier' },
  'MWC': { tier: 3, label: 'Upper G5', description: 'Competitive G5, Boise State tier' },
  
  // Tier 4: Lower G5
  'CUSA': { tier: 4, label: 'Lower G5', description: 'Rebuilding after realignment' },
  'C-USA': { tier: 4, label: 'Lower G5', description: 'Rebuilding after realignment' },
  'Conference USA': { tier: 4, label: 'Lower G5', description: 'Rebuilding after realignment' },
  'MAC': { tier: 4, label: 'Lower G5', description: 'MACtion, limited recruiting reach' },
  'Sun Belt': { tier: 4, label: 'Lower G5', description: 'Rising but still limited resources' },
};

// Special team overrides for independents (Notre Dame is elite, others less so)
const TEAM_TIER_OVERRIDES = {
  'Notre Dame Fighting Irish': { tier: 1, label: 'Elite Independent', description: 'Blue-chip recruiting, elite resources', conference: 'FBS Indep.' },
  'Notre Dame': { tier: 1, label: 'Elite Independent', description: 'Blue-chip recruiting, elite resources', conference: 'FBS Indep.' },
  'Army Black Knights': { tier: 3, label: 'Upper Independent', description: 'Service academy, triple option', conference: 'FBS Indep.' },
  'Navy Midshipmen': { tier: 3, label: 'Upper Independent', description: 'Service academy, triple option', conference: 'FBS Indep.' },
  'UConn Huskies': { tier: 4, label: 'Lower Independent', description: 'Rebuilding program', conference: 'FBS Indep.' },
  'UMass Minutemen': { tier: 4, label: 'Lower Independent', description: 'Limited resources', conference: 'FBS Indep.' },
};

/**
 * Get conference tier info for a team
 * Uses BDL conference ID as primary source, falls back to name matching
 */
function getConferenceTier(team) {
  if (!team) return { tier: 0, label: 'Unknown', description: 'Unable to determine conference', conference: 'Unknown' };
  
  // Check team-specific overrides first (for independents like Notre Dame)
  const teamName = team.full_name || team.name || '';
  if (TEAM_TIER_OVERRIDES[teamName]) {
    return { ...TEAM_TIER_OVERRIDES[teamName] };
  }
  
  // Try conference ID first (most reliable)
  const confId = parseInt(team.conference, 10);
  if (!isNaN(confId) && CONFERENCE_ID_TIERS[confId]) {
    const tierInfo = CONFERENCE_ID_TIERS[confId];
    return { 
      tier: tierInfo.tier, 
      label: tierInfo.label, 
      description: tierInfo.description,
      conference: tierInfo.name,
      conferenceId: confId
    };
  }
  
  // Fallback to conference name matching
  const confName = team.conference || team.division || '';
  if (NCAAF_CONFERENCE_TIERS[confName]) {
    return { ...NCAAF_CONFERENCE_TIERS[confName], conference: confName };
  }
  
  // Default to Tier 3 (middle ground) if unknown FBS, or check if it's FCS
  const isFCS = confId >= 12 && confId <= 25;
  if (isFCS) {
    return { tier: 5, label: 'FCS', description: 'FCS team', conference: confName || 'FCS' };
  }
  
  return { tier: 3, label: 'Unknown Conference', description: 'Conference not mapped', conference: confName || 'Unknown' };
}

/**
 * Build conference tier matchup context
 */
function buildConferenceTierContext(homeTeam, awayTeam) {
  const homeTier = getConferenceTier(homeTeam);
  const awayTier = getConferenceTier(awayTeam);
  const tierGap = Math.abs(homeTier.tier - awayTier.tier);
  
  let matchupAnalysis = '';
  if (tierGap === 0) {
    matchupAnalysis = 'Same tier matchup - even playing field baseline. Focus on current form and matchup specifics.';
  } else if (tierGap === 1) {
    matchupAnalysis = 'One tier gap - slight edge to higher tier, but very beatable. Talent is close enough that execution matters most.';
  } else if (tierGap === 2) {
    matchupAnalysis = 'Two tier gap - noticeable talent disparity. Higher tier should win, but look for motivation/situational edges for underdog.';
  } else {
    matchupAnalysis = 'Three+ tier gap - significant mismatch on paper. Focus on spread value, not outright winner. Lower tier needs perfect game + opponent letdown.';
  }
  
  return {
    home: {
      team: homeTeam.full_name || homeTeam.name,
      tier: homeTier.tier,
      tierLabel: homeTier.label,
      conference: homeTier.conference || homeTeam.conference || 'Unknown',
      description: homeTier.description
    },
    away: {
      team: awayTeam.full_name || awayTeam.name,
      tier: awayTier.tier,
      tierLabel: awayTier.label,
      conference: awayTier.conference || awayTeam.conference || 'Unknown',
      description: awayTier.description
    },
    tierGap,
    higherTierTeam: homeTier.tier < awayTier.tier ? 'home' : (awayTier.tier < homeTier.tier ? 'away' : 'even'),
    matchupAnalysis,
    warning: tierGap >= 2 ? 'CAUTION: Large tier gaps often mean inflated spreads. Verify with actual performance stats.' : null
  };
}

const seasonStatsToMap = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return {};
  if (rows[0]?.name && typeof rows[0]?.value !== 'undefined') {
    const map = {};
    rows.forEach((r) => {
      map[r.name] = r.value;
    });
    return map;
  }
  return rows[0] || {};
};

const safeRate = (num, den) => {
  if (typeof num !== 'number' || typeof den !== 'number' || den === 0) return null;
  return num / den;
};

const buildCollegeMetrics = (map = {}) => {
  const wins = map.overall_wins ?? map.wins ?? null;
  const losses = map.overall_losses ?? map.losses ?? null;
  const games = (typeof wins === 'number' && typeof losses === 'number') ? wins + losses : map.games_played ?? null;
  const totalYards = map.total_offensive_yards ?? map.total_yards ?? null;
  const offensivePlays = map.total_offensive_plays ?? map.offensive_plays ?? null;
  const yardsPerPlay = map.yards_per_play ?? safeRate(totalYards, offensivePlays);
  const oppYardsPerPlay = map.opp_yards_per_play ?? null;
  const offensivePoints = map.total_points ?? null;
  const defensivePoints = map.opp_total_points ?? null;
  const pointsPerGame = games ? safeRate(offensivePoints, games) : null;
  const oppPointsPerGame = games ? safeRate(defensivePoints, games) : null;
  const tacklesForLoss = map.defensive_tackles_for_loss ?? map.tackles_for_loss ?? null;
  const sacks = map.sacks ?? map.defensive_sacks ?? null;
  const defensivePlays = map.defensive_plays ?? null;
  const havocRate = defensivePlays ? safeRate((tacklesForLoss || 0) + (sacks || 0), defensivePlays) : null;
  const redZoneScores = map.red_zone_scores ?? null;
  const redZoneAttempts = map.red_zone_attempts ?? null;
  const finishingDrives = safeRate(redZoneScores, redZoneAttempts);
  const pace = games ? safeRate(offensivePlays, games) : offensivePlays;

  return {
    record: wins != null && losses != null ? `${wins}-${losses}` : 'N/A',
    talentComposite: (wins != null && losses != null && pointsPerGame != null && oppPointsPerGame != null)
      ? {
          wins,
          losses,
          scoringMargin: pointsPerGame - oppPointsPerGame
        }
      : null,
    yardsPerPlay,
    oppYardsPerPlay,
    havocRate,
    finishingDrives,
    pace,
    pointsPerGame
  };
};

export async function buildNcaafAgenticContext(game, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  // Calculate dynamic NCAAF season based on current date
  const season = getCurrentNcaafSeason();

  const [homeTeam, awayTeam] = await Promise.all([
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team)
  ]);
  if (!homeTeam || !awayTeam) {
    throw new Error('Unable to resolve NCAAF teams for agentic context');
  }

  const lookbackStart = new Date(commenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - 28);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = commenceDate.toISOString().slice(0, 10);
  const dateStr = commenceDate.toISOString().slice(0, 10);

  // Check if this is bowl season (Dec 14 - Jan 15) - affects context priority
  const month = commenceDate.getMonth();
  const day = commenceDate.getDate();
  const isBowlSeason = (month === 11 && day >= 14) || (month === 0 && day <= 15);
  
  if (isBowlSeason) {
    console.log(`[NCAAF] 🏈 BOWL SEASON DETECTED - Player opt-outs are CRITICAL for this game`);
  }

  const [homeRecent, awayRecent, injuries, standings, homeSeasonRows, awaySeasonRows, groundedContext] = await Promise.all([
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
    ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season, postseason: false }),
    // NARRATIVE CONTEXT via Gemini Grounding - CRITICAL for bowl games with player opt-outs
    fetchGroundedContext(game.home_team, game.away_team, 'NCAAF', dateStr, { useFlash: false }).catch(e => {
      console.warn('[NCAAF Context] Gemini Grounding failed:', e.message);
      return null;
    })
  ]);

  const restInfo = {
    home: calcRestInfo(homeRecent, homeTeam.id, commenceDate),
    away: calcRestInfo(awayRecent, awayTeam.id, commenceDate)
  };
  const recentForm = {
    home: calcRecentForm(homeRecent, homeTeam.id, 5),
    away: calcRecentForm(awayRecent, awayTeam.id, 5)
  };

  const homeStats = buildCollegeMetrics(seasonStatsToMap(homeSeasonRows));
  const awayStats = buildCollegeMetrics(seasonStatsToMap(awaySeasonRows));

  // Build conference tier context
  const conferenceTierContext = buildConferenceTierContext(homeTeam, awayTeam);
  console.log(`[NCAAF] Conference Tiers: ${conferenceTierContext.home.conference} (Tier ${conferenceTierContext.home.tier}) vs ${conferenceTierContext.away.conference} (Tier ${conferenceTierContext.away.tier}) - Gap: ${conferenceTierContext.tierGap}`);

  const injuriesList = (injuries || []).map((injury) => ({
    player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
    status: injury?.status,
    description: injury?.description || '',
    team: injury?.team?.full_name || ''
  }));

  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], homeTeam.full_name, awayTeam.full_name);

  // Extract narrative context from Gemini Grounding
  let narrativeContext = null;
  let playerOptOuts = null;
  
  if (groundedContext?.groundedRaw) {
    narrativeContext = groundedContext.groundedRaw;
    console.log(`[NCAAF Context] ✓ Got narrative context (${narrativeContext.length} chars) from Gemini Grounding`);
    
    // Extract player opt-outs from grounded context (bowl game critical)
    if (isBowlSeason) {
      const optOutMatches = narrativeContext.match(/opt[- ]?out|sitting out|skipping|declared for (?:the )?(?:NFL )?draft|not playing/gi);
      if (optOutMatches) {
        console.log(`[NCAAF Context] ⚠️ Found ${optOutMatches.length} potential player opt-out mentions`);
        playerOptOuts = {
          mentionCount: optOutMatches.length,
          rawContext: narrativeContext
        };
      }
    }
  } else {
    // Retry with alternative Grounding query if first attempt fails
    try {
      const richContext = await getGroundedRichContext(game.home_team, game.away_team, 'ncaaf', dateStr);
      narrativeContext = richContext?.summary || null;
      console.log(`[NCAAF Context] Retry Grounding: ${narrativeContext ? 'got context' : 'no context'}`);
    } catch (error) {
      console.warn('[Agentic][NCAAF] Grounding retry failed:', error.message);
    }
  }
  
  // For bowl games, construct special opt-out warning if context mentions opt-outs
  let bowlOptOutWarning = null;
  if (isBowlSeason && playerOptOuts?.mentionCount > 0) {
    bowlOptOutWarning = `⚠️ BOWL GAME WARNING: ${playerOptOuts.mentionCount} potential player opt-out mentions detected in live context. Review narrative carefully for missing key players.`;
  }

  const buildMotivationSpot = (rest) => ({
    daysSinceLastGame: rest?.days_since_last_game ?? null,
    gamesInLast7: rest?.games_in_last_7 ?? null,
    backToBack: rest?.back_to_back ?? false,
    lastOpponent: rest?.last_opponent || null
  });

  const tokenData = {
    conference_tier: conferenceTierContext,
    talent_composite: {
      home: homeStats.talentComposite,
      away: awayStats.talentComposite
    },
    motivation_spot: {
      home: buildMotivationSpot(restInfo.home),
      away: buildMotivationSpot(restInfo.away)
    },
    havoc_rate: {
      home: { rate: homeStats.havocRate },
      away: { rate: awayStats.havocRate }
    },
    explosiveness: {
      home: { yardsPerPlay: homeStats.yardsPerPlay, pointsPerGame: homeStats.pointsPerGame },
      away: { yardsPerPlay: awayStats.yardsPerPlay, pointsPerGame: awayStats.pointsPerGame }
    },
    finishing_drives: {
      home: { redZoneRate: homeStats.finishingDrives },
      away: { redZoneRate: awayStats.finishingDrives }
    },
    pace: {
      home: { playsPerGame: homeStats.pace },
      away: { playsPerGame: awayStats.pace }
    },
    injury_report: {
      notable: injuriesList.slice(0, 8),
      total_listed: injuriesList.length
    },
    market_snapshot: marketSnapshot,
    recent_form: recentForm
  };

  const records = (Array.isArray(standings)
    ? standings.reduce(
        (acc, row) => {
          if (row?.team?.id === homeTeam.id) acc.home = row?.record || `${row?.wins ?? '-'}-${row?.losses ?? '-'}`;
          if (row?.team?.id === awayTeam.id) acc.away = row?.record || `${row?.wins ?? '-'}-${row?.losses ?? '-'}`;
          return acc;
        },
        { home: 'N/A', away: 'N/A' }
      )
    : { home: 'N/A', away: 'N/A' });

  const gameSummary = {
    gameId: `ncaaf-${game.id}`,
    sport: SPORT_KEY,
    league: 'NCAAF',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam.full_name,
    awayTeam: awayTeam.full_name,
    tipoff: formatGameTimeEST(game.commence_time),
    location: homeTeam.city || homeTeam.full_name,
    isBowlGame: isBowlSeason,
    conferenceTier: {
      home: `${conferenceTierContext.home.conference} (Tier ${conferenceTierContext.home.tier} - ${conferenceTierContext.home.tierLabel})`,
      away: `${conferenceTierContext.away.conference} (Tier ${conferenceTierContext.away.tier} - ${conferenceTierContext.away.tierLabel})`,
      tierGap: conferenceTierContext.tierGap,
      analysis: conferenceTierContext.matchupAnalysis
    },
    odds: {
      spread: marketSnapshot.spread,
      moneyline: marketSnapshot.moneyline
    },
    records,
    narrative: {
      // Use Gemini Grounding context (primary) for full narrative
      fullContext: narrativeContext || null,
      bowlOptOutWarning: bowlOptOutWarning || null,
      notes: narrativeContext ? 'Live context from Gemini Grounding (bowl game player opt-outs tracked)' : 'No live context available'
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
      isBowlSeason,
      groundedContext: narrativeContext ? true : false,
      playerOptOutsDetected: playerOptOuts?.mentionCount || 0
    }
  };
}

