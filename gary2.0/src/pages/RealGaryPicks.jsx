import React, { useState, useEffect, useRef } from 'react';
import { Link } from "react-router-dom";
import { useUserStats } from "../hooks/useUserStats";
import { useUserPlan } from "../hooks/useUserPlan";
import ErrorBoundary from "../components/ErrorBoundary";
import gary1 from '../assets/images/gary1.svg';
import "./GaryPicksCarousel.css";
import "./CarouselFix.css";
import "./CardFlipFix.css";
import "./ParlayCardFix.css"; // Special fixes for Parlay card
import "./ButtonFix.css"; // Fix button positioning
import "./ToastNotification.css"; // Toast notification styles
import "./RegularCardFix.css"; // Fix font sizing for regular cards
import "./MobileFixes.css"; // Specific fixes for mobile
import "./GaryAnalysisFix.css"; // Enhanced styling for Gary's analysis
import "./AnalysisBulletsFix.css"; // Styling for the bulleted analysis format
// useEffect is already imported with React
import { picksService } from '../services/picksService';
import { schedulerService } from '../services/schedulerService';
import { resultsService } from '../services/resultsService';
import { betTrackingService } from '../services/betTrackingService';
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
    
    // Pro users can access all 7 cards
    if (userPlan === 'pro') {
      console.log(`Card ${index} is unlocked - user has pro plan`);
      return true; // All 7 cards unlocked for pro users
    }
    
    // Free users can only see the first pick unlocked
    const result = index === 0;
    console.log(`Card ${index} is ${result ? 'unlocked' : 'locked'} - user has free plan`);
    return result;
  };
  
  // Determine if a card should be visible in the carousel
  const isCardVisible = (index) => {
    return true; // Show all cards in the carousel as per original design
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
  
  // State for error handling
  const [loadError, setLoadError] = useState(null);
  
  useEffect(() => {
    async function fetchPicks() {
      try {
        setLoading(true);
        setLoadError(null); // Reset any previous errors
        
        // Check for environment variables first
        const oddsApiKey = import.meta.env.VITE_ODDS_API_KEY;
        if (!oddsApiKey) {
          console.error('Missing VITE_ODDS_API_KEY environment variable. Picks cannot be generated.');
          setLoadError('API key not configured. Please set up your environment variables.');
          setLoading(false);
          return;
        }
        
        // Check if we should generate new picks
        const shouldGenerate = schedulerService.shouldGenerateNewPicks();
        let dailyPicks;
        
        // First try to get existing picks from localStorage
        const savedPicks = localStorage.getItem('dailyPicks');
        if (savedPicks && !shouldGenerate) {
          console.log('Using cached picks from localStorage');
          let parsedPicks = JSON.parse(savedPicks);
          
          // Fix for existing picks - normalize to ensure they have all required fields
          parsedPicks = parsedPicks.map(pick => picksService.normalizePick(pick));
          console.log('Normalized picks data for display');
          
          // Save the normalized picks back to localStorage
          localStorage.setItem('dailyPicks', JSON.stringify(parsedPicks));
          
          dailyPicks = parsedPicks;
        } else {
          // Either need to generate new picks or no saves exist
          console.log('Generating new picks...');
          try {
            // Check for DeepSeek API key
            const deepseekApiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
            if (!deepseekApiKey) {
              console.error('Missing VITE_DEEPSEEK_API_KEY environment variable. Picks cannot be generated.');
              setLoadError('DeepSeek API key not configured. Please set up your environment variables.');
              setLoading(false);
              return;
            }
            
            // Generate new picks
            dailyPicks = await picksService.generateDailyPicks();
            
            // Mark that we've generated picks for today
            schedulerService.markPicksAsGenerated();
            
            // Save picks to localStorage
            localStorage.setItem('dailyPicks', JSON.stringify(dailyPicks));
          } catch (generateError) {
            console.error('Error generating picks:', generateError);
            setLoadError(`Error generating picks: ${generateError.message}. No fallbacks will be used.`);
            setLoading(false);
            return;
          }
        }
        
        // If we get here, we have valid picks
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
        
        // Set loading to false now that we have the picks
        setLoading(false);
        
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
        setLoading(false);
        
        // Display error message - no fallbacks
        setLoadError(`Error fetching picks: ${error.message}. Please try again later.`);
        setPicks([]);
        setFlippedCards({});
        
        // Set next picks info
        setNextPicksInfo(schedulerService.getNextPicksInfo());
      }
    }
    
    fetchPicks();
  }, []);
  
  // Fetch picks when component mounts
  useEffect(() => {
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

  // Handle card flip toggle
  const toggleFlip = (cardId) => {
    // Prevent changing active card when flipping
    setFlippedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
    
    // Stop any event propagation that might trigger card rotation
    // This is especially important for mobile
    return false;
  };

  // Get a random response from Gary
  const getRandomResponse = (responseType) => {
    const responses = GARY_RESPONSES[responseType];
    return responses[Math.floor(Math.random() * responses.length)];
  };

  // Handle user betting decision
  const handleDecision = async (pickId, decision) => {
    // Prevent multiple decisions on the same pick
    if (userDecisions[pickId]) {
      return;
    }
    
    try {
      // Get current user ID if logged in
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      
      // Save the decision using our tracking service
      const result = await betTrackingService.saveBetDecision(pickId, decision, userId);
      
      if (result.success) {
        // Get the updated decisions
        const decisions = betTrackingService.getBetDecisions();
        
        // Update the local state with the simplified version for checking disabled state
        const simplifiedDecisions = {};
        Object.keys(decisions).forEach(id => {
          simplifiedDecisions[id] = decisions[id].decision;
        });
        
        setUserDecisions(simplifiedDecisions);
        
        // Show toast notification with the appropriate response
        const response = getRandomResponse(decision);
        setToastMessage(response);
        setShowToast(true);
        
        // Log the decision for debugging
        console.log(`User ${decision === 'ride' ? 'rode with' : 'faded'} Gary on pick ${pickId}`);
        
        // Hide toast after 4 seconds
        setTimeout(() => {
          setShowToast(false);
        }, 4000);
        
        // Update user stats if available
        if (updateUserStats) {
          updateUserStats({
            action: decision === 'ride' ? 'rode_with_gary' : 'faded_gary',
            pickId
          });
        }
      }
    } catch (error) {
      console.error('Error processing bet decision:', error);
      setToastMessage('Something went wrong. Please try again.');
      setShowToast(true);
      
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    }
  };
  
  // Fetch picks function
  const fetchPicks = async () => {
    try {
      setLoading(true);
      setLoadError(null); // Reset any previous errors
      
      let dailyPicks;
      
      // Step 1: First check if picks exist in Supabase database (shared across all users)
      console.log('Checking for picks in Supabase database...');
      try {
        const dbPicks = await picksService.getDailyPicksFromDatabase();
        
        if (dbPicks) {
          console.log('Found picks in Supabase database - using shared picks');
          // Normalize the picks to ensure they have all required fields
          dailyPicks = dbPicks.map(pick => picksService.normalizePick(pick));
          
          // Also update local cache
          localStorage.setItem('dailyPicks', JSON.stringify(dailyPicks));
          
          // Use these shared picks from database and skip further processing
          console.log('Successfully loaded shared picks from database');
        } else {
          console.log('No picks found in database, checking local cache...');
          
          // Step 2: If no picks in database, check localStorage
          const savedPicks = localStorage.getItem('dailyPicks');
          
          if (savedPicks) {
            console.log('Using cached picks from localStorage');
            let parsedPicks = JSON.parse(savedPicks);
            
            // Fix for existing picks - normalize to ensure they have all required fields
            parsedPicks = parsedPicks.map(pick => picksService.normalizePick(pick));
            console.log('Normalized picks data for display');
            
            // Set picks from cache
            dailyPicks = parsedPicks;
          }
        }
      } catch (dbError) {
        console.error('Error retrieving picks from database:', dbError);
        // If database check fails, continue to try localStorage
        const savedPicks = localStorage.getItem('dailyPicks');
        
        if (savedPicks) {
          console.log('Using cached picks from localStorage as fallback');
          dailyPicks = JSON.parse(savedPicks).map(pick => picksService.normalizePick(pick));
        }
      }
      
      // Step 3: Check if we need to generate new picks based on schedule
      if (!dailyPicks) {
        console.log('No picks found in database or localStorage');
        
        // Check if it's time to generate new picks
        const shouldGenerate = schedulerService.shouldGenerateNewPicks();
        
        if (shouldGenerate) {
          // Step 4: Generate new picks
          console.log('Time to generate new picks...');
          
          // Check for required API keys
          const oddsApiKey = import.meta.env.VITE_ODDS_API_KEY;
          const deepseekApiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
          
          if (!oddsApiKey || !deepseekApiKey) {
            console.error('Missing required API keys. Picks cannot be generated.');
            setLoadError('API keys not configured. Please set up your environment variables.');
            setLoading(false);
            return;
          }
          
          try {
            // Generate new picks
            dailyPicks = await picksService.generateDailyPicks();
            
            // Mark that we've generated picks for today
            schedulerService.markPicksAsGenerated();
            
            // Save picks to Supabase database for sharing with other users
            console.log('Storing newly generated picks in Supabase database...');
            await picksService.storeDailyPicksInDatabase(dailyPicks);
            console.log('Successfully stored picks in database for sharing across users');
            
            // Also save to localStorage as a backup
            localStorage.setItem('dailyPicks', JSON.stringify(dailyPicks));
          } catch (generateError) {
            console.error('Error generating picks:', generateError);
            setLoadError(`Error generating picks: ${generateError.message}. No fallbacks will be used.`);
            setLoading(false);
            return;
          }
        } else {
          // It's not time to generate picks yet and no existing picks were found
          console.error('No picks found and not time to generate new ones');
          setLoadError('No picks available. Please try again later.');
          setLoading(false);
          return;
        }
      } else if (schedulerService.shouldGenerateNewPicks()) {
        // We have picks but it's time to generate new ones according to schedule
        console.log('We have picks but it\'s time to generate new ones');
        
        // Check if picks already exist in the database for today before generating
        const picksExistInDb = await picksService.checkPicksExistInDatabase();
        
        if (!picksExistInDb) {
          console.log('No picks exist in database for today - generating new ones');
          // Check for required API keys
          const oddsApiKey = import.meta.env.VITE_ODDS_API_KEY;
          const deepseekApiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
          
          if (oddsApiKey && deepseekApiKey) {
            try {
              // Generate new picks
              console.log('Generating fresh picks...');
              const newPicks = await picksService.generateDailyPicks();
              
              // Mark that we've generated picks for today
              schedulerService.markPicksAsGenerated();
              
              // Save to database for sharing
              await picksService.storeDailyPicksInDatabase(newPicks);
              
              // Update local cache
              localStorage.setItem('dailyPicks', JSON.stringify(newPicks));
              
              // Use the new picks
              dailyPicks = newPicks;
              console.log('Successfully generated and stored new picks');
            } catch (error) {
              console.error('Error generating new picks:', error);
              // Continue using the existing picks we already loaded
            }
          }
        } else {
          console.log('Picks already exist in database - retrieving latest version');
          // Retrieve latest picks from database to ensure we have the most up-to-date version
          try {
            const latestPicks = await picksService.getDailyPicksFromDatabase();
            if (latestPicks) {
              dailyPicks = latestPicks.map(pick => picksService.normalizePick(pick));
              localStorage.setItem('dailyPicks', JSON.stringify(dailyPicks));
            }
          } catch (error) {
            console.error('Error retrieving latest picks from database:', error);
            // Continue using existing picks
          }
        }
      }
      
      // If we get here, we have valid picks
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
      
      // Set loading to false now that we have the picks
      setLoading(false);
      
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
      setLoading(false);
      
      // Display error message - no fallbacks
      setLoadError(`Error fetching picks: ${error.message}. Please try again later.`);
      setPicks([]);
      setFlippedCards({});
      
      // Set next picks info
      setNextPicksInfo(schedulerService.getNextPicksInfo());
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
          ) : loadError ? (
            <div className="error-container">
              <p className="text-center text-[#d4af37] text-xl">{loadError}</p>
              <p className="text-center text-white text-sm mt-2">Please ensure your API keys are properly configured.</p>
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
                    data-pick-id={pick.id}
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
                              <div className="pick-card-matchup">{pick.shortGame || pick.game}</div>
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
                              e.preventDefault(); // Prevent any default action
                              toggleFlip(pick.id);
                            }}
                            data-pick-id={pick.id}
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
                          <div className="pick-card-matchup">{pick.shortGame || pick.game}</div>
                          <div className="pick-card-time">{pick.time}</div>
                        </div>
                        
                        {pick.league !== 'PARLAY' ? (
                          <div className="pick-card-content">
                            <div className="pick-card-bet-type">{pick.league === 'PARLAY' ? pick.betType : "Gary's Pick"}</div>
                            <div className="pick-card-bet">
                              {/* Format the pick display with odds included */}
                              {pick.shortPick || 
                               ((pick.betType && pick.betType.includes('Moneyline') && pick.moneyline) ? 
                                (() => {
                                  const odds = pick.odds || pick.moneylineOdds;
                                  const teamAbbr = picksService.abbreviateTeamName(pick.moneyline);
                                  return odds ? `${teamAbbr} (${odds})` : teamAbbr;
                                })() : 
                               (pick.betType && pick.betType.includes('Spread') && pick.spread) ? 
                                (() => {
                                  const parts = pick.spread.split(' ');
                                  const teamName = parts.slice(0, parts.length - 1).join(' ');
                                  const number = parts[parts.length - 1];
                                  const teamAbbr = picksService.abbreviateTeamName(teamName);
                                  const odds = pick.odds || pick.spreadOdds;
                                  return odds ? `${teamAbbr} ${number} (${odds})` : `${teamAbbr} ${number}`;
                                })() :
                               pick.overUnder ? 
                                (() => {
                                  const odds = pick.odds || pick.totalOdds;
                                  return odds ? `${pick.overUnder} (${odds})` : pick.overUnder;
                                })() :
                                (() => {
                                  const odds = pick.odds;
                                  return odds ? `${pick.pick || ''} (${odds})` : (pick.pick || `Over ${pick.game.split(' vs ')[0]}`);
                                })())}                               
                            </div>
                            {pick.result && pick.result !== 'pending' && (
                              <div className={`pick-result ${pick.result === 'WIN' ? 'win' : pick.result === 'LOSS' ? 'loss' : 'push'}`}>
                                <div className="result-label">{pick.result === 'WIN' ? '✓ WINNER' : pick.result === 'LOSS' ? '✗ INCORRECT' : 'PUSH'}</div>
                                {pick.finalScore && <div className="final-score">Final: {pick.finalScore}</div>}
                              </div>
                            )}
                            
                            {/* Gary's Analysis Section */}
                            <div className="gary-analysis">
                              {/* Title removed as requested */}
                              <div className="gary-analysis-content">
                                {(() => {
                                  const analysisText = pick.pickDetail || pick.analysis || "Gary is brewing up some expert analysis for this pick. Check back soon!";
                                  // Split by sentences or natural breaks
                                  const sentences = analysisText.split(/[.!?]\s+/).filter(s => s.trim().length > 0);
                                  // Create bullet points from sentences, cap total at 150 chars
                                  let totalChars = 0;
                                  const bulletPoints = [];
                                  
                                  for (let sentence of sentences) {
                                    // Clean and trim the sentence
                                    sentence = sentence.trim();
                                    // Check if adding this would exceed our limit
                                    if (totalChars + sentence.length > 150) {
                                      // If we're about to exceed, truncate and add ellipsis if needed
                                      const remainingChars = 150 - totalChars;
                                      if (remainingChars > 3) {
                                        bulletPoints.push(sentence.substring(0, remainingChars - 3) + '...');
                                      }
                                      break;
                                    }
                                    
                                    // Add bullet point and update character count
                                    bulletPoints.push(sentence);
                                    totalChars += sentence.length;
                                  }
                                  
                                  // If no sentences were found, add a default
                                  if (bulletPoints.length === 0 && analysisText.length > 0) {
                                    bulletPoints.push(analysisText.substring(0, 150));
                                  }
                                  
                                  return (
                                    <ul className="analysis-bullet-list">
                                      {bulletPoints.map((point, index) => (
                                        <li key={index}>{point}</li>
                                      ))}
                                    </ul>
                                  );
                                })()}
                              </div>
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
                        ) : (
                          /* Parlay of the Day content */
                          <div className="pick-card-content parlay-content">
                            <div className="parlay-header">
                              <div className="pick-card-bet-type">{`${pick.parlayLegs?.length || '3'}-Leg Parlay`}</div>
                              {pick.parlayOdds && (
                                <div className="parlay-odds">| Odds: {pick.parlayOdds}</div>
                              )}
                            </div>
                            
                            {/* Simplified Parlay Legs Display */}
                            {pick.parlayLegs && pick.parlayLegs.length > 0 && (
                              <div className="parlay-legs">
                                {pick.parlayLegs.map((leg, legIndex) => (
                                  <div key={legIndex} className="parlay-leg">
                                    <div className="parlay-leg-bullet">-</div>
                                    <div className="parlay-leg-pick">{leg.pick}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* No Gary's Analysis for Parlay - removed as requested */}
                            
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
                        )}
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
            <div className={`toast-message ${userDecisions[Object.keys(userDecisions)[Object.keys(userDecisions).length - 1]]}`}>
              {toastMessage}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default RealGaryPicks;
