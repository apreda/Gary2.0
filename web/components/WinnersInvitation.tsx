import Link from 'next/link';

/** The approved Winners sentence (homepage Offering card). Reused verbatim so every page says the same thing. */
export const WINNERS_INVITATION_BODY =
  'Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most.';

/**
 * One quiet invitation after useful content — never inside a card, never a
 * modal. Winners is a selection from the published picks; being selected is
 * not a result.
 */
export function WinnersInvitation({ className = '' }: { className?: string }) {
  return (
    <aside aria-labelledby="winners-invitation-heading" className={`rounded-panel border border-line bg-card p-5 ${className}`.trim()}>
      <p id="winners-invitation-heading" className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Gary’s best bets</p>
      <p className="mt-2 text-[14px] leading-relaxed text-mid">{WINNERS_INVITATION_BODY}</p>
      <Link href="/winners" className="mt-3 inline-block text-[13.5px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light">
        See Winners
      </Link>
    </aside>
  );
}
