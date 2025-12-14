/**
 * NFL Props Agentic Context Builder
 * Builds rich context for player prop analysis
 */
import { ballDontLieService } from '../ballDontLieService.js';
import { formatNFLPlayerStats } from '../nflPlayerPropsService.js';
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'americanfootball_nfl';

/**
 * Group props by player for easier analysis
 */
function groupPropsByPlayer(props) {
  const grouped = {};
  
  for (const prop of props) {
    const playerName = prop.player || 'Unknown';
    if (!grouped[playerName]) {
      grouped[playerName] = {
        player: playerName,
        team: prop.team || 'Unknown',
        props: []
      };
    }
    grouped[playerName].props.push({
      type: prop.prop_type,
      line: prop.line,
      over_odds: prop.over_odds,
      under_odds: prop.under_odds
    });
  }
  
  return Object.values(grouped);
}

/**
 * Get top prop candidates based on line value and odds quality
 */
function getTopPropCandidates(props, maxPlayers = 10) {
  const grouped = groupPropsByPlayer(props);
  
  // Score each player by number of props and odds quality
  const scored = grouped.map(player => {
    const avgOdds = player.props.reduce((sum, p) => {
      const odds = p.over_odds || p.under_odds || -110;
      return sum + odds;
    }, 0) / player.props.length;
    
    return {
      ...player,
      score: player.props.length * 10 + (avgOdds > -110 ? 20 : 0)
    };
  });
  
  // Sort by score and take top players
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPlayers);
}

/**
 * Format injuries relevant to props
 */
function formatPropsInjuries(injuries = []) {
  return (injuries || [])
    .filter(inj => {
      const pos = (inj.player?.position || '').toUpperCase();
      // Focus on skill positions for props
      return ['QB', 'RB', 'WR', 'TE'].includes(pos);
    })
    .slice(0, 10)
    .map((injury) => ({
      player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
      position: injury?.player?.position || 'Unknown',
      status: injury?.status || 'Unknown',
      description: injury?.description || '',
      team: injury?.team?.full_name || ''
    }));
}

/**
 * Build token slices for prop analysis
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot) {
  return {
    player_stats: {
      summary: playerStats.substring(0, 3000), // Truncate for token efficiency
      playerCount: (playerStats.match(/###/g) || []).length
    },
    prop_lines: {
      candidates: propCandidates.map(p => ({
        player: p.player,
        team: p.team,
        props: p.props // Send all props so Gary can analyze everything
      })),
      totalProps: propCandidates.reduce((sum, p) => sum + p.props.length, 0)
    },
    injury_report: {
      notable: injuries.slice(0, 8),
      total_listed: injuries.length
    },
    market_context: marketSnapshot
  };
}

/**
 * Build agentic context for NFL prop picks
 * @param {Object} game - Game object from oddsService
 * @param {Array} playerProps - Available prop lines
 * @param {Object} options - Additional options
 */
export async function buildNflPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const season = commenceDate.getFullYear();

  console.log(`[NFL Props Context] Building context for ${game.away_team} @ ${game.home_team}`);

  // Resolve teams
  const [homeTeam, awayTeam] = await Promise.all([
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team)
  ]);

  if (!homeTeam || !awayTeam) {
    console.warn('[NFL Props Context] Could not resolve one or both teams');
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Fetch injuries
  let injuries = [];
  try {
    if (teamIds.length > 0) {
      injuries = await ballDontLieService.getInjuriesGeneric(
        SPORT_KEY,
        { team_ids: teamIds },
        options.nocache ? 0 : 5
      );
    }
  } catch (e) {
    console.warn('[NFL Props Context] Failed to fetch injuries:', e.message);
  }

  // Get formatted player stats
  let playerStats = '';
  try {
    playerStats = await formatNFLPlayerStats(game.home_team, game.away_team);
  } catch (e) {
    console.warn('[NFL Props Context] Failed to fetch player stats:', e.message);
    playerStats = `Player stats unavailable for ${game.away_team} @ ${game.home_team}`;
  }

  // Process props
  const propCandidates = getTopPropCandidates(playerProps, 15);
  const formattedInjuries = formatPropsInjuries(injuries);
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    homeTeam?.full_name || game.home_team, 
    awayTeam?.full_name || game.away_team
  );

  // Build token data
  const tokenData = buildPropsTokenSlices(
    playerStats,
    propCandidates,
    formattedInjuries,
    marketSnapshot
  );

  // Build game summary
  const gameSummary = {
    gameId: `nfl-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'NFL',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam?.full_name || game.home_team,
    awayTeam: awayTeam?.full_name || game.away_team,
    tipoff: formatGameTimeEST(game.commence_time),
    odds: {
      spread: marketSnapshot.spread,
      total: marketSnapshot.total,
      moneyline: marketSnapshot.moneyline
    },
    propCount: playerProps.length,
    topCandidates: propCandidates.map(p => p.player).slice(0, 5)
  };

  console.log(`[NFL Props Context] Built context with ${propCandidates.length} player candidates, ${formattedInjuries.length} injuries`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates,
    playerStats,
    meta: {
      homeTeam,
      awayTeam,
      season,
      gameTime: game.commence_time
    }
  };
}

export default {
  buildNflPropsAgenticContext
};
