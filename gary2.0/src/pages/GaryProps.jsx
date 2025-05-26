/* eslint-disable import/no-unresolved */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUserPlan } from '../contexts/UserPlanContext';
import BG2 from '/BG2.png'; // Background image for page
import { useToast } from '../components/ui/ToastProvider';
import { useAuth } from '../contexts/AuthContext';
// Use coin2.png from public folder
import coinImage from '/coin2.png';
import { propPicksService } from '../services/propPicksService';
// Supabase imported for future use
/* eslint-disable-next-line no-unused-vars */
import { supabase } from '../supabaseClient';

export default function GaryProps() {
  const showToast = useToast();
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const { userPlan, planLoading, subscriptionStatus } = useUserPlan();
  const navigate = useNavigate();

  // State for prop picks and UI state
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flippedCards, setFlippedCards] = useState({});

  useEffect(() => {
    if (user) console.log('GaryProps: User subscription status:', subscriptionStatus);
  }, [user, subscriptionStatus]);

  useEffect(() => {
    if (!planLoading) loadPicks();
  }, [planLoading, subscriptionStatus, reloadKey]);

  const loadPicks = async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      console.log(`Looking for prop picks for date ${today}`);
      const data = await propPicksService.getTodayPropPicks();
      let processedPicks = [];

      if (Array.isArray(data) && data.length > 0) {
        console.log(`Found ${data.length} existing prop pick records`);
        data.forEach(record => {
          if (Array.isArray(record.picks)) {
            const picksWithIds = record.picks.map((pick, idx) => {
              // All fields should already be in the pick object from the database
              // No need to parse anything
              
              let parsedPick = {
                ...pick, // Spread all fields from the database
                id: `${record.id}-${idx}`,
                date: record.date,
                created_at: record.created_at,
                // Use existing fields or provide defaults
                player: pick.player || 'Unknown Player',
                team: pick.team || 'MLB',
                prop: pick.prop || 'unknown',
                line: pick.line || '',
                bet: pick.bet || 'over',
                odds: pick.odds || 'N/A',
                confidence: pick.confidence || 0.75,
                ev: pick.ev || null,
                rationale: pick.rationale || pick.reasoning || 'Analysis not available',
                league: pick.sport || 'MLB',
                time: pick.time || 'TBD'
              };
              
              // Ensure odds formatting
              if (typeof parsedPick.odds === 'number') {
                parsedPick.odds = parsedPick.odds > 0 ? `+${parsedPick.odds}` : `${parsedPick.odds}`;
              }
              
              return parsedPick;
            });
            processedPicks.push(...picksWithIds);
          }
        });
      } else {
        showToast('Generating new prop picks... This may take a moment.', 'info');
        console.log('No prop picks found - generating new ones');
        
        try {
          // Import oddsService to get all games
          const { oddsService } = await import('../services/oddsService');
          
          // Get all MLB games for today
          const allGames = await oddsService.getUpcomingGames('baseball_mlb');
          console.log(`Found ${allGames.length} MLB games for today`);
          
          // Convert games to the format we need
          const mlbTeams = allGames.map(game => ({
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            gameTime: game.commence_time
          }));
          
          // Limit to first 8 games to avoid overwhelming the system
          const gamesToProcess = mlbTeams.slice(0, 8);
          console.log(`Processing ${gamesToProcess.length} games for prop picks`);
          
          let allPropPicks = [];
          
          // Generate prop picks for each game with individual error handling
          for (const game of gamesToProcess) {
            try {
              console.log(`Generating props for ${game.awayTeam} @ ${game.homeTeam}`);
              const gamePropPicks = await propPicksService.generatePropBets({
                sport: 'baseball_mlb',
                homeTeam: game.homeTeam,
                awayTeam: game.awayTeam,
                time: game.gameTime
              });
              
              if (Array.isArray(gamePropPicks) && gamePropPicks.length > 0) {
                console.log(`Generated ${gamePropPicks.length} prop picks for ${game.awayTeam} @ ${game.homeTeam}`);
                allPropPicks.push(...gamePropPicks);
              } else {
                console.log(`No prop picks generated for ${game.awayTeam} @ ${game.homeTeam}`);
              }
            } catch (gameError) {
              console.error(`Error generating props for ${game.awayTeam} @ ${game.homeTeam}:`, gameError.message);
              // Continue with other games even if one fails
              continue;
            }
          }
          
          if (allPropPicks.length > 0) {
            console.log(`Generated ${allPropPicks.length} total prop picks, storing in database`);
            
            // Sort all picks by confidence first, then by EV
            const sortedPicks = allPropPicks.sort((a, b) => {
              // Primary sort by confidence
              if (b.confidence !== a.confidence) {
                return b.confidence - a.confidence;
              }
              // Secondary sort by EV if confidence is equal
              return (b.ev || 0) - (a.ev || 0);
            });
            
            // Take top 20 picks across all games
            const topPicks = sortedPicks.slice(0, 20);
            console.log(`Selected top ${topPicks.length} picks from ${allPropPicks.length} total picks`);
            
            // Log team diversity
            const teamCounts = {};
            topPicks.forEach(pick => {
              teamCounts[pick.team] = (teamCounts[pick.team] || 0) + 1;
            });
            console.log('Team distribution in top picks:', teamCounts);
            
            // Store the generated picks in Supabase
            const { data: insertData, error: insertError } = await supabase
              .from('prop_picks')
              .insert({
                date: today,
                picks: topPicks
              });
            
            if (insertError) {
              console.error('Error storing prop picks:', insertError);
              throw insertError;
            }
            
            console.log('Successfully stored new prop picks in database');
            
            // Fetch the freshly stored picks
            const freshData = await propPicksService.getTodayPropPicks();
            freshData.forEach(record => {
              if (Array.isArray(record.picks)) {
                const picksWithIds = record.picks.map((pick, idx) => {
                  // All fields should already be in the pick object from the database
                  // No need to parse anything
                  
                  let parsedPick = {
                    ...pick, // Spread all fields from the database
                    id: `${record.id}-${idx}`,
                    date: record.date,
                    created_at: record.created_at,
                    // Use existing fields or provide defaults
                    player: pick.player || 'Unknown Player',
                    team: pick.team || 'MLB',
                    prop: pick.prop || 'unknown',
                    line: pick.line || '',
                    bet: pick.bet || 'over',
                    odds: pick.odds || 'N/A',
                    confidence: pick.confidence || 0.75,
                    ev: pick.ev || null,
                    rationale: pick.rationale || pick.reasoning || 'Analysis not available',
                    league: pick.sport || 'MLB',
                    time: pick.time || 'TBD'
                  };
                  
                  // Ensure odds formatting
                  if (typeof parsedPick.odds === 'number') {
                    parsedPick.odds = parsedPick.odds > 0 ? `+${parsedPick.odds}` : `${parsedPick.odds}`;
                  }
                  
                  return parsedPick;
                });
                processedPicks.push(...picksWithIds);
              }
            });
            
            showToast(`Generated ${processedPicks.length} new prop picks!`, 'success');
          } else {
            console.log('No prop picks could be generated');
            showToast('Unable to generate prop picks at this time. Please try again later.', 'warning');
          }
        } catch (generationError) {
          console.error('Error during prop pick generation:', generationError);
          showToast('Error generating prop picks. Please try again later.', 'error');
        }
      }

      setPicks(processedPicks);
    } catch (err) {
      console.error('Error in loadPicks:', err);
      setError('Unable to load prop picks. Please try refreshing the page.');
      showToast('Error loading prop picks. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = { 
    width: '100%', 
    maxWidth: '320px', 
    height: '500px', 
    margin: '0 auto 2rem', 
    position: 'relative' 
  };
  // Prop card flipping disabled as requested
  const toggleCardFlip = (id, e) => {
    e?.stopPropagation();
    // Flipping disabled for prop cards
    return;
  };
  
  // Format prop_type from snake_case to Title Case with spaces
  const formatPropType = (propType) => {
    if (!propType) return '';
    // Handle formats like "hits 0.5" or "strikeouts 5.5"
    // Extract just the prop type without the line value
    const propOnly = propType.replace(/\s+[\d.]+$/, '');
    
    // Handle snake_case conversion
    return propOnly
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  // Get team nickname (last word of team name)
  const getTeamNickname = (fullTeamName) => {
    if (!fullTeamName) return 'TBD';
    const words = fullTeamName.trim().split(' ');
    return words[words.length - 1];
  };

  return (
    <div className="min-h-screen relative pt-20 px-2 sm:px-4" style={{ overflowX: 'hidden' }}> {/* Added responsive padding and changed overflow */}
      {/* Background */}
      <div className="fixed inset-0 z-0" style={{ backgroundImage: `url(${BG2})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.3, filter: 'blur(1px)' }} />

      {/* PAGE HEADER with BETA Banner - always shown regardless of user status or loading state */}
      <div className="mx-auto px-4 pt-10 pb-4 max-w-screen-xl relative z-20">
        <div className="text-center mb-6 bg-[#1a1a1a] border border-[#b8953f]/30 rounded-lg p-4 max-w-xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="inline-block px-2 py-1 bg-[#b8953f] text-black font-bold rounded text-xs">
              BETA
            </span>
            <span className="text-white font-medium text-sm">
              This feature is in testing mode.
            </span>
          </div>
          <p className="text-sm text-gray-400">
            Player props picks are experimental and may not be as accurate as our regular picks.
          </p>
        </div>
        
        {/* Sport limitations notice - always shown */}
        <div className="text-center mb-6">
          <span className="inline-block px-4 py-2 border border-[#b8953f]/50 rounded-full text-[#b8953f] text-sm">
            Currently available for NBA & MLB only - NFL coming when season starts
          </span>
        </div>
      </div>

      {/* MAIN CONTENT AREA - Contains loading states and picks */}
      <div className="mx-auto px-4 pb-12 max-w-screen-xl relative z-10">
        {loading ? (
          <div className="flex justify-center items-center min-h-[50vh]"><div className="animate-pulse text-gray-200 text-xl">Loading prop picks...</div></div>
        ) : error ? (
          <div className="flex justify-center items-center min-h-[50vh]"><div className="text-red-500 text-xl">{error}</div></div>
        ) : (
          <>
            {!planLoading && subscriptionStatus !== 'active' ? (
              <div className="flex justify-center items-center min-h-[50vh]">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 max-w-2xl w-full mx-auto text-center" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)', background: 'linear-gradient(145deg, rgba(30,30,35,0.9) 0%, rgba(18,18,22,0.95) 100%)', borderTop: '3px solid #b8953f' }}>
                  <img src={coinImage} alt="Gary Coin" className="mx-auto mb-6" style={{ height: '80px', opacity: 0.9 }} />
                  <h2 className="text-2xl font-bold mb-2" style={{ color: '#b8953f' }}>Unlock Player Props Access</h2>
                  <p className="text-gray-300 mb-6 text-lg">Upgrade to Pro for exclusive player prop picks with higher odds and bigger potential payouts.</p>
                  <ul className="mb-8 text-left mx-auto inline-block">
                    <li className="flex items-center mb-3"><span className="text-b8953f mr-2">✓</span><span className="text-gray-200">High-value player props</span></li>
                    <li className="flex items-center mb-3"><span className="text-b8953f mr-2">✓</span><span className="text-gray-200">Detailed player season and recent Stat analysis and research</span></li>
                    <li className="flex items-center mb-3"><span className="text-b8953f mr-2">✓</span><span className="text-gray-200">Updated daily 10-20 Daily Player Props</span></li>
                  </ul>
                  <Link 
                    to={user ? "https://buy.stripe.com/dR603v2UndMebrq144" : "https://www.betwithgary.ai/signin"} 
                    className="inline-block py-3 px-8 rounded-md text-white font-medium" 
                    style={{ background: 'linear-gradient(90deg, #b8953f 0%, #d4af37 100%)', boxShadow: '0 4px 12px rgba(184,149,63,0.5)' }}
                  >
                    Upgrade to Pro
                  </Link>
                </div>
              </div>
            ) : picks.length === 0 ? (
              <div className="flex justify-center items-center min-h-[30vh]">
                <div className="text-gray-300 text-xl">No prop picks available for today.</div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-5 px-2 sm:px-4">
                {picks.map(pick => {
                  const flipped = !!flippedCards[pick.id];
                  return (
                    <div key={pick.id} className="pick-card-container" style={cardStyle}>
                      <div onClick={e => toggleCardFlip(pick.id, e)} style={{ perspective: '1000px', width: '100%', height: '100%' }}>
                        <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transition: 'transform 0.6s', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)' }}>
                          {/* Front */}
                          <div style={{ position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', background: 'linear-gradient(135deg, rgba(22,22,28,0.97) 0%, rgba(28,28,32,0.95) 100%)', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(191,161,66,0.25)', color: '#fff', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, rgba(191,161,66,0.5) 0%, rgba(212,175,55,0.95) 50%, rgba(191,161,66,0.5) 100%)' }} />
                            <div style={{ height: '100%', padding: '1.25rem 1.25rem', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                              {/* Top Section - Header Info - Fixed Height */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', height: '40px' }}>
                                <div style={{ width: '30%' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>League</div><div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{pick.league || 'MLB'}</div></div>
                                <div style={{ width: '35%', position: 'relative' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team</div><div style={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.2 }}>{getTeamNickname(pick.team)}</div></div>
                                <div style={{ width: '30%' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</div><div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{pick.time || 'TBD'}</div></div>
                              </div>
                              
                              {/* Gary's Pick Section - Fixed Height */}
                              <div style={{ padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.75rem', minHeight: '80px' }}>
                                <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Gary's Pick</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.2, color: '#bfa142', wordWrap: 'break-word', wordBreak: 'break-word'}}>
                                  {pick.player && pick.bet && pick.prop ? 
                                    `${pick.player} ${pick.bet.toUpperCase()} ${formatPropType(pick.prop)} ${pick.line || ''}`.trim() : 
                                    '(No pick available)'}
                                </div>
                              </div>
                              
                              {/* Middle Content - Analysis - Fixed Height */}
                              <div style={{ marginBottom: '0.75rem', height: '230px' }}>
                                <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', color: '#bfa142', fontWeight: 500 }}>Analysis</div>
                                <div style={{ fontSize: '0.85rem', lineHeight: 1.4, height: '200px', overflow: 'auto', opacity: 0.9, padding: '0.5rem', border: '1px solid rgba(191,161,66,0.15)', borderRadius: '4px' }}>
                                  {pick.rationale ? (
                                    pick.rationale.includes('•') || pick.rationale.includes('. ') ? (
                                      <ul style={{ listStyleType: 'none', margin: 0, padding: 0 }}>
                                        {pick.rationale
                                          // Split on bullet points or periods followed by space (not decimal points)
                                          .split(/[•]|\.\s+/)
                                          .filter(point => point.trim().length > 0)
                                          .map((point, idx) => {
                                            // Clean up the point and ensure it ends with a period
                                            let cleanPoint = point.trim();
                                            // Remove any leading period that might be left from splitting
                                            if (cleanPoint.startsWith('.')) {
                                              cleanPoint = cleanPoint.substring(1).trim();
                                            }
                                            // Add period if missing
                                            if (!cleanPoint.endsWith('.') && !cleanPoint.endsWith('!') && !cleanPoint.endsWith('?')) {
                                              cleanPoint += '.';
                                            }
                                            return (
                                              <li key={idx} style={{ display: 'flex', marginBottom: '8px', alignItems: 'flex-start' }}>
                                                <span style={{ color: '#bfa142', marginRight: '6px', fontWeight: 'bold', fontSize: '0.9rem' }}>•</span>
                                                <span>{cleanPoint}</span>
                                              </li>
                                            );
                                          })}
                                      </ul>
                                    ) : (
                                      <div style={{ padding: '0' }}>{pick.rationale}</div>
                                    )
                                  ) : 'Analysis not available at this time.'}
                                </div>
                              </div>
                              
                              {/* Bottom Section - Pick Details - Fixed Position */}
                              <div style={{ marginTop: 'auto' }}>
                                <div style={{ fontSize: '0.84rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Pick Details</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                  <div style={{ padding: '0.5rem', borderRadius: '6px', background: 'linear-gradient(145deg, rgba(33,30,22,0.95) 0%, rgba(25,23,17,0.9) 100%)', border: '1px solid rgba(191,161,66,0.5)' }}>
                                    <p style={{ fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600, margin: 0 }}>EV</p>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>{pick.ev ? `+${Math.round(pick.ev)}%` : 'N/A'}</p>
                                  </div>
                                  <div style={{ padding: '0.5rem', borderRadius: '6px', background: 'linear-gradient(145deg, rgba(33,30,22,0.95) 0%, rgba(25,23,17,0.9) 100%)', border: '1px solid rgba(191,161,66,0.5)' }}>
                                    <p style={{ fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600, margin: 0 }}>Odds</p>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>
                                      {pick.odds ? (
                                        typeof pick.odds === 'number' ?
                                          (pick.odds > 0 ? `+${pick.odds}` : pick.odds) :
                                          (parseInt(pick.odds) > 0 && !pick.odds.startsWith('+') ? `+${pick.odds}` : pick.odds)
                                      ) : 'N/A'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* Back of card removed as requested */}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}