/**
 * NHL Props Agentic Context Builder
 * Builds rich context for NHL player prop analysis
 * Enhanced with Perplexity advanced stats integration
 */
import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'icehockey_nhl';

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
 * Format injuries relevant to NHL props
 */
function formatPropsInjuries(injuries = []) {
  return (injuries || [])
    .filter(inj => inj?.player?.full_name || inj?.player?.first_name)
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
 * Build player stats text from advanced data and prop candidates
 */
function buildPlayerStatsText(homeTeam, awayTeam, advancedStats, propCandidates, richContext) {
  let statsText = '';
  
  // Away team section
  statsText += `### ${awayTeam} Key Players\n`;
  
  // Add team-level context from Perplexity
  if (advancedStats?.away_advanced) {
    const away = advancedStats.away_advanced;
    statsText += `Team Stats: CF% ${away.corsi_for_pct ?? 'N/A'}, xGF% ${away.expected_goals_for_pct ?? 'N/A'}, PDO ${away.pdo ?? 'N/A'}\n`;
  }
  
  // Add recent form
  if (advancedStats?.recent_form?.away_last_10) {
    statsText += `Recent: ${advancedStats.recent_form.away_last_10} (${advancedStats.recent_form.away_goals_per_game_l10 ?? 'N/A'} goals/game)\n`;
  }
  
  // Add away goalie info
  if (advancedStats?.goalie_matchup?.away_starter) {
    const g = advancedStats.goalie_matchup;
    statsText += `Goalie: ${g.away_starter} (${g.away_record ?? 'N/A'}, ${g.away_sv_pct ?? 'N/A'} SV%, ${g.away_gaa ?? 'N/A'} GAA)\n`;
  }
  
  // Add player candidates from away team
  const awayPlayers = propCandidates.filter(p => 
    p.team?.toLowerCase().includes(awayTeam.toLowerCase().split(' ').pop()) ||
    awayTeam.toLowerCase().includes(p.team?.toLowerCase().split(' ').pop() || '')
  );
  if (awayPlayers.length > 0) {
    statsText += `Prop candidates: ${awayPlayers.map(p => p.player).join(', ')}\n`;
  }
  
  statsText += '\n';
  
  // Home team section
  statsText += `### ${homeTeam} Key Players\n`;
  
  // Add team-level context from Perplexity
  if (advancedStats?.home_advanced) {
    const home = advancedStats.home_advanced;
    statsText += `Team Stats: CF% ${home.corsi_for_pct ?? 'N/A'}, xGF% ${home.expected_goals_for_pct ?? 'N/A'}, PDO ${home.pdo ?? 'N/A'}\n`;
  }
  
  // Add recent form
  if (advancedStats?.recent_form?.home_last_10) {
    statsText += `Recent: ${advancedStats.recent_form.home_last_10} (${advancedStats.recent_form.home_goals_per_game_l10 ?? 'N/A'} goals/game)\n`;
  }
  
  // Add home goalie info
  if (advancedStats?.goalie_matchup?.home_starter) {
    const g = advancedStats.goalie_matchup;
    statsText += `Goalie: ${g.home_starter} (${g.home_record ?? 'N/A'}, ${g.home_sv_pct ?? 'N/A'} SV%, ${g.home_gaa ?? 'N/A'} GAA)\n`;
  }
  
  // Add player candidates from home team
  const homePlayers = propCandidates.filter(p => 
    p.team?.toLowerCase().includes(homeTeam.toLowerCase().split(' ').pop()) ||
    homeTeam.toLowerCase().includes(p.team?.toLowerCase().split(' ').pop() || '')
  );
  if (homePlayers.length > 0) {
    statsText += `Prop candidates: ${homePlayers.map(p => p.player).join(', ')}\n`;
  }
  
  // Add key insights from Perplexity
  if (advancedStats?.key_analytics_insights && advancedStats.key_analytics_insights.length > 0) {
    statsText += '\n### Key Insights\n';
    advancedStats.key_analytics_insights.slice(0, 4).forEach((insight, i) => {
      statsText += `${i + 1}. ${insight}\n`;
    });
  }
  
  // Add rich context findings if available
  if (richContext?.key_findings && richContext.key_findings.length > 0) {
    statsText += '\n### Context & Trends\n';
    richContext.key_findings.slice(0, 3).forEach((finding, i) => {
      const text = typeof finding === 'string' ? finding : finding?.text || finding?.finding || JSON.stringify(finding);
      statsText += `${i + 1}. ${text}\n`;
    });
  }
  
  // Add player streaks if available
  if (richContext?.player_streaks && richContext.player_streaks.length > 0) {
    statsText += '\n### Player Streaks\n';
    richContext.player_streaks.slice(0, 5).forEach(streak => {
      const text = typeof streak === 'string' ? streak : streak?.description || JSON.stringify(streak);
      statsText += `- ${text}\n`;
    });
  }
  
  return statsText;
}

/**
 * Build token slices for prop analysis
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, advancedStats) {
  return {
    player_stats: {
      summary: playerStats.substring(0, 3500),
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
      notable: injuries.slice(0, 10),
      total_listed: injuries.length
    },
    market_context: marketSnapshot,
    // Add advanced stats for deeper analysis
    team_analytics: {
      home: advancedStats?.home_advanced || null,
      away: advancedStats?.away_advanced || null
    },
    goalie_matchup: advancedStats?.goalie_matchup || null,
    five_on_five: advancedStats?.five_on_five || null
  };
}

/**
 * Build agentic context for NHL prop picks
 */
export async function buildNhlPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const month = commenceDate.getMonth() + 1;
  const year = commenceDate.getFullYear();
  const season = month <= 6 ? year - 1 : year;
  const dateStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[NHL Props Context] Building context for ${game.away_team} @ ${game.home_team}`);

  // Resolve teams
  let homeTeam = null;
  let awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team).catch(() => null),
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team).catch(() => null)
    ]);
  } catch (e) {
    console.warn('[NHL Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Parallel fetch: injuries, Perplexity advanced stats, and rich context
  const [injuries, advancedStats, richContext] = await Promise.all([
    // Injuries from BDL
    teamIds.length > 0 
      ? ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5).catch(() => [])
      : Promise.resolve([]),
    
    // Advanced stats from Perplexity (Corsi, xG, PDO, goalie matchup)
    (async () => {
      try {
        console.log('[NHL Props Context] Fetching Perplexity advanced stats...');
        const stats = await perplexityService.getNhlAdvancedStats(game.home_team, game.away_team, dateStr);
        if (stats?._source === 'perplexity') {
          console.log('[NHL Props Context] ✓ Got Perplexity advanced stats');
        }
        return stats;
      } catch (e) {
        console.warn('[NHL Props Context] Perplexity advanced stats failed:', e.message);
        return null;
      }
    })(),
    
    // Rich context from Perplexity (streaks, trends, narratives)
    (async () => {
      try {
        console.log('[NHL Props Context] Fetching Perplexity rich context...');
        const ctx = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'nhl', dateStr);
        if (ctx && Object.keys(ctx).length > 0) {
          console.log('[NHL Props Context] ✓ Got Perplexity rich context');
        }
        return ctx;
      } catch (e) {
        console.warn('[NHL Props Context] Perplexity rich context failed:', e.message);
        return null;
      }
    })()
  ]);

  // Process props
  const propCandidates = getTopPropCandidates(playerProps, 15);
  const formattedInjuries = formatPropsInjuries(injuries);
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    homeTeam?.full_name || game.home_team, 
    awayTeam?.full_name || game.away_team
  );

  // Build player stats text with real data from Perplexity
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    advancedStats,
    propCandidates,
    richContext
  );

  // Build token data with enhanced info
  const tokenData = buildPropsTokenSlices(
    playerStats,
    propCandidates,
    formattedInjuries,
    marketSnapshot,
    advancedStats
  );

  // Build game summary
  const gameSummary = {
    gameId: `nhl-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'NHL',
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
    topCandidates: propCandidates.map(p => p.player).slice(0, 6),
    // Add goalie info to summary
    goalies: advancedStats?.goalie_matchup ? {
      home: advancedStats.goalie_matchup.home_starter,
      away: advancedStats.goalie_matchup.away_starter
    } : null
  };

  const advancedSource = advancedStats?._source || 'none';
  const richContextFound = richContext && Object.keys(richContext).length > 0;
  
  console.log(`[NHL Props Context] Built context with ${propCandidates.length} player candidates, ` +
    `${formattedInjuries.length} injuries, advanced stats: ${advancedSource}, rich context: ${richContextFound}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates,
    playerStats,
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
      advancedStatsSource: advancedSource,
      perplexityDataSources: advancedStats?.data_sources || [],
      keyFindings: richContext?.key_findings || advancedStats?.key_analytics_insights || []
    }
  };
}

export default {
  buildNhlPropsAgenticContext
};
