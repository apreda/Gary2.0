import React from 'react';
import UniformPickCard from './UniformPickCard';

/**
 * PickCard component - Adapts pick data for UniformPickCard
 */
const PickCard = ({ pick, isActive, isFlipped, onFlip, onTrackBet, userDecision }) => {
  if (!pick || !pick.id) {
    console.error('Invalid pick data:', pick);
    return null;
  }
  
  // Determine card type based on pick properties
  let cardType = 'regular';
  if (pick.primeTimeCard) cardType = 'primetime';
  if (pick.league === 'PARLAY') cardType = 'parlay';
  
  // Construct the front content
  const frontContent = (
    <div>
      <div className="flex justify-between mb-4">
        <div>
          <div className="text-sm font-semibold mb-1">{pick.league} - {pick.time}</div>
          <div className="text-lg font-bold mb-1">{pick.game}</div>
          <div className="text-sm font-medium">{pick.betType || 'Moneyline'}</div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-sm font-semibold">Gary's Confidence</div>
          <div className="text-2xl font-bold text-green-600">{pick.confidenceLevel || 75}%</div>
        </div>
      </div>
      
      <div className="border-t border-gray-200 pt-4 mb-4">
        <div className="text-xl font-bold mb-2">{pick.shortPick || pick.pickDetail}</div>
        <div className="text-sm text-gray-600 mb-4">{pick.pickDetail || pick.analysis?.substring(0, 100)}...</div>
      </div>
      
      <div className="flex justify-center">
        <button 
          className="bg-[#d4af37] text-black font-bold py-2 px-6 rounded-lg transform hover:scale-105 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            onFlip && onFlip();
          }}
        >
          See Gary's Analysis
        </button>
      </div>
    </div>
  );
  
  // Construct the back content
  const backContent = (
    <div className="w-full h-full bg-white shadow-xl rounded-xl border border-gray-200 overflow-hidden p-5">
      <div className="flex justify-between mb-4">
        <h3 className="text-xl font-bold">Gary's Analysis</h3>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onFlip && onFlip();
          }}
          className="text-gray-500 hover:text-gray-700"
        >
          &times;
        </button>
      </div>
      
      <div className="mb-4">
        <p className="text-gray-700 mb-4">{pick.analysis || pick.garysAnalysis}</p>
        
        <h4 className="font-bold mb-2">Key Factors:</h4>
        <ul className="list-disc pl-5 mb-4">
          {(pick.garysBullets || []).map((bullet, i) => (
            <li key={i} className="text-gray-700 mb-1">{bullet}</li>
          ))}
        </ul>
      </div>
      
      <div className="flex justify-center space-x-2 mt-6">
        <button 
          className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg transition-colors hover:bg-green-700"
          onClick={(e) => {
            e.stopPropagation();
            onTrackBet && onTrackBet();
          }}
          disabled={userDecision === 'bet'}
        >
          {userDecision === 'bet' ? 'Tracked ✓' : 'Track Bet'}
        </button>
        
        <button 
          className="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-lg transition-colors hover:bg-gray-400"
          onClick={(e) => {
            e.stopPropagation();
            // Handle skip logic
          }}
          disabled={userDecision === 'skip'}
        >
          {userDecision === 'skip' ? 'Skipped ✓' : 'Skip'}
        </button>
      </div>
    </div>
  );
  
  return (
    <UniformPickCard
      cardType={cardType}
      title={pick.shortPick || `${pick.league} Pick`}
      badge={pick.league}
      imageUrl={pick.imageUrl || `/logos/${pick.league.toLowerCase()}.svg`}
      content={frontContent}
      backContent={backContent}
      isFlipped={isFlipped}
      isLocked={pick.isPremium}
      onFlip={onFlip}
    />
  );
};

export default PickCard;
