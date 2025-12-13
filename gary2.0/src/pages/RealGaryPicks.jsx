import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import BG2 from '/BG2.png';
import { useToast } from '../components/ui/ToastProvider';
import '../styles/PickCardGlow.css';
import '../styles/DisableCardGlow.css';
import '../styles/MobileScrollFix.css';
import { garyPhrases } from '../utils/garyPhrases';
import { supabase } from '../supabaseClient';
import { getEasternDate, getYesterdayDate, formatGameTime } from '../utils/dateUtils';


// Custom hook to detect mobile
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
};

// Helper to get college school/location name (e.g., "Nebraska" from "Nebraska Cornhuskers")
// Used for NCAAB and NCAAF to display school names instead of mascots
// Only removes the mascot portion, keeps full school name
const getCollegeSchoolName = (teamName) => {
  if (!teamName) return 'TBD';
  const words = teamName.split(' ');
  
  if (words.length <= 1) return teamName;
  if (words.length === 2) return words[0]; // "Nebraska Cornhuskers" → "Nebraska"
  
  // Common mascot prefix words that indicate a 2-word mascot
  // e.g., "Fighting Illini", "Blue Devils", "Red Raiders", "Tar Heels"
  const mascotPrefixes = ['Fighting', 'Golden', 'Blue', 'Red', 'Crimson', 'Scarlet', 'Mean', 'Runnin', 'Running', 'Flying', 'Ragin', 'Sun', 'War', 'Nittany', 'Horned', 'Yellow', 'Demon', 'Green', 'Purple', 'Orange', 'Tar', 'Great'];
  
  // Check if second-to-last word is a mascot prefix (indicates 2-word mascot)
  const secondToLast = words[words.length - 2];
  if (mascotPrefixes.includes(secondToLast)) {
    // Two-word mascot, remove last 2 words
    return words.slice(0, -2).join(' '); // "Illinois Fighting Illini" → "Illinois"
  }
  
  // Single-word mascot, remove last word only
  return words.slice(0, -1).join(' '); // "San Diego State Aztecs" → "San Diego State"
};

// Helper to format matchup display based on league
const formatMatchupDisplay = (pick) => {
  if (!pick?.homeTeam || !pick?.awayTeam) {
    return pick?.game || 'TBD';
  }
  
  const league = pick?.league?.toUpperCase() || '';
  const isCollege = league === 'NCAAB' || league === 'NCAAF';
  
  if (isCollege) {
    // Use school names for college sports
    return `${getCollegeSchoolName(pick.awayTeam)} @ ${getCollegeSchoolName(pick.homeTeam)}`;
  } else {
    // Use mascots for pro sports (current behavior)
    return `${pick.awayTeam.split(' ').pop()} @ ${pick.homeTeam.split(' ').pop()}`;
  }
};

