'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageMasthead } from '@/components/Terminal';
import { supabaseBrowser } from '@/lib/auth/client';
import { readBookIntent } from '@/lib/auth/book-intent';
import { resetPasswordHref } from '@/lib/auth/redirect';
import { announceSessionHintChanged } from '@/lib/auth/session-hint';
import { logSignupCompleted, logSignupStarted } from '@/lib/gary/analytics';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

const field =
  `w-full rounded-chip border border-line bg-chip px-4 py-3 text-[15px] text-hi placeholder:text-low ${focusRing}`;

/**
 * Same identities as the iOS app (one GoTrue project): Google OAuth via the
 * redirect flow AuthManager already exercises live, plus email/password.
 * Apple's web flow joins once its service ID is configured in Supabase.
 */
export function SignInForm({
  initialMode,
  nextPath,
  initialError,
}: {
  initialMode: 'signin' | 'signup';
  nextPath: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Gold for guidance, red for failures — the app's two-tone message rule.
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const returnIntent = readBookIntent(new URL(nextPath, 'https://gary.local').search);

  function callbackUrl(signupMethod?: 'email' | 'google') {
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', nextPath);
    if (signupMethod) callback.searchParams.set('signup_method', signupMethod);
    return callback.toString();
  }

  async function google() {
    setBusy(true);
    setError(null);
    if (mode === 'signup') logSignupStarted('google');
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl(mode === 'signup' ? 'google' : undefined),
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
      logSignupStarted('email');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl('email') },
      });
      if (error) {
        setError(error.message);
      } else {
        if (data.session) {
          logSignupCompleted('email');
          announceSessionHintChanged();
          router.replace(nextPath);
          router.refresh();
        } else {
          setInfo(
            returnIntent
              ? 'Check your email to confirm your account. The confirmation link returns you to this pick; nothing is tracked until you confirm it.'
              : 'Check your email to confirm your account, then sign in.',
          );
        }
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
        announceSessionHintChanged();
        router.replace(nextPath);
        router.refresh();
      }
    }
    setBusy(false);
  }

  return (
    <>
      <PageMasthead
        title={mode === 'signup' ? 'Create your free account' : 'Sign in'}
        sub={
          mode === 'signup'
            ? 'Track Gary’s calls, build a verified record, and keep your Book ready on every visit.'
            : 'Welcome back. Open your Book and keep today’s calls with your verified record.'
        }
      />

      {mode === 'signup' && (
        <ul className="mt-5 grid max-w-2xl gap-2 text-[13.5px] text-mid sm:grid-cols-3">
          {['Tail or fade any call', 'Automatic final grading', 'Free web Book'].map(item => (
            <li key={item} className="flex items-center gap-2">
              <span aria-hidden className="text-gold">✓</span>
              {item}
            </li>
          ))}
        </ul>
      )}

      {returnIntent && (
        <p className="mt-5 max-w-md rounded-chip border border-gold/35 bg-chip px-4 py-3 text-[13.5px] leading-relaxed text-mid">
          Your <span className="font-semibold text-gold">{returnIntent.side}</span> is waiting. After {mode === 'signup' ? 'joining' : 'signing in'},
          you&apos;ll return to choose a stake and confirm it. Nothing is recorded automatically.
        </p>
      )}

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
          {mode === 'signup' && (
            <p className="font-mono text-[10px] text-low">Use at least 6 characters.</p>
          )}
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

        {mode === 'signin' && (
          <Link
            href={resetPasswordHref(nextPath)}
            className={`mt-4 block text-[13px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light ${focusRing}`}
          >
            Forgot your password?
          </Link>
        )}

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
    </>
  );
}
