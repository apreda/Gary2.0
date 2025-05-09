/**
 * Prop Picks Formatter Utility
 * Transforms raw prop picks JSON data for display in the UI
 */

/**
 * Formats raw prop picks data for display in the UI
 * @param {Array} rawPicks - The raw prop picks array from OpenAI
 * @returns {Array} Formatted prop picks ready for UI display
 */
export function formatPropPicksForDisplay(rawPicks) {
  if (!Array.isArray(rawPicks)) {
    console.warn('Expected an array of prop picks, got:', typeof rawPicks);
    return [];
  }
  
  return rawPicks.map(pick => {
    // Generate a deterministic ID based on player name and prop type
    const id = `${pick.player_name?.replace(/\s+/g, '-')}-${pick.prop_type?.replace(/\s+/g, '-')}`.toLowerCase();
    
    return {
      ...pick,
      id: id || crypto.randomUUID(), // Fallback to random ID if we can't create one from data
      display_odds: formatOdds(pick.odds),
      display_confidence: formatConfidence(pick.confidence),
      display_title: formatTitle(pick)
    };
  });
}

/**
 * Format odds for display (e.g., +120, -110)
 */
function formatOdds(odds) {
  if (typeof odds !== 'number') return odds;
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/**
 * Format confidence as percentage
 */
function formatConfidence(confidence) {
  if (typeof confidence !== 'number') return confidence;
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Format pick title for display
 */
function formatTitle(pick) {
  if (!pick.player_name || !pick.prop_type) {
    return 'Unknown Prop Pick';
  }
  
  return `${pick.player_name} - ${pick.prop_type} ${pick.pick_direction} ${pick.prop_line}`;
}
