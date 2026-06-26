// gary2.0/src/services/insights/leaguePulse.js
//
// Builds "League Pulse" — league-wide daily leaderboard tables that power the iOS
// Pulse view. ONE pack per (date, league, tab); each pack carries that tab's whole
// short table as a generic { columns:[{key,label,align,emphasis}], rows:[{...}] }
// so a single Swift PulseTable view renders every tab with NO per-tab Swift code.
//
// GROUNDING IS THE ONLY RULE (identical to playerInsightCards / wcPlayerInsightCards):
//   - Every cell is computed from a real, verifiable source (BDL GOAT-tier for MLB,
//     mlb/v1/player_injuries for MLB injuries, API-Football for WC).
//   - Any stat that cannot be computed is OMITTED, never invented. A tab that can't
//     be grounded at all simply isn't emitted — iOS hides any tab with no row.
//   - Cells are display STRINGS (the iOS decodes rows as [String: String?]); a
//     reserved "team"/"trend"/"highlight" key is added only when present.
//
// Defensive contract (house rules): NEVER throws. Every fetch goes through safeCall;
// a failed source yields a thinner (or dropped) tab, never a crash. Copy is plain /
// factual — no Layer-3 conclusions, no bet instructions (the form_xg diff column
// surfaces a NUMBER only, never a "fade them" read).
//
// Output shape (one element per tab):
//   { date, league, tab, title, subtitle?, sort_note?, columns:[...], rows:[...] }
// run-league-pulse.js maps these straight onto the league_pulse table columns and
// UPSERTs on (date, league, tab) — a full-row replace each run (live snapshot).

import {
  num, asArray, round, pct3, nameKey, safeCall as safeCallShared,
} from './shared.js';
import * as apiFootball from '../apiFootballService.js';

const safeCall = (fn, fallback) => safeCallShared(fn, fallback, 'leaguePulse');

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

const TOP_N = 15;                 // cap each league-wide leaderboard

// MLB starting pitchers
const SP_WINDOW_DAYS = 30;        // L30 ERA/K9/WHIP window
const SP_MIN_OUTS = 9;            // >= 3 IP across the window to qualify (fail closed)

// MLB hot/cold bats
const BAT_WINDOW_DAYS = 30;
const BAT_MIN_AB = 40;            // min AB over the window (per spec)
const BAT_TREND_OPS_GAP = 0.080;  // L30 OPS vs season OPS gap to flag hot/cold

// MLB bullpen (reduced — see tab note)
const PEN_GAMES = 3;              // last N completed games per team
const PEN_HEAVY_IP = 11;          // relief IP over the window flagged "heavy"

// MLB injuries — LOCKED label thresholds (read-only consume, do NOT change logic):
//   FRESH = 0-3 days on the real injury timeline (BDL return_date / onset date),
//   PRICED-IN = > 3 days. Keyed on the canonical timeline, NOT a row's last-edit
//   metadata (updated_at / report_date), so a long-standing injury edited today
//   is correctly PRICED-IN. See freshnessLabel().
const INJ_FRESH_MAX_DAYS = 3;

// WC discipline accumulation flag (honest, only when card data present).
const WC_SUSP_YELLOW_THRESHOLD = 2; // 2 yellows in a tournament = 1 from a ban (group stage rule)

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the day's League Pulse tab packs for one league.
 *
 * @param {object} args
 * @param {string} args.date    YYYY-MM-DD (ET slate day)
 * @param {string} args.league  'MLB' | 'WC'
 * @returns {Promise<Array<{date,league,tab,title,subtitle,sort_note,columns,rows}>>}
 */
export async function buildLeaguePulse({ date, league } = {}) {
  const lg = String(league || '').toUpperCase();
  if (lg === 'MLB') return buildMlbPulse(date);
  if (lg === 'WC') return buildWcPulse(date);
  return [];
}

// ═════════════════════════════════════════════════════════════════════════════
// MLB
// ═════════════════════════════════════════════════════════════════════════════

