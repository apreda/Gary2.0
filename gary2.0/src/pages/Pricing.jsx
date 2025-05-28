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
    <div className="min-h-screen w-full py-12 relative" style={{ overflowX: 'auto' }}>
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
        <div className="max-w-5xl mx-auto px-4">
          {/* Header Section */}
          <div className="text-center mb-24 pt-16">  {/* Increased margin bottom */}
            <h1 className="text-6xl font-bold text-[#b8953f] mb-4 drop-shadow-lg">Pricing</h1>
            <p className="text-xl text-gray-300 max-w-xl mx-auto font-light">
              Simple, transparent pricing to upgrade your betting game
            </p>
          </div>
          
          {/* Pricing Card - Centered */}
          <div className="flex justify-center mx-auto">
            
            {/* Pro Tier - Modern Ticket Style */}
            <div className="flex flex-col h-[650px] max-w-[360px] w-[360px] mx-auto relative group
                           transition-all duration-500 ease-out
                           hover:-translate-y-3 hover:shadow-2xl hover:scale-105 hover:rotate-1
                           shadow-[0_25px_80px_8px_rgba(0,0,0,0.65)]">
              {/* Glowing border effect on hover */}
              <div className="absolute -inset-1 bg-gradient-to-r from-[#b8953f] via-[#d4af37] to-[#b8953f] opacity-0 
                             group-hover:opacity-75 rounded-xl blur-lg transition duration-700"></div>
              
              {/* Ticket notches - more refined */}
              <div className="absolute -left-2 top-1/4 w-4 h-8 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -left-2 top-1/2 w-4 h-8 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -left-2 top-3/4 w-4 h-8 bg-black rounded-r-full z-10 shadow-md"></div>
              <div className="absolute -right-2 top-1/4 w-4 h-8 bg-black rounded-l-full z-10 shadow-md"></div>
              <div className="absolute -right-2 top-1/2 w-4 h-8 bg-black rounded-l-full z-10 shadow-md"></div>
              <div className="absolute -right-2 top-3/4 w-4 h-8 bg-black rounded-l-full z-10 shadow-md"></div>
              
              {/* Ticket header with premium branding */}
              <div className="w-full py-5 px-7 rounded-t-xl relative z-20" 
                   style={{
                     background: "linear-gradient(135deg, #b8953f 0%, #d4af37 50%, #b8953f 100%)",
                     boxShadow: "0px 6px 20px rgba(0,0,0,0.3)"
                   }}>
                <div className="flex flex-col">
                  <div className="flex justify-between items-center">
                    <div className="text-2xl font-bold text-black font-sans tracking-wider">GARY A.I.</div>
                    <div className="text-sm text-black font-sans tracking-wider font-medium">PREMIUM ACCESS</div>
                  </div>
                  <div className="flex justify-between mt-3">
                    {/* Ticket seat information with modern font */}
                    <div className="font-mono text-xs opacity-90 text-black">
                      <div className="mb-1">SECTION: VIP BOX</div>
                      <div className="mb-1">ROW: PRO</div>
                      <div>SEAT: UNLIMITED</div>
                    </div>
                    <div className="text-xs text-black font-medium text-right">
                      <div className="mb-2">VALID: 30 DAYS</div>
                      <div className="text-right font-black text-2xl">
                        <span className="font-medium text-sm">$</span>29
                        <span className="text-sm font-normal">/mo</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Ticket body - with enhanced styling */}
              <div className="flex-grow text-white p-7 flex flex-col justify-between relative" 
                   style={{ 
                     backgroundColor: '#000000', 
                     backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(184, 149, 63, 0.05) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(212, 175, 55, 0.05) 0%, transparent 50%)',
                     position: 'relative', 
                     zIndex: 5 
                   }}> 
                <div>
                  <h3 className="text-2xl font-bold mb-6 text-[#b8953f] tracking-wide">Pro Membership</h3>
                  <ul className="space-y-4 text-gray-200">
                    <li className="flex items-start">
                      <svg className="h-6 w-6 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-base leading-relaxed">Access to Gary's Highest Confidence Picks</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-6 w-6 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-base leading-relaxed">Complete access to player prop picks</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-6 w-6 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-base leading-relaxed">Full betting history & performance tracking</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-6 w-6 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-base leading-relaxed">Early access to new features & markets</span>
                    </li>
                  </ul>
                </div>
                
                {/* Value proposition badge */}
                <div className="mt-6 p-3 rounded-lg bg-gradient-to-r from-[#b8953f]/20 to-[#d4af37]/20 border border-[#b8953f]/30">
                  <div className="text-center">
                    <div className="text-[#d4af37] font-bold text-lg">67% Win Rate</div>
                    <div className="text-gray-300 text-sm">Proven Track Record</div>
                  </div>
                </div>
              </div>
              
              {/* Ticket footer with enhanced action button */}
              <div className="relative p-5 rounded-b-xl group-hover:shadow-lg transition duration-300 overflow-hidden" 
                   style={{ backgroundColor: '#000000', position: 'relative', zIndex: 5 }}>
                <div className="relative z-20 rounded-b-xl overflow-hidden w-full"
                  style={{
                    background: "linear-gradient(135deg, #b8953f 0%, #d4af37 50%, #b8953f 100%)",
                    boxShadow: "0px -6px 20px rgba(0,0,0,0.3)"
                  }}>
                  {/* Enhanced button design */}
                  <div className="py-5 px-7 flex justify-center flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-mono text-xs opacity-90 text-black font-medium">PREMIUM ACCESS</div>
                      <div className="text-xs text-black font-medium">INSTANT ACTIVATION</div>
                    </div>
                    {user ? (
                      <a href="https://buy.stripe.com/dR603v2UndMebrq144" className="group relative w-full text-center">
                        <div className="text-2xl font-bold text-black font-sans tracking-wider py-3 hover:opacity-90 transition-opacity">
                          SELECT PLAN
                        </div>
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent 
                                      -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
                      </a>
                    ) : (
                      <a href="https://www.betwithgary.ai/signin" className="group relative w-full text-center">
                        <div className="text-2xl font-bold text-black font-sans tracking-wider py-3 hover:opacity-90 transition-opacity">
                          SELECT PLAN
                        </div>
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent 
                                      -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></div>
                      </a>
                    )}
                  </div>
                  
                  {/* Enhanced VIP hologram effect */}
                  <div className="absolute bottom-5 right-8 w-10 h-10 rounded-full bg-black 
                                flex items-center justify-center overflow-hidden shadow-xl z-20
                                group-hover:rotate-[360deg] group-hover:scale-110 transition-all duration-1000 ease-out">
                    <div className="absolute inset-1 rounded-full bg-gradient-to-br from-[#b8953f] to-[#d4af37] opacity-95"></div>
                    <div className="text-xs font-bold relative z-10 text-black">PRO</div>
                  </div>
                </div>
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
                <div className="text-[#b8953f] text-4xl font-light mb-1">67%</div>
                <p className="text-gray-500 text-sm">Win Rate on Premium Picks</p>
              </div>
              <div className="text-center">
                <div className="text-[#b8953f] text-4xl font-light mb-1">+18%</div>
                <p className="text-gray-500 text-sm">Average Monthly ROI</p>
              </div>
              <div className="text-center">
                <div className="text-[#b8953f] text-4xl font-light mb-1">15-20</div>
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
    </div>
  );
}
