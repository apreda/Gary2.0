import React, { useState } from 'react';
import RetroPickCard from '../components/RetroPickCard';

// Mock pick data for demo purposes
const mockPick = {
  id: 'demo1234',
  game: 'NYM @ LAD',
  league: 'MLB',
  shortPick: 'LAD ML -115',
  garysBullets: [
    'Dodgers are 8-2 in their last 10 home games.',
    'Mets starter has a 5.12 ERA in night games.',
    'LA bullpen is rested and dominant at home.'
  ],
  odds: -115,
  confidence: '92%',
  time: '10:10 PM ET'
};

export default function RetroPickCardDemo() {
  const [isFlipped, setIsFlipped] = useState(false);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-yellow-100 to-orange-200 py-8">
      <h2 className="mb-6 text-2xl font-extrabold text-gray-800">RetroPickCard Demo</h2>
      <button
        className="mb-4 px-5 py-2 rounded bg-yellow-400 text-gray-900 font-bold shadow hover:bg-yellow-300 transition"
        onClick={() => setIsFlipped(f => !f)}
      >
        {isFlipped ? 'Show Back' : 'Show Front'}
      </button>
      <div style={{ width: '20rem', height: '27rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <RetroPickCard pick={mockPick} showToast={() => {}} isFlipped={isFlipped} setIsFlipped={setIsFlipped} />
      </div>
    </div>
  );
}
