import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { pickResultsService } from '../services/pickResultsService';

const BetFadeTestPanel = () => {
  const [testResults, setTestResults] = useState('');
  const [loading, setLoading] = useState(false);
  const [testDate, setTestDate] = useState('2024-04-01');

  const runAutomatedTest = async () => {
    setLoading(true);
    setTestResults('🎯 Testing Automated Bet/Fade Processing...\n\n');
    
    try {
      // Step 1: Check if there are any user picks for the test date
      const { data: userPicks, error: userPicksError } = await supabase
        .from('user_picks')
        .select('*')
        .gte('created_at', `${testDate}T00:00:00`)
        .lte('created_at', `${testDate}T23:59:59`);
      
      if (userPicksError) throw userPicksError;
      
      setTestResults(prev => prev + `📊 Found ${userPicks?.length || 0} user picks for ${testDate}\n`);
      
      // Step 2: Process game results for the date (this should automatically trigger user results)
      setTestResults(prev => prev + `🔄 Processing game results for ${testDate}...\n`);
      
      const gameResultsResponse = await pickResultsService.checkResultsForDate(testDate);
      
      if (gameResultsResponse.success) {
        setTestResults(prev => prev + `✅ Game results processed successfully!\n`);
        setTestResults(prev => prev + `📈 Game Results: ${gameResultsResponse.gameResults?.message || 'No details'}\n`);
        setTestResults(prev => prev + `🎲 Prop Results: ${gameResultsResponse.propResults?.message || 'No details'}\n`);
        
        // Step 3: Check if user results were automatically processed
        if (gameResultsResponse.userResults) {
          setTestResults(prev => prev + `\n🎯 AUTOMATED USER RESULTS:\n`);
          setTestResults(prev => prev + `Status: ${gameResultsResponse.userResults.success ? '✅ SUCCESS' : '❌ FAILED'}\n`);
          setTestResults(prev => prev + `Message: ${gameResultsResponse.userResults.message}\n`);
          
          if (gameResultsResponse.userResults.processed > 0) {
            setTestResults(prev => prev + `🎉 ${gameResultsResponse.userResults.processed} user bet/fade outcomes updated automatically!\n`);
          }
        } else {
          setTestResults(prev => prev + `\n⚠️ No user results processing information found\n`);
        }
        
        // Step 4: Verify the results in the database
        const { data: updatedUserPicks, error: verifyError } = await supabase
          .from('user_picks')
          .select('*')
          .gte('created_at', `${testDate}T00:00:00`)
          .lte('created_at', `${testDate}T23:59:59`)
          .not('outcome', 'is', null);
        
        if (verifyError) throw verifyError;
        
        setTestResults(prev => prev + `\n📋 VERIFICATION:\n`);
        setTestResults(prev => prev + `User picks with outcomes: ${updatedUserPicks?.length || 0}\n`);
        
        if (updatedUserPicks && updatedUserPicks.length > 0) {
          const outcomes = updatedUserPicks.reduce((acc, pick) => {
            acc[pick.outcome] = (acc[pick.outcome] || 0) + 1;
            return acc;
          }, {});
          
          setTestResults(prev => prev + `Outcomes breakdown: ${JSON.stringify(outcomes)}\n`);
        }
        
      } else {
        setTestResults(prev => prev + `❌ Game results processing failed: ${gameResultsResponse.message}\n`);
      }
      
    } catch (error) {
      setTestResults(prev => prev + `❌ Test failed: ${error.message}\n`);
      console.error('Automated test error:', error);
    }
    
    setLoading(false);
  };

  const clearTestResults = () => {
    setTestResults('');
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg">
      <h2 className="text-xl font-semibold mb-4">🎯 Automated Bet/Fade Processing Test</h2>
      
      <div className="mb-4">
        <label className="block mb-2">Test Date (YYYY-MM-DD)</label>
        <input 
          type="date" 
          value={testDate} 
          onChange={(e) => setTestDate(e.target.value)}
          className="w-full p-2 bg-gray-700 rounded"
        />
      </div>
      
      <div className="flex gap-4 mb-4">
        <button 
          onClick={runAutomatedTest}
          disabled={loading}
          className={`px-4 py-2 ${loading ? 'bg-gray-600' : 'bg-blue-600'} rounded`}
        >
          {loading ? 'Testing...' : '🎯 Test Automated Processing'}
        </button>
        
        <button 
          onClick={clearTestResults}
          className="px-4 py-2 bg-gray-600 rounded"
        >
          Clear Results
        </button>
      </div>
      
      {testResults && (
        <div className="bg-gray-900 p-4 rounded">
          <h3 className="font-semibold mb-2">Test Results:</h3>
          <pre className="text-sm whitespace-pre-wrap text-green-400">
            {testResults}
          </pre>
        </div>
      )}
      
      <div className="mt-6 p-4 bg-gray-700 rounded">
        <h3 className="font-semibold mb-2">ℹ️ How Automated Processing Works:</h3>
        <ul className="text-sm space-y-1 text-gray-300">
          <li>• When you process game results, user bet/fade outcomes are automatically calculated</li>
          <li>• No manual processing needed - everything happens in one step</li>
          <li>• User stats are updated automatically based on their bet/fade decisions</li>
          <li>• Works for both game picks and prop picks</li>
          <li>• Cross-device compatible - no localStorage dependencies</li>
        </ul>
      </div>
    </div>
  );
};

export default BetFadeTestPanel; 