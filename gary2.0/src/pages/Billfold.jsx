import { useEffect, useState, useRef } from "react";
import { useGaryAnalytics } from "../hooks/useGaryAnalytics";
import { supabase } from "../supabaseClient";
import './BillfoldStyle.css';
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
  ]);

  // Filter betting log based on active filter

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
                <div className="stat-label">Win Rate</div>
                <div className="stat-value percentage">{bankrollStats.winRate}%</div>
              </div>
              
              <div className="stat-box">
                <div className="stat-label">Total Bets</div>
                <div className="stat-value">{bankrollStats.totalBets}</div>
              </div>
              
              <div className="stat-box">
                <div className="stat-label">Monthly Goal</div>
                <div className="stat-value percentage">{bankrollStats.monthlyGoal}%</div>
              </div>
              
              <div className="stat-box">
                <div className="stat-label">Avg Bet</div>
                <div className="stat-value money">${new Intl.NumberFormat('en-US').format(bankrollStats.averageBet)}</div>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main content area */}
      <div className="billfold-content">
        {/* Sport-by-sport breakdown */}
        <section className="sport-breakdown">
          <div className="sport-cards">
            {sportsBreakdown.map((sport) => (
              <div className="sport-card" key={sport.name}>
                <div className="sport-icon">{sport.icon}</div>
                <div className="sport-name">{sport.name}</div>
                
                <div className="sport-stat">
                  <div className="sport-stat-label">Record</div>
                  <div className="sport-stat-value">{sport.record}</div>
                </div>
                
                <div className="sport-stat">
                  <div className="sport-stat-label">Win %</div>
                  <div className="sport-stat-value">{sport.winRate}%</div>
                </div>
                
                <div className="sport-stat">
                  <div className="sport-stat-label">ROI</div>
                  <div className={`sport-stat-value ${sport.roi >= 0 ? 'positive' : 'negative'}`}>
                    {sport.roi > 0 ? '+' : ''}{sport.roi}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        
        {/* Betting logbook with scrollable table */}
        <section className="betting-logbook">
          <div className="logbook-header">
            <h2 className="logbook-title">Betting Logbook</h2>
            
            <div className="logbook-filters">
              <button 
                className={`filter-button ${activeBettingFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveBettingFilter('all')}
              >
                All
              </button>
              <button 
                className={`filter-button ${activeBettingFilter === 'won' ? 'active' : ''}`}
                onClick={() => setActiveBettingFilter('won')}
              >
                Won
              </button>
              <button 
                className={`filter-button ${activeBettingFilter === 'lost' ? 'active' : ''}`}
                onClick={() => setActiveBettingFilter('lost')}
              >
                Lost
              </button>
              <button 
                className={`filter-button ${activeBettingFilter === 'parlay' ? 'active' : ''}`}
                onClick={() => setActiveBettingFilter('parlay')}
              >
                Parlays
              </button>
            </div>
          </div>
          
          {/* Scrollable table container */}
          <div className="log-table-container">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Game</th>
                  <th>Bet</th>
                  <th>Type</th>
                  <th>Odds</th>
                  <th>Stake</th>
                  <th>Result</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {filteredBettingLog.map((bet, index) => (
                  <tr key={index}>
                    <td>{new Date(bet.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</td>
                    <td>{bet.game}</td>
                    <td>{bet.bet}</td>
                    <td>
                      <span className={`bet-type bet-type-${bet.betType}`}>
                        {bet.betType}
                      </span>
                    </td>
                    <td>{bet.odds > 0 ? `+${bet.odds}` : bet.odds}</td>
                    <td>${new Intl.NumberFormat('en-US').format(bet.stake)}</td>
                    <td className={`result-${bet.result}`}>
                      {bet.result.toUpperCase()}
                    </td>
                    <td>${new Intl.NumberFormat('en-US').format(bet.payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
