'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchBlockedProfiles, setProfileBlock, type BlockedProfile } from '@/lib/book/profile-safety';
import { bookButton } from './LogBet';

export function BlockedProfiles({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BlockedProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const epoch = useRef(0);
  useEffect(() => () => { epoch.current += 1; }, []);
  const load = async () => {
    const request = ++epoch.current;
    setOpen(true); setError(null); setRows(null);
    try { const next = await fetchBlockedProfiles(); if (request === epoch.current) setRows(next); }
    catch (e) { if (request === epoch.current) setError(e instanceof Error ? e.message : 'Blocked players could not load.'); }
  };
  const unblock = async (id: string) => {
    if (busy) return;
    const request = epoch.current;
    setBusy(id); setError(null);
    try {
      await setProfileBlock(id, false);
      if (request !== epoch.current) return;
      setRows(previous => previous?.filter(row => row.user_id !== id) ?? null); onChange();
    } catch (e) { if (request === epoch.current) setError(e instanceof Error ? e.message : 'This change could not be confirmed. Please retry.'); }
    finally { if (request === epoch.current) setBusy(null); }
  };
  return <div className="border-t border-line px-5 py-4 text-[13px] text-mid">
    <button className="text-gold underline" disabled={busy != null} aria-expanded={open} onClick={() => {
      if (open) { epoch.current += 1; setOpen(false); setBusy(null); } else void load();
    }}>Blocked players</button>
    {open && <div className="mt-3 space-y-3">
      {!rows && !error && <p role="status">Loading blocked players…</p>}
      {rows?.length === 0 && <p>You have not blocked any players.</p>}
      {rows?.map(row => <div key={row.user_id} className="flex items-center justify-between gap-4">
        <span>{row.display_name}</span>
        <button className={bookButton} disabled={busy != null} aria-label={`Unblock ${row.display_name}`} onClick={() => void unblock(row.user_id)}>Unblock</button>
      </div>)}
      {error && <div><p role="alert" className="text-loss">{error}</p>{!rows && <button className={`${bookButton} mt-2`} onClick={() => void load()}>Retry</button>}</div>}
    </div>}
  </div>;
}
