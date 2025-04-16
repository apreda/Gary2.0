// Script to clear localStorage cached picks
(function() {
  console.log('Clearing localStorage cache for picks...');
  
  // Clear all picks-related localStorage items
  localStorage.removeItem('lastPicksGenerationTime');
  localStorage.removeItem('dailyPicks');
  localStorage.removeItem('lastPicksGeneration');
  
  // Confirmation
  console.log('Cache cleared successfully!');
  console.log('New picks will be generated at the next scheduled time (12:22 PM)');
})();
