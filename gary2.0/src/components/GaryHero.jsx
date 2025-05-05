import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import '../styles/hero.css';
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
    <section className="hero relative flex flex-col min-h-screen w-full overflow-hidden dimension-bg-section">
      {/* Hero watermark background - Gary Money image */}
      <div className="hero__watermark absolute top-1/2 left-1/2 w-[120%] h-[120%] transform -translate-x-1/2 -translate-y-1/2 scale-110 pointer-events-none z-10">
        <img 
          src="/garymoney.png" 
          alt="" 
          className="w-full h-full object-contain opacity-10 mix-blend-overlay" 
          style={{ filter: 'saturate(0.8) contrast(1.1)' }}
        />
      </div>
      
      <main className="max-w-[1440px] mx-auto px-6 md:px-8 py-24 flex flex-col flex-grow z-20 relative">
        <div className="w-full mx-auto">
          <div className="flex flex-col lg:flex-row gap-8 items-center">
            {/* Left side - Headlines and Buttons */}
            <div className="hero__content lg:flex-1 p-5 z-20 relative max-w-3xl mx-auto lg:mx-0">
              {/* AI Analytics Badge */}
              <div className="flex items-center mb-6 relative">
                <div className="w-3 h-3 rounded-full bg-[#b8953f] animate-pulse mr-3"></div>
                <span className="text-[#b8953f] text-sm font-medium tracking-widest uppercase">AI-Powered Analytics</span>
              </div>
              
              {/* Main heading with gold accent */}
              <h1 className="mb-6" style={{ fontSize: 'clamp(2.5rem, 6vw, 3.75rem)', lineHeight: '1.4' }}>
                <span className="text-white font-bold" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>Smarter </span> 
                <span className="bg-clip-text text-transparent bg-gradient-to-br from-[#d4af37] via-[#b8953f] to-[#e9c96a] font-extrabold" style={{ textShadow: '0 4px 12px rgba(0,0,0,0.2)', WebkitBackgroundClip: 'text' }}>Sports Bets</span>
              </h1>
              
              {/* Subheading with decorative line */}
              <div className="relative mb-10 overflow-hidden">
                <h2 className="text-4xl md:text-5xl font-bold text-white" style={{ lineHeight: '1.4', textShadow: '0 4px 12px rgba(0,0,0,0.4)', letterSpacing: '0.02em' }}>
                  Powered by Gary AI
                </h2>
                <div className="absolute -bottom-1 left-0 w-1/2 h-px bg-gradient-to-r from-transparent via-[#b8953f]/60 to-transparent"></div>
              </div>
              
              {/* Optional content backdrop for better readability */}
              <div className="bg-[#1a1a1a]/75 backdrop-blur-sm p-8 rounded-xl border-l-4 border-[#b8953f] shadow-2xl relative overflow-hidden mb-8" style={{ boxShadow: '0 15px 35px -5px rgba(0,0,0,0.5), 0 0 25px rgba(212, 175, 55, 0.08)' }}>
                {/* Feature bullets */}
                <ul className="space-y-6 relative" style={{ lineHeight: '1.6' }}>
                  <li className="flex items-start group transition-all duration-300 hover:translate-x-1">
                    <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-[#b8953f]/30 to-[#d4af37]/20 rounded-full flex items-center justify-center mt-1 mr-3 backdrop-blur-sm border border-[#b8953f]/10">
                      <span className="text-[#d4af37] text-sm">✓</span>
                    </span>
                    <span className="text-white/90 text-lg md:text-xl font-light" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>15+ years of sports data analysis</span>
                  </li>
                  <li className="flex items-start group transition-all duration-300 hover:translate-x-1">
                    <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-[#b8953f]/30 to-[#d4af37]/20 rounded-full flex items-center justify-center mt-1 mr-3 backdrop-blur-sm border border-[#b8953f]/10">
                      <span className="text-[#d4af37] text-sm">✓</span>
                    </span>
                    <span className="text-white/90 text-lg md:text-xl font-light" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>Daily picks with 78%+ confidence</span>
                  </li>
                  <li className="flex items-start group transition-all duration-300 hover:translate-x-1">
                    <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-[#b8953f]/30 to-[#d4af37]/20 rounded-full flex items-center justify-center mt-1 mr-3 backdrop-blur-sm border border-[#b8953f]/10">
                      <span className="text-[#d4af37] text-sm">✓</span>
                    </span>
                    <span className="text-white/90 text-lg md:text-xl font-light" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>Detailed analysis & reasoning</span>
                  </li>
                </ul>
              </div>
              
              {/* CTA Buttons */}
              <div className="hero-cta flex flex-col sm:flex-row gap-4 mt-8">
                <Link to="/real-gary-picks" className="hero-cta-primary">Get Today's Picks</Link>
                <Link to="/how-it-works" className="hero-cta-secondary">How it Works</Link>
              </div>
            </div>
              
            {/* Right side - Featured Pick Card */}
            <div className="lg:flex-1 md:p-5 justify-center flex">
              {/* Featured Pick Card for Today */}
              {!loading && featuredPick ? (
                <div className="w-full max-w-[500px] bg-gradient-to-b from-[#1e1e1e] to-[#131313] rounded-xl p-8 shadow-2xl border border-white/5 flex flex-col">
                  {/* Card Header - Pick Banner */}
                  <div className="mb-6">
                    <div className="bg-[rgba(184,149,63,0.15)] text-[#b8953f] font-bold text-xl py-3 px-4 text-center tracking-wider uppercase rounded-lg">
                      {featuredPick.pick || 'DENVER NUGGETS +9.5 -110'}
                    </div>
                  </div>
                  
                  {/* Rationale Section */}
                  <div className="flex-1 flex flex-col">
                    <div className="bg-black/20 p-7 rounded-md border border-white/10 text-lg leading-relaxed text-white w-full h-full overflow-y-auto">
                      {/* Rationale Heading */}
                      <div className="text-xs opacity-60 uppercase tracking-widest mb-3">
                        Rationale
                      </div>
                      
                      {/* Display the rationale */}
                      <p className="m-0 font-normal opacity-90">
                        {featuredPick.rationale || 'Thunder are the better squad, but a 9.5-point line is disrespectful to a battle-tested Nuggets team even on the road. Recent matchups between these teams have been close, and Denver\'s defense has been improving. While OKC has home court advantage, the Nuggets\' championship experience will keep this game competitive. The large spread provides value for Denver backers, even if they don\'t win outright.'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-[480px] h-[320px] rounded-xl bg-black/50 flex items-center justify-center border border-[#b8953f]/30 p-6 text-center">
                  <p className="text-[#b8953f]">Featured pick not available. Visit Gary's Picks to see today's recommendations.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* The Bears Brain Section Peek */}
      <div className="relative z-5 w-full dimension-bg-section h-24 mt-auto">
        <div className="absolute -top-16 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-[#0e0e0e]"></div>
        <div className="container mx-auto px-8 py-6 flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-[#b8953f] mr-2 animate-pulse"></div>
            <span className="text-[#b8953f] font-semibold">THE BEARS BRAIN</span>
          </div>
          <div className="text-white/60 text-sm">AI-powered insights analyzing 15+ years of sports data</div>
        </div>
      </div>
    </section>
  );
}

export default GaryHero;
