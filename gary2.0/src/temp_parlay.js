/**
 * Generate a daily parlay using existing picks
 * @param {Array} picks - Array of individual picks
 * @returns {Promise<Object>} - Parlay pick object
 */
export const generateParlay = async (picks) => {
  try {
    // Filter out any parlay picks from the input
    const regularPicks = picks.filter(pick => pick.league !== 'PARLAY');
    
    // Select top 3 picks for the parlay based on confidence level
    const topPicks = [...regularPicks]
      .sort((a, b) => b.confidenceLevel - a.confidenceLevel)
      .slice(0, 3);
    
    // If we don't have enough picks, use placeholder data
    const parlayLegs = topPicks.length >= 3 ? topPicks.map(pick => ({
      game: pick.game,
      pick: pick.betType.includes('Spread') ? pick.spread :
            pick.betType.includes('Over/Under') ? pick.overUnder :
            pick.moneyline,
      league: pick.league,
      betType: pick.betType.split(':')[0].trim()
    })) : [
      {
        game: "Lakers vs Warriors",
        pick: "Warriors -4.5",
        league: "NBA",
        betType: "Spread"
      },
      {
        game: "Yankees vs Red Sox",
        pick: "Over 8.5",
        league: "MLB",
        betType: "Total"
      },
      {
        game: "Chiefs vs Eagles",
        pick: "Chiefs -3",
        league: "NFL",
        betType: "Spread"
      }
    ];
    
    return {
      id: 4, // This will be overwritten by the caller
      league: 'PARLAY',
      game: 'Parlay of the Day',
      moneyline: '',
      spread: '',
      overUnder: '',
      time: 'All Day',
      pickDetail: '', // Removing Gary's Analysis from the front of card as requested
      confidenceLevel: 75,
      isPremium: true,
      betType: '3-Leg Parlay',
      parlayOdds: '+850',
      potentialPayout: '$950',
      parlayLegs: parlayLegs,
      img: null
    };
  } catch (error) {
    console.error('Error generating parlay:', error);
    return null;
  }
}
