import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useParlay } from "../hooks/useParlay";
import garyLogo from '../assets/images/gary_logo.svg';

export function ParlayOfTheDay() {
  const [parlay, setParlay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [animation, setAnimation] = useState(false);
  const { generateParlay } = useParlay();

  const shouldGenerateNewParlay = (lastParlay) => {
    if (!lastParlay) return true;
    const lastParlayDate = new Date(lastParlay.created_at).setHours(0, 0, 0, 0);
    const today = new Date().setHours(0, 0, 0, 0);
    return lastParlayDate < today;
  };

  const fetchOrGenerateParlay = async () => {
      try {
        // Try to get today's parlay
        const { data: existingParlay, error } = await supabase
          .from("parlays")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

      if (error && error.code !== 'PGRST116') {
        console.error("Error fetching parlay:", error.message);
        return;
      }

      // If no parlay exists or it's from a previous day, generate a new one
      if (shouldGenerateNewParlay(existingParlay)) {
        if (!existingParlay) {
          try {
            const newParlay = await generateParlay();
            if (newParlay) {
              const today = new Date().setHours(0, 0, 0, 0);
              await supabase
                .from('parlays')
                .insert([{ date: today, parlay: newParlay }]);
              setParlay(newParlay);
            } else {
              setError('Failed to generate parlay');
            }
          } catch (error) {
            console.error('Error generating new parlay:', error);
            setError('Failed to generate parlay');
          }
        } else {
          setParlay(existingParlay);
        }
      } else {
        setParlay(existingParlay);
      }
    } catch (error) {
      console.error("Error in parlay flow:", error);
      setError('Failed to fetch or generate parlay');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrGenerateParlay().catch(error => {
      console.error('Error in fetchOrGenerateParlay:', error);
      setError('Unable to fetch picks right now. Please try again later.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (parlay && !animation) {
      setAnimation(true);
    }
  }, [parlay]);

  if (loading) return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white dark:bg-black relative overflow-hidden p-8 rounded-lg border border-[#e0e0e0] dark:border-[#333333] shadow-lg">
        <div className="absolute top-0 left-0 w-full h-full">
          {/* Background Elements */}
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          
          {/* Corners */}
          <div className="absolute top-0 left-0 w-32 h-32 border-r border-b border-dashed border-gray-200"></div>
          <div className="absolute bottom-0 right-0 w-32 h-32 border-l border-t border-dashed border-gray-200"></div>
          
          {/* Dot pattern */}
          <div className="absolute right-0 top-1/3 w-16 h-48 opacity-10" style={{ backgroundImage: 'radial-gradient(#000000 1.5px, transparent 1.5px)', backgroundSize: '12px 12px' }}></div>
          
          {/* Glow effect */}
          <div className="absolute top-0 right-0 bg-gold-400/10 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="absolute bottom-0 left-0 bg-gray-400/10 w-32 h-32 rounded-full blur-3xl -ml-16 -mb-16"></div>
        </div>
        
        <div className="flex flex-col items-center justify-center space-y-4 p-8 relative">
          <div className="relative w-16 h-16">
            <div className="absolute top-0 left-0 right-0 bottom-0 rounded-full border-t-2 border-b-2 border-[#d4af37] animate-spin"></div>
            <div className="absolute top-1 left-1 right-1 bottom-1 rounded-full border-r-2 border-l-2 border-gold-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }}></div>
            <div className="absolute top-2 left-2 right-2 bottom-2 rounded-full border-t-2 border-b-2 border-gray-400 animate-spin" style={{ animationDuration: '1.5s' }}></div>
          </div>
          <p className="text-lg text-[#444444] dark:text-[#c0c0c0] animate-pulse">Loading Today's Parlay...</p>
          <div className="text-sm text-gray-500">Gary's supercomputer is crunching the numbers</div>
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="p-6 bg-white dark:bg-black rounded-lg border border-gray-200 shadow-lg text-center">
        <div className="text-gold-400 text-5xl mb-4">⚠️</div>
        <h3 className="text-xl font-bold text-black dark:text-white mb-2">Temporarily Unavailable</h3>
        <p className="text-gray-700">{error}</p>
      </div>
    </div>
  );

  if (!parlay) return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white dark:bg-black relative overflow-hidden p-8 rounded-lg border border-[#e0e0e0] dark:border-[#333333] shadow-lg">
        <div className="absolute top-0 left-0 w-full h-full">
          {/* Background Elements */}
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          
          {/* Corners */}
          <div className="absolute top-0 left-0 w-32 h-32 border-r border-b border-dashed border-gray-200"></div>
          <div className="absolute bottom-0 right-0 w-32 h-32 border-l border-t border-dashed border-gray-200"></div>
          
          {/* Dot pattern */}
          <div className="absolute right-0 top-1/3 w-16 h-48 opacity-10" style={{ backgroundImage: 'radial-gradient(#000000 1.5px, transparent 1.5px)', backgroundSize: '12px 12px' }}></div>
          
          {/* Glow effect */}
          <div className="absolute top-0 right-0 bg-gold-400/10 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="absolute bottom-0 left-0 bg-gray-400/10 w-32 h-32 rounded-full blur-3xl -ml-16 -mb-16"></div>
        </div>
        
        <div className="relative mx-auto max-w-5xl">
          <div className="text-[#444444] dark:text-[#c0c0c0] mb-6">
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="px-3 py-1 bg-black dark:bg-[#222222] text-[#d4af37] rounded-full text-sm font-medium border border-[#d4af37]">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span className="px-3 py-1 bg-[#f5f5f5] dark:bg-[#222222] text-black dark:text-white rounded-full text-sm font-medium border border-[#c0c0c0] dark:border-[#444444]">{parlay?.legs?.length || 0} Legs</span>
              <span className="px-3 py-1 bg-[#d4af37]/10 text-[#d4af37] rounded-full text-sm font-medium border border-[#d4af37]/30">Potential {parlay?.payout_multiplier || 0}x</span>
            </div>
            Gary's handcrafted parlay based on statistical models, line movement, and five decades of sports betting wisdom.
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className={`space-y-4 transition-all duration-500 ${animation ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="bg-white dark:bg-black relative overflow-hidden p-8 rounded-lg border border-[#e0e0e0] dark:border-[#333333] shadow-lg">
          <div className="absolute top-0 left-0 w-full h-full">
            {/* Background Elements */}
            <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
            
            {/* Corners */}
            <div className="absolute top-0 left-0 w-32 h-32 border-r border-b border-dashed border-gray-200"></div>
            <div className="absolute bottom-0 right-0 w-32 h-32 border-l border-t border-dashed border-gray-200"></div>
            
            {/* Dot pattern */}
            <div className="absolute right-0 top-1/3 w-16 h-48 opacity-10" style={{ backgroundImage: 'radial-gradient(#000000 1.5px, transparent 1.5px)', backgroundSize: '12px 12px' }}></div>
            
            {/* Glow effect */}
            <div className="absolute top-0 right-0 bg-gold-400/10 w-32 h-32 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <div className="absolute bottom-0 left-0 bg-gray-400/10 w-32 h-32 rounded-full blur-3xl -ml-16 -mb-16"></div>
          </div>
          
          <div className="relative mx-auto max-w-5xl">
            {/* Title Section */}
            <div className="text-center mb-6">
              <h2 className="text-3xl md:text-4xl font-black text-black dark:text-white mb-1 relative inline-block">
                <span className="relative z-10">PARLAY OF THE DAY</span>
                <div className="absolute -bottom-2 left-0 w-full h-[3px] bg-[#d4af37]"></div>
              </h2>
              <p className="text-gray-700 max-w-2xl mx-auto">
                Gary's handcrafted parlay based on statistical models, line movement, and five decades of sports betting wisdom.
              </p>
            </div>
            
            {/* Parlay Legs */}
            <div className="space-y-6">
              {parlay?.legs?.map((leg, index) => (
                <div 
                  key={index} 
                  className={`bg-white dark:bg-[#222222] backdrop-blur-sm p-5 rounded-lg border border-gray-200/50 shadow-md transition-all duration-500 transform hover:scale-[1.02] hover:shadow-lg`}
                  style={{ animationDelay: `${index * 0.15}s` }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="font-medium text-lg text-black dark:text-white relative inline-block">
                      <span>{leg.teams}</span>
                      {/* Vintage underline */}
                      <div className="absolute -bottom-1 left-0 w-full h-[2px]" style={{ backgroundImage: 'repeating-linear-gradient(to right, rgba(232, 196, 129, 0.4), rgba(232, 196, 129, 0.4) 3px, transparent 3px, transparent 6px)' }}></div>
                    </div>
                    <div className="mt-1 flex items-center">
                      <div className="text-xs uppercase tracking-wide text-gold-400/80 mr-2">Confidence</div>
                      <div className="bg-gray-400 rounded-full h-5 w-20 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-gold-600 to-gold-400" 
                          style={{ width: `${(leg.confidence/10)*100}%`, transition: 'width 1s' }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {leg.markets?.map((market, mIndex) => (
                      <div key={mIndex} className="text-[#444444] dark:text-[#c0c0c0] flex flex-wrap items-center">
                        <span className="font-medium text-black dark:text-white mr-2 w-20">{market.key}:</span>{' '}
                        {market.outcomes?.map((o, oIndex) => (
                          <span key={oIndex} className="bg-[#f5f5f5] dark:bg-[#222222] border border-[#e0e0e0] dark:border-[#333333] px-3 py-1 rounded-full text-sm mr-2 mb-1 inline-flex items-center">
                            {o.name} <span className="font-bold ml-1 text-black dark:text-[#d4af37]">{o.point ? o.point : o.price}</span>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Parlay Details */}
            {parlay?.payout_multiplier && (
              <div className="bg-black dark:bg-[#222222] p-5 rounded-lg mb-6 shadow-lg border border-[#d4af37]/50 transform transition-all hover:scale-[1.01] relative overflow-hidden">
                {/* Corner elements */}
                <div className="absolute top-0 left-0 w-16 h-16 border-r border-b border-dashed border-white/10"></div>
                <div className="absolute bottom-0 right-0 w-16 h-16 border-l border-t border-dashed border-white/10"></div>
                
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-md uppercase tracking-wide text-[#d4af37] font-mono">Total Odds</div>
                    <div className="text-2xl font-bold text-white relative inline-block">
                      {parlay.payout_multiplier}x
                      <div className="absolute -bottom-1 left-0 w-full h-[2px] bg-[#d4af37]/50"></div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-md uppercase tracking-wide text-[#d4af37] font-mono">$100 Pays</div>
                    <div className="text-2xl font-bold text-white relative inline-block">
                      ${(parlay.payout_multiplier * 100).toFixed(2)}
                      <div className="absolute -bottom-1 left-0 w-full h-[2px] bg-[#d4af37]/50"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Gary's Analysis */}
            {parlay?.notes && (
              <div className="border-t border-[#e0e0e0] dark:border-[#333333] pt-5 mt-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-black border border-[#d4af37] flex items-center justify-center shadow-md overflow-hidden">
                    <img src={garyLogo} alt="Gary" className="h-8 w-8 object-contain" />
                  </div>
                  <div className="font-medium text-lg text-black dark:text-white relative inline-block">
                    <span>Gary's Take:</span>
                    <div className="absolute -bottom-1 left-0 w-full h-[2px] bg-[#d4af37]/50"></div>
                  </div>
                </div>
                <div className="bg-[#f5f5f5] dark:bg-[#222222] p-5 rounded-lg border-l-4 border-[#d4af37] text-[#444444] dark:text-white italic leading-relaxed">
                  {parlay.notes}
                  <div className="mt-4 pt-4 border-t border-[#e0e0e0] dark:border-[#333333] flex justify-between items-center">
                    <div className="text-xs text-[#444444] dark:text-[#c0c0c0]">{new Date().toLocaleString()}</div>
                    <div className="text-xs px-2 py-1 rounded-full bg-[#d4af37]/20 text-[#d4af37] font-medium">AI-Generated Analysis</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}