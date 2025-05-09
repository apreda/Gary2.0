import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { resultsCheckerService } from '../services/resultsCheckerService';
import { perplexityService } from '../services/perplexityService';
import { openaiService } from '../services/openaiService';
import { garyPerformanceService } from '../services/garyPerformanceService';
import { propResultsService } from '../services/propResultsService';

function ResultsAdmin() {
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState('loading');
  const [activeTab, setActiveTab] = useState('game_results');
  const [propResults, setPropResults] = useState([]);
  const [propResultsLoading, setPropResultsLoading] = useState(false);
  
  // Set the default date to a recent past date (known to have results) and check API key status
  useEffect(() => {
    // For testing purposes, we'll use a known date with sports events
    // This would be yesterday in production
    const testDate = new Date('2024-04-01'); // April 1, 2024 - recent past date with known sports events
    setDate(testDate.toISOString().split('T')[0]);
    
    // Check OpenAI API key status
    if (openaiService.API_KEY) {
      setApiKeyStatus('configured');
      setStatus('OpenAI API key is already configured in the system');
    } else {
      setApiKeyStatus('missing');
      setStatus('OpenAI API key is not configured. Please check your environment variables.');
    }
    
    // Check if automatic checking is enabled
    const autoCheck = localStorage.getItem('auto_check_enabled') === 'true';
    setAutoCheckEnabled(autoCheck);
  }, []);
  
  // Toggle automatic checking
  const toggleAutoCheck = () => {
    const newValue = !autoCheckEnabled;
    setAutoCheckEnabled(newValue);
    localStorage.setItem('auto_check_enabled', newValue.toString());
    
    if (newValue) {
      // Start the daily checker
      resultsCheckerService.startDailyResultsChecker();
      setStatus('Automatic checking enabled - will run daily at 10 AM');
    } else {
      setStatus('Automatic checking disabled');
    }
  };
  
  // Manually check prop results for a specific date
  const checkPropResults = async () => {
    setPropResultsLoading(true);
    setStatus('Checking player prop results...');
    
    try {
      const results = await propResultsService.checkPropResults(date);
      
      if (results.success) {
        setStatus(`Success: ${results.message}`);
        setPropResults(results.results || []);
      } else {
        setStatus(`Error: ${results.message || 'Could not check prop results'}`);
      }
    } catch (error) {
      setStatus(`Error checking prop results: ${error.message}`);
      console.error('Error checking prop results:', error);
    }
    
    setPropResultsLoading(false);
  };
  
  // Manually check game results for a specific date
  const checkResults = async () => {
    setLoading(true);
    setStatus('Checking results...');
    
    try {
      // Get picks from the database
      console.log(`Fetching picks for date: ${date}`);
      
      // First, log all entries in daily_picks to diagnose the issue
      const { data: allPicks, error: allPicksError } = await supabase
        .from('daily_picks')
        .select('id, date, created_at');
      
      if (allPicksError) throw allPicksError;
      console.log('All picks in database:', allPicks);
      
      // Now try to get the specific date
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', date)
        .maybeSingle();
      
      if (error) throw error;
      
      // If no picks found for the date
      if (!data || !data.picks) {
        const errorMessage = `Error: No picks found for ${date}`;
        console.error(errorMessage);
        setStatus(errorMessage);
        setLoading(false);
        return;
      }
      
      const picksResponse = {
        success: true,
        data: data.picks,
        date: date
      };
      
      if (!picksResponse.success) {
        setStatus(`Error: ${picksResponse.message || 'Could not fetch picks'}`);
        setLoading(false);
        return;
      }
      
      // Use the automated results checking that includes Odds API
      // Update the date in the picksResponse for proper processing
      const automatedResults = await resultsCheckerService.automateResultsChecking();
      
      if (!automatedResults.success) {
        setStatus(`Error: ${automatedResults.message || 'Could not check results'}`);
        setLoading(false);
        return;
      }
      
      // No need for separate record call as automateResultsChecking includes it
      
      // Set the success message directly from automatedResults
      setStatus(`Success: ${automatedResults.message}`);
      
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      console.error('Error checking results:', error);
    }
    
    setLoading(false);
  };
  
  return (
    <div className="pt-24 pb-12 px-8 max-w-4xl mx-auto min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6">Results Admin</h1>
      
      {/* Tab Navigation */}
      <div className="flex mb-6 border-b border-gray-700">
        <button
          className={`px-4 py-2 font-medium ${activeTab === 'game_results' ? 'text-[#B8953F] border-b-2 border-[#B8953F]' : 'text-gray-400'}`}
          onClick={() => setActiveTab('game_results')}
        >
          Game Results
        </button>
        <button
          className={`px-4 py-2 font-medium ${activeTab === 'prop_results' ? 'text-[#B8953F] border-b-2 border-[#B8953F]' : 'text-gray-400'}`}
          onClick={() => setActiveTab('prop_results')}
        >
          Player Prop Results
        </button>
      </div>
      
      {activeTab === 'game_results' ? (
        <>
          <div className="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 className="text-xl font-semibold mb-4">OpenAI API Configuration</h2>
        <div className="mb-4">
          {apiKeyStatus === 'configured' ? (
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-500 rounded-full mr-2"></div>
              <span>OpenAI API Key is configured and ready to use</span>
            </div>
          ) : (
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
              <span>OpenAI API Key is missing or invalid. Please check your environment variables.</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-gray-800 p-6 rounded-lg mb-8">
        <h2 className="text-xl font-semibold mb-4">Automatic Results Checking</h2>
        <div className="flex items-center mb-4">
          <input 
            type="checkbox"
            checked={autoCheckEnabled}
            onChange={toggleAutoCheck}
            className="mr-2"
          />
          <label>Enable automatic daily results checking (10 AM)</label>
        </div>
      </div>
      
      <div className="bg-gray-800 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Manual Game Results Check</h2>
        <div className="mb-4">
          <label className="block mb-2">Date (YYYY-MM-DD)</label>
          <input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
            className="w-full p-2 bg-gray-700 rounded"
          />
        </div>
        <button 
          onClick={checkResults}
          disabled={loading}
          className={`px-4 py-2 ${loading ? 'bg-gray-600' : 'bg-green-600'} rounded`}
        >
          {loading ? 'Checking...' : 'Check Results'}
        </button>
        
        {status && (
          <div className="mt-4 p-3 bg-gray-700 rounded">
            {status}
          </div>
        )}
      </div>
        </>
      ) : (
        <>
          <div className="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 className="text-xl font-semibold mb-4">Check Player Prop Results</h2>
            <div className="mb-4">
              <label className="block mb-2">Date (YYYY-MM-DD)</label>
              <input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2 bg-gray-700 rounded"
              />
            </div>
            <button 
              onClick={checkPropResults}
              disabled={propResultsLoading}
              className={`px-4 py-2 ${propResultsLoading ? 'bg-gray-600' : 'bg-green-600'} rounded`}
            >
              {propResultsLoading ? 'Checking...' : 'Check Prop Results'}
            </button>
            
            {status && (
              <div className="mt-4 p-3 bg-gray-700 rounded">
                {status}
              </div>
            )}
          </div>
          
          {/* Display Prop Results */}
          {propResults && propResults.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Player Prop Results</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-gray-900 rounded-lg">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left">Player</th>
                      <th className="px-4 py-2 text-left">Prop</th>
                      <th className="px-4 py-2 text-left">Line</th>
                      <th className="px-4 py-2 text-left">Direction</th>
                      <th className="px-4 py-2 text-left">Actual</th>
                      <th className="px-4 py-2 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propResults.map((result, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-900'}>
                        <td className="px-4 py-2">{result.player_name}</td>
                        <td className="px-4 py-2">{result.prop_type}</td>
                        <td className="px-4 py-2">{result.prop_line}</td>
                        <td className="px-4 py-2">{result.pick_direction}</td>
                        <td className="px-4 py-2">{result.actual_result || 'N/A'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${result.result_status === 'won' ? 'bg-green-500/20 text-green-400' : 
                            result.result_status === 'lost' ? 'bg-red-500/20 text-red-400' : 
                            result.result_status === 'push' ? 'bg-yellow-500/20 text-yellow-400' : 
                            'bg-gray-500/20 text-gray-400'}`}>
                            {result.result_status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ResultsAdmin;
