import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useUserPlan } from "../hooks/useUserPlan";
import { useBetCardProfile } from "../contexts/BetCardProfileContext";
import { useAuth } from '../contexts/AuthContext';
import '../styles/navbar.css';

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
    <header className="navbar">
      <div className="container mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="text-lg font-bold flex items-center group">
          <span className="text-[#E0B016] text-lg tracking-tight font-light">GARY</span>
          <span className="text-gray-900 text-lg tracking-wide font-bold">A.I.</span>
        </Link>
        
        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex space-x-8">
          {filteredNavItems.map((item) => (
            item.action ? (
              <button
                key={item.path}
                className="text-lg font-medium text-gray-800 hover:underline transition-colors duration-200"
                onClick={item.action}
              >
                {item.label}
              </button>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={`text-lg font-medium transition-colors duration-200 ${activeLink === item.path 
                  ? 'text-[#E0B016] hover:underline' 
                  : 'text-gray-800 hover:underline'}`}
                onClick={() => setActiveLink(item.path)}
              >
                {item.label}
              </Link>
            )
          ))}
        </nav>
      
        {/* Sign In / Sign Up Buttons */}
        <div className="flex items-center space-x-4">
          {!session ? (
            <>
              <Link 
                to="/signin" 
                className="text-gray-700 hover:text-gray-900 font-medium"
                onClick={() => setActiveLink("/signin")}
              >
                Log In
              </Link>
              <Link 
                to="/pricing" 
                className="btn-primary"
                onClick={() => setActiveLink("/pricing")}
              >
                Upgrade →
              </Link>
            </>
          ) : (
            <>
              <button
                className="text-gray-700 hover:text-gray-900 font-medium"
                onClick={openBetCardProfile}
              >
                BetCard
              </button>
              <Link 
                to="/signout" 
                className="text-white bg-gray-800 px-4 py-2 rounded-md font-semibold hover:bg-gray-700 transition-all"
                onClick={() => setActiveLink("/signout")}
              >
                Sign Out
              </Link>
            </>
          )}
          
          {/* Mobile menu button */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-gray-700 hover:text-gray-900 focus:outline-none rounded-md transition-colors duration-200"
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            {!isMobileMenuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        </div>
      </div>
      
      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="bg-white shadow-lg lg:hidden border-t border-gray-100">
          <div className="container mx-auto px-6 py-3">
            <div className="flex flex-col space-y-3">
              {filteredNavItems.map((item) => (
                item.action ? (
                  <button
                    key={item.path}
                    className="px-4 py-3 text-lg font-medium text-gray-800 hover:text-[#E0B016] text-left"
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
                    className={`px-4 py-3 text-lg font-medium ${activeLink === item.path ? 'text-[#E0B016]' : 'text-gray-800 hover:text-[#E0B016]'}`}
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
