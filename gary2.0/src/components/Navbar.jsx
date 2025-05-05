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
  
  // Navigation items simplified to match Hashnode style
  const navItems = [
    { path: '/real-gary-picks', label: 'Picks' },
    { path: '/how-it-works', label: 'How It Works' },
    { path: '/pricing', label: 'Pricing' },
    { path: '/leaderboard', label: 'Leaderboard' },
    { path: '/billfold', label: 'Community' },
  ];
  
  // Additional nav items for signed-in users
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
    <header className="sticky top-0 bg-white z-50 border-b border-gray-100 py-3">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo with blue dot (Hashnode style) */}
        <Link to="/" className="flex items-center group">
          <div className="mr-2 relative">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            {/* Keep our color scheme with the gold accent */}
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#E0B016]"></div>
          </div>
          <span className="text-black text-lg font-bold">gary</span>
          <span className="text-[#E0B016] text-lg font-bold">.ai</span>
        </Link>
        
        {/* Desktop Navigation Links - Hashnode style with dropdown markers */}
        <nav className="hidden md:flex space-x-6 mx-auto">
          {filteredNavItems.map((item) => (
            item.action ? (
              <button
                key={item.path}
                className="text-sm font-medium text-gray-700 hover:text-black transition-colors duration-200 px-1 py-1.5"
                onClick={item.action}
              >
                {item.label}
              </button>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium transition-colors duration-200 px-1 py-1.5 ${
                  activeLink === item.path 
                  ? 'text-[#E0B016] font-medium' 
                  : 'text-gray-700 hover:text-black'}`}
                onClick={() => setActiveLink(item.path)}
              >
                {item.label}
              </Link>
            )
          ))}
        </nav>
      
        {/* Sign In / Sign Up Buttons - Exact Hashnode style */}
        <div className="flex items-center space-x-4">
          {!session ? (
            <>
              <Link 
                to="/signin" 
                className="text-gray-700 hover:text-black font-medium text-sm transition-colors rounded-md px-4 py-2 hover:bg-gray-50"
                onClick={() => setActiveLink("/signin")}
              >
                Sign in
              </Link>
              <Link 
                to="/pricing" 
                className="bg-black hover:bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium transition-all"
                onClick={() => setActiveLink("/pricing")}
              >
                Sign up for free
              </Link>
            </>
          ) : (
            <>
              <button
                className="text-gray-700 hover:text-black font-medium text-sm transition-colors rounded-md px-3 py-1.5 hover:bg-gray-50"
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
      
      {/* Mobile Menu Dropdown - Exact Hashnode style */}
      {isMobileMenuOpen && (
        <div className="bg-white border-b border-gray-100 md:hidden mt-0 overflow-hidden absolute left-0 right-0 z-50">
          <div className="py-4 px-6">
            <div className="flex flex-col space-y-2">
              {filteredNavItems.map((item) => (
                item.action ? (
                  <button
                    key={item.path}
                    className="py-2 text-sm font-medium text-gray-700 hover:text-black text-left"
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
                    className={`py-2 text-sm font-medium ${activeLink === item.path ? 'text-black font-semibold' : 'text-gray-700 hover:text-black'}`}
                    onClick={() => {
                      setActiveLink(item.path);
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    {item.label}
                  </Link>
                )
              ))}
            
              
              {/* Add mobile sign in buttons - Exact Hashnode style */}
              <div className="pt-4 mt-2 border-t border-gray-100">
                {!session ? (
                  <>
                    <Link 
                      to="/signin" 
                      className="block py-2 text-sm font-medium text-gray-700 hover:text-black"
                      onClick={() => {
                        setActiveLink("/signin");
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Sign in
                    </Link>
                    <Link 
                      to="/pricing" 
                      className="mt-3 block text-center bg-black hover:bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium transition-all"
                      onClick={() => {
                        setActiveLink("/pricing");
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Sign up for free
                    </Link>
                    <p className="mt-3 text-xs text-gray-500 text-center">No credit card required.</p>
                  </>
                ) : (
                  <>
                    <Link 
                      to="/dashboard" 
                      className="mt-3 block text-center bg-[#E0B016] hover:bg-[#d4af37] text-black px-4 py-2 rounded-md text-sm font-medium transition-all"
                      onClick={() => {
                        setActiveLink("/dashboard");
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      Dashboard
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
