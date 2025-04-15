// Mobile-specific card flip handler
// This script is loaded directly for better mobile compatibility

document.addEventListener('DOMContentLoaded', function() {
  // Only run on mobile devices
  if (window.innerWidth <= 768) {
    fixMobileCardFlipping();
    
    // Keep checking for changes to the DOM
    const observer = new MutationObserver(function() {
      fixMobileCardFlipping();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
});

function fixMobileCardFlipping() {
  console.log("Applying mobile card flip fixes");
  
  // Get all cards
  const cards = document.querySelectorAll('.pick-card');
  
  // Handle card flipping
  cards.forEach(card => {
    // Get View Pick button in this card
    const viewButton = card.querySelector('.btn-view-pick');
    if (viewButton) {
      // Remove old listeners by cloning
      const newViewButton = viewButton.cloneNode(true);
      if (viewButton.parentNode) {
        viewButton.parentNode.replaceChild(newViewButton, viewButton);
      }
      
      // Add click listener for View Pick button
      newViewButton.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        // Find the parent card and flip it
        const cardToFlip = this.closest('.pick-card');
        if (cardToFlip) {
          cardToFlip.classList.toggle('flipped');
        }
      }, true);
    }
    
    // Make clicking anywhere on the card (except buttons) flip it back if it's flipped
    card.addEventListener('click', function(e) {
      // Don't flip if clicking on buttons, actions or carousel controls
      if (
        e.target.closest('.btn-view-pick') || 
        e.target.closest('.btn-decision') || 
        e.target.closest('.pick-card-actions') ||
        e.target.closest('.carousel-control')
      ) {
        return;
      }
      
      // If card is already flipped, flip it back
      if (this.classList.contains('flipped')) {
        this.classList.remove('flipped');
      }
    }, true);
  });
  
  // Fix action buttons to prevent propagation
  const actionButtons = document.querySelectorAll('.btn-decision');
  actionButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.stopPropagation();
    }, true);
  });
  
  // Ensure carousel controls work
  const carouselControls = document.querySelectorAll('.carousel-control');
  carouselControls.forEach(control => {
    control.addEventListener('click', function(e) {
      e.stopPropagation();
      
      // Re-apply fixes after carousel changes
      setTimeout(fixMobileCardFlipping, 300);
    }, true);
  });
}
