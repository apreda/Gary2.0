import { motion } from 'framer-motion';
import { useState } from 'react';

// Helper function to properly format dates from game_date field
const formatDate = (dateString) => {
  // Handle both date string formats
  if (!dateString) return 'N/A';
  
  try {
    // Parse the date string
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date format:', dateString);
      return dateString; // Return the original string if invalid
    }
    
    // Format the date in a user-friendly way: MM/DD/YY
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString; // Return the original string on error
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
          <div className="h-40 flex items-center justify-center">
            <div className="text-center">
              <img src="/coin2.png" alt="Gary Coin" className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-gray-500 text-sm font-medium">No recent picks available</p>
            </div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-[#d4af37]/10 bg-white">
            <thead className="bg-[#f9f9f9] sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Sport
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider hidden md:table-cell">
                  Matchup
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Pick
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Result
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Score
                </th>
              </tr>
            </thead>
            
            <tbody className="bg-white divide-y divide-gray-100">
              {bettingLog.map((bet, index) => (
                <motion.tr 
                  key={bet.id || index} 
                  className="hover:bg-[#fffdf8] transition-colors" 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <td className="px-4 py-3.5 text-gray-800 font-medium">
                    {bet.date ? formatDate(bet.date) : 'N/A'}
                  </td>
                  <td className="px-4 py-3.5 text-gray-800 flex items-center">
                    <span className="mr-1.5 text-lg">
                      {getSportEmoji(bet.sport)}
                    </span>
                    <span>{bet.sport || 'N/A'}</span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-800 hidden md:table-cell">
                    {bet.matchup || (bet.away && bet.home ? `${bet.away} @ ${bet.home}` : 'N/A')}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center">
                      <img src="/coin2.png" alt="Gary Coin" className="h-4 w-4 mr-2 opacity-70 hidden sm:block" />
                      <span className="text-gray-800 font-medium">{bet.pick || bet.bet || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span 
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        bet.result === 'won' || bet.result === 'win' || bet.won 
                          ? 'bg-green-100 text-green-800 border border-green-200' 
                        : bet.result === 'lost' || bet.result === 'loss' || bet.won === false 
                          ? 'bg-red-100 text-red-800 border border-red-200' 
                        : bet.result === 'push' 
                          ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' 
                        : 'bg-[#fffbea] text-[#d4af37] border border-[#d4af37]/20'
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
                  <td className="px-4 py-3.5 text-gray-800 font-medium">
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
