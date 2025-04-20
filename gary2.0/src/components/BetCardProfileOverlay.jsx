import React from 'react';
import { createPortal } from 'react-dom';
import { FaFire, FaSnowflake } from 'react-icons/fa';
import { useUserStats } from '../hooks/useUserStats';

// Baseball card style overlay for BetCard Profile
export default function BetCardProfileOverlay({ isOpen, onClose }) {
  const { stats, loading, error } = useUserStats();

  // Calculate percentages
  const totalBets = stats?.stats?.totalPicks || 0;
  const winRate = totalBets > 0 ? Math.round(((stats?.stats?.winCount || 0) / totalBets) * 100) : 0;
  const ridePercentage = totalBets > 0 ? Math.round(((stats?.stats?.rideCount || 0) / totalBets) * 100) : 0;
  const fadePercentage = totalBets > 0 ? Math.round(((stats?.stats?.fadeCount || 0) / totalBets) * 100) : 0;


  // Return null if not open
  if (!isOpen) return null;

  // Get streak display with emoji and color
  const getStreakDisplay = () => {
    const streak = stats?.stats?.currentStreak || 0;
    if (streak > 0) {
      return (
        <div className="flex items-center">
          <span className="text-[#4ADE80] font-bold mr-1">+{streak}</span>
          <FaFire className="text-[#d4af37]" />
        </div>
      );
    } else if (streak < 0) {
      return (
        <div className="flex items-center">
          <span className="text-red-500 font-bold mr-1">{streak}</span>
          <FaSnowflake className="text-blue-400" />
        </div>
      );
    }
    return <span className="text-gray-400">0</span>;
  };

  // Avatar and username from Supabase/email
  const username = stats?.username || 'Bettor';
  const avatarSeed = username.toLowerCase().replace(/[^a-z0-9]/g, '');
  const avatarUrl = `https://i.pravatar.cc/150?u=${avatarSeed}`;

  // Determine if user is primarily "Ride with Gary" or "Fade the Bear"
  const primaryStrategy = (stats?.stats?.rideCount || 0) >= (stats?.stats?.fadeCount || 0)
    ? "RIDES WITH GARY"
    : "FADES THE BEAR";

  // Loading state
  if (loading) {
    return createPortal(
      <div className="fixed inset-0 flex items-center justify-center z-50 px-4" style={{backgroundColor: 'rgba(0,0,0,0.75)'}}>
        <div className="bg-[#111] rounded-xl shadow-2xl p-10 flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#d4af37] mb-4"></div>
          <div className="text-[#d4af37]">Loading your stats...</div>
        </div>
      </div>,
      document.body
    );
  }
  if (error) {
    return createPortal(
      <div className="fixed inset-0 flex items-center justify-center z-50 px-4" style={{backgroundColor: 'rgba(0,0,0,0.75)'}}>
        <div className="bg-[#111] rounded-xl shadow-2xl p-10 flex flex-col items-center">
          <div className="text-red-500 font-bold">Error loading stats: {error}</div>
        </div>
      </div>,
      document.body
    );
  }

  // Portal the overlay to body
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center z-50 px-4" style={{backgroundColor: 'rgba(0,0,0,0.75)'}}>
      {/* Card Container with perspective */}
      <div 
        className="relative perspective-card max-w-md w-full cursor-pointer transform transition-all duration-300 hover:scale-105"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Baseball Card */}
        <div className="relative h-[500px] rounded-xl overflow-hidden shadow-2xl hover:shadow-[0_20px_50px_rgba(212,175,55,0.3)]">
          {/* Card glow effect */}
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#111] via-[#222] to-[#111] rounded-xl"></div>
            <div className="absolute top-0 left-0 right-0 bottom-0 bg-[#d4af37]/5 rounded-xl"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-[#d4af37]/0 via-[#d4af37]/5 to-[#d4af37]/0 rounded-full transform rotate-12 overflow-hidden"></div>
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/30 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/30 to-transparent"></div>
          </div>
          
          {/* Close button */}
          <button
            className="absolute top-3 right-3 z-50 text-gray-300 hover:text-white bg-[#222]/70 hover:bg-[#333]/70 rounded-full p-2 transition-colors"
            onClick={onClose}
          >
            <FaTimes />
          </button>
          
          {/* Card content */}
          <div className="absolute inset-0 z-10 p-5 flex flex-col text-white overflow-hidden">
            {/* Card Header */}
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="mb-2">
                  <span className="inline-block bg-[#d4af37] text-black text-xs font-bold px-3 py-1 rounded-full">
                    {primaryStrategy}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white tracking-wide">{username}</h3>
              </div>
              <div className="bg-[#111] text-[#d4af37] text-lg font-bold w-10 h-10 rounded-full flex items-center justify-center border border-[#d4af37]/30">
                {getStreakDisplay()}
              </div>
            </div>
            
            {/* User Avatar */}
            <div className="mx-auto mt-4 mb-6">
              <div className="relative w-36 h-36 rounded-full border-4 border-[#d4af37]/50 overflow-hidden">
                <img 
                  src={avatarUrl} 
                  alt={username} 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            
            {/* Stats Section */}
            <div className="flex-1 flex flex-col justify-around">
              {/* Win Rate */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-[#d4af37]">WIN RATE</span>
                  <span className="text-xs text-[#d4af37]">
                    RECORD: {(stats?.stats?.winCount || 0)}-{(stats?.stats?.lossCount || 0)}
                  </span>
                </div>
                <div className="h-6 bg-[#111] rounded-md border border-[#d4af37]/30 flex items-center px-2">
                  <div className="flex-1 h-2 bg-[#222] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#4ADE80]/80 to-[#4ADE80]" 
                      style={{ width: `${winRate}%` }}
                    ></div>
                  </div>
                  <div className="ml-2 text-[#4ADE80] font-bold">{winRate}%</div>
                </div>
              </div>
              
              {/* Decision Breakdown */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-[#111]/70 rounded-lg p-3 border border-[#d4af37]/20">
                  <div className="text-xs text-[#d4af37] mb-1">BET WITH GARY</div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">{stats?.stats?.rideCount || 0}</span>
                    <span className="text-sm text-gray-400">{ridePercentage}%</span>
                  </div>
                </div>
                <div className="bg-[#111]/70 rounded-lg p-3 border border-[#333]/50">
                  <div className="text-xs text-gray-400 mb-1">FADE THE BEAR</div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">{stats?.stats?.fadeCount || 0}</span>
                    <span className="text-sm text-gray-400">{fadePercentage}%</span>
                  </div>
                </div>
              </div>
              
              {/* Total Decisions */}
              <div className="bg-[#111]/70 rounded-lg p-3 border border-[#333]/50 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">TOTAL DECISIONS</span>
                  <span className="text-lg font-bold">{totalBets}</span>
                </div>
              </div>
            </div>
            
            {/* Card Footer */}
            <div className="mt-auto text-center">
              <div className="text-xs text-[#d4af37] mb-1">BETCARD™</div>
              <div className="text-[10px] text-gray-500">Gary.AI © 2025</div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
