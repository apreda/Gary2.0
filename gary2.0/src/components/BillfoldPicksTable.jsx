import { motion } from 'framer-motion';

// Inline SVG icon to avoid build dependency issues
const TrendingUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
  </svg>
);

// Placeholder filter controls (to be replaced with headlessui/react and date picker integration)
// This component is used internally only
function Filters() {
  return (
    <div className="flex flex-wrap gap-2 mb-3 items-center">
      <input type="date" className="bg-surface border border-gray-700 rounded px-2 py-1 text-gray-200" />
      <select className="bg-surface border border-gray-700 rounded px-2 py-1 text-gray-200">
        <option>All Sports</option>
        <option>NBA</option>
        <option>MLB</option>
        <option>NHL</option>
        <option>NFL</option>
      </select>
      <div className="flex gap-2">
        {['All', 'Won', 'Lost'].map(val => (
          <button
            key={val}
            className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-primary/20 hover:text-primary transition"
          >
            {val}
          </button>
        ))}
      </div>
    </div>
  );
}

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
    
    // Format the date in a user-friendly way: MM/DD/YYYY
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString; // Return the original string on error
  }
};

export default function BillfoldPicksTable({ bettingLog = [], title = "" }) {
  // Check if we have pick data to display
  const hasPicks = Array.isArray(bettingLog) && bettingLog.length > 0;
  return (
    <div className="w-full relative">
      <div className="overflow-x-auto">
        {!hasPicks ? (
          <div className="py-10 text-center text-gray-500 bg-white/80 rounded-lg border-2 border-[#d4af37]/20 border-dashed">
            <p className="text-base font-medium">No picks available</p>
            <p className="text-sm mt-1">Check back soon for Gary's latest picks</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[700px]">
            <thead className="text-left bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-gray-600 uppercase text-xs tracking-wider font-medium">Date</th>
                <th className="px-4 py-3 text-gray-600 uppercase text-xs tracking-wider font-medium">Sport</th>
                <th className="px-4 py-3 text-gray-600 uppercase text-xs tracking-wider font-medium">Matchup</th>
                <th className="px-4 py-3 text-gray-600 uppercase text-xs tracking-wider font-medium">Pick</th>
                <th className="px-4 py-3 text-gray-600 uppercase text-xs tracking-wider font-medium">Result</th>
                <th className="px-4 py-3 text-gray-600 uppercase text-xs tracking-wider font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {bettingLog.map((bet, i) => (
              <motion.tr
                key={bet.id || i}
                className="border-b border-gray-100 hover:bg-gray-50 transition-all duration-200"
                initial={{ opacity:0, y:3 }}
                animate={{ opacity:1, y:0 }}
                transition={{delay:0.05 + i*0.02, duration: 0.2}}
              >
                <td className="px-4 py-3.5 text-gray-800">
                  {bet.date ? formatDate(bet.date) : 'N/A'}
                </td>
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center h-7 px-2.5 rounded-md bg-gray-50 border border-gray-100">
                    <span className="mr-1.5">
                      {bet.sport === 'NBA' && '🏀'}
                      {bet.sport === 'MLB' && '⚾'}
                      {bet.sport === 'NHL' && '🏒'}
                      {bet.sport === 'NFL' && '🏈'}
                    </span>
                    <span className="font-medium text-gray-800 text-xs">{bet.sport || 'N/A'}</span>
                  </span>
                </td>
                <td className="px-4 py-3.5 text-gray-800 font-medium">
                  {bet.matchup || (bet.away && bet.home ? `${bet.away} @ ${bet.home}` : 'N/A')}
                </td>
                <td className="px-4 py-3.5 text-[#d4af37] font-medium">
                  {bet.pick || bet.bet || 'N/A'}
                </td>
                <td className="px-4 py-3.5">
                  {bet.result === 'won' || bet.won ? (
                    <span className="inline-flex items-center h-6 px-2 rounded-md bg-green-50 text-green-600 font-medium text-xs">
                      <span className="mr-1">WIN</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  ) : bet.result === 'push' ? (
                    <span className="inline-flex items-center h-6 px-2 rounded-md bg-yellow-50 text-yellow-600 font-medium text-xs">
                      <span>PUSH</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center h-6 px-2 rounded-md bg-red-50 text-red-600 font-medium text-xs">
                      <span className="mr-1">LOSS</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  )}
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


