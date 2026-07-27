import type { Metadata } from 'next';
import Link from 'next/link';
import { PageMasthead, StatTile, StitchRule, ResultLetter } from '@/components/Terminal';
import {
  fetchAllGameResults, fetchAllPropResults, computeRecord, computePropsRecord,
  recordByLeague, currentStreak, sinceDate,
} from '@/lib/gary/results';
import { rest } from '@/lib/gary/supabase';
import { daysAgoEST } from '@/lib/gary/dates';
import { SPORTS, LEAGUE_DISPLAY, sportByCode } from '@/lib/gary/leagues';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Track Record — Every Pick Graded, Public | Gary AI',
  description:
    'The complete public record of Gary AI sports picks: win-loss by sport, net units at flat stakes, streaks, and every graded result. No cherry-picking.',
  alternates: { canonical: '/results' },
};

const fmtUnits = (u: number) => `${u >= 0 ? '+' : '-'}${Math.abs(u).toFixed(1)}u`;

const fmtET = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
  }) + ' ET';

/**
 * Yesterday's concrete receipt: when the card was first stored vs when its
 * first game started. daily_picks upserts per date and created_at survives
 * re-runs, so it is the day's FIRST post time. Null (render nothing) when
 * the row or timestamps are missing — a claim is only shown when the data
 * backs it.
 */
async function fetchYesterdayReceipt(): Promise<{ posted: string; firstPitch: string } | null> {
  try {
    const rows = await rest<Array<{ created_at: string | null; picks: Array<{ commence_time?: string }> }>>(
      `daily_picks?date=eq.${daysAgoEST(1)}&select=created_at,picks`, { revalidate: 3600 });
    const row = rows[0];
    if (!row?.created_at || !Array.isArray(row.picks)) return null;
    const starts = row.picks
      .map(p => p.commence_time).filter((c): c is string => !!c)
      .map(c => new Date(c).getTime()).filter(Number.isFinite);
    if (!starts.length) return null;
    const first = Math.min(...starts);
    if (new Date(row.created_at).getTime() >= first) return null; // never show a claim the data contradicts
    return { posted: fmtET(row.created_at), firstPitch: fmtET(new Date(first).toISOString()) };
  } catch {
    return null;
  }
}

/* Gary's form — last-10 W/L pip strip, oldest-first so it reads toward today. */
const PIP_COLOR: Record<string, string> = { won: '#3FB950', lost: '#E5484D', push: '#C9A227' };
const PIP_LETTER: Record<string, string> = { won: 'W', lost: 'L', push: 'P' };

function FormPips({ results }: { results: string[] }) {
  return (
    <div
      className="mt-4 flex items-center gap-3"
      aria-label={`Last 10: ${results.map(r => PIP_LETTER[r] ?? '?').join(' ')}`}
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-low">Last 10</span>
      <div className="flex gap-1.5" aria-hidden="true">
        {results.map((r, i) => (
          <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: PIP_COLOR[r] ?? '#555' }} />
        ))}
      </div>
    </div>
  );
}

