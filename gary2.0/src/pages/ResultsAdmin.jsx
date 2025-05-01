import { useState } from 'react';
import { resultsCheckerService } from '../services/resultsCheckerService';

function ResultsAdmin() {
  const [apiKey, setApiKey] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  
  // Set the default date to yesterday
  useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setDate(yesterday.toISOString().split('T')[0]);
  }, []);
  
  // Save API key to localStorage
  const saveApiKey = () => {
    if (apiKey) {
      localStorage.setItem('openai_api_key', apiKey);
      process.env.OPENAI_API_KEY = apiKey;
      setStatus('API key saved');
    }
  };
  
  // Load API key from localStorage
  useState(() => {
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      process.env.OPENAI_API_KEY = savedKey;
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
      // Override the date in the getYesterdaysPicks function
      const picksResponse = await fetch('/api/picks?date=' + date);
      const picksData = await picksResponse.json();
      
      if (!picksData.success) {
        setStatus(`Error: ${picksData.message || 'Could not fetch picks'}`);
        setLoading(false);
        return;
      }
      
      // Check results with OpenAI
      const results = await resultsCheckerService.checkResultsWithAI(
        date,
        picksData.data
      );
      
      if (!results.success) {
        setStatus(`Error: ${results.message || 'Could not check results'}`);
        setLoading(false);
        return;
      }
      
      // Record the results
      const recordResponse = await resultsCheckerService.recordPickResults(
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
        <h2 className="text-xl font-semibold mb-4">OpenAI API Configuration</h2>
        <div className="mb-4">
          <label className="block mb-2">API Key</label>
          <input 
            type="password" 
            value={apiKey} 
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full p-2 bg-gray-700 rounded"
            placeholder="sk-..."
          />
        </div>
        <button 
          onClick={saveApiKey}
          className="px-4 py-2 bg-blue-600 rounded"
        >
          Save API Key
        </button>
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
