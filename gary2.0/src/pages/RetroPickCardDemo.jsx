import React, { useState } from 'react';
import RetroPickCard from '../components/RetroPickCard';

// Mock pick data using the new OpenAI output format
const mockPick = {
  id: 'demo1234',
  game: 'NYM @ LAD',
  league: 'MLB',
  time: '10:10 PM ET',
  // OpenAI output format fields
  pick: 'LAD ML -115',
  type: 'moneyline',
  confidence: 0.87,
  trapAlert: false,
  revenge: false,
  momentum: 0.71,
  rationale: 'Dodgers are 8-2 in their last 10 home games with excellent pitching. Mets starter has struggled with a 5.12 ERA in night games, and the Dodgers have a significant edge in bullpen ERA (3.12 vs 4.48). The line movement hasn\'t shifted much, indicating value on the Dodgers at home.'
};

export default function RetroPickCardDemo() {
  const [isFlipped, setIsFlipped] = useState(false);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-yellow-100 to-orange-200 py-8">
      <h2 className="mb-6 text-2xl font-extrabold text-gray-800">RetroPickCard Demo (Using Raw OpenAI Format)</h2>
      <div className="mb-4 p-4 bg-white rounded-lg shadow-lg">
        <h3 className="font-bold text-lg mb-2">OpenAI Output Format Demo</h3>
        <p className="mb-1"><span className="font-semibold">Front:</span> Just the pick - "{mockPick.pick}"</p>
        <p className="mb-1"><span className="font-semibold">Back:</span> Just the rationale</p>
        <p className="italic text-xs text-gray-600 mt-2">This demo shows the card using the raw OpenAI output format from Supabase</p>
      </div>
      <button
        className="mb-4 px-5 py-2 rounded bg-yellow-400 text-gray-900 font-bold shadow hover:bg-yellow-300 transition"
        onClick={() => setIsFlipped(f => !f)}
      >
        {isFlipped ? 'Show Front' : 'Show Back'}
      </button>
      <div style={{ width: '20rem', height: '27rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <RetroPickCard 
          pick={{
            // Map to what RetroPickCard expects
            id: mockPick.id,
            shortPick: mockPick.pick, // Front: The pick
            description: mockPick.rationale, // Back: The rationale
            game: mockPick.game,
            league: mockPick.league,
            confidence: mockPick.confidence,
            time: mockPick.time,
            type: mockPick.type,
            trapAlert: mockPick.trapAlert
          }} 
          showToast={() => {}} 
          isFlipped={isFlipped} 
          setIsFlipped={setIsFlipped} 
        />
      </div>
    </div>
  );
}
