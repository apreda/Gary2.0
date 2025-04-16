// Emergency fix for black screen issue
// This is a complete rollback to a working state while preserving our improvements

// Executed from the browser console to get the app working again
function emergencyFixScreen() {
  console.log("EMERGENCY FIX: Running black screen recovery...");
  
  // 1. Clear any problematic localStorage data
  console.log("1. Clearing problematic localStorage data...");
  localStorage.removeItem('picksLoadError');
  localStorage.removeItem('carouselState');
  localStorage.removeItem('viewMode');
  localStorage.removeItem('mobileFixApplied');
  
  // 2. Force localStorage creation date to yesterday for picks regeneration
  console.log("2. Forcing picks regeneration...");
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  localStorage.setItem('lastPicksGenerationTime', yesterday.toISOString());
  
  // 3. Clear any existing picks that might be malformed
  console.log("3. Removing existing picks data...");
  localStorage.removeItem('dailyPicks');
  
  // 4. Clear session storage
  console.log("4. Clearing session storage...");
  sessionStorage.clear();
  
  // 5. Apply emergency CSS fixes
  console.log("5. Applying emergency CSS fixes...");
  
  // Force body to be visible
  document.body.style.display = "block";
  document.body.style.visibility = "visible";
  document.body.style.opacity = "1";
  
  // Remove any problematic mobile classes
  document.body.classList.remove('mobile-fix');
  
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    body, html, #root {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    .carousel, .pick-card, .carousel-track {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
  `;
  document.head.appendChild(styleElement);
  
  console.log("Emergency fix applied! Reloading page in 2 seconds...");
  
  // 6. Reload the page after a delay
  setTimeout(() => {
    window.location.href = window.location.pathname;
  }, 2000);
}

// Execute the fix
emergencyFixScreen();
