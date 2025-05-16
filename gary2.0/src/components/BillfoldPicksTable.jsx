import { motion } from 'framer-motion';
import { useState } from 'react';
import { formatShortDate } from '../utils/dateUtils';

// Helper function to properly format dates from game_date field
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    return formatShortDate(dateString);
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

// Group bets by date for possible accordion display
const groupBetsByDate = (bets) => {
  const grouped = {};
  
  bets.forEach(bet => {
    const dateKey = bet.date ? formatDate(bet.date) : 'No Date';
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(bet);
  });
  
  return Object.entries(grouped).map(([date, bets]) => ({ date, bets }));
};

export default function BillfoldPicksTable({ bettingLog = [], title = "" }) {
  // Check if we have pick data to display
  const hasPicks = Array.isArray(bettingLog) && bettingLog.length > 0;
  
  // State for expanded date sections (future accordion functionality)
  const [expandedDates, setExpandedDates] = useState({});
  
  // The grouped data (we'll use flat list for now but structure is ready for accordion)
  const groupedBets = groupBetsByDate(bettingLog);
  
  // Get sport emoji
  const getSportEmoji = (sport) => {
    switch (sport?.toUpperCase()) {
      case 'NBA': return '🏀';
      case 'NFL': return '🏈';
      case 'MLB': return '⚾';
      case 'NHL': return '🏒';
      case 'SOCCER': return '⚽';
      case 'UFC': return '🥊';
      default: return '🎯';
    }
  };
  
  return (
    <div className="w-full overflow-hidden rounded-md border border-[#d4af37]/20 shadow-md hover:shadow-lg transition-all duration-300 bg-white">
      <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent sticky top-0 z-10">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 flex items-center">
          <span className="mr-2 text-[#d4af37]">📈</span>{title || "Recent Picks"}
        </h3>
      </div>
      
      <div className="max-h-[450px] overflow-y-auto scrollbar-thin scrollbar-track-gray-100">
        {!hasPicks ? (
          <div className="flex flex-col items-center justify-center rounded-md py-12 border border-gray-700 bg-gray-800/50">
            <div className="flex flex-col items-center text-center">
              <svg className="h-12 w-12 text-gray-500 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-gray-400 text-sm font-medium">No recent picks available</p>
            </div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-700/50">
            <thead className="bg-gray-800/80 sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Sport
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
                  Matchup
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Pick
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Result
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Score
                </th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-gray-700/50">
              {bettingLog.map((bet, index) => (
                <motion.tr 
                  key={bet.id || index} 
                  className="hover:bg-gray-800/50 transition-colors" 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <td className="px-4 py-3.5 text-gray-400 font-medium">
                    {bet.date ? formatDate(bet.date) : 'N/A'}
                  </td>
                  <td className="px-4 py-3.5 text-gray-400 flex items-center">
                    <span className="mr-1.5 text-lg">
                      {getSportEmoji(bet.sport)}
                    </span>
                    <span className="text-gray-300">{bet.sport || 'N/A'}</span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-300 hidden md:table-cell">
                    {bet.matchup || (bet.away && bet.home ? `${bet.away} @ ${bet.home}` : 'N/A')}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center">
                      <div className="h-2 w-2 bg-[#b8953f] rounded-full mr-2"></div>
                      <span className="text-gray-300">{bet.pick || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        bet.result === 'won' || (bet.won === true)
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : bet.result === 'lost' || (bet.won === false)
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : bet.result === 'push'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}
                    >
                      {bet.result === 'push' 
                        ? 'PUSH' 
                        : bet.result 
                          ? bet.result.toUpperCase() 
                          : (bet.won !== undefined 
                              ? (bet.won ? 'WON' : 'LOST') 
                              : 'PENDING')
                      }
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-300">
                    {bet.score || 'N/A'}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
