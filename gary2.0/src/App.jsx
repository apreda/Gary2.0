import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
// Import Analytics dynamically at runtime instead
import { userPickResultsService } from './services/userPickResultsService';
import { BetCardProfileProvider } from './contexts/BetCardProfileContext';
import { UserPlanProvider } from './contexts/UserPlanContext';
import { UserStatsProvider } from './contexts/UserStatsContext';
import { useState, useEffect, lazy, Suspense } from "react";
import { Navbar } from "./components/Navbar";
import Home from "./pages/Home";
import { MeetGary } from "./pages/MeetGary";
import RealGaryPicks from "./pages/RealGaryPicks";
import GaryProps from "./pages/GaryProps";
import { Pricing } from "./pages/Pricing";
import { Billfold } from "./pages/Billfold";
import { Leaderboard } from "./pages/Leaderboard";
import { HowItWorks } from "./pages/HowItWorks";
import { TermsOfService } from "./pages/TermsOfService";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import LearnMore from "./pages/LearnMore";
import { CheckoutSuccess } from "./pages/CheckoutSuccess";
import { CheckoutCancel } from "./pages/CheckoutCancel";
import WhatGaryThinks from "./pages/WhatGaryThinks";
import TeamProps from './pages/TeamProps';

// Admin components - dynamically loaded
const RefreshTool = lazy(() => import('./components/RefreshTool'));
const ResultsAdmin = lazy(() => import('./pages/ResultsAdmin'));
// Demo component removed - no longer needed

// Import debug utilities for troubleshooting
import './utils/debugUserStatus';

import { SignIn } from "./pages/SignIn";
import { SignOut } from "./pages/SignOut";
import { Checkout } from "./pages/Checkout";
// Parlays feature removed
import BetCardProfile from "./pages/BetCardProfile";
// Chat with Gary feature removed
import { UserDashboard } from "./components/UserDashboard";
import { ToastProvider } from "./components/ui/ToastProvider";
import FontLoader from "./components/FontLoader";
import "./assets/css/animations.css";
import "./styles/base.css";
import "./styles/consolidated/root-fix.css"; // Import root-fix to ensure consistent dark background

function AppContent() {
  const location = useLocation();
  const { session, user } = useAuth();
  
  // Automatic results checking has been disabled as requested
  // Results are now manually processed via the admin interface
  useEffect(() => {
    // No automatic scheduling of results updates
    console.log('Automatic results checking is disabled');
    
    return () => {
      // Clean up function maintained for possible future use
      if (userPickResultsService.updateInterval) {
        clearInterval(userPickResultsService.updateInterval);
      }
    };
  }, []);

  useEffect(() => {
    console.log('Current route path:', location.pathname);
  }, [location]);
  
  // Theme toggling functionality
  const ThemeToggle = () => {
    const [isDarkMode, setIsDarkMode] = useState(true);
    
    useEffect(() => {
      // Check initial theme preference
      const isDark = localStorage.getItem('theme') === 'dark' || 
                    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      
      setIsDarkMode(isDark);
      document.documentElement.classList.toggle('dark', isDark);
    }, []);
    
    const toggleTheme = () => {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      
      // Update DOM and store preference
      document.documentElement.classList.toggle('dark', newMode);
      localStorage.setItem('theme', newMode ? 'dark' : 'light');
    };
    
    return (
      <button 
        onClick={toggleTheme}
        className="p-2 text-gray-500 rounded-full hover:text-gray-700 dark:text-gray-400 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDarkMode ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    );
  };
  


  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-hidden animate-fadeIn" style={{ animationDuration: '0.5s' }}>
      {/* Add the Navbar */}
      <Navbar />
      
      <div className="flex flex-1 relative z-10">

        
        {/* Main content area */}
        <div className="flex-grow">
          <Suspense fallback={<div className="flex h-96 items-center justify-center"><div className="animate-pulse text-gray-600 dark:text-gray-300">Loading...</div></div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/meet-gary" element={<MeetGary />} />
              <Route path="/real-gary-picks" element={<RealGaryPicks />} />
              <Route path="/gary-props" element={<GaryProps />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/billfold" element={<Billfold />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/learn-more" element={<LearnMore />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/test" element={<div>Test Page - If you see this, routing is working</div>} />
              <Route path="/team-picks" element={<TeamProps />} />

              <Route path="/signin" element={<SignIn />} />
              <Route path="/signout" element={<SignOut />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/checkout/success" element={<CheckoutSuccess />} />
              <Route path="/checkout/cancel" element={<CheckoutCancel />} />
              {/* Parlays feature removed */}
              <Route path="/betcard" element={
                session ? <BetCardProfile /> : <Navigate to="/signin" replace />
              } />
              <Route path="/dashboard" element={
                session ? <UserDashboard /> : <Navigate to="/signin" replace />
              } />
              {/* Demo route for RetroPickCard - removed as it's no longer needed */}
              {/* Admin routes */}
              <Route path="/admin/refresh-picks" element={<RefreshTool />} />
              <Route path="/admin/results" element={<ResultsAdmin />} />
              <Route path="/what-gary-thinks" element={<WhatGaryThinks />} />
            </Routes>
          </Suspense>
        </div>
      </div>
      
      {/* Chat with Gary feature removed */}
      
      {/* Global footer */}
      <div style={{
        borderTop: '1px solid #333',
        padding: '20px 0',
        textAlign: 'center',
        color: '#999',
        fontSize: '0.9rem',
        width: '100%',
        marginTop: 'auto'
      }}>
        <p>&copy; {new Date().getFullYear()} Gary A.I. LLC. All rights reserved.</p>
        <div style={{ marginTop: '10px', marginBottom: '20px' }}>
          <Link to="/terms" style={{ color: '#b8953f', marginRight: '20px', textDecoration: 'none' }}>Terms of Service</Link>
          <Link to="/privacy" style={{ color: '#b8953f', textDecoration: 'none' }}>Privacy Policy</Link>
        </div>
        
        <div style={{ fontSize: '0.8rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.4' }}>
          <p style={{ marginBottom: '12px' }}><strong>DISCLAIMER:</strong> This site is 100% for entertainment purposes only and does not involve real money betting or prizes. You must be 18+ years old to utilize Gary.ai.</p>
          
          <p style={{ marginBottom: '12px' }}>If you or someone you know may have a gambling problem, Gary.ai For crisis counseling and referral services, call 1-800 GAMBLER (1-800-426-2537). For more information and resources, visit our Responsible Gaming page.</p>
          
          <p>Gambling problem? Call 1-800-GAMBLER (Available in the US)<br />
          Call 877-8-HOPENY or text HOPENY (467369) (NY)<br />
          Call 1-800-327-5050 (MA), 1-800-NEXT-STEP (AZ), 1-800-BETS-OFF (IA), 1-800-981-0023 (PR)</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <UserPlanProvider>
          <UserStatsProvider>
            <BetCardProfileProvider>
              <ToastProvider>
                <FontLoader />
                <AppContent />
                {/* Vercel Analytics is automatically injected at runtime */}
              </ToastProvider>
            </BetCardProfileProvider>
          </UserStatsProvider>
        </UserPlanProvider>
      </AuthProvider>
    </Router>
  );
}
