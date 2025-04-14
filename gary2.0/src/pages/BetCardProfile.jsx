import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ErrorBoundary from '../components/ErrorBoundary';
import '../styles/dimensional.css';
import gary1 from '../assets/images/gary1.svg';

// BetCard Profile Page Component
export default function BetCardProfile() {
  const [betTracking, setBetTracking] = useState({
    betsWithGary: 0,
    betsAgainstGary: 0,
    totalBets: 0,
    currentStreak: 0,
    picks: []
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load betting history from localStorage on component mount
  useEffect(() => {
    // Check if user is logged in
    const userToken = localStorage.getItem('userToken');
    if (userToken) {
      setIsLoggedIn(true);
      // Load betting history from localStorage if available
      const savedBetTracking = localStorage.getItem('garyBetTracking');
      if (savedBetTracking) {
        setBetTracking(JSON.parse(savedBetTracking));
      }
    }
    setLoading(false);
  }, []);

  // Helper function to format date
  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Helper function to get streak display with color
  const getStreakDisplay = () => {
    const streak = betTracking.currentStreak;
    if (streak > 0) {
      return <span className="text-green-600">+{streak} 🔥</span>;
    } else if (streak < 0) {
      return <span className="text-red-600">{streak} ❄️</span>;
    }
    return <span className="text-gray-600">0</span>;
  };

  // Calculate win percentage of bets with Gary
  const withGaryPercentage = betTracking.totalBets > 0
    ? Math.round((betTracking.betsWithGary / betTracking.totalBets) * 100)
    : 0;

  // Render login prompt if user is not logged in
  if (!isLoggedIn && !loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <img src={gary1} alt="Gary AI" className="w-24 h-24 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">BetCard Profile Access</h2>
          <p className="text-gray-600 mb-8">Please sign in to view your BetCard Profile and track your betting performance.</p>
          <Link 
            to="/signin" 
            className="block w-full py-3 px-4 bg-[#d4af37] text-black font-bold rounded-lg transition-colors hover:bg-[#c4a127] text-center"
          >
            Sign In to Continue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#f8f9fa]">
        {/* Header with dimensional effects */}
        <div className="relative bg-[#111] py-12 px-4 sm:px-6 lg:px-8 border-b border-[#222]">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute left-1/3 top-0 bg-gradient-to-r from-[#e5c349] via-[#d4af37] to-transparent w-1/3 h-[400px] blur-[120px] opacity-10 transform -translate-y-1/2 rounded-full"></div>
            <div className="absolute right-1/3 bottom-0 bg-gradient-to-l from-[#e5c349] via-[#d4af37] to-transparent w-1/3 h-[400px] blur-[120px] opacity-10 transform translate-y-1/2 rounded-full"></div>
          </div>
          
          <div className="relative z-10 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">BetCard Profile</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">Track your betting performance and see how well you do riding or fading Gary's picks</p>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Betting Summary</h3>
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-600">Total Bets:</span>
                <span className="text-xl font-bold text-gray-900">{betTracking.totalBets}</span>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-600">Current Streak:</span>
                <span className="text-xl font-bold">{getStreakDisplay()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Win Rate:</span>
                <span className="text-xl font-bold text-gray-900">--</span>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-gray-700 mb-4">Bet With Gary</h3>
              <div className="flex items-end mb-4">
                <div className="text-4xl font-bold text-[#d4af37] mr-2">{withGaryPercentage}%</div>
                <div className="text-gray-600 pb-1">of the time</div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">With Gary:</span>
                <span className="font-medium text-gray-900">{betTracking.betsWithGary}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Against Gary:</span>
                <span className="font-medium text-gray-900">{betTracking.betsAgainstGary}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                <div 
                  className="bg-[#d4af37] h-2.5 rounded-full" 
                  style={{ width: `${withGaryPercentage}%` }}
                ></div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">League Breakdown</h3>
              <div className="space-y-4">
                {/* Calculate league breakdown from betTracking.picks */}
                {['NBA', 'NFL', 'MLB'].map(league => {
                  const leaguePicks = betTracking.picks.filter(pick => pick.league === league);
                  return (
                    <div key={league} className="flex justify-between items-center">
                      <span className="text-gray-600">{league}:</span>
                      <span className="font-medium text-gray-900">{leaguePicks.length} picks</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Betting History Table */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden mb-12">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Betting History</h3>
            </div>
            
            {betTracking.picks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Game
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        League
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gary's Pick
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Your Decision
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {betTracking.picks.map(pick => (
                      <tr key={pick.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(pick.timestamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {pick.game}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {pick.league}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {pick.garyPick}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            pick.userDecision === 'ride' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {pick.userDecision === 'ride' ? 'With Gary' : 'Against Gary'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {pick.result === 'pending' ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          ) : (
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              pick.result === 'win' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {pick.result === 'win' ? 'Win' : 'Loss'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                <p>No betting history yet. Start making picks to track your performance!</p>
                <Link 
                  to="/picks" 
                  className="inline-block mt-4 py-2 px-4 bg-[#d4af37] text-black font-semibold rounded transition-colors hover:bg-[#c4a127]"
                >
                  View Today's Picks
                </Link>
              </div>
            )}
          </div>
          
          {/* Tips & Insights */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Tips & Insights</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">Track Your Performance</h4>
                  <p className="text-gray-600 text-sm">
                    Keep making picks consistently to get accurate insights into your betting patterns and 
                    success rate. The more data we have, the better advice Gary can provide.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">Finding Your Edge</h4>
                  <p className="text-gray-600 text-sm">
                    Pay attention to which sports and bet types you perform best with. You might discover
                    you have better instincts for certain leagues or bet types than others.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
