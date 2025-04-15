/**
 * Mobile initialization script - ONLY for mobile devices
 * This script ensures proper card flip and carousel navigation
 * on mobile devices without affecting desktop behavior.
 */

// Initialize on page load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // Only run on mobile devices
    if (window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      console.log('MobileInit.js: Initializing mobile-specific handlers');
      
      // Add mobile marker class
      document.body.classList.add('mobile-fix');
      
      // Fix all mobile-specific interactions on a timer
      const initMobile = () => {
        // 1. Fix carousel navigation first
        const carousel = document.querySelector('.carousel');
        if (carousel) {
          carousel.style.pointerEvents = 'none';
          
          // Ensure only arrows can trigger navigation
          const carouselItems = carousel.querySelectorAll('.carousel-item');
          carouselItems.forEach(item => {
            item.addEventListener('click', e => {
              e.stopPropagation();
              return false;
            }, true);
            
            // Show active item
            if (item.classList.contains('active')) {
              item.style.display = 'block';
            }
          });
        }
        
        // 2. Fix navigation arrows
        document.querySelectorAll('.carousel-control').forEach(arrow => {
          arrow.style.zIndex = '999';
          arrow.style.pointerEvents = 'auto';
          
          // Ensure clicks work
          arrow.addEventListener('click', e => {
            e.stopPropagation();
            
            // Give time for carousel to update
            setTimeout(() => {
              // Show active item after carousel change
              const activeItem = document.querySelector('.carousel-item.active');
              if (activeItem) {
                activeItem.style.display = 'block';
              }
              
              // Reinitialize to fix new active card
              initMobile();
            }, 600);
          });
        });
        
        // 3. Fix card flipping
        document.querySelectorAll('.pick-card').forEach(card => {
          // Ensure it's visible
          card.style.display = 'block';
          
          // Fix view pick button
          const viewBtn = card.querySelector('.btn-view-pick');
          if (viewBtn) {
            viewBtn.addEventListener('click', e => {
              e.stopPropagation();
              e.preventDefault();
              card.classList.add('flipped');
            }, true);
          }
          
          // Fix card back clicks
          card.addEventListener('click', e => {
            if (card.classList.contains('flipped') && 
                !e.target.closest('.btn-decision') && 
                !e.target.closest('.btn-view-pick')) {
              card.classList.remove('flipped');
              e.stopPropagation();
              e.preventDefault();
            }
          }, true);
          
          // Protect decision buttons
          card.querySelectorAll('.btn-decision').forEach(btn => {
            btn.style.zIndex = '10';
            btn.addEventListener('click', e => {
              e.stopPropagation();
            }, true);
          });
        });
      };
      
      // Run initialization with a delay
      setTimeout(initMobile, 500);
      
      // Rerun after orientation changes
      window.addEventListener('orientationchange', () => {
        setTimeout(initMobile, 500);
      });
    }
  });
}
