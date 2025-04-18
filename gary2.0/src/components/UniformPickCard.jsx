import React from 'react';

/**
 * UniformPickCard - A standardized card component for Pick, Primetime, and Parlay cards
 */
const UniformPickCard = ({ 
  cardType = 'primetime', // Force primetime for gold/black design
  title,
  badge,
  imageUrl,
  content,
  isFlipped = false,
  backContent,
  isLocked = false,
  onFlip,
  children
}) => {
  // Determine background color based on card type - forcing dark styling
  const getBgColor = () => {
    // Force primetime dark styling
    return 'bg-gradient-to-b from-[#111111] to-[#222222]';
  };

  // Determine text color based on card type - forcing light text for dark background
  const getTextColor = () => {
    // Force white text for dark background
    return 'text-white';
  };

  // Badge style
  const badgeStyle = cardType === 'primetime' 
    ? 'bg-white text-black' 
    : 'bg-white text-black';

  // Determine image filter based on card type
  const getImageFilter = () => {
    switch(cardType) {
      case 'primetime':
        return 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.3))';
      case 'parlay':
        return 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.5))';
      case 'regular':
      default:
        return 'drop-shadow(0 0 8px rgba(212, 175, 55, 0.3))';
    }
  };

  return (
    <div 
      className="relative min-h-[500px] w-full" 
      style={{ 
        perspective: '1000px',
        transformStyle: 'preserve-3d'
      }}
      onClick={onFlip}
    >
      <div 
        className="relative w-full h-full transition-all duration-700" 
        style={{ 
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* Front of card */}
        <div 
          className="absolute inset-0 w-full h-full" 
          style={{ 
            backfaceVisibility: 'hidden',
            visibility: isFlipped ? 'hidden' : 'visible'
          }}
        >
          <div className="w-full h-full bg-[#111111] shadow-xl rounded-xl border border-[#d4af37]/30 overflow-hidden transition-all duration-300 hover:shadow-[0_0_15px_rgba(212,175,55,0.3)] relative transform hover:-translate-y-1">
            {/* Gold accent at top */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
            
            {/* Badge */}
            <div className="absolute top-4 right-4 bg-[#d4af37] text-black font-bold py-1 px-3 rounded shadow-md text-xs uppercase tracking-wider z-10">
              {badge}
            </div>
            
            {/* Team Logo container with consistent styling */}
            <div className="w-full h-48 bg-gradient-to-b from-[#111111] to-[#222222] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[url('../assets/images/pattern-hex.svg')] bg-repeat"></div>
              <div className="absolute inset-0 opacity-5 bg-pattern-noise"></div>
              <div className="relative w-44 h-44 -mt-2">
                <div className="absolute inset-0 rounded-full bg-[#d4af37]/20 blur-lg"></div>
                <img 
                  src={imageUrl} 
                  alt={title} 
                  className="w-full h-full object-contain relative z-10"
                  style={{
                    filter: 'drop-shadow(0 0 8px rgba(212, 175, 55, 0.5))'
                  }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/logos/default.svg';
                  }}
                />
              </div>
            </div>
            
            {/* Content area */}
            <div className="p-5 text-white bg-gradient-to-b from-[#111111] to-[#222222]">
              <h3 className="text-2xl font-black tracking-tight text-[#d4af37] mb-3">{title}</h3>
              {content}
            </div>
            
            {/* Lock overlay if needed */}
            {isLocked && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-white p-8 z-50">
                <svg className="w-12 h-12 mb-4 text-[#d4af37]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h3 className="text-xl font-bold mb-2 text-center text-[#d4af37]">Premium Content</h3>
                <p className="text-center text-gray-300 mb-4">Upgrade to access all of Gary's premium picks</p>
                <a href="/pricing" className="bg-[#d4af37] text-black font-bold py-2 px-6 rounded-lg transform hover:scale-105 transition-all duration-300 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  Upgrade Now
                </a>
              </div>
            )}
          </div>
        </div>
        
        {/* Back of card */}
        <div 
          className="absolute inset-0 w-full h-full" 
          style={{ 
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            visibility: isFlipped ? 'visible' : 'hidden'
          }}
        >
          {backContent}
        </div>
      </div>
    </div>
  );
};

export default UniformPickCard;
