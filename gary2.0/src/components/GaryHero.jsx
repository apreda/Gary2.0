import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
// Import the correct Gary logo image
import garyLogo from '../assets/images/gary4.svg';

export function GaryHero() {
  const [isVisible, setIsVisible] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef(null);
  
  // Parallax effect for mouse movement
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!heroRef.current) return;
      
      const { left, top, width, height } = heroRef.current.getBoundingClientRect();
      const x = (e.clientX - left) / width;
      const y = (e.clientY - top) / height;
      
      setMousePosition({ x, y });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  
  // Animate in on load
  useEffect(() => {
    setIsVisible(true);
    
    // Add the perspective floor pattern dynamically
    const perspectiveFloor = document.createElement('div');
    perspectiveFloor.className = 'perspective-floor';
    if (heroRef.current) {
      heroRef.current.appendChild(perspectiveFloor);
    }
    
    return () => {
      if (heroRef.current && perspectiveFloor.parentNode === heroRef.current) {
        heroRef.current.removeChild(perspectiveFloor);
      }
    };
  }, []);
  
  const parallaxStyle = {
    transform: `translate(${mousePosition.x * -10}px, ${mousePosition.y * -10}px)`,
    transition: 'transform 0.2s ease-out',
  };

  return (
    <section 
      className="relative w-full overflow-hidden min-h-[85vh] flex items-center"
      ref={heroRef}
      style={{background: '#111111', zIndex: 1}}
    >
      {/* Dimensional Background with Strong Depth */}
      <div className="dimension-bg" style={{ backgroundColor: '#111111' }}>
        <div className="left-wall side-wall" style={{ opacity: 0.5, background: 'linear-gradient(to right, #1a1a1a, transparent)' }}></div>
        <div className="right-wall side-wall" style={{ opacity: 0.5, background: 'linear-gradient(to left, #1a1a1a, transparent)' }}></div>
      </div>
      
      {/* Reduced overlay opacity to prevent black overlay issues */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20" style={{zIndex: 1}}></div>
      <div className="absolute bottom-0 left-0 right-0 h-[100px] bg-gradient-to-t from-black/40 to-transparent" style={{zIndex: 1}}></div>
      <div className="absolute top-0 left-0 right-0 h-[60px] bg-gradient-to-b from-black/30 to-transparent" style={{zIndex: 1}}></div>
      
      {/* Gary Logo (gary4.svg) with improved positioning and z-index */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ 
        zIndex: 40, /* Much higher z-index to ensure visibility above all elements */
        transform: 'translate(288px, 0px)', /* Adjusted position to avoid being cut off */
        pointerEvents: 'none', /* Ensure it doesn't block interactions */
        background: 'none !important', /* Force transparent background */
      }}>
        <div className="relative w-[746px] h-[746px]" style={{ background: 'none !important' }}> 
          {/* Outer gold glow */}
          <div className="absolute inset-0" style={{ background: 'none !important' }}>
            <img 
              src={garyLogo} 
              alt="" 
              className="w-full h-full object-contain"
              style={{
                filter: 'blur(24px) sepia(1) saturate(2.4) brightness(1.16)',
                opacity: 0.24,
                background: 'none !important',
                position: 'relative', /* Ensure proper stacking */
              }}
            />
          </div>
          
          {/* Middle gold glow */}
          <div className="absolute inset-0" style={{ background: 'none !important' }}>
            <img 
              src={garyLogo} 
              alt="" 
              className="w-full h-full object-contain"
              style={{
                filter: 'blur(12px) sepia(1) saturate(3.2) brightness(1.24)',
                opacity: 0.36,
                background: 'none !important',
                position: 'relative', /* Ensure proper stacking */
              }}
            />
          </div>
          
          {/* Main visible image */}
          <div className="absolute inset-0" style={{ background: 'none !important' }}>
            <img 
              src={garyLogo} 
              alt="Gary AI" 
              className="w-full h-full object-contain"
              style={{
                filter: 'drop-shadow(0 0 16px rgba(212, 175, 55, 0.64)) drop-shadow(0 0 8px rgba(212, 175, 55, 0.48))',
                opacity: 1,
                background: 'none !important',
                position: 'relative', /* Ensure proper stacking */
                zIndex: 25, /* Make sure the main logo is on top */
              }}
            />
          </div>
        </div>
      </div>
      
      {/* Content Container */}
      <div 
        className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 w-full transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}
        style={{ marginTop: "96px" }} // 1 inch margin top
      >
        {/* Tech Embellishments */}
        <div className="absolute top-0 left-0 w-32 h-32 opacity-20 hidden md:block" aria-hidden="true">
          <svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 127H127V0" stroke="#D4AF37" strokeWidth="1" />
            <path d="M32 127H127V32" stroke="#D4AF37" strokeWidth="1" />
            <path d="M64 127H127V64" stroke="#D4AF37" strokeWidth="1" />
          </svg>
        </div>
        
        <div className="absolute bottom-0 right-0 w-32 h-32 opacity-20 hidden md:block" aria-hidden="true">
          <svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M128 0H0V128" stroke="#D4AF37" strokeWidth="1" />
            <path d="M96 0H0V96" stroke="#D4AF37" strokeWidth="1" />
            <path d="M64 0H0V64" stroke="#D4AF37" strokeWidth="1" />
          </svg>
        </div>
        
        {/* Content Grid - Updated text content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Column - Text */}
          <div className="text-left" style={parallaxStyle}>
            <div 
              className={`transition-opacity duration-700 delay-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
            >
              <div className="inline-block px-3 py-1 mb-6 border border-gary-gold text-gary-gold text-sm rounded-full tracking-widest uppercase bg-black/20 backdrop-blur-sm">
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
                  className="btn-primary py-3 px-8 rounded-lg text-black font-bold"
                >
                  Get Today's Picks
                </Link>
                <Link 
                  to="/how-it-works" 
                  className="btn-secondary py-3 px-8 rounded-lg font-bold"
                >
                  How It Works
                </Link>
              </div>
            </div>
          </div>
          
          {/* Right Column - Visual Element (removed floating card) */}
          <div 
            className={`flex justify-center transition-all duration-1000 delay-500 ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-20 scale-95'}`}
          >
            {/* Empty space where the card was */}
          </div>
        </div>
      </div>
    </section>
  );
}

export default GaryHero;
