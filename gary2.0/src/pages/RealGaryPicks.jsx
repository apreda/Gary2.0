import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUserPlan } from "../contexts/UserPlanContext";
import BG2 from '/BG2.png';
import { useToast } from '../components/ui/ToastProvider';
import { useAuth } from '../contexts/AuthContext';
import '../styles/PickCardGlow.css';
import '../styles/DisableCardGlow.css';
import '../styles/MobileScrollFix.css';
import { picksService } from '../services/picksService';
import { betTrackingService } from '../services/betTrackingService';
import { userStatsService } from '../services/userStatsService';
import { garyPhrases } from '../utils/garyPhrases';
import { supabase, ensureAnonymousSession } from '../supabaseClient';
import { getEasternDate, getYesterdayDate, formatGameTime } from '../utils/dateUtils';
import { extractKeyPoints } from '../utils/analysisPreview';

// Custom hook to detect mobile
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};

function RealGaryPicks() {
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const { userPlan, planLoading, subscriptionStatus } = useUserPlan();
  const navigate = useNavigate();

  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userDecisions, setUserDecisions] = useState({});
  const [processingDecisions, setProcessingDecisions] = useState({});
  const [flippedCards, setFlippedCards] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  const checkUserDecisions = async () => {
    if (!user) return;

    const userId = user.id;
    const decisionsMap = {};

    for (const pick of picks) {
      const { hasMade, decision } = await betTrackingService.hasUserMadeDecision(pick.id, userId);
      if (hasMade) {
        decisionsMap[pick.id] = decision;
      }
    }

    setUserDecisions(decisionsMap);
  };

  useEffect(() => {
    const controller = new AbortController();
    
    const loadData = async () => {
      if (controller.signal.aborted || planLoading || subscriptionStatus !== 'active') return;
      
      try {
        await loadPicks();
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error loading picks:', error);
        }
      }
    };
    
    loadData();
    
    return () => controller.abort();
  }, [planLoading, subscriptionStatus]);

  useEffect(() => {
    if (picks.length > 0 && user) {
      checkUserDecisions();
    }
  }, [picks, user]);

  const showToast = useToast();

  const loadPicks = async () => {
    setLoading(true);
    setError(null);

    try {
      const eastern = getEasternDate();
      let queryDate = eastern.dateString;

      if (eastern.easternHour < 10) {
        const yesterdayString = getYesterdayDate(eastern.year, eastern.month, eastern.day);

        const { data: yesterdayData, error: yesterdayError } = await supabase
          .from("daily_picks")
          .select("picks, date")
          .eq("date", yesterdayString)
          .maybeSingle();

        if (!yesterdayError && yesterdayData && yesterdayData.picks) {
          queryDate = yesterdayString;
        }
      }

      const { data, error: fetchError } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', queryDate)
        .maybeSingle();

      const currentDate = queryDate;

      let picksArray = [];
      if (data && data.picks) {
        picksArray = typeof data.picks === 'string' ? JSON.parse(data.picks) : data.picks;

        picksArray = picksArray
          .filter(pick => {
            if (pick.id && pick.id.includes('emergency')) return false;
            if (!pick.pick || pick.pick === '') return false;
            if (!pick.rationale || pick.rationale === '') return false;
            return true;
          })
          .map(pick => {
            const extractOddsFromAnalysis = (pick) => {
              try {
                // First, try to get odds from the rawAnalysis.rawOpenAIOutput
                if (pick.rawAnalysis?.rawOpenAIOutput?.odds) {
                  const odds = pick.rawAnalysis.rawOpenAIOutput.odds;
                  console.log('Found odds in rawOpenAIOutput:', odds);
                  return odds;
                }
                
                // Second, try to extract from the pick field
                if (pick.pick) {
                  // Look for odds pattern at the end of the pick string (e.g., "Team Name -1.5 -110")
                  const endOddsMatch = pick.pick.match(/[-+]\d+(?=\s*$)/);
                  if (endOddsMatch) {
                    console.log('Extracted odds from end of pick string:', endOddsMatch[0]);
                    return endOddsMatch[0];
                  }
                  
                  // Look for odds in the middle of spread picks (e.g., "Team Name -1.5 (-110)")
                  const spreadOddsMatch = pick.pick.match(/[-+]?\d+\.?\d*\s*\(?([-+]\d+)\)?/);
                  if (spreadOddsMatch) {
                    console.log('Extracted odds from spread pick:', spreadOddsMatch[1]);
                    return spreadOddsMatch[1];
                  }
                  
                  // Try to find any odds-like pattern in the pick
                  const anyOddsMatch = pick.pick.match(/[-+]\d{2,3}(?=\D*$)/);
                  if (anyOddsMatch) {
                    console.log('Found odds-like pattern in pick:', anyOddsMatch[0]);
                    return anyOddsMatch[0];
                  }
                }
                
                // Third, try to get from the odds field directly
                if (pick.odds) {
                  console.log('Using direct odds field:', pick.odds);
                  return pick.odds;
                }
                
                // Fourth, try to extract from rawAnalysis if available
                if (pick.rawAnalysis?.odds) {
                  console.log('Using odds from rawAnalysis:', pick.rawAnalysis.odds);
                  return pick.rawAnalysis.odds;
                }
                
                // Fifth, try to extract from analysis prompt if available
                if (pick.analysisPrompt) {
                  console.log('Attempting to extract odds from analysis prompt');
                  const teamName = pick.pick?.split(' ').slice(0, -1).join(' ');
                  if (teamName) {
                    const oddsLineMatch = pick.analysisPrompt.match(/Current moneyline odds:([^\n]+)/);
                    if (oddsLineMatch && oddsLineMatch[1]) {
                      const oddsLine = oddsLineMatch[1];
                      const teamRegex = new RegExp(`${teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([-+]?\\d+)\\)`);
                      const match = oddsLine.match(teamRegex);
                      if (match && match[1]) {
                        return match[1];
                      }
                    }
                  }
                }
                
                // If we can't determine the odds, return null instead of a default
                console.log('Could not determine odds for pick:', pick.pick);
                return null;
                
              } catch (error) {
                console.error('Error extracting odds:', error);
                return null;
              }
            };

            const oddsValue = extractOddsFromAnalysis(pick);

            const simplePick = {
              id: pick.id || `pick-${currentDate}-${pick.league}-${pick.pick?.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`,
              pick: pick.pick || '',
              rationale: pick.rationale || '',
              game: pick.game || '',
              league: pick.league || '',
              confidence: pick.confidence || 0,
              time: function () {
                if (pick.rawAnalysis?.rawOpenAIOutput?.time) {
                  return pick.rawAnalysis.rawOpenAIOutput.time;
                }
                if (pick.time) {
                  return pick.time;
                }
                if (pick.gameTime) {
                  return formatGameTime(pick.gameTime);
                }
                return '';
              }(),
              odds: oddsValue || pick.odds || '',
              homeTeam: pick.homeTeam || '',
              awayTeam: pick.awayTeam || '',
              type: pick.type || 'Moneyline',
              trapAlert: pick.trapAlert || false,
              revenge: pick.revenge || false,
              momentum: pick.momentum || 0
            };

            return simplePick;
          });
      }

      if (fetchError || !picksArray.length) {
        const today = new Date().toISOString().split('T')[0];

        try {
          setLoading(true);

          await supabase
            .from('daily_picks')
            .delete()
            .eq('date', today);

          const generatedPicks = await picksService.generateDailyPicks();

          if (generatedPicks && Array.isArray(generatedPicks) && generatedPicks.length > 0) {
            setPicks(generatedPicks.map(pick => {
              const rawOutput = pick.rawAnalysis || pick;
              return {
                id: pick.id || `pick-${today}-${rawOutput.league}-${rawOutput.pick?.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`,
                pick: rawOutput.pick,
                type: rawOutput.type || 'moneyline',
                confidence: rawOutput.confidence,
                rationale: rawOutput.rationale,
                trapAlert: rawOutput.trapAlert || false,
                revenge: rawOutput.revenge || false,
                momentum: rawOutput.momentum || 0,
                homeTeam: rawOutput.homeTeam || pick.home_team || '',
                awayTeam: rawOutput.awayTeam || pick.away_team || '',
                league: rawOutput.league || pick.league || '',
                time: rawOutput.time || pick.time || ''
              };
            }));
            setLoading(false);
            return;
          }

          const { data: freshData } = await supabase
            .from('daily_picks')
            .select('picks, date')
            .eq('date', today)
            .maybeSingle();

          if (freshData && freshData.picks) {
            picksArray = typeof freshData.picks === 'string' ?
              JSON.parse(freshData.picks) : freshData.picks;

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
    // eslint-disable-next-line
  }, []);

  const visiblePicks = picks.slice(0, userPlan === 'premium' ? picks.length : 1);

  const handleDecisionMade = async (decision, pick) => {
    if (processingDecisions[pick.id] || userDecisions[pick.id]) {
      showToast('You already made a decision for this pick', 'warning', 3000, false);
      return;
    }

    setProcessingDecisions(prev => ({
      ...prev,
      [pick.id]: true
    }));

    try {
      if (!user) {
        await ensureAnonymousSession();
      }

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

      const { hasMade } = await betTrackingService.hasUserMadeDecision(pick.id, userId);
      if (hasMade) {
        showToast('You already placed a bet on this pick!', 'warning', 3000, false);
        setProcessingDecisions(prev => ({
          ...prev,
          [pick.id]: false
        }));
        return;
      }

      const toastMessage = decision === 'bet'
        ? garyPhrases.getRandom('betPhrases')
        : garyPhrases.getRandom('fadePhrases');

      showToast(toastMessage, decision === 'bet' ? 'success' : 'info', 4000, true);

      await userStatsService.recordDecision(userId, decision, pick);

      await betTrackingService.saveBetDecision(pick.id, decision, userId);

      setUserDecisions(prev => ({
        ...prev,
        [pick.id]: decision
      }));

      loadPicks();

      setReloadKey(prev => prev + 1);
    } catch (error) {
      console.error('Error handling bet/fade decision:', error);
      showToast('Something went wrong. Please try again.', 'error', 3000, false);
    } finally {
      setProcessingDecisions(prev => ({
        ...prev,
        [pick.id]: false
      }));
    }
  };

  const nextPick = () => {
    if (animating || picks.length <= 1) return;

    setAnimating(true);
    const newIndex = (currentIndex + 1) % picks.length;

    setFlippedCards(prev => {
      const newState = { ...prev };
      Object.keys(newState).forEach(key => {
        newState[key] = false;
      });
      return newState;
    });

    setTimeout(() => {
      setCurrentIndex(newIndex);
      setAnimating(false);
    }, 500);
  };

  const prevPick = () => {
    if (animating || picks.length <= 1) return;

    setAnimating(true);
    const newIndex = (currentIndex - 1 + picks.length) % picks.length;

    setFlippedCards(prev => {
      const newState = { ...prev };
      Object.keys(newState).forEach(key => {
        newState[key] = false;
      });
      return newState;
    });

    setTimeout(() => {
      setCurrentIndex(newIndex);
      setAnimating(false);
    }, 500);
  };

  useEffect(() => {
    checkUserDecisions();
    // eslint-disable-next-line
  }, [user]);

  useEffect(() => {
    document.body.classList.add('picks-page');
    return () => {
      document.body.classList.remove('picks-page');
    };
  }, []);

  const isMobile = useIsMobile();

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100vw' }}>
      {/* BG2.png background with 15% opacity */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
          background: `#121212 url(${BG2}) no-repeat center center`,
          backgroundSize: 'cover',
          opacity: 0.15,
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
          loading ? (
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
              <div className="mb-12">
                {/* NEW LAYOUT: Directly on page in a horizontal row format */}
                <div className="pt-12 px-4">
                  <h1 className="text-4xl font-bold text-center mb-2" style={{ color: '#b8953f' }}>
                    TODAY'S PICKS
                  </h1>
                  <p className="text-center text-gray-400 mb-6 max-w-2xl mx-auto hidden sm:block">
                    Picks are generated everyday at 10am EST. If injuries or events occur between then and game time, users will be notified of scratch picks via email.
                  </p>
                  
                  {/* Card Stack Interface */}
                  <div className="flex justify-center items-center relative py-4 pt-2">
                    {/* Left navigation arrow - positioned outside the card, no circle */}
                    <button 
                      className={`absolute ${isMobile ? 'left-[-30px]' : 'left-[-60px]'} z-50 text-[#d4af37] hover:text-white transition-all duration-300 bg-transparent`}
                      onClick={prevPick}
                      disabled={animating || picks.length <= 1}
                      style={{ transform: 'translateY(-50%)', top: '50%' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width={isMobile ? "30" : "40"} height={isMobile ? "30" : "40"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    
                    {/* Right navigation arrow - positioned outside the card, no circle */}
                    <button 
                      className={`absolute ${isMobile ? 'right-[-30px]' : 'right-[-60px]'} z-50 text-[#d4af37] hover:text-white transition-all duration-300 bg-transparent`}
                      onClick={nextPick}
                      disabled={animating || picks.length <= 1}
                      style={{ transform: 'translateY(-50%)', top: '50%' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width={isMobile ? "30" : "40"} height={isMobile ? "30" : "40"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    <div className="relative" style={{ 
                      width: isMobile ? '90%' : '634px', 
                      height: isMobile ? '200px' : '422px', 
                      maxWidth: isMobile ? '500px' : 'none',
                      margin: isMobile ? '0 auto' : '0 0 0 48px'
                    }}>
                      {picks.map((pick, index) => {
                        // Calculate position in stack relative to current index
                        const position = (index - currentIndex + picks.length) % picks.length;
                        const isCurrentCard = index === currentIndex;
                        
                        // Style based on position in stack - simplified for mobile
                        const cardStyle = {
                          zIndex: picks.length - position,
                          transform: position === 0 
                            ? 'translateX(0) scale(1)' 
                            : position === 1 
                              ? `translateX(${isMobile ? '5px' : '10px'}) scale(0.95) translateY(${isMobile ? '5px' : '10px'})` 
                              : position === 2 
                                ? `translateX(${isMobile ? '10px' : '20px'}) scale(0.9) translateY(${isMobile ? '10px' : '20px'})` 
                                : `translateX(${isMobile ? '15px' : '30px'}) scale(0.85) translateY(${isMobile ? '15px' : '30px'})`,
                          opacity: position <= 2 ? 1 - (position * 0.15) : 0,
                          pointerEvents: isCurrentCard ? 'auto' : 'none',
                          transition: animating ? 'all 0.5s ease-in-out' : 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out',
                          width: '100%',
                          height: '100%',
                          position: 'absolute',
                          top: 0,
                          left: 0
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
                            className="pick-card-container"
                            style={cardStyle}
                          >
                            {/* Card container with flip effect */}
                            <div 
                              className="w-full h-full relative cursor-pointer"
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
                                      <img src="/coin2.png" alt="Gary A.I." className="w-[106px] h-[106px] mx-auto" />
                                    </div>
                                    <h3 className="text-[#b8953f] text-2xl font-bold mb-3">Unlock Premium Picks</h3>
                                    <p className="text-white mb-6 max-w-sm">Upgrade to Pro to see all of Gary's premium picks with detailed analysis and reasoning.</p>
                                    <a 
                                      href={user ? "https://buy.stripe.com/dR603v2UndMebrq144" : "https://www.betwithgary.ai/signin"}
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
                                    {/* FRONT OF CARD - Mobile Simplified Design */}
                                    {isMobile ? (
                                      <div style={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        backfaceVisibility: 'hidden',
                                        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                        borderRadius: '12px',
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        overflow: 'hidden',
                                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                                        color: '#ffffff',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        padding: '1.5rem',
                                        textAlign: 'center'
                                      }}>
                                        {/* Gary's Pick - Large and Centered */}
                                        <div style={{ 
                                          fontSize: isMobile ? '1.75rem' : '2rem', 
                                          fontWeight: 700, 
                                          lineHeight: 1.1,
                                          color: '#bfa142',
                                          wordBreak: 'break-word',
                                          maxHeight: isMobile ? '3rem' : '4.5rem',
                                          overflow: 'hidden',
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical'
                                        }}>
                                          {pick.pick}
                                        </div>
                                        
                                        {/* Confidence Score */}
                                        <div style={{
                                          background: 'rgba(191, 161, 66, 0.15)',
                                          padding: '0.75rem 1.5rem',
                                          borderRadius: '8px',
                                          border: '1px solid rgba(191, 161, 66, 0.3)'
                                        }}>
                                          <div style={{ 
                                            fontSize: '0.7rem', 
                                            opacity: 0.7, 
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em', 
                                            marginBottom: '0.25rem'
                                          }}>
                                            Confidence
                                          </div>
                                          <div style={{
                                            fontSize: '1.5rem',
                                            fontWeight: 700,
                                            color: '#bfa142'
                                          }}>
                                            {typeof pick.confidence === 'number' ? 
                                              Math.round(pick.confidence * 100) + '%' : 
                                              (pick.confidence || '75%')}
                                          </div>
                                        </div>
                                        
                                                                                    {/* Enhanced preview with key stats bullet points - hide on mobile */}
                                            {!isMobile && (
                                              <div style={{
                                                fontSize: '0.8rem',
                                                opacity: 0.85,
                                                marginBottom: '0.5rem',
                                                lineHeight: 1.4
                                              }}>
                                                {pick.rationale ? (() => {
                                                  const keyPoints = extractKeyPoints(pick.rationale);
                                                  
                                                  return keyPoints.length > 0 ? (
                                                    <div>
                                                      {keyPoints.map((point, idx) => (
                                                        <div key={idx} style={{
                                                          display: 'flex',
                                                          alignItems: 'flex-start',
                                                          marginBottom: '0.3rem',
                                                          fontSize: '0.75rem'
                                                        }}>
                                                          <span style={{ 
                                                            marginRight: '0.4rem',
                                                            fontSize: '0.7rem',
                                                            opacity: 0.6
                                                          }}>
                                                            •
                                                          </span>
                                                          <span style={{ 
                                                            opacity: 0.9,
                                                            lineHeight: 1.3
                                                          }}>
                                                            {point}
                                                          </span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  ) : (
                                                    <div style={{ opacity: 0.7, fontStyle: 'italic' }}>
                                                      Tap for detailed analysis
                                                    </div>
                                                  );
                                                })() : (
                                                  <div style={{ opacity: 0.7, fontStyle: 'italic' }}>
                                                    Tap for analysis
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                      </div>
                                    ) : (
                                      // Desktop front card design
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
                                              fontSize: isMobile ? '1.75rem' : '2rem', 
                                              fontWeight: 700, 
                                              lineHeight: 1.1,
                                              color: '#bfa142',
                                              wordBreak: 'break-word',
                                              maxHeight: isMobile ? '3rem' : '4.5rem',
                                              overflow: 'hidden',
                                              display: '-webkit-box',
                                              WebkitLineClamp: 2,
                                              WebkitBoxOrient: 'vertical'
                                            }}>
                                              {pick.pick}
                                            </div>
                                            
                                            {/* Enhanced preview with key stats bullet points - hide on mobile */}
                                            {!isMobile && (
                                              <div style={{
                                                fontSize: '0.8rem',
                                                opacity: 0.85,
                                                marginBottom: '0.5rem',
                                                lineHeight: 1.4
                                              }}>
                                                {pick.rationale ? (() => {
                                                  const keyPoints = extractKeyPoints(pick.rationale);
                                                  
                                                  return keyPoints.length > 0 ? (
                                                    <div>
                                                      {keyPoints.map((point, idx) => (
                                                        <div key={idx} style={{
                                                          display: 'flex',
                                                          alignItems: 'flex-start',
                                                          marginBottom: '0.3rem',
                                                          fontSize: '0.75rem'
                                                        }}>
                                                          <span style={{ 
                                                            marginRight: '0.4rem',
                                                            fontSize: '0.7rem',
                                                            opacity: 0.6
                                                          }}>
                                                            •
                                                          </span>
                                                          <span style={{ 
                                                            opacity: 0.9,
                                                            lineHeight: 1.3
                                                          }}>
                                                            {point}
                                                          </span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  ) : (
                                                    <div style={{ opacity: 0.7, fontStyle: 'italic' }}>
                                                      Tap for detailed analysis
                                                    </div>
                                                  );
                                                })() : (
                                                  <div style={{ opacity: 0.7, fontStyle: 'italic' }}>
                                                    Tap for analysis
                                                  </div>
                                                )}
                                              </div>
                                            )}
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
                                                  e.stopPropagation();
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
                                                  e.stopPropagation();
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
                                            top: 0,
                                            bottom: 0,
                                            width: '30%',
                                            borderLeft: '2.25px solid #bfa142',
                                            padding: '1.5rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            background: 'linear-gradient(135deg, rgba(55, 55, 58, 1) 0%, rgba(40, 40, 42, 0.95) 100%)',
                                            boxShadow: '-10px 0 15px rgba(0, 0, 0, 0.4)',
                                            borderRadius: '0 16px 16px 0',
                                            clipPath: 'inset(0px 0px 0px -20px)',
                                            zIndex: 2,
                                            transform: 'translateZ(10px)',
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
                                               {pick.time || '7:10 PM EST'}
                                             </div>
                                           </div>
                                          
                                          {/* Coin Image centered - no background - HIDE ON MOBILE */}
                                          {!isMobile && (
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
                                                  width: 143,
                                                  height: 143,
                                                  objectFit: 'contain',
                                                  opacity: 1,
                                                  background: 'transparent'
                                                }}
                                              />
                                            </div>
                                          )}
                                          
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
                                              color: '#bfa142',
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
                                    )}
                                    
                                    {/* BACK OF CARD - ANALYSIS (MATCHING FREE PICK FORMAT) */}
                                    <div style={{
                                      position: 'absolute',
                                      width: '100%',
                                      height: '100%',
                                      backfaceVisibility: 'hidden',
                                      transform: 'rotateY(180deg)',
                                      background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                      borderRadius: isMobile ? '12px' : '16px',
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      overflow: 'hidden',
                                      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                                      color: '#ffffff',
                                      padding: '1.25rem',
                                      display: 'flex',
                                      flexDirection: 'column'
                                    }}>
                                      {/* Back header - minimal height (MATCHING FREE PICK) */}
                                      <div style={{ marginBottom: '0.5rem', flex: '0 0 auto' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#bfa142', margin: 0 }}>Gary's Analysis</h3>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setFlippedCards(prev => ({
                                                ...prev,
                                                [pick.id]: false
                                              }));
                                            }}
                                            style={{
                                              background: 'rgba(191, 161, 66, 0.15)',
                                              color: '#bfa142',
                                              border: 'none',
                                              borderRadius: '4px',
                                              padding: '0.3rem 0.6rem',
                                              cursor: 'pointer',
                                              fontSize: '0.65rem',
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em',
                                              fontWeight: 500,
                                              transition: 'all 0.2s ease'
                                            }}
                                          >
                                            Back
                                          </button>
                                        </div>
                                      </div>
                                      
                                      {/* Full analysis - takes up 85% of remaining space (MATCHING FREE PICK) */}
                                      <div style={{ 
                                        flex: '1 1 85%',
                                        overflowY: 'auto',
                                        fontSize: '0.99rem',
                                        lineHeight: 1.6,
                                        opacity: 0.95,
                                        paddingRight: '0.5rem',
                                        marginBottom: '0.5rem'
                                      }}>
                                        {pick.rationale ? (
                                          // Check if rationale is already formatted or needs formatting (MATCHING FREE PICK)
                                          pick.rationale.includes('•') ? (
                                            // Already has bullets, just display
                                            <div style={{ whiteSpace: 'pre-wrap' }}>{pick.rationale}</div>
                                          ) : pick.rationale.includes('. ') && pick.rationale.length > 150 ? (
                                            // Long text with sentences - format into readable paragraphs
                                            <div>
                                              {pick.rationale
                                                .split(/(?<=[.!?])\s+/)
                                                .filter(sentence => sentence.trim().length > 0)
                                                .map((sentence, idx) => {
                                                  let cleanSentence = sentence.trim();
                                                  if (!cleanSentence.endsWith('.') && !cleanSentence.endsWith('!') && !cleanSentence.endsWith('?')) {
                                                    cleanSentence += '.';
                                                  }
                                                  return (
                                                    <p key={idx} style={{ 
                                                      marginBottom: '0.75rem',
                                                      lineHeight: 1.5
                                                    }}>
                                                      {cleanSentence}
                                                    </p>
                                                  );
                                                })}
                                            </div>
                                          ) : (
                                            // Short text or single paragraph - just display as is
                                            <div style={{ lineHeight: 1.6 }}>{pick.rationale}</div>
                                          )
                                        ) : (
                                          <div style={{ textAlign: 'center', opacity: 0.6, marginTop: '2rem' }}>
                                            Analysis not available at this time.
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Bottom info - minimal space (MATCHING FREE PICK) */}
                                      <div style={{ 
                                        flex: '0 0 auto',
                                        paddingTop: '0.5rem', 
                                        borderTop: '1px solid rgba(255,255,255,0.1)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '0.75rem'
                                      }}>
                                        <div>
                                          <span style={{ opacity: 0.6 }}>Confidence: </span>
                                          <span style={{ fontWeight: 700, color: '#bfa142' }}>
                                            {typeof pick.confidence === 'number' ? 
                                              Math.round(pick.confidence * 100) + '%' : 
                                              (pick.confidence || '75%')}
                                          </span>
                                        </div>
                                        <div>
                                          <span style={{ opacity: 0.6 }}>Time: </span>
                                          <span style={{ fontWeight: 600 }}>
                                            {pick.time || 'TBD'}
                                          </span>
                                        </div>
                                      </div>
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
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default RealGaryPicks; 