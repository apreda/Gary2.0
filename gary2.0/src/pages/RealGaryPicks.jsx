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

// Import services
import { picksService } from '../services/picksService';
import { schedulerService } from '../services/schedulerService';
import { resultsService } from '../services/resultsService';
import { betTrackingService } from '../services/betTrackingService';
import { picksPersistenceService } from '../services/picksPersistenceService';
import { supabase, ensureAnonymousSession } from '../supabaseClient';

function RealGaryPicks() {
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const { userPlan } = useUserPlan();
  const navigate = useNavigate();

  // State for picks and UI
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  // Load picks from Supabase
  const loadPicks = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error: fetchError } = await supabase
        .from('daily_picks')
        .select('picks')
        .eq('date', today)
        .maybeSingle(); // Use maybeSingle to avoid 406 errors
      console.log('Supabase fetch result:', { data, fetchError });

      // Parse picks column if it's a string
      let picksArray = [];
      if (data && data.picks) {
        picksArray = typeof data.picks === 'string' ? JSON.parse(data.picks) : data.picks;
        
        // SIMPLIFIED: Map picks to only what's needed for front/back display
        picksArray = picksArray.map(pick => {
          // Create a minimal pick object with just what we need
          const simplePick = {
            id: pick.id,
            // Front of card: Just the pick
            shortPick: pick.shortPickStr || pick.rawAnalysis?.pick || '',
            // Back of card: Just the rationale
            description: pick.garysAnalysis || pick.rawAnalysis?.rationale || '',
            // Minimal metadata needed for RetroPickCard component
            game: pick.gameStr || pick.game || '',
            confidence: pick.confidence || 0,
            time: pick.time || ''
          };
          
          // For completeness, make sure raw data is preserved
          if (pick.rawAnalysis) {
            simplePick.rawAnalysis = pick.rawAnalysis;
          }
          
          console.log('Simplified pick for rendering:', simplePick);
          return simplePick;
        });
      }
      console.log('Parsed and enhanced picksArray:', picksArray);

      // Check if we have picks either from database error or empty array
      if (fetchError || !picksArray.length) {
        console.log('No picks found in database. Generating new picks...');
        try {
          // Generate new picks using our 3-layer system
          const generatedPicks = await picksService.generateDailyPicks();
          console.log('Successfully generated new picks:', generatedPicks);
          
          // Store the new picks in Supabase
          await picksService.storeDailyPicksInDatabase(generatedPicks);
          console.log('Successfully stored new picks in database');
          
          // Update state with new picks
          setPicks(generatedPicks || []);
        } catch (genError) {
          console.error('Error generating picks:', genError);
          throw new Error('Failed to generate new picks: ' + genError.message);
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
                  {/* Responsive Grid for All Devices - Shows all cards side by side */}
                  <div className="pt-20 px-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 place-items-center">
                      {picks.map((pick, index) => (
                        <div key={pick.id}>
                          <RetroPickCard
                            pick={pick}
                            showToast={showToast}
                            onDecisionMade={handleDecisionMade}
                          />
                        </div>
                      ))}
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
