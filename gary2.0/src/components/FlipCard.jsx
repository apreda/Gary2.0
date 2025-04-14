import React, { useState } from 'react';

export function FlipCard({ frontContent, backContent, className = '', initialFlipped = false, flipOnClick = true }) {
  const [isFlipped, setIsFlipped] = useState(initialFlipped);

  const handleFlip = () => {
    if (flipOnClick) {
      setIsFlipped(!isFlipped);
    }
  };

  return (
    <div 
      className={`flip-card-container relative w-full h-full perspective-1000 ${className}`}
      onClick={handleFlip}
    >
      <div 
        className={`flip-card relative w-full h-full transition-all duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
        style={{ 
          transformStyle: 'preserve-3d',
          transition: 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)' 
        }}
      >
        {/* Front side */}
        <div 
          className="flip-card-front absolute w-full h-full backface-hidden shadow-lg rounded-lg overflow-hidden"
          style={{ backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
        >
          {frontContent}
        </div>
        
        {/* Back side */}
        <div 
          className="flip-card-back absolute w-full h-full backface-hidden shadow-xl rounded-lg overflow-hidden rotate-y-180"
          style={{ 
            backfaceVisibility: 'hidden', 
            transform: 'rotateY(180deg)',
            transformStyle: 'preserve-3d' 
          }}
        >
          {backContent}
        </div>
      </div>
      
      {/* Small flip indicator */}
      <div 
        className={`absolute bottom-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/10 
                    transition-opacity duration-300 ${isFlipped ? 'opacity-50' : 'opacity-30'} hover:opacity-80`}
        onClick={(e) => {
          e.stopPropagation();
          setIsFlipped(!isFlipped);
        }}
      >
        <svg 
          className={`w-4 h-4 text-black dark:text-white transition-transform duration-300 ${isFlipped ? 'rotate-180' : ''}`} 
          fill="none" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth="2" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path d="M7 16l-4-4m0 0l4-4m-4 4h18"></path>
        </svg>
      </div>
    </div>
  );
}

export default FlipCard;
