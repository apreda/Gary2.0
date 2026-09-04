import Link from 'next/link';
import { Disclosure } from '@/components/Disclosure';
import { ScoutRead } from '@/components/ScoutRead';
import { TailFadeRow } from '@/components/book/TailFadeRow';
import { sportByCode } from '@/lib/gary/leagues';
import { gameBookTrackingUnavailableReason } from '@/lib/book/model';
import { etTime, marketLine, oddsText, parseGameTime, pickDropTime, scoutSectionsExcluding } from '@/lib/gary/format';
import type { BoardGame } from '@/lib/gary/board';

/** The gold slab that opens every section in the app (BroadcastBar). */
export function Slab({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-[13px] w-[4px] -skew-x-[12deg] bg-gold ${className}`} />;
}

/**
 * One wire line — club in the display face, its price alongside. Gary's side
 * wears the gold; the other stays warm white with a quiet price, so the call
 * is legible before you read a word of it.
 */
function WireLine({ name, price, live }: { name: string; price?: string | null; live: boolean }) {
  const odds = oddsText(price);
  return (
    <div className="flex items-baseline gap-2.5">
      <span
        className={`font-display text-[clamp(1.55rem,4.2vw,2.1rem)] uppercase leading-[1.06] ${
          live ? 'text-gold' : 'text-hi'
        }`}
      >
        {name}
      </span>
      {odds && (
        <span className={`tnum font-display text-[clamp(1rem,2.6vw,1.3rem)] ${live ? 'text-hi/90' : 'text-low'}`}>
          {odds}
        </span>
      )}
    </div>
  );
}

/** Case-safe "is this club the one Gary called?" — matched on the FULL club
 *  name, never a trailing token, so Red Sox can't answer for White Sox. */
function calledSide(pickText: string | undefined, club: string): boolean {
  if (!pickText || !club) return false;
  return pickText.toLowerCase().includes(club.toLowerCase());
}

/**
 * A game on the board. Every slate game renders — with Gary's call when it has
 * posted, and with the time it posts when it hasn't. Same anatomy as the app's
 * UP NEXT hero: wire lines, the rest of the market underneath, the call in
 * gold, the reasoning below it.
 */
export function GameRow({ game, now, analysisHref }: { game: BoardGame; now?: number; analysisHref?: string | null }) {
  const { pick } = game;
  const started =
    now != null && (parseGameTime(game.commence)?.getTime() ?? Number.MAX_SAFE_INTEGER) <= now;
  const accent = sportByCode(game.league)?.accent;
  const time = etTime(game.commence);
  const drop = pickDropTime(game.commence);
  const conf = pick?.confidence ? Math.round(pick.confidence * 100) : null;
  const market = marketLine({
    total: game.total,
    spread: game.spread,
    mlHome: game.mlHome,
    mlAway: game.mlAway,
    homeAbbr: game.home,
    awayAbbr: game.away,
    league: game.league,
  });

  const pickLabel = (pick?.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim();
  const pickOdds = oddsText(pick?.odds ?? (pick?.pick ?? '').match(/[+-]\d{3,}\s*$/)?.[0]);
  const plain = pick?.rationale_plain?.trim();
  const full = pick?.rationale?.trim();
  // The plain read leads; the analysis hides behind the disclosure. When only
  // one of the two exists it leads and nothing is hidden — never an empty
  // "full analysis" that opens onto the same words.
  const lead = plain || full;
  const deeperSections = plain && full && full !== plain ? scoutSectionsExcluding(full, plain) : [];

  return (
    <article className="quant-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line px-5 py-3">
        <span className="flex items-center gap-2.5">
          <Slab />
          <span className="tnum font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-hi">
            {time ?? 'TBD'}
          </span>
          <span className="flex items-center gap-1.5">
            {accent && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
              {game.league}
            </span>
          </span>
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em]">
          {pick ? (
            <span className="text-gold">Gary&apos;s call is in</span>
          ) : started ? (
            // Never promise a posting time that has already passed.
            <span className="text-faint">No call posted</span>
          ) : (
            <span className="text-low">{drop ? `Pick posts ~${drop}` : 'Pick pending'}</span>
          )}
        </span>
      </div>

      <div className="px-5 py-4">
        <WireLine name={game.away} price={game.mlAway} live={calledSide(pick?.pick, game.away)} />
        <WireLine name={game.home} price={game.mlHome} live={calledSide(pick?.pick, game.home)} />
        {market && (
          <p className="tnum mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-faint">
            {market}
          </p>
        )}

        {pick && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2.5">
              <span className="flex min-w-0 items-center justify-between gap-3 rounded-chip border border-gold/70 bg-chip px-4 py-2.5">
                <span className="font-mono text-[13px] font-bold tracking-[0.03em] text-gold">{pickLabel}</span>
                {pickOdds && <span className="tnum font-mono text-[13px] font-bold text-low">{pickOdds}</span>}
              </span>
              {conf !== null && (
                <span className="flex w-[190px] items-center gap-2">
                  <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-low">Conf</span>
                  <span className="h-1 flex-1 rounded bg-white/10">
                    <span className="block h-1 rounded bg-gold" style={{ width: `${conf}%` }} />
                  </span>
                  <span className="tnum font-mono text-[11px] text-mid">{conf}%</span>
                </span>
              )}
            </div>

            {lead && <ScoutRead text={lead} tone="tight" className="mt-3.5" />}
            {deeperSections.length > 0 && (
              <Disclosure summary="The full analysis" className="mt-4">
                <ScoutRead sections={deeperSections} tone="tight" />
              </Disclosure>
            )}
            {analysisHref && (
              <p className="mt-4 text-[13px] leading-relaxed">
                <Link
                  href={analysisHref}
                  className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
                >
                  {pick.awayTeam} at {pick.homeTeam}: pick and full analysis
                </Link>
              </p>
            )}
            {/* Renders only inside a BookDayProvider — board pages opt in. */}
            <TailFadeRow
              pickText={pick.pick ?? ''}
              pickId={pick.pick_id}
              commence={game.commence}
              trackingUnavailableReason={gameBookTrackingUnavailableReason(game.league)}
            />
          </>
        )}
      </div>
    </article>
  );
}
