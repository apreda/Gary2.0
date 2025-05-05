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
    <section className="hero relative flex flex-col overflow-hidden dimension-bg-section" style={{ width: "100vw", height: "100vh" }}>
      {/* Hero watermark background - Gary Money image */}
      <div className="hero__watermark absolute top-1/2 left-1/2 w-[120%] h-[120%] transform -translate-x-1/2 -translate-y-1/2 scale-110 pointer-events-none z-10">
        <img 
          src="/garymoney.png" 
          alt="" 
          className="w-full h-full object-contain opacity-10 mix-blend-overlay" 
          style={{ filter: "saturate(0.8) contrast(1.1)" }}
        />
      </div>
      
      <main className="hero-inner max-w-[1440px] mx-auto flex flex-col z-20 relative w-full h-full" style={{ padding: "24px 24px" }}>
        {/* Centered Hero Content */}
        <div className="w-full mx-auto flex flex-col items-center mb-8">
          {/* NEW badge */}
          <div className="mb-6 relative">
            <div className="bg-[#b8953f] text-black text-xs font-semibold px-3 py-1 rounded-full flex items-center">
              <span className="mr-1.5 text-[10px] font-bold">NEW</span>
              <span>Introducing Gary AI: Intelligent sports betting</span>
            </div>
          </div>

          {/* Main headline - Vault-inspired typography */}
          <h1 className="mb-8 text-center" style={{ fontSize: "clamp(3.5rem, 8vw, 5rem)", lineHeight: "1.05", letterSpacing: "-0.02em", maxWidth: "1000px" }}>
            <span className="text-white font-bold">The gateway to</span><br/> 
            <span className="italic font-normal text-[#b8953f] mr-2">smart</span>
            <span className="text-white font-bold">sports bets</span>
          </h1>
          
          {/* Subheading */}
          <div className="text-center mb-10 max-w-2xl">
            <p className="text-white/80 text-xl md:text-2xl mx-auto leading-relaxed">
              With a few clicks you can access AI-powered picks with over 70% win rates across any sport and any league.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-5 mt-4 justify-center">
            <Link to="/real-gary-picks" className="hero-cta-primary px-8 py-3 text-lg">View Today's Picks</Link>
            <Link to="/how-it-works" className="hero-cta-secondary px-8 py-3 text-lg">How it Works</Link>
          </div>
          
          {/* Powered by section */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mt-8 text-white/50 text-sm">
            <span>Powered by:</span>
            <span className="font-medium text-[#b8953f]/90">SportsDB</span>
            <span className="font-medium text-[#b8953f]/90">The Odds API</span>
            <span className="font-medium text-[#b8953f]/90">OpenAI</span>
            <span className="font-medium text-[#b8953f]/90">Perplexity</span>
          </div>
        </div>

        {/* Feature highlights - pill style */}
        <div className="flex flex-wrap justify-center gap-6 mb-8 max-w-4xl mx-auto">
          <div className="flex items-center bg-[rgba(0,0,0,0.2)] backdrop-blur-sm py-2 px-4 rounded-lg border border-[#b8953f]/20">
            <span className="text-[#b8953f] mr-2">✓</span>
            <span className="text-white/90 text-sm font-medium">15+ years of sports data</span>
          </div>
          
          <div className="flex items-center bg-[rgba(0,0,0,0.2)] backdrop-blur-sm py-2 px-4 rounded-lg border border-[#b8953f]/20">
            <span className="text-[#b8953f] mr-2">✓</span>
            <span className="text-white/90 text-sm font-medium">78%+ confidence rate</span>
          </div>
          
          <div className="flex items-center bg-[rgba(0,0,0,0.2)] backdrop-blur-sm py-2 px-4 rounded-lg border border-[#b8953f]/20">
            <span className="text-[#b8953f] mr-2">✓</span>
            <span className="text-white/90 text-sm font-medium">Advanced analytics</span>
          </div>
        </div>
        
        {/* Featured Pick Cards - horizontally arranged */}
        <div className="flex flex-col items-center mt-auto mb-12">
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
