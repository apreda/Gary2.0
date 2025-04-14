import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import garyLogo from '../assets/images/gary4.svg';
import garyLogo2 from '../assets/images/gary_logo.svg';
import gary1 from '../assets/images/gary4.svg';
import gary5 from '../assets/images/gary5.svg';
import gary7 from '../assets/images/gary7.svg';
// Using public path for gary-bear-logo.svg
import { useAuth } from '../contexts/AuthContext';
import '../assets/css/animations.css';
import '../styles/gritty-theme.css';
import '../styles/dimensional.css';
import HeroBanner from '../components/HeroBanner';

// High-Tech Animation Component
function CursiveAnimation({ text }) {
  const [visible, setVisible] = useState(false);
  const [charIndex, setCharIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    // Start the animation after a short delay
    const visibilityTimer = setTimeout(() => {
      setVisible(true);
    }, 1000);
    return () => clearTimeout(visibilityTimer);
  }, []);

  useEffect(() => {
    // Type out the text character by character
    if (charIndex < text.length) {
      const timer = setTimeout(() => {
        setCharIndex(charIndex + 1);
      }, 140); // Adjust typing speed here
      return () => clearTimeout(timer);
    } else {
      // When typing is complete, set up cursor blinking
      const cursorTimer = setInterval(() => {
        setShowCursor(prev => !prev);
      }, 530);
      return () => clearInterval(cursorTimer);
    }
  }, [charIndex, text]);

  return (
    <span className="tech-text-container" 
          style={{
            fontFamily: "'Kaushan Script', cursive",
            fontWeight: 500,
            letterSpacing: '0.02em',
            display: 'inline-block',
            paddingBottom: '10px',
            fontSize: '1.56em',
          }}>
      {/* Background text (for consistent layout) */}
      <span className="opacity-0">{text}</span>
      
      {/* Animated text with tech effects */}
      <span className="absolute left-0 top-0 flex flex-wrap">
        {text.split('').map((char, index) => (
          <span 
            key={index}
            className={`transition-all duration-300 transform ${index <= charIndex ? 'opacity-100 scale-100 tech-grey-text' : 'opacity-0 scale-90'}`}
            style={{
              animationDelay: `${index * 0.1}s`,
              display: 'inline-block',
              animation: index <= charIndex ? `techReveal 0.5s ${index * 0.08}s forwards` : 'none',
              position: 'relative',
              opacity: 0,
              transform: 'translateY(8px)',
              transition: 'all 0.4s cubic-bezier(0.2, 0, 0.3, 1)',
            }}>
            {char}
            {/* High-tech glint effect */}
            {index <= charIndex && (
              <span 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent" 
                style={{
                  transform: 'skewX(45deg) translateX(-100%)',
                  animation: 'glintEffect 2.5s infinite',
                  animationDelay: `${index * 0.2}s`,
                  opacity: 0.4,
                  pointerEvents: 'none',
                }}
              />
            )}
          </span>
        ))}
        {/* Blinking cursor effect */}
        {charIndex >= 0 && (
          <span 
            className={`inline-block h-[80%] w-[2px] bg-gray-500 ml-1 self-center ${showCursor ? 'opacity-100' : 'opacity-0'}`} 
            style={{
              transition: 'opacity 0.2s',
              display: charIndex >= text.length ? 'inline-block' : 'none',
            }}
          />
        )}
      </span>
      
      {/* Tech line animation */}
      <span className="absolute bottom-0 left-0 right-0 flex justify-between">
        <span 
          className="tech-underline"
          style={{
            width: `${(charIndex / text.length) * 100}%`,
            background: 'linear-gradient(90deg, transparent 0%, rgba(170,170,170,0.6) 20%, rgba(204,204,204,0.9) 50%, rgba(170,170,170,0.6) 80%, transparent 100%)',
            boxShadow: '0 0 10px rgba(170,170,170,0.6), 0 0 20px rgba(170,170,170,0.3), 0 0 45px rgba(255,215,0,0.4)',
          }}>
        </span>
      </span>

      {/* Add a subtle scanning line effect - using regular styling */}
    </span>
  );
}

