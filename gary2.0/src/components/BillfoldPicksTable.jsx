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

export default function BillfoldPicksTable({ bettingLog = [], title = "Recent Picks" }) {
  // Check if we have pick data to display
  const hasPicks = Array.isArray(bettingLog) && bettingLog.length > 0;
  return (
    <div className="w-full">
      {/* Cleaner, more minimal header */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#334155]">
        <h3 className="text-lg font-bold uppercase tracking-wider text-white flex items-center">
          <span className="text-[#FACC15] mr-2"><TrendingUpIcon /></span>
          {title}
        </h3>
      </div>
      
      <div className="overflow-x-auto mb-2">
        {!hasPicks ? (
          <div className="py-10 text-center text-[#64748B] bg-[#1E293B]/30 rounded-lg border border-[#334155] border-dashed">
            <p className="text-base font-medium">No picks available</p>
            <p className="text-sm mt-1">Check back soon for Gary's latest picks</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[700px] border-separate border-spacing-y-2">
            <thead className="text-left">
              <tr>
                <th className="px-3 py-2 text-[#94A3B8] uppercase text-xs tracking-wider font-medium">Date</th>
                <th className="px-3 py-2 text-[#94A3B8] uppercase text-xs tracking-wider font-medium">Sport</th>
                <th className="px-3 py-2 text-[#94A3B8] uppercase text-xs tracking-wider font-medium">Matchup</th>
                <th className="px-3 py-2 text-[#94A3B8] uppercase text-xs tracking-wider font-medium">Pick</th>
                <th className="px-3 py-2 text-[#94A3B8] uppercase text-xs tracking-wider font-medium">Result</th>
                <th className="px-3 py-2 text-[#94A3B8] uppercase text-xs tracking-wider font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {bettingLog.map((bet, i) => (
              <motion.tr
                key={bet.id || i}
                className="bg-[#1E293B]/60 hover:bg-[#1E293B] transition-all duration-200"
                initial={{ opacity:0, y:5 }}
                animate={{ opacity:1, y:0 }}
                transition={{delay:0.1 + i*0.03, duration: 0.3}}
              >
                <td className="px-3 py-4 rounded-l-lg text-[#F1F5F9]">{bet.date ? formatDate(bet.date) : 'N/A'}</td>
                <td className="px-3 py-4">
                  <span className="inline-flex items-center h-8 px-3 rounded-full bg-[#0F172A]/40 border border-[#334155]/50">
                    <span className="mr-1.5">
                      {bet.sport === 'NBA' && '🏀'}
                      {bet.sport === 'MLB' && '⚾'}
                      {bet.sport === 'NHL' && '🏒'}
                      {bet.sport === 'NFL' && '🏈'}
                    </span>
                    <span className="font-medium text-[#F1F5F9]">{bet.sport || 'N/A'}</span>
                  </span>
                </td>
                <td className="px-3 py-4 text-[#F1F5F9] font-medium">
                  {bet.matchup || (bet.away && bet.home ? `${bet.away} @ ${bet.home}` : 'N/A')}
                </td>
                <td className="px-3 py-4 text-[#FACC15] font-medium">
                  {bet.pick || bet.bet || 'N/A'}
                </td>
                <td className="px-3 py-4">
                  {bet.result === 'won' || bet.won ? (
                    <span className="inline-flex items-center h-7 px-3 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 font-semibold">
                      <span className="mr-1">W</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  ) : bet.result === 'push' ? (
                    <span className="inline-flex items-center h-7 px-3 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-semibold">
                      <span>PUSH</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center h-7 px-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-semibold">
                      <span className="mr-1">L</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  )}
                </td>
                <td className="px-3 py-4 rounded-r-lg text-[#F1F5F9] font-medium">{bet.score || 'N/A'}</td>
              </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


