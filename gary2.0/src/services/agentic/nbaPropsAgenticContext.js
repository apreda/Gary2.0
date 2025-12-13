/**
 * NBA Props Agentic Context Builder
 * Builds rich context for NBA player prop analysis
 */
import { ballDontLieService } from '../ballDontLieService.js';
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'basketball_nba';

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
function getTopPropCandidates(props, maxPlayers = 12) {
  const grouped = groupPropsByPlayer(props);
  
  // Score each player by number of props and odds quality
  const scored = grouped.map(player => {
    const avgOdds = player.props.reduce((sum, p) => {
      const odds = p.over_odds || p.under_odds || -110;
      return sum + odds;
    }, 0) / player.props.length;
    
    // Prefer players with more prop options and better odds
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
 * Format injuries relevant to NBA props
 */
function formatPropsInjuries(injuries = []) {
  return (injuries || [])
    .filter(inj => {
      // All NBA players matter for props
      return inj?.player?.full_name || inj?.player?.first_name;
    })
    .slice(0, 12)
    .map((injury) => ({
      player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
      position: injury?.player?.position || 'Unknown',
      status: injury?.status || 'Unknown',
      description: injury?.description || '',
      team: injury?.team?.full_name || ''
    }));
}

/**
 * Format NBA player stats for prop analysis
 */
async function formatNBAPlayerStats(homeTeam, awayTeam) {
  try {
    // Fetch player stats for both teams
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getPlayersGeneric(SPORT_KEY, { team: homeTeam }).catch(() => []),
      ballDontLieService.getPlayersGeneric(SPORT_KEY, { team: awayTeam }).catch(() => [])
    ]);

    let statsText = `### ${awayTeam} Key Players\n`;
    if (awayStats && awayStats.length > 0) {
      awayStats.slice(0, 8).forEach(p => {
        const name = p.full_name || `${p.first_name} ${p.last_name}`;
        const pos = p.position || 'N/A';
        statsText += `- ${name} (${pos})\n`;
      });
    } else {
      statsText += '(Stats unavailable)\n';
    }

    statsText += `\n### ${homeTeam} Key Players\n`;
    if (homeStats && homeStats.length > 0) {
      homeStats.slice(0, 8).forEach(p => {
        const name = p.full_name || `${p.first_name} ${p.last_name}`;
        const pos = p.position || 'N/A';
        statsText += `- ${name} (${pos})\n`;
      });
    } else {
      statsText += '(Stats unavailable)\n';
    }

    return statsText;
  } catch (error) {
    console.warn('[NBA Props Context] Error formatting player stats:', error.message);
    return `Player stats unavailable for ${awayTeam} @ ${homeTeam}`;
  }
}

/**
 * Build token slices for prop analysis
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot) {
  return {
    player_stats: {
      summary: playerStats.substring(0, 3500), // Truncate for token efficiency
      playerCount: (playerStats.match(/###/g) || []).length
    },
    prop_lines: {
      candidates: propCandidates.map(p => ({
        player: p.player,
        team: p.team,
        props: p.props.slice(0, 6) // Top 6 props per player (more for NBA)
      })),
      totalProps: propCandidates.reduce((sum, p) => sum + p.props.length, 0)
    },
    injury_report: {
      notable: injuries.slice(0, 10),
      total_listed: injuries.length
    },
    market_context: marketSnapshot
  };
}

/**
 * Build agentic context for NBA prop picks
 * @param {Object} game - Game object from oddsService
 * @param {Array} playerProps - Available prop lines
 * @param {Object} options - Additional options
 */
export async function buildNbaPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const season = commenceDate.getFullYear();

  console.log(`[NBA Props Context] Building context for ${game.away_team} @ ${game.home_team}`);

  // Resolve teams
  const [homeTeam, awayTeam] = await Promise.all([
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team).catch(() => null),
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team).catch(() => null)
  ]);

  if (!homeTeam || !awayTeam) {
    console.warn('[NBA Props Context] Could not resolve one or both teams');
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
    console.warn('[NBA Props Context] Failed to fetch injuries:', e.message);
  }

  // Get formatted player stats
  let playerStats = '';
  try {
    playerStats = await formatNBAPlayerStats(game.home_team, game.away_team);
  } catch (e) {
    console.warn('[NBA Props Context] Failed to fetch player stats:', e.message);
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
    gameId: `nba-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'NBA',
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
    topCandidates: propCandidates.map(p => p.player).slice(0, 6)
  };

  console.log(`[NBA Props Context] Built context with ${propCandidates.length} player candidates, ${formattedInjuries.length} injuries`);

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
  buildNbaPropsAgenticContext
};
