import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import garyLogo from '../assets/images/gary4.svg';
import Gary20 from '../assets/images/Gary20.png';
import newspaperBg from '../assets/images/newspaper.png';

export function GaryHero() {
  return (
    <div className="relative flex flex-col justify-center items-center min-h-screen w-full px-4 py-20 overflow-hidden">
      {/* Newspaper background */}
      <div className="absolute inset-0 z-0" style={{
        backgroundImage: `url(${newspaperBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "brightness(0.9) contrast(1.2) sepia(0.15) blur(2px)",
        opacity: 0.6
      }}></div>
      
      {/* Gradient overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/65 to-black/80 z-0"></div>
      <div className="absolute inset-0 bg-black opacity-40 z-0"></div>
      {/* Gary20 image top left */}
      <img src={Gary20} alt="Gary 2.0" className="absolute top-4 left-4 w-24 h-auto z-30" />
      {/* Gold vignette accents for depth */}
      <div className="pointer-events-none absolute inset-0 z-1" aria-hidden="true">
        {/* Gold vignette corners */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#d4af37]/20 blur-3xl opacity-20" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#d4af37]/20 blur-3xl opacity-20" />
      </div>

      {/* Hero Content Centered */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-3xl mx-auto text-center mt-6">
        {/* Newspaper-style headline banner */}
        <div className="w-full max-w-lg bg-[#b8953f] py-1 mb-2 transform -rotate-1">
          <p className="uppercase text-black font-bold tracking-wide text-center text-sm md:text-base">SPORTS INSIDER EXTRA EDITION</p>
        </div>
        


        <h1 className="font-extrabold mb-8 text-white leading-tight drop-shadow-lg">
          <span className="block text-6xl md:text-8xl font-serif italic">MAKE SMARTER</span>
          <div className="w-full h-1 bg-[#b8953f] my-2"></div>
          <span className="block text-[#b8953f] text-6xl md:text-8xl font-black transform -skew-x-6 animate-goldFlicker">SPORTS BETS</span>
          <div className="w-full h-1 bg-[#b8953f] my-2"></div>
          <span className="block text-white text-lg mt-1 font-bold tracking-widest">THE WINNING EDGE SINCE 2025</span>
        </h1>

        <div className="flex flex-col sm:flex-row gap-8 justify-center mb-10 w-full items-center">
          <Link 
            to="/real-gary-picks" 
            className="inline-flex items-center justify-center bg-[#b8953f] border-2 border-[#b8953f] ring-2 ring-gray-700 text-[#232326] font-semibold py-3 w-60 min-h-[60px] rounded-full hover:bg-[#a07a2d] transition duration-300 text-lg shadow-xl glass-card backdrop-blur-xl"
          >
            Get Today's Picks
          </Link>
          <Link 
            to="/how-it-works" 
            className="inline-flex items-center justify-center bg-[#b8953f] border-2 border-[#b8953f] ring-2 ring-gray-700 text-[#232326] font-semibold py-3 w-60 min-h-[60px] rounded-full hover:bg-[#a07a2d] transition duration-300 text-lg shadow-xl glass-card backdrop-blur-xl"
          >
            How it Works
          </Link>
        </div>



      </div>
    </div>
  );
}

export default GaryHero;
