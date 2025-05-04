import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUserStats } from "../hooks/useUserStats";
import { useUserPlan } from "../hooks/useUserPlan";
import { BetCard } from './BetCard';
import { useToast } from '../components/ui/ToastProvider';
import gary1 from '../assets/images/gary1.svg';
import { useAuth } from '../contexts/AuthContext';
import '../styles/PickCardGlow.css'; // Import the glow effect CSS

// Modern UI no longer uses retro styles

// Only import assets we actually need for the modern dark UI design
import GaryEmblem from '../assets/images/Garyemblem.png';
// Using coin image from public directory to avoid build issues

// Import services
import { picksService } from '../services/picksService';
// schedulerService removed - no longer needed
import { resultsService } from '../services/resultsService';
import { betTrackingService } from '../services/betTrackingService';
import { picksPersistenceService } from '../services/picksPersistenceService';
import { supabase, ensureAnonymousSession } from '../supabaseClient';

function RealGaryPicks() {
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const { userPlan } = useUserPlan();
  const navigate = useNavigate();

  // State for cards loaded from the database
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // State to track which cards are flipped
  const [flippedCards, setFlippedCards] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  
  // State for bet tracking
  const [showBetTracker, setShowBetTracker] = useState(false);
  const [activePick, setActivePick] = useState(null);

  // Toast notification system
  const showToast = useToast();
  
  // Debug logs for troubleshooting
  useEffect(() => {
    console.log('[RealGaryPicks] picks:', picks);
    console.log('[RealGaryPicks] loading:', loading);
    console.log('[RealGaryPicks] error:', error);
  }, [picks, loading, error]);

  // Load picks from Supabase - specifically for today's date
  const loadPicks = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get today's date in YYYY-MM-DD format for database query
      const today = new Date().toISOString().split('T')[0];
      console.log(`Looking for picks specifically for today (${today})`);
      
      // Query Supabase for picks with today's date only
      const { data, error: fetchError } = await supabase
        .from('daily_picks')
        .select('picks, date')
        .eq('date', today)
        .maybeSingle(); // Use maybeSingle to avoid 406 errors
      
      // Log the result for debugging - explicitly show the date we checked
      console.log(`Supabase fetch result for ${today}:`, { data, fetchError });

      // Parse picks column if it's a string
      let picksArray = [];
      if (data && data.picks) {
        picksArray = typeof data.picks === 'string' ? JSON.parse(data.picks) : data.picks;
        
        // The picks now use the OpenAI output format directly
        // Each pick should have: pick, type, confidence, rationale fields
        picksArray = picksArray
          // Filter out any emergency picks or invalid picks
          .filter(pick => {
            // Skip any picks with emergency in the ID
            if (pick.id && pick.id.includes('emergency')) {
              console.log('Skipping emergency pick:', pick.id);
              return false;
            }
            
            // Skip any picks without a proper pick field (OpenAI format)
            if (!pick.pick || pick.pick === '') {
              console.log('Skipping pick with missing pick field:', pick.id);
              return false;
            }
            
            // Skip any picks without a rationale (OpenAI format)
            if (!pick.rationale || pick.rationale === '') {
              console.log('Skipping pick with missing rationale field:', pick.id);
              return false;
            }
            
            return true;
          })
          .map(pick => {
            console.log('Processing valid pick from Supabase:', pick);
            
            // Create a pick object with BOTH original OpenAI fields AND mapped fields
            // Parse and extract the necessary fields for our card implementation
            const simplePick = {
              id: pick.id || `pick-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              
              // Include original OpenAI format fields
              pick: pick.pick || '',          // Original OpenAI field for the bet
              rationale: pick.rationale || '', // Original OpenAI field for analysis
              
              // Map and normalize data fields for consistent display
              shortPick: pick.pick || '',     // For front of card 
              description: pick.rationale || '', // For back of card
              
              // Essential metadata
              game: pick.game || '',
              league: pick.league || '',
              confidence: pick.confidence || 0,
              time: pick.time || '',
              
              // CRITICAL: Include homeTeam and awayTeam fields for display
              homeTeam: pick.homeTeam || '',
              awayTeam: pick.awayTeam || '',
              
              // Additional OpenAI output fields
              type: pick.type || 'Moneyline',
              trapAlert: pick.trapAlert || false,
              revenge: pick.revenge || false,
              momentum: pick.momentum || 0
            };
            
            console.log('Valid pick ready for rendering:', simplePick);
            return simplePick;
        });
      }
      console.log('Parsed and enhanced picksArray:', picksArray);

      // Check if we have picks for today - either from database error or empty array
      if (fetchError || !picksArray.length) {
        const today = new Date().toISOString().split('T')[0];
        console.log(`No valid picks found for ${today}, attempting to generate new ones`);
        
        try {
          // Show loading state during generation
          setLoading(true);
          
          // Delete any old picks for today (cleanup)
          console.log('Cleaning up any existing picks for today before generating new ones');
          await supabase
            .from('daily_picks')
            .delete()
            .eq('date', today);
            
          // Since we don't have picks, generate some
          console.log('Generating new picks via picksService.generateDailyPicks()...');
          const generatedPicks = await picksService.generateDailyPicks();
          
          // The generateDailyPicks returns an array of picks
          // It also automatically stores them in Supabase now
          if (generatedPicks && Array.isArray(generatedPicks) && generatedPicks.length > 0) {
            console.log(`Successfully generated ${generatedPicks.length} new picks!`);
            
            // Use the EXACT OpenAI output format without any transformation
            // This preserves the exact structure needed for our card implementation
            setPicks(generatedPicks.map(pick => {
              // Extract the raw OpenAI response data
              const rawOutput = pick.rawAnalysis || pick;
              
              // Add a minimal required ID field for React keys
              return {
                // The only additional field we need to add is the ID
                id: pick.id,
                
                // Directly use all OpenAI output fields exactly as received
                pick: rawOutput.pick,
                type: rawOutput.type || 'moneyline',
                confidence: rawOutput.confidence,
                rationale: rawOutput.rationale,
                trapAlert: rawOutput.trapAlert || false,
                revenge: rawOutput.revenge || false,
                momentum: rawOutput.momentum || 0,
                
                // CRITICAL: Use OpenAI league and time formats directly
                // This ensures fields like league="MLB" (not "baseball_mlb") 
                // and time="10:05 PM ET" are preserved exactly
                homeTeam: rawOutput.homeTeam || pick.home_team || '',
                awayTeam: rawOutput.awayTeam || pick.away_team || '',
                league: rawOutput.league || pick.league || '',
                time: rawOutput.time || pick.time || ''
              };
            }));
            setLoading(false); // We have picks now
            return; // Exit early since we already have the picks
          }
          
          // Fallback path - try to reload from database if generation returned nothing
          console.log('Checking database for picks after generation attempt...');
          const { data: freshData } = await supabase
            .from('daily_picks')
            .select('picks, date')
            .eq('date', today)
            .maybeSingle();
            
            if (freshData && freshData.picks) {
            // Process picks again
            picksArray = typeof freshData.picks === 'string' ? 
              JSON.parse(freshData.picks) : freshData.picks;
              
            // Apply the same filtering to remove any emergency picks
            picksArray = picksArray.filter(pick => {
              return pick.id && !pick.id.includes('emergency') && 
                    pick.pick && pick.pick !== '' &&
                    pick.rationale && pick.rationale !== '';
            });
          }
        } catch (genError) {
          console.error('Error generating picks:', genError);
          setError('Failed to generate picks. Please try again later.');
        }
      } else {
        // We have picks from the database
        console.log('Using picks from database:', picksArray);
        setPicks(picksArray);
      }
    } catch (err) {
      console.error('Error loading picks:', err);
      setError('Failed to load picks. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPicks();
  }, []);

  // Get visible picks based on user plan
  const visiblePicks = picks.slice(0, userPlan === 'premium' ? picks.length : 1);
  const pageTitle = visiblePicks.length
    ? `Gary's ${[...new Set(visiblePicks.map(function(p) { return p.league; }))].join(', ')} Picks`
    : "Gary's Picks";

  /**
   * Handler called when a user makes a bet/fade decision in PickCard.
   * Triggers reload of picks/user stats and logs for debugging.
   */
  const handleDecisionMade = (decision, pick) => {
    console.log('[RealGaryPicks] handleDecisionMade', { decision, pick });
    // Reload picks if necessary
    loadPicks();
    // Increment reloadKey to force BetCard to reload
    setReloadKey(prev => {
      const newKey = prev + 1;
      console.log('[RealGaryPicks] reloadKey incremented', newKey);
      return newKey;
    });
  };

  // Function to handle bet tracking
  const handleTrackBet = (pickId) => {
    setUserDecisions(prev => ({
      ...prev,
      [pickId]: 'bet'
    }));
  };

  // Function to handle skipping a pick
  const handleSkipPick = (pickId) => {
    setUserDecisions(prev => ({
      ...prev,
      [pickId]: 'skip'
    }));
  };

  // This function was removed as it's redundant with nextPick/prevPick
  
  // Functions to navigate between picks
  const nextPick = () => {
    if (animating || picks.length <= 1) return;
    
    setAnimating(true);
    // Move current card to the back of the stack
    const newIndex = (currentIndex + 1) % picks.length;
    
    // Reset the flipped state when changing cards
    setFlippedCards(prev => {
      const newState = {...prev};
      Object.keys(newState).forEach(key => {
        newState[key] = false;
      });
      return newState;
    });
    
    // After animation completes
    setTimeout(() => {
      setCurrentIndex(newIndex);
      setAnimating(false);
    }, 500);
  };

  const prevPick = () => {
    if (animating || picks.length <= 1) return;
    
    setAnimating(true);
    // Move to previous card
    const newIndex = (currentIndex - 1 + picks.length) % picks.length;
    
    // Reset the flipped state when changing cards
    setFlippedCards(prev => {
      const newState = {...prev};
      Object.keys(newState).forEach(key => {
        newState[key] = false;
      });
      return newState;
    });
    
    // After animation completes
    setTimeout(() => {
      setCurrentIndex(newIndex);
      setAnimating(false);
    }, 500);
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Modern dark UI background */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
          background: 'linear-gradient(135deg, #121212 0%, #1e1e1e 100%)',
          overflow: 'hidden',
        }}
      >
        {/* Subtle gradient overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(40, 40, 50, 0.4) 0%, rgba(20, 20, 25, 0.2) 50%, rgba(10, 10, 15, 0.1) 100%)',
          opacity: 0.6,
        }} />
        
        {/* Abstract shapes for visual interest */}
        <div style={{
          position: 'absolute',
          top: '10%',
          left: '5%',
          width: '20vw',
          height: '20vw',
          borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
          background: 'rgba(191, 161, 66, 0.03)',
          filter: 'blur(40px)',
          zIndex: 1,
        }} />
        
        <div style={{
          position: 'absolute',
          bottom: '15%',
          right: '10%',
          width: '25vw',
          height: '25vw',
          borderRadius: '63% 37% 30% 70% / 50% 45% 55% 50%',
          background: 'rgba(191, 161, 66, 0.02)',
          filter: 'blur(50px)',
          zIndex: 1,
        }} />
        
        {/* Vignette for depth */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(0, 0, 0, 0.6) 100%)',
          zIndex: 2,
        }} />
      </div>
      {/* Main content, zIndex: 2 */}
      <div className="w-full flex flex-col items-center justify-center py-6 px-4 relative" style={{ minHeight: '100vh', zIndex: 2 }}>
        <>
          {loading ? (
            <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: '#121212', border: '3px solid #d4af37' }}>
              <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#d4af37' }}>
                <h3 className="font-bold text-black">LOADING...</h3>
              </div>
              <p className="text-yellow-500 mb-4">Please wait while we load the picks...</p>
            </div>
          ) : error ? (
            <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: '#121212', border: '3px solid #d4af37' }}>
              <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#d4af37' }}>
                <h3 className="font-bold text-black">ERROR</h3>
              </div>
              <p className="text-red-500 mb-4">{error}</p>
              <button 
                onClick={loadPicks} 
                className="px-4 py-2 font-bold uppercase text-black rounded" 
                style={{ backgroundColor: '#ffc107', border: '2px solid black' }}
              >
                GENERATE NEW PICKS
              </button>
            </div>
          ) : picks.length === 0 ? (
            null
          ) : (
            <div>
              {activeTab === 'today' && (
                <div className="mb-12">
                  {/* NEW LAYOUT: Directly on page in a horizontal row format */}
                  <div className="pt-12 px-4">
                    <h1 className="text-4xl font-bold text-center mb-8" style={{ color: '#b8953f' }}>
                      TODAY'S PICKS
                    </h1>
                    
                    {/* Card Stack Interface */}
                    <div className="flex justify-center items-center relative py-8">
                      {/* Left navigation arrow - positioned outside the card, no circle */}
                      <button 
                        className="absolute left-[-60px] z-50 text-[#d4af37] hover:text-white transition-all duration-300 bg-transparent"
                        onClick={prevPick}
                        disabled={animating || picks.length <= 1}
                        style={{ transform: 'translateY(-50%)', top: '50%' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                      </button>
                      
                      {/* Right navigation arrow - positioned outside the card, no circle */}
                      <button 
                        className="absolute right-[-60px] z-50 text-[#d4af37] hover:text-white transition-all duration-300 bg-transparent"
                        onClick={nextPick}
                        disabled={animating || picks.length <= 1}
                        style={{ transform: 'translateY(-50%)', top: '50%' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </button>
                      
                      {/* Card counter - repositioned below the card */}
                      <div className="absolute bottom-[-50px] left-0 right-0 text-center z-50">
                        <span className="px-4 py-2 bg-transparent text-lg text-[#d4af37] font-medium">
                          {picks.length > 0 ? `${currentIndex + 1} / ${picks.length}` : '0/0'}
                        </span>
                      </div>
                      
                      {/* Card Stack - Wider index card format (20% larger) */}
                      <div className="relative" style={{ width: '576px', height: '384px' }}>
                        {picks.map((pick, index) => {
                          // Calculate position in stack relative to current index
                          const position = (index - currentIndex + picks.length) % picks.length;
                          const isCurrentCard = index === currentIndex;
                          
                          // Style based on position in stack
                          const cardStyle = {
                            zIndex: picks.length - position,
                            transform: position === 0 
                              ? 'translateX(0) scale(1)' 
                              : position === 1 
                                ? 'translateX(10px) scale(0.95) translateY(10px)' 
                                : position === 2 
                                  ? 'translateX(20px) scale(0.9) translateY(20px)' 
                                  : 'translateX(30px) scale(0.85) translateY(30px)',
                            opacity: position <= 2 ? 1 - (position * 0.15) : 0,
                            pointerEvents: isCurrentCard ? 'auto' : 'none',
                            boxShadow: isCurrentCard ? '0 10px 25px rgba(0, 0, 0, 0.4)' : '0 5px 15px rgba(0, 0, 0, 0.3)',
                            transition: animating ? 'all 0.5s ease-in-out' : 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out'
                          };
                          
                          // Get the flipped state for this card
                          const isFlipped = flippedCards[pick.id] || false;
                          
                          // Function to toggle the flipped state for this specific card
                          const toggleFlip = (e) => {
                            if (animating) return;
                            e.stopPropagation();
                            setFlippedCards(prev => ({
                              ...prev,
                              [pick.id]: !prev[pick.id]
                            }));
                          };
                          
                          return (
                            <div 
                              key={pick.id} 
                              className="absolute top-0 left-0 pick-card-container"
                              style={cardStyle}
                            >
                              {/* Card container with flip effect */}
                              <div 
                                className="w-[576px] h-[384px] relative cursor-pointer" 
                                style={{
                                  perspective: '1000px',
                                }}
                                onClick={toggleFlip}
                              >
                                <div 
                                  style={{
                                    position: 'relative',
                                    width: '100%',
                                    height: '100%',
                                    transformStyle: 'preserve-3d',
                                    transition: 'transform 0.6s',
                                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                                  }}>
                                      {/* FRONT OF CARD - Modern Dark UI Design */}
                                      <div style={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        backfaceVisibility: 'hidden',
                                        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                        borderRadius: '16px',
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        overflow: 'hidden',
                                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                                        color: '#ffffff',
                                      }}>
                                        {/* Left side content */}
                                        <div style={{
                                           position: 'absolute',
                                           left: 0,
                                           top: 0,
                                           bottom: 0,
                                           width: '70%',
                                          padding: '1.5rem',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          justifyContent: 'space-between',
                                          overflow: 'hidden',
                                        }}>
                                          {/* League and Matchup in horizontal layout */}
                                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                            {/* League */}
                                            <div>
                                              <div style={{ 
                                                fontSize: '0.75rem', 
                                                opacity: 0.6, 
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em', 
                                                marginBottom: '0.25rem'
                                              }}>
                                                League
                                              </div>
                                              <div style={{ 
                                                fontSize: '1.25rem', 
                                                fontWeight: 600, 
                                                letterSpacing: '0.02em',
                                                opacity: 0.95
                                              }}>
                                                {pick.league || 'MLB'}
                                              </div>
                                            </div>
                                            
                                            {/* Matchup */}
                                            <div style={{ marginLeft: '20px' }}>
                                              <div style={{ 
                                                fontSize: '0.75rem', 
                                                opacity: 0.6, 
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em', 
                                                marginBottom: '0.25rem'
                                              }}>
                                                Matchup
                                              </div>
                                              <div style={{ 
                                                fontSize: '1.25rem', 
                                                fontWeight: 600,
                                                opacity: 0.9
                                              }}>
                                                {(pick.homeTeam && pick.awayTeam) ? 
                                                  `${pick.awayTeam.split(' ').pop()} @ ${pick.homeTeam.split(' ').pop()}` : 
                                                  (pick.game ? pick.game : 'TBD')}
                                              </div>
                                            </div>
                                          </div>
                                          
                                          {/* The main pick display */}
                                          <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ 
                                              fontSize: '0.75rem', 
                                              opacity: 0.6, 
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em', 
                                              marginBottom: '0.5rem'
                                            }}>
                                              Gary's Pick
                                            </div>
                                            <div style={{ 
                                              fontSize: '2rem', 
                                              fontWeight: 700, 
                                              lineHeight: 1.1,
                                              color: '#bfa142', /* Keeping gold color for the actual pick */
                                              wordBreak: 'break-word',
                                              marginBottom: '0.75rem'
                                            }}>
                                              {pick.pick || 'MISSING PICK'}
                                            </div>
                                            
                                            {/* Add a preview of the rationale on front card */}
                                            <div style={{
                                              fontSize: '0.85rem',
                                              opacity: 0.8,
                                              overflow: 'hidden',
                                              display: '-webkit-box',
                                              WebkitLineClamp: 3,
                                              WebkitBoxOrient: 'vertical',
                                              textOverflow: 'ellipsis',
                                              marginBottom: '0.5rem'
                                            }}>
                                              {pick.rationale ? pick.rationale.substring(0, 120) + '...' : 'Click for analysis'}
                                            </div>
                                          </div>
                                          
                                          {/* Bet or Fade Buttons */}
                                          <div>
                                            <div style={{ 
                                              fontSize: '0.75rem', 
                                              opacity: 0.6, 
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em', 
                                              marginBottom: '0.5rem'
                                            }}>
                                              Take Your Pick
                                            </div>
                                            <div style={{
                                              display: 'flex',
                                              gap: '0.75rem',
                                              width: '100%',
                                            }}>
                                              <button 
                                                style={{
                                                  background: 'rgba(191, 161, 66, 0.15)',
                                                  color: '#bfa142',
                                                  fontWeight: '600',
                                                  padding: '0.5rem 1rem',
                                                  borderRadius: '8px',
                                                  border: '1px solid rgba(191, 161, 66, 0.3)',
                                                  cursor: 'pointer',
                                                  flex: 1,
                                                  fontSize: '0.8rem',
                                                  letterSpacing: '0.05em',
                                                  textTransform: 'uppercase',
                                                  transition: 'all 0.2s ease'
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation(); // Prevent card flip
                                                  handleDecisionMade('bet', pick);
                                                }}
                                              >
                                                Bet
                                              </button>
                                              <button 
                                                style={{
                                                  background: 'rgba(255, 255, 255, 0.05)',
                                                  color: 'rgba(255, 255, 255, 0.8)',
                                                  fontWeight: '600',
                                                  padding: '0.5rem 1rem',
                                                  borderRadius: '8px',
                                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                                  cursor: 'pointer',
                                                  flex: 1,
                                                  fontSize: '0.8rem',
                                                  letterSpacing: '0.05em',
                                                  textTransform: 'uppercase',
                                                  transition: 'all 0.2s ease'
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation(); // Prevent card flip
                                                  handleDecisionMade('fade', pick);
                                                }}
                                              >
                                                Fade
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                        
                                        {/* Right side content - prominently elevated appearance */}
                                        <div style={{
                                            position: 'absolute',
                                            right: 0,
                                            top: 0,  /* Aligned to card edge */
                                            bottom: 0, /* Aligned to card edge */
                                            width: '30%',
                                            borderLeft: '2.25px solid #bfa142', /* Gold border */
                                            padding: '1.5rem 1rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            background: 'linear-gradient(135deg, rgba(55, 55, 58, 1) 0%, rgba(40, 40, 42, 0.95) 100%)', /* Much darker and more distinct */
                                            boxShadow: '-10px 0 15px rgba(0, 0, 0, 0.4)', /* Interior shadow only */
                                            borderRadius: '0 16px 16px 0', /* Rounded on right side only */
                                            clipPath: 'inset(0px 0px 0px -20px)', /* Clip shadow to prevent overflow */
                                            zIndex: 2, /* Ensure it appears above other content */
                                            transform: 'translateZ(10px)', /* 3D effect */
                                          }}>
                                           {/* Game time section */}
                                           <div style={{ 
                                             textAlign: 'center',
                                             marginBottom: '1rem'
                                           }}>
                                             <div style={{ 
                                               fontSize: '0.75rem', 
                                               opacity: 0.6, 
                                               textTransform: 'uppercase',
                                               letterSpacing: '0.05em', 
                                               marginBottom: '0.25rem'
                                             }}>
                                               Game Time
                                             </div>
                                             <div style={{ 
                                               fontSize: '1.125rem', 
                                               fontWeight: 600,
                                              opacity: 0.9
                                            }}>
                                              {pick.time ? 
                                                (function() {
                                                  let time = pick.time.includes('ET') ? pick.time : `${pick.time} ET`;
                                                  return time.replace(/:([0-9])\s/, ':0$1 ');
                                                })() : '10:10 PM ET'}
                                            </div>
                                          </div>
                                          
                                          {/* Coin Image centered - no background */}
                                          <div style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                            marginTop: 'auto',
                                            marginBottom: 'auto',
                                            background: 'transparent'
                                          }}>
                                            <img 
                                              src="/coin2.png" 
                                              alt="Coin Image"
                                              style={{
                                                width: 130, /* 20% bigger than previous 108px */
                                                height: 130, /* 20% bigger than previous 108px */
                                                objectFit: 'contain',
                                                opacity: 1,
                                                background: 'transparent'
                                              }}
                                            />
                                          </div>
                                          
                                          {/* Confidence score with visual indicator */}
                                          <div style={{ 
                                            textAlign: 'center',
                                            marginTop: '1rem',
                                            width: '100%'
                                          }}>
                                            <div style={{ 
                                              fontSize: '0.75rem', 
                                              opacity: 0.6, 
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em', 
                                              marginBottom: '0.25rem'
                                            }}>
                                              Confidence
                                            </div>
                                            
                                            {/* Confidence score display */}
                                            <div style={{
                                              fontSize: '1.2rem',
                                              fontWeight: 700,
                                              opacity: 0.95,
                                              color: '#bfa142', /* Gold for confidence */
                                              marginBottom: '0.5rem'
                                            }}>
                                              {typeof pick.confidence === 'number' ? 
                                                Math.round(pick.confidence * 100) + '%' : 
                                                (pick.confidence || '75%')}
                                            </div>
                                            
                                            {/* Click to flip instruction with subtle design */}
                                            <button style={{
                                              marginTop: '1rem',
                                              fontSize: '0.75rem',
                                              padding: '0.5rem 1rem',
                                              background: 'rgba(191, 161, 66, 0.15)',
                                              color: '#bfa142',
                                              border: 'none',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em',
                                              fontWeight: 500,
                                              transition: 'all 0.2s ease'
                                            }}>
                                              View Analysis
                                            </button>
                                          </div>
                                        </div>
                                        
                                        {/* Subtle gradient overlay for depth */}
                                        <div style={{
                                          position: 'absolute',
                                          inset: 0,
                                          background: 'radial-gradient(circle at center, transparent 60%, rgba(0,0,0,0.4) 140%)',
                                          opacity: 0.5,
                                          pointerEvents: 'none'
                                        }}></div>
                                      </div>
                                      
                                      {/* BACK OF CARD - ANALYSIS */}
                                      <div style={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        backfaceVisibility: 'hidden',
                                        transform: 'rotateY(180deg)',
                                        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                        borderRadius: '16px',
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        overflow: 'hidden',
                                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                                        color: '#ffffff',
                                        padding: '1.5rem',
                                      }}>
                                      {/* Card Header - Pick */}
                                      <div style={{ position: 'relative', width: '100%', marginBottom: '1.5rem' }}>
                                        {/* Pick Banner */}
                                        <div style={{ 
                                          backgroundColor: 'rgba(191, 161, 66, 0.15)',
                                          color: '#bfa142',
                                          fontWeight: 'bold',
                                          fontSize: '1.25rem',
                                          padding: '0.8rem 1rem',
                                          textAlign: 'center',
                                          letterSpacing: '0.05rem',
                                          textTransform: 'uppercase',
                                          borderRadius: '8px',
                                        }}>
                                          {pick.pick || 'GARY\'S PICK'}
                                        </div>
                                      </div>
                                      
                                      {/* Rationale Section - Further Expanded */}
                                       <div style={{ 
                                         flex: '1', 
                                         display: 'flex', 
                                         flexDirection: 'column',
                                         overflowY: 'auto',
                                         height: 'calc(100% - 80px)', /* Further increased to fill space where yellow bar was */
                                         marginBottom: '0', /* Removed margin to expand all the way */
                                     }}>
                                      {/* Main Analysis */}
                                      <div style={{ 
                                        backgroundColor: 'rgba(0, 0, 0, 0.2)', 
                                        padding: '1.75rem', 
                                        borderRadius: '0.75rem',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        fontSize: '1.1rem',  /* Increased font size */
                                        lineHeight: '1.7',   /* Increased line height */
                                        color: '#fff',
                                        width: '100%',
                                        height: '100%',     /* Take all available height */
                                        overflowY: 'auto',
                                      }}>
                                        {/* Rationale Heading */}
                                        <div style={{ 
                                          fontSize: '0.8rem', 
                                          opacity: 0.6, 
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em', 
                                          marginBottom: '0.75rem'
                                        }}>
                                          Rationale
                                        </div>
                                        
                                        {/* Display the rationale */}
                                        <p style={{ margin: 0, fontWeight: 400, opacity: 0.9 }}>
                                          {pick.rationale || 'Analysis not available.'}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {/* Removed Bet or Fade Buttons - now on front of card */}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Parlay card removed - no longer used */}
              {activeTab === 'history' && (
                <div className="mx-auto max-w-4xl mb-12" style={{ backgroundColor: '#121212', border: '3px solid #d4af37', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#d4af37', padding: '8px', textAlign: 'center' }}>
                    <h2 className="text-xl font-bold text-black">YOUR BETTING HISTORY</h2>
                  </div>
                  {user ? (
                    <div className="p-4" style={{ backgroundColor: '#f5f5dc' }}>
                      <BetCard reloadKey={reloadKey} />
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="mb-4" style={{ color: '#ffc107' }}>LOGIN TO VIEW YOUR BETTING HISTORY</p>
                      <button 
                        onClick={() => navigate('/login')} 
                        className="px-4 py-2 font-bold uppercase rounded"
                        style={{ backgroundColor: '#ffc107', color: 'black', border: '2px solid black' }}
                      >
                        LOGIN NOW
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      </div>
    </div>
  );
}

export default RealGaryPicks;
