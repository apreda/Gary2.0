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
  
  // Enable the carousel's ability to rotate properly
  const carousel = document.querySelector('.carousel');
  if (carousel) {
    // Clone to reset handlers but maintain carousel functionality
    const newCarousel = carousel.cloneNode(false);
    Array.from(carousel.children).forEach(child => newCarousel.appendChild(child));
    if (carousel.parentNode) {
      carousel.parentNode.replaceChild(newCarousel, carousel);
    }
    
    // Allow carousel to receive events for proper rotation
    newCarousel.style.pointerEvents = 'auto';
    
    // Allow carousel rotation from controls and swipes, but manage card flipping separately
    newCarousel.addEventListener('click', function(e) {
      // Only stop propagation for clicks on cards, allow carousel controls to work
      if (e.target.closest('.pick-card') && !e.target.closest('.carousel-control')) {
        // Don't stop propagation completely to allow carousel to work
        // But do handle card flipping in the card's own event handler
      }
    }, false);
    
    // Allow swipe gestures for carousel movement
    newCarousel.addEventListener('touchstart', function(e) {
      // Allow touch events on controls and carousel for swiping
      if (e.target.closest('.pick-card') && !e.target.closest('.carousel-control')) {
        // We'll handle card-specific behavior in the card handler
      }
    }, {passive: true});
    
    newCarousel.addEventListener('touchmove', function(e) {
      // Allow movement for carousel swiping
      if (e.target.closest('.pick-card') && !e.target.closest('.carousel-control')) {
        // We'll handle card-specific behavior in the card handler
      }
    }, {passive: true});
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
    
    // Handle card flipping without blocking carousel rotation
    newCard.addEventListener('click', function(e) {
      // Only prevent default for card flipping to allow carousel to work
      if (!e.target.closest('.carousel-control')) {
        e.preventDefault(); // Don't stop propagation to allow carousel to work
      }
      
      // Handle view pick button clicks separately
      if (e.target.closest('.btn-view-pick')) {
        this.classList.add('flipped');
        return;
      }
      
      // Only flip back if already flipped and not clicking buttons
      if (this.classList.contains('flipped') && 
          !e.target.closest('.btn-decision') && 
          !e.target.closest('.pick-card-actions')) {
        this.classList.remove('flipped');
      } else if (!this.classList.contains('flipped') && 
                !e.target.closest('.carousel-control')) {
        // If not flipped and not clicking carousel controls, flip the card
        this.classList.add('flipped');
      }
    }, false);
    
    // Handle card touch events without completely blocking carousel swipes
    let touchStartX = 0;
    let touchEndX = 0;
    
    newCard.addEventListener('touchstart', function(e) {
      // Record start position for detecting swipes vs taps
      touchStartX = e.touches[0].clientX;
      
      // Don't block carousel controls
      if (e.target.closest('.carousel-control')) {
        return;
      }
    }, {passive: true});
    
    newCard.addEventListener('touchmove', function(e) {
      // Record current position
      touchEndX = e.touches[0].clientX;
      
      // Don't block carousel controls
      if (e.target.closest('.carousel-control')) {
        return;
      }
      
      // If it's a clear horizontal swipe (more than 50px), let carousel handle it
      const swipeDistance = Math.abs(touchEndX - touchStartX);
      if (swipeDistance > 50) {
        // Let the carousel handle the swipe
        return;
      }
    }, {passive: true});
    
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
    
    // Enhanced listeners for carousel controls
    newControl.addEventListener('touchstart', function(e) {
      // Let this event work normally for carousel navigation
      console.log("Carousel control touch started");
      // Don't stop propagation to allow normal carousel behavior
    }, {passive: true});
    
    newControl.addEventListener('click', function(e) {
      console.log("Carousel control clicked");
      // Don't stop propagation to allow normal carousel behavior
      
      // Re-apply fixes after carousel rotation
      setTimeout(fixMobileCardFlipping, 300);
    }, false);
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
