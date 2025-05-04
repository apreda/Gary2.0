import React from 'react';

export function TermsOfService() {
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
        <h1 style={{ color: '#b8953f', fontSize: '2.5rem', marginBottom: '10px', fontWeight: 600 }}>Terms of Service</h1>
        <p style={{ color: '#999', marginBottom: '10px', fontSize: '0.9rem' }}>Last updated: {formattedDate}</p>
        <p style={{ color: '#999', marginBottom: '10px', fontSize: '0.9rem' }}>Legal entity: Gary A.I. LLC, 123 Walnut St, Cincinnati, OH 45202, USA</p>
        <p style={{ color: '#999', marginBottom: '10px', fontSize: '0.9rem' }}>Contact: support@betwithgary.com</p>

        <div style={{ margin: '30px 0' }}>
          <h2 style={{ color: '#b8953f', fontSize: '1.5rem', marginBottom: '15px', fontWeight: 500 }}>1. Acceptance of Terms</h2>
          <p style={{ marginBottom: '15px', lineHeight: 1.6 }}>By accessing betwithgary.com or any related mobile application (collectively, the "Service"), you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>2. Eligibility</h2>
          <p>You must be 21 years or older (or the legal sports‑betting age in your jurisdiction) and legally able to enter contracts. You are solely responsible for ensuring that online sports‑wagering is lawful where you live.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>3. Account Registration</h2>
          <p>You agree to provide accurate information, safeguard your credentials, and accept full responsibility for activities under your account. We may suspend or terminate accounts that violate these Terms.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>4. Services Provided</h2>
          <p>Gary A.I. supplies algorithmic betting picks, analysis, and interactive features ("Ride or Fade," leaderboards, chat, etc.). We do not place bets on your behalf. All wagering decisions and financial risk are yours alone. Content is provided "as‑is" without guarantee of outcome.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>5. Payments & Fees (Stripe)</h2>
          <p>All paid plans and in‑app purchases are processed via Stripe, Inc. You authorize us and Stripe to charge your selected payment method for recurring or one‑time fees, including applicable taxes. Your card data never touches our servers; it is stored and processed by Stripe in compliance with PCI‑DSS v4.0. Refund requests are subject to our plan‑specific policies and Stripe's dispute procedures.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>6. Intellectual Property</h2>
          <p>All content, trademarks, and software (excluding user‑generated data) belong to Gary A.I. or its licensors. You may not copy, modify, or distribute any portion of the Service without prior written consent.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>7. User Content</h2>
          <p>When you post data (e.g., comments, picks, chat messages), you grant us a worldwide, royalty‑free license to use, display, and adapt that content solely to operate and improve the Service. You represent that you own or have rights to any content posted.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>8. Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Violate laws or regulations (including any gambling regulations).</li>
            <li>Attempt to reverse‑engineer or interfere with the Service.</li>
            <li>Use automated bots to scrape data or place picks.</li>
            <li>Upload malicious code.</li>
            <li>Harass or defame other users.</li>
          </ul>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>9. Disclaimers</h2>
          <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." WE MAKE NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON‑INFRINGEMENT. Betting carries inherent financial risk; past performance does not guarantee future results.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>10. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, Gary A.I. shall not be liable for indirect, incidental, or consequential damages, or any loss of profits, arising from use of the Service—even if advised of the possibility. Our total liability will not exceed the amount you paid to us in the 12 months preceding the claim.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>11. Indemnification</h2>
          <p>You will indemnify and hold Gary A.I., its directors, employees, and partners (including Stripe) harmless from any claims, damages, or liabilities arising out of your use of the Service or violation of these Terms.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>12. Governing Law & Dispute Resolution</h2>
          <p>These Terms are governed by the laws of the State of Ohio, USA, without regard to conflict‑of‑law rules. All disputes shall be resolved through binding arbitration in Cincinnati, OH, in English, under the AAA Consumer Arbitration Rules. YOU WAIVE ANY RIGHT TO CLASS‑ACTION PROCEEDINGS.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>13. Modifications</h2>
          <p>We may revise these Terms by posting an updated version with a new "Last updated" date. Continued use after changes constitutes acceptance.</p>
        </div>

        <div style={{ margin: '30px 0' }}>
          <h2>14. Contact</h2>
          <p>Questions? Email legal@betwithgary.com or write to the address above.</p>
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

export default TermsOfService;
