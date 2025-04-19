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
  const [userDecisions, setUserDecisions] = useState({});
  const isMounted = useRef(true);

  // Fetch picks from Supabase or generate new
  const loadPicks = async () => {
    try {
      if (!isMounted.current) return;
      setLoading(true);
      setLoadError(null);
      setPicks([]);
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', formattedDate);
      if (error) {
        setLoadError('Unable to fetch picks.');
        setLoading(false);
        return;
      }
      if (Array.isArray(data) && data.length > 0) {
        const picksArray = Array.isArray(data[0].picks) ? data[0].picks : [];
        const validatedPicks = picksArray.map(pick => validatePickData(pick)).filter(Boolean);
        setPicks(validatedPicks);
      } else {
        // Generate new picks
        try {
          const newPicks = await picksService.generateDailyPicks();
          let picksArray = [];
          if (Array.isArray(newPicks)) {
            picksArray = newPicks;
          } else if (typeof newPicks === 'object') {
            picksArray = [newPicks];
          }
          const validPicks = picksArray.filter(pick => pick && pick.id && pick.game && pick.league && pick.shortPick);
          setPicks(validPicks);
        } catch (genError) {
          setLoadError('Unable to generate picks.');
        }
      }
      setLoading(false);
    } catch (error) {
      setLoadError('An unexpected error occurred.');
      setLoading(false);
    }
  };

  // Force generate picks
  const forceGeneratePicks = async () => {
    try {
      setLoading(true);
      setPicks([]);
      setLoadError(null);
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0];
      await supabase.from('daily_picks').delete().eq('date', formattedDate);
      const newPicks = await picksService.generateDailyPicks();
      setPicks(Array.isArray(newPicks) ? newPicks : [newPicks]);
      schedulerService.markPicksAsGenerated();
      if (location.search.includes('forcePicks=true')) {
        navigate('/real-gary-picks', { replace: true });
      }
    } catch {
      loadPicks();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    loadPicks();
    document.body.style.backgroundColor = '#111111';
    document.documentElement.style.backgroundColor = '#111111';
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleCardFlip = (pickId) => {
    setFlippedCards((prev) => ({ ...prev, [pickId]: !prev[pickId] }));
  };
  const handlePrevPick = () => setActiveCardIndex((prev) => Math.max(0, prev - 1));
  const handleNextPick = () => setActiveCardIndex((prev) => Math.min(picks.length - 1, prev + 1));
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => handleNextPick(),
    onSwipedRight: () => handlePrevPick(),
    preventDefaultTouchmoveEvent: true,
    trackMouse: false
  });
  const openBetTracker = (pick) => {
    setBetAmount('');
    setBetType(pick.betType || 'Standard');
    setBetOdds(pick.odds || '-110');
    setShowBetTracker(true);
  };
  const closeBetTracker = () => setShowBetTracker(false);
  const saveBet = async (pickId, decision, notes = '') => {
    try {
      if (decision === 'bet' && (!betAmount || isNaN(parseFloat(betAmount)) || parseFloat(betAmount) <= 0)) {
        setToastMessage('Please enter a valid bet amount');
        setShowToast(true);
        return;
      }
      const currentPick = picks.find(p => p.id === pickId);
      if (!currentPick) return;
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
        status: 'pending',
        garysConfidence: currentPick.confidenceLevel || 75
      };
      await betTrackingService.addBet(betInfo);
      if (decision === 'bet') {
        updateUserStats({
          ...userStats,
          totalBetAmount: (userStats.totalBetAmount || 0) + parseFloat(betAmount),
          totalBets: (userStats.totalBets || 0) + 1
        });
      }
      setUserDecisions({ ...userDecisions, [pickId]: decision });
      setToastMessage(decision === 'bet' ? 'Bet tracked successfully!' : 'Pick skipped');
      setShowToast(true);
      setShowBetTracker(false);
    } catch (error) {
      setToastMessage('Error saving bet. Please try again.');
      setShowToast(true);
    }
  };

  let pageTitle = "Gary's Picks";
  if (picks.length > 0) {
    const leagues = [...new Set(picks.map(pick => pick.league))].join(', ');
    pageTitle = `Gary's ${leagues} Picks`;
  }
  const indicators = picks.map((_, index) => ({
    active: index === activeCardIndex,
    isPrime: picks[index]?.primeTimeCard
  }));
  const visiblePicks = Array.isArray(picks) ? picks.slice(0, 6) : [];
  const showUpsell = userPlan !== 'premium' && picks.length > 6;
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
                <div className="carousel-track">
                  {visiblePicks.map((pick, index) => (
                    <PickCard
                      key={pick.id}
                      pick={pick}
                      flipped={!!flippedCards[pick.id]}
                      onFlip={() => handleCardFlip(pick.id)}
                      isActive={index === activeCardIndex}
                      onBet={() => openBetTracker(pick)}
                      decision={userDecisions[pick.id]}
                    />
                  ))}
                </div>
                <div className="carousel-nav">
                  <button
                    onClick={handlePrevPick}
                    className={`prev-pick premium-button ${activeCardIndex === 0 ? 'disabled' : ''}`}
                    disabled={activeCardIndex === 0}
                    style={{backgroundColor: '#d4af37', color: '#111111', fontWeight: 'bold', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: activeCardIndex === 0 ? 'not-allowed' : 'pointer', opacity: activeCardIndex === 0 ? 0.6 : 1}}
                  >
                    <span className="nav-arrow">&laquo;</span> Previous
                  </button>
                  <div className="pick-indicators premium-indicators" style={{ display: 'flex', gap: '8px', margin: '0 10px' }}>
                    {visiblePicks.map((_, idx) => (
                      <span 
                        key={idx} 
                        className={`pick-indicator ${idx === activeCardIndex ? 'active gold-indicator' : ''}`}
                        onClick={() => setActiveCardIndex(idx)}
                        style={{width: '12px', height: '12px', borderRadius: '50%', backgroundColor: idx === activeCardIndex ? '#d4af37' : '#333333', border: '1px solid rgba(212, 175, 55, 0.5)', cursor: 'pointer', transition: 'all 0.3s ease', transform: idx === activeCardIndex ? 'scale(1.2)' : 'scale(1)', boxShadow: idx === activeCardIndex ? '0 0 8px rgba(212, 175, 55, 0.6)' : 'none'}}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleNextPick}
                    className={`next-pick premium-button ${activeCardIndex === visiblePicks.length - 1 ? 'disabled' : ''}`}
                    disabled={activeCardIndex === visiblePicks.length - 1}
                    style={{backgroundColor: '#d4af37', color: '#111111', fontWeight: 'bold', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: activeCardIndex === visiblePicks.length - 1 ? 'not-allowed' : 'pointer', opacity: activeCardIndex === visiblePicks.length - 1 ? 0.6 : 1}}
                  >
                    Next <span className="nav-arrow">&raquo;</span>
                  </button>
                </div>
              </div>
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
    </div>
  );
}
  
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
