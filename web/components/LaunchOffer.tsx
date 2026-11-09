import Link from 'next/link';
import { accountHref } from '@/lib/auth/redirect';
import { isLaunchPreview, LAUNCH_OFFER, WINNERS_IS_FREE } from '@/lib/gary/launch-offer';

export function LaunchOffer({ className = '' }: { className?: string }) {
  const preview = isLaunchPreview();
  if (WINNERS_IS_FREE) {
    return (
      <aside className={`rounded-card border border-gold/30 bg-card p-5 ${className}`}>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">Free right now</p>
        <p className="mt-2 text-[14px] leading-relaxed text-mid">
          {LAUNCH_OFFER} Paid plans come later, and this page will say so before they do.
        </p>
        <Link href="/winners" className="mt-3 inline-block text-sm text-gold underline underline-offset-4">
          See today&apos;s Winners →
        </Link>
      </aside>
    );
  }
  return (
    <aside className={`rounded-card border border-gold/30 bg-card p-5 ${className}`}>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">
        {preview ? 'Founding access is open' : 'Your account owns your access'}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-mid">
        {preview ? LAUNCH_OFFER : 'Accounts created before October 1, 2026 at midnight Eastern retain founding access to Winners. Other accounts can choose a Winners plan. Your full picks, reasoning and Book stay free.'}
      </p>
      <Link href={accountHref('/winners', preview ? 'signup' : 'signin')} className="mt-3 inline-block text-sm text-gold underline underline-offset-4">
        {preview ? 'Create your free account →' : 'Check your Winners access →'}
      </Link>
    </aside>
  );
}
