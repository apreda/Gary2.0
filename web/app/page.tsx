import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { AppStoreButton } from '@/components/AppStoreButton';
import { PickCard } from '@/components/PickCard';
import { PropCard } from '@/components/PropCard';
import { RecordTicker } from '@/components/RecordTicker';
import { Eyebrow } from '@/components/Eyebrow';
import { StitchRule, StatTile, GhostLink } from '@/components/Terminal';
import { fetchTodayGamePicks, fetchTodayPropPicks, selectTopPick, selectTopProps } from '@/lib/gary/picks';
import { fetchAllGameResults, computeRecord, currentStreak, sinceDate, effectiveOdds } from '@/lib/gary/results';
import { todayEST, daysAgoEST } from '@/lib/gary/dates';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Gary AI — Free Sports Picks for Every Game, Every Day',
  description:
    'Free daily picks with written reasoning across MLB, NBA, NFL, NHL, NCAAB, and NCAAF. Public track record. Free on iOS.',
  alternates: { canonical: '/' },
};

export default async function Home() {
  const [gamePicks, propPicks, results] = await Promise.all([
    fetchTodayGamePicks().catch(() => null),
    fetchTodayPropPicks().catch(() => null),
    fetchAllGameResults().catch(() => null),
  ]);

  const topPick = gamePicks ? selectTopPick(gamePicks) : null;
  const topProp = propPicks ? selectTopProps(propPicks, 1)[0] ?? null : null;

  const recentWins = results
    ? sinceDate(results, daysAgoEST(14))
        .filter(r => r.result === 'won' && (r.pick_text || r.matchup))
        .slice(0, 10)
        .map(r => ({ league: (r.league ?? '').toUpperCase(), pick: r.pick_text ?? r.matchup ?? '', date: r.game_date ?? '' }))
    : null;

  const l30 = results ? computeRecord(sinceDate(results, daysAgoEST(30))) : null;
  const allTime = results ? computeRecord(results) : null;
  const streak = results ? currentStreak(results) : null;

  return (
    <main>
      {/* ── 01 · Hero — the bear hosts, the data hangs on his wall ── */}
      <section className="relative overflow-hidden">
        {/* Ghost record numeral — the product as backdrop texture, flat */}
        {allTime && (
          <p
            aria-hidden
            className="tnum pointer-events-none absolute -right-12 top-6 hidden select-none font-mono text-[15rem] font-bold leading-none text-white/[0.04] lg:block"
          >
            {allTime.wins.toLocaleString()}–{allTime.losses.toLocaleString()}
          </p>
        )}

        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-14 md:pt-20 lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-7">
            <p className="rise font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">
              {gamePicks && gamePicks.length > 0 ? (
                <><span className="tnum">{gamePicks.length}</span> picks on today&apos;s board · {todayEST()}</>
              ) : allTime ? (
                <><span className="tnum">{allTime.graded.toLocaleString()}</span> graded picks · public record</>
              ) : (
                <>The free sports desk</>
              )}
            </p>
            <h1 className="rise rise-2 mt-5 font-display text-[clamp(3.4rem,9.5vw,7.5rem)] uppercase leading-[0.9] text-hi">
              Every game.
              <br />
              Every day.
              <br />
              <span className="text-gold">On the record.</span>
            </h1>
            <p className="rise rise-3 mt-6 max-w-xl text-lg leading-relaxed text-mid">
              Gary covers the full slate free — every pick with the reasoning behind it,
              every result graded in public. Winners, his conviction board, lives in the app.
            </p>
            <div className="rise rise-4 mt-8 flex flex-wrap items-center gap-4">
              <AppStoreButton surface="home_hero" />
              <GhostLink href="/picks">See today&apos;s picks</GhostLink>
            </div>
            {l30 && allTime && (
              <p className="rise rise-5 tnum mt-7 font-mono text-[12px] text-low">
                LAST 30 DAYS {l30.wins}–{l30.losses} · ALL-TIME {allTime.wins}–{allTime.losses} ({allTime.pct}%)
              </p>
            )}
          </div>

          {/* The desk composition: bear, coin, and real artifacts pinned around him */}
          <div className="relative hidden lg:col-span-5 lg:block">
            <div className="rise rise-3 relative mx-auto w-[400px]">
              <Image
                src="/brand/gary-icon.png"
                alt="Gary the bear — gold coin mark"
                width={400}
                height={400}
                preload
              />
              <Image
                src="/coin2.png"
                alt=""
                aria-hidden
                width={140}
                height={140}
                className="absolute -bottom-7 -left-9 -rotate-12"
              />

              {/* Today's actual top pick, pinned to the frame */}
              {topPick && (
                <div className="rise rise-4 absolute -left-16 top-3 w-[220px] rounded-chip border border-gold/60 bg-chip px-3.5 py-2.5 shadow-card">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.04em] text-low">
                    Today&apos;s free pick · {(topPick.league ?? '').toUpperCase()}
                  </p>
                  <div className="mt-1.5 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 break-words font-mono text-[13px] font-bold leading-snug text-gold">
                      {(topPick.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim()}
                    </span>
                    {(topPick.odds ?? effectiveOdds(topPick.pick)) != null && (
                      <span className="tnum shrink-0 font-mono text-[12px] font-bold text-low">
                        {String(topPick.odds ?? effectiveOdds(topPick.pick))}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* The current streak, owned either way */}
              {streak && (
                <div className="rise rise-5 absolute -right-10 bottom-10 rounded-chip border border-line bg-card px-3.5 py-2.5 shadow-card">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.04em] text-low">Streak</p>
                  <p className={`tnum mt-0.5 font-mono text-[20px] font-bold leading-none ${streak.kind === 'won' ? 'text-win' : 'text-loss'}`}>
                    {streak.kind === 'won' ? 'W' : 'L'}{streak.count}
                  </p>
                </div>
              )}
            </div>
            <div className="mx-auto mt-10 w-[400px]">
              <StitchRule />
            </div>
          </div>
        </div>
      </section>

      {/* ── The tape ──────────────────────────────────────────────── */}
      {recentWins && <RecordTicker items={recentWins} />}

      {/* ── 02 · Today's board — the data closes ──────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-mono text-[20px] font-normal uppercase tracking-[0.04em] text-gold md:text-[23px]">
            Today&apos;s board
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-low">{todayEST()}</span>
        </div>
        <StitchRule className="mt-4" />

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          {topPick ? (
            <PickCard pick={topPick} />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-card border border-line bg-card p-8 text-center">
              <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
              <p className="mt-3 text-[15px] text-mid">
                The slate&apos;s cooking. Picks drop every morning — last night&apos;s results
                are on the <Link href="/results" className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">record</Link>.
              </p>
            </div>
          )}
          {topProp && <PropCard prop={topProp} />}
        </div>
        <p className="mt-5 text-sm text-mid">
          Every game covered, completely free.{' '}
          <Link href="/picks" className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">
            All of today&apos;s picks →
          </Link>
        </p>
      </section>

      {/* ── 03 · The record — transparency is the product ─────────── */}
      {allTime && l30 && (
        <section className="border-y border-line bg-elev/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">The record</h2>
            <div className="mt-4 grid items-end gap-10 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <p className="tnum font-mono text-[clamp(3.2rem,8vw,5.8rem)] font-bold leading-none text-hi">
                  {allTime.wins.toLocaleString()}
                  <span className="text-faint">–</span>
                  {allTime.losses.toLocaleString()}
                </p>
                <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-mid">
                  Every pick Gary has made, graded against final scores the next morning.
                  No deletions, no restatements — losses stay on the books with the wins.
                </p>
                <div className="mt-6">
                  <GhostLink href="/results">The full ledger</GhostLink>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 lg:col-span-5">
                <StatTile label="Win pct" value={`${allTime.pct}%`} sub={`${allTime.graded.toLocaleString()} graded`} />
                <StatTile label="Last 30" value={<>{l30.wins}<span className="text-faint">–</span>{l30.losses}</>} sub={`${l30.pct}% win`} />
                <StatTile
                  label="Streak"
                  value={streak ? `${streak.kind === 'won' ? 'W' : 'L'}${streak.count}` : '—'}
                  valueClassName={streak?.kind === 'won' ? 'text-win' : streak ? 'text-loss' : 'text-hi'}
                />
              </div>
            </div>

            {/* The moods — honesty as a character trait */}
            <StitchRule tone="faint" className="mt-12" />
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                ['/brand/gary-fire.png', 'The heaters', 'When the board runs hot, the tape shows it.'],
                ['/brand/gary-icecold.png', 'The cold snaps', 'Losing streaks stay on the record, same as winning ones.'],
                ['/brand/gary-doomsday.png', 'The rough nights', 'Gary owns every loss in writing. That’s the deal.'],
              ].map(([src, title, body]) => (
                <div key={title} className="flex items-center gap-4">
                  <Image src={src} alt="" aria-hidden width={72} height={72} className="shrink-0" />
                  <div>
                    <h3 className="font-display text-xl uppercase text-hi">{title}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-low">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 04 · How the desk works ───────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">How Gary works</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ['Research', 'A research agent investigates every game with live data — odds, stats, injuries, splits, weather.'],
            ['The call', 'Gary weighs the evidence against each sport’s written rules and makes the call, with a confidence rating.'],
            ['On the record', 'Every pick is written up, fact-checked, graded the next morning, and added to the public ledger.'],
          ].map(([title, body], i) => (
            <div key={title} className="quant-panel p-6">
              <span className="tnum font-mono text-[11px] font-bold text-gold">0{i + 1}</span>
              <h3 className="mt-3 font-display text-2xl uppercase text-hi">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-mid">{body}</p>
            </div>
          ))}
        </div>
        <Link
          href="/how-it-works"
          className="mt-6 inline-block text-sm text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
        >
          The full methodology →
        </Link>
      </section>

      {/* ── 05 · In the app — the conviction upgrade ──────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Eyebrow>IN THE APP</Eyebrow>
            <h2 className="mt-3 font-display text-[clamp(2.4rem,4.5vw,3.4rem)] leading-[0.95] text-hi">
              The slate is free.
              <br />
              <span className="text-gold">Conviction is the upgrade.</span>
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-mid">
              The website carries the full free slate. The app adds Winners — the handful
              of plays per sport Gary would actually bet — plus live game tracking and the
              complete Billfold ledger.
            </p>
            <ul className="mt-7 max-w-lg">
              {[
                ['Winners', 'Gary’s highest-conviction board, each with its own graded record. From $9.99/mo.'],
                ['Live tracking', 'Scores update on your picks in real time, game by game.'],
                ['The Billfold', 'All-time, last 30, net units at flat stakes — the whole ledger in your pocket.'],
                ['Alerts', 'A push the moment the day’s board posts.'],
              ].map(([title, body], i) => (
                <li key={title}>
                  {i > 0 && <StitchRule tone="faint" />}
                  <div className="flex gap-4 py-3.5">
                    <span className={`font-mono text-[13px] font-bold ${title === 'Winners' ? 'text-gold' : 'text-hi'}`}>{title}</span>
                    <span className="text-[13.5px] leading-relaxed text-mid">{body}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <AppStoreButton surface="home_app_section" />
              <GhostLink href="/pricing">See pricing</GhostLink>
            </div>
          </div>

          {/* Device frame — an illustration of the Winners board, matte like the app */}
          <div className="hidden justify-center lg:col-span-6 lg:flex" aria-hidden>
            <div className="w-[300px] rounded-[44px] border border-line-strong bg-[#0D0E12] p-3 shadow-card">
              <div className="rounded-[34px] bg-ink px-4 pb-8 pt-5">
                <div className="mx-auto h-5 w-24 rounded-full bg-[#0D0E12]" />
                <div className="mt-5 flex items-baseline justify-between">
                  <span className="font-mono text-[15px] uppercase tracking-[0.04em] text-gold">Winners</span>
                  <span className="font-mono text-[9px] uppercase text-low">Sample board</span>
                </div>
                <div className="stitch-gold mt-2.5" />
                {[
                  ['MLB', 'PHI ML', '-118', false],
                  ['MLB', 'TOTAL BASES O 1.5', '+105', false],
                  ['NBA', 'BOS -3.5', '-110', true],
                  ['NHL', 'EDM ML', '+120', true],
                  ['NBA', 'PG13 PTS O 22.5', '-115', true],
                ].map(([lg, pick, odds, locked], i) => (
                  <div key={i} className="mt-2.5 rounded-chip border border-line bg-card px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.04em] text-faint">{lg as string}</span>
                      {locked && (
                        <svg width="9" height="11" viewBox="0 0 9 11" fill="none">
                          <rect x="0.5" y="4.5" width="8" height="6" rx="1" stroke="rgba(201,162,39,0.7)" />
                          <path d="M2.5 4.5V3a2 2 0 0 1 4 0v1.5" stroke="rgba(201,162,39,0.7)" />
                        </svg>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className={`font-mono text-[11px] font-bold ${locked ? 'text-hi blur-[5px] select-none' : 'text-gold'}`}>
                        {pick as string}
                      </span>
                      <span className={`tnum font-mono text-[10px] font-bold text-low ${locked ? 'blur-[5px] select-none' : ''}`}>
                        {odds as string}
                      </span>
                    </div>
                  </div>
                ))}
                <p className="mt-4 text-center font-mono text-[8.5px] uppercase tracking-[0.04em] text-faint">
                  Unlocks in the app
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 06 · Close ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-8 pt-10">
        <div className="rounded-panel border border-line bg-card px-7 py-12 text-center">
          <h2 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.95] text-hi">
            The desk opens every morning.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-mid">
            Download Gary and get the full slate — with the reasoning — the moment it drops.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
            <AppStoreButton surface="home_footer_band" />
            <GhostLink href="/results">Check the record first</GhostLink>
          </div>
        </div>
      </section>
    </main>
  );
}
