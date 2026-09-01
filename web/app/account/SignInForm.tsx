'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/auth/client';
import { safeNextPath } from '@/lib/auth/redirect';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

const field =
  `w-full rounded-chip border border-line bg-chip px-4 py-3 text-[15px] text-hi placeholder:text-low ${focusRing}`;

/**
 * Same identities as the iOS app (one GoTrue project): Google OAuth via the
 * redirect flow AuthManager already exercises live, plus email/password.
 * Apple's web flow joins once its service ID is configured in Supabase.
 */
export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeNextPath(params.get('next'));
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Gold for guidance, red for failures — the app's two-tone message rule.
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    params.get('error') === 'signin' ? 'Sign-in couldn’t finish. Please try again.' : null,
  );

  function callbackUrl() {
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', nextPath);
    return callback.toString();
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl(),
        // Classic account chooser, not the passkey-first interstitial —
        // same call the app makes (founder, Aug 6).
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      setError('Google sign-in couldn’t open. Please try again.');
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = supabaseBrowser();
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) {
        setError(error.message);
      } else if (data.session) {
        router.replace(nextPath);
        router.refresh();
      } else {
        setInfo('Check your email to confirm your account, then sign in.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(
          error.message.toLowerCase().includes('confirm')
            ? 'Confirm your email first — check your inbox.'
            : 'Email or password is incorrect.',
        );
      } else {
        router.replace(nextPath);
        router.refresh();
      }
    }
    setBusy(false);
  }

  return (
    <div className="mt-7 max-w-md rounded-panel border border-line bg-card px-7 py-7">
      <button
        type="button"
        onClick={google}
        disabled={busy}
        className={`w-full rounded-chip border border-line bg-chip px-4 py-3 text-[15px] text-hi transition-colors hover:border-gold/50 disabled:opacity-50 ${focusRing}`}
      >
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-low">or email</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="account-email" className="sr-only">Email address</label>
        <input
          id="account-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={field}
        />
        <label htmlFor="account-password" className="sr-only">Password</label>
        <input
          id="account-password"
          name="password"
          type="password"
          required
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder="Password"
          minLength={6}
          value={password}
          onChange={e => setPassword(e.target.value)}
          className={field}
        />
        <button
          type="submit"
          disabled={busy}
          className={`w-full rounded-chip bg-gold px-4 py-3 text-[15px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50 ${focusRing}`}
        >
          {mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {error && <p role="alert" className="mt-4 text-[13.5px] text-red-400">{error}</p>}
      {info && <p role="status" className="mt-4 text-[13.5px] text-gold">{info}</p>}

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setInfo(null);
        }}
        className={`mt-5 text-[13.5px] text-mid transition-colors hover:text-gold-light ${focusRing}`}
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
