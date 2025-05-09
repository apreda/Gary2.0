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

export default function GaryProps() {
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
      
      console.log(\`Loading yesterday's prop picks for date: \${yesterdayFormatted}\`);
      
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
      
      console.log(\`Loaded \${data.length} yesterday's prop picks\`);
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
      // Simply get today's prop picks
      const { data, error } = await propPicksService.getTodaysPropPicks();
      
      if (error) {
        setError("Error loading picks: " + error.message);
        setLoading(false);
        return;
      }
      
      // Debug log the picks we got
      console.log(\`Loaded \${data.length} prop picks\`);
      
      setPicks(data || []);
      setLoading(false);
    } catch (err) {
      console.error('Error in loadPicks:', err);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };
  
  // Handler called when a user makes a bet/fade decision in PickCard.
  // Records the decision, displays a toast notification, and updates user stats.
  const handleDecisionMade = async (decision, pick) => {
    if (!user) {
      showToast("You must be logged in to track bets", "error");
      return;
    }
    
    // Prevent multiple clicks on the same pick
    if (processingDecisions[pick.id] || userDecisions[pick.id]) {
      return;
    }
    
    // Mark this pick as being processed to prevent race conditions
    setProcessingDecisions(prev => ({ ...prev, [pick.id]: true }));
    
    try {
      const userId = user.id;
      
      // Step 1: Track the bet decision in Supabase
      await betTrackingService.trackBetDecision(pick.id, userId, decision, pick.matchup, pick.pick, pick.league);
      
      // Step 2: Update local state to reflect the decision
      setUserDecisions(prev => ({
        ...prev,
        [pick.id]: decision
      }));
      
      // Step 3: Show a toast notification
      const decisionText = decision === 'bet' ? 'bet' : 'faded';
      showToast(\`Successfully \${decisionText} \${pick.pick}\`, "success");
      
      // Step 4: Update user stats
      await userStatsService.incrementDecisionCount(userId, decision);
      
      // Log the successful decision
      console.log(\`User \${userId} successfully \${decisionText} pick \${pick.id}\`);
      
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
    <div className="min-h-screen" style={{ background: \`url(\${BG2}) center/cover no-repeat fixed\` }}>
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
                          className={\`py-2 px-6 rounded-md transition-all duration-200 \${activeTab === 'today' ? 'bg-[#b8953f] text-black font-bold' : 'text-white hover:bg-gray-700'}\`}
                          onClick={() => setActiveTab('today')}
                        >
                          Today's Picks
                        </button>
                        <button
                          className={\`py-2 px-6 rounded-md transition-all duration-200 \${activeTab === 'yesterday' ? 'bg-[#b8953f] text-black font-bold' : 'text-white hover:bg-gray-700'}\`}
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
                        background: 'linear-gradient(135deg, rgba(184,149,63,0.2) 0%, rgba(184,149,63,0.3) 100%)',
                        border: '1px solid rgba(184,149,63,0.4)',
                      }}>
                        <div className="text-[#b8953f] font-medium">Yesterday's Results:</div>
                        <div className="mt-1 flex space-x-3">
                          <span className="text-green-400">Wins: {yesterdayPicks.filter(p => p.result === 'win').length}</span>
                          <span className="text-red-400">Losses: {yesterdayPicks.filter(p => p.result === 'loss').length}</span>
                          <span className="text-gray-400">Pending: {yesterdayPicks.filter(p => p.result !== 'win' && p.result !== 'loss').length}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Cards Container */}
                    <div className="container mx-auto">
                      {/* Loading State */}
                      {loading ? (
                        <div className="flex justify-center items-center py-20">
                          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#b8953f]"></div>
                        </div>
                      ) : picks.length === 0 ? (
                        <div className="text-center py-16">
                          <p className="text-gray-400 text-xl">No prop picks available for today</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {picks.map(pick => {
                            const isFlipped = flippedCards[pick.id] || false;
                            const hasDecided = userDecisions[pick.id] !== undefined;
                            const userDecision = userDecisions[pick.id];
                            const isProcessing = processingDecisions[pick.id] || false;
                            
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
                                            <p className="text-white font-bold">{pick.ev ? \`+\${pick.ev}%\` : 'N/A'}</p>
                                          </div>
                                          
                                          <div className="mt-4">
                                            <div className={\`inline-block px-3 py-1 rounded-full text-sm font-medium \${pick.result === 'win' ? 'bg-green-900 text-green-300' : pick.result === 'loss' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'}\`}>
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
                                        <div className={\`inline-block px-3 py-1 rounded-full text-sm font-medium \${pick.result === 'win' ? 'bg-green-900 text-green-300' : pick.result === 'loss' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'}\`}>
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
              
              {/* Yesterday's Picks Tab */}
              {/* Added proper JSX structure with balanced parentheses and loading optimization */}
              {activeTab === 'yesterday' && (
                <div className="mb-12">
                  {/* NEW LAYOUT: Directly on page in a horizontal row format */}
                  <div className="pt-12 px-4">
                    {/* Tab Navigation */}
                    <div className="flex justify-center mb-8">
                      <div className="bg-gray-800 rounded-lg inline-flex p-1">
                        <button
                          className={\`py-2 px-6 rounded-md transition-all duration-200 \${activeTab === 'today' ? 'bg-[#b8953f] text-black font-bold' : 'text-white hover:bg-gray-700'}\`}
                          onClick={() => setActiveTab('today')}
                        >
                          Today's Picks
                        </button>
                        <button
                          className={\`py-2 px-6 rounded-md transition-all duration-200 \${activeTab === 'yesterday' ? 'bg-[#b8953f] text-black font-bold' : 'text-white hover:bg-gray-700'}\`}
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
                                            <p className="text-white font-bold">{pick.ev ? \`+\${pick.ev}%\` : 'N/A'}</p>
                                          </div>
                                          
                                          <div className="mt-4">
                                            <div className={\`inline-block px-3 py-1 rounded-full text-sm font-medium \${pick.result === 'win' ? 'bg-green-900 text-green-300' : pick.result === 'loss' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'}\`}>
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
                                        <div className={\`inline-block px-3 py-1 rounded-full text-sm font-medium \${pick.result === 'win' ? 'bg-green-900 text-green-300' : pick.result === 'loss' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'}\`}>
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
