import React from 'react';
import '../styles/FreePicksLimit.css';

/**
 * FreePicksLimit component
 * Displayed when a free user hits their picks limit
 */
const FreePicksLimit = ({ onUpgradeClick, onBack }) => {
  return (
    <div className="free-picks-limit">
      <div className="limit-content">
        <h3>Free Picks Limit Reached</h3>
        <p>Upgrade to Pro to access all of Gary's daily picks</p>
        
        <div className="limit-actions">
          <button className="upgrade-button" onClick={onUpgradeClick}>
            Upgrade to Pro
          </button>
          
          {onBack && (
            <button className="back-button" onClick={onBack}>
              Back to Free Picks
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FreePicksLimit;