// Integrated Analysis Component - Gary's Take main, Risks at bottom, Stats overlay
const TabbedAnalysis = ({ rationale, accentColor, pick }) => {
  const [showStatsOverlay, setShowStatsOverlay] = useState(false);
  
  // Parse the rationale
  const parseRationale = (text) => {
    if (!text) return null;
    
    // Use team names from pick object (more reliable than parsing)
    const result = {
      teams: { 
        left: pick?.homeTeam || '', 
        right: pick?.awayTeam || '' 
      },
      stats: [],
      injuries: { left: 'None', right: 'None' },
      narrative: '',
      lockLine: '',
      riskLine: ''
    };
    
    const lines = text.split('\n');
    let inTape = false;
    let inNarrative = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.includes('TALE OF THE TAPE')) {
        inTape = true;
        continue;
      }
      
      if (trimmed.match(/^(Gary's Take|The Edge|The Verdict)$/i)) {
        inTape = false;
        inNarrative = true;
        continue;
      }
      
      // Parse stats
      if (inTape && (trimmed.includes('→') || trimmed.includes('←'))) {
        const statMatch = trimmed.match(/^([A-Za-z\s]+?)\s{2,}([^\s→←]+)\s*(→|←)\s*([^\s]+)/);
        if (statMatch) {
          const [, name, leftVal, arrow, rightVal] = statMatch;
          result.stats.push({
            name: name.trim(),
            left: leftVal.trim(),
            right: rightVal.trim(),
            advantage: arrow === '→' ? 'right' : 'left'
          });
        }
      }
      
      // Parse injuries
      if (inTape && trimmed.toLowerCase().includes('injur')) {
        const injMatch = trimmed.match(/(?:Key\s+)?Injuries?\s+(.+?)\s{2,}(.+)/i);
        if (injMatch) {
          result.injuries.left = injMatch[1].trim() || 'None';
          result.injuries.right = injMatch[2].trim() || 'None';
        }
      }
      
      if (inNarrative && trimmed) {
        result.narrative += (result.narrative ? ' ' : '') + trimmed;
      }
    }
    
    // Extract lock line
    const lockMatch = result.narrative.match(/(Lock[^.!]*[.!])\s*$/i);
    if (lockMatch) {
      result.lockLine = lockMatch[1];
      result.narrative = result.narrative.replace(lockMatch[0], '').trim();
    }
    
    // Extract risk/danger line (sentences mentioning "only way", "danger", "risk", "miss")
    const riskMatch = result.narrative.match(/([^.]*(?:only way|danger|risk|miss(?:es)?|backdoor)[^.]*\.)/i);
    if (riskMatch) {
      result.riskLine = riskMatch[1].trim();
      result.narrative = result.narrative.replace(riskMatch[0], '').trim();
    }
    
    return result;
  };
  
  const data = parseRationale(rationale);
  
  if (!data) {
    return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{rationale}</div>;
  }
  
  // Determine team display order (Gary's pick on left)
  const pickStr = pick?.pick?.toLowerCase() || '';
  const leftTeam = data.teams.left || 'Team 1';
  const rightTeam = data.teams.right || 'Team 2';
  const garyPickedRight = pickStr.includes(rightTeam.toLowerCase()) || 
                          pickStr.includes(rightTeam.split(' ').pop()?.toLowerCase());
  
  const displayLeft = garyPickedRight ? rightTeam : leftTeam;
  const displayRight = garyPickedRight ? leftTeam : rightTeam;
  
  const getStatVal = (stat, side) => {
    if (garyPickedRight) return side === 'left' ? stat.right : stat.left;
    return side === 'left' ? stat.left : stat.right;
  };
  
  const getAdvantage = (stat, side) => {
    const origAdv = stat.advantage;
    if (garyPickedRight) {
      const swapped = origAdv === 'right' ? 'left' : 'right';
      return swapped === side;
    }
    return origAdv === side;
  };
  
  // Get injuries - prefer structured data from BDL, fallback to parsed rationale
  const getInjuryDisplay = (teamInjuries) => {
    if (!teamInjuries || teamInjuries.length === 0) return 'Healthy';
    return teamInjuries
      .filter(i => i.status === 'Out' || i.status === 'Doubtful')
      .map(i => `${i.name} (${i.status})`)
      .join(', ') || 'Healthy';
  };
  
  // Use structured injuries if available, otherwise fall back to parsed
  const structuredInjuries = pick?.injuries;
  let injLeft, injRight;
  
  if (structuredInjuries) {
    // Swap based on Gary's pick position
    injLeft = garyPickedRight 
      ? getInjuryDisplay(structuredInjuries.away) 
      : getInjuryDisplay(structuredInjuries.home);
    injRight = garyPickedRight 
      ? getInjuryDisplay(structuredInjuries.home) 
      : getInjuryDisplay(structuredInjuries.away);
  } else {
    // Fallback to parsed rationale
    injLeft = garyPickedRight ? data.injuries.right : data.injuries.left;
    injRight = garyPickedRight ? data.injuries.left : data.injuries.right;
  }
  
  // Get all stats Gary used (from statsUsed field or parsed)
  const allStats = pick?.statsUsed || [];
  
  // Get full stat data with values (from statsData field)
  const allStatsData = pick?.statsData || [];
  
  // Get risks from pick object or parsed
  const risks = pick?.risks || data.riskLine || null;
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* View Stats Button */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowStatsOverlay(true); }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          padding: '0.35rem 0.7rem',
          fontSize: '0.65rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          border: '1px solid rgba(74, 222, 128, 0.3)',
          borderRadius: '4px',
          cursor: 'pointer',
          background: 'rgba(74, 222, 128, 0.1)',
          color: '#4ade80',
          transition: 'all 0.2s'
        }}
      >
        View Stats ({allStatsData.length})
      </button>
      
      {/* Main Content */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto',
        paddingTop: '2rem',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Gary's Take Header */}
        <div style={{ 
          fontSize: '0.7rem', 
          fontWeight: 700, 
          letterSpacing: '0.1em', 
          textTransform: 'uppercase', 
          color: '#4ade80', 
          opacity: 0.6,
          marginBottom: '0.5rem'
        }}>Gary's Take</div>
        
        {/* Main Narrative - split into 2 paragraphs for readability */}
        <div style={{ fontSize: '0.85rem', lineHeight: 1.65, opacity: 0.92, flex: 1 }}>
          {(() => {
            const text = data.narrative || rationale || '';
            // Find a good split point (after ~40-60% of sentences)
            const sentences = text.split(/(?<=[.!?])\s+/);
            if (sentences.length <= 2) return text;
            
            const splitIndex = Math.ceil(sentences.length / 2);
            const para1 = sentences.slice(0, splitIndex).join(' ');
            const para2 = sentences.slice(splitIndex).join(' ');
            
            return (
              <>
                <p style={{ marginBottom: '0.8rem' }}>{para1}</p>
                <p>{para2}</p>
              </>
            );
          })()}
        </div>
        
        {/* Lock Line - Green */}
        {data.lockLine && (
          <div style={{ 
            marginTop: '0.6rem', 
            paddingTop: '0.5rem',
            borderTop: '1px solid rgba(74, 222, 128, 0.15)'
          }}>
            <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.88rem' }}>
              {data.lockLine}
            </span>
          </div>
        )}
        
        {/* Risks Section - Amber */}
        {risks && (
          <div style={{ 
            marginTop: '0.6rem', 
            padding: '0.5rem 0.6rem',
            background: 'rgba(251, 191, 36, 0.08)',
            borderLeft: '2px solid rgba(251, 191, 36, 0.5)',
            borderRadius: '0 4px 4px 0'
          }}>
            <div style={{ 
              fontSize: '0.6rem', 
              fontWeight: 700, 
              letterSpacing: '0.08em', 
              textTransform: 'uppercase',
              color: '#fbbf24',
              opacity: 0.8,
              marginBottom: '0.25rem'
            }}>Risk Factor</div>
            <div style={{ fontSize: '0.78rem', lineHeight: 1.5, color: 'rgba(251, 191, 36, 0.9)' }}>
              {risks}
            </div>
          </div>
        )}
      </div>
      
      {/* Stats Overlay */}
      {showStatsOverlay && (
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            inset: 0,
            background: '#0a0a0a', // Solid dark background - no transparency
            borderRadius: '12px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10
          }}
        >
          {/* Overlay Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '0.75rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
            <span style={{ 
              fontSize: '0.7rem', 
              fontWeight: 700, 
              letterSpacing: '0.1em', 
              textTransform: 'uppercase',
              color: '#4ade80'
            }}>Tale of the Tape</span>
            <button
              onClick={(e) => { e.stopPropagation(); setShowStatsOverlay(false); }}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.65rem',
                fontWeight: 500,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.7)'
              }}
            >
              Close
            </button>
          </div>
          
          {/* Overlay Content */}
          <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.82rem', lineHeight: 1.5, paddingBottom: '1rem' }}>
            {/* Team Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
              paddingBottom: '0.3rem',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.75rem',
              fontWeight: 600
            }}>
              <span style={{ flex: 1, color: '#4ade80' }}>{displayLeft}</span>
              <span style={{ width: '90px', textAlign: 'center', opacity: 0.35, fontSize: '0.65rem' }}>VS</span>
              <span style={{ flex: 1, textAlign: 'right', opacity: 0.7 }}>{displayRight}</span>
            </div>
            
            {/* Stats - ONLY use real statsData from Supabase (what Gary actually called) */}
            {/* No mock data, no filler - only real stats with real values */}
            {(() => {
              // ONLY use statsData from Supabase - these are the real stats Gary requested
              if (allStatsData.length === 0) return [];
              
              const statsToRender = [...allStatsData];
              // Move RECORD to the top if present
              const recordIndex = statsToRender.findIndex(s => 
                s.token === 'PACE_HOME_AWAY' || s.token === 'HOME_AWAY_SPLITS' || s.token === 'SPECIAL_TEAMS'
              );
              if (recordIndex > 0) {
                const [recordStat] = statsToRender.splice(recordIndex, 1);
                statsToRender.unshift(recordStat);
              }
              return statsToRender;
            })().map((stat, i, arr) => {
              // Only process stats from statsData (real stats Gary called)
              if (!stat || !stat.token) return null;
              
              // Skip tokens that return non-stat data
              const skipTokens = ['TOP_PLAYERS', 'WEATHER', 'REST_SITUATION', 'PASSING_EPA', 'RUSHING_EPA', 'FIELD_POSITION', 'MOTIVATION_CONTEXT'];
              if (skipTokens.includes(stat.token)) return null;
              
              // Skip SP_PLUS_RATINGS/NET_RATING for NCAAF if values are 0.0 (BDL doesn't have this data)
              if (['SP_PLUS_RATINGS', 'NET_RATING', 'FEI_RATINGS', 'ADJ_EFFICIENCY_MARGIN'].includes(stat.token)) {
                const homeNR = stat.home?.net_rating;
                const awayNR = stat.away?.net_rating;
                if ((homeNR === '0.0' || homeNR === 0) && (awayNR === '0.0' || awayNR === 0)) {
                  return null;
                }
              }
              
              // Skip if no home or away data exists
              if (!stat.home || !stat.away) return null;
              
              // Map tokens to user-friendly display names
              const displayNameMap = {
                'PACE_HOME_AWAY': 'Record',
                'HOME_AWAY_SPLITS': 'Record',
                'SPECIAL_TEAMS': 'Record',
                'OFFENSIVE_EPA': 'Total YPG',
                'DEFENSIVE_EPA': 'Opp Yards',
                'SUCCESS_RATE_OFFENSE': 'Yards/Game',
                'SUCCESS_RATE_DEFENSE': 'Yards Allowed',
                'SUCCESS_RATE': 'Total YPG',
                'EPA_LAST_5': 'Recent PPG',
                'EARLY_DOWN_SUCCESS': 'Scoring Efficiency',
                'QB_STATS': 'QB Rating',
                'PRESSURE_RATE': 'Completion %',
                'RED_ZONE_OFFENSE': '3rd Down %',
                'RED_ZONE_DEFENSE': 'Opp 3rd Down %',
                'TURNOVER_MARGIN': 'Turnover +/-',
                'OL_RANKINGS': 'Rush YPG',
                'DL_RANKINGS': 'Opp Rush',
                'RB_STATS': 'Rush Yards/Carry',
                'EXPLOSIVE_PLAYS': 'Total Yards',
                'EXPLOSIVE_ALLOWED': 'Yards Allowed',
                'WR_TE_STATS': 'Pass Yards',
                'DEFENSIVE_PLAYMAKERS': 'Def Points Allowed',
                // NBA/NCAAB
                'OFFENSIVE_RATING': 'Off Rating',
                'DEFENSIVE_RATING': 'Def Rating',
                'NET_RATING': 'Net Rating',
                'EFG_PCT': 'eFG%',
                'OPP_EFG_PCT': 'Opp eFG%',
                'THREE_PT_SHOOTING': '3PT%',
                'RECENT_FORM': 'Last 5',
                'CLUTCH_STATS': 'Close Games',
                'PACE': 'Pace',
                'PAINT_SCORING': 'Paint Scoring',
                'PAINT_DEFENSE': 'Paint Defense',
                'TURNOVER_RATE': 'TOV/Game',
                'OREB_RATE': 'Off Reb/G',
                'FT_RATE': 'FT Rate',
                'ADJ_EFFICIENCY_MARGIN': 'Net Rating',
                // NCAAF specific
                'SP_PLUS_RATINGS': 'Net Rating',
                'EXPLOSIVENESS': 'Big Plays',
                'HAVOC_RATE': 'Havoc Rate',
                'HAVOC_ALLOWED': 'Opp Havoc',
                // Derived stats
                'PASSING_TDS': 'Pass TDs',
                'INTERCEPTIONS': 'INTs',
                'RUSHING_TDS': 'Rush TDs',
                'TOTAL_TDS': 'Total TDs',
                'PASSING_YPG': 'Pass YPG'
              };
              
              let statName = displayNameMap[stat.token] || stat.name || stat.token;
              
              // Extract key value from nested stat objects - use different keys to avoid duplicates
              const extractValue = (obj, token) => {
                if (!obj || typeof obj !== 'object') return obj || 'N/A';
                
                // Map token to the SPECIFIC key field we want (avoiding duplicates)
                const keyMap = {
                  // === NBA/NCAAB STATS ===
                  'OFFENSIVE_RATING': 'offensive_rating',
                  'DEFENSIVE_RATING': 'defensive_rating',
                  'NET_RATING': 'net_rating',
                  'PACE': 'pace',
                  'PACE_HOME_AWAY': 'overall',
                  'PACE_LAST_10': 'pace',
                  'EFG_PCT': 'efg_pct',
                  'OPP_EFG_PCT': 'efg_pct',
                  'TURNOVER_RATE': 'turnovers_per_game',
                  'THREE_PT_SHOOTING': 'three_pct',
                  'PAINT_DEFENSE': 'defensive_rating',
                  'PERIMETER_DEFENSE': 'three_pct',
                  'RECENT_FORM': 'last_5',
                  'HOME_AWAY_SPLITS': 'overall',
                  'OREB_RATE': 'oreb_per_game',
                  'FT_RATE': 'ft_rate',
                  'CLUTCH_STATS': 'close_record',
                  'EFFICIENCY_LAST_10': 'net_rating',
                  'PAINT_SCORING': 'efg_pct',
                  'LINEUP_DATA': 'offensive_rating',
                  'USAGE_RATES': 'usage',
                  'ADJ_EFFICIENCY_MARGIN': 'net_rating',
                  
                  // === NFL STATS - Each token extracts DIFFERENT field ===
                  'OFFENSIVE_EPA': 'total_yards_per_game', // For NCAAF, fallback to points_per_game
                  'DEFENSIVE_EPA': 'opp_total_yards', // For NCAAF
                  'SUCCESS_RATE_OFFENSE': 'yards_per_game',
                  'SUCCESS_RATE_DEFENSE': 'opp_yards_per_game',
                  'EPA_LAST_5': 'points_per_game',
                  'EARLY_DOWN_SUCCESS': 'points_per_game',
                  'TURNOVER_MARGIN': 'turnover_diff',
                  'QB_STATS': 'qb_rating',
                  'PRESSURE_RATE': 'completion_pct',
                  'RED_ZONE_OFFENSE': 'third_down_pct',
                  'RED_ZONE_DEFENSE': 'third_down_pct',
                  'THIRD_DOWN': 'third_down_pct',
                  'FOURTH_DOWN': 'fourth_down_pct',
                  'EXPLOSIVE_PLAYS': 'yards_per_game',
                  'EXPLOSIVE_ALLOWED': 'opp_yards_per_game',
                  'OL_RANKINGS': 'rushing_yards_per_game',
                  'RB_STATS': 'yards_per_carry',
                  'WR_TE_STATS': 'yards_per_game',
                  'DEFENSIVE_PLAYMAKERS': 'opp_points_per_game',
                  'SPECIAL_TEAMS': 'overall',
                  'FIELD_POSITION': 'overall',
                  // NCAAF/NCAAB specific
                  'SP_PLUS_RATINGS': 'net_rating',
                  'SUCCESS_RATE': 'total_yards_per_game',
                  'DL_RANKINGS': 'opp_rushing_yards',
                  // New derived stats for cleaner display
                  'PASSING_TDS': 'passing_tds',
                  'INTERCEPTIONS': 'interceptions',
                  'RUSHING_TDS': 'rushing_tds',
                  'TOTAL_TDS': 'total_tds',
                  'PASSING_YPG': 'passing_ypg'
                };
                
                const key = keyMap[token] || Object.keys(obj).find(k => 
                  typeof obj[k] === 'string' || typeof obj[k] === 'number'
                );
                
                if (key && obj[key] !== undefined) return obj[key];
                
                // Fallback: find first string/number value that's not 'team'
                for (const [k, v] of Object.entries(obj)) {
                  if (k !== 'team' && k !== 'games' && k !== 'players' && (typeof v === 'string' || typeof v === 'number')) {
                    return v;
                  }
                }
                return 'N/A';
              };
              
              // Extract real values from statsData
              const homeVal = extractValue(stat.home, stat.token);
              const awayVal = extractValue(stat.away, stat.token);
              
              // STRICT FILTER: Skip if either value is N/A, undefined, or empty
              if (homeVal === 'N/A' || awayVal === 'N/A' || 
                  homeVal === undefined || awayVal === undefined ||
                  homeVal === '' || awayVal === '') {
                return null;
              }
              
              // Filter out 0.0 net ratings for NCAAB/NCAAF - BDL doesn't have efficiency ratings
              const efficiencyTokens = ['ADJ_EFFICIENCY_MARGIN', 'NET_RATING', 'ADJ_OFFENSIVE_EFF', 'ADJ_DEFENSIVE_EFF', 'SP_PLUS_RATINGS'];
              if (efficiencyTokens.includes(stat.token) && 
                  (homeVal === '0.0' || homeVal === 0 || homeVal === '0' ||
                   awayVal === '0.0' || awayVal === 0 || awayVal === '0')) {
                return null;
              }
              
              // Skip if values are team names (indicates no real data)
              const homeTeam = pick?.homeTeam || '';
              const awayTeam = pick?.awayTeam || '';
              const homeStr = String(homeVal);
              const awayStr = String(awayVal);
              if (homeStr.includes(homeTeam) || homeStr.includes(awayTeam) ||
                  awayStr.includes(homeTeam) || awayStr.includes(awayTeam)) {
                return null;
              }
              
              // Skip if values contain "Check" (placeholder text)
              if (homeStr.includes('Check') || awayStr.includes('Check')) {
                return null;
              }
              
              // Skip if this exact value pair was already shown (dedup)
              const valueKey = `${homeVal}-${awayVal}`;
              const prevStats = arr.slice(0, i);
              const isDuplicate = prevStats.some(prevStat => {
                if (!prevStat || !prevStat.token) return false;
                const prevHome = extractValue(prevStat.home, prevStat.token);
                const prevAway = extractValue(prevStat.away, prevStat.token);
                return `${prevHome}-${prevAway}` === valueKey;
              });
              if (isDuplicate) return null;
              
              // For statsData, we need to swap if Gary picked the right team (away team)
              const displayLeft = garyPickedRight ? awayVal : homeVal;
              const displayRight = garyPickedRight ? homeVal : awayVal;
              
              // Special rendering for RECENT_FORM - color code W/L, filter out T (unplayed games)
              const isRecentForm = stat.token === 'RECENT_FORM';
              const renderFormValue = (val) => {
                if (!val || typeof val !== 'string') return val;
                // Filter out 'T' (ties/unplayed games - no ties in NBA)
                const filtered = val.replace(/T/g, '');
                return filtered.split('').map((char, idx) => {
                  if (char === 'W') return <span key={idx} style={{ color: '#4ade80', fontWeight: 600 }}>W</span>;
                  if (char === 'L') return <span key={idx} style={{ color: '#f87171', fontWeight: 600 }}>L</span>;
                  return <span key={idx} style={{ opacity: 0.5 }}>{char}</span>;
                });
              };
              
              // Determine advantage - some stats: LOWER is better (defensive/opponent stats)
              // Stats where LOWER is better (you want to give up fewer to opponents, have fewer turnovers, etc.)
              const statNameLower = statName.toLowerCase();
              const lowerIsBetter = 
                statNameLower.includes('opp') ||           // Opponent stats (opp yards, opp ppg, etc.)
                statNameLower.includes('allowed') ||       // Points/yards allowed
                statNameLower.includes('against') ||       // Stats against
                (statNameLower.includes('turnover') && !statNameLower.includes('+') && !statNameLower.includes('margin')) || // Turnovers (not differential)
                statNameLower.includes('interception') ||  // INTs thrown (fewer is better)
                statNameLower.includes('sack') ||          // Sacks taken (fewer is better)
                statNameLower.includes('penalty');         // Penalties (fewer is better)
              
              const leftNum = parseFloat(String(displayLeft).replace('%', '')) || 0;
              const rightNum = parseFloat(String(displayRight).replace('%', '')) || 0;
              const leftWins = lowerIsBetter ? leftNum < rightNum : leftNum > rightNum;
              const rightWins = lowerIsBetter ? rightNum < leftNum : rightNum > leftNum;
              
              // Skip N/A stats or empty values
              if ((displayLeft === 'N/A' || displayLeft === '') && (displayRight === 'N/A' || displayRight === '')) return null;
              
              return (
                <div key={i} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  marginBottom: '0.3rem',
                  fontSize: '0.8rem'
                }}>
                  <span style={{ 
                    flex: 1,
                    color: isRecentForm ? 'inherit' : (leftWins ? '#4ade80' : '#f87171'),
                    fontWeight: leftWins && !isRecentForm ? 600 : 400
                  }}>{isRecentForm ? renderFormValue(displayLeft) : displayLeft}</span>
                  <span style={{ width: '110px', textAlign: 'center', opacity: 0.4, fontSize: '0.62rem' }}>{statName}</span>
                  <span style={{ 
                    flex: 1, 
                    textAlign: 'right',
                    color: isRecentForm ? 'inherit' : (rightWins ? '#4ade80' : '#f87171'),
                    fontWeight: rightWins && !isRecentForm ? 600 : 400
                  }}>{isRecentForm ? renderFormValue(displayRight) : displayRight}</span>
                </div>
              );
            })}
            
            {/* Injuries row */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              marginTop: '0.5rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.75rem'
            }}>
              <span style={{ 
                flex: 1, 
                color: injLeft === 'None' || injLeft === 'Healthy' ? 'rgba(255,255,255,0.5)' : '#f87171' 
              }}>{injLeft === 'None' ? 'Healthy' : injLeft}</span>
              <span style={{ width: '110px', textAlign: 'center', opacity: 0.35, fontSize: '0.62rem' }}>INJURIES</span>
              <span style={{ 
                flex: 1, 
                textAlign: 'right',
                color: injRight === 'None' || injRight === 'Healthy' ? 'rgba(255,255,255,0.5)' : '#f87171'
              }}>{injRight === 'None' ? 'Healthy' : injRight}</span>
            </div>
            
            {/* No fallback - only show real stats from Supabase */}
          </div>
        </div>
      )}
    </div>
  );
};

