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
    <header className="sticky top-0 bg-white z-50 shadow-sm py-4">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo with blue dot (Hashnode style) */}
        <Link to="/" className="flex items-center group">
          <div className="mr-2 relative">
            <div className="w-8 h-8 rounded-full bg-[#0066ff] flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            {/* Keep our color scheme with the gold accent */}
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#E0B016]"></div>
          </div>
          <span className="text-black text-lg font-bold">GARY</span>
          <span className="text-[#E0B016] text-lg font-bold ml-1">AI</span>
        </Link>
        
        {/* Desktop Navigation Links - Hashnode style with center positioning */}
        <nav className="hidden md:flex space-x-8 mx-auto">
          {filteredNavItems.map((item) => (
            item.action ? (
              <button
                key={item.path}
                className="text-sm font-medium text-gray-600 hover:text-[#E0B016] transition-colors duration-200"
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
                  ? 'text-[#E0B016] font-semibold' 
                  : 'text-gray-600 hover:text-[#E0B016]'}`}
                onClick={() => setActiveLink(item.path)}
              >
                {item.label}
              </Link>
            )
          ))}
        </nav>
      
        {/* Sign In / Sign Up Buttons - Hashnode style */}
        <div className="flex items-center space-x-4">
          {!session ? (
            <>
              <Link 
                to="/signin" 
                className="text-gray-700 hover:text-[#E0B016] font-medium text-sm transition-colors"
                onClick={() => setActiveLink("/signin")}
              >
                Sign in
              </Link>
              <Link 
                to="/pricing" 
                className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-md text-sm font-medium transition-all"
                onClick={() => setActiveLink("/pricing")}
              >
                Sign up for free
              </Link>
            </>
          ) : (
            <>
              <button
                className="text-gray-700 hover:text-[#E0B016] font-medium text-sm transition-colors"
                onClick={openBetCardProfile}
              >
                BetCard
              </button>
              <Link 
                to="/dashboard" 
                className="bg-[#E0B016] hover:bg-[#d4af37] text-black px-4 py-2 rounded-md text-sm font-medium transition-all"
                onClick={() => setActiveLink("/dashboard")}
              >
                Dashboard
              </Link>
            </>
          )}
          
          {/* Mobile menu button - Hashnode style */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 text-gray-700 hover:text-gray-900 focus:outline-none transition-colors duration-200"
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
      
      {/* Mobile Menu Dropdown - Hashnode style */}
      {isMobileMenuOpen && (
        <div className="bg-white shadow-lg md:hidden mt-1 border-t border-gray-100 overflow-hidden animate-fadeIn absolute left-0 right-0 z-50">
          <div className="py-4 px-6">
            <div className="flex flex-col space-y-3">
              {filteredNavItems.map((item) => (
                item.action ? (
                  <button
                    key={item.path}
                    className="py-2 text-sm font-medium text-gray-700 hover:text-[#E0B016] text-left"
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
                    className={`py-2 text-sm font-medium ${activeLink === item.path ? 'text-[#E0B016]' : 'text-gray-700 hover:text-[#E0B016]'}`}
                    onClick={() => {
                      setActiveLink(item.path);
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    {item.label}
                  </Link>
                )
              ))}
              
              {/* Add mobile sign in buttons */}
              <div className="pt-3 mt-3 border-t border-gray-100">
                {!session ? (
                  <>
                    <Link 
                      to="/signin" 
                      className="block py-2 text-sm font-medium text-gray-700 hover:text-[#E0B016]"
                      onClick={() => {
                        setActiveLink("/signin");
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Sign in
                    </Link>
                    <Link 
                      to="/pricing" 
                      className="mt-2 block text-center bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-md text-sm font-medium transition-all"
                      onClick={() => {
                        setActiveLink("/pricing");
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Sign up for free
                    </Link>
                  </>
                ) : (
                  <Link 
                    to="/dashboard" 
                    className="mt-2 block text-center bg-[#E0B016] hover:bg-[#d4af37] text-black px-4 py-2 rounded-md text-sm font-medium transition-all"
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
