import React from 'react';
import ReactDOM from 'react-dom/client';
import { picksService } from './services/picksService';
import { schedulerService } from './services/schedulerService';
import './styles/base.css';

// A simple React component to force update picks
const ForceUpdate = () => {
  const [status, setStatus] = React.useState('Ready to generate new picks');
  const [isLoading, setIsLoading] = React.useState(false);
  const [picks, setPicks] = React.useState(null);

  const handleForceUpdate = async () => {
    try {
      setIsLoading(true);
      setStatus('Generating new picks...');
      
      // Clear localStorage to ensure fresh picks
      localStorage.removeItem('dailyPicks');
      localStorage.removeItem('lastPicksGenerationTime');
      
      // Generate new picks
      const newPicks = await picksService.generateDailyPicks();
      
      // Save to localStorage
      localStorage.setItem('dailyPicks', JSON.stringify(newPicks));
      schedulerService.markPicksAsGenerated();
      
      setPicks(newPicks);
      setStatus(`Successfully generated ${newPicks.length} picks!`);
      console.log('Generated picks:', newPicks);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      console.error('Error generating picks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Inter, -apple-system, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ color: '#1a1a1a', marginBottom: '20px' }}>Gary's Picks Force Update Tool</h1>
      
      <button 
        onClick={handleForceUpdate}
        disabled={isLoading}
        style={{
          backgroundColor: '#FFC94C',
          border: 'none',
          color: '#000',
          padding: '12px 24px',
          borderRadius: '4px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontWeight: 'bold',
          opacity: isLoading ? 0.7 : 1
        }}
      >
        {isLoading ? 'Generating...' : 'Force Generate New Picks'}
      </button>
      
      <div style={{ margin: '20px 0', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        Status: {status}
      </div>
      
      {picks && (
        <div>
          <h2>Generated Picks:</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {picks.map(pick => (
              <div key={pick.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', backgroundColor: pick.primeTimeCard ? '#222' : '#fff', color: pick.primeTimeCard ? '#fff' : '#333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ backgroundColor: pick.primeTimeCard ? '#000' : '#FFC94C', color: pick.primeTimeCard ? '#fff' : '#000', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '14px' }}>{pick.league}</span>
                  <span>{pick.time}</span>
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '8px' }}>{pick.game}</div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Bet Type:</strong> {pick.betType}
                </div>
                <div>
                  <strong>Pick:</strong> {pick.spread || pick.moneyline || pick.overUnder}
                </div>
                <div style={{ marginTop: '10px' }}>
                  <strong>Confidence:</strong> {pick.confidenceLevel}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div style={{ marginTop: '30px', fontSize: '14px', color: '#666' }}>
        <p>After generating new picks, return to the <a href="/real-gary-picks" style={{ color: '#FFC94C' }}>Real Gary's Picks</a> page to see them.</p>
      </div>
    </div>
  );
};

// Mount the component
ReactDOM.createRoot(document.getElementById('root')).render(<ForceUpdate />);
