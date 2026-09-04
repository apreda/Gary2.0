'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/auth/client';
import { announceSessionHintChanged } from '@/lib/auth/session-hint';
import { deletionSuccessHref } from '@/lib/auth/deletion-result';
import { bookButton, bookField } from './LogBet';

export function DeleteAccount() {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmation !== 'DELETE' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = supabaseBrowser();
      const { data, error: failure } = await client.functions.invoke('delete-account', { body: {} });
      if (failure || data?.error || data?.ok !== true) {
        let reason: unknown = data?.error;
        let signedOut = data?.signed_out === true;
        if (failure?.context instanceof Response) {
          try {
            const response = await failure.context.json();
            reason = response.error;
            signedOut = response.signed_out === true;
          } catch {
            /* Use the fallback. */
          }
        }
        if (signedOut) {
          await client.auth.signOut({ scope: 'local' });
          announceSessionHintChanged();
          window.location.assign('/account?error=deletion');
          return;
        }
        throw new Error(
          typeof reason === 'string' && reason.length < 300
            ? reason
            : 'Account deletion could not finish. Please retry.',
        );
      }
      await client.auth.signOut({ scope: 'local' });
      try {
        window.sessionStorage.removeItem('userUnitDollars');
      } catch {
        /* Optional storage. */
      }
      announceSessionHintChanged();
      window.location.assign(deletionSuccessHref(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Account deletion could not finish.');
      setBusy(false);
    }
  };
  return (
    <details className="mt-7 rounded-panel border border-line bg-card p-5">
      <summary className="cursor-pointer text-[13px] text-loss">Delete account</summary>
      <form onSubmit={remove} className="mt-4 max-w-xl">
        <p className="text-[13px] leading-relaxed text-mid">
          Permanently delete your profile, saved bets, notes, preferences, and leaderboard record. Any active
          paid subscriptions are canceled as part of deletion. This cannot be undone.
        </p>
        <label className="mt-4 block text-[12px] text-mid">
          Type DELETE to confirm
          <input
            className={bookField}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        <button
          type="submit"
          disabled={busy || confirmation !== 'DELETE'}
          className={`${bookButton} mt-4 border-loss/50 text-loss`}
        >
          {busy ? 'Deleting account…' : 'Permanently delete my account'}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-[12px] text-loss">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
