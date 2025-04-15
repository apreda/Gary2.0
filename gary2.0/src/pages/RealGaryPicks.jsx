import React, { useState, useEffect, useRef } from 'react';
import { Link } from "react-router-dom";
import { useUserStats } from "../hooks/useUserStats";
import { useUserPlan } from "../hooks/useUserPlan";
import ErrorBoundary from "../components/ErrorBoundary";
import gary1 from '../assets/images/gary1.svg';
import "./GaryPicksCarousel.css";
import "./CarouselFix.css";
import { picksService } from '../services/picksService';
import { schedulerService } from '../services/schedulerService';
import { resultsService } from '../services/resultsService';
import { supabase } from '../supabaseClient';

// Constants for Gary's responses
const GARY_RESPONSES = {
  ride: [
    "Nice. You rode with the Bear. Let's win this.",
    "Smart money rides with Gary. Good call.",
    "When Gary speaks, winners listen. Let's cash this.",
    "Gary approves your pick. Time to collect."
  ],
  fade: [
    "Bold move fading the Bear. Let's see how it plays out.",
    "Going against Gary? Interesting strategy.",
    "The Bear sees your fade. Respect for the conviction.",
    "Contrarian play noted. May the odds be in your favor."
  ]
};

export function RealGaryPicks() {
  const { userPlan, updateUserPlan } = useUserPlan();
  const { updateUserStats } = useUserStats();
  
  // Debug: Log current user plan
  useEffect(() => {
    console.log("RealGaryPicks - Current user plan:", userPlan);
  }, [userPlan]);
  
  // State for carousel
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [flippedCards, setFlippedCards] = useState({});
  const [autoplayPaused, setAutoplayPaused] = useState(false);
  const autoplayRef = useRef(null);
  
  // Touch handling refs and state
  const carouselRef = useRef(null);
  const touchStartXRef = useRef(0);
  const touchEndXRef = useRef(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  // Control which cards are visible based on user plan
  const isCardUnlocked = (index) => {
    // Debug: Log card unlock check
    console.log(`Checking if card ${index} is unlocked for user with plan: ${userPlan}`);
    
    // Only the first card is available to free users
    if (userPlan === 'pro') {
      console.log(`Card ${index} is unlocked - user has pro plan`);
      return true;
    }
    
    const result = index === 0;
    console.log(`Card ${index} is ${result ? 'unlocked' : 'locked'} - user has free plan`);
    return result;
  };
  
  // State for tracking user decisions
  const [userDecisions, setUserDecisions] = useState(() => {
    const savedDecisions = localStorage.getItem('userPickDecisions');
    return savedDecisions ? JSON.parse(savedDecisions) : {};
  });
  
  // State for toast notifications
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // State for next picks info
  const [nextPicksInfo, setNextPicksInfo] = useState(null);

  // Fetch picks on component mount
  // Force refresh user plan from Supabase on component mount
  useEffect(() => {
    const refreshUserPlan = async () => {
      try {
        // Get current auth session
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          console.log("User authenticated, checking plan...");
          // Get user from database to check their plan
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('plan')
            .eq('id', sessionData.session.user.id)
            .single();
            
          if (userData) {
            console.log("Database user plan:", userData.plan);
            // If the database plan is different from current plan, update it
            if (userData.plan !== userPlan) {
              console.log("Updating plan from", userPlan, "to", userData.plan);
              updateUserPlan(userData.plan);
            }
          } else {
            console.log("No user data found in database, error:", userError);
          }
        } else {
          console.log("No authenticated user session found");
        }
      } catch (error) {
        console.error("Error refreshing user plan:", error);
      }
    };
    
    refreshUserPlan();
  }, []); // Run once on component mount
  
  useEffect(() => {
    async function fetchPicks() {
      try {
        setLoading(true);
        
        // Check if we should generate new picks
        const shouldGenerate = schedulerService.shouldGenerateNewPicks();
        let dailyPicks;
        
        if (shouldGenerate) {
          // Generate new picks for today
          dailyPicks = await picksService.generateDailyPicks();
          
          // Mark that we've generated picks for today
          schedulerService.markPicksAsGenerated();
        } else {
          // Get existing picks from localStorage
          const savedPicks = localStorage.getItem('dailyPicks');
          if (savedPicks) {
            dailyPicks = JSON.parse(savedPicks);
          } else {
            // Generate new picks since none are saved
            dailyPicks = await picksService.generateDailyPicks();
            schedulerService.markPicksAsGenerated();
          }
        }
        
        // Save picks to localStorage
        localStorage.setItem('dailyPicks', JSON.stringify(dailyPicks));
        
        // Update state with the picks
        setPicks(dailyPicks);
        
        // Initialize flipped state for all cards
        const initialFlippedState = {};
        dailyPicks.forEach(pick => {
          initialFlippedState[pick.id] = false;
        });
        setFlippedCards(initialFlippedState);
        
        // Get info about next picks
        setNextPicksInfo(schedulerService.getNextPicksInfo());
        
        // Check for results immediately
        await resultsService.checkResults();
        
        // Set up listener for localStorage changes (for when results are updated)
        const handleStorageChange = (e) => {
          if (e.key === 'dailyPicks') {
            const updatedPicks = JSON.parse(e.newValue);
            setPicks(updatedPicks);
          }
        };
        
        window.addEventListener('storage', handleStorageChange);
        
        // Cleanup listener when component unmounts
        return () => window.removeEventListener('storage', handleStorageChange);
      } catch (error) {
        console.error('Error fetching picks:', error);
        // If API fails, use fallback picks
        const fallbackPicks = picksService.getFallbackPicks();
        setPicks(fallbackPicks);
        
        // Initialize flipped state for fallback picks
        const initialFlippedState = {};
        fallbackPicks.forEach(pick => {
          initialFlippedState[pick.id] = false;
        });
        setFlippedCards(initialFlippedState);
      } finally {
        setLoading(false);
      }
    }
    
    fetchPicks();
  }, []);
  
  // Autoplay function (disabled - kept for potential future use)
  const startAutoplay = () => {
    // Autoplay disabled - cards only change when arrows are clicked
  };

  // Pause autoplay when user interacts
  const pauseAutoplay = () => {
    if (autoplayRef.current) {
      clearTimeout(autoplayRef.current);
    }
  };

  // Resume autoplay
  const resumeAutoplay = () => {
    pauseAutoplay();
    startAutoplay();
  };

  // Rotate carousel with improved animation
  const rotateCarousel = (direction) => {
    // Play a subtle click sound (for better UX)
    const clickSound = new Audio();
    clickSound.volume = 0.2;
    try {
      clickSound.play().catch(() => {}); // Ignore autoplay errors
    } catch (e) {}
    
    // Animate the transition
    if (carouselRef.current) {
      carouselRef.current.style.transition = 'transform 0.3s ease-out';
    }
    
    // Update the active card index
    setActiveCardIndex(prevIndex => {
      if (direction === 'next') {
        return (prevIndex + 1) % picks.length;
      } else {
        return (prevIndex - 1 + picks.length) % picks.length;
      }
    });
    
    // Reset transition after animation completes
    setTimeout(() => {
      if (carouselRef.current) {
        carouselRef.current.style.transition = '';
      }
    }, 300);
  };

  // Toggle card flip
  const toggleFlip = (pickId) => {
    setFlippedCards(prev => ({
      ...prev,
      [pickId]: !prev[pickId]
    }));
  };

  // Get a random response from Gary
  const getRandomResponse = (responseType) => {
    const responses = GARY_RESPONSES[responseType];
    return responses[Math.floor(Math.random() * responses.length)];
  };

  // Handle user betting decision
  const handleDecision = (pickId, decision) => {
    // Prevent multiple decisions on the same pick
    if (userDecisions[pickId]) {
      return;
    }
    
    // Update local state
    setUserDecisions(prev => ({
      ...prev,
      [pickId]: decision
    }));
    
    // Save to localStorage
    localStorage.setItem('userPickDecisions', JSON.stringify({
      ...userDecisions,
      [pickId]: decision
    }));
    
    // Show toast notification
    setToastMessage(getRandomResponse(decision));
    setShowToast(true);
    
    // Hide toast after 3 seconds
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
    
    // Update user stats if available
    if (updateUserStats) {
      updateUserStats({
        action: decision === 'ride' ? 'rode_with_gary' : 'faded_gary',
        pickId
      });
    }
  };
  
  // Touch event handlers for mobile swipe
  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    setIsSwiping(true);
  };
  
  const handleTouchMove = (e) => {
    if (!isSwiping) return;
    touchEndXRef.current = e.touches[0].clientX;
    
    // Optional: add visual feedback during swiping
    const swipeDiff = touchEndXRef.current - touchStartXRef.current;
    if (Math.abs(swipeDiff) > 30) {
      // Prevent default to stop page scrolling when swiping the carousel
      e.preventDefault();
    }
  };
  
  const handleTouchEnd = () => {
    if (!isSwiping) return;
    
    const swipeThreshold = 50; // minimum distance to register as a swipe
    const swipeDiff = touchEndXRef.current - touchStartXRef.current;
    
    if (swipeDiff > swipeThreshold) {
      // Swiped right - go to previous card
      rotateCarousel('prev');
    } else if (swipeDiff < -swipeThreshold) {
      // Swiped left - go to next card
      rotateCarousel('next');
    }
    
    setIsSwiping(false);
  };

  // Calculate position class for each card with enhanced positioning
  const getCardPositionClass = (index) => {
    // Calculate relative position to the active card in a circular manner
    const position = (index - activeCardIndex + picks.length) % picks.length;
    
    // Enhanced positioning logic for fanned-out display
    // Center card
    if (position === 0) return 'card-position-0';
    
    // Cards to the right
    if (position === 1) return 'card-position-1';
    if (position === 2) return 'card-position-2';
    if (position === 3) return 'card-position-3';
    
    // Cards to the left
    if (position === picks.length - 1) return 'card-position-6';
    if (position === picks.length - 2) return 'card-position-5';
    if (position === picks.length - 3) return 'card-position-4';
    
    // Fallback for any other positions to ensure all cards have a position
    return position < picks.length / 2 ? 'card-position-3' : 'card-position-4';
  };

  return (
    <ErrorBoundary>
      <div className="gary-picks-container">
        {/* Next picks info */}
        {nextPicksInfo && (
          <div className="next-picks-info text-center mb-4 text-sm text-[#d4af37]">
            <p>
              {nextPicksInfo.isToday ? 
                `Today's picks are ready` : 
                `Next picks will be available ${nextPicksInfo.isTomorrow ? 'tomorrow' : 'on'} ${nextPicksInfo.formattedDate} at ${nextPicksInfo.formattedTime}`
              }
            </p>
          </div>
        )}
        
        <div className="gary-carousel">
          <div className="ambient-glow ambient-glow-1"></div>
          <div className="ambient-glow ambient-glow-2"></div>
          
          {loading ? (
            <div className="loading-container">
              <p className="text-center text-[#d4af37] text-xl">Loading Gary's picks...</p>
              <div className="loader"></div>
            </div>
          ) : picks.length === 0 ? (
            <div className="error-container">
              <p className="text-center text-[#d4af37] text-xl">Unable to load picks. Please try again later.</p>
            </div>
          ) : (
            <div className="carousel-container picks-carousel">
              <div className="carousel-track"
                ref={carouselRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {picks.map((pick, index) => (
                  <div 
                    key={pick.id}
                    className={`pick-card ${pick.league === 'PARLAY' ? 'parlay-card' : ''} ${pick.silverCard ? 'silver-card' : ''} ${pick.primeTimeCard ? 'primetime-card' : ''} ${getCardPositionClass(index)} ${flippedCards[pick.id] ? 'pick-card-flipped' : ''}`}
                    onClick={() => toggleFlip(pick.id)}
                  >
                    <div className="pick-card-inner">
                      {/* Front of card */}
                      <div className="pick-card-front">
                        <div className="pick-card-header">
                          <div className={pick.league === 'PARLAY' ? 'parlay-badge' : pick.primeTimeCard ? 'primetime-badge' : 'pick-card-league'}>
                            {pick.primeTimeCard ? 'PRIMETIME BONUS PICK' : pick.league}
                          </div>
                          {pick.league === 'PARLAY' ? (
                            <>
                              <div className="pick-card-matchup">{pick.game}</div>
                              <div className="pick-card-time">{pick.time}</div>
                            </>
                          ) : (
                            <>
                              <div className="pick-card-time">{pick.time}</div>
                            </>
                          )}
                        </div>
                        
                        {/* Center content area - can be used for team logos or additional info */}
                        <div className="pick-card-center-content">
                          {/* Empty space for now or you can add content here */}
                        </div>
                        
                        {/* Bottom button container */}
                        <div className="pick-card-bottom">
                          <button 
                            className="btn-view-pick"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFlip(pick.id);
                            }}
                          >
                            View Pick
                          </button>
                        </div>
                      </div>
                      
                      {/* Back of card */}
                      <div className="pick-card-back">
                        <div className="pick-card-header">
                          <div className={pick.league === 'PARLAY' ? 'parlay-badge' : pick.primeTimeCard ? 'primetime-badge' : 'pick-card-league'}>
                            {pick.primeTimeCard ? 'PRIMETIME BONUS PICK' : pick.league}
                          </div>
                          <div className="pick-card-matchup">{pick.game}</div>
                          <div className="pick-card-time">{pick.time}</div>
                        </div>
                        
                        {pick.league !== 'PARLAY' ? (
                          <div className="pick-card-content">
                            <div className="pick-card-bet-type">{pick.betType}</div>
                            <div className="pick-card-bet">
                              {pick.betType === 'Best Bet: Moneyline' ? pick.moneyline : 
                              pick.betType === 'Spread Pick' ? pick.spread : pick.overUnder}
                            </div>
                            {pick.result && pick.result !== 'pending' && (
                              <div className={`pick-result ${pick.result === 'WIN' ? 'win' : pick.result === 'LOSS' ? 'loss' : 'push'}`}>
                                <div className="result-label">{pick.result === 'WIN' ? '✓ WINNER' : pick.result === 'LOSS' ? '✗ INCORRECT' : 'PUSH'}</div>
                                {pick.finalScore && <div className="final-score">Final: {pick.finalScore}</div>}
                              </div>
                            )}
                            
                            {/* Gary's Analysis Section */}
                            <div className="gary-analysis">
                              <div className="gary-analysis-label">Gary's Analysis</div>
                              <div className="gary-analysis-content">{pick.analysis || "Gary is brewing up some expert analysis for this pick. Check back soon!"}</div>
                            </div>
                            
                            <div className="pick-card-actions">
                              <div className="decision-actions">
                                {(!pick.result || pick.result === 'pending') ? (
                                  <>
                                    <button 
                                      className="btn-decision btn-ride"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDecision(pick.id, 'ride');
                                      }}
                                      disabled={userDecisions[pick.id]}
                                    >
                                      Bet with Gary
                                    </button>
                                    <button 
                                      className="btn-decision btn-fade"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDecision(pick.id, 'fade');
                                      }}
                                      disabled={userDecisions[pick.id]}
                                    >
                                      Fade the Bear
                                    </button>
                                  </>
                                ) : (
                                  <div className="decision-result">
                                    {userDecisions[pick.id] === 'ride' ? 
                                      (pick.result === 'WIN' ? 'You won with Gary! 🎉' : 'Better luck next time with Gary.') :
                                      userDecisions[pick.id] === 'fade' ? 
                                        (pick.result === 'LOSS' ? 'Your fade was right! 🎉' : 'Gary was right this time.') :
                                        'Game concluded.'
                                    }
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      
                      {/* Premium lock overlay */}
                      {!isCardUnlocked(index) && (
                        <div className="premium-lock-overlay">
                          <div className="premium-badge">Premium</div>
                          <h3 className="premium-lock-title">Unlock Gary's Premium Pick</h3>
                          <p className="premium-lock-desc">Gain access to all of Gary's premium picks with a Pro subscription.</p>
                          <Link to="/pricing">
                            <button className="btn-upgrade">Upgrade Now</button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Carousel navigation */}
          <button 
            className="carousel-arrow carousel-arrow-left"
            onClick={() => rotateCarousel('prev')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          
          <button 
            className="carousel-arrow carousel-arrow-right"
            onClick={() => rotateCarousel('next')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
        
        {/* Toast notification */}
        {showToast && (
          <div className="toast-container">
            <div className="toast-message">
              {toastMessage}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default RealGaryPicks;
