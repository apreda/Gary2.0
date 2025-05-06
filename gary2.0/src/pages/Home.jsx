import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { useAuth } from '../contexts/AuthContext';
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import { supabase } from "../supabaseClient";
// Using the public Gary50.png image from the public folder

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

    return (
      <div style={{ width: 576, height: 384, perspective: '1000px', cursor: 'pointer' }}>
        {/* Card container with 3D effect */}
        <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)' }}>
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
                    {displayPick.league || 'MLB'}
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
                    {(displayPick.homeTeam && displayPick.awayTeam) ? 
                      `${displayPick.awayTeam.split(' ').pop()} @ ${displayPick.homeTeam.split(' ').pop()}` : 
                      (displayPick.game ? displayPick.game : 'TBD')}
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
                  color: '#bfa142', /* Keeping gold color for the actual pick */
                  wordBreak: 'break-word',
                  marginBottom: '0.75rem'
                }}>
                  {displayPick.pick || 'MISSING PICK'}
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
              top: 0,  /* Aligned to card edge */
              bottom: 0, /* Aligned to card edge */
              width: '30%',
              borderLeft: '2.25px solid #bfa142', /* Gold border */
              padding: '1.5rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(135deg, rgba(55, 55, 58, 1) 0%, rgba(40, 40, 42, 0.95) 100%)', /* Much darker and more distinct */
              boxShadow: '-10px 0 15px rgba(0, 0, 0, 0.4)', /* Interior shadow only */
              borderRadius: '0 16px 16px 0', /* Rounded on right side only */
              clipPath: 'inset(0px 0px 0px -20px)', /* Clip shadow to prevent overflow */
              zIndex: 2, /* Ensure it appears above other content */
              transform: 'translateZ(10px)', /* 3D effect */
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
                  {displayPick.time ? 
                    (function() {
                      let time = displayPick.time.includes('ET') ? displayPick.time : `${displayPick.time} ET`;
                      return time.replace(/:([0-9])\s/, ':0$1 ');
                    })() : '10:10 PM ET'}
                </div>
              </div>
              
              {/* Coin Image centered - no background */}
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
                    width: 130, /* 20% bigger than previous 108px */
                    height: 130, /* 20% bigger than previous 108px */
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
                  {typeof displayPick.confidence === 'number' ? 
                    Math.round(displayPick.confidence * 100) + '%' : 
                    (displayPick.confidence || '75%')}
                </div>
                
                {/* Click to flip instruction with subtle design */}
                <button
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: 'rgba(184, 149, 63, 0.1)',
                    border: '1px solid #b8953f',
                    borderRadius: '0.25rem',
                    color: '#b8953f',
                    fontWeight: '600',
                    fontSize: '0.875rem',
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

          {/* Gary image - larger and positioned to overlap with text */}
          <div className="absolute top-0 left-0 z-10 hidden md:block" style={{ maxWidth: "230px", marginTop: "50px", marginLeft: "-20px" }}>
            <img
              src="/Gary50.png"
              alt="Gary AI Bear"
              className="w-full h-auto"
              style={{ 
                opacity: 0.7, 
                filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.4))",
                transform: "rotate(2deg)"
              }}
            />
          </div>
          
          <main className="hero-inner max-w-[1440px] mx-auto flex flex-col z-20 relative w-full h-full" style={{ padding: "24px 24px" }}>
            {/* Centered Hero Content */}
            <div className="w-full mx-auto flex flex-col items-center mt-20 md:mt-24" style={{ paddingLeft: "0", paddingRight: "0" }}>
              {/* NEW badge - gold-colored and oval-shaped with border */}
              <div className="mb-8 relative mt-16">  {/* moved down a quarter inch */}
                <div className="text-black text-sm font-medium px-5 py-1.5 rounded-full flex items-center border border-gray-800" 
                     style={{ background: '#b8953f', color: '#1a1a1a' }}>
                  <span className="mr-2 font-bold">NEW</span>
                  <span>Introducing Gary AI: Intelligent sports betting</span>
                </div>
              </div>

              {/* Main headline - Simple and impactful */}
              <h1 className="mb-10 text-center" style={{ fontSize: "clamp(3.5rem, 6vw, 5rem)", lineHeight: "1.1", letterSpacing: "-0.02em", maxWidth: "920px" }}>
                <div>
                  <span className="text-white font-bold">Make </span>
                  <span className="italic font-normal text-[#B8953F]">Smarter</span>
                  <span className="text-white font-bold"> Sports Bets </span>
                  <span className="text-white font-bold">with </span>
                  <span className="italic font-normal"><span className="text-white">GARY</span><span className="text-[#B8953F]">.AI</span></span>
                </div>
              </h1>
              
              {/* Subheading - Matching Vault's font weight and spacing */}
              <div className="text-center mb-8 max-w-2xl">
                <p className="text-white/75 text-base md:text-lg mx-auto leading-relaxed font-light">
                  Powered by AI analysis of real-time sports data to identify high-confidence betting opportunities.
                </p>
              </div>

              {/* Technology badges - using original tags from GaryHero */}
              <div className="flex flex-wrap justify-center p-4 mb-8 mx-auto max-w-3xl">
                <div className="flex gap-4 flex-wrap justify-center">
                  <div className="bg-[#B8953F] text-sm font-bold px-5 py-2 rounded-full flex items-center border border-[#B8953F]/80" style={{ color: '#000000' }}>
                    <span style={{ color: '#000000' }}>Odds API</span>
                  </div>
                  <div className="bg-[#B8953F] text-sm font-bold px-5 py-2 rounded-full flex items-center border border-[#B8953F]/80" style={{ color: '#000000' }}>
                    <span style={{ color: '#000000' }}>SportsDB</span>
                  </div>
                  <div className="bg-[#B8953F] text-sm font-bold px-5 py-2 rounded-full flex items-center border border-[#B8953F]/80" style={{ color: '#000000' }}>
                    <span style={{ color: '#000000' }}>Turbo 3.5 Mini</span>
                  </div>
                  <div className="bg-[#B8953F] text-sm font-bold px-5 py-2 rounded-full flex items-center border border-[#B8953F]/80" style={{ color: '#000000' }}>
                    <span style={{ color: '#000000' }}>Perplexity</span>
                  </div>
                  <div className="bg-[#B8953F] text-sm font-bold px-5 py-2 rounded-full flex items-center border border-[#B8953F]/80" style={{ color: '#000000' }}>
                    <span style={{ color: '#000000' }}>StatCast API</span>
                  </div>
                </div>
              </div>
              
              {/* CTA Buttons - Exact Vault style from original GaryHero */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-center">
                <Link 
                  to="/picks" 
                  className="bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] text-white font-medium rounded-md border border-[rgba(255,255,255,0.1)] backdrop-blur-sm transition duration-200 ease-in-out"
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

            {/* The Bears Brain Section - Dark theme matching homepage - moved up 2.5 inches */}
            <div className="-mt-4 mb-36 w-full">
              <section className="relative py-16 max-w-[1400px] mx-auto">

                {/* Benefits pill at top like in screenshot */}
                <div className="flex justify-center mb-6">
                  <div className="inline-block bg-[#171717] py-1.5 px-4 rounded-full">
                    <span className="text-[#B8953F] font-medium text-sm flex items-center">
                      <span className="mr-2 w-3 h-3 bg-[#B8953F] rounded-sm inline-block"></span>
                      Benefits
                    </span>
                  </div>
                </div>

                {/* 2. Section heading */}
                <div className="text-center mb-14 px-6">
                  <h2 className="text-white text-5xl font-bold leading-tight mb-6">
                    The <span className="text-[#B8953F]">Bears Brain</span>
                  </h2>
                  <p className="text-white/70 text-lg max-w-2xl mx-auto">
                    The Bears Brain combines decades of betting expertise with cutting-edge AI to identify value others miss.
                  </p>
                </div>

                {/* Cards grid like the provided image */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 mb-6">
                  
                  {/* Card 1: Statistical Brain */}
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      Statistical Brain
                    </h3>
                    <p className="text-white/70 mb-6">
                      Leverages a dozen sportsbooks' worth of raw odds, player metrics, weather factors and arena-specific performance data to spot mispriced lines.
                    </p>
                    <div className="relative mt-6">
                      <div className="flex justify-end mb-1">
                        <div className="bg-[#B8953F] text-black text-xs font-bold rounded-full px-2 py-1">+48%</div>
                      </div>
                      <div className="relative h-20">
                        <svg className="w-full h-full" viewBox="0 0 300 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M0,80 C50,80 70,40 120,40 C170,40 180,20 225,20 C270,20 280,60 300,60" stroke="#B8953F" strokeWidth="3" fill="none" strokeLinecap="round"/>
                          <circle cx="225" cy="20" r="8" fill="#B8953F" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {/* Card 2: Fan Brain */}
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      Fan Brain
                    </h3>
                    <p className="text-white/70 mb-6">
                      Reads social sentiment, ticket-split data and "sharp money" flows to separate the crowd's hype from true betting value.
                    </p>
                    <div className="space-y-3 mt-6">
                      <div className="flex justify-end">
                        <div className="bg-[#2a2a2a] rounded-2xl px-4 py-2 max-w-xs">
                          <p className="text-white text-sm">What's the sentiment for Chiefs vs Broncos?</p>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-[#B8953F] ml-2 flex items-center justify-center text-xs font-bold text-black">GB</div>
                      </div>
                      
                      <div className="flex">
                        <div className="w-8 h-8 rounded-full bg-[#B8953F] mr-2 flex items-center justify-center text-xs font-bold text-black">AI</div>
                        <div className="bg-[#B8953F]/20 rounded-2xl px-4 py-2 max-w-xs border border-[#B8953F]/30">
                          <p className="text-white text-sm">Sharp money coming in on Broncos +7</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Second row of cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6">
                  {/* Card 3: Narrative Tracker */}
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      Narrative Tracker
                    </h3>
                    <p className="text-white/70 mb-6">
                      Detects when media storylines—big games, star players, revenge matchups—are skewing lines, then factors those emotional weights back into the model.
                    </p>
                    <div className="mt-4 relative h-36 flex items-center justify-center">
                      <div className="absolute w-24 h-24 rounded-full bg-[#B8953F]/20 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-[#B8953F]/40 flex items-center justify-center">
                          <span className="text-[#B8953F] font-bold text-lg">NT</span>
                        </div>
                      </div>
                      
                      {/* Network nodes */}
                      <div className="absolute top-1/4 right-1/4 bg-[#2a2a2a] rounded-full py-1 px-3 border border-[#B8953F]/30">
                        <span className="text-xs text-white">ESPN</span>
                      </div>
                      
                      <div className="absolute bottom-1/4 left-1/4 bg-[#2a2a2a] rounded-full py-1 px-3 border border-[#B8953F]/30">
                        <span className="text-xs text-white">Twitter</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Card 4: Street Smart */}
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      Street Smart
                    </h3>
                    <p className="text-white/70 mb-6">
                      Blends old-school handicapping instincts with real-time injury reports, lineup swaps and venue quirks, nabbing opportunities before the public catches on.
                    </p>
                    <div className="mt-4 relative h-36">
                      <div className="absolute top-0 left-1/4 transform -translate-x-1/2 bg-[#2a2a2a] rounded-full px-3 py-1 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-xs">Injury Alert</span>
                      </div>
                      
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#2a2a2a] rounded-full px-3 py-1 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-xs">Venue Data</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Fifth card in its own row */}
                <div className="px-6 mt-8">
                  <div className="relative bg-[#1a1a1a] rounded-3xl p-10 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <h3 className="text-[#B8953F] font-bold text-2xl mb-3">
                      Three-Layered Core
                    </h3>
                    <p className="text-white/70 mb-6">
                      Gary's secret sauce: three distinct processing layers—Sports Odds & Stats, Real-Time Storylines, and a Deep Reasoning Engine—that together crank your prediction accuracy through the roof.
                    </p>
                    <div className="mt-4 flex justify-center space-x-12 py-4">
                      <div className="bg-[#2a2a2a] rounded-full py-2 px-4 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-sm">Sports Odds & Stats</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-full py-2 px-4 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-sm">Real-Time Storylines</span>
                      </div>
                      <div className="bg-[#2a2a2a] rounded-full py-2 px-4 border border-[#B8953F]/30">
                        <span className="text-[#B8953F] text-sm">Deep Reasoning Engine</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </main>
          
          {/* Terms and Privacy links */}
          <footer className="py-8 text-center text-gray-500 text-sm">
            <div className="flex justify-center space-x-6">
              <a href="/terms" className="hover:text-gray-300 transition-colors duration-200">Terms of Service</a>
              <a href="/privacy" className="hover:text-gray-300 transition-colors duration-200">Privacy Policy</a>
            </div>
            <div className="mt-2">© {new Date().getFullYear()} GARY.AI. All rights reserved.</div>
          </footer>
        </section>
      </div>
    </div>
  );
}

export default Home;
