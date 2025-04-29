import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUserStats } from "../hooks/useUserStats";
import { useUserPlan } from "../hooks/useUserPlan";
import RetroPickCard from '../components/RetroPickCard';
import { BetCard } from './BetCard';
import { useToast } from '../components/ui/ToastProvider';
import gary1 from '../assets/images/gary1.svg';
import { useAuth } from '../contexts/AuthContext';

// Import styles
import '../styles/retro-sportsbook.css';

// Gary/ESPN assets for background
import espn02 from '../assets/images/espn-02.png';
import espn03 from '../assets/images/espn-03.png';
import espn04 from '../assets/images/espn-04.png';
import espn05 from '../assets/images/espn-05.png';
import espn06 from '../assets/images/espn-06.png';
import Gary20 from '../assets/images/Gary20.png';
import pic3 from '../assets/images/pic3.png';

import color1 from '../assets/images/color1.png';
import color4 from '../assets/images/color4.png';
import color6 from '../assets/images/color6.png';


import color2 from '../assets/images/color2.png';
import color9 from '../assets/images/color9.png';
import vegas1 from '../assets/images/vegas1.png';
import GaryEmblem from '../assets/images/Garyemblem.png';

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
  const [activeTab, setActiveTab] = useState('today');
  const [parlayCard, setParlayCard] = useState(null);
  
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
            // IMPORTANT: RetroPickCard needs BOTH the original and mapped fields
            const simplePick = {
              id: pick.id || `pick-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              
              // Include original OpenAI format fields
              pick: pick.pick || '',          // Original OpenAI field for the bet
              rationale: pick.rationale || '', // Original OpenAI field for analysis
              
              // Also include mapped fields for RetroPickCard compatibility
              shortPick: pick.pick || '',     // For front of card 
              description: pick.rationale || '', // For back of card
              
              // Essential metadata
              game: pick.game || '',
              league: pick.league || '',
              confidence: pick.confidence || 0,
              time: pick.time || '',
              
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
            // This preserves the exact structure that RetroPickCard expects
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

  // Carousel navigation - circular rotation
  const nextPick = () => {
    // Clockwise rotation (go right)
    const newIndex = (currentIndex + 1) % picks.length;
    setCurrentIndex(newIndex);
    setFlippedCardId(null);
  };

  const prevPick = () => {
    // Clockwise rotation (opposite direction means adding length-1)
    const newIndex = (currentIndex - 1 + picks.length) % picks.length;
    setCurrentIndex(newIndex);
    setFlippedCardId(null);
  };

  // Handle card flip
  const handleCardFlip = (pickId) => {
    setFlippedCardId(flippedCardId === pickId ? null : pickId);
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Expansive, retro-tech layered background */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 40%, #232326 60%, #18181b 100%)',
        }}
      >
        {/* CRT grid overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'url("/crt-grid.png"), repeating-linear-gradient(0deg,rgba(255,215,0,0.09) 0 2px,transparent 2px 36px), repeating-linear-gradient(90deg,rgba(255,215,0,0.09) 0 2px,transparent 2px 36px)',
          opacity: 0.22,
          mixBlendMode: 'screen',
        }} />
        {/* ESPN collage, blurred and low opacity for depth */}
        <img src={espn02} alt="espn02" style={{ position: 'absolute', top: 'calc(5% - 192px)', left: '5%', width: '22vw', opacity: 0.24, filter: 'blur(0.8px) saturate(1.2)', zIndex: 1 }} />
        <img src={espn03} alt="espn03" style={{ position: 'absolute', top: '20%', right: '10%', width: '18vw', opacity: 0.22, filter: 'blur(0.8px) saturate(1.2)', zIndex: 1 }} />
        <img src={espn04} alt="espn04" style={{ position: 'absolute', bottom: '10%', left: '10%', width: '27vw', opacity: 0.26, filter: 'blur(0.8px) saturate(1.2)', zIndex: 1 }} />
        <img src={espn05} alt="espn05" style={{ position: 'absolute', top: '40%', left: '20%', width: '15vw', opacity: 0.22, filter: 'blur(0.8px) saturate(1.2)', zIndex: 1 }} />
        <img src={espn06} alt="espn06" style={{ position: 'absolute', bottom: '20%', right: '20%', width: '18vw', opacity: 0.23, filter: 'blur(0.8px) saturate(1.2)', zIndex: 1 }} />
        {/* Additional creative collage images */}
        <img src={pic3} alt="pic3" style={{ position: 'absolute', top: '30%', left: '40%', width: '9vw', opacity: 0.23, filter: 'blur(0.8px) saturate(1.1)', zIndex: 1 }} />
                <img src={color1} alt="color1" style={{ position: 'absolute', top: '10%', right: '25%', width: '8vw', opacity: 0.24, filter: 'blur(0.8px)', zIndex: 1 }} />
        <img src={color4} alt="color4" style={{ position: 'absolute', bottom: '25%', left: '15%', width: '7vw', opacity: 0.25, filter: 'blur(0.8px)', zIndex: 1 }} />
        <img src={color6} alt="color6" style={{ position: 'absolute', top: '50%', left: '30%', width: '9vw', opacity: 0.23, filter: 'blur(0.8px)', zIndex: 1 }} />
        {/* New collage images, spaced out */}

        <img src={color2} alt="color2" style={{ position: 'absolute', top: '60%', right: '40%', width: '9vw', opacity: 0.23, filter: 'blur(0.8px)', zIndex: 1 }} />
        <img src={color9} alt="color9" style={{ position: 'absolute', bottom: '10%', left: '35%', width: '9vw', opacity: 0.24, filter: 'blur(0.8px)', zIndex: 1 }} />
        <img src={vegas1} alt="vegas1" style={{ position: 'absolute', top: '45%', left: '12%', width: '12vw', opacity: 0.23, filter: 'blur(0.8px)', zIndex: 1 }} />
        {/* Gary mascot/logo watermarks */}
        <img src={Gary20} alt="Gary20" style={{ position: 'absolute', top: '20%', left: '50%', width: '12vw', opacity: 0.12, filter: 'blur(0.2px)', zIndex: 1 }} />
        {/* Vignette for depth */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 40%, transparent 65%, #18181b 100%)',
          opacity: 0.35,
          zIndex: 2,
          pointerEvents: 'none',
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
                    <h1 className="text-4xl font-bold text-center mb-8" style={{ color: '#d4af37' }}>
                      TODAY'S PICKS
                    </h1>
                    
                    {/* Main container for horizontal scrolling on mobile */}
                    <div className="overflow-x-auto pb-4">
                      {/* Inner container that holds all the cards in a row */}
                      <div className="flex flex-nowrap space-x-8 md:justify-center lg:flex-wrap lg:justify-center">
                        {picks.map((pick, index) => {
                          // Get the flipped state for this card
                          const isFlipped = flippedCards[pick.id] || false;
                          
                          // Function to toggle the flipped state for this specific card
                          const toggleFlip = (e) => {
                            e.stopPropagation();
                            setFlippedCards(prev => ({
                              ...prev,
                              [pick.id]: !prev[pick.id]
                            }));
                          };
                          
                          return (
                            <div key={pick.id} className="flex-none lg:mb-8">
                              {/* Card container with flip effect */}
                              <div 
                                className="w-72 h-[27rem] relative cursor-pointer" 
                                style={{
                                  perspective: '1000px',
                                }}
                                onClick={toggleFlip}
                              >
                                <div style={{
                                  position: 'relative',
                                  width: '100%',
                                  height: '100%',
                                  transformStyle: 'preserve-3d',
                                  transition: 'transform 0.6s',
                                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                                }}>
                                  {/* FRONT OF CARD */}
                                  <div style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    backfaceVisibility: 'hidden',
                                    background: 'linear-gradient(135deg, #f8f7f3 70%, #e6e1c5 100%)',
                                    border: '6px solid #bfa142',
                                    borderRadius: '1.2rem',
                                    fontFamily: 'Orbitron, Inter, Segoe UI, Arial, sans-serif',
                                    overflow: 'hidden',
                                    boxShadow: '0 0 36px 8px rgba(191,161,66,0.28), inset 0 0 15px rgba(191,161,66,0.12)',
                                    transform: 'rotateX(2deg)',
                                  }}>
                                    {/* Top Bar with League and Time */}
                                    <div style={{
                                      background: '#bfa142',
                                      color: '#e5d3c4',
                                      fontWeight: 700,
                                      fontSize: '1.02rem',
                                      letterSpacing: '0.08em',
                                      padding: '0.7rem 0.9rem',
                                      borderBottom: '2px solid #d4af37',
                                      boxShadow: '0 2px 8px #bfa14222',
                                      textTransform: 'uppercase',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}>
                                      <span>{pick.league || 'MLB'}</span>
                                      <span style={{ fontSize: '0.95rem' }}>
                                        {pick.time ? pick.time.replace(/^0/,'').replace(/:0/, ':') : '10:10 PM ET'}
                                      </span>
                                    </div>
                                    
                                    {/* Gary Emblem */}
                                    <div style={{
                                      position: 'absolute',
                                      top: '3.25rem',
                                      left: '0.125rem',
                                      zIndex: 5,
                                    }}>
                                      <img 
                                        src={GaryEmblem} 
                                        alt="Gary Emblem"
                                        style={{
                                          width: 99,
                                          height: 99,
                                          objectFit: 'contain',
                                          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.25))',
                                        }}
                                      />
                                    </div>
                                    
                                    {/* *** MAIN PICK DISPLAY *** */}
                                    <div className="flex items-center justify-center" style={{
                                      position: 'absolute',
                                      top: '50%',
                                      left: '50%',
                                      transform: 'translate(-50%, -50%)',
                                      zIndex: 2,
                                      width: '100%',
                                      padding: '0 1rem'
                                    }}>
                                      <div style={{
                                        background: 'rgba(191,161,66,0.1)',
                                        padding: '1.5rem 1rem',
                                        marginBottom: '1rem',
                                        borderRadius: '8px',
                                        border: '2px solid #bfa142',
                                        fontWeight: 800,
                                        fontSize: '2.2rem',
                                        color: '#bfa142',
                                        letterSpacing: '0.05em',
                                        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                        textAlign: 'center',
                                        boxShadow: '0 4px 12px rgba(191,161,66,0.25)',
                                        width: '90%',
                                        maxWidth: '90%'
                                      }}>
                                        {pick.pick || 'MISSING PICK'}
                                      </div>
                                    </div>
                                    
                                    {/* Click to flip hint */}
                                    <div style={{
                                      position: 'absolute',
                                      bottom: '3.5rem',
                                      left: 0,
                                      right: 0,
                                      textAlign: 'center',
                                      color: '#bfa142',
                                      fontWeight: 'bold',
                                      fontSize: '0.85rem',
                                      opacity: 0.8,
                                    }}>
                                      CLICK FOR GARY'S ANALYSIS
                                    </div>
                                    
                                    {/* Bottom Game Info */}
                                    <div style={{
                                      position: 'absolute',
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      background: '#bfa142',
                                      color: '#e5d3c4',
                                      fontWeight: 700,
                                      fontSize: '1.02rem',
                                      letterSpacing: '0.075em',
                                      textAlign: 'center',
                                      padding: '0.7rem 0',
                                      borderTop: '2px solid #d4af37',
                                      boxShadow: '0 -2px 8px #bfa14222',
                                      textTransform: 'uppercase',
                                    }}>
                                      {/* Fixed team display order */}
                                      {pick.game ? pick.game.split(' @ ').reverse().join(' @ ') : 'GAME TBD'}
                                    </div>
                                  </div>
                                  
                                  {/* BACK OF CARD - ANALYSIS */}
                                  <div style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    backfaceVisibility: 'hidden',
                                    transform: 'rotateY(180deg)',
                                    background: 'linear-gradient(135deg, #fffbe6 50%, #f5f5dc 100%)',
                                    border: '6px solid #bfa142',
                                    borderRadius: '1.2rem',
                                    fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
                                    overflow: 'hidden',
                                    boxShadow: '0 0 36px 8px rgba(191,161,66,0.28), inset 0 0 15px rgba(191,161,66,0.12)',
                                  }}>
                                    {/* Card Header */}
                                    <div style={{ position: 'relative', width: '100%' }}>
                                      {/* Gary's Analysis Banner */}
                                      <div style={{ 
                                        backgroundColor: '#bfa142',
                                        color: '#e5d3c4',
                                        fontWeight: 'bold',
                                        fontSize: '1.1rem',
                                        padding: '0.6rem 1rem',
                                        textAlign: 'center',
                                        letterSpacing: '0.05rem',
                                        textTransform: 'uppercase',
                                        borderBottom: '2px solid #d4af37',
                                        boxShadow: '0 2px 8px #bfa14222',
                                      }}>
                                        GARY'S ANALYSIS
                                      </div>
                                    </div>
                                    
                                    {/* *** SIMPLIFIED: ONLY RATIONALE SECTION *** */}
                                    <div style={{ 
                                      padding: '2rem 1.5rem', 
                                      flex: '1', 
                                      display: 'flex', 
                                      flexDirection: 'column',
                                      justifyContent: 'center',
                                      alignItems: 'center',
                                      overflowY: 'auto',
                                      height: 'calc(100% - 170px)',
                                    }}>
                                      {/* Main Analysis */}
                                      <div style={{ 
                                        backgroundColor: 'rgba(255,255,255,0.5)', 
                                        padding: '1.5rem', 
                                        borderRadius: '0.5rem',
                                        border: '2px solid rgba(191,161,66,0.3)',
                                        fontSize: '1.1rem',
                                        lineHeight: '1.5rem',
                                        color: '#222',
                                        width: '90%',
                                        maxHeight: '75%',
                                        overflowY: 'auto',
                                        boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                                      }}>
                                        {/* Display the rationale */}
                                        <p style={{ margin: 0, fontWeight: 500 }}>
                                          {pick.rationale || 'Analysis not available.'}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {/* Bet or Fade Buttons - MOVED HERE PER REQUEST */}
                                    <div style={{
                                      display: 'flex',
                                      justifyContent: 'center',
                                      padding: '0.75rem',
                                      borderTop: '2px solid rgba(191,161,66,0.3)',
                                      background: 'rgba(191,161,66,0.1)',
                                    }}>
                                      <div style={{ 
                                        display: 'flex', 
                                        gap: '1rem',
                                        justifyContent: 'center',
                                        width: '90%',
                                      }}>
                                        <button 
                                          style={{
                                            background: '#D4AF37',
                                            color: 'black',
                                            fontWeight: 'bold',
                                            padding: '0.75rem 1.5rem',
                                            borderRadius: '4px',
                                            border: '2px solid black',
                                            cursor: 'pointer',
                                            flex: 1,
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDecisionMade('bet', pick);
                                          }}
                                        >
                                          BET
                                        </button>
                                        <button 
                                          style={{
                                            background: '#333',
                                            color: 'white',
                                            fontWeight: 'bold',
                                            padding: '0.75rem 1.5rem',
                                            borderRadius: '4px',
                                            border: '2px solid black',
                                            cursor: 'pointer',
                                            flex: 1,
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDecisionMade('fade', pick);
                                          }}
                                        >
                                          FADE
                                        </button>
                                      </div>
                                    </div>
                                    
                                    {/* Bottom Pick Reference */}
                                    <div style={{ 
                                      padding: '0.5rem 1rem',
                                      backgroundColor: '#bfa142', 
                                      color: '#e5d3c4',
                                      fontWeight: 'bold',
                                      fontSize: '1rem',
                                      textAlign: 'center',
                                    }}>
                                      {pick.pick || 'PICK TBD'}
                                    </div>
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
              {activeTab === 'parlay' && (
                <div className="max-w-2xl mx-auto mb-12">
                  <div className="bg-yellow-50 rounded-lg border-4 border-red-600 overflow-hidden">
                    <div className="bg-red-600 text-white py-2 px-4 text-center">
                      <h2 className="text-2xl font-bold">GARY'S PARLAY OF THE DAY</h2>
                    </div>
                    <div className="p-4">
                      {picks.slice(0, 3).map((pick, index) => (
                        <div key={index} className="py-2 border-b border-dashed border-gray-400 mb-2">
                          <div className="flex justify-between items-center">
                            <div className="font-bold">{index + 1}. {pick.shortPick}</div>
                            <div>{pick.odds}</div>
                          </div>
                          <div className="text-sm text-gray-700 mt-1">{pick.game}</div>
                        </div>
                      ))}
                      <div className="text-center font-bold text-xl text-red-600 p-3 mt-2 border-2 border-red-600 rounded">
                        PARLAY ODDS: +{650 + Math.floor(Math.random() * 350)}
                      </div>
                      <div className="mt-6 flex justify-center">
                        <button className="px-6 py-3 bg-red-600 text-white font-bold uppercase rounded-full border-2 border-black hover:bg-red-700 transition-colors">
                          PLACE PARLAY BET
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
