import React, { useState } from 'react';
import { testLiveBetFade } from '../../test_live_bet_fade.js';

const BetFadeTestPanel = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const runTest = async () => {
    setIsRunning(true);
    setTestResult(null);
    
    try {
      console.log('🧪 Starting bet/fade test...');
      const result = await testLiveBetFade();
      setTestResult(result);
      console.log('Test completed:', result);
    } catch (error) {
      console.error('Test failed:', error);
      setTestResult({
        success: false,
        error: error.message
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
      <h3 className="text-xl font-bold text-white mb-4">🧪 Bet/Fade System Test</h3>
      
      <div className="mb-4">
        <p className="text-gray-300 text-sm mb-4">
          This test simulates the complete bet/fade flow:
        </p>
        <ul className="text-gray-400 text-sm space-y-1 mb-4">
          <li>• Creates a test pick</li>
          <li>• Simulates 3 users making bet/fade decisions</li>
          <li>• Simulates Gary's pick result (win/loss)</li>
          <li>• Processes user outcomes</li>
          <li>• Verifies the logic is working correctly</li>
        </ul>
      </div>

      <button
        onClick={runTest}
        disabled={isRunning}
        className={`px-6 py-3 rounded font-medium ${
          isRunning
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-[#B8953F] text-black hover:bg-[#A08235]'
        }`}
      >
        {isRunning ? 'Running Test...' : 'Run Bet/Fade Test'}
      </button>

      {testResult && (
        <div className="mt-6 p-4 bg-gray-900 rounded border border-gray-600">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-semibold text-white">Test Results</h4>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              testResult.success 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {testResult.success ? 'PASSED' : 'FAILED'}
            </span>
          </div>

          {testResult.success ? (
            <div className="space-y-2">
              <p className="text-green-400 font-medium">
                ✅ All tests passed! Your bet/fade system is working correctly.
              </p>
              <div className="text-sm text-gray-300">
                <p>• Test pick created and processed</p>
                <p>• User decisions recorded correctly</p>
                <p>• Outcomes calculated properly</p>
                <p>• Both win and loss scenarios tested</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-red-400 font-medium">
                ❌ Test failed: {testResult.error}
              </p>
              <p className="text-gray-400 text-sm">
                Check the browser console for detailed error information.
              </p>
            </div>
          )}

          {testResult.processingResult && (
            <div className="mt-4 p-3 bg-gray-800 rounded">
              <h5 className="text-white font-medium mb-2">Processing Stats:</h5>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-[#B8953F] font-bold">{testResult.processingResult.processed || 0}</div>
                  <div className="text-gray-400">Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-green-400 font-bold">{testResult.processingResult.updated || 0}</div>
                  <div className="text-gray-400">Updated</div>
                </div>
                <div className="text-center">
                  <div className="text-red-400 font-bold">{testResult.processingResult.errors || 0}</div>
                  <div className="text-gray-400">Errors</div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="mt-3 text-[#B8953F] text-sm hover:underline"
          >
            {showDetails ? 'Hide' : 'Show'} Technical Details
          </button>

          {showDetails && (
            <div className="mt-3 p-3 bg-gray-800 rounded">
              <pre className="text-xs text-gray-300 overflow-x-auto">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded">
        <p className="text-blue-300 text-sm">
          <strong>💡 Tip:</strong> This test creates temporary data and cleans it up automatically. 
          It won't affect your real user data or picks.
        </p>
      </div>
    </div>
  );
};

export default BetFadeTestPanel; 