import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import { useAuth } from '../contexts/AuthContext';
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import '../styles/hero.css';
import { supabase } from "../supabaseClient";
import garyImage from "../assets/images/gary23.png";

function Home() {
  const { user } = useAuth();
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
  
  // Render a pick card with all details
  const renderPickCard = (pick) => {
    const confidence = pick.confidence ? parseFloat(pick.confidence) * 100 : 78;
    // Get the team name from the pick string ("Team Name -X.X")
    const pickParts = pick.pick ? pick.pick.split(" ") : [];
    // Combine team name parts until we hit a dash/plus symbol
    let teamName = [];
    for (let part of pickParts) {
      if (part.startsWith("-") || part.startsWith("+")) break;
      teamName.push(part);
    }
    teamName = teamName.join(" ");
    
    // Extract the spread value and odds
    const spreadOdds = pick.pick ? pick.pick.replace(teamName, "").trim() : "-1.5 -175";
    
    // Pick card container with team color theme
    return (
      <div className="w-full overflow-hidden bg-[#1d2025] rounded-lg shadow-xl transition-all duration-300 hover:shadow-2xl">
        {/* MAC OS Style toolbar with dots */}
        <div className="flex items-center px-2 py-1 bg-[#0a0a0a]">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF605C] mr-1.5"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD44] mr-1.5"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#00CA4E] mr-2"></div>
          <div className="text-white/30 text-xs ml-4 font-medium">Today's Premium Pick</div>
        </div>

        {/* Card content with betting data */}
        <div className="flex">
          {/* Left side - League and Team Info */}
          <div className="flex-1 p-4 flex flex-col">
            {/* League Category */}
            <div 
              style={{ 
                background: "linear-gradient(to right, rgba(10,10,10,0.9), transparent)",
                borderLeft: "4px solid #d4af37"
              }}
              className="flex items-start justify-between mb-3 pl-2 py-1"    
            >
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
                  letterSpacing: '0.02em',
                }}>
                  {pick.league || "MLB"}
                </div>
              </div>
            </div>
            
            {/* Pick title and description */}
            <div className="pl-2 mb-4">
              <div style={{ 
                fontSize: '0.65rem', 
                opacity: 0.6, 
                textTransform: 'uppercase',
                letterSpacing: '0.05em', 
                marginBottom: '0.25rem'
              }}>
                GARY'S PICK
              </div>
              <div className="text-[#d4af37] text-xl font-bold mb-1">
                {teamName || "Los Angeles Dodgers"} 
                <span className="opacity-80">{spreadOdds}</span>
              </div>
            </div>
          </div>
          
          {/* Middle - Matchup Info */}
          <div className="flex-1 p-4 flex flex-col">
            <div 
              style={{ 
                background: "linear-gradient(to right, rgba(10,10,10,0.9), transparent)",
                borderLeft: "4px solid #444" 
              }}
              className="flex items-start justify-between mb-3 pl-2 py-1"    
            >
              <div>
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
                }}>
                  {pick.game || "Marlins @ Dodgers"}
                </div>
              </div>
            </div>
          </div>
          
          {/* Right side - Game time, confidence meter */}
          <div className="bg-[#1a1b1f] p-4 flex flex-col items-center justify-center w-32">
            <div className="mb-4 text-center">
              <div style={{ 
                fontSize: '0.65rem', 
                opacity: 0.6, 
                textTransform: 'uppercase',
                letterSpacing: '0.05em', 
                marginBottom: '0.25rem' 
              }}>
                GAME TIME
              </div>
              <div className="text-white font-medium">
                {pick.time || "10:10 PM ET"}
              </div>
            </div>
            
            {/* Gary seal of approval */}
            <div className="w-20 h-20 bg-[#d4af37] rounded-full flex items-center justify-center">
              <div className="w-[74px] h-[74px] bg-[#161718] rounded-full flex items-center justify-center">
                <img src="/gary-seal.png" alt="Gary AI Seal" className="w-16 h-16" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-visible">
      {/* Unified, continuous background for entire homepage */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        {/* Base dark gradient background that spans the entire page */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#121212] via-[#121212] to-[#1a1a1a]" />
        
        {/* Subtle paper texture overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `radial-gradient(#fff 1px, transparent 1px)`,
          backgroundSize: `30px 30px`
        }} />
        
        {/* Layered gold spotlight for depth */}
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-[#b8953f]/20 blur-[120px] opacity-40 z-10" />
        
        {/* Subtle glass reflection at top edge */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-white/10 rounded-b-full blur-2xl opacity-30 z-10" />
        
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
                <p className="text-white/75 text-base md:text-lg mx-auto leading-relaxed font-light">
                  Powered by AI analysis of real-time sports data to identify high-confidence betting opportunities.
                </p>
              </div>

              {/* Technology badges - similar to the NEW badge above */}
              <div className="flex flex-wrap justify-center gap-3 mb-8">
                <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
                  <span>Computer Vision</span>
                </div>
                <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
                  <span>Machine Learning</span>
                </div>
                <div className="bg-[#b8953f]/90 text-black text-xs font-medium px-3 py-1 rounded-full flex items-center">
                  <span>Advanced Statistics</span>
                </div>
              </div>
              
              {/* CTA buttons - Using the tailwind classes but styled per mockups */}
              <div className="flex flex-col sm:flex-row gap-4 mb-16">
                <Link to="/picks" className="hero-cta-primary px-8 py-3 rounded-md text-base font-semibold">
                  View Picks
                </Link>
                <Link to="/how-it-works" className="hero-cta-secondary px-8 py-3 rounded-md text-base font-semibold">
                  How it Works
                </Link>
              </div>
            </div>

            {/* Featured Picks - Using modern card design */}
            <div className="mb-16 mt-4 w-full">
              {/* Pick category selector - Simple tabs */}
              <div className="flex justify-center mb-8">
                <div className="inline-flex items-center bg-black/30 backdrop-blur-sm p-1 rounded-md">
                  <button className="px-4 py-1.5 text-sm font-medium text-white bg-[#b8953f]/90 rounded focus:outline-none">
                    Featured
                  </button>
                  <button className="px-4 py-1.5 text-sm font-medium text-white/60 hover:text-white rounded focus:outline-none">
                    All Picks
                  </button>
                </div>
              </div>

              {/* Hot pick indicator with badge */}
              <div className="flex items-center justify-center mb-4">
                <div className="w-2 h-2 bg-[#d4af37] rounded-full animate-pulse mr-2"></div>
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
                      league: "MLB",
                      game: "Marlins @ Dodgers",
                      pick: "Los Angeles Dodgers -1.5 -175",
                      time: "10:10 PM ET",
                      confidence: 0.78,
                      rationale: "Dodgers have been dominant at home, and their offense should overpower Miami's pitching staff. Look for LA to win by at least 2 runs."
                    })}
                  </div>
                )}
              </div>
            </div>
          </main>
        </section>
        
        {/* Natural spacing between sections */}
        <div className="h-32"></div>
        
        <section className="relative py-16 min-h-[110vh] flex flex-col items-center justify-center overflow-hidden">
          {/* Newspaper-style container with cream background that appears as part of the flow */}
          <div className="relative z-10 w-full max-w-7xl mx-auto bg-[#f7f3e8] rounded-2xl shadow-xl overflow-hidden">
            {/* Subtle paper texture overlay */}
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
              backgroundSize: `20px 20px`
            }}></div>
            
            {/* Subtle gold vignette corners for depth */}
            <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#b8953f]/10 blur-3xl opacity-20" />
            <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#b8953f]/10 blur-3xl opacity-20" />
            
            {/* Thin vertical divider line to give a newspaper column feel */}
            <div className="absolute top-[5%] bottom-[5%] left-1/2 w-px bg-[#b8953f]/20"></div>
          {/* Unified Section Content */}
          <div className="relative z-10 flex flex-col items-center w-full max-w-6xl px-2 md:px-8">
            {/* Newspaper-style headline banner */}
            <h2 className="font-extrabold mb-8 text-black leading-tight text-center">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#b8953f] to-[#d4af37] font-extrabold font-serif italic text-5xl md:text-6xl lg:text-7xl">The Bears Brain</span>
            </h2>
            
            <h3 className="text-2xl md:text-3xl font-serif text-center mb-12 text-gray-700 max-w-5xl mx-auto">Gary combines decades of betting expertise with cutting-edge AI to identify value others miss.</h3>
            
            <div className="text-sm font-serif text-gray-500 mb-10 flex items-center">
              <span className="mr-2">By</span>
              <span className="font-semibold">GARY A.I. STAFF</span>
              <span className="mx-2">|</span>
              <span>APRIL 23, 2025</span>
            </div>
            
            <p className="text-gray-500 font-serif leading-relaxed mb-10 text-center max-w-2xl px-4 py-3">
              Experience the revolutionary handicapping system that's changing the game for sports bettors everywhere—powered by the most advanced AI in the industry.
            </p>
            {/* Features as newspaper columns */}
              <div className="bg-[#f9f6ed] shadow-lg p-10 rounded border border-[#b8953f]/20 w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                  {/* Left column */}
                  <div className="text-left">
                    {/* Data Aware */}
                    <div className="mb-12">
                      <h3 className="text-2xl font-bold border-b border-[#b8953f] pb-3 mb-4 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>1. Data Aware</h3>
                      <p className="text-gray-500 font-serif text-lg leading-relaxed mb-3">Legacy data enhanced with real-time details that impact the odds. Gary treats each new stat update as a crucial piece of the betting puzzle.</p>
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


            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export { Home };
export default Home;