async function buildMlbPulse(date) {
  const bdl = await loadBdl();
  if (!bdl) return [];

  const season = seasonForDate(date);
  const games = asArray(await safeCall(() => bdl.getMlbGamesForDate(date), []))
    .map(normalizeGame)
    .filter(Boolean);
  if (!games.length) {
    console.log('[leaguePulse] MLB: empty slate — nothing to build.');
    return [];
  }

  // Per-game lineups (memoized): probable starters + batting orders, plus slate
  // team ids/abbrs for the injuries filter.
  const lineupMemo = new Map();
  const getLineups = (gameId) => memo(lineupMemo, gameId, () => safeCall(() => bdl.getMlbLineups(gameId), null));

  const teamMeta = new Map();   // teamId -> { abbr }
  for (const g of games) {
    for (const t of [g.home_team, g.visitor_team]) {
      if (t?.id != null) teamMeta.set(String(t.id), { abbr: t.abbreviation || t.name || null });
    }
  }

  // Probable starters (today's slate) + slate batters from the posted lineups.
  const probablePitcherIds = new Set();
  const batterIds = new Set();
  for (const g of games) {
    const lu = await getLineups(g.id);
    if (!lu || typeof lu !== 'object') continue;
    for (const abbr of Object.keys(lu)) {
      const side = lu[abbr];
      if (side?.pitcher?.playerId != null) probablePitcherIds.add(String(side.pitcher.playerId));
      for (const b of asArray(side?.batters)) {
        if (b?.playerId != null) batterIds.add(String(b.playerId));
      }
    }
  }

  const packs = [];

  const sp = await safeCall(() => buildMlbStartingPitchers({ date, season, bdl, probablePitcherIds }), null);
  if (sp) packs.push(sp);

  const bats = await safeCall(() => buildMlbHotColdBats({ date, season, bdl, batterIds }), null);
  if (bats) packs.push(bats);

  const pen = await safeCall(() => buildMlbBullpen({ date, season, bdl, games, teamMeta, getLineups }), null);
  if (pen) packs.push(pen);

  const inj = await safeCall(() => buildMlbInjuries({ date, bdl, teamMeta }), null);
  if (inj) packs.push(inj);

  console.log(`[leaguePulse] MLB: built ${packs.length} tab(s): ${packs.map((p) => p.tab).join(', ') || 'none'}.`);
  return packs;
}

// ─── 1) STARTING PITCHERS ──────────────────────────────────────────────────

async function buildMlbStartingPitchers({ date, season, bdl, probablePitcherIds }) {
  const ids = [...probablePitcherIds];
  if (!ids.length) return null;

  const cutoffMs = dayCutoffMs(date, SP_WINDOW_DAYS);
  const rows = [];

  for (const pid of ids) {
    const chrono = asArray(await safeCall(() => bdl.getMlbPlayerGameRowsChrono(pid, season), []));
    // Window = outings within the last SP_WINDOW_DAYS days with recorded innings.
    const window = chrono.filter((r) => ipOuts(r.ip) > 0 && inWindow(r._game?.date, cutoffMs));
    if (!window.length) continue;

    let outs = 0; let er = 0; let k = 0; let hits = 0; let bb = 0;
    for (const r of window) {
      outs += ipOuts(r.ip);
      er += num(r.er) ?? 0;
      k += num(r.p_k) ?? 0;
      hits += num(r.p_hits) ?? 0;
      bb += num(r.p_bb) ?? 0;
    }
    if (outs < SP_MIN_OUTS) continue; // fail closed on a thin window
    const ip = outs / 3;
    const era = (er / ip) * 9;
    const whip = (hits + bb) / ip;
    const k9 = (k / ip) * 9;

    const meta = await playerHeader(bdl, pid);
    rows.push({
      _sort: era,
      player: meta.name,
      ...(meta.abbr ? { team: meta.abbr } : {}),
      era: era.toFixed(2),
      k9: k9.toFixed(1),
      whip: whip.toFixed(2),
      gs: String(window.length),
      highlight: 'today', // every pitcher here is a today's probable starter
    });
  }

  if (!rows.length) return null;
  rows.sort((a, b) => a._sort - b._sort); // ERA low -> high
  const capped = rows.slice(0, TOP_N).map(stripSort);

  return pack(date, 'MLB', 'starting_pitchers', {
    title: 'Starting Pitchers',
    subtitle: 'Last 30 days · today’s probables',
    sort_note: 'Sorted by L30 ERA, low→high',
    columns: [
      col('player', 'PITCHER', 'leading', 'primary'),
      col('era', 'ERA', 'trailing', 'stat'),
      col('k9', 'K/9', 'trailing', 'stat'),
      col('whip', 'WHIP', 'trailing', 'muted'),
      col('gs', 'GS', 'trailing', 'muted'),
    ],
    rows: capped,
  });
}

// ─── 2) HOT / COLD BATS ──────────────────────────────────────────────────────

