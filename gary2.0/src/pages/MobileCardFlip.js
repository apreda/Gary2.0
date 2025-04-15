// Enhanced mobile card flip handler optimized for iPhones and touch devices
// This script is loaded directly for better mobile compatibility

document.addEventListener('DOMContentLoaded', function() {
  // Only run on mobile devices
  if (window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    console.log("Mobile device detected - applying targeted fixes");
    document.body.classList.add('mobile-touch-device');
    
    // Handle viewport sizing first
    adjustViewportForMobile();
    fixMobileCardFlipping();
    
    // Also apply on orientation changes
    window.addEventListener('resize', function() {
      adjustViewportForMobile();
      setTimeout(fixMobileCardFlipping, 100);
    });
    
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

// Adjust viewport size to prevent cards from being cut off
function adjustViewportForMobile() {
  // Adjust padding and heights to ensure full visibility
  const content = document.querySelector('.picks-page-content');
  if (content) {
    content.style.paddingBottom = '100px';
  }
}

function fixMobileCardFlipping() {
  console.log("Applying mobile card flip fixes");
  
  // COMPLETELY DISABLE the carousel's ability to rotate on card clicks
  const carousel = document.querySelector('.carousel');
  if (carousel) {
    // Clone to remove ALL existing handlers
    const newCarousel = carousel.cloneNode(false);
    Array.from(carousel.children).forEach(child => newCarousel.appendChild(child));
    if (carousel.parentNode) {
      carousel.parentNode.replaceChild(newCarousel, carousel);
    }
    
    // Set the carousel to ignore ALL events except specific ones on the arrows
    newCarousel.style.pointerEvents = 'none';
    
    // Prevent the carousel from receiving ANY touch events that might cause rotation
    newCarousel.addEventListener('click', function(e) {
      // Cancel ALL click events on the carousel itself
      if (!e.target.closest('.carousel-control')) {
        e.stopPropagation();
        e.preventDefault();
        return false;
      }
    }, true);
    
    // Prevent any touch events from being interpreted as swipes
    newCarousel.addEventListener('touchstart', function(e) {
      if (!e.target.closest('.carousel-control')) {
        e.stopPropagation();
      }
    }, {passive: false, capture: true});
    
    newCarousel.addEventListener('touchmove', function(e) {
      if (!e.target.closest('.carousel-control')) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, {passive: false, capture: true});
  }
  
  // Get all cards
  const cards = document.querySelectorAll('.pick-card');
  
  // Handle card flipping
  cards.forEach(card => {
    // First remove any existing handlers from the card
    const newCard = card.cloneNode(false);
    Array.from(card.children).forEach(child => newCard.appendChild(child.cloneNode(true)));
    if (card.parentNode) {
      const classes = card.className;
      card.parentNode.replaceChild(newCard, card);
      newCard.className = classes; // Restore classes including 'flipped' if present
    }
    
    // CRITICAL: Block ALL events that might cause carousel rotation
    newCard.addEventListener('click', function(e) {
      // Always stop propagation for ANY click on the card
      e.stopPropagation();
      e.preventDefault();
      
      // Only flip back if already flipped and not clicking buttons
      if (this.classList.contains('flipped') && 
          !e.target.closest('.btn-view-pick') && 
          !e.target.closest('.btn-decision') && 
          !e.target.closest('.pick-card-actions')) {
        this.classList.remove('flipped');
      }
      
      // Never allow click events to go to the carousel
      return false;
    }, true);
    
    // Prevent any swipe/touch events on cards
    newCard.addEventListener('touchstart', function(e) {
      // Always stop propagation except for controls
      if (!e.target.closest('.carousel-control')) {
        e.stopPropagation();
      }
    }, {passive: false, capture: true});
    
    newCard.addEventListener('touchmove', function(e) {
      if (!e.target.closest('.carousel-control')) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, {passive: false, capture: true});
    
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
        
        return false; // Prevent event bubbling
      }, true);
    }
    
    // Stop propagation for decision buttons
    const decisionButtons = newCard.querySelectorAll('.btn-decision');
    decisionButtons.forEach(button => {
      button.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        return false; // Prevent ANY carousel movement
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
    
    // Make arrows work for carousel navigation
    newControl.style.pointerEvents = 'auto';
    newControl.style.zIndex = '999';
    
    // Add proper listeners for controls
    newControl.addEventListener('touchstart', function(e) {
      // Let this event work normally for carousel navigation
      e.stopPropagation();
    }, {capture: true, passive: false});
    
    newControl.addEventListener('click', function(e) {
      e.stopPropagation();
      console.log("Carousel control clicked");
      
      // Re-apply fixes after carousel rotation
      setTimeout(fixMobileCardFlipping, 300);
    }, true);
  });
  
  // Detect and fix for Safari on iOS
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
    console.log("iOS detected - applying additional fixes");
    
    // Explicitly allow clicks on buttons
    document.querySelectorAll('.btn-view-pick, .btn-decision, .carousel-control').forEach(button => {
      button.style.cursor = 'pointer';
      button.style.pointerEvents = 'auto';
      button.style.zIndex = '1000';
    });
  }
}
