import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import HeroBannerHeadlines from './HeroBannerHeadlines';
import GaryEmblem from '../assets/images/Garyemblem.png';
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
    <div className="relative flex flex-col min-h-screen w-full overflow-visible">
      {/* Newspaper headlines background with lower opacity and blur */}
      <div className="absolute inset-0 z-0 overflow-visible opacity-75 blur-[2px]">
        <HeroBannerHeadlines />
      </div>
      
      {/* Gradient overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/80 to-black/95 z-1"></div>
      
      {/* Gold accents and vignette for depth */}
      <div className="pointer-events-none absolute inset-0 z-1" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#c19c60]/20 blur-3xl opacity-20" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#c19c60]/20 blur-3xl opacity-20" />
      </div>

      {/* Header with logo */}
      <header className="relative z-20 w-full py-4 px-6 lg:px-12 flex justify-between items-center">
        <div className="flex items-center">
          <img src={GaryEmblem} alt="Gary A.I." className="h-12 w-auto" />
          <span className="ml-3 text-white font-bold text-xl">GARY<span className="text-[#c19c60]">A.I.</span></span>
        </div>
      </header>

      {/* Main content area */}
      <main className="relative z-10 flex flex-1 w-full">
        <div className="container mx-auto px-4 lg:px-8 flex flex-col lg:flex-row items-center py-12 lg:py-16 gap-8 lg:gap-12">
          
          {/* Left side - Headline and CTA */}
          <div className="flex-1 flex flex-col max-w-2xl">
            {/* Newspaper-style headline banner */}
            <div className="w-full max-w-xs bg-[#c19c60] py-1 mb-6 transform -rotate-1">
              <p className="uppercase text-black font-bold tracking-wide text-center text-sm">SPORTS INSIDER EXTRA EDITION</p>
            </div>
            
            {/* Main Headline */}
            <h1 className="font-extrabold text-white leading-tight mb-8">
              <span className="block text-6xl lg:text-7xl font-serif italic mb-2">MAKE SMARTER</span>
              <div className="w-full h-1 bg-[#c19c60] my-2"></div>
              <span className="block text-[#c19c60] text-6xl lg:text-7xl font-black transform -skew-x-6">SPORTS BETS</span>
              <div className="w-full h-1 bg-[#c19c60] my-2"></div>
              <span className="block text-white text-lg mt-2 font-bold tracking-widest">THE WINNING EDGE SINCE 2025</span>
            </h1>

            <p className="text-white/80 text-lg mb-8 max-w-lg">
              Whether you're tracking teams, analyzing odds, or just keeping up with the latest sports analytics - Gary A.I. has your back with winning picks.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-5 mb-10">
              <Link 
                to="/real-gary-picks" 
                className="inline-flex items-center justify-center bg-[#c19c60] text-black font-semibold py-3 px-8 rounded-md hover:bg-opacity-90 transition duration-300 text-lg"
              >
                Get Today's Picks
              </Link>
              <Link 
                to="/how-it-works" 
                className="inline-flex items-center justify-center bg-[#1e1e1e] border border-[#333] text-white font-semibold py-3 px-8 rounded-md hover:bg-[#252525] transition duration-300 text-lg"
              >
                How it Works
              </Link>
            </div>
          </div>
          
          {/* Right side - Modern Card Design from Screenshot 2 */}
          <div className="flex justify-center items-center">
            {loading ? (
              <div className="w-[480px] h-[320px] rounded-xl bg-black/50 flex items-center justify-center border border-[#c19c60]/30">
                <div className="w-8 h-8 border-4 border-[#c19c60]/20 border-t-[#c19c60] rounded-full animate-spin"></div>
              </div>
            ) : featuredPick ? (
              <div className="w-[480px] h-[320px]">
                {/* Modern Card Design - Matches Screenshot 2 exactly */}
                <div style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                  color: '#ffffff',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  {/* Card Header - Today's Picks */}
                  <div className="w-full text-center py-3 text-[#c19c60] font-bold text-xl tracking-wide">
                    TODAY'S PICKS
                  </div>
                  
                  {/* Card Content */}
                  <div className="flex flex-1 p-4">
                    {/* Left side (70%) */}
                    <div className="w-[70%] pr-4 border-r border-[#c19c60] flex flex-col">
                      {/* League/Matchup/Game Time sections */}
                      <div className="flex justify-between mb-4">
                        <div>
                          <div className="text-gray-400 uppercase text-xs tracking-wider mb-1">LEAGUE</div>
                          <div className="text-white text-lg font-medium">{featuredPick.league || 'NBA'}</div>
                        </div>
                        <div>
                          <div className="text-gray-400 uppercase text-xs tracking-wider mb-1">MATCHUP</div>
                          <div className="text-white text-lg font-medium">
                            {(featuredPick.homeTeam && featuredPick.awayTeam) ? 
                              `${featuredPick.awayTeam.split(' ').pop()} @ ${featuredPick.homeTeam.split(' ').pop()}` : 
                              (featuredPick.game ? featuredPick.game : 'TBD')}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400 uppercase text-xs tracking-wider mb-1">GAME TIME</div>
                          <div className="text-white text-lg font-medium">{featuredPick.time || '9:30 PM ET'}</div>
                        </div>
                      </div>
                      
                      {/* Gary's Pick */}
                      <div className="mb-4">
                        <div className="text-gray-400 uppercase text-xs tracking-wider mb-1">GARY'S PICK</div>
                        <div className="text-[#c19c60] text-2xl font-bold">
                          {featuredPick.pick || 'Missing Pick Data'}
                        </div>
                      </div>
                      
                      {/* Rationale Preview */}
                      <div className="text-gray-300 text-sm line-clamp-3 mb-4">
                        {featuredPick.rationale ? featuredPick.rationale.substring(0, 120) + '...' : 'Analysis not available'}
                      </div>
                      
                      {/* Take Your Pick */}
                      <div className="mt-auto">
                        <div className="text-gray-400 uppercase text-xs tracking-wider mb-2">TAKE YOUR PICK</div>
                        <div className="flex gap-3">
                          <Link 
                            to="/real-gary-picks"
                            className="flex-1 bg-[#c19c60]/15 text-[#c19c60] font-semibold py-2 text-center rounded border border-[#c19c60]/30 hover:bg-[#c19c60]/25 transition-colors text-sm uppercase tracking-wider"
                          >
                            Bet
                          </Link>
                          <Link 
                            to="/real-gary-picks"
                            className="flex-1 bg-gray-800 text-gray-300 font-semibold py-2 text-center rounded border border-gray-700 hover:bg-gray-700 transition-colors text-sm uppercase tracking-wider"
                          >
                            Fade
                          </Link>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right side (30%) */}
                    <div className="w-[30%] pl-4 flex flex-col items-center justify-center">
                      {/* Gary Coin Image */}
                      <div className="w-[130px] h-[130px] rounded-full bg-[#c19c60] flex items-center justify-center mb-4 p-1">
                        <img 
                          src={GaryEmblem} 
                          alt="Gary Coin" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                      
                      {/* Confidence */}
                      <div className="text-center">
                        <div className="text-gray-400 uppercase text-xs tracking-wider mb-1">CONFIDENCE</div>
                        <div className="text-[#c19c60] text-xl font-bold">
                          {featuredPick.confidence ? 
                            `${Math.round(parseFloat(featuredPick.confidence) * 100)}%` : 
                            '78%'}
                        </div>
                      </div>
                      
                      {/* View Analysis Button */}
                      <Link 
                        to="/real-gary-picks"
                        className="mt-4 w-full bg-[#c19c60]/15 text-[#c19c60] font-semibold py-2 text-center rounded border border-[#c19c60]/30 hover:bg-[#c19c60]/25 transition-colors text-xs uppercase tracking-wider"
                      >
                        View Analysis
                      </Link>
                    </div>
                  </div>
                  
                  {/* Card Footer */}
                  <div className="text-center pb-2 text-[#c19c60] font-medium">
                    1 / 4
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-[480px] h-[320px] rounded-xl bg-black/50 flex items-center justify-center border border-[#c19c60]/30 p-6 text-center">
                <p className="text-[#c19c60]">Featured pick not available. Visit Gary's Picks to see today's recommendations.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* The Bears Brain Section Peek */}
      <div className="relative z-5 w-full bg-[#0e0e0e] h-24 mt-auto">
        <div className="absolute -top-16 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-[#0e0e0e]"></div>
        <div className="container mx-auto px-8 py-6 flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-[#c19c60] mr-2 animate-pulse"></div>
            <span className="text-[#c19c60] font-semibold">THE BEARS BRAIN</span>
          </div>
          <div className="text-white/60 text-sm">AI-powered insights analyzing 15+ years of sports data</div>
        </div>
      </div>
    </div>
  );
}

export default GaryHero;
