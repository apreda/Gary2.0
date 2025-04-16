// Script to force refresh picks by clearing localStorage cache
// Run this from the browser's console when on the Real Gary Picks page

function forceRefreshPicks() {
  console.log('🐻 Gary the Bear: Forcing picks refresh...');
  
  // Clear localStorage items related to picks generation
  localStorage.removeItem('lastPicksGenerationTime');
  localStorage.removeItem('dailyPicks');
  
  console.log('🐻 Gary the Bear: localStorage cache cleared');
  console.log('🐻 Gary the Bear: Reloading page to generate new picks...');
  
  // Reload the page to trigger new picks generation
  window.location.reload();
}

// Execute the function
forceRefreshPicks();
