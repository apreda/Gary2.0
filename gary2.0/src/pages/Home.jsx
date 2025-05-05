import React from 'react';
import { Link } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import { useAuth } from '../contexts/AuthContext';
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import GaryHero from '../components/GaryHero';

function Home() {
  const { user } = useAuth();
  
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-visible dimension-bg-section">
      {/* Unified, immersive dark background for entire homepage */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
    {/* Layered gold spotlight for depth */}
    <div className="absolute left-1/2 top-1/3 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-[#b8953f]/20 blur-[120px] opacity-40 z-10" />
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
    <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#b8953f]/10 blur-3xl" />
    <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#b8953f]/10 blur-3xl" />
    {/* Subtle grid/noise overlay */}
    <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-soft-light" />
    {/* Radial vignette for cinematic depth, now deeper */}
    {/* Subtle dimensional depth without blocking pattern */}
    <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/20 opacity-30" />
  </div>
      <div className="relative z-10">
        <GaryHero />
        {/* Gary's Winning System Section with Hot Pick Card */}
        <section className="relative py-16 min-h-[110vh] flex flex-col items-center justify-center overflow-hidden">
          {/* Cream newspaper content background for The Bear's Brain section */}
          <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
            {/* Cream background */}
            <div className="absolute inset-0 z-0 bg-[#f7f3e8]">
              {/* Subtle paper texture - dot pattern overlay */}
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: `radial-gradient(#000 1px, transparent 1px)`,
                backgroundSize: `20px 20px`
              }}></div>
            </div>
            
            {/* Subtle gold vignette corners for depth */}
            <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#b8953f]/10 blur-3xl opacity-20" />
            <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#b8953f]/10 blur-3xl opacity-20" />
            
            {/* Thin vertical divider line to give a newspaper column feel */}
            <div className="absolute top-[5%] bottom-[5%] left-1/2 w-px bg-[#b8953f]/20"></div>
          </div>
          {/* Unified Section Content */}
          <div className="relative z-10 flex flex-col items-center w-full max-w-5xl px-2 md:px-8">
            {/* Newspaper-style headline banner */}
            <div className="w-full max-w-lg bg-[#b8953f] py-1 mb-6 transform -rotate-1">
              <p className="uppercase text-black font-bold tracking-wide text-center text-sm md:text-base">EXCLUSIVE FEATURE</p>
            </div>
            
            <h2 className="font-extrabold mb-6 text-black leading-tight text-center">
              <span className="block text-6xl md:text-7xl font-serif italic inline-block" style={{ textShadow: "-1px -1px 0 #b8953f, 1px -1px 0 #b8953f, -1px 1px 0 #b8953f, 1px 1px 0 #b8953f" }}>THE BEAR'S</span>
              <div className="w-full h-0.5 bg-[#212121] my-2"></div>
              <span className="block text-[#b8953f] text-6xl md:text-7xl font-black transform -skew-x-6">BRAIN</span>
              <div className="w-full h-0.5 bg-[#212121] my-2"></div>
            </h2>
            
            <div className="text-sm font-serif text-gray-500 mb-10 flex items-center">
              <span className="mr-2">By</span>
              <span className="font-semibold">GARY A.I. STAFF</span>
              <span className="mx-2">|</span>
              <span>APRIL 23, 2025</span>
            </div>
            
            <p className="text-gray-500 font-serif leading-relaxed mb-10 text-center max-w-2xl px-4 py-3">
              Experience the revolutionary handicapping system that's changing the game for sports bettors everywhere—powered by the most advanced AI in the industry.
            </p>
            {/* Features as newspaper columns */}
            <div className="w-full max-w-5xl mx-auto mb-14">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-6">
                {/* Left column */}
                <div className="text-left">
                  {/* Data Aware */}
                  <div className="mb-10">
                    <h3 className="text-xl font-bold border-b border-[#b8953f] pb-2 mb-3 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>1. Data Aware</h3>
                    <p className="text-gray-500 font-serif leading-relaxed mb-3">Legacy data enhanced with real-time details that impact the odds. Gary treats each new stat update as a crucial piece of the betting puzzle.</p>
                    <p className="text-gray-500 font-serif leading-relaxed">Unlike static models that simply crunch historical data, Gary's system integrates player sentiment, weather impact factors, and arena-specific performance indicators to create a dynamic predictive model.</p>
                  </div>
                  
                  {/* Fan Brain */}
                  <div className="mb-10">
                    <h3 className="text-xl font-bold border-b border-[#b8953f] pb-2 mb-3 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>2. Fan Brain</h3>
                    <p className="text-gray-500 font-serif leading-relaxed">Reads team loyalty, emotional bias, and fan storylines to spot hidden angles. Gary's system analyzes how public perception influences betting lines, creating opportunities for value bets that go against the crowd.</p>
                  </div>
                  
                  {/* Narrative Tracker */}
                  <div className="mb-10">
                    <h3 className="text-xl font-bold border-b border-[#b8953f] pb-2 mb-3 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>3. Narrative Tracker</h3>
                    <p className="text-gray-500 font-serif leading-relaxed">Uncovers hidden motivations and emotional weights that move the lines. When a player faces their former team or a coach returns to a city where they previously worked, Gary factors these emotional elements into the prediction model.</p>
                  </div>
                </div>
                
                {/* Right column */}
                <div className="text-left">
                  {/* Street Smart */}
                  <div className="mb-10">
                    <h3 className="text-xl font-bold border-b border-[#b8953f] pb-2 mb-3 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>4. Street Smart</h3>
                    <p className="text-gray-500 font-serif leading-relaxed mb-3">Old-school instincts meet AI precision to sniff out real betting value. Gary doesn't just follow the math—he understands the human element that often defies the numbers.</p>
                    <p className="text-gray-500 font-serif leading-relaxed">By combining decades of handicapping wisdom with cutting-edge machine learning, Gary can identify value opportunities that purely statistical models miss.</p>
                  </div>
                  
                  {/* Three-Layered Core */}
                  <div className="mb-10">
                    <h3 className="text-xl font-bold border-b border-[#b8953f] pb-2 mb-3 font-serif italic text-[#b8953f]" style={{ textShadow: "-0.5px -0.5px 0 white, 0.5px -0.5px 0 white, -0.5px 0.5px 0 white, 0.5px 0.5px 0 white" }}>5. Three-Layered Core</h3>
                    <p className="text-gray-500 font-serif leading-relaxed">Sports Odds & Stats, Real-Time Storylines, and Reasoning Engine—Gary's secret sauce. This proprietary system processes information through three distinct layers, each adding depth to the analysis and improving prediction accuracy.</p>
                  </div>
                  
                  {/* Pull quote */}
                  <div className="border-l-4 border-[#b8953f] pl-4 italic my-6">
                    <p className="text-gray-500 font-serif text-lg">"Our system doesn't just predict outcomes—it understands the game at a fundamental level that most handicappers can't match."</p>
                    <p className="text-gray-500 font-serif text-sm mt-2">— Gary A.I. Development Team</p>
                  </div>
                </div>
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
