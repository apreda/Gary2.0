import React, { useState } from 'react';
import { useSpring, animated } from 'react-spring';
import { Link } from 'react-router-dom';
import bearLogo from '../../assets/bear-logo.png';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const sidebarSpring = useSpring({ width: open ? '14rem' : '3.5rem' });

  return (
    <>
      <button onClick={() => setOpen(!open)} className="gary-sidebar-toggle" aria-label="Toggle Sidebar">
        <img src={bearLogo} alt="Bear Logo" className="bear-logo-image" />
      </button>
      {open && <div className="gary-sidebar-overlay" onClick={() => setOpen(false)} />}
      <animated.div style={sidebarSpring} className="gary-sidebar-container">
        <div className="gary-sidebar-header">
          {open && <h2 className="gary-sidebar-title">Gary A.I.</h2>}
          {open && (
            <button onClick={() => setOpen(false)} className="gary-sidebar-close-btn" aria-label="Close Sidebar">
              <svg className="close-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <nav className="gary-sidebar-content">
          {open && (
            <ul className="gary-sidebar-links">
              <li><Link to="/" onClick={() => setOpen(false)}>Home</Link></li>
              <li><Link to="/sign-in" onClick={() => setOpen(false)}>Sign In</Link></li>
              <li><Link to="/pricing" onClick={() => setOpen(false)}>Pricing</Link></li>
              <li><Link to="/picks" onClick={() => setOpen(false)}>Gary's Picks</Link></li>
              <li><Link to="/parlay" onClick={() => setOpen(false)}>Parlay of the Day</Link></li>
              <li><Link to="/billfold" onClick={() => setOpen(false)}>Gary's Billfold</Link></li>
              <li><Link to="/leaderboard" onClick={() => setOpen(false)}>Leaderboard</Link></li>
              <li><Link to="/gary-live" onClick={() => setOpen(false)}>Gary Live</Link></li>
            </ul>
          )}
        </nav>
      </animated.div>
    </>
  );
};

export default Sidebar; 