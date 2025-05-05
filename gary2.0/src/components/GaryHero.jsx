import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import '../styles/hero.css';
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
    <section className="hero relative flex flex-col min-h-screen w-full overflow-hidden dimension-bg-section">
      {/* Hero watermark background - Gary Money image */}
      <div className="hero__watermark absolute top-1/2 left-1/2 w-[120%] h-[120%] transform -translate-x-1/2 -translate-y-1/2 scale-110 pointer-events-none z-10">
        <img 
          src="/garymoney.png" 
          alt="" 
          className="w-full h-full object-contain opacity-10 mix-blend-overlay" 
          style={{ filter: 'saturate(0.8) contrast(1.1)' }}
        />
      </div>
      
      <main className="max-w-[1440px] mx-auto px-6 md:px-8 py-24 flex flex-col flex-grow z-20 relative">
        {/* Centered Hero Content - Inspired by mymind and Tailscale layouts */}
        <div className="w-full mx-auto flex flex-col items-center mb-20">
          {/* AI Analytics Badge */}
          <div className="flex items-center mb-6 relative justify-center">
            <div className="w-3 h-3 rounded-full bg-[#b8953f] animate-pulse mr-3"></div>
            <span className="text-[#b8953f] text-sm font-medium tracking-widest uppercase">AI-Powered Analytics</span>
          </div>

          {/* Main headline - Large, centered, prominent */}
          <h1 className="mb-6 text-center max-w-5xl" style={{ fontSize: 'clamp(3rem, 8vw, 4.5rem)', lineHeight: '1.1', letterSpacing: '-0.02em' }}>
            <span className="text-white font-bold" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>Smarter </span> 
            <span className="bg-clip-text text-transparent bg-gradient-to-br from-[#d4af37] via-[#b8953f] to-[#e9c96a] font-extrabold" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.2)', WebkitBackgroundClip: 'text' }}>Sports Bets</span>
          </h1>
          
          {/* Subheading - Clean, modern formatting */}
          <div className="text-center mb-10 max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3" style={{ lineHeight: '1.3', textShadow: '0 4px 12px rgba(0,0,0,0.4)', letterSpacing: '0.01em' }}>
              Powered by Gary AI
            </h2>
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto">
              Make smart, data-driven sports betting decisions with AI-powered analytics
            </p>
          </div>

          {/* CTA Buttons - Horizontally centered */}
          <div className="hero-cta flex flex-col sm:flex-row gap-5 mt-4 justify-center">
            <Link to="/real-gary-picks" className="hero-cta-primary px-8 py-3 text-lg">Get Today's Picks</Link>
            <Link to="/how-it-works" className="hero-cta-secondary px-8 py-3 text-lg">How it Works</Link>
          </div>
        </div>

        {/* Feature bullets - Horizontally arranged */}
        <div className="flex flex-wrap justify-center gap-8 mb-20 max-w-5xl mx-auto">
          <div className="flex items-start bg-[#1a1a1a]/40 backdrop-blur-sm p-4 rounded-xl border-l-2 border-[#b8953f]/40 shadow-lg w-64">
            <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#b8953f]/30 to-[#d4af37]/20 rounded-full flex items-center justify-center mt-1 mr-3 backdrop-blur-sm border border-[#b8953f]/10">
              <span className="text-[#d4af37] text-base">✓</span>
            </span>
            <span className="text-white/80 text-base" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>15+ years of sports data analysis</span>
          </div>
          
          <div className="flex items-start bg-[#1a1a1a]/40 backdrop-blur-sm p-4 rounded-xl border-l-2 border-[#b8953f]/40 shadow-lg w-64">
            <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#b8953f]/30 to-[#d4af37]/20 rounded-full flex items-center justify-center mt-1 mr-3 backdrop-blur-sm border border-[#b8953f]/10">
              <span className="text-[#d4af37] text-base">✓</span>
            </span>
            <span className="text-white/80 text-base" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>Daily picks with 78%+ confidence</span>
          </div>
          
          <div className="flex items-start bg-[#1a1a1a]/40 backdrop-blur-sm p-4 rounded-xl border-l-2 border-[#b8953f]/40 shadow-lg w-64">
            <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#b8953f]/30 to-[#d4af37]/20 rounded-full flex items-center justify-center mt-1 mr-3 backdrop-blur-sm border border-[#b8953f]/10">
              <span className="text-[#d4af37] text-base">✓</span>
            </span>
            <span className="text-white/80 text-base" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>Detailed analysis & reasoning</span>
          </div>
        </div>

        {/* Pick Cards Row - Horizontally arranged with clean modern styling*/}
        <div className="flex flex-col md:flex-row justify-center items-center gap-8 w-full max-w-6xl mx-auto">
          {/* Featured Pick Card */}
          <div className="flex-1 flex items-center justify-center">
            {!loading && featuredPick ? (
              <div className="w-[576px] h-[384px] relative">
                {/* Card container */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                }}>
                  {/* FRONT OF CARD - Modern Dark UI Design */}
                  <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
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
                            {featuredPick.league || 'MLB'}
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
                              (featuredPick.game ? featuredPick.game : 'TBD')}
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
                          fontSize: '2rem', 
                          fontWeight: 700, 
                          lineHeight: 1.1,
                          color: '#bfa142', /* Gold color for the actual pick */
                          wordBreak: 'break-word',
                          marginBottom: '0.75rem'
                        }}>
                          {featuredPick.pick || 'DENVER NUGGETS +9.5 -110'}
                        </div>
                        
                        {/* Add a preview of the rationale on front card */}
                        <div style={{
                          fontSize: '0.85rem',
                          opacity: 0.8,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          textOverflow: 'ellipsis',
                          marginBottom: '0.5rem'
                        }}>
                          {featuredPick.rationale ? featuredPick.rationale.substring(0, 120) + '...' : 'View analysis for details'}
                        </div>
                      </div>
                    </div>
                    
                    {/* Right side content with elevated appearance */}
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '30%',
                      borderLeft: '2.25px solid #bfa142', /* Gold border */
                      padding: '1.5rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'linear-gradient(135deg, rgba(55, 55, 58, 1) 0%, rgba(40, 40, 42, 0.95) 100%)',
                      boxShadow: '-10px 0 15px rgba(0, 0, 0, 0.4)',
                      borderRadius: '0 16px 16px 0',
                      clipPath: 'inset(0px 0px 0px -20px)',
                      zIndex: 2,
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
                          {featuredPick.time ? 
                            (function() {
                              let time = featuredPick.time.includes('ET') ? featuredPick.time : `${featuredPick.time} ET`;
                              return time.replace(/:([0-9])\s/, ':0$1 ');
                            })() : '10:10 PM ET'}
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
                          alt="Coin Image"
                          style={{
                            width: 130,
                            height: 130,
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
                          {typeof featuredPick.confidence === 'number' ? 
                            Math.round(featuredPick.confidence * 100) + '%' : 
                            (featuredPick.confidence || '78%')}
                        </div>
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
                </div>
              </div>
            ) : (
              <div className="w-[576px] h-[384px] rounded-xl bg-black/50 flex items-center justify-center border border-[#b8953f]/30 p-6 text-center">
                <p className="text-[#b8953f]">Featured pick not available. Visit Gary's Picks to see today's recommendations.</p>
              </div>
            )}
          </div>
          
          {/* Second Pick Card (Alternate) */}
          <div className="flex-1 flex items-center justify-center">
            {!loading && featuredPick ? (
              <div className="w-[576px] h-[384px] relative">
                {/* Card container */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                }}>
                  {/* FRONT OF CARD - Modern Dark UI Design */}
                  <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
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
                            NBA
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
                            Wizards @ Suns
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
                          fontSize: '2rem', 
                          fontWeight: 700, 
                          lineHeight: 1.1,
                          color: '#bfa142', /* Gold color for the actual pick */
                          wordBreak: 'break-word',
                          marginBottom: '0.75rem'
                        }}>
                          SUNS -3.5 -110
                        </div>
                        
                        {/* Add a preview of the rationale on front card */}
                        <div style={{
                          fontSize: '0.85rem',
                          opacity: 0.8,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          textOverflow: 'ellipsis',
                          marginBottom: '0.5rem'
                        }}>
                          Phoenix has been dominant at home recently, going 7-1 ATS in their last 8 home games. The matchup favors their backcourt...
                        </div>
                      </div>
                    </div>
                    
                    {/* Right side content with elevated appearance */}
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '30%',
                      borderLeft: '2.25px solid #bfa142', /* Gold border */
                      padding: '1.5rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'linear-gradient(135deg, rgba(55, 55, 58, 1) 0%, rgba(40, 40, 42, 0.95) 100%)',
                      boxShadow: '-10px 0 15px rgba(0, 0, 0, 0.4)',
                      borderRadius: '0 16px 16px 0',
                      clipPath: 'inset(0px 0px 0px -20px)',
                      zIndex: 2,
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
                          7:00 PM ET
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
                          alt="Coin Image"
                          style={{
                            width: 130,
                            height: 130,
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
                          72%
                        </div>
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
                </div>
              </div>
            ) : (
              <div className="w-[576px] h-[384px] rounded-xl bg-black/50 flex items-center justify-center border border-[#b8953f]/30 p-6 text-center">
                <p className="text-[#b8953f]">Featured pick not available. Visit Gary's Picks to see today's recommendations.</p>
              </div>
            )}
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
    </section>
  );
}

export default GaryHero;
