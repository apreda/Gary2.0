import React from 'react';
import GaryEmblem from '../assets/images/Garyemblem.png';

export default function PickCardPreview() {
  // Simplified pick card with mock data for hero banner preview
  const colors = {
    primary: '#bfa142',   // Gold
    secondary: '#fffbe6', // Light cream
    accent: '#8b0000',    // Deep red
    border: '#bfa142',    // Gold border
    text: '#222222',      // Dark text
    fade: '#333333',      // Fade button color
  };

  const mockPick = {
    pick: "Lakers -4.5 (-110)",
    type: "Spread",
    homeTeam: "Los Angeles Lakers",
    awayTeam: "Golden State Warriors",
    game: "Lakers vs Warriors",
    confidence: "High (90%)",
    sport: "NBA",
    league: "NBA",
    date: new Date().toLocaleDateString(),
    time: "7:30 PM ET",
  };

  return (
    <div className="pick-card-preview" style={{
      width: '17rem',
      height: '26rem',
      position: 'relative',
      borderRadius: '1rem',
      overflow: 'hidden',
      background: colors.secondary,
      border: `6px solid ${colors.primary}`,
      boxShadow: '0 0 36px 8px rgba(191,161,66,0.28), inset 0 0 15px rgba(191,161,66,0.12)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Card Header */}
      <div style={{ 
        backgroundColor: colors.primary, 
        padding: '0.6rem 1rem',
        color: colors.text,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        fontSize: '0.85rem',
        letterSpacing: '0.05em',
        textAlign: 'center',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>TODAY'S PICK</span>
        <span>{mockPick.date}</span>
      </div>
      
      {/* Card Content */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        padding: '1rem',
        flex: 1,
      }}>
        {/* Center Emblem */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0.5rem 0',
        }}>
          <img 
            src={GaryEmblem} 
            alt="Gary AI Logo" 
            style={{ 
              height: '3.5rem', 
              width: 'auto',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
            }} 
          />
        </div>
        
        {/* Game Info */}
        <div style={{
          backgroundColor: 'rgba(0,0,0,0.05)',
          borderRadius: '0.5rem',
          padding: '0.8rem',
          width: '100%',
          marginTop: '0.5rem',
          textAlign: 'center',
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: colors.text }}>
            {mockPick.awayTeam} @ {mockPick.homeTeam}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'rgba(0,0,0,0.7)' }}>
            {mockPick.time} • {mockPick.league}
          </div>
        </div>
        
        {/* The Pick */}
        <div style={{
          marginTop: '1.5rem',
          textAlign: 'center',
          width: '100%',
        }}>
          <div style={{ 
            fontSize: '0.8rem', 
            textTransform: 'uppercase', 
            color: 'rgba(0,0,0,0.6)',
            letterSpacing: '0.05em',
            marginBottom: '0.4rem',
          }}>
            Gary's Official Pick
          </div>
          <div style={{ 
            fontSize: '1.6rem',
            fontWeight: 'bold',
            color: colors.accent,
            textShadow: '0 1px 2px rgba(0,0,0,0.1)',
            letterSpacing: '0.02em',
          }}>
            {mockPick.pick}
          </div>
          <div style={{ 
            marginTop: '0.5rem',
            fontSize: '0.9rem',
            fontWeight: 'semibold',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.3rem',
          }}>
            <span>Confidence:</span>
            <span style={{ color: colors.accent, fontWeight: 'bold' }}>{mockPick.confidence}</span>
          </div>
        </div>
        
        {/* CTA Button */}
        <div style={{
          marginTop: 'auto',
          width: '100%',
          padding: '0.5rem',
        }}>
          <button
            style={{
              width: '100%',
              padding: '0.8rem',
              backgroundColor: colors.primary,
              color: colors.text,
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 'bold',
              fontSize: '1rem',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            GET TODAY'S PICKS
          </button>
        </div>
      </div>
      
      {/* Vintage Texture Overlay */}
      <div className="vintage-overlay absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: 'url(/noise.svg)',
          mixBlendMode: 'overlay',
          zIndex: 2,
        }}
      />
    </div>
  );
}
