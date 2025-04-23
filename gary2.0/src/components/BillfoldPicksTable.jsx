import { TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

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

export default function BillfoldPicksTable({ picks = [] }) {
  // Check if we have picks data to display
  const hasPicks = Array.isArray(picks) && picks.length > 0;
  return (
    <div className="bg-surface p-4 md:p-6 rounded-xl shadow-lg w-full">
      {/* Responsive, more padding, and visual polish */}
      <h3 className="text-xl md:text-2xl mb-4 flex items-center font-bold text-white tracking-tight"><TrendingUp className="mr-2 text-primary"/>Recent Picks</h3>
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
                <th>Matchup</th>
                <th>Pick</th>
                <th>Conf.</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((p, i) => (
              <motion.tr
                key={i}
                className="border-t border-gray-700 hover:bg-gray-800/50 hover:scale-[1.01] transition-all duration-150"
                initial={{ opacity:0, y:10 }}
                animate={{ opacity:1, y:0 }}
                transition={{delay:0.1 + i*0.03}}
              >
                <td className="py-2">{p.date || 'N/A'}</td>
                <td>{p.away || 'TBD'} @ {p.home || 'TBD'}</td>
                <td>{p.pick || 'TBD'}</td>
                <td>{p.confidence ? `${(p.confidence*100).toFixed(0)}%` : 'N/A'}</td>
                <td>
                  {p.won ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-positive/20 text-positive font-bold">W</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-negative/20 text-negative font-bold">L</span>
                  )}
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

// Prop validation
BillfoldPicksTable.propTypes = {
  picks: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string,
      away: PropTypes.string,
      home: PropTypes.string,
      pick: PropTypes.string,
      confidence: PropTypes.number,
      won: PropTypes.bool
    })
  )
};
