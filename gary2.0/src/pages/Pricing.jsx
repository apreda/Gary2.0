import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserPlan } from '../contexts/UserPlanContext';
import colorBackground from '../assets/images/colorbackground.png';
import '../styles/PricingPage.css'; // Import the Pricing page specific styles

export function Pricing() {
  const { user } = useAuth();
  const { subscriptionStatus } = useUserPlan();

  // Function to determine button destination based on user status
  const getButtonDestination = () => {
    // If user is logged in (regardless of subscription status), direct to checkout
    if (user) {
      return "https://buy.stripe.com/dR603v2UndMebrq144";
    }
    // Only direct to signin if user is not logged in
    return "https://www.betwithgary.ai/signin";
  };

  return (
    <div className="min-h-screen w-full py-8 relative" style={{ overflowX: 'auto' }}>
      {/* Stadium background image with parallax effect */}
      <div className="absolute inset-0 bg-cover bg-center z-0" style={{
        backgroundImage: `url(${colorBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "brightness(0.4) blur(1px)",
        opacity: 0.95,
        transform: "translateZ(0)",
      }}></div>
      
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-black/20 z-1"></div>
      
      {/* Content container with overlay */}
      <div className="relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header Section - More compact */}
          <div className="text-center mb-12 pt-8">
            <h1 className="text-4xl font-bold text-[#b8953f] mb-2 drop-shadow-lg">Pricing</h1>
            <p className="text-base text-gray-300 max-w-2xl mx-auto font-light">
              Simple, transparent pricing to upgrade your betting game
            </p>
          </div>

          {/* Social Proof Section */}
          <div className="text-center mb-8">
            <p className="text-xs text-gray-400 mb-4 tracking-wider">TRUSTED BY WINNING BETTORS</p>
            <div className="flex justify-center items-center space-x-6 opacity-60">
              <div className="text-[#b8953f] font-bold text-base">67% WIN RATE</div>
              <div className="w-px h-5 bg-gray-600"></div>
              <div className="text-[#b8953f] font-bold text-base">+18% ROI</div>
              <div className="w-px h-5 bg-gray-600"></div>
              <div className="text-[#b8953f] font-bold text-base">15-20 PICKS/WEEK</div>
            </div>
          </div>
          
          {/* Pricing Cards - Two tier layout */}
          <div className="grid lg:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
            
            {/* Free Tier - Ticket Style */}
            <div className="flex flex-col h-[420px] relative group
                           transition-all duration-300 ease-out
                           hover:-translate-y-1 hover:shadow-xl
                           shadow-[0_15px_40px_4px_rgba(0,0,0,0.4)]">
              
              {/* Ticket notches */}
              <div className="absolute -left-2 top-1/4 w-4 h-6 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -left-2 top-1/2 w-4 h-6 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -left-2 top-3/4 w-4 h-6 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -right-2 top-1/4 w-4 h-6 bg-black rounded-l-full z-10 shadow-md"></div>
              <div className="absolute -right-2 top-1/2 w-4 h-6 bg-black rounded-l-full z-10 shadow-md"></div>
              <div className="absolute -right-2 top-3/4 w-4 h-6 bg-black rounded-l-full z-10 shadow-md"></div>
              
              {/* Ticket header */}
              <div className="w-full py-3 px-5 rounded-t-xl relative z-20" 
                   style={{
                     background: "linear-gradient(135deg, #6b7280 0%, #9ca3af 50%, #6b7280 100%)",
                     boxShadow: "0px 6px 20px rgba(0,0,0,0.3)"
                   }}>
                <div className="flex flex-col">
                  <div className="flex justify-between items-center">
                    <div className="text-lg font-bold text-black font-sans tracking-wider">GARY A.I.</div>
                    <div className="text-xs text-black font-sans tracking-wider font-medium">FREE ACCESS</div>
                  </div>
                  <div className="flex justify-between mt-1">
                    <div className="font-mono text-xs opacity-90 text-black">
                      <div className="mb-1">SECTION: GENERAL</div>
                      <div>SEAT: LIMITED</div>
                    </div>
                    <div className="text-xs text-black font-medium text-right">
                      <div className="mb-1">VALID: FOREVER</div>
                      <div className="text-right font-black text-lg">
                        <span className="font-medium text-sm">$</span>0
                        <span className="text-sm font-normal">/mo</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Ticket body */}
              <div className="flex-grow text-white p-5 flex flex-col justify-between relative" 
                   style={{ 
                     backgroundColor: '#000000', 
                     backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(107, 114, 128, 0.05) 0%, transparent 50%)',
                     position: 'relative', 
                     zIndex: 5 
                   }}> 
                <div>
                  <h3 className="text-lg font-bold mb-3 text-gray-300 tracking-wide">Free Membership</h3>
                  <ul className="space-y-2 text-gray-200">
                    <li className="flex items-start">
                      <svg className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm leading-relaxed">1 Daily High Confidence Pick</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm leading-relaxed">Prop Picks</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm leading-relaxed">Gary's Thoughts</span>
                    </li>
                  </ul>
                </div>
                
                {/* Value proposition badge */}
                <div className="mt-3 p-2 rounded-lg bg-gradient-to-r from-gray-600/20 to-gray-500/20 border border-gray-600/30">
                  <div className="text-center">
                    <div className="text-gray-300 font-bold text-sm">Get Started</div>
                    <div className="text-gray-400 text-xs">No Credit Card Required</div>
                  </div>
                </div>
              </div>
              
              {/* Ticket footer */}
              <div className="relative p-3 rounded-b-xl group-hover:shadow-lg transition duration-300 overflow-hidden" 
                   style={{ backgroundColor: '#000000', position: 'relative', zIndex: 5 }}>
                <div className="relative z-20 rounded-b-xl overflow-hidden w-full"
                  style={{
                    background: "linear-gradient(135deg, #6b7280 0%, #9ca3af 50%, #6b7280 100%)",
                    boxShadow: "0px -6px 20px rgba(0,0,0,0.3)"
                  }}>
                  <div className="py-3 px-5 flex justify-center flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-mono text-xs opacity-90 text-black font-medium">FREE</div>
                      <div className="text-xs text-black font-medium">INSTANT</div>
                    </div>
                    <a href="https://www.betwithgary.ai/signin" className="group relative w-full text-center">
                      <div className="text-base font-bold text-black font-sans tracking-wider py-2 hover:opacity-90 transition-opacity">
                        GET STARTED
                      </div>
                      <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent 
                                    -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
                    </a>
                  </div>
                  
                  {/* Free badge */}
                  <div className="absolute bottom-2 right-5 w-7 h-7 rounded-full bg-black 
                                flex items-center justify-center overflow-hidden shadow-xl z-20
                                group-hover:rotate-[360deg] group-hover:scale-110 transition-all duration-1000 ease-out">
                    <div className="absolute inset-1 rounded-full bg-gradient-to-br from-gray-600 to-gray-500 opacity-95"></div>
                    <div className="text-xs font-bold relative z-10 text-black">FREE</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pro Tier - Enhanced and highlighted */}
            <div className="flex flex-col h-[420px] relative group
                           transition-all duration-500 ease-out
                           hover:-translate-y-2 hover:shadow-2xl hover:scale-105
                           shadow-[0_20px_60px_8px_rgba(0,0,0,0.6)]">
              {/* Popular badge */}
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-30">
                <div className="bg-gradient-to-r from-[#b8953f] to-[#d4af37] text-black text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </div>
              </div>
              
              {/* Glowing border effect on hover */}
              <div className="absolute -inset-1 bg-gradient-to-r from-[#b8953f] via-[#d4af37] to-[#b8953f] opacity-0 
                             group-hover:opacity-75 rounded-xl blur-lg transition duration-700"></div>
              
              {/* Ticket notches - more refined */}
              <div className="absolute -left-2 top-1/4 w-4 h-6 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -left-2 top-1/2 w-4 h-6 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -left-2 top-3/4 w-4 h-6 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -right-2 top-1/4 w-4 h-6 bg-black rounded-l-full z-10 shadow-md"></div>
              <div className="absolute -right-2 top-1/2 w-4 h-6 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -right-2 top-3/4 w-4 h-6 bg-black rounded-l-full z-10 shadow-md"></div>
              
              {/* Ticket header with premium branding */}
              <div className="w-full py-3 px-5 rounded-t-xl relative z-20" 
                   style={{
                     background: "linear-gradient(135deg, #b8953f 0%, #d4af37 50%, #b8953f 100%)",
                     boxShadow: "0px 6px 20px rgba(0,0,0,0.3)"
                   }}>
                <div className="flex flex-col">
                  <div className="flex justify-between items-center">
                    <div className="text-lg font-bold text-black font-sans tracking-wider">GARY A.I.</div>
                    <div className="text-xs text-black font-sans tracking-wider font-medium">PREMIUM ACCESS</div>
                  </div>
                  <div className="flex justify-between mt-1">
                    <div className="font-mono text-xs opacity-90 text-black">
                      <div className="mb-1">SECTION: VIP</div>
                      <div>SEAT: UNLIMITED</div>
                    </div>
                    <div className="text-xs text-black font-medium text-right">
                      <div className="mb-1">VALID: 30 DAYS</div>
                      <div className="text-right font-black text-lg">
                        <span className="font-medium text-sm">$</span>29
                        <span className="text-sm font-normal">/mo</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Ticket body */}
              <div className="flex-grow text-white p-5 flex flex-col justify-between relative" 
                   style={{ 
                     backgroundColor: '#000000', 
                     backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(184, 149, 63, 0.05) 0%, transparent 50%)',
                     position: 'relative', 
                     zIndex: 5 
                   }}> 
                <div>
                  <h3 className="text-lg font-bold mb-3 text-[#b8953f] tracking-wide">Pro Membership</h3>
                  <ul className="space-y-2 text-gray-200">
                    <li className="flex items-start">
                      <svg className="h-4 w-4 text-[#b8953f] mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm leading-relaxed">Everything in Free</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-4 w-4 text-[#b8953f] mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm leading-relaxed">Daily Access to All High Confidence Picks (NBA MLB NHL NFL)</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-4 w-4 text-[#b8953f] mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm leading-relaxed">BetCard Tracking and Win Rate</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-4 w-4 text-[#b8953f] mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm leading-relaxed">Exclusive Discounts, Picks and More</span>
                    </li>
                  </ul>
                </div>
                
                {/* Value proposition badge */}
                <div className="mt-3 p-2 rounded-lg bg-gradient-to-r from-[#b8953f]/20 to-[#d4af37]/20 border border-[#b8953f]/30">
                  <div className="text-center">
                    <div className="text-[#d4af37] font-bold text-sm">67% Win Rate</div>
                    <div className="text-gray-300 text-xs">Proven Track Record</div>
                  </div>
                </div>
              </div>
              
              {/* Ticket footer */}
              <div className="relative p-3 rounded-b-xl group-hover:shadow-lg transition duration-300 overflow-hidden" 
                   style={{ backgroundColor: '#000000', position: 'relative', zIndex: 5 }}>
                <div className="relative z-20 rounded-b-xl overflow-hidden w-full"
                  style={{
                    background: "linear-gradient(135deg, #b8953f 0%, #d4af37 50%, #b8953f 100%)",
                    boxShadow: "0px -6px 20px rgba(0,0,0,0.3)"
                  }}>
                  <div className="py-3 px-5 flex justify-center flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-mono text-xs opacity-90 text-black font-medium">PREMIUM</div>
                      <div className="text-xs text-black font-medium">INSTANT</div>
                    </div>
                    {user ? (
                      <a href="https://buy.stripe.com/dR603v2UndMebrq144" className="group relative w-full text-center">
                        <div className="text-base font-bold text-black font-sans tracking-wider py-2 hover:opacity-90 transition-opacity">
                          SELECT PLAN
                        </div>
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent 
                                      -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
                      </a>
                    ) : (
                      <a href="https://www.betwithgary.ai/signin" className="group relative w-full text-center">
                        <div className="text-base font-bold text-black font-sans tracking-wider py-2 hover:opacity-90 transition-opacity">
                          SELECT PLAN
                        </div>
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent 
                                      -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
                      </a>
                    )}
                  </div>
                  
                  {/* VIP badge */}
                  <div className="absolute bottom-2 right-5 w-7 h-7 rounded-full bg-black 
                                flex items-center justify-center overflow-hidden shadow-xl z-20
                                group-hover:rotate-[360deg] group-hover:scale-110 transition-all duration-1000 ease-out">
                    <div className="absolute inset-1 rounded-full bg-gradient-to-br from-[#b8953f] to-[#d4af37] opacity-95"></div>
                    <div className="text-xs font-bold relative z-10 text-black">PRO</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* FAQ Section - Simplified */}
          <div className="mt-20 mb-16 max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-light text-gray-300 tracking-wider">Frequently Asked Questions</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="p-6 bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700">
                <h3 className="font-medium text-white mb-3">When do I get access to the picks?</h3>
                <p className="text-gray-400 text-sm">Pro members gain immediate access to all picks as soon as they're released each day. You'll never miss a pick with your Pro membership.</p>
              </div>
              
              <div className="p-6 bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700">
                <h3 className="font-medium text-white mb-3">Can I cancel my subscription anytime?</h3>
                <p className="text-gray-400 text-sm">Yes, you can cancel at any time with no questions asked. Your access will remain active until the end of your current billing period.</p>
              </div>
              
              <div className="p-6 bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700">
                <h3 className="font-medium text-white mb-3">How does Gary make his picks?</h3>
                <p className="text-gray-400 text-sm">Gary combines advanced statistical models, insider information, and years of betting experience to identify the highest value opportunities each day.</p>
              </div>
              
              <div className="p-6 bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-700">
                <h3 className="font-medium text-white mb-3">What sports are covered?</h3>
                <p className="text-gray-400 text-sm">Gary provides picks for MLB, NBA, NHL, and NFL with comprehensive coverage across all major betting markets and prop bets.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
