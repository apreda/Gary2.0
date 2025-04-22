import { useEffect, useState } from "react";
// Make sure react-icons is installed
// If not, install with: npm install react-icons
import { FaFire, FaChartLine, FaUsers } from 'react-icons/fa';
// Fallback icons in case react-icons is not available
const iconFallbacks = {
  trophy: "🏆",
  fire: "🔥",
  chart: "📈"
};

// Mock data for the simplified leaderboard tracking Bet with Gary vs. Fade the Bear decisions
const mockLeaderboardData = [
  { 
    id: 1,
    username: "VegasBaller", 
    totalDecisions: 157, 
    rideCount: 105,
    fadeCount: 52,
    correctDecisions: 108, 
    winRate: 68.8,
    streak: 6,
    preferredStrategy: "ride", // 'ride' = mostly Bet with Gary, 'fade' = mostly Fade the Bear
    avatar: "https://i.pravatar.cc/150?img=1"
  },
  { 
    id: 2,
    username: "MoneyMaker23", 
    totalDecisions: 214, 
    rideCount: 89,
    fadeCount: 125,
    correctDecisions: 142, 
    winRate: 66.4,
    streak: 4,
    preferredStrategy: "fade",
    avatar: "https://i.pravatar.cc/150?img=2"
  },
  { 
    id: 3,
    username: "BetKing", 
    totalDecisions: 189, 
    rideCount: 120,
    fadeCount: 69,
    correctDecisions: 122, 
    winRate: 64.6,
    streak: 3,
    preferredStrategy: "ride",
    avatar: "https://i.pravatar.cc/150?img=3"
  },
  { 
    id: 4,
    username: "UnderdogHunter", 
    totalDecisions: 176, 
    rideCount: 85,
    fadeCount: 91,
    correctDecisions: 113, 
    winRate: 64.2,
    streak: 2,
    preferredStrategy: "fade",
    avatar: "https://i.pravatar.cc/150?img=4"
  },
  { 
    id: 5,
    username: "SportsProphet", 
    totalDecisions: 201, 
    rideCount: 128,
    fadeCount: 73,
    correctDecisions: 127, 
    winRate: 63.2,
    streak: 0,
    preferredStrategy: "ride",
    avatar: "https://i.pravatar.cc/150?img=5"
  },
  { 
    id: 6,
    username: "ParlayProdigy", 
    totalDecisions: 168, 
    rideCount: 77,
    fadeCount: 91,
    correctDecisions: 104, 
    winRate: 61.9,
    streak: 3,
    preferredStrategy: "fade",
    avatar: "https://i.pravatar.cc/150?img=6"
  },
  { 
    id: 7,
    username: "LineMaster", 
    totalDecisions: 192, 
    rideCount: 123,
    fadeCount: 69,
    correctDecisions: 118, 
    winRate: 61.5,
    streak: 0,
    preferredStrategy: "ride",
    avatar: "https://i.pravatar.cc/150?img=7"
  },
  { 
    id: 8,
    username: "PicksWizard", 
    totalDecisions: 183, 
    rideCount: 95,
    fadeCount: 88,
    correctDecisions: 110, 
    winRate: 60.1,
    streak: 1,
    preferredStrategy: "ride",
    avatar: "https://i.pravatar.cc/150?img=8"
  },
  { 
    id: 9,
    username: "BetExpert", 
    totalDecisions: 169, 
    rideCount: 63,
    fadeCount: 106,
    correctDecisions: 101, 
    winRate: 59.8,
    streak: 2,
    preferredStrategy: "fade",
    avatar: "https://i.pravatar.cc/150?img=9"
  },
  { 
    id: 10,
    username: "OddsSlayer", 
    totalDecisions: 174, 
    rideCount: 82,
    fadeCount: 92,
    correctDecisions: 103, 
    winRate: 59.2,
    streak: 0,
    preferredStrategy: "fade",
    avatar: "https://i.pravatar.cc/150?img=10"
  }
];

export function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [timeframe, setTimeframe] = useState('allTime');

  useEffect(() => {
    // Simulate data loading
    setTimeout(() => {
      setLeaderboard(mockLeaderboardData);
    }, 300);
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-visible">
      {/* GaryHero-style immersive background */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        {/* Subtle cream/white haze gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#f7f4ed]/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-br from-[#fffbe9]/15 via-transparent to-transparent" />
        {/* Faint cream highlight behind main content */}
        <div className="absolute bottom-24 left-0 w-full h-24 bg-gradient-to-t from-[#f7f4ed]/15 via-transparent to-transparent blur-2xl opacity-60" />
        {/* Gold vignette corners */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#d4af37]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#d4af37]/10 blur-3xl" />
        {/* Subtle grid/noise overlay */}
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-soft-light" />
        {/* Radial vignette for cinematic depth */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#18181b]/80 to-black/95 opacity-95" />
      </div>
      
      <div className="max-w-5xl mx-auto relative z-10">
        {/* Podium Showcase for Top 3 */}
        <div className="mb-8 pt-10">

          
          <div className="flex justify-center items-center gap-4 mx-auto max-w-4xl mt-16">
            {/* 2nd Place */}
            <div className="w-64 relative z-10 transform hover:scale-105 transition-all duration-500 rotate-[-5deg]">
              <div className="relative h-72 rounded-xl overflow-hidden shadow-xl perspective-card">
                {/* Card glow effect */}
                <div className="absolute inset-0 z-0">
                  <div className="absolute -top-10 -left-10 w-40 h-40 bg-[#c0c0c0]/20 rounded-full filter blur-[40px]"></div>
                </div>
                
                {/* Card front */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#111] to-[#222] rounded-xl border-2 border-[#c0c0c0] p-4 flex flex-col">
                  {/* Card header */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="px-2 py-1 bg-[#c0c0c0]/20 rounded-md text-xs text-[#c0c0c0] font-semibold">
                      SILVER
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#c0c0c0] flex items-center justify-center text-black font-bold text-lg">
                      2
                    </div>
                  </div>
                  
                  {/* User avatar */}
                  <div className="mx-auto my-2 relative">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#c0c0c0]">
                      <img src={mockLeaderboardData[1].avatar} alt={mockLeaderboardData[1].username} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-2 right-0 px-2 py-1 bg-[#111] border border-[#c0c0c0] rounded-md text-xs text-[#c0c0c0] font-semibold">
                      {mockLeaderboardData[1].preferredStrategy === 'ride' ? 'RIDES WITH GARY' : 'FADES THE BEAR'}
                    </div>
                  </div>
                  
                  {/* User info */}
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <h3 className="text-xl font-bold text-white tracking-wide mb-1">{mockLeaderboardData[1].username}</h3>
                    <div className="flex items-center text-[#c0c0c0] text-sm mb-3">
                      {typeof FaFire !== 'undefined' ? <FaFire className="mr-1" /> : <span className="mr-1">{iconFallbacks.fire}</span>}
                      {mockLeaderboardData[1].rideCount > mockLeaderboardData[1].fadeCount ? 'Gary Believer' : 'Bear Fader'}
                    </div>
                  </div>
                  
                  {/* Stats bar */}
                  <div className="mt-auto">
                    <div className="flex justify-between items-center mb-1 text-xs text-[#c0c0c0]">
                      <span>WIN RATE</span>
                      <span>RECORD: {mockLeaderboardData[1].correctDecisions}-{mockLeaderboardData[1].totalDecisions - mockLeaderboardData[1].correctDecisions}</span>
                    </div>
                    <div className="h-6 bg-[#111] rounded-md border border-[#c0c0c0]/30 flex items-center px-2">
                      <div className="flex-1 h-2 bg-[#222] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#c0c0c0]/80 to-[#c0c0c0]" 
                          style={{ width: `${mockLeaderboardData[1].winRate}%` }}
                        ></div>
                      </div>
                      <div className="ml-2 text-[#4ADE80] font-bold">{mockLeaderboardData[1].winRate}%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 1st Place */}
            <div className="w-72 relative z-30 transform scale-110 hover:scale-115 transition-all duration-500 mb-5">
              <div className="relative h-80 rounded-xl overflow-hidden shadow-2xl perspective-card">
                {/* Card glow effects */}
                <div className="absolute inset-0 z-0">
                  <div className="absolute top-0 left-0 right-0 bottom-0 bg-[#d4af37]/5 rounded-xl"></div>
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#d4af37]/20 rounded-full filter blur-[40px]"></div>
                  <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#d4af37]/10 rounded-full filter blur-[30px]"></div>
                </div>
                
                {/* Card front */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#111] to-[#1a1a1a] rounded-xl border-2 border-[#d4af37] p-4 flex flex-col">
                  {/* Card header */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="px-3 py-1 bg-gradient-to-r from-[#d4af37]/80 to-[#d4af37] rounded-md text-xs text-black font-bold">
                      CHAMPION
                    </div>
                    <div className="w-9 h-9 rounded-full bg-[#d4af37] flex items-center justify-center text-black font-bold text-xl shadow-[0_0_10px_rgba(212,175,55,0.5)]">
                      1
                    </div>
                  </div>
                  
                  {/* User avatar */}
                  <div className="mx-auto my-3 relative">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-3 border-[#d4af37] shadow-[0_0_15px_rgba(212,175,55,0.3)]">
                      <img src={mockLeaderboardData[0].avatar} alt={mockLeaderboardData[0].username} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-2 right-0 px-3 py-1 bg-[#111] border border-[#d4af37] rounded-md text-xs text-[#d4af37] font-bold">
                      {mockLeaderboardData[0].preferredStrategy === 'ride' ? 'RIDES WITH GARY' : 'FADES THE BEAR'}
                    </div>
                  </div>
                  
                  {/* Win Rate moved to the top */}
                  <div className="flex-1 flex flex-col items-center justify-center">
                    {/* Win Rate at the top */}
                    <div className="mb-4 mt-2 text-center w-full">
                      <div className="inline-block bg-[#111]/70 px-4 py-1 rounded-full border border-[#d4af37]/40">
                        <span className="text-[#4ADE80] font-bold text-2xl">{mockLeaderboardData[0].winRate}%</span>
                        <span className="text-xs text-[#d4af37] ml-2">WIN RATE</span>
                      </div>
                    </div>
                    
                    <h3 className="text-2xl font-bold text-white tracking-wide mb-1">{mockLeaderboardData[0].username}</h3>
                    <div className="flex items-center text-[#d4af37] text-sm mb-3">
                      {typeof FaFire !== 'undefined' ? <FaFire className="mr-1" /> : <span className="mr-1">{iconFallbacks.fire}</span>}
                      {mockLeaderboardData[0].rideCount > mockLeaderboardData[0].fadeCount ? 'Gary Believer' : 'Bear Fader'}
                    </div>
                  </div>
                  
                  {/* Stats bar */}
                  <div className="mt-auto">
                    <div className="flex justify-between items-center mb-1 text-xs text-[#d4af37]">
                      <span>RECORD</span>
                      <span>{mockLeaderboardData[0].correctDecisions}-{mockLeaderboardData[0].totalDecisions - mockLeaderboardData[0].correctDecisions}</span>
                    </div>
                    <div className="h-5 bg-[#111] rounded-md border border-[#d4af37]/30 flex items-center px-2">
                      <div className="flex-1 h-2 bg-[#222] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#d4af37]/80 to-[#d4af37]" 
                          style={{ width: `${mockLeaderboardData[0].correctDecisions/mockLeaderboardData[0].totalDecisions*100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="w-64 relative z-10 transform hover:scale-105 transition-all duration-500 rotate-[5deg]">
              <div className="relative h-72 rounded-xl overflow-hidden shadow-xl perspective-card">
                {/* Card glow effect */}
                <div className="absolute inset-0 z-0">
                  <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-[#cd7f32]/20 rounded-full filter blur-[40px]"></div>
                </div>
                
                {/* Card front */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#111] to-[#222] rounded-xl border-2 border-[#cd7f32] p-4 flex flex-col">
                  {/* Card header */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="px-2 py-1 bg-[#cd7f32]/20 rounded-md text-xs text-[#cd7f32] font-semibold">
                      BRONZE
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#cd7f32] flex items-center justify-center text-black font-bold text-lg">
                      3
                    </div>
                  </div>
                  
                  {/* User avatar */}
                  <div className="mx-auto my-2 relative">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#cd7f32]">
                      <img src={mockLeaderboardData[2].avatar} alt={mockLeaderboardData[2].username} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute -bottom-2 right-0 px-2 py-1 bg-[#111] border border-[#cd7f32] rounded-md text-xs text-[#cd7f32] font-semibold">
                      {mockLeaderboardData[2].preferredStrategy === 'ride' ? 'RIDES WITH GARY' : 'FADES THE BEAR'}
                    </div>
                  </div>
                  
                  {/* User info */}
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <h3 className="text-xl font-bold text-white tracking-wide mb-1">{mockLeaderboardData[2].username}</h3>
                    <div className="flex items-center text-[#cd7f32] text-sm mb-3">
                      {typeof FaFire !== 'undefined' ? <FaFire className="mr-1" /> : <span className="mr-1">{iconFallbacks.fire}</span>}
                      {mockLeaderboardData[2].rideCount > mockLeaderboardData[2].fadeCount ? 'Gary Believer' : 'Bear Fader'}
                    </div>
                  </div>
                  
                  {/* Stats bar */}
                  <div className="mt-auto">
                    <div className="flex justify-between items-center mb-1 text-xs text-[#cd7f32]">
                      <span>WIN RATE</span>
                      <span>RECORD: {mockLeaderboardData[2].correctDecisions}-{mockLeaderboardData[2].totalDecisions - mockLeaderboardData[2].correctDecisions}</span>
                    </div>
                    <div className="h-6 bg-[#111] rounded-md border border-[#cd7f32]/30 flex items-center px-2">
                      <div className="flex-1 h-2 bg-[#222] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#cd7f32]/80 to-[#cd7f32]" 
                          style={{ width: `${mockLeaderboardData[2].winRate}%` }}
                        ></div>
                      </div>
                      <div className="ml-2 text-[#4ADE80] font-bold">{mockLeaderboardData[2].winRate}%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Time Frame Filters */}
        <div className="flex justify-center mb-10 space-x-3">
          <button 
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${timeframe === 'weekly' ? 'bg-[#d4af37] text-black' : 'bg-[#111]/80 text-gray-300 border border-[#d4af37]/30 hover:bg-[#d4af37]/10'}`}
            onClick={() => setTimeframe('weekly')}
          >
            This Week
          </button>
          <button 
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${timeframe === 'monthly' ? 'bg-[#d4af37] text-black' : 'bg-[#111]/80 text-gray-300 border border-[#d4af37]/30 hover:bg-[#d4af37]/10'}`}
            onClick={() => setTimeframe('monthly')}
          >
            This Month
          </button>
          <button 
            className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${timeframe === 'allTime' ? 'bg-[#d4af37] text-black' : 'bg-[#111]/80 text-gray-300 border border-[#d4af37]/30 hover:bg-[#d4af37]/10'}`}
            onClick={() => setTimeframe('allTime')}
          >
            All Time
          </button>
        </div>
        
        {/* Leaderboard Table */}
        <div className="bg-[#111]/80 backdrop-blur-sm rounded-xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-[#d4af37]/20 border border-[#d4af37]/20">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#333]">
                <th className="p-5 text-[#d4af37] font-medium">Rank</th>
                <th className="p-5 text-[#d4af37] font-medium">User</th>
                <th className="p-5 text-[#d4af37] font-medium text-center">Total Picks</th>
                <th className="p-5 text-[#d4af37] font-medium text-center">Bet with Gary</th>
                <th className="p-5 text-[#d4af37] font-medium text-center">Fade the Bear</th>
                <th className="p-5 text-[#d4af37] font-medium text-center">Win Rate</th>
                <th className="p-5 text-[#d4af37] font-medium text-center">Streak</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((user, index) => (
                <tr 
                  key={user.id} 
                  className={`border-b border-[#222] hover:bg-[#d4af37]/5 transition-colors duration-300 ${index < 3 ? 'bg-[#d4af37]/10' : ''}`}
                >
                  <td className="p-5">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#222] text-white font-bold">
                      {index + 1}
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full overflow-hidden mr-3 border-2 border-[#d4af37]/30">
                        <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="text-white font-medium">{user.username}</div>
                        {index < 3 && (
                          <div className="text-xs text-[#d4af37] flex items-center">
                            {typeof FaFire !== 'undefined' ? <FaFire className="mr-1" /> : <span className="mr-1">{iconFallbacks.fire}</span>} 
                            {user.preferredStrategy === 'ride' ? 'Gary Believer' : 'Bear Fader'}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-5 text-center">
                    <div className="text-gray-300">{user.totalDecisions}</div>
                  </td>
                  <td className="p-5 text-center">
                    <div className={`text-gray-300 ${user.preferredStrategy === 'ride' ? 'text-[#4ADE80] font-medium' : ''}`}>{user.rideCount}</div>
                  </td>
                  <td className="p-5 text-center">
                    <div className={`text-gray-300 ${user.preferredStrategy === 'fade' ? 'text-[#4ADE80] font-medium' : ''}`}>{user.fadeCount}</div>
                  </td>
                  <td className="p-5 text-center">
                    <span className="font-medium" style={{ color: user.winRate > 60 ? '#4ADE80' : '#d4af37' }}>
                      {user.winRate}%
                    </span>
                  </td>
                  <td className="p-5 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${user.streak > 0 ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
                      {user.streak > 0 ? `W${user.streak}` : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Your Rank Section */}
        <div className="mt-8 bg-[#111]/80 backdrop-blur-sm rounded-xl overflow-hidden p-5 border border-[#d4af37]/20 hover:shadow-lg hover:shadow-[#d4af37]/20 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-full bg-[#d4af37]/20 flex items-center justify-center mr-4">
                {typeof FaTrophy !== 'undefined' ? <FaTrophy className="text-[#d4af37]" /> : <span className="text-[#d4af37]">{iconFallbacks.trophy}</span>}
              </div>
              <div>
                <div className="text-sm text-gray-400">Your Current Rank</div>
                <div className="text-xl font-bold text-white">Not Ranked Yet</div>
              </div>
            </div>
            <button className="px-5 py-2 bg-[#d4af37] text-black rounded-md text-sm font-medium transition-all hover:bg-[#c9a431]">
              Start Betting
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}