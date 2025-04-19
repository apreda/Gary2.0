import React, { useState } from 'react';
import '../styles/consolidated/premium-carousel.css';

export function FlipCard({ frontContent, backContent, className = '', initialFlipped = false, flipOnClick = true }) {
  const [isFlipped, setIsFlipped] = useState(initialFlipped);

  const handleFlip = () => {
    if (flipOnClick) {
      setIsFlipped(!isFlipped);
    }
  };

  return (
    <div 
      className={`flip-card-container ${className}`}
      onClick={handleFlip}
    >
      <div 
        className={`flip-card ${isFlipped ? 'rotate-y-180' : ''}`}
      >
        {/* Front side */}
        <div className="flip-card-front">
          {frontContent}
        </div>
        {/* Back side */}
        <div className="flip-card-back">
          {backContent}
        </div>
      </div>
      {/* Small flip indicator */}
      <div 
        className={`flip-indicator${isFlipped ? ' active' : ''}`}
        onClick={e => {
          e.stopPropagation();
          setIsFlipped(!isFlipped);
        }}
      >
        <svg 
          className={`w-4 h-4 ${isFlipped ? 'rotate-180' : ''}`} 
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
