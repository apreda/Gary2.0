// Custom mobile behavior for Gary's Picks cards
document.addEventListener('DOMContentLoaded', function() {
  // Only apply these changes on mobile devices
  if (window.innerWidth <= 768) {
    // Add flip functionality to the entire card (not just the button)
    function setupCardFlipOnMobile() {
      const pickCards = document.querySelectorAll('.pick-card');
      
      pickCards.forEach(card => {
        // Remove any existing click listeners to prevent conflicts
        const cardClone = card.cloneNode(true);
        card.parentNode.replaceChild(cardClone, card);
        
        // Add click listener to the entire card
        cardClone.addEventListener('click', function(e) {
          // Don't trigger if clicking on buttons or arrows
          if (
            e.target.closest('.carousel-control') || 
            e.target.closest('.btn') || 
            e.target.closest('.btn-decision') || 
            e.target.closest('.pick-card-actions')
          ) {
            return;
          }
          
          // Flip the card
          cardClone.classList.toggle('flipped');
        });
      });
    }
    
    // Disable swipe functionality
    function disableCardSwipe() {
      // If using a library like Swiper or similar
      if (window.mySwiper) {
        window.mySwiper.destroy(true, true);
      }
      
      // If using touch events, prevent them
      const carousel = document.querySelector('.carousel');
      if (carousel) {
        const preventSwipe = function(e) {
          // Only prevent horizontal swiping
          if (Math.abs(e.touches[0].clientX - e.touches[1]?.clientX || 0) > 
              Math.abs(e.touches[0].clientY - e.touches[1]?.clientY || 0)) {
            e.preventDefault();
          }
        };
        
        carousel.addEventListener('touchmove', preventSwipe, { passive: false });
      }
    }
    
    // Apply our mobile behaviors
    setupCardFlipOnMobile();
    disableCardSwipe();
    
    // Re-apply when DOM changes (React may rebuild the components)
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length) {
          setupCardFlipOnMobile();
        }
      });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }
});
