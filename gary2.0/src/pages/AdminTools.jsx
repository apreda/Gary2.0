import React, { useState, useEffect } from 'react';
import ApiKeyCheck from '../apiKeyCheck.js';
import { picksService } from '../services/picksService';
import { oddsProxyService } from '../services/oddsProxyService';
import { schedulerService } from '../services/schedulerService';

const AdminTools = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [picks, setPicks] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);

  useEffect(() => {
    // Check for existing picks
    const existingPicks = localStorage.getItem('dailyPicks');
    if (existingPicks) {
      try {
        setPicks(JSON.parse(existingPicks));
      } catch (e) {
        console.error('Error parsing existing picks:', e);
      }
    }
  }, []);

  const addDebugLog = (message) => {
    setDebugLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleGeneratePicks = async () => {
    try {
      setIsGenerating(true);
      setStatus('Generating picks...');
      addDebugLog('Starting pick generation process');
      
      // Clear existing picks
      localStorage.removeItem('dailyPicks');
      localStorage.removeItem('lastPicksGenerationTime');
      addDebugLog('Cleared localStorage');
      
      // Try to get sports via proxy service first
      addDebugLog('Fetching sports via proxy service');
      let sportsList;
      try {
        sportsList = await oddsProxyService.getSports();
        addDebugLog(`Retrieved ${sportsList.length} sports via proxy`);
      } catch (proxyError) {
        addDebugLog(`Proxy error: ${proxyError.message}, falling back to standard service`);
        sportsList = await picksService.getSports();
        addDebugLog(`Retrieved ${sportsList.length} sports via standard service`);
      }
      
      // Generate new picks
      addDebugLog('Generating picks with retrieved sports data');
      const newPicks = await picksService.generateDailyPicks();
      
      // Save to localStorage
      localStorage.setItem('dailyPicks', JSON.stringify(newPicks));
      schedulerService.markPicksAsGenerated();
      
      addDebugLog(`Successfully generated ${newPicks.length} picks`);
      setPicks(newPicks);
      setStatus(`Success! Generated ${newPicks.length} picks.`);
      
    } catch (error) {
      console.error('Error generating picks:', error);
      addDebugLog(`ERROR: ${error.message}`);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const forceMockPicks = () => {
    try {
      const mockPicks = [
        {
          id: 1,
          league: "NBA",
          game: "Orlando Magic vs Atlanta Hawks",
          moneyline: "Atlanta Hawks +170",
          spread: "Atlanta Hawks +5",
          overUnder: "Over 217",
          time: "7:40 PM EDT",
          walletValue: "$418",
          pickDetail: "Orlando Magic is coming off a tough loss, but they've been MONEY after losses, covering in 7 of their last 9.",
          confidenceLevel: 83,
          betType: "Spread Pick",
          isPremium: false,
          primeTimeCard: false
        },
        {
          id: 2,
          league: "MLB",
          game: "San Diego Padres vs Chicago Cubs",
          moneyline: "Chicago Cubs +130",
          spread: "Chicago Cubs +1.5",
          overUnder: "Over 7.5",
          time: "9:40 PM EDT",
          walletValue: "$390",
          pickDetail: "The public is ALL OVER Chicago Cubs, but the sharp money is POUNDING San Diego Padres. Follow the money, not the crowd.",
          confidenceLevel: 78,
          betType: "Spread Pick",
          isPremium: true,
          primeTimeCard: false
        },
        {
          id: 3,
          league: "NHL",
          game: "Edmonton Oilers vs Los Angeles Kings",
          moneyline: "Edmonton Oilers +138",
          spread: "Edmonton Oilers +1.5",
          overUnder: "Over 5.5",
          time: "10:00 PM EDT",
          walletValue: "$459",
          pickDetail: "Everyone thinks Los Angeles Kings is the easy play here, but that's EXACTLY what Vegas wants you to think. This line STINKS.",
          confidenceLevel: 91,
          betType: "Best Bet: Moneyline",
          isPremium: true,
          primeTimeCard: true
        },
        {
          id: 4,
          league: "PARLAY",
          game: "Parlay of the Day",
          moneyline: "",
          spread: "",
          overUnder: "",
          time: "All Day",
          pickDetail: "",
          walletValue: "$50",
          confidenceLevel: 65,
          isPremium: true,
          betType: "3-Leg Parlay",
          parlayOdds: "+850",
          potentialPayout: "$950",
          parlayLegs: [
            {
              game: "Orlando Magic vs Atlanta Hawks",
              pick: "Atlanta Hawks +5",
              league: "NBA",
              betType: "Spread Pick"
            },
            {
              game: "San Diego Padres vs Chicago Cubs",
              pick: "Chicago Cubs +1.5",
              league: "MLB",
              betType: "Spread Pick"
            },
            {
              game: "Edmonton Oilers vs Los Angeles Kings",
              pick: "Edmonton Oilers +1.5",
              league: "NHL",
              betType: "Best Bet"
            }
          ]
        }
      ];
      
      localStorage.setItem('dailyPicks', JSON.stringify(mockPicks));
      localStorage.setItem('lastPicksGenerationTime', new Date().toISOString());
      
      setStatus('Loaded mock picks with real game data');
      setPicks(mockPicks);
      addDebugLog('Successfully loaded mock picks with real game data');
    } catch (error) {
      console.error('Error loading mock picks:', error);
      setStatus(`Error: ${error.message}`);
    }
  };

  const clearAllPicks = () => {
    localStorage.removeItem('dailyPicks');
    localStorage.removeItem('lastPicksGenerationTime');
    setPicks([]);
    setStatus('Cleared all picks from localStorage');
    addDebugLog('Cleared all picks from localStorage');
  };

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#f5f5f5',
      background: '#111'
    }}>
      <h1 style={{ color: '#FFC94C', marginBottom: '30px' }}>Gary's Picks Admin Tools</h1>
      
      <div id="api-key-check-container" ref={el => {
        if (el && !el.hasChildNodes()) {
          // Mount the ApiKeyCheck component to this container
          const apiKeyChecker = ApiKeyCheck();
          apiKeyChecker.mount(el);
        }
      }}></div>
      
      <div style={{ 
        background: '#222', 
        padding: '20px', 
        borderRadius: '8px', 
        marginTop: '30px',
        border: '2px solid #FFC94C' 
      }}>
        <h2 style={{ color: '#FFC94C', marginTop: 0 }}>Generate Picks</h2>
        
        <div style={{ 
          background: '#333', 
          padding: '15px', 
          borderRadius: '4px',
          marginBottom: '20px' 
        }}>
          <p><strong>Status:</strong> {status}</p>
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button 
              onClick={handleGeneratePicks} 
              disabled={isGenerating}
              style={{
                background: '#FFC94C',
                border: 'none',
                color: '#000',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                opacity: isGenerating ? 0.7 : 1
              }}
            >
              {isGenerating ? 'Generating...' : 'Generate Real Picks Now'}
            </button>
            
            <button 
              onClick={forceMockPicks}
              style={{
                background: '#444',
                border: '1px solid #FFC94C',
                color: '#FFC94C',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Load Mock Picks
            </button>
            
            <button 
              onClick={clearAllPicks}
              style={{
                background: '#333',
                border: '1px solid #F44336',
                color: '#F44336',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Clear All Picks
            </button>
          </div>
        </div>
        
        <div style={{ marginTop: '20px' }}>
          <button 
            onClick={() => setShowDebug(!showDebug)}
            style={{
              background: 'transparent',
              border: '1px solid #999',
              color: '#999',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '10px'
            }}
          >
            {showDebug ? 'Hide Debug Logs' : 'Show Debug Logs'}
          </button>
          
          {showDebug && (
            <div style={{ 
              background: '#222', 
              border: '1px solid #555',
              borderRadius: '4px',
              padding: '10px',
              maxHeight: '300px',
              overflowY: 'scroll',
              fontFamily: 'monospace',
              fontSize: '12px',
              whiteSpace: 'pre-wrap'
            }}>
              {debugLogs.length === 0 ? 'No logs yet' : 
                debugLogs.map((log, i) => (
                  <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #333' }}>{log}</div>
                ))
              }
            </div>
          )}
        </div>
      </div>
      
      {picks.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ color: '#FFC94C' }}>Current Picks ({picks.length})</h2>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '20px'
          }}>
            {picks.map(pick => (
              <div 
                key={pick.id} 
                style={{ 
                  border: pick.primeTimeCard ? '2px solid white' : '2px solid #FFC94C', 
                  borderRadius: '8px',
                  padding: '15px',
                  background: pick.primeTimeCard ? 'linear-gradient(135deg, #000, #222)' : 'linear-gradient(135deg, #333, #222)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ 
                    background: pick.primeTimeCard ? 'black' : '#FFC94C', 
                    color: pick.primeTimeCard ? 'white' : 'black',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}>
                    {pick.league}
                  </span>
                  <span>{pick.time}</span>
                </div>
                
                <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '10px' }}>
                  {pick.game}
                </div>
                
                <div style={{ marginBottom: '8px' }}>
                  <strong>Type:</strong> {pick.betType}
                </div>
                
                {pick.league === 'PARLAY' ? (
                  <div>
                    <div style={{ marginBottom: '5px' }}><strong>Odds:</strong> {pick.parlayOdds}</div>
                    <div style={{ marginBottom: '10px' }}><strong>Payout:</strong> {pick.potentialPayout}</div>
                    <div style={{ borderTop: '1px solid #444', paddingTop: '8px' }}>
                      <strong>Legs:</strong>
                      <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
                        {pick.parlayLegs?.map((leg, i) => (
                          <li key={i} style={{ margin: '5px 0' }}>
                            {leg.game}: <strong>{leg.pick}</strong> ({leg.league})
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>Pick:</strong> {pick.spread || pick.moneyline || pick.overUnder}
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <strong>Confidence:</strong> {pick.confidenceLevel}%
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div style={{ marginTop: '20px', fontSize: '14px', color: '#999' }}>
            <p>Note: These picks have been saved to localStorage and will appear on the Gary's Picks page.</p>
          </div>
        </div>
      )}
      
      <div style={{ marginTop: '40px', borderTop: '1px solid #333', paddingTop: '20px', fontSize: '14px', color: '#888' }}>
        <p>Current scheduler settings:</p>
        <ul>
          <li>Picks are generated daily at: {schedulerService.getScheduledTime()}</li>
          <li>Current picks were generated at: {localStorage.getItem('lastPicksGenerationTime') ? new Date(localStorage.getItem('lastPicksGenerationTime')).toLocaleString() : 'Never'}</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminTools;