async function buildMlbHotColdBats({ date, season, bdl, batterIds }) {
  const ids = [...batterIds];
  if (!ids.length) return null;

  // Season baseline OPS for the hot/cold trend chip (one batched call).
  const seasonRows = asArray(await safeCall(() => bdl.getMlbPlayerSeasonStats({ season, playerIds: ids }), []));
  const seasonOpsById = new Map();
  for (const rec of seasonRows) {
    const id = rec?.player?.id;
    if (id == null) continue;
    seasonOpsById.set(String(id), num(rec.batting_ops));
  }

  const cutoffMs = dayCutoffMs(date, BAT_WINDOW_DAYS);
  const rows = [];

  for (const pid of ids) {
    // AUTHORITATIVE L30 line from the splits byDayMonth 'Last 30 Days' row
    // (the heatCheck idiom: avg / ops / at_bats). Fall back to chrono-summed
    // AVG when the split is thin.
    const splits = await safeCall(() => bdl.getMlbPlayerSplits({ playerId: pid, season }), null);
    const l30 = last30Row(splits);

    let avg = l30 ? num(l30.avg) : null;
    let ops = l30 ? num(l30.ops) : null;
    let ab = l30 ? num(l30.at_bats) : null;

    // Window chrono rows (for HR over the window + AVG fallback).
    const chrono = asArray(await safeCall(() => bdl.getMlbPlayerGameRowsChrono(pid, season), []));
    const window = chrono.filter((r) => num(r.at_bats) != null && inWindow(r._game?.date, cutoffMs));
    let hr = 0; let wAb = 0; let wHits = 0;
    for (const r of window) {
      hr += num(r.hr) ?? 0;
      wAb += num(r.at_bats) ?? 0;
      wHits += num(r.hits) ?? 0;
    }

    // Fallback AVG/AB from the window when the split is missing/thin.
    if ((avg == null || ab == null) && wAb > 0) {
      avg = avg ?? (wHits / wAb);
      ab = ab ?? wAb;
    }
    if (ab == null || ab < BAT_MIN_AB) continue;  // min 40 AB gate, fail closed
    if (avg == null && ops == null) continue;

    // Trend chip vs season OPS (only when both L30 ops + season ops exist).
    const seasonOps = seasonOpsById.get(String(pid));
    let trend = null;
    if (ops != null && seasonOps != null) {
      if (ops - seasonOps >= BAT_TREND_OPS_GAP) trend = 'hot';
      else if (seasonOps - ops >= BAT_TREND_OPS_GAP) trend = 'cold';
    }

    const meta = await playerHeader(bdl, pid);
    rows.push({
      _sort: ops != null ? ops : (avg != null ? avg : 0),
      player: meta.name,
      ...(meta.abbr ? { team: meta.abbr } : {}),
      avg: avg != null ? pct3(avg) : '—',
      ops: ops != null ? pct3(ops) : '—',
      hr: String(hr),
      ...(trend ? { trend } : {}),
    });
  }

  if (!rows.length) return null;
  rows.sort((a, b) => b._sort - a._sort); // OPS high (hot) -> low (cold)
  const capped = rows.slice(0, TOP_N).map(stripSort);

  return pack(date, 'MLB', 'hot_cold_bats', {
    title: 'Hot & Cold Bats',
    subtitle: 'Last 30 days · min 40 AB',
    sort_note: 'Sorted by L30 OPS, high→low',
    columns: [
      col('player', 'BATTER', 'leading', 'primary'),
      col('avg', 'AVG', 'trailing', 'stat'),
      col('ops', 'OPS', 'trailing', 'stat'),
      col('hr', 'HR', 'trailing', 'muted'),
      col('trend', '', 'trailing', 'muted'),
    ],
    rows: capped,
  });
}

// ─── 3) BULLPEN WATCH (reduced) ──────────────────────────────────────────────
//
// PARTIALLY GROUNDABLE -> ship LEAN. Per-reliever rest / pen ERA are NOT cleanly
// in BDL, so this tab carries ONLY the reliably-derivable relief-IP-last-3-days
// (total pitcher IP in the game minus the game's starter IP), flagged "heavy" when
// high. The back-to-back + pen_era columns are DROPPED (not fabricated). If even
// the relief-IP inference is unusable (no completed games), the whole tab is dropped.

