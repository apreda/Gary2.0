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
import { getESTDate } from '../src/utils/dateUtils.js';

const { ballDontLieService: bdl } = await import('../src/services/ballDontLieService.js');
const fifaWorldCup = await import('../src/services/fifaWorldCupService.js');
// MLB Stats API: BDL has neither outs nor baserunners, so live MLB game state
// (outs + who's on base) is enriched from statsapi.mlb.com's linescore.
const mlbStats = await import('../src/services/mlbStatsApiService.js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/live_scores` : null;

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

  return rows.map(({ _bdl, ...r }) => r);
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
    };
  }));
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  const settled = await Promise.allSettled([mlbRows(), nbaRows(), nhlRows(), wcRows()]);
  const rows = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) rows.push(...r.value);
  }

  const stamped = rows.map((r) => ({ ...r, date: targetDate, updated_at: new Date().toISOString() }));
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
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('live-scores poll failed:', err.response?.data ? JSON.stringify(err.response.data) : err.message);
    process.exit(1);
  });
