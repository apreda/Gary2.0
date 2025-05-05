import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Footer.css';

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-logo">
            <h3>GARY A.I.</h3>
            <p className="footer-tagline">Sports Betting, Upgraded</p>
          </div>
          
          <div className="footer-links">
            <div className="footer-column">
              <h4>Pages</h4>
              <ul>
                <li><Link to="/">Home</Link></li>
                <li><Link to="/picks">Picks</Link></li>
                <li><Link to="/leaderboard">Leaderboard</Link></li>
                <li><Link to="/pricing">Pricing</Link></li>
              </ul>
            </div>
            
            <div className="footer-column">
              <h4>Legal</h4>
              <ul>
                <li><Link to="/terms">Terms of Service</Link></li>
                <li><Link to="/privacy">Privacy Policy</Link></li>
              </ul>
            </div>
            
            <div className="footer-column">
              <h4>Contact</h4>
              <ul>
                <li><a href="mailto:support@betwithgary.com">Support</a></li>
                <li><a href="mailto:partners@betwithgary.com">Partnerships</a></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p className="copyright">&copy; {currentYear} Gary A.I. LLC. All rights reserved.</p>
          <p className="disclaimer">Betting should be done responsibly. Gary A.I. is not a sportsbook and does not handle wagers.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
