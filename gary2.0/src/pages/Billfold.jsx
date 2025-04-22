import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { format } from 'date-fns';
import billfoldLogo from '../assets/images/billfold1.png';

export function Billfold() {
  const [bankrollStats, setBankrollStats] = useState({
    currentBankroll: 10000,
    startingBankroll: 10000,
    monthlyGoal: 30,
    currentRoi: 0,
    totalBets: 0,
    winRate: 0,
    averageBet: 0,
  });

  const [sportsBreakdown, setSportsBreakdown] = useState([]);
  const [bettingLog, setBettingLog] = useState([]);
  const [activeBettingFilter, setActiveBettingFilter] = useState('all');

  useEffect(() => {
    const fetchBankrollData = async () => {
      try {
        const { data, error } = await supabase
          .from('wagers')
          .select('current_bankroll, starting_bankroll, monthly_goal_percentage')
          .order('id', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;

        const roi = data.starting_bankroll > 0 ?
          ((data.current_bankroll - data.starting_bankroll) / data.starting_bankroll) * 100 : 0;

        setBankrollStats({
          currentBankroll: Math.round(data.current_bankroll),
          startingBankroll: Math.round(data.starting_bankroll),
          monthlyGoal: data.monthly_goal_percentage,
          currentRoi: parseFloat(roi.toFixed(1)),
          totalBets: 0, // To be updated after fetching betting history
          winRate: 0, // To be updated after fetching betting history
          averageBet: 0, // To be updated after fetching betting history
        });
      } catch (error) {
        console.error('Error fetching bankroll data:', error);
      }
    };

    fetchBankrollData();
  }, []);

  useEffect(() => {
    const fetchSportsBreakdown = async () => {
      try {
        const sports = ['NBA', 'MLB', 'NFL', 'NHL'];
        const sportStats = [];

        for (const sport of sports) {
          const { data, error } = await supabase
            .from('wagers')
            .select('result')
            .eq('sport', sport);

          if (error) throw error;

          const wins = data.filter(wager => wager.result === 'won').length;
          const losses = data.filter(wager => wager.result === 'lost').length;
          const total = wins + losses;
          const winRate = total > 0 ? (wins / total) * 100 : 0;

          sportStats.push({
            name: sport,
            icon: sport === 'NBA' ? '🏀' : 
                  sport === 'MLB' ? '⚾' :
                  sport === 'NFL' ? '🏈' :
                  sport === 'NHL' ? '🏒' : '🎯',
            record: `${wins}-${losses}`,
            winRate: parseFloat(winRate.toFixed(1)),
            roi: 0 // Placeholder for ROI calculation
          });
        }

        setSportsBreakdown(sportStats);
      } catch (error) {
        console.error('Error fetching sports breakdown:', error);
      }
    };

    fetchSportsBreakdown();
  }, []);

  useEffect(() => {
    const fetchBettingHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('wagers')
          .select('*')
          .order('placed_date', { ascending: false });

        if (error) throw error;

        setBettingLog(data);

        const totalBets = data.length;
        const wonBets = data.filter(bet => bet.status === 'won').length;
        const totalWagered = data.reduce((sum, bet) => sum + bet.amount, 0);
        const averageBet = totalBets > 0 ? totalWagered / totalBets : 0;
        const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;

        setBankrollStats(prevStats => ({
          ...prevStats,
          totalBets,
          winRate: parseFloat(winRate.toFixed(1)),
          averageBet: Math.round(averageBet),
        }));
      } catch (error) {
        console.error('Error fetching betting history:', error);
      }
    };

    fetchBettingHistory();
  }, []);

  const filteredBettingLog = bettingLog.filter(bet =>
    activeBettingFilter === 'all' ? true : bet.status === activeBettingFilter
  );

  return (
    <div className="billfold-container">
      <header className="billfold-header">
        <img src={billfoldLogo} alt="Billfold Logo" className="billfold-logo" />
        <h1>Gary's Billfold</h1>
      </header>
      <main className="billfold-main">
        <section className="bankroll-stats">
          <h2>Bankroll Overview</h2>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Current Bankroll:</span>
              <span className="stat-value">${bankrollStats.currentBankroll}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Starting Bankroll:</span>
              <span className="stat-value">${bankrollStats.startingBankroll}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Monthly Goal:</span>
              <span className="stat-value">{bankrollStats.monthlyGoal}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Current ROI:</span>
              <span className="stat-value">{bankrollStats.currentRoi}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Bets:</span>
              <span className="stat-value">{bankrollStats.totalBets}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Win Rate:</span>
              <span className="stat-value">{bankrollStats.winRate}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Average Bet:</span>
              <span className="stat-value">${bankrollStats.averageBet}</span>
            </div>
          </div>
        </section>
        <section className="sport-breakdown">
          <h2>Sport Breakdown</h2>
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
        </section>
        <section className="betting-history">
          <h2>Betting History</h2>
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
          </div>
          <div className="bet-list">
            {filteredBettingLog.map((bet, index) => (
              <div 
                key={index} 
                className={`bet-item ${bet.status === 'won' ? 'win' : bet.status === 'lost' ? 'loss' : 'pending'}`}
              >
                <div className="bet-date">{format(new Date(bet.placed_date), 'yyyy-MM-dd')}</div>
                <div className="bet-game">{bet.picks?.game || 'Unknown Game'}</div>
                <div className="bet-pick">{bet.picks?.pick || 'Unknown Pick'}</div>
                <div className="bet-odds">{bet.odds > 0 ? `+${bet.odds}` : bet.odds}</div>
                <div className="bet-amount">${bet.amount}</div>
                <div className="bet-result">
                  {bet.status === 'won' ? (
                    <span className="result win">+${bet.potential_payout - bet.amount}</span>
                  ) : bet.status === 'lost' ? (
                    <span className="result loss">-${bet.amount}</span>
                  ) : (
                    <span className="result pending">Pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
