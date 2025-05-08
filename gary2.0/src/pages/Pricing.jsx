import React from 'react';
import { Link } from 'react-router-dom';
import colorBackground from '../assets/images/colorbackground.png';
import '../styles/PricingPage.css'; // Import the Pricing page specific styles

export function Pricing() {
  return (
    <div className="min-h-screen w-full py-12 relative">
      {/* Stadium background image */}
      <div className="absolute inset-0 bg-cover bg-center z-0" style={{
        backgroundImage: `url(${colorBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "brightness(0.5) blur(1px)",
        opacity: 0.95
      }}></div>
      
      {/* Dark overlay to enhance card readability */}
      <div className="absolute inset-0 bg-black opacity-30 z-0"></div>
      
      {/* Content container with overlay */}
      <div className="relative z-10">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header Section */}
        <div className="text-center mb-16 pt-16">  {/* Added pt-16 for extra top padding */}
          <h1 className="text-5xl font-bold text-[#b8953f] mb-4">Pricing</h1>
          <p className="text-xl text-gray-400 max-w-xl mx-auto">
            Simple, transparent pricing to upgrade your betting game
          </p>
        </div>
        
        {/* Pricing Cards */}
        <div className="flex justify-center mx-auto">
          
          {/* Pro Tier - Ticket Style */}
          <div className="flex flex-col h-[500px] max-w-[300px] w-[300px] mx-auto relative hover:-translate-y-2 hover:shadow-xl hover:scale-105 transition-all duration-300">
            {/* Ticket notches - simplified */}
            <div className="absolute -left-1 top-1/3 w-2 h-4 bg-[#333] rounded-r-full"></div>
            <div className="absolute -left-1 top-2/3 w-2 h-4 bg-[#333] rounded-r-full"></div>
            <div className="absolute -right-1 top-1/3 w-2 h-4 bg-[#333] rounded-l-full"></div>
            <div className="absolute -right-1 top-2/3 w-2 h-4 bg-[#333] rounded-l-full"></div>
            
            {/* Ticket header with branding */}
            <div className="w-full py-2 px-4 rounded-t-xl flex flex-col" style={{backgroundColor: '#b8953f'}}>
              <div className="flex flex-col">
                <div className="flex justify-between items-center">
                  <div className="text-lg font-bold text-black font-sans tracking-wider">GARY A.I.</div>
                  <div className="text-sm text-black font-sans tracking-wider">BOX SEAT ACCESS</div>
                </div>
                <div className="flex justify-between mt-1">
                  {/* Ticket seat information */}
                  <div className="font-mono text-xs opacity-80 text-black">
                    <div>SECTION: VIP BOX</div>
                    <div>ROW: P</div>
                    <div>SEAT: 29</div>
                  </div>
                  <div className="font-mono text-xs opacity-80 text-black text-right">
                    SERIAL: GA-2025-V29
                  </div>
                </div>
              </div>
            </div>
            
            {/* Ticket body */}
            <div className="px-6 pt-4 pb-2 flex-1 bg-[#f8f8e0] text-black rounded-b-xl">
              <h2 className="text-5xl font-bold mb-3 font-sans tracking-wider uppercase" style={{color: 'black'}}>PRO</h2>
              
              <div className="mb-4 flex items-baseline border-b border-dotted border-gray-400/30 pb-4">
                <span className="text-5xl font-bold font-sans tracking-wider" style={{color: 'black'}}>$29</span>
                <span className="text-lg ml-1 font-sans tracking-wider uppercase" style={{color: 'black'}}>/MONTH</span>
              </div>
              
              <ul className="space-y-3 mb-6 text-lg">
                <li className="flex items-center font-sans tracking-wider" style={{color: 'black'}}>
                  <span className="mr-2" style={{color: 'black'}}>•</span>
                  <span style={{color: 'black'}}>DAILY PICKS (3-7 per day)</span>
                </li>
                <li className="flex items-center font-sans tracking-wider" style={{color: 'black'}}>
                  <span className="mr-2" style={{color: 'black'}}>•</span>
                  <span style={{color: 'black'}}>GARY'S ANALYSIS</span>
                </li>
                <li className="flex items-center font-sans tracking-wider" style={{color: 'black'}}>
                  <span className="mr-2" style={{color: 'black'}}>•</span>
                  <span style={{color: 'black'}}>EARLY ACCESS TO ADVANCE MODEL (Coming Soon)</span>
                </li>
              </ul>
            </div>
            
            {/* Button area */}
            <div className="px-6 pb-6 pt-2 bg-[#f8f8e0] border-t border-dotted border-gray-400/30">
              {/* Barcode */}
              <div className="mb-4 flex justify-center">
                <img src="/img/fake-barcode.svg" alt="barcode" className="h-10 opacity-70" />
              </div>
              
              <div className="w-full h-[52px] py-3 px-4 bg-[#b8953f] text-center rounded-md">
                <a href="https://buy.stripe.com/dR603v2UndMebrq144" className="no-underline">
                  <div className="text-xl text-black font-sans tracking-wider">
                    SELECT PLAN
                  </div>
                </a>
              </div>
              
              {/* VIP punch hole */}
              <div className="absolute bottom-3 -right-[15px] w-[30px] h-[30px] rounded-full bg-black flex items-center justify-center overflow-hidden">
                <div className="absolute inset-1 rounded-full bg-[#fffbe6]"></div>
                <div className="text-[7px] font-bold relative z-10 text-black rotate-90">VIP</div>
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
