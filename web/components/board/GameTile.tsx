import { sportByCode } from '@/lib/gary/leagues';
import { etTime, marketLine, oddsText, parseGameTime, pickDropTime } from '@/lib/gary/format';
import type { BoardGame } from '@/lib/gary/board';

/** Case-safe "is this club the one Gary called?" — full club name, never a
 *  trailing token, so Red Sox can't answer for White Sox. */
function calledSide(pickText: string | undefined, club: string): boolean {
  if (!pickText || !club) return false;
  return pickText.toLowerCase().includes(club.toLowerCase());
}

function ClubLine({ name, price, live }: { name: string; price?: string | null; live: boolean }) {
  const odds = oddsText(price);
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={`truncate font-display text-[1.15rem] uppercase leading-[1.15] ${
          live ? 'text-gold' : 'text-hi'
        }`}
      >
        {name}
      </span>
      {odds && <span className="tnum shrink-0 font-mono text-[11px] font-bold text-low">{odds}</span>}
    </div>
  );
}

/**
 * One game as a desk tile — the whole slate scans in a screen, and any tile
 * opens into the full card. The gold rail on the left edge is the wordless
 * conviction cue (same rule as the app's Winners edge rails): brighter gold,
 * stronger call. No rail until the call posts.
 */
export function GameTile({ game, now }: { game: BoardGame; now?: number }) {
  const { pick } = game;
  const started =
    now != null && (parseGameTime(game.commence)?.getTime() ?? Number.MAX_SAFE_INTEGER) <= now;
  const accent = sportByCode(game.league)?.accent;
  const time = etTime(game.commence);
  const drop = pickDropTime(game.commence);
  const conf = pick?.confidence ? Math.round(pick.confidence * 100) : null;
  const pickLabel = (pick?.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim();
  const pickOdds = oddsText(pick?.odds ?? (pick?.pick ?? '').match(/[+-]\d{3,}\s*$/)?.[0]);
  const market = marketLine({
    total: game.total,
    spread: game.spread,
    mlHome: game.mlHome,
    mlAway: game.mlAway,
    homeAbbr: game.home,
    awayAbbr: game.away,
    league: game.league,
  });

  return (
    <article className="relative h-full overflow-hidden rounded-card border border-line bg-card shadow-card transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-gold/40">
      {/* Conviction rail — the tile's only decoration, and it means something. */}
      {conf !== null && (
        <span
          aria-hidden
          className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-gold"
          style={{ opacity: 0.25 + 0.75 * (conf / 100) }}
        />
      )}

      <div className="flex h-full flex-col px-4 pb-3.5 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="tnum font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-hi">
              {time ?? 'TBD'}
            </span>
            <span className="flex items-center gap-1.5">
              {accent && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-low">
                {game.league}
              </span>
            </span>
          </span>
          <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.07em]">
            {pick ? (
              <span className="text-gold">Call in</span>
            ) : started ? (
              <span className="text-faint">No call</span>
            ) : (
              <span className="text-low">{drop ? `~${drop}` : 'Pending'}</span>
            )}
          </span>
        </div>

        <div className="mt-2.5 space-y-1">
          <ClubLine name={game.away} price={game.mlAway} live={calledSide(pick?.pick, game.away)} />
          <ClubLine name={game.home} price={game.mlHome} live={calledSide(pick?.pick, game.home)} />
        </div>

        <div className="mt-auto pt-3">
          <div className="stitch-faint" />
          {pick ? (
            <div className="mt-2.5 flex items-baseline justify-between gap-3">
              <span className="truncate font-mono text-[11.5px] font-bold tracking-[0.03em] text-gold">
                {pickLabel}
                {pickOdds && <span className="ml-2 font-normal text-low">{pickOdds}</span>}
              </span>
              {conf !== null && <span className="tnum shrink-0 font-mono text-[10.5px] font-bold text-mid">{conf}%</span>}
            </div>
          ) : market ? (
            // The rest of the market — real desk data while the call cooks.
            <p className="tnum mt-2.5 truncate font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-low">
              {market}
            </p>
          ) : (
            <p className="mt-2.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-faint">
              {started ? 'No call posted' : 'The call lands before first pitch'}
            </p>
          )}
        </div>
      </div>

      {/* Open cue — quiet plus that warms with the tile. */}
      <span
        aria-hidden
        className="absolute bottom-3 right-3 text-faint transition-colors group-hover:text-gold"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    </article>
  );
}
