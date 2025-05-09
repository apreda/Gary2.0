/* eslint-disable import/no-unresolved */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUserPlan } from '../contexts/UserPlanContext';
import BG2 from '/BG2.png'; // Background image for page
import { useToast } from '../components/ui/ToastProvider';
import { useAuth } from '../contexts/AuthContext';
import GaryEmblem from '../assets/images/Garyemblem.png';
import { propPicksService } from '../services/propPicksService';
// Supabase imported for future use
/* eslint-disable-next-line no-unused-vars */
import { supabase } from '../supabaseClient';

export default function GaryProps() {
  const showToast = useToast();
  const { user } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const { userPlan, planLoading, subscriptionStatus } = useUserPlan();
  const navigate = useNavigate();

  // State for prop picks and UI state
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flippedCards, setFlippedCards] = useState({});

  useEffect(() => {
    if (user) console.log('GaryProps: User subscription status:', subscriptionStatus);
  }, [user, subscriptionStatus]);

  useEffect(() => {
    if (!planLoading) loadPicks();
  }, [planLoading, subscriptionStatus, reloadKey]);

  const loadPicks = async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      console.log(`Looking for prop picks for date ${today}`);
      const data = await propPicksService.getTodayPropPicks();
      let processedPicks = [];

      if (Array.isArray(data) && data.length > 0) {
        data.forEach(record => {
          if (Array.isArray(record.picks)) {
            const picksWithIds = record.picks.map((pick, idx) => ({
              ...pick,
              id: `${record.id}-${idx}`,
              date: record.date,
              created_at: record.created_at
            }));
            processedPicks.push(...picksWithIds);
          }
        });
      } else {
        showToast('Generating new prop picks... This may take a moment.', 'info');
        const newPicks = await propPicksService.generateDailyPropPicks();
        if (Array.isArray(newPicks) && newPicks.length > 0) {
          await propPicksService.storePropPicksInDatabase(newPicks);
          const freshData = await propPicksService.getTodayPropPicks();
          freshData.forEach(record => {
            if (Array.isArray(record.picks)) {
              const picksWithIds = record.picks.map((pick, idx) => ({
                ...pick,
                id: `${record.id}-${idx}`,
                date: record.date,
                created_at: record.created_at
              }));
              processedPicks.push(...picksWithIds);
            }
          });
          showToast(`Generated ${processedPicks.length} new prop picks!`, 'success');
        } else {
          showToast('No prop picks available for today', 'warning');
        }
      }

      setPicks(processedPicks);
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = { width: '320px', height: '480px', margin: '0 auto 2rem', position: 'relative' };
  const toggleCardFlip = (id, e) => {
    e?.stopPropagation();
    setFlippedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 z-0" style={{ backgroundImage: `url(${BG2})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.3, filter: 'blur(1px)' }} />

      <div className="mx-auto px-4 py-12 max-w-screen-xl relative z-10">
        {loading ? (
          <div className="flex justify-center items-center min-h-[50vh]"><div className="animate-pulse text-gray-200 text-xl">Loading prop picks...</div></div>
        ) : error ? (
          <div className="flex justify-center items-center min-h-[50vh]"><div className="text-red-500 text-xl">{error}</div></div>
        ) : (
          <>
            {!planLoading && subscriptionStatus !== 'active' ? (
              <div className="flex justify-center items-center min-h-[50vh]">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 max-w-2xl w-full mx-auto text-center" style={{ boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)', background: 'linear-gradient(145deg, rgba(30,30,35,0.9) 0%, rgba(18,18,22,0.95) 100%)', borderTop: '3px solid #b8953f' }}>
                  <img src={GaryEmblem} alt="Gary AI Logo" className="mx-auto mb-6" style={{ height: '80px', opacity: 0.9 }} />
                  <h2 className="text-2xl font-bold mb-2" style={{ color: '#b8953f' }}>Unlock Player Props Access</h2>
                  <p className="text-gray-300 mb-6 text-lg">Upgrade to Pro for exclusive player prop picks with higher odds and bigger potential payouts.</p>
                  <ul className="mb-8 text-left mx-auto inline-block">
                    <li className="flex items-center mb-3"><span className="text-b8953f mr-2">✓</span><span className="text-gray-200">High-value player props (+130 to +400 odds)</span></li>
                    <li className="flex items-center mb-3"><span className="text-b8953f mr-2">✓</span><span className="text-gray-200">Detailed player analysis and research</span></li>
                    <li className="flex items-center mb-3"><span className="text-b8953f mr-2">✓</span><span className="text-gray-200">Updated daily with fresh opportunities</span></li>
                  </ul>
                  <Link to="/pricing" className="inline-block py-3 px-8 rounded-md text-white font-medium" style={{ background: 'linear-gradient(90deg, #b8953f 0%, #d4af37 100%)', boxShadow: '0 4px 12px rgba(184,149,63,0.5)' }}>Upgrade to Pro</Link>
                </div>
              </div>
            ) : picks.length === 0 ? null : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 px-2">
                {picks.map(pick => {
                  const flipped = !!flippedCards[pick.id];
                  return (
                    <div key={pick.id} className="pick-card-container" style={cardStyle}>
                      <div onClick={e => toggleCardFlip(pick.id, e)} style={{ perspective: '1000px', width: '100%', height: '100%' }}>
                        <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transition: 'transform 0.6s', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)' }}>
                          {/* Front */}
                          <div style={{ position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden', background: 'linear-gradient(135deg, rgba(22,22,28,0.97) 0%, rgba(28,28,32,0.95) 100%)', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(191,161,66,0.25)', color: '#fff', padding: '1.25rem', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, rgba(191,161,66,0.5) 0%, rgba(212,175,55,0.95) 50%, rgba(191,161,66,0.5) 100%)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                              <div style={{ width: '30%' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>League</div><div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{pick.league || 'NBA'}</div></div>
                              <div style={{ width: '65%', position: 'relative' }}><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matchup</div><div style={{ fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.2 }}>{pick.matchup || 'TBD'}</div><img src="/coin2.png" alt="Gary Coin" style={{ position: 'absolute', top: 0, right: '-18px', width: '49px', height: '49px', zIndex: 2, filter: 'drop-shadow(0 2px 4px #bfa14277)' }} /></div>
                            </div>
                            <div style={{ padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', margin: '0.25rem 0 0.75rem' }}>
                              <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gary's Pick</div>
                              <div style={{ fontSize: '1.2rem', fontWeight: 700, lineHeight: 1.1, color: '#bfa142'}}>{pick.pick}</div>
                            </div>
                            <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}><div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', color: '#bfa142', fontWeight: 500 }}>Analysis</div><div style={{ fontSize: '0.85rem', lineHeight: 1.4, maxHeight: '140px', overflow: 'auto', opacity: 0.9 }}>{pick.rationale || 'Analysis not available at this time.'}</div></div>
                            <div><div style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Pick Details</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                              <div style={{ padding: '0.5rem', borderRadius: '6px', background: 'linear-gradient(145deg, rgba(33,30,22,0.95) 0%, rgba(25,23,17,0.9) 100%)', border: '1px solid rgba(191,161,66,0.5)' }}><p style={{ fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600 }}>True Prob</p><p style={{ fontSize: '0.9rem', fontWeight: 700 }}>{pick.true_probability ? `${Math.round(pick.true_probability * 100)}%` : 'N/A'}</p></div>
                              <div style={{ padding: '0.5rem', borderRadius: '6px', background: 'linear-gradient(145deg, rgba(33,30,22,0.95) 0%, rgba(25,23,17,0.9) 100%)', border: '1px solid rgba(191,161,66,0.5)' }}><p style={{ fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600 }}>Implied Prob</p><p style={{ fontSize: '0.9rem', fontWeight: 700 }}>{pick.implied_probability ? `${Math.round(pick.implied_probability * 100)}%` : 'N/A'}</p></div>
                              <div style={{ padding: '0.5rem', borderRadius: '6px', background: 'linear-gradient(145deg, rgba(33,30,22,0.95) 0%, rgba(25,23,17,0.9) 100%)', border: '1px solid rgba(191,161,66,0.5)' }}><p style={{ fontSize: '0.65rem', marginBottom: '0.25rem', fontWeight: 600 }}>EV</p><p style={{ fontSize: '0.9rem', fontWeight: 700 }}>{pick.ev ? `+${Math.round(pick.ev * 100)}%` : 'N/A'}</p></div>
                            </div></div>
                          </div>
                          {/* Back of card removed as requested */}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}