import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import garyLogo from '../assets/images/gary4.svg';
import Gary20 from '../assets/images/Gary20.png';

export function GaryHero() {
  return (
    <div className="relative flex flex-col justify-center items-center min-h-screen w-full px-4 py-20 bg-gradient-to-br from-black via-black to-black overflow-hidden">
      {/* Gary20 image top left */}
      <img src={Gary20} alt="Gary 2.0" className="absolute top-4 left-4 w-24 h-auto z-30" />
      {/* Expansive, layered backgrounds for depth */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        {/* Subtle black haze gradients */}
        <div className="absolute inset-0 bg-black" />
        <div className="absolute top-0 left-0 w-full h-1/3 bg-black" />
        {/* Gold vignette corners */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#bfa142]/20 blur-3xl opacity-30" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#bfa142]/20 blur-3xl opacity-30" />
        {/* Subtle grid/noise overlay removed for clean hero background */}
        {/* Digital grid overlays for extra depth */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-0 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5 scale-150 mix-blend-soft-light" />
        {/* Animated ambient radial gradient for subtle flicker */}
        <div className="absolute inset-0 pointer-events-none animate-heroGlow z-0" style={{background: 'radial-gradient(ellipse at 70% 20%, rgba(0,0,0,0.07) 0%, transparent 70%)'}} />
        <div className="absolute inset-0 pointer-events-none animate-heroGlow z-0" style={{background: 'radial-gradient(ellipse at 70% 20%, rgba(191,161,66,0.07) 0%, transparent 70%)'}} />
        {/* Faint top vignette for cinematic highlight, now more subtle */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#e5d3c4]/15 via-transparent to-transparent z-20 pointer-events-none" />
        {/* Radial vignette for cinematic depth, now deeper */}
        <div className="absolute inset-0 bg-gradient-radial from-black/90 via-black/99 to-black/100 opacity-100" />
        {/* Cinematic landscape/mountains silhouettes */}
        {/* Distant, extra-faded mountain layer */}
        <svg className="absolute bottom-0 left-0 w-full h-40 md:h-52 lg:h-64 xl:h-72 z-0" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg" style={{filter:'blur(5px)', opacity:0.3}} aria-hidden="true">
          <defs>
            <linearGradient id="mountainGradient2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bfa142" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#18181b" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d="M0,200 Q120,180 240,200 Q360,220 480,180 Q600,140 720,180 Q840,220 960,200 Q1080,180 1200,200 Q1320,220 1440,180 L1440,320 L0,320 Z" fill="url(#mountainGradient2)" />
        </svg>
        {/* Main mountain layer */}
        <svg className="absolute bottom-0 left-0 w-full h-48 md:h-60 lg:h-72 xl:h-80 z-10" viewBox="0 0 1440 320" fill="none" xmlns="http://www.w3.org/2000/svg" style={{filter:'blur(2px)'}} aria-hidden="true">
          <defs>
            <linearGradient id="mountainGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bfa142" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#18181b" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d="M0,240 L120,210 Q180,200 240,220 Q320,240 400,200 Q480,160 560,200 Q640,240 720,220 Q800,200 880,220 Q960,240 1040,210 Q1120,180 1200,210 Q1280,240 1440,200 L1440,320 L0,320 Z" fill="url(#mountainGradient)" />
        </svg>
      </div>

      {/* Hero Content Centered */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-3xl mx-auto text-center mt-6">
        <div className="inline-block px-4 py-2 mb-4 border border-[#bfa142]/60 text-[#bfa142] text-base md:text-lg rounded-full tracking-widest uppercase bg-black/60 backdrop-blur-xl font-semibold shadow-lg glass-card">
          Sports Handicapping 2.0
        </div>

        <h1 className="text-6xl md:text-8xl font-extrabold mb-12 text-white leading-tight drop-shadow-lg">
          <span className="block">Make Smarter</span>
          <span className="block text-[#bfa142] text-6xl md:text-8xl">Sports Bets</span>
        </h1>

        <div className="flex flex-col sm:flex-row gap-8 justify-center mb-10 w-full items-center">
          <Link 
            to="/real-gary-picks" 
            className="inline-flex items-center justify-center bg-[#bfa142] border-2 border-[#bfa142] ring-2 ring-gray-700 text-[#232326] font-semibold py-3 w-60 min-h-[60px] rounded-full hover:bg-[#a4882d] transition duration-300 text-lg shadow-xl glass-card backdrop-blur-xl"
          >
            Get Today's Picks
          </Link>
          <Link 
            to="/how-it-works" 
            className="inline-flex items-center justify-center bg-[#bfa142] border-2 border-[#bfa142] ring-2 ring-gray-700 text-[#232326] font-semibold py-3 w-60 min-h-[60px] rounded-full hover:bg-[#a4882d] transition duration-300 text-lg shadow-xl glass-card backdrop-blur-xl"
          >
            How it Works
          </Link>
        </div>

        <p className="text-base md:text-lg text-[#bfa142] mt-4 max-w-2xl mx-auto bg-black/60 border border-[#bfa142]/60 backdrop-blur-xl rounded-xl px-4 py-3 shadow-lg glass-card animate-goldFlicker">
          Gary A.I. blends sports data, fan insight, and machine learning for picks that win.
        </p>

      </div>
    </div>
  );
}

export default GaryHero;
