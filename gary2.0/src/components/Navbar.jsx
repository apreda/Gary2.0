import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useUserPlan } from "../hooks/useUserPlan";
import { useBetCardProfile } from "../contexts/BetCardProfileContext";
import { useAuth } from '../contexts/AuthContext';
// We'll style the navbar directly in this file without the external CSS

export function Navbar() {
  const location = useLocation();
  const [activeLink, setActiveLink] = useState(location.pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { userPlan } = useUserPlan();
  const { openBetCardProfile } = useBetCardProfile();
  const { user } = useAuth();
  // Use Supabase auth state to determine if user is logged in
  const session = !!user;
  
  // Navigation items - simplified for Vault-like style
  const navItems = [
    { path: '/', label: 'Home' },
    { path: '/real-gary-picks', label: 'Gary\'s Picks' },
    { path: '/billfold', label: 'Billfold' },
    { path: '/leaderboard', label: 'Leaderboard' },
    { path: '/how-it-works', label: 'Docs' },
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
    <header className="sticky top-0 bg-[#0D1117]/95 backdrop-blur-md z-50 px-6 py-2 border-b border-[#E0B016]/10">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-14">
        {/* Logo */}
        <Link to="/" className="flex items-center group">
          <span className="text-[#E0B016] text-2xl tracking-tight font-light font-mono mr-1">GARY</span>
          <span className="text-white text-2xl tracking-wide font-bold font-mono">A.I.</span>
        </Link>
        
        {/* Desktop Navigation Links - Vault style */}
        <nav className="hidden md:flex space-x-8">
          {filteredNavItems.map((item) => (
            item.action ? (
              <button
                key={item.path}
                className="text-sm font-medium text-white/70 hover:text-[#E0B016] transition-colors duration-200"
                onClick={item.action}
              >
                {item.label}
              </button>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium transition-colors duration-200 ${
                  activeLink === item.path 
                  ? 'text-[#E0B016]' 
                  : 'text-white/70 hover:text-[#E0B016]'}`}
                onClick={() => setActiveLink(item.path)}
              >
                {item.label}
              </Link>
            )
          ))}
        </nav>
      
        {/* Sign In / Sign Up Buttons - Vault style */}
        <div className="flex items-center space-x-5">
          {!session ? (
            <>
              <Link 
                to="/signin" 
                className="text-white/80 hover:text-white font-medium text-sm transition-colors"
                onClick={() => setActiveLink("/signin")}
              >
                Sign in
              </Link>
              <Link 
                to="/pricing" 
                className="bg-white/90 hover:bg-white text-[#0D1117] px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center"
                onClick={() => setActiveLink("/pricing")}
              >
                <span>Dashboard</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 ml-1">
                  <path fillRule="evenodd" d="M5 10a.75.75 0 01.75-.75h6.638L10.23 7.29a.75.75 0 111.04-1.08l3.5 3.25a.75.75 0 010 1.08l-3.5 3.25a.75.75 0 11-1.04-1.08l2.158-1.96H5.75A.75.75 0 015 10z" clipRule="evenodd" />
                </svg>
              </Link>
            </>
          ) : (
            <>
              <button
                className="text-white/80 hover:text-white font-medium text-sm transition-colors"
                onClick={openBetCardProfile}
              >
                BetCard
              </button>
              <Link 
                to="/dashboard" 
                className="bg-[#E0B016] hover:bg-[#d4af37] text-black px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center"
                onClick={() => setActiveLink("/dashboard")}
              >
                Dashboard
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 ml-1">
                  <path fillRule="evenodd" d="M5 10a.75.75 0 01.75-.75h6.638L10.23 7.29a.75.75 0 111.04-1.08l3.5 3.25a.75.75 0 010 1.08l-3.5 3.25a.75.75 0 11-1.04-1.08l2.158-1.96H5.75A.75.75 0 015 10z" clipRule="evenodd" />
                </svg>
              </Link>
            </>
          )}
          
          {/* Mobile menu button */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 text-white/70 hover:text-white/90 focus:outline-none transition-colors duration-200"
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
      
      {/* Mobile Menu Dropdown - Vault style */}
      {isMobileMenuOpen && (
        <div className="bg-[#0D1117]/95 shadow-lg md:hidden mt-2 border-t border-[#E0B016]/10 overflow-hidden animate-fadeIn absolute left-0 right-0">
          <div className="max-w-7xl mx-auto py-4 px-6">
            <div className="flex flex-col space-y-3">
              {filteredNavItems.map((item) => (
                item.action ? (
                  <button
                    key={item.path}
                    className="py-2 text-sm font-medium text-white/70 hover:text-[#E0B016] text-left"
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
                    className={`py-2 text-sm font-medium ${activeLink === item.path ? 'text-[#E0B016]' : 'text-white/70 hover:text-[#E0B016]'}`}
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
        </div>
      )}
    </header>
  );
}
