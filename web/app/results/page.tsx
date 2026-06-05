import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import {
  fetchAllGameResults, fetchAllPropResults, computeRecord, computePropsRecord,
  recordByLeague, currentStreak, sinceDate,
} from '@/lib/gary/results';
import { estDateStr } from '@/lib/gary/dates';
import { SPORTS, LEAGUE_DISPLAY, sportByCode } from '@/lib/gary/leagues';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Gary AI Track Record — Every Pick Graded | betwithgary.ai',
  description:
    'The complete public record of Gary AI sports picks: win-loss by sport, net units at flat stakes, streaks, and every graded result. No cherry-picking.',
  alternates: { canonical: '/results' },
};

const fmtUnits = (u: number) => `${u >= 0 ? '+' : '-'}${Math.abs(u).toFixed(1)}u`;

export default async function ResultsPage() {
  const [games, props] = await Promise.all([
    fetchAllGameResults().catch(() => null),
    fetchAllPropResults().catch(() => null),
  ]);

  // Results page is the record — null data is worse than an error page.
  if (!games || !props) throw new Error('results data unavailable');

  const allTime = computeRecord(games);
  const l30 = computeRecord(sinceDate(games, estDateStr(new Date(Date.now() - 30 * 86400000))));
  const l7 = computeRecord(sinceDate(games, estDateStr(new Date(Date.now() - 7 * 86400000))));
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
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Eyebrow>THE RECORD</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Track Record</h1>
      <p className="mt-2 max-w-2xl text-white/60">
        Every pick is graded the morning after and stays on the record — wins, losses,
        and pushes. Units assume flat 1-unit stakes at the listed odds.
      </p>

      {/* Headline tiles */}
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {([
          ['ALL-TIME', `${allTime.wins}-${allTime.losses}-${allTime.pushes}`, `${allTime.pct}% · ${fmtUnits(allTime.netUnits)}`],
          ['LAST 30 DAYS', `${l30.wins}-${l30.losses}-${l30.pushes}`, `${l30.pct}% · ${fmtUnits(l30.netUnits)}`],
          ['LAST 7 DAYS', `${l7.wins}-${l7.losses}-${l7.pushes}`, `${l7.pct}% · ${fmtUnits(l7.netUnits)}`],
          ['STREAK', streak ? `${streak.count}${streak.kind === 'won' ? 'W' : 'L'}` : '—', streak?.kind === 'won' ? 'riding it' : streak ? 'owning it' : ''],
        ] as [string, string, string][]).map(([label, big, sub]) => (
          <div key={label} className="rounded-[12px] border border-white/10 bg-card p-5">
            <Eyebrow>{label}</Eyebrow>
            <p className="mt-2 font-display text-3xl text-white/95">{big}</p>
            {sub && <p className="mt-1 font-mono text-[12px] text-white/55">{sub}</p>}
          </div>
        ))}
      </div>

      {/* By sport */}
      <section className="mt-12">
        <h2 className="font-display text-2xl text-white/95">By Sport</h2>
        <div className="mt-4 overflow-x-auto rounded-[12px] border border-white/10">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-white/10 font-mono text-[11px] uppercase text-white/45">
                <th className="px-4 py-3">Sport</th>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Win %</th>
                <th className="px-4 py-3">Net Units</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {[...byLeague.entries()]
                .sort((a, b) => b[1].graded - a[1].graded)
                .map(([code, rec]) => {
                  const cfg = sportByCode(code);
                  return (
                    <tr key={code} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3">
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: cfg?.accent ?? '#555' }} />
                        <span className="text-white/85">{cfg?.longName ?? LEAGUE_DISPLAY[code] ?? code}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-white/78">{rec.wins}-{rec.losses}{rec.pushes ? `-${rec.pushes}` : ''}</td>
                      <td className="px-4 py-3 font-mono text-sm text-white/78">{rec.pct}%</td>
                      <td className={`px-4 py-3 font-mono text-sm ${rec.netUnits >= 0 ? 'text-chart-win' : 'text-chart-loss'}`}>{fmtUnits(rec.netUnits)}</td>
                      <td className="px-4 py-3 text-right">
                        {cfg && (
                          <Link href={`/results/${cfg.slug}`} className="text-sm text-white/55 underline hover:text-white/85">
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
      <section className="mt-12">
        <h2 className="font-display text-2xl text-white/95">Player Props</h2>
        <p className="mt-2 max-w-2xl text-[15px] text-white/60">
          Props record: <span className="font-mono text-white/85">{propsRec.wins}-{propsRec.losses}</span> ({propsRec.pct}%).
          Props are higher variance than game lines and Gary&apos;s prop model was rebuilt in June 2026 —
          the record stays public either way.
        </p>
        <p className="mt-2 font-mono text-[13px] text-white/45">
          ≈18% of graded winning props carry no recorded odds and grade at a flat 0.9u in the units figure.
        </p>
      </section>

      {/* Recent results tape */}
      <section className="mt-12">
        <h2 className="font-display text-2xl text-white/95">Recent Results</h2>
        <ul className="mt-4 space-y-2">
          {recent.map((r, i) => {
            const nr = (r.result ?? '').trim().toLowerCase();
            return (
              <li key={i} className="flex items-center justify-between rounded-[10px] border border-white/8 bg-card px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`font-mono text-[12px] font-bold ${nr === 'won' ? 'text-win' : nr === 'lost' ? 'text-loss' : 'text-gold'}`}>
                    {nr === 'won' ? 'W' : nr === 'lost' ? 'L' : 'P'}
                  </span>
                  <span className="truncate font-mono text-[13px] text-white/80">{r.pick_text}</span>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-3 font-mono text-[12px] text-white/45">
                  <span>{(r.league ?? '').toUpperCase()}</span>
                  <span>{r.final_score}</span>
                  <span>{r.game_date}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-sm text-white/55">
          Full history by sport:{' '}
          {SPORTS.map((s, i) => (
            <span key={s.slug}>
              {i > 0 && ' · '}
              <Link href={`/results/${s.slug}`} className="text-white/70 underline hover:text-white/90">
                {s.name}
              </Link>
            </span>
          ))}
        </p>
      </section>
    </main>
  );
}
