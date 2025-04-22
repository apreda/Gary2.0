import React, { useState, useEffect } from 'react';
import GaryMascot from '../assets/images/gary21.png';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ui/ToastProvider';
import { supabase } from '../supabaseClient';
import FlipCard from './FlipCard';
import GaryEmblem from '../assets/images/Garyemblem.png';

/**
 * RetroPickCard - Combines backend logic with retro sports card styling
 * Implements the 1980s Vegas / retro sports card design for Gary 2.0
 */
export default function RetroPickCard({ pick, showToast: showToastFromProps, onDecisionMade, isFlipped: controlledFlipped, setIsFlipped: setControlledFlipped }) {
  const { user } = useAuth();
  const showToast = showToastFromProps || useToast();
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(false);
  const [internalFlipped, setInternalFlipped] = useState(false);
  
  // Handle controlled vs uncontrolled flip state
  const isControlled = typeof controlledFlipped === 'boolean' && typeof setControlledFlipped === 'function';
  const isFlipped = isControlled ? controlledFlipped : internalFlipped;
  const setIsFlipped = isControlled ? setControlledFlipped : setInternalFlipped;

  // Gary 2.0 color palette
  const colors = {
    primary: '#bfa142', // main gold
    secondary: '#e5d3c4', // off-white
    accent: '#232326', // navy/black accent
    border: '#d4af37' // brighter gold
  };

  // Reset state when pick changes
  useEffect(() => {
    setDecision(null);
    setIsFlipped(false);
  }, [pick?.id]);

  // Check if user already made a decision for this pick
  useEffect(() => {
    const fetchDecision = async () => {
      if (!user || !pick?.id) return;
      const { data } = await supabase
        .from('user_picks')
        .select('decision')
        .eq('user_id', user.id)
        .eq('pick_id', pick.id)
        .maybeSingle();
      if (data?.decision) setDecision(data.decision);
    };
    fetchDecision();
  }, [user, pick?.id]);

  if (!pick) return null;
  const league = pick.league || 'MLB';

  // --- User Decision Handler ---
  const handleUserDecision = async (userDecision) => {
    if (!user) {
      showToast('You must be logged in to make a pick.', 'error');
      return;
    }
    if (decision) {
      showToast('You have already made your choice for this pick.', 'info');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('user_picks').insert([
        {
          user_id: user.id,
          pick_id: pick.id,
          decision: userDecision
        }
      ]);
      if (error) {
        showToast('Failed to save your pick. Please try again.', 'error');
      } else {
        setDecision(userDecision);
        if (typeof onDecisionMade === 'function') {
          onDecisionMade(userDecision, pick);
        }
        if (userDecision === 'bet') {
          showToast('You bet with Gary! Good luck! 🍀', 'success');
        } else if (userDecision === 'fade') {
          showToast('Fading Gary! Bold move! 🎲', 'success');
        }
      }
    } catch (err) {
      showToast('Error saving your pick. Try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- Front of Card with Tech Elements ---
  const cardFront = (
    <div className="relative w-72 h-[27rem] flex flex-col items-center justify-between"
      style={{
        background: 'linear-gradient(135deg, #f8f7f3 70%, #e6e1c5 100%)',
        border: `6px solid ${colors.primary}`,
        borderRadius: '1.2rem',
        color: colors.accent,
        fontFamily: 'Orbitron, Inter, Segoe UI, Arial, sans-serif',
        overflow: 'hidden',
        position: 'relative',
        perspective: '1200px',
        boxShadow: '0 0 36px 8px rgba(191,161,66,0.28), inset 0 0 15px rgba(191,161,66,0.12)',
        transform: 'rotateX(2deg)',
        animation: 'pulse 8s infinite ease-in-out'
      }}
    >
      {/* Top Bar with League and Time */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        background: colors.primary,
        color: colors.secondary,
        fontWeight: 700,
        fontSize: '1.02rem',
        letterSpacing: '0.08em',
        padding: '0.7rem 0.9rem', // Increased size
        zIndex: 3,
        borderBottom: `2px solid ${colors.border}`,
        boxShadow: '0 2px 8px #bfa14222',
        textTransform: 'uppercase',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>{league}</span>
        {pick.time && (
          <span style={{ fontSize: '0.95rem' }}>{pick.time}</span>
        )}
      </div>
      
      {/* Gary Emblem from image file - adjusted size and position */}
      <div style={{
        position: 'absolute',
        top: '3.25rem', // Moved up 1/8 inch
        left: '0.125rem', // Moved left 1/8 inch
        zIndex: 5,
      }}>
        <img 
          src={GaryEmblem} 
          alt="Gary Emblem"
          style={{
            width: 99, // 10% smaller (110 * 0.9 = 99)
            height: 99, // 10% smaller
            objectFit: 'contain',
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.25))',
          }}
        />
      </div>
      
      {/* Pick Display - centered and more horizontal */}
      <div className="flex items-center justify-center" style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2
      }}>
        <div style={{
          background: 'rgba(191,161,66,0.1)',
          padding: '0.65rem 3.5rem', // Wider horizontal padding, less vertical
          borderRadius: '6px',
          border: `2px solid ${colors.primary}`,
          fontWeight: 800,
          fontSize: '2rem',
          color: colors.primary,
          letterSpacing: '0.1em',
          textShadow: '0 1px 2px rgba(0,0,0,0.1)',
          textAlign: 'center',
          boxShadow: '0 2px 12px rgba(191,161,66,0.15)',
          whiteSpace: 'nowrap', // Ensures text stays on one line
        }}>
          {pick.shortPick}
        </div>
      </div>
      
      {/* Decision Buttons */}
      <div style={{
        position: 'absolute',
        bottom: '3.5rem',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        gap: '1rem',
        zIndex: 3,
      }}>
        {/* BET Button - Gold with Black Font */}
        <button 
          onClick={() => handleUserDecision('bet')}
          disabled={!!decision || loading}
          style={{
            backgroundColor: colors.primary,
            color: '#000',
            fontFamily: 'Orbitron, sans-serif',
            fontWeight: '700',
            fontSize: '1.2rem',
            padding: '0.6rem 2rem',
            width: '120px',
            border: 'none',
            borderRadius: '4px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            cursor: !!decision || loading ? 'not-allowed' : 'pointer',
            opacity: !!decision || loading ? 0.7 : 1,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          BET
        </button>
        
        {/* FADE Button - Black with Gold Font */}
        <button 
          onClick={() => handleUserDecision('fade')}
          disabled={!!decision || loading}
          style={{
            backgroundColor: '#18181b',
            color: colors.primary,
            fontFamily: 'Orbitron, sans-serif',
            fontWeight: '700',
            fontSize: '1.2rem',
            padding: '0.6rem 2rem',
            width: '120px',
            border: `1px solid ${colors.primary}`,
            borderRadius: '4px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            cursor: !!decision || loading ? 'not-allowed' : 'pointer',
            opacity: !!decision || loading ? 0.7 : 1,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          FADE
        </button>
      </div>
      
      {/* Bottom Bar with Game Matchup */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: colors.primary,
        color: colors.secondary,
        fontWeight: 700,
        fontSize: '1.02rem',
        letterSpacing: '0.08em',
        textAlign: 'center',
        padding: '0.7rem 0', // Increased size
        zIndex: 3,
        borderTop: `2px solid ${colors.border}`,
        boxShadow: '0 -2px 8px #bfa14222',
        textTransform: 'uppercase',
      }}>
        {pick.game || 'LAD @ NYM'}
      </div>
      
      {/* Tech-Enhanced Vintage Texture Overlay */}
      <div className="vintage-overlay absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: 'url(/noise.svg)',
          mixBlendMode: 'overlay'
        }}
      />
      
      {/* Digital Circuit Pattern - Subtle Tech Element */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(191,161,66,0) 49.8%, rgba(191,161,66,0.05) 50%, rgba(191,161,66,0) 50.2%), linear-gradient(0deg, rgba(191,161,66,0) 49.8%, rgba(191,161,66,0.05) 50%, rgba(191,161,66,0) 50.2%)',
          backgroundSize: '40px 40px',
          opacity: 0.15,
          mixBlendMode: 'color-dodge',
          zIndex: 1
        }}
      />
      
      {/* Holographic Glint Effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0) 100%)',
          backgroundSize: '200% 200%',
          opacity: 0.4,
          mixBlendMode: 'overlay',
          animation: 'glint 5s infinite linear',
          zIndex: 2
        }}
      />
    </div>
  );

  // --- Back of Card with Tech Elements ---
  const cardBack = (
    <div 
      className="relative w-72 h-[27rem] flex flex-col items-center justify-between px-0 py-0"
      style={{
        padding: '0.38rem 0.9rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        letterSpacing: '0.07em',
        boxShadow: '0 2px 8px #bfa14222, inset 0 0 15px rgba(191,161,66,0.12)',
        margin: 0,
        background: 'linear-gradient(135deg, #f8f7f3 70%, #e6e1c5 100%)',
        border: `6px solid ${colors.primary}`,
        borderRadius: '1.2rem',
        animation: 'pulse 8s infinite ease-in-out'
      }}
    >
      {/* Scouting Report Header - Positioned higher */}
      <div
        style={{
          width: 'fit-content',
          margin: '1.2rem auto 1rem auto',
          padding: '0.35rem 1.8rem',
          background: '#18181b',
          border: `2px solid ${colors.primary}`,
          borderRadius: 7,
          fontFamily: 'Orbitron, Segoe UI, Arial, sans-serif',
          fontWeight: 700,
          fontSize: '1.2rem',
          color: colors.primary,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          textAlign: 'center',
          boxShadow: '0 2px 12px #bfa14233',
        }}
      >
        Scouting Report
      </div>
      
      {/* Odds and Confidence */}
      <div style={{ width: '100%', textAlign: 'center', margin: '0.5rem 0 1rem 0' }}>
        <span style={{ fontWeight: 900, marginRight: 16, color: '#000' }}>{pick.odds ? `Odds: ${pick.odds}` : ''}</span>
        <span style={{ fontWeight: 700, color: '#000' }}>{pick.confidence ? `Conf: ${pick.confidence}` : ''}</span>
      </div>
      
      {/* Scouting Report Bullets - Expanded to bottom */}
      <div style={{
        width: '100%',
        padding: '0 0.7rem',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '1rem',
        overflowY: 'auto',
        fontFamily: 'Orbitron, Segoe UI, Arial, sans-serif',
      }}>
        {Array.isArray(pick.garysBullets) && pick.garysBullets.length > 0 ? (
          <ul className="list-none text-left mx-auto" style={{ 
            maxWidth: '98%', 
            fontFamily: 'Orbitron, Segoe UI, Arial, sans-serif', 
            fontSize: '1.04rem', 
            lineHeight: 1.6, 
            color: colors.accent, 
            paddingLeft: 0 
          }}>
            {pick.garysBullets.map((bullet, idx) => (
              <li key={idx} className="mb-2" style={{
                color: colors.accent,
                fontWeight: 600,
                display: 'block',
                paddingLeft: 0,
                background: idx % 2 === 0 ? 'rgba(191,161,66,0.07)' : 'transparent',
                borderRadius: 5,
                padding: '0.25rem 0.6rem',
                marginBottom: 4,
              }}>
                <span style={{ 
                  color: '#b22222', 
                  fontWeight: 900, 
                  marginRight: 10, 
                  fontSize: '1.2em', 
                  verticalAlign: 'middle' 
                }}>•</span>
                {bullet}
              </li>
            ))}
          </ul>
        ) : (
          <div className="italic text-gray-500">No details available.</div>
        )}
      </div>
      
      {/* Tech-Enhanced Vintage Texture Overlay */}
      <div className="vintage-overlay absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: 'url(/noise.svg)',
          mixBlendMode: 'overlay',
        }}
      />
      
      {/* Digital Circuit Pattern - Subtle Tech Element */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(191,161,66,0) 49.8%, rgba(191,161,66,0.05) 50%, rgba(191,161,66,0) 50.2%), linear-gradient(0deg, rgba(191,161,66,0) 49.8%, rgba(191,161,66,0.05) 50%, rgba(191,161,66,0) 50.2%)',
          backgroundSize: '40px 40px',
          opacity: 0.15,
          mixBlendMode: 'color-dodge',
          zIndex: 1
        }}
      />
      
      {/* Holographic Glint Effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0) 100%)',
          backgroundSize: '200% 200%',
          opacity: 0.4,
          mixBlendMode: 'overlay',
          animation: 'glint 5s infinite linear',
          zIndex: 2
        }}
      />
    </div>
  );

  // Add keyframe animations for tech effects
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 36px 8px rgba(191,161,66,0.28), inset 0 0 15px rgba(191,161,66,0.12); }
      50% { box-shadow: 0 0 36px 12px rgba(191,161,66,0.32), inset 0 0 25px rgba(191,161,66,0.18); }
    }
    @keyframes glint {
      0% { background-position: 0% 0%; }
      100% { background-position: 200% 200%; }
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 36px 8px rgba(191,161,66,0.28), inset 0 0 15px rgba(191,161,66,0.12); }
      50% { box-shadow: 0 0 36px 12px rgba(191,161,66,0.32), inset 0 0 25px rgba(191,161,66,0.18); }
    }
  `;
  if (typeof document !== 'undefined' && !document.getElementById('retro-card-animations')) {
    style.id = 'retro-card-animations';
    document.head.appendChild(style);
  }

  // Render FlipCard with front and back content
  return (
    <FlipCard
      className="w-72 h-[27rem]"
      frontContent={cardFront}
      backContent={cardBack}
      initialFlipped={false}
      flipOnClick={false}
      isFlipped={isFlipped}
      setIsFlipped={setIsFlipped}
    />
  );
}
