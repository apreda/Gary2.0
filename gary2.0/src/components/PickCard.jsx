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
    id: pick.id,
    game: pick.game,
    league: pick.league,
    spread: pick.spread,
    betType: pick.betType,
    shortPick: pick.shortPick,
    pickDetail: pick.pickDetail,
    imageUrl: pick.imageUrl,
    analysis: pick.analysis,
    confidenceLevel: pick.confidenceLevel,
    garysBullets: pick.garysBullets
  });
  
  // Force primetime card type for all picks to ensure CONSISTENT gold/black styling
  let cardType = 'primetime';
  
  // Get gradient classes based on card type - ensuring the dark/gold theme
  const getGradientClass = () => {
    // Always return primetime dark/gold styling regardless of card type
    return 'bg-gradient-to-b from-[#111111] to-[#222222] text-white';
  };
  
  // Construct the front content with gold/black styling
  const frontContent = (
    <div className={`card-front w-full h-full rounded-xl overflow-hidden transition-all duration-300 ${isActive ? 'scale-100' : 'scale-95 opacity-90'}`}>
      {/* Card Header with League Badge */}
      <div className="card-header bg-gradient-to-b from-[#111111] to-[#222222] p-4 relative premium-header border-b border-[#d4af37]/30">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent gold-accent-line"></div>
        <div className="flex justify-between items-start">
          <div>
            <div className="inline-block bg-[#d4af37] text-black font-bold py-1 px-3 rounded-full text-xs uppercase tracking-wider shadow-md">
              {pick.league}
            </div>
            <div className="text-sm mt-2 text-white opacity-80">{pick.time || 'Today'}</div>
          </div>
          <div className="flex flex-col items-end premium-confidence">
            <div className="text-sm font-medium text-white">Confidence</div>
            <div className="text-xl font-bold text-[#d4af37] gold-text">{pick.confidenceLevel || 75}%</div>
          </div>
        </div>
      </div>
      
      {/* Card Body */}
      <div className="card-body bg-gradient-to-b from-[#111111] to-[#222222] text-white p-5 premium-card-body">
        <div className="mb-4 pick-team-container">
          <div className="text-2xl font-bold mb-1 text-[#d4af37] gold-text">{pick.game || 'Matchup'}</div>
          <div className="pick-details text-sm text-white">{pick.spread || pick.betType || 'Spread / Moneyline'}</div>
        </div>
        
        <div className="border-t border-[#d4af37]/30 pt-4 mb-5 pick-info-divider">
          <div className="text-xl font-bold mb-3 text-[#d4af37] gold-text premium-pick">{pick.shortPick || pick.pickDetail || pick.betType || 'Pick Details'}</div>
          <div className="text-sm text-white mb-4 pick-analysis-preview">
            {pick.analysis?.substring(0, 120) || "Gary's analysis will appear here when you flip the card..."}...
          </div>
        </div>
        
        <div className="flex justify-center mt-auto">
          <button 
            className="bg-[#d4af37] hover:bg-[#c9a535] text-black font-bold py-3 px-8 rounded-full shadow-lg transform hover:scale-105 transition-all duration-300"
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
  
  // Construct the back content - Gary's analysis with gold/black theme
  const backContent = (
    <div className="card-back w-full h-full bg-[#111111] shadow-xl rounded-xl border border-[#d4af37]/30 overflow-hidden transition-all">
      {/* Back Header */}
      <div className="bg-gradient-to-r from-[#111111] via-[#222222] to-[#111111] text-white p-4 relative border-b border-[#d4af37]/30">
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
            className="py-2 px-4 bg-[#222222] hover:bg-black text-[#d4af37] rounded-lg transition ml-2 border border-[#d4af37]/30"
          >
            ✕
          </button>
        </div>
      </div>
      
      {/* Analysis Content */}
      <div className="p-5 bg-[#111111] text-white">
        <div className="mb-5">
          <p className="text-gray-200 mb-4 leading-relaxed">{pick.analysis || pick.garysAnalysis || "Gary's detailed analysis of this pick will help you understand why it's a strong betting opportunity based on team performances, trends, and key statistics."}</p>
          
          <div className="bg-[#222222] p-4 rounded-lg border border-[#d4af37]/30 mt-4">
            <h4 className="font-bold mb-3 text-[#d4af37] flex items-center">
              <span className="text-[#d4af37] mr-2">★</span>Key Factors
            </h4>
            <ul className="space-y-2">
              {(pick.garysBullets && pick.garysBullets.length > 0) ? pick.garysBullets.map((bullet, i) => (
                <li key={i} className="flex items-start">
                  <span className="text-[#d4af37] mr-2">•</span>
                  <span className="text-gray-300">{bullet}</span>
                </li>
              )) : [
                "Team's recent performance suggests strong momentum",
                "Historical matchup statistics favor this pick",
                "Key player availability creates an advantage"
              ].map((bullet, i) => (
                <li key={i} className="flex items-start">
                  <span className="text-[#d4af37] mr-2">•</span>
                  <span className="text-gray-300">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-center space-x-3 mt-6">
          <button 
            className={`py-3 px-6 rounded-full shadow-lg font-bold transform hover:translate-y-[-2px] transition-all ${userDecision === 'bet' 
              ? 'bg-[#1e4620] text-[#7bea84] border border-[#7bea84]/50' 
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
            className="py-3 px-5 bg-[#333333] hover:bg-[#444444] text-white rounded-lg transition border border-[#d4af37]/30"
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
        title={pick.game || pick.shortPick || `${pick.league} Pick`}
        badge={pick.league || 'Pick'}
        imageUrl={pick.imageUrl || `/logos/${(pick.league||'default').toLowerCase()}.svg`}
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