export function Home() {
  const { user } = useAuth();
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);

  const quotes = [
    "I don't chase losses, I chase winners since before you were born.",
    "My model finds value where the books slip up. That's how we eat.",
    "Numbers don't lie, but they don't tell the whole story. I do.",
    "Been reading line movements like a book since '74.",
    "Vegas fears one thing: a sharp with a system that works."
  ];

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentQuoteIndex((prevIndex) => (prevIndex + 1) % quotes.length);
    }, 8000);
    
    return () => clearInterval(intervalId);
  }, [quotes.length]);

  return (
    <div className="bg-black min-h-screen overflow-x-hidden">
      {/* Custom Hero Banner designed to match the screenshot */}
      <section className="bg-black min-h-[80vh] relative overflow-hidden py-16 md:py-20 px-4 md:px-8 w-full">
        {/* Dimensional background elements */}
        <div className="dimension-bg opacity-30 pointer-events-none">
          <div className="left-wall side-wall" style={{ opacity: 0.1 }}></div>
          <div className="right-wall side-wall" style={{ opacity: 0.1 }}></div>
        </div>
        
        {/* Subtle perspective floor effect */}
        <div className="perspective-floor fixed bottom-0 left-0 right-0 pointer-events-none z-0" style={{ opacity: 0.05, height: '50%' }}></div>
        
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100%25\' height=\'100%25\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'grid\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M 40 0 L 0 0 0 40\' fill=\'none\' stroke=\'%23d4af37\' stroke-width=\'0.5\' stroke-opacity=\'0.05\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'url(%23grid)\' /%3E%3C/svg%3E")',
          backgroundSize: '40px 40px'
        }}></div>

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Search bar styling (decorative) */}
          <div className="w-full max-w-md mb-16 rounded-full border border-gray-700 h-10"></div>
          
          <div className="relative">
            {/* Gary Bear SVG - Takes up whole right side and blends with text */}
            <div className="absolute top-[-180px] right-[-220px] md:right-[-170px] lg:right-[-120px] hidden md:block" style={{ pointerEvents: 'none' }}>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-l from-black to-transparent z-20 opacity-20"></div>
                <img src={gary1} alt="Gary Bear Logo" className="w-[800px] h-[800px] relative z-10" style={{
                  filter: 'drop-shadow(0 0 25px rgba(212,175,55,0.35))'
                }} />
              </div>
            </div>
            
            <div className="relative z-20">
              {/* Main headline matching the screenshot */}
              <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6 relative z-30">
                <div className="text-white">Gary <span className="text-[#d4af37]">A.I.</span></div>
                <div className="text-[#d4af37]">The Handicapper</div> 
                <div className="text-white">That <em className="italic">Actually</em></div>
                <div className="text-[#d4af37]">Wins</div>
              </h1>
              
              <p className="text-gray-300 text-lg mb-8 max-w-lg">
                Gary combines decades of sports betting expertise with cutting-edge algorithms to deliver picks that consistently beat the house.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link to="/picks" className="bg-[#d4af37] text-black py-3 px-6 rounded font-bold inline-flex items-center justify-center hover:bg-[#e5c349] transition-all">
                  <span>Daily Pick</span>
                  <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7-7 7M5 12h16" />
                  </svg>
                </Link>
                <Link to="/about" className="border border-[#d4af37] text-[#d4af37] py-3 px-6 rounded font-bold inline-flex items-center justify-center hover:bg-[#d4af37]/10 transition-all">
                  Meet the Bear
                </Link>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-black/50 rounded-full border border-gray-700 px-3 py-1">
                  <span className="text-[#d4af37] font-bold text-lg mr-1">72%</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#d4af37] mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-400 text-xs">243</span>
                </div>
                <span className="text-gray-400 text-sm">Trusted by professional bettors worldwide</span>
              </div>
            </div>
            
            {/* Mobile Gary image - Only shown on smaller screens */}
            <div className="flex justify-center mt-10 md:hidden">
              <img src={gary1} alt="Gary Bear Logo" className="w-96 h-96 relative z-10" style={{
                filter: 'drop-shadow(0 0 20px rgba(212,175,55,0.25))'
              }} />
            </div>
          </div>
        </div>
      </section>
      
      {/* Visual separator between hero and content */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center">
          <div className="h-px bg-gradient-to-r from-transparent via-gary-gold/30 to-transparent w-full"></div>
          <div className="px-4 text-gary-gold/50 text-sm font-medium whitespace-nowrap">EXPLORE GARY</div>
          <div className="h-px bg-gradient-to-r from-transparent via-gary-gold/30 to-transparent w-full"></div>
        </div>
      </div>
      
      {/* Section with placeholder content */}
      <section className="py-16 bg-[#f9f6f0] mt-0 border-t-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#333333]">Gary's Winning System</h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Experience the power of Gary A.I.'s handicapping system
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Feature cards would go here */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-2">Data Analysis</h3>
              <p>Historical trends and real-time stats</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-2">Winning Edge</h3>
              <p>Identifying value opportunities</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-2">Trap Detection</h3>
              <p>Avoiding oddsmaker bait</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-2">Gut Feeling</h3>
              <p>Experience meets analytics</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Pro Plan Section */}
      <section className="relative py-16 bg-black text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="lg:w-1/2">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                <span className="text-[#d4af37]">Pro Membership</span>
              </h2>
              <div className="flex items-center mb-8">
                <span className="text-5xl font-bold text-white">$10</span>
                <span className="text-white/70 ml-1 text-lg">/month</span>
              </div>
              
              <ul className="space-y-4 mb-8">
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/90">All premium picks daily</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/90">Statistical analysis</span>
                </li>
              </ul>
            </div>
            
            <div className="lg:w-1/2 flex justify-center lg:justify-end items-center">
              <div className="max-w-md w-full">
                <Link 
                  to="/upgrade" 
                  className="relative block w-full text-center py-4 px-6 bg-[#d4af37] text-black font-bold text-lg rounded-lg"
                >
                  Upgrade Now
                </Link>
                <p className="text-white/50 text-center text-sm mt-4">30-day money-back guarantee</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;
