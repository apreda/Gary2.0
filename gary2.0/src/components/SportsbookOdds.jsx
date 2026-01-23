import React, { useState } from 'react';

/**
 * SportsbookOdds Component
 * Expandable panel showing odds comparison across sportsbooks
 * Shows ML and Spread only (no over/unders)
 */
export function SportsbookOdds({ oddsData, pickTeam, betType, isMobile }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!oddsData || !Array.isArray(oddsData) || oddsData.length === 0) {
    return null;
  }

  const toggleExpand = (e) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  // Find best odds
  const bestSpread = oddsData.reduce((best, curr) => {
    const currOdds = parseInt(curr.spread_odds?.replace('+', '')) || -999;
    const bestOdds = parseInt(best?.spread_odds?.replace('+', '')) || -999;
    return currOdds > bestOdds ? curr : best;
  }, oddsData[0]);

  const bestMl = oddsData.reduce((best, curr) => {
    const currOdds = parseInt(curr.ml?.replace('+', '')) || -999;
    const bestOdds = parseInt(best?.ml?.replace('+', '')) || -999;
    return currOdds > bestOdds ? curr : best;
  }, oddsData[0]);

  const containerStyle = {
    marginTop: '0.5rem',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    paddingTop: '0.5rem'
  };

  const buttonStyle = {
    background: 'transparent',
    border: 'none',
    color: '#bfa142',
    fontSize: isMobile ? '0.7rem' : '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '0.25rem 0',
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    textDecoration: 'underline',
    textUnderlineOffset: '2px'
  };

  const expandedStyle = {
    maxHeight: isExpanded ? '300px' : '0',
    overflow: 'hidden',
    transition: 'max-height 0.3s ease-in-out',
    marginTop: isExpanded ? '0.5rem' : '0'
  };

  const tableStyle = {
    width: '100%',
    fontSize: isMobile ? '0.65rem' : '0.7rem',
    borderCollapse: 'collapse'
  };

  const thStyle = {
    textAlign: 'left',
    padding: '0.35rem 0.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.6)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em'
  };

  const tdStyle = {
    padding: '0.35rem 0.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    color: '#e0e0e0'
  };

  const bestStyle = {
    ...tdStyle,
    color: '#4ade80',
    fontWeight: 700
  };

  return (
    <div style={containerStyle} onClick={(e) => e.stopPropagation()}>
      <button style={buttonStyle} onClick={toggleExpand}>
        <span>{isExpanded ? 'Hide' : 'View'} Sportsbook Odds</span>
        <span style={{
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
          display: 'inline-block'
        }}>
          &#9660;
        </span>
      </button>

      <div style={expandedStyle}>
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '8px',
          padding: '0.5rem',
          maxHeight: '250px',
          overflowY: 'auto'
        }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Sportsbook</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Spread</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>ML</th>
              </tr>
            </thead>
            <tbody>
              {oddsData.map((odds, idx) => {
                const isBestSpread = odds.book === bestSpread?.book;
                const isBestMl = odds.book === bestMl?.book;

                return (
                  <tr key={idx}>
                    <td style={tdStyle}>
                      {odds.book}
                    </td>
                    <td style={{
                      ...tdStyle,
                      textAlign: 'center',
                      ...(isBestSpread ? { color: '#4ade80', fontWeight: 700 } : {})
                    }}>
                      {odds.spread ? `${odds.spread} (${odds.spread_odds})` : '-'}
                    </td>
                    <td style={{
                      ...tdStyle,
                      textAlign: 'center',
                      ...(isBestMl ? { color: '#4ade80', fontWeight: 700 } : {})
                    }}>
                      {odds.ml || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{
            marginTop: '0.5rem',
            fontSize: isMobile ? '0.6rem' : '0.65rem',
            color: 'rgba(255,255,255,0.5)',
            textAlign: 'center'
          }}>
            Best odds highlighted in green
          </div>
        </div>
      </div>
    </div>
  );
}

export default SportsbookOdds;
