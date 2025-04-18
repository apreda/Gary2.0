import React from 'react';
import UniformPickCard from './UniformPickCard';

/**
 * PickCard component - Adapts pick data for UniformPickCard using the established design system
 */
const PickCard = ({ pick, isActive, isFlipped, onFlip, onTrackBet, userDecision }) => {
  // Add detailed debugging
  console.log('PickCard received data:', {
    pick,
    pickId: pick?.id,
    isActive,
    isFlipped
  });
  
  if (!pick || !pick.id) {
    console.error('Invalid pick data:', pick);
    return null;
  }
  
  // Check all required props for rendering
  console.log('Pick properties check:', {
    game: pick.game,
    league: pick.league,
    pickTeam: pick.pickTeam,
    betType: pick.betType || 'Moneyline',
    shortPick: pick.shortPick,
    image: pick.image || 'missing'
  });
  
  // Force primetime card type for all picks to ensure CONSISTENT gold/black styling
  let cardType = 'primetime';
  
  // Get gradient classes based on card type - ensuring the dark/gold theme
  const getGradientClass = () => {
    // Always return primetime dark/gold styling regardless of card type
    return 'bg-gradient-to-b from-[#111111] to-[#222222] text-white';
  };
  
  // Construct the front content
  const frontContent = (
    <div className={`card-front w-full h-full rounded-xl overflow-hidden transition-all duration-300 ${isActive ? 'scale-100' : 'scale-95 opacity-90'}`}>
      {/* Card Header with League Badge */}
      <div className={`card-header ${getGradientClass()} p-4 relative premium-header`}>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent gold-accent-line"></div>
        <div className="flex justify-between items-start">
          <div>
            <div className="inline-block bg-white text-black font-bold py-1 px-3 rounded-full text-xs uppercase tracking-wider shadow-md">
              {pick.league}
            </div>
            <div className="text-sm mt-2 opacity-80">{pick.time}</div>
          </div>
          <div className="flex flex-col items-end premium-confidence">
            <div className="text-sm font-medium">Confidence</div>
            <div className="text-xl font-bold text-[#d4af37] gold-text">{pick.confidenceLevel || 75}%</div>
          </div>
        </div>
      </div>
      
      {/* Card Body */}
      <div className="card-body bg-gradient-to-b from-[#111111] to-[#222222] text-white p-4 premium-card-body">
        <div className="mb-3 pick-team-container">
          <div className="text-xl font-bold mb-1 text-[#d4af37] gold-text">{pick.pickTeam}</div>
          <div className="pick-details text-sm text-gray-300">{pick.betType || 'Moneyline'}</div>
        </div>
        
        <div className="border-t border-[#d4af37]/30 pt-3 mb-4 pick-info-divider">
          <div className="text-xl font-bold mb-2 text-[#d4af37] gold-text premium-pick">{pick.shortPick || pick.pickDetail}</div>
          <div className="text-sm text-gray-300 mb-3 line-clamp-3 pick-analysis-preview">
            {pick.pickDetail || pick.analysis?.substring(0, 100)}...
          </div>
        </div>
        
        <div className="flex justify-center">
          <button 
            className="bg-[#d4af37] hover:bg-[#c9a535] text-black font-bold py-2 px-6 rounded-full shadow-md transform hover:scale-105 transition-all duration-300"
            onClick={(e) => {
              e.stopPropagation();
              onFlip && onFlip();
            }}
          >
            See Analysis
          </button>
        </div>
      </div>
    </div>
  );
  
  // Construct the back content
  const backContent = (
    <div className="card-back w-full h-full bg-white shadow-xl rounded-xl border border-gray-200 overflow-hidden transition-all">
      {/* Back Header */}
      <div className="bg-[#111111] text-white p-4 relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold flex items-center">
            <span className="text-[#d4af37] mr-2">G</span>Gary's Analysis
          </h3>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onFlip && onFlip();
            }}
            className="py-2 px-4 bg-gray-800 hover:bg-black text-[#d4af37] rounded-lg transition ml-2"
          >
            ✕
          </button>
        </div>
      </div>
      
      {/* Analysis Content */}
      <div className="p-5">
        <div className="mb-5">
          <p className="text-gray-800 mb-4 leading-relaxed">{pick.analysis || pick.garysAnalysis}</p>
          
          <div className="bg-gray-50 p-4 rounded-lg border border-[#d4af37] mt-4">
            <h4 className="font-bold mb-3 text-[#111111] flex items-center">
              <span className="text-[#d4af37] mr-2">★</span>Key Factors
            </h4>
            <ul className="space-y-2">
              {(pick.garysBullets || []).map((bullet, i) => (
                <li key={i} className="flex items-start">
                  <span className="text-[#d4af37] mr-2">•</span>
                  <span className="text-gray-700">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-center space-x-3 mt-6">
          <button 
            className={`py-2 px-6 rounded-full shadow-md font-bold transform hover:translate-y-[-2px] transition-all ${userDecision === 'bet' 
              ? 'bg-green-100 text-green-700 border border-green-500' 
              : 'bg-[#d4af37] hover:bg-[#c9a535] text-black'}`}
            onClick={(e) => {
              e.stopPropagation();
              onTrackBet && onTrackBet();
            }}
            disabled={userDecision === 'bet'}
          >
            {userDecision === 'bet' ? 'Tracked ✓' : 'Track Bet'}
          </button>
          
          <button 
            className="py-2 px-4 bg-[#d4af37] hover:bg-[#c9a535] text-black rounded-lg transition"
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
    </div>
  );
  
  // Use class to manage visibility based on active state for carousel effect
  const displayClass = isActive ? 'block' : 'hidden';
  
  return (
    <div className={`pick-card-wrapper ${displayClass} w-full transition-all duration-500`}>
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
    </div>
  );
};

export default PickCard;
