import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import Gary20 from '../assets/images/Gary20.png';
import HeroBannerHeadlines from './HeroBannerHeadlines';
import PickCardPreview from './PickCardPreview';
import GaryEmblem from '../assets/images/Garyemblem.png';

export function GaryHero() {
  return (
    <div className="relative flex flex-col min-h-screen w-full overflow-visible">
      {/* Dynamic newspaper headlines background */}
      <div className="absolute inset-0 z-0 overflow-visible">
        <HeroBannerHeadlines />
      </div>
      
      {/* Gradient overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/80 to-black/95 z-1"></div>
      <div className="absolute inset-0 bg-black opacity-40 z-1"></div>
      
      {/* Gold vignette accents for depth */}
      <div className="pointer-events-none absolute inset-0 z-1" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#d4af37]/20 blur-3xl opacity-20" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#d4af37]/20 blur-3xl opacity-20" />
      </div>

      {/* Modern header with logo and navigation */}
      <header className="relative z-20 w-full py-4 px-6 lg:px-12 flex justify-between items-center">
        <div className="flex items-center">
          <img src={GaryEmblem} alt="Gary A.I." className="h-12 w-auto" />
          <span className="ml-3 text-white font-bold text-xl">GARY<span className="text-[#b8953f]">A.I.</span></span>
        </div>
      </header>

      {/* Main content area */}
      <main className="relative z-10 flex flex-1 w-full">
        <div className="container mx-auto px-4 lg:px-8 flex flex-col lg:flex-row justify-between items-center py-12 lg:py-24 gap-8 lg:gap-16">
          
          {/* Left side - Headline and CTA */}
          <div className="flex-1 flex flex-col max-w-2xl">
            {/* Newspaper-style headline banner */}
            <div className="w-full max-w-xs bg-[#b8953f] py-1 mb-6 transform -rotate-1">
              <p className="uppercase text-black font-bold tracking-wide text-center text-sm">SPORTS INSIDER EXTRA EDITION</p>
            </div>
            
            {/* Main Headline */}
            <h1 className="font-extrabold text-white leading-tight drop-shadow-lg text-left mb-8">
              <span className="block text-6xl lg:text-7xl font-serif italic mb-2">MAKE SMARTER</span>
              <div className="w-full h-1 bg-[#b8953f] my-2"></div>
              <span className="block text-[#b8953f] text-6xl lg:text-7xl font-black transform -skew-x-6 animate-goldFlicker">SPORTS BETS</span>
              <div className="w-full h-1 bg-[#b8953f] my-2"></div>
              <span className="block text-white text-lg mt-2 font-bold tracking-widest">THE WINNING EDGE SINCE 2025</span>
            </h1>

            <p className="text-white/80 text-lg mb-8 max-w-lg">
              Whether you're tracking teams, analyzing odds, or just keeping up with the latest sports analytics - Gary A.I. has your back with winning picks.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-5 mb-10">
              <Link 
                to="/real-gary-picks" 
                className="inline-flex items-center justify-center bg-[#b8953f] border border-[#b8953f] text-[#232326] font-semibold py-3 px-8 rounded-lg hover:bg-[#a07a2d] transition duration-300 text-lg shadow-lg"
              >
                Get Today's Picks
              </Link>
              <Link 
                to="/how-it-works" 
                className="inline-flex items-center justify-center bg-transparent border border-[#b8953f] text-[#b8953f] font-semibold py-3 px-8 rounded-lg hover:bg-[#b8953f]/10 transition duration-300 text-lg"
              >
                How it Works
              </Link>
            </div>
          </div>
          
          {/* Right side - Pick Card Preview */}
          <div className="flex justify-center items-center">
            <PickCardPreview />
          </div>
        </div>
      </main>

      {/* The Bears Brain Section Peek */}
      <div className="relative z-5 w-full bg-[#0e0e0e] h-24 mt-auto">
        <div className="absolute -top-16 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-[#0e0e0e]"></div>
        <div className="container mx-auto px-8 py-6 flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-[#b8953f] mr-2 animate-pulse"></div>
            <span className="text-[#b8953f] font-semibold">THE BEARS BRAIN</span>
          </div>
          <div className="text-white/60 text-sm">AI-powered insights analyzing 15+ years of sports data</div>
        </div>
      </div>
    </div>
  );
}

export default GaryHero;
