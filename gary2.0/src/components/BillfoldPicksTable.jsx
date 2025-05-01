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

export default function BillfoldPicksTable({ bettingLog = [], title = "Recent Picks" }) {
  // Check if we have pick data to display
  const hasPicks = Array.isArray(bettingLog) && bettingLog.length > 0;
  return (
    <div className="bg-surface p-4 md:p-6 rounded-xl shadow-lg w-full">
      {/* Responsive, more padding, and visual polish */}
      <h3 className="text-xl md:text-2xl mb-4 flex items-center font-bold text-white tracking-tight">
        <span className="mr-2 text-primary"><TrendingUpIcon /></span>{title}
      </h3>
      <Filters />
      <div className="overflow-x-auto mt-2 border-t border-gray-800 pt-4 pb-1">
        {!hasPicks ? (
          <div className="py-8 text-center text-gray-400">
            No recent picks available
          </div>
        ) : (
          <table className="w-full text-base md:text-lg min-w-[600px]">
            <thead className="text-left text-gray-300">
              <tr>
                <th className="py-2">Date</th>
                <th>Sport</th>
                <th>Matchup</th>
                <th>Pick</th>
                <th>Result</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {bettingLog.map((bet, i) => (
              <motion.tr
                key={bet.id || i}
                className="border-t border-gray-700 hover:bg-gray-800/50 hover:scale-[1.01] transition-all duration-150"
                initial={{ opacity:0, y:10 }}
                animate={{ opacity:1, y:0 }}
                transition={{delay:0.1 + i*0.03}}
              >
                <td className="py-2">{bet.date ? new Date(bet.date).toLocaleDateString() : 'N/A'}</td>
                <td>
                  <span className="inline-flex items-center">
                    {bet.sport === 'NBA' && '🏀'}
                    {bet.sport === 'MLB' && '⚾'}
                    {bet.sport === 'NHL' && '🏒'}
                    {bet.sport === 'NFL' && '🏈'}
                    <span className="ml-1">{bet.sport || 'N/A'}</span>
                  </span>
                </td>
                <td>{bet.matchup || (bet.away && bet.home ? `${bet.away} @ ${bet.home}` : 'N/A')}</td>
                <td>{bet.pick || bet.bet || 'N/A'}</td>
                <td>
                  {bet.result === 'won' || bet.won ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-positive/20 text-positive font-bold">W</span>
                  ) : bet.result === 'push' ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-500 font-bold">P</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-negative/20 text-negative font-bold">L</span>
                  )}
                </td>
                <td>{bet.score || 'N/A'}</td>
              </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


