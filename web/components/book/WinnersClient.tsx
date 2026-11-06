'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fetchWinners, type WinnersBoard } from '@/lib/book/access';
import { daysBefore, todayEST } from '@/lib/gary/dates';
import { etDateLabel } from '@/lib/gary/format';
import { normalizeLeague } from '@/lib/gary/leagues';
import type { GaryMood } from '@/lib/gary/winners-recap';
import { dayLine, recordText, toPlay, unitsNet, type WinnersPlay } from '@/lib/book/winners-play';
import { supabaseBrowser } from '@/lib/auth/client';
import { Icon } from '@/components/site/Icon';
import { InfoDialog } from '@/components/picks/InfoDialog';
import { useCardResults } from '@/components/picks/use-card-results';
import { AccessCard } from './AccessCard';
import type { BankrollSnapshot } from './GaryBankroll';
import { DayBar, PackCard, PlayCard, ResultRows, RunSpark, type PlayState, type WinnersRun } from './WinnersCards';
import { WinnersPlayPanel } from './WinnersPlayPanel';

// The app's Winners page on the web (ios/GaryApp/WinnersLab/WinnersLabView.swift):
// Gary's face for last night, the day bar, TODAY with its tabs and the day's
// money, the free pick, the plays as sealed foil packs, then the settled plays
// and yesterday one line each. Three packs across where the app stacks them, on
// the home page's columns; a play opens in a panel beside the board.

const SPORT_ORDER = ['MLB', 'NFL', 'NCAAF', 'NBA'];
const FIRST_DATE = '2026-09-04';
const UNVEILED_KEY = 'gary.winners.unveiled';
const KINDS = [['all', 'All plays'], ['games', 'Game picks'], ['props', 'Prop picks']] as const;
const STATUSES = [['all', 'Any time'], ['open', 'Still to play'], ['settled', 'Settled']] as const;
type KindFilter = (typeof KINDS)[number][0];
type StatusFilter = (typeof STATUSES)[number][0];

interface Streak { current?: number | null; best?: number | null; today?: { candidate_id?: number | null } | null }

function readUnveiled(): Set<number> {
  try {
    return new Set((localStorage.getItem(UNVEILED_KEY) ?? '').split(',').map(Number).filter(Boolean));
  } catch {
    return new Set();
  }
}
function saveUnveiled(ids: Set<number>) {
  try {
    localStorage.setItem(UNVEILED_KEY, [...ids].slice(-200).join(','));
  } catch {
    /* The pack just closes again next visit. */
  }
}

const startMs = (p: WinnersPlay) => (p.commence ? new Date(p.commence).getTime() : Infinity);
const byStart = (a: WinnersPlay, b: WinnersPlay) => startMs(a) - startMs(b);
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const etHour = (now: number) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now));

