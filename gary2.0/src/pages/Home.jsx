import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { useAuth } from '../contexts/AuthContext';
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import '../assets/css/logo-responsive.css';
import { supabase } from "../supabaseClient";
// Using the public Gary50.png image from the public folder

function Home() {
  const { user } = useAuth();
  const [featuredPicks, setFeaturedPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [winRate, setWinRate] = useState('67%');

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
                  }}
                >
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

  // Load featured picks from the database
  // Fetch win rate and yesterday's performance
  useEffect(() => {
    const fetchWinRateData = async () => {
      try {
        // Fetch all picks to calculate win rate
        const { data: picksData, error: picksError } = await supabase
          .from("game_results")
          .select("*")
          .order('date', { ascending: false });
          
        if (picksError) {
          console.error("Error fetching game results:", picksError);
          return;
        }
        
        if (picksData && picksData.length > 0) {
          // Calculate overall win rate
          const totalGames = picksData.length;
          const wins = picksData.filter(game => game.result === 'win').length;
          const calculatedWinRate = Math.round((wins / totalGames) * 100);
          setWinRate(`${calculatedWinRate}%`);
          
          // Get yesterday's record
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayString = yesterday.toISOString().split('T')[0]; // Format: YYYY-MM-DD
          
          const yesterdayGames = picksData.filter(game => game.date?.includes(yesterdayString));
          if (yesterdayGames.length > 0) {
            const yesterdayWins = yesterdayGames.filter(game => game.result === 'win').length;
            const yesterdayLosses = yesterdayGames.length - yesterdayWins;
            setYesterdayRecord(`${yesterdayWins}-${yesterdayLosses}`);
          }
        }
      } catch (err) {
        console.error("Error fetching win rate data:", err);
      }
    };
    
    fetchWinRateData();
  }, []);
  
  useEffect(() => {
    const fetchFeaturedPicks = async () => {
      try {
        // Use Eastern Time consistently for all date operations
        const now = new Date();
        
        // Convert to Eastern Time zone properly
        const easternTimeOptions = { timeZone: "America/New_York" };
        const easternDateString = now.toLocaleDateString('en-US', easternTimeOptions);
        const easternTimeString = now.toLocaleTimeString('en-US', easternTimeOptions);
        
        // Create a new date object with Eastern Time components
        const [month, day, year] = easternDateString.split('/');
        const [time, period] = easternTimeString.match(/([\d:]+)\s(AM|PM)/).slice(1);
        const [hours, minutes] = time.split(':');
        
        // Format the date string properly (YYYY-MM-DD)
        const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const easternHour = parseInt(hours) + (period === 'PM' && hours !== '12' ? 12 : 0);
        
        // Format full time for logging
        const fullEasternTimeString = `${month}/${day}/${year} ${hours}:${minutes} ${period}`;
        
        console.log(`Home: Properly formatted Eastern date: ${dateString}, Hour: ${easternHour}`);
        console.log(`Home: Original time parts: M:${month} D:${day} Y:${year} H:${hours} M:${minutes} ${period}`);
        
        let queryDate = dateString;
        console.log(`Home: Current Eastern Time: ${fullEasternTimeString} (Hour: ${easternHour})`);
        
        // Before 10am EST, always use yesterday's picks if available
        if (easternHour < 10) {
          console.log("Home: It's before 10am Eastern Time - looking for yesterday's picks");
          
          // Calculate yesterday's date properly using the date parts we already have
          const yesterdayDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          yesterdayDate.setDate(yesterdayDate.getDate() - 1);
          
          // Format yesterday's date as YYYY-MM-DD
          const yesterdayYear = yesterdayDate.getFullYear();
          const yesterdayMonth = (yesterdayDate.getMonth() + 1).toString().padStart(2, '0');
          const yesterdayDay = yesterdayDate.getDate().toString().padStart(2, '0');
          const yesterdayString = `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;
          
          // Check if yesterday's picks exist
          const { data: yesterdayData, error: yesterdayError } = await supabase
            .from("daily_picks")
            .select("picks, date")
            .eq("date", yesterdayString)
            .maybeSingle();
            
          if (!yesterdayError && yesterdayData && yesterdayData.picks) {
            console.log(`Home: Using picks from previous day (${yesterdayString}) since it's before 10am`);
            queryDate = yesterdayString;
          } else {
            console.log(`Home: No picks found for previous day ${yesterdayString}, will try today's picks`); 
          }
        }
        
        // Query Supabase for picks using the determined date
        console.log(`Home: Querying picks for date: ${queryDate}`);
        const { data, error } = await supabase
          .from("daily_picks")
          .select("picks, date")
          .eq("date", queryDate)
          .maybeSingle();
          
        if (error) {
          console.error("Error fetching picks:", error);
          return;
        }
        
        // If we have picks, get the top one with highest confidence
        if (data && data.picks) {
          const picksArray = typeof data.picks === "string" ? JSON.parse(data.picks) : data.picks;
          
          // Sort by confidence (high to low) and get top pick
          const sortedPicks = [...picksArray].sort((a, b) => {
            const confA = a.confidence ? parseFloat(a.confidence) : 0;
            const confB = b.confidence ? parseFloat(b.confidence) : 0;
            return confB - confA;
          }).slice(0, 1); // Get only top 1 pick
          
          setFeaturedPicks(sortedPicks);
        } else {
          // Use default picks if none found
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
        {/* Gold vignette corners - enhanced with white glow */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#b8953f]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#b8953f]/10 blur-3xl" />
        
        {/* White accent areas for contrast - 6% opacity */}
        <div className="absolute top-1/4 right-1/3 w-[300px] h-[300px] rounded-full bg-white/[0.06] blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 w-[400px] h-[400px] rounded-full bg-white/[0.06] blur-3xl" />
        
        {/* Subtle stars/shimmer effect */}
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.15] mix-blend-soft-light" />
        
        {/* White highlight streaks removed */}
        
        {/* Radial vignette for cinematic depth - slightly enhanced */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/20 opacity-30" />
      </div>
      <div className="relative z-10">
        {/* Hero Section - Integrated directly */}
        <section className="hero relative flex flex-col overflow-hidden min-h-screen">
          {/* Hero watermark background - Gary Money image with a subtle gradient overlay */}
          <div className="hero__watermark absolute top-1/2 left-1/2 w-[120%] h-[120%] transform -translate-x-1/2 -translate-y-1/2 scale-110 pointer-events-none z-10">
            <div className="absolute inset-0 bg-[url('/garyai-watermark2.png')] bg-center bg-no-repeat bg-contain opacity-[0.035] filter blur-sm"></div>
          </div>

          {/* Content wrapper that spans the full width to center both the logo and main content */}
          <div className="relative mx-auto w-full max-w-[1440px]">
            {/* Create a fixed-position container that follows the main content container */}
            {/* Use a combination of responsive classes and custom styles for the logo */}
            <div className="absolute top-24 z-30 logo-container" style={{ left: 'calc(50% - 600px - 120px)' }}>
              <img
                src="/coin2.png"
                alt="Gold Coin"
                className="w-auto h-auto logo-image object-contain transition-all duration-300"
                style={{ 
                  animation: "float 6s ease-in-out infinite",
                  maxWidth: "18.24rem"
                }}
              />
            </div>
            
            {/* Main content area - use full width at all times */}
            <div className="relative z-20 w-full mx-auto">
              <main className="hero-inner flex flex-col w-full h-full" style={{ padding: "24px 24px" }}>
                {/* Centered Hero Content */}
             <div className="w-full mx-auto flex flex-col items-center mt-20 md:mt-24" style={{ paddingLeft: "0", paddingRight: "0" }}>
              {/* NEW badge - gold-colored and oval-shaped with border */}
              <div className="mb-8 relative mt-16 flex justify-center w-full">  
                <div className="text-black text-sm font-medium px-5 py-1.5 rounded-full flex items-center border border-gray-800" 
                     style={{ background: '#b8953f', color: '#1a1a1a' }}>
                  <span className="mr-2 font-bold">NEW</span>
                  <span>Introducing Gary AI: Intelligent Sports Bets</span>
                </div>
              </div>

              {/* Main headline - Simple and impactful */}
              <div className="relative mb-6 w-full">
                <h1 className="text-center w-full" style={{ fontSize: "clamp(3.5rem, 6vw, 5rem)", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
                  <div className="max-w-[920px] mx-auto">
                    <span className="text-white font-bold">Make </span>
                    <span className="italic font-normal text-[#B8953F]">Smarter</span>
                    <span className="text-white font-bold"> Sports Bets </span>
                    <span className="text-white font-bold">with </span>
                    <span className="italic font-normal"><span className="text-white">GARY</span><span className="text-[#B8953F]">.AI</span></span>
                  </div>
                </h1>
                
                {/* Win Rate Badge - positioned as standalone element */}
                <div className="fixed lg:block hidden" style={{ 
                  top: '120px', 
                  right: '50px', 
                  transform: 'rotate(0deg)',
                  background: '#B8953F',
                  color: '#1a1a1a',
                  padding: '0.75rem 2rem',
                  borderRadius: '999px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
                  border: '2.5px solid #1a1a1a',
                  fontWeight: 'bold',
                  zIndex: 100
                }}>
                  <span className="text-2xl font-bold">Win Rate: {winRate}</span>
                </div>
              </div>
              
              {/* Removed empty spacing div to tighten layout */}

              {/* Technology badges - using original tags from GaryHero */}
              <div className="flex flex-wrap justify-center p-2 mb-8 mx-auto max-w-3xl w-full">
                <div className="flex gap-3 flex-wrap justify-center w-full">
                  <div className="relative bg-[#B8953F] text-sm font-bold px-5 py-1.5 rounded-full flex items-center justify-center transition-all duration-300" style={{ minWidth: '120px', color: '#1a1a1a', overflow: 'hidden', position: 'relative' }} onMouseEnter={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(250%)';
                  }} onMouseLeave={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(-100%)';
                  }}>
                    <div className="shine-effect" style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '30%',
                      height: '100%',
                      background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)',
                      transform: 'translateX(-100%)',
                      transition: 'transform 0.6s ease-in-out',
                      pointerEvents: 'none',
                      zIndex: 2
                    }}></div>
                    <span style={{ fontWeight: 'bold' }}>Odds API</span>
                  </div>
                  <div className="relative bg-[#B8953F] text-sm font-bold px-5 py-1.5 rounded-full flex items-center justify-center transition-all duration-300" style={{ minWidth: '120px', color: '#1a1a1a', overflow: 'hidden', position: 'relative' }} onMouseEnter={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(250%)';
                  }} onMouseLeave={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(-100%)';
                  }}>
                    <div className="shine-effect" style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '30%',
                      height: '100%',
                      background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)',
                      transform: 'translateX(-100%)',
                      transition: 'transform 0.6s ease-in-out',
                      pointerEvents: 'none',
                      zIndex: 2
                    }}></div>
                    <span style={{ fontWeight: 'bold' }}>SportsDB</span>
                  </div>
                  <div className="relative bg-[#B8953F] text-sm font-bold px-5 py-1.5 rounded-full flex items-center justify-center transition-all duration-300" style={{ minWidth: '120px', color: '#1a1a1a', overflow: 'hidden', position: 'relative' }} onMouseEnter={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(250%)';
                  }} onMouseLeave={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(-100%)';
                  }}>
                    <div className="shine-effect" style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '30%',
                      height: '100%',
                      background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)',
                      transform: 'translateX(-100%)',
                      transition: 'transform 0.6s ease-in-out',
                      pointerEvents: 'none',
                      zIndex: 2
                    }}></div>
                    <span style={{ fontWeight: 'bold' }}>Turbo 3.5 Mini</span>
                  </div>
                  <div className="relative bg-[#B8953F] text-sm font-bold px-5 py-1.5 rounded-full flex items-center justify-center transition-all duration-300" style={{ minWidth: '120px', color: '#1a1a1a', overflow: 'hidden', position: 'relative' }} onMouseEnter={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(250%)';
                  }} onMouseLeave={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(-100%)';
                  }}>
                    <div className="shine-effect" style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '30%',
                      height: '100%',
                      background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)',
                      transform: 'translateX(-100%)',
                      transition: 'transform 0.6s ease-in-out',
                      pointerEvents: 'none',
                      zIndex: 2
                    }}></div>
                    <span style={{ fontWeight: 'bold' }}>Perplexity</span>
                  </div>
                  <div className="relative bg-[#B8953F] text-sm font-bold px-5 py-1.5 rounded-full flex items-center justify-center transition-all duration-300" style={{ minWidth: '120px', color: '#1a1a1a', overflow: 'hidden', position: 'relative' }} onMouseEnter={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(250%)';
                  }} onMouseLeave={(e) => {
                    const shine = e.currentTarget.querySelector('.shine-effect');
                    shine.style.transform = 'translateX(-100%)';
                  }}>
                    <div className="shine-effect" style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '30%',
                      height: '100%',
                      background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)',
                      transform: 'translateX(-100%)',
                      transition: 'transform 0.6s ease-in-out',
                      pointerEvents: 'none',
                      zIndex: 2
                    }}></div>
                    <span style={{ fontWeight: 'bold' }}>StatCast API</span>
                  </div>
                </div>
              </div>
              
              {/* CTA Buttons - Exact Vault style from original GaryHero */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-center">
                <Link 
                  to="/real-gary-picks" 
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
              <h2 className="text-white text-3xl font-bold mb-8">Today's Free Pick</h2>
              
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
                {/* This section formerly contained the Gary50.png background */}

                {/* Benefits pill at top like in screenshot */}
                <div className="flex justify-center mb-6 relative z-20">
                  <div className="inline-block bg-[#171717] py-1.5 px-4 rounded-full">
                    <span className="text-[#B8953F] font-medium text-sm flex items-center">
                      <span className="mr-2 w-3 h-3 bg-[#B8953F] rounded-sm inline-block"></span>
                      Benefits
                    </span>
                  </div>
                </div>

                {/* 2. Section heading */}
                <div className="text-center mb-14 px-6 relative z-20">
                  <h2 className="text-white text-5xl font-bold leading-tight mb-6">
                    The <span className="text-[#B8953F]">Bears Brain</span>
                  </h2>
                  <p className="text-white/70 text-lg max-w-2xl mx-auto">
                    The Bears Brain combines decades of betting expertise with cutting-edge AI to identify value others miss.
                  </p>
                </div>

                {/* Cards grid like the provided image */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 mb-6 relative z-20">
                  
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6 relative z-20">
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
                <div className="px-6 mt-8 relative z-20">
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
            
            {/* Gambling Disclaimer */}
            <div className="mt-6 max-w-4xl mx-auto px-4 border-t border-gray-700 pt-6 text-xs">
              <p className="mb-2">
                DISCLAIMER: This site is 100% for entertainment purposes only and does not involve real money betting or prizes. You must be 18+ years old to utilize Gary.ai.
              </p>
              <p className="mb-2">
                If you or someone you know may have a gambling problem, Gary.ai For crisis counseling and referral services, call 1-800 GAMBLER (1-800-426-2537). For more information and resources, visit our Responsible Gaming page.
              </p>
              <p>
                Gambling problem? Call 1-800-GAMBLER (Available in the US)
                Call 877-8-HOPENY or text HOPENY (467369) (NY)
                Call 1-800-327-5050 (MA), 1-800-NEXT-STEP (AZ), 1-800-BETS-OFF (IA), 1-800-981-0023 (PR)
              </p>
            </div>
          </footer>
          </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Home;
