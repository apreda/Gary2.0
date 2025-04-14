// Copy and paste the following in the browser console to fix the issues

// Create a detailed parlay with legs
function createDetailedParlay() {
  return {
    id: 4,
    league: "PARLAY",
    game: "Parlay of the Day",
    moneyline: "",
    spread: "",
    overUnder: "",
    time: "All Day",
    pickDetail: "This 3-leg parlay combines my highest conviction plays into one premium package. LEG 1: Lakers vs Warriors - Warriors -4.5 - They've dominated this matchup historically. LEG 2: Yankees vs Red Sox - Over 8.5 - Their offense is peaking at the right time. LEG 3: Chiefs vs Eagles - Chiefs -3 - Key injuries on the other side. At +850 odds, a $100 bet returns $950 if all three hit. THIS IS THE PLAY.",
    confidenceLevel: 75,
    isPremium: true,
    betType: "3-Leg Parlay",
    parlayOdds: "+850",
    potentialPayout: "$950",
    parlayLegs: [
      {
        game: "Lakers vs Warriors",
        pick: "Warriors -4.5",
        league: "NBA",
        betType: "Spread Pick",
        reason: "They've dominated this matchup historically",
        confidence: 85
      },
      {
        game: "Yankees vs Red Sox",
        pick: "Over 8.5",
        league: "MLB",
        betType: "Total: Over/Under",
        reason: "Their offense is peaking at the right time",
        confidence: 82
      },
      {
        game: "Chiefs vs Eagles",
        pick: "Chiefs -3",
        league: "NFL",
        betType: "Spread Pick",
        reason: "Key injuries on the other side",
        confidence: 90
      }
    ]
  };
}

// Get existing picks
const existingPicks = JSON.parse(localStorage.getItem('dailyPicks') || '[]');

// Find and replace the parlay, and ensure premium status is set correctly
const newPicks = existingPicks.map(pick => {
  if (pick.league === 'PARLAY') {
    return createDetailedParlay();
  }
  // Make sure all picks except the first one are premium
  return {
    ...pick,
    isPremium: pick.id !== 1 // Only the first pick (id=1) is free
  };
});

// Save back to localStorage
localStorage.setItem('dailyPicks', JSON.stringify(newPicks));

// Add CSS to correctly display parlay legs
const style = document.createElement('style');
style.textContent = `
  .parlay-legs {
    margin-top: 10px;
    text-align: left;
  }
  .parlay-leg {
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(212, 175, 55, 0.5);
    padding-bottom: 5px;
  }
  .parlay-leg-header {
    font-weight: bold;
    color: #d4af37;
  }
  .parlay-leg-game, .parlay-leg-pick {
    margin-top: 2px;
  }
  .parlay-leg-reason {
    font-style: italic;
    opacity: 0.8;
    margin-top: 2px;
  }
  .parlay-potential-payout {
    margin-top: 10px;
    font-weight: bold;
    color: #d4af37;
  }
`;
document.head.appendChild(style);

// Notify the RealGaryPicks component to refresh from localStorage
const event = new Event('storage');
event.key = 'dailyPicks';
event.newValue = localStorage.getItem('dailyPicks');
window.dispatchEvent(event);

console.log('Changes made! Refresh the page to see them take effect.');
