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
  // Format game title to show only team names (e.g., "PISTONS @ KNICKS")
// Use direct homeTeam and awayTeam fields if available, otherwise try to parse from game string
function formatGameTitle(game, homeTeam, awayTeam) {
  // If we have direct homeTeam and awayTeam fields, use those (preferred method)
  if (homeTeam && awayTeam) {
    console.log('Using direct team names:', homeTeam, awayTeam);
    // Extract team names (everything after the last space for shorter display)
    const homeName = homeTeam.split(' ').pop() || 'HOME';
    const awayName = awayTeam.split(' ').pop() || 'AWAY';
    // ALWAYS use awayTeam @ homeTeam format
    return `${awayName.toUpperCase()} @ ${homeName.toUpperCase()}`;
  }
  
  // Fallback to parsing from game string if homeTeam/awayTeam not available
  if (!game) return 'TBD @ TBD';
  console.log('Trying to parse game from string:', game);
  
  try {
    // Split into away and home teams
    const parts = game.split(' vs ');
    if (parts.length < 2) {
      // Try alternate separator formats
      const atParts = game.split('@');
      if (atParts.length >= 2) {
        parts[0] = atParts[0].trim();
        parts[1] = atParts[1].trim();
      } else {
        return game; // Return original if it doesn't have the expected format
      }
    }
    
    // Extract team names (everything after the last space)
    const homeName = parts[0].split(' ').pop() || 'HOME';
    const awayName = parts[1].split(' ').pop() || 'AWAY';
    
    // Format in away @ home format
    const formattedGame = `${awayName.toUpperCase()} @ ${homeName.toUpperCase()}`;
    console.log('Formatted game:', formattedGame);
    return formattedGame;
  } catch (error) {
    console.error('Error formatting game title:', error);
    return 'GAME TBD';
  }
}
  console.log("RetroPickCard pick prop:", pick);

  // SIMPLIFIED: Direct use of the OpenAI output format
  function getFormattedShortPick(pick) {
    console.log("Formatting pick from OpenAI format:", pick);
    
    if (!pick) {
      return 'UNKNOWN PICK';
    }
    
    // Direct access to the pick field from the OpenAI output
    if (pick.pick) {
      return pick.pick;
    }
    
    // Legacy fallback for old data structure
    if (pick.shortPick) {
      return pick.shortPick;
    }
    
    // If no pick data available, show a warning
    return 'MISSING PICK DATA';
  }

  // Defensive rendering: Check for OpenAI output format (pick.pick) first, then fallback to legacy format
  if (!pick || (!pick.pick && !pick.shortPick)) {
    return (
      <div style={{
        minWidth: '18rem',
        minHeight: '27rem',
        width: '18rem',
        height: '27rem',
        background: '#fffbe6',
        border: '6px solid #bfa142',
        borderRadius: '1.2rem',
        boxShadow: '0 0 36px 8px rgba(191,161,66,0.28), inset 0 0 15px rgba(191,161,66,0.12)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#bfa142',
        fontWeight: 'bold',
        fontSize: '1.2rem',
        textAlign: 'center'
      }}>
        MISSING FIELDS<br />
        {`pick data: ${pick && (pick.pick || pick.shortPick)}`}<br />
        Check OpenAI output format
      </div>
    );
  }

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
    border: '#d4af37', // brighter gold
    success: '#10B981', // Green
    error: '#EF4444', // Red
  };

  // COMPREHENSIVE debug log to identify pick data format issues
  console.log("RetroPickCard receiving pick data:", {
    id: pick?.id,
    pick_id: pick?.pick_id, // Add this to debug logging
    // CRITICAL: Direct OpenAI format fields (these MUST exist)
    pick: pick?.pick ? `${pick.pick.substring(0, 30)}...` : 'MISSING',
    // Handle rationale that might be an object or string
    rationale: pick?.rationale ? 
      (typeof pick.rationale === 'string' ? 
        `${pick.rationale.substring(0, 30)}...` : 
        `[${typeof pick.rationale}]`) : 'MISSING',
    // Mapped fields for backwards compatibility
    shortPick: pick?.shortPick ? `${pick.shortPick.substring(0, 30)}...` : 'MISSING',
    description: pick?.description ? `${pick.description.substring(0, 30)}...` : 'MISSING',
    // Metadata
    game: pick?.game,
    league: pick?.league,
    confidence: pick?.confidence,
    time: pick?.time,
    // Format of the full pick object
    pickKeys: pick ? Object.keys(pick) : 'NO PICK OBJECT',
    // Log the entire rationale to debug
    rationaleType: pick?.rationale ? typeof pick.rationale : 'N/A',
    rationaleValue: pick?.rationale
  });

  // Only use the new OpenAI output format fields
  const safePick = {
    // PRIORITY: Use pick_id from data first, then fallback to id, then generate
    id: pick?.pick_id || pick?.id || generatePickId(pick),
    
    // Store the OpenAI output fields
    pick: pick?.pick || '', // The betting pick
    
    // Handle rationale that might be an object or string
    rationale: pick?.rationale ? 
      (typeof pick.rationale === 'string' ? 
        pick.rationale : 
        JSON.stringify(pick.rationale, null, 2)) : 
      '', // Convert object to string if needed
    
    // Display data for the card - only use new format
    
    // BACK CARD - Display the rationale
    description: pick?.rationale ? 
      (typeof pick.rationale === 'string' ? 
        pick.rationale : 
        JSON.stringify(pick.rationale, null, 2)) : 
      'Analysis not available',
    
    // Essential metadata with reasonable defaults - DIRECTLY use OpenAI fields
    homeTeam: pick?.homeTeam || 'HOME',
    awayTeam: pick?.awayTeam || 'AWAY',
    // Construct game string from home and away teams if present
    game: pick?.homeTeam && pick?.awayTeam ? 
      `${pick.awayTeam} @ ${pick.homeTeam}` : 
      (pick?.game || 'TBD vs TBD'),
    league: pick?.league || 'SPORT',
    time: pick?.time || '10:10 PM ET',
    
    // OpenAI format additional fields with defaults
    type: pick?.type || 'moneyline',
    trapAlert: pick?.trapAlert || false,
    revenge: pick?.revenge || false,
    momentum: pick?.momentum || 0,
    
    // Confidence handling - support ALL formats
    confidence: typeof pick?.confidence === 'number' ? 
      Math.round(pick.confidence * 100) + '%' : 
      (pick?.confidence || '75%')
  };

  // Log which ID source we're using
  console.log('[RetroPickCard] Pick ID source:', {
    using: pick?.pick_id ? 'pick_id from data' : pick?.id ? 'id from data' : 'generated fallback',
    pick_id: pick?.pick_id,
    id: pick?.id,
    final_id: safePick.id
  });

  // Helper function to generate a consistent pick ID (fallback only)
  function generatePickId(pick) {
    if (!pick) return 'unknown-pick';
    
    console.log('[RetroPickCard] Generating fallback pick ID for:', pick);
    
    // Create a deterministic ID based on pick properties
    const components = [
      pick.league || 'sport',
      pick.homeTeam || pick.awayTeam || 'teams',
      pick.pick || 'pick',
      pick.time || 'time'
    ];
    
    // Create a simple hash from the components
    const pickString = components.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    // Add today's date to make it unique per day
    const today = new Date().toISOString().split('T')[0];
    
    return `pick-${today}-${pickString}`;
  }

  // Apply formatting to safePick - store the formatted version as a new property to avoid overwriting original
  safePick.formattedPick = getFormattedShortPick(safePick);
  
  // Format game display (convert to "AWAY @ HOME" format with team nicknames only)
  // ALWAYS use homeTeam and awayTeam fields directly when available
  safePick.formattedGame = (safePick.homeTeam && safePick.awayTeam) ? 
    `${safePick.awayTeam.split(' ').pop().toUpperCase()} @ ${safePick.homeTeam.split(' ').pop().toUpperCase()}` : 
    (pick?.homeTeam && pick?.awayTeam ? 
      `${pick.awayTeam.split(' ').pop().toUpperCase()} @ ${pick.homeTeam.split(' ').pop().toUpperCase()}` : 
      formatGameTitle(safePick.game));

  // Get league information from the pick (could be MLB, NBA, NHL, etc.)
  // Don't default to any specific league to avoid bias
  const league = safePick.league || '';
  // Format time in 12-hour format with proper padding for minutes
  // Ensure 'ET' is added if not already present
  const formattedTime = safePick.time ? 
    (function() {
      // First ensure 'ET' is present
      let time = safePick.time.includes('ET') ? safePick.time : `${safePick.time} ET`;
      // Then format minutes to always have 2 digits (e.g., 8:00 instead of 8:0)
      return time.replace(/:([0-9])\s/, ':0$1 ');
    })() : 
    '10:10 PM ET';

  // Reset state when pick changes
  useEffect(() => {
    setDecision(null);
    setIsFlipped(false);
  }, [safePick.id]);

  // Load existing decision for this user and pick
  useEffect(() => {
    const fetchDecision = async () => {
      if (!user || !safePick.id) {
        // Clear any previous decision if no user or pick
        console.log('[RetroPickCard] No user or pick ID, clearing decision', { 
          hasUser: !!user, 
          pickId: safePick.id 
        });
        setDecision(null);
        return;
      }
      
      console.log('[RetroPickCard] Fetching decision for:', { 
        userId: user.id, 
        pickId: safePick.id,
        userEmail: user.email 
      });
      
      try {
        const { data, error } = await supabase
          .from('user_picks')
          .select('decision')
          .eq('user_id', user.id)
          .eq('pick_id', safePick.id)
          .maybeSingle();
          
        if (error) {
          console.error('[RetroPickCard] Error fetching user decision:', error);
          setDecision(null);
          return;
        }
        
        console.log('[RetroPickCard] Fetched decision data:', data);
        
        // Only set decision if data exists for THIS user
        setDecision(data?.decision || null);
      } catch (error) {
        console.error('[RetroPickCard] Error in fetchDecision:', error);
        setDecision(null);
      }
    };
    
    fetchDecision();
  }, [user?.id, safePick.id]); // Use user.id specifically to trigger on user changes

  // --- User Decision Handler ---
  const handleUserDecision = async (userDecision) => {
    console.log('[RetroPickCard] handleUserDecision called:', { 
      userDecision, 
      hasUser: !!user, 
      userId: user?.id,
      userEmail: user?.email,
      pickId: safePick.id, 
      currentDecision: decision,
      loading 
    });
    
    // Check authentication
    if (!user) {
      console.log('[RetroPickCard] No user authenticated');
      showToast('Please sign in to make your pick!', 'error');
      return;
    }
    
    // Check if user already made a decision
    if (decision) {
      console.log('[RetroPickCard] User already has decision:', decision);
      showToast(`You already chose to ${decision.toUpperCase()} this pick!`, 'info');
      return;
    }
    
    // Check if pick has valid ID
    if (!safePick.id || safePick.id === 'unknown') {
      console.log('[RetroPickCard] Invalid pick ID:', safePick.id);
      showToast('Invalid pick data. Please refresh the page.', 'error');
      return;
    }
    
    console.log('[RetroPickCard] All checks passed, proceeding with decision save');
    setLoading(true);
    
    try {
      // Double-check if user already made a decision (race condition protection)
      const { data: existingDecision } = await supabase
        .from('user_picks')
        .select('decision')
        .eq('user_id', user.id)
        .eq('pick_id', safePick.id)
        .maybeSingle();
        
      console.log('[RetroPickCard] Double-check existing decision:', existingDecision);
        
      if (existingDecision?.decision) {
        setDecision(existingDecision.decision);
        showToast(`You already chose to ${existingDecision.decision.toUpperCase()} this pick!`, 'info');
        setLoading(false);
        return;
      }
      
      console.log('[RetroPickCard] Inserting new decision:', {
        user_id: user.id,
        pick_id: safePick.id,
        decision: userDecision
      });
      
      // Insert the new decision
      const { error } = await supabase.from('user_picks').insert([
        {
          user_id: user.id,
          pick_id: safePick.id,
          decision: userDecision,
          created_at: new Date().toISOString()
        }
      ]);
      
      if (error) {
        console.error('[RetroPickCard] Supabase error:', error);
        showToast('Failed to save your pick. Please try again.', 'error');
      } else {
        console.log('[RetroPickCard] Decision saved successfully');
        // Success! Update local state
        setDecision(userDecision);
        
        // Notify parent component if callback provided
        if (typeof onDecisionMade === 'function') {
          onDecisionMade(userDecision, safePick);
        }
        
        // Show success message
        const successMessage = userDecision === 'bet' 
          ? 'You bet with Gary! Good luck! 🍀' 
          : 'Fading Gary! Bold move! 🎲';
        showToast(successMessage, 'success');
      }
    } catch (err) {
      console.error('[RetroPickCard] Error saving pick:', err);
      showToast('Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- SIMPLIFIED FRONT OF CARD - JUST THE PICK ---
  const cardFront = (
    <div className="relative w-72 h-[27rem] flex flex-col items-center justify-between"
      style={{
        background: 'linear-gradient(135deg, #f8f7f3 70%, #e6e1c5 100%)',
        border: `6px solid ${colors.primary}`,
        borderRadius: '1.2rem',
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
        padding: '0.7rem 0.9rem',
        zIndex: 3,
        borderBottom: `2px solid ${colors.border}`,
        boxShadow: '0 2px 8px #bfa14222',
        textTransform: 'uppercase',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>{league}</span>
        <span style={{ fontSize: '0.95rem' }}>{formattedTime}</span>
      </div>
      
      {/* Gary Emblem */}
      <div style={{
        position: 'absolute',
        top: '3.25rem',
        left: '0.125rem',
        zIndex: 5,
      }}>
        <img 
          src={GaryEmblem} 
          alt="Gary Emblem"
          style={{
            width: 99,
            height: 99,
            objectFit: 'contain',
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.25))',
          }}
        />
      </div>
      
      {/* *** MAIN PICK DISPLAY - SIMPLIFIED *** */}
      <div className="flex items-center justify-center" style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2,
        width: '100%',
        padding: '0 1rem'
      }}>
        <div style={{
          background: 'rgba(191,161,66,0.1)',
          padding: '1.5rem 1rem',
          borderRadius: '8px',
          border: `2px solid ${colors.primary}`,
          fontWeight: 800,
          fontSize: '2.2rem',
          marginBottom: '2.5rem',
          color: colors.primary,
          letterSpacing: '0.05em',
          textShadow: '0 1px 2px rgba(0,0,0,0.1)',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(191,161,66,0.25)',
          width: '90%',
          maxWidth: '90%'
        }}>
          {/* Display pick directly from raw OpenAI output format */}
          {/* Only use the new format with pick field */}
          {safePick.pick ? 
            safePick.pick : 
            'MISSING FIELDS: Check Supabase data format'}
        </div>
      </div>
      
      {/* Decision Buttons - FIXED POSITION to prevent overlap */}
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
        {/* Debug info - remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <div style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '10px',
            color: '#666',
            background: 'rgba(255,255,255,0.9)',
            padding: '4px',
            borderRadius: '4px',
            whiteSpace: 'nowrap'
          }}>
            ID: {safePick.id} | Decision: {decision || 'none'} | Loading: {loading ? 'yes' : 'no'}
          </div>
        )}
        
        {/* BET Button */}
        <button 
          onClick={() => {
            console.log('[RetroPickCard] BET button clicked:', { 
              pickId: safePick.id, 
              hasPickId: !!safePick.id,
              decision,
              loading 
            });
            if (safePick.id) {
              handleUserDecision('bet');
            } else {
              console.error('[RetroPickCard] No pick ID available for BET button');
            }
          }}
          disabled={!!decision || loading || !safePick.id}
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
            cursor: !!decision || loading || !safePick.id ? 'not-allowed' : 'pointer',
            opacity: !!decision || loading || !safePick.id ? 0.7 : 1,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          BET
        </button>
        
        {/* FADE Button */}
        <button 
          onClick={() => {
            console.log('[RetroPickCard] FADE button clicked:', { 
              pickId: safePick.id, 
              hasPickId: !!safePick.id,
              decision,
              loading 
            });
            if (safePick.id) {
              handleUserDecision('fade');
            } else {
              console.error('[RetroPickCard] No pick ID available for FADE button');
            }
          }}
          disabled={!!decision || loading || !safePick.id}
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
            cursor: !!decision || loading || !safePick.id ? 'not-allowed' : 'pointer',
            opacity: !!decision || loading || !safePick.id ? 0.7 : 1,
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
        letterSpacing: '0.075em',
        textAlign: 'center',
        padding: '0.7rem 0',
        zIndex: 3,
        borderTop: `2px solid ${colors.border}`,
        boxShadow: '0 -2px 8px #bfa14222',
        textTransform: 'uppercase',
      }}>
        {safePick.formattedGame || formatGameTitle(safePick.game, pick?.homeTeam, pick?.awayTeam)}
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

  // --- SIMPLIFIED BACK OF CARD - JUST THE RATIONALE ---
  const cardBack = (
    <div className="relative w-72 h-[27rem] flex flex-col justify-between p-0" 
      style={{
        background: 'linear-gradient(135deg, #fffbe6 50%, #f5f5dc 100%)',
        border: `6px solid ${colors.primary}`,
        borderRadius: '1.2rem',
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        overflow: 'hidden',
        position: 'relative',
        perspective: '1200px', 
        boxShadow: '0 0 36px 8px rgba(191,161,66,0.28), inset 0 0 15px rgba(191,161,66,0.12)',
        animation: 'pulse 8s infinite ease-in-out'
      }}
    >
      {/* Card Header */}
      <div style={{ position: 'relative', width: '100%' }}>
        {/* Gary's Analysis Banner */}
        <div style={{ 
          backgroundColor: colors.primary,
          color: colors.secondary,
          fontWeight: 'bold',
          fontSize: '1.1rem',
          padding: '0.6rem 1rem',
          textAlign: 'center',
          letterSpacing: '0.05rem',
          textTransform: 'uppercase',
          borderBottom: `2px solid ${colors.border}`,
          boxShadow: '0 2px 8px #bfa14222',
        }}>
          GARY'S ANALYSIS
        </div>
      </div>
      
      {/* Decision Indicators */}
      {decision && (
        <div style={{ 
          position: 'absolute', 
          top: '3.5rem', 
          right: '0.75rem', 
          backgroundColor: decision === 'bet' ? '#00B300' : '#FF3333',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '0.8rem',
          padding: '0.3rem 0.8rem',
          borderRadius: '4px',
          zIndex: 5, 
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          textTransform: 'uppercase',
          letterSpacing: '0.05rem',
        }}>
          {decision === 'bet' ? 'You Bet' : 'You Faded'}
        </div>
      )}
      
      {/* *** SIMPLIFIED: ONLY RATIONALE SECTION *** */}
      <div style={{ 
        padding: '1rem 1rem', 
        flex: '1', 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflowY: 'auto',
      }}>
        {/* Main Analysis - EXPANDED TO USE MORE SPACE */}
        <div style={{ 
          backgroundColor: 'rgba(255,255,255,0.5)', 
          padding: '1.2rem', 
          borderRadius: '0.5rem',
          border: '2px solid rgba(191,161,66,0.3)',
          fontSize: '1.2rem',
          lineHeight: '1.6rem',
          color: '#222',
          width: '95%',
          maxHeight: '90%',
          overflowY: 'auto',
          boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
        }}>
          {/* CRITICAL: Display the rationale as properly formatted bullet points */}
          <div style={{ margin: 0, fontWeight: 500 }}>
            {safePick.rationale ? 
              safePick.rationale.split('•').map((point, index) => {
                // Skip the first empty item that comes before the first bullet point
                if (index === 0 && !point.trim()) return null;
                return point.trim() && (
                  <div key={index} style={{ 
                    display: 'flex', 
                    marginBottom: '0.75rem',
                    alignItems: 'flex-start'
                  }}>
                    <span style={{ marginRight: '6px', fontWeight: 'bold' }}>•</span>
                    <span>{point.trim()}</span>
                  </div>
                );
              })
              : 
              (safePick.description || 'Analysis not available.')}
          </div>
        </div>
      </div>
      
      {/* Bottom Pick Reference */}
      <div style={{ 
        padding: '0.5rem 1rem',
        backgroundColor: colors.primary, 
        color: colors.secondary,
        fontWeight: 'bold',
        fontSize: '1rem',
        textAlign: 'center',
        borderTop: `2px solid ${colors.border}`,
      }}>
        {getFormattedShortPick(safePick) || 'PICK TBD'}
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
  `;
  if (typeof document !== 'undefined' && !document.getElementById('retro-card-animations')) {
    style.id = 'retro-card-animations';
    document.head.appendChild(style);
  }

  // Render FlipCard with front and back content
  return (
    <FlipCard
      className="w-72 h-[27rem]"
      style={{
        minWidth: '18rem',
        minHeight: '27rem',
        width: '18rem',
        height: '27rem',
        position: 'relative',
        zIndex: 10
      }}
      cardStyle={{
        background: '#fffbe6',
        border: '6px solid #bfa142',
        borderRadius: '1.2rem',
        boxShadow: '0 0 36px 8px rgba(191,161,66,0.28), inset 0 0 15px rgba(191,161,66,0.12)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      frontContent={cardFront}
      backContent={cardBack}
      initialFlipped={false}
      flipOnClick={false}
      isFlipped={isFlipped}
      setIsFlipped={setIsFlipped}
    />
  );
}
