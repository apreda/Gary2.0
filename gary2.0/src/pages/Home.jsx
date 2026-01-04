import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import '../assets/css/logo-responsive.css';
import { supabase } from "../supabaseClient";
import { 
  Flame, 
  AlertTriangle, 
  TrendingDown, 
  Eye,
  Syringe,
  Cloud,
  Plane,
  Building2,
  Newspaper,
  Activity,
  LineChart,
  Users
} from 'lucide-react';


// Using inline CSS for simplicity

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

function Home() {
  const [featuredPicks, setFeaturedPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [winRate, setWinRate] = useState('67%');
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  
  // Simple win rate badge with no dependencies

  // Render a pick card - IDENTICAL to RealGaryPicks implementation
  const renderPickCard = (pick) => {
    // Mock data fallback if pick data is incomplete
    const mockPick = {
      league: pick.league || 'NBA',
      homeTeam: pick.homeTeam || 'Thunder',
      awayTeam: pick.awayTeam || 'Nuggets',
      time: pick.time || '9:30 PM ET',
      confidence: pick.confidence || 0.78,
      pick: pick.pick || 'Denver Nuggets +9.5 -110',
      rationale: pick.rationale || 'Thunder are the better squad, but a 9.5-point line is disrespectful to a battle-tested Nuggets team even on the road.',
      game: pick.game || 'Nuggets @ Thunder'
    };
    
    // Use provided data or fallback to mock data
    const displayPick = {
      ...mockPick,
      ...pick
    };

    return (
      <div style={{ width: 576, height: 420, perspective: '1000px', cursor: 'pointer' }} onClick={() => setIsCardFlipped(!isCardFlipped)}>
        {/* Card container with 3D effect */}
        <div style={{ 
          position: 'relative', 
          width: '100%', 
          height: '100%', 
          transformStyle: 'preserve-3d', 
          transition: 'transform 0.6s',
          transform: isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}>
          {/* FRONT OF CARD - Modern Dark UI Design */}
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
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
            }}>
              {/* League, Odds, and Matchup in horizontal layout - Fixed Width Columns */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
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
                    opacity: 0.95
                  }}>
                    {displayPick.league || 'MLB'}
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
                    color: '#bfa142'
                  }}>
                    {(() => {
                      // Extract odds from the pick string
                      if (displayPick.pick) {
                        const oddsMatch = displayPick.pick.match(/([-+]\d+)$/);
                        return oddsMatch ? oddsMatch[1] : '-110';
                      }
                      return displayPick.odds || '-110';
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
                    {formatMatchupDisplay(displayPick)}
                  </div>
                </div>
              </div>
              
              {/* The main pick display */}
              <div style={{ marginBottom: '0.75rem', flex: '1' }}>
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
                  fontSize: '1.8rem', 
                  fontWeight: 700, 
                  lineHeight: 1.1,
                  color: '#bfa142', /* Keeping gold color for the actual pick */
                  wordBreak: 'break-word',
                  marginBottom: '1rem'
                }}>
                  {(() => {
                    // Remove odds from the end of the pick string
                    if (displayPick.pick) {
                      return displayPick.pick.replace(/([-+]\d+)$/, '').trim();
                    }
                    return 'MISSING PICK';
                  })()}
                </div>
                
                {/* Enhanced preview with key stats bullet points */}
                <div style={{
                  fontSize: '0.8rem',
                  opacity: 0.85,
                  marginBottom: '0.5rem',
                  lineHeight: 1.3
                }}>
                  {displayPick.rationale ? 
                    displayPick.rationale.length > 200 ? 
                      displayPick.rationale.substring(0, 200) + '...' : 
                      displayPick.rationale
                    : 'Tap for detailed analysis'
                  }
                </div>
              </div>
              
              {/* Bet or Fade Buttons - Fixed at bottom */}
              <div style={{ marginTop: 'auto' }}>
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
                      background: 'rgba(191, 161, 66, 0.15)',
                      color: '#bfa142',
                      fontWeight: '600',
                      padding: '0.6rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(191, 161, 66, 0.3)',
                      cursor: 'pointer',
                      flex: 1,
                      fontSize: '0.8rem',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Bet
                  </button>
                  <button 
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'rgba(255, 255, 255, 0.8)',
                      fontWeight: '600',
                      padding: '0.6rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                      flex: 1,
                      fontSize: '0.8rem',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      transition: 'all 0.2s ease'
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
              top: 0,  /* Aligned to card edge */
              bottom: 0, /* Aligned to card edge */
              width: '30%',
              borderLeft: '2.25px solid #bfa142', /* Gold border */
              padding: '1.5rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(135deg, rgba(55, 55, 58, 1) 0%, rgba(40, 40, 42, 0.95) 100%)', /* Much darker and more distinct */
              boxShadow: '-10px 0 15px rgba(0, 0, 0, 0.4)', /* Interior shadow only */
              borderRadius: '0 16px 16px 0', /* Rounded on right side only */
              clipPath: 'inset(0px 0px 0px -20px)', /* Clip shadow to prevent overflow */
              zIndex: 2, /* Ensure it appears above other content */
              transform: 'translateZ(10px)', /* 3D effect */
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
                  {displayPick.time ? 
                    (function() {
                      let time = displayPick.time.includes('ET') ? displayPick.time : `${displayPick.time} ET`;
                      return time.replace(/:([0-9])\s/, ':0$1 ');
                    })() : '10:10 PM ET'}
                </div>
              </div>
              
              {/* Coin Image centered - no background */}
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
                    width: 130, /* 20% bigger than previous 108px */
                    height: 130, /* 20% bigger than previous 108px */
                    objectFit: 'contain',
                    opacity: 1,
                    background: 'transparent'
                  }}
                />
              </div>
              
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
                  color: '#bfa142', /* Gold for confidence */
                  marginBottom: '0.5rem'
                }}>
                  {typeof displayPick.confidence === 'number' ? 
                    Math.round(displayPick.confidence * 100) + '%' : 
                    (displayPick.confidence || '75%')}
                </div>
                
                {/* Click to flip instruction with subtle design */}
                <button
                  style={{
                    marginTop: '1rem',
                    fontSize: '0.75rem',
                    padding: '0.5rem 1rem',
                    background: 'rgba(191, 161, 66, 0.15)',
                    color: '#bfa142',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 500,
                    transition: 'all 0.2s ease'
                  }}
                >
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
          
          {/* BACK OF CARD - Analysis View */}
          <div style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
            borderRadius: '16px',
            fontFamily: 'Inter, system-ui, sans-serif',
            overflow: 'hidden',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
            color: '#ffffff',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Back header - minimal height */}
            <div style={{ marginBottom: '0.5rem', flex: '0 0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#bfa142', margin: 0 }}>Gary's Analysis</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCardFlipped(false);
                  }}
                  style={{
                    background: 'rgba(191, 161, 66, 0.15)',
                    color: '#bfa142',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.3rem 0.6rem',
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
              </div>
            </div>
            
            {/* Full analysis - takes up 85% of remaining space */}
            <div style={{ 
              flex: '1 1 85%',
              overflowY: 'auto',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              opacity: 0.95,
              paddingRight: '0.5rem',
              marginBottom: '0.5rem'
            }}>
              {displayPick.rationale ? (
                // Check if rationale is already formatted or needs formatting
                displayPick.rationale.includes('•') ? (
                  // Already has bullets, just display
                  <div style={{ whiteSpace: 'pre-wrap' }}>{displayPick.rationale}</div>
                ) : displayPick.rationale.includes('. ') && displayPick.rationale.length > 150 ? (
                  // Long text with sentences - format into readable paragraphs
                  <div>
                    {displayPick.rationale
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
                  <div style={{ lineHeight: 1.6 }}>{displayPick.rationale}</div>
                )
              ) : (
                <div style={{ textAlign: 'center', opacity: 0.6, marginTop: '2rem' }}>
                  Analysis not available at this time.
                </div>
              )}
            </div>
            
            {/* Bottom info - minimal space */}
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
                <span style={{ fontWeight: 700, color: '#bfa142' }}>
                  {typeof displayPick.confidence === 'number' ? 
                    Math.round(displayPick.confidence * 100) + '%' : 
                    (displayPick.confidence || '75%')}
                </span>
              </div>
              <div>
                <span style={{ opacity: 0.6 }}>Time: </span>
                <span style={{ fontWeight: 600 }}>
                  {displayPick.time || 'TBD'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Load featured picks from the database
  // Fetch win rate and yesterday's performance
  useEffect(() => {
    const fetchWinRateData = async () => {
      try {
        // Fetch all picks to calculate win rate
        const { data: picksData, error: picksError } = await supabase
          .from("game_results")
          .select("*")
          .order('date', { ascending: false });
          
        if (picksError) {
          console.error("Error fetching game results:", picksError);
          return;
        }
        
        if (picksData && picksData.length > 0) {
          // Calculate overall win rate
          const totalGames = picksData.length;
          const wins = picksData.filter(game => game.result === 'win').length;
          const calculatedWinRate = Math.round((wins / totalGames) * 100);
          setWinRate(`${calculatedWinRate}%`);
          
          // Get yesterday's record
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayString = yesterday.toISOString().split('T')[0]; // Format: YYYY-MM-DD
          
          const yesterdayGames = picksData.filter(game => game.date?.includes(yesterdayString));
          if (yesterdayGames.length > 0) {
            const yesterdayWins = yesterdayGames.filter(game => game.result === 'win').length;
            const yesterdayLosses = yesterdayGames.length - yesterdayWins;
            setYesterdayRecord(`${yesterdayWins}-${yesterdayLosses}`);
          }
        }
      } catch (err) {
        console.error("Error fetching win rate data:", err);
      }
    };
    
    fetchWinRateData();
  }, []);
  
  useEffect(() => {
    const fetchFeaturedPicks = async () => {
      try {
        // Use Eastern Time consistently for all date operations
        const now = new Date();
        
        // Convert to Eastern Time zone properly
        const easternTimeOptions = { timeZone: "America/New_York" };
        const easternDateString = now.toLocaleDateString('en-US', easternTimeOptions);
        const easternTimeString = now.toLocaleTimeString('en-US', easternTimeOptions);
        
        // Create a new date object with Eastern Time components
        const [month, day, year] = easternDateString.split('/');
        const [time, period] = easternTimeString.match(/([\d:]+)\s(AM|PM)/).slice(1);
        const [hours, minutes] = time.split(':');
        
        // Format the date string properly (YYYY-MM-DD)
        const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const easternHour = parseInt(hours) + (period === 'PM' && hours !== '12' ? 12 : 0);
        
        // Format full time for logging
        const fullEasternTimeString = `${month}/${day}/${year} ${hours}:${minutes} ${period}`;
        
        console.log(`Home: Current Eastern Time: ${fullEasternTimeString} (Hour: ${easternHour})`);
        
        let queryDate = dateString;
        console.log(`Home: Current Eastern Time: ${fullEasternTimeString} (Hour: ${easternHour}`);
        
        // Always show today's picks (EST), no fallback to yesterday
        
        // Query Supabase for picks using the determined date
        // Check both daily_picks AND weekly_nfl_picks (NFL picks are in weekly table)
        console.log(`Home: Querying picks for date: ${queryDate}`);
        
        // Calculate NFL Season: Jan-July is previous year's season
        const nflSeason = parseInt(month) <= 7 ? parseInt(year) - 1 : parseInt(year);
        
        const [dailyResult, nflResult] = await Promise.all([
          supabase.from("daily_picks").select("picks, date").eq("date", queryDate).maybeSingle(),
          supabase.from("weekly_nfl_picks").select("picks, week_number, season").eq("season", nflSeason).order("week_number", { ascending: false }).limit(1).maybeSingle()
        ]);
          
        if (dailyResult.error) {
          console.error("Error fetching daily picks:", dailyResult.error);
        }
        if (nflResult.error) {
          console.error("Error fetching NFL picks:", nflResult.error);
        }
        
        // Combine picks from both sources
        let allPicks = [];
        if (dailyResult.data?.picks) {
          const dailyPicks = typeof dailyResult.data.picks === "string" ? JSON.parse(dailyResult.data.picks) : dailyResult.data.picks;
          allPicks = allPicks.concat(dailyPicks);
        }
        if (nflResult.data?.picks) {
          const nflPicks = typeof nflResult.data.picks === "string" ? JSON.parse(nflResult.data.picks) : nflResult.data.picks;
          allPicks = allPicks.concat(nflPicks);
        }
        
        // If we have picks, get the top one based on thesis quality (new system)
        // MANUAL OVERRIDE: If a pick has is_top_pick: true, use it first
        // Otherwise: Priority: clear_read with fewest major contradictions > found_angle > confidence
        if (allPicks.length > 0) {
          // Check for manual override first (checks all picks from both sources)
          const manualTopPick = allPicks.find(pick => pick && pick.is_top_pick === true);
          if (manualTopPick) {
            setFeaturedPicks([manualTopPick]);
            return;
          }
          
          // Score picks based on thesis quality
          const scorePick = (pick) => {
            if (!pick) return -1;
            const thesisType = pick.thesis_type;
            const majorCount = pick.contradicting_factors?.major?.length || 0;
            const confidence = typeof pick.confidence === 'number' ? pick.confidence : parseFloat(pick.confidence) || 0;
            
            // Priority scoring:
            // clear_read with 0 majors = 1000
            // clear_read with 1 major = 900
            // clear_read with 2 majors = 800
            // found_angle with 0 majors = 700
            // found_angle with 1 major = 600
            // found_angle with 2 majors = 500
            // Then add confidence as tiebreaker (0-100)
            
            let baseScore = 0;
            if (thesisType === 'clear_read') {
              baseScore = 1000 - (majorCount * 100);
            } else if (thesisType === 'found_angle') {
              baseScore = 700 - (majorCount * 100);
            } else {
              // Fallback to confidence for old picks without thesis_type
              baseScore = confidence * 10;
            }
            
            return baseScore + confidence;
          };
          
          const topPicks = allPicks
            .filter(pick => pick && (pick.confidence || pick.thesis_type))
            .sort((a, b) => scorePick(b) - scorePick(a))
            .slice(0, 1);
          
          setFeaturedPicks(topPicks);
        } else {
          // Use default picks if none found
          setFeaturedPicks([]);
        }
      } catch (err) {
        console.error("Error fetching top picks:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFeaturedPicks();
  }, []);

  return (
    <div className="min-h-screen relative flex flex-col">
      {/* Fixed background with all effects - spans the entire viewport */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#0a0a0c] to-[#18181a] z-0">
        {/* Gold vignette corners - enhanced with white glow */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#b8953f]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#b8953f]/10 blur-3xl" />
        
        {/* White accent areas for contrast - 6% opacity */}
        <div className="absolute top-1/4 right-1/3 w-[300px] h-[300px] rounded-full bg-white/[0.06] blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 w-[400px] h-[400px] rounded-full bg-white/[0.06] blur-3xl" />
        
        {/* Subtle stars/shimmer effect */}
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.15] mix-blend-soft-light" />
        
        {/* White highlight streaks removed */}
        
        {/* Radial vignette for cinematic depth - slightly enhanced */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/20 opacity-30" />
      </div>
      <div className="relative z-10">
        {/* Hero Section - Integrated directly */}
        <section className="hero relative flex flex-col overflow-hidden min-h-screen">
          {/* Hero watermark background - Gary Money image with a subtle gradient overlay */}
          <div className="hero__watermark absolute top-1/2 left-1/2 w-[120%] h-[120%] transform -translate-x-1/2 -translate-y-1/2 scale-110 pointer-events-none z-10">
            <div className="absolute inset-0 bg-[url('/garyai-watermark2.png')] bg-center bg-no-repeat bg-contain opacity-[0.035] filter blur-sm"></div>
          </div>

          {/* Content wrapper that spans the full width to center both the logo and main content */}
          <div className="relative mx-auto w-full max-w-[1440px]">
            {/* Coin image moved to the NEW banner */}
            
            {/* Main content area - use full width at all times */}
            <div className="relative z-20 w-full mx-auto">
              <main className="hero-inner flex flex-col w-full h-full" style={{ padding: "24px 24px" }}>
                {/* Centered Hero Content */}
             <div className="w-full mx-auto flex flex-col items-center mt-14" style={{ paddingLeft: "0", paddingRight: "0" }}>
              {/* NEW badge with coin image - shifted left */}
              <div className="relative mt-11 flex justify-center items-center w-full" style={{ marginLeft: "-80px", marginBottom: "0.28rem" }}>
                {/* Coin image - 20% larger than before and moved even further left */}
                <div className="mr-10">
                  <img
                    src="/coin2.png"
                    alt="Gold Coin"
                    className="object-contain"
                    style={{ 
                      height: "153.9px", /* 20% bigger than previous 128.25px */
                      animation: "float 6s ease-in-out infinite",
                      filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5))",
                    }}
                  />
                </div>
                
                {/* Shiny banner */}
                <div className="font-medium px-5 py-1.5 rounded-full flex items-center"
                     style={{
                       background: 'linear-gradient(135deg, #d4af37 0%, #b8953f 50%, #9c7c33 100%)',
                       color: '#111',
                       textShadow: '0 1px 1px rgba(0,0,0,0.2)',
                       boxShadow: '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.3)',
                       border: '1px solid #b8953f',
                       fontSize: '0.995rem',
                       transform: 'scale(1.09)',
                       transformOrigin: 'center',
                     }}>
                  <span className="mr-2 font-bold uppercase text-black">📱 NOW ON iOS</span>
                  <span className="text-black">Free Download • 7 Sports • No Paywall</span>
                </div>
              </div>

              {/* Main headline - Simple and impactful */}
              <div className="relative mb-6 w-full">
                <h1 className="text-center w-full" style={{ fontSize: "clamp(3.62rem, 6.21vw, 5.175rem)", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
                  <div className="max-w-[920px] mx-auto">
                    <span className="text-white font-bold">Make </span>
                    <span className="italic font-normal text-[#B8953F]">Smarter</span>
                    <span className="text-white font-bold"> Sports Bets </span>
                    <span className="text-white font-bold">with </span>
                    <span className="italic font-normal"><span className="text-white">GARY</span><span className="text-[#B8953F]">.AI</span></span>
                  </div>
                </h1>
                

              </div>
              
              {/* Removed empty spacing div to tighten layout */}

              {/* Technology badges - styled to match the Beta badge */}
              <div className="flex flex-wrap justify-center p-2 mb-8 mx-auto max-w-3xl w-full">
                <div className="flex gap-3 flex-wrap justify-center w-full">
                  {/* Odds API badge */}
                  <div className="text-black text-sm font-bold px-5 py-1.5 rounded-full flex items-center justify-center" 
                    style={{
                      background: 'linear-gradient(135deg, #f5f5f5 0%, #d4af37 50%, #8a8a8a 100%)',
                      color: '#111',
                      textShadow: '0 1px 1px rgba(255,255,255,0.3)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.4)',
                      border: '1px solid rgba(184, 149, 63, 0.5)',
                      minWidth: '120px',
                    }}>
                    Odds API
                  </div>
                  
                  {/* GPT-5.1 badge */}
                  <div className="text-black text-sm font-bold px-5 py-1.5 rounded-full flex items-center justify-center" 
                    style={{
                      background: 'linear-gradient(135deg, #f5f5f5 0%, #d4af37 50%, #8a8a8a 100%)',
                      color: '#111',
                      textShadow: '0 1px 1px rgba(255,255,255,0.3)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.4)',
                      border: '1px solid rgba(184, 149, 63, 0.5)',
                      minWidth: '120px',
                    }}>
                    GPT-5.1
                  </div>
                  
                  {/* Gemini badge */}
                  <div className="text-black text-sm font-bold px-5 py-1.5 rounded-full flex items-center justify-center" 
                    style={{
                      background: 'linear-gradient(135deg, #f5f5f5 0%, #d4af37 50%, #8a8a8a 100%)',
                      color: '#111',
                      textShadow: '0 1px 1px rgba(255,255,255,0.3)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.4)',
                      border: '1px solid rgba(184, 149, 63, 0.5)',
                      minWidth: '120px',
                    }}>
                    Gemini
                  </div>
                  
                  {/* StatCast API badge */}
                  <div className="text-black text-sm font-bold px-5 py-1.5 rounded-full flex items-center justify-center" 
                    style={{
                      background: 'linear-gradient(135deg, #f5f5f5 0%, #d4af37 50%, #8a8a8a 100%)',
                      color: '#111',
                      textShadow: '0 1px 1px rgba(255,255,255,0.3)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.4)',
                      border: '1px solid rgba(184, 149, 63, 0.5)',
                      minWidth: '120px',
                    }}>
                    StatCast API
                  </div>
                  

                </div>
              </div>
              
              {/* CTA Button - Download App */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-center items-center">
                <a 
                  href="https://apps.apple.com/us/app/gary-ai/id6751238914"
                  target="_blank"
                  rel="noopener noreferrer" 
                  className="flex items-center gap-3 text-black font-bold rounded-full transition-all duration-300 ease-in-out hover:scale-105"
                  style={{ 
                    padding: "14px 32px",
                    background: 'linear-gradient(135deg, #B8953F 0%, #d4af37 50%, #B8953F 100%)',
                    boxShadow: '0 4px 15px rgba(184, 149, 63, 0.4)',
                    fontSize: '1.1rem'
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  Download on the App Store
                </a>
                <p className="text-white/50 text-sm">Free • No sign-up required</p>
              </div>
            </div>

            {/* Featured Pick Card Preview - Single Card Only */}
            <div className="mt-12 mb-24 w-full flex flex-col items-center justify-center">
              <h2 className="text-white text-3xl font-bold mb-4">Today's Free Pick</h2>
              <p className="text-white/60 mb-8 text-center max-w-md">Get daily picks across 7 sports in the app. No sign-up, no paywall.</p>
              
              <div className="flex justify-center">
                {loading ? (
                  <div className="animate-pulse p-8 rounded bg-black/30 backdrop-blur-sm">
                    <p className="text-white/70">Loading today's pick...</p>
                  </div>
                ) : featuredPicks.length > 0 ? (
                  <div className="transform hover:scale-[1.02] transition-all duration-300">
                    {renderPickCard(featuredPicks[0])}
                  </div>
                ) : (
                  <div className="p-12 rounded-2xl bg-black/30 backdrop-blur-sm border border-[#B8953F]/20 text-center">
                    <p className="text-white/70 mb-4">New picks drop daily in the app!</p>
                    <a 
                      href="https://apps.apple.com/us/app/gary-ai/id6751238914"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-[#B8953F] font-semibold hover:underline"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                      </svg>
                      Download Gary AI
                    </a>
                  </div>
                )}
              </div>
              
              {/* App download CTA below pick card */}
              {featuredPicks.length > 0 && (
                <div className="mt-8 text-center">
                  <p className="text-white/50 text-sm mb-3">Want all picks + player props?</p>
                  <a 
                    href="https://apps.apple.com/us/app/gary-ai/id6751238914"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-[#B8953F] font-semibold hover:underline"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                    Get the Free App →
                  </a>
                </div>
              )}
            </div>

            {/* The Bears Brain Section - Dark theme matching homepage */}
            <div className="-mt-4 mb-36 w-full">
              <section className="relative py-16 max-w-[1400px] mx-auto">

                {/* How It Works pill */}
                <div className="flex justify-center mb-6 relative z-20">
                  <div className="inline-block bg-[#171717] py-1.5 px-4 rounded-full">
                    <span className="text-[#B8953F] font-medium text-sm flex items-center">
                      <span className="mr-2 w-3 h-3 bg-[#B8953F] rounded-sm inline-block"></span>
                      How It Works
                    </span>
                  </div>
                </div>

                {/* Section heading */}
                <div className="text-center mb-14 px-6 relative z-20">
                  <h2 className="text-white text-5xl font-bold leading-tight mb-6">
                    The <span className="text-[#B8953F]">Bears Brain</span>
                  </h2>
                  <p className="text-white/70 text-lg max-w-2xl mx-auto">
                    Gary runs a 3-stage agentic pipeline on every single pick. No gut feelings. No trends without causality. Just structured reasoning.
                  </p>
                </div>

                {/* Cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 mb-6 relative z-20">
                  
                  {/* Card 1: 3-Stage Pipeline */}
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      3-Stage Agentic Pipeline
                    </h3>
                    <p className="text-white/70 mb-6">
                      Every pick goes through three autonomous stages: form a hypothesis, investigate with real data, then validate before locking in. Only picks that survive all three stages make it to your screen.
                    </p>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#B8953F] flex items-center justify-center text-black font-bold text-sm">1</div>
                        <div className="bg-[#2a2a2a] rounded-full py-2 px-4 border border-[#B8953F]/30 flex-1">
                          <span className="text-[#B8953F] text-sm font-medium">Hypothesis</span>
                          <span className="text-white/50 text-xs ml-2">— Form a sharp thesis on the game</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#B8953F] flex items-center justify-center text-black font-bold text-sm">2</div>
                        <div className="bg-[#2a2a2a] rounded-full py-2 px-4 border border-[#B8953F]/30 flex-1">
                          <span className="text-[#B8953F] text-sm font-medium">Investigation</span>
                          <span className="text-white/50 text-xs ml-2">— Pull 30+ metrics, test the theory</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#B8953F] flex items-center justify-center text-black font-bold text-sm">3</div>
                        <div className="bg-[#2a2a2a] rounded-full py-2 px-4 border border-[#B8953F]/30 flex-1">
                          <span className="text-[#B8953F] text-sm font-medium">The Judge</span>
                          <span className="text-white/50 text-xs ml-2">— Lock only when numbers converge</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Card 2: Sport-Specific Constitutions */}
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      Sport-Specific Constitutions
                    </h3>
                    <p className="text-white/70 mb-6">
                      Sharp betting heuristics tailored to each sport. Gary doesn't use one-size-fits-all logic—he thinks like a specialist for every league.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="bg-[#2a2a2a] rounded-lg py-2 px-3 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-xs font-medium">NFL</span>
                        <span className="text-white/50 text-xs block">EPA, Success Rate, Weather</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-lg py-2 px-3 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-xs font-medium">NBA</span>
                        <span className="text-white/50 text-xs block">Pace, Efficiency, Rest</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-lg py-2 px-3 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-xs font-medium">NCAAF</span>
                        <span className="text-white/50 text-xs block">SP+, Havoc, Talent Composite</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-lg py-2 px-3 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-xs font-medium">NCAAB</span>
                        <span className="text-white/50 text-xs block">KenPom, NET, Quad Records</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-lg py-2 px-3 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-xs font-medium">NHL</span>
                        <span className="text-white/50 text-xs block">Corsi, xGoals, Goalie Stats</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-lg py-2 px-3 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-xs font-medium">MLB</span>
                        <span className="text-white/50 text-xs block">Statcast, Bullpen, Park Factors</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Second row of cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 relative z-20">
                  {/* Card 3: Scout Report Builder */}
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      Scout Report Builder
                    </h3>
                    <p className="text-white/70 mb-6">
                      Before the pipeline even starts, Gary builds a comprehensive scout report with real-time intel that sharp bettors pay for.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex items-center gap-1.5">
                        <Syringe size={12} className="text-[#B8953F]" />
                        <span className="text-[#B8953F] text-xs">Injuries by Name</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex items-center gap-1.5">
                        <Cloud size={12} className="text-[#B8953F]" />
                        <span className="text-[#B8953F] text-xs">Weather Conditions</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex items-center gap-1.5">
                        <Plane size={12} className="text-[#B8953F]" />
                        <span className="text-[#B8953F] text-xs">Travel & Rest</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex items-center gap-1.5">
                        <Building2 size={12} className="text-[#B8953F]" />
                        <span className="text-[#B8953F] text-xs">Venue Factors</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex items-center gap-1.5">
                        <Newspaper size={12} className="text-[#B8953F]" />
                        <span className="text-[#B8953F] text-xs">Breaking News</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex items-center gap-1.5">
                        <Activity size={12} className="text-[#B8953F]" />
                        <span className="text-[#B8953F] text-xs">Bullpen Usage</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex items-center gap-1.5">
                        <LineChart size={12} className="text-[#B8953F]" />
                        <span className="text-[#B8953F] text-xs">Live Odds</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex items-center gap-1.5">
                        <Users size={12} className="text-[#B8953F]" />
                        <span className="text-[#B8953F] text-xs">Lineup Changes</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Card 4: Fan Brain */}
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      Fan Brain
                    </h3>
                    <p className="text-white/70 mb-6">
                      The qualitative factors that pure stat models miss. Gary reads the room like an old-school sharp who's seen every angle.
                    </p>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#B8953F]/20 flex items-center justify-center">
                          <Flame size={16} className="text-[#B8953F]" />
                        </div>
                        <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex-1">
                          <span className="text-[#B8953F] text-sm">Revenge Games</span>
                          <span className="text-white/40 text-xs ml-2">— Emotional edge from last loss</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#B8953F]/20 flex items-center justify-center">
                          <AlertTriangle size={16} className="text-[#B8953F]" />
                        </div>
                        <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex-1">
                          <span className="text-[#B8953F] text-sm">Trap Alerts</span>
                          <span className="text-white/40 text-xs ml-2">— Suspicious line movement</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#B8953F]/20 flex items-center justify-center">
                          <TrendingDown size={16} className="text-[#B8953F]" />
                        </div>
                        <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex-1">
                          <span className="text-[#B8953F] text-sm">Letdown Spots</span>
                          <span className="text-white/40 text-xs ml-2">— Flat after emotional win</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#B8953F]/20 flex items-center justify-center">
                          <Eye size={16} className="text-[#B8953F]" />
                        </div>
                        <div className="bg-[#2a2a2a] rounded-full py-1.5 px-3 border border-[#B8953F]/30 flex-1">
                          <span className="text-[#B8953F] text-sm">Lookahead Spots</span>
                          <span className="text-white/40 text-xs ml-2">— Big game next week trap</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Fifth card - Convergence */}
                <div className="px-6 mt-8 relative z-20">
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      Convergence Scoring
                    </h3>
                    <p className="text-white/70 mb-6">
                      Gary's secret weapon. Measures alignment between statistical models, market odds, and qualitative analysis. When all signals converge, you get Gary's highest-conviction plays.
                    </p>
                    <div className="flex items-center justify-center gap-8 mt-6">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-white/30">0.50</div>
                        <div className="text-xs text-white/40 mt-1">Mixed Signals</div>
                      </div>
                      <div className="flex-1 h-3 bg-gradient-to-r from-white/20 via-[#B8953F]/50 to-[#B8953F] rounded-full max-w-xs"></div>
                      <div className="text-center">
                        <div className="text-4xl font-bold text-[#B8953F]">1.00</div>
                        <div className="text-xs text-[#B8953F] mt-1">Full Convergence</div>
                      </div>
                    </div>
                    <p className="text-center text-white/50 text-sm mt-4">Higher convergence = higher confidence = stronger picks</p>
                  </div>
                </div>
              </section>
            </div>
          </main>
          
          {/* Terms and Privacy links */}
          <footer className="py-8 text-center text-gray-500 text-sm">
            <div className="flex justify-center space-x-6">
              <a href="/terms" className="hover:text-gray-300 transition-colors duration-200">Terms of Service</a>
              <a href="/privacy" className="hover:text-gray-300 transition-colors duration-200">Privacy Policy</a>
            </div>
            <div className="mt-2">© {new Date().getFullYear()} GARY.AI. All rights reserved.</div>
            
            {/* Gambling Disclaimer */}
            <div className="mt-6 max-w-4xl mx-auto px-4 border-t border-gray-700 pt-6 text-xs">
              <p className="mb-2">
                DISCLAIMER: This site is 100% for entertainment purposes only and does not involve real money betting or prizes. You must be 18+ years old to utilize Gary.ai.
              </p>
              <p className="mb-2">
                If you or someone you know may have a gambling problem, Gary.ai For crisis counseling and referral services, call 1-800 GAMBLER (1-800-426-2537). For more information and resources, visit our Responsible Gaming page.
              </p>
              <p>
                Gambling problem? Call 1-800-GAMBLER (Available in the US)
                Call 877-8-HOPENY or text HOPENY (467369) (NY)
                Call 1-800-327-5050 (MA), 1-800-NEXT-STEP (AZ), 1-800-BETS-OFF (IA), 1-800-981-0023 (PR)
              </p>
            </div>
          </footer>
          </div>
          </div>
        </section>
      </div>
      

    </div>
  );
}

export default Home;
