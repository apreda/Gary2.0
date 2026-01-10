import React, { useState, useEffect } from 'react';
import { supabase } from "../supabaseClient";
import { 
  Trophy, 
  ChevronDown, 
  Calendar, 
  RefreshCw, 
  AlertCircle,
  TrendingUp,
  Target,
  Zap,
  User,
  DollarSign
} from 'lucide-react';

const DFSLineups = () => {
  const [loading, setLoading] = useState(true);
  const [generating, setRegenerating] = useState(false);
  const [platform, setPlatform] = useState('draftkings');
  const [sport, setSport] = useState('NBA');
  const [contestType, setContestType] = useState('gpp');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [slates, setSlates] = useState([]);
  const [selectedSlate, setSelectedSlate] = useState(null);
  const [lineup, setLineup] = useState(null);
  const [error, setError] = useState(null);

  // Fetch slates when platform/sport/date changes
  useEffect(() => {
    fetchSlates();
  }, [platform, sport, date]);

  // Fetch lineup when slate or contestType changes
  useEffect(() => {
    if (selectedSlate || slates.length > 0) {
      fetchLineup();
    }
  }, [selectedSlate, contestType, platform, sport, date]);

  const fetchSlates = async () => {
    setLoading(true);
    setError(null);
    try {
      // First, check what lineups exist in Supabase for this date/platform/sport
      const { data: storedLineups, error: dbError } = await supabase
        .from('dfs_lineups')
        .select('slate_name, slate_start_time, slate_game_count')
        .eq('date', date)
        .eq('platform', platform)
        .eq('sport', sport)
        .order('slate_start_time', { ascending: true });
      
      if (!dbError && storedLineups && storedLineups.length > 0) {
        // Build slates from stored lineups
        const availableSlates = storedLineups.map((lineup, idx) => ({
          id: `${platform}-${lineup.slate_name.toLowerCase().replace(/\s+/g, '-')}-${idx}`,
          name: lineup.slate_name,
          startTime: lineup.slate_start_time || 'TBD',
          gameCount: lineup.slate_game_count || 0
        }));
        
        setSlates(availableSlates);
        // Default to first slate (usually Main/All) if none selected
        if (!selectedSlate || !availableSlates.find(s => s.name === selectedSlate.name)) {
          setSelectedSlate(availableSlates[0]);
        }
      } else {
        // Fallback to discovery API if no stored lineups
        const response = await fetch(`/api/generate-dfs-lineups?action=discover&platform=${platform}&sport=${sport}&date=${date}`);
        const data = await response.json();
        if (data.ok && data.slates) {
          setSlates(data.slates);
          if (!selectedSlate && data.slates.length > 0) {
            setSelectedSlate(data.slates[0]);
          }
        } else {
          setSlates([{ id: 'main', name: 'Main Slate', gameCount: 0, startTime: 'TBD' }]);
        }
      }
    } catch (err) {
      console.error("Error fetching slates:", err);
      setSlates([{ id: 'main', name: 'Main Slate', gameCount: 0, startTime: 'TBD' }]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLineup = async () => {
    setLoading(true);
    const slateName = selectedSlate?.name || 'Main Slate';
    try {
      const { data, error } = await supabase
        .from('dfs_lineups')
        .select('*')
        .eq('date', date)
        .eq('platform', platform)
        .eq('sport', sport)
        .eq('slate_name', slateName)
        .eq('contest_type', contestType)
        .maybeSingle();

      if (error) throw error;
      setLineup(data);
    } catch (err) {
      console.error("Error fetching lineup:", err);
      setError("Failed to load lineup");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const token = prompt("Enter Admin Token to generate lineups:");
      if (!token) {
        setRegenerating(false);
        return;
      }

      const slateParams = selectedSlate ? 
        `&slateName=${encodeURIComponent(selectedSlate.name)}&slateTeams=${selectedSlate.teams?.join(',')}&slateGames=${selectedSlate.games?.join(',')}` : '';
      
      const response = await fetch(`/api/generate-dfs-lineups?platform=${platform}&sport=${sport}&date=${date}&contestType=${contestType}${slateParams}&token=${token}`);
      const data = await response.json();
      
      if (data.ok) {
        await fetchLineup();
      } else {
        setError(data.error || "Generation failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white p-6 pt-24">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <Trophy className="text-[#B8953F]" size={36} />
              Gary's <span className="text-[#B8953F]">DFS Lineups</span>
            </h1>
            <p className="text-gray-400 mt-2">Professional GPP & Cash optimization for DraftKings & FanDuel</p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={handleRegenerate}
              disabled={generating}
              className="bg-[#B8953F] hover:bg-[#d4af37] text-black font-bold py-2 px-6 rounded-full flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw size={18} className={generating ? "animate-spin" : ""} />
              {generating ? "Generating..." : "Generate Optimal"}
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="bg-[#1a1a1a] rounded-2xl p-6 mb-8 border border-[#B8953F]/20 grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Platform Toggle */}
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-500 mb-2 block">Platform</label>
            <div className="flex bg-black rounded-lg p-1 border border-white/10">
              {['draftkings', 'fanduel'].map(p => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${platform === p ? 'bg-[#B8953F] text-black' : 'text-gray-400 hover:text-white'}`}
                >
                  {p === 'draftkings' ? 'DraftKings' : 'FanDuel'}
                </button>
              ))}
            </div>
          </div>

          {/* Sport Selection */}
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-500 mb-2 block">Sport</label>
            <select 
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-sm font-medium focus:border-[#B8953F] outline-none"
            >
              <option value="NBA">NBA Basketball</option>
              <option value="NFL">NFL Football</option>
            </select>
          </div>

          {/* Slate Dropdown */}
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-500 mb-2 block">Slate / Games</label>
            <div className="relative">
              <select 
                value={selectedSlate?.id || 'main'}
                onChange={(e) => {
                  const s = slates.find(s => s.id === e.target.value);
                  setSelectedSlate(s || { id: 'main', name: 'Main Slate' });
                }}
                className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-sm font-medium focus:border-[#B8953F] outline-none appearance-none"
              >
                {slates.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.gameCount || s.games?.length || '?'} games) - {s.startTime}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={16} />
            </div>
          </div>

          {/* Contest Type Toggle */}
          <div>
            <label className="text-xs uppercase tracking-widest text-gray-500 mb-2 block">Strategy</label>
            <div className="flex bg-black rounded-lg p-1 border border-white/10">
              {[
                { id: 'gpp', name: 'GPP', icon: <TrendingUp size={14} /> },
                { id: 'cash', name: 'Cash', icon: <Target size={14} /> }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setContestType(t.id)}
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 ${contestType === t.id ? 'bg-[#B8953F] text-black' : 'text-gray-400 hover:text-white'}`}
                >
                  {t.icon}
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lineup Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-96">
            <div className="w-12 h-12 border-4 border-[#B8953F]/20 border-t-[#B8953F] rounded-full animate-spin mb-4"></div>
            <p className="text-gray-400 animate-pulse">Gary is analyzing the slate...</p>
          </div>
        ) : lineup ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: The Lineup */}
            <div className="lg:col-span-2">
              <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-r from-[#B8953F] to-[#d4af37] p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Zap className="text-black" size={24} />
                    <span className="text-black font-black text-xl uppercase tracking-tighter">Optimal {contestType.toUpperCase()} Lineup</span>
                  </div>
                  <div className="text-black text-right">
                    <div className="text-xs font-bold uppercase opacity-70">Total Projection</div>
                    <div className="text-2xl font-black">{lineup.projected_points} pts</div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {lineup.lineup?.map((slot, idx) => (
                    <div key={idx} className="bg-black/40 rounded-xl p-4 border border-white/5 hover:border-[#B8953F]/30 transition-all flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#1a1a1a] rounded-lg flex items-center justify-center font-black text-[#B8953F] border border-white/10">
                          {slot.position}
                        </div>
                        <div>
                          <div className="font-bold text-lg group-hover:text-[#B8953F] transition-colors">{slot.player}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2">
                            <span>{slot.team}</span>
                            <span>•</span>
                            <span className="text-gray-400">${slot.salary?.toLocaleString()}</span>
                            {slot.ownership && (
                              <>
                                <span>•</span>
                                <span className={slot.ownership < 10 ? "text-green-400 font-bold" : "text-gray-400"}>
                                  {slot.ownership}% Own
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[#B8953F] font-black text-xl">{slot.projected_pts?.toFixed(1)}</div>
                        <div className="text-[10px] text-gray-600 uppercase font-bold">Projected</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-black/60 p-4 border-t border-white/5 flex justify-between items-center text-sm">
                  <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <DollarSign size={14} className="text-green-500" />
                      <span className="text-gray-400">Salary:</span>
                      <span className="font-bold">${lineup.total_salary?.toLocaleString()} / ${lineup.salary_cap?.toLocaleString()}</span>
                    </div>
                  </div>
                  {lineup.ceiling_projection && (
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-[#B8953F]" />
                      <span className="text-gray-400">Ceiling:</span>
                      <span className="font-bold text-[#B8953F]">{lineup.ceiling_projection}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Gary's Analysis */}
            <div className="space-y-6">
              <div className="bg-[#1a1a1a] rounded-2xl p-6 border border-[#B8953F]/20 shadow-xl">
                <h3 className="text-[#B8953F] font-bold text-xl mb-4 flex items-center gap-2 uppercase tracking-tighter">
                  <User size={20} /> Gary's Strategy
                </h3>
                <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                  {lineup.gary_notes || "Gary is crunching the narratives for this slate..."}
                </div>
              </div>

              {lineup.stack_info && (
                <div className="bg-[#1a1a1a] rounded-2xl p-6 border border-blue-500/20 shadow-xl">
                  <h3 className="text-blue-400 font-bold text-xl mb-4 flex items-center gap-2 uppercase tracking-tighter">
                    🏈 NFL Stack Details
                  </h3>
                  <div className="space-y-4">
                    {lineup.stack_info.primaryStack && (
                      <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                        <div className="text-xs text-gray-500 uppercase mb-1">Primary Stack ({lineup.stack_info.primaryStack.team})</div>
                        <div className="font-bold text-white">
                          {lineup.stack_info.primaryStack.qb} + {lineup.stack_info.primaryStack.receivers?.join(', ')}
                        </div>
                      </div>
                    )}
                    {lineup.stack_info.bringback && (
                      <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                        <div className="text-xs text-gray-500 uppercase mb-1">Bringback ({lineup.stack_info.bringback.team})</div>
                        <div className="font-bold text-white">{lineup.stack_info.bringback.player}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#1a1a1a] rounded-2xl p-12 text-center border border-white/10">
            <AlertCircle className="text-gray-600 mx-auto mb-4" size={48} />
            <h2 className="text-2xl font-bold text-white mb-2">No Lineup Generated</h2>
            <p className="text-gray-500 mb-6">Gary hasn't generated a lineup for this slate yet.</p>
            <button 
              onClick={handleRegenerate}
              className="bg-[#B8953F] hover:bg-[#d4af37] text-black font-bold py-3 px-8 rounded-full transition-all"
            >
              Build Optimal Lineup Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DFSLineups;

