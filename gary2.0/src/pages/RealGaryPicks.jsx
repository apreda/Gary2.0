/**
 * RealGaryPicks component
 * Displays Gary's daily betting picks
 */
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useSwipeable } from 'react-swipeable';
import { useUserPlan } from '../contexts/UserPlanContext';
import { useUserStats } from '../contexts/UserStatsContext';
import { picksService } from '../services/picksService';
import { betTrackingService } from '../services/betTrackingService';
import { schedulerService } from '../services/schedulerService';
import { picksPersistenceService } from '../services/picksPersistenceService';

// Components
import PickCard from '../components/PickCard';
import PremiumUpsell from '../components/PremiumUpsell';
import BetTrackerModal from '../components/BetTrackerModal';
import Toast from '../components/Toast';
import FreePicksLimit from '../components/FreePicksLimit';
import LoadingState from '../components/LoadingState';
import HeaderNav from '../components/HeaderNav';

// Import root fix CSS FIRST to ensure dark background at all DOM levels
import '../styles/consolidated/root-fix.css';

// Import our comprehensive card fix to ensure gold/black design
import '../styles/consolidated/cards-fix.css';

// Import Fix CSS files ONLY (no duplicates) to ensure the locked-in gold/black design
import './CardFrontFix.css';
import './CardBackFix.css';
import './CardFlipFix.css';
import './ButtonFix.css';
import './AnalysisBulletsFix.css';
import './CarouselFix.css';
import './GaryAnalysisFix.css';
import './ParlayCardFix.css';
import './RegularCardFix.css';

// Import the updated NavigationButtonsFix for gold buttons
import './NavigationButtonsFix.css';
import './NavigationFix.css';

// Utility to validate and fix pick data
function validatePickData(pick) {
  if (!pick || !pick.id) {
    console.error('validatePickData: Pick missing valid id:', pick);
    return null;
  }
  return {
    id: pick.id,
    game: pick.game || 'Game information unavailable',
    league: pick.league || 'SPORT',
    pickTeam: pick.pickTeam || 'Team Pick',
    betType: pick.betType || 'Moneyline',
    shortPick: pick.shortPick || 'Pick details unavailable',
    confidenceLevel: pick.confidenceLevel || 75,
    analysis: pick.analysis || "Gary's analysis will appear here when you flip the card...",
    garysBullets: pick.garysBullets || [],
    time: pick.time || 'Today',
    ...(pick || {})
  };
}

