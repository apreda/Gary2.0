import React, { useState, useEffect, useRef } from "react";
// Re-deployed GaryProps with card design that matches RealGaryPicks style
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
      // Get today's prop picks
      const data = await propPicksService.getTodayPropPicks();
      
      // Process the data - extract picks from the nested structure
      let processedPicks = [];
      
      if (data && data.length > 0) {
        // For each prop_picks record
        data.forEach(record => {
          // If the record has a picks array, extract and process each pick
          if (record.picks && Array.isArray(record.picks)) {
            // Add id to each pick from the record for React keys
            const picksWithIds = record.picks.map((pick, index) => ({
              ...pick,
              id: `${record.id}-${index}`,
              date: record.date,
              created_at: record.created_at
            }));
            processedPicks = [...processedPicks, ...picksWithIds];
          }
        });
      }
      
      console.log(`Processed ${processedPicks.length} individual prop picks`);
      setPicks(processedPicks);
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
      showToast(`Successfully ${decisionText} ${pick.pick}`, "success");
      
      // Step 4: Update user stats
      await userStatsService.incrementDecisionCount(userId, decision);
      
      // Log the successful decision
      console.log(`User ${userId} successfully ${decisionText} pick ${pick.id}`);
      
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
                    {/* No tabs needed as we only show today's picks */}
                    
                    <h1 className="text-5xl font-bold text-center mb-3" style={{ color: '#ffffff' }}>
                      Gary's Props
                    </h1>
                    <p className="text-center text-gray-400 mb-5 max-w-2xl mx-auto">
                      High-upside player prop recommendations with +EV odds
                    </p>
                    
                    {/* BETA Banner */}
                    <div className="text-center mb-6 bg-[#1a1a1a] border border-[#b8953f]/30 rounded-lg p-4 max-w-xl mx-auto">
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <span className="inline-block px-2 py-1 bg-[#b8953f] text-black font-bold rounded text-xs">
                          BETA
                        </span>
                        <span className="text-white font-medium text-sm">
                          This feature is in testing mode.
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">
                        Player props picks are experimental and may not be as accurate as our regular picks.
                      </p>
                    </div>
                    
                    <div className="text-center mb-6">
                      <span className="inline-block px-4 py-2 border border-[#b8953f]/50 rounded-full text-[#b8953f] text-sm">
                        Currently available for NBA & MLB only - NFL coming when season starts
                      </span>
                    </div>
                    
                    {/* No Yesterday's Performance Banner needed */}
                    
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
                                              {pick.league || 'NBA'}
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
                                              {pick.matchup || 'TBD'}
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
                                            fontSize: '1.2rem', /* Reduced by 40% from 2rem */
                                            fontWeight: 700, 
                                            lineHeight: 1.1,
                                            color: '#bfa142', /* Gold color for the actual pick */
                                            wordBreak: 'break-word',
                                            marginBottom: '0.75rem'
                                          }}>
                                            {pick.pick}
                                          </div>
                                          
                                          {/* Additional info about the pick */}
                                          <div style={{
                                            fontSize: '0.85rem',
                                            opacity: 0.8,
                                            marginBottom: '0.5rem'
                                          }}>
                                            <div className="flex items-center">
                                              <span>{pick.team}</span>
                                              <span className="mx-2 text-gray-600">•</span>
                                              <span>{pick.time}</span>
                                            </div>
                                          </div>
                                        </div>
                                        
                                        {/* Stats for the pick */}
                                        <div>
                                          <div style={{ 
                                            fontSize: '0.75rem', 
                                            opacity: 0.6, 
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em', 
                                            marginBottom: '0.5rem'
                                          }}>
                                            Pick Details
                                          </div>
                                          <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 1fr',
                                            gap: '0.75rem',
                                            width: '100%',
                                          }}>
                                             <div className="bg-gray-800 rounded-lg p-3">
                                               <p className="text-gray-400 text-xs mb-1">True Probability</p>
                                               <p className="text-white font-bold">{pick.true_probability ? `${Math.round(pick.true_probability * 100)}%` : 'N/A'}</p>
                                             </div>
                                             <div className="bg-gray-800 rounded-lg p-3">
                                               <p className="text-gray-400 text-xs mb-1">Implied Probability</p>
                                               <p className="text-white font-bold">{pick.implied_probability ? `${Math.round(pick.implied_probability * 100)}%` : 'N/A'}</p>
                                             </div>
                                          </div>
                                          <div className="bg-gray-800 rounded-lg p-3 mt-2">
                                            <p className="text-gray-400 text-xs mb-1">Expected Value (EV)</p>
                                            <p className="text-white font-bold">{pick.ev ? `+${Math.round(pick.ev * 100)}%` : 'N/A'}</p>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Right side content section removed */}
                                      
                                      {/* Subtle gradient overlay for depth */}
                                      <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'radial-gradient(circle at center, transparent 60%, rgba(0,0,0,0.4) 140%)',
                                        opacity: 0.5,
                                        pointerEvents: 'none'
                                      }}></div>
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
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      color: '#ffffff',
                                    }}>
                                      <div style={{ 
                                        color: '#fff',
                                        width: '100%',
                                        height: '100%',
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
                                        <p style={{ margin: 0, fontWeight: 400, opacity: 0.9, marginBottom: '1.5rem' }}>
                                          {pick.rationale || 'Analysis not available.'}
                                        </p>
                                        
                                        {/* Pick Details */}
                                        <div style={{ marginBottom: '1.5rem' }}>
                                          <div style={{ 
                                            fontSize: '0.8rem', 
                                            opacity: 0.6, 
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em', 
                                            marginBottom: '0.75rem'
                                          }}>
                                            Pick Details
                                          </div>
                                          
                                          <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-gray-800 rounded-lg p-3">
                                              <p className="text-gray-400 text-xs mb-1">Line</p>
                                              <p className="text-white text-sm font-medium">{pick.line}</p>
                                            </div>
                                            <div className="bg-gray-800 rounded-lg p-3">
                                              <p className="text-gray-400 text-xs mb-1">Odds</p>
                                              <p className="text-white text-sm font-medium">{pick.odds}</p>
                                            </div>
                                            <div className="bg-gray-800 rounded-lg p-3">
                                              <p className="text-gray-400 text-xs mb-1">EV</p>
                                              <p className="text-white text-sm font-medium">{pick.ev ? `+${Math.round(pick.ev * 100)}%` : 'N/A'}</p>
                                            </div>
                                            <div className="bg-gray-800 rounded-lg p-3">
                                              <p className="text-gray-400 text-xs mb-1">League</p>
                                              <p className="text-white text-sm font-medium">{pick.league}</p>
                                            </div>
                                          </div>
                                        </div>
                                        
                                        {/* Game Information */}
                                        <div>
                                          <div style={{ 
                                            fontSize: '0.8rem', 
                                            opacity: 0.6, 
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em', 
                                            marginBottom: '0.75rem'
                                          }}>
                                            Game Information
                                          </div>
                                          
                                          <div className="bg-gray-800 rounded-lg p-3 mb-3">
                                            <p className="text-gray-400 text-xs mb-1">Matchup</p>
                                            <p className="text-white text-sm font-medium">{pick.matchup}</p>
                                          </div>
                                          
                                          <div className="flex justify-between">
                                            <div className="bg-gray-800 rounded-lg p-3" style={{ width: '48%' }}>
                                              <p className="text-gray-400 text-xs mb-1">Time</p>
                                              <p className="text-white text-sm font-medium">{pick.time}</p>
                                            </div>
                                            <div className="bg-gray-800 rounded-lg p-3" style={{ width: '48%' }}>
                                              <p className="text-gray-400 text-xs mb-1">Team</p>
                                              <p className="text-white text-sm font-medium">{pick.team}</p>
                                            </div>
                                          </div>
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
              
            {/* Yesterday's picks tab removed as requested */}
          </div>
        )}
      </div>
    </div>
  );
}