import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { useAuth } from '../contexts/AuthContext';
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import { supabase } from "../supabaseClient";
import garyImage from "../assets/images/gary23.png";
import coinImage from "/coin2.png";

function Home() {
  const { user } = useAuth();
  const [featuredPicks, setFeaturedPicks] = useState([]);
  const [loading, setLoading] = useState(true);

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
    
    // Format displayed time properly
    const formattedTime = displayPick.time ? 
      (function() {
        let time = displayPick.time.includes('ET') ? displayPick.time : `${displayPick.time} ET`;
        return time.replace(/:([0-9])\s/, ':0$1 ');
      })() : '9:30 PM ET';
      
    // Calculate confidence percentage for display
    const confidencePercentage = typeof displayPick.confidence === 'number' ? 
      Math.round(displayPick.confidence * 100) + '%' : 
      (displayPick.confidence || '78%');
    
    return (
      <div style={{
        width: 576,
        height: 384,
        perspective: '1000px',
        cursor: 'pointer'
      }}>
        {/* Card container with 3D effect */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
        }}>
          {/* FRONT OF CARD - Modern Dark UI Design matching RealGaryPicks */}
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
              overflow: 'hidden'
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
                    LEAGUE
                  </div>
                  <div style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: 600, 
                    letterSpacing: '0.02em',
                    opacity: 0.95
                  }}>
                    {displayPick.league || 'NBA'}
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
                    MATCHUP
                  </div>
                  <div style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: 600,
                    opacity: 0.9
                  }}>
                    {(displayPick.homeTeam && displayPick.awayTeam) ? 
                      `${displayPick.awayTeam.split(' ').pop()} @ ${displayPick.homeTeam.split(' ').pop()}` : 
                      (displayPick.game ? displayPick.game : 'Nuggets @ Thunder')}
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
                  GARY'S PICK
                </div>
                <div style={{ 
                  fontSize: '2rem', 
                  fontWeight: 700, 
                  lineHeight: 1.1,
                  color: '#bfa142', /* Gold color for the actual pick */
                  wordBreak: 'break-word',
                  marginBottom: '0.75rem'
                }}>
                  {displayPick.pick || 'Denver Nuggets +9.5 -110'}
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
                  marginBottom: '1.5rem'
                }}>
                  {displayPick.rationale ? displayPick.rationale.substring(0, 120) + '...' : 'Click for analysis'}
                </div>
                
                {/* Take Your Pick section with BET and FADE buttons */}
                <div style={{ marginTop: 'auto' }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    opacity: 0.6, 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em', 
                    marginBottom: '0.5rem'
                  }}>
                    TAKE YOUR PICK
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: 'rgba(184, 149, 63, 0.2)',
                        border: '1px solid #b8953f',
                        borderRadius: '0.25rem',
                        color: '#b8953f',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      BET
                    </button>
                    <button
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '0.25rem',
                        color: 'white',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      FADE
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side content - prominently elevated appearance */}
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: '30%',
              backgroundImage: 'linear-gradient(to bottom right, rgba(34, 34, 34, 0.95), rgba(17, 17, 17, 0.98))',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.5rem',
              borderLeft: '2.25px solid #b8953f',
              textAlign: 'center',
              boxShadow: '-5px 0 15px rgba(0, 0, 0, 0.3)',
              transform: 'translateZ(10px)', /* 3D effect */
              zIndex: 1
            }}>
              <div>
                <div style={{ 
                  fontSize: '0.75rem', 
                  opacity: 0.6, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em', 
                  marginBottom: '0.25rem'
                }}>
                  GAME TIME
                </div>
                <div style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: 600, 
                  letterSpacing: '0.02em',
                  opacity: 0.95
                }}>
                  {formattedTime}
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
                  src={coinImage} 
                  alt="Gary A.I. Coin" 
                  style={{ 
                    width: '130px',
                    height: '130px',
                    marginBottom: '1rem',
                    filter: 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.5))'
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
                  CONFIDENCE
                </div>
                <div style={{ 
                  fontSize: '2rem', 
                  fontWeight: 600, 
                  color: '#bfa142',
                  opacity: 0.95,
                  marginBottom: '1.5rem'
                }}>
                  {confidencePercentage}
                </div>
                
                {/* View Analysis Button */}
                <button
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: 'rgba(184, 149, 63, 0.15)',
                    border: '1px solid #b8953f',
                    borderRadius: '0.25rem',
                    color: '#b8953f',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  VIEW ANALYSIS
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
        </div>
      </div>
    );
  };

  // Load featured picks from the database
  useEffect(() => {
    const fetchFeaturedPicks = async () => {
      try {
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split("T")[0];
        
        // Query Supabase for today's picks
        const { data, error } = await supabase
          .from("daily_picks")
          .select("picks, date")
          .eq("date", today)
          .maybeSingle();
          
        if (error) {
          console.error("Error fetching picks:", error);
          return;
        }
        
        // If we have picks for today, get the top two with highest confidence
        if (data && data.picks) {
          const picksArray = typeof data.picks === "string" ? JSON.parse(data.picks) : data.picks;
          
          // Sort by confidence (high to low) and get top 2
          const sortedPicks = [...picksArray].sort((a, b) => {
            const confA = a.confidence ? parseFloat(a.confidence) : 0;
            const confB = b.confidence ? parseFloat(b.confidence) : 0;
            return confB - confA;
          }).slice(0, 1); // Get only top 1 pick
          
          setFeaturedPicks(sortedPicks);
        } else {
          // Use default picks if none found for today
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
    <div className="min-h-screen relative flex flex-col overflow-x-hidden">
      {/* Fixed background with all effects - spans the entire viewport */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#0a0a0c] to-[#18181a] z-0">
        {/* Gold vignette corners */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#b8953f]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#b8953f]/10 blur-3xl" />
        
        {/* Subtle grid/noise overlay */}
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-soft-light" />
        
        {/* Radial vignette for cinematic depth */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/20 opacity-30" />
      </div>
      <div className="relative z-10">
        {/* Hero Section - Integrated directly */}
        <section className="hero relative flex flex-col overflow-hidden min-h-screen">
          {/* Hero watermark background - Gary Money image with a subtle gradient overlay */}
          <div className="hero__watermark absolute top-1/2 left-1/2 w-[120%] h-[120%] transform -translate-x-1/2 -translate-y-1/2 scale-110 pointer-events-none z-10">
            <div className="absolute inset-0 bg-[url('/garyai-watermark2.png')] bg-center bg-no-repeat bg-contain opacity-[0.035] filter blur-sm"></div>
          </div>

          {/* Gary image - repositioned higher and further left */}
          <div className="absolute -left-16 top-12 z-20 hidden md:block" style={{ maxWidth: "450px" }}>
            <img
              src={garyImage}
              alt="Gary AI Bear"
              className="w-full h-auto"
              style={{ 
                opacity: 0.65, 
                filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.4))",
                transform: "scale(0.9)" 
              }}
            />
          </div>
          
          <main className="hero-inner max-w-[1440px] mx-auto flex flex-col z-20 relative w-full h-full" style={{ padding: "24px 24px" }}>
            {/* Centered Hero Content */}
            <div className="w-full mx-auto flex flex-col items-center mt-20 md:mt-24" style={{ paddingLeft: "0", paddingRight: "0" }}>
              {/* NEW badge */}
              <div className="mb-8 relative">
                <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
                  <span className="mr-1.5 text-[10px] font-bold">NEW</span>
                  <span>Introducing Gary AI: Intelligent sports betting</span>
                </div>
              </div>

              {/* Main headline - Simple and impactful */}
              <h1 className="mb-10 text-center" style={{ fontSize: "clamp(3.5rem, 6vw, 5rem)", lineHeight: "1.1", letterSpacing: "-0.02em", maxWidth: "920px" }}>
                <div>
                  <span className="text-white font-bold">Make </span>
                  <span className="italic font-normal text-[#b8953f]">Smarter</span>
                  <span className="text-white font-bold"> Sports Bets </span>
                  <span className="text-white font-bold">with Gary</span>
                </div>
              </h1>
              
              {/* Subheading - Matching Vault's font weight and spacing */}
              <div className="text-center mb-8 max-w-2xl">
                <p className="text-white/75 text-base md:text-lg mx-auto leading-relaxed font-light">
                  Powered by AI analysis of real-time sports data to identify high-confidence betting opportunities.
                </p>
              </div>

              {/* Technology badges - using original tags from GaryHero */}
              <div className="flex flex-wrap justify-center gap-3 mb-8">
                <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
                  <span>Odds API</span>
                </div>
                <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
                  <span>SportsDB</span>
                </div>
                <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
                  <span>Turbo 3.5 Mini</span>
                </div>
                <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
                  <span>Perplexity</span>
                </div>
                <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
                  <span>StatCast API</span>
                </div>
              </div>
              
              {/* CTA Buttons - Exact Vault style from original GaryHero */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-center">
                <Link 
                  to="/picks" 
                  className="bg-white hover:bg-gray-100 text-gray-900 font-medium rounded-md transition duration-200 ease-in-out"
                  style={{ padding: "10px 20px" }}
                >
                  View Picks
                </Link>
                <Link 
                  to="/how-it-works" 
                  className="bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] text-white font-medium rounded-md border border-[rgba(255,255,255,0.1)] backdrop-blur-sm transition duration-200 ease-in-out"
                  style={{ padding: "10px 20px" }}
                >
                  How it Works
                </Link>
              </div>
            </div>

            {/* Featured Pick Card Preview - Single Card Only */}
            <div className="mt-12 mb-24 w-full flex flex-col items-center justify-center">
              <h2 className="text-white text-3xl font-bold mb-8">Today's Top Pick</h2>
              
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
                  <div className="p-8 rounded bg-black/30 backdrop-blur-sm">
                    <p className="text-white/70">New picks coming soon!</p>
                  </div>
                )}
              </div>
            </div>

            {/* The Bears Brain Section - Redesigned with dark theme */}
            <div className="mt-36 mb-24 w-full">
              <section className="relative py-12 flex flex-col items-center overflow-hidden">
                {/* Section Header with gold accent */}
                <div className="text-center mb-12">
                  <h2 className="text-[#b8953f] font-bold tracking-tight mb-4" style={{ fontSize: "clamp(3rem, 5vw, 4.5rem)", textShadow: "0 0 20px rgba(184, 149, 63, 0.3)" }}>
                    <span className="inline-block transform hover:scale-105 transition-all duration-500">The Bears Brain</span>
                  </h2>
                  <div className="w-24 h-1 bg-gradient-to-r from-[#b8953f]/20 via-[#b8953f] to-[#b8953f]/20 mx-auto"></div>
                </div>
                
                {/* Quote introductory card */}
                <div className="max-w-4xl mx-auto mb-10 text-center px-4">
                  <p className="text-white/80 text-xl italic font-light">
                    "The Bears Brain combines decades of betting expertise with cutting-edge AI to identify value others miss."
                  </p>
                </div>

                {/* Cards Grid - Two Column on Desktop */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto px-4">
                  {/* Statistical Brain */}
                  <div className="bg-[#0f0f0f] border border-[#b8953f]/30 rounded-lg p-6 shadow-lg hover:shadow-[0_0_25px_rgba(184,149,63,0.15)] hover:-translate-y-1 transition-all duration-300">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 rounded-full bg-[#b8953f]/10 flex items-center justify-center mr-4">
                        <span className="text-[#b8953f] text-xl">1</span>
                      </div>
                      <h3 className="text-[#b8953f] font-semibold text-2xl">Statistical Brain</h3>
                    </div>
                    <p className="text-white/70 text-base leading-relaxed pl-14">
                      Our proprietary algorithms analyze 72 statistical dimensions across 12 sportsbooks to identify mispriced lines and undervalued teams.
                    </p>
                  </div>

                  {/* Fan Brain */}
                  <div className="bg-[#0f0f0f] border border-[#b8953f]/30 rounded-lg p-6 shadow-lg hover:shadow-[0_0_25px_rgba(184,149,63,0.15)] hover:-translate-y-1 transition-all duration-300">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 rounded-full bg-[#b8953f]/10 flex items-center justify-center mr-4">
                        <span className="text-[#b8953f] text-xl">2</span>
                      </div>
                      <h3 className="text-[#b8953f] font-semibold text-2xl">Fan Brain</h3>
                    </div>
                    <p className="text-white/70 text-base leading-relaxed pl-14">
                      Tracking social sentiment, ticket splits, and sharp money moves to separate hype from true value.
                    </p>
                  </div>

                  {/* Narrative Tracker */}
                  <div className="bg-[#0f0f0f] border border-[#b8953f]/30 rounded-lg p-6 shadow-lg hover:shadow-[0_0_25px_rgba(184,149,63,0.15)] hover:-translate-y-1 transition-all duration-300">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 rounded-full bg-[#b8953f]/10 flex items-center justify-center mr-4">
                        <span className="text-[#b8953f] text-xl">3</span>
                      </div>
                      <h3 className="text-[#b8953f] font-semibold text-2xl">Narrative Tracker</h3>
                    </div>
                    <p className="text-white/70 text-base leading-relaxed pl-14">
                      Identifying when media narratives create betting opportunities by overemphasizing recent performance or star players.
                    </p>
                  </div>

                  {/* Street Smart */}
                  <div className="bg-[#0f0f0f] border border-[#b8953f]/30 rounded-lg p-6 shadow-lg hover:shadow-[0_0_25px_rgba(184,149,63,0.15)] hover:-translate-y-1 transition-all duration-300">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 rounded-full bg-[#b8953f]/10 flex items-center justify-center mr-4">
                        <span className="text-[#b8953f] text-xl">4</span>
                      </div>
                      <h3 className="text-[#b8953f] font-semibold text-2xl">Street Smart</h3>
                    </div>
                    <p className="text-white/70 text-base leading-relaxed pl-14">
                      Real-time injury reports, weather impacts, and lineup changes that move lines before the public catches on.
                    </p>
                  </div>

                  {/* Three-Layered Core */}
                  <div className="bg-[#0f0f0f] border border-[#b8953f]/30 rounded-lg p-6 shadow-lg hover:shadow-[0_0_25px_rgba(184,149,63,0.15)] hover:-translate-y-1 transition-all duration-300 md:col-span-2">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 rounded-full bg-[#b8953f]/10 flex items-center justify-center mr-4">
                        <span className="text-[#b8953f] text-xl">5</span>
                      </div>
                      <h3 className="text-[#b8953f] font-semibold text-2xl">Three-Layered Core</h3>
                    </div>
                    <p className="text-white/70 text-base leading-relaxed pl-14">
                      Combining statistical models, situational context, and market intelligence for our highest-confidence picks.
                    </p>
                  </div>
                  
                  {/* Featured Quote - Bottom Full Width */}
                  <div className="md:col-span-2 bg-gradient-to-br from-[#0f0f0f] to-[#181818] border border-[#b8953f]/20 rounded-lg p-6 mt-4">
                    <div className="flex">
                      <div className="w-1 bg-gradient-to-b from-[#b8953f]/30 via-[#b8953f] to-[#b8953f]/30 mr-6 self-stretch"></div>
                      <p className="text-white/80 italic text-lg leading-relaxed">
                        "The Bears Brain combines decades of betting expertise with cutting-edge AI to identify value others miss."
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Subtle tech pattern background */}
                <div className="absolute inset-0 -z-10 opacity-5 bg-[url('/circuit-board.svg')] bg-repeat pointer-events-none"></div>
              </section>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}

export default Home;
