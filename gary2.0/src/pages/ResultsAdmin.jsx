import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { resultsCheckerService } from '../services/resultsCheckerService';
import { perplexityService } from '../services/perplexityService';
import { garyPerformanceService } from '../services/garyPerformanceService';

function ResultsAdmin() {
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState('loading');
  
  // Set the default date to a recent past date (known to have results) and check API key status
  useEffect(() => {
    // For testing purposes, we'll use a known date with sports events
    // This would be yesterday in production
    const testDate = new Date('2024-04-01'); // April 1, 2024 - recent past date with known sports events
    setDate(testDate.toISOString().split('T')[0]);
    
    // Check Perplexity API key status
    if (perplexityService.API_KEY) {
      setApiKeyStatus('configured');
      setStatus('Perplexity API key is already configured in the system');
    } else {
      setApiKeyStatus('missing');
      setStatus('Perplexity API key is not configured. Please check your environment variables.');
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
  
  // Manually check results for a specific date
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
      
      // Check results with Perplexity
      const results = await resultsCheckerService.checkResultsWithAI(
        picksResponse.data,
        date
      );
      
      if (!results.success) {
        setStatus(`Error: ${results.message || 'Could not check results'}`);
        setLoading(false);
        return;
      }
      
      // Record the results
      const recordResponse = await garyPerformanceService.recordPickResults(
        date,
        results.results
      );
      
      if (recordResponse.success) {
        setStatus(`Success: ${recordResponse.message}`);
      } else {
        setStatus(`Error: ${recordResponse.message}`);
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      console.error('Error checking results:', error);
    }
    
    setLoading(false);
  };
  
  return (
    <div className="pt-24 pb-12 px-8 max-w-4xl mx-auto min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6">Results Admin</h1>
      
      <div className="bg-gray-800 p-6 rounded-lg mb-8">
        <h2 className="text-xl font-semibold mb-4">Perplexity API Configuration</h2>
        <div className="mb-4">
          {apiKeyStatus === 'configured' ? (
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-500 rounded-full mr-2"></div>
              <span>Perplexity API Key is configured and ready to use</span>
            </div>
          ) : (
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
              <span>Perplexity API Key is missing or invalid. Please check your environment variables.</span>
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
        <h2 className="text-xl font-semibold mb-4">Manual Results Check</h2>
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
    </div>
  );
}

export default ResultsAdmin;