export function WinnersClient({ initialDate, mood }: { initialDate?: string; mood?: GaryMood | null }) {
  const [today, setToday] = useState(() => todayEST());
  const [date, setDate] = useState(initialDate || today);
  const [sport, setSport] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [board, setBoard] = useState<WinnersBoard | null>(null);
  const [yesterdayBoard, setYesterdayBoard] = useState<WinnersBoard | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [run, setRun] = useState<WinnersRun | null>(null);
  const [bankroll, setBankroll] = useState<BankrollSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [unveiled, setUnveiled] = useState<Set<number>>(() => (typeof window === 'undefined' ? new Set() : readUnveiled()));
  const [tearing, setTearing] = useState<number | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [openPlay, setOpenPlay] = useState<number | null>(null);
  const [unlock, setUnlock] = useState(false);
  const sessionVersion = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const filterRef = useRef<HTMLDivElement>(null);

  const isToday = date === today;
  const results = useCardResults(isToday ? date : undefined);

  useEffect(() => {
    const refresh = () => {
      sessionVersion.current += 1;
      setBoard(null);
      setYesterdayBoard(null);
      setError(null);
      setAttempt(n => n + 1);
    };
    const { data: auth } = supabaseBrowser().auth.onAuthStateChange((event: string) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) refresh();
    });
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      setAttempt(n => n + 1);
      const next = todayEST();
      setToday(prev => {
        // A page left open overnight turns over with the day.
        if (prev !== next) setDate(d => (d === prev ? next : d));
        return next;
      });
    };
    window.addEventListener('focus', tick);
    const interval = window.setInterval(tick, 60000);
    const pending = timers.current;
    return () => {
      auth.subscription.unsubscribe();
      window.removeEventListener('focus', tick);
      window.clearInterval(interval);
      pending.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const version = sessionVersion.current;
    const current = () => !cancelled && version === sessionVersion.current;
    fetchWinners(date)
      .then(data => {
        if (current()) {
          setBoard(data);
          setError(null);
        }
      })
      .catch(e => {
        if (current()) setError(e.message);
      });
    if (isToday) {
      fetchWinners(daysBefore(date, 1))
        .then(data => { if (current()) setYesterdayBoard(data); })
        .catch(() => {});
    }
    const client = supabaseBrowser();
    client.rpc('get_streak', { p_date: date }).then(({ data }: { data: Streak | null }) => { if (current() && data) setStreak(data); });
    client.rpc('get_winners_run').then(({ data }: { data: WinnersRun | null }) => { if (current() && data) setRun(data); });
    client.rpc('get_gary_bankroll').then(({ data }: { data: BankrollSnapshot | null }) => { if (current() && data) setBankroll(data); });
    return () => {
      cancelled = true;
    };
  }, [date, isToday, attempt]);

  useEffect(() => {
    if (!filterOpen) return;
    const away = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [filterOpen]);

  const pickDate = (next: string) => {
    if (!next || next < FIRST_DATE || next > today) return;
    setDate(next);
    setBoard(null);
    setError(null);
    setOpenPlay(null);
    setSport('');
  };

  const stateOf = (p: WinnersPlay): PlayState => {
    if (p.scratched) return { kind: 'final', result: 'scratched', score: null };
    if (p.result) return { kind: 'final', result: p.result, score: p.score };
    const live = results?.live.find(l => normalizeLeague(l.league) === p.league && p.gameId !== null && String(l.game_id) === p.gameId);
    if (live && ['live', 'final'].includes(live.status ?? '')) {
      const score = live.away_score != null && live.home_score != null
        ? `${live.away_abbr} ${live.away_score} · ${live.home_abbr} ${live.home_score}`
        : null;
      return { kind: 'live', detail: live.status === 'final' ? 'Final' : (live.detail ?? 'Live'), score };
    }
    return { kind: 'sealed' };
  };
  const settled = (p: WinnersPlay) => stateOf(p).kind === 'final';

  const plays = (board?.tickets ?? []).map(toPlay);
  const yesterdayPlays = (isToday ? yesterdayBoard?.tickets ?? [] : []).map(toPlay).sort(byStart);
  const todayHasResult = plays.some(p => !p.scratched && p.result);

  const leagues = [
    ...plays.map(p => p.league),
    ...(board?.boards ?? []).filter(b => b.count > 0).map(b => normalizeLeague(b.league) ?? b.league),
  ];
  const playingToday = new Set(leagues);
  if (!todayHasResult) leagues.push(...yesterdayPlays.map(p => p.league));
  const rank = (l: string) => (SPORT_ORDER.indexOf(l) + 1 || SPORT_ORDER.length + 1);
  const sports = [...new Set(leagues)].sort((a, b) =>
    Number(playingToday.has(b)) - Number(playingToday.has(a)) || rank(a) - rank(b) || a.localeCompare(b));
  const activeSport = sports.includes(sport) ? sport : null;
  const filtering = kindFilter !== 'all' || statusFilter !== 'all';
  const keeps = (p: WinnersPlay) => {
    if (activeSport && p.league !== activeSport) return false;
    if (kindFilter === 'games' && p.kind !== 'game') return false;
    if (kindFilter === 'props' && p.kind !== 'prop') return false;
    if (statusFilter === 'open' && settled(p)) return false;
    if (statusFilter === 'settled' && !settled(p)) return false;
    return true;
  };

  const freeId = board?.free_candidate_id ?? streak?.today?.candidate_id ?? null;
  const freePlay = plays.find(p => p.id === Number(freeId)) ?? null;
  const others = plays.filter(p => p !== freePlay && keeps(p));
  const openPlays = isToday ? others.filter(p => !settled(p)).sort(byStart) : [];
  const settledPlays = [
    ...(freePlay && keeps(freePlay) && (!isToday || settled(freePlay)) ? [freePlay] : []),
    ...others.filter(p => !isToday || settled(p)),
  ].sort(byStart);
  const freeCard = isToday && freePlay && keeps(freePlay) && !settled(freePlay) ? freePlay : null;

  const lockedPacks = (board?.boards ?? [])
    .filter(b => isToday && b.locked && b.count > 0 && (!activeSport || activeSport === normalizeLeague(b.league)))
    .flatMap(b => Array.from({ length: b.count }, (_, i) => ({ id: `${b.league}-${b.kind}-${i}`, league: normalizeLeague(b.league) ?? b.league })));

  // Today's page stays full: COMING SOON packs top it up to three.
  const fillers = isToday && board && !filtering ? Math.max(0, 3 - lockedPacks.length - openPlays.length) : 0;
  const fillerLeague = activeSport ?? openPlays[0]?.league ?? 'WINNERS';

  const todayLeads = !isToday || plays.length > 0 || lockedPacks.length > 0 || etHour(now) >= 10;
  const showsRecap = isToday && !todayLeads && yesterdayPlays.length > 0;
  const shownYesterday = yesterdayPlays.filter(p => !activeSport || p.league === activeSport);

  const underway = isToday && (todayHasResult || plays.some(p => !p.scratched && startMs(p) <= now));
  const shownDay = !isToday || underway ? plays : yesterdayPlays;
  const line = dayLine(shownDay);
  const decided = line.won + line.lost + line.push > 0;
  const netTone = line.units > 0.0049 ? 'won' : line.units < -0.0049 ? 'lost' : 'push';

  const isSealed = (p: WinnersPlay) => isToday && !p.scratched && !settled(p) && !unveiled.has(p.id);
  const sealedIds = [...(freeCard && isSealed(freeCard) ? [freeCard.id] : []), ...openPlays.filter(isSealed).map(p => p.id)];

  const unveil = (id: number) => {
    setTearing(id);
    setUnveiled(prev => {
      const next = new Set(prev).add(id);
      saveUnveiled(next);
      return next;
    });
    timers.current.push(setTimeout(() => setTearing(t => (t === id ? null : t)), 520));
  };
  /** One a second, each coming off in turn. */
  const revealAll = () => {
    if (revealing) return;
    setRevealing(true);
    sealedIds.forEach((id, i) => timers.current.push(setTimeout(() => unveil(id), i * 1000)));
    timers.current.push(setTimeout(() => setRevealing(false), sealedIds.length * 1000));
  };

  const open = (p: WinnersPlay) => (isSealed(p) ? unveil(p.id) : setOpenPlay(p.id));
  const panelPlay = [...plays, ...yesterdayPlays].find(p => p.id === openPlay) ?? null;
  const dayLabel = isToday ? 'Today' : etDateLabel(date);

  const yesterdayPlate = (recap: boolean) => {
    const yLine = dayLine(yesterdayPlays);
    const yTone = yLine.units > 0.0049 ? 'won' : yLine.units < -0.0049 ? 'lost' : 'push';
    return (
      <section className="win-plate" aria-labelledby="win-yesterday">
        <div className="win-plate-head">
          <h2 id="win-yesterday">Yesterday</h2>
          <span>{etDateLabel(daysBefore(date, 1))}</span>
        </div>
        {recap && (
          <div className="win-recap">
            {yLine.won + yLine.lost + yLine.push > 0 && (
              <p className="win-recap-line"><b>{recordText(yLine)}</b> <b className={yTone}>{unitsNet(yLine.units)}</b></p>
            )}
            <p>Gary&apos;s {weekday(date)} plays are on the way.</p>
          </div>
        )}
        <ResultRows plays={shownYesterday} onOpen={open} />
      </section>
    );
  };

  const packs = (
    <div className="win-grid">
      {!board && !error && [0, 1, 2].map(i => <PackCard key={i} league={activeSport ?? 'WINNERS'} waiting />)}
      {lockedPacks.map(p => <PackCard key={p.id} league={p.league} word="UNLOCK" lock onClick={() => setUnlock(true)} />)}
      {openPlays.map(p => (
        <PlayCard key={p.id} play={p} state={stateOf(p)} sealed={isSealed(p)} tearing={tearing === p.id} now={now} onOpen={() => open(p)} />
      ))}
      {Array.from({ length: fillers }, (_, i) => <PackCard key={i} league={fillerLeague} word="COMING SOON" />)}
    </div>
  );

  const hasSettled = settledPlays.length > 0;
  const hasYesterday = isToday && !showsRecap && !todayHasResult && shownYesterday.length > 0;

  return (
    <div className="win-inner">
      <header className="win-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- Gary's face for last night */}
        <img className="win-face" src={mood ? `/site/hero/mood-${mood}.webp` : '/site/gary-current.png'} alt="" width={96} height={96} />
        <h1>Winners</h1>
        <div className="win-date">
          <button type="button" aria-label="The day before" disabled={date <= FIRST_DATE} onClick={() => pickDate(daysBefore(date, 1))}>
            <Icon name="chevron" size={18} />
          </button>
          <label>
            <span>{etDateLabel(date)}</span>
            <input type="date" aria-label="Pick a date" min={FIRST_DATE} max={today} value={date} onChange={e => pickDate(e.target.value)} />
          </label>
          <button type="button" aria-label="The next day" disabled={isToday} onClick={() => pickDate(daysBefore(date, -1))}>
            <Icon name="chevron" size={18} />
          </button>
        </div>
        <div className="win-head-side">
          {run && <RunSpark run={run} />}
          {bankroll && (
            <Link href="/results" className="win-bank">
              <strong>${Math.round(bankroll.bankroll_units * 100).toLocaleString('en-US')}</strong>
              <span className={bankroll.profit_units < 0 ? 'lost' : 'won'}>{unitsNet(bankroll.profit_units)}</span>
              <em>Bankroll <Icon name="chevron" size={13} /></em>
            </Link>
          )}
        </div>
      </header>
      <DayBar plays={shownDay} />

      <div className="win-today">
        <h2>{dayLabel}</h2>
        {sports.length > 1 && (
          <div className="win-tabs" role="group" aria-label="Filter by sport">
            {['ALL', ...sports].map(s => {
              const on = s === 'ALL' ? !activeSport : activeSport === s;
              return <button type="button" key={s} aria-pressed={on} className={on ? 'on' : ''} onClick={() => setSport(s === 'ALL' ? '' : s)}>{s}</button>;
            })}
          </div>
        )}
        <div className="win-today-side">
          {sealedIds.length > 1 && (
            <button type="button" className="win-reveal" disabled={revealing} onClick={revealAll}>Reveal all</button>
          )}
          {(underway || !isToday || decided) && (
            <p className="win-numbers">
              {isToday && !underway && <small>Yesterday</small>}
              <b>{recordText(line)}</b>
              <b className={netTone}>{unitsNet(line.units)}</b>
            </p>
          )}
          <div className="win-filter" ref={filterRef}>
            <button
              type="button"
              className={filtering ? 'on' : ''}
              aria-label={filtering ? 'Filter, on' : 'Filter'}
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen(v => !v)}
            >
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <circle cx="13" cy="13" r="11.6" /><path d="M7.5 9.5h11M9.5 13h7M11.5 16.5h3" strokeLinecap="round" />
              </svg>
            </button>
            {filterOpen && (
              <div className="win-filter-menu">
                <p>Show</p>
                {KINDS.map(([k, t]) => <button type="button" key={k} className={kindFilter === k ? 'on' : ''} onClick={() => setKindFilter(k)}>{t}</button>)}
                <p>Status</p>
                {STATUSES.map(([k, t]) => <button type="button" key={k} className={statusFilter === k ? 'on' : ''} onClick={() => setStatusFilter(k)}>{t}</button>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {(board?.access.preview || board?.access.founding) && (
        <p className="win-note">
          {board.access.founding ? 'Your founding membership includes these Winners picks.' : 'Launch preview · Winners is open. No purchase required.'}
        </p>
      )}

      {error && (
        <div className="win-error">
          <p role="alert">{error}</p>
          <button type="button" className="app-action" onClick={() => setAttempt(n => n + 1)}>Try again <Icon name="chevron" size={18} /></button>
        </div>
      )}

      {showsRecap && yesterdayPlate(true)}

      {freeCard && (
        <PlayCard
          play={freeCard}
          state={stateOf(freeCard)}
          sealed={isSealed(freeCard)}
          tearing={tearing === freeCard.id}
          free={{ current: streak?.current ?? 0, best: streak?.best ?? 0 }}
          now={now}
          onOpen={() => open(freeCard)}
        />
      )}

      {(isToday || !board) && packs}

      {board && filtering && !freeCard && !openPlays.length && !hasSettled && <p className="win-none">No plays</p>}
      {board && !isToday && !filtering && !hasSettled && (
        <div className="win-plate win-empty">
          <h2>No published Winners on this date.</h2>
          <p>Try another day.</p>
        </div>
      )}

      {(hasSettled || hasYesterday) && (
        <div className={`win-lower ${hasSettled && hasYesterday ? 'two' : 'one'}`}>
          {hasSettled && (
            <section className="win-plate" aria-labelledby="win-settled">
              <div className="win-plate-head"><h2 id="win-settled">Settled</h2></div>
              <ResultRows plays={settledPlays} onOpen={open} />
            </section>
          )}
          {hasYesterday && yesterdayPlate(false)}
        </div>
      )}

      <p className="win-fine">
        Each Winner keeps its original pick, odds, and explanation. Wins and losses stay on the record.
        Any stake shown is part of Gary&apos;s simulated bankroll; Gary does not place bets.
        Winners picks from before September 4 are available in the app&apos;s record.
      </p>

      {panelPlay && (
        <WinnersPlayPanel key={panelPlay.id} play={panelPlay} state={stateOf(panelPlay)} date={panelPlay.gameDate} now={now} onClose={() => setOpenPlay(null)} />
      )}
      {board && (
        <InfoDialog open={unlock} onClose={() => setUnlock(false)}>
          <AccessCard initial={board.access} />
        </InfoDialog>
      )}
    </div>
  );
}
