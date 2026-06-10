'use client';

import { useEffect, useState } from 'react';
import { SPORTS } from '@/lib/gary/leagues';
import { PRICING } from '@/lib/gary/pricing';
import { APP_STORE_URL } from '@/components/AppStoreButton';
import { logEvent } from '@/lib/gary/analytics';

type Sel = { plan: 'all_access' | 'all_access_annual' | 'single' | 'world_cup'; sport?: string };

export function PricingPlans({
  recordsByLeague = {},
}: {
  recordsByLeague?: Record<string, { wins: number; losses: number }>;
}) {
  const [sel, setSel] = useState<Sel>({ plan: 'all_access' });

  useEffect(() => {
    logEvent('paywall_viewed', { surface: 'web', trigger: 'pricing_page' });
  }, []);

  function pick(next: Sel) {
    setSel(next);
    const billing =
      next.plan === 'world_cup' ? 'one_time' : next.plan === 'all_access_annual' ? 'annual' : 'monthly';
    logEvent('plan_selected', { ...next, surface: 'web', billing });
  }

  function unlock() {
    logEvent('checkout_started', { ...sel, surface: 'web_pricing' });
    // Entitlements key on the app identity, so the canonical purchase path is
    // the app. The web page sells + proves; the app closes.
    window.location.href = APP_STORE_URL;
  }

  const isSel = (plan: Sel['plan'], sport?: string) => sel.plan === plan && sel.sport === sport;
  const singles = SPORTS.filter(s => s.code !== 'WC');

  return (
    <div>
      {/* All-Access — the anchor */}
      <button
        onClick={() => pick({ plan: 'all_access' })}
        className={`relative flex w-full items-center gap-4 rounded-panel border bg-card p-5 text-left transition-colors ${
          isSel('all_access') ? 'border-gold/70 shadow-[0_0_0_1px_rgba(201,162,39,0.35)]' : 'border-line hover:border-white/25'
        }`}
      >
        <span className="absolute -top-2.5 left-4 rounded-md bg-gold px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.04em] text-ink">
          Best value · {PRICING.trialDays} days free
        </span>
        <Radio on={isSel('all_access')} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-bold tracking-[0.04em] text-hi">ALL-ACCESS</div>
          <div className="mt-1 text-[13px] text-mid">Every sport&apos;s Winners board — the plays Gary backs</div>
        </div>
        <div className="text-right">
          <div className="tnum font-mono text-lg font-bold text-gold">{PRICING.allAccessMonthly}</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.04em] text-low">per month</div>
        </div>
      </button>

      {/* All-Access annual — the committed-bettor rate, half the monthly run-rate */}
      <button
        onClick={() => pick({ plan: 'all_access_annual' })}
        className={`relative mt-4 flex w-full items-center gap-4 rounded-panel border bg-card p-5 text-left transition-colors ${
          isSel('all_access_annual') ? 'border-gold/70 shadow-[0_0_0_1px_rgba(201,162,39,0.35)]' : 'border-line hover:border-white/25'
        }`}
      >
        <span className="absolute -top-2.5 left-4 rounded-md bg-gold px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.04em] text-ink">
          Save 50% vs monthly
        </span>
        <Radio on={isSel('all_access_annual')} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-bold tracking-[0.04em] text-hi">ALL-ACCESS — ANNUAL</div>
          <div className="mt-1 text-[13px] text-mid">
            Every board, all year · works out to {PRICING.allAccessAnnualMonthly}/mo
          </div>
        </div>
        <div className="text-right">
          <div className="tnum font-mono text-lg font-bold text-gold">{PRICING.allAccessAnnual}</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.04em] text-low">per year</div>
        </div>
      </button>

      {/* Single sports — sold per board, the natural yes for a one-sport bettor */}
      <div className="mt-7">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-low">
          Single sports — {PRICING.single}/mo each
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {singles.map(s => {
            const rec = recordsByLeague[s.code];
            const on = isSel('single', s.code);
            return (
              <button
                key={s.code}
                onClick={() => pick({ plan: 'single', sport: s.code })}
                className={`flex flex-col gap-1.5 rounded-card border bg-card p-3.5 text-left transition-colors ${
                  on ? 'border-gold/70 shadow-[0_0_0_1px_rgba(201,162,39,0.35)]' : 'border-line hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.accent }} />
                    <span className="font-mono text-[11.5px] font-bold tracking-[0.04em] text-hi">{s.code}</span>
                  </span>
                  <Mark on={on} />
                </div>
                <span className="text-[11.5px] text-low">Winners board</span>
                <span className="flex items-baseline gap-0.5">
                  <span className="font-mono text-[13px] font-bold text-gold">{PRICING.single}</span>
                  <span className="font-mono text-[9px] text-white/35">/mo</span>
                </span>
                {rec && rec.wins + rec.losses > 0 && (
                  <span className="tnum font-mono text-[10px] text-low">
                    <span className={rec.wins >= rec.losses ? 'text-win' : 'text-loss'}>
                      {rec.wins}–{rec.losses}
                    </span>{' '}
                    last 30
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* World Cup — one-time on-ramp */}
      <button
        onClick={() => pick({ plan: 'world_cup' })}
        className={`relative mt-6 flex w-full items-center gap-4 rounded-panel border bg-card p-5 text-left transition-colors ${
          isSel('world_cup') ? 'border-wc shadow-[0_0_0_1px_rgba(20,184,166,0.4)]' : 'border-line hover:border-white/25'
        }`}
      >
        <span className="absolute -top-2.5 left-4 rounded-md bg-wc px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.04em] text-ink">
          Kicks off June 11
        </span>
        <Radio on={isSel('world_cup')} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-bold tracking-[0.04em] text-hi">WORLD CUP PASS</div>
          <div className="mt-1 text-[13px] text-mid">All 104 matches · one-time, no renewal</div>
        </div>
        <div className="text-right">
          <div className="tnum font-mono text-lg font-bold text-gold">{PRICING.worldCup}</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.04em] text-low">one-time</div>
        </div>
      </button>

      {/* CTA */}
      <div className="mt-7 flex flex-col items-center gap-2">
        <button
          onClick={unlock}
          className="w-full rounded-panel bg-gold py-4 font-mono text-sm font-bold tracking-[0.04em] text-ink transition-opacity hover:opacity-90"
        >
          {ctaLabel(sel)}
        </button>
        <p className="text-center text-[12px] text-low">
          {ctaCaption(sel)}
        </p>
        <p className="text-center text-[11px] text-low">
          Plans bill through Stripe and cancel anytime. The free slate stays free — always.
        </p>
      </div>
    </div>
  );
}

function ctaLabel(sel: Sel): string {
  if (sel.plan === 'all_access') return `START ${PRICING.trialDays}-DAY FREE TRIAL IN THE APP`;
  if (sel.plan === 'all_access_annual') return `START FREE TRIAL — ${PRICING.allAccessAnnual}/YR IN THE APP`;
  if (sel.plan === 'world_cup') return 'GET THE WORLD CUP PASS IN THE APP';
  return `UNLOCK ${sel.sport} WINNERS — ${PRICING.single}/MO`;
}

function ctaCaption(sel: Sel): string {
  if (sel.plan === 'all_access') return `${PRICING.trialDays} days free, then ${PRICING.allAccessMonthly}/mo. Manage anytime in the app.`;
  if (sel.plan === 'all_access_annual')
    return `${PRICING.trialDays} days free, then ${PRICING.allAccessAnnual}/yr — ${PRICING.allAccessAnnualMonthly}/mo. Manage anytime in the app.`;
  if (sel.plan === 'world_cup') return `${PRICING.worldCup} once. No renewal — yours for all 104 matches.`;
  return `Every ${sel.sport} play Gary backs — the Winners board. ${PRICING.single}/mo, cancel anytime.`;
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-[1.5px] ${
        on ? 'border-gold bg-gold' : 'border-white/25'
      }`}
    >
      {on && <span className="font-mono text-[11px] font-bold text-ink">✓</span>}
    </span>
  );
}

function Mark({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-[17px] w-[17px] flex-none items-center justify-center rounded-full border-[1.5px] ${
        on ? 'border-gold bg-gold' : 'border-white/20'
      }`}
    >
      {on && <span className="font-mono text-[8px] font-bold text-ink">✓</span>}
    </span>
  );
}
