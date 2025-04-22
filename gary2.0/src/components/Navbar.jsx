import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useUserPlan } from "../hooks/useUserPlan";
import { useBetCardProfile } from "../contexts/BetCardProfileContext";
import { useAuth } from '../contexts/AuthContext';

export function Navbar() {
  const location = useLocation();
  const [activeLink, setActiveLink] = useState(location.pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { userPlan } = useUserPlan();
  const { openBetCardProfile } = useBetCardProfile();
  const { user } = useAuth();
  // Use Supabase auth state to determine if user is logged in
  const session = !!user;
  
  // Navigation items
  const navItems = [
    { path: '/', label: 'Home' },
    { path: '/real-gary-picks', label: 'Gary\'s Picks' },
    { path: '/billfold', label: 'Billfold' },
    { path: '/leaderboard', label: 'Leaderboard' },
    { path: '/pricing', label: 'Pricing' },
  ];
  
  // Additional nav items for signed-in users (no BetCard in main nav - moved to the right side)
  const signedInNavItems = [
    ...navItems,
  ];
  
  // Use appropriate nav items based on sign-in status
  const filteredNavItems = session ? signedInNavItems : navItems;
  
  // Update active link when location changes
  useEffect(() => {
    setActiveLink(location.pathname);
  }, [location.pathname]);
  
  return (
    <header className="fixed top-6 left-1/2 z-50 w-full max-w-[90vw] md:max-w-[75vw] -translate-x-1/2 rounded-full bg-gradient-to-br from-black/90 via-zinc-900/80 to-black/80 border border-[#bfa142]/20 px-6 py-3 backdrop-blur-2xl shadow-md shadow-[#bfa14222] flex justify-between items-center text-white">
      {/* Logo and Left Nav Links */}
      <div className="flex items-center space-x-6">
        <Link to="/" className="text-xl font-bold text-[#d4af37] flex items-center group">
          <span className="text-[#d4af37] text-xl tracking-tight font-light">GARY</span>
          <span className="text-white text-xl tracking-wide font-bold">A.I.</span>
        </Link>
        
        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center space-x-6 text-sm font-light tracking-wide">
          {filteredNavItems.map((item) => (
            item.action ? (
              <button
                key={item.path}
                className={`hover:text-[#d4af37] transition-colors duration-200 text-white`}
                onClick={item.action}
              >
                {item.label}
              </button>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={`hover:text-[#d4af37] transition-colors duration-200 ${activeLink === item.path ? 'text-[#d4af37]' : 'text-white'}`}
                onClick={() => setActiveLink(item.path)}
              >
                {item.label}
              </Link>
            )
          ))}
        </div>
      </div>
      
      {/* Sign In / Sign Up Buttons */}
      <div className="flex items-center space-x-3">
        {!session ? (
          <>
            <Link 
              to="/signin" 
              className="text-sm hover:text-[#d4af37] transition-colors duration-200"
              onClick={() => setActiveLink("/signin")}
            >
              Log In
            </Link>
            <Link 
              to="/pricing" 
              className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-[#d4af37] shadow hover:bg-zinc-900 transition border border-[#d4af37]/40"
              onClick={() => setActiveLink("/pricing")}
            >
              Upgrade
            </Link>
          </>
        ) : (
          <>
            <button
              className="text-sm hover:text-[#d4af37] transition-colors duration-200 mr-2"
              onClick={openBetCardProfile}
            >
              BetCard
            </button>
            <Link 
              to="/signout" 
              className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-zinc-700 transition border border-zinc-700"
              onClick={() => setActiveLink("/signout")}
            >
              Sign Out
            </Link>
          </>
        )}
        
        {/* Mobile menu button */}
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-2 text-white hover:text-[#d4af37] focus:outline-none rounded-full transition-colors duration-200"
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
      
      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-zinc-900/95 rounded-3xl backdrop-blur-lg shadow-xl p-4 md:hidden">
          <div className="flex flex-col space-y-3">
            {filteredNavItems.map((item) => (
              item.action ? (
                <button
                  key={item.path}
                  className={`px-4 py-2 rounded-lg text-left text-white hover:bg-zinc-800`}
                  onClick={() => {
                    item.action();
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ) : (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-lg ${activeLink === item.path ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-white hover:bg-zinc-800'}`}
                  onClick={() => {
                    setActiveLink(item.path);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  {item.label}
                </Link>
              )
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
