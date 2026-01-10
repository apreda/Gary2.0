import React from 'react';
import '../styles/privacy-policy.css';

export function PrivacyPolicy() {
  const currentDate = new Date();
  const formattedDate = `${new Intl.DateTimeFormat('en-US', { month: 'long' }).format(currentDate)} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;

  return (
    <div className="privacy-container">
      <div className="privacy-card">
        <h1 className="privacy-title">Privacy Policy</h1>
        <p className="privacy-last-updated">Last updated: {formattedDate}</p>
        <p className="privacy-last-updated">Operated by Gary A.I.</p>

        <div className="privacy-section">
          <h2 className="privacy-heading">1. Information We Collect</h2>
          <p className="privacy-text">Gary A.I. is a free service that does not require user accounts or registration.</p>
          <p className="privacy-text font-bold mt-4 mb-2">Web Platform:</p>
          <ul>
            <li>We do not collect personal information such as names, emails, or passwords.</li>
            <li>Basic usage data may be collected for analytics (pages visited, device type).</li>
            <li>Your bet/fade decisions are stored locally on your device only.</li>
          </ul>
          <p className="privacy-text font-bold mt-4 mb-2">iOS Mobile App:</p>
          <ul>
            <li>The iOS mobile app is a free informational companion.</li>
            <li>It does not collect personal data, usage analytics, or track users.</li>
            <li>No data is linked to your identity.</li>
          </ul>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">2. How We Use Information</h2>
          <ul>
            <li>Provide and improve the Service (algorithm tuning, UX).</li>
            <li>Ensure platform security and prevent abuse.</li>
          </ul>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">3. Local Storage</h2>
          <p className="privacy-text">We use browser local storage to save your preferences and bet decisions. This data stays on your device and is not transmitted to our servers.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">4. Cookies & Analytics</h2>
          <p className="privacy-text">We may use minimal analytics cookies to understand how visitors use our site. You can disable cookies in your browser settings.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">5. Data Security</h2>
          <p className="privacy-text">We implement TLS encryption and industry-standard security practices. Since we don't collect personal data, there is minimal data to protect.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">6. Children's Privacy</h2>
          <p className="privacy-text">The Service is not directed to minors under 18 years. We do not knowingly collect data from such users.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">7. Changes to This Policy</h2>
          <p className="privacy-text">We will post revisions here. Continued use after changes constitutes acceptance.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">Contact Us</h2>
          <p className="privacy-text">
            For privacy-related questions, contact us at: <a href="mailto:privacy@betwithgary.com">privacy@betwithgary.com</a>
          </p>
        </div>
      </div>
      
      {/* Simple Footer */}
      <div className="privacy-footer">
        <p>&copy; {new Date().getFullYear()} Gary A.I. LLC. All rights reserved.</p>
        <div className="privacy-links">
          <a href="/terms" className="privacy-link">Terms of Service</a>
          <a href="/privacy" className="privacy-link">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicy;
