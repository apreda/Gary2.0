'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fetchAccess, openBilling, type WinnersAccess } from '@/lib/book/access';
import { PRICING } from '@/lib/gary/pricing';
import { accountHref } from '@/lib/auth/redirect';
import { useSupabaseSessionHint } from '@/lib/auth/session-hint';
import { bookButton, bookField } from './LogBet';
import { supabaseBrowser } from '@/lib/auth/client';

export function AccessCard({ initial }: { initial?: WinnersAccess }) {
  const [access, setAccess] = useState(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sessionVersion = useRef(0);
  const [plan, setPlan] = useState('MLB');
  const signedIn = useSupabaseSessionHint();
  useEffect(() => {
    const refresh = () => {
      sessionVersion.current += 1;
      setAccess(null);
      setError(null);
      setAttempt((n) => n + 1);
    };
    const { data: auth } = supabaseBrowser().auth.onAuthStateChange((event: string) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) refresh();
    });
    window.addEventListener('focus', refresh);
    return () => {
      auth.subscription.unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    if (initial && attempt === 0) return;
    let cancelled = false;
    const version = sessionVersion.current;
    fetchAccess()
      .then((a) => {
        if (!cancelled && version === sessionVersion.current) {
          setAccess(a);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled && version === sessionVersion.current) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [initial, attempt]);
  const open = async (portal = false) => {
    setBusy(true);
    setError(null);
    try {
      await openBilling(
        portal ? 'portal' : 'checkout',
        plan.startsWith('ALL') ? { plan } : { leagues: [plan] },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Billing could not open.');
      setBusy(false);
    }
  };
  const entitled = access && (access.preview || access.founding || access.sports.length > 0);
  const covered =
    access?.sports.includes(plan) ||
    access?.sports.includes('ALL') ||
    (plan.startsWith('ALL') && ['MLB', 'NFL', 'NBA', 'NCAAF'].every((s) => access?.sports.includes(s)));
  return (
    <section className="rounded-panel border border-gold/30 bg-card p-5 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-widest text-gold">Your membership</p>
      <h2 className="mt-2 font-display text-2xl text-hi">
        {access?.founding
          ? 'Founding member'
          : access?.preview
            ? 'Winners preview'
            : entitled
              ? 'Winners is yours'
              : 'Free account. Full Book.'}
      </h2>
      {access ? (
        <>
          <p className="mt-2 text-[13px] leading-relaxed text-mid">
            {access.founding
              ? 'Your founding access includes Winners. Your profile, tracker, streaks, and leaderboard remain free.'
              : access.preview
                ? `Winners is open during the launch preview, through ${new Date(Date.parse(access.preview_until) - 1).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric' })}. Explore the boards with no purchase required.`
                : access.sports.length
                  ? `Winners access: ${access.sports.join(', ')}. Your free Book, profile, picks, and leaderboard are included.`
                  : 'Full picks, reasoning, your profile, the bet tracker, and leaderboards stay free. A Winners plan unlocks Gary’s reviewed boards for the sports you choose.'}
          </p>
          <Link
            href="/winners"
            className="mt-4 inline-block text-[13px] text-gold underline underline-offset-4"
          >
            Open Winners →
          </Link>
          {access.subscriptions.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {access.subscriptions.map((s, i) => (
                <li key={`${s.product_key}-${i}`} className="text-[12px] text-mid">
                  {s.product_key} · {s.status}
                  {s.expires_at
                    ? ` · ${s.cancel_at_period_end ? 'access ends' : 'through'} ${new Date(s.expires_at).toLocaleDateString('en-US')}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
          {access.can_manage && (
            <button disabled={busy} onClick={() => open(true)} className={`${bookButton} mt-4`}>
              {busy ? 'Opening…' : 'Manage billing'}
            </button>
          )}
          {!access.preview && !access.founding && (
            <div className="mt-5 border-t border-line pt-5">
              <label className="text-[12px] text-mid">
                Choose Winners access
                <select className={bookField} value={plan} onChange={(e) => setPlan(e.target.value)}>
                  {['MLB', 'NFL', 'NBA', 'NCAAF'].map((s) => (
                    <option key={s} value={s}>
                      {s} · {PRICING.single}/month
                    </option>
                  ))}
                  <option value="ALL">All sports · {PRICING.allAccessMonthly}/month</option>
                  <option value="ALL_ANNUAL">All sports · {PRICING.allAccessAnnual}/year</option>
                </select>
              </label>
              {signedIn ? (
                <button
                  disabled={busy || !!covered}
                  onClick={() => open()}
                  className="mt-3 rounded-chip bg-gold px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50"
                >
                  {covered
                    ? 'Included in your plan'
                    : busy
                      ? 'Opening checkout…'
                      : 'Continue to secure checkout'}
                </button>
              ) : (
                <Link
                  href={accountHref('/winners', 'signup')}
                  className="mt-3 inline-block rounded-chip bg-gold px-4 py-2.5 text-[13px] font-semibold text-ink"
                >
                  Sign in to choose a plan
                </Link>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-low">
                Review the final price and renewal terms at checkout. Existing access is checked before a new
                subscription is created.
              </p>
            </div>
          )}
        </>
      ) : (
        !error && (
          <p role="status" className="mt-3 text-sm text-mid">
            Checking your access…
          </p>
        )
      )}
      {error && (
        <div className="mt-3">
          <p role="alert" className="text-[12px] text-loss">
            {error}
          </p>
          {!access && (
            <button className={`${bookButton} mt-3`} onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
}
