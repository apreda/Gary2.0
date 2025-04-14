// API Key Check component for admin users
import React, { useEffect, useState } from 'react';

const ApiKeyCheck = () => {
  const [apiStatus, setApiStatus] = useState({
    oddsApiKey: {
      present: false,
      value: '',
      masked: ''
    },
    deepseekApiKey: {
      present: false,
      value: '',
      masked: ''
    },
    isProduction: import.meta.env.PROD
  });

  useEffect(() => {
    // Check for environment variables
    const oddsApiKey = import.meta.env.VITE_ODDS_API_KEY;
    const deepseekApiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
    
    // Mask the keys for security (show only first 5 and last 4 chars)
    const maskKey = (key) => {
      if (!key) return '';
      if (key.length <= 9) return '********';
      return `${key.slice(0, 5)}...${key.slice(-4)}`;
    };
    
    setApiStatus({
      oddsApiKey: {
        present: !!oddsApiKey,
        value: oddsApiKey || '',
        masked: maskKey(oddsApiKey)
      },
      deepseekApiKey: {
        present: !!deepseekApiKey,
        value: deepseekApiKey || '',
        masked: maskKey(deepseekApiKey)
      },
      isProduction: import.meta.env.PROD
    });
  }, []);

  const testOddsApi = async () => {
    try {
      // Make a direct request to the Odds API with the key to test it
      const apiKey = apiStatus.oddsApiKey.value;
      if (!apiKey) {
        alert('No API key found to test');
        return;
      }
      
      const response = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${apiKey}`);
      const data = await response.json();
      
      if (response.ok) {
        alert(`Success! Retrieved ${data.length} sports from The Odds API.`);
      } else {
        alert(`API Error: ${data.message || response.statusText}`);
      }
    } catch (error) {
      alert(`Error testing API key: ${error.message}`);
    }
  };

  return (
    <div style={{ 
      maxWidth: '600px', 
      margin: '40px auto', 
      padding: '20px', 
      background: '#222', 
      borderRadius: '8px',
      border: '2px solid #FFC94C'
    }}>
      <h2 style={{ color: '#FFC94C', marginTop: 0 }}>API Key Status</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <p><strong>Environment:</strong> {apiStatus.isProduction ? 'Production' : 'Development'}</p>
      </div>
      
      <div style={{ 
        background: '#333', 
        padding: '15px', 
        borderRadius: '4px',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#FFC94C' }}>The Odds API</h3>
        <p><strong>Key Present:</strong> 
          <span style={{ color: apiStatus.oddsApiKey.present ? '#4CAF50' : '#F44336' }}>
            {apiStatus.oddsApiKey.present ? '✓ YES' : '✗ NO'}
          </span>
        </p>
        {apiStatus.oddsApiKey.present && (
          <p><strong>Key:</strong> {apiStatus.oddsApiKey.masked}</p>
        )}
        <button 
          onClick={testOddsApi}
          style={{
            background: '#FFC94C',
            border: 'none',
            color: '#000',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginTop: '10px'
          }}
        >
          Test Odds API Key
        </button>
      </div>
      
      <div style={{ 
        background: '#333', 
        padding: '15px', 
        borderRadius: '4px' 
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#FFC94C' }}>DeepSeek API</h3>
        <p><strong>Key Present:</strong> 
          <span style={{ color: apiStatus.deepseekApiKey.present ? '#4CAF50' : '#F44336' }}>
            {apiStatus.deepseekApiKey.present ? '✓ YES' : '✗ NO'}
          </span>
        </p>
        {apiStatus.deepseekApiKey.present && (
          <p><strong>Key:</strong> {apiStatus.deepseekApiKey.masked}</p>
        )}
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#888' }}>
        <p>If keys are missing, make sure they are set in your Vercel environment variables:</p>
        <ul>
          <li>VITE_ODDS_API_KEY</li>
          <li>VITE_DEEPSEEK_API_KEY</li>
        </ul>
      </div>
    </div>
  );
};

export default ApiKeyCheck;
