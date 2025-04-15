// Mobile-specific card flip handler optimized for iPhones and touch devices
// This script is loaded directly for better mobile compatibility

document.addEventListener('DOMContentLoaded', function() {
  // Only run on mobile devices
  if (window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    console.log("Mobile device detected");
    document.body.classList.add('mobile-touch-device');
    fixMobileCardFlipping();
    
    // Keep checking for changes to the DOM
    const observer = new MutationObserver(function(mutations) {
      // Only reapply if actual card elements were modified
      let shouldReapply = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          shouldReapply = true;
        }
      });
      
      if (shouldReapply) {
        console.log("DOM changed, reapplying mobile fixes");
        fixMobileCardFlipping();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
});

function fixMobileCardFlipping() {
  console.log("Applying mobile card flip fixes");
  
  // First, remove any existing carousel click handlers that might interfere
  const carousel = document.querySelector('.carousel');
  if (carousel) {
    // Clone to remove handlers
    const newCarousel = carousel.cloneNode(false);
    Array.from(carousel.children).forEach(child => newCarousel.appendChild(child));
    if (carousel.parentNode) {
      carousel.parentNode.replaceChild(newCarousel, carousel);
    }
    
    // Prevent default touch actions
    newCarousel.addEventListener('touchstart', function(e) {
      // Allow touch events for controls but not for cards
      if (!e.target.closest('.carousel-control')) {
        // Don't prevent default here to allow button clicks
      }
    }, {passive: true});
  }
  
  // Get all cards
  const cards = document.querySelectorAll('.pick-card');
  
  // Handle card flipping
  cards.forEach(card => {
    // First remove any existing click handlers from the card
    const newCard = card.cloneNode(false);
    Array.from(card.children).forEach(child => newCard.appendChild(child.cloneNode(true)));
    if (card.parentNode) {
      const classes = card.className;
      card.parentNode.replaceChild(newCard, card);
      newCard.className = classes; // Restore classes including 'flipped' if present
    }
    
    // CRITICAL: Prevent card click from routing to next card
    newCard.addEventListener('click', function(e) {
      // Only prevent propagation if clicking on the card itself, not controls
      if (!e.target.closest('.carousel-control')) {
        e.stopPropagation();
      }
      
      // Only flip back if already flipped and not clicking buttons
      if (this.classList.contains('flipped') && 
          !e.target.closest('.btn-view-pick') && 
          !e.target.closest('.btn-decision') && 
          !e.target.closest('.pick-card-actions')) {
        this.classList.remove('flipped');
      }
    }, true);
    
    // Handle View Pick button
    const viewButton = newCard.querySelector('.btn-view-pick');
    if (viewButton) {
      viewButton.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        const cardToFlip = this.closest('.pick-card');
        if (cardToFlip) {
          cardToFlip.classList.add('flipped'); // Always flip to back
        }
      }, true);
    }
    
    // Stop propagation for decision buttons
    const decisionButtons = newCard.querySelectorAll('.btn-decision');
    decisionButtons.forEach(button => {
      button.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
      }, true);
    });
  });
  
  // Ensure carousel controls work properly
  const carouselControls = document.querySelectorAll('.carousel-control');
  carouselControls.forEach(control => {
    // Clean up old listeners
    const newControl = control.cloneNode(true);
    if (control.parentNode) {
      control.parentNode.replaceChild(newControl, control);
    }
    
    // Add proper listeners for controls
    newControl.addEventListener('touchstart', function(e) {
      // Allow carousel navigation
      e.stopPropagation();
    }, true);
    
    newControl.addEventListener('click', function(e) {
      e.stopPropagation();
      
      // Re-apply fixes after carousel rotation
      setTimeout(fixMobileCardFlipping, 300);
    }, true);
  });
}
