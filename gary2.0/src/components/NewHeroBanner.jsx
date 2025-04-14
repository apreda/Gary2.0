import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import gary1 from '../assets/images/gary1.svg';

export function NewHeroBanner() {
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
      className="relative w-full overflow-hidden min-h-[85vh] flex items-center bg-black"
      ref={heroRef}
    >
      {/* Dimensional Background with Strong Depth */}
      <div className="dimension-bg" style={{ backgroundColor: '#111' }}>
        <div className="left-wall side-wall" style={{ opacity: 0.8, background: 'linear-gradient(to right, #1a1a1a, transparent)' }}></div>
        <div className="right-wall side-wall" style={{ opacity: 0.8, background: 'linear-gradient(to left, #1a1a1a, transparent)' }}></div>
      </div>
      
      {/* Additional depth elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40 z-[1]"></div>
      <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-black to-transparent z-[1]"></div>
      <div className="absolute top-0 left-0 right-0 h-[100px] bg-gradient-to-b from-black to-transparent z-[1]"></div>
      
      {/* Large Gary Image Background - Added as an independent element for maximum visibility */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
        <div className="relative w-[700px] h-[700px]">
          {/* White outer glow */}
          <div className="absolute inset-0">
            <img 
              src={gary1} 
              alt="" 
              className="w-full h-full object-contain"
              style={{
                filter: 'blur(40px) brightness(1.5)',
                opacity: 0.4,
              }}
            />
          </div>
          
          {/* Gold middle glow */}
          <div className="absolute inset-0">
            <img 
              src={gary1} 
              alt="" 
              className="w-full h-full object-contain"
              style={{
                filter: 'blur(15px) sepia(1) saturate(5) brightness(1.5)',
                opacity: 0.5,
                animation: 'pulse 3s infinite alternate',
              }}
            />
          </div>
          
          {/* Main visible image */}
          <div className="absolute inset-0">
            <img 
              src={gary1} 
              alt="Gary AI" 
              className="w-full h-full object-contain"
              style={{
                filter: 'drop-shadow(0 0 20px white) drop-shadow(0 0 30px rgba(212, 175, 55, 0.9))',
                animation: 'float 5s infinite ease-in-out',
              }}
            />
          </div>
        </div>
      </div>
      
      {/* Content Container */}
      <div 
        className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 w-full transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}
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
        
        {/* Content Grid */}
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
              
              <p className="text-lg text-gray-300 mb-8 max-w-lg">
                Gary A.I. combines machine learning with decades of sports handicapping expertise to identify value in the betting markets.
              </p>
              
              <div className="flex flex-wrap gap-4 mb-10">
                <Link 
                  to="/picks" 
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
              
              <div className="flex gap-6 items-center border-t border-gray-700 pt-6">
                <div className="flex -space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 border-2 border-black flex items-center justify-center text-xs font-bold">JD</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-pink-600 border-2 border-black flex items-center justify-center text-xs font-bold">KT</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 border-2 border-black flex items-center justify-center text-xs font-bold">MR</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d4af37] to-yellow-600 border-2 border-black flex items-center justify-center text-xs font-bold text-black">+</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">
                    Trusted by <span className="text-white font-semibold">25,000+</span> bettors
                    <span className="text-xs text-gary-gold font-bold">243</span>
                  </div>
                </div>
                <span className="text-sm text-gray-400">Trusted by professional bettors worldwide</span>
              </div>
            </div>
          </div>
          
          {/* Right Column - Visual Element */}
          <div 
            className={`flex justify-center transition-all duration-1000 delay-500 ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-20 scale-95'}`}
          >
            <div className="relative" style={{
              ...parallaxStyle,
              transform: `translate(${mousePosition.x * 15}px, ${mousePosition.y * 15}px)`,
            }}>
              {/* Enhanced Decorative Elements with stronger glow */}
              <div className="absolute inset-0 -m-16 bg-gary-gold/20 rounded-full blur-3xl animate-pulse-glow"></div>
              <div className="absolute inset-0 -m-12 bg-gary-gold/30 rounded-full blur-2xl animate-pulse-glow" style={{animationDelay: '0.5s'}}></div>
              <div className="absolute inset-0 -m-8 bg-gary-gold/40 rounded-full blur-xl animate-pulse-glow" style={{animationDelay: '1s'}}></div>
              
              {/* Floating Card */}
              <div className="w-full max-w-md p-8 backdrop-blur-sm animate-float bg-black/90 border border-[#d4af37]/30 rounded-lg shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#d4af37] opacity-50"></div>
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#d4af37] opacity-50"></div>
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#d4af37] opacity-50"></div>
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#d4af37] opacity-50"></div>
                
                <div className="text-center mb-6">
                  <span className="inline-block p-3 rounded-full bg-[#d4af37]/10 mb-4">
                    <svg className="w-10 h-10 text-[#d4af37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                    </svg>
                  </span>
                  <h3 className="text-xl font-semibold text-white mb-1">Today's Hot Pick</h3>
                  <div className="h-px w-16 mx-auto bg-[#d4af37]/50 my-4"></div>
                </div>
                
                <div className="mb-6 text-center">
                  <div className="text-[#d4af37] font-bold text-2xl mb-1">LAKERS +3.5</div>
                  <div className="text-gray-400">vs Celtics</div>
                </div>
                
                <div className="bg-[#222222] border border-[#d4af37]/10 rounded-lg p-4 mb-6">
                  <div className="flex justify-between mb-2">
                    <div className="text-gray-400 text-sm">Line Movement</div>
                    <div className="text-[#d4af37] text-sm">+2.5 → +3.5</div>
                  </div>
                  <div className="flex justify-between mb-2">
                    <div className="text-gray-400 text-sm">Public %</div>
                    <div className="text-[#d4af37] text-sm">34%</div>
                  </div>
                  <div className="flex justify-between">
                    <div className="text-gray-400 text-sm">Gary's Edge</div>
                    <div className="text-[#d4af37] text-sm">8.7%</div>
                  </div>
                </div>
                
                <Link to="/picks" className="block w-full text-center py-3 px-4 bg-[#d4af37] hover:bg-[#e5c349] text-black font-bold rounded-lg transition-all duration-300 hover:transform hover:translate-y-[-2px] hover:shadow-lg">
                  <span>Unlock Full Analysis</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default NewHeroBanner;
