import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../assets/css/animations.css';
import '../styles/gritty-theme.css';
import '../styles/dimensional.css';
import garyImage from '../assets/images/gary1.svg';

// Animation component for cursive titles - same as in MeetGary.jsx
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

export function HowItWorks() {
  // Animation references
  const stepsRef = useRef(null);
  const [visible, setVisible] = useState({
    step1: false,
    step2: false,
    step3: false
  });

  // Intersection observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const step = entry.target.getAttribute('data-step');
            if (step) {
              setVisible(prev => ({ ...prev, [step]: true }));
            }
          }
        });
      },
      { threshold: 0.2 }
    );

    const stepElements = document.querySelectorAll('.step-item');
    stepElements.forEach(el => observer.observe(el));

    return () => {
      stepElements.forEach(el => observer.unobserve(el));
    };
  }, []);

  return (
    <div className="bg-black min-h-screen overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative pt-24 pb-16 px-4 md:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-6 inline-block">
            <CursiveAnimation text="The Process" />
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-white">
            How <span className="text-[#d4af37] text-glow">It Works</span>
          </h1>
          
          <p className="text-[#c0c0c0] max-w-2xl mx-auto text-lg mb-12">
            Gary's A.I. powered handicapping system combines decades of sports betting knowledge with cutting-edge technology to deliver premium picks daily.
          </p>
          
          {/* Tech Pattern Background */}
          <div className="absolute inset-0 -z-10 opacity-10">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMjIiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZ2LTEwaDJ2MTBoLTJ6bS02IDZ2LTRoMnY0aC0yem0wLTZ2LTEwaDJ2MTBoLTJ6bS02IDZ2LTRoMnY0aC0yem0wLTZ2LTEwaDJ2MTBoLTJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] bg-repeat"></div>
          </div>
          
          {/* Gold accent */}
          <div className="w-24 h-1 bg-[#d4af37] mx-auto my-12 relative">
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-[#d4af37]"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-[#d4af37]"></div>
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-[#d4af37]"></div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-[#d4af37]"></div>
          </div>
        </div>
      </section>
      
      {/* Steps Section */}
      <section className="py-16 px-4 md:px-8 relative" ref={stepsRef}>
        <div className="max-w-7xl mx-auto">
          {/* Step 1 */}
          <div 
            className={`step-item grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-24 transition-all duration-1000 ${visible.step1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
            data-step="step1"
          >
            <div className="lg:col-span-4 flex justify-center">
              <div className="w-24 h-24 rounded-full bg-[#d4af37] flex items-center justify-center text-black text-4xl font-bold shadow-lg shadow-[#d4af37]/30">1</div>
            </div>
            <div className="lg:col-span-8">
              <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">
                Gary <span className="text-[#d4af37]">Picks 'Em</span>
              </h2>
              <p className="text-[#c0c0c0] text-lg mb-6">
                Each day, Gary analyzes thousands of data points, applies his winning system, and delivers 5 Straight Picks, 1 Parlay of the Day, and A PrimeTime Pick. No fluff — just picks that aim to beat the books.
              </p>
              <div className="p-5 bg-[#111] border border-[#333] rounded-lg">
                <div className="flex flex-wrap gap-3">
                  <div className="bg-black border border-[#d4af37]/30 rounded px-4 py-2 text-[#d4af37]">Data Analysis</div>
                  <div className="bg-black border border-[#d4af37]/30 rounded px-4 py-2 text-[#d4af37]">Line Movement</div>
                  <div className="bg-black border border-[#d4af37]/30 rounded px-4 py-2 text-[#d4af37]">Public % Tracking</div>
                  <div className="bg-black border border-[#d4af37]/30 rounded px-4 py-2 text-[#d4af37]">Sharp Action</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Step 2 */}
          <div 
            className={`step-item grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-24 transition-all duration-1000 ${visible.step2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
            data-step="step2"
            style={{ transitionDelay: '200ms' }}
          >
            <div className="lg:col-span-8 order-2 lg:order-1">
              <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">
                You Make <span className="text-[#d4af37]">the Call</span>
              </h2>
              <p className="text-[#c0c0c0] text-lg mb-6">
                Click a pick to reveal Gary's wager and analysis. Then choose:
                Bet With Gary or Fade the Bear — either way, you're in the game.
              </p>
              <div className="flex flex-wrap gap-4 mt-6">
                <div className="bg-[#d4af37] text-black font-bold px-6 py-3 rounded-lg shadow-lg shadow-[#d4af37]/30">
                  Bet With Gary
                </div>
                <div className="bg-black text-[#d4af37] border border-[#d4af37] font-bold px-6 py-3 rounded-lg">
                  Fade the Bear
                </div>
              </div>
            </div>
            <div className="lg:col-span-4 order-1 lg:order-2 flex justify-center">
              <div className="w-24 h-24 rounded-full bg-[#d4af37] flex items-center justify-center text-black text-4xl font-bold shadow-lg shadow-[#d4af37]/30">2</div>
            </div>
          </div>
          
          {/* Step 3 */}
          <div 
            className={`step-item grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-16 transition-all duration-1000 ${visible.step3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
            data-step="step3"
            style={{ transitionDelay: '400ms' }}
          >
            <div className="lg:col-span-4 flex justify-center">
              <div className="w-24 h-24 rounded-full bg-[#d4af37] flex items-center justify-center text-black text-4xl font-bold shadow-lg shadow-[#d4af37]/30">3</div>
            </div>
            <div className="lg:col-span-8">
              <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">
                Track the <span className="text-[#d4af37]">Results</span>
              </h2>
              <p className="text-[#c0c0c0] text-lg mb-6">
                Your picks get logged. Your win/loss stats update. And Gary's record updates in real time. See how you stack up against the Bear and the rest of the leaderboard.
              </p>
              <div className="p-5 bg-[#111] border border-[#333] rounded-lg">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-black p-4 rounded-lg border border-[#333]">
                    <div className="text-sm text-gray-400 mb-1">Win Rate</div>
                    <div className="text-xl text-[#d4af37] font-bold">72%</div>
                  </div>
                  <div className="bg-black p-4 rounded-lg border border-[#333]">
                    <div className="text-sm text-gray-400 mb-1">ROI</div>
                    <div className="text-xl text-[#d4af37] font-bold">+21.4%</div>
                  </div>
                  <div className="bg-black p-4 rounded-lg border border-[#333]">
                    <div className="text-sm text-gray-400 mb-1">Streak</div>
                    <div className="text-xl text-[#d4af37] font-bold">W4</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-16 px-4 md:px-8 bg-gradient-to-b from-black to-[#111]">
        <div className="max-w-7xl mx-auto text-center relative">
          {/* Tech embellishments */}
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

          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
            Ready to <span className="text-[#d4af37]">Win with Gary?</span>
          </h2>
          
          <p className="text-[#c0c0c0] max-w-2xl mx-auto text-lg mb-10">
            Get instant access to today's premium picks and start building your winning record with Gary A.I.
          </p>
          
          <div className="flex flex-wrap gap-4 justify-center">
            <Link 
              to="/real-gary-picks" 
              className="bg-[#d4af37] hover:bg-[#e5c349] text-black font-semibold px-8 py-4 rounded-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg relative overflow-hidden group"
            >
              <span className="relative z-10">Get Today's Picks</span>
              <div className="absolute inset-0 w-full h-full bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default HowItWorks;
