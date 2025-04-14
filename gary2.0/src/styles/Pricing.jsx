import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/rainingMoney.css';

// Money Rain Animation Component
const MoneyRain = () => {
  useEffect(() => {
    const container = document.getElementById('money-container');
    const createMoneyBill = () => {
      const bill = document.createElement('div');
      bill.className = 'money-bill';
      
      // Random positioning and animation parameters
      const startPosX = Math.random() * 100;
      const rotation = Math.random() * 360;
      const duration = 3 + Math.random() * 5;
      const delay = Math.random() * 3;
      const scale = 0.5 + Math.random() * 0.5;
      
      bill.style.left = `${startPosX}%`;
      bill.style.animation = `fall ${duration}s linear ${delay}s infinite`;
      bill.style.transform = `rotate(${rotation}deg) scale(${scale})`;
      
      container.appendChild(bill);
      return bill;
    };
    
    // Create initial money bills
    const bills = [];
    for (let i = 0; i < 30; i++) {
      bills.push(createMoneyBill());
    }
    
    return () => {
      // Cleanup on unmount
      bills.forEach(bill => bill.remove());
    };
  }, []);
  
  return <div id="money-container" className="money-container"></div>;
};

export function Pricing() {
  return (
    <div className="min-h-screen text-white bg-black relative overflow-hidden">
      {/* Money Rain Animation */}
      <MoneyRain />
      
      {/* Background tech grid pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
      
      <div className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Hero Section */}
        <section className="mb-16">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#d4af37] to-yellow-300 mb-6">
              Gary's Money Machine
            </h1>
            
            <div className="max-w-3xl mx-auto bg-black/80 backdrop-blur p-6 rounded-lg border border-[#d4af37]/30 mb-8">
              <p className="text-xl sm:text-2xl italic mb-4">💬 Gary says:</p>
              <p className="text-2xl sm:text-3xl font-medium mb-6">
                "You're either gonna spend $10 here... or lose $100 trying to guess without me. Your call, kid."
              </p>
              <p className="text-xl text-[#d4af37]">👉 Unlock Gary's picks. Get in. Get paid.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
              <Link to="/signin" className="cta-button px-6 py-4 rounded-lg font-bold text-lg flex items-center justify-center">
                🔓 Upgrade Now
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <Link to="/results" className="free-button px-6 py-4 rounded-lg font-bold text-lg flex items-center justify-center">
                📈 See Past Results
              </Link>
            </div>
          </div>
        </section>
        
        {/* Pricing Cards Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Choose Your Winning Plan</h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Get access to Gary's winning picks and start making smarter bets today.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="bg-gradient-to-b from-[#222] to-black rounded-2xl border border-gray-800 overflow-hidden transform transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_25px_rgba(212,175,55,0.2)]">
              <div className="p-6 sm:p-8">
                <h3 className="text-xl font-bold mb-2">The Freeloader</h3>
                <div className="flex items-baseline mb-4">
                  <span className="text-4xl font-extrabold text-white">$0</span>
                  <span className="text-gray-400 ml-2">/month</span>
                </div>
                
                <div className="mt-6 space-y-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>1 Daily Pick</span>
                  </div>
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>1 Monthly Bonus Pick</span>
                  </div>
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Ride or Fade Stats</span>
                  </div>
                </div>
                
                <button className="free-button w-full py-3 rounded-lg font-bold text-center mt-8">
                  Stay Free
                </button>
              </div>
            </div>
            
            {/* Pro Plan */}
            <div className="bg-gradient-to-b from-[#1a1a1a] to-black rounded-2xl border border-[#d4af37] overflow-hidden transform transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(212,175,55,0.3)]">
              <div className="absolute top-0 right-0 bg-[#d4af37] text-black font-bold py-1 px-4 text-sm">
                RECOMMENDED
              </div>
              <div className="p-6 sm:p-8">
                <h3 className="text-xl font-bold mb-2">The Insider</h3>
                <div className="flex items-baseline mb-4">
                  <span className="text-4xl font-extrabold text-white">$10</span>
                  <span className="text-gray-400 ml-2">/month</span>
                </div>
                
                <div className="mt-6 space-y-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>5 Daily Picks</span>
                  </div>
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Parlay of the Day</span>
                  </div>
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Weekly Bonus Pick</span>
                  </div>
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>PrimeTime Picks</span>
                  </div>
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Leaderboard Eligibility</span>
                  </div>
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-[#d4af37] mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Advanced Data and Analysis</span>
                  </div>
                </div>
                
                <Link to="/signin" className="cta-button w-full py-3 rounded-lg font-bold text-center mt-8 block">
                  Upgrade Now
                </Link>
              </div>
            </div>
          </div>
        </section>
        
        {/* ROI Proof Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Make Money With The Bear</h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Don't just take Gary's word for it. The numbers don't lie.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="bg-black/50 backdrop-blur border border-gray-800 rounded-xl p-6 text-center">
              <div className="text-[#d4af37] text-4xl font-extrabold mb-2">67%</div>
              <p className="text-gray-300">Win Rate on Premium Picks</p>
            </div>
            <div className="bg-black/50 backdrop-blur border border-gray-800 rounded-xl p-6 text-center">
              <div className="text-[#d4af37] text-4xl font-extrabold mb-2">$2,450</div>
              <p className="text-gray-300">Average Monthly Profit*</p>
            </div>
            <div className="bg-black/50 backdrop-blur border border-gray-800 rounded-xl p-6 text-center">
              <div className="text-[#d4af37] text-4xl font-extrabold mb-2">24X</div>
              <p className="text-gray-300">Return on Investment</p>
            </div>
          </div>
          
          <p className="text-gray-400 text-sm max-w-2xl mx-auto text-center mt-4">
            *Based on $100 unit size following all of Gary's premium picks
          </p>
        </section>
        
        {/* Features Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Why Gary's Picks Win</h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              The smartest bear in the game has your back.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-black/50 backdrop-blur border border-gray-800 rounded-xl p-6">
              <div className="h-12 w-12 rounded-full bg-[#d4af37]/20 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-[#d4af37]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Advanced Analytics</h3>
              <p className="text-gray-300">Gary crunches the numbers that other handicappers don't even know exist.</p>
            </div>
            <div className="bg-black/50 backdrop-blur border border-gray-800 rounded-xl p-6">
              <div className="h-12 w-12 rounded-full bg-[#d4af37]/20 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-[#d4af37]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Premium Selections</h3>
              <p className="text-gray-300">Get access to all of Gary's daily picks, including his highest confidence selections.</p>
            </div>
            <div className="bg-black/50 backdrop-blur border border-gray-800 rounded-xl p-6">
              <div className="h-12 w-12 rounded-full bg-[#d4af37]/20 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-[#d4af37]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Performance Tracking</h3>
              <p className="text-gray-300">Track your betting results and see how Gary's picks perform over time.</p>
            </div>
          </div>
        </section>
        
        {/* FAQ Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Frequently Asked Questions</h2>
          </div>
          
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-black/50 backdrop-blur border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-3">When do I get access to the picks?</h3>
              <p className="text-gray-300">Pro members gain immediate access to all picks as soon as they're released each day. You'll never miss a pick with your Pro membership.</p>
            </div>
            
            <div className="bg-black/50 backdrop-blur border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-3">Can I cancel my subscription anytime?</h3>
              <p className="text-gray-300">Yes, you can cancel at any time with no questions asked. Your access will remain active until the end of your current billing period.</p>
            </div>
            
            <div className="bg-black/50 backdrop-blur border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-3">How does Gary make his picks?</h3>
              <p className="text-gray-300">Gary combines advanced statistical models, insider information, and years of betting experience to identify the highest value opportunities each day.</p>
            </div>
          </div>
        </section>
        
        {/* Final CTA */}
        <section>
          <div className="text-center bg-gradient-to-r from-[#1a1a1a] to-black rounded-2xl border border-[#d4af37]/30 p-8 max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to Start Winning?</h2>
            <p className="text-lg text-gray-300 mb-6">
              Join Gary's winning team today and start making smarter bets.
            </p>
            <Link to="/signin" className="cta-button px-8 py-4 rounded-lg font-bold text-lg inline-flex items-center justify-center">
              Get Started Now
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}