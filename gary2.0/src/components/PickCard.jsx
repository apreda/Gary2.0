import React from 'react';
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
    <div className="relative w-96 h-[27rem] bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-3xl shadow-2xl border-4 border-black flex flex-col items-center justify-between p-8 gold-card-static">
      {/* VIEW PICK Button */}
      <button className="absolute left-1/2 -translate-x-1/2 -top-7 px-8 py-2 rounded-xl shadow-lg bg-yellow-200 text-black font-bold text-lg border border-black tracking-wide z-10 gold-card-btn">
        VIEW PICK
      </button>
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="text-center mt-8">
          <p className="text-lg font-semibold tracking-wide mb-1">{pick.league}</p>
          <p className="text-base font-medium tracking-wider mb-4">{pick.betType}</p>
          <h1 className="text-5xl font-extrabold text-yellow-900 drop-shadow-gold mb-2 uppercase">{homeTeam}</h1>
          <div className="w-16 h-1 mx-auto bg-gradient-to-r from-yellow-700 to-yellow-400 my-2 rounded-full" />
          <span className="text-2xl font-bold text-black tracking-widest">VS</span>
          <div className="w-16 h-1 mx-auto bg-gradient-to-r from-yellow-400 to-yellow-700 my-2 rounded-full" />
          <h1 className="text-5xl font-extrabold text-yellow-900 drop-shadow-gold mb-2 uppercase">{awayTeam}</h1>
          <p className="text-lg font-bold text-black mt-8 tracking-wider">{pick.time}</p>
        </div>
      </div>
    </div>
  );

  // Back content (analysis/stats/placeholder)
  const backContent = (
    <div className="relative w-96 h-[27rem] bg-gradient-to-br from-yellow-300 to-yellow-700 rounded-3xl shadow-2xl border-4 border-black flex flex-col items-center justify-center p-8 gold-card-static">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-yellow-900 mb-4">Analysis</h2>
        <p className="text-lg text-black font-semibold mb-2">{pick.analysis || 'No analysis available for this pick.'}</p>
        {/* Add more stats or info here if available */}
      </div>
    </div>
  );

  return (
    <FlipCard className="w-96 h-[27rem]" frontContent={frontContent} backContent={backContent} />
  );
}
