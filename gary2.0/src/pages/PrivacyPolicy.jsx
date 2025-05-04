import React from 'react';

export function PrivacyPolicy() {
  const currentDate = new Date();
  const formattedDate = `${new Intl.DateTimeFormat('en-US', { month: 'long' }).format(currentDate)} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;

  return (
    <div style={{
      maxWidth: '1000px',
      margin: '40px auto',
      padding: '0 20px 80px 20px',
      color: '#f1f1f1',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'rgba(20, 20, 20, 0.9)',
        borderRadius: '8px',
        padding: '40px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ color: '#b8953f', fontSize: '2.5rem', marginBottom: '10px', fontWeight: 600 }}>Privacy Policy</h1>
        <p style={{ color: '#999', marginBottom: '10px', fontSize: '0.9rem' }}>Last updated: {formattedDate}</p>
        <p style={{ color: '#999', marginBottom: '10px', fontSize: '0.9rem' }}>Data Controller: Gary A.I. LLC, 123 Walnut St, Cincinnati, OH 45202, USA</p>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>1. Information We Collect</h2>
          <ul>
            <li>Account data – name, email, password hash.</li>
            <li>Payment data – tokenized card info via Stripe (we never store full PAN).</li>
            <li>Usage data – IP address, device type, pages visited, picks clicked.</li>
            <li>Marketing data – opt‑in preferences, survey responses.</li>
          </ul>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>2. How We Use Information</h2>
          <ul>
            <li>Provide and improve the Service (algorithm tuning, UX).</li>
            <li>Process payments and manage subscriptions.</li>
            <li>Prevent fraud and ensure platform security.</li>
            <li>Send transactional notices and marketing (with consent).</li>
          </ul>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>3. Payments via Stripe</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>We use Stripe to process payments. When you submit a payment, your data is sent directly to Stripe, which acts as a minimum‑scope PCI DSS Level 1 service provider. Stripe may use your data per its own Privacy Policy (see link below).</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>4. Legal Bases (GDPR)</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>We process personal data under one or more of the following bases: (a) contract performance; (b) legitimate interests (service security, analytics); (c) consent (marketing emails); (d) legal obligation (tax records).</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>5. Your Rights</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>EU/EEA: Access, rectify, erase, restrict, object, data portability, lodge complaint with supervisory authority.</p>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>California (CCPA): Know, delete, opt‑out of "sale," non‑discrimination. Request via privacy@betwithgary.com.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>6. Cookies & Tracking</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>We use first‑party and third‑party cookies for analytics (e.g., Plausible) and session management. You can disable cookies in your browser, but parts of the Service may not function.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>7. Data Security</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>We implement TLS 1.3 encryption, least‑privilege access, and annual penetration tests. Payment flows inherit Stripe's security certifications (PCI‑DSS v4.0, SOC 2).</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>8. Data Retention</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>Account data is retained while your account is active and for 7 years thereafter to meet tax/audit obligations. Anonymized analytical data may be retained indefinitely.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>9. International Transfers</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>We host in the United States and may transfer data internationally under Standard Contractual Clauses (SCCs) where required.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>10. Children's Privacy</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>The Service is not directed to minors under 13 years (or under legal betting age). We do not knowingly collect data from such users.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>11. Changes to This Policy</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>We will post revisions here and, for material changes, notify you via email or in‑app notice. Continued use after the effective date constitutes acceptance.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>Stripe Reference Links</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>
            <a href="https://stripe.com/legal" target="_blank" rel="noopener noreferrer">Stripe Services Agreement</a><br />
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe Privacy Policy</a>
          </p>
        </div>
      </div>
      
      {/* Simple Footer */}
      <div style={{
        borderTop: '1px solid #333',
        marginTop: '50px',
        paddingTop: '20px',
        textAlign: 'center',
        color: '#999',
        fontSize: '0.9rem'
      }}>
        <p>&copy; {new Date().getFullYear()} Gary A.I. LLC. All rights reserved.</p>
        <div style={{ marginTop: '15px' }}>
          <a href="/terms" style={{ color: '#b8953f', marginRight: '20px', textDecoration: 'none' }}>Terms of Service</a>
          <a href="/privacy" style={{ color: '#b8953f', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicy;
