'use client';

import { useEffect, useRef, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/auth/client';
import { canFinishAccountDeletion, clearDeletedAccountSession, requestAccountDeletion } from '@/lib/auth/account-deletion';
import { announceSessionHintChanged } from '@/lib/auth/session-hint';
import { deletionSuccessHref } from '@/lib/auth/deletion-result';
import { bookButton, bookField } from './LogBet';

type ObservedAccount = { id: string | null; epoch: number };
type DeletionAction = { account: ObservedAccount; finishing: boolean };

export function DeleteAccount({ ownerId }: { ownerId: string }) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<ObservedAccount | null>(null);
  const observed = useRef<ObservedAccount | null>(null);
  const action = useRef<DeletionAction | null>(null);
  useEffect(() => {
    let active = true;
    const { data } = supabaseBrowser().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!active || observed.current?.id === (session?.user.id ?? null)) return;
      const next = { id: session?.user.id ?? null, epoch: (observed.current?.epoch ?? 0) + 1 };
      // A completed deletion may already have lost its session. A replacement identity
      // always invalidates the action, including an A→B→A round trip.
      if (!(action.current?.finishing && next.id === null)) action.current = null;
      observed.current = next;
      setAccount(next); setConfirmation(''); setBusy(false); setError(null);
    });
    return () => { active = false; observed.current = null; action.current = null; data.subscription.unsubscribe(); };
  }, [ownerId]);
  const ready = account?.id === ownerId;

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmation !== 'DELETE' || busy || !ready || !account || observed.current !== account || action.current) return;
    const operation = { account, finishing: false };
    action.current = operation;
    const isCurrent = () => action.current === operation;
    setBusy(true);
    setError(null);
    try {
      const { data, error: failure } = await requestAccountDeletion(ownerId, isCurrent);
      if (!isCurrent()) return;
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
        if (!isCurrent()) return;
        if (signedOut) {
          operation.finishing = true;
          if (!await clearDeletedAccountSession(ownerId, isCurrent)) {
            if (isCurrent()) setError('Account deletion did not finish. Refresh this page and sign in again to retry.');
            return;
          }
          if (!canFinishAccountDeletion(isCurrent)) return;
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
      if (data.deleted !== ownerId) throw new Error('Account deletion could not be verified. Refresh this page before retrying.');
      operation.finishing = true;
      if (!await clearDeletedAccountSession(ownerId, isCurrent)) {
        if (isCurrent()) setError('Your account was deleted. Refresh this page to continue.');
        return;
      }
      if (!canFinishAccountDeletion(isCurrent)) return;
      try {
        window.sessionStorage.removeItem('userUnitDollars');
      } catch {
        /* Optional storage. */
      }
      announceSessionHintChanged();
      window.location.assign(deletionSuccessHref(data));
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : 'Account deletion could not finish.');
    } finally {
      if (isCurrent()) { action.current = null; setBusy(false); }
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
            disabled={busy || !ready}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !ready || confirmation !== 'DELETE'}
          className={`${bookButton} mt-4 border-loss/50 text-loss`}
        >
          {busy ? 'Deleting account…' : 'Permanently delete my account'}
        </button>
        {!ready && (
          <p role="status" className="mt-3 text-[12px] text-mid">
            {account ? 'Your account changed. ' : 'Confirming your account. '}
            <a href="/account" className="underline">Refresh this page before deleting an account.</a>
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[12px] text-loss">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
