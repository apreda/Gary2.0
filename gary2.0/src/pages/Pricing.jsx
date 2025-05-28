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
        <div className="max-w-7xl mx-auto px-8">
          {/* Header Section - More compact */}
          <div className="text-center mb-16 pt-12">
            <h1 className="text-4xl font-bold text-[#b8953f] mb-4 drop-shadow-lg">Pricing</h1>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto font-light">
              Simple, transparent pricing to upgrade your betting game
            </p>
          </div>
          
          {/* Pricing Cards - Wide three columns with lots of space */}
          <div className="grid lg:grid-cols-3 gap-12 max-w-6xl mx-auto mb-20">
            
            {/* Free Tier - Clean Card Style */}
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700 p-8 flex flex-col h-[600px] relative group transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-300 mb-4">Free</h3>
                <div className="text-5xl font-bold text-white mb-2">$0</div>
                <div className="text-gray-400">/month</div>
                <div className="text-sm text-gray-500 mt-2">For getting started</div>
              </div>
              
              <div className="flex-grow">
                <div className="mb-8">
                  <div className="text-sm font-medium text-gray-400 mb-4">Get started with:</div>
                  <ul className="space-y-4 text-gray-200">
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">1 Daily High Confidence Pick</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">Prop Picks</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">Gary's Thoughts</span>
                    </li>
                  </ul>
                </div>
              </div>
              
              <button className="w-full py-4 px-6 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors">
                Get Started
              </button>
            </div>

            {/* Pro Tier - Highlighted */}
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border-2 border-[#b8953f] p-8 flex flex-col h-[600px] relative group transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
              {/* Popular badge */}
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-[#b8953f] text-black text-sm font-bold px-4 py-2 rounded-full">
                  POPULAR
                </div>
              </div>
              
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-[#b8953f] mb-4">Pro</h3>
                <div className="text-5xl font-bold text-white mb-2">$29</div>
                <div className="text-gray-400">/month</div>
                <div className="text-sm text-gray-500 mt-2">For serious bettors</div>
              </div>
              
              <div className="flex-grow">
                <div className="mb-8">
                  <div className="text-sm font-medium text-gray-400 mb-4">Everything in Free, plus:</div>
                  <ul className="space-y-4 text-gray-200">
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">All High Confidence Picks (NBA MLB NHL NFL)</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">BetCard Tracking and Win Rate</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">Exclusive Discounts and More</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">Early access to new features</span>
                    </li>
                  </ul>
                </div>
                
                {/* Value proposition */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-[#b8953f]/20 to-[#d4af37]/20 border border-[#b8953f]/30">
                  <div className="text-center">
                    <div className="text-[#d4af37] font-bold text-lg">67% Win Rate</div>
                    <div className="text-gray-300 text-sm">Proven Track Record</div>
                  </div>
                </div>
              </div>
              
              {user ? (
                <a href="https://buy.stripe.com/dR603v2UndMebrq144" className="w-full py-4 px-6 bg-[#b8953f] hover:bg-[#d4af37] text-black rounded-xl font-semibold transition-colors text-center block">
                  Get Started
                </a>
              ) : (
                <a href="https://www.betwithgary.ai/signin" className="w-full py-4 px-6 bg-[#b8953f] hover:bg-[#d4af37] text-black rounded-xl font-semibold transition-colors text-center block">
                  Get Started
                </a>
              )}
            </div>

            {/* Enterprise Tier */}
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700 p-8 flex flex-col h-[600px] relative group transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-300 mb-4">Enterprise</h3>
                <div className="text-5xl font-bold text-white mb-2">Custom</div>
                <div className="text-gray-400">pricing</div>
                <div className="text-sm text-gray-500 mt-2">For teams and organizations</div>
              </div>
              
              <div className="flex-grow">
                <div className="mb-8">
                  <div className="text-sm font-medium text-gray-400 mb-4">Everything in Pro, plus:</div>
                  <ul className="space-y-4 text-gray-200">
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">Custom betting strategies</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">Dedicated account manager</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">API access and integrations</span>
                    </li>
                    <li className="flex items-start">
                      <svg className="h-5 w-5 text-[#b8953f] mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm">Priority support</span>
                    </li>
                  </ul>
                </div>
              </div>
              
              <a href="mailto:contact@betwithgary.ai" className="w-full py-4 px-6 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors text-center block">
                Contact Sales
              </a>
            </div>
          </div>

          {/* Social Proof Section - Moved below with more space */}
          <div className="text-center mb-16">
            <div className="flex justify-center items-center space-x-12 opacity-60">
              <div className="text-[#b8953f] font-bold text-lg">67% WIN RATE</div>
              <div className="w-px h-6 bg-gray-600"></div>
              <div className="text-[#b8953f] font-bold text-lg">+18% ROI</div>
              <div className="w-px h-6 bg-gray-600"></div>
              <div className="text-[#b8953f] font-bold text-lg">15-20 PICKS/WEEK</div>
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
