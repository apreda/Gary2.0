import React, { useState } from 'react';

export function FlipCard({ frontContent, backContent, className = '', initialFlipped = false, flipOnClick = true, isFlipped: controlledFlipped, setIsFlipped: setControlledFlipped }) {
  const [internalFlipped, setInternalFlipped] = useState(initialFlipped);
  const isControlled = typeof controlledFlipped === 'boolean' && typeof setControlledFlipped === 'function';
  const isFlipped = isControlled ? controlledFlipped : internalFlipped;
  const setIsFlipped = isControlled ? setControlledFlipped : setInternalFlipped;

  const handleFlip = () => {
    if (flipOnClick) {
      setIsFlipped(f => !f);
    }
  };

  return (
    <div 
      className={`${className}`}
      style={{
        perspective: '1000px',
        width: '100%',
        height: '100%'
      }}
      onClick={e => {
        // Prevent flipping if the click originated from a button or interactive element
        if (
          e.target.closest('button, a, input, [tabindex], .no-flip')
        ) return;
        handleFlip();
      }}
    >
      <div 
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          textAlign: 'center',
          transition: 'transform 0.6s',
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* Front side */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          {frontContent}
        </div>
        {/* Back side */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          transform: 'rotateY(180deg)'
        }}>
          {backContent}
        </div>
      </div>
      {/* Small flip indicator */}
      <div 
        style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          zIndex: 10,
          cursor: 'pointer',
          backgroundColor: 'rgba(0,0,0,0.5)',
          color: 'white',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={e => {
          e.stopPropagation();
          setIsFlipped(!isFlipped);
        }}
      >
        <svg 
          style={{
            width: '16px',
            height: '16px',
            transform: isFlipped ? 'rotate(180deg)' : 'rotate(0deg)'
          }}
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
