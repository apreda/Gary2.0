import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import { useAuth } from '../contexts/AuthContext';
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import { supabase } from "../supabaseClient";
import garyImage from "../assets/images/gary23.png";

function Home() {
  const { user } = useAuth();
  const [featuredPicks, setFeaturedPicks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Render a pick card - IDENTICAL to GaryHero implementation
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
        width: 450,
        height: 300,
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
                    fontSize: '0.65rem', 
                    opacity: 0.6, 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em', 
                    marginBottom: '0.25rem'
                  }}>
                    LEAGUE
                  </div>
                  <div style={{ 
                    fontSize: '1rem', 
                    fontWeight: 600,
                    color: '#ffffff'
                  }}>
                    {displayPick.league || 'NBA'}
                  </div>
                </div>
                
                {/* Matchup */}
                <div style={{ marginLeft: '20px' }}>
                  <div style={{ 
                    fontSize: '0.65rem', 
                    opacity: 0.6, 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em', 
                    marginBottom: '0.25rem'
                  }}>
                    MATCHUP
                  </div>
                  <div style={{ 
                    fontSize: '1rem', 
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    opacity: 0.95
                  }}>
                    {displayPick.game || 'Nuggets @ Thunder'}
                  </div>
                </div>
              </div>
              
              {/* Gary's Pick section */}
              <div style={{ marginTop: '1.75rem' }}>
                <div style={{ 
                  fontSize: '0.65rem', 
                  opacity: 0.6, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em', 
                  marginBottom: '0.25rem'
                }}>
                  GARY'S PICK
                </div>
                <div style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 600,
                  color: '#d4af37',
                  lineHeight: 1.1,
                  marginBottom: '0.25rem',
                  maxWidth: '90%'
                }}>
                  {displayPick.pick || 'Denver Nuggets +9.5 -110'}
                </div>
              </div>
              
              {/* Bottom section with rationale */}
              <div>
                <div style={{ 
                  fontSize: '0.65rem',
                  opacity: 0.5,
                  marginBottom: '0.25rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  RATIONALE
                </div>
                <div style={{ 
                  fontSize: '0.75rem',
                  lineHeight: 1.5,
                  opacity: 0.8,
                  maxHeight: '3.5rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical'
                }}>
                  {displayPick.rationale}
                </div>
              </div>
            </div>

            {/* Right side with game time and confidence meter */}
            <div style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '30%',
              background: 'linear-gradient(to right, rgba(26,26,26,0) 0%, rgba(26,26,26,1) 20%, rgba(26,26,26,1) 100%)',
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              padding: '1.5rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              {/* Game Time */}
              <div style={{
                marginBottom: '2rem',
                textAlign: 'center'
              }}>
                <div style={{ 
                  fontSize: '0.65rem', 
                  opacity: 0.6, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em', 
                  marginBottom: '0.25rem'
                }}>
                  GAME TIME
                </div>
                <div style={{ 
                  fontSize: '0.9rem', 
                  fontWeight: 600,
                  letterSpacing: '0.02em'
                }}>
                  {displayPick.time || '9:30 PM ET'}
                </div>
              </div>

              {/* Gary AI Seal with Confidence */}
              <div style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                border: '2px solid #d4af37',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <img 
                  src="/gary-ai-seal.png" 
                  alt="Gary AI Seal" 
                  style={{
                    width: '75%',
                    height: 'auto'
                  }}
                />
              </div>
            </div>
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
          }).slice(0, 2); // Get top 2 picks
          
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

          {/* Gary image - positioned down and to the right with reduced opacity */}
          <div className="absolute left-16 top-36 z-20 hidden md:block" style={{ maxWidth: "250px" }}>
            <img
              src={garyImage}
              alt="Gary AI Bear"
              className="w-full h-auto"
              style={{ opacity: 0.65, filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.4))" }}
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

            {/* Premium pick preview - exactly as in original GaryHero */}
            <div className="mt-2 mb-80 w-full flex justify-center items-center">
              <div className="relative w-full max-w-4xl bg-black/30 rounded-xl overflow-hidden shadow-2xl border border-gray-800/50" 
                   style={{ height: "480px", paddingBottom: "0px" }}>
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
                <div className="flex justify-center items-center h-full pt-10">
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
        </section>
        
        {/* Natural spacing between sections */}
        <div className="h-32"></div>
        
        <section className="relative py-16 min-h-[110vh] flex flex-col items-center justify-center overflow-hidden">
          {/* Newspaper-style container with cream background that appears as part of the flow */}
          <div className="w-full max-w-6xl mx-auto p-10 pb-20 bg-[#f6f2e8] shadow-2xl relative">
            {/* The Bears Brain heading - with enhanced padding and border box */}
            <div className="mt-10 mb-14 border-2 border-[#b8953f] p-8 rounded-lg shadow-lg bg-[#f6f2e8]">
              <h2 className="text-center text-[#b8953f] font-serif italic tracking-wide" style={{ fontSize: "clamp(3.5rem, 8vw, 5rem)" }}>
                The Bears Brain
              </h2>
            </div>
            
            <h3 className="text-center text-gray-700 font-bold mb-16 text-2xl md:text-3xl">
              Gary combines decades of betting expertise with cutting-edge AI<br />
              to identify value others miss.
            </h3>
            
            <div className="py-4 px-6 bg-[#f7f3e9] mb-10 border-l-4 border-[#b8953f]">
              <div className="flex items-center mb-2">
                <div className="text-xs text-gray-500">By</div>
                <div className="ml-2 font-medium text-gray-700">GARY A.I. STAFF</div>
                <div className="mx-2 text-gray-400">|</div>
                <div className="text-xs text-gray-500">APRIL 23, 2025</div>
              </div>
              
              <p className="text-gray-600 italic">
                Experience the revolutionary handicapping system that's changing the game for sports
                bettors everywhere—powered by the most advanced AI in the industry.
              </p>
            </div>
            
            {/* Two column layout */}
            <div className="flex flex-col md:flex-row gap-10 mt-16">
              {/* Left column */}
              <div className="text-left">
                {/* Statistical Brain */}
                <div className="mb-12">
                  <h3 className="text-2xl font-bold border-b border-[#b8953f] pb-3 mb-4 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>1. Statistical Brain</h3>
                  <p className="text-gray-500 font-serif text-lg leading-relaxed">Unlike static models that simply crunch historical data, Gary's system integrates player sentiment, weather impact factors, and arena-specific performance indicators to create a dynamic predictive model.</p>
                </div>
              
                {/* Fan Brain */}
                <div className="mb-10">
                  <h3 className="text-2xl font-bold border-b border-[#b8953f] pb-3 mb-4 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>2. Fan Brain</h3>
                  <p className="text-gray-500 font-serif text-lg leading-relaxed">Reads team loyalty, emotional bias, and fan storylines to spot hidden angles. Gary's system analyzes how public perception influences betting lines, creating opportunities for value bets that go against the crowd.</p>
                </div>
                {/* Narrative Tracker */}
                <div className="mb-12">
                  <h3 className="text-2xl font-bold border-b border-[#b8953f] pb-3 mb-4 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>3. Narrative Tracker</h3>
                  <p className="text-gray-500 font-serif text-lg leading-relaxed">Uncovers hidden motivations and emotional weights that move the lines. When a player faces their former team or a coach returns to a city where they previously worked, Gary factors these emotional elements into the prediction model.</p>
                </div>
              </div>
              
              {/* Right column */}
              <div className="text-left">
                {/* Street Smart */}
                <div className="mb-12">
                  <h3 className="text-2xl font-bold border-b border-[#b8953f] pb-3 mb-4 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>4. Street Smart</h3>
                  <p className="text-gray-500 font-serif text-lg leading-relaxed mb-3">Old-school instincts meet AI precision to sniff out real betting value. Gary doesn't just follow the math—he understands the human element that often defies the numbers.</p>
                  <p className="text-gray-500 font-serif text-lg leading-relaxed">By combining decades of handicapping wisdom with cutting-edge machine learning, Gary can identify value opportunities that purely statistical models miss.</p>
                </div>
                
                {/* Three-Layered Core */}
                <div className="mb-12">
                  <h3 className="text-2xl font-bold border-b border-[#b8953f] pb-3 mb-4 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>5. Three-Layered Core</h3>
                  <p className="text-gray-500 font-serif text-lg leading-relaxed">Sports Odds & Stats, Real-Time Storylines, and Reasoning Engine—Gary's secret sauce. This proprietary system processes information through three distinct layers, each adding depth to the analysis and improving prediction accuracy.</p>
                </div>
                
                {/* Pull quote */}
                <div className="border-l-4 border-[#b8953f] pl-6 italic my-8">
                  <p className="text-gray-600 font-serif text-xl leading-relaxed">"Our system doesn't just predict outcomes—it understands the game at a fundamental level that most handicappers can't match."</p>
                  <p className="text-gray-500 font-serif text-base mt-3">— Gary A.I. Development Team</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Home;