export default async function ResultsPage() {
  const [games, props, receipt] = await Promise.all([
    fetchAllGameResults().catch(() => null),
    fetchAllPropResults().catch(() => null),
    fetchYesterdayReceipt(),
  ]);

  // Results page is the record — null data is worse than an error page.
  if (!games || !props) throw new Error('results data unavailable');

  const allTime = computeRecord(games);
  const l30 = computeRecord(sinceDate(games, daysAgoEST(30)));
  const l7 = computeRecord(sinceDate(games, daysAgoEST(7)));
  const streak = currentStreak(games);
  const byLeague = recordByLeague(games);
  const propsRec = computePropsRecord(props);
  const recent = games
    .filter(r => {
      const nr = (r.result ?? '').trim().toLowerCase();
      return nr === 'won' || nr === 'lost' || nr === 'push';
    })
    .slice(0, 25);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-12">
      <PageMasthead
        title="Track record"
        meta="EVERY PICK GRADED"
        sub="Every pick is stored before lock, graded after the final, and stays on the record — wins, losses, and pushes. Units assume flat 1-unit stakes at the listed odds."
      />

      {/* The receipts — why this record can be trusted (and most can't) */}
      <section className="mt-8 grid gap-4 rounded-lg border border-line p-5 md:grid-cols-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-gold">Posted before lock</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-mid">
            Every pick is stored server-side before the game starts. Nothing is added after the fact.
            {receipt && (
              <span className="tnum mt-1 block font-mono text-[12px] text-low">
                Yesterday: card posted {receipt.posted}, first game {receipt.firstPitch}.
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-gold">Nothing deleted</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-mid">
            Wins, losses, and pushes all stay on the record. The archive below is the complete history.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-gold">Graded by machine</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-mid">
            Results grade automatically from final scores — the same pipeline grades Gary and everyone who tails him in the app.
          </p>
        </div>
      </section>

      {/* Headline — the all-time figure carries the page */}
      <section className="mt-7 grid items-end gap-8 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-gold">All-time</p>
          <p className="tnum mt-2 font-mono text-[clamp(3rem,7vw,5rem)] font-bold leading-none text-hi">
            {allTime.wins.toLocaleString()}
            <span className="text-faint">–</span>
            {allTime.losses.toLocaleString()}
          </p>
          <p className="tnum mt-3 font-mono text-[12px] text-low">
            {allTime.pct}% · {fmtUnits(allTime.netUnits)} · {allTime.graded.toLocaleString()} graded
          </p>
          {recent.length > 0 && (
            <FormPips
              results={recent
                .slice(0, 10)
                .map(r => (r.result ?? '').trim().toLowerCase())
                .reverse()}
            />
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 lg:col-span-6">
          <StatTile
            label="Last 30 days"
            value={<>{l30.wins}<span className="text-faint">–</span>{l30.losses}</>}
            sub={`${l30.pct}% · ${fmtUnits(l30.netUnits)}`}
          />
          <StatTile
            label="Last 7 days"
            value={<>{l7.wins}<span className="text-faint">–</span>{l7.losses}</>}
            sub={`${l7.pct}% · ${fmtUnits(l7.netUnits)}`}
          />
          <StatTile
            label="Streak"
            value={streak ? `${streak.count}${streak.kind === 'won' ? 'W' : 'L'}` : '—'}
            sub={streak ? `${streak.kind === 'won' ? 'wins' : 'losses'} in a row` : ''}
            valueClassName={streak?.kind === 'won' ? 'text-win' : streak ? 'text-loss' : 'text-hi'}
          />
        </div>
      </section>

      {/* By sport */}
      <section className="mt-16">
        <h2 className="font-display text-2xl uppercase text-hi">By Sport</h2>
        <StitchRule tone="faint" className="mt-3" />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.04em] text-low">
                <th className="px-4 py-3 font-bold">Sport</th>
                <th className="px-4 py-3 font-bold">Record</th>
                <th className="px-4 py-3 font-bold">Win %</th>
                <th className="px-4 py-3 font-bold">Net Units</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {[...byLeague.entries()]
                .sort((a, b) => b[1].graded - a[1].graded)
                .map(([code, rec]) => {
                  const cfg = sportByCode(code);
                  return (
                    <tr key={code} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: cfg?.accent ?? '#555' }} />
                        <span className="text-hi">{cfg?.longName ?? LEAGUE_DISPLAY[code] ?? code}</span>
                      </td>
                      <td className="tnum px-4 py-3 font-mono text-sm text-mid">{rec.wins}-{rec.losses}{rec.pushes ? `-${rec.pushes}` : ''}</td>
                      <td className="tnum px-4 py-3 font-mono text-sm text-mid">{rec.pct}%</td>
                      <td className={`tnum px-4 py-3 font-mono text-sm ${rec.netUnits >= 0 ? 'text-chart-win' : 'text-chart-loss'}`}>{fmtUnits(rec.netUnits)}</td>
                      <td className="px-4 py-3 text-right">
                        {cfg && (
                          <Link href={`/results/${cfg.slug}`} className="text-sm text-gold underline decoration-gold/40 transition-colors hover:text-gold-light">
                            details
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Props — honest, with verified-data footnote */}
      <section className="mt-16">
        <h2 className="font-display text-2xl uppercase text-hi">Player Props</h2>
        <StitchRule tone="faint" className="mt-3" />
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-mid">
          Props record: <span className="tnum font-mono text-hi">{propsRec.wins}-{propsRec.losses}</span> ({propsRec.pct}%).
          Props are higher variance than game lines and Gary&apos;s prop model was rebuilt in June 2026 —
          the record stays public either way.
        </p>
        <p className="tnum mt-2 font-mono text-[13px] text-low">
          ≈18% of graded winning props carry no recorded odds and grade at a flat 0.9u in the units figure.
        </p>
      </section>

      {/* Recent results tape */}
      <section className="mt-16">
        <h2 className="font-display text-2xl uppercase text-hi">Recent Results</h2>
        <StitchRule tone="faint" className="mt-3" />
        <ul className="mt-1">
          {recent.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
              <div className="flex min-w-0 items-baseline gap-3">
                <ResultLetter result={r.result ?? ''} />
                <span className="min-w-0 break-words font-mono text-[13px] text-mid">{r.pick_text}</span>
              </div>
              <div className="tnum ml-3 flex shrink-0 items-center gap-3 font-mono text-[12px] text-low">
                <span>{(r.league ?? '').toUpperCase()}</span>
                <span>{r.final_score}</span>
                <span>{r.game_date}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-mid">
          Full history by sport:{' '}
          {SPORTS.map((s, i) => (
            <span key={s.slug}>
              {i > 0 && ' · '}
              <Link href={`/results/${s.slug}`} className="text-gold underline decoration-gold/40 transition-colors hover:text-gold-light">
                {s.name}
              </Link>
            </span>
          ))}
        </p>
      </section>
    </main>
  );
}
