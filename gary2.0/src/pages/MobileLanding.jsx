import React, { useEffect, useState } from 'react';
import { APP_STORE_URL } from '../utils/isMobile';
import SEO from '../components/SEO';

/**
 * Mobile-only landing view. Shown to any phone/tablet visitor regardless of
 * the URL they hit. Single purpose: get them into the App Store with one tap.
 *
 * Matches the iOS app's gold-on-black aesthetic so the transition into the
 * App Store / app itself feels continuous.
 */
export default function MobileLanding() {
  const [coinReady, setCoinReady] = useState(false);

  useEffect(() => {
    // Stagger the coin entrance just enough to feel intentional
    const t = setTimeout(() => setCoinReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: 'radial-gradient(circle at 50% 0%, #1a1a1c 0%, #08080a 70%)',
        color: '#fff',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <SEO
        title="Gary AI — Download on iOS · Daily Sports Picks"
        description="Daily AI-driven sports betting picks. NBA, NHL, MLB, NCAAB, NCAAF. Free on iOS — three AI models investigate every pick."
        path="/"
      />
      {/* Gold ambient glow — same vocabulary as the app's orb */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-30%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '140vw',
          height: '140vw',
          maxWidth: 800,
          maxHeight: 800,
          background:
            'radial-gradient(circle at center, rgba(184,149,63,0.25) 0%, rgba(184,149,63,0.10) 35%, transparent 60%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      <main
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 480,
          padding: '48px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          zIndex: 1,
        }}
      >
        {/* Coin / Gary logo */}
        <div
          style={{
            width: 168,
            height: 168,
            marginBottom: 32,
            transform: coinReady ? 'translateY(0)' : 'translateY(-12px)',
            opacity: coinReady ? 1 : 0,
            transition: 'transform 0.6s cubic-bezier(0.16,1,0.3,1), opacity 0.6s',
            filter: 'drop-shadow(0 8px 32px rgba(184,149,63,0.45))',
            animation: 'gary-float 6s ease-in-out infinite',
          }}
        >
          <img
            src="/coin2.png"
            alt="Gary AI"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>

        {/* Wordmark */}
        <div
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            marginBottom: 8,
            lineHeight: 1,
          }}
        >
          <span style={{ color: '#fff' }}>GARY</span>
          <span style={{ color: '#B8953F', fontStyle: 'italic', fontWeight: 600 }}>.AI</span>
        </div>

        <div
          style={{
            fontSize: '0.85rem',
            opacity: 0.55,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            marginBottom: 32,
          }}
        >
          Smarter Sports Bets
        </div>

        {/* Headline */}
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            lineHeight: 1.25,
            marginBottom: 16,
            maxWidth: 360,
          }}
        >
          Get daily picks across <span style={{ color: '#B8953F' }}>5 sports</span> in the app.
        </h1>

        <p
          style={{
            fontSize: '0.95rem',
            opacity: 0.7,
            lineHeight: 1.55,
            maxWidth: 340,
            marginBottom: 36,
          }}
        >
          Three AI models stress-test every pick. Game lines and player props.
          Full written rationale. Free, no sign-up.
        </p>

        {/* App Store CTA */}
        <a
          href={APP_STORE_URL}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background:
              'linear-gradient(135deg, #d4af37 0%, #B8953F 50%, #9c7c33 100%)',
            color: '#0a0a0a',
            fontWeight: 700,
            fontSize: '1.1rem',
            padding: '18px 36px',
            borderRadius: 999,
            textDecoration: 'none',
            boxShadow:
              '0 12px 32px rgba(184,149,63,0.45), inset 0 1px 1px rgba(255,255,255,0.35)',
            border: '1px solid rgba(212,175,55,0.6)',
            width: '100%',
            maxWidth: 320,
            marginBottom: 16,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          Download on App Store
        </a>

        <div style={{ fontSize: '0.78rem', opacity: 0.45, marginBottom: 48 }}>
          Free · No paywall · 18+
        </div>

        {/* Feature bullets — kept minimal */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 40,
          }}
        >
          {[
            { sport: 'NBA', label: 'Game picks + player props' },
            { sport: 'NHL', label: 'Game picks + player props' },
            { sport: 'MLB', label: 'Game picks + player props' },
            { sport: 'NCAAB', label: 'Spread, ML, totals' },
            { sport: 'NCAAF', label: 'Spread, ML, totals' },
          ].map(({ sport, label }) => (
            <div
              key={sport}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(184,149,63,0.18)',
                padding: '12px 16px',
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#B8953F',
                  letterSpacing: '0.05em',
                  width: 72,
                  textAlign: 'left',
                }}
              >
                {sport}
              </div>
              <div style={{ fontSize: '0.85rem', opacity: 0.75 }}>{label}</div>
            </div>
          ))}
        </div>
      </main>

      <footer
        style={{
          padding: '20px 24px 32px',
          fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.4)',
          textAlign: 'center',
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <a href="/terms" style={{ color: '#B8953F', textDecoration: 'none', margin: '0 8px' }}>
            Terms
          </a>
          <a href="/privacy" style={{ color: '#B8953F', textDecoration: 'none', margin: '0 8px' }}>
            Privacy
          </a>
        </div>
        <div>
          For entertainment only. No real-money betting. 18+. Gambling problem? Call
          1-800-GAMBLER.
        </div>
        <div style={{ marginTop: 12, opacity: 0.6 }}>
          © {new Date().getFullYear()} Gary A.I. LLC
        </div>
      </footer>

      <style>{`
        @keyframes gary-float {
          0%, 100% { transform: translateY(0) }
          50% { transform: translateY(-8px) }
        }
      `}</style>
    </div>
  );
}