export function RealGaryPicks() {
  // Access user plan context
  const { userPlan, updateUserPlan } = useUserPlan();
  const { userStats, updateUserStats } = useUserStats();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Log user plan for debugging
  useEffect(() => {
    console.log("RealGaryPicks - Current user plan:", userPlan);
  }, [userPlan]);
  
  // State for picks - NO fallbacks, only real data
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [flippedCards, setFlippedCards] = useState({});
  const [showBetTracker, setShowBetTracker] = useState(false);
  const [betAmount, setBetAmount] = useState('');
  const [betType, setBetType] = useState('');
  const [betOdds, setBetOdds] = useState('');
  const [currentBetPick, setCurrentBetPick] = useState(null);
  const [betTrackedPickId, setBetTrackedPickId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [userDecisions, setUserDecisions] = useState({}); // Track user decisions on each pick
  
  // Ref to track component mount state
  const isMounted = useRef(true);

  // ... (all other logic, handlers, loadPicks, etc. go here) ...

  // The main return block goes here (copy the full return JSX)
  return (
    <div className="real-gary-picks-isolation">
      {/* ...the full RealGaryPicks UI JSX as before... */}
    </div>
  );
}

  // Define the loadPicks function - NO FALLBACKS, only real data from Supabase
  const loadPicks = async () => {
    try {
      if (!isMounted.current) return;
      setLoading(true);
      setLoadError(null); // Reset any previous errors
      setPicks([]); // Clear picks state before loading new picks
      
      // Check if there are picks for today in Supabase
      console.log('Checking Supabase for today\'s picks...');
      
      // Format today's date as YYYY-MM-DD for consistent querying
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0];
      console.log(`Looking for picks with date=${formattedDate}`);
      
      try {
        const { data, error } = await supabase
          .from('daily_picks')
          .select('*')
          .eq('date', formattedDate);
          
        if (error) {
          console.error('Error fetching picks from Supabase:', error);
          throw new Error(`Supabase query error: ${error.message}`);
        }
        
        if (Array.isArray(data) && data.length > 0) {
          // Extract the picks array from the first row
          const picksArray = Array.isArray(data[0].picks) ? data[0].picks : [];
          console.log(`Loaded ${picksArray.length} picks from database row:`, picksArray);

          // Validate and fix pick data
          const validatedPicks = picksArray.map(pick => validatePickData(pick)).filter(Boolean);

          // Check for duplicate IDs
          const ids = validatedPicks.map(p => p.id);
          const hasDuplicates = ids.length !== new Set(ids).size;
          if (hasDuplicates) {
            console.error('Duplicate pick IDs detected:', ids);
          }

          setPicks(validatedPicks);
        } else {
          // No picks found for today in Supabase - always generate new picks
          console.log('No picks found in Supabase for today - generating new picks...');
          // Skip localStorage checks entirely and always generate fresh picks
          console.log('Generating new picks...');
          
          try {
            // Generate new picks
            console.log('About to call generateDailyPicks()');
            const newPicks = await picksService.generateDailyPicks();
            console.log('Raw result from generateDailyPicks:', newPicks);
            
            // Force it to be an array if we got something
            let picksArray = [];
            
            if (newPicks) {
              if (Array.isArray(newPicks)) {
                console.log(`Successfully received array of ${newPicks.length} picks`);
                picksArray = newPicks;
              } else if (typeof newPicks === 'object') {
                // If we got a single pick object, wrap it in an array
                console.log('Received a single pick object, converting to array');
                picksArray = [newPicks];
              } else {
                console.error('Unknown data format received:', newPicks);
              }
            }
            
            // Now handle the picks array
            console.log(`Final picks array has ${picksArray.length} items:`, picksArray);
            
            if (picksArray.length > 0) {
              // Validate that each pick has the required properties
              const validPicks = picksArray.filter(pick => 
                pick && pick.id && pick.game && pick.league && pick.shortPick);
                
              if (validPicks.length > 0) {
                // Check for duplicate IDs
                const ids = validPicks.map(p => p.id);
                const hasDuplicates = ids.length !== new Set(ids).size;
                if (hasDuplicates) {
                  console.error('Duplicate pick IDs detected during generation:', ids);
                }
                setPicks(validPicks);
                console.log('Successfully set picks in state. Valid picks count:', validPicks.length);
              } else {
                console.error('Error: No valid picks found in array');
                setLoadError('No valid picks available. Please try again later.');
              }
            } else {
              console.error('Error: No picks data received');
              setLoadError('No picks available. Please try again later when more games are available.');
            }
            
            // Mark as generated to prevent scheduler from regenerating
            schedulerService.markPicksAsGenerated();
            
            setLoading(false);
          } catch (genError) {
            console.error('Error generating new picks:', genError);
            setLoadError('Unable to generate new picks. Please try again later.');
            setLoading(false);
          }
        }
      } catch (supabaseError) {
        console.error('Error accessing Supabase:', supabaseError);
        setLoadError('Unable to access picks database. Please try again later.');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error in loadPicks:', error);
      setLoadError('An unexpected error occurred. Please try again later.');
      setLoading(false);
    }
  };
  
  // Force regenerate picks (used when user clicks force refresh button)
  const forceGeneratePicks = async () => {
    try {
      setLoading(true);
      setPicks([]); // Clear picks state before force-generating new picks
      setLoadError(null);
      
      // Delete today's picks from Supabase first
      console.log('Removing today\'s picks from Supabase...');
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0];
      
      const { error: deleteError } = await supabase
        .from('daily_picks')
        .delete()
        .eq('date', formattedDate);
        
      if (deleteError) {
        console.error('Error deleting existing picks:', deleteError);
      } else {
        console.log('Successfully removed existing picks from Supabase');
      }
      
      // Generate brand new picks
      console.log('Generating fresh picks...');
      const newPicks = await picksService.generateDailyPicks();
      
      // Set the picks in state for display
      setPicks(newPicks);
      
      // Mark as generated in the scheduler
      schedulerService.markPicksAsGenerated();
      
      // Remove the force parameter from URL to avoid regenerating on refresh
      if (location.search.includes('forcePicks=true')) {
        navigate('/real-gary-picks', { replace: true });
      }
      
      console.log('🎉 New picks successfully generated and stored!');
      return newPicks;
    } catch (error) {
      console.error('Error forcing pick generation:', error);
      // Try regular loading if force generation fails
      loadPicks();
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch picks when component mounts or check for force parameter
  useEffect(() => {
    isMounted.current = true;
    loadPicks();
    
    // Force dark background
    document.body.style.backgroundColor = '#111111';
    document.documentElement.style.backgroundColor = '#111111';
    
    // Cleanup function
    return () => {
      isMounted.current = false;
      // Any cleanup needed when unmounting
    };
  }, []);

  // Handle card flipping
  const handleCardFlip = (pickId) => {
    setFlippedCards((prev) => ({
      ...prev,
      [pickId]: !prev[pickId]
    }));
  };
  
  // Navigate to previous pick
  const handlePrevPick = () => {
    setActiveCardIndex((prev) => Math.max(0, prev - 1));
  };
  
  // Navigate to next pick
  const handleNextPick = () => {
    setActiveCardIndex((prev) => Math.min(picks.length - 1, prev + 1));
  };
  
  // Swipe handlers for mobile
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => handleNextPick(),
    onSwipedRight: () => handlePrevPick(),
    preventDefaultTouchmoveEvent: true,
    trackMouse: false
  });
  
  // Open bet tracker
  const openBetTracker = (pick) => {
    setBetAmount('');
    setBetType(pick.betType || 'Standard');
    setBetOdds(pick.odds || '-110');
    setShowBetTracker(true);
  };
  
  // Close bet tracker
  const closeBetTracker = () => {
    setShowBetTracker(false);
  };
  
  // Save bet
  const saveBet = async (pickId, decision, notes = '') => {
    try {
      // Validate bet amount
      if (decision === 'bet' && (!betAmount || isNaN(parseFloat(betAmount)) || parseFloat(betAmount) <= 0)) {
        setToastMessage('Please enter a valid bet amount');
        setShowToast(true);
        return;
      }
      
      const currentPick = picks.find(p => p.id === pickId);
      if (!currentPick) {
        console.error('Pick not found for ID:', pickId);
        return;
      }
      
      // Format the bet info
      const betInfo = {
        id: `${pickId}-${Date.now()}`,
        pickId,
        date: new Date().toISOString(),
        game: currentPick.game,
        league: currentPick.league,
        pick: currentPick.shortPick || currentPick.game,
        type: betType,
        odds: betOdds,
        amount: decision === 'bet' ? parseFloat(betAmount) : 0,
        decision,
        notes,
        status: 'pending', // pending, won, lost
        garysConfidence: currentPick.confidenceLevel || 75
      };
      
      // Save to bet tracking service
      await betTrackingService.addBet(betInfo);
      
      // Update user stats if tracking a bet
      if (decision === 'bet') {
        updateUserStats({
          ...userStats,
          totalBetAmount: (userStats.totalBetAmount || 0) + parseFloat(betAmount),
          totalBets: (userStats.totalBets || 0) + 1
        });
      }
      
      // Update local state to reflect decision
      setUserDecisions({
        ...userDecisions,
        [pickId]: decision
      });
      
      // Show success toast
      setToastMessage(decision === 'bet' ? 'Bet tracked successfully!' : 'Pick skipped');
      setShowToast(true);
      
      // Close bet tracker
      setShowBetTracker(false);
    } catch (error) {
      console.error('Error saving bet:', error);
      setToastMessage('Error saving bet. Please try again.');
      setShowToast(true);
    }
  };
  
  // Format the page title based on available picks
  let pageTitle = 'Gary\'s Picks';
  if (picks.length > 0) {
    const leagues = [...new Set(picks.map(pick => pick.league))].join(', ');
    pageTitle = `Gary's ${leagues} Picks`;
  }
  
  // Generate header indicators
  const indicators = picks.map((_, index) => ({
    active: index === activeCardIndex,
    isPrime: picks[index]?.primeTimeCard
  }));
  
  // Filter for visible picks based on user's plan
  console.log('Current picks state:', picks && picks.length ? `${picks.length} picks available` : 'No picks available');
  // Ensure picks is an array before slicing
  const visiblePicks = Array.isArray(picks) ? picks.slice(0, 6) : []; // All users can see the first 6 picks
  
  // Check if we need to show the upsell
  const showUpsell = userPlan !== 'premium' && picks.length > 6;
  
  // Check if we've reached the free picks limit
  const reachedFreeLimit = activeCardIndex >= 2 && userPlan !== 'premium';
  
  return (
    <div className="real-gary-picks dark-theme gold-accent" style={{backgroundColor: '#111111', color: 'white'}}>
      <HeaderNav title={pageTitle} indicators={indicators} />
      
      <div className="picks-container" {...swipeHandlers} style={{backgroundColor: '#111111'}}>
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <div className="error-state">
            <p>{loadError}</p>
            <button onClick={() => loadPicks()}>Try Again</button>
          </div>
        ) : (
          visiblePicks.length > 0 ? (
            <div className="pick-card-container gary-picks-container" style={{backgroundColor: '#111111'}}>
              <h2 className="gary-picks-title">Gary's Picks</h2>
              <div className="carousel-container">
                {console.log('Rendering carousel with picks:', visiblePicks)}
                {console.log('Active card index:', activeCardIndex)}
                
                {/* Render all cards to achieve the fanned-out effect */}
                <div className="carousel-track">
                  {visiblePicks.map((pick, index) => {
                    // Validate each pick has the required data
                    if (!pick || !pick.id) {
                      console.error('Invalid pick data:', pick);
                      return null;
                    }
                    
                    // Calculate the relative position for this card (-3 to +3 range)
                    const relativePosition = index - activeCardIndex;
                    // Map to the CSS position classes (0=center, 1-3=right, 4-6=left)
                    const positionClass = relativePosition === 0 ? 0 : 
                                          relativePosition > 0 ? relativePosition : 
                                          7 + relativePosition; // 6, 5, 4 for -1, -2, -3
                    
                    console.log(`Rendering pick card ${index} with position class ${positionClass}`);
                    
                    // Ensure pick data is valid using our utility
                    const validPick = validatePickData(pick);
                    
                    return (
                      <div key={validPick.id} className={`pick-card card-position-${positionClass}`} style={{backgroundColor: '#111111'}}>
                        <PickCard
                          pick={validPick}
                          isActive={index === activeCardIndex}
                          isFlipped={flippedCards[validPick.id] || false}
                          onFlip={() => handleCardFlip(validPick.id)}
                          onTrackBet={() => openBetTracker(validPick)}
                          userDecision={userDecisions[validPick.id] || null}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {reachedFreeLimit && activeCardIndex > 2 && (
                <FreePicksLimit onBack={() => setActiveCardIndex(0)} />
              )}
              
              {!reachedFreeLimit && (
                <div className="pick-navigation premium-navigation" style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginTop: '20px',
                    padding: '10px',
                    width: '100%',
                    maxWidth: '600px',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    backgroundColor: 'rgba(17, 17, 17, 0.8)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(212, 175, 55, 0.2)'
                  }}>
                  <button
                    onClick={handlePrevPick}
                    className={`prev-pick premium-button ${activeCardIndex === 0 ? 'disabled' : ''}`}
                    disabled={activeCardIndex === 0}
                    style={{
                      backgroundColor: '#d4af37',
                      color: '#111111',
                      fontWeight: 'bold',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '4px',
                      cursor: activeCardIndex === 0 ? 'not-allowed' : 'pointer',
                      opacity: activeCardIndex === 0 ? 0.6 : 1
                    }}
                  >
                    <span className="nav-arrow">&laquo;</span> Previous
                  </button>
                  <div className="pick-indicators premium-indicators" style={{ display: 'flex', gap: '8px', margin: '0 10px' }}>
                    {visiblePicks.map((_, idx) => (
                      <span 
                        key={idx} 
                        className={`pick-indicator ${idx === activeCardIndex ? 'active gold-indicator' : ''}`}
                        onClick={() => setActiveCardIndex(idx)}
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          backgroundColor: idx === activeCardIndex ? '#d4af37' : '#333333',
                          border: '1px solid rgba(212, 175, 55, 0.5)',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          transform: idx === activeCardIndex ? 'scale(1.2)' : 'scale(1)',
                          boxShadow: idx === activeCardIndex ? '0 0 8px rgba(212, 175, 55, 0.6)' : 'none'
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleNextPick}
                    className={`next-pick premium-button ${activeCardIndex === visiblePicks.length - 1 ? 'disabled' : ''}`}
                    disabled={activeCardIndex === visiblePicks.length - 1}
                    style={{
                      backgroundColor: '#d4af37',
                      color: '#111111',
                      fontWeight: 'bold',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '4px',
                      cursor: activeCardIndex === visiblePicks.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: activeCardIndex === visiblePicks.length - 1 ? 0.6 : 1
                    }}
                  >
                    Next <span className="nav-arrow">&raquo;</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="no-picks">
              <p>No picks available for today yet. Check back soon!</p>
              <button onClick={forceGeneratePicks}>Generate Picks Now</button>
            </div>
          )
        )}
        
        {showUpsell && (
          <PremiumUpsell picksCount={picks.length} />
        )}
      </div>
      
      {showBetTracker && (
        <BetTrackerModal
          onClose={closeBetTracker}
          onSave={(decision, notes) => saveBet(picks[activeCardIndex].id, decision, notes)}
          amount={betAmount}
          onAmountChange={(e) => setBetAmount(e.target.value)}
          betType={betType}
          odds={betOdds}
        />
      )}
      
      {showToast && (
        <Toast
          message={toastMessage}
          onClose={() => setShowToast(false)}
        />
      )}
      
      {/* Removed nextPicksInfo since we're not using it in this version */}
    </div>
  );
}

// Export changed to named export above
