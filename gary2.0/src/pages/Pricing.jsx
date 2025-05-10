import React from 'react';
import { Link } from 'react-router-dom';
import colorBackground from '../assets/images/colorbackground.png';
import '../styles/PricingPage.css'; // Import the Pricing page specific styles

export function Pricing() {
  return (
    <div className="min-h-screen w-full py-12 relative">
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
          <div className="flex flex-col h-[550px] max-w-[320px] w-[320px] mx-auto relative group
                         transition-all duration-500 ease-out
                         hover:-translate-y-2 hover:shadow-2xl hover:scale-105 hover:rotate-1
                         shadow-[0_22px_70px_4px_rgba(0,0,0,0.56)]">
            {/* Glowing border effect on hover */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#b8953f] to-[#d4af37] opacity-0 
                           group-hover:opacity-60 rounded-xl blur-md transition duration-500"></div>
            
            {/* Ticket notches - more modern */}
            <div className="absolute -left-1.5 top-1/3 w-3 h-6 bg-black rounded-r-full z-10"></div>
            <div className="absolute -left-1.5 top-2/3 w-3 h-6 bg-black rounded-r-full z-10"></div>
            <div className="absolute -right-1.5 top-1/3 w-3 h-6 bg-black rounded-l-full z-10"></div>
            <div className="absolute -right-1.5 top-2/3 w-3 h-6 bg-black rounded-l-full z-10"></div>
            
            {/* Ticket header with premium branding */}
            <div className="w-full py-4 px-6 rounded-t-xl relative z-20" 
                 style={{
                   background: "linear-gradient(135deg, #b8953f 0%, #d4af37 75%)",
                   boxShadow: "0px 4px 15px rgba(0,0,0,0.2)"
                 }}>
              <div className="flex flex-col">
                <div className="flex justify-between items-center">
                  <div className="text-xl font-bold text-black font-sans tracking-wider">GARY A.I.</div>
                  <div className="text-sm text-black font-sans tracking-wider font-medium">BOX SEAT ACCESS</div>
                </div>
                <div className="flex justify-between mt-2">
                  {/* Ticket seat information with modern font */}
                  <div className="font-mono text-xs opacity-90 text-black">
                    <div>SECTION: VIP BOX</div>
                    <div>ROW: P</div>
                    <div>SEAT: 29</div>
                  </div>
                  <div className="font-mono text-xs opacity-90 text-black text-right">
                    SERIAL: GA-2025-V29
                  </div>
                </div>
              </div>
            </div>
            
            {/* Ticket body with black background instead of cream */}
            <div className="px-6 pt-6 pb-3 flex-1 rounded-b-xl relative z-20" 
                 style={{
                   background: "linear-gradient(180deg, #0e0e0e 0%, #1a1a1a 100%)",
                   boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)"
                 }}>
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-5xl font-bold font-sans tracking-wider uppercase text-black">PRO</h2>
                <div className="bg-[#b8953f] text-black px-3 py-1 rounded-full text-sm font-bold transform rotate-3">
                  BEST VALUE
                </div>
              </div>
              
              <div className="mb-6 flex items-baseline border-b border-dashed border-gray-400/40 pb-4">
                <span className="text-5xl font-bold font-sans tracking-wider text-[#d4af37]">$29</span>
                <span className="text-lg ml-1 font-sans tracking-wider uppercase text-[#b8953f]">/MONTH</span>
              </div>
              
              <ul className="space-y-4 mb-6 text-lg">
                <li className="flex items-start font-sans text-[#b8953f]">
                  <span className="mr-3 text-[#d4af37] text-xl">✓</span>
                  <span className="font-medium leading-tight">DAILY PICKS <span className="text-sm font-normal opacity-75">(3-7 per day)</span></span>
                </li>
                <li className="flex items-start font-sans text-[#b8953f]">
                  <span className="mr-3 text-[#d4af37] text-xl">✓</span>
                  <span className="font-medium leading-tight">PLAYER PROPS <span className="text-sm font-normal opacity-75">(MLB/NFL/NBA/NHL)</span></span>
                </li>
                <li className="flex items-start font-sans text-[#b8953f]">
                  <span className="mr-3 text-[#d4af37] text-xl">✓</span>
                  <span className="font-medium leading-tight">ALL PRO LEAGUES <span className="text-sm font-normal opacity-75">(MLB/NFL/NBA/NHL)</span></span>
                </li>
                <li className="flex items-start font-sans text-[#b8953f]">
                  <span className="mr-3 text-[#d4af37] text-xl">✓</span>
                  <span className="font-medium leading-tight">FULL BET HISTORY <span className="text-sm font-normal opacity-75">(Complete record)</span></span>
                </li>
                <li className="flex items-start font-sans text-[#b8953f]">
                  <span className="mr-3 text-[#d4af37] text-xl">✓</span>
                  <span className="font-medium leading-tight">DISCORD ACCESS <span className="text-sm font-normal opacity-75">(Private channel)</span></span>
                </li>
              </ul>
            </div>
            
            {/* Button area with modern barcode */}
            <div className="px-6 pb-6 pt-3 border-t border-dashed border-gray-400/40 rounded-b-xl relative z-20" 
                 style={{
                   background: "linear-gradient(180deg, #f8f5e1 0%, #f3f0d8 100%)"
                 }}>
              {/* Modern barcode */}
              <div className="mb-4 flex justify-center">
                <svg className="h-8 w-48 opacity-80" viewBox="0 0 100 20">
                  {Array.from({length: 30}).map((_, i) => (
                    <rect 
                      key={i} 
                      x={i * 3} 
                      y="0" 
                      width={Math.random() * 2 + 0.5} 
                      height="20" 
                      fill="#000" 
                      opacity={Math.random() * 0.5 + 0.5} 
                    />
                  ))}
                </svg>
              </div>
              
              {/* Action button with hover effects */}
              <a href="https://buy.stripe.com/test_dR628zfn7gTX5Ne28a" className="group/btn block w-full">
                <div className="pricing-page-button-container flex items-center justify-center bg-[#b8953f] rounded-lg py-3 px-6 
                              shadow-md hover:shadow-lg
                              transform hover:-translate-y-1">
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-[#d4af37]/20 to-transparent 
                                 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 ease-out"></div>
                  <div className="text-xl text-black font-sans tracking-wider font-bold relative z-10">
                    SELECT PLAN
                  </div>
                </div>
              </a>
              
              {/* VIP hologram effect */}
              <div className="absolute bottom-4 -right-[18px] w-[36px] h-[36px] rounded-full bg-black 
                             flex items-center justify-center overflow-hidden shadow-lg
                             group-hover:rotate-[360deg] transition-transform duration-1000 ease-out">
                <div className="absolute inset-1 rounded-full bg-gradient-to-br from-[#b8953f] to-[#d4af37] opacity-90"></div>
                <div className="text-[10px] font-bold relative z-10 text-black">VIP</div>
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
