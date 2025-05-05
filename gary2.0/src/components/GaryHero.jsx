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

  // Render a pick card
  const renderPickCard = (pick) => {
    if (!pick) return null;
    
    return (
      <div className="rounded-xl overflow-hidden shadow-lg" style={{
        background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)",
        width: "320px",
        height: "350px",
        position: "relative"
      }}>
        {/* Card content */}
        <div className="p-5 h-full flex flex-col">
          {/* League and matchup */}
          <div className="mb-3">
            <div className="text-[#b8953f] text-xs font-semibold mb-1">{pick.league}</div>
            <div className="text-white text-lg font-bold">{pick.homeTeam} vs {pick.awayTeam}</div>
          </div>
          
          {/* Pick details */}
          <div className="bg-[#1d1d1d] p-3 rounded-lg mb-4">
            <div className="text-white/60 text-xs mb-1">Gary's Pick</div>
            <div className="text-white text-xl font-bold">{pick.betType}: {pick.pick}</div>
            <div className="text-[#b8953f] text-sm mt-1">{pick.odds}</div>
          </div>
          
          {/* Game time & confidence */}
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="text-white/60 text-xs mb-1">Game Time</div>
              <div className="text-white text-sm font-medium">{pick.time || "7:00 PM ET"}</div>
            </div>
            <div>
              <div className="text-white/60 text-xs mb-1">Confidence</div>
              <div className="text-[#b8953f] text-sm font-bold">{Math.round(parseFloat(pick.confidence) * 100)}%</div>
            </div>
          </div>
          
          {/* Rationale */}
          <div className="bg-black/20 p-3 rounded-lg mt-auto">
            <div className="text-white/60 text-xs mb-1">Gary's Reasoning</div>
            <div className="text-white/90 text-sm line-clamp-3">{pick.rationale}</div>
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
        <div className="mt-24 mb-auto w-full flex justify-center items-center">
          <div className="relative w-full max-w-5xl bg-black/30 rounded-xl overflow-hidden shadow-2xl border border-gray-800/50" 
               style={{ height: "380px" }}>
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
              <div className="flex flex-col md:flex-row gap-6 justify-center">
                {loading ? (
                  <div className="text-[#b8953f] text-center">Loading today's top picks...</div>
                ) : featuredPicks.length > 0 ? (
                  featuredPicks.map((pick, index) => (
                    <div key={index} className="transition-all hover:transform hover:-translate-y-2">
                      {renderPickCard(pick)}
                    </div>
                  ))
                ) : (
                  <div className="text-[#b8953f] text-center p-4 bg-black/30 rounded-lg border border-[#b8953f]/20 backdrop-blur-sm">
                    Visit Gary's Picks to see today's recommendations
                  </div>
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
