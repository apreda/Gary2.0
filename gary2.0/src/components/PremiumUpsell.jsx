import React from 'react';
import '../styles/PremiumUpsell.css';

/**
 * PremiumUpsell component
 * Displays premium features to encourage free users to upgrade
 */
const PremiumUpsell = ({ onUpgradeClick }) => {
  return (
    <div className="premium-upsell">
      <div className="upsell-content">
        <h3>Upgrade to Pro</h3>
        <p>Get access to all of Gary's premium features</p>
        
        <ul className="feature-list">
          <li>Unlimited daily picks</li>
          <li>Advanced bet tracking</li>
          <li>Premium analytics</li>
          <li>Early access to special picks</li>
        </ul>
        
        <button className="upgrade-button" onClick={onUpgradeClick}>
          Upgrade Now
        </button>
      </div>
    </div>
  );
};

export default PremiumUpsell;
