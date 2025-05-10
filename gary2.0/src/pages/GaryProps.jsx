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
    console.log('GaryProps: Subscription check - planLoading:', planLoading, 'subscriptionStatus:', subscriptionStatus);
    if (!planLoading && subscriptionStatus === 'active') {
      console.log('GaryProps: User has active subscription, loading prop picks...');
      loadPicks();
    }
  }, [planLoading, subscriptionStatus, reloadKey])
  
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
    console.log('GaryProps: loadPicks function called');
    setLoading(true);
    setError(null);
    
    try {
      // Get today's date for logging
      const today = new Date().toISOString().split('T')[0];
      console.log(`GaryProps: Looking for prop picks for date ${today}`);
      
      // Get today's prop picks
      const data = await propPicksService.getTodayPropPicks();
      console.log('GaryProps: Initial prop picks data:', data);
      
      // Process the data - extract picks from the nested structure
      let processedPicks = [];
      
      if (data && data.length > 0) {
        console.log(`GaryProps: Found ${data.length} prop pick records for today`);
        
        // For each prop_picks record
        data.forEach(record => {
          console.log('GaryProps: Processing record:', record);
          
          // If the record has a picks array, extract and process each pick
          if (record.picks && Array.isArray(record.picks)) {
            console.log(`GaryProps: Record has ${record.picks.length} prop picks`);
            
            // Add id to each pick from the record for React keys
            const picksWithIds = record.picks.map((pick, index) => ({
              ...pick,
              id: `${record.id}-${index}`,
              date: record.date,
              created_at: record.created_at
            }));
            processedPicks = [...processedPicks, ...picksWithIds];
          } else {
            console.log('GaryProps: Record has no valid picks array:', record.picks);
          }
        });
      } else {
        // No picks found for today, generate new ones
        console.log('GaryProps: No prop picks found for today. Generating new prop picks...');
        try {
          showToast('Generating new prop picks... This may take a moment.', 'info');
          
          // Generate new prop picks
          console.log('GaryProps: Calling propPicksService.generateDailyPropPicks()...');
          const newPicks = await propPicksService.generateDailyPropPicks();
          console.log('GaryProps: Generated picks result:', newPicks);
          
          if (newPicks && newPicks.length > 0) {
            // Store the generated picks in Supabase
            console.log(`GaryProps: Storing ${newPicks.length} new prop picks`);
            await propPicksService.storePropPicksInDatabase(newPicks);
            console.log(`GaryProps: Successfully stored ${newPicks.length} new prop picks`);
            
            // Reload picks to display the newly generated ones
            console.log('GaryProps: Reloading fresh prop picks data...');
            const freshData = await propPicksService.getTodayPropPicks();
            console.log('GaryProps: Fresh prop picks data:', freshData);
            
            if (freshData && freshData.length > 0) {
              freshData.forEach(record => {
                if (record.picks && Array.isArray(record.picks)) {
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
            
            showToast(`Generated ${processedPicks.length} new prop picks!`, 'success');
          } else {
            console.log('GaryProps: No prop picks could be generated');
            showToast('No prop picks available for today', 'warning');
          }
        } catch (genError) {
          console.error('GaryProps: Error generating prop picks:', genError);
          showToast('Failed to generate prop picks', 'error');
        }
      }
      
      console.log(`GaryProps: Processed ${processedPicks.length} individual prop picks`);
      setPicks(processedPicks);
      setLoading(false);
    } catch (err) {
      console.error('GaryProps: Error in loadPicks:', err);
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 px-2">
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
                                      transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
                                    }}
                                  >
                                    {/* Front of card */}
                                    <div 
                                      style={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        backfaceVisibility: 'hidden',
                                        background: 'linear-gradient(135deg, rgba(22, 22, 28, 0.97) 0%, rgba(28, 28, 32, 0.95) 100%)',
                                        borderRadius: '16px',
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        overflow: 'hidden',
                                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(191, 161, 66, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
                                        color: '#ffffff',
                                        border: '1px solid rgba(40, 40, 45, 0.85)',
                                        position: 'relative',
                                      }}>
                                        {/* Premium gold accent at top - mimicking Beta icon style */}
                                        <div style={{
                                          position: 'absolute',
                                          top: 0,
                                          left: 0,
                                          right: 0,
                                          height: '4px',
                                          background: 'linear-gradient(90deg, rgba(191, 161, 66, 0.5) 0%, rgba(212, 175, 55, 0.95) 50%, rgba(191, 161, 66, 0.5) 100%)',
                                          boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.1), 0 1px 2px rgba(0, 0, 0, 0.2)',
                                        }}></div>
                                        
                                        {/* Subtle gold edge glow */}
                                        <div style={{
                                          position: 'absolute',
                                          top: 0,
                                          left: 0,
                                          right: 0,
                                          height: '100%',
                                          pointerEvents: 'none',
                                          boxShadow: 'inset 0 0 15px rgba(212, 175, 55, 0.1)',
                                          borderRadius: '16px',
                                        }}></div>
                                      {/* Card content - expanded to use full width */}
                                      <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: '100%',
                                        padding: '1.25rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        overflow: 'hidden',
                                      }}>
                                        <div>
                                          {/* Top section with League/Matchup side-by-side */}
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                            {/* League */}
                                            <div style={{ width: '30%' }}>
                                              <div style={{ 
                                                fontSize: '0.7rem', 
                                                opacity: 0.6, 
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em', 
                                                marginBottom: '0.1rem'
                                              }}>
                                                League
                                              </div>
                                              <div style={{ 
                                                fontSize: '0.9rem', 
                                                fontWeight: 700, 
                                                letterSpacing: '0.02em'
                                              }}>
                                                {pick.league || 'NBA'}
                                              </div>
                                            </div>
                                                                                      {/* Matchup */}
                                             <div style={{ width: '65%' }}>
                                              <div style={{ 
                                                fontSize: '0.7rem', 
                                                opacity: 0.6, 
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em', 
                                                marginBottom: '0.1rem'
                                              }}>
                                                Matchup
                                              </div>
                                              <div style={{ 
                                                fontSize: '0.9rem', 
                                                fontWeight: 600,
                                                lineHeight: 1.2
                                              }}>
                                                {pick.matchup || 'TBD'}
                                              </div>
                                            </div>
                                          </div>
                                          
                                          {/* The main pick display - immediately below League/Matchup */}
                                          <div style={{ 
                                            padding: '0.5rem 0', 
                                            borderTop: '1px solid rgba(255, 255, 255, 0.1)', 
                                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                            marginTop: '0.25rem',
                                            marginBottom: '0.75rem'
                                          }}>
                                            <div style={{ 
                                              fontSize: '0.7rem', 
                                              opacity: 0.7, 
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em', 
                                              marginBottom: '0.2rem'
                                            }}>
                                              Gary's Pick
                                            </div>
                                            <div style={{ 
                                              fontSize: '1.2rem', /* Reduced by 40% from 2rem */
                                              fontWeight: 700, 
                                              lineHeight: 1.1,
                                              color: '#bfa142', /* Gold color for the actual pick */
                                              wordBreak: 'break-word',
                                              marginBottom: '0.2rem'
                                            }}>
                                              {pick.pick}
                                            </div>
                                          </div>
                                            
                                          {/* Confidence level and Gary Coin */}
                                          <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '0.5rem',
                                            marginTop: '0.25rem'
                                          }}>
                                            <div style={{
                                              display: 'flex',
                                              flexDirection: 'column',
                                              width: '75%'
                                            }}>
                                              <div style={{
                                                fontSize: '0.65rem',
                                                color: '#bfa142',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                                marginBottom: '0.1rem',
                                                fontWeight: 500
                                              }}>
                                                Confidence
                                              </div>
                                              <div style={{
                                                fontSize: '0.9rem',
                                                fontWeight: 600,
                                                color: 'white'
                                              }}>
                                                {pick.confidence || 'High'}
                                              </div>
                                            </div>
                                            <div style={{ width: '30%', textAlign: 'right' }}>
                                              <img src="/coin2.png" alt="Gary Coin" style={{ width: '70px', height: '70px' }} />
                                            </div>
                                          </div>
                                          
                                          {/* Rationale/Analysis section */}
                                          <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                                            <div style={{ 
                                              fontSize: '0.7rem', 
                                              opacity: 0.7, 
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em', 
                                              marginBottom: '0.5rem',
                                              color: '#bfa142',
                                              fontWeight: 500
                                            }}>
                                              Analysis
                                            </div>
                                            <div style={{ 
                                              margin: 0, 
                                              fontWeight: 400, 
                                              opacity: 0.9, 
                                              fontSize: '0.85rem',
                                              lineHeight: 1.4,
                                              maxHeight: '100px',
                                              overflow: 'auto'
                                            }}>
                                              {pick.rationale || 'Analysis not available at this time.'}
                                            </div>
                                          </div>
                                        </div>
                                        
                                        {/* Stats for the pick */}
                                        <div>
                                          <div style={{ 
                                            fontSize: '0.7rem', 
                                            opacity: 0.6, 
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em', 
                                            marginBottom: '0.3rem'
                                          }}>
                                            Pick Details
                                          </div>
                                           <div style={{
                                             display: 'grid',
                                             gridTemplateColumns: '1fr 1fr 1fr',
                                             gap: '0.5rem',
                                             width: '100%',
                                             marginTop: '0.3rem'
                                           }}>
                                              <div style={{
                                                background: 'linear-gradient(145deg, rgba(33, 30, 22, 0.95) 0%, rgba(25, 23, 17, 0.9) 100%)',
                                                border: '1px solid rgba(191, 161, 66, 0.5)',
                                                borderRadius: '6px',
                                                padding: '0.5rem',
                                                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 0 0 1px rgba(191, 161, 66, 0.15)',
                                              }}>
                                                <p style={{ color: 'rgba(212, 175, 55, 0.95)', fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600, textShadow: '0 1px 1px rgba(0, 0, 0, 0.5)' }}>True Prob</p>
                                                <p style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem', textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' }}>{pick.true_probability ? `${Math.round(pick.true_probability * 100)}%` : 'N/A'}</p>
                                              </div>
                                              <div style={{
                                                background: 'linear-gradient(145deg, rgba(33, 30, 22, 0.95) 0%, rgba(25, 23, 17, 0.9) 100%)',
                                                border: '1px solid rgba(191, 161, 66, 0.5)',
                                                borderRadius: '6px',
                                                padding: '0.5rem',
                                                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 0 0 1px rgba(191, 161, 66, 0.15)',
                                              }}>
                                                <p style={{ color: 'rgba(212, 175, 55, 0.95)', fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600, textShadow: '0 1px 1px rgba(0, 0, 0, 0.5)' }}>Implied Prob</p>
                                                <p style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem', textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' }}>{pick.implied_probability ? `${Math.round(pick.implied_probability * 100)}%` : 'N/A'}</p>
                                              </div>
                                              <div style={{
                                                background: 'linear-gradient(145deg, rgba(33, 30, 22, 0.95) 0%, rgba(25, 23, 17, 0.9) 100%)',
                                                border: '1px solid rgba(191, 161, 66, 0.5)',
                                                borderRadius: '6px',
                                                padding: '0.5rem',
                                                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 0 0 1px rgba(191, 161, 66, 0.15)',
                                              }}>
                                                <p style={{ color: 'rgba(212, 175, 55, 0.95)', fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600, textShadow: '0 1px 1px rgba(0, 0, 0, 0.5)' }}>EV</p>
                                                <p style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem', textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' }}>{pick.ev ? `+${Math.round(pick.ev * 100)}%` : 'N/A'}</p>
                                              </div>
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
                                      background: 'linear-gradient(135deg, rgba(20, 20, 24, 0.95) 0%, rgba(30, 30, 35, 0.93) 100%)',
                                      borderRadius: '16px',
                                      padding: '1.25rem',
                                      transform: 'rotateY(180deg)',
                                      overflow: 'hidden',
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      color: '#ffffff',
                                      border: '1px solid rgba(40, 40, 45, 0.8)',
                                      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(191, 161, 66, 0.1)',
                                    }}>
                                      {/* Gold accent line at top */}
                                      <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        height: '3px',
                                        background: 'linear-gradient(90deg, rgba(191, 161, 66, 0.5) 0%, rgba(191, 161, 66, 0.9) 50%, rgba(191, 161, 66, 0.5) 100%)',
                                      }}></div>
                                      
                                      <div style={{ 
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: '100%',
                                        padding: '1.25rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        overflow: 'auto',
                                      }}>
                                        
                                        {/* Pick Details */}
                                        <div style={{ marginTop: 'auto' }}>
                                          <div style={{ 
                                            fontSize: '0.7rem', 
                                            opacity: 0.7, 
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em', 
                                            marginBottom: '0.5rem',
                                            color: '#bfa142',
                                            fontWeight: 500
                                          }}>
                                            Pick Details
                                          </div>
                                          
                                          <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 1fr',
                                            gap: '0.5rem',
                                            width: '100%',
                                            marginTop: '0.3rem'
                                          }}>
                                            <div style={{
                                              background: 'rgba(25, 23, 17, 0.9)',
                                              border: '1px solid rgba(191, 161, 66, 0.4)',
                                              borderRadius: '6px',
                                              padding: '0.5rem',
                                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                                            }}>
                                              <p style={{ color: '#bfa142', fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 500 }}>Line</p>
                                              <p style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{pick.line || 'N/A'}</p>
                                            </div>
                                            <div style={{
                                              background: 'rgba(25, 23, 17, 0.9)',
                                              border: '1px solid rgba(191, 161, 66, 0.4)',
                                              borderRadius: '6px',
                                              padding: '0.5rem',
                                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                                            }}>
                                              <p style={{ color: '#bfa142', fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 500 }}>Odds</p>
                                              <p style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{pick.odds || 'N/A'}</p>
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
                                          
                                          <div style={{
                                            background: 'linear-gradient(180deg, rgba(26, 26, 31, 0.98) 0%, rgba(20, 20, 24, 0.98) 100%)',
                                            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)',
                                            border: '1px solid rgba(40, 40, 45, 0.8)',
                                            borderRadius: '0.5rem',
                                            padding: '1rem',
                                            marginBottom: '1rem',
                                            overflow: 'hidden',
                                            position: 'relative',
                                          }} key={pick.id}>
                                            {/* Gold accent line at top */}
                                            <div style={{
                                              position: 'absolute',
                                              top: 0,
                                              left: 0,
                                              right: 0,
                                              height: '3px',
                                              background: 'linear-gradient(90deg, rgba(191, 161, 66, 0.5) 0%, rgba(191, 161, 66, 0.9) 50%, rgba(191, 161, 66, 0.5) 100%)',
                                            }}></div>
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