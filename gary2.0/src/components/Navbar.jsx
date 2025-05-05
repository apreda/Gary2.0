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
      <div className="container">
        {/* Logo */}
        <Link to="/" className="brand">
          GARY<span>A.I.</span>
        </Link>
        
        {/* Desktop Navigation Links */}
        <nav className="nav-links">
          {filteredNavItems.map((item) => (
            item.action ? (
              <button
                key={item.path}
                className={activeLink === item.path ? 'active' : ''}
                onClick={item.action}
              >
                {item.label}
              </button>
            ) : (
              <Link
                key={item.path}
                to={item.path}
                className={activeLink === item.path ? 'active' : ''}
                onClick={() => setActiveLink(item.path)}
              >
                {item.label}
              </Link>
            )
          ))}
        </nav>
      
        {/* Sign In / Sign Up Buttons */}
        <div className="actions flex items-center gap-6">
          {!session ? (
            <>
              <Link 
                to="/signin" 
                className="btn-text"
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
                className="btn-text"
                onClick={openBetCardProfile}
              >
                BetCard
              </button>
              <Link 
                to="/signout" 
                className="btn-primary"
                onClick={() => setActiveLink("/signout")}
              >
                Sign Out
              </Link>
            </>
          )}
          
          {/* Mobile menu button */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-white hover:text-white/80 focus:outline-none rounded-md transition-colors duration-200"
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
        <div className="bg-[#D4AF37]/95 shadow-lg lg:hidden backdrop-blur-md mt-0 animate-fadeIn z-30">
          <div className="container py-5">
            <div className="flex flex-col space-y-4">
              {filteredNavItems.map((item) => (
                item.action ? (
                  <button
                    key={item.path}
                    className={`px-4 py-2 text-white/90 hover:text-white ${activeLink === item.path ? 'active' : ''}`}
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
                    className={`px-4 py-2 text-white/90 hover:text-white ${activeLink === item.path ? 'active' : ''}`}
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
