import type { LineStory } from '@/lib/gary/lines';

// THE LINE — the same module the app shows under the pick card: three
// markets, opened and now side by side, the size of each move at the right,
// then every rung in order. Numbers and times only.

function Badge({ badge }: { badge: LineStory['rows'][number]['badge'] }) {
  if (badge.kind === 'moved') return <span className="tnum font-mono text-[12px] font-bold text-gold">{badge.text}</span>;
  return <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint">{badge.kind === 'price' ? 'Price' : 'Holds'}</span>;
}

export function LineLadderPanel({ story, matchup }: { story: LineStory; matchup: string }) {
  if (story.rows.length === 0) return null;
  const head = 'font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint';
  return (
    <section className="rounded-panel border border-line bg-card px-5 pb-4 pt-4" aria-label="The line">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[1.25rem] uppercase leading-none text-gold">The line</h2>
        <span className={head}>{story.vendor} · {story.moves} {story.moves === 1 ? 'move' : 'moves'}</span>
      </div>
      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="text-left align-top">
            <th className={`${head} w-[64px] pb-1.5 font-bold`} scope="col"><span className="sr-only">Market</span></th>
            <th className={`${head} pb-1.5`} scope="col">Opened<br /><span className="normal-case tracking-normal">{story.openedAt ?? '—'}</span></th>
            <th className={`${head} pb-1.5`} scope="col">{story.closed ? 'Close' : 'Now'}<br /><span className="normal-case tracking-normal">{story.nowAt ?? '—'}</span></th>
            <th className={`${head} w-[52px] pb-1.5 text-right`} scope="col"><span className="sr-only">Move</span></th>
          </tr>
        </thead>
        <tbody>
          {story.rows.map(row => (
            <tr key={row.market} className="border-t border-line">
              <th scope="row" className={`${head} py-2.5 pr-2 text-left`}>{row.market}</th>
              <td className="tnum py-2.5 pr-2 font-mono text-[12.5px] text-mid">{row.open}</td>
              <td className="tnum py-2.5 pr-2 font-mono text-[12.5px] font-bold text-hi">{row.now}</td>
              <td className="py-2.5 text-right"><Badge badge={row.badge} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {story.lateOpens.map(late => (
        <p key={late.market} className={`${head} mt-2`}>{late.market} first seen {late.seen}</p>
      ))}
      <details className="mt-3 border-t border-line pt-3">
        <summary className={`${head} cursor-pointer list-none text-gold`}>Every move, in order ›</summary>
        <table className="mt-3 w-full border-collapse" aria-label={`Every line move for ${matchup}`}>
          <thead>
            <tr className="text-left">
              <th className={`${head} pb-1.5`} scope="col">When</th>
              <th className={`${head} pb-1.5`} scope="col">Spread</th>
              <th className={`${head} pb-1.5`} scope="col">Total</th>
              <th className={`${head} pb-1.5`} scope="col">Moneyline</th>
            </tr>
          </thead>
          <tbody>
            {story.rungs.map((r, i) => {
              const strong = r.label === 'NOW' || r.label === 'CLOSE';
              const cell = `tnum py-2 pr-2 font-mono text-[12px] ${strong ? 'font-bold text-hi' : 'text-mid'}`;
              return (
                <tr key={`${r.when ?? i}-${i}`} className="border-t border-line align-top">
                  <td className="py-2 pr-2">
                    {r.label && <span className={`${head} block ${strong ? 'text-gold' : ''}`}>{r.label}</span>}
                    <span className="tnum font-mono text-[11px] text-low">{r.when ?? '—'}</span>
                  </td>
                  <td className={cell}>{r.spread ?? '—'}</td>
                  <td className={cell}>{r.total ?? '—'}</td>
                  <td className={cell}>{r.moneyline ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </section>
  );
}
