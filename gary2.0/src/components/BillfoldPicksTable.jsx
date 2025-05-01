import { motion } from 'framer-motion';
import { useState } from 'react';

// Inline SVG icon to avoid build dependency issues
const TrendingUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
  </svg>
);

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
  
  return (
    <div className="w-full overflow-hidden rounded-md border border-[#d4af37]/20 shadow-md hover:shadow-lg transition-all duration-300 bg-white">
      <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent sticky top-0 z-10">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 flex items-center">
          <span className="mr-2 text-[#d4af37]">📈</span>{title || "Recent Picks"}
        </h3>
      </div>
      
      <div className="max-h-[450px] overflow-y-auto scrollbar-thin scrollbar-track-gray-100">
        {!hasPicks ? (
          <div className="flex justify-center items-center py-10 text-gray-500">
            <div className="text-center">
              <img src="/coin2.png" alt="Gary Coin" className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No recent picks available</p>
            </div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-[#f8f7f4] sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Sport
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Matchup
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Pick
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Result
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bettingLog.map((bet, index) => (
                <motion.tr 
                  key={bet.id || index} 
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-[#fcfbf9]'} hover:bg-[#fffdf8] transition-colors duration-150`}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * index, duration: 0.15 }}
                >
                  <td className="px-4 py-3.5 text-gray-800 font-medium">
                    {bet.date ? formatDate(bet.date) : 'N/A'}
                  </td>
                  <td className="px-4 py-3.5 text-gray-800 flex items-center">
                    <span className="mr-1.5 text-lg">
                      {bet.sport === 'NBA' && '🏀'}
                      {bet.sport === 'NFL' && '🏈'}
                      {bet.sport === 'MLB' && '⚾'}
                      {bet.sport === 'NHL' && '🏒'}
                    </span>
                    <span>{bet.sport || 'N/A'}</span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-800">
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
                        bet.result === 'won' || bet.won ? 'bg-green-100 text-green-800' : 
                        bet.result === 'lost' || bet.won === false ? 'bg-red-100 text-red-800' : 
                        bet.result === 'push' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {bet.result === 'push' ? 'Push' : 
                        bet.result || (bet.won !== undefined ? (bet.won ? 'Won' : 'Lost') : 'Pending')}
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
