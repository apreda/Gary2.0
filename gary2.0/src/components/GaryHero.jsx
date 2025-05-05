import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "../styles/dimensional.css";
import "../styles/hero.css";
import { supabase } from "../supabaseClient";

export function GaryHero() {
  const [featuredPicks, setFeaturedPicks] = useState([]);
  const [loading, setLoading] = useState(true);

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
          }).slice(0, 2); // Get top 2 picks
          
          setFeaturedPicks(sortedPicks);
        }
      } catch (err) {
        console.error("Error in fetchFeaturedPicks:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchFeaturedPicks();
  }, []);

  // Render a pick card - IDENTICAL to RealGaryPicks implementation
  const renderPickCard = (pick) => {
    if (!pick) return null;
    
    // Default mock data if needed
    const mockPick = {
      id: 'mock123',
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
      <div style={{
        width: 380,
        height: 465,
        perspective: '1000px',
        marginTop: '20px',
        cursor: 'pointer'
      }}>
        {/* Card container with 3D effect */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform: 'rotateY(0deg)',
        }}>
          {/* FRONT OF CARD - Exactly matching RealGaryPicks */}
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
                    {displayPick.league}
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
                    {displayPick.game || `${displayPick.awayTeam} @ ${displayPick.homeTeam}`}
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
                  color: '#bfa142',
                  wordBreak: 'break-word',
                  marginBottom: '0.75rem'
                }}>
                  {displayPick.pick}
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
                  {displayPick.rationale ? displayPick.rationale.substring(0, 120) + '...' : 'Click for analysis'}
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
                  <button 
                    style={{
                      background: 'rgba(191, 161, 66, 0.15)',
                      color: '#bfa142',
                      fontWeight: '600',
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(191, 161, 66, 0.3)',
                      cursor: 'pointer',
                      flex: 1,
                      fontSize: '0.8rem',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    Bet
                  </button>
                  <button 
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
                      transition: 'all 0.2s ease'
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
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
              borderLeft: '2.25px solid #bfa142',
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
                  {displayPick.time}
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
                  alt="Gary AI Coin"
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
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  opacity: 0.95,
                  color: '#bfa142',
                  marginBottom: '0.5rem'
                }}>
                  {typeof displayPick.confidence === 'number' ? 
                    Math.round(displayPick.confidence * 100) + '%' : 
                    (displayPick.confidence || '78%')}
                </div>
                
                {/* View Analysis button */}
                <button style={{
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
        </div>
      </div>
    );
  };

  return (
    <section className="hero relative flex flex-col overflow-hidden" style={{ width: "100vw", height: "100vh", background: "linear-gradient(110deg, #0a0a0a 0%, #121212 50%, #0a0a0a 100%)" }}>
      {/* Hero watermark background - Gary Money image with a subtle gradient overlay */}
      <div className="hero__watermark absolute top-1/2 left-1/2 w-[120%] h-[120%] transform -translate-x-1/2 -translate-y-1/2 scale-110 pointer-events-none z-10">
        <img 
          src="/garymoney.png" 
          alt="" 
          className="w-full h-full object-contain opacity-10 mix-blend-overlay" 
          style={{ filter: "saturate(0.8) contrast(1.1)" }}
        />
      </div>
      
      {/* Subtle blue gradient overlay similar to Vault but using gold/black scheme */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-[#b8953f]/10 z-10 opacity-70"></div>
      
      <main className="hero-inner max-w-[1440px] mx-auto flex flex-col z-20 relative w-full h-full" style={{ padding: "24px 24px" }}>
        {/* Centered Hero Content - Exactly following Vault layout */}
        <div className="w-full mx-auto flex flex-col items-center mt-10 md:mt-16">
          {/* NEW badge - using the pill style from Vault */}
          <div className="mb-8 relative">
            <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
              <span className="mr-1.5 text-[10px] font-bold">NEW</span>
              <span>Introducing Gary AI: Intelligent sports betting</span>
            </div>
          </div>

          {/* Main headline - Exact Vault typography style */}
          <h1 className="mb-10 text-center" style={{ fontSize: "clamp(3.2rem, 7vw, 4.5rem)", lineHeight: "1.05", letterSpacing: "-0.02em", maxWidth: "900px" }}>
            <div className="text-white font-bold">The gateway to</div>
            <div>
              <span className="italic font-normal text-[#b8953f]">smart</span>
              <span className="text-white font-bold"> sports bets</span>
            </div>
          </h1>
          
          {/* Subheading - Matching Vault's font weight and spacing */}
          <div className="text-center mb-14 max-w-2xl">
            <p className="text-white/75 text-xl md:text-2xl mx-auto leading-relaxed font-light">
              With a few lines of data you can integrate betting insights from any sport, in any league, on any team.
            </p>
          </div>

          {/* CTA Buttons - Exact Vault style */}
          <div className="flex flex-col sm:flex-row gap-4 mt-4 justify-center">
            <Link 
              to="/real-gary-picks" 
              className="bg-white hover:bg-gray-100 text-gray-900 font-medium rounded-md transition duration-200 ease-in-out"
              style={{ padding: "10px 20px" }}
            >
              Get started
            </Link>
            <Link 
              to="/how-it-works" 
              className="bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] text-white font-medium rounded-md border border-[rgba(255,255,255,0.1)] backdrop-blur-sm transition duration-200 ease-in-out"
              style={{ padding: "10px 20px" }}
            >
              View demo
            </Link>
          </div>
        </div>
        
        {/* Vault-style dashboard preview with our pick cards inside */}
        <div className="mt-16 mb-auto w-full flex justify-center items-center">
          <div className="relative w-full max-w-5xl bg-black/30 rounded-xl overflow-hidden shadow-2xl border border-gray-800/50" 
               style={{ height: "520px" }}>
            {/* Dark glossy header bar */}
            <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center px-4">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <div className="text-white/30 text-xs ml-4 font-medium">Gary's Premium Picks</div>
            </div>
            
            {/* Pick Cards inside the dashboard frame */}
            <div className="flex justify-center items-center h-full pt-10">
              <div className="flex flex-col md:flex-row gap-12 justify-center">
                {loading ? (
                  <div className="text-[#b8953f] text-center">Loading today's top picks...</div>
                ) : featuredPicks.length > 0 ? (
                  featuredPicks.map((pick, index) => (
                    <div key={index} className="transition-all hover:transform hover:-translate-y-2">
                      {renderPickCard(pick)}
                    </div>
                  ))
                ) : (
                  <>
                    {/* Display two mock cards side by side with the exact data from screenshots */}
                    <div className="transition-all hover:transform hover:-translate-y-2">
                      {renderPickCard({
                        league: "NBA",
                        game: "Nuggets @ Thunder",
                        pick: "Denver Nuggets +9.5 -110",
                        time: "9:30 PM ET",
                        confidence: 0.78,
                        rationale: "Thunder are the better squad, but a 9.5-point line is disrespectful to a battle-tested Nuggets team even on the road."
                      })}
                    </div>
                    <div className="transition-all hover:transform hover:-translate-y-2">
                      {renderPickCard({
                        league: "MLB",
                        game: "Yankees @ Padres",
                        pick: "New York Yankees ML -142",
                        time: "7:10 PM ET",
                        confidence: 0.82,
                        rationale: "Yankees have the pitching edge and their lineup's been mashing righties all month. Padres are ice cold at home, and the line is holding steady—no trap here, just value on the better squad. Gary's system and gut both point Bronx."
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* The Bears Brain Section Peek */}
      <div className="relative z-5 w-full dimension-bg-section h-16 mt-auto">
        <div className="absolute -top-16 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-[#0e0e0e]"></div>
        <div className="container mx-auto px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-[#b8953f] mr-2 animate-pulse"></div>
            <span className="text-[#b8953f] font-semibold">THE BEARS BRAIN</span>
          </div>
          <div className="text-white/60 text-xs md:text-sm">AI-powered insights analyzing 15+ years of sports data</div>
        </div>
      </div>
    </section>
  );
}

export default GaryHero;
