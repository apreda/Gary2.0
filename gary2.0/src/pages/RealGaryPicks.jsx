import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useUserStats } from "../hooks/useUserStats";
import { useUserPlan } from "../hooks/useUserPlan";
import ErrorBoundary from "../components/ErrorBoundary";
import gary1 from '../assets/images/gary1.svg';
import "./GaryPicksCarousel.css";
import "./CarouselFix.css";
import "./CardFlipFix.css";
import "./CardBackFix.css"; // New styles for card back elements
import "./ParlayCardFix.css"; // Special fixes for Parlay card
import "./ButtonFix.css"; // Fix button positioning
import "./ToastNotification.css"; // Toast notification styles
import "./RegularCardFix.css"; // Fix font sizing for regular cards
import "./GaryAnalysisFix.css"; // Enhanced styling for Gary's analysis
import "./AnalysisBulletsFix.css"; // Styling for the bulleted analysis format
// Note: All mobile-specific CSS and functionality has been removed
import { picksService } from '../services/picksService';
import { schedulerService } from '../services/schedulerService';
import { resultsService } from '../services/resultsService';
import { betTrackingService } from '../services/betTrackingService';
import { picksPersistenceService } from '../services/picksPersistenceService';
import { supabase, ensureAnonymousSession } from '../supabaseClient';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function RealGaryPicks() {
  // User plan and stats
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
  
  // Define the fetchPicks function - NO FALLBACKS, only real data from Supabase
  const fetchPicks = async () => {
    try {
      setLoading(true);
      setLoadError(null); // Reset any previous errors
      
      console.log('Starting fetchPicks with NO FALLBACKS');
      
      // Ensure we have an active Supabase connection
      console.log('Verifying Supabase connection...');
      try {
        // First ensure we have a valid anonymous session
        await ensureAnonymousSession();
      } catch (authError) {
        console.error('Error verifying Supabase connection:', authError);
      }
      
      // Get today's date for the query
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      console.log('Fetching picks for date:', dateString);
      
      try {
        // Query Supabase for today's picks
        const { data, error } = await supabase
          .from('daily_picks')
          .select('*')
          .eq('date', dateString)
          .maybeSingle();
        
        // DEBUGGING: Log the raw response from Supabase
        console.log('FETCHED FROM SUPABASE:', data, error);
        
        if (error) {
          console.error('Supabase fetch error details:', { 
            message: error.message, 
            code: error.code, 
            details: error.details,
            hint: error.hint
          });
          setPicks([]);
          setLoading(false);
          return;
        }
        
        // If we have valid picks in Supabase, use them
        if (data && data.picks && Array.isArray(data.picks) && data.picks.length > 0) {
          console.log('Found existing picks in Supabase for today:', data.picks.length);
          console.log('SETTING PICKS:', data.picks);
          setPicks(data.picks);
        } else {
          // Check if we're actually querying the right table structure
          console.log('Checking Supabase table structure...');
          const { data: tableData, error: tableError } = await supabase
            .from('daily_picks')
            .select('*')
            .limit(1);
            
          if (tableError) {
            console.error('Error querying Supabase table:', tableError);
          } else {
            console.log('Supabase table structure sample:', tableData);
          }
          
          console.log('NO PICKS FOUND IN SUPABASE, GENERATING NEW PICKS...');
          
          try {
            // Clear any potentially cached data
            localStorage.removeItem('lastPicksGenerationTime');
            localStorage.removeItem('dailyPicks');
            
            // Generate new picks with proper MLB formatting
            console.log('Generating new picks automatically...');
            const newPicks = await picksService.generateDailyPicks();
            console.log(`Generated ${newPicks.length} new picks`);
            
            // Mark as generated to prevent scheduler from regenerating
            schedulerService.markPicksAsGenerated();
            
            // Check if we have MLB picks and log them to verify formatting
            const mlbPicks = newPicks.filter(p => p.league === 'MLB' && p.betType && p.betType.includes('Moneyline'));
            if (mlbPicks.length > 0) {
              console.log('MLB Moneyline picks with correct formatting:');
              mlbPicks.forEach(pick => {
                console.log(`  ${pick.shortGame}: "${pick.shortPick}"`);
              });
            }
            
            console.log('Setting newly generated picks...');
            setPicks(newPicks);
          } catch (genError) {
            console.error('Error generating new picks:', genError);
            setPicks([]);
          }
        }
      } catch (supabaseError) {
        console.error('Error fetching from Supabase:', supabaseError);
        setPicks([]);
      }
    } catch (error) {
      console.error('Unexpected error in fetchPicks:', error);
      setPicks([]);
    } finally {
      setLoading(false);
    }
  };
  
  // State for error handling
  const [loadError, setLoadError] = useState(null);
  
  // Check if we should force generate new picks 
  const forceGeneratePicks = async () => {
    console.log('👉 FORCE GENERATING NEW PICKS...');
    setLoading(true);
    
    try {
      // Step 1: Clear localStorage cache
      console.log('Clearing localStorage cache...');
      localStorage.removeItem('lastPicksGenerationTime');
      localStorage.removeItem('dailyPicks');
      localStorage.removeItem('forceGeneratePicks'); // Clear the flag
      
      // Step 2: Clear today's picks from Supabase
      console.log('Removing today\'s picks from Supabase...');
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      const { error: deleteError } = await supabase
        .from('daily_picks')
        .delete()
        .eq('date', today);
        
      if (deleteError) {
        console.error('Error deleting existing picks:', deleteError);
      } else {
        console.log('Successfully removed existing picks from Supabase');
      }
      
      // Step 3: Generate new picks with proper MLB formatting
      console.log('Generating new picks...');
      const newPicks = await picksService.generateDailyPicks();
      console.log(`Generated ${newPicks.length} new picks`);
      
      // Step 4: Set the picks directly in our component
      setPicks(newPicks);
      
      // Step 5: Mark as generated to prevent scheduler from regenerating
      schedulerService.markPicksAsGenerated();
      
      // Check if we have MLB picks and log them to verify formatting
      const mlbPicks = newPicks.filter(p => p.league === 'MLB' && p.betType && p.betType.includes('Moneyline'));
      if (mlbPicks.length > 0) {
        console.log('MLB Moneyline picks with correct formatting:');
        mlbPicks.forEach(pick => {
          console.log(`  ${pick.shortGame}: "${pick.shortPick}"`);
        });
      }
      
      // Remove the force parameter from URL to avoid regenerating on refresh
      if (location.search.includes('forcePicks=true')) {
        navigate('/real-gary-picks', { replace: true });
      }
      
      console.log('🎉 New picks successfully generated and stored!');
      return newPicks;
    } catch (error) {
      console.error('Error forcing pick generation:', error);
      // Fall back to regular fetch if force generation fails
      fetchPicks();
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch picks when component mounts or check for force parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldForceGenerate = params.get('forcePicks') === 'true' || localStorage.getItem('forceGeneratePicks') === 'true';
    
    if (shouldForceGenerate) {
      console.log('Force generation flag detected, regenerating picks...');
      forceGeneratePicks();
    } else {
      fetchPicks();
    }
  }, [location]);
  
  // Handle card flipping
  const flipCard = (id) => {
    setFlippedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  
  // Navigation functions
  const goToPreviousCard = () => {
    setActiveCardIndex(prevIndex => {
      if (prevIndex === 0) {
        return picks.length - 1;
      } else {
        return prevIndex - 1;
      }
    });
  };
  
  const goToNextCard = () => {
    setActiveCardIndex(prevIndex => {
      if (prevIndex === picks.length - 1) {
        return 0;
      } else {
        return prevIndex + 1;
      }
    });
  };
  
  // Desktop-only implementation - no mobile touch handlers
  
  // Render the component
  return (
    <ErrorBoundary>
      <div className="gary-picks-page">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <div className="loading-text">Loading Gary's Picks...</div>
          </div>
        ) : loadError ? (
          <div className="error-container">
            <div className="error-icon">⚠️</div>
            <div className="error-message">{loadError}</div>
            <button className="retry-button" onClick={fetchPicks}>
              Retry
            </button>
          </div>
        ) : picks.length === 0 ? (
          <div className="no-picks-container">
            <div className="no-picks-icon">📊</div>
            <div className="no-picks-message">
              Gary is analyzing today's games. Check back soon for picks!
            </div>
            {nextPicksInfo && (
              <div className="next-picks-info">
                Next picks will be available {nextPicksInfo}
              </div>
            )}
            <button className="refresh-button" onClick={fetchPicks}>
              Refresh
            </button>
          </div>
        ) : (
          <div className="gary-picks-container">
            <div className="carousel-container">
              <button 
                className="carousel-arrow left" 
                onClick={goToPreviousCard}
                aria-label="Previous pick"
              >
                <span>&#10094;</span>
              </button>
              
              <div className="carousel-cards">
                {/* DEBUGGING: Log picks before rendering */}
                {console.log('RENDER PICKS:', picks)}
                
                {/* Render picks */}
                {picks.map((pick, index) => (
                  <div 
                    key={pick.id}
                    className={`pick-card card-position-${(index - activeCardIndex + 7) % 7} ${index === activeCardIndex ? 'active' : ''} ${flippedCards[pick.id] ? 'flipped' : ''} ${pick.league === 'PARLAY' ? 'parlay-card' : ''} ${pick.primeTimeCard ? 'prime-time-card' : ''} ${pick.silverCard ? 'silver-card' : ''}`}
                  >
                    <div className="pick-card-inner">
                        <div className="pick-card-front">
                          <div className="pick-card-header">
                            <div className="pick-card-league">{pick.league}</div>
                            <div className="pick-card-time">{pick.time}</div>
                          </div>
                          
                          <div className="pick-card-game">
                            {pick.league === 'PARLAY' ? 'PARLAY OF THE DAY' : pick.game}
                          </div>
                          
                          <div className="pick-card-center-content">
                            {pick.confidenceLevel && (
                              <div className="confidence-level">
                                <div className="confidence-label">Confidence</div>
                                <div className="confidence-value">{pick.confidenceLevel}%</div>
                              </div>
                            )}
                          </div>
                          
                          <div className="pick-card-bottom">
                            <button className="btn-view-pick" onClick={() => flipCard(pick.id)}>
                              View Pick
                            </button>
                          </div>
                          
                          {pick.league !== 'PARLAY' ? (
                            <div className="pick-card-content" style={{display: 'none'}}>
                              <div className="pick-card-bet-type">{pick.league === 'PARLAY' ? pick.betType : "Gary's Pick"}</div>
                              <div className="pick-card-bet">
                                {(() => {
                                  try {
                                    console.log(`Rendering pick: ${pick.id}, League: ${pick.league}`);
                                    console.log('Pick data:', pick);
                                    
                                    // PRIORITY 1: Use the shortPick directly from Supabase if available
                                    if (pick.shortPick && typeof pick.shortPick === 'string' && pick.shortPick.trim() !== '') {
                                      console.log(`Using existing shortPick: ${pick.shortPick}`);
                                      return pick.shortPick;
                                    }
                                    
                                    // PRIORITY 2: Use the pick field directly
                                    if (pick.pick && typeof pick.pick === 'string' && pick.pick.trim() !== '') {
                                      console.log(`Using pick field: ${pick.pick}`);
                                      return pick.pick;
                                    }
                                    
                                    // PRIORITY 3: For specific bet types, format them consistently
                                    if (pick.betType && pick.betType.includes('Spread') && pick.spread) {
                                      return pick.spread;
                                    } 
                                    else if (pick.betType && pick.betType.includes('Moneyline') && pick.moneyline) {
                                      return `${pick.moneyline} ML`;
                                    } 
                                    else if (pick.betType && pick.betType.includes('Total') && pick.overUnder) {
                                      return pick.overUnder;
                                    }
                                    else if (pick.league === 'PARLAY') {
                                      return 'PARLAY OF THE DAY';
                                    }
                                    
                                    // Last resort
                                    return 'NO PICK DATA';
                                  } catch (err) {
                                    console.error('Error rendering pick:', err);
                                    // Fallback to any available data
                                    return pick.shortPick || pick.pick || 'ERROR RENDERING PICK';
                                  }
                                })()}
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
                                    // First try to use garysBullets if available
                                    if (pick.garysBullets && Array.isArray(pick.garysBullets) && pick.garysBullets.length > 0) {
                                      return (
                                        <ul className="gary-bullets">
                                          {pick.garysBullets.map((bullet, i) => (
                                            <li key={i}>{bullet}</li>
                                          ))}
                                        </ul>
                                      );
                                    }
                                    
                                    // Otherwise use the analysis text
                                    const analysisText = pick.garysAnalysis || pick.analysis || pick.pickDetail || 'Gary is analyzing this pick.';
                                    
                                    // Split into paragraphs if it contains line breaks
                                    if (analysisText.includes('\n')) {
                                      return analysisText.split('\n').map((paragraph, i) => (
                                        <p key={i}>{paragraph}</p>
                                      ));
                                    }
                                    
                                    // Otherwise just return as a single paragraph
                                    return <p>{analysisText}</p>;
                                  })()}
                                </div>
                              </div>
                            </div>
                          ) : (
                          // Parlay Card Content
                          <div className="parlay-card-content">
                            <div className="parlay-card-title">PARLAY OF THE DAY</div>
                            {pick.parlayOdds && (
                              <div className="parlay-card-odds">
                                {pick.parlayOdds.startsWith('+') ? pick.parlayOdds : `+${pick.parlayOdds}`}
                              </div>
                            )}
                            
                            {pick.parlayLegs && pick.parlayLegs.length > 0 && (
                              <div className="parlay-legs">
                                {pick.parlayLegs.map((leg, legIndex) => (
                                  <div key={legIndex} className="parlay-leg">
                                    <div className="parlay-leg-header">
                                      <div className="parlay-leg-league">{leg.league}</div>
                                      <div className="parlay-leg-game">{leg.game}</div>
                                    </div>
                                    <div className="parlay-leg-pick">
                                      {leg.pick || `${leg.team || leg.moneyline} ML ${leg.odds || ''}`}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Gary's Analysis for Parlay */}
                            <div className="gary-analysis parlay-analysis">
                              <div className="gary-analysis-content">
                                {pick.garysAnalysis || pick.analysis || 'Gary has combined these picks for maximum value.'}
                              </div>
                            </div>
                            
                            {/* Confidence Level for Parlay */}
                            {pick.confidenceLevel && (
                              <div className="confidence-level">
                                <div className="confidence-label">Confidence</div>
                                <div className="confidence-meter">
                                  <div 
                                    className="confidence-fill" 
                                    style={{ width: `${pick.confidenceLevel}%` }}
                                  ></div>
                                </div>
                                <div className="confidence-value">{pick.confidenceLevel}%</div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* No footer on front side - using View Pick button instead */}
                      </div>
                      
                      <div className="pick-card-back">
                        <div className="pick-card-back-header">
                          <div className="pick-card-league">{pick.league}</div>
                          <div className="pick-card-time">{pick.time}</div>
                        </div>
                        
                        <div className="pick-card-back-content">
                          {pick.league !== 'PARLAY' ? (
                            <>
                              <div className="pick-card-heading">Gary's Analysis</div>
                              
                              <div className="pick-card-game-details">
                                <div className="pick-game">{pick.game}</div>
                                <div className="pick-selection">
                                  {(() => {
                                    try {
                                      // PRIORITY 1: Use the shortPick directly from Supabase if available
                                      if (pick.shortPick && typeof pick.shortPick === 'string' && pick.shortPick.trim() !== '') {
                                        return pick.shortPick;
                                      }
                                      
                                      // PRIORITY 2: Use the pick field directly
                                      if (pick.pick && typeof pick.pick === 'string' && pick.pick.trim() !== '') {
                                        return pick.pick;
                                      }
                                      
                                      // PRIORITY 3: For specific bet types, format them consistently
                                      if (pick.betType && pick.betType.includes('Spread') && pick.spread) {
                                        return pick.spread;
                                      } 
                                      else if (pick.betType && pick.betType.includes('Moneyline') && pick.moneyline) {
                                        return `${pick.moneyline} ML`;
                                      } 
                                      else if (pick.betType && pick.betType.includes('Total') && pick.overUnder) {
                                        return pick.overUnder;
                                      }
                                      
                                      // Last resort
                                      return 'NO PICK DATA';
                                    } catch (err) {
                                      console.error('Error rendering pick:', err);
                                      // Fallback to any available data
                                      return pick.shortPick || pick.pick || 'ERROR RENDERING PICK';
                                    }
                                  })()}
                                </div>
                              </div>
                              
                              <div className="pick-analysis-content">
                                {(() => {
                                  // First try to use garysBullets if available
                                  if (pick.garysBullets && Array.isArray(pick.garysBullets) && pick.garysBullets.length > 0) {
                                    return (
                                      <ul className="gary-bullets">
                                        {pick.garysBullets.map((bullet, i) => (
                                          <li key={i}>{bullet}</li>
                                        ))}
                                      </ul>
                                    );
                                  }
                                  
                                  // Otherwise use the analysis text
                                  const analysisText = pick.garysAnalysis || pick.analysis || pick.pickDetail || 'Gary is analyzing this pick.';
                                  
                                  // Split into paragraphs if it contains line breaks
                                  if (analysisText.includes('\n')) {
                                    return analysisText.split('\n').map((paragraph, i) => (
                                      <p key={i}>{paragraph}</p>
                                    ));
                                  }
                                  
                                  // Otherwise just return as a single paragraph
                                  return <p>{analysisText}</p>;
                                })()}
                              </div>
                              
                              <div className="decision-buttons">
                                <button 
                                  className="btn-bet-with-gary"
                                  onClick={() => trackUserDecision(pick.id, 'bet', pick.league)}
                                >
                                  Bet with Gary
                                </button>
                                <button 
                                  className="btn-fade-the-bear"
                                  onClick={() => trackUserDecision(pick.id, 'fade', pick.league)}
                                >
                                  Fade the Bear
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="pick-card-heading">PARLAY OF THE DAY</div>
                              
                              <div className="parlay-odds-display">
                                {pick.parlayOdds && (
                                  <div className="parlay-odds">
                                    {pick.parlayOdds.startsWith('+') ? pick.parlayOdds : `+${pick.parlayOdds}`}
                                  </div>
                                )}
                              </div>
                              
                              <div className="pick-analysis-content">
                                <p>{pick.garysAnalysis || pick.analysis || 'Gary has combined these picks for maximum value.'}</p>
                              </div>
                              
                              {pick.parlayLegs && pick.parlayLegs.length > 0 && (
                                <div className="parlay-legs-container">
                                  <div className="parlay-legs-heading">Parlay Legs</div>
                                  {pick.parlayLegs.map((leg, legIndex) => (
                                    <div key={legIndex} className="parlay-leg">
                                      <div className="leg-game">{leg.game}</div>
                                      <div className="leg-pick">
                                        {leg.pick || `${leg.team || leg.moneyline} ML ${leg.odds || ''}`}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              <div className="decision-buttons">
                                <button 
                                  className="btn-bet-with-gary"
                                  onClick={() => trackUserDecision(pick.id, 'bet', 'PARLAY')}
                                >
                                  Bet with Gary
                                </button>
                                <button 
                                  className="btn-fade-the-bear"
                                  onClick={() => trackUserDecision(pick.id, 'fade', 'PARLAY')}
                                >
                                  Fade the Bear
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        
                        <div className="pick-card-bottom">
                          <button 
                            className="btn-flip-back"
                            onClick={() => flipCard(pick.id)}
                            aria-label="Flip card back"
                          >
                            Return to Card
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <button 
                className="carousel-arrow right" 
                onClick={goToNextCard}
                aria-label="Next pick"
              >
                <span>&#10095;</span>
              </button>
            </div>
            
            <div className="carousel-dots">
              {picks.map((_, index) => (
                <span 
                  key={index} 
                  className={`dot ${index === activeCardIndex ? 'active' : ''}`}
                  onClick={() => setActiveCardIndex(index)}
                ></span>
              ))}
            </div>
          </div>
        )}
        
        {/* Toast notification */}
        {showToast && (
          <div className="toast-notification">
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
