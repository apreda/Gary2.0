'use client';

import { useState } from 'react';
import { logShareCompleted, logShareStarted } from '@/lib/gary/analytics';

type ShareActionsProps = {
  title: string;
  text: string;
  url: string;
  surface: string;
  contentType: string;
  itemId?: string;
  className?: string;
};

type ShareMethod = 'native' | 'copy' | 'copy_fallback';

function campaignName(surface: string): string {
  const value = surface
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return value || 'site';
}

/** Adds aggregate referral attribution without adding a person-level identifier. */
export function buildReferralShareUrl(url: string, origin: string, surface: string): string {
  const shared = new URL(url, origin);
  shared.hash = '';
  shared.searchParams.set('utm_source', 'gary');
  shared.searchParams.set('utm_medium', 'referral');
  shared.searchParams.set('utm_campaign', campaignName(surface));
  return shared.toString();
}

async function copyText(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Permission policies can expose Clipboard while denying writes. Fall
      // through to the selection-based browser fallback.
    }
  }

  // Older browsers and non-secure preview origins may not expose Clipboard.
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.focus();
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  activeElement?.focus();
  return copied;
}

export function ShareActions({
  title,
  text,
  url,
  surface,
  contentType,
  itemId,
  className = '',
}: ShareActionsProps) {
  const [busy, setBusy] = useState<ShareMethod | null>(null);
  const [status, setStatus] = useState('');

  function analyticsProps(sharedUrl: string) {
    return {
      surface,
      content_type: contentType,
      ...(itemId ? { item_id: itemId } : {}),
      path: new URL(sharedUrl).pathname,
    };
  }

  async function copy(method: Extract<ShareMethod, 'copy' | 'copy_fallback'>) {
    const sharedUrl = buildReferralShareUrl(url, window.location.origin, surface);
    const props = analyticsProps(sharedUrl);
    setBusy(method);
    setStatus('');
    logShareStarted('copy_link', props);

    try {
      if (!(await copyText(sharedUrl))) throw new Error('Copy command was unavailable.');
      logShareCompleted('copy_link', props);
      setStatus('Link copied.');
    } catch {
      setStatus('Could not copy automatically. Select the address in your browser to share it.');
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (typeof navigator.share !== 'function') {
      await copy('copy_fallback');
      return;
    }

    const sharedUrl = buildReferralShareUrl(url, window.location.origin, surface);
    const props = analyticsProps(sharedUrl);
    setBusy('native');
    setStatus('');
    logShareStarted('native', props);

    try {
      await navigator.share({ title, text, url: sharedUrl });
      logShareCompleted('native', props);
      setStatus('Shared.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('Share canceled.');
      } else {
        setBusy(null);
        await copy('copy_fallback');
        return;
      }
    } finally {
      setBusy(null);
    }
  }

  const buttonClass =
    'inline-flex min-h-11 items-center justify-center rounded-card border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.05em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:cursor-wait disabled:opacity-60';

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={share}
          disabled={busy !== null}
          className={`${buttonClass} border-gold/50 bg-gold text-ink hover:bg-gold-light`}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
            <path d="M12 16V3m0 0L7 8m5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {busy === 'native' ? 'Opening share…' : 'Share'}
        </button>
        <button
          type="button"
          onClick={() => void copy('copy')}
          disabled={busy !== null}
          className={`${buttonClass} border-gold/40 text-gold hover:border-gold/70 hover:text-gold-light`}
        >
          {busy === 'copy' || busy === 'copy_fallback' ? 'Copying…' : 'Copy link'}
        </button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 font-mono text-[10.5px] text-low">
        {status}
      </p>
    </div>
  );
}
