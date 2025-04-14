import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSpring, animated } from "react-spring";
import { SidebarMenu, SidebarMenuItem } from "./SidebarMenu";
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../ui/ThemeProvider';
import garyLogo from '../../assets/images/gary_logo.svg';

export default function Sidebar({ isOpen = false, onToggle }) {
  const { session, signOut, user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { path: '/dashboard', label: 'My Dashboard', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { path: '/real-gary-picks', label: 'Gary\'s Picks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { path: '/gary-daily-parlay', label: 'Daily Parlay', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
    { path: '/gary-live', label: 'Gary Live', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { path: '/billfold', label: 'Billfold', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { path: '/leaderboard', label: 'Leaderboard', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  ];
  
  // Filter the dashboard link if not logged in
  const filteredNavItems = !session ? navItems.filter(item => item.path !== '/dashboard') : navItems;

  return (
    <>
      {/* Sidebar */}
      <aside
        id="sidebar"
        className={`
          h-screen sticky top-0
          w-72
          bg-white dark:bg-black
          border-r border-[#e6e6e6] dark:border-[#333333]
          flex flex-col
          transition-all
          duration-300
          ease-out
          shadow-lg
        `}
      >
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <img 
                  src={garyLogo} 
                  alt="Gary A.I." 
                  className="h-10 w-10 object-contain" 
                />
                <span className="text-xl font-semibold text-black dark:text-white">Gary A.I.</span>
              </div>
              <button 
                onClick={() => onToggle(false)}
                className="text-slate-500 hover:text-black dark:text-[#c0c0c0] dark:hover:text-white
                transition-colors duration-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-[#333333]"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User info */}
            {session && (
              <div className="mb-6 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-navy-200 dark:bg-navy-800 flex items-center justify-center text-navy-900 dark:text-white font-medium">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {user?.name || 'User'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {user?.email || 'user@example.com'}
                    </p>
                  </div>
                  {!user?.subscription?.plan && (
                    <div>
                      <Link 
                        to="/upgrade" 
                        className="flex items-center gap-2 px-3 py-1 text-xs bg-gold-400 text-navy-900 rounded font-medium hover:bg-gold-300 transition-colors duration-200"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        Upgrade to Pro
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            <nav className="space-y-1">
              {filteredNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg
                    transition-colors duration-200
                    ${location.pathname === item.path
                      ? item.path === '/dashboard' 
                          ? 'bg-[#fff8e1] dark:bg-[#332d1c] text-black dark:text-[#d4af37] font-medium'
                          : 'bg-[#f0f0f0] dark:bg-[#333333] text-black dark:text-white font-medium'
                      : 'text-slate-600 dark:text-[#c0c0c0] hover:bg-slate-100 dark:hover:bg-[#222222] hover:text-black dark:hover:text-white'}
                  `}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                  </svg>
                  <span>{item.label}</span>
                </Link>
              ))}
              
              <div className="h-px w-full bg-slate-200 dark:bg-[#333333] my-2"></div>
              
              <Link
                to="/upgrade"
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg
                  transition-colors duration-200
                  ${location.pathname === '/upgrade'
                    ? 'bg-[#fff8e1] dark:bg-[#332d1c] text-black dark:text-[#d4af37] font-medium'
                    : 'text-slate-600 dark:text-[#c0c0c0] hover:bg-[#fff8e1]/50 dark:hover:bg-[#333322] hover:text-black dark:hover:text-[#d4af37]'}
                `}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Upgrade to Pro</span>
              </Link>
            </nav>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-[#333333]">
          {!session ? (
            <Link 
              to="/signin"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black hover:bg-[#333333] text-[#d4af37] font-medium rounded-lg shadow-sm hover:shadow transition-all duration-200 border-2 border-[#d4af37]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Sign In
            </Link>
          ) : (
            <button 
              onClick={async (e) => {
                e.preventDefault();
                await signOut();
                navigate('/');
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-[#333333] dark:hover:bg-[#444444] text-slate-700 dark:text-white font-medium rounded-lg transition-colors duration-200 border border-[#e0e0e0] dark:border-[#444444]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          )}
          
          <div className="mt-4 flex items-center justify-center">
            <div className="text-xs text-slate-500 dark:text-[#c0c0c0]">
              © {new Date().getFullYear()} Gary A.I.
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
