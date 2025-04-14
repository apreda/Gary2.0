import { useState, useEffect } from 'react';
import { useUserStats } from '../../hooks/useUserStats';
import { createPortal } from 'react-dom';
import './UserStats.css';

const calculateBadges = (stats) => {
  if (!stats) return [];
  
  const badges = [];
  
  // Win percentage badges
  const winPercentage = stats.total_picks ? (stats.win_count / stats.total_picks) * 100 : 0;
  if (winPercentage >= 70) badges.push('Elite Picker');
  else if (winPercentage >= 60) badges.push('Sharp Eye');
  
  // Streak badges
  if (stats.current_streak >= 5) badges.push('Hot Streak');
  if (stats.longest_streak >= 10) badges.push('Streak Master');
  
  // Volume badges
  if (stats.total_picks >= 100) badges.push('Stats Expert');
  if (stats.total_picks >= 50) badges.push('Dedicated Picker');
  
  return badges;
};

export const UserStats = ({ isOpen, onClose }) => {
  const { stats, loading, error } = useUserStats();
  const [isShiny, setIsShiny] = useState(false);

  console.log('UserStats render:', { stats, loading, error });

  if (!isOpen) return null;
  
  // Loading state
  if (loading) return createPortal(
    <div className="baseball-card-overlay">
      <div className="baseball-card">
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </div>
    </div>,
    document.body
  );



  // Error state
  if (error) return createPortal(
    <div className="baseball-card-overlay" onClick={onClose}>
      <div className="baseball-card error">
        <h2>Oops! Something went wrong</h2>
        <p>{error}</p>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
    </div>,
    document.body
  );

  // Make sure we have stats before rendering
  if (!stats) {
    console.log('No stats object at all');
    return createPortal(
      <div className="baseball-card-overlay" onClick={onClose}>
        <div className="baseball-card">
          <h2>No stats available</h2>
          <p>Stats object is null</p>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
      </div>,
      document.body
    );
  }

  if (!stats.stats) {
    console.log('Stats object exists but no stats property:', stats);
    return createPortal(
      <div className="baseball-card-overlay" onClick={onClose}>
        <div className="baseball-card">
          <h2>No stats available</h2>
          <p>Stats property is missing</p>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="baseball-card-overlay" onClick={onClose}>
      <div 
        className={`baseball-card ${isShiny ? 'shiny' : ''}`}
        onClick={e => e.stopPropagation()}
        onMouseMove={() => setIsShiny(true)}
        onMouseLeave={() => setIsShiny(false)}
      >
        <div className="card-header">
          <h2>{stats?.username || 'User'}</h2>
          <span className="year">{stats?.joinDate || new Date().getFullYear()}</span>
        </div>
        
        <div className="card-photo">
          {/* Placeholder for user avatar */}
          <div className="avatar-placeholder">
            <span>👤</span>
          </div>
        </div>

        <div className="card-stats">
          <div className="stat-row">
            <div className="stat-box">
              <label>Total Picks</label>
              <span>{stats?.total_picks || 0}</span>
            </div>
            <div className="stat-box highlight">
              <label>Win %</label>
              <span>
                {stats?.total_picks ? 
                  ((stats.win_count / stats.total_picks) * 100).toFixed(1) : 
                  '0.0'
                }%
              </span>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-box">
              <label>Ride Count</label>
              <span>{stats?.ride_count || 0}</span>
            </div>
            <div className="stat-box">
              <label>Fade Count</label>
              <span>{stats?.fade_count || 0}</span>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-box">
              <label>Current Streak</label>
              <span>{stats?.current_streak || 0}</span>
            </div>
            <div className="stat-box">
              <label>Best Streak</label>
              <span>{stats?.longest_streak || 0}</span>
            </div>
          </div>

          <div className="recent-results">
            <label>Recent Results</label>
            <div className="result-dots">
              {(stats?.recent_results || []).map((result, index) => (
                <span key={index} className={`dot ${result === 'W' ? 'win' : 'loss'}`}>
                  {result}
                </span>
              ))}
            </div>
          </div>

          <div className="badges">
            {calculateBadges(stats).map((badge, index) => (
              <span key={index} className="badge">{badge}</span>
            ))}
          </div>
        </div>

        <button className="close-button" onClick={onClose}>×</button>
      </div>
    </div>,
    document.body
  );
};