async function buildMlbBullpen({ date, season, bdl, games, teamMeta, getLineups }) {
  // Each slate team's last PEN_GAMES completed games (from the season index).
  const index = await safeCall(() => bdl.getMlbSeasonGameIndex(season), new Map());
  if (!index || !index.size) return null;

  // teamId -> abbr already in teamMeta; we need each team's recent completed game ids.
  const slateTeamIds = [...teamMeta.keys()];
  if (!slateTeamIds.length) return null;

  // ONE whole-season game-stats pull (cursor-paginated + cached), then bucketed by
  // team locally — far cheaper than a per-team call. Each row carries team:{id} and
  // game_id; the season index (above) supplies status/date/seasonType for the join.
  const allStat = asArray(await safeCall(() => bdl.getMlbGameStats({ seasons: [season] }), []));
  if (!allStat.length) return null;
  const statByTeam = new Map();
  for (const r of allStat) {
    const tid = r?.team?.id != null ? String(r.team.id) : null;
    if (!tid || !slateTeamIds.includes(tid)) continue;
    if (!statByTeam.has(tid)) statByTeam.set(tid, []);
    statByTeam.get(tid).push(r);
  }

  const rows = [];
  for (const teamId of slateTeamIds) {
    const abbr = teamMeta.get(teamId)?.abbr || teamId;
    const teamRows = statByTeam.get(teamId) || [];
    if (!teamRows.length) continue;

    // Group this team's pitching lines by game, keep only FINAL non-spring games,
    // newest first, take the last PEN_GAMES.
    const byGame = new Map();
    for (const r of teamRows) {
      const gi = index.get(r.game_id);
      if (!gi || gi.status !== 'STATUS_FINAL' || gi.seasonType === 'spring_training') continue;
      if (ipOuts(r.ip) <= 0 && (num(r.p_k) == null) && (num(r.er) == null)) continue; // not a pitching line
      if (!byGame.has(r.game_id)) byGame.set(r.game_id, { date: gi.date, pitchers: [] });
      // Only rows that actually pitched (have outs or pitching counters).
      if (ipOuts(r.ip) > 0) byGame.get(r.game_id).pitchers.push(r);
    }
    const completed = [...byGame.entries()]
      .map(([gameId, v]) => ({ gameId, ...v }))
      .filter((g) => g.pitchers.length)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, PEN_GAMES);
    if (!completed.length) continue;

    // Relief IP = total pitcher outs in the game MINUS the starter's outs (the
    // starter = the pitcher with the most outs in that game — the documented,
    // approximate inference; labeled as such).
    let reliefOuts = 0;
    for (const g of completed) {
      const outsList = g.pitchers.map((p) => ipOuts(p.ip)).sort((x, y) => y - x);
      const total = outsList.reduce((a, b) => a + b, 0);
      const starterOuts = outsList[0] || 0;
      reliefOuts += Math.max(0, total - starterOuts);
    }
    const reliefIp = reliefOuts / 3;

    rows.push({
      _sort: reliefIp,
      team: abbr,
      ip3d: outsToIp(reliefOuts),
      flag: reliefIp >= PEN_HEAVY_IP ? 'heavy' : '',
      gms: String(completed.length),
    });
  }

  if (!rows.length) return null;
  rows.sort((a, b) => b._sort - a._sort); // heaviest workload first
  const capped = rows.slice(0, TOP_N).map(stripSort);

  return pack(date, 'MLB', 'bullpen', {
    title: 'Bullpen Watch',
    subtitle: 'Relief innings, last 3 games',
    sort_note: 'Sorted by relief IP, high→low',
    columns: [
      col('team', 'TEAM', 'leading', 'primary'),
      col('ip3d', 'RELIEF IP', 'trailing', 'stat'),
      col('flag', '', 'trailing', 'muted'),
      col('gms', 'GP', 'trailing', 'muted'),
    ],
    rows: capped,
  });
}

// ─── 4) KEY INJURIES ─────────────────────────────────────────────────────────

