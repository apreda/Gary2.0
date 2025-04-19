import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import garyLogo from '../assets/images/gary3.png';
import { useAuth } from '../contexts/AuthContext';
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import { FlipCard } from '../components/FlipCard';

// High-Tech Animation Component - same as in Home.jsx
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
    </span>
  );
}

export function MeetGary() {
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
    <div className="bg-white dark:bg-black min-h-screen overflow-x-hidden"> 
      {/* Hero Section */}
      <section className="py-0 px-4 md:px-8 relative w-full overflow-x-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-8 md:space-y-0 py-8 md:py-12 lg:py-16">
            <div className="w-full md:w-1/2 text-center md:text-left animate-fadeIn" style={{ animationDuration: '0.8s' }}>
              <div className="mb-10">
                <div className="relative inline-block">
                  <CursiveAnimation text="Meet. Gary." />
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 text-white">
                  The Only <span className="text-[#d4af37] text-glow">A.I. Sport Handicapper</span>
                </h1>
                <p className="text-[#c0c0c0] max-w-xl mx-auto md:mx-0 text-lg md:text-xl">
                  With 72% accuracy and decades of experience, Gary combines sharp betting insights with cutting-edge A.I. to deliver winning picks daily.
                </p>
              </div>
              
              <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                <Link 
                  to="/picks" 
                  className="bg-[#d4af37] hover:bg-[#e5c349] text-black font-semibold px-6 py-3 rounded-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg relative overflow-hidden group"
                >
                  <span className="relative z-10">See Today's Picks</span>
                  <div className="absolute inset-0 w-full h-full bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                </Link>
                
                <Link 
                  to="/upgrade" 
                  className="bg-transparent border-2 border-[#d4af37] text-[#d4af37] hover:text-[#e5c349] hover:border-[#e5c349] font-semibold px-6 py-3 rounded-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  Upgrade to Pro
                </Link>
              </div>
            </div>
            
            <div className="w-full md:w-1/2 flex justify-center items-center animate-fadeIn" style={{ animationDelay: '0.2s', animationDuration: '0.8s' }}>
              <div className="relative">
                <img src={garyLogo} alt="Gary A.I." className="max-w-full h-auto" width="400" style={{ filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.3))' }} />
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* We'll add more sections here in the next edits */}
      
    </div>
  );
}
