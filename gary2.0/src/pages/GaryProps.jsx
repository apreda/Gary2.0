import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
// Removed unused import: useUserStats, useLocation
import { useUserPlan } from "../contexts/UserPlanContext";
import BG2 from '/BG2.png'; // Import the background image directly
import { BetCard } from './BetCard';
import { useToast } from '../components/ui/ToastProvider';
import gary1 from '../assets/images/gary1.svg';
import { useAuth } from '../contexts/AuthContext';
import '../styles/PickCardGlow.css'; // Import the glow effect CSS
import '../styles/DisableCardGlow.css'; // Override to disable the glow effect

// Only import assets we actually need for the modern dark UI design
import GaryEmblem from '../assets/images/Garyemblem.png';

// Import services
import { propPicksService } from '../services/propPicksService';
import { resultsService } from '../services/resultsService';
import { betTrackingService } from '../services/betTrackingService';
import { userStatsService } from '../services/userStatsService';
import { garyPhrases } from '../utils/garyPhrases';
import { supabase, ensureAnonymousSession } from '../supabaseClient';

function GaryProps() {
  const showToast = useToast();
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const { userPlan, planLoading, subscriptionStatus } = useUserPlan();
  const navigate = useNavigate();
  
  // State for cards loaded from the database
  const [picks, setPicks] = useState([]);
  const [yesterdayPicks, setYesterdayPicks] = useState([]);
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
  
  // Function to load yesterday's prop picks from Supabase
  const loadYesterdayPicks = async () => {
    try {
      // Calculate yesterday's date
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Format as YYYY-MM-DD
      const yesterdayFormatted = yesterday.toISOString().split('T')[0];
      
      console.log(`Loading yesterday's prop picks for date: ${yesterdayFormatted}`);
      
      // Fetch yesterday's prop picks from Supabase
      const { data, error } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('date', yesterdayFormatted)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading yesterday\'s prop picks:', error);
        return;
      }
      
      console.log(`Loaded ${data.length} yesterday's prop picks`);
      setYesterdayPicks(data || []);
    } catch (err) {
      console.error('Error in loadYesterdayPicks:', err);
    }
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
  
  // Load yesterday's picks when tab changes
  useEffect(() => {
    if (activeTab === 'yesterday' && yesterdayPicks.length === 0 && !planLoading && subscriptionStatus === 'active') {
      loadYesterdayPicks();
    }
  }, [activeTab, yesterdayPicks.length, planLoading, subscriptionStatus]);
  
  // Check for existing user decisions when picks load
  useEffect(() => {
    if (picks.length > 0 && user) {
      checkUserDecisions();
    }
  }, [picks, user]);

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
      
      // Also load yesterday's picks
      loadYesterdayPicks();
      
      try {
        const { data, error } = await propPicksService.getTodayPropPicks();
        
        if (error) {
          console.error('Error loading prop picks:', error);
          setError('Failed to load prop picks. Please try again later.');
          setLoading(false);
          return;
        }
        
        // Ensure data is an array even if it's null or undefined
        const picksArray = data || [];
        console.log(`Loaded ${picksArray.length} total prop picks`);
        
        // Set state with picked items
        setPicks(picksArray);
        setLoading(false);
      } catch (err) {
        console.error('Error in propPicksService.getTodayPropPicks:', err);
        setError('An unexpected error occurred. Please try again later.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error in loadPicks:', err);
      setError('An unexpected error occurred. Please try again later.');
      setLoading(false);
    }
  };

  /**
   * Handler called when a user makes a bet/fade decision in PickCard.
   * Records the decision, displays a toast notification, and updates user stats.
   */
  const handleDecisionMade = async (decision, pick) => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    // Prevent double-clicking by marking this pick as processing
    setProcessingDecisions(prev => ({ ...prev, [pick.id]: true }));
    
    try {
      // Save the user's decision to Supabase
      const { success, error } = await betTrackingService.recordUserDecision(
        pick.id,
        user.id,
        decision,
        pick.league
      );
      
      if (error) {
        console.error('Error recording decision:', error);
        showToast(`Error saving your ${decision}`, 'error');
        // Reset processing status
        setProcessingDecisions(prev => ({ ...prev, [pick.id]: false }));
        return;
      }
      
      // Update user stats
      userStatsService.trackBet(user.id, pick.league);
      
      // Display appropriate toast message
      let toastMessage;
      let toastType = 'success';
      
      if (decision === 'bet') {
        toastMessage = garyPhrases.getRandomAgreePhrase();
      } else if (decision === 'fade') {
        toastMessage = garyPhrases.getRandomDisagreePhrase();
      } else {
        toastMessage = 'Your decision has been recorded';
      }
      
      showToast(toastMessage, toastType);
      
      // Update local state to reflect the user's decision
      setUserDecisions(prev => ({
        ...prev,
        [pick.id]: decision
      }));
      
      // Reset processing status
      setProcessingDecisions(prev => ({ ...prev, [pick.id]: false }));
      
      // Reload data after decision is made
      setReloadKey(prevKey => prevKey + 1);
      
    } catch (err) {
      console.error('Error in handleDecisionMade:', err);
      showToast('An unexpected error occurred', 'error');
      // Reset processing status
      setProcessingDecisions(prev => ({ ...prev, [pick.id]: false }));
    }
  };

  // Responsive card dimensions with 60% increase
  const cardStyle = {
    width: '320px', // 60% larger than the original size
    height: '480px',
    margin: '0 auto 2rem auto',
    position: 'relative',
  };

  // Function to toggle the flipped state for a specific card
  const toggleCardFlip = (id, e) => {
    if (e) e.stopPropagation();
    setFlippedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="min-h-screen" style={{ background: `url(${BG2}) center/cover no-repeat fixed` }}>
      <div className="mx-auto px-4 py-12 max-w-screen-xl">
        {loading ? (
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-gold"></div>
          </div>
        ) : error ? (
          <div className="text-center py-10">
            <h2 className="text-2xl text-red-500 mb-4">Error</h2>
            <p className="text-white">{error}</p>
            <button
              onClick={() => loadPicks()}
              className="mt-4 px-4 py-2 bg-gold text-black font-bold rounded"
            >
              Try Again
            </button>
          </div>
        ) : planLoading ? (
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-gold"></div>
          </div>
        ) : subscriptionStatus !== 'active' && picks.length > 0 ? (
          <div className="mb-12">
            <button
              onClick={() => navigate('/subscribe')}
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
            {activeTab === 'today' && picks.length > 0 && (
                <div className="mb-12">
                  {/* NEW LAYOUT: Directly on page in a horizontal row format */}
                  <div className="pt-12 px-4">
                    {/* Tab Navigation */}
                    <div className="flex justify-center mb-8">
                      <div className="bg-gray-800 rounded-lg inline-flex p-1">
                        <button
                          className={`py-2 px-6 rounded-md transition-all duration-200 ${activeTab === 'today' ? 'bg-[#b8953f] text-black font-bold' : 'text-white hover:bg-gray-700'}`}
                          onClick={() => setActiveTab('today')}
                        >
                          Today's Picks
                        </button>
                        <button
                          className={`py-2 px-6 rounded-md transition-all duration-200 ${activeTab === 'yesterday' ? 'bg-[#b8953f] text-black font-bold' : 'text-white hover:bg-gray-700'}`}
                          onClick={() => setActiveTab('yesterday')}
                        >
                          Yesterday's Picks
                        </button>
                      </div>
                    </div>
                    
                    <h1 className="text-4xl font-bold text-center mb-2" style={{ color: '#b8953f' }}>
                      DAILY PLAYER PROP PICKS
                    </h1>
                    <p className="text-center text-gray-400 mb-4 max-w-2xl mx-auto">
                      Currently available for MLB and NBA games. All picks are analyzed for positive Expected Value (EV) using advanced statistical models and real-time odds data.
                    </p>
                    
                    {/* BETA Banner */}
                    <div className="text-center mb-6">
                      <span className="inline-block px-3 py-1 bg-yellow-600 text-black font-bold rounded text-sm">
                        BETA: This feature is in testing mode. Feedback welcome!
                      </span>
                    </div>
                    
                    {/* Yesterday's Performance Banner */}
                    <div className="flex justify-center items-center mb-6">
                      <div className="inline-block px-4 py-2 rounded-lg" style={{ 
                        backgroundColor: 'rgba(25, 25, 25, 0.85)', 
                        border: '1px solid rgba(184, 149, 63, 0.3)', 
                        backdropFilter: 'blur(10px)' 
                      }}>
                        <div className="flex items-center gap-4">
                          <span className="text-[#b8953f] text-lg font-medium">Performance:</span>
                          <div className="flex gap-4">
                            <div className="text-center">
                              <span className="text-green-400 block text-lg font-bold">70%</span>
                              <span className="text-xs text-gray-400 uppercase">Win Rate</span>
                            </div>
                            <div className="text-center">
                              <span className="text-[#b8953f] block text-lg font-bold">+14.5%</span>
                              <span className="text-xs text-gray-400 uppercase">ROI</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Cards Container */}
                    <div className="container mx-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {picks.map(pick => {
                          const isFlipped = flippedCards[pick.id] || false;
                          
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
                                onClick={() => toggleCardFlip(pick.id)}
                              >
                                <div 
                                  style={{
                                    position: 'relative',
                                    width: '100%',
                                    height: '100%',
                                    transformStyle: 'preserve-3d',
                                    transition: 'transform 0.6s',
                                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                                  }}
                                >
                                  {/* FRONT OF CARD */}
                                  <div style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    backfaceVisibility: 'hidden',
                                    background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                    borderRadius: '16px',
                                    padding: '24px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                  }}>
                                    <div className="flex-1 flex flex-col">
                                      <div className="mb-4">
                                        <span className="text-[#b8953f] text-sm font-medium">{pick.league}</span>
                                        <h3 className="text-white text-xl font-bold mt-2">{pick.pick}</h3>
                                        <p className="text-gray-400 text-sm mt-1">{pick.matchup} • {pick.time}</p>
                                      </div>
                                      
                                      <div className="mt-auto">
                                        <div className="grid grid-cols-2 gap-4 mb-3">
                                          <div className="bg-gray-800 rounded-lg p-3">
                                            <p className="text-gray-400 text-xs mb-1">Line</p>
                                            <p className="text-white font-bold">{pick.line}</p>
                                          </div>
                                          <div className="bg-gray-800 rounded-lg p-3">
                                            <p className="text-gray-400 text-xs mb-1">Odds</p>
                                            <p className="text-white font-bold">{pick.odds}</p>
                                          </div>
                                        </div>
                                        <div className="bg-gray-800 rounded-lg p-3">
                                          <p className="text-gray-400 text-xs mb-1">Expected Value (EV)</p>
                                          <p className="text-white font-bold">{pick.ev ? `+${pick.ev}%` : 'N/A'}</p>
                                        </div>
                                        
                                        {user && (
                                          <div className="grid grid-cols-2 gap-4 mt-4">
                                            <button
                                              className={`px-4 py-2 rounded-lg font-medium ${
                                                userDecisions[pick.id] === 'bet' 
                                                  ? 'bg-green-600 text-white' 
                                                  : 'bg-gray-700 text-white hover:bg-green-600 hover:text-white'
                                              } transition-colors`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (!processingDecisions[pick.id] && !userDecisions[pick.id]) {
                                                  handleDecisionMade('bet', pick);
                                                }
                                              }}
                                              disabled={processingDecisions[pick.id] || userDecisions[pick.id]}
                                            >
                                              Bet
                                            </button>
                                            <button
                                              className={`px-4 py-2 rounded-lg font-medium ${
                                                userDecisions[pick.id] === 'fade' 
                                                  ? 'bg-red-600 text-white' 
                                                  : 'bg-gray-700 text-white hover:bg-red-600 hover:text-white'
                                              } transition-colors`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (!processingDecisions[pick.id] && !userDecisions[pick.id]) {
                                                  handleDecisionMade('fade', pick);
                                                }
                                              }}
                                              disabled={processingDecisions[pick.id] || userDecisions[pick.id]}
                                            >
                                              Fade
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* BACK OF CARD */}
                                  <div style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    backfaceVisibility: 'hidden',
                                    background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                    borderRadius: '16px',
                                    padding: '24px',
                                    transform: 'rotateY(180deg)',
                                    overflow: 'auto',
                                  }}>
                                    <div className="mb-4">
                                      <h3 className="text-[#b8953f] text-lg font-bold mb-3">Analysis</h3>
                                      <p className="text-white text-sm">{pick.rationale || 'No analysis available'}</p>
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
              
              {/* Yesterday's Picks Tab */}
              {activeTab === 'yesterday' && (
                <div className="mb-12">
                  {/* NEW LAYOUT: Directly on page in a horizontal row format */}
                  <div className="pt-12 px-4">
                    {/* Tab Navigation */}
                    <div className="flex justify-center mb-8">
                      <div className="bg-gray-800 rounded-lg inline-flex p-1">
                        <button
                          className={`py-2 px-6 rounded-md transition-all duration-200 ${activeTab === 'today' ? 'bg-[#b8953f] text-black font-bold' : 'text-white hover:bg-gray-700'}`}
                          onClick={() => setActiveTab('today')}
                        >
                          Today's Picks
                        </button>
                        <button
                          className={`py-2 px-6 rounded-md transition-all duration-200 ${activeTab === 'yesterday' ? 'bg-[#b8953f] text-black font-bold' : 'text-white hover:bg-gray-700'}`}
                          onClick={() => setActiveTab('yesterday')}
                        >
                          Yesterday's Picks
                        </button>
                      </div>
                    </div>
                    
                    <h1 className="text-4xl font-bold text-center mb-2" style={{ color: '#b8953f' }}>
                      YESTERDAY'S PROP PICKS
                    </h1>
                    <p className="text-center text-gray-400 mb-6 max-w-2xl mx-auto">
                      Review yesterday's player prop pick performance and outcomes.
                    </p>
                    
                    {/* Cards Container */}
                    <div className="container mx-auto">
                      {/* Loading State */}
                      {loading ? (
                        <div className="flex justify-center items-center py-20">
                          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#b8953f]"></div>
                        </div>
                      ) : yesterdayPicks.length === 0 ? (
                        <div className="text-center py-16">
                          <p className="text-gray-400 text-xl">No prop picks available for yesterday</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {yesterdayPicks.map(pick => {
                            const isFlipped = flippedCards[pick.id] || false;
                            
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
                                  onClick={() => toggleCardFlip(pick.id)}
                                >
                                  <div 
                                    style={{
                                      position: 'relative',
                                      width: '100%',
                                      height: '100%',
                                      transformStyle: 'preserve-3d',
                                      transition: 'transform 0.6s',
                                      transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                                    }}
                                  >
                                    {/* FRONT OF CARD */}
                                    <div style={{
                                      position: 'absolute',
                                      width: '100%',
                                      height: '100%',
                                      backfaceVisibility: 'hidden',
                                      background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                      borderRadius: '16px',
                                      padding: '24px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                    }}>
                                      <div className="flex-1 flex flex-col">
                                        <div className="mb-4">
                                          <span className="text-[#b8953f] text-sm font-medium">{pick.league}</span>
                                          <h3 className="text-white text-xl font-bold mt-2">{pick.pick}</h3>
                                          <p className="text-gray-400 text-sm mt-1">{pick.matchup} • {pick.time}</p>
                                        </div>
                                        
                                        <div className="mt-auto">
                                          <div className="grid grid-cols-2 gap-4 mb-3">
                                            <div className="bg-gray-800 rounded-lg p-3">
                                              <p className="text-gray-400 text-xs mb-1">Line</p>
                                              <p className="text-white font-bold">{pick.line}</p>
                                            </div>
                                            <div className="bg-gray-800 rounded-lg p-3">
                                              <p className="text-gray-400 text-xs mb-1">Odds</p>
                                              <p className="text-white font-bold">{pick.odds}</p>
                                            </div>
                                          </div>
                                          <div className="bg-gray-800 rounded-lg p-3">
                                            <p className="text-gray-400 text-xs mb-1">Expected Value (EV)</p>
                                            <p className="text-white font-bold">{pick.ev ? `+${pick.ev}%` : 'N/A'}</p>
                                          </div>
                                          
                                          <div className="mt-4">
                                            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${pick.result === 'win' ? 'bg-green-900 text-green-300' : pick.result === 'loss' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'}`}>
                                              {pick.result === 'win' ? 'WIN' : pick.result === 'loss' ? 'LOSS' : 'PENDING'}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* BACK OF CARD */}
                                    <div style={{
                                      position: 'absolute',
                                      width: '100%',
                                      height: '100%',
                                      backfaceVisibility: 'hidden',
                                      background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                      borderRadius: '16px',
                                      padding: '24px',
                                      transform: 'rotateY(180deg)',
                                      overflow: 'auto',
                                    }}>
                                      <div className="mb-4">
                                        <h3 className="text-[#b8953f] text-lg font-bold mb-3">Analysis</h3>
                                        <p className="text-white text-sm">{pick.rationale || 'No analysis available'}</p>
                                      </div>
                                      
                                      <div className="mt-4">
                                        <h3 className="text-[#b8953f] text-lg font-bold mb-2">Outcome</h3>
                                        <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${pick.result === 'win' ? 'bg-green-900 text-green-300' : pick.result === 'loss' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'}`}>
                                          {pick.result === 'win' ? 'WIN' : pick.result === 'loss' ? 'LOSS' : 'PENDING'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GaryProps;
