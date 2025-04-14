// Copy and paste the following in the browser console to fix the remaining issues

// Create a simplified parlay with cleaner format
function createSimplifiedParlay() {
  return {
    id: 4,
    league: "PARLAY",
    game: "Parlay of the Day",
    moneyline: "",
    spread: "",
    overUnder: "",
    time: "All Day",
    pickDetail: "", // Removing Gary's Analysis from the front of card
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
        betType: "Spread",
        reason: "",
        confidence: 85
      },
      {
        game: "Yankees vs Red Sox",
        pick: "Over 8.5",
        league: "MLB",
        betType: "Total",
        reason: "",
        confidence: 82
      },
      {
        game: "Chiefs vs Eagles",
        pick: "Chiefs -3",
        league: "NFL",
        betType: "Spread",
        reason: "",
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
    return createSimplifiedParlay();
  }
  // Make sure all picks except the first one are premium
  return {
    ...pick,
    isPremium: pick.id !== 1 // Only the first pick (id=1) is free
  };
});

// Save back to localStorage
localStorage.setItem('dailyPicks', JSON.stringify(newPicks));

// Fix the premium access control by modifying the component directly
function fixPremiumAccess() {
  // Find all pick cards
  const pickCards = document.querySelectorAll('.pick-card');
  
  // Only show the first card to free users
  const userPlan = localStorage.getItem('userPlan') || 'free';
  
  if (userPlan === 'free') {
    pickCards.forEach((card, index) => {
      // First card is free, others should be locked for free users
      if (index !== 0) {
        // Create or ensure premium overlay exists
        let overlay = card.querySelector('.premium-lock-overlay');
        
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'premium-lock-overlay';
          overlay.innerHTML = `
            <div class="premium-badge">Premium</div>
            <h3 class="premium-lock-title">Unlock Gary's Premium Pick</h3>
            <p class="premium-lock-desc">Gain access to all of Gary's premium picks with a Pro subscription.</p>
            <a href="/pricing">
              <button class="btn-upgrade">Upgrade Now</button>
            </a>
          `;
          card.appendChild(overlay);
        }
        
        // Make sure overlay is visible
        overlay.style.display = 'flex';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
        overlay.style.color = 'white';
        overlay.style.zIndex = '999';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.textAlign = 'center';
        overlay.style.padding = '20px';
      }
    });
  }
}

// Add CSS to simplify parlay display
const style = document.createElement('style');
style.textContent = `
  .parlay-legs {
    margin-top: 10px;
    text-align: left;
  }
  .parlay-leg {
    margin-bottom: 8px;
    padding-bottom: 5px;
    border-bottom: 1px solid rgba(212, 175, 55, 0.3);
  }
  .parlay-leg-header {
    display: none;
  }
  .parlay-leg-reason {
    display: none;
  }
  .parlay-leg-game, .parlay-leg-pick {
    margin-top: 2px;
  }
  .parlay-potential-payout {
    margin-top: 10px;
    font-weight: bold;
    color: #d4af37;
  }
  .parlay-title {
    font-size: 18px;
    font-weight: bold;
    color: #d4af37;
    margin-bottom: 10px;
  }
`;
document.head.appendChild(style);

// Apply premium fix immediately and when content changes
fixPremiumAccess();
setInterval(fixPremiumAccess, 1000); // Keep checking and fixing

// Notify the RealGaryPicks component to refresh from localStorage
const event = new Event('storage');
event.key = 'dailyPicks';
event.newValue = localStorage.getItem('dailyPicks');
window.dispatchEvent(event);

console.log('All changes made! Refresh the page to see them take effect.');
