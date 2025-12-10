import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { ChevronDown } from 'lucide-react';

export function Navbar() {
  const location = useLocation();
  const [activeLink, setActiveLink] = useState(location.pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPicksDropdownOpen, setIsPicksDropdownOpen] = useState(false);
  const [dropdownTimeout, setDropdownTimeout] = useState(null);
  
  // Navigation items with dropdown structure
  const navItems = [
    { path: '/', label: 'Home' },
    { 
      path: '/real-gary-picks', 
      label: 'Gary\'s Picks',
      hasDropdown: true,
      dropdownItems: [
        { path: '/real-gary-picks', label: 'Gary\'s Picks' },
        { path: '/gary-props', label: 'Gary\'s Props' }
      ]
    },
    { path: '/billfold', label: 'Billfold' },
  ];
  
  useEffect(() => {
    setActiveLink(location.pathname);
  }, [location.pathname]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isPicksDropdownOpen && !event.target.closest('.dropdown-container')) {
        setIsPicksDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPicksDropdownOpen]);
  
  // Helper functions for dropdown with delay
  const handleDropdownMouseEnter = () => {
    if (dropdownTimeout) {
      clearTimeout(dropdownTimeout);
      setDropdownTimeout(null);
    }
    setIsPicksDropdownOpen(true);
  };

  const handleDropdownMouseLeave = () => {
    const timeout = setTimeout(() => {
      setIsPicksDropdownOpen(false);
    }, 300);
    setDropdownTimeout(timeout);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (dropdownTimeout) {
        clearTimeout(dropdownTimeout);
      }
    };
  }, [dropdownTimeout]);
  
  return (
    <header className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-black z-50 border border-[#B8953F]/20 py-3 rounded-3xl shadow-xl w-11/12 max-w-6xl">
      <div className="w-full px-6 flex items-center justify-between">
        {/* Logo */}
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
        
        {/* Center navigation */}
        <nav className="hidden md:flex space-x-6 mx-auto">
          {navItems.map((item) => (
            item.hasDropdown ? (
              <div 
                key={item.path}
                className="relative dropdown-container"
                onMouseEnter={handleDropdownMouseEnter}
                onMouseLeave={handleDropdownMouseLeave}
              >
                <button
                  className={`text-sm font-medium transition-colors duration-200 px-1 py-1 flex items-center space-x-1 ${
                    ['/real-gary-picks', '/gary-props'].includes(activeLink)
                    ? 'text-[#B8953F]' 
                    : 'text-gray-300 hover:text-white'}`}
                  onClick={() => setIsPicksDropdownOpen(!isPicksDropdownOpen)}
                >
                  <span>{item.label}</span>
                  <ChevronDown 
                    size={14} 
                    className={`transition-transform duration-200 ${
                      isPicksDropdownOpen ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
                
                {/* Dropdown Menu */}
                {isPicksDropdownOpen && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-48 bg-black border border-[#B8953F]/20 rounded-xl shadow-xl z-50 py-2"
                    onMouseEnter={handleDropdownMouseEnter}
                    onMouseLeave={handleDropdownMouseLeave}
                  >
                    {item.dropdownItems.map((dropdownItem) => (
                      <Link
                        key={dropdownItem.path}
                        to={dropdownItem.path}
                        className={`block px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                          activeLink === dropdownItem.path 
                          ? 'text-[#B8953F] bg-[#B8953F]/10' 
                          : 'text-gray-300 hover:text-white hover:bg-gray-800/50'}`}
                        onClick={() => {
                          setActiveLink(dropdownItem.path);
                          setIsPicksDropdownOpen(false);
                        }}
                      >
                        {dropdownItem.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
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
            )
          ))}
        </nav>
      
        <div className="flex items-center space-x-2">
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
      
      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="bg-black border border-[#B8953F]/20 md:hidden mt-2 overflow-hidden absolute left-1/2 transform -translate-x-1/2 z-50 rounded-3xl shadow-xl w-11/12 max-w-6xl">
          <div className="py-4 px-6">
            <div className="flex flex-col space-y-3">
              {navItems.map((item) => (
                item.hasDropdown ? (
                  <div key={item.path}>
                    <button
                      className={`w-full text-left py-2 text-sm font-medium flex items-center justify-between ${
                        ['/real-gary-picks', '/gary-props'].includes(activeLink) 
                        ? 'text-[#B8953F]' 
                        : 'text-gray-300 hover:text-white'
                      }`}
                      onClick={() => setIsPicksDropdownOpen(!isPicksDropdownOpen)}
                    >
                      <span>{item.label}</span>
                      <ChevronDown 
                        size={14} 
                        className={`transition-transform duration-200 ${
                          isPicksDropdownOpen ? 'rotate-180' : ''
                        }`} 
                      />
                    </button>
                    
                    {/* Mobile Dropdown Items */}
                    {isPicksDropdownOpen && (
                      <div className="ml-4 mt-2 space-y-2">
                        {item.dropdownItems.map((dropdownItem) => (
                          <Link
                            key={dropdownItem.path}
                            to={dropdownItem.path}
                            className={`block py-1 text-sm font-medium ${
                              activeLink === dropdownItem.path 
                              ? 'text-[#B8953F]' 
                              : 'text-gray-400 hover:text-white'
                            }`}
                            onClick={() => {
                              setActiveLink(dropdownItem.path);
                              setIsMobileMenuOpen(false);
                              setIsPicksDropdownOpen(false);
                            }}
                          >
                            {dropdownItem.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
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
                )
              ))}
              
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
