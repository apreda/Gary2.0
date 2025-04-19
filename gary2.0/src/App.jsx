import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { BetCardProfileProvider } from './contexts/BetCardProfileContext';
import { UserPlanProvider } from './contexts/UserPlanContext';
import { UserStatsProvider } from './contexts/UserStatsContext';
import { useState, useEffect, lazy, Suspense } from "react";
import { Navbar } from "./components/Navbar";
import { Home } from "./pages/Home";
import { MeetGary } from "./pages/MeetGary";
import RealGaryPicks from "./pages/RealGaryPicks";
import { Pricing } from "./pages/Pricing";
import { Billfold } from "./pages/Billfold";
import { Leaderboard } from "./pages/Leaderboard";
import { HowItWorks } from "./pages/HowItWorks";

// Admin components - dynamically loaded
const RefreshTool = lazy(() => import('./components/RefreshTool'));


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
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/billfold" element={<Billfold />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/how-it-works" element={<HowItWorks />} />

              <Route path="/signin" element={<SignIn />} />
              <Route path="/signout" element={<SignOut />} />
              <Route path="/checkout" element={<Checkout />} />
              {/* Parlays feature removed */}
              <Route path="/betcard" element={
                session ? <BetCardProfile /> : <Navigate to="/signin" replace />
              } />
              <Route path="/dashboard" element={
                session ? <UserDashboard /> : <Navigate to="/signin" replace />
              } />
              {/* Admin routes */}
              <Route path="/admin/refresh-picks" element={<RefreshTool />} />
            </Routes>
          </Suspense>
        </div>
      </div>
      
      {/* Chat with Gary feature removed */}
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
              </ToastProvider>
            </BetCardProfileProvider>
          </UserStatsProvider>
        </UserPlanProvider>
      </AuthProvider>
    </Router>
  );
}
