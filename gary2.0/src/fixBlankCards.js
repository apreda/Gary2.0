// This script will fix the blank cards issue by forcing a complete refresh

// Execute in browser console
function fixBlankCards() {
  console.log("Starting fix for blank cards...");
  
  // 1. Clear any error state that might be preventing rendering
  localStorage.removeItem('picksLoadError');
  
  // 2. Force picks generation by setting last generation time to yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  localStorage.setItem('lastPicksGenerationTime', yesterday.toISOString());
  
  // 3. Check if there are any picks in localStorage currently
  const currentPicks = localStorage.getItem('dailyPicks');
  if (currentPicks) {
    console.log("Found existing picks, will preserve them");
    
    try {
      // Parse and normalize existing picks
      const parsedPicks = JSON.parse(currentPicks);
      console.log("Original picks count:", parsedPicks.length);
      
      // Remove any malformed picks that might be causing issues
      const validPicks = parsedPicks.filter(pick => 
        pick && pick.id && pick.league && pick.game && pick.betType
      );
      
      if (validPicks.length > 0) {
        console.log("Valid picks preserved:", validPicks.length);
        localStorage.setItem('dailyPicks', JSON.stringify(validPicks));
      } else {
        // If all picks were invalid, clear to trigger fresh generation
        localStorage.removeItem('dailyPicks');
        console.log("No valid picks found, will generate new ones");
      }
    } catch (e) {
      console.error("Error parsing picks:", e);
      localStorage.removeItem('dailyPicks');
    }
  } else {
    console.log("No existing picks found");
  }
  
  // 4. Clear any state that might be preventing picks display
  sessionStorage.removeItem('carouselState');
  sessionStorage.removeItem('flippedCards');
  
  console.log("Fix complete! Reloading page...");
  
  // 5. Reload the page to trigger fresh pick generation
  window.location.reload();
}

// Run the fix
fixBlankCards();
