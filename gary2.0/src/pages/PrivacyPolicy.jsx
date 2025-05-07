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
        <p className="privacy-last-updated">Data Controller: Gary A.I. LLC, 123 Walnut St, Cincinnati, OH 45202, USA</p>

        <div className="privacy-section">
          <h2 className="privacy-heading">1. Information We Collect</h2>
          <ul>
            <li>Account data – name, email, password hash.</li>
            <li>Payment data – tokenized card info via Stripe (we never store full PAN).</li>
            <li>Usage data – IP address, device type, pages visited, picks clicked.</li>
            <li>Marketing data – opt‑in preferences, survey responses.</li>
          </ul>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">2. How We Use Information</h2>
          <ul>
            <li>Provide and improve the Service (algorithm tuning, UX).</li>
            <li>Process payments and manage subscriptions.</li>
            <li>Prevent fraud and ensure platform security.</li>
            <li>Send transactional notices and marketing (with consent).</li>
          </ul>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">3. Payments via Stripe</h2>
          <p className="privacy-text">We use Stripe to process payments. When you submit a payment, your data is sent directly to Stripe, which acts as a minimum‑scope PCI DSS Level 1 service provider. Stripe may use your data per its own Privacy Policy (see link below).</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">4. Legal Bases (GDPR)</h2>
          <p className="privacy-text">We process personal data under one or more of the following bases: (a) contract performance; (b) legitimate interests (service security, analytics); (c) consent (marketing emails); (d) legal obligation (tax records).</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">5. Your Rights</h2>
          <p className="privacy-text">EU/EEA: Access, rectify, erase, restrict, object, data portability, lodge complaint with supervisory authority.</p>
          <p className="privacy-text">California (CCPA): Know, delete, opt‑out of "sale," non‑discrimination. Request via privacy@betwithgary.com.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">6. Cookies & Tracking</h2>
          <p className="privacy-text">We use first‑party and third‑party cookies for analytics (e.g., Plausible) and session management. You can disable cookies in your browser, but parts of the Service may not function.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">7. Data Security</h2>
          <p className="privacy-text">We implement TLS 1.3 encryption, least‑privilege access, and annual penetration tests. Payment flows inherit Stripe's security certifications (PCI‑DSS v4.0, SOC 2).</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">8. Data Retention</h2>
          <p className="privacy-text">Account data is retained while your account is active and for 7 years thereafter to meet tax/audit obligations. Anonymized analytical data may be retained indefinitely.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">9. International Transfers</h2>
          <p className="privacy-text">We host in the United States and may transfer data internationally under Standard Contractual Clauses (SCCs) where required.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">10. Children's Privacy</h2>
          <p className="privacy-text">The Service is not directed to minors under 13 years (or under legal betting age). We do not knowingly collect data from such users.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">11. Changes to This Policy</h2>
          <p className="privacy-text">We will post revisions here and, for material changes, notify you via email or in‑app notice. Continued use after the effective date constitutes acceptance.</p>
        </div>

        <div className="privacy-section">
          <h2 className="privacy-heading">Stripe Reference Links</h2>
          <p className="privacy-text">
            <a href="https://stripe.com/legal" target="_blank" rel="noopener noreferrer">Stripe Services Agreement</a><br />
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe Privacy Policy</a>
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
