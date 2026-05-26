import React, { useEffect, useState } from 'react';
import {
  fetchMostRecentGameRecord,
  fetchRecentSportBreakdown,
  fetchRecentWins,
} from '../services/performanceService';

/**
 * Compact "how Gary's been doing" strip for the desktop landing page.
 * Mirrors the iOS PerformanceBanner + RecentWinsTicker so the website feels
 * continuous with the app — same record, same sport pills, same gold accent.
 *
 * Loads from `game_results` (same Supabase table the app reads), no
 * additional backend required.
 */
export default function PerformanceStrip() {
  const [record, setRecord] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [wins, setWins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, bd, w] = await Promise.all([
          fetchMostRecentGameRecord(),
          fetchRecentSportBreakdown(),
          fetchRecentWins(8),
        ]);
        if (cancelled) return;
        setRecord(r);
        setBreakdown(bd);
        setWins(w);
      } catch (e) {
        console.error('[PerformanceStrip] load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // While loading or when there's literally no data, render nothing — the
  // home page already has enough hero content, we don't want a sad empty card.
  if (loading || !record || (record.wins + record.losses + record.pushes) === 0) {
    return null;
  }

  const total = record.wins + record.losses;
  const winRate = total > 0 ? Math.round((record.wins / total) * 100) : 0;
  const dateLabel = record.date
    ? new Date(record.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : 'Recent';

  return (
    <section
      style={{
        width: '100%',
        maxWidth: 1100,
        margin: '24px auto 32px',
        padding: '0 24px',
      }}
    >
      <div
        style={{
          background:
            'linear-gradient(135deg, rgba(184,149,63,0.12) 0%, rgba(184,149,63,0.04) 100%)',
          border: '1px solid rgba(184,149,63,0.25)',
          borderRadius: 20,
          padding: '20px 28px',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 24,
          alignItems: 'center',
        }}
      >
        {/* Left: headline record */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div
              style={{
                fontSize: '0.7rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)',
                marginBottom: 4,
              }}
            >
              {dateLabel} record
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span
                style={{
                  fontSize: '2.25rem',
                  fontWeight: 800,
                  color: '#B8953F',
                  lineHeight: 1,
                }}
              >
                {record.wins}-{record.losses}
                {record.pushes > 0 ? `-${record.pushes}` : ''}
              </span>
              <span style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.55)' }}>
                {winRate}% win rate
              </span>
            </div>
          </div>

          {/* Sport breakdown chips */}
          {breakdown.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {breakdown.map(b => {
                const won = b.wins;
                const lost = b.losses;
                return (
                  <div
                    key={b.league}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(184,149,63,0.20)',
                      borderRadius: 12,
                      padding: '8px 14px',
                      minWidth: 78,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#B8953F',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {b.league}
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                      {won}-{lost}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: subtle "live" indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.78rem',
            color: 'rgba(255,255,255,0.55)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              background: '#22C55E',
              borderRadius: '50%',
              boxShadow: '0 0 8px rgba(34,197,94,0.6)',
              animation: 'gary-pulse 2s ease-in-out infinite',
            }}
          />
          Updated daily from real games
        </div>
      </div>

      {/* Recent wins ticker */}
      {wins.length > 0 && (
        <div
          style={{
            marginTop: 14,
            overflow: 'hidden',
            maskImage:
              'linear-gradient(90deg, transparent 0, black 8%, black 92%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(90deg, transparent 0, black 8%, black 92%, transparent 100%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 12,
              animation: `gary-marquee ${Math.max(20, wins.length * 5)}s linear infinite`,
              width: 'max-content',
            }}
          >
            {[...wins, ...wins].map((w, i) => (
              <div
                key={`${w.date}-${w.pick}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.22)',
                  padding: '7px 14px',
                  borderRadius: 999,
                  fontSize: '0.82rem',
                  color: 'rgba(255,255,255,0.85)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: '#22C55E', fontWeight: 700, fontSize: '0.72rem' }}>
                  WIN
                </span>
                <span style={{ color: '#B8953F', fontWeight: 600, fontSize: '0.72rem' }}>
                  {w.league}
                </span>
                <span>{w.pick}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes gary-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.85); }
        }
        @keyframes gary-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}
