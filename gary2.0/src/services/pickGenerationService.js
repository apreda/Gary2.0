const betAnalysisService = require('./betAnalysisService');

/**
 * Service for generating intelligent picks using AI and odds analysis
 */

/**
 * Generates an intelligent pick for a game using all available data
 * @param {Object} game - Game data from The Odds API
 * @param {Object} historicalData - Historical performance data
 * @returns {Object} - Generated pick with full analysis
 */
const generateIntelligentPick = async (game, historicalData) => {
  try {
    // 1. Analyze all betting markets
    const bestBettingOpportunity = betAnalysisService.analyzeBettingMarkets(game);
    
    // 2. Get historical matchup data
    const matchupStats = await analyzeHistoricalMatchup(game.home_team, game.away_team);
    
    // 3. Get current form data
    const homeForm = await analyzeTeamForm(game.home_team);
    const awayForm = await analyzeTeamForm(game.away_team);
    
    // 4. Consider injuries and team news
    const teamNews = await getTeamNews(game.home_team, game.away_team);
    
    // 5. Generate pick based on all data
    const pick = {
      gameId: game.id,
      sport: game.sport_key,
      league: getLeagueFromSport(game.sport_key),
      game: `${game.away_team} @ ${game.home_team}`,
      commence_time: game.commence_time,
      
      // Betting details from best opportunity
      betType: bestBettingOpportunity.type,
      odds: bestBettingOpportunity.odds,
      
      // Additional bet details based on type
      ...(bestBettingOpportunity.type === 'spread' && {
        spread: bestBettingOpportunity.point,
        team: bestBettingOpportunity.team
      }),
      ...(bestBettingOpportunity.type === 'total' && {
        total: bestBettingOpportunity.point,
        position: bestBettingOpportunity.position
      }),
      ...(bestBettingOpportunity.type === 'moneyline' && {
        team: bestBettingOpportunity.team
      }),
      
      // Analysis and rationale
      confidence: calculateConfidence(bestBettingOpportunity, matchupStats, homeForm, awayForm),
      analysis: generateAnalysis(bestBettingOpportunity, matchupStats, homeForm, awayForm, teamNews),
      
      // Format the short pick text
      shortPick: formatShortPick(bestBettingOpportunity)
    };
    
    return pick;
  } catch (error) {
    console.error('Error generating intelligent pick:', error);
    throw error;
  }
};

/**
 * Analyzes historical matchup data between two teams
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Object} - Historical matchup statistics
 */
const analyzeHistoricalMatchup = async (homeTeam, awayTeam) => {
  // Implementation would use SportsDB API to get historical data
  // For now, returning placeholder data
  return {
    homeWins: 0,
    awayWins: 0,
    averageScore: { home: 0, away: 0 },
    lastMeetings: []
  };
};

/**
 * Analyzes current form for a team
 * @param {string} team - Team name
 * @returns {Object} - Team form analysis
 */
const analyzeTeamForm = async (team) => {
  // Implementation would use SportsDB API to get recent performance
  // For now, returning placeholder data
  return {
    lastGames: [],
    winPercentage: 0,
    averageScore: 0,
    trends: []
  };
};

/**
 * Gets latest team news and injuries
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Object} - Team news and injury reports
 */
const getTeamNews = async (homeTeam, awayTeam) => {
  // Implementation would use news APIs or web scraping
  // For now, returning placeholder data
  return {
    home: { injuries: [], news: [] },
    away: { injuries: [], news: [] }
  };
};

/**
 * Calculates confidence level for a pick
 * @param {Object} opportunity - Betting opportunity
 * @param {Object} matchupStats - Historical matchup statistics
 * @param {Object} homeForm - Home team form
 * @param {Object} awayForm - Away team form
 * @returns {number} - Confidence level (0-1)
 */
const calculateConfidence = (opportunity, matchupStats, homeForm, awayForm) => {
  // Implementation would use machine learning model
  // For now, using a simplified calculation
  return 0.7; // Default confidence level
};

/**
 * Generates detailed analysis for a pick
 * @param {Object} opportunity - Betting opportunity
 * @param {Object} matchupStats - Historical matchup statistics
 * @param {Object} homeForm - Home team form
 * @param {Object} awayForm - Away team form
 * @param {Object} teamNews - Team news and injuries
 * @returns {string} - Detailed analysis
 */
const generateAnalysis = (opportunity, matchupStats, homeForm, awayForm, teamNews) => {
  // Implementation would use GPT to generate natural language analysis
  // For now, returning placeholder text
  return `Analysis based on current form, historical matchups, and betting value.`;
};

/**
 * Formats short pick text
 * @param {Object} opportunity - Betting opportunity
 * @returns {string} - Formatted short pick text
 */
const formatShortPick = (opportunity) => {
  switch (opportunity.type) {
    case 'spread':
      return `${opportunity.team} ${opportunity.point} ${opportunity.odds}`;
    case 'total':
      return `${opportunity.position} ${opportunity.point} ${opportunity.odds}`;
    case 'moneyline':
      return `${opportunity.team} ML ${opportunity.odds}`;
    default:
      return 'NO PICK';
  }
};

/**
 * Gets league name from sport key
 * @param {string} sportKey - Sport key from The Odds API
 * @returns {string} - League name
 */
const getLeagueFromSport = (sportKey) => {
  const sportMap = {
    'basketball_nba': 'NBA',
    'baseball_mlb': 'MLB',
    'icehockey_nhl': 'NHL'
  };
  return sportMap[sportKey] || sportKey.toUpperCase();
};

module.exports = {
  generateIntelligentPick
};
