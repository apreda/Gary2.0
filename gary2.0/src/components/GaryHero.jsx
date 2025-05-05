import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import GaryEmblem from '../assets/images/Garyemblem.png';
import { supabase } from '../supabaseClient';

export function GaryHero() {
  const [featuredPick, setFeaturedPick] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load a featured pick from the database
  useEffect(() => {
    const fetchFeaturedPick = async () => {
      try {
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        
        // Query Supabase for today's picks
        const { data, error } = await supabase
          .from('daily_picks')
          .select('picks, date')
          .eq('date', today)
          .maybeSingle();
          
        if (error) {
          console.error('Error fetching featured pick:', error);
          return;
        }
        
        // If we have picks for today, use the first one with high confidence
        if (data && data.picks) {
          const picksArray = typeof data.picks === 'string' ? JSON.parse(data.picks) : data.picks;
          
          // Find a good featured pick - ideally one with high confidence
          const bestPick = picksArray.find(pick => 
            pick.confidence && parseFloat(pick.confidence) >= 0.7
          ) || picksArray[0]; // Fallback to first pick if no high confidence pick
          
          if (bestPick) {
            console.log('Featured pick found:', bestPick);
            setFeaturedPick(bestPick);
          }
        }
      } catch (err) {
        console.error('Error in fetchFeaturedPick:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchFeaturedPick();
  }, []);

  return (
    <div className="relative flex flex-col min-h-screen w-full overflow-visible dimension-bg-section">
      {/* Gary logo positioned just under the navbar */}
      <div className="absolute top-20 left-6 z-10 mix-blend-overlay">
        <img src="/gary_logo.svg" alt="Gary AI Logo" className="w-56 opacity-60" />
      </div>
      
      <main className="max-w-[1440px] mx-auto px-6 md:px-8 py-24 flex flex-col flex-grow z-10 relative overflow-hidden">
        <div className="w-full mx-auto">
          <div className="flex flex-col lg:flex-row gap-8 items-center">
            {/* Left side - Headlines and Buttons */}
            <div className="lg:flex-1 p-5 z-10">
              <div className="overflow-hidden">
                {/* Modern AI-Focused Hero Headlines */}
                <div className="relative z-40 mt-4" style={{ height: 'auto' }}>
                  <div className="bg-gradient-to-r from-[#1a1a1a]/90 to-[#252525]/90 p-8 rounded-xl border-l-4 border-[#b8953f] shadow-xl relative overflow-hidden backdrop-blur-sm" style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5), 0 0 20px rgba(212, 175, 55, 0.1)' }}>
                    <div className="flex items-center mb-6 relative z-10">
                      <div className="w-3 h-3 rounded-full bg-[#b8953f] animate-pulse mr-3"></div>
                      <span className="text-[#b8953f] text-sm font-medium tracking-widest uppercase">AI-Powered Analytics</span>
                    </div>
                    
                    <h1 className="relative z-10 mb-6" style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', lineHeight: '1.4' }}>
                      <span className="text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)] font-bold" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>Smarter </span> 
                      <span className="bg-clip-text text-transparent bg-gradient-to-br from-[#d4af37] via-[#b8953f] to-[#e9c96a] font-extrabold" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))', WebkitBackgroundClip: 'text' }}>Sports Bets</span>
                    </h1>
                    
                    <div className="relative mb-10 z-10 overflow-hidden">
                      <h2 className="text-4xl md:text-5xl font-bold text-white" style={{ lineHeight: '1.4', textShadow: '0 4px 12px rgba(0,0,0,0.3)', letterSpacing: '0.02em' }}>
                        Powered by Gary AI
                      </h2>
                      <div className="absolute -bottom-1 left-0 w-1/2 h-px bg-gradient-to-r from-transparent via-[#b8953f]/60 to-transparent"></div>
                    </div>
                    
                    <ul className="space-y-6 mb-12 relative z-10" style={{ lineHeight: '1.6' }}>
                      <li className="flex items-start group transition-all duration-300 hover:translate-x-1">
                        <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-[#b8953f]/30 to-[#d4af37]/20 rounded-full flex items-center justify-center mt-1 mr-3 backdrop-blur-sm border border-[#b8953f]/10">
                          <span className="text-[#d4af37] text-sm">✓</span>
                        </span>
                        <span className="text-white/90 text-lg md:text-xl font-light" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>15+ years of sports data analysis</span>
                      </li>
                      <li className="flex items-start group transition-all duration-300 hover:translate-x-1">
                        <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-[#b8953f]/30 to-[#d4af37]/20 rounded-full flex items-center justify-center mt-1 mr-3 backdrop-blur-sm border border-[#b8953f]/10">
                          <span className="text-[#d4af37] text-sm">✓</span>
                        </span>
                        <span className="text-white/90 text-lg md:text-xl font-light" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>Daily picks with 78%+ confidence</span>
                      </li>
                      <li className="flex items-start group transition-all duration-300 hover:translate-x-1">
                        <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-[#b8953f]/30 to-[#d4af37]/20 rounded-full flex items-center justify-center mt-1 mr-3 backdrop-blur-sm border border-[#b8953f]/10">
                          <span className="text-[#d4af37] text-sm">✓</span>
                        </span>
                        <span className="text-white/90 text-lg md:text-xl font-light" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>Detailed analysis & reasoning</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              
              {/* CTA Buttons - Redesigned to match modern AI style */}
              <div className="flex flex-col sm:flex-row gap-6 mb-12 mt-10">
                {/* Primary button - gold gradient */}
                <div className="flex">
                  <Link 
                    to="/real-gary-picks" 
                    className="group flex items-center justify-center bg-gradient-to-r from-[#b8953f] to-[#d4af37] text-black font-bold rounded-xl hover:shadow-lg hover:shadow-[#b8953f]/30 hover:scale-105 transition-all duration-300 text-lg w-[300px] h-[64px] min-w-[300px] relative overflow-hidden" style={{ padding: '1rem 2rem' }}
                  >
                    <span className="absolute inset-0 bg-white/10 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300"></span>
                    <span className="relative flex items-center">
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Get Today's Picks
                    </span>
                  </Link>
                </div>
                
                {/* Secondary button - dark with gold accent */}
                <div className="flex">
                  <Link 
                    to="/how-it-works" 
                    className="group flex items-center justify-center bg-black/60 backdrop-blur-sm border border-[#b8953f]/30 text-white font-semibold rounded-xl hover:border-[#b8953f] hover:bg-black/80 hover:scale-105 transition-all duration-300 text-lg w-[300px] h-[64px] min-w-[300px]" style={{ padding: '1rem 2rem' }}
                  >
                    <span className="flex items-center">
                      How it Works
                      <svg className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform duration-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 18L15 12L9 6" stroke="#b8953f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Right side - Featured Pick Cards (front and back) */}
            <div className="lg:flex-1 flex justify-center items-center mt-0 lg:mt-0">
              {loading ? (
                <div className="w-[480px] h-[320px] rounded-xl bg-black/50 flex items-center justify-center border border-[#b8953f]/30">
                  <div className="w-8 h-8 border-4 border-[#b8953f]/20 border-t-[#b8953f] rounded-full animate-spin"></div>
                </div>
              ) : featuredPick ? (
                <div className="w-[576px] h-[530px] relative" style={{ transform: 'scale(0.9)', transformOrigin: 'center center' }}>
                  
                  {/* FRONT CARD - positioned at the top */}
                  <div style={{
                    position: 'absolute',
                    top: '-148px', /* Moved down by half an inch */
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '576px',
                    height: '384px',
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 15px 35px rgba(0, 0, 0, 0.5)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    color: '#ffffff',
                    zIndex: 2
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
                      {/* League and Matchup in horizontal layout */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        {/* League */}
                        <div>
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
                            {featuredPick.league || 'NBA'}
                          </div>
                        </div>
                        
                        {/* Matchup */}
                        <div style={{ marginLeft: '20px' }}>
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
                            {(featuredPick.homeTeam && featuredPick.awayTeam) ? 
                              `${featuredPick.awayTeam.split(' ').pop()} @ ${featuredPick.homeTeam.split(' ').pop()}` : 
                              (featuredPick.game ? 
                                featuredPick.game.includes('@') ? 
                                  featuredPick.game : 
                                  `${featuredPick.game.split(' ').slice(-1)} @ ${featuredPick.game.split(' ').slice(0, -2).join(' ')}` 
                                : 'Nuggets @ Thunder')}
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
                          fontSize: '1.75rem', 
                          fontWeight: 700, 
                          lineHeight: 1.1,
                          color: '#b8953f',
                          wordBreak: 'break-word',
                          marginBottom: '0.5rem'
                        }}>
                          {featuredPick.pick || 'Denver Nuggets +9.5 -110'}
                        </div>
                        
                        {/* Preview of the rationale */}
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#fff',
                          opacity: 0.8,
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {featuredPick.rationale ? 
                            featuredPick.rationale.substring(0, 120) + '...' : 
                            'Thunder are the better squad, but a 9.5-point line is disrespectful to a battle-tested Nuggets team even on the road. Re...'}
                        </div>
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
                          <Link 
                            to="/real-gary-picks"
                            style={{
                              background: 'rgba(184, 149, 63, 0.15)',
                              color: '#b8953f',
                              fontWeight: '600',
                              padding: '0.5rem 1rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(184, 149, 63, 0.3)',
                              cursor: 'pointer',
                              flex: 1,
                              fontSize: '0.8rem',
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              transition: 'all 0.2s ease',
                              textAlign: 'center',
                              textDecoration: 'none'
                            }}
                          >
                            Bet
                          </Link>
                          <Link 
                            to="/real-gary-picks"
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'rgba(255, 255, 255, 0.8)',
                              fontWeight: '600',
                              padding: '0.5rem 1rem',
                              borderRadius: '8px',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              cursor: 'pointer',
                              flex: 1,
                              fontSize: '0.8rem',
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              transition: 'all 0.2s ease',
                              textAlign: 'center',
                              textDecoration: 'none'
                            }}
                          >
                            Fade
                          </Link>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right side content */}
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '30%',
                      borderLeft: '2.25px solid #b8953f',
                      padding: '1.5rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'linear-gradient(135deg, rgba(55, 55, 58, 1) 0%, rgba(40, 40, 42, 0.95) 100%)',
                      boxShadow: '-10px 0 15px rgba(0, 0, 0, 0.4)',
                      borderRadius: '0 16px 16px 0',
                      clipPath: 'inset(0px 0px 0px -20px)',
                      zIndex: 2
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
                          {featuredPick.time || '9:30 PM ET'}
                        </div>
                      </div>
                      
                      {/* Coin Image centered */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        marginTop: 'auto',
                        marginBottom: 'auto',
                        background: 'transparent'
                      }}>
                        <img 
                          src="/coin2.png"
                          alt="Gary Coin"
                          style={{
                            width: 130,
                            height: 130,
                            objectFit: 'contain',
                            opacity: 1,
                            background: 'transparent'
                          }}
                        />
                      </div>
                      
                      {/* Confidence score */}
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
                          color: '#b8953f',
                          marginBottom: '0.5rem'
                        }}>
                          {typeof featuredPick.confidence === 'number' ? 
                            Math.round(featuredPick.confidence * 100) + '%' : 
                            (featuredPick.confidence || '78%')}
                        </div>
                        
                        {/* View analysis button */}
                        <Link 
                          to="/real-gary-picks"
                          style={{
                            marginTop: '1rem',
                            fontSize: '0.75rem',
                            padding: '0.5rem 1rem',
                            background: 'rgba(184, 149, 63, 0.15)',
                            color: '#b8953f',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            fontWeight: 500,
                            transition: 'all 0.2s ease',
                            display: 'inline-block',
                            textDecoration: 'none'
                          }}
                        >
                          View Analysis
                        </Link>
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
                  
                  {/* BACK CARD - analysis card positioned below with proper separation */}
                  <div style={{
                    position: 'absolute',
                    top: '284px', /* Maintained the 48px spacing while moving down */
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '576px',
                    height: '384px',
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                    borderRadius: '16px',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    overflow: 'hidden',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                    padding: '1.5rem',
                    color: '#ffffff',
                    zIndex: 1
                  }}>
                    {/* Card Header - Pick Banner */}
                    <div style={{ position: 'relative', width: '100%', marginBottom: '1.5rem' }}>
                      <div style={{ 
                        backgroundColor: 'rgba(184, 149, 63, 0.15)',
                        color: '#b8953f',
                        fontWeight: 'bold',
                        fontSize: '1.25rem',
                        padding: '0.8rem 1rem',
                        textAlign: 'center',
                        letterSpacing: '0.05rem',
                        textTransform: 'uppercase',
                        borderRadius: '8px',
                      }}>
                        {featuredPick.pick || 'DENVER NUGGETS +9.5 -110'}
                      </div>
                    </div>
                    
                    {/* Rationale Section */}
                    <div style={{ 
                      flex: '1', 
                      display: 'flex', 
                      flexDirection: 'column',
                      height: 'calc(100% - 80px)',
                    }}>
                      {/* Main Analysis */}
                      <div style={{ 
                        backgroundColor: 'rgba(0, 0, 0, 0.2)', 
                        padding: '1.75rem', 
                        borderRadius: '0.75rem',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: '1.1rem',
                        lineHeight: '1.7',
                        color: '#fff',
                        width: '100%',
                        height: '100%',
                        overflowY: 'auto',
                      }}>
                        {/* Rationale Heading */}
                        <div style={{ 
                          fontSize: '0.8rem', 
                          opacity: 0.6, 
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em', 
                          marginBottom: '0.75rem'
                        }}>
                          Rationale
                        </div>
                        
                        {/* Display the rationale */}
                        <p style={{ margin: 0, fontWeight: 400, opacity: 0.9 }}>
                          {featuredPick.rationale || 'Thunder are the better squad, but a 9.5-point line is disrespectful to a battle-tested Nuggets team even on the road. Recent matchups between these teams have been close, and Denver\'s defense has been improving. While OKC has home court advantage, the Nuggets\' championship experience will keep this game competitive. The large spread provides value for Denver backers, even if they don\'t win outright.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-[480px] h-[320px] rounded-xl bg-black/50 flex items-center justify-center border border-[#b8953f]/30 p-6 text-center">
                  <p className="text-[#b8953f]">Featured pick not available. Visit Gary's Picks to see today's recommendations.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* The Bears Brain Section Peek */}
      <div className="relative z-5 w-full dimension-bg-section h-24 mt-auto">
        <div className="absolute -top-16 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-[#0e0e0e]"></div>
        <div className="container mx-auto px-8 py-6 flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-[#b8953f] mr-2 animate-pulse"></div>
            <span className="text-[#b8953f] font-semibold">THE BEARS BRAIN</span>
          </div>
          <div className="text-white/60 text-sm">AI-powered insights analyzing 15+ years of sports data</div>
        </div>
      </div>
    </div>
  );
}

export default GaryHero;
