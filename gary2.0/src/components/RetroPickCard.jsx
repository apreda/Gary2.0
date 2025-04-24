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

  // Format shortPick to show as 'TEAM BET_VALUE ODDS' (e.g., 'BOS ML -110' or 'BOS +6.5 -110')
  function getFormattedShortPick(pick) {
    console.log("Formatting pick:", pick);
    
    if (!pick) {
      return 'UNKNOWN PICK';
    }
    
    // If pick.shortPick already contains the formatted pick (TEAM BET_TYPE ODDS),
    // return it directly instead of trying to reformat
    if (pick.shortPick && 
        typeof pick.shortPick === 'string' && 
        /^[A-Z]{3}\s+(ML|[+-]\d+\.?\d*|O|U)\s+[-+]\d+$/.test(pick.shortPick)) {
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
    id: pick?.id || `temp-${Date.now()}`,
    shortPick: pick?.shortPick || '',
    game: pick?.game || '',
    betType: pick?.betType || '',
    spread: pick?.spread || '',
    overUnder: pick?.overUnder || '',
    odds: pick?.odds || '-110',
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
        <span style={{ fontSize: '0.95rem' }}>{formattedTime}</span>
      </div>

      {/* Wallet Value Row */}
      <div style={{
        position: 'absolute',
        top: '4.25rem',
        right: '0.9rem',
        color: colors.secondary,
        fontWeight: 'bold',
        fontSize: '2.2rem',
        zIndex: 3
      }}>
        <span style={{ color: '#00B300' }}>{safePick.walletValue}</span>
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
          {safePick.formattedPick}
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
        {/* BET Button - Gold with Black Font */}
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
        
        {/* FADE Button - Black with Gold Font */}
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
        fontSize: '1.275rem', // Increased by 25% from 1.02rem
        letterSpacing: '0.08em',
        textAlign: 'center',
        padding: '0.7rem 0', // Increased size
        zIndex: 3,
        borderTop: `2px solid ${colors.border}`,
        boxShadow: '0 -2px 8px #bfa14222',
        textTransform: 'uppercase',
      }}>
        {safePick.formattedGame}
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
        <span style={{ fontWeight: '900', marginRight: 16, color: '#000' }}>
          {`Odds: ${typeof safePick.odds === 'string' ? safePick.odds : 
            (typeof safePick.odds === 'number' ? safePick.odds.toString() : 
            (typeof safePick.moneyline === 'string' ? safePick.moneyline : 
            (typeof safePick.moneyline === 'number' ? safePick.moneyline.toString() : 'N/A')))}`}
        </span>
        <span style={{ fontWeight: '700', color: '#000' }}>
          {`Conf: ${typeof safePick.confidence === 'string' ? safePick.confidence : 
            (typeof safePick.confidence === 'number' ? safePick.confidence + '%' : 
            (typeof safePick.confidenceLevel === 'number' ? safePick.confidenceLevel + '%' : '75%'))}`}
        </span>
      </div>
      
      {/* Scouting Report Bullets - Expanded to bottom */}
      <div style={{
        width: '100%',
        padding: '0 0.7rem',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '3rem',
        overflowY: 'auto',
        fontFamily: 'Orbitron, Segoe UI, Arial, sans-serif',
        maxHeight: 'calc(100% - 8rem)',
      }}>
        {/* Use bulletPoints if available, fall back to garysBullets with safe rendering */}
        {(safePick.bulletPoints || safePick.garysBullets || []).map((bullet, index) => {
          // Ensure bullet is a string to prevent [object Object] display
          const bulletText = typeof bullet === 'string' ? bullet : 
            (bullet && typeof bullet.toString === 'function' ? bullet.toString() : 
            'Analysis bullet point');
            
          return (
            <div key={index} style={{ margin: '0.4rem 0', display: 'flex', alignItems: 'flex-start' }}>
              <span style={{ color: colors.primary, marginRight: '0.5rem', fontSize: '1.2rem' }}>•</span>
              <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: '1.1rem', fontWeight: 500, color: '#181818' }}>
                {bulletText}
              </p>
            </div>
          );
        })}
      </div>
      
      {/* Gary's Pick */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '100%', position: 'absolute', bottom: '2rem', left: '0', right: '0', padding: '0 0.7rem', backgroundColor: '#fffbe6' }}>
        <div style={{ backgroundColor: 'rgba(191,161,66,0.2)', padding: '0.25rem 0.5rem', borderRadius: '0.3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 'bold', fontSize: '0.75rem', color: '#222' }}>GARY'S PICK:</span>
          <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: colors.accent, letterSpacing: '0.05rem' }}>
            {/* Use shortPickStr if available, or fall back through other possible property names */}
            {safePick.shortPickStr || safePick.shortPick || safePick.formattedPick || 'ML ML -110'}
          </span>
        </div>
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
