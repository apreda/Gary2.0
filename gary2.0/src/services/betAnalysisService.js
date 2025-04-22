/**
 * Service for analyzing betting opportunities across different markets
 */

/**
 * Analyzes all available betting markets for a game and returns the best opportunity
 * @param {Object} game - Game data from The Odds API
 * @returns {Object} - Best betting opportunity with type, odds, and confidence
 */
const analyzeBettingMarkets = (game) => {
  const markets = {
    spreads: analyzeSpreadMarket(game.bookmakers),
    totals: analyzeTotalsMarket(game.bookmakers),
    moneyline: analyzeMoneylineMarket(game.bookmakers)
  };

  // Compare opportunities across markets
  return findBestOpportunity(markets);
};

/**
 * Analyzes spread betting market
 * @param {Array} bookmakers - Array of bookmaker data
 * @returns {Object} - Best spread betting opportunity
 */
const analyzeSpreadMarket = (bookmakers) => {
  const opportunities = [];

  bookmakers.forEach(bookmaker => {
    const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
    if (!spreadMarket) return;

    spreadMarket.outcomes.forEach(outcome => {
      opportunities.push({
        type: 'spread',
        team: outcome.name,
        point: outcome.point,
        odds: outcome.price,
        bookmaker: bookmaker.key
      });
    });
  });

  return findBestInMarket(opportunities, 'spread');
};

/**
 * Analyzes totals (over/under) betting market
 * @param {Array} bookmakers - Array of bookmaker data
 * @returns {Object} - Best totals betting opportunity
 */
const analyzeTotalsMarket = (bookmakers) => {
  const opportunities = [];

  bookmakers.forEach(bookmaker => {
    const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
    if (!totalsMarket) return;

    totalsMarket.outcomes.forEach(outcome => {
      opportunities.push({
        type: 'total',
        position: outcome.name, // 'Over' or 'Under'
        point: outcome.point,
        odds: outcome.price,
        bookmaker: bookmaker.key
      });
    });
  });

  return findBestInMarket(opportunities, 'total');
};

/**
 * Analyzes moneyline betting market
 * @param {Array} bookmakers - Array of bookmaker data
 * @returns {Object} - Best moneyline betting opportunity
 */
const analyzeMoneylineMarket = (bookmakers) => {
  const opportunities = [];

  bookmakers.forEach(bookmaker => {
    const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
    if (!h2hMarket) return;

    h2hMarket.outcomes.forEach(outcome => {
      opportunities.push({
        type: 'moneyline',
        team: outcome.name,
        odds: outcome.price,
        bookmaker: bookmaker.key
      });
    });
  });

  return findBestInMarket(opportunities, 'moneyline');
};

/**
 * Finds the best opportunity within a specific market
 * @param {Array} opportunities - Array of betting opportunities
 * @param {string} marketType - Type of market (spread, total, moneyline)
 * @returns {Object} - Best opportunity in the market
 */
const findBestInMarket = (opportunities, marketType) => {
  if (opportunities.length === 0) return null;

  // Calculate expected value and ROI for each opportunity
  const withMetrics = opportunities.map(opp => ({
    ...opp,
    ev: calculateExpectedValue(opp),
    roi: calculateROI(opp)
  }));

  // Sort by ROI and expected value
  return withMetrics.sort((a, b) => (b.roi + b.ev) - (a.roi + a.ev))[0];
};

/**
 * Finds the best opportunity across all markets
 * @param {Object} markets - Object containing analyzed markets
 * @returns {Object} - Best overall betting opportunity
 */
const findBestOpportunity = (markets) => {
  const opportunities = Object.values(markets).filter(Boolean);
  if (opportunities.length === 0) return null;

  // Compare metrics across markets
  return opportunities.sort((a, b) => {
    const aScore = a.ev * 0.6 + a.roi * 0.4;
    const bScore = b.ev * 0.6 + b.roi * 0.4;
    return bScore - aScore;
  })[0];
};

/**
 * Calculates expected value for a betting opportunity
 * @param {Object} opportunity - Betting opportunity
 * @returns {number} - Expected value
 */
const calculateExpectedValue = (opportunity) => {
  // Implementation would use historical data and current form
  // For now, using a simplified calculation
  const impliedProb = opportunity.odds > 0 
    ? 100 / (opportunity.odds + 100)
    : -opportunity.odds / (-opportunity.odds + 100);
  
  // Add edge based on market inefficiencies
  const edge = 0.02; // 2% edge assumption
  return (1 + edge) * impliedProb;
};

/**
 * Calculates ROI for a betting opportunity
 * @param {Object} opportunity - Betting opportunity
 * @returns {number} - Expected ROI
 */
const calculateROI = (opportunity) => {
  const impliedProb = opportunity.odds > 0 
    ? 100 / (opportunity.odds + 100)
    : -opportunity.odds / (-opportunity.odds + 100);
  
  return (1 / impliedProb) - 1;
};

module.exports = {
  analyzeBettingMarkets,
  analyzeSpreadMarket,
  analyzeTotalsMarket,
  analyzeMoneylineMarket
};
