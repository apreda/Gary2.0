import React from 'react';

export function PickCard({ pick, isFlipped, toggleFlip, isMobile, userDecision, handleDecision, processing, formatPropType, getTeamNickname }) {
  // Default implementations for prop-specific functions
  const defaultFormatPropType = (propType) => {
    if (!propType) return '';
    return propType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };
  
  const defaultGetTeamNickname = (teamName) => {
    if (!teamName) return 'TBD';
    const words = teamName.trim().split(' ');
    return words[words.length - 1];
  };
  
  // Use provided functions or defaults
  const formatProp = formatPropType || defaultFormatPropType;
  const getTeamName = getTeamNickname || defaultGetTeamNickname;
  
  const cardStyle = { width: '100%', maxWidth: isMobile ? '350px' : '634px', height: isMobile ? '200px' : '422px' };
  return (
    <div className="pick-card-container" style={cardStyle}>
      <div className="w-full h-full relative cursor-pointer" style={{ perspective: '1000px' }} onClick={toggleFlip}>
        <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transition: 'transform 0.6s', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
          {/* Front */}
          <div style={{ position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)', borderRadius: isMobile ? '12px' : '16px', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)', color: '#ffffff' }}>
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '1.5rem', textAlign: 'center', height: '100%' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.1, color: '#bfa142', wordBreak: 'break-word', maxHeight: '3rem', overflow: 'hidden', display: '-webkit-box', 'WebkitLineClamp': 2, 'WebkitBoxOrient': 'vertical', marginBottom: '1.25rem' }}>
                  {pick.pick ? pick.pick.replace(/([-+]\d+)$/, '').trim() : 'MISSING PICK'}
                </div>
              </div>
            ) : (
              <div style={{ height: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', height: '40px' }}>
                  <div style={{ width: '30%' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>League</div><div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{pick.league || 'MLB'}</div></div>
                  <div style={{ width: '35%' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Game</div><div style={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.2 }}>{pick.game || 'TBD'}</div></div>
                  <div style={{ width: '30%' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</div><div style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pick.time || 'TBD'}</div></div>
                </div>
                <div style={{ padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.75rem', minHeight: '80px' }}>
                  <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Gary's Pick</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.2, color: '#bfa142', wordWrap: 'break-word', wordBreak: 'break-word' }}>
                    {pick.player ? `${pick.player} to ${formatProp(pick.prop_type)}` : (pick.pick ? pick.pick.replace(/([-+]\d+)$/, '').trim() : 'MISSING PICK')}
                  </div>
                </div>
                {/* Add more desktop front content as in original */}
              </div>
            )}
            {/* Decision buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button onClick={(e) => { e.stopPropagation(); handleDecision('bet', pick); }} disabled={processing || userDecision} style={{ flex: 1, background: userDecision === 'bet' ? 'rgba(191,161,66,0.5)' : 'rgba(191,161,66,0.15)', color: userDecision === 'bet' ? '#ffdf7e' : '#bfa142' }}>
                Bet
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDecision('fade', pick); }} disabled={processing || userDecision} style={{ flex: 1, background: userDecision === 'fade' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', color: userDecision === 'fade' ? '#ffffff' : 'rgba(255,255,255,0.8)' }}>
                Fade
              </button>
            </div>
          </div>
          {/* Back */}
          <div style={{ position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)', borderRadius: isMobile ? '12px' : '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#bfa142' }}>Gary's Analysis</h3>
              <button onClick={toggleFlip} style={{ background: 'rgba(191,161,66,0.15)', color: '#bfa142', padding: '0.3rem 0.6rem', borderRadius: '4px' }}>
                Back
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.9rem', lineHeight: 1.5, color: '#e0e0e0' }}>
              {pick.rationale || 'No analysis available.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 