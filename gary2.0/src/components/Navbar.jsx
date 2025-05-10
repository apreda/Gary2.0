import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useUserPlan } from "../contexts/UserPlanContext";
import { useBetCardProfile } from "../contexts/BetCardProfileContext";
import { useAuth } from '../contexts/AuthContext';

export function Navbar() {
  const location = useLocation();
  const [activeLink, setActiveLink] = useState(location.pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { userPlan } = useUserPlan();
  const { openBetCardProfile } = useBetCardProfile();
  const { user } = useAuth();
  const session = !!user;
  
  // Navigation items matching user requirements
  const navItems = [
    { path: '/', label: 'Home' },
    { path: '/real-gary-picks', label: 'Gary\'s Picks' },
    { path: '/gary-props', label: 'Gary\'s Props' },
    { path: '/billfold', label: 'Billfold' },
    // Leaderboard page hidden from navbar but still accessible via direct URL
    // { path: '/leaderboard', label: 'Leaderboard' },
    { path: '/pricing', label: 'Pricing' },
    // Learn More page hidden from navbar but still accessible via direct URL
    // { path: '/learn-more', label: 'Learn More' },
  ];
  
  // We don't need to modify signedInNavItems differently, just use the navItems defined above
  const signedInNavItems = [...navItems];
  const filteredNavItems = session ? signedInNavItems : navItems;
  
  useEffect(() => {
    setActiveLink(location.pathname);
  }, [location.pathname]);
  
  return (
    <header className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-black z-50 border border-[#B8953F]/20 py-3 rounded-3xl shadow-xl w-11/12 max-w-6xl">
      <div className="w-full px-6 flex items-center justify-between">
        {/* Modern high-tech logo without the G circle */}
        <div className="flex items-center">
          <Link to="/" className="flex items-center group">
            <span className="text-white text-xl font-light tracking-tight" style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '0.05em' }}>Gary</span>
            <span className="text-[#B8953F] text-xl font-bold" style={{ fontFamily: 'Arial, sans-serif' }}>.AI</span>
            <div className="ml-2 px-2 py-0.5 rounded-md text-xs uppercase font-bold tracking-wide" 
              style={{
                background: 'linear-gradient(135deg, #f5f5f5 0%, #d4af37 50%, #8a8a8a 100%)',
                color: '#111',
                textShadow: '0 1px 1px rgba(255,255,255,0.3)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.4)',
                border: '1px solid rgba(184, 149, 63, 0.5)',
                transform: 'scale(0.9)'
              }}>
              Beta
            </div>
          </Link>
        </div>
        
        {/* Center navigation - Exactly like Hashnode */}
        <nav className="hidden md:flex space-x-6 mx-auto">
          {filteredNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`text-sm font-medium transition-colors duration-200 px-1 py-1 ${
                activeLink === item.path 
                ? 'text-[#B8953F]' 
                : 'text-gray-300 hover:text-white'}`}
              onClick={() => setActiveLink(item.path)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      
        {/* BetCard and Sign In buttons */}
        <div className="flex items-center space-x-2">
          {/* BetCard Link - Always visible */}
          <button
            onClick={() => openBetCardProfile()}
            className="text-white bg-[#1E2330] hover:bg-[#2a334a] font-medium text-sm transition-colors rounded-full px-4 py-2"
          >
            BetCard
          </button>
          
          {/* Auth button */}
          {!session ? (
            <Link 
              to="/signin" 
              className="text-black bg-[#b8953f] hover:bg-[#d4af37] font-medium text-sm transition-colors rounded-full px-4 py-2"
              onClick={() => setActiveLink("/signin")}
            >
              Sign in
            </Link>
          ) : (
            <Link 
              to="/signout" 
              className="text-black bg-[#b8953f] hover:bg-[#d4af37] font-medium text-sm transition-colors rounded-full px-4 py-2"
              onClick={() => setActiveLink("/signout")}
            >
              Sign out
            </Link>
          )}
          
          {/* Mobile menu button */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 text-gray-300 hover:text-white focus:outline-none transition-colors duration-200"
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            {!isMobileMenuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        </div>
      </div>
      
      {/* Mobile Menu Dropdown - Floating style with black and gold */}
      {isMobileMenuOpen && (
        <div className="bg-black border border-[#B8953F]/20 md:hidden mt-2 overflow-hidden absolute left-1/2 transform -translate-x-1/2 z-50 rounded-3xl shadow-xl w-11/12 max-w-6xl">
          <div className="py-4 px-6">
            <div className="flex flex-col space-y-3">
              {filteredNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`py-2 text-sm font-medium ${activeLink === item.path ? 'text-[#B8953F]' : 'text-gray-300 hover:text-white'}`}
                  onClick={() => {
                    setActiveLink(item.path);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {item.label}
                </Link>
              ))}
              
              {/* Mobile menu additional options */}
              <div className="pt-4 mt-3 border-t border-[#1E2330]">
                {/* BetCard button in mobile menu */}
                <button
                  onClick={() => {
                    openBetCardProfile();
                    setIsMobileMenuOpen(false);
                  }}
                  className="block w-full text-left py-2 text-sm font-medium text-gray-300 hover:text-white"
                >
                  BetCard
                </button>
                
                {/* Mobile sign in button */}
                {!session ? (
                  <>
                    <Link 
                      to="/signin" 
                      className="block py-2 text-sm font-medium text-gray-300 hover:text-white"
                      onClick={() => {
                        setActiveLink("/signin");
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Sign in
                    </Link>
                    <Link 
                      to="/pricing" 
                      className="mt-4 block text-center bg-[#B8953F] hover:bg-[#d4af37] text-black px-4 py-2 rounded-full text-sm font-medium transition-all"
                      onClick={() => {
                        setActiveLink("/pricing");
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Try it free
                    </Link>
                  </>
                ) : (
                  <Link 
                    to="/dashboard" 
                    className="mt-3 block text-center bg-[#B8953F] hover:bg-[#d4af37] text-black px-4 py-2 rounded-full text-sm font-medium transition-all"
                    onClick={() => {
                      setActiveLink("/dashboard");
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    Dashboard
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
