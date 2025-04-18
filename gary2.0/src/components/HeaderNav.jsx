import React from 'react';
import '../styles/HeaderNav.css';

/**
 * HeaderNav component
 * Displays a header with navigation elements
 */
const HeaderNav = ({ title, indicators }) => {
  return (
    <div className="header-nav">
      <h2 className="page-title">{title}</h2>
      
      {indicators && (
        <div className="nav-indicators">
          {indicators.map((indicator, i) => (
            <div 
              key={`indicator-${i}`} 
              className={`nav-indicator ${indicator.active ? 'active' : ''}`}
              onClick={indicator.onClick}
            ></div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HeaderNav;
