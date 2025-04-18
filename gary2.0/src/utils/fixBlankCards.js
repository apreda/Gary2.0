/**
 * Utility to fix blank card issues in the carousel
 * 
 * This utility ensures cards properly display content and maintains the dark theme
 * throughout the application.
 */

/**
 * Ensures pick data is properly formatted with all required fields
 * @param {Object} pick - The pick object to validate and fix
 * @returns {Object} - Properly formatted pick object
 */
export function validatePickData(pick) {
  if (!pick) return null;
  
  // Log for debugging
  console.log('Validating pick data:', pick.id);
  
  // Create default values for any missing fields
  return {
    id: pick.id || `pick-${Date.now()}`,
    game: pick.game || 'Game information unavailable',
    league: pick.league || 'SPORT',
    pickTeam: pick.pickTeam || 'Team Pick',
    betType: pick.betType || 'Moneyline',
    shortPick: pick.shortPick || 'Pick details unavailable',
    confidenceLevel: pick.confidenceLevel || 75,
    analysis: pick.analysis || "Gary's analysis will appear here when you flip the card...",
    garysBullets: pick.garysBullets || [],
    time: pick.time || 'Today',
    ...(pick || {}) // Include any other properties from the original pick
  };
}

/**
 * Ensures card content is properly rendered by checking DOM elements
 * Call this function after rendering cards
 */
export function ensureCardContentRendered() {
  setTimeout(() => {
    // Find all card front elements
    const cardFronts = document.querySelectorAll('.card-front');
    
    cardFronts.forEach(card => {
      // Check if any content is visible inside the card
      const hasVisibleContent = card.innerText.trim().length > 0;
      
      // If no visible content, add a fallback message
      if (!hasVisibleContent) {
        console.warn('Empty card detected, adding fallback content');
        card.innerHTML = `
          <div class="p-5 text-center">
            <h3 class="text-xl font-bold text-[#d4af37] mb-3">Gary's Pick</h3>
            <p class="text-white mb-4">Pick data is loading...</p>
            <div class="border-t border-[#d4af37]/30 pt-3 mb-3"></div>
            <button class="bg-[#d4af37] text-black font-bold py-2 px-6 rounded-full">
              View Analysis
            </button>
          </div>
        `;
      }
      
      // Ensure the card has the proper background color
      card.style.backgroundColor = '#111111';
    });
    
    // Fix card backgrounds
    const cardElements = document.querySelectorAll('.pick-card, .card-container, .card-inner');
    cardElements.forEach(card => {
      card.style.backgroundColor = '#111111';
    });
  }, 200); // Small delay to ensure DOM is loaded
}

export default {
  validatePickData,
  ensureCardContentRendered
};
