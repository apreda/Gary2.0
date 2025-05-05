import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import HeroBannerHeadlines from './HeroBannerHeadlines';
import RetroPickCard from './RetroPickCard';
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
            
            {/* Main Headline - Styled similar to Revelo in reference image */}
            <h1 className="font-extrabold text-white leading-tight mb-8">
              <span className="block text-5xl lg:text-6xl mb-2">All your work,</span>
              <span className="block text-5xl lg:text-6xl">finally in one place</span>
            </h1>

            <p className="text-white/80 text-lg mb-8 max-w-lg">
              Whether you're tracking teams, analyzing odds, or just keeping up with the latest sports analytics - Gary A.I. has your back with winning picks.
            </p>
            
            {/* CTA Buttons - Styled similar to reference image */}
            <div className="flex flex-col sm:flex-row gap-5 mb-10">
              <Link 
                to="/real-gary-picks" 
                className="inline-flex items-center justify-center bg-[#c19c60] text-black font-semibold py-3 px-8 rounded-md hover:bg-opacity-90 transition duration-300 text-lg"
              >
                Try it free
              </Link>
              <Link 
                to="/how-it-works" 
                className="inline-flex items-center justify-center bg-[#1e1e1e] border border-[#333] text-white font-semibold py-3 px-8 rounded-md hover:bg-[#252525] transition duration-300 text-lg"
              >
                See how it works →
              </Link>
            </div>
          </div>
          
          {/* Right side - Actual RetroPickCard */}
          <div className="flex justify-center items-center">
            {loading ? (
              <div className="w-[480px] h-[320px] rounded-xl bg-black/50 flex items-center justify-center border border-[#c19c60]/30">
                <div className="w-8 h-8 border-4 border-[#c19c60]/20 border-t-[#c19c60] rounded-full animate-spin"></div>
              </div>
            ) : featuredPick ? (
              <div className="transform scale-[0.85] origin-center">
                <RetroPickCard pick={featuredPick} />
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
