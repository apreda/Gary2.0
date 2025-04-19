import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUserStats } from "../hooks/useUserStats";
import { useUserPlan } from "../hooks/useUserPlan";
import PickCard from '../components/PickCard';
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
  const { userPlan } = useUserPlan();

  // State for picks and UI
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flippedCardId, setFlippedCardId] = useState(null);
  const [userDecisions, setUserDecisions] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // State for bet tracking
  const [showBetTracker, setShowBetTracker] = useState(false);
  const [activePick, setActivePick] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

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
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No picks for today, generate new ones
          const { data: freshPicks, error: genError } = await supabase
            .rpc('generate_daily_picks', { target_date: today });

          if (genError) throw genError;
          setPicks(freshPicks?.picks || []);
        } else {
          throw fetchError;
        }
      } else {
        setPicks(data?.picks || []);
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
            <div className="carousel-track" style={{
              position: 'relative',
              width: '100%',
              height: '500px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              pointerEvents: 'none',
            }}>
              {[currentIndex - 1, currentIndex, currentIndex + 1].map((i, idx) => {
                if (i < 0 || i >= picks.length) return null;
                const offset = i - currentIndex;
                const pick = picks[i];
                let left = '50%';
                let translateX = 0;
                let zIndex = 5;
                let scale = 0.92;
                let opacity = 1;
                if (offset === 0) {
                  zIndex = 10;
                  scale = 1;
                  opacity = 1;
                  translateX = '-50%';
                } else if (offset === -1) {
                  zIndex = 5;
                  scale = 0.92;
                  opacity = 1;
                  translateX = '-150%';
                } else if (offset === 1) {
                  zIndex = 5;
                  scale = 0.92;
                  opacity = 1;
                  translateX = '50%';
                }
                return (
                  <div
                    key={pick.id}
                    className="pick-card"
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left,
                      width: 320,
                      height: 396,
                      background: 'linear-gradient(120deg, #fffbe6 5%, #ffe066 25%, #FFD700 60%, #FFC94C 100%)',
                      borderRadius: '1.25rem',
                      boxShadow: '0 0 64px 16px #FFD70066',
                      transform: `translate(${translateX}, -50%) scale(${scale})`,
                      zIndex,
                      opacity,
                      transition: 'transform 0.5s cubic-bezier(.77,0,.18,1), opacity 0.4s, z-index 0s',
                      pointerEvents: zIndex === 10 ? 'auto' : 'none',
                    }}
                  >
                    <PickCard pick={pick} />
                  </div>
                );
              })}
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

      {showBetTracker && activePick && (
        <BetTrackerModal
          pick={activePick}
          onClose={() => setShowBetTracker(false)}
          onSave={handleSaveBet}
        />
      )}
      {showToast && (
        <Toast
          message={toastMessage}
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
}

export default RealGaryPicks;
