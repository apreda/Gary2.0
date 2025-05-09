import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { picksService } from '../services/picksService';
import { resultsService } from '../services/resultsService';
import { betTrackingService } from '../services/betTrackingService';
import { picksPersistenceService } from '../services/picksPersistenceService';
import { userStatsService } from '../services/userStatsService';
import { garyPhrases } from '../utils/garyPhrases';
import { supabase, ensureAnonymousSession } from '../supabaseClient';
import { propPicksService } from '../services/propPicksService'; // New service for prop picks

function GaryProps() {
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const { userPlan, planLoading, subscriptionStatus } = useUserPlan();
  const navigate = useNavigate();
  
  // State for cards loaded from the database
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
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
      console.log('GaryProps: User subscription check', {
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

  // Toast notification system
  const showToast = useToast();
  
  // Debug logs for troubleshooting
  useEffect(() => {
    console.log('[GaryProps] picks:', picks);
    console.log('[GaryProps] loading:', loading);
    console.log('[GaryProps] error:', error);
  }, [picks, loading, error]);

  // Load player prop picks from Supabase
  const loadPicks = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get today's date in correct format
      const now = new Date();
      const dateString = now.toISOString().split('T')[0];
      
      // Use the existing persistence service but target the prop_picks table
      let picksData;
      
      if (activeTab === 'today') {
        // Get today's prop picks
        picksData = await propPicksService.getTodayPropPicks();
        
        // If no picks found for today, generate them
        if (!picksData || picksData.length === 0) {
          console.log('No prop picks found for today, generating new ones...');
          setStatus('Generating today\'s player prop picks... This may take a minute.');
          
          try {
            // Generate new prop picks
            const generationResult = await propPicksService.generateDailyPropPicks();
            
            if (generationResult.success && generationResult.count > 0) {
              console.log(`Successfully generated ${generationResult.count} new prop picks`);
              
              // Fetch the newly generated picks
              picksData = await propPicksService.getTodayPropPicks();
            } else {
              console.log('No prop picks could be generated at this time');
            }
          } catch (genError) {
            console.error('Error generating prop picks:', genError);
          }
        }
      } else {
        // Get yesterday's prop picks
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = yesterday.toISOString().split('T')[0];
        picksData = await propPicksService.getPropPicksByDate(yesterdayString);
      }
      
      if (picksData && picksData.length > 0) {
        console.log(`Found ${picksData.length} prop picks for ${activeTab === 'today' ? 'today' : 'yesterday'}`);
        setPicks(picksData);
      } else {
        console.log(`No prop picks found for ${activeTab === 'today' ? 'today' : 'yesterday'}`);
        setPicks([]);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error loading prop picks:', err);
      setError(`Error loading picks: ${err.message}`);
      setLoading(false);
    }
  };

  // Handler called when a user makes a bet/fade decision in PickCard.
  // Records the decision, displays a toast notification, and updates user stats.
  const handleDecisionMade = async (decision, pick) => {
    if (!user) {
      console.log('User not logged in, redirecting to sign in');
      navigate('/signin');
      return;
    }
    
    // Prevent multiple clicks while processing
    if (processingDecisions[pick.id]) {
      console.log('Already processing decision for this pick');
      return;
    }
    
    // Set processing state for this pick
    setProcessingDecisions(prev => ({
      ...prev,
      [pick.id]: true
    }));
    
    try {
      console.log(`User ${user.id} made decision: ${decision} on prop pick: ${pick.id}`);
      
      // Record the user's decision using the same betTrackingService
      const result = await betTrackingService.recordDecision(pick.id, user.id, decision);
      
      if (result.success) {
        // Update UI state to show the user's decision
        setUserDecisions(prev => ({
          ...prev,
          [pick.id]: decision
        }));
        
        // Show success notification
        showToast({
          title: "Pick Recorded!",
          description: `You decided to ${decision} on ${pick.player_name}'s ${pick.prop_type}.`,
          type: "success",
          duration: 3000
        });
      } else {
        throw new Error(result.error || 'Failed to record decision');
      }
    } catch (error) {
      console.error('Error recording decision:', error);
      
      // Show error notification
      showToast({
        title: "Error",
        description: `Failed to record your decision: ${error.message}`,
        type: "error",
        duration: 4000
      });
    } finally {
      // Clear processing state for this pick
      setProcessingDecisions(prev => ({
        ...prev,
        [pick.id]: false
      }));
    }
  };

  // Functions to navigate between picks
  const nextPick = () => {
    if (animating || currentIndex >= picks.length - 1) return;
    
    setAnimating(true);
    setCurrentIndex(prev => Math.min(prev + 1, picks.length - 1));
    
    // Reset animation state after animation completes
    setTimeout(() => {
      setAnimating(false);
    }, 300);
  };
  
  const prevPick = () => {
    if (animating || currentIndex <= 0) return;
    
    setAnimating(true);
    setCurrentIndex(prev => Math.max(prev - 1, 0));
    
    // Reset animation state after animation completes
    setTimeout(() => {
      setAnimating(false);
    }, 300);
  };
  
  // Function to toggle the flipped state for this specific card
  const toggleFlip = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    setFlippedCards(prev => {
      const newState = { ...prev };
      newState[currentIndex] = !newState[currentIndex];
      return newState;
    });
  };

  return (
    <div className="min-h-screen bg-black relative">
      {/* Background gradient overlay */}
      <div className="absolute inset-0" style={{ 
        backgroundImage: `url(${BG2})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: 0.17,
        mixBlendMode: 'overlay',
      }}></div>
      
      <div className="container mx-auto px-4 pt-24 pb-12 relative z-10">
        {/* BETA Testing Notice */}
        <div className="w-full max-w-4xl mx-auto mb-8 bg-[#20232D] border-2 border-[#B8953F] rounded-lg p-4">
          <div className="flex items-center">
            <div className="bg-[#B8953F] text-black font-bold px-3 py-1 rounded-md mr-3 text-sm">
              BETA
            </div>
            <div className="text-white">
              <p className="font-medium">This feature is in testing mode. Player props picks are experimental and may not be as accurate as our regular picks.</p>
            </div>
          </div>
        </div>
        
        {/* Header Section */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2 text-white">Gary's Props</h1>
          <p className="text-gray-400 mb-2">High-upside player prop recommendations with +EV odds</p>
          <div className="inline-block py-1 px-3 rounded-full text-sm font-semibold" style={{ background: 'rgba(184, 149, 63, 0.15)', border: '1px solid #B8953F', color: '#B8953F' }}>
            Currently available for NBA & MLB only · NFL coming when season starts
          </div>
        </div>
        
        {/* Page Title */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Gary's Props</h1>
          <p className="text-lg text-gray-300 max-w-xl mx-auto">
            AI-powered player prop picks across NBA & MLB
          </p>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-pulse flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-gray-700 to-gray-800 mb-4"></div>
              <div className="h-4 w-32 bg-gradient-to-r from-gray-700 to-gray-800 rounded"></div>
              <p className="text-gray-400 mt-4">Loading prop picks...</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <div className="text-red-500 mb-2">⚠️</div>
            <h2 className="text-xl text-red-500 font-semibold mb-2">Error Loading Picks</h2>
            <p className="text-gray-300">{error}</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              {/* Tab Navigation */}
              <div className="flex justify-center mb-8">
                <div className="flex bg-[#20232D] rounded-full p-1">
                  <button
                    onClick={() => {
                      setActiveTab('today');
                      loadPicks();
                    }}
                    className={`px-6 py-2 text-sm rounded-full transition-all ${
                      activeTab === 'today'
                        ? 'bg-[#B8953F] text-black font-medium'
                        : 'text-white hover:bg-gray-800'
                    }`}
                  >
                    Today's Props
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('yesterday');
                      loadPicks();
                    }}
                    className={`px-6 py-2 text-sm rounded-full transition-all ${
                      activeTab === 'yesterday'
                        ? 'bg-[#B8953F] text-black font-medium'
                        : 'text-white hover:bg-gray-800'
                    }`}
                  >
                    Yesterday's Props
                  </button>
                </div>
              </div>
              
              {activeTab === 'today' && (
                <div>
                  {status && (
                    <div className="text-center py-6 max-w-lg mx-auto">
                      <div className="animate-pulse">
                        <img src={gary1} alt="Gary" className="w-20 h-20 mx-auto mb-4 opacity-80" />
                        <h3 className="text-lg text-[#B8953F] font-semibold mb-2">{status}</h3>
                        <div className="mt-4 flex justify-center space-x-2">
                          <div className="w-2 h-2 bg-[#B8953F] rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-[#B8953F] rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                          <div className="w-2 h-2 bg-[#B8953F] rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                        </div>
                      </div>
                    </div>
                  )}
              
              {picks.length === 0 && !status ? (
                    <div className="text-center py-12 max-w-lg mx-auto">
                      <img src={gary1} alt="Gary" className="w-24 h-24 mx-auto mb-6 opacity-70" />
                      <h3 className="text-xl text-white font-semibold mb-2">No Prop Picks Today</h3>
                      <p className="text-gray-400 mb-6">
                        Our AI is analyzing player stats but hasn't found any high-confidence player prop bets for today yet. Check back later!
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      {/* Pick Counter */}
                      <div className="text-center mb-6">
                        <p className="text-gray-400 text-sm">
                          Pick {currentIndex + 1} of {picks.length}
                        </p>
                      </div>
                      
                      {/* Pick Cards with 3D Flip Effect */}
                      <div className="w-full max-w-md mx-auto">
                        {picks.map((pick, index) => {
                          // Only show the current active card
                          if (index !== currentIndex) return null;
                          
                          // Get user's decision for this pick
                          const userDecision = userDecisions[pick.id];
                          const isProcessing = processingDecisions[pick.id];
                          const isFlipped = flippedCards[currentIndex];
                          
                          return (
                            <div key={pick.id} className="perspective-1000 w-full">
                              <div className={`relative transition-transform duration-500 transform-style-3d ${
                                isFlipped ? 'rotate-y-180' : ''
                              }`}>
                                {/* Front of card */}
                                <div className={`bg-gradient-to-b from-[#1E2330] to-[#131720] border border-[#B8953F]/30 rounded-2xl shadow-xl w-full z-10 backface-hidden ${
                                  !userDecision ? 'pick-card-glow' : 'disable-card-glow'
                                }`}>
                                  {/* Card Header */}
                                  <div className="px-6 pt-6 pb-3">
                                    {/* League Badge + Date */}
                                    <div className="flex justify-between items-center mb-3">
                                      <div className="bg-[#B8953F] bg-opacity-10 border border-[#B8953F]/20 text-[#B8953F] text-xs font-bold px-2.5 py-1 rounded">
                                        {pick.league}
                                      </div>
                                      <span className="text-gray-400 text-xs">
                                        {new Date(pick.created_at).toLocaleDateString()} 
                                      </span>
                                    </div>
                                    
                                    {/* Player Name */}
                                    <h3 className="text-white text-xl font-bold mb-1">
                                      {pick.player_name}
                                    </h3>
                                    
                                    {/* Prop Type */}
                                    <div className="text-gray-300 text-sm mb-2">
                                      {pick.matchup}
                                    </div>
                                    
                                    {/* Prop Pick */}
                                    <div className="mt-3 mb-4">
                                      <div className="text-[#B8953F] font-bold text-lg">
                                        {pick.prop_type} {pick.pick_direction === 'OVER' ? 'OVER' : 'UNDER'} {pick.prop_line}
                                      </div>
                                      <div className="text-gray-400 text-sm mt-1">
                                        {pick.odds > 0 ? `+${pick.odds}` : pick.odds}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Card Actions */}
                                  <div className="px-6 pb-6">
                                    {/* If user has already made a decision, show it */}
                                    {userDecision ? (
                                      <div className="mt-3">
                                        <div className={`text-center py-3 rounded-lg ${
                                          userDecision === 'bet' 
                                            ? 'bg-green-500/10 text-green-400 border border-green-500/30' 
                                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                                        }`}>
                                          You decided to {userDecision === 'bet' ? 'BET' : 'FADE'} this pick
                                        </div>
                                      </div>
                                    ) : (
                                      /* Otherwise show bet/fade buttons */
                                      <div className="grid grid-cols-2 gap-3">
                                        <button
                                          onClick={() => handleDecisionMade('bet', pick)}
                                          disabled={isProcessing}
                                          className={`py-3 rounded-lg font-bold text-black ${
                                            isProcessing 
                                              ? 'bg-gray-500 cursor-not-allowed' 
                                              : 'bg-gradient-to-br from-[#D4AF37] to-[#B8953F] hover:from-[#E5C050] hover:to-[#D4AF37]'
                                          } transition-all shadow-md`}
                                        >
                                          {isProcessing ? 'Processing...' : 'BET'}
                                        </button>
                                        <button
                                          onClick={() => handleDecisionMade('fade', pick)}
                                          disabled={isProcessing}
                                          className={`py-3 rounded-lg font-bold ${
                                            isProcessing 
                                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                                              : 'bg-[#20232D] text-white hover:bg-[#2A2F3E]'
                                          } transition-all border border-gray-700`}
                                        >
                                          {isProcessing ? 'Processing...' : 'FADE'}
                                        </button>
                                      </div>
                                    )}
                                    
                                    {/* Flip Card Button */}
                                    <button
                                      onClick={toggleFlip}
                                      className="w-full mt-3 py-2 bg-[#20232D] hover:bg-[#2A2F3E] text-gray-400 text-sm rounded-lg transition-all"
                                    >
                                      View Analysis
                                    </button>
                                  </div>
                                </div>
                                
                                {/* Back of card (Analysis) */}
                                <div className="absolute inset-0 bg-gradient-to-b from-[#1E2330] to-[#131720] border border-[#B8953F]/30 rounded-2xl shadow-xl w-full backface-hidden rotate-y-180 overflow-hidden">
                                  {/* Back Card Header with close button */}
                                  <div className="flex justify-between items-center p-4 border-b border-gray-800">
                                    <h3 className="text-white font-semibold">Analysis</h3>
                                    <button
                                      onClick={toggleFlip}
                                      className="text-gray-400 hover:text-white transition-colors"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                  
                                  {/* Scrollable Analysis Content */}
                                  <div className="p-6 h-[340px] overflow-y-auto" style={{
                                    scrollbarWidth: 'thin',
                                    scrollbarColor: '#B8953F #1E2330',
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
                                    <p style={{ margin: 0, fontWeight: 400, opacity: 0.9 }}>
                                      {pick.rationale || 'Analysis not available.'}
                                    </p>
                                    
                                    {/* Player Stats Section */}
                                    <div style={{ 
                                      fontSize: '0.8rem', 
                                      opacity: 0.6, 
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.05em', 
                                      marginTop: '1.5rem',
                                      marginBottom: '0.75rem'
                                    }}>
                                      Player Stats
                                    </div>
                                    
                                    {/* Display player stats in a list */}
                                    <ul className="space-y-2 text-sm">
                                      {pick.stats && Object.entries(pick.stats).map(([key, value]) => (
                                        <li key={key} className="flex justify-between">
                                          <span className="text-gray-400">{key}:</span>
                                          <span className="text-white font-medium">{value}</span>
                                        </li>
                                      ))}
                                      {!pick.stats && (
                                        <li className="text-gray-400">No detailed stats available</li>
                                      )}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Navigation Buttons */}
                      <div className="flex justify-center mt-6 space-x-4">
                        <button
                          onClick={prevPick}
                          disabled={currentIndex === 0 || animating}
                          className={`flex items-center justify-center w-10 h-10 rounded-full ${
                            currentIndex === 0 || animating
                              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                              : 'bg-[#1E2330] text-gray-300 hover:bg-[#2A2F3E] hover:text-white'
                          } transition-all shadow-md`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={nextPick}
                          disabled={currentIndex === picks.length - 1 || animating}
                          className={`flex items-center justify-center w-10 h-10 rounded-full ${
                            currentIndex === picks.length - 1 || animating
                              ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                              : 'bg-[#1E2330] text-gray-300 hover:bg-[#2A2F3E] hover:text-white'
                          } transition-all shadow-md`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === 'yesterday' && (
                <div className="mx-auto max-w-4xl mb-12">
                  {picks.length === 0 ? (
                    <div className="text-center py-12 max-w-lg mx-auto">
                      <img src={gary1} alt="Gary" className="w-24 h-24 mx-auto mb-6 opacity-70" />
                      <h3 className="text-xl text-white font-semibold mb-2">No Prop Picks Yesterday</h3>
                      <p className="text-gray-400 mb-6">
                        There were no player prop picks generated yesterday. Check back later!
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      {/* Similar to today's view structure */}
                      {/* This would be identical to the card structure above */}
                    </div>
                  )}
                </div>
              )}
              
              {/* See Past Picks Button */}
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
          </>
        )}
      </div>
    </div>
  );
}

export default GaryProps;
