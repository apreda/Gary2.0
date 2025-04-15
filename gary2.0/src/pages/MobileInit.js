/**
 * MOBILE-ONLY ENHANCEMENT - Optimized mobile experience for Gary's Picks
 * Provides gold card styling, proper carousel navigation, and decision button functionality
 */

// Initialize as soon as DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // Only run on mobile devices
    const isMobile = window.innerWidth <= 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('MobileInit.js: Enhancing mobile experience');
      
      // Add mobile marker class
      document.body.classList.add('mobile-fix');
      
      // Fix card visibility and styling
      const fixCardVisibility = () => {
        console.log('Applying gold styling and fixing card visibility');
        
        // Make carousel visible but prevent unwanted interactions
        const carousel = document.querySelector('.carousel');
        if (carousel) {
          carousel.style.visibility = 'visible';
          carousel.style.display = 'block';
          carousel.style.minHeight = '500px';
        }
        
        // Hide all carousel items initially, then only show active
        document.querySelectorAll('.carousel-item').forEach(item => {
          // First hide all items
          item.style.visibility = 'hidden';
          item.style.display = 'none';
          item.style.opacity = '0';
          
          // Then only show the active one
          if (item.classList.contains('active')) {
            item.style.visibility = 'visible';
            item.style.display = 'block';
            item.style.opacity = '1';
          }
        });
      
          // Apply gold styling to all cards
        document.querySelectorAll('.pick-card').forEach(card => {
          card.style.display = 'block';
          card.style.visibility = 'visible';
          card.style.opacity = '1';
          card.style.maxWidth = '300px';
          card.style.minHeight = '450px';
          card.style.border = '2px solid #d4af37';
          card.style.margin = '0 auto';
          
          // Apply premium gold gradient to card front
          const cardFront = card.querySelector('.pick-card-front');
          if (cardFront) {
            cardFront.style.background = 'linear-gradient(145deg, #d4af37, #b08d1c)';
            cardFront.style.borderRadius = '10px';
            cardFront.style.border = '1px solid #d4af37';
          }
          
          // Ensure inner card structure works
          const inner = card.querySelector('.pick-card-inner');
          if (inner) {
            inner.style.display = 'block';
            inner.style.minHeight = '450px';
            inner.style.visibility = 'visible';
            inner.style.transformStyle = 'preserve-3d';
          }
        });
        
        // Ensure card front and back are correctly positioned
        document.querySelectorAll('.pick-card-front, .pick-card-back').forEach(side => {
          side.style.visibility = 'visible';
          side.style.position = 'absolute';
          side.style.width = '100%';
          side.style.height = '100%';
          side.style.display = 'block';
          side.style.backfaceVisibility = 'hidden';
          side.style.webkitBackfaceVisibility = 'hidden';
        });
      };
        
      // Fix carousel navigation with arrow controls
      const fixCarouselNavigation = () => {
        const carousel = document.querySelector('.carousel');
        // Make properly styled arrow controls
        document.querySelectorAll('.carousel-control').forEach(arrow => {
          // Style the arrows to be easily tappable
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
          arrow.style.position = 'absolute';
          arrow.style.top = '50%';
          arrow.style.transform = 'translateY(-50%)';
          
          // Clear existing event listeners
          const newArrow = arrow.cloneNode(true);
          if (arrow.parentNode) {
            arrow.parentNode.replaceChild(newArrow, arrow);
          }
          
          // Add click handler for proper navigation
          newArrow.addEventListener('click', e => {
            e.stopPropagation();
            console.log('Arrow clicked - navigating carousel');
            
            // Let original Bootstrap carousel handlers work
            // Then fix visibility after navigation completes
            setTimeout(() => {
              // Show only active item
              document.querySelectorAll('.carousel-item').forEach(item => {
                if (item.classList.contains('active')) {
                  item.style.visibility = 'visible';
                  item.style.display = 'block';
                  item.style.opacity = '1';
                } else {
                  item.style.visibility = 'hidden';
                  item.style.display = 'none';
                  item.style.opacity = '0';
                }
              });
              
              // Re-apply all fixes
              fixCardVisibility();
              fixDecisionButtons();
              fixCardFlipping();
            }, 300);
          });
        });
      };
      
      // Fix View Pick button and card flipping
      const fixCardFlipping = () => {
        document.querySelectorAll('.pick-card').forEach(card => {
          // Make sure View Pick button works properly
          const viewBtn = card.querySelector('.btn-view-pick');
          if (viewBtn) {
            // Style the button
            viewBtn.style.display = 'inline-block';
            viewBtn.style.padding = '10px 15px';
            viewBtn.style.backgroundColor = '#d4af37';
            viewBtn.style.color = '#000';
            viewBtn.style.borderRadius = '5px';
            viewBtn.style.fontWeight = 'bold';
            viewBtn.style.margin = '5px';
            viewBtn.style.zIndex = '50';
            
            // Remove existing event listeners
            const newBtn = viewBtn.cloneNode(true);
            if (viewBtn.parentNode) {
              viewBtn.parentNode.replaceChild(newBtn, viewBtn);
            }
            
            // Add flip handler
            newBtn.addEventListener('click', e => {
              e.stopPropagation();
              e.preventDefault();
              console.log('View Pick clicked - flipping card');
              card.classList.add('flipped');
              return false;
            }, true);
          }
          
          // Make sure back of card can be flipped back
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
      
      // Fix decision button styling and functionality
      const fixDecisionButtons = () => {
        document.querySelectorAll('.pick-card .btn-decision').forEach(btn => {
          // Set up proper event handling
          btn.style.zIndex = '100';
          btn.style.position = 'relative';
          btn.style.display = 'inline-block';
          btn.style.minHeight = '44px';
          
          // Style based on button type (ride or fade)
          if (btn.getAttribute('data-decision') === 'ride') {
            // Gold "Bet with Gary" button
            btn.style.backgroundColor = '#d4af37';
            btn.style.color = '#000';
            btn.style.border = 'none';
          } else if (btn.getAttribute('data-decision') === 'fade') {
            // Black "Fade the Bear" button with gold text
            btn.style.backgroundColor = '#222';
            btn.style.color = '#d4af37';
            btn.style.border = '1px solid #d4af37';
          }
          
          // Make decision buttons work the same as web
          const newBtn = btn.cloneNode(true);
          if (btn.parentNode) {
            btn.parentNode.replaceChild(newBtn, btn);
          }
          
          // Add click handler that works with the original app logic
          newBtn.addEventListener('click', e => {
            e.stopPropagation();
            // Allow the original handler to work
            // (don't call preventDefault)
            
            // Find all buttons and emulate the web behavior
            const decision = newBtn.getAttribute('data-decision');
            const pickId = newBtn.closest('.pick-card').getAttribute('data-pick-id');
            console.log(`Decision button clicked: ${decision} for pick ${pickId}`);
            
            // Simulate the focus states like on web
            document.querySelectorAll(`.pick-card[data-pick-id="${pickId}"] .btn-decision`).forEach(otherBtn => {
              otherBtn.classList.remove('selected');
            });
            newBtn.classList.add('selected');
          }, true);
        });
      };
      
      // Run all fixes in sequence with proper timing
      fixCardVisibility();
      fixCarouselNavigation();
      fixCardFlipping();
      fixDecisionButtons();
      
      // Apply fixes again after a delay to ensure they take effect
      setTimeout(() => {
        fixCardVisibility();
        fixCarouselNavigation();
        fixCardFlipping();
        fixDecisionButtons();
      }, 500);
      
      // Also reapply fixes after orientation changes
      window.addEventListener('orientationchange', () => {
        setTimeout(() => {
          fixCardVisibility();
          fixCarouselNavigation();
          fixCardFlipping();
          fixDecisionButtons();
        }, 300);
      });
      
      // Reapply fixes on resize if still in mobile view
      window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) {
          setTimeout(() => {
            fixCardVisibility();
            fixCarouselNavigation();
            fixCardFlipping();
            fixDecisionButtons();
          }, 300);
        }
      });
      
      // Handle any carousel changes
      const carouselEl = document.querySelector('.carousel');
      if (carouselEl) {
        carouselEl.addEventListener('slid.bs.carousel', () => {
          setTimeout(() => {
            fixCardVisibility();
            fixCardFlipping();
            fixDecisionButtons();
          }, 100);
        });
      }
    }
  });
}
