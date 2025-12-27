/**
 * EPL Props Agentic Context Builder
 * Builds rich context for EPL (soccer) player prop analysis
 */
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'soccer_epl';

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
    
    return {
      ...player,
      score: player.props.length * 10 + (avgOdds > -110 ? 20 : 0)
    };
  });
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPlayers);
}

/**
 * Build token slices for prop analysis
 */
function buildPropsTokenSlices(playerStats, propCandidates, marketSnapshot) {
  return {
    player_stats: {
      summary: playerStats.substring(0, 6000), // Increased to match NBA/NFL
      playerCount: (playerStats.match(/###/g) || []).length
    },
    prop_lines: {
      candidates: propCandidates.map(p => ({
        player: p.player,
        team: p.team,
        props: p.props.slice(0, 5)
      })),
      totalProps: propCandidates.reduce((sum, p) => sum + p.props.length, 0)
    },
    injury_report: {
      notable: [],
      total_listed: 0
    },
    market_context: marketSnapshot
  };
}

/**
 * Build agentic context for EPL prop picks
 */
export async function buildEplPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const season = commenceDate.getFullYear();

  console.log(`[EPL Props Context] Building context for ${game.away_team} @ ${game.home_team}`);

  // Process props
  const propCandidates = getTopPropCandidates(playerProps, 15);
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    game.home_team, 
    game.away_team
  );

  // Build basic player stats (EPL has limited API data)
  const playerStats = `### ${game.away_team} Key Players
(Soccer player stats limited - using prop line data)

### ${game.home_team} Key Players
(Soccer player stats limited - using prop line data)`;

  // Build token data
  const tokenData = buildPropsTokenSlices(
    playerStats,
    propCandidates,
    marketSnapshot
  );

  // Build game summary
  const gameSummary = {
    gameId: `epl-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'EPL',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    tipoff: formatGameTimeEST(game.commence_time),
    odds: {
      spread: marketSnapshot.spread,
      total: marketSnapshot.total,
      moneyline: marketSnapshot.moneyline
    },
    propCount: playerProps.length,
    topCandidates: propCandidates.map(p => p.player).slice(0, 6)
  };

  console.log(`[EPL Props Context] Built context with ${propCandidates.length} player candidates`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates,
    playerStats,
    meta: {
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      season,
      gameTime: game.commence_time
    }
  };
}

export default {
  buildEplPropsAgenticContext
};
