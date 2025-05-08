import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
// Removed unused import: useUserStats, useLocation
import { useUserPlan } from "../contexts/UserPlanContext";
import { BetCard } from './BetCard';
import { useToast } from '../components/ui/ToastProvider';
import gary1 from '../assets/images/gary1.svg';
import { useAuth } from '../contexts/AuthContext';
import '../styles/PickCardGlow.css'; // Import the glow effect CSS

// Only import assets we actually need for the modern dark UI design
import GaryEmblem from '../assets/images/Garyemblem.png';

// Import services
import { picksService } from '../services/picksService';
import { resultsService } from '../services/resultsService';
import { betTrackingService } from '../services/betTrackingService';
import { picksPersistenceService } from '../services/picksPersistenceService';
import { userStatsService } from '../services/userStatsService';
import { garyPhrases } from '../utils/garyPhrases';
import { supabase, ensureAnonymousSession } from '../supabaseClient';

function RealGaryPicks() {
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const { userPlan, planLoading, subscriptionStatus } = useUserPlan();
  const navigate = useNavigate();
  
  // State for cards loaded from the database
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userDecisions, setUserDecisions] = useState({});
  // State to track which picks are being processed to prevent double-clicking
  const [processingDecisions, setProcessingDecisions] = useState({});
  // State to track which cards are flipped
  const [flippedCards, setFlippedCards] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  
  // Function to check if user has already made decisions on any picks
  const checkUserDecisions = async () => {
    if (!user) return;
    
    const userId = user.id;
    const decisionsMap = {};
    
    // Check each pick for existing user decisions
    for (const pick of picks) {
      const { hasMade, decision } = await betTrackingService.hasUserMadeDecision(pick.id, userId);
      if (hasMade) {
        decisionsMap[pick.id] = decision;
      }
    }
    
    setUserDecisions(decisionsMap);
  };
  
  // Single debug logging effect that executes when subscription status changes
  useEffect(() => {
    if (user) {
      console.log('RealGaryPicks: User subscription check', {
        authenticated: true,
        userId: user.id,
        planLoading,
        subscriptionStatus,
        userPlan
      });
    }
  }, [user, userPlan, planLoading, subscriptionStatus]);

  // Load picks from Supabase
  useEffect(() => {
    if (!planLoading && subscriptionStatus === 'active') {
      loadPicks();
    }
  }, [planLoading, subscriptionStatus]);
  
  // Check for existing user decisions when picks load
  useEffect(() => {
    if (picks.length > 0 && user) {
      checkUserDecisions();
    }
  }, [picks, user]);
  
  // Removed unused state variables for bet tracking

  // Toast notification system
  const showToast = useToast();
  
  // Debug logs for troubleshooting
  useEffect(() => {
    console.log('[RealGaryPicks] picks:', picks);
    console.log('[RealGaryPicks] loading:', loading);
    console.log('[RealGaryPicks] error:', error);
  }, [picks, loading, error]);

  // Using hardcoded performance values

  // Load picks from Supabase using appropriate date based on time
  const loadPicks = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use Eastern Time consistently for all date operations
      const now = new Date();
      
      // Convert to Eastern Time zone properly
      const easternTimeOptions = { timeZone: "America/New_York" };
      const easternDateString = now.toLocaleDateString('en-US', easternTimeOptions);
      const easternTimeString = now.toLocaleTimeString('en-US', easternTimeOptions);
      
      // Create a new date object with Eastern Time components
      const [month, day, year] = easternDateString.split('/');
      const [time, period] = easternTimeString.match(/([\d:]+)\s(AM|PM)/).slice(1);
      const [hours, minutes] = time.split(':');
      
      // Format the date string properly (YYYY-MM-DD)
      const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const easternHour = parseInt(hours) + (period === 'PM' && hours !== '12' ? 12 : 0);
      
      // Format full time for logging
      const fullEasternTimeString = `${month}/${day}/${year} ${hours}:${minutes} ${period}`;
      
      console.log(`Properly formatted Eastern date: ${dateString}, Hour: ${easternHour}`);
      console.log(`Original time parts: M:${month} D:${day} Y:${year} H:${hours} M:${minutes} ${period}`);
      
      let queryDate = dateString;
      console.log(`Current Eastern Time: ${fullEasternTimeString} (Hour: ${easternHour})`);

      
      // Before 10am EST, always use yesterday's picks if available
      if (easternHour < 10) {
        console.log("RealGaryPicks: It's before 10am Eastern Time - looking for yesterday's picks");
        
        // Calculate yesterday's date properly using the date parts we already have
        const yesterdayDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        
        // Format yesterday's date as YYYY-MM-DD
        const yesterdayYear = yesterdayDate.getFullYear();
        const yesterdayMonth = (yesterdayDate.getMonth() + 1).toString().padStart(2, '0');
        const yesterdayDay = yesterdayDate.getDate().toString().padStart(2, '0');
        const yesterdayString = `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;
        
        // Check if yesterday's picks exist
        const { data: yesterdayData, error: yesterdayError } = await supabase
          .from("daily_picks")
          .select("picks, date")
          .eq("date", yesterdayString)
          .maybeSingle();
          
        if (!yesterdayError && yesterdayData && yesterdayData.picks) {
          console.log(`RealGaryPicks: Using picks from previous day (${yesterdayString}) since it's before 10am`);
          queryDate = yesterdayString;
        } else {
          console.log(`RealGaryPicks: No picks found for previous day ${yesterdayString}, will try today's picks`); 
        }
      }
      
      console.log(`Looking for picks for date: ${queryDate}`);
      
      // Query Supabase for picks with the determined date
      const { data, error: fetchError } = await supabase
        .from('daily_picks')
        .select('picks, date')
        .eq('date', queryDate)
        .maybeSingle(); // Use maybeSingle to avoid 406 errors
      
      // Log the result for debugging
      console.log(`Supabase fetch result for ${queryDate}:`, { data, fetchError });
      
      // Store the queryDate for use in generating consistent pick IDs
      const currentDate = queryDate;

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
              // Use a consistent ID based on the pick content and date instead of random numbers
              // This ensures the same pick gets the same ID across page refreshes
              id: pick.id || `pick-${currentDate}-${pick.league}-${pick.pick?.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`,
              
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
                // Generate a consistent ID based on pick content and today's date
                id: pick.id || `pick-${today}-${rawOutput.league}-${rawOutput.pick?.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`,
                
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
   * Records the decision, displays a toast notification, and updates user stats.
   */
  const handleDecisionMade = async (decision, pick) => {
    console.log('[RealGaryPicks] handleDecisionMade', { decision, pick });
    
    // Prevent multiple clicks on the same pick
    if (processingDecisions[pick.id] || userDecisions[pick.id]) {
      showToast('You already made a decision for this pick', 'warning', 3000, false);
      return;
    }
    
    // Mark this pick as being processed
    setProcessingDecisions(prev => ({
      ...prev,
      [pick.id]: true
    }));
    
    try {
      // Make sure user is logged in
      if (!user) {
        // Create or ensure anonymous session
        await ensureAnonymousSession();
      }
      
      // Get current user ID
      const userId = user?.id || (await supabase.auth.getUser()).data.user?.id;
      
      if (!userId) {
        console.error('User ID not available for tracking bet/fade decision');
        showToast('Sign in to track your picks!', 'error', 3000, false);
        setProcessingDecisions(prev => ({
          ...prev,
          [pick.id]: false
        }));
        return;
      }
      
      // Check if user already made a decision on this pick
      const { hasMade } = await betTrackingService.hasUserMadeDecision(pick.id, userId);
      if (hasMade) {
        showToast('You already placed a bet on this pick!', 'warning', 3000, false);
        setProcessingDecisions(prev => ({
          ...prev,
          [pick.id]: false
        }));
        return;
      }
      
      // Display appropriate Gary toast message based on decision
      const toastMessage = decision === 'bet'
        ? garyPhrases.getRandom('betPhrases')
        : garyPhrases.getRandom('fadePhrases');
        
      showToast(toastMessage, decision === 'bet' ? 'success' : 'info', 4000, true);
      
      // Track user decision in Supabase
      await userStatsService.recordDecision(userId, decision, pick);
      
      // Update user-pick tracking
      await betTrackingService.saveBetDecision(pick.id, decision, userId);
      
      // Update local state to reflect the decision
      setUserDecisions(prev => ({
        ...prev,
        [pick.id]: decision
      }));
      
      // Reload picks if necessary
      loadPicks();
      
      // Increment reloadKey to force BetCard to reload
      setReloadKey(prev => {
        const newKey = prev + 1;
        console.log('[RealGaryPicks] reloadKey incremented', newKey);
        return newKey;
      });
    } catch (error) {
      console.error('Error handling bet/fade decision:', error);
      showToast('Something went wrong. Please try again.', 'error', 3000, false);
    } finally {
      // Regardless of outcome, mark this pick as no longer being processed
      setProcessingDecisions(prev => ({
        ...prev,
        [pick.id]: false
      }));
    }
  };

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
      {/* BG2.png background */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
          backgroundImage: 'url(/BG2.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
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
      <div className="w-full flex flex-col items-center justify-center pt-32 pb-6 px-4 relative" style={{ minHeight: '100vh', zIndex: 2 }}>
        {/* Show loading screen while plan status is being checked */}
        {planLoading ? (
          <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: '#121212', border: '3px solid #d4af37' }}>
            <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#d4af37' }}>
              <h3 className="font-bold text-black">CHECKING SUBSCRIPTION...</h3>
            </div>
            <p className="text-yellow-500 mb-4">Please wait while we verify your subscription status</p>
            <div className="flex justify-center">
              <div className="w-8 h-8 border-t-2 border-b-2 border-[#d4af37] rounded-full animate-spin"></div>
            </div>
          </div>
        ) : (
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
                    <h1 className="text-4xl font-bold text-center mb-2" style={{ color: '#b8953f' }}>
                      TODAY'S PICKS
                    </h1>
                    <p className="text-center text-gray-400 mb-6 max-w-2xl mx-auto">
                      Picks are generated everyday at 10am EST. If injuries or events occur between then and game time, users will be notified of scratch picks via email.
                    </p>
                    
                    {/* Yesterday's Performance Banner */}
                    <div className="flex justify-center items-center mb-6">
                      <div className="inline-block px-4 py-2 rounded-lg" style={{ 
                        background: '#1a1a1a',
                        color: '#B8953F',
                        border: '2px solid #B8953F',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                      }}>
                        <span className="text-lg">GARY WENT 6-1 YESTERDAY</span>
                      </div>
                    </div>
                    
                    {/* See Past Picks button moved to appear after pagination */}
                    
                    {/* Card Stack Interface */}
                    <div className="flex justify-center items-center relative py-4 pt-2">
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
                                onClick={!planLoading && subscriptionStatus === 'active' ? toggleFlip : null}
                              >
                                {/* Blur overlay for users without active subscription - only show when loading is complete */}
                                {!planLoading && subscriptionStatus !== 'active' && (
                                  <div 
                                    className="absolute inset-0 z-50 flex flex-col items-center justify-center" 
                                    style={{
                                      background: 'rgba(0, 0, 0, 0.7)',
                                      backdropFilter: 'blur(15px)',
                                      borderRadius: '16px',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="text-center px-6">
                                      <div className="mb-4">
                                        <img src="/coin2.png" alt="Gary A.I." className="w-24 h-24 mx-auto" />
                                      </div>
                                      <h3 className="text-[#b8953f] text-2xl font-bold mb-3">Unlock Premium Picks</h3>
                                      <p className="text-white mb-6 max-w-sm">Upgrade to Pro to see all of Gary's premium picks with detailed analysis and reasoning.</p>
                                      <a 
                                        href="https://buy.stripe.com/dR603v2UndMebrq144"
                                        className="block py-4 px-8 bg-[#b8953f] hover:bg-[#c5a030] text-black font-medium rounded-lg transition-colors focus:ring-2 focus:ring-[#b8953f]/50 focus:outline-none w-64 mx-auto text-center"
                                      >
                                        Upgrade to Pro — $29/month
                                      </a>
                                      <p className="mt-4 text-gray-400 text-sm">Cancel anytime</p>
                                    </div>
                                  </div>
                                )}
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
                                                  background: userDecisions[pick.id] === 'bet' 
                                                    ? 'rgba(191, 161, 66, 0.5)'
                                                    : 'rgba(191, 161, 66, 0.15)',
                                                  color: userDecisions[pick.id] === 'bet' 
                                                    ? '#ffdf7e'
                                                    : '#bfa142',
                                                  fontWeight: '600',
                                                  padding: '0.5rem 1rem',
                                                  borderRadius: '8px',
                                                  border: '1px solid rgba(191, 161, 66, 0.3)',
                                                  cursor: userDecisions[pick.id] ? 'default' : 'pointer',
                                                  flex: 1,
                                                  fontSize: '0.8rem',
                                                  letterSpacing: '0.05em',
                                                  textTransform: 'uppercase',
                                                  transition: 'all 0.2s ease',
                                                  opacity: userDecisions[pick.id] && userDecisions[pick.id] !== 'bet' ? 0.5 : 1
                                                }}
                                                 onClick={(e) => {
                                                  e.stopPropagation(); // Prevent card flip
                                                  // Disable the button if either processing or already decided
                                                  if (!processingDecisions[pick.id] && !userDecisions[pick.id]) {
                                                    handleDecisionMade('bet', pick);
                                                  }
                                                }}
                                              >
                                                Bet
                                              </button>
                                              <button 
                                                style={{
                                                  background: userDecisions[pick.id] === 'fade' 
                                                    ? 'rgba(255, 255, 255, 0.2)'
                                                    : 'rgba(255, 255, 255, 0.05)',
                                                  color: userDecisions[pick.id] === 'fade' 
                                                    ? 'rgba(255, 255, 255, 1)'
                                                    : 'rgba(255, 255, 255, 0.8)',
                                                  fontWeight: '600',
                                                  padding: '0.5rem 1rem',
                                                  borderRadius: '8px',
                                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                                  cursor: userDecisions[pick.id] ? 'default' : 'pointer',
                                                  flex: 1,
                                                  fontSize: '0.8rem',
                                                  letterSpacing: '0.05em',
                                                  textTransform: 'uppercase',
                                                  transition: 'all 0.2s ease',
                                                  opacity: userDecisions[pick.id] && userDecisions[pick.id] !== 'fade' ? 0.5 : 1
                                                }}
                                                 onClick={(e) => {
                                                  e.stopPropagation(); // Prevent card flip
                                                  // Disable the button if either processing or already decided
                                                  if (!processingDecisions[pick.id] && !userDecisions[pick.id]) {
                                                    handleDecisionMade('fade', pick);
                                                  }
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
                    
                    {/* See Past Picks Button - Repositioned after pagination counter */}
                    <div className="flex justify-center mt-16 mb-12">
                      <Link
                        to="/billfold"
                        className="px-6 py-3 rounded-lg text-black font-bold transition-all duration-300"
                        style={{
                          background: 'linear-gradient(135deg, #B8953F 0%, #D4AF37 100%)',
                          boxShadow: '0 4px 15px rgba(184, 149, 63, 0.3)',
                          border: '2px solid #1a1a1a'
                        }}
                      >
                        See Past Picks
                      </Link>
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
          
          {/* Gambling Disclaimer */}
          <div className="py-8 text-center text-gray-500 text-sm">
            <div className="mt-6 max-w-4xl mx-auto px-4 border-t border-gray-700 pt-6 text-xs">
              <p className="mb-2">
                DISCLAIMER: This site is 100% for entertainment purposes only and does not involve real money betting or prizes. You must be 18+ years old to utilize Gary.ai.
              </p>
              <p className="mb-2">
                If you or someone you know may have a gambling problem, Gary.ai For crisis counseling and referral services, call 1-800 GAMBLER (1-800-426-2537). For more information and resources, visit our Responsible Gaming page.
              </p>
              <p>
                Gambling problem? Call 1-800-GAMBLER (Available in the US)
                Call 877-8-HOPENY or text HOPENY (467369) (NY)
                Call 1-800-327-5050 (MA), 1-800-NEXT-STEP (AZ), 1-800-BETS-OFF (IA), 1-800-981-0023 (PR)
              </p>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RealGaryPicks;
