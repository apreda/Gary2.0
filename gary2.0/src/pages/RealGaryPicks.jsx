/**
 * RealGaryPicks component
 * Displays Gary's daily betting picks
 */
import React, { useState, useEffect } from 'react';
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

// Styles
import '../styles/RealGaryPicks.css';

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
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [userDecisions, setUserDecisions] = useState({});
  const [nextPicksInfo, setNextPicksInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Define the loadPicks function - NO FALLBACKS, only real data from Supabase
  const loadPicks = async () => {
    setIsLoading(true);
    try {
      setLoading(true);
      setLoadError(null); // Reset any previous errors
      
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
        
        if (data && data.length > 0) {
          console.log(`Found ${data.length} picks in Supabase for today!`);
          
          // For each pick in the database result, we need to extract the picks array from the JSON
          let allPicks = [];
          
          // Loop through each row (usually just one)
          data.forEach(row => {
            if (row.picks && Array.isArray(row.picks)) {
              console.log(`Row has ${row.picks.length} picks`);
              allPicks = [...allPicks, ...row.picks];
            } else if (row.picks) {
              try {
                // Try to parse if it's a string
                const parsedPicks = JSON.parse(row.picks);
                if (Array.isArray(parsedPicks)) {
                  console.log(`Parsed ${parsedPicks.length} picks from JSON string`);
                  allPicks = [...allPicks, ...parsedPicks];
                }
              } catch (e) {
                console.error('Error parsing picks JSON:', e);
              }
            }
          });
          
          if (allPicks.length > 0) {
            console.log('Setting picks data from Supabase...');
            setPicks(allPicks);
            setLoading(false);
            setIsLoading(false);
            return;
          } else {
            console.log('No valid picks found in Supabase data');
          }
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
            setIsLoading(false);
          } catch (genError) {
            console.error('Error generating new picks:', genError);
            setLoadError('Unable to generate new picks. Please try again later.');
            setLoading(false);
            setIsLoading(false);
          }
        }
      } catch (supabaseError) {
        console.error('Error accessing Supabase:', supabaseError);
        setLoadError('Unable to access picks database. Please try again later.');
        setLoading(false);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error in loadPicks:', error);
      setLoadError('An unexpected error occurred. Please try again later.');
      setLoading(false);
      setIsLoading(false);
    }
  };
  
  // Force regenerate picks (used when user clicks force refresh button)
  const forceGeneratePicks = async () => {
    try {
      setLoading(true);
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
    const params = new URLSearchParams(location.search);
    // Using only URL parameters, not localStorage, to ensure consistency across all devices
    const shouldForceGenerate = params.get('forcePicks') === 'true';
    
    if (shouldForceGenerate) {
      console.log('Force generation flag detected, regenerating picks...');
      forceGeneratePicks();
    } else {
      loadPicks();
    }
  }, [location]);
  
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
    <div className="real-gary-picks">
      <HeaderNav title={pageTitle} indicators={indicators} />
      
      <div className="picks-container" {...swipeHandlers}>
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <div className="error-state">
            <p>{loadError}</p>
            <button onClick={() => loadPicks()}>Try Again</button>
          </div>
        ) : (
          visiblePicks.length > 0 ? (
            <div className="pick-card-container">
              {console.log('Rendering carousel with picks:', visiblePicks)}
              {console.log('Active card index:', activeCardIndex)}
              {visiblePicks.map((pick, index) => {
                // Validate each pick has the required data
                if (!pick || !pick.id) {
                  console.error('Invalid pick data:', pick);
                  return null;
                }
                console.log(`Rendering pick card ${index}:`, pick.id, 'isActive:', index === activeCardIndex);
                
                // Only render the active card
                if (index !== activeCardIndex) return null;
                
                return (
                  <PickCard
                    key={pick.id}
                    pick={pick}
                    isActive={true}
                    isFlipped={flippedCards[pick.id] || false}
                    onFlip={() => handleCardFlip(pick.id)}
                    onTrackBet={() => openBetTracker(pick)}
                    userDecision={userDecisions[pick.id] || null}
                  />
                );
              })}
              
              {reachedFreeLimit && activeCardIndex > 2 && (
                <FreePicksLimit onBack={() => setActiveCardIndex(0)} />
              )}
              
              {!reachedFreeLimit && (
                <div className="pick-navigation">
                  <button
                    className={`prev-pick ${activeCardIndex === 0 ? 'disabled' : ''}`}
                    onClick={handlePrevPick}
                    disabled={activeCardIndex === 0}
                  >
                    &lt;
                  </button>
                  <span className="pick-counter">
                    {activeCardIndex + 1} / {visiblePicks.length}
                  </span>
                  <button
                    className={`next-pick ${activeCardIndex === visiblePicks.length - 1 ? 'disabled' : ''}`}
                    onClick={handleNextPick}
                    disabled={activeCardIndex === visiblePicks.length - 1}
                  >
                    &gt;
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
      
      {nextPicksInfo && (
        <div className="next-picks-info">
          <p>{nextPicksInfo}</p>
        </div>
      )}
    </div>
  );
}

// Export changed to named export above
