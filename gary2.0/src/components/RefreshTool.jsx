import React, { useState } from 'react';
import { picksService } from '../services/picksService';

/**
 * Admin tool for refreshing picks with real data
 * This component provides a simple interface to force new picks generation
 * regardless of the scheduled time
 */
const RefreshTool = () => {
  const [status, setStatus] = useState('Ready to generate new picks');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const refreshPicks = async () => {
    try {
      setIsLoading(true);
      setStatus('⏳ Refreshing picks with real data...');
      
      // Clear the localStorage data to force a fresh generation
      localStorage.removeItem('dailyPicks');
      localStorage.removeItem('lastPicksGenerationTime');
      
      // Generate new picks with real data
      console.log('Generating new picks with real API data...');
      const newPicks = await picksService.generateDailyPicks();
      
      // Save to localStorage and mark as generated
      localStorage.setItem('dailyPicks', JSON.stringify(newPicks));
      // Mark picks as generated (previously handled by schedulerService)
      localStorage.setItem('lastPicksGenerationTime', new Date().toISOString());
      
      setStatus(`✅ Success! Generated ${newPicks.length} picks with real data.`);
      setResult(newPicks);
      console.log('Picks updated:', newPicks);
    } catch (error) {
      setStatus('❌ Error refreshing picks. Check console for details.');
      console.error('Error refreshing picks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="max-w-3xl w-full mx-auto p-8 bg-gray-800 rounded-lg shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-2 text-yellow-400">Gary's Picks Admin Tool</h1>
          <p className="text-gray-300">Force update picks with real data from The Odds API</p>
        </div>
        
        <div className="mb-8">
          <button 
            onClick={refreshPicks}
            disabled={isLoading}
            className={`w-full py-4 px-6 rounded-lg font-bold text-lg transition ${
              isLoading 
                ? 'bg-gray-600 cursor-not-allowed' 
                : 'bg-yellow-500 hover:bg-yellow-400 text-black'
            }`}
          >
            {isLoading ? 'Generating Picks...' : 'Generate New Picks Now'}
          </button>
        </div>
        
        <div className="mb-6 p-4 bg-gray-700 rounded-lg">
          <div className="font-semibold mb-2">Status:</div>
          <div className="text-gray-300">{status}</div>
        </div>
        
        {result && (
          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-700 p-3 font-semibold">Generated Picks:</div>
            <div className="max-h-96 overflow-y-auto p-4 bg-gray-800">
              {result.map((pick, index) => (
                <div key={index} className="mb-4 p-3 bg-gray-700 rounded">
                  <div className="flex justify-between mb-2">
                    <span className="bg-yellow-600 text-xs font-bold px-2 py-1 rounded">{pick.league}</span>
                    <span className="text-xs text-gray-300">{pick.time}</span>
                  </div>
                  <div className="font-bold mb-1">{pick.game}</div>
                  <div className="text-sm text-gray-300 mb-1">
                    {pick.betType} • {pick.league === 'PARLAY' 
                      ? `${pick.parlayLegs?.length} Leg Parlay` 
                      : (pick.spread || pick.moneyline || pick.overUnder)}
                  </div>
                  <div className="text-xs text-gray-400">
                    Confidence: {pick.confidenceLevel}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="mt-8 text-center text-sm text-gray-400">
          <p>After generating new picks, return to the <a href="/real-gary-picks" className="text-yellow-400 hover:underline">Real Gary Picks</a> page to see them.</p>
        </div>
      </div>
    </div>
  );
};

export default RefreshTool;
