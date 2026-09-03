'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/auth/client';
import { accountHref } from '@/lib/auth/redirect';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

export function ResetPasswordForm({ nextPath, expired }: { nextPath: string; expired: boolean }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const update = new URL('/account/update-password', window.location.origin);
    update.searchParams.set('next', nextPath);
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('flow', 'recovery');
    callback.searchParams.set('next', `${update.pathname}${update.search}`);

    const { error: resetError } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: callback.toString(),
    });
    if (resetError) {
      setError('The reset email could not be sent right now. Please wait a moment and try again.');
    } else {
      setSent(true);
    }
    setBusy(false);
  }

  return (
    <div className="mt-7 max-w-md rounded-panel border border-line bg-card px-7 py-7">
      {expired && (
        <p role="alert" className="mb-5 rounded-chip border border-loss/30 bg-chip px-4 py-3 text-[13.5px] text-red-300">
          That reset link is invalid or has expired. Request a fresh one below.
        </p>
      )}

      {sent ? (
        <div role="status">
          <p className="text-[15px] font-medium text-hi">Check your email.</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-mid">
            If an account exists for {email}, a reset link is on its way. You&apos;ll return to Gary after choosing a new password.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="reset-email" className="sr-only">Email address</label>
          <input
            id="reset-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
            className={`w-full rounded-chip border border-line bg-chip px-4 py-3 text-[15px] text-hi placeholder:text-low ${focusRing}`}
          />
          <button
            type="submit"
            disabled={busy}
            className={`w-full rounded-chip bg-gold px-4 py-3 text-[15px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50 ${focusRing}`}
          >
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-4 text-[13.5px] text-red-400">{error}</p>}
      <Link
        href={accountHref(nextPath)}
        className={`mt-5 inline-block text-[13px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light ${focusRing}`}
      >
        Back to sign in
      </Link>
    </div>
  );
}
