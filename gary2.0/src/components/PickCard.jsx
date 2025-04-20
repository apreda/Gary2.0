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
          <h1 className="text-2xl font-extrabold text-yellow-900 drop-shadow-gold mb-2">{pick.game}</h1>
          <p className="text-lg font-bold text-black mt-8 tracking-wider">{pick.time}</p>
        </div>
      </div>
    </div>
  );

  // Back content (shortPick, garysBullets, buttons, analysis)
  const backContent = (
    <div className="relative w-96 h-[27rem] bg-gradient-to-br from-yellow-300 to-yellow-700 rounded-3xl shadow-2xl border-4 border-black flex flex-col items-center justify-between p-8 gold-card-static">
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="text-center mt-6 mb-4">
          <div className="text-3xl font-extrabold text-yellow-900 mb-2">{pick.shortPick}</div>
          {Array.isArray(pick.garysBullets) && pick.garysBullets.length > 0 && (
            <ul className="text-left text-black font-medium list-disc list-inside mb-4">
              {pick.garysBullets.map((bullet, idx) => (
                <li key={idx}>{bullet}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-row gap-4 justify-center mb-4">
          <button className="px-6 py-2 rounded-xl shadow-lg bg-green-500 hover:bg-green-600 text-white font-bold text-lg border border-black tracking-wide">Bet with Gary</button>
          <button className="px-6 py-2 rounded-xl shadow-lg bg-red-500 hover:bg-red-600 text-white font-bold text-lg border border-black tracking-wide">Fade the Bear</button>
        </div>
        <div className="text-center mt-2">
          <h2 className="text-xl font-bold text-yellow-900 mb-2">Analysis</h2>
          <p className="text-base text-black font-semibold mb-2">{pick.analysis || 'No analysis available for this pick.'}</p>
        </div>
      </div>
    </div>
  );

  return (
    <FlipCard className="w-96 h-[27rem]" frontContent={frontContent} backContent={backContent} />
  );
}
