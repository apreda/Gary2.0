import { Link, useLocation } from "react-router-dom";
import { useState } from "react";

// App Store URL for Gary AI
const APP_STORE_URL = "https://apps.apple.com/us/app/gary-ai/id6751238914";

export function Navbar() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  return (
    <header className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-black z-50 border border-[#B8953F]/20 py-3 rounded-3xl shadow-xl w-11/12 max-w-6xl">
      <div className="w-full px-6 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center">
          <Link to="/" className="flex items-center group">
            <span className="text-white text-xl font-light tracking-tight" style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '0.05em' }}>Gary</span>
            <span className="text-[#B8953F] text-xl font-bold" style={{ fontFamily: 'Arial, sans-serif' }}>.AI</span>
          </Link>
        </div>
        
        {/* Download App Button - Desktop */}
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center space-x-2 px-4 py-2 rounded-full transition-all duration-200 hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, #B8953F 0%, #d4af37 50%, #B8953F 100%)',
            color: '#111',
            fontWeight: '600',
            fontSize: '0.875rem',
            boxShadow: '0 2px 8px rgba(184, 149, 63, 0.3)',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          <span>Download App</span>
        </a>
        
        {/* Download App Button - Mobile */}
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="md:hidden flex items-center space-x-1 px-3 py-1.5 rounded-full transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, #B8953F 0%, #d4af37 50%, #B8953F 100%)',
            color: '#111',
            fontWeight: '600',
            fontSize: '0.75rem',
            boxShadow: '0 2px 8px rgba(184, 149, 63, 0.3)',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          <span>Get App</span>
        </a>
      </div>
    </header>
  );
}
