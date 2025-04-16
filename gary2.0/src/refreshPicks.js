import { createRoot } from 'react-dom/client';
import { picksService } from './services/picksService';
import { schedulerService } from './services/schedulerService';

// Create a minimal UI for the refresh tool
const RefreshTool = () => {
  const refreshPicks = async () => {
    const statusEl = document.getElementById('status');
    try {
      statusEl.textContent = '⏳ Refreshing picks with real data...';
      
      // Clear the localStorage data to force a fresh generation
      localStorage.removeItem('dailyPicks');
      localStorage.removeItem('lastPicksGenerationTime');
      
      // Generate new picks with real data
      console.log('Generating new picks with real API data...');
      const newPicks = await picksService.generateDailyPicks();
      
      // Save to localStorage and mark as generated
      localStorage.setItem('dailyPicks', JSON.stringify(newPicks));
      schedulerService.markPicksAsGenerated();
      
      statusEl.textContent = `✅ Success! Generated ${newPicks.length} picks with real data. Return to the main site to see them.`;
      console.log('Picks updated:', newPicks);
    } catch (error) {
      statusEl.textContent = '❌ Error refreshing picks. Check console for details.';
      console.error('Error refreshing picks:', error);
    }
  };

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>Gary's Picks Refresh Tool</h1>
      <p>Use this tool to manually refresh the picks on the site with real data from The Odds API.</p>
      <button 
        onClick={refreshPicks}
        style={{
          background: '#FFC94C', 
          border: 'none', 
          padding: '12px 24px', 
          borderRadius: '5px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '16px'
        }}
      >
        Refresh Picks Now
      </button>
      <div id="status" style={{ marginTop: '20px', padding: '15px', borderRadius: '5px', background: '#f5f5f5' }}>
        Ready to refresh picks.
      </div>
    </div>
  );
};

// Mount the refresh tool to the DOM
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<RefreshTool />);
