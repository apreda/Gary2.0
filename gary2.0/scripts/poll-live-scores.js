#!/usr/bin/env node
/**
 * Live Scores Poller
 *
 * Snapshots today's slate (MLB / NBA / NHL / WC) into the `live_scores`
 * Supabase table so the iOS app can show scores while games are in progress.
 * Designed to run every ~2 minutes via launchd (com.gary2.live-scores): one
 * cached call per league, upsert one row per game, exit. When nothing is live
 * the whole run is a couple of cheap cached reads — safe to fire all day.
 *
 * Status normalization: scheduled | live | final. `detail` is a short
 * render-ready string ("INN 7", "Q3 4:12", "64'") composed here so the app
 * stays dumb.
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
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getESTDate } from '../src/utils/dateUtils.js';
import { etDateStr } from '../src/services/insights/shared.js';

const { ballDontLieService: bdl } = await import('../src/services/ballDontLieService.js');
const fifaWorldCup = await import('../src/services/fifaWorldCupService.js');
// MLB Stats API: BDL has neither outs nor baserunners, so live MLB game state
// (outs + who's on base) is enriched from statsapi.mlb.com's linescore.
const mlbStats = await import('../src/services/mlbStatsApiService.js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/live_scores` : null;
const PROJECT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADE_LOCK = '/tmp/gary-live-grade.lock';
const GRADE_LOCK_TTL_MS = 8 * 60 * 1000; // a hung grader can't wedge triggering forever

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateIdx = args.indexOf('--date');
const targetDate = dateIdx !== -1 ? args[dateIdx + 1] : getESTDate();

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
  const games = (await bdl.getMlbGamesForDate(targetDate)) || [];
  const rows = games.map((g) => {
    const status = normStatus(g.status);
    const detail = status === 'live' && Number.isFinite(Number(g.period))
      ? `INN ${g.period}` : status === 'final' ? 'FINAL' : null;
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
  });

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

function wcRows() {
  return fifaWorldCup.getMatchesForDate(targetDate).then((matches) => (matches || []).map((m) => {
    const raw = String(m.status || '').toLowerCase();
    const status = raw === 'completed' ? 'final' : raw === 'scheduled' ? 'scheduled' : 'live';
    return {
      league: 'WC',
      game_id: String(m.id),
      away_abbr: m.away_team?.abbreviation ?? null,
      home_abbr: m.home_team?.abbreviation ?? null,
      away_score: numOrNull(m.away_score),
      home_score: numOrNull(m.home_score),
      status,
      // Live WC matches carry the match minute in clock_display ("67'") — surface
      // it as the detail so the card shows the minute, not a bare "LIVE".
      detail: status === 'final' ? 'FINAL'
        : status === 'live' ? (String(m.clock_display || '').trim() || 'LIVE')
        : null,
      outs: null,
      bases: null,
      // ET slate date (a 10pm ET match = next UTC day; keep it on its own day).
      _etDate: etDateStr(m.datetime || m.commence_time),
    };
  }));
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

/** Game-ids that were ALREADY final in live_scores before this poll wrote. */
async function fetchPrevFinalIds(date) {
  try {
    const { data } = await axios.get(
      `${REST_URL}?date=eq.${date}&status=eq.final&select=league,game_id`,
      { headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` }, timeout: 10000 },
    );
    return new Set((data || []).map((r) => `${r.league}:${r.game_id}`));
  } catch {
    return null; // unknown prior state -> don't trigger this cycle; the next one retries
  }
}

function gradingLocked() {
  try {
    return existsSync(GRADE_LOCK) && (Date.now() - statSync(GRADE_LOCK).mtimeMs) < GRADE_LOCK_TTL_MS;
  } catch { return false; }
}

function triggerGrading(date) {
  if (gradingLocked()) {
    console.log('[live-grade] a grading run is already in flight — skipping this trigger');
    return;
  }
  try { writeFileSync(GRADE_LOCK, String(Date.now())); } catch { /* best-effort lock */ }
  console.log(`[live-grade] grading ${date} — picks + props, then the insight board…`);
  // Picks/props first (game_results, prop_results), then insights. Release the
  // lock when both finish OR on error so a crash can't wedge future triggers.
  const cmd =
    `node scripts/run-all-results.js ${date} && node run-grade-insights.js --date ${date}; rm -f ${GRADE_LOCK}`;
  const child = spawn('bash', ['-lc', cmd], {
    cwd: PROJECT_DIR, detached: true, stdio: 'ignore', env: process.env,
  });
  child.unref();
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  // Which games were ALREADY final before this poll wrote — so we grade only the
  // ones that flip to final on THIS poll (each game triggers grading exactly once).
  const prevFinalIds = dryRun ? null : await fetchPrevFinalIds(targetDate);

  const settled = await Promise.allSettled([mlbRows(), nbaRows(), nhlRows(), wcRows()]);
  const rows = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) rows.push(...r.value);
  }

  // Stamp each row by its OWN ET slate date (falling back to targetDate when a
  // game carried no datetime). A late game returned under tomorrow's UTC date is
  // routed to its real slate day, so it never leaks onto tomorrow's board and its
  // final lands on the correct day's row.
  const stamped = rows.map(({ _etDate, ...r }) => ({
    ...r, date: _etDate || targetDate, updated_at: new Date().toISOString(),
  }));
  const live = stamped.filter((r) => r.status === 'live').length;
  const final = stamped.filter((r) => r.status === 'final').length;

  if (dryRun) {
    console.log(JSON.stringify(stamped, null, 2));
    console.log(`🧪 DRY RUN — ${stamped.length} game(s): ${live} live, ${final} final.`);
    return;
  }
  if (!stamped.length) {
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
    const keep = [...ids].filter(Boolean);
    if (!keep.length) continue;
    try {
      await axios({
        method: 'DELETE',
        url: `${REST_URL}?date=eq.${targetDate}&league=eq.${encodeURIComponent(lg)}&game_id=not.in.(${keep.join(',')})`,
        headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}`, Prefer: 'return=minimal' },
      });
    } catch (e) { console.warn(`[live_scores] phantom-row cleanup (${lg}) failed: ${e?.message || e}`); }
  }

  // Grade any of TODAY's games that JUST went final — picks/props/insights now,
  // not at 6:45am. Only today's-date rows: a spillover game stamped to its own
  // (prior) day isn't this poll's slate to grade — it grades under its own day /
  // the morning batch, so it can't spuriously re-trigger today's grader each poll.
  if (prevFinalIds) {
    const newlyFinal = stamped.filter(
      (r) => r.status === 'final' && r.date === targetDate
        && !prevFinalIds.has(`${r.league}:${r.game_id}`),
    );
    if (newlyFinal.length > 0) {
      const labels = newlyFinal.map((r) => `${r.away_abbr ?? '?'}@${r.home_abbr ?? '?'}`).join(', ');
      console.log(`[live-grade] ${newlyFinal.length} game(s) just went FINAL: ${labels}`);
      triggerGrading(targetDate);
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('live-scores poll failed:', err.response?.data ? JSON.stringify(err.response.data) : err.message);
    process.exit(1);
  });
