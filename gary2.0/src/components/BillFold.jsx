import React from 'react';
import { useUserStats } from '../hooks/useUserStats';

export function BillFold() {
  const { userStats } = useUserStats();
  const initialBankroll = 1000; // Starting with $1000

  // Calculate current streak
  const getStreakDisplay = () => {
    const streak = userStats?.currentStreak || 0;
    const streakType = userStats?.lastResult === 'win' ? 'W' : 'L';
    return streak ? `${streakType}${Math.abs(streak)}` : '-';
  };

  // Calculate bankroll with 10% per bet
  const calculateBankroll = () => {
    const wins = userStats?.wins || 0;
    const losses = userStats?.losses || 0;
    const betSize = initialBankroll * 0.1; // 10% of bankroll per bet
    const profit = (wins * betSize) - (losses * betSize);
    return initialBankroll + profit;
  };

  // Calculate win rate percentage
  const getWinRate = () => {
    const total = (userStats?.wins || 0) + (userStats?.losses || 0);
    if (!total) return 0;
    return ((userStats?.wins || 0) / total) * 100;
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const currentBankroll = calculateBankroll();
  const isProfit = currentBankroll > initialBankroll;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Gary's BillFold</h2>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Streak:</span>
          <span className={`font-mono font-bold text-lg ${
            userStats?.lastResult === 'win' ? 'text-green-600' : 'text-red-600'
          }`}>
            {getStreakDisplay()}
          </span>
        </div>
      </div>

      {/* Bankroll Display */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Bankroll</span>
          <span className={`text-2xl font-bold ${
            isProfit ? 'text-green-600' : 'text-red-600'
          }`}>
            {formatCurrency(currentBankroll)}
          </span>
        </div>
        <div className="mt-2 flex justify-between items-center text-sm">
          <span className="text-gray-500">Initial</span>
          <span className="font-medium">{formatCurrency(initialBankroll)}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{userStats?.wins || 0}</div>
          <div className="text-xs text-gray-500">Wins</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{userStats?.losses || 0}</div>
          <div className="text-xs text-gray-500">Losses</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{getWinRate().toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Win Rate</div>
        </div>
      </div>

      {/* Performance Chart (can be added later) */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Bet Size</span>
          <span className="font-medium">10% of Bankroll</span>
        </div>
      </div>
    </div>
  );
}
