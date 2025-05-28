import React, { useState } from 'react';
import { userPickResultsService } from '../services/userPickResultsService';

const AdminResultsProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleProcessResults = async () => {
    setIsProcessing(true);
    try {
      const result = await userPickResultsService.manualProcessResults();
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

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
      <h3 className="text-xl font-bold text-white mb-4">User Pick Results Processor</h3>
      
      <div className="mb-4">
        <p className="text-gray-300 text-sm mb-4">
          This tool processes user bet/fade decisions against Gary's pick results and updates user records accordingly.
        </p>
        
        <button
          onClick={handleProcessResults}
          disabled={isProcessing}
          className={`px-6 py-3 rounded-lg font-semibold transition-all ${
            isProcessing
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-[#b8953f] text-black hover:bg-[#a8853f]'
          }`}
        >
          {isProcessing ? 'Processing...' : 'Process User Pick Results'}
        </button>
      </div>

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