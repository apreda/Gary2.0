import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { makeGaryPick } from './garyEngine.js';
import { processGameOnce } from './picksService.js'; // Import shared helper

export async function generateNBAPicks() {
  console.log('Processing NBA games');
  const games = await oddsService.getUpcomingGames('basketball_nba');
  console.log(`Found ${games.length} NBA games from odds service`);
  
  // Get today's date in EST time zone format (YYYY-MM-DD)
  const today = new Date();
  const estOptions = { timeZone: 'America/New_York' };
  const estDateString = today.toLocaleDateString('en-US', estOptions);
  const [month, day, year] = estDateString.split('/');
  const estFormattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  
  console.log(`NBA filtering: Today in EST is ${estFormattedDate}`);
  
  // Be more flexible with date filtering - include games within next 24 hours
  const nowTime = today.getTime();
  const twentyFourHoursLater = nowTime + (24 * 60 * 60 * 1000);
  
  const todayGames = games.filter(game => {
    const gameTime = new Date(game.commence_time).getTime();
    const isWithin24Hours = gameTime >= nowTime && gameTime <= twentyFourHoursLater;
    
    // Also check if it's today or tomorrow in EST
    const gameDate = new Date(game.commence_time);
    const gameDateInEST = gameDate.toLocaleDateString('en-US', estOptions);
    const [gameMonth, gameDay, gameYear] = gameDateInEST.split('/');
    const gameFormattedDate = `${gameYear}-${gameMonth.padStart(2, '0')}-${gameDay.padStart(2, '0')}`;
    
    // Include games from today and tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toLocaleDateString('en-US', estOptions);
    const [tomorrowMonth, tomorrowDay, tomorrowYear] = tomorrowString.split('/');
    const tomorrowFormattedDate = `${tomorrowYear}-${tomorrowMonth.padStart(2, '0')}-${tomorrowDay.padStart(2, '0')}`;
    
    const isTodayOrTomorrow = gameFormattedDate === estFormattedDate || gameFormattedDate === tomorrowFormattedDate;
    const includeGame = isWithin24Hours || isTodayOrTomorrow;
    
    console.log(`NBA Game: ${game.away_team} @ ${game.home_team}, Date: ${gameFormattedDate}, Time: ${new Date(game.commence_time).toLocaleString('en-US', estOptions)}, Include: ${includeGame}`);
    
    return includeGame;
  });

  console.log(`After date filtering: ${todayGames.length} NBA games within next 24 hours or today/tomorrow`);

  const sportPicks = [];
  for (const game of todayGames) {
    const gameId = `nba-${game.id}`;

    const result = await processGameOnce(gameId, async () => {
      console.log(`🔄 PICK GENERATION STARTED: ${new Date().toISOString()}`);
      console.trace('Pick generation call stack');
      
      console.log(`Processing NBA game: ${game.away_team} @ ${game.home_team}`);
      
      // Get team objects first for all subsequent operations
      const nbaTeams = await cachedApiCall(
        'nba-teams', 
        () => ballDontLieService.getNbaTeams()
      );
        const homeTeam = nbaTeams.find(t => 
          t.full_name.toLowerCase().includes(game.home_team.toLowerCase()) ||
          game.home_team.toLowerCase().includes(t.full_name.toLowerCase())
        );
        const awayTeam = nbaTeams.find(t => 
          t.full_name.toLowerCase().includes(game.away_team.toLowerCase()) ||
          game.away_team.toLowerCase().includes(t.full_name.toLowerCase())
        );
        
      // Use Ball Don't Lie API for NBA team stats with caching
      let homeTeamStats = null;
      let awayTeamStats = null;
      
      try {
        if (homeTeam) {
          homeTeamStats = {
            name: homeTeam.full_name,
            abbreviation: homeTeam.abbreviation,
            conference: homeTeam.conference,
            division: homeTeam.division
          };
        }
        
        if (awayTeam) {
          awayTeamStats = {
            name: awayTeam.full_name,
            abbreviation: awayTeam.abbreviation,
            conference: awayTeam.conference,
            division: awayTeam.division
          };
        }
      } catch (statsError) {
        console.log(`Could not get NBA team info: ${statsError.message}`);
      }
      
      // Get comprehensive NBA playoff stats and series information
      // For 2025 playoffs, we need to use 2024 as the season parameter
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const playoffSeason = currentMonth <= 6 ? currentYear - 1 : currentYear; // 2024 for 2025 playoffs
      
      console.log(`🏀 Using season ${playoffSeason} for ${currentYear} playoffs (month: ${currentMonth})`);
      
      // Get team IDs for comprehensive stats
      const teamIds = [];
      if (homeTeam) teamIds.push(homeTeam.id);
      if (awayTeam) teamIds.push(awayTeam.id);
      
      const [playoffStatsReport, playoffPlayerStats, seriesData, teamStats] = await Promise.all([
        ballDontLieService.generateNbaPlayoffReport(
          playoffSeason,
          game.home_team, 
          game.away_team
        ),
        ballDontLieService.getNbaPlayoffPlayerStats(
        game.home_team, 
        game.away_team, 
          playoffSeason
        ),
        ballDontLieService.getNbaPlayoffSeries(
          playoffSeason,
          game.home_team,
          game.away_team
        ),
        // Add comprehensive team stats
        teamIds.length > 0 ? ballDontLieService.getNBATeamStats(teamIds, playoffSeason) : Promise.resolve([])
      ]);
      
      // Build series context with game number
      let seriesContext = '\n## CURRENT SERIES STATUS:\n\n';
      if (seriesData.seriesFound) {
        const completedGames = seriesData.games.filter(g => g.status === 'Final').length;
        const upcomingGameNumber = completedGames + 1;
        
        seriesContext += `**SERIES**: ${seriesData.teamA.name} vs ${seriesData.teamB.name}\n`;
        seriesContext += `**CURRENT RECORD**: ${seriesData.seriesStatus}\n`;
        seriesContext += `**UPCOMING GAME**: Game ${upcomingGameNumber} of the series\n`;
        seriesContext += `**GAMES PLAYED**: ${completedGames} games completed\n`;
        
        // Add momentum and recent game context
        if (completedGames > 0) {
          const lastGame = seriesData.games
            .filter(g => g.status === 'Final')
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          
          if (lastGame) {
            const lastWinner = lastGame.home_team_score > lastGame.visitor_team_score 
              ? lastGame.home_team.name 
              : lastGame.visitor_team.name;
            seriesContext += `**LAST GAME WINNER**: ${lastWinner} (${lastGame.home_team.name} ${lastGame.home_team_score} - ${lastGame.visitor_team_score} ${lastGame.visitor_team.name})\n`;
          }
        }
        
        // Add series pressure context
        if (seriesData.teamAWins === 3 || seriesData.teamBWins === 3) {
          const teamWithAdvantage = seriesData.teamAWins === 3 ? seriesData.teamA.name : seriesData.teamB.name;
          const teamFacingElimination = seriesData.teamAWins === 3 ? seriesData.teamB.name : seriesData.teamA.name;
          seriesContext += `**ELIMINATION GAME**: ${teamWithAdvantage} can close out the series. ${teamFacingElimination} facing elimination.\n`;
        } else if (upcomingGameNumber === 7) {
          seriesContext += `**GAME 7**: Winner-take-all elimination game!\n`;
        }
        
        seriesContext += '\n';
      } else {
        seriesContext += `No existing series data found between ${game.home_team} and ${game.away_team}. This may be the start of a new series.\n\n`;
      }
      
      // Build detailed player stats report
      let playerStatsReport = '\n## DETAILED PLAYOFF PLAYER STATS:\n\n';
      
      if (playoffPlayerStats.home.length > 0) {
        playerStatsReport += `### ${game.home_team} Key Playoff Performers:\n`;
        playoffPlayerStats.home.slice(0, 5).forEach(player => {
          playerStatsReport += `- **${player.player.first_name} ${player.player.last_name}**: ${player.avgPts} PPG, ${player.avgReb} RPG, ${player.avgAst} APG\n`;
          playerStatsReport += `  📊 Shooting: ${player.fgPct}% FG, ${player.fg3Pct}% 3PT, ${player.ftPct}% FT, ${player.trueShooting}% TS\n`;
          playerStatsReport += `  ⚡ Impact: ${player.avgPlusMinus} +/-, ${player.per} PER, ${player.usageRate}% USG\n`;
          playerStatsReport += `  🛡️ Defense: ${player.avgStl} STL, ${player.avgBlk} BLK, ${player.avgPf} PF\n`;
          playerStatsReport += `  🎯 Efficiency: ${player.astToTov} AST/TOV, ${player.effectiveFgPct}% eFG (${player.games} games)\n\n`;
        });
      }
      
      if (playoffPlayerStats.away.length > 0) {
        playerStatsReport += `### ${game.away_team} Key Playoff Performers:\n`;
        playoffPlayerStats.away.slice(0, 5).forEach(player => {
          playerStatsReport += `- **${player.player.first_name} ${player.player.last_name}**: ${player.avgPts} PPG, ${player.avgReb} RPG, ${player.avgAst} APG\n`;
          playerStatsReport += `  📊 Shooting: ${player.fgPct}% FG, ${player.fg3Pct}% 3PT, ${player.ftPct}% FT, ${player.trueShooting}% TS\n`;
          playerStatsReport += `  ⚡ Impact: ${player.avgPlusMinus} +/-, ${player.per} PER, ${player.usageRate}% USG\n`;
          playerStatsReport += `  🛡️ Defense: ${player.avgStl} STL, ${player.avgBlk} BLK, ${player.avgPf} PF\n`;
          playerStatsReport += `  🎯 Efficiency: ${player.astToTov} AST/TOV, ${player.effectiveFgPct}% eFG (${player.games} games)\n\n`;
        });
      }
      
      // Add comprehensive team comparison based on playoff stats
      if (playoffPlayerStats.home.length > 0 && playoffPlayerStats.away.length > 0) {
        const homeTop5 = playoffPlayerStats.home.slice(0, 5);
        const awayTop5 = playoffPlayerStats.away.slice(0, 5);
        
        // Calculate team averages for top 5 players
        const homeAvgPts = homeTop5.reduce((sum, p) => sum + parseFloat(p.avgPts), 0) / homeTop5.length;
        const awayAvgPts = awayTop5.reduce((sum, p) => sum + parseFloat(p.avgPts), 0) / awayTop5.length;
        const homeAvgPlusMinus = homeTop5.reduce((sum, p) => sum + parseFloat(p.avgPlusMinus), 0) / homeTop5.length;
        const awayAvgPlusMinus = awayTop5.reduce((sum, p) => sum + parseFloat(p.avgPlusMinus), 0) / awayTop5.length;
        const homeAvgTS = homeTop5.reduce((sum, p) => sum + parseFloat(p.trueShooting), 0) / homeTop5.length;
        const awayAvgTS = awayTop5.reduce((sum, p) => sum + parseFloat(p.trueShooting), 0) / awayTop5.length;
        const homeAvgPER = homeTop5.reduce((sum, p) => sum + parseFloat(p.per), 0) / homeTop5.length;
        const awayAvgPER = awayTop5.reduce((sum, p) => sum + parseFloat(p.per), 0) / awayTop5.length;
        const homeAvgUsage = homeTop5.reduce((sum, p) => sum + parseFloat(p.usageRate), 0) / homeTop5.length;
        const awayAvgUsage = awayTop5.reduce((sum, p) => sum + parseFloat(p.usageRate), 0) / awayTop5.length;
        
        playerStatsReport += `### 🔥 PLAYOFF TEAM COMPARISON (Top 5 Players):\n`;
        playerStatsReport += `**Scoring Power**: ${game.home_team} ${homeAvgPts.toFixed(1)} PPG vs ${game.away_team} ${awayAvgPts.toFixed(1)} PPG\n`;
        playerStatsReport += `**Impact (Plus/Minus)**: ${game.home_team} ${homeAvgPlusMinus.toFixed(1)} vs ${game.away_team} ${awayAvgPlusMinus.toFixed(1)} ⭐\n`;
        playerStatsReport += `**Shooting Efficiency (TS%)**: ${game.home_team} ${homeAvgTS.toFixed(1)}% vs ${game.away_team} ${awayAvgTS.toFixed(1)}%\n`;
        playerStatsReport += `**Overall Efficiency (PER)**: ${game.home_team} ${homeAvgPER.toFixed(1)} vs ${game.away_team} ${awayAvgPER.toFixed(1)}\n`;
        playerStatsReport += `**Usage Rate**: ${game.home_team} ${homeAvgUsage.toFixed(1)}% vs ${game.away_team} ${awayAvgUsage.toFixed(1)}%\n\n`;
        
        // Add momentum indicators
        const homeMomentum = homeAvgPlusMinus > awayAvgPlusMinus ? '📈 MOMENTUM' : '📉 STRUGGLING';
        const awayMomentum = awayAvgPlusMinus > homeAvgPlusMinus ? '📈 MOMENTUM' : '📉 STRUGGLING';
        playerStatsReport += `**Playoff Momentum**: ${game.home_team} ${homeMomentum} | ${game.away_team} ${awayMomentum}\n\n`;
      }
      
      // Add team stats report
      let teamStatsReport = '\n## TEAM STATISTICS:\n\n';
      const hasTeamStats = teamStats && teamStats.length > 0;
      
      if (hasTeamStats) {
        // Use the team objects that were found earlier in the NBA processing section
        const homeTeamStat = teamStats.find(ts => homeTeam && ts.teamId === homeTeam.id);
        const awayTeamStat = teamStats.find(ts => awayTeam && ts.teamId === awayTeam.id);
        
        if (homeTeamStat) {
          teamStatsReport += `### ${game.home_team} Team Stats (${homeTeamStat.season} Season):\n`;
          teamStatsReport += `- **Record**: ${homeTeamStat.stats.wins}-${homeTeamStat.stats.losses}\n`;
          teamStatsReport += `- **Offense**: ${homeTeamStat.stats.pointsPerGame.toFixed(1)} PPG, ${(homeTeamStat.stats.fieldGoalPct * 100).toFixed(1)}% FG, ${(homeTeamStat.stats.threePointPct * 100).toFixed(1)}% 3PT\n`;
          teamStatsReport += `- **Playmaking**: ${homeTeamStat.stats.assistsPerGame.toFixed(1)} APG, ${homeTeamStat.stats.turnoversPerGame.toFixed(1)} TOV\n`;
          teamStatsReport += `- **Defense**: ${homeTeamStat.stats.pointsAllowedPerGame.toFixed(1)} PAPG, ${homeTeamStat.stats.stealsPerGame.toFixed(1)} SPG, ${homeTeamStat.stats.blocksPerGame.toFixed(1)} BPG\n`;
          teamStatsReport += `- **Rebounding**: ${homeTeamStat.stats.reboundsPerGame.toFixed(1)} RPG\n\n`;
        }
        
        if (awayTeamStat) {
          teamStatsReport += `### ${game.away_team} Team Stats (${awayTeamStat.season} Season):\n`;
          teamStatsReport += `- **Record**: ${awayTeamStat.stats.wins}-${awayTeamStat.stats.losses}\n`;
          teamStatsReport += `- **Offense**: ${awayTeamStat.stats.pointsPerGame.toFixed(1)} PPG, ${(awayTeamStat.stats.fieldGoalPct * 100).toFixed(1)}% FG, ${(awayTeamStat.stats.threePointPct * 100).toFixed(1)}% 3PT\n`;
          teamStatsReport += `- **Playmaking**: ${awayTeamStat.stats.assistsPerGame.toFixed(1)} APG, ${awayTeamStat.stats.turnoversPerGame.toFixed(1)} TOV\n`;
          teamStatsReport += `- **Defense**: ${awayTeamStat.stats.pointsAllowedPerGame.toFixed(1)} PAPG, ${awayTeamStat.stats.stealsPerGame.toFixed(1)} SPG, ${awayTeamStat.stats.blocksPerGame.toFixed(1)} BPG\n`;
          teamStatsReport += `- **Rebounding**: ${awayTeamStat.stats.reboundsPerGame.toFixed(1)} RPG\n\n`;
        }
        
        // Add team comparison if both teams have stats
        if (homeTeamStat && awayTeamStat) {
          teamStatsReport += `### 🔥 TEAM COMPARISON:\n`;
          teamStatsReport += `**Offensive Power**: ${game.home_team} ${homeTeamStat.stats.pointsPerGame.toFixed(1)} PPG vs ${game.away_team} ${awayTeamStat.stats.pointsPerGame.toFixed(1)} PPG\n`;
          teamStatsReport += `**Defensive Strength**: ${game.home_team} ${homeTeamStat.stats.pointsAllowedPerGame.toFixed(1)} PAPG vs ${game.away_team} ${awayTeamStat.stats.pointsAllowedPerGame.toFixed(1)} PAPG\n`;
          teamStatsReport += `**Shooting Efficiency**: ${game.home_team} ${(homeTeamStat.stats.fieldGoalPct * 100).toFixed(1)}% vs ${game.away_team} ${(awayTeamStat.stats.fieldGoalPct * 100).toFixed(1)}%\n`;
          teamStatsReport += `**Ball Movement**: ${game.home_team} ${homeTeamStat.stats.assistsPerGame.toFixed(1)} APG vs ${game.away_team} ${awayTeamStat.stats.assistsPerGame.toFixed(1)} APG\n\n`;
        }
        
        console.log(`✅ Team Stats Available: true (${teamStats.length} teams)`);
      } else {
        teamStatsReport += `No comprehensive team statistics available for this matchup.\n\n`;
        console.log(`❌ Team Stats Available: false`);
      }
      
      // PLAYOFFS ONLY - No regular season stats
      const nbaStatsReport = seriesContext + playoffStatsReport + playerStatsReport + teamStatsReport;

      // Format odds data for OpenAI
      let oddsData = null;
      if (game.bookmakers && game.bookmakers.length > 0) {
        const bookmaker = game.bookmakers[0];
        oddsData = {
          bookmaker: bookmaker.title,
          markets: bookmaker.markets
        };
        console.log(`Odds data available for ${game.home_team} vs ${game.away_team}:`, JSON.stringify(oddsData, null, 2));
      } else {
        console.log(`No odds data available for ${game.home_team} vs ${game.away_team}`);
      }

      const gameObj = {
        id: gameId,
        sport: 'nba',
        league: 'NBA',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homeTeamStats,
        awayTeamStats,
        statsReport: nbaStatsReport,
        playoffPlayerStats, // Add detailed playoff player stats
        seriesData, // Add complete series information
        isPlayoffGame: true, // Mark this as a playoff game
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      console.log(`Making Gary pick for NBA game: ${game.away_team} @ ${game.home_team}`);
      const result = await makeGaryPick(gameObj);
      
      if (result.success) {
        console.log(`Successfully generated NBA pick: ${result.rawAnalysis?.rawOpenAIOutput?.pick || 'Unknown pick'}`);
        // Return the formatted pick data instead of adding to sportPicks here
        return {
          ...result,
          game: `${game.away_team} @ ${game.home_team}`,
          sport: 'basketball_nba',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          gameTime: game.commence_time,
          pickType: 'normal',
          timestamp: new Date().toISOString()
        };
      } else {
        console.log(`Failed to generate NBA pick for ${game.away_team} @ ${game.home_team}:`, result.error);
        return null;
      }
    });
    
    // Only add successful results to sportPicks (avoiding duplication)
    if (result && result.success) {
      sportPicks.push(result);
    }
  }
  
  console.log(`Total NBA picks generated: ${sportPicks.length}`);
  return sportPicks;
} 