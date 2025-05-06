import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "../styles/dimensional.css";
import "../styles/hero.css";
import { supabase } from "../supabaseClient";
import garyImage from "../assets/images/gary23.png";

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

  // Render a pick card - IDENTICAL to the screenshot
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
      <div style={{
        width: 520,
        height: 420,
        perspective: '1000px',
        marginTop: '0',
        cursor: 'pointer'
      }}>
        {/* Card container with 3D effect */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform: 'rotateY(0deg)',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
        }}>
          {/* FRONT OF CARD - Exact match to screenshot */}
          <div style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            background: '#1C1C1E',
            borderRadius: '16px',
            fontFamily: 'Inter, system-ui, sans-serif',
            overflow: 'hidden',
            color: '#ffffff',
          }}>
            {/* Left side content area */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '75%',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
            }}>
              {/* League section */}
              <div>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#909090', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em', 
                  marginBottom: '0.35rem'
                }}>
                  LEAGUE
                </div>
                <div style={{ 
                  fontSize: '1.75rem', 
                  fontWeight: 600, 
                  letterSpacing: '0.01em',
                  color: 'white'
                }}>
                  {displayPick.league}
                </div>
              </div>
              
              {/* Matchup section */}
              <div style={{ marginTop: '1rem' }}>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#909090', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em', 
                  marginBottom: '0.35rem'
                }}>
                  MATCHUP
                </div>
                <div style={{ 
                  fontSize: '1.75rem', 
                  fontWeight: 600,
                  color: 'white'
                }}>
                  {displayPick.game || `${displayPick.awayTeam} @ ${displayPick.homeTeam}`}
                </div>
              </div>
              
              {/* Gary's Pick section */}
              <div style={{ marginTop: '1rem' }}>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#909090', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em', 
                  marginBottom: '0.35rem'
                }}>
                  GARY'S PICK
                </div>
                <div style={{ 
                  fontSize: '2rem', 
                  fontWeight: 700, 
                  lineHeight: 1.1,
                  color: '#E0B016',
                  wordBreak: 'break-word',
                  marginBottom: '0.75rem'
                }}>
                  {displayPick.pick}
                </div>
                
                {/* Rationale text */}
                <div style={{ 
                  fontSize: '1rem',
                  lineHeight: 1.4,
                  color: '#DADADA',
                  fontWeight: 400,
                  maxHeight: '4.2em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {displayPick.rationale}
                </div>
              </div>
              
              {/* Take your pick section */}
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#909090', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em', 
                  marginBottom: '0.75rem'
                }}>
                  TAKE YOUR PICK
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <div style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: 'rgba(224, 176, 22, 0.2)',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#E0B016',
                    textAlign: 'center',
                    flex: '1',
                    cursor: 'pointer'
                  }}>
                    BET
                  </div>
                  <div style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'white',
                    textAlign: 'center',
                    flex: '1',
                    cursor: 'pointer'
                  }}>
                    FADE
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right side with gold accent and confidence */}
            <div style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '25%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.5rem',
              borderLeft: '2px solid #E0B016'
            }}>
              {/* Game time section */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#909090', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em', 
                  marginBottom: '0.5rem'
                }}>
                  GAME TIME
                </div>
                <div style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: 600,
                  color: 'white'
                }}>
                  {displayPick.time}
                </div>
              </div>
              
              {/* Coin logo */}
              <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                <div style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  backgroundColor: '#E0B016',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <img 
                    src="/coin2.png" 
                    alt="Gary AI Coin"
                    style={{
                      width: '60px',
                      height: '60px',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              </div>
              
              {/* Confidence section */}
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#909090', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em', 
                  marginBottom: '0.5rem'
                }}>
                  CONFIDENCE
                </div>
                <div style={{ 
                  fontSize: '1.75rem', 
                  fontWeight: 700,
                  color: '#E0B016'
                }}>
                  {Math.round(displayPick.confidence * 100)}%
                </div>
              </div>
              
              {/* View analysis button */}
              <div style={{
                marginTop: '1rem',
                backgroundColor: 'rgba(224, 176, 22, 0.2)',
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#E0B016',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'center'
              }}>
                VIEW ANALYSIS
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="hero relative flex flex-col overflow-hidden" style={{ width: "100vw", height: "100vh", background: "linear-gradient(110deg, #0a0a0a 0%, #121212 50%, #0a0a0a 100%)" }}>
      {/* Hero watermark background - Gary Money image with a subtle gradient overlay */}
      <div className="hero__watermark absolute top-1/2 left-1/2 w-[120%] h-[120%] transform -translate-x-1/2 -translate-y-1/2 scale-110 pointer-events-none z-10">
        <div className="absolute inset-0 bg-[url('/garyai-watermark2.png')] bg-center bg-no-repeat bg-contain opacity-[0.035] filter blur-sm"></div>
      </div>
      
      {/* Animated gradient overlay - Creates a subtle flowing effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#0c0c0c] via-transparent to-[#0c0c0c] z-10 opacity-80"></div>
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-[#b8953f]/10 z-10 opacity-70"></div>

      {/* Gary image in left corner */}
      <div className="absolute left-0 top-12 z-20 hidden md:block" style={{ maxWidth: "250px" }}>
        <img
          src={garyImage}
          alt="Gary AI Bear"
          className="w-full h-auto"
          style={{ opacity: 0.85, filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.4))" }}
        />
      </div>
      
      <main className="hero-inner max-w-[1440px] mx-auto flex flex-col z-20 relative w-full h-full" style={{ padding: "24px 24px" }}>
        {/* Centered Hero Content - Text shifted slightly right to account for Gary image */}
        <div className="w-full mx-auto flex flex-col items-center mt-0 md:mt-8" style={{ paddingLeft: "0", paddingRight: "0" }}>
          {/* NEW badge - using the pill style from Vault */}
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
            <p className="text-white/75 text-xl md:text-2xl mx-auto leading-relaxed font-light">
              Gary's Trained on the most up-to-date stats and is built on a unique algorithm specifically for picking winners.
            </p>
          </div>

          {/* Technology badges - similar to the NEW badge above */}
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

          {/* CTA Buttons - Exact Vault style */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-center">
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
        
        {/* Premium pick preview - positioned for full card visibility */}
        <div className="mt-2 mb-36 w-full flex justify-center items-center">
          <div className="relative w-full max-w-4xl bg-black/30 rounded-xl overflow-hidden shadow-2xl border border-gray-800/50" 
               style={{ height: "700px" }}>
            {/* Dark glossy header bar */}
            <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-r from-gray-900 to-gray-800 flex items-center px-4">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <div className="text-white/30 text-xs ml-4 font-medium">Today's Premium Pick</div>
            </div>
            
            {/* Single wider pick card */}
            <div className="flex justify-center items-center h-full pt-2">
              {loading ? (
                <div className="text-[#b8953f] text-center">Loading today's top pick...</div>
              ) : featuredPicks.length > 0 ? (
                <div className="w-full max-w-lg transition-all hover:transform hover:-translate-y-2">
                  {renderPickCard(featuredPicks[0])}
                </div>
              ) : (
                <div className="w-full max-w-lg transition-all hover:transform hover:-translate-y-2">
                  {renderPickCard({
                    league: "NBA",
                    game: "Nuggets @ Thunder",
                    pick: "Denver Nuggets +9.5 -110",
                    time: "9:30 PM ET",
                    confidence: 0.78,
                    rationale: "Thunder are the better squad, but a 9.5-point line is disrespectful to a battle-tested Nuggets team even on the road."
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* The Bears Brain Section Peek */}
      <div className="relative z-5 w-full dimension-bg-section h-16 mt-auto" style={{ marginTop: '100px' }}>
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
