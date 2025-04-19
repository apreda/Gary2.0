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
    <div className="min-h-screen bg-black text-white">
      <GaryHero />
      
      {/* Gary's Winning System Section with Hot Pick Card */}
      <section className="pt-2 pb-8 bg-[#111] -mt-40 border-t-0 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
              <span className="text-[#d4af37]">The Bear's Brain</span>
            </h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto mb-14">
              Experience the power of Gary A.I.'s handicapping system
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Features in the first two columns */}
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-black/80 p-6 rounded-lg border border-[#222] shadow-lg transform transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="text-center mb-4">
                    <svg className="w-12 h-12 mx-auto text-[#d4af37]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-center mb-2 text-white">Data Aware</h3>
                  <p className="text-gray-400 text-center">Gary is built to understand the data and in-depth analytics but it's a small portion of how Gary makes decisions.</p>
                </div>
                
                <div className="bg-black/80 p-6 rounded-lg border border-[#222] shadow-lg transform transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="text-center mb-4">
                    <svg className="w-12 h-12 mx-auto text-[#d4af37]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-center mb-2 text-white">Trap Detection</h3>
                  <p className="text-gray-400 text-center">Vegas sets traps. Gary spots them. If a line feels off — too easy, too trendy — he's not biting.</p>
                </div>
                
                <div className="bg-black/80 p-6 rounded-lg border border-[#222] shadow-lg transform transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="text-center mb-4">
                    <svg className="w-12 h-12 mx-auto text-[#d4af37]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-center mb-2 text-white">Fan Data</h3>
                  <p className="text-gray-400 text-center">Gary remembers cursed teams, revenge games, and historical collapses. Superstition? Maybe. Experience? Definitely.</p>
                </div>
                
                <div className="bg-black/80 p-6 rounded-lg border border-[#222] shadow-lg transform transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="text-center mb-4">
                    <svg className="w-12 h-12 mx-auto text-[#d4af37]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-center mb-2 text-white">Gut Instinct</h3>
                  <p className="text-gray-400 text-center">When Gary's Algorithm tells him yes, Gary has the ability to Override his Pick and take the opposite. This allows Gary to go on longer winning Streaks.</p>
                </div>
              </div>
            </div>
            
            {/* Recent Winning Picks Feed - Third Column */}
            <div className="lg:col-span-1">
              <RecentWinnersFeed />
            </div>
          </div>
        </div>
        
        {/* Background embellishments */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[#d4af37]/5 blur-3xl -z-0"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-[#d4af37]/5 blur-3xl -z-0"></div>
      </section>
      
      {/* Pro Plan Section - Enhanced with glows and depth like the Winning System section */}
      <section className="relative py-16 bg-[#111] text-white overflow-hidden">
        {/* Background embellishments - same style as Winning System section */}
        <div className="absolute top-0 left-0 w-80 h-80 rounded-full bg-[#d4af37]/5 blur-3xl -z-0"></div>
        <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-[#d4af37]/5 blur-3xl -z-0"></div>
        <div className="absolute top-1/3 right-1/4 w-40 h-40 rounded-full bg-[#d4af37]/3 blur-2xl -z-0"></div>
        
        {/* Depth elements */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/20 z-[1]"></div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8">
            <div className="md:w-1/3 lg:w-1/3">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                <span className="text-[#d4af37]">Pro Membership</span>
              </h2>
              <div className="flex items-center mb-8">
                <span className="text-5xl font-bold text-white">$29</span>
                <span className="text-white/70 ml-1 text-lg">/month</span>
              </div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/90">5 Daily Picks</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/90">Parlay of the Day</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/90">Weekly Bonus Pick</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/90">PrimeTime Picks</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/90">Leaderboard Eligibility</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-white/90">Advanced Data and Analysis</span>
                </li>
              </ul>
            </div>
            
            <div className="md:w-1/2 lg:w-1/2 flex justify-center items-start">

              <div className="relative max-w-md w-full">
                {/* Enhanced glow effects */}
                <div className="absolute inset-0 -m-10 bg-gary-gold/15 rounded-full blur-2xl"></div>
                
                {/* Card with tech embellishments */}
                <div className="backdrop-blur-sm bg-black/80 p-8 border border-[#d4af37]/20 rounded-lg shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#d4af37] opacity-50"></div>
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#d4af37] opacity-50"></div>
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#d4af37] opacity-50"></div>
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#d4af37] opacity-50"></div>
                  
                  <div className="text-center mb-6">
                    <div className="mx-auto mb-4">
                      <img src={garyPromo} alt="Think you know better? Upgrade to Pro" className="w-full max-w-[264px] h-auto mx-auto" />
                    </div>
                    <div className="h-px w-16 mx-auto bg-[#d4af37]/50 my-4"></div>
                  </div>
                  
                  <div className="bg-[#222222] border border-[#d4af37]/10 rounded-lg p-4 mb-6">
                    <div className="flex justify-between mb-2">
                      <div className="text-gray-400 text-sm">Win Rate</div>
                      <div className="text-[#d4af37] text-sm">62%</div>
                    </div>
                    <div className="flex justify-between mb-2">
                      <div className="text-gray-400 text-sm">ROI</div>
                      <div className="text-[#d4af37] text-sm">+18.3%</div>
                    </div>
                    <div className="flex justify-between">
                      <div className="text-gray-400 text-sm">Games per Week</div>
                      <div className="text-[#d4af37] text-sm">15-20</div>
                    </div>
                  </div>
                  
                  <Link 
                    to="/checkout" 
                    className="block w-full text-center py-4 px-6 bg-[#d4af37] hover:bg-[#e5c349] text-black font-bold rounded-lg transition-all duration-300 hover:transform hover:translate-y-[-2px] hover:shadow-lg"
                  >
                    Upgrade Now
                  </Link>
                  <p className="text-white/50 text-center text-sm mt-4">30-day money-back guarantee</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export { Home };
export default Home;
