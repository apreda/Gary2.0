import { useState } from 'react';
import { format } from 'date-fns';

export function BetHistory({ picks }) {
  const [filter, setFilter] = useState('all'); // all, rides, fades
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const filteredPicks = picks.filter(pick => {
    if (filter === 'rides') return pick.decision === 'ride';
    if (filter === 'fades') return pick.decision === 'fade';
    return true;
  });

  const totalPages = Math.ceil(filteredPicks.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const displayedPicks = filteredPicks.slice(startIndex, startIndex + itemsPerPage);

  const getPickEmoji = (pick) => {
    if (pick.outcome === 'win') return '✅';
    if (pick.outcome === 'loss') return '❌';
    return '⏳';
  };

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Betting History</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded ${
              filter === 'all' 
                ? 'bg-yellow-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('rides')}
            className={`px-3 py-1 rounded ${
              filter === 'rides' 
                ? 'bg-green-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            Rides
          </button>
          <button
            onClick={() => setFilter('fades')}
            className={`px-3 py-1 rounded ${
              filter === 'fades' 
                ? 'bg-red-500 text-white' 
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            Fades
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Decision
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Result
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Pick Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {displayedPicks.map((pick) => (
                <tr key={pick.id} className="text-gray-300">
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {format(new Date(pick.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded ${
                      pick.decision === 'ride' 
                        ? 'bg-green-900 text-green-200' 
                        : 'bg-red-900 text-red-200'
                    }`}>
                      {pick.decision.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="text-lg" title={pick.outcome}>
                      {getPickEmoji(pick)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {pick.pick_reference?.teams || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded bg-gray-800 text-white disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded bg-gray-800 text-white disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
