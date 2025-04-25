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
  function formatGameTitle(game) {
    if (!game) return 'TBD @ TBD';
    
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
      
      // Get only the last word in the team name (typically the mascot/nickname)
      // This handles formats like "Milwaukee Bucks" -> "Bucks"
      const awayTeam = parts[0].trim();
      const homeTeam = parts[1].trim();
      
      // Extract team names (everything after the last space)
      const awayName = awayTeam.split(' ').pop() || 'AWAY';
      const homeName = homeTeam.split(' ').pop() || 'HOME';
      
      return `${awayName.toUpperCase()} @ ${homeName.toUpperCase()}`;
    } catch (error) {
      console.error('Error formatting game title:', error);
      return 'GAME TBD';
    }
  }
  console.log("RetroPickCard pick prop:", pick);

  // SIMPLIFIED: Just use the pick as-is from OpenAI, no complex formatting
  function getFormattedShortPick(pick) {
    console.log("Using raw pick:", pick);
    
    if (!pick) {
      return 'UNKNOWN PICK';
    }
    
    // OpenAI output format - prioritize this format
    if (pick.pick) {
      return pick.pick;
    }
    
    // Legacy format fallback
    if (pick.shortPick) {
      return pick.shortPick;
    }
    
    // Extract team abbreviation
    let team = 'TBD';
    // Comprehensive mapping of NBA teams
    const nbaTeamMappings = {
      'Boston Celtics': 'BOS',
      'Brooklyn Nets': 'BKN',
      'New York Knicks': 'NYK',
      'Philadelphia 76ers': 'PHI',
      'Toronto Raptors': 'TOR',
      'Chicago Bulls': 'CHI',
      'Cleveland Cavaliers': 'CLE',
      'Detroit Pistons': 'DET',
      'Indiana Pacers': 'IND',
      'Milwaukee Bucks': 'MIL',
      'Atlanta Hawks': 'ATL',
      'Charlotte Hornets': 'CHA',
      'Miami Heat': 'MIA',
      'Orlando Magic': 'ORL',
      'Washington Wizards': 'WAS',
      'Denver Nuggets': 'DEN',
      'Minnesota Timberwolves': 'MIN',
      'Oklahoma City Thunder': 'OKC',
      'Portland Trail Blazers': 'POR',
      'Utah Jazz': 'UTA',
      'Golden State Warriors': 'GSW',
      'Los Angeles Clippers': 'LAC',
      'Los Angeles Lakers': 'LAL',
      'Phoenix Suns': 'PHX',
      'Sacramento Kings': 'SAC',
      'Dallas Mavericks': 'DAL',
      'Houston Rockets': 'HOU',
      'Memphis Grizzlies': 'MEM',
      'New Orleans Pelicans': 'NOP',
      'San Antonio Spurs': 'SAS'
    };
    
    // Handle shortened forms of team names
    Object.entries(nbaTeamMappings).forEach(([fullName, abbr]) => {
      // Get team nickname (last part of name)
      const nickname = fullName.split(' ').pop();
      if (nickname && !nbaTeamMappings[nickname]) {
        nbaTeamMappings[nickname] = abbr;
      }
    });
    
    // For MLB, NHL and other sports, you can add more mappings
    const teamMappings = {
      ...nbaTeamMappings,
      // MLB teams
      'Chicago Cubs': 'CHC',
      'Chicago White Sox': 'CWS',
      'Los Angeles Dodgers': 'LAD',
      'New York Yankees': 'NYY',
      // NHL teams
      'Washington Capitals': 'WSH',
      'Montréal Canadiens': 'MTL',
      // Soccer teams
      'Manchester City': 'MCI',
      'Arsenal': 'ARS',
      'Crystal Palace': 'CRY',
      'Aston Villa': 'AVL',
    };
    
    try {
      // Direct access to team if it's already in the pick object
      if (pick.team && typeof pick.team === 'string') {
        const directTeam = pick.team.trim();
        team = teamMappings[directTeam] || directTeam.slice(0, 3).toUpperCase();
      } 
      // Try to extract from game info
      else if (pick.game) {
        // Try different delimiters: vs, at, @
        let gameParts = [];
        if (pick.game.includes(' vs ')) {
          gameParts = pick.game.split(' vs ').map(part => part.trim());
        } else if (pick.game.includes('@')) {
          gameParts = pick.game.split('@').map(part => part.trim());
        } else if (pick.game.includes(' at ')) {
          gameParts = pick.game.split(' at ').map(part => part.trim());
        }

        if (gameParts.length >= 2) {
          const homeTeam = gameParts[1] || '';
          const awayTeam = gameParts[0] || '';
          
          // Try to determine which team is being bet on
          let targetTeam = '';
          
          // 1. If we have explicit pick info in the object, use that
          if (pick.team) {
            targetTeam = pick.team;
          }
          // 2. If the shortPick contains identifiable team info, extract it
          else if (pick.shortPick && typeof pick.shortPick === 'string') {
            // Look for patterns in the shortPick
            const shortPickLower = pick.shortPick.toLowerCase();
            const homeTeamLower = homeTeam.toLowerCase();
            const awayTeamLower = awayTeam.toLowerCase();
            
            // Check if shortPick contains team names
            if (shortPickLower.includes(homeTeamLower)) {
              targetTeam = homeTeam;
            } else if (shortPickLower.includes(awayTeamLower)) {
              targetTeam = awayTeam;
            }
            // Try to match the nickname/mascot part only
            else {
              const homeNickname = homeTeam.split(' ').pop().toLowerCase();
              const awayNickname = awayTeam.split(' ').pop().toLowerCase();
              
              if (shortPickLower.includes(homeNickname)) {
                targetTeam = homeTeam;
              } else if (shortPickLower.includes(awayNickname)) {
                targetTeam = awayTeam;
              }
            }
          }
          
          // 3. If still no target team, default to home team
          if (!targetTeam) {
            targetTeam = homeTeam;
          }
          
          // Get abbreviation or create one
          team = teamMappings[targetTeam] || '';
          
          // If no match in mappings, create abbreviation from team name
          if (!team) {
            // First try just the last part of the name (nickname/mascot)
            const nicknamePart = targetTeam.split(' ').pop() || '';
            team = teamMappings[nicknamePart] || '';
            
            // If still no abbreviation, generate one
            if (!team) {
              team = targetTeam.split(' ').map(word => word[0]).join('').toUpperCase();
              // If that didn't work, use first 3 letters
              if (!team || team.length < 2) {
                team = targetTeam.slice(0, 3).toUpperCase();
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing team data:', error);
      team = 'TBD';
    }
    
    // Format based on bet type
    const betType = pick.betType?.toLowerCase() || '';
    let formattedPick = '';
    
    if (betType.includes('moneyline')) {
      formattedPick = `${team} ML`;
    } else if (betType.includes('spread')) {
      // For spread bets, include the spread value
      const spreadValue = pick.spread || '';
      formattedPick = `${team} ${spreadValue}`;
    } else if (betType.includes('over')) {
      const total = pick.overUnder || '';
      formattedPick = `${team} O ${total}`;
    } else if (betType.includes('under')) {
      const total = pick.overUnder || '';
      formattedPick = `${team} U ${total}`;
    } else if (betType.includes('total')) {
      // Handle general total bets (over/under)
      const total = pick.overUnder || '';
      const overUnder = betType.includes('over') ? 'O' : 'U';
      formattedPick = `${team} ${overUnder} ${total}`;
    } else {
      // If no specific bet type is found, check if we can extract from shortPick
      if (pick.shortPick && typeof pick.shortPick === 'string') {
        const shortPick = pick.shortPick.toUpperCase();
        if (shortPick.includes('ML') || shortPick.includes('MONEYLINE')) {
          formattedPick = `${team} ML`;
        } else if (shortPick.includes('OVER') || shortPick.includes(' O ')) {
          const total = pick.overUnder || ''; 
          formattedPick = `${team} O ${total}`;
        } else if (shortPick.includes('UNDER') || shortPick.includes(' U ')) {
          const total = pick.overUnder || '';
          formattedPick = `${team} U ${total}`;
        } else if (shortPick.includes('+') || shortPick.includes('-')) {
          // Try to extract spread value from shortPick
          const spreadMatch = shortPick.match(/[+-]\d+(\.\d+)?/);
          const spreadValue = spreadMatch ? spreadMatch[0] : '';
          formattedPick = `${team} ${spreadValue}`;
        } else {
          formattedPick = `${team} ML`; // Default to ML
        }
      } else {
        formattedPick = `${team} ML`; // Default to ML if no bet type specified
      }
    }
    
    // Add odds if available
    let odds = '';
    if (pick.odds && typeof pick.odds === 'string') {
      odds = pick.odds;
    } else if (pick.odds && typeof pick.odds === 'number') {
      odds = pick.odds.toString();
    } else if (pick.moneyline && typeof pick.moneyline === 'string') {
      odds = pick.moneyline;
    } else if (pick.moneyline && typeof pick.moneyline === 'number') {
      odds = pick.moneyline.toString();
    } else {
      odds = '-110'; // Default odds
    }
    
    // Clean odds format
    if (!odds.startsWith('+') && !odds.startsWith('-')) {
      odds = parseInt(odds) > 0 ? `+${odds}` : odds;
    }
    
    return `${formattedPick} ${odds}`;
  }

  // Defensive rendering: only check for pick.shortPick since team is not present in Supabase data
  if (!pick || !pick.shortPick) {
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
        {`pick.shortPick: ${pick && pick.shortPick}`}<br />
        Check Supabase data format
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

  // For debugging only - log details about the pick
  console.log("RetroPickCard detailed pick:", {
    id: pick?.id,
    shortPick: pick?.shortPick,
    game: pick?.game,
    betType: pick?.betType,
    moneyline: pick?.moneyline,
    spread: pick?.spread,
    overUnder: pick?.overUnder,
    bullets: pick?.garysBullets?.length
  });

  // Use the actual pick data with minimal defaults only for required fields
  const safePick = {
    ...pick,
    id: pick?.id || 'unknown',
    // For the front of card - prioritize OpenAI format
    shortPick: pick?.pick || pick?.shortPick || 'PICK TBD',
    // For the back of card - prioritize OpenAI format 
    description: pick?.rationale || pick?.description || 'Analysis not available',
    game: pick?.game || 'TBD vs TBD',
    league: pick?.league || 'SPORT',
    confidence: pick?.confidence || 0,
    time: pick?.time || '10:10 PM',
    // Extra OpenAI format fields
    type: pick?.type || 'moneyline',
    moneyline: pick?.moneyline || '',
    team: pick?.team || '',
    garysBullets: pick?.garysBullets || [
      'Statistical analysis supports this selection',
      'Current odds present good betting value',
    ],
    confidenceLevel: pick?.confidenceLevel || 75,
    // Format confidence as percentage if needed
    confidence: pick?.confidence || (pick?.confidenceLevel ? `${pick.confidenceLevel}%` : '75%')
  };

  // Apply formatting to safePick - store the formatted version as a new property to avoid overwriting original
  safePick.formattedPick = getFormattedShortPick(safePick);
  
  // Format game display (convert to "AWAY @ HOME" format with team nicknames only)
  safePick.formattedGame = formatGameTitle(safePick.game);

  // Default league and time if not provided
  const league = safePick.league || 'MLB';
  // Format time in 12-hour format if not provided (10:10 PM ET)
  const formattedTime = safePick.time || '10:10 PM ET';

  // Reset state when pick changes
  useEffect(() => {
    setDecision(null);
    setIsFlipped(false);
  }, [safePick.id]);

  // Check if user already made a decision for this pick
  useEffect(() => {
    const fetchDecision = async () => {
      if (!user || !safePick.id) return;
      const { data } = await supabase
        .from('user_picks')
        .select('decision')
        .eq('user_id', user.id)
        .eq('pick_id', safePick.id)
        .maybeSingle();
      if (data?.decision) setDecision(data.decision);
    };
    fetchDecision();
  }, [user, safePick.id]);

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
          pick_id: safePick.id,
          decision: userDecision
        }
      ]);
      if (error) {
        showToast('Failed to save your pick. Please try again.', 'error');
      } else {
        setDecision(userDecision);
        if (typeof onDecisionMade === 'function') {
          onDecisionMade(userDecision, safePick);
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
          fontSize: '2.5rem',
          color: colors.primary,
          letterSpacing: '0.05em',
          textShadow: '0 1px 2px rgba(0,0,0,0.1)',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(191,161,66,0.25)',
          width: '90%',
          maxWidth: '90%'
        }}>
          {/* Display pick directly from raw OpenAI output */}
          {safePick.shortPick !== 'PICK TBD' && safePick.shortPick !== '' ? 
            safePick.shortPick : 
            'PICK UNAVAILABLE'}
        </div>
      </div>
      
      {/* Decision Buttons */}
      <div style={{
        position: 'absolute',
        bottom: '5.5rem',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        gap: '1rem',
        zIndex: 3,
      }}>
        {/* BET Button */}
        <button 
          onClick={() => safePick.id ? handleUserDecision('bet') : null}
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
            cursor: !!decision || loading ? 'not-allowed' : 'pointer',
            opacity: !!decision || loading ? 0.7 : 1,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          BET
        </button>
        
        {/* FADE Button */}
        <button 
          onClick={() => safePick.id ? handleUserDecision('fade') : null}
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
        letterSpacing: '0.075em',
        textAlign: 'center',
        padding: '0.7rem 0',
        zIndex: 3,
        borderTop: `2px solid ${colors.border}`,
        boxShadow: '0 -2px 8px #bfa14222',
        textTransform: 'uppercase',
      }}>
        {formatGameTitle(safePick.game || '')}
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
        padding: '2rem 1.5rem', 
        flex: '1', 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflowY: 'auto',
      }}>
        {/* Main Analysis - MUCH BIGGER */}
        <div style={{ 
          backgroundColor: 'rgba(255,255,255,0.5)', 
          padding: '1.5rem', 
          borderRadius: '0.5rem',
          border: '2px solid rgba(191,161,66,0.3)',
          fontSize: '1.2rem',
          lineHeight: '1.6rem',
          color: '#222',
          width: '90%',
          maxHeight: '75%',
          overflowY: 'auto',
          boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
        }}>
          <p style={{ margin: 0, fontWeight: 500 }}>
            {safePick.description || 'Analysis not available.'}
          </p>
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
        {safePick.shortPick || 'PICK TBD'}
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
