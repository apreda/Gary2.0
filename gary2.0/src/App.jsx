import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { useEffect, Suspense } from "react";
import { Navbar } from "./components/Navbar";
import Home from "./pages/Home";
import { TermsOfService } from "./pages/TermsOfService";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { Changelog } from "./pages/Changelog";

import FontLoader from "./components/FontLoader";
import "./assets/css/animations.css";

function AppContent() {
  const location = useLocation();

  useEffect(() => {
    console.log('Current route path:', location.pathname);
  }, [location]);

  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-hidden animate-fadeIn" style={{ animationDuration: '0.5s' }}>
      {/* Add the Navbar */}
      <Navbar />
      
      <div className="flex flex-1 relative z-10">
        {/* Main content area */}
        <div className="flex-grow">
          <Suspense fallback={<div className="flex h-96 items-center justify-center"><div className="animate-pulse text-gray-600 dark:text-gray-300">Loading...</div></div>}>
            <Routes>
              {/* Main landing page */}
              <Route path="/" element={<Home />} />
              
              {/* Legal pages (required) */}
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/changelog" element={<Changelog />} />
              
              {/* Redirect all other routes to home (marketing landing page) */}
              <Route path="/meet-gary" element={<Navigate to="/" replace />} />
              <Route path="/real-gary-picks" element={<Navigate to="/" replace />} />
              <Route path="/gary-props" element={<Navigate to="/" replace />} />
              <Route path="/billfold" element={<Navigate to="/" replace />} />
              <Route path="/leaderboard" element={<Navigate to="/" replace />} />
              <Route path="/learn-more" element={<Navigate to="/" replace />} />
              <Route path="/team-picks" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
      
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
          <Link to="/privacy" style={{ color: '#b8953f', marginRight: '20px', textDecoration: 'none' }}>Privacy Policy</Link>
          <Link to="/changelog" style={{ color: '#b8953f', textDecoration: 'none' }}>Changelog</Link>
        </div>
        
        <div style={{ fontSize: '0.8rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.4' }}>
          <p style={{ marginBottom: '12px' }}><strong>DISCLAIMER:</strong> This site is 100% for entertainment purposes only and does not involve real money betting or prizes. You must be 18+ years old to utilize Gary.ai.</p>
          
          <p style={{ marginBottom: '12px' }}>If you or someone you know may have a gambling problem, call 1-800 GAMBLER (1-800-426-2537). For more information and resources, visit our Responsible Gaming page.</p>
          
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
      <FontLoader />
      <AppContent />
    </Router>
  );
}
