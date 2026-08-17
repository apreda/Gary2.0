#!/usr/bin/env node
/**
 * Live Scores Poller
 *
 * Snapshots today's slate (MLB / NBA / NHL / NFL / NCAAF) into the `live_scores`
 * Supabase table so the iOS app can show scores while games are in progress.
 * Designed to run every ~2 minutes via launchd (com.gary2.live-scores): one
 * cached call per league, upsert one row per game, exit. When nothing is live
 * the whole run is a couple of cheap cached reads — safe to fire all day.
 *
 * Status normalization: scheduled | live | final, plus exact MLB interruption
 * states delayed | postponed | suspended | cancelled. `detail` is a short
 * render-ready string ("INN 7", "Q3 4:12", "DELAYED") composed here so the
 * app stays dumb.
 *
 * Usage:
 *   node scripts/poll-live-scores.js              # today (EST)
 *   node scripts/poll-live-scores.js --date YYYY-MM-DD
 *   node scripts/poll-live-scores.js --dry-run
 */

// MUST load env vars FIRST before any other imports
import '../src/loadEnv.js';

import axios from 'axios';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { etDateStr } from '../src/services/insights/shared.js';
import {
  footballBdlRequest,
  liveScoreSlateDate,
  normalizeFootballGames,
} from '../supabase/functions/_shared/liveScoreFootball.js';
import {
  evaluateLiveScoreSourceResults,
  resolveLiveScoreSourceGate,
  selectLiveScoreSources,
} from '../supabase/functions/_shared/liveScoreSourceGate.js';
import {
  isRecoverableMlbGameInterruption,
  normalizeMlbGameStatus,
} from '../supabase/functions/_shared/mlbGameStatus.js';
import {
  pendingGradeFiles,
  queueExactGradeRequest,
} from './lib/liveGradeQueue.js';
import { loadIncompleteFinalFootballGames } from './lib/footballFinalReconciliation.js';

