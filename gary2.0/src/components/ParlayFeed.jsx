import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export function ParlayFeed() {
  const [parlays, setParlays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchParlays = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("parlays")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching parlays:", error.message);
      } else {
        setParlays(data);
      }
      setLoading(false);
    };

    fetchParlays();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h2 className="text-3xl font-bold text-center text-black dark:text-white mb-2 relative inline-block">
        <span>Gary's Parlay Archive</span>
        <div className="absolute -bottom-2 left-0 w-full h-[3px] bg-[#d4af37]"></div>
      </h2>
      <p className="text-[#444444] dark:text-[#c0c0c0] mb-8 mt-6 text-center">
        Historical record of Gary's daily parlays and their outcomes
      </p>

      {loading ? (
        <div className="flex justify-center items-center h-32">
          <div className="relative w-12 h-12">
            <div className="absolute top-0 left-0 right-0 bottom-0 rounded-full border-t-2 border-b-2 border-[#d4af37] animate-spin"></div>
            <div className="absolute top-1 left-1 right-1 bottom-1 rounded-full border-r-2 border-l-2 border-[#c0c0c0] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }}></div>
          </div>
        </div>
      ) : parlays.length === 0 ? (
        <div className="text-center py-8 px-4 bg-[#f5f5f5] dark:bg-[#222222] rounded-lg border border-[#e0e0e0] dark:border-[#333333]">
          <p className="text-[#444444] dark:text-[#c0c0c0]">No parlays posted yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {parlays.map((parlay) => (
            <div
              key={parlay.id}
              className="bg-white dark:bg-[#222222] border border-[#e0e0e0] dark:border-[#333333] shadow-lg rounded-lg p-6 hover:shadow-[#d4af37]/20 transition duration-300 relative overflow-hidden"
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold text-black dark:text-white">
                  {parlay.title || 'Daily Parlay'}
                </h3>
                <span className="text-sm px-3 py-1 bg-[#f5f5f5] dark:bg-black text-[#444444] dark:text-[#c0c0c0] rounded-full border border-[#e0e0e0] dark:border-[#333333]">
                  {new Date(parlay.created_at).toLocaleDateString()}
                </span>
              </div>
              
              {parlay.payout_multiplier && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-medium text-[#444444] dark:text-[#c0c0c0]">Odds:</span>
                  <span className="text-sm font-bold text-[#d4af37]">{parlay.payout_multiplier}x</span>
                  <span className="mx-2 text-[#e0e0e0] dark:text-[#444444]">|</span>
                  <span className="text-sm font-medium text-[#444444] dark:text-[#c0c0c0]">$100 pays:</span>
                  <span className="text-sm font-bold text-[#d4af37]">${(parlay.payout_multiplier * 100).toFixed(2)}</span>
                </div>
              )}

              <div className="bg-[#f5f5f5] dark:bg-black rounded-lg p-4 border border-[#e0e0e0] dark:border-[#333333] mb-3">
                <h4 className="font-medium text-black dark:text-white mb-2 text-sm uppercase tracking-wide">Legs:</h4>
                <ul className="list-none space-y-2">
                  {Array.isArray(parlay.legs)
                    ? parlay.legs.map((leg, i) => (
                        <li key={i} className="pl-1 pb-2 border-b border-[#e0e0e0] dark:border-[#333333] last:border-0 last:pb-0 text-[#444444] dark:text-[#c0c0c0] flex items-start">
                          <span className="text-[#d4af37] mr-2 font-bold">{i+1}.</span> {leg}
                        </li>
                      ))
                    : typeof parlay.legs === 'string' ? parlay.legs.split("/").map((leg, i) => (
                        <li key={i} className="pl-1 pb-2 border-b border-[#e0e0e0] dark:border-[#333333] last:border-0 last:pb-0 text-[#444444] dark:text-[#c0c0c0] flex items-start">
                          <span className="text-[#d4af37] mr-2 font-bold">{i+1}.</span> {leg.trim()}
                        </li>
                      )) : (
                        <li className="text-[#444444] dark:text-[#c0c0c0]">No parlay legs found</li>
                      )}
                </ul>
              </div>

              {parlay.gary_notes && (
                <div className="mt-4 pt-4 border-t border-[#e0e0e0] dark:border-[#333333]">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center text-[#d4af37] text-xs font-bold">G</div>
                    <span className="text-sm font-medium text-black dark:text-white">Gary's Take:</span>
                  </div>
                  <p className="italic text-[#444444] dark:text-[#c0c0c0] bg-[#f5f5f5] dark:bg-black p-3 rounded-lg border-l-2 border-[#d4af37]">
                    {parlay.gary_notes}
                  </p>
                </div>
              )}
              
              {/* Add outcome if available */}
              {parlay.outcome && (
                <div className="mt-3 flex justify-end">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${parlay.outcome === 'win' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                    {parlay.outcome === 'win' ? 'Winner' : 'Lost'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
