import React, { useState } from 'react';
import { userPickResultsService } from '../services/userPickResultsService';

const AdminResultsProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [processAllPending, setProcessAllPending] = useState(true);

  const handleProcessResults = async () => {
    setIsProcessing(true);
    try {
      let result;
      if (processAllPending) {
        // Process all pending picks
        result = await userPickResultsService.manualProcessResults();
      } else {
        // Process picks from specific date
        result = await userPickResultsService.manualProcessResults(selectedDate);
      }
      setLastResult(result);
      console.log('Processing result:', result);
    } catch (error) {
      console.error('Error processing results:', error);
      setLastResult({
        success: false,
        error: error.message,
        processed: 0,
        updated: 0,
        errors: 1
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const getYesterdayDate = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg">
      <h2 className="text-xl font-semibold mb-4 text-white">User Pick Results Processor</h2>
      
      {/* Processing Options */}
      <div className="mb-6 space-y-4">
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="radio"
              checked={processAllPending}
              onChange={() => setProcessAllPending(true)}
              className="mr-2"
            />
            <span className="text-gray-300">Process All Pending Picks</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              checked={!processAllPending}
              onChange={() => setProcessAllPending(false)}
              className="mr-2"
            />
            <span className="text-gray-300">Process Specific Date</span>
          </label>
        </div>
        
        {!processAllPending && (
          <div className="flex items-center space-x-4">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 bg-gray-700 text-white rounded border border-gray-600"
            />
            <button
              onClick={() => setSelectedDate(getYesterdayDate())}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Yesterday
            </button>
            <button
              onClick={() => setSelectedDate(getTodayDate())}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Today
            </button>
          </div>
        )}
      </div>

      {/* Process Button */}
      <button
        onClick={handleProcessResults}
        disabled={isProcessing || (!processAllPending && !selectedDate)}
        className={`px-6 py-3 rounded font-medium ${
          isProcessing || (!processAllPending && !selectedDate)
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-[#B8953F] text-black hover:bg-[#A08235]'
        }`}
      >
        {isProcessing ? 'Processing...' : 
         processAllPending ? 'Process All User Pick Results' : 
         `Process Results for ${selectedDate || 'Selected Date'}`}
      </button>

      {lastResult && (
        <div className="mt-6 p-4 bg-gray-800 rounded-lg border border-gray-600">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-semibold text-white">Last Processing Result</h4>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              lastResult.errors === 0 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {lastResult.errors === 0 ? 'SUCCESS' : 'ERRORS'}
            </span>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#b8953f]">{lastResult.processed || 0}</div>
              <div className="text-sm text-gray-400">Processed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{lastResult.updated || 0}</div>
              <div className="text-sm text-gray-400">Updated</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{lastResult.errors || 0}</div>
              <div className="text-sm text-gray-400">Errors</div>
            </div>
          </div>

          {lastResult.message && (
            <p className="text-gray-300 text-sm mb-3">{lastResult.message}</p>
          )}

          {lastResult.error && (
            <p className="text-red-400 text-sm mb-3">Error: {lastResult.error}</p>
          )}

          {lastResult.details && lastResult.details.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-[#b8953f] text-sm hover:underline mb-3"
              >
                {showDetails ? 'Hide' : 'Show'} Details ({lastResult.details.length} items)
              </button>
              
              {showDetails && (
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-600">
                        <th className="text-left p-2">User ID</th>
                        <th className="text-left p-2">Pick ID</th>
                        <th className="text-left p-2">Decision</th>
                        <th className="text-left p-2">Gary Result</th>
                        <th className="text-left p-2">User Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastResult.details.map((detail, index) => (
                        <tr key={index} className="border-b border-gray-700">
                          <td className="p-2 text-gray-300">{detail.user_id.slice(0, 8)}...</td>
                          <td className="p-2 text-gray-300">{detail.pick_id}</td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              detail.decision === 'bet' 
                                ? 'bg-[#b8953f]/20 text-[#b8953f]' 
                                : 'bg-gray-600/20 text-gray-300'
                            }`}>
                              {detail.decision.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              detail.gary_result === 'won' 
                                ? 'bg-green-500/20 text-green-400' 
                                : detail.gary_result === 'push'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {detail.gary_result.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              detail.user_outcome === 'won' 
                                ? 'bg-green-500/20 text-green-400' 
                                : detail.user_outcome === 'push'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {detail.user_outcome.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminResultsProcessor; 