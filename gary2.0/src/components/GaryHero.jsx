import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import garyLogo from '../assets/images/Gary_Dark.png';

export function GaryHero() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 items-center max-w-7xl mx-auto px-4 pt-4">
      {/* Left Column - Text */}
      <div className="text-left">
        <div className="inline-block px-3 py-1 mb-6 border border-gary-gold text-gary-gold text-sm rounded-full tracking-widest uppercase">
          Sports Handicapping 2.0
        </div>
        
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-white">
          <span className="block">Make Smarter</span>
          <span className="block text-[#d4af37]">Sports Bets</span>
        </h1>
        
        <p className="text-lg text-gray-300 mb-5 max-w-lg">
          Gary A.I combines Machine Learning with decades of Sports Data including Storyline, Superstitions, Specific Fan Knowledge and more...
        </p>
        
        <p className="text-lg text-gray-300 mb-8 max-w-lg">
          Gary A.I is the Only A.I Sports Handicapper Designed to Actually <em className="font-semibold text-[#d4af37]">Win</em>
        </p>
        
        <div className="flex flex-wrap gap-4 mb-10">
          <Link 
            to="/real-gary-picks" 
            className="inline-block bg-[#d4af37] border border-[#d4af37] text-black font-semibold py-3 px-8 rounded-full hover:bg-[#e5c349] transition duration-300 text-lg"
          >
            Get Today's Picks
          </Link>
          <Link 
            to="/how-it-works" 
            className="inline-block bg-[#d4af37] border border-[#d4af37] text-black font-semibold py-3 px-8 rounded-full hover:bg-[#e5c349] transition duration-300 text-lg"
          >
            How it Works
          </Link>
        </div>
      </div>
      
      {/* Right Column - Image */}
      <div className="flex justify-center lg:justify-start -ml-16">
        <img 
          src={garyLogo} 
          alt="Gary AI Logo" 
          className="w-full max-w-[560px] h-auto"
        />
      </div>
    </div>
  );
}

export default GaryHero;