const { ballDontLieService: bdl } = await import('../src/services/ballDontLieService.js');
// MLB Stats API: BDL has neither outs nor baserunners, so live MLB game state
// (outs + who's on base) is enriched from statsapi.mlb.com's linescore.
const mlbStats = await import('../src/services/mlbStatsApiService.js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/live_scores` : null;
const DAILY_SLATE_REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/daily_slate` : null;
const PROJECT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_MAINTENANCE_LOCK = '/tmp/gary-live-maintenance.lock';
const FOOTBALL_PROOF_INTERVAL_MS = 15 * 60 * 1000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateIdx = args.indexOf('--date');
// The app's slate stays on the prior date until 6:00 AM ET. This matters for
// late MLB games and confirmed NCAAF kickoffs after midnight: choosing the new
// wall-clock date here would stop polling them and the stale-row purge below
// would erase their live/final frame before settlement saw it.
const targetDate = dateIdx !== -1 ? args[dateIdx + 1] : liveScoreSlateDate(new Date());

if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate || '')) {
  console.error(`❌ Invalid date "${targetDate}".`);
  process.exit(1);
}
if (!dryRun && (!REST_URL || !adminKey)) {
  console.error('❌ Supabase configuration missing.');
  process.exit(1);
}

// ── Per-league normalizers → { game_id, away_abbr, home_abbr, away_score,
//    home_score, status, detail } ──────────────────────────────────────────

function normStatus(raw) {
  const s = String(raw || '').toUpperCase();
  if (s.includes('FINAL')) return 'final';
  if (s.includes('SCHEDULED') || s.includes('POSTPONED') || s.includes('DELAYED')) return 'scheduled';
  // NBA scheduled games carry an ISO datetime as status.
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(raw || ''))) return 'scheduled';
  if (!s) return 'scheduled';
  return 'live';
}

async function mlbRows() {
  // BDL dates games by their UTC instant, so an 8pm+ ET game lands on the NEXT UTC
  // day. Fetch BOTH UTC days and keep only this ET slate below — otherwise tonight's
  // late games (the "8pm+ starts show no live score" bug) are never polled.
  const nextUtc = (() => { const d = new Date(`${targetDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const seenIds = new Set();
  const games = [
    ...((await bdl.getMlbGamesForDate(targetDate)) || []),
    ...((await bdl.getMlbGamesForDate(nextUtc)) || []),
  ].filter((g) => { const id = String(g.id); if (seenIds.has(id)) return false; seenIds.add(id); return true; });
  const rows = games.map((g) => {
    const normalizedStatus = normalizeMlbGameStatus(g.status);
    const status = normalizedStatus.status;
    const detail = status === 'live' && Number.isFinite(Number(g.period))
      ? `INN ${g.period}` : normalizedStatus.detail;
    return {
      league: 'MLB',
      game_id: String(g.id),
      away_abbr: g.away_team?.abbreviation ?? null,
      home_abbr: g.home_team?.abbreviation ?? null,
      away_score: numOrNull(g.away_team_data?.runs),
      home_score: numOrNull(g.home_team_data?.runs),
      status,
      detail,
      outs: null,
      bases: null,
      // True ET slate date for this game (BDL dates by UTC instant, so a 9:38pm
      // ET game = next UTC day and is returned by BOTH dates' fetches). Stamping
      // by the game's own ET date keeps a late final on its real slate day
      // instead of leaking into tomorrow's board.
      _etDate: etDateStr(g.date),
      _bdl: g,
    };
  }).filter((r) => r._etDate === targetDate);   // only THIS ET slate

  // Enrich LIVE games with outs + baserunners from the MLB Stats API linescore.
  // Match BDL games to statsapi gamePks by normalized team name (abbr formats
  // diverge between the two feeds; names are stable). Any miss just leaves the
  // diamond off that card — score + inning still render from BDL.
  const liveRows = rows.filter((r) => r.status === 'live');
  if (liveRows.length) {
    try {
      const schedule = (await mlbStats.getMlbSchedule(targetDate)) || [];
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
      const liveGames = schedule
        .filter((sg) => sg.status?.abstractGameState === 'Live')
        .map((sg) => ({
          away: norm(sg.teams?.away?.team?.name),
          home: norm(sg.teams?.home?.team?.name),
          pk: sg.gamePk,
        }));
      for (const row of liveRows) {
        const a = norm(row._bdl?.away_team?.full_name || row._bdl?.away_team?.display_name || row._bdl?.away_team?.name);
        const h = norm(row._bdl?.home_team?.full_name || row._bdl?.home_team?.display_name || row._bdl?.home_team?.name);
        const m = liveGames.find((s) =>
          (s.away.includes(a) || a.includes(s.away)) && (s.home.includes(h) || h.includes(s.home)));
        if (!m?.pk) continue;
        try {
          const ls = await mlbStats.getGameLineScore(m.pk);
          if (Number.isFinite(Number(ls?.outs))) row.outs = Number(ls.outs);
          const o = ls?.offense || {};
          row.bases = `${o.first ? 1 : 0}${o.second ? 1 : 0}${o.third ? 1 : 0}`;
        } catch (e) {
          console.warn(`[live-scores] MLB linescore failed for pk ${m.pk}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`[live-scores] MLB game-state enrich skipped: ${e.message}`);
    }
  }

  return rows.map(({ _bdl, ...r }) => r);   // keep _etDate; strip the raw BDL object
}

function nbaRows() {
  return bdl.getNbaGamesForDate(targetDate).then((games) => (games || []).map((g) => {
    const status = normStatus(g.status);
    let detail = null;
    if (status === 'live') {
      const q = Number.isFinite(Number(g.period)) && Number(g.period) > 0 ? `Q${g.period}` : 'LIVE';
      detail = g.time ? `${q} ${g.time}`.trim() : q;
    } else if (status === 'final') {
      detail = 'FINAL';
    }
    return {
      league: 'NBA',
      game_id: String(g.id),
      away_abbr: g.visitor_team?.abbreviation ?? null,
      home_abbr: g.home_team?.abbreviation ?? null,
      away_score: numOrNull(g.visitor_team_score),
      home_score: numOrNull(g.home_team_score),
      status,
      detail,
      outs: null,
      bases: null,
    };
  }));
}

// BDL's football games carry an ISO start in `date`, but the `dates[]` filter
// is UTC-based. One request asks for both possible UTC dates, then the shared
// normalizer keeps only games whose actual start belongs to targetDate in ET.
// NFL explicitly asks for preseason + regular + postseason; BDL otherwise
// excludes preseason, which would make August games disappear from live score.
async function footballRows(league) {
  const request = footballBdlRequest(league, targetDate);
  const games = (await bdl.getGames(request.sportKey, request.params, 1)) || [];
  const normalized = normalizeFootballGames(games, {
    league,
    targetDate,
    nowMs: Date.now(),
  });
  for (const issue of normalized.issues) {
    console.warn(`[live-scores] ${league} game ${issue.gameId ?? '?'} skipped: ${issue.message}`);
  }
  if (normalized.rows.length === 0 && normalized.issues.length > 0) {
    throw new Error(`${league} returned games but none had a usable live-score shape`);
  }
  return normalized.rows.map((item) => item.row);
}

// NHL via the league's public score API (no key). gameState values observed
// live on 2026-06-04: FUT/PRE (scheduled), LIVE/CRIT (in progress),
// FINAL/OFF (settled). Detail composes "P2 12:51" / "INT1" / "OT 4:31" / "SO".
async function nhlRows() {
  const { data } = await axios.get(`https://api-web.nhle.com/v1/score/${targetDate}`, { timeout: 15000 });
  return (data?.games || [])
    .filter((g) => g.gameDate === targetDate)
    .map((g) => {
      const state = String(g.gameState || '').toUpperCase();
      const status = ['FINAL', 'OFF'].includes(state) ? 'final'
        : ['LIVE', 'CRIT'].includes(state) ? 'live' : 'scheduled';
      let detail = null;
      if (status === 'live') {
        const pd = g.periodDescriptor || {};
        const n = Number(g.period ?? pd.number);
        const label = pd.periodType === 'SO' ? 'SO'
          : pd.periodType === 'OT' ? 'OT'
          : Number.isFinite(n) && n > 0 ? `P${n}` : 'LIVE';
        detail = g.clock?.inIntermission && Number.isFinite(n) ? `INT${n}`
          : g.clock?.timeRemaining ? `${label} ${g.clock.timeRemaining}` : label;
      } else if (status === 'final') {
        detail = 'FINAL';
      }
      return {
        league: 'NHL',
        game_id: String(g.id),
        away_abbr: g.awayTeam?.abbrev ?? null,
        home_abbr: g.homeTeam?.abbrev ?? null,
        away_score: numOrNull(g.awayTeam?.score),
        home_score: numOrNull(g.homeTeam?.score),
        status,
        detail,
        outs: null,
        bases: null,
      };
    });
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Live grading on FINAL ────────────────────────────────────────────────────
// When a game JUST went final, grade its pick + props + insights now instead of
// waiting for the 6:45am batch — so Billfold / Winners / Home / The Receipts
// update on the next app refresh, minutes after the final whistle. The graders
// are idempotent (they dedup / skip already-graded rows), and a lock keeps two
// finals from grading concurrently (which could double-insert results). The
// 6:45am batch stays as a backstop for anything missed (e.g. a late game that
// finalizes after midnight under the prior date).

/** Exact game states already present before this poll writes. */
async function fetchPrevScoreRows(date) {
  try {
    const { data } = await axios.get(
      `${REST_URL}?date=eq.${date}&select=league,game_id,status`,
      { headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` }, timeout: 10000 },
    );
    if (!Array.isArray(data)) throw new Error('live_scores returned a non-array state payload');
    return data;
  } catch (error) {
    // Do not write a final frame when its prior state is unknown. Otherwise the
    // next poll sees it as already final and the one transition that triggers
    // grading is lost permanently.
    throw new Error(`Could not read prior final-game state: ${error?.message || error}`);
  }
}

// Exact-date, pre-provider source gate. A valid populated daily_slate is the
// schedule authority, so an absent league is never called. An unavailable or
// empty slate fails open through the shared resolver: spending a few extra
// requests is safer than silently hiding scheduled football while the morning
// slate is still being assembled.
async function liveScoreSourceGate(date, supportedLeagues) {
  if (!DAILY_SLATE_REST_URL || !adminKey) {
    return resolveLiveScoreSourceGate({
      error: 'Supabase daily_slate configuration missing',
      supportedLeagues,
    });
  }

  try {
    const { data } = await axios.get(DAILY_SLATE_REST_URL, {
      params: { date: `eq.${date}`, select: 'league' },
      headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
      timeout: 10000,
    });
    return resolveLiveScoreSourceGate({ rows: data, supportedLeagues });
  } catch (error) {
    return resolveLiveScoreSourceGate({
      error: error?.message || String(error),
      supportedLeagues,
    });
  }
}

function launchLockedWorker(workerArgs, label) {
  const child = spawn('/usr/bin/lockf', [
    '-s',
    '-t', '0',
    '-k',
    LIVE_MAINTENANCE_LOCK,
    process.execPath,
    ...workerArgs,
  ], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: 'inherit',
    env: process.env,
  });
  child.once('error', (error) => {
    console.error(`[${label}] could not launch worker: ${error.message}`);
  });
  child.unref();
}

function launchPendingGrading() {
  const pending = pendingGradeFiles();
  if (!pending.length) return false;
  console.log(`[live-grade] launching ${pending.length} retained grading request(s)`);
  launchLockedWorker(['scripts/run-live-finalization.js'], 'live-grade');
  return true;
}

function proofMarker(date, league) {
  return `/tmp/gary-football-proof-${date}-${league.toLowerCase()}.success`;
}

function proofDue(date, league) {
  try {
    return (Date.now() - statSync(proofMarker(date, league)).mtimeMs) >= FOOTBALL_PROOF_INTERVAL_MS;
  } catch {
    return true;
  }
}

function launchFootballProofIfDue(date, rows) {
  const leagues = [...new Set(rows
    .filter((row) => row.date === date && (row.league === 'NFL' || row.league === 'NCAAF'))
    .map((row) => row.league))]
    .filter((league) => proofDue(date, league));
  if (!leagues.length) return false;
  console.log(`[football-proof] launching ${leagues.join(',')} through the live-score lifecycle…`);
  launchLockedWorker([
    'scripts/run-live-football-proof.js',
    '--date', date,
    '--league', leagues.join(','),
  ], 'football-proof');
  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────

/* ── LIVE BET-EVENTS (founder, Jul 7) — the prop markets already CASHED in a
 * live game: MLB homers / steals / multi-hit days / K milestones via the
 * live box. Written as a surgical PATCH per game so the cloud score poller
 * (which doesn't carry this column) can never clobber it. Honest-empty:
 * a failed fetch writes nothing. */

const evLastName = (n) => String(n || '').trim().split(/\s+/).pop() || '';

async function mlbLiveEvents(gameId) {
  try {
    const rows = (await bdl.getMlbGameStats({ gameIds: [Number(gameId)] }, 1)) || [];
    const out = [];
    for (const r of rows) {
      const nm = (r.player?.last_name || evLastName(r.player_name || '')).toUpperCase();
      if (!nm) continue;
      const hr = Number(r.hr) || 0;
      if (hr >= 1) out.push({ k: 'hr', p: nm, d: hr > 1 ? `x${hr}` : null });
      const sb = Number(r.sb ?? r.stolen_bases) || 0;
      if (sb >= 1) out.push({ k: 'sb', p: nm, d: null });
      const hits = Number(r.hits) || 0;
      if (hits >= 2) out.push({ k: 'hits', p: nm, d: `${hits} HITS` });
      const ks = Number(r.p_k) || 0;
      if (ks >= 7) out.push({ k: 'ks', p: nm, d: `${ks} KS` });
    }
    const rank = { hr: 0, sb: 1, hits: 2, ks: 3 };
    out.sort((a, b) => (rank[a.k] ?? 9) - (rank[b.k] ?? 9));
    return out.slice(0, 8);
  } catch (e) {
    console.warn(`[events] MLB ${gameId}: ${e.message}`);
    return null;
  }
}

async function run() {
  // Which games were ALREADY final before this poll wrote — so we grade only the
  // ones that flip to final on THIS poll (each game triggers grading exactly once).
  const prevScoreRows = dryRun ? null : await fetchPrevScoreRows(targetDate);
  const prevFinalIds = prevScoreRows
    ? new Set(prevScoreRows
        .filter((row) => String(row?.status || '').toLowerCase() === 'final')
        .map((row) => `${row.league}:${row.game_id}`))
    : null;

  // Keep providers behind closures. Constructing promises here would spend the
  // BDL request before the daily_slate gate had a chance to exclude the league.
  const sourceCatalog = [
    { name: 'MLB', load: () => mlbRows() },
    { name: 'NBA', load: () => nbaRows() },
    { name: 'NHL', load: () => nhlRows() },
    { name: 'NFL', load: () => footballRows('NFL') },
    { name: 'NCAAF', load: () => footballRows('NCAAF') },
  ];
  const sourceGate = await liveScoreSourceGate(
    targetDate,
    sourceCatalog.map((source) => source.name),
  );
  const sources = selectLiveScoreSources(sourceGate, sourceCatalog);
  if (sourceGate.authoritative) {
    console.log(`[live-scores] daily_slate source gate ${targetDate}: ${sourceGate.leagues.join(', ')}`);
  } else {
    console.warn(`[live-scores] ${sourceGate.mode}; polling all sources (${sourceGate.reason})`);
  }
  const settled = await Promise.allSettled(sources.map((source) => source.load()));
  const evaluated = evaluateLiveScoreSourceResults({
    gate: sourceGate,
    sources,
    settled,
    // Preserve the pre-gate local contract: when daily_slate cannot tell us
    // what is expected, a rejected football source still exits non-zero.
    alwaysRequiredLeagues: ['NFL', 'NCAAF'],
  });
  const rows = evaluated.items;
  for (const failure of evaluated.failures) {
    console.warn(`[live-scores] ${failure.name} source failed: ${failure.message}`);
  }

  const assertExpectedSources = () => {
    if (evaluated.requiredFailures.length > 0) {
      const messages = evaluated.requiredFailures
        .map((failure) => `${failure.name}: ${failure.message}`);
      throw new Error(`expected live-score source failure — ${messages.join('; ')}`);
    }
  };

  // Stamp each row by its OWN ET slate date (falling back to targetDate when a
  // game carried no datetime). A late game returned under tomorrow's UTC date is
  // routed to its real slate day, so it never leaks onto tomorrow's board and its
  // final lands on the correct day's row.
  const stamped = rows.map(({ _etDate, ...r }) => ({
    ...r, date: _etDate || targetDate, updated_at: new Date().toISOString(),
  }));
  const live = stamped.filter((r) => r.status === 'live').length;
  const final = stamped.filter((r) => r.status === 'final').length;

  // Persist grading requests BEFORE writing the final score frame. The
  // database upsert and local launchd queue cannot share one transaction; this
  // ordering makes the queue the durable side of that boundary. If this
  // process stops after queueing but before the upsert, the request remains and
  // is launched only after a later successful score poll. Writing the DB first
  // would lose the only scheduled -> final edge forever on a crash.
  const newlyFinal = prevFinalIds
    ? stamped.filter(
      (r) => r.status === 'final' && r.date === targetDate
        && !prevFinalIds.has(`${r.league}:${r.game_id}`),
    )
    : [];
  if (!dryRun) {
    // Preserve the established edge-triggered behavior for MLB/NBA/NHL. The
    // football lane below is deliberately level-triggered, so a faster cloud
    // score writer cannot consume the only scheduled -> final edge.
    const newlyFinalNonFootball = newlyFinal.filter(
      (row) => row.league !== 'NFL' && row.league !== 'NCAAF',
    );
    if (newlyFinalNonFootball.length > 0) {
      const labels = newlyFinalNonFootball
        .map((r) => `${r.away_abbr ?? '?'}@${r.home_abbr ?? '?'}`)
        .join(', ');
      console.log(`[live-grade] ${newlyFinalNonFootball.length} game(s) just went FINAL: ${labels}`);
      queueExactGradeRequest({
        date: targetDate,
        games: newlyFinalNonFootball,
        reason: 'local-final-transition',
      });
    }

    const finalFootball = stamped.filter(
      (row) => row.date === targetDate
        && row.status === 'final'
        && (row.league === 'NFL' || row.league === 'NCAAF'),
    );
    if (finalFootball.length > 0) {
      let incomplete;
      try {
        incomplete = await loadIncompleteFinalFootballGames({
          date: targetDate,
          finalGames: finalFootball,
          supabaseUrl,
          key: adminKey,
          client: axios,
        });
      } catch (error) {
        // Coverage state is fail-closed. Queue every exact final rather than
        // treating an unreadable result/proof table as proof of completion.
        console.warn(`[live-grade] football settlement read failed; queueing exact finals: ${error.message}`);
        incomplete = finalFootball.map((row) => ({
          date: targetDate,
          league: row.league,
          game_id: row.game_id,
          missing: ['coverage_read'],
        }));
      }
      const queued = queueExactGradeRequest({
        date: targetDate,
        games: incomplete,
        reason: 'football-final-reconciliation',
      });
      if (queued.queued.length > 0) {
        const labels = queued.queued.map((game) => `${game.league}:${game.game_id}`).join(', ');
        const missing = incomplete
          .filter((game) => queued.queued.some((candidate) =>
            candidate.league === game.league && candidate.game_id === game.game_id))
          .flatMap((game) => game.missing || []);
        console.log(
          `[live-grade] queued ${queued.queued.length} incomplete football final(s): ${labels}`
            + `${missing.length ? ` (${[...new Set(missing)].join(', ')})` : ''}`,
        );
      }
    }
  }

  if (dryRun) {
    console.log(JSON.stringify(stamped, null, 2));
    console.log(`🧪 DRY RUN — ${stamped.length} game(s): ${live} live, ${final} final.`);
    assertExpectedSources();
    return;
  }
  if (!stamped.length) {
    assertExpectedSources();
    launchPendingGrading();
    console.log(`No games for ${targetDate} — nothing to write.`);
    return;
  }

  // Upsert on (date, league, game_id) so each poll updates rows in place.
  await axios({
    method: 'POST',
    url: `${REST_URL}?on_conflict=date,league,game_id`,
    data: JSON.parse(JSON.stringify(stamped)),
    headers: {
      apikey: adminKey,
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
  });
  console.log(`✅ live_scores: ${stamped.length} game(s) for ${targetDate} (${live} live, ${final} final).`);

  // ── the cashed-props pass, live games only ──
  const liveRows = stamped.filter((r) => r.status === 'live');
  for (const r of liveRows) {
    const events = r.league === 'MLB' ? await mlbLiveEvents(r.game_id) : null;
    if (!events) continue;
    try {
      await axios({
        method: 'PATCH',
        url: `${REST_URL}?date=eq.${r.date}&league=eq.${encodeURIComponent(r.league)}&game_id=eq.${encodeURIComponent(r.game_id)}`,
        data: { events },
        headers: {
          apikey: adminKey,
          Authorization: `Bearer ${adminKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
      });
      if (events.length) console.log(`🎯 ${r.league} ${r.game_id}: ${events.length} cashed-prop event(s).`);
    } catch (e) {
      console.warn(`[events] write ${r.league} ${r.game_id}: ${e.message}`);
    }
  }

  // Phantom-row cleanup: a prior poll (or a bad source frame) can leave a DUPLICATE
  // game_id for the same matchup — live: a bogus "BAL 5 · SEA 3" lingered beside the
  // real "BAL 0 · SEA 3" final, and the app deduped to the phantom. For EACH league
  // we actually fetched this poll, drop today's rows whose game_id isn't in the slate
  // we just wrote. Per-league so a failed/empty league fetch never deletes its valid
  // rows (we only ever delete within a league that produced games).
  // ONLY today's-date rows drive the cleanup: a spillover game stamped to its own
  // (prior) day is upserted but NOT cleanup-managed here — this poll doesn't hold
  // that day's full slate, so it must never delete from it (that would wipe the
  // prior day's legitimate daytime games).
  const slateByLeague = {};
  for (const r of stamped) {
    if (r.date !== targetDate) continue;
    (slateByLeague[r.league] ||= new Set()).add(String(r.game_id));
  }
  for (const [lg, ids] of Object.entries(slateByLeague)) {
    // A delayed/postponed/suspended MLB game may vanish from one provider
    // response. Keep its exact prior row until the provider returns a resumed,
    // final, or cancelled frame; cleanup remains exact for every other row.
    const retainedInterruptedIds = lg === 'MLB'
      ? (prevScoreRows || [])
          .filter((row) => row?.league === 'MLB' && isRecoverableMlbGameInterruption(row?.status))
          .map((row) => String(row.game_id))
      : [];
    const keep = [...new Set([...ids, ...retainedInterruptedIds])].filter(Boolean);
    if (!keep.length) continue;
    try {
      await axios({
        method: 'DELETE',
        url: `${REST_URL}?date=eq.${targetDate}&league=eq.${encodeURIComponent(lg)}&game_id=not.in.(${keep.join(',')})`,
        headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}`, Prefer: 'return=minimal' },
      });
    } catch (e) { console.warn(`[live_scores] phantom-row cleanup (${lg}) failed: ${e?.message || e}`); }
  }

  // Purge stale rows from PAST slate days — live_scores only holds the live/today
  // slate (last night's finals come from game_results). Without this every game ever
  // polled accumulated (a whole season of rows leaked in + caused stale matches).
  try {
    await axios({
      method: 'DELETE',
      url: `${REST_URL}?date=lt.${targetDate}`,
      headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}`, Prefer: 'return=minimal' },
    });
  } catch (e) { console.warn(`[live_scores] stale-day purge failed: ${e?.message || e}`); }

  // A retained pending request closes both historical one-shot gaps: a busy
  // maintenance lock and a failed grader. The next two-minute poll keeps
  // retrying until the established results -> insight sequence succeeds. This
  // also lets a prior-day request finish after the ET date rolls over.
  const gradingLaunched = launchPendingGrading();

  // THE SWEAT is live evidence, not a final-only receipt. Refresh it on the same
  // 15-minute cadence the cloud backstop used, but from this existing local
  // live-score job so it shares the machine's BDL gate/cache and one owner.
  if (!gradingLaunched) launchFootballProofIfDue(targetDate, stamped);

  // Successful leagues are persisted before surfacing an expected-source
  // failure, so healthy feeds stay fresh while launchd still receives a
  // non-zero status and can retry the missing league.
  assertExpectedSources();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('live-scores poll failed:', err.response?.data ? JSON.stringify(err.response.data) : err.message);
    process.exit(1);
  });
