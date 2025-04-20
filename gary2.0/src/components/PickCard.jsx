import React from 'react';
import '../styles/consolidated/gold-card-premium.css';
import FlipCard from './FlipCard';
import '../styles/consolidated/premium-carousel.css';
import '../styles/consolidated/design-system.css';

/**
 * PickCard - Premium Gold Card with Flip
 */
export default function PickCard({ pick }) {
  console.log('[PickCard] received pick:', pick);
  if (!pick) return null;
  // Use the real pick.game field, split on ' @ ' for Away @ Home
  const [awayTeam, homeTeam] = pick.game?.split(' @ ') || [pick.game, ''];

  // Front content (gold card)
  const frontContent = (
    <div className="relative w-72 h-[27rem] rounded-2xl flex flex-col items-center justify-between px-5 py-6 gold-card-premium" style={{
      background: 'linear-gradient(145deg, #FFD700 0%, #B08D57 100%)',
      border: '1px solid #fff8dc33',
      boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
      fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
      color: '#1f1f1f',
      overflow: 'hidden',
      position: 'relative',
      perspective: '1200px',
      transform: 'rotateX(2deg)',
    }}>

      {/* Date/Time Section (now at top) */}
      <div className="flex justify-center items-start w-full mb-2">
        <span className="text-timestamp" style={{fontSize: '0.9rem', color: '#222222', textShadow: '0 1px 2px #fff8dc99'}}>
          {pick.time}
        </span>
      </div>
      {/* League & Bet Type */}
      <div className="flex flex-col items-center w-full mt-1 mb-3">
        <span className="text-league" style={{color: '#6b6b6b', fontSize: '0.75rem', letterSpacing: '0.1em', fontWeight: 700, textTransform: 'uppercase'}}>
          {pick.league}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider mt-1" style={{color: '#fff8dc', letterSpacing: '0.07em', opacity: 0.95}}>
          {pick.betType}
        </span>
      </div>
      {/* Matchup Section */}
      <div className="flex flex-col items-center justify-center w-full flex-1">
        {(() => {
          const [away, home] = pick.game?.split(' @ ') || [pick.game, ''];
          return (
            <>
              <span className="text-matchup" style={{fontSize: '2rem', fontWeight: 800, color: '#fefefe', textShadow: '0 2px 8px #FFD70088, 0 1.5px 0 #fff8dc, 0 0.5px 0 #333'}}>{away}</span>
              <div className="flex flex-row items-center w-full justify-center my-1">
                <span className="flex-1 border-t border-[#fff8dc] opacity-40 mx-2" style={{height: 0}}></span>
                <span className="text-xl font-extrabold uppercase tracking-wider mx-1" style={{color: '#1f1f1f', letterSpacing: '0.12em', textShadow: '0 1px 2px #fff8dc66'}}>
                  VS
                </span>
                <span className="flex-1 border-t border-[#fff8dc] opacity-40 mx-2" style={{height: 0}}></span>
              </div>
              <span className="text-matchup" style={{fontSize: '2rem', fontWeight: 800, color: '#fefefe', textShadow: '0 2px 8px #FFD70088, 0 1.5px 0 #fff8dc, 0 0.5px 0 #333'}}>{home}</span>
            </>
          );
        })()}
      </div>
      {/* VIEW PICK Button (now at bottom) */}
      <div className="flex justify-center w-full mt-4">
        <button className="px-7 py-2 rounded-xl font-extrabold text-base tracking-wide gold-btn-premium shiny-effect" style={{
          background: 'linear-gradient(to bottom, #FFF8DC, #FFD700)',
          color: '#222',
          border: '1px solid #e5c100',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          letterSpacing: '0.09em',
          transition: 'all 0.3s ease-in-out',
        }}>
          VIEW PICK
        </button>
      </div>
    </div>
  );

  // Back content (shortPick, garysBullets, buttons, analysis)
  const backContent = (
    <div className="relative w-72 h-[27rem] rounded-2xl flex flex-col items-center justify-between p-5 gold-card-premium" style={{
      background: 'linear-gradient(145deg, #FFD700 0%, #B08D57 100%)',
      border: '1px solid #fff8dc33',
      boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
      color: '#1f1f1f',
      fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
      overflow: 'hidden',
      position: 'relative',
      perspective: '1200px',
      transform: 'rotateX(2deg)',
    }}>
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        {/* ShortPick Badge */}
        {/* ShortPick as holographic label */}
        <div className="mb-6 flex justify-center w-full">
          <span className="inline-block px-8 py-4 rounded-2xl font-extrabold text-2xl uppercase tracking-widest shortpick-holo gold-glow-main" style={{
            background: 'linear-gradient(90deg, #fff8dc 70%, #ffd700 100%)',
            color: '#b89b2c',
            letterSpacing: '0.18em',
            border: '2.5px solid #fff8dc',
            boxShadow: '0 0 20px #FFD70099, 0 2px 18px #fff8dc55',
            textShadow: '0 2px 8px #FFD70088, 0 1.5px 0 #fff8dc, 0 0.5px 0 #333',
            filter: 'brightness(1.12)',
            textAlign: 'center',
            fontSize: '2.1rem',
            maxWidth: '90%',
            overflowWrap: 'break-word',
          }}>
            {pick.shortPick}
          </span>
        </div>
        {/* Gary's Bullets */}
        {Array.isArray(pick.garysBullets) && pick.garysBullets.length > 0 && (
          <ul className="w-full text-left font-medium list-none mb-4 px-0" style={{color: '#fff', fontSize: '1.05rem'}}>
            {pick.garysBullets.map((bullet, idx) => (
              <li key={idx} className="flex items-start mb-2">
                <span className="inline-block w-3 h-3 mt-1 mr-2 rounded-md" style={{background: '#fff8dc', boxShadow: '0 1px 4px #fff8dc66'}}></span>
                <span className="leading-tight" style={{fontWeight: 500, letterSpacing: '0.01em'}}>{bullet}</span>
              </li>
            ))}
          </ul>
        )}
        {/* Action Buttons */}
        <div className="flex flex-row gap-2 justify-center mb-1 w-full">
          <button className="flex-1 py-2 rounded-full font-bold text-xs tracking-widest focus:outline-none transition-all duration-150" style={{
            background: '#fff8dc',
            color: '#C5B358',
            border: '1.2px solid #fff',
            letterSpacing: '0.09em',
            boxShadow: 'none',
          }}>
            Bet with Gary
          </button>
          <button className="flex-1 py-2 rounded-full font-bold text-xs tracking-widest focus:outline-none transition-all duration-150" style={{
            background: '#fff',
            color: '#C5B358',
            border: '1.2px solid #fff8dc',
            letterSpacing: '0.09em',
            boxShadow: 'none',
          }}>
            Fade the Bear
          </button>
        </div>

      </div>
    </div>
  );

  return (
    <FlipCard className="w-72 h-[27rem]" frontContent={frontContent} backContent={backContent} />
  );
}
