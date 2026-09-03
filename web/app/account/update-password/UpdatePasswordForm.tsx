'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/auth/client';
import { announceSessionHintChanged } from '@/lib/auth/session-hint';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink';
const field =
  `w-full rounded-chip border border-line bg-chip px-4 py-3 text-[15px] text-hi placeholder:text-low ${focusRing}`;

export function UpdatePasswordForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabaseBrowser().auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message || 'Your password could not be updated. Please try again.');
      setBusy(false);
      return;
    }

    announceSessionHintChanged();
    router.replace(nextPath === '/account' ? '/account?password=updated' : nextPath);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-7 max-w-md space-y-3 rounded-panel border border-line bg-card px-7 py-7">
      <label htmlFor="new-password" className="sr-only">New password</label>
      <input
        id="new-password"
        name="new-password"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="New password"
        value={password}
        onChange={event => setPassword(event.target.value)}
        className={field}
      />
      <label htmlFor="confirm-password" className="sr-only">Confirm new password</label>
      <input
        id="confirm-password"
        name="confirm-password"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="Confirm new password"
        value={confirmation}
        onChange={event => setConfirmation(event.target.value)}
        className={field}
      />
      <p className="font-mono text-[10px] text-low">Use at least 6 characters.</p>
      <button
        type="submit"
        disabled={busy}
        className={`w-full rounded-chip bg-gold px-4 py-3 text-[15px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50 ${focusRing}`}
      >
        {busy ? 'Updating…' : 'Update password'}
      </button>
      {error && <p role="alert" className="text-[13.5px] text-red-400">{error}</p>}
    </form>
  );
}
