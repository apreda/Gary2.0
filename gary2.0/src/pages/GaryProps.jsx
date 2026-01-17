/* eslint-disable import/no-unresolved */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BG2 from '/BG2.png'; // Background image for page
import { useToast } from '../components/ui/ToastProvider';
// Use coin2.png from public folder
import coinImage from '/coin2.png';
import { propPicksService } from '../services/propPicksService';
// Supabase imported for future use
/* eslint-disable-next-line no-unused-vars */
import { supabase } from '../supabaseClient';

export default function GaryProps() {
  const showToast = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  // State for prop picks and UI state
  const [allPicks, setAllPicks] = useState([]); // All picks from database
  const [picks, setPicks] = useState([]); // Filtered picks for display
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flippedCards, setFlippedCards] = useState({});
  const [selectedSport, setSelectedSport] = useState('NBA'); // Default to NBA

  useEffect(() => {
    loadPicks();
  }, [reloadKey]);

  // Helper to parse time string to comparable value for sorting
  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr || timeStr === 'TBD') return Infinity; // TBD goes to end
    
    // Try to parse formats like "Sun Dec 15, 1:00 PM" or "1:00 PM"
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const isPM = timeMatch[3].toUpperCase() === 'PM';
      
      if (isPM && hours !== 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
      
      return hours * 60 + minutes;
    }
    return Infinity;
  };

  // Re-filter picks when sport selection changes
  useEffect(() => {
    if (allPicks.length > 0) {
      let filteredPicks;
      
      if (selectedSport === 'NFL TDs') {
        // Special filter for NFL TD scorer picks only
        // Sort by category first (standard → underdog → first_td), then by time
        const categoryOrder = { 'standard': 0, 'underdog': 1, 'first_td': 2 };
        filteredPicks = allPicks
          .filter(p => p.td_category !== undefined)
          .sort((a, b) => {
            const orderA = categoryOrder[a.td_category] ?? 3;
            const orderB = categoryOrder[b.td_category] ?? 3;
            if (orderA !== orderB) {
              return orderA - orderB;
            }
            return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
          });
      } else if (selectedSport === 'NFL') {
        // NFL props - exclude TD picks, sort by time
        filteredPicks = allPicks
          .filter(p => {
            const sport = (p.sport || p.league || 'NBA').toUpperCase();
            if (p.td_category) return false; // Exclude TD picks
            return sport === 'NFL';
          })
          .sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
      } else {
        // Other sports - sort by time
        filteredPicks = allPicks
          .filter(p => {
            const sport = (p.sport || p.league || 'NBA').toUpperCase();
            return sport === selectedSport;
          })
          .sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
      }
      
      setPicks(filteredPicks);
    }
  }, [selectedSport, allPicks]);

  const loadPicks = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get today's date in EST
      const now = new Date();
      const estOptions = { timeZone: 'America/New_York' };
      const estDateString = now.toLocaleDateString('en-US', estOptions);
      const [month, day, year] = estDateString.split('/');
      const today = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      console.log(`Looking for prop picks for date (EST): ${today}`);
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
                team: pick.team || 'Unknown',
                prop: pick.prop || 'unknown',
                line: pick.line || '',
                bet: pick.bet || 'over',
                odds: pick.odds || 'N/A',
                confidence: pick.confidence || 0.75,
                ev: pick.ev || null,
                rationale: pick.rationale || pick.reasoning || 'Analysis not available',
                sport: pick.sport || 'NBA', // Explicitly preserve sport field
                league: pick.sport || 'NBA', // Also set league from sport
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
        // Do not auto-generate on client for security/log hygiene; picks are generated server-side via /api/generate-prop-picks
        console.log('No prop picks found for today; awaiting server-side generation.');
      }

      // Store all picks, sorted by confidence
      const sortedPicks = processedPicks
        .sort((a, b) => (b.confidence !== a.confidence ? b.confidence - a.confidence : (b.ev || 0) - (a.ev || 0)));

      setAllPicks(sortedPicks);
      
      // Log sport distribution for debugging
      const sportCounts = sortedPicks.reduce((acc, p) => {
        const sport = (p.sport || 'unknown').toUpperCase();
        acc[sport] = (acc[sport] || 0) + 1;
        return acc;
      }, {});
      console.log('Prop picks by sport:', sportCounts);
      
      // Filter by selected sport and cap at 10
      const filteredPicks = sortedPicks
        .filter(p => (p.sport || p.league || 'NBA').toUpperCase() === selectedSport)
        .slice(0, 10);
      
      console.log(`Filtered to ${filteredPicks.length} ${selectedSport} picks`);
      setPicks(filteredPicks);
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
    
    // SPECIAL HANDLING FOR TD PROPS - Remove line numbers, show clean labels
    const propLower = propOnly.toLowerCase();
    if (propLower === 'anytime_td' || propLower === 'anytime td' || propLower === 'player_anytime_td') {
      return 'Anytime TD'; // No line number needed
    }
    if (propLower.includes('tds_over') || propLower.includes('2_plus') || propLower.includes('2+')) {
      return '2 Plus TDs'; // Clean label for 2+ TDs
    }
    if (propLower === 'first_td' || propLower === '1st_td' || propLower === 'player_1st_td') {
      return 'First TD';
    }
    
    // If it's already properly formatted (like "Anytime TD"), return as-is
    if (propOnly.includes('TD') || propOnly.includes('TDs')) {
      return propOnly;
    }
    
    // Handle snake_case conversion
    return propOnly
      .split('_')
      .map(word => {
        // Keep abbreviations uppercase (TD, TDs)
        if (word.toUpperCase() === 'TD' || word.toUpperCase() === 'TDS') {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
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
        
        {/* Sports Tabs - matching RealGaryPicks style */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-6">
          {['NBA', 'NHL', 'NFL', 'NFL TDs'].map(tab => {
            const isActive = selectedSport === tab;
            const isSpecial = tab === 'NFL TDs';
            return (
              <button
                key={tab}
                onClick={() => setSelectedSport(tab)}
                className="px-3 sm:px-4 py-2 rounded-md text-sm sm:text-base transition-all"
                style={{
                  background: isActive 
                    ? (isSpecial ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.08)') 
                    : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#ffffff' : 'rgba(255,255,255,0.8)',
                  border: isActive 
                    ? (isSpecial ? '1px solid #22c55e' : '1px solid #b8953f') 
                    : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {isSpecial ? '🏈 NFL TDs' : tab}
              </button>
            );
          })}
        </div>
        
        {/* NFL TDs Description Banner */}
        {selectedSport === 'NFL TDs' && (
          <div className="text-center mb-4 bg-[#1a1a1a] border border-[#22c55e]/30 rounded-lg p-4 max-w-3xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-lg">🏈</span>
              <span className="text-white font-bold">Gary's TD Scorer Picks</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="text-left">
                <span className="inline-block px-2 py-1 bg-blue-600/20 text-blue-400 font-semibold rounded text-xs mb-1">
                  ✅ Standard (5 picks)
                </span>
                <p className="text-gray-400 text-xs">Gary's highest-confidence TD scorers based on usage & matchups.</p>
              </div>
              <div className="text-left">
                <span className="inline-block px-2 py-1 bg-green-600/20 text-green-400 font-semibold rounded text-xs mb-1">
                  🎰 Longshots (5 picks)
                </span>
                <p className="text-gray-400 text-xs">Value plays at +200 or better. Higher risk, bigger payouts!</p>
              </div>
              <div className="text-left">
                <span className="inline-block px-2 py-1 bg-purple-600/20 text-purple-400 font-semibold rounded text-xs mb-1">
                  🥇 First TD (3 picks)
                </span>
                <p className="text-gray-400 text-xs">Players most likely to score the first TD of their game.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MAIN CONTENT AREA - Contains loading states and picks */}
      <div className="mx-auto px-4 pb-12 max-w-screen-xl relative z-10">
        {loading ? (
          <div className="flex justify-center items-center min-h-[50vh]"><div className="animate-pulse text-gray-200 text-xl">Loading prop picks...</div></div>
        ) : error ? (
          <div className="flex justify-center items-center min-h-[50vh]"><div className="text-red-500 text-xl">{error}</div></div>
        ) : picks.length === 0 ? (
              <div className="flex justify-center items-center min-h-[30vh]">
                <div className="text-center">
                  <div className="text-gray-300 text-xl mb-2">No {selectedSport} prop picks available.</div>
                  <p className="text-gray-500 text-sm">
                    {selectedSport === 'NFL TDs'
                      ? 'NFL TD scorer picks are generated for game days.'
                      : selectedSport === 'NFL' 
                        ? 'NFL props are generated for Thursday-Monday games.' 
                        : `Check back later for today's ${selectedSport} props.`}
                  </p>
                </div>
              </div>
            ) : (
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
                              {/* TD Category Badge (if applicable) */}
                              {pick.td_category && (
                                <div style={{ 
                                  position: 'absolute', 
                                  top: '8px', 
                                  right: '8px',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  background: pick.td_category === 'underdog' 
                                    ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' 
                                    : pick.td_category === 'first_td'
                                    ? 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)'
                                    : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                  color: '#fff',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                }}>
                                  {pick.td_category === 'underdog' ? '🎰 Longshot' : pick.td_category === 'first_td' ? '🥇 First TD' : '🏈 Standard'}
                                </div>
                              )}
                              
                              {/* Top Section - Header Info - Fixed Height */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', height: '40px' }}>
                                <div style={{ width: '30%' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>League</div><div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{pick.league || 'MLB'}</div></div>
                                <div style={{ width: '35%', position: 'relative' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team</div><div style={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.2 }}>{getTeamNickname(pick.team)}</div></div>
                                <div style={{ width: '30%' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</div><div style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pick.time || 'TBD'}</div></div>
                              </div>
                              
                              {/* Gary's Pick Section - Fixed Height */}
                              <div style={{ padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.75rem', minHeight: '80px' }}>
                                <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Gary's Pick</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.2, color: '#bfa142', wordWrap: 'break-word', wordBreak: 'break-word'}}>
                                  {pick.td_category ? (
                                    // TD scorer picks - show appropriate label (no line numbers for TDs)
                                    pick.td_category === 'first_td' 
                                      ? `${pick.player} First TD Scorer`
                                      : pick.td_category === 'underdog'
                                      ? `${pick.player} 2+ TDs`
                                      : `${pick.player} Anytime TD`
                                  ) : pick.player && pick.bet && pick.prop ? (
                                    // For non-TD props, include line number; for TD props it's already handled above
                                    `${pick.player} ${pick.bet.toUpperCase()} ${formatPropType(pick.prop)} ${pick.line || ''}`.trim()
                                  ) : (
                                    '(No pick available)'
                                  )}
                                </div>
                                {/* Show matchup for TD picks */}
                                {pick.td_category && pick.matchup && (
                                  <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '0.25rem' }}>
                                    {pick.matchup}
                                  </div>
                                )}
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
                                    <p style={{ fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600, margin: 0 }}>
                                      {pick.td_category ? 'Type' : 'Confidence'}
                                    </p>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>
                                      {pick.td_category 
                                        ? (pick.td_category === 'underdog' ? '🎰 Value' : pick.td_category === 'first_td' ? '🥇 1st TD' : '✅ Chalk')
                                        : (pick.confidence ? `${Math.round(pick.confidence * 100)}%` : 'N/A')}
                                    </p>
                                  </div>
                                  <div style={{ padding: '0.5rem', borderRadius: '6px', background: 'linear-gradient(145deg, rgba(33,30,22,0.95) 0%, rgba(25,23,17,0.9) 100%)', border: '1px solid rgba(191,161,66,0.5)' }}>
                                    <p style={{ fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600, margin: 0 }}>Odds</p>
                                    <p style={{ 
                                      fontSize: '0.85rem', 
                                      fontWeight: 700, 
                                      margin: 0,
                                      color: pick.td_category === 'underdog' ? '#22c55e' : pick.td_category === 'first_td' ? '#a855f7' : 'inherit'
                                    }}>
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
            )}
      </div>
    </div>
  );
}