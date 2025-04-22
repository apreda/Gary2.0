import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import ErrorBoundary from "../components/ErrorBoundary";
import { useUserPlan } from "../hooks/useUserPlan";
import { useNavigate } from "react-router-dom";
import { winnersService } from "../services/winnersService";
import garyLogo from '../assets/images/gary4.svg';
import garyLogo2 from '../assets/images/gary_logo.svg';
import gary1 from '../assets/images/gary4.svg';
import gary5 from '../assets/images/gary5.svg';
import gary7 from '../assets/images/gary7.svg';
import garyPromo from '../assets/images/Gary_Promo.png';
// Using public path for gary-bear-logo.svg
import { useAuth } from '../contexts/AuthContext';
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import '../styles/consolidated/premium-carousel.css';
import GaryHero from '../components/GaryHero';

// Recent Winners Feed Component
function RecentWinnersFeed() {
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWinners() {
      try {
        setLoading(true);
        const winningPicks = await winnersService.getWinningPicks(7); // Limit to 7 winners
        setWinners(winningPicks);
      } catch (error) {
        console.error('Error fetching winners:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchWinners();
  }, []);

  // Helper function to format the time difference
  const formatTimeDiff = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="bg-black/80 border border-[#d4af37]/20 rounded-lg shadow-lg overflow-hidden h-full">
      <div className="p-4 bg-[#111] border-b border-[#d4af37]/20">
        <h3 className="text-xl font-bold text-[#d4af37] flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Recent Winners
        </h3>
      </div>
      
      <div className="h-[500px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4af37 #111' }}>
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="loader border-t-2 border-[#d4af37] rounded-full w-6 h-6 animate-spin"></div>
          </div>
        ) : winners.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            No winners to display yet.
          </div>
        ) : (
          <>
            {winners.map((winner, index) => (
              <div key={winner.id || index} className="p-4 border-b border-[#222] hover:bg-black/40 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs text-[#d4af37] bg-[#d4af37]/10 px-2 py-1 rounded">{winner.league}</span>
                  <span className="text-xs text-gray-400">{winner.timestamp ? formatTimeDiff(winner.timestamp) : '—'}</span>
                </div>
                
                {winner.league === 'PARLAY' ? (
                  <>
                    <div className="font-bold text-white mb-1">
                      {winner.pick || `${winner.parlayLegs?.length || 3}-Leg Parlay ${winner.parlayOdds ? `(${winner.parlayOdds})` : ''}`}
                    </div>
                    {/* Display parlay legs if available */}
                    {winner.parlayLegs ? (
                      winner.parlayLegs.map((leg, legIndex) => (
                        <div key={legIndex} className="text-xs text-gray-400 mb-1">• {leg.pick} ✓</div>
                      ))
                    ) : (
                      // Fallback for mock data format
                      <>
                        <div className="text-xs text-gray-400 mb-1">• Lakers ML ✓</div>
                        <div className="text-xs text-gray-400 mb-1">• Cowboys -7 ✓</div>
                        <div className="text-xs text-gray-400">• Dodgers/Giants U8.5 ✓</div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="font-bold text-white mb-1">{winner.pick}</div>
                    <div className="text-sm text-gray-400">{winner.game}</div>
                  </>
                )}
                
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center">
                    <span className="text-[#d4af37] text-xs mr-1">✓</span>
                    <span className="text-xs text-gray-400">
                      Final: {winner.result?.final_score || 'Win'}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-green-500">WIN</span>
                </div>
              </div>
            ))}
            
            {/* Link to see more */}
            <div className="p-4 text-center">
              <Link 
                to="/real-gary-picks" 
                className="text-[#d4af37] text-sm hover:underline inline-flex items-center"
              >
                See all of Gary's picks
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Home() {
  const { user } = useAuth();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  // Track mouse movement for parallax effect on the card
  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = (e.clientX / window.innerWidth) - 0.5;
      const y = (e.clientY / window.innerHeight) - 0.5;
      setMousePosition({ x, y });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-visible">
      {/* Unified, immersive dark background for entire homepage */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
    {/* Layered gold spotlight for depth */}
    <div className="absolute left-1/2 top-1/3 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-[#bfa142]/20 blur-[120px] opacity-40 z-10" />
    {/* Subtle glass reflection at top edge */}
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-white/10 rounded-b-full blur-2xl opacity-30 z-10" />
    {/* Subtle shadow at bottom edge */}
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-10 bg-black/40 rounded-t-full blur-xl opacity-30 z-10" />
    {/* Subtle cream/white haze gradients (less intense, seamless) */}
    <div className="absolute inset-0 bg-gradient-to-b from-[#f7f4ed]/20 via-transparent to-transparent" />
    <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-br from-[#fffbe9]/15 via-transparent to-transparent" />
    {/* Faint cream highlight behind main content */}
    <div className="absolute bottom-24 left-0 w-full h-24 bg-gradient-to-t from-[#f7f4ed]/15 via-transparent to-transparent blur-2xl opacity-60" />
    {/* Gold vignette corners */}
    <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#d4af37]/10 blur-3xl" />
    <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#d4af37]/10 blur-3xl" />
    {/* Subtle grid/noise overlay */}
    <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-soft-light" />
    {/* Radial vignette for cinematic depth, now deeper */}
    <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#18181b]/80 to-black/95 opacity-95" />
  </div>
      <div className="relative z-10">
        <GaryHero />
        {/* Gary's Winning System Section with Hot Pick Card */}
        <section className="relative py-16 min-h-[110vh] flex flex-col items-center justify-center overflow-hidden">
          {/* Cinematic, immersive background for The Bear's Brain section */}
          <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
            {/* Layered gold spotlight for depth */}
            <div className="absolute left-1/2 top-1/3 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-[#bfa142]/20 blur-[120px] opacity-40 z-10" />
            {/* Subtle glass reflection at top edge */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-white/10 rounded-b-full blur-2xl opacity-30 z-10" />
            {/* Subtle shadow at bottom edge */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-10 bg-black/40 rounded-t-full blur-xl opacity-30 z-10" />
            {/* Subtle cream/white haze gradients */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#f7f4ed]/20 via-transparent to-transparent" />
            <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-br from-[#fffbe9]/15 via-transparent to-transparent" />
            {/* Faint cream highlight behind main content */}
            <div className="absolute bottom-24 left-0 w-full h-24 bg-gradient-to-t from-[#f7f4ed]/15 via-transparent to-transparent blur-2xl opacity-60" />
            {/* Gold vignette corners */}
            <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#d4af37]/10 blur-3xl" />
            <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#d4af37]/10 blur-3xl" />
            {/* Subtle grid/noise overlay */}
            <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-soft-light" />
            {/* Radial vignette for cinematic depth */}
            <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#18181b]/80 to-black/95 opacity-95" />
          </div>
          {/* Unified Section Content */}
          <div className="relative z-10 flex flex-col items-center w-full max-w-5xl px-2 md:px-8">
            <h2 className="text-4xl md:text-6xl font-extrabold text-center mb-8 text-[#f7e9c2] drop-shadow-lg tracking-tight shadow-gold animate-goldFlicker">
              <span className="block text-gradient bg-gradient-to-r from-[#bfa142] via-[#f7e9c2] to-[#bfa142] bg-clip-text text-transparent">The Bear's Brain</span>
            </h2>
            <p className="text-lg md:text-xl text-[#bfa142] mb-14 text-center max-w-2xl bg-black/60 border border-[#bfa142]/60 backdrop-blur-xl rounded-xl px-4 py-3 shadow-lg glass-card animate-goldFlicker">
              Experience the power of Gary A.I.'s handicapping system
            </p>
            {/* Features Row */}
            <div className="flex flex-col lg:flex-row lg:flex-nowrap flex-wrap gap-8 w-full justify-center items-stretch mb-10 overflow-visible">
  {/* Feature cards and Recent Winners grid layout */}
  <div className="w-full flex flex-col lg:flex-row gap-8 justify-center items-start mt-12 lg:mt-0 relative z-10">
    {/* Feature Cards Grid */}
    <div className="flex flex-row flex-wrap justify-center items-stretch w-full relative z-30 gap-4 md:gap-6 lg:gap-2 xl:gap-4 px-2 md:px-4">
      {/* Data Aware */}
      <div className="glass-card p-6 rounded-xl border border-[#bfa142] ring-1 ring-[#bfa142]/30 shadow-xl backdrop-blur-xl bg-gradient-to-b from-black/90 to-black/70 hover:scale-105 transition-all duration-300 animate-goldFlicker flex flex-col items-center min-w-[210px] max-w-[260px] w-full relative z-30 hover:z-50 hover:shadow-2xl hover:ring-2 hover:ring-[#bfa142]/60 group">
        <div className="absolute inset-0 bg-gradient-to-t from-[#bfa142]/5 to-transparent rounded-xl opacity-50 group-hover:opacity-80 transition-opacity"></div>
        <svg className="w-10 h-10 mb-3 text-[#d4af37] group-hover:text-[#f7e9c2] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" /></svg>
        <h3 className="text-lg font-bold text-[#bfa142] mb-2 drop-shadow tracking-wide group-hover:text-[#f7e9c2] transition-colors">Data Aware</h3>
        <p className="text-[#f7e9c2]/90 text-center text-base leading-snug tracking-wide">Understands deep analytics, but that's just the start.</p>
      </div>
      {/* Fan Brain */}
      <div className="glass-card p-6 rounded-xl border border-[#bfa142] ring-1 ring-[#bfa142]/30 shadow-xl backdrop-blur-xl bg-gradient-to-b from-black/90 to-black/70 hover:scale-105 transition-all duration-300 animate-goldFlicker flex flex-col items-center min-w-[210px] max-w-[260px] w-full relative z-30 hover:z-50 hover:shadow-2xl hover:ring-2 hover:ring-[#bfa142]/60 -ml-12 group">
        <div className="absolute inset-0 bg-gradient-to-t from-[#bfa142]/5 to-transparent rounded-xl opacity-50 group-hover:opacity-80 transition-opacity"></div>
        <svg className="w-10 h-10 mb-3 text-[#d4af37] group-hover:text-[#f7e9c2] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 14c-2.21 0-4-1.79-4-4 0-2.21 1.79-4 4-4s4 1.79 4 4c0 2.21-1.79 4-4 4zm0 2c2.67 0 8 1.34 8 4v2H4v-2c0-2.66 5.33-4 8-4z" /></svg>
        <h3 className="text-lg font-bold text-[#bfa142] mb-2 drop-shadow tracking-wide group-hover:text-[#f7e9c2] transition-colors">Fan Brain</h3>
        <p className="text-[#f7e9c2]/90 text-center text-base leading-snug tracking-wide">Reads team loyalty, emotional bias, and fan storylines to spot hidden angles.</p>
      </div>
      {/* Narrative Tracker */}
      <div className="glass-card p-6 rounded-xl border border-[#bfa142] ring-1 ring-[#bfa142]/30 shadow-xl backdrop-blur-xl bg-gradient-to-b from-black/90 to-black/70 hover:scale-105 transition-all duration-300 animate-goldFlicker flex flex-col items-center min-w-[210px] max-w-[260px] w-full relative z-30 hover:z-50 hover:shadow-2xl hover:ring-2 hover:ring-[#bfa142]/60 -ml-12 group">
        <div className="absolute inset-0 bg-gradient-to-t from-[#bfa142]/5 to-transparent rounded-xl opacity-50 group-hover:opacity-80 transition-opacity"></div>
        <svg className="w-10 h-10 mb-3 text-[#d4af37] group-hover:text-[#f7e9c2] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8h2a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2h2M12 12v.01M12 16h.01" /></svg>
        <h3 className="text-lg font-bold text-[#bfa142] mb-2 drop-shadow tracking-wide group-hover:text-[#f7e9c2] transition-colors">Narrative Tracker</h3>
        <p className="text-[#f7e9c2]/90 text-center text-base leading-snug tracking-wide">Uncovers hidden motivations and emotional weights that move the lines.</p>
      </div>
      {/* Street Smart */}
      <div className="glass-card p-6 rounded-xl border border-[#bfa142] ring-1 ring-[#bfa142]/30 shadow-xl backdrop-blur-xl bg-gradient-to-b from-black/90 to-black/70 hover:scale-105 transition-all duration-300 animate-goldFlicker flex flex-col items-center min-w-[210px] max-w-[260px] w-full relative z-30 hover:z-50 hover:shadow-2xl hover:ring-2 hover:ring-[#bfa142]/60 -ml-12 group">
        <div className="absolute inset-0 bg-gradient-to-t from-[#bfa142]/5 to-transparent rounded-xl opacity-50 group-hover:opacity-80 transition-opacity"></div>
        <svg className="w-10 h-10 mb-3 text-[#d4af37] group-hover:text-[#f7e9c2] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.24 7.76a6 6 0 11-8.48 8.48M9 13h6M9 17h6" /></svg>
        <h3 className="text-lg font-bold text-[#bfa142] mb-2 drop-shadow tracking-wide group-hover:text-[#f7e9c2] transition-colors">Street Smart</h3>
        <p className="text-[#f7e9c2]/90 text-center text-base leading-snug tracking-wide">Old-school instincts meet AI precision to sniff out real betting value.</p>
      </div>
      {/* Three-Layered Core */}
      <div className="glass-card p-6 rounded-xl border border-[#bfa142] ring-1 ring-[#bfa142]/30 shadow-xl backdrop-blur-xl bg-gradient-to-b from-black/90 to-black/70 hover:scale-105 transition-all duration-300 animate-goldFlicker flex flex-col items-center min-w-[210px] max-w-[260px] w-full relative z-30 hover:z-50 hover:shadow-2xl hover:ring-2 hover:ring-[#bfa142]/60 -ml-12 group">
        <div className="absolute inset-0 bg-gradient-to-t from-[#bfa142]/5 to-transparent rounded-xl opacity-50 group-hover:opacity-80 transition-opacity"></div>
        <svg className="w-10 h-10 mb-3 text-[#d4af37] group-hover:text-[#f7e9c2] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" strokeOpacity=".4" /><circle cx="12" cy="12" r="11" strokeOpacity=".2" /></svg>
        <h3 className="text-lg font-bold text-[#bfa142] mb-2 drop-shadow tracking-wide group-hover:text-[#f7e9c2] transition-colors">Three-Layered Core</h3>
        <p className="text-[#f7e9c2]/90 text-center text-base leading-snug tracking-wide">Sports Odds & Stats, Real-Time Storylines, and Reasoning Engine—Gary's secret sauce.</p>
      </div>
    </div>
  </div>

  {/* Recent Winners - always on top, never overlapping cards */}
  <div className="glass-card w-full lg:min-w-[320px] lg:max-w-[340px] min-h-[234px] max-h-[334px] p-5 flex flex-col justify-between rounded-xl border border-[#bfa142] ring-1 ring-[#bfa142]/30 shadow-xl backdrop-blur-xl bg-gradient-to-b from-black/90 to-black/70 animate-goldFlicker mt-8 lg:mt-0 flex-shrink-0 relative z-50 lg:ml-4" style={{marginLeft: '0', transform: 'none', ...(window.innerWidth >= 1024 ? {marginLeft: '1in'} : {})}}>
    <RecentWinnersFeed />
  </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export { Home };
export default Home;
