import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import garyLogo from '../assets/images/gary_logo.svg';

export function UserDashboard() {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState({
    wins: 0,
    losses: 0,
    bankroll: 1000,
    parlaysHit: 0,
    parlaysTotal: 0,
    favoriteTeam: 'N/A',
    activeDays: 0
  });
  const [loading, setLoading] = useState(true);

  // Calculate win percentage
  const winPercentage = stats.wins + stats.losses > 0 
    ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) 
    : 0;

  // Calculate parlay hit rate
  const parlayHitRate = stats.parlaysTotal > 0 
    ? ((stats.parlaysHit / stats.parlaysTotal) * 100).toFixed(1) 
    : 0;

  useEffect(() => {
    const fetchUserStats = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        
        // In a real app, fetch actual stats from database
        // For now, generate mock stats
        const mockStats = {
          wins: Math.floor(Math.random() * 30) + 15,
          losses: Math.floor(Math.random() * 20) + 5,
          bankroll: 1000 + (Math.random() * 1500),
          parlaysHit: Math.floor(Math.random() * 8),
          parlaysTotal: Math.floor(Math.random() * 10) + 10,
          favoriteTeam: ['Lakers', 'Chiefs', 'Yankees', 'Celtics', 'Jets'][Math.floor(Math.random() * 5)],
          activeDays: Math.floor(Math.random() * 30) + 5
        };
        
        setStats(mockStats);
      } catch (error) {
        console.error('Error fetching user stats:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserStats();
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h2 className="text-3xl font-bold text-black dark:text-white mb-2 relative inline-block">
        <span>My Dashboard</span>
        <div className="absolute -bottom-2 left-0 w-full h-[3px] bg-[#d4af37]"></div>
      </h2>
      <p className="text-[#444444] dark:text-[#c0c0c0] mb-8 mt-6">
        Welcome back! Track your bets, bankroll and performance.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Baseball Card Style User Profile */}
        <div className="md:col-span-1">
          <div className="h-full bg-[#f5f5f5] dark:bg-black border-4 border-[#d4af37] rounded-lg overflow-hidden relative shadow-xl transform transition hover:scale-[1.01]">
            {/* Vintage elements */}
            <div className="absolute top-0 left-0 w-full h-full">
              <div className="absolute top-0 left-0 w-16 h-16 border-r border-b border-dashed border-[#d4af37]/30"></div>
              <div className="absolute bottom-0 right-0 w-16 h-16 border-l border-t border-dashed border-[#d4af37]/30"></div>
              <div className="absolute top-3 right-3 w-24 h-24 rounded-full bg-[#d4af37]/10"></div>
            </div>
            
            {/* Team logo corner */}
            <div className="absolute top-4 right-4 w-16 h-16 flex items-center justify-center bg-white dark:bg-[#222222] rounded-full border-2 border-[#d4af37] p-2 shadow-lg">
              <img src={garyLogo} alt="Gary" className="w-10 h-10" />
            </div>
            
            {/* Card heading */}
            <div className="pt-4 px-6 flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-black border-4 border-[#d4af37] flex items-center justify-center text-2xl font-bold text-[#d4af37] shadow-inner mb-2">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="mt-2 text-center">
                <h3 className="text-xl font-bold text-black dark:text-white">
                  {user.email?.split('@')[0] || 'User'}
                </h3>
                <div className="text-xs text-[#444444] dark:text-[#c0c0c0] font-mono mt-1">
                  Member since {new Date().toLocaleDateString()}
                </div>
              </div>
            </div>
            
            {/* Card stats */}
            <div className="p-6 mt-4">
              <div className="bg-black dark:bg-[#222222] p-4 rounded-md">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-[#d4af37] text-sm uppercase tracking-wide font-mono">Win Rate</div>
                    <div className="text-white text-xl font-bold">{winPercentage}%</div>
                  </div>
                  <div>
                    <div className="text-[#d4af37] text-sm uppercase tracking-wide font-mono">Bankroll</div>
                    <div className="text-white text-xl font-bold">${stats.bankroll.toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-[#d4af37] text-sm uppercase tracking-wide font-mono">W-L</div>
                    <div className="text-white text-xl font-bold">{stats.wins}-{stats.losses}</div>
                  </div>
                  <div>
                    <div className="text-[#d4af37] text-sm uppercase tracking-wide font-mono">Parlays</div>
                    <div className="text-white text-xl font-bold">{parlayHitRate}%</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-[#e0e0e0] dark:border-[#333333]">
                <div className="text-[#444444] dark:text-[#c0c0c0] mb-1 text-sm">Favorite Team</div>
                <div className="text-black dark:text-white font-medium">{stats.favoriteTeam}</div>
                
                <div className="text-[#444444] dark:text-[#c0c0c0] mb-1 mt-3 text-sm">Active Days</div>
                <div className="text-black dark:text-white font-medium">{stats.activeDays} days</div>
              </div>
              
              {/* Sign out button */}
              <button
                onClick={handleSignOut}
                className="w-full mt-6 py-3 bg-black dark:bg-[#222222] text-white hover:bg-[#333333] dark:hover:bg-[#444444] rounded-md font-medium transition-colors"
              >
                Sign Out
              </button>
            </div>
            
            {/* Card footer - vintage style */}
            <div className="p-3 bg-[#d4af37] text-center text-black text-xs font-bold uppercase tracking-wider">
              GARY A.I. BETTOR CARD • SERIES 2025
            </div>
          </div>
        </div>
        
        {/* Recent Activity & Quick Actions */}
        <div className="md:col-span-2 space-y-6">
          {/* Recent Bets Summary */}
          <div className="bg-white dark:bg-black border border-[#e0e0e0] dark:border-[#333333] rounded-lg shadow-md p-6">
            <h3 className="text-xl font-bold text-black dark:text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-[#d4af37]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
              </svg>
              Recent Bets
            </h3>
            
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="relative w-12 h-12">
                  <div className="absolute top-0 left-0 right-0 bottom-0 rounded-full border-t-2 border-b-2 border-[#d4af37] animate-spin"></div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-[#f5f5f5] dark:bg-[#222222] p-4 rounded-lg border border-[#e0e0e0] dark:border-[#333333] flex justify-between">
                  <div>
                    <div className="font-medium text-black dark:text-white">Lakers ML vs Celtics</div>
                    <div className="text-sm text-[#444444] dark:text-[#c0c0c0]">April 11, 2025</div>
                  </div>
                  <div className="flex items-center">
                    <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-medium">Win</span>
                    <span className="ml-2 text-[#d4af37] font-medium">+$120</span>
                  </div>
                </div>
                
                <div className="bg-[#f5f5f5] dark:bg-[#222222] p-4 rounded-lg border border-[#e0e0e0] dark:border-[#333333] flex justify-between">
                  <div>
                    <div className="font-medium text-black dark:text-white">Yankees -1.5 vs Red Sox</div>
                    <div className="text-sm text-[#444444] dark:text-[#c0c0c0]">April 10, 2025</div>
                  </div>
                  <div className="flex items-center">
                    <span className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-full text-xs font-medium">Loss</span>
                    <span className="ml-2 text-[#444444] dark:text-[#c0c0c0] font-medium">-$100</span>
                  </div>
                </div>
                
                <div className="bg-[#f5f5f5] dark:bg-[#222222] p-4 rounded-lg border border-[#e0e0e0] dark:border-[#333333] flex justify-between">
                  <div>
                    <div className="font-medium text-black dark:text-white">Chiefs/Ravens Over 48.5</div>
                    <div className="text-sm text-[#444444] dark:text-[#c0c0c0]">April 9, 2025</div>
                  </div>
                  <div className="flex items-center">
                    <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-medium">Win</span>
                    <span className="ml-2 text-[#d4af37] font-medium">+$90</span>
                  </div>
                </div>
                
                <div className="text-center mt-4">
                  <Link to="/billfold" className="inline-flex items-center text-[#d4af37] hover:text-[#c4a127] font-medium">
                    View all bets
                    <svg className="w-4 h-4 ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                    </svg>
                  </Link>
                </div>
              </div>
            )}
          </div>
          
          {/* Quick Actions */}
          <div className="bg-white dark:bg-black border border-[#e0e0e0] dark:border-[#333333] rounded-lg shadow-md p-6">
            <h3 className="text-xl font-bold text-black dark:text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-[#d4af37]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM6.75 9a.75.75 0 000 1.5h10.5a.75.75 0 000-1.5H6.75zM6.75 12a.75.75 0 000 1.5h10.5a.75.75 0 000-1.5H6.75zM6.75 15a.75.75 0 000 1.5h10.5a.75.75 0 000-1.5H6.75z" clipRule="evenodd" />
              </svg>
              Quick Actions
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link to="/picks" className="bg-[#f5f5f5] dark:bg-[#222222] p-5 rounded-lg border border-[#e0e0e0] dark:border-[#333333] hover:border-[#d4af37] transition-colors group">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-black dark:bg-[#d4af37]/20 rounded-full flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-[#d4af37]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-black dark:text-white group-hover:text-[#d4af37] transition-colors">Today's Picks</div>
                    <div className="text-sm text-[#444444] dark:text-[#c0c0c0]">View Gary's latest picks</div>
                  </div>
                </div>
              </Link>
              
              <Link to="/live" className="bg-[#f5f5f5] dark:bg-[#222222] p-5 rounded-lg border border-[#e0e0e0] dark:border-[#333333] hover:border-[#d4af37] transition-colors group">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-black dark:bg-[#d4af37]/20 rounded-full flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-[#d4af37]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M15.22 6.268a.75.75 0 01.44.97l-2.47 7.5a.75.75 0 01-.97.44l-7.5-2.47a.75.75 0 01-.44-.97l2.47-7.5a.75.75 0 01.97-.44l7.5 2.47zM9 12a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                      <path d="M9 6.75A.75.75 0 009 5.25h1.5a.75.75 0 000-1.5h-1.5a.75.75 0 00-.75.75v3c0 .414.336.75.75.75H12a.75.75 0 000-1.5H9v-1.5zM10.5 18a.75.75 0 000 1.5h1.5a.75.75 0 00.75-.75v-3a.75.75 0 00-.75-.75H9a.75.75 0 000 1.5h3v1.5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-black dark:text-white group-hover:text-[#d4af37] transition-colors">Gary Live</div>
                    <div className="text-sm text-[#444444] dark:text-[#c0c0c0]">Real-time analysis</div>
                  </div>
                </div>
              </Link>
              
              <Link to="/daily-parlay" className="bg-[#f5f5f5] dark:bg-[#222222] p-5 rounded-lg border border-[#e0e0e0] dark:border-[#333333] hover:border-[#d4af37] transition-colors group">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-black dark:bg-[#d4af37]/20 rounded-full flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-[#d4af37]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-black dark:text-white group-hover:text-[#d4af37] transition-colors">Daily Parlay</div>
                    <div className="text-sm text-[#444444] dark:text-[#c0c0c0]">Today's parlay selection</div>
                  </div>
                </div>
              </Link>
              
              <Link to="/billfold" className="bg-[#f5f5f5] dark:bg-[#222222] p-5 rounded-lg border border-[#e0e0e0] dark:border-[#333333] hover:border-[#d4af37] transition-colors group">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-black dark:bg-[#d4af37]/20 rounded-full flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-[#d4af37]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 6.375c0 2.692-4.03 4.875-9 4.875S3 9.067 3 6.375 7.03 1.5 12 1.5s9 2.183 9 4.875z" />
                      <path d="M12 12.75s-9-4.055-9-6.375v8.25c0 2.55 4.03 4.875 9 4.875s9-2.325 9-4.875V6.375c0 2.32-9 6.375-9 6.375z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-black dark:text-white group-hover:text-[#d4af37] transition-colors">My Billfold</div>
                    <div className="text-sm text-[#444444] dark:text-[#c0c0c0]">Bankroll stats</div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