async function buildMlbInjuries({ date, bdl, teamMeta }) {
  const slateAbbrs = new Set([...teamMeta.values()].map((m) => m.abbr).filter(Boolean));
  const raw = asArray(await safeCall(() => bdl.getInjuriesGeneric('baseball_mlb'), []));
  if (!raw.length) return null;

  const todayMs = dayStartMs(date);
  const rows = [];
  for (const inj of raw) {
    const p = inj?.player || {};
    const teamObj = inj?.team || p.team || {};
    const abbr = teamObj.abbreviation || teamObj.abbr || null;
    // Filter to today's slate teams.
    if (abbr && slateAbbrs.size && !slateAbbrs.has(abbr)) continue;

    const name = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
    if (!name) continue;
    const status = inj.status || null;
    const note = injuryNote(inj);

    // FRESH (0-3d) / PRICED-IN (>3d) — read-only consume of the LOCKED definition.
    const since = freshnessLabel(inj, todayMs);

    rows.push({
      player: name,
      ...(abbr ? { team: abbr } : {}),
      status: status || '—',
      note: note || '—',
      ...(since ? { since } : {}),
    });
  }

  if (!rows.length) return null;
  // FRESH rows first (most actionable), then the rest; cap.
  rows.sort((a, b) => (a.since === 'FRESH' ? 0 : 1) - (b.since === 'FRESH' ? 0 : 1));
  const capped = rows.slice(0, TOP_N);

  return pack(date, 'MLB', 'injuries', {
    title: 'Key Injuries',
    subtitle: 'Around the league',
    columns: [
      col('player', 'PLAYER', 'leading', 'primary'),
      col('team', 'TEAM', 'leading', 'muted'),
      col('status', 'STATUS', 'trailing', 'stat'),
      col('note', 'NOTE', 'trailing', 'muted'),
      col('since', '', 'trailing', 'muted'),
    ],
    rows: capped,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// WC (World Cup)
// ═════════════════════════════════════════════════════════════════════════════

async function buildWcPulse(date) {
  const wc = await loadFifa();
  if (!wc) return [];

  const matches = asArray(await safeCall(() => wc.getMatchesForDate(date), []));
  if (!matches.length) {
    console.log('[leaguePulse] WC: empty slate — nothing to build.');
    return [];
  }

  // Distinct slate nations (name + abbr), de-duped by team id.
  const nations = new Map(); // teamId -> { name, abbr }
  for (const m of matches) {
    for (const side of ['home', 'away']) {
      const t = m?.[`${side}_team`];
      const obj = (t && typeof t === 'object') ? t : (typeof t === 'string' ? { name: t } : null);
      const data = m?.[`${side}_team_data`] || m?._raw?.[`${side}_team`] || obj;
      const id = data?.id ?? obj?.id ?? (obj?.name || data?.name);
      if (id == null) continue;
      const name = data?.name || obj?.name || null;
      const abbr = data?.abbreviation || data?.country_code || obj?.abbreviation || null;
      if (name) nations.set(String(id), { name, abbr });
    }
  }
  if (!nations.size) return null;

  const packs = [];

  const scorers = await safeCall(() => buildWcTopScorers({ date, nations }), null);
  if (scorers) packs.push(scorers);

  const formXg = await safeCall(() => buildWcFormXg({ date, nations }), null);
  if (formXg) packs.push(formXg);

  const inj = await safeCall(() => buildWcInjuries({ date, nations }), null);
  if (inj) packs.push(inj);

  const disc = await safeCall(() => buildWcDiscipline({ date, nations }), null);
  if (disc) packs.push(disc);

  console.log(`[leaguePulse] WC: built ${packs.length} tab(s): ${packs.map((p) => p.tab).join(', ') || 'none'}.`);
  return packs;
}

// ─── 1) TOP SCORERS ──────────────────────────────────────────────────────────

async function buildWcTopScorers({ date, nations }) {
  const rows = [];
  for (const [, meta] of nations) {
    const squad = await safeCall(() => apiFootball.getSquadStats(meta.name), {});
    for (const s of asArray(squad)) {
      const g = num(s.goals);
      const a = num(s.assists);
      const sh = num(s.shots);
      if (g == null && a == null) continue;
      // Only surface players with at least a goal or an assist (a leaderboard).
      if ((g ?? 0) <= 0 && (a ?? 0) <= 0) continue;
      rows.push({
        _sort: (g ?? 0) * 1000 + (a ?? 0), // goals primary, assists tiebreak
        player: s.name,
        ...(meta.abbr ? { team: meta.abbr } : {}),
        goals: String(g ?? 0),
        assists: String(a ?? 0),
        ...(sh != null ? { shots: String(sh) } : { shots: '—' }),
      });
    }
  }
  if (!rows.length) return null;
  rows.sort((a, b) => b._sort - a._sort);
  const capped = rows.slice(0, TOP_N).map(stripSort);

  return pack(date, 'WC', 'top_scorers', {
    title: 'Top Scorers',
    subtitle: 'Current international cycle',
    sort_note: 'Sorted by goals, high→low',
    columns: [
      col('player', 'PLAYER', 'leading', 'primary'),
      col('goals', 'G', 'trailing', 'stat'),
      col('assists', 'A', 'trailing', 'stat'),
      col('shots', 'SH', 'trailing', 'muted'),
    ],
    rows: capped,
  });
}

// ─── 2) FORM & xG ────────────────────────────────────────────────────────────

async function buildWcFormXg({ date, nations }) {
  const rows = [];
  for (const [, meta] of nations) {
    const form = await safeCall(() => apiFootball.getRecentForm(meta.name, 10), null);
    const tstats = await safeCall(() => apiFootball.getRecentTeamStats(meta.name, 6), {});
    const span = form?.l5 || form?.l10;
    const xg = num(tstats?.xg);
    const xga = num(tstats?.xga);
    // Require at least the form row (W-D-L) to surface the nation at all.
    if (!span || !num(span.played)) continue;

    const gf = num(span.gfPerMatch);
    const entry = {
      _sort: xg != null ? xg : -1,
      team: meta.name,
    };
    entry.form = `${span.w}-${span.d}-${span.l}`;
    if (xg != null) entry.xg = xg.toFixed(2);
    if (xga != null) entry.xga = xga.toFixed(2);
    // diff = goals scored per match - xG (the team-level over/under-finishing
    // signal). NUMBER ONLY (Layer-3-safe): no "fade them" conclusion text.
    if (gf != null && xg != null) {
      const diff = round(gf - xg, 1);
      entry.diff = (diff > 0 ? '+' : '') + diff.toFixed(1);
      // trend tag mirrors the wcXgRegression idiom: over-finishing => 'cold'
      // (regression-down risk), under-finishing => 'hot'. Tag only, no text.
      if (diff >= 0.4) entry.trend = 'cold';
      else if (diff <= -0.4) entry.trend = 'hot';
    }
    rows.push(entry);
  }
  if (!rows.length) return null;
  rows.sort((a, b) => b._sort - a._sort); // best xG-for first
  const capped = rows.slice(0, TOP_N).map(stripSort);

  return pack(date, 'WC', 'form_xg', {
    title: 'Form & xG',
    subtitle: 'Last 6 internationals · over/under-performers',
    sort_note: 'Sorted by xG for/match, high→low',
    columns: [
      col('team', 'NATION', 'leading', 'primary'),
      col('form', 'L5', 'trailing', 'stat'),
      col('xg', 'xG', 'trailing', 'stat'),
      col('xga', 'xGA', 'trailing', 'muted'),
      col('diff', 'G−xG', 'trailing', 'muted'),
    ],
    rows: capped,
  });
}

// ─── 3) KEY INJURIES ─────────────────────────────────────────────────────────

async function buildWcInjuries({ date, nations }) {
  const rows = [];
  const seen = new Set();
  for (const [, meta] of nations) {
    const list = asArray(await safeCall(() => apiFootball.getInjuries(meta.name), []));
    for (const x of list) {
      if (!x?.player) continue;
      const k = `${nameKey(x.player)}|${meta.abbr || meta.name}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({
        player: x.player,
        ...(meta.abbr ? { team: meta.abbr } : { team: meta.name }),
        reason: x.reason || '—',
        type: x.type || '—',
      });
    }
  }
  if (!rows.length) return null;
  const capped = rows.slice(0, TOP_N);

  return pack(date, 'WC', 'injuries', {
    title: 'Key Injuries',
    subtitle: 'Squad availability',
    columns: [
      col('player', 'PLAYER', 'leading', 'primary'),
      col('team', 'NATION', 'leading', 'muted'),
      col('reason', 'REASON', 'trailing', 'stat'),
      col('type', 'TYPE', 'trailing', 'muted'),
    ],
    rows: capped,
  });
}

// ─── 4) DISCIPLINE ───────────────────────────────────────────────────────────
//
// GROUNDABLE ONLY if getSquadStats surfaces cards.yellow/cards.red. As of the WC
// player-card upgrade, getSquadStats now extracts flat yellow/red (+ saves, conceded,
// keyPasses, passAccuracy, duels, tackles, minutes, rating) from the SAME /players
// response, so this tab now lights up. The builder still probes for the fields and
// emits ONLY when present — if a nation's row lacks card data it is skipped, and if
// NO nation has card data the whole tab is DROPPED rather than fabricate counts.

async function buildWcDiscipline({ date, nations }) {
  const rows = [];
  let sawCardField = false;
  for (const [, meta] of nations) {
    const squad = await safeCall(() => apiFootball.getSquadStats(meta.name), {});
    for (const s of asArray(squad)) {
      const y = readYellow(s);
      const r = readRed(s);
      if (y == null && r == null) continue; // field absent on this row
      sawCardField = true;
      if ((y ?? 0) <= 0 && (r ?? 0) <= 0) continue; // no cards: not a discipline-watch row
      const entry = {
        _sort: (r ?? 0) * 100 + (y ?? 0),
        player: s.name,
        ...(meta.abbr ? { team: meta.abbr } : {}),
        yellow: String(y ?? 0),
        red: String(r ?? 0),
      };
      const risk = suspensionRisk(y, r);
      if (risk) entry.suspension_risk = risk;
      rows.push(entry);
    }
  }
  // No card data anywhere -> DROP the tab (the rule: never fabricate card counts).
  if (!sawCardField || !rows.length) {
    console.log('[leaguePulse] WC discipline: no card fields on getSquadStats — tab dropped (no fabrication).');
    return null;
  }
  rows.sort((a, b) => b._sort - a._sort);
  const capped = rows.slice(0, TOP_N).map(stripSort);

  return pack(date, 'WC', 'discipline', {
    title: 'Discipline Watch',
    subtitle: 'Cards this cycle',
    sort_note: 'Sorted by cards, high→low',
    columns: [
      col('player', 'PLAYER', 'leading', 'primary'),
      col('team', 'NATION', 'leading', 'muted'),
      col('yellow', 'YEL', 'trailing', 'stat'),
      col('red', 'RED', 'trailing', 'stat'),
      col('suspension_risk', '', 'trailing', 'muted'),
    ],
    rows: capped,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Builders shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A pulse pack (one league_pulse row). columns/rows are JSON-clean by construction. */
function pack(date, league, tab, { title, subtitle, sort_note, columns, rows }) {
  const out = { date, league, tab, title, columns, rows };
  if (subtitle != null) out.subtitle = subtitle;
  if (sort_note != null) out.sort_note = sort_note;
  return out;
}

/** Ordered column def. */
function col(key, label, align, emphasis) {
  return { key, label, align, emphasis };
}

/** Strip the internal _sort key from a row before it ships. */
function stripSort(r) {
  const { _sort, ...rest } = r;
  return rest;
}

/** Resolve a player's display name + team abbr (one batched-by-id call, memoized lite). */
async function playerHeader(bdl, playerId) {
  const map = await safeCall(() => bdl.getMlbPlayersByIds([playerId]), {});
  const h = map?.[playerId] || map?.[String(playerId)] || {};
  return { name: h.name || `Player ${playerId}`, abbr: h.teamAbbr || null };
}

/** MLB injury note: short reason from comment / status text. */
function injuryNote(inj) {
  const c = String(inj?.comment || inj?.injury_type || inj?.note || '').trim();
  if (!c) return null;
  // Keep it short — first clause / sentence.
  const first = c.split(/[.;\n]/)[0].trim();
  return first.length > 48 ? `${first.slice(0, 45)}…` : first;
}

/**
 * FRESH (0-3 days) / PRICED-IN (>3 days) label — consumes the LOCKED injury
 * timeline the canonical engine reads (the BDL `return_date` / `date` signal),
 * NOT a row's last-edit metadata. This is deliberate: keying on `updated_at` /
 * `report_date` (when the row was last touched) mislabels a long-standing,
 * priced-in injury that merely got edited today as FRESH. The real injury
 * timeline is the BDL `return_date` (projected return — the LOCKED FRESH/PRICED-IN
 * signal per CLAUDE.md + the BDL injury-endpoint docs) with `date` (injury onset)
 * as the fallback when no return date is published. When neither timeline field
 * is present, returns null (no guess). updated_at / report_date are intentionally
 * NOT consulted.
 */
function freshnessLabel(inj, todayMs) {
  if (todayMs == null) return null;

  // Primary: projected return_date — the canonical FRESH/PRICED-IN timeline.
  // A return still in the future (or just passed) = a live, FRESH absence; a
  // return date well in the past means the situation has long been on the board.
  const ret = inj?.return_date ? Date.parse(String(inj.return_date)) : NaN;
  if (Number.isFinite(ret)) {
    const daysToReturn = Math.floor((ret - todayMs) / 86400000);
    // Future/imminent return is fresh news; a return that lapsed >3d ago is priced in.
    return daysToReturn >= -INJ_FRESH_MAX_DAYS ? 'FRESH' : 'PRICED-IN';
  }

  // Fallback: injury onset date (`date`) — how long the injury has been a thing.
  const onset = inj?.date ? Date.parse(String(inj.date)) : NaN;
  if (Number.isFinite(onset)) {
    const ageDays = Math.floor((todayMs - onset) / 86400000);
    if (ageDays < 0) return null;
    return ageDays <= INJ_FRESH_MAX_DAYS ? 'FRESH' : 'PRICED-IN';
  }

  return null;
}

// WC discipline field probes — tolerant of either a flat {yellow,red} extension or
// a nested cards:{yellow,red} object, so the tab works whichever way the fetcher is
// extended. Returns null when the field is absent (NOT 0).
function readYellow(s) {
  if (s == null) return null;
  if (s.yellow != null) return num(s.yellow);
  if (s.cards && s.cards.yellow != null) return num(s.cards.yellow);
  return null;
}
function readRed(s) {
  if (s == null) return null;
  if (s.red != null) return num(s.red);
  if (s.cards && s.cards.red != null) return num(s.cards.red);
  return null;
}

/** Honest suspension-risk note, only when card data is present. */
function suspensionRisk(yellow, red) {
  const y = num(yellow);
  if (y != null && y >= WC_SUSP_YELLOW_THRESHOLD) return '1 from ban';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date / inning helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Epoch ms at the START of the slate day (UTC midnight of the date string). */
function dayStartMs(dateStr) {
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

/** Cutoff epoch ms = start-of-day minus `days` (the L{days} window lower bound). */
function dayCutoffMs(dateStr, days) {
  const start = dayStartMs(dateStr);
  return start == null ? null : start - days * 86400000;
}

/** Is a YYYY-MM-DD game date within the window (>= cutoff)? Tolerant of null. */
function inWindow(gameDate, cutoffMs) {
  if (cutoffMs == null) return true;       // no cutoff -> accept (caller-guarded)
  const t = Date.parse(`${String(gameDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return false;
  return t >= cutoffMs;
}

/** BDL ip notation ("5.2" = 5 innings 2 outs) -> total outs. */
function ipOuts(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 10);
  return whole * 3 + (frac === 1 ? 1 : frac === 2 ? 2 : 0);
}

/** total outs -> baseball "X.Y" IP display (Y in {0,1,2}). */
function outsToIp(outs) { return `${Math.trunc(outs / 3)}.${outs % 3}`; }

// ─────────────────────────────────────────────────────────────────────────────
// Misc helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Pull the 'Last 30 Days' row from byDayMonth (mirrors heatCheck's read). */
function last30Row(splits) {
  if (!splits || typeof splits !== 'object') return null;
  const buckets = Array.isArray(splits.byDayMonth) ? splits.byDayMonth : null;
  if (!buckets) return null;
  const byName = (n) => buckets.find((e) => nameKey(e?.split_name) === nameKey(n));
  return byName('Last 30 Days') || null;
}

/** Normalize a BDL MLB game so visitor_team/away_team are both present. */
function normalizeGame(g) {
  if (g && typeof g === 'object') {
    if (g.away_team && !g.visitor_team) g.visitor_team = g.away_team;
    if (g.visitor_team && !g.away_team) g.away_team = g.visitor_team;
  }
  return g;
}

/** Simple async memo over a Map keyed by id. */
async function memo(map, id, fn) {
  const key = String(id);
  if (map.has(key)) return map.get(key);
  const v = await fn();
  map.set(key, v);
  return v;
}

/** MLB season = the calendar year of the regular season. */
function seasonForDate(dateStr) {
  const y = Number(String(dateStr).slice(0, 4));
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

/** Lazy-load the BDL service so this module stays import-cheap for callers. */
async function loadBdl() {
  try {
    const mod = await import('../ballDontLieService.js');
    return mod.ballDontLieService || mod.default || null;
  } catch (err) {
    console.error('[leaguePulse] failed to load ballDontLieService:', err?.message || err);
    return null;
  }
}

/** Lazy-load the FIFA service NAMESPACE (getMatchesForDate is a named export). */
async function loadFifa() {
  try {
    const mod = await import('../fifaWorldCupService.js');
    return mod || null;
  } catch (err) {
    console.error('[leaguePulse] failed to load fifaWorldCupService:', err?.message || err);
    return null;
  }
}

export default { buildLeaguePulse };
