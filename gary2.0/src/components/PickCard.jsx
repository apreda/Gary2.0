import React from 'react';

export function PickCard(props) {
  const { pick, isFlipped, toggleFlip, isMobile, userDecision, handleDecision, processing, formatPropType, getTeamNickname } = props;
  const cardStyle = { width: '100%', maxWidth: isMobile ? '350px' : '634px', height: isMobile ? '200px' : '422px' };
  return (
    <div className="pick-card-container" style={cardStyle}>
      {/* full card JSX without types */}
    </div>
  );
} 