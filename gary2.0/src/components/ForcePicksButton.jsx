import React, { useState } from 'react';
import { forceGeneratePicks } from '../forceGeneratePicks';

/**
 * Button component to force generate new picks regardless of what's in Supabase
 * This is useful for development and testing
 */
export function ForcePicksButton() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');
  
  const handleForceGenerate = async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    setMessage('Generating new picks...');
    
    try {
      await forceGeneratePicks();
      setMessage('Picks generated! Reloading page in 3 seconds...');
      
      // Reload the page after 3 seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      console.error('Error generating picks:', error);
      setMessage(`Error: ${error.message}`);
      setIsGenerating(false);
    }
  };
  
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999
    }}>
      <button 
        onClick={handleForceGenerate}
        disabled={isGenerating}
        style={{
          backgroundColor: '#d4af37',
          color: '#000',
          border: 'none',
          padding: '12px 20px',
          borderRadius: '4px',
          fontWeight: 'bold',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          opacity: isGenerating ? 0.7 : 1
        }}
      >
        {isGenerating ? 'Generating...' : 'Force Generate New Picks'}
      </button>
      
      {message && (
        <div style={{
          backgroundColor: '#333',
          color: '#fff',
          padding: '10px',
          borderRadius: '4px',
          marginTop: '10px',
          maxWidth: '300px',
          textAlign: 'center'
        }}>
          {message}
        </div>
      )}
    </div>
  );
}

export default ForcePicksButton;
