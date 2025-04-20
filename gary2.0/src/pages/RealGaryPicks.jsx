import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUserStats } from "../hooks/useUserStats";
import { useUserPlan } from "../hooks/useUserPlan";
import PickCard from '../components/PickCard';
import { BetCard } from './BetCard';
import { useToast } from '../components/ui/ToastProvider';
import gary1 from '../assets/images/gary1.svg';
import { useAuth } from '../contexts/AuthContext';

// Import styles

// Import services
import { picksService } from '../services/picksService';
import { schedulerService } from '../services/schedulerService';
import { resultsService } from '../services/resultsService';
import { betTrackingService } from '../services/betTrackingService';
import { picksPersistenceService } from '../services/picksPersistenceService';
import { supabase, ensureAnonymousSession } from '../supabaseClient';

function RealGaryPicks() {
  // ...existing code...
  const [reloadKey, setReloadKey] = useState(0);
  const { userPlan } = useUserPlan();

  // State for picks and UI
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flippedCardId, setFlippedCardId] = useState(null);
  const [userDecisions, setUserDecisions] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // Debug logs for troubleshooting
  useEffect(() => {
    console.log('[RealGaryPicks] picks:', picks);
    console.log('[RealGaryPicks] loading:', loading);
    console.log('[RealGaryPicks] error:', error);
  }, [picks, loading, error]);
  
  // State for bet tracking
  const [showBetTracker, setShowBetTracker] = useState(false);
  const [activePick, setActivePick] = useState(null);

  // Toast notification system
  const showToast = useToast();

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
      }
      console.log('Parsed picksArray:', picksArray);

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No picks for today, generate new ones via picksService
          const generatedPicks = await picksService.generateDailyPicks();
          await picksService.storeDailyPicksInDatabase(generatedPicks);
          setPicks(generatedPicks || []);
        } else {
          throw fetchError;
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
    <div className="picks-page-container">

      <div className="carousel-container gary-picks-container">
        {loading ? (
          <div className="loading-state">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#d4af37]" />
            <p className="text-white mt-4">Loading Gary's Picks...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p className="text-red-500">{error}</p>
            <button onClick={loadPicks} className="btn-primary">Try Again</button>
          </div>
        ) : picks.length === 0 ? (
          <div className="no-picks">
            <p>No picks available for today.</p>
            <button onClick={loadPicks} className="btn-primary">Generate Picks</button>
          </div>
        ) : (
          <>
            <div className="carousel-outer-center flex flex-col justify-center items-center min-h-[70vh] w-full py-12 mt-[7vh] md:mt-[10vh] lg:mt-[12vh]">
              <div className="carousel-card-center flex justify-center items-center w-full" style={{ minHeight: '30rem' }}>
                {picks.length > 0 && (
                  <PickCard
                    key={picks[currentIndex].id}
                    pick={picks[currentIndex]}
                    showToast={showToast}
                    onDecisionMade={handleDecisionMade}
                  />
                )}
              </div>
            </div>
            {picks.length > 1 && (
              <>
                <button className="carousel-arrow carousel-arrow-left" onClick={prevPick} aria-label="Previous pick">
                  <span>‹</span>
                </button>
                <button className="carousel-arrow carousel-arrow-right" onClick={nextPick} aria-label="Next pick">
                  <span>›</span>
                </button>
              </>
            )}
            <div className="carousel-nav">
              {picks.map((_, index) => (
                <div
                  key={index}
                  className={`carousel-nav-item ${currentIndex === index ? 'active' : ''}`}
                  onClick={() => setCurrentIndex(index)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Ensure BetCard reloads when reloadKey changes */}
      <BetCard reloadKey={reloadKey} />

      {showBetTracker && activePick && (
        <BetTrackerModal
          pick={activePick}
          onClose={() => setShowBetTracker(false)}
          onSave={handleSaveBet}
        />
      )}

    </div>
  );
}

export default RealGaryPicks;
