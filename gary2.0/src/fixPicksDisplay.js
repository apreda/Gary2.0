// This script fixes the format of the picks stored in localStorage
// to ensure they display properly on the cards

// Run this in the browser console to fix the current picks
function fixPicksDisplay() {
  // Get the current picks from localStorage
  const savedPicks = localStorage.getItem('dailyPicks');
  if (!savedPicks) {
    console.log('No picks found in localStorage');
    return;
  }

  // Parse the picks
  let picks = JSON.parse(savedPicks);
  console.log('Original picks:', picks);

  // Fix each pick object to ensure it has all required properties for display
  const fixedPicks = picks.map(pick => {
    // Ensure each pick has the required properties
    return {
      id: pick.id || `pick-${Math.random().toString(36).substr(2, 9)}`,
      league: pick.league || 'Unknown',
      game: pick.game || 'Unknown Game',
      betType: pick.betType || 'Unknown Bet',
      pick: pick.pick || pick.moneyline || pick.spread || pick.overUnder || 'Unknown Pick',
      moneyline: pick.moneyline || '',
      spread: pick.spread || '',
      overUnder: pick.overUnder || '',
      time: pick.time || 'Today',
      analysis: pick.analysis || pick.pickDetail || pick.garysAnalysis || 'Gary is analyzing this pick.',
      pickDetail: pick.pickDetail || pick.analysis || pick.garysAnalysis || 'Gary is analyzing this pick.',
      garysAnalysis: pick.garysAnalysis || pick.analysis || pick.pickDetail || 'Gary is analyzing this pick.',
      result: pick.result || 'pending',
      finalScore: pick.finalScore || '',
      confidenceLevel: pick.confidenceLevel || 75,
      primeTimeCard: pick.primeTimeCard || false,
      silverCard: pick.silverCard || false
    };
  });

  console.log('Fixed picks:', fixedPicks);

  // Save the fixed picks back to localStorage
  localStorage.setItem('dailyPicks', JSON.stringify(fixedPicks));
  console.log('Updated picks in localStorage. Refresh the page to see changes.');

  // Return true to indicate success
  return true;
}

// Execute the function
fixPicksDisplay();

// Log instructions for refreshing
console.log('Run this script, then refresh the page to see the picks display correctly.');
