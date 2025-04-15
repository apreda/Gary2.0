/**
 * EMERGENCY MOBILE FIX - Ensures cards display properly on mobile
 * This corrects visibility issues while preserving desktop experience
 */

// Initialize as soon as DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // Only run on mobile devices
    const isMobile = window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('MobileInit.js: EMERGENCY FIX MODE - ensuring card visibility');
      
      // Add mobile marker class and force immediate display
      document.body.classList.add('mobile-fix');
      
      // Emergency visibility fix for cards
      const fixMobileVisibility = () => {
        console.log('Applying emergency visibility fix');
        
        // Force carousel to be visible
        const carousel = document.querySelector('.carousel');
        if (carousel) {
          carousel.style.visibility = 'visible';
          carousel.style.display = 'block';
          carousel.style.minHeight = '500px';
        }
        
        // Make all carousel items visible
        document.querySelectorAll('.carousel-item').forEach(item => {
          item.style.visibility = 'visible';
          item.style.display = 'block';
          item.style.opacity = '1';
          
          // Force active item to be especially visible
          if (item.classList.contains('active')) {
            item.style.display = 'block !important';
          }
        });
      
        // Fix height and visibility of each card
        document.querySelectorAll('.pick-card').forEach(card => {
          card.style.display = 'block';
          card.style.visibility = 'visible';
          card.style.opacity = '1';
          card.style.maxWidth = '300px';
          card.style.minHeight = '450px';
          card.style.border = '2px solid #d4af37';
          card.style.margin = '0 auto';
          
          // Fix card inner elements
          const inner = card.querySelector('.pick-card-inner');
          if (inner) {
            inner.style.display = 'block';
            inner.style.minHeight = '450px';
            inner.style.visibility = 'visible';
          }
        });
        
        // Force card front and back to be correctly sized
        document.querySelectorAll('.pick-card-front, .pick-card-back').forEach(side => {
          side.style.visibility = 'visible';
          side.style.position = 'absolute';
          side.style.width = '100%';
          side.style.height = '100%';
          side.style.display = 'block';
        });
      };
        
      // Make navigation arrows properly visible and clickable
      const fixArrows = () => {
        document.querySelectorAll('.carousel-control').forEach(arrow => {
          arrow.style.zIndex = '999';
          arrow.style.pointerEvents = 'auto';
          arrow.style.display = 'flex';
          arrow.style.alignItems = 'center';
          arrow.style.justifyContent = 'center';
          arrow.style.width = '44px';
          arrow.style.height = '44px';
          arrow.style.background = 'rgba(0, 0, 0, 0.7)';
          arrow.style.borderRadius = '50%';
          arrow.style.opacity = '1';
          
          // Make sure arrow clicks work for navigation
          arrow.addEventListener('click', e => {
            e.stopPropagation();
            console.log('Arrow clicked - navigating carousel');
            
            // Re-fix visibility after navigation
            setTimeout(fixMobileVisibility, 600);
            setTimeout(fixMobileInteraction, 650);
          });
        });
      };
      
      // Fix card interaction and flipping behavior
      const fixMobileInteraction = () => {
        document.querySelectorAll('.pick-card').forEach(card => {
          // Make sure View Pick button works
          const viewBtn = card.querySelector('.btn-view-pick');
          if (viewBtn) {
            viewBtn.style.display = 'inline-block';
            viewBtn.style.padding = '10px 15px';
            viewBtn.style.backgroundColor = '#d4af37';
            viewBtn.style.color = '#000';
            viewBtn.style.borderRadius = '5px';
            viewBtn.style.fontWeight = 'bold';
            viewBtn.style.margin = '5px';
            viewBtn.style.zIndex = '50';
            
            viewBtn.addEventListener('click', e => {
              e.stopPropagation();
              e.preventDefault();
              console.log('View Pick clicked - flipping card');
              card.classList.add('flipped');
            }, true);
          }
          
          // Make sure decision buttons work
          card.querySelectorAll('.btn-decision').forEach(btn => {
            btn.style.zIndex = '50';
            btn.style.position = 'relative';
            btn.style.display = 'inline-block';
            
            btn.addEventListener('click', e => {
              e.stopPropagation();
              e.preventDefault();
              console.log('Decision button clicked');
            }, true);
          });
          
          // Make sure card back can be clicked to return to front
          card.addEventListener('click', e => {
            if (card.classList.contains('flipped') && 
                !e.target.closest('.btn-decision') && 
                !e.target.closest('.btn-view-pick')) {
              console.log('Card back clicked - flipping back to front');
              card.classList.remove('flipped');
              e.stopPropagation();
              e.preventDefault();
            }
          }, true);
        });
      };
      
      // Run all fixes immediately and again after a delay
      fixMobileVisibility();
      fixArrows();
      setTimeout(() => {
        fixMobileVisibility();
        fixArrows();
        fixMobileInteraction();
      }, 500);
      
      // Also fix after orientation changes and resize
      window.addEventListener('orientationchange', () => {
        setTimeout(() => {
          fixMobileVisibility();
          fixArrows();
          fixMobileInteraction();
        }, 300);
      });
      
      window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) {
          setTimeout(() => {
            fixMobileVisibility();
            fixArrows();
            fixMobileInteraction();
          }, 300);
        }
      });
    }
  });
}