// Tale of the Tape Component - Wide format with vs in middle (LEGACY - kept for fallback)
const TaleOfTheTape = ({ rationale, accentColor, pick }) => {
  
  // Parse stats and narrative from rationale
  const parseRationale = (text) => {
    if (!text) return null;
    
    const result = {
      teams: { left: '', right: '' },
      stats: [],
      injuries: { left: 'None', right: 'None' },
      narrative: '',
      lockLine: ''
    };
    
    const lines = text.split('\n');
    let inTape = false;
    let inNarrative = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.includes('TALE OF THE TAPE')) {
        inTape = true;
        continue;
      }
      
      if (trimmed.match(/^(Gary's Take|The Edge|The Verdict)$/i)) {
        inTape = false;
        inNarrative = true;
        continue;
      }
      
      // Extract team names from header row
      if (inTape && !trimmed.includes('→') && !trimmed.includes('←') && trimmed.length > 5 && !trimmed.toLowerCase().includes('injur') && !trimmed.toLowerCase().includes('record') && !trimmed.toLowerCase().includes('rating')) {
        const teamMatch = trimmed.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s{2,}([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/);
        if (teamMatch && !result.teams.left) {
          result.teams.left = teamMatch[1].trim();
          result.teams.right = teamMatch[2].trim();
          continue;
        }
      }
      
      // Parse stat rows with arrows
      if (inTape && (trimmed.includes('→') || trimmed.includes('←'))) {
        const statMatch = trimmed.match(/^([A-Za-z\s]+?)\s{2,}([^\s→←]+)\s*(→|←)\s*([^\s]+)/);
        if (statMatch) {
          const [, name, leftVal, arrow, rightVal] = statMatch;
          result.stats.push({
            name: name.trim(),
            left: leftVal.trim(),
            right: rightVal.trim(),
            advantage: arrow === '→' ? 'right' : 'left'
          });
        }
      }
      
      // Parse injuries
      if (inTape && trimmed.toLowerCase().includes('injur')) {
        const injMatch = trimmed.match(/(?:Key\s+)?Injuries?\s+(.+?)\s{2,}(.+)/i);
        if (injMatch) {
          result.injuries.left = injMatch[1].trim() || 'None';
          result.injuries.right = injMatch[2].trim() || 'None';
        }
      }
      
      if (inNarrative && trimmed) {
        result.narrative += (result.narrative ? ' ' : '') + trimmed;
      }
    }
    
    // Extract "Lock" sentence from narrative
    const lockMatch = result.narrative.match(/(Lock[^.!]*[.!])\s*$/i);
    if (lockMatch) {
      result.lockLine = lockMatch[1];
      result.narrative = result.narrative.replace(lockMatch[0], '').trim();
    }
    
    return result;
  };
  
  const data = parseRationale(rationale);
  
  if (!data || data.stats.length === 0) {
    return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{rationale}</div>;
  }
  
  // Determine which team Gary picked - put Gary's pick on the LEFT
  const pickStr = pick?.pick?.toLowerCase() || '';
  const leftTeam = data.teams.left || 'Team 1';
  const rightTeam = data.teams.right || 'Team 2';
  
  // Check if Gary picked the right team - if so, swap so his pick is on the left
  const garyPickedRight = pickStr.includes(rightTeam.toLowerCase()) || 
                          pickStr.includes(rightTeam.split(' ').pop()?.toLowerCase());
  
  // Display teams - Gary's pick should be on LEFT (green)
  const displayLeft = garyPickedRight ? rightTeam : leftTeam;
  const displayRight = garyPickedRight ? leftTeam : rightTeam;
  
  const getStatVal = (stat, side) => {
    if (garyPickedRight) {
      return side === 'left' ? stat.right : stat.left;
    }
    return side === 'left' ? stat.left : stat.right;
  };
  
  const getAdvantage = (stat, side) => {
    const origAdv = stat.advantage;
    if (garyPickedRight) {
      const swapped = origAdv === 'right' ? 'left' : 'right';
      return swapped === side;
    }
    return origAdv === side;
  };
  
  const injLeft = garyPickedRight ? data.injuries.right : data.injuries.left;
  const injRight = garyPickedRight ? data.injuries.left : data.injuries.right;
  
  return (
    <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
      {/* Header row - wide format, Gary's pick on LEFT (green) */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        marginBottom: '0.4rem',
        paddingBottom: '0.3rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        fontSize: '0.75rem',
        fontWeight: 600
      }}>
        <span style={{ flex: 1, color: '#4ade80' }}>{displayLeft}</span>
        <span style={{ width: '80px', textAlign: 'center', opacity: 0.35, fontSize: '0.65rem', textTransform: 'uppercase' }}>vs</span>
        <span style={{ flex: 1, textAlign: 'right', opacity: 0.7 }}>{displayRight}</span>
      </div>
      
      {/* Stats rows - wide format with stat name in middle */}
      {data.stats.map((stat, i) => (
        <div key={i} style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          marginBottom: '0.25rem',
          fontSize: '0.82rem'
        }}>
          <span style={{ 
            flex: 1,
            color: getAdvantage(stat, 'left') ? '#4ade80' : 'rgba(255,255,255,0.55)',
            fontWeight: getAdvantage(stat, 'left') ? 600 : 400
          }}>{getStatVal(stat, 'left')}</span>
          <span style={{ width: '80px', textAlign: 'center', opacity: 0.4, fontSize: '0.72rem' }}>{stat.name}</span>
          <span style={{ 
            flex: 1, 
            textAlign: 'right',
            color: getAdvantage(stat, 'right') ? '#4ade80' : 'rgba(255,255,255,0.55)',
            fontWeight: getAdvantage(stat, 'right') ? 600 : 400
          }}>{getStatVal(stat, 'right')}</span>
        </div>
      ))}
      
      {/* Injuries row */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        marginTop: '0.3rem',
        paddingTop: '0.3rem',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: '0.75rem'
      }}>
        <span style={{ 
          flex: 1, 
          color: injLeft === 'None' ? 'rgba(255,255,255,0.5)' : '#f87171' 
        }}>{injLeft === 'None' ? '✓ Healthy' : injLeft}</span>
        <span style={{ width: '80px', textAlign: 'center', opacity: 0.35, fontSize: '0.68rem' }}>Injuries</span>
        <span style={{ 
          flex: 1, 
          textAlign: 'right',
          color: injRight === 'None' ? 'rgba(255,255,255,0.5)' : '#f87171'
        }}>{injRight === 'None' ? '✓ Healthy' : injRight}</span>
      </div>
      
      {/* Gary's Take */}
      {data.narrative && (
        <div style={{ 
          marginTop: '0.6rem',
          paddingTop: '0.5rem',
          borderTop: '1px solid rgba(74, 222, 128, 0.15)'
        }}>
          <div style={{ 
            fontSize: '0.7rem', 
            fontWeight: 700, 
            letterSpacing: '0.1em', 
            textTransform: 'uppercase', 
            color: '#4ade80', 
            opacity: 0.6,
            marginBottom: '0.3rem'
          }}>Gary's Take</div>
          <div style={{ opacity: 0.9, lineHeight: 1.6, fontSize: '0.82rem' }}>
            {(() => {
              const text = data.narrative || '';
              const sentences = text.split(/(?<=[.!?])\s+/);
              if (sentences.length <= 2) return text;
              
              const splitIndex = Math.ceil(sentences.length / 2);
              const para1 = sentences.slice(0, splitIndex).join(' ');
              const para2 = sentences.slice(splitIndex).join(' ');
              
              return (
                <>
                  <p style={{ marginBottom: '0.6rem' }}>{para1}</p>
                  <p>{para2}</p>
                </>
              );
            })()}
            {data.lockLine && (
              <>
                <div style={{ marginTop: '0.6rem' }}></div>
                <span style={{ color: '#4ade80', fontWeight: 600 }}>{data.lockLine}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function RealGaryPicks() {
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userDecisions, setUserDecisions] = useState({});
  const [processingDecisions, setProcessingDecisions] = useState({});
  const [flippedCards, setFlippedCards] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [selectedSport, setSelectedSport] = useState('NBA');
  const sportsTabs = ['NBA', 'NFL', 'NHL', 'NCAAB', 'NCAAF', 'EPL', 'MLB', 'WNBA'];

  // Load decisions from localStorage
  const loadLocalDecisions = () => {
    try {
      const stored = localStorage.getItem('garyBetDecisions');
      if (stored) {
        setUserDecisions(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error loading local decisions:', e);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    
    const loadData = async () => {
      if (controller.signal.aborted) return;
      
      try {
        await loadPicks();
        loadLocalDecisions();
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error loading picks:', error);
        }
      }
    };
    
    loadData();
    
    return () => controller.abort();
  }, []);

  const showToast = useToast();

  const loadPicks = async () => {
    setLoading(true);
    setError(null);

    try {
      const eastern = getEasternDate();
      let queryDate = eastern.dateString; // Always use today's EST date

      // Fetch daily picks (NBA, NCAAB, etc.)
      const { data, error: fetchError } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', queryDate)
        .maybeSingle();

      // Fetch weekly NFL picks - get the most recent week's picks
      // NFL picks persist for the whole week, and we should show them until new ones are generated
      const { data: nflData } = await supabase
        .from('weekly_nfl_picks')
        .select('picks, week_start')
        .eq('season', new Date().getFullYear())
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      console.log('[Picks] NFL data found:', nflData ? `${nflData.picks?.length || 0} picks for week ${nflData.week_start}` : 'none');

      const currentDate = queryDate;

      let picksArray = [];
      
      // Add daily picks
      if (data && data.picks) {
        const dailyPicks = typeof data.picks === 'string' ? JSON.parse(data.picks) : data.picks;
        // Filter out NFL from daily picks (we get NFL from weekly table)
        picksArray = dailyPicks.filter(p => p.league !== 'NFL');
      }
      
      // Add NFL picks from weekly table
      if (nflData && nflData.picks) {
        const nflPicks = typeof nflData.picks === 'string' ? JSON.parse(nflData.picks) : nflData.picks;
        picksArray = [...picksArray, ...nflPicks];
      }
      
      if (picksArray.length > 0) {
        picksArray = picksArray
          .filter(pick => {
            if (pick.id && pick.id.includes('emergency')) return false;
            if (!pick.pick || pick.pick === '') return false;
            if (!pick.rationale || pick.rationale === '') return false;
            return true;
          })
          .map(pick => {
            const extractOddsFromAnalysis = (pick) => {
              try {
                // First, try to get odds from the rawAnalysis.rawOpenAIOutput
                if (pick.rawAnalysis?.rawOpenAIOutput?.odds) {
                  const odds = pick.rawAnalysis.rawOpenAIOutput.odds;
                  console.log('Found odds in rawOpenAIOutput:', odds);
                  return odds;
                }
                
                // Second, try to extract from the pick field
                if (pick.pick) {
                  // Look for odds pattern at the end of the pick string (e.g., "Team Name -1.5 -110")
                  const endOddsMatch = pick.pick.match(/[-+]\d+(?=\s*$)/);
                  if (endOddsMatch) {
                    console.log('Extracted odds from end of pick string:', endOddsMatch[0]);
                    return endOddsMatch[0];
                  }
                  
                  // Look for odds in the middle of spread picks (e.g., "Team Name -1.5 (-110)")
                  const spreadOddsMatch = pick.pick.match(/[-+]?\d+\.?\d*\s*\(?([-+]\d+)\)?/);
                  if (spreadOddsMatch) {
                    console.log('Extracted odds from spread pick:', spreadOddsMatch[1]);
                    return spreadOddsMatch[1];
                  }
                  
                  // Try to find any odds-like pattern in the pick
                  const anyOddsMatch = pick.pick.match(/[-+]\d{2,3}(?=\D*$)/);
                  if (anyOddsMatch) {
                    console.log('Found odds-like pattern in pick:', anyOddsMatch[0]);
                    return anyOddsMatch[0];
                  }
                }
                
                // Third, try to get from the odds field directly
                if (pick.odds) {
                  console.log('Using direct odds field:', pick.odds);
                  return pick.odds;
                }
                
                // Fourth, try to extract from rawAnalysis if available
                if (pick.rawAnalysis?.odds) {
                  console.log('Using odds from rawAnalysis:', pick.rawAnalysis.odds);
                  return pick.rawAnalysis.odds;
                }
                
                // Fifth, try to extract from analysis prompt if available
                if (pick.analysisPrompt) {
                  console.log('Attempting to extract odds from analysis prompt');
                  const teamName = pick.pick?.split(' ').slice(0, -1).join(' ');
                  if (teamName) {
                    const oddsLineMatch = pick.analysisPrompt.match(/Current moneyline odds:([^\n]+)/);
                    if (oddsLineMatch && oddsLineMatch[1]) {
                      const oddsLine = oddsLineMatch[1];
                      const teamRegex = new RegExp(`${teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(([-+]?\\d+)\\)`);
                      const match = oddsLine.match(teamRegex);
                      if (match && match[1]) {
                        return match[1];
                      }
                    }
                  }
                }
                
                // If we can't determine the odds, return null instead of a default
                console.log('Could not determine odds for pick:', pick.pick);
                return null;
                
              } catch (error) {
                console.error('Error extracting odds:', error);
                return null;
              }
            };

            const oddsValue = extractOddsFromAnalysis(pick);

            const simplePick = {
              // PRIORITY: Use pick_id from data, then id, then generate fallback
              id: pick.pick_id || pick.id || `pick-${currentDate}-${pick.league}-${pick.pick?.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()}`,
              pick_id: pick.pick_id || pick.id, // Preserve the original pick_id
              pick: pick.pick || '',
              rationale: pick.rationale || '',
              game: pick.game || '',
              league: pick.league || '',
              confidence: pick.confidence || 0,
              time: function () {
                if (pick.rawAnalysis?.rawOpenAIOutput?.time) {
                  return pick.rawAnalysis.rawOpenAIOutput.time;
                }
                if (pick.time) {
                  return pick.time;
                }
                if (pick.gameTime) {
                  return formatGameTime(pick.gameTime);
                }
                return '';
              }(),
              odds: oddsValue || pick.odds || '',
              homeTeam: pick.homeTeam || '',
              awayTeam: pick.awayTeam || '',
              type: pick.type || 'Moneyline',
              trapAlert: pick.trapAlert || false,
              revenge: pick.revenge || false,
              momentum: pick.momentum || 0,
              // CRITICAL: Include agentic system fields
              statsUsed: pick.statsUsed || [],
              statsData: pick.statsData || [], // Full stat values for Tale of the Tape
              injuries: pick.injuries || null, // Structured injury data from BDL
              commence_time: pick.commence_time || null
            };

            return simplePick;
          });
      }

      // Simply display whatever picks we found (daily + NFL weekly)
      // No frontend generation - picks are generated via scripts only
      if (picksArray.length > 0) {
        console.log(`[Picks] Displaying ${picksArray.length} picks`);
        setPicks(picksArray);
      } else {
        console.log('[Picks] No picks found for today');
        // Don't show error - just no picks available yet
        setPicks([]);
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
    // eslint-disable-next-line
  }, []);

  const visiblePicks = picks; // All picks are free

  const handleDecisionMade = async (decision, pick) => {
    if (processingDecisions[pick.id] || userDecisions[pick.id]) {
      showToast('You already made a decision for this pick', 'warning', 3000, false);
      return;
    }

    setProcessingDecisions(prev => ({
      ...prev,
      [pick.id]: true
    }));

    try {
      // Show success message
      const toastMessage = decision === 'bet'
        ? garyPhrases.getRandom('betPhrases')
        : garyPhrases.getRandom('fadePhrases');

      showToast(toastMessage, decision === 'bet' ? 'success' : 'info', 4000, true);

      // Update local state
      const newDecisions = {
        ...userDecisions,
        [pick.id]: decision
      };
      setUserDecisions(newDecisions);
      
      // Save to localStorage
      localStorage.setItem('garyBetDecisions', JSON.stringify(newDecisions));

      // Reload picks to refresh any state
      loadPicks();

      setReloadKey(prev => prev + 1);
    } catch (error) {
      console.error('Error handling bet/fade decision:', error);
      showToast('Something went wrong. Please try again.', 'error', 3000, false);
    } finally {
      setProcessingDecisions(prev => ({
        ...prev,
        [pick.id]: false
      }));
    }
  };

  const nextPick = () => {
    if (animating || filteredPicks.length <= 1) return;

    setAnimating(true);
    const newIndex = (currentIndex + 1) % filteredPicks.length;

    setFlippedCards(prev => {
      const newState = { ...prev };
      Object.keys(newState).forEach(key => {
        newState[key] = false;
      });
      return newState;
    });

    setTimeout(() => {
      setCurrentIndex(newIndex);
      setAnimating(false);
    }, 500);
  };

  const prevPick = () => {
    if (animating || filteredPicks.length <= 1) return;

    setAnimating(true);
    const newIndex = (currentIndex - 1 + filteredPicks.length) % filteredPicks.length;

    setFlippedCards(prev => {
      const newState = { ...prev };
      Object.keys(newState).forEach(key => {
        newState[key] = false;
      });
      return newState;
    });

    setTimeout(() => {
      setCurrentIndex(newIndex);
      setAnimating(false);
    }, 500);
  };

  useEffect(() => {
    document.body.classList.add('picks-page');
    return () => {
      document.body.classList.remove('picks-page');
    };
  }, []);

  const isMobile = useIsMobile();
  const filteredPicks = React.useMemo(() => {
    return picks.filter(p => (p.league || '').toUpperCase() === selectedSport);
  }, [picks, selectedSport]);

  useEffect(() => {
    setCurrentIndex(0);
    setFlippedCards({});
  }, [selectedSport]);

  const getSportAccentColor = (leagueRaw) => {
    const league = (leagueRaw || '').toUpperCase();
    switch (league) {
      case 'NBA': return '#3B82F6';      // Blue
      case 'WNBA': return '#F97316';     // Orange
      case 'NFL': return '#bfa142';      // Original Gold
      case 'NHL': return '#00A3E0';      // Ice Blue
      case 'NCAAB': return '#F97316';    // Orange
      case 'NCAAF': return '#DC2626';    // Red
      case 'EPL': return '#8B5CF6';      // Purple
      case 'MLB': return '#0EA5E9';      // Sky Blue
      default: return '#bfa142';         // Fallback to original gold
    }
  };
  const hexToRgba = (hex, alpha) => {
    if (!hex) return `rgba(0,0,0,${alpha ?? 1})`;
    let h = hex.replace('#', '');
    if (h.length === 3) {
      h = h.split('').map(ch => ch + ch).join('');
    }
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    const a = typeof alpha === 'number' ? alpha : 1;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100vw' }}>
      {/* BG2.png background with 15% opacity */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
          background: `#121212 url(${BG2}) no-repeat center center`,
          backgroundSize: 'cover',
          opacity: 0.15,
          overflow: 'hidden',
        }}
      >
        {/* Subtle gradient overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(40, 40, 50, 0.4) 0%, rgba(20, 20, 25, 0.2) 50%, rgba(10, 10, 15, 0.1) 100%)',
          opacity: 0.6,
        }} />
        
        {/* Abstract shapes for visual interest */}
        <div style={{
          position: 'absolute',
          top: '10%',
          left: '5%',
          width: '20vw',
          height: '20vw',
          borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
          background: 'rgba(191, 161, 66, 0.03)',
          filter: 'blur(40px)',
          zIndex: 1,
        }} />
        
        <div style={{
          position: 'absolute',
          bottom: '15%',
          right: '10%',
          width: '25vw',
          height: '25vw',
          borderRadius: '63% 37% 30% 70% / 50% 45% 55% 50%',
          background: 'rgba(191, 161, 66, 0.02)',
          filter: 'blur(50px)',
          zIndex: 1,
        }} />
        
        {/* Vignette for depth */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(0, 0, 0, 0.6) 100%)',
          zIndex: 2,
        }} />
      </div>

      {/* Main content, zIndex: 2 */}
      <div className="w-full flex flex-col items-center justify-center pt-32 pb-6 px-4 relative" style={{ minHeight: '100vh', zIndex: 2 }}>
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
              <div className="mb-12">
                {/* NEW LAYOUT: Directly on page in a horizontal row format */}
                <div className="pt-12 px-4">
                  <h1 className="text-4xl font-bold text-center mb-2" style={{ color: '#b8953f' }}>
                    TODAY'S PICKS
                  </h1>
                  <p className="text-center text-gray-400 mb-6 max-w-2xl mx-auto hidden sm:block">
                    Picks are generated everyday at 10am EST. If injuries or events occur between then and game time, users will be notified of scratch picks via email.
                  </p>
                  {/* Sports Tabs */}
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-6">
                    {sportsTabs.map(tab => {
                      const isActive = selectedSport === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setSelectedSport(tab)}
                          className="px-3 sm:px-4 py-2 rounded-md text-sm sm:text-base transition-all"
                          style={{
                            background: isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                            color: isActive ? '#ffffff' : 'rgba(255,255,255,0.8)',
                            border: isActive ? '1px solid #b8953f' : '1px solid rgba(255,255,255,0.1)',
                          }}
                        >
                          {tab}
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Card Stack Interface */}
                  <div className="flex justify-center items-center relative py-4 pt-2">
                    {/* Left navigation arrow - positioned outside the card, no circle */}
                    <button 
                      className={`absolute ${isMobile ? 'left-[-30px]' : 'left-[-60px]'} z-50 text-[#d4af37] hover:text-white transition-all duration-300 bg-transparent`}
                      onClick={prevPick}
                      disabled={animating || filteredPicks.length <= 1}
                      style={{ transform: 'translateY(-50%)', top: '50%' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width={isMobile ? "30" : "40"} height={isMobile ? "30" : "40"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    
                    {/* Right navigation arrow - positioned outside the card, no circle */}
                    <button 
                      className={`absolute ${isMobile ? 'right-[-30px]' : 'right-[-60px]'} z-50 text-[#d4af37] hover:text-white transition-all duration-300 bg-transparent`}
                      onClick={nextPick}
                      disabled={animating || filteredPicks.length <= 1}
                      style={{ transform: 'translateY(-50%)', top: '50%' }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width={isMobile ? "30" : "40"} height={isMobile ? "30" : "40"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                    
                    {/* Card counter - repositioned below the card */}
                    <div className="absolute bottom-[-50px] left-0 right-0 text-center z-50">
                      <span className="px-4 py-2 bg-transparent text-lg text-[#d4af37] font-medium">
                        {filteredPicks.length > 0 ? `${currentIndex + 1} / ${filteredPicks.length}` : '0/0'}
                      </span>
                    </div>
                    
                    {/* Card Stack - Wider index card format (20% larger) */}
                    <div className="relative" style={{ 
                      width: isMobile ? '90%' : '634px', 
                      height: isMobile ? '200px' : '422px', 
                      maxWidth: isMobile ? '500px' : 'none',
                      margin: isMobile ? '0 auto' : '0 0 0 48px'
                    }}>
                      {filteredPicks.length === 0 ? (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          No picks for {selectedSport} today.
                        </div>
                      ) : filteredPicks.map((pick, index) => {
                        // Calculate position in stack relative to current index
                        const position = (index - currentIndex + filteredPicks.length) % filteredPicks.length;
                        const isCurrentCard = index === currentIndex;
                        
                        // Style based on position in stack - simplified for mobile
                        const cardStyle = {
                          zIndex: filteredPicks.length - position,
                          transform: position === 0 
                            ? 'translateX(0) scale(1)' 
                            : position === 1 
                              ? `translateX(${isMobile ? '5px' : '10px'}) scale(0.95) translateY(${isMobile ? '5px' : '10px'})` 
                              : position === 2 
                                ? `translateX(${isMobile ? '10px' : '20px'}) scale(0.9) translateY(${isMobile ? '10px' : '20px'})` 
                                : `translateX(${isMobile ? '15px' : '30px'}) scale(0.85) translateY(${isMobile ? '15px' : '30px'})`,
                          opacity: position <= 2 ? 1 - (position * 0.15) : 0,
                          pointerEvents: isCurrentCard ? 'auto' : 'none',
                          transition: animating ? 'all 0.5s ease-in-out' : 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out',
                          width: '100%',
                          height: '100%',
                          position: 'absolute',
                          top: 0,
                          left: 0
                        };
                        
                        // Get the flipped state for this card
                        const isFlipped = flippedCards[pick.id] || false;
                        const accentColor = getSportAccentColor(pick.league);
                        
                        // Function to toggle the flipped state for this specific card
                        const toggleFlip = (e) => {
                          if (animating) return;
                          e.stopPropagation();
                          setFlippedCards(prev => ({
                            ...prev,
                            [pick.id]: !prev[pick.id]
                          }));
                        };
                        
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
                              onClick={toggleFlip}
                            >
                              <div 
                                style={{
                                  position: 'relative',
                                  width: '100%',
                                  height: '100%',
                                  transformStyle: 'preserve-3d',
                                  transition: 'transform 0.6s',
                                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                                }}>
                                    {/* FRONT OF CARD - Mobile Simplified Design */}
                                    {isMobile ? (
                                      <div style={{
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        backfaceVisibility: 'hidden',
                                        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                        borderRadius: '12px',
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        overflow: 'hidden',
                                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                                        color: '#ffffff',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        padding: '1.5rem',
                                        textAlign: 'center'
                                      }}>
                                        {/* Gary's Pick - Large and Centered */}
                                                                                <div style={{
                                          fontSize: isMobile ? '1.75rem' : '2rem',
                                          fontWeight: 700,
                                          lineHeight: 1.1,
                                          color: accentColor,
                                          wordBreak: 'break-word',
                                          maxHeight: isMobile ? '3rem' : '4.5rem',
                                          overflow: 'hidden',
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical',
                                          marginBottom: '1.25rem'
                                        }}>
                                          {(() => {
                                            // Remove odds from the end of the pick string
                                            if (pick.pick) {
                                              return pick.pick.replace(/([-+]\d+)$/, '').trim();
                                            }
                                            return pick.pick;
                                          })()}
                                        </div>
                                        
                                        {/* Odds Display */}
                                        <div style={{
                                          background: 'rgba(255, 255, 255, 0.05)',
                                          padding: '0.5rem 1rem',
                                          borderRadius: '6px',
                                          border: '1px solid rgba(255, 255, 255, 0.2)',
                                          marginBottom: '1rem'
                                        }}>
                                          <div style={{ 
                                            fontSize: '0.7rem', 
                                            opacity: 0.7, 
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em', 
                                            marginBottom: '0.25rem'
                                          }}>
                                            Odds
                                          </div>
                                          <div style={{
                                            fontSize: '1.25rem',
                                            fontWeight: 600,
                                            color: accentColor
                                          }}>
                                            {(() => {
                                              // Extract odds from the pick string
                                              if (pick.pick) {
                                                const oddsMatch = pick.pick.match(/([-+]\d+)$/);
                                                return oddsMatch ? oddsMatch[1] : '-110';
                                              }
                                              return pick.odds || '-110';
                                            })()}
                                          </div>
                                        </div>

                                        {/* Confidence Score */}
                                        <div style={{
                                          background: hexToRgba(accentColor, 0.15),
                                          padding: '0.75rem 1.5rem',
                                          borderRadius: '8px',
                                          border: `1px solid ${hexToRgba(accentColor, 0.3)}`
                                        }}>
                                          <div style={{ 
                                            fontSize: '0.7rem', 
                                            opacity: 0.7, 
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em', 
                                            marginBottom: '0.25rem'
                                          }}>
                                            Confidence
                                          </div>
                                          <div style={{
                                            fontSize: '1.5rem',
                                            fontWeight: 700,
                                            color: accentColor
                                          }}>
                                            {typeof pick.confidence === 'number' ? 
                                              Math.round(pick.confidence * 100) + '%' : 
                                              (pick.confidence || '75%')}
                                          </div>
                                        </div>
                                        

                                      </div>
                                    ) : (
                                      // Desktop front card design
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
                                          {/* League, Odds, and Matchup in horizontal layout - Fixed Width Columns */}
                                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                            {/* League - Fixed width */}
                                            <div style={{ width: '80px', minWidth: '80px' }}>
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
                                                opacity: 0.95,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem'
                                              }}>
                                                {pick.league || 'MLB'}
                                                {(pick.isBeta || pick.league === 'NHL' || pick.league === 'EPL') && (
                                                  <span style={{
                                                    fontSize: '0.6rem',
                                                    fontWeight: 700,
                                                    padding: '0.15rem 0.35rem',
                                                    borderRadius: '4px',
                                                    background: 'rgba(255,165,0,0.2)',
                                                    color: '#FFA500',
                                                    letterSpacing: '0.05em',
                                                    textTransform: 'uppercase'
                                                  }}>
                                                    BETA
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            
                                            {/* Odds - Fixed width */}
                                            <div style={{ width: '80px', minWidth: '80px' }}>
                                              <div style={{ 
                                                fontSize: '0.75rem', 
                                                opacity: 0.6, 
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em', 
                                                marginBottom: '0.25rem'
                                              }}>
                                                Odds
                                              </div>
                                              <div style={{ 
                                                fontSize: '1.25rem', 
                                                fontWeight: 600,
                                                color: accentColor
                                              }}>
                                                {(() => {
                                                  // Extract odds from the pick string
                                                  if (pick.pick) {
                                                    const oddsMatch = pick.pick.match(/([-+]\d+)$/);
                                                    return oddsMatch ? oddsMatch[1] : '-110';
                                                  }
                                                  return pick.odds || '-110';
                                                })()}
                                              </div>
                                            </div>
                                            
                                            {/* Matchup - Flexible width */}
                                            <div style={{ flex: 1, minWidth: '120px' }}>
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
                                                {formatMatchupDisplay(pick)}
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
                                              fontSize: isMobile ? '1.75rem' : '2rem', 
                                              fontWeight: 700, 
                                              lineHeight: 1.1,
                                              color: accentColor,
                                              wordBreak: 'break-word',
                                              maxHeight: isMobile ? '3rem' : '4.5rem',
                                              overflow: 'hidden',
                                              display: '-webkit-box',
                                              WebkitLineClamp: 2,
                                              WebkitBoxOrient: 'vertical',
                                              marginBottom: '1.25rem'
                                            }}>
                                              {(() => {
                                                // Remove odds from the end of the pick string
                                                if (pick.pick) {
                                                  return pick.pick.replace(/([-+]\d+)$/, '').trim();
                                                }
                                                return pick.pick;
                                              })()}
                                            </div>
                                            
                                            {/* Enhanced preview with key stats bullet points - hide on mobile */}
                                            {!isMobile && (
                                              <div style={{
                                                fontSize: '0.8rem',
                                                opacity: 0.85,
                                                marginBottom: '0.5rem',
                                                marginTop: '0.75rem',
                                                lineHeight: 1.4
                                              }}>
                                                {pick.rationale ? 
                                                  pick.rationale.length > 240 ? 
                                                    pick.rationale.substring(0, 240) + '...' : 
                                                    pick.rationale
                                                  : 'Tap for detailed analysis'
                                                }
                                              </div>
                                            )}
                                          </div>
                                          
                                          {/* Bet or Fade Buttons */}
                                          <div>
                                            <div style={{ 
                                              fontSize: '0.75rem', 
                                              opacity: 0.6, 
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em', 
                                              marginBottom: '0.5rem'
                                            }}>
                                              Take Your Pick
                                            </div>
                                            <div style={{
                                              display: 'flex',
                                              gap: '0.75rem',
                                              width: '100%',
                                            }}>
                                              <button 
                                                style={{
                                              background: userDecisions[pick.id] === 'bet' 
                                                ? hexToRgba(accentColor, 0.5)
                                                : hexToRgba(accentColor, 0.15),
                                              color: accentColor,
                                                  fontWeight: '600',
                                                  padding: '0.5rem 1rem',
                                                  borderRadius: '8px',
                                              border: `1px solid ${hexToRgba(accentColor, 0.3)}`,
                                                  cursor: userDecisions[pick.id] ? 'default' : 'pointer',
                                                  flex: 1,
                                                  fontSize: '0.8rem',
                                                  letterSpacing: '0.05em',
                                                  textTransform: 'uppercase',
                                                  transition: 'all 0.2s ease',
                                                  opacity: userDecisions[pick.id] && userDecisions[pick.id] !== 'bet' ? 0.5 : 1
                                                }}
                                                 onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (!processingDecisions[pick.id] && !userDecisions[pick.id]) {
                                                    handleDecisionMade('bet', pick);
                                                  }
                                                }}
                                              >
                                                Bet
                                              </button>
                                              <button 
                                                style={{
                                                  background: userDecisions[pick.id] === 'fade' 
                                                    ? 'rgba(255, 255, 255, 0.2)'
                                                    : 'rgba(255, 255, 255, 0.05)',
                                                  color: userDecisions[pick.id] === 'fade' 
                                                    ? 'rgba(255, 255, 255, 1)'
                                                    : 'rgba(255, 255, 255, 0.8)',
                                                  fontWeight: '600',
                                                  padding: '0.5rem 1rem',
                                                  borderRadius: '8px',
                                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                                  cursor: userDecisions[pick.id] ? 'default' : 'pointer',
                                                  flex: 1,
                                                  fontSize: '0.8rem',
                                                  letterSpacing: '0.05em',
                                                  textTransform: 'uppercase',
                                                  transition: 'all 0.2s ease',
                                                  opacity: userDecisions[pick.id] && userDecisions[pick.id] !== 'fade' ? 0.5 : 1
                                                }}
                                                 onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (!processingDecisions[pick.id] && !userDecisions[pick.id]) {
                                                    handleDecisionMade('fade', pick);
                                                  }
                                                }}
                                              >
                                                Fade
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                        
                                        {/* Right side content - prominently elevated appearance */}
                                        <div style={{
                                            position: 'absolute',
                                            right: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: '30%',
                                            borderLeft: `2.25px solid ${accentColor}`,
                                            padding: '1.5rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            background: 'linear-gradient(135deg, rgba(55, 55, 58, 1) 0%, rgba(40, 40, 42, 0.95) 100%)',
                                            boxShadow: '-10px 0 15px rgba(0, 0, 0, 0.4)',
                                            borderRadius: '0 16px 16px 0',
                                            clipPath: 'inset(0px 0px 0px -20px)',
                                            zIndex: 2,
                                            transform: 'translateZ(10px)',
                                          }}>
                                           {/* Game time section */}
                                           <div style={{ 
                                             textAlign: 'center',
                                             marginBottom: '1rem'
                                           }}>
                                             <div style={{ 
                                               fontSize: '0.75rem', 
                                               opacity: 0.6, 
                                               textTransform: 'uppercase',
                                               letterSpacing: '0.05em', 
                                               marginBottom: '0.25rem'
                                             }}>
                                               Game Time
                                             </div>
                                             <div style={{
                                               fontSize: '1.125rem', 
                                               fontWeight: 600,
                                               opacity: 0.9
                                             }}>
                                               {pick.time || '7:10 PM EST'}
                                             </div>
                                           </div>
                                          
                                          {/* Coin Image centered - no background - HIDE ON MOBILE */}
                                          {!isMobile && (
                                            <div style={{
                                              display: 'flex',
                                              justifyContent: 'center',
                                              marginTop: 'auto',
                                              marginBottom: 'auto',
                                              background: 'transparent'
                                            }}>
                                              <img 
                                                src="/coin2.png" 
                                                alt="Coin Image"
                                                style={{
                                                  width: 143,
                                                  height: 143,
                                                  objectFit: 'contain',
                                                  opacity: 1,
                                                  background: 'transparent'
                                                }}
                                              />
                                            </div>
                                          )}
                                          
                                          {/* Confidence score with visual indicator */}
                                          <div style={{ 
                                            textAlign: 'center',
                                            marginTop: '1rem',
                                            width: '100%'
                                          }}>
                                            <div style={{ 
                                              fontSize: '0.75rem', 
                                              opacity: 0.6, 
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em', 
                                              marginBottom: '0.25rem'
                                            }}>
                                              Confidence
                                            </div>
                                            
                                            {/* Confidence score display */}
                                            <div style={{
                                              fontSize: '1.2rem',
                                              fontWeight: 700,
                                              opacity: 0.95,
                                              color: accentColor,
                                              marginBottom: '0.5rem'
                                            }}>
                                              {typeof pick.confidence === 'number' ? 
                                                Math.round(pick.confidence * 100) + '%' : 
                                                (pick.confidence || '75%')}
                                            </div>
                                            
                                            {/* Click to flip instruction with subtle design */}
                                            <button style={{
                                              marginTop: '1rem',
                                              fontSize: '0.75rem',
                                              padding: '0.5rem 1rem',
                                              background: hexToRgba(accentColor, 0.15),
                                              color: accentColor,
                                              border: 'none',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em',
                                              fontWeight: 500,
                                              transition: 'all 0.2s ease'
                                            }}>
                                              View Analysis
                                            </button>
                                          </div>
                                        </div>
                                        
                                        {/* Subtle gradient overlay for depth */}
                                        <div style={{
                                          position: 'absolute',
                                          inset: 0,
                                          background: 'radial-gradient(circle at center, transparent 60%, rgba(0,0,0,0.4) 140%)',
                                          opacity: 0.5,
                                          pointerEvents: 'none'
                                        }}></div>
                                      </div>
                                    )}
                                    
                                    {/* BACK OF CARD - ANALYSIS (MATCHING FREE PICK FORMAT) */}
                                    <div style={{
                                      position: 'absolute',
                                      width: '100%',
                                      height: '100%',
                                      backfaceVisibility: 'hidden',
                                      transform: 'rotateY(180deg)',
                                      background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                                      borderRadius: isMobile ? '12px' : '16px',
                                      fontFamily: 'Inter, system-ui, sans-serif',
                                      overflow: 'hidden',
                                      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                                      color: '#ffffff',
                                      padding: '1.25rem',
                                      display: 'flex',
                                      flexDirection: 'column'
                                    }}>
                                      {/* Full analysis - takes up all available space */}
                                      <div style={{ 
                                        flex: '1 1 85%',
                                        overflowY: 'auto',
                                        fontSize: '0.99rem',
                                        lineHeight: 1.6,
                                        opacity: 0.95,
                                        paddingRight: '0.5rem',
                                        marginBottom: '0.5rem'
                                      }}>
                                        {pick.rationale ? (
                                          // Use Tabbed Analysis component for new format
                                          (pick.statsUsed || pick.rationale.includes('TALE OF THE TAPE')) ? (
                                            <TabbedAnalysis rationale={pick.rationale} accentColor={accentColor} pick={pick} />
                                          ) : pick.rationale.includes('•') ? (
                                            // Already has bullets, just display
                                            <div style={{ whiteSpace: 'pre-wrap' }}>{pick.rationale}</div>
                                          ) : pick.rationale.includes('. ') && pick.rationale.length > 150 ? (
                                            // Long text with sentences - format into readable paragraphs
                                            <div>
                                              {pick.rationale
                                                .split(/(?<=[.!?])\s+/)
                                                .filter(sentence => sentence.trim().length > 0)
                                                .map((sentence, idx) => {
                                                  let cleanSentence = sentence.trim();
                                                  if (!cleanSentence.endsWith('.') && !cleanSentence.endsWith('!') && !cleanSentence.endsWith('?')) {
                                                    cleanSentence += '.';
                                                  }
                                                  return (
                                                    <p key={idx} style={{ 
                                                      marginBottom: '0.75rem',
                                                      lineHeight: 1.5
                                                    }}>
                                                      {cleanSentence}
                                                    </p>
                                                  );
                                                })}
                                            </div>
                                          ) : (
                                            // Short text or single paragraph - just display as is
                                            <div style={{ lineHeight: 1.6 }}>{pick.rationale}</div>
                                          )
                                        ) : (
                                          <div style={{ textAlign: 'center', opacity: 0.6, marginTop: '2rem' }}>
                                            Analysis not available at this time.
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Bottom info with BACK button in middle */}
                                      <div style={{ 
                                        flex: '0 0 auto',
                                        paddingTop: '0.5rem', 
                                        borderTop: '1px solid rgba(255,255,255,0.1)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '0.75rem'
                                      }}>
                                        <div>
                                          <span style={{ opacity: 0.6 }}>Confidence: </span>
                                          <span style={{ fontWeight: 700, color: '#4ade80' }}>
                                            {typeof pick.confidence === 'number' ? 
                                              Math.round(pick.confidence * 100) + '%' : 
                                              (pick.confidence || '75%')}
                                          </span>
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setFlippedCards(prev => ({
                                              ...prev,
                                              [pick.id]: false
                                            }));
                                          }}
                                          style={{
                                            background: hexToRgba(accentColor, 0.15),
                                            color: accentColor,
                                            border: 'none',
                                            borderRadius: '4px',
                                            padding: '0.3rem 0.8rem',
                                            cursor: 'pointer',
                                            fontSize: '0.65rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            fontWeight: 500,
                                            transition: 'all 0.2s ease'
                                          }}
                                        >
                                          Back
                                        </button>
                                        <div>
                                          <span style={{ opacity: 0.6 }}>Time: </span>
                                          <span style={{ fontWeight: 600 }}>
                                            {pick.gameTime || pick.time || formatGameTime(pick.commence_time) || 'TBD'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* See Past Picks Button - Repositioned after pagination counter */}
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
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

export default RealGaryPicks; 