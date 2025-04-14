import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';
import gary1 from '../assets/images/gary1.svg';

export function HeroBanner() {
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
      {/* Enhanced Dimensional Background with more depth */}
      <div className="dimension-bg" style={{ backgroundColor: '#111' }}>
        <div className="left-wall side-wall" style={{ opacity: 0.7, background: 'linear-gradient(to right, #1a1a1a, transparent)' }}></div>
        <div className="right-wall side-wall" style={{ opacity: 0.7, background: 'linear-gradient(to left, #1a1a1a, transparent)' }}></div>
      </div>
      
      {/* Additional depth elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40 z-[1]"></div>
      <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-black to-transparent z-[1]"></div>
      <div className="absolute top-0 left-0 right-0 h-[100px] bg-gradient-to-b from-black to-transparent z-[1]"></div>
      
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
                The <span className="text-[#d4af37]">A.I. Handicapper</span> That Actually <span className="text-[#d4af37]">Wins</span>
              </h1>
              
              <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl">
                Gary combines decades of sports betting expertise with cutting-edge algorithms to deliver picks that consistently beat the house.
              </p>
              
              <div className="flex flex-wrap gap-4">
                <Link to="/daily-parlay" className="px-6 py-3 bg-[#d4af37] hover:bg-[#e5c349] text-black font-bold rounded-lg transition-all duration-300 transform hover:translate-y-[-2px] hover:shadow-lg flex items-center">
                  <span>Daily Pick</span>
                  <svg className="w-5 h-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </Link>
                <Link to="/meet-gary" className="px-6 py-3 bg-transparent border-2 border-[#d4af37] text-[#d4af37] hover:text-[#e5c349] hover:border-[#e5c349] font-bold rounded-lg transition-all duration-300 transform hover:translate-y-[-2px] hover:shadow-lg">
                  <span>Meet the Bear</span>
                </Link>
              </div>
              
              <div className="mt-8 flex items-center space-x-4">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full border-2 border-gray-800 bg-gray-700 flex items-center justify-center">
                    <span className="text-xs text-gary-gold font-bold">72%</span>
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-gray-800 bg-gray-700 flex items-center justify-center">
                    <svg className="w-4 h-4 text-gary-gold" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-gray-800 bg-gray-700 flex items-center justify-center">
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
              <div className="absolute inset-0 -m-16 bg-gary-gold/15 rounded-full blur-3xl animate-pulse-glow"></div>
              <div className="absolute inset-0 -m-12 bg-gary-gold/25 rounded-full blur-2xl animate-pulse-glow" style={{animationDelay: '0.5s'}}></div>
              <div className="absolute inset-0 -m-8 bg-gary-gold/30 rounded-full blur-xl animate-pulse-glow" style={{animationDelay: '1s'}}></div>
              
              {/* Gary Image with extreme visibility enhancement - layered glow approach */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none z-0 flex items-center justify-center">
                {/* White outer glow layer */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <img 
                    src={gary1} 
                    alt="Gary AI Background Glow" 
                    className="w-[550px] h-[550px] object-contain"
                    style={{
                      filter: 'blur(20px) brightness(2)',
                      opacity: 0.3,
                    }}
                  />
                </div>
                
                {/* Gold middle glow layer */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <img 
                    src={gary1} 
                    alt="Gary AI Middle Glow" 
                    className="w-[530px] h-[530px] object-contain"
                    style={{
                      filter: 'blur(10px) sepia(1) saturate(5) brightness(1.2)',
                      opacity: 0.5,
                    }}
                  />
                </div>
                
                {/* Main Gary image */}
                <img 
                  src={gary1} 
                  alt="Gary AI" 
                  className="w-[500px] h-[500px] object-contain relative z-10"
                  style={{
                    filter: 'drop-shadow(0 0 30px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 15px rgba(212, 175, 55, 1))',
                    opacity: 1,
                  }}
                />
              </div>
              
              {/* Floating Card */}
              <div className="w-full max-w-md p-8 backdrop-blur-sm animate-float bg-black border border-[#d4af37]/30 rounded-lg shadow-lg relative overflow-hidden">
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

export default HeroBanner;
