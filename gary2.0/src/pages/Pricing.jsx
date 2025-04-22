import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/dimensional.css';

export function Pricing() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-visible">
  {/* GaryHero-style immersive background */}
  <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
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
      {/* Background depth elements */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-20">
        <div className="absolute top-0 -left-40 w-80 h-80 bg-[#d4af37]/10 rounded-full filter blur-[100px]"></div>
        <div className="absolute bottom-40 -right-40 w-80 h-80 bg-[#d4af37]/10 rounded-full filter blur-[100px]"></div>
        <div className="absolute inset-0 bg-[url('/src/assets/images/grid.svg')] bg-repeat opacity-10"></div>
      </div>
      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header Section */}
        <div className="text-center mb-24 pt-20">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#d4af37] to-yellow-300 mb-4">
            Pricing
          </h1>
          <div className="h-1 w-20 bg-[#d4af37]/30 mx-auto mb-8"></div>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            Simple, transparent pricing to upgrade your betting game
          </p>
        </div>
        
        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-12 max-w-4xl mx-auto relative z-10">
          {/* Ambient glow specific to pricing cards */}
          <div className="absolute -top-10 left-1/4 w-40 h-40 bg-[#d4af37]/10 rounded-full filter blur-[60px] opacity-50"></div>
          <div className="absolute bottom-20 right-1/4 w-40 h-40 bg-[#d4af37]/10 rounded-full filter blur-[70px] opacity-50"></div>
          {/* Free Tier */}
          <div className="bg-[#111]/80 backdrop-blur-sm rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[#d4af37]/30 relative border border-[#d4af37]/20 h-full transform hover:-translate-y-1 flex flex-col">
            <div className="absolute -top-20 -left-20 w-40 h-40 bg-[#d4af37]/10 rounded-full filter blur-[50px] opacity-30"></div>
            <div className="px-8 py-10 flex-1">
              <h2 className="text-2xl font-medium text-white mb-1">Free</h2>
              <p className="text-gray-500 text-sm mb-8">Basic access</p>
              
              <div className="mb-10">
                <span className="text-4xl font-light text-white">$0</span>
                <span className="text-gray-500">/month</span>
              </div>
              
              <ul className="space-y-3 mb-10 text-sm">
                <li className="flex items-center text-white">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">•</span>
                  <span>1 Daily Pick</span>
                </li>
                <li className="flex items-center text-white">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">•</span>
                  <span>1 Monthly Bonus Pick</span>
                </li>
                <li className="flex items-center text-white">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">•</span>
                  <span>Ride or Fade Stats</span>
                </li>
              </ul>
            </div>
            
            <div className="px-8 pb-8">
              <button disabled className="w-full py-3 px-6 bg-transparent border border-[#d4af37]/30 text-[#d4af37] font-medium rounded-md transition-all duration-300 cursor-default shadow-sm shadow-[#d4af37]/10">
                Current Plan
              </button>
            </div>
          </div>
          
          {/* Pro Tier */}
          <div className="bg-[#111]/80 backdrop-blur-sm rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[#d4af37]/30 relative border-2 border-[#d4af37]/40 h-full transform hover:-translate-y-1 flex flex-col">
            <div className="absolute top-0 right-0 bg-[#d4af37] text-black text-xs font-medium px-3 py-1 z-10">
              RECOMMENDED
            </div>
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#d4af37]/10 rounded-full filter blur-[50px] opacity-50"></div>
            
            <div className="px-8 py-10 flex-1">
              <h2 className="text-2xl font-medium text-white mb-1">Pro</h2>
              <p className="text-[#d4af37] text-sm mb-8">Full access</p>
              
              <div className="mb-10">
                <span className="text-4xl font-light text-white">$29</span>
                <span className="text-gray-500">/month</span>
              </div>
              
              <ul className="space-y-3 mb-10 text-sm">
                <li className="flex items-center text-white">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">•</span>
                  <span>5 Daily Picks</span>
                </li>
                <li className="flex items-center text-white">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">•</span>
                  <span>Parlay of the Day</span>
                </li>
                <li className="flex items-center text-white">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">•</span>
                  <span>Weekly Bonus Pick</span>
                </li>
                <li className="flex items-center text-white">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">•</span>
                  <span>PrimeTime Picks</span>
                </li>
                <li className="flex items-center text-white">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">•</span>
                  <span>Leaderboard Eligibility</span>
                </li>
                <li className="flex items-center text-white">
                  <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">•</span>
                  <span>Advanced Data and Analysis</span>
                </li>
              </ul>
            </div>
            
            <div className="px-8 pb-8">
              <Link to="/checkout" className="block w-full text-center py-3 px-6 bg-transparent border border-[#d4af37]/30 text-[#d4af37] font-medium rounded-md transition-all duration-300 hover:bg-[#d4af37]/10 hover:border-[#d4af37]/50 hover:shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                Upgrade Now
              </Link>
            </div>
          </div>
        </div>
        
        {/* Stats Section */}
        <div className="mt-40 max-w-4xl mx-auto">
          <div className="flex justify-center mb-12">
            <div className="h-px w-24 bg-gray-800 self-center mr-5"></div>
            <h2 className="text-xl font-light text-gray-300 tracking-wider">THE NUMBERS</h2>
            <div className="h-px w-24 bg-gray-800 self-center ml-5"></div>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-[#d4af37] text-4xl font-light mb-1">67%</div>
              <p className="text-gray-500 text-sm">Win Rate on Premium Picks</p>
            </div>
            <div className="text-center">
              <div className="text-[#d4af37] text-4xl font-light mb-1">+18%</div>
              <p className="text-gray-500 text-sm">Average Monthly ROI</p>
            </div>
            <div className="text-center">
              <div className="text-[#d4af37] text-4xl font-light mb-1">15-20</div>
              <p className="text-gray-500 text-sm">Premium Picks Per Week</p>
            </div>
          </div>
        </div>
        
        {/* FAQ Section */}
        <div className="mt-40 mb-20 max-w-3xl mx-auto">
          <div className="flex justify-center mb-12">
            <div className="h-px w-24 bg-gray-800 self-center mr-5"></div>
            <h2 className="text-xl font-light text-gray-300 tracking-wider">FAQ</h2>
            <div className="h-px w-24 bg-gray-800 self-center ml-5"></div>
          </div>
          
          <div className="space-y-8">
            <div className="border-b border-gray-800 pb-6">
              <h3 className="font-medium text-white mb-3">When do I get access to the picks?</h3>
              <p className="text-gray-500 text-sm">Pro members gain immediate access to all picks as soon as they're released each day. You'll never miss a pick with your Pro membership.</p>
            </div>
            
            <div className="border-b border-gray-800 pb-6">
              <h3 className="font-medium text-white mb-3">Can I cancel my subscription anytime?</h3>
              <p className="text-gray-500 text-sm">Yes, you can cancel at any time with no questions asked. Your access will remain active until the end of your current billing period.</p>
            </div>
            
            <div className="border-b border-gray-800 pb-6">
              <h3 className="font-medium text-white mb-3">How does Gary make his picks?</h3>
              <p className="text-gray-500 text-sm">Gary combines advanced statistical models, insider information, and years of betting experience to identify the highest value opportunities each day.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
