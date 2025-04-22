import { useEffect, useState, useRef } from "react";
import { useGaryAnalytics } from "../hooks/useGaryAnalytics";
import { supabase } from "../supabaseClient";
// import './BillfoldStyle.css';
import { format } from 'date-fns';
import billfoldLogo from '../assets/images/billfold1.png';
import { bankrollService } from '../services/bankrollService';

export function Billfold() {
  const containerRef = useRef(null);
  const [activeBettingFilter, setActiveBettingFilter] = useState('all');
  
  // Real bankroll data from bankrollService
  const [bankrollStats, setBankrollStats] = useState({
    currentBankroll: 10000,
    startingBankroll: 10000,
    monthlyGoal: 30,
    currentRoi: 0,
    totalBets: 0,
    winRate: 0,
    averageBet: 0,
  });
  
  // Fetch real bankroll data
  useEffect(() => {
    const fetchBankrollData = async () => {
      try {
        const bankrollData = await bankrollService.getBankrollData();
        if (bankrollData) {
          // Calculate various metrics
          const roi = bankrollData.starting_amount > 0 ? 
            ((bankrollData.current_amount - bankrollData.starting_amount) / bankrollData.starting_amount) * 100 : 0;
            
          // Get betting history
          const bettingHistory = await bankrollService.getBettingHistory();
          
          // Calculate win rate and average bet
          const totalBets = bettingHistory.length;
          const wonBets = bettingHistory.filter(bet => bet.status === 'won').length;
          const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;
          const totalWagered = bettingHistory.reduce((sum, bet) => sum + bet.amount, 0);
          const averageBet = totalBets > 0 ? totalWagered / totalBets : 0;
          
          // Update state with real data
          setBankrollStats({
            currentBankroll: Math.round(bankrollData.current_amount),
            startingBankroll: Math.round(bankrollData.starting_amount),
            monthlyGoal: bankrollData.monthly_goal_percent,
            currentRoi: parseFloat(roi.toFixed(1)),
            totalBets,
            winRate: parseFloat(winRate.toFixed(1)),
            averageBet: Math.round(averageBet),
          });
        }
      } catch (error) {
        console.error('Error fetching bankroll data:', error);
      }
    };
    
    fetchBankrollData();
  }, []);

  // Mock data for sport breakdown
  const [sportsBreakdown] = useState([
    {
      name: "NBA",
      icon: "🏀",
      record: "21-11",
      winRate: 65.6,
      roi: 14.7,
    },
    {
      name: "MLB",
      icon: "⚾",
      record: "17-13",
      winRate: 56.7,
      roi: 9.2,
    },
    {
      name: "NFL",
      icon: "🏈",
      record: "8-4",
      winRate: 66.6,
      roi: 18.1,
    },
    {
      name: "NHL",
      icon: "🏒",
      record: "5-2",
      winRate: 71.4,
      roi: 22.3,
    },
  ]);

  // Real betting history from bankrollService
  const [bettingLog, setBettingLog] = useState([]);
  
  // Fetch real betting history
  useEffect(() => {
    const fetchBettingHistory = async () => {
      try {
        const history = await bankrollService.getBettingHistory();
        if (history && Array.isArray(history)) {
          // Format betting history for display
          const formattedHistory = history.map(bet => {
            // Extract data from the bet and associated pick
            const pick = bet.picks || {};
            return {
              date: new Date(bet.placed_date).toISOString().split('T')[0],
              game: pick.game || 'Unknown Game',
              bet: pick.shortPick || pick.pick || 'Unknown Bet',
              odds: bet.odds || 0,
              stake: bet.amount || 0,
              payout: bet.status === 'won' ? bet.potential_payout : 0,
              result: bet.status || 'pending',
              sport: pick.league || 'Unknown',
              betType: pick.parlayCard ? 'parlay' : 
                      (pick.betType?.toLowerCase().includes('spread') ? 'spread' : 
                       pick.betType?.toLowerCase().includes('total') ? 'over-under' : 'moneyline')
            };
          });
          
          setBettingLog(formattedHistory);
        }
      } catch (error) {
        console.error('Error fetching betting history:', error);
        // If error, keep the mock data for display
      }
    };
    
    fetchBettingHistory();
  }, []);
  
  // Default mock data in case real data isn't available yet
  const defaultBettingLog = [
    {
      date: "2025-04-13",
      game: "Celtics vs. Bulls",
      bet: "Bulls -3.5",
      odds: -110,
      stake: 300,
      payout: 570,
      result: "win",
      sport: "NBA",
      betType: "spread"
    },
    {
      date: "2025-04-12",
      game: "Yankees vs. Red Sox",
      bet: "Over 8.5",
      odds: -115,
      stake: 230,
      payout: 0,
      result: "loss",
      sport: "MLB",
      betType: "over-under"
    },
    {
      date: "2025-04-12",
      game: "Chargers vs. Raiders",
      bet: "Chargers ML",
      odds: +135,
      stake: 200,
      payout: 470,
      result: "win",
      sport: "NFL",
      betType: "moneyline"
    },
    {
      date: "2025-04-11",
      game: "3-Leg Parlay",
      bet: "Lakers ML + Astros ML + Rangers ML",
      odds: +550,
      stake: 100,
      payout: 650,
      result: "win",
      sport: "PARLAY",
      betType: "parlay"
    },
    {
      date: "2025-04-10",
      game: "Avalanche vs. Blues",
      bet: "Blues +1.5",
      odds: -135,
      stake: 270,
      payout: 0,
      result: "loss",
      sport: "NHL",
      betType: "spread"
    },
    {
      date: "2025-04-09",
      game: "Warriors vs. Suns",
      bet: "Warriors ML",
      odds: -160,
      stake: 320,
      payout: 520,
      result: "win",
      sport: "NBA",
      betType: "moneyline"
    },
    {
      date: "2025-04-09",
      game: "Braves vs. Mets",
      bet: "Braves -1.5",
      odds: +140,
      stake: 200,
      payout: 480,
      result: "win",
      sport: "MLB",
      betType: "spread"
    },
    {
      date: "2025-04-08",
      game: "Predators vs. Jets",
      bet: "Under 5.5",
      odds: -105,
      stake: 210,
      payout: 0,
      result: "loss",
      sport: "NHL",
      betType: "over-under"
    },
    {
      date: "2025-04-07",
      game: "Eagles vs. Cowboys",
      bet: "Eagles +3.5",
      odds: -110,
      stake: 275,
      payout: 525,
      result: "win",
      sport: "NFL",
      betType: "spread"
    },
    {
      date: "2025-04-06",
      game: "2-Leg Parlay",
      bet: "Nets ML + Under 220.5",
      odds: +325,
      stake: 150,
      payout: 0,
      result: "loss",
      sport: "PARLAY",
      betType: "parlay"
    }
  ]; // Added semicolon here

  // Use real betting data if available, otherwise fall back to default mock data
  const effectiveBettingLog = bettingLog.length > 0 ? bettingLog : defaultBettingLog;
  
  // Filter betting log based on active filter
  const filteredBettingLog = effectiveBettingLog.filter(bet => {
    if (activeBettingFilter === 'all') return true;
    if (activeBettingFilter === 'won') return bet.result === 'won' || bet.result === 'win';
    if (activeBettingFilter === 'lost') return bet.result === 'lost' || bet.result === 'loss';
    if (activeBettingFilter === 'parlay') return bet.betType === 'parlay' || bet.sport === 'PARLAY';
    return true;
  });

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-visible">
      {/* GaryHero-style immersive background */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        {/* Subtle cream/white haze gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#f7f4ed]/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-br from-[#fffbe9]/15 via-transparent to-transparent" />
        {/* Faint cream highlight behind main content */}
        <div className="absolute bottom-24 left-0 w-full h-24 bg-gradient-to-t from-[#f7f4ed]/15 via-transparent to-transparent blur-2xl opacity-60" />
        {/* Gold vignette corners */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#d4af37]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#d4af37]/10 blur-3xl" />
        {/* Subtle grid/noise overlay */}
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-soft-light" />
        {/* Radial vignette for cinematic depth */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#18181b]/80 to-black/95 opacity-95" />
      </div>
      <div className="billfold-container" ref={containerRef}>
        {/* Ambient glow effects */}
        <div className="ambient-glow ambient-glow-1"></div>
        <div className="ambient-glow ambient-glow-2"></div>
        <div className="ambient-glow ambient-glow-3"></div>

        {/* Header with logo and bankroll stats */}
        <header className="billfold-header">
          <div className="header-content">
            {/* Logo on the left */}
            <div className="logo-container">
              <img src={billfoldLogo} alt="Gary's Billfold" className="billfold-logo" />
            </div>
          </div>
          
          {/* Bankroll stats as a floating box */}
          <div className="bankroll-quick-stats">
            <div className="bankroll-glow"></div>
            <div className="bankroll-stats-grid">
              <div className="stat-box">
                <div className="stat-label">Current</div>
                <div className="stat-value money">${new Intl.NumberFormat('en-US').format(bankrollStats.currentBankroll)}</div>
              </div>
              
              <div className="stat-box">
                <div className="stat-label">Starting</div>
                <div className="stat-value money">${new Intl.NumberFormat('en-US').format(bankrollStats.startingBankroll)}</div>
              </div>
              
              <div className="stat-box">
                <div className="stat-label">Goal</div>
                <div className="stat-value percent">+{bankrollStats.monthlyGoal}%</div>
              </div>
              
              <div className="stat-box">
                <div className="stat-label">ROI</div>
                <div className={`stat-value percent ${bankrollStats.currentRoi >= 0 ? 'positive' : 'negative'}`}>
                  {bankrollStats.currentRoi >= 0 ? '+' : ''}{bankrollStats.currentRoi}%
                </div>
              </div>
              
              <div className="stat-box">
                <div className="stat-label">Win Rate</div>
                <div className="stat-value percent">{bankrollStats.winRate}%</div>
              </div>
              
              <div className="stat-box">
                <div className="stat-label">Avg Bet</div>
                <div className="stat-value money">${new Intl.NumberFormat('en-US').format(bankrollStats.averageBet)}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="billfold-main">
          {/* Monthly goal progress */}
          <div className="monthly-goal-container">
            <h2 className="section-title">Monthly Goal Progress</h2>
            <div className="progress-container">
              <div className="progress-labels">
                <span>${new Intl.NumberFormat('en-US').format(bankrollStats.startingBankroll)}</span>
                <span>Goal: ${new Intl.NumberFormat('en-US').format(bankrollStats.startingBankroll * (1 + bankrollStats.monthlyGoal/100))}</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${Math.min(100, (bankrollStats.currentBankroll - bankrollStats.startingBankroll) / (bankrollStats.startingBankroll * bankrollStats.monthlyGoal / 100) * 100)}%`,
                    backgroundColor: bankrollStats.currentRoi >= 0 ? 'var(--gary-green)' : 'var(--gary-red)'
                  }}
                >
                </div>
              </div>
              <div className="progress-amount">
                <span>${new Intl.NumberFormat('en-US').format(bankrollStats.currentBankroll)}</span>
                <span className={bankrollStats.currentRoi >= 0 ? 'positive' : 'negative'}>
                  {bankrollStats.currentRoi >= 0 ? '+' : ''}{bankrollStats.currentRoi}%
                </span>
              </div>
            </div>
          </div>

          {/* Sport-specific stats and betting history */}
          <div className="statistics-betting-container">
            {/* Sport breakdown */}
            <div className="sport-breakdown">
              <h2 className="section-title">Sport Breakdown</h2>
              <div className="sport-stats-grid">
                {sportsBreakdown.map((sport, index) => (
                  <div key={index} className="sport-stat-card">
                    <div className="sport-icon">{sport.icon}</div>
                    <div className="sport-name">{sport.name}</div>
                    <div className="sport-record">{sport.record}</div>
                    <div className="sport-metrics">
                      <div className="metric">
                        <span className="metric-label">Win</span>
                        <span className="metric-value">{sport.winRate}%</span>
                      </div>
                      <div className="metric">
                        <span className="metric-label">ROI</span>
                        <span className={`metric-value ${sport.roi >= 0 ? 'positive' : 'negative'}`}>
                          {sport.roi >= 0 ? '+' : ''}{sport.roi}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Betting history */}
            <div className="betting-history">
              <div className="history-header">
                <h2 className="section-title">Betting History</h2>
                <div className="filter-buttons">
                  <button 
                    className={`filter-btn ${activeBettingFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveBettingFilter('all')}
                  >
                    All
                  </button>
                  <button 
                    className={`filter-btn ${activeBettingFilter === 'won' ? 'active' : ''}`}
                    onClick={() => setActiveBettingFilter('won')}
                  >
                    Won
                  </button>
                  <button 
                    className={`filter-btn ${activeBettingFilter === 'lost' ? 'active' : ''}`}
                    onClick={() => setActiveBettingFilter('lost')}
                  >
                    Lost
                  </button>
                  <button 
                    className={`filter-btn ${activeBettingFilter === 'parlay' ? 'active' : ''}`}
                    onClick={() => setActiveBettingFilter('parlay')}
                  >
                    Parlays
                  </button>
                </div>
              </div>
              
              <div className="bet-list">
                {filteredBettingLog.map((bet, index) => (
                  <div 
                    key={index} 
                    className={`bet-item ${bet.result === 'win' || bet.result === 'won' ? 'win' : bet.result === 'loss' || bet.result === 'lost' ? 'loss' : 'pending'}`}
                  >
                    <div className="bet-date">{bet.date}</div>
                    <div className="bet-game">{bet.game}</div>
                    <div className="bet-pick">{bet.bet}</div>
                    <div className="bet-odds">{bet.odds > 0 ? `+${bet.odds}` : bet.odds}</div>
                    <div className="bet-amount">${bet.stake}</div>
                    <div className="bet-result">
                      {bet.result === 'win' || bet.result === 'won' ? (
                        <span className="result win">+${bet.payout - bet.stake}</span>
                      ) : bet.result === 'loss' || bet.result === 'lost' ? (
                        <span className="result loss">-${bet.stake}</span>
                      ) : (
                        <span className="result pending">Pending</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
