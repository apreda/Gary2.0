// gary2.0/src/services/insights/leaguePulse.js
//
// Builds "League Pulse" — league-wide daily leaderboard tables that power the iOS
// Pulse view. ONE pack per (date, league, tab); each pack carries that tab's whole
// short table as a generic { columns:[{key,label,align,emphasis}], rows:[{...}] }
// so a single Swift PulseTable view renders every tab with NO per-tab Swift code.
//
// GROUNDING IS THE ONLY RULE (identical to playerInsightCards):
//   - Every cell is computed from a real, verifiable source (BDL GOAT-tier for MLB,
//     mlb/v1/player_injuries for MLB injuries).
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

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the day's League Pulse tab packs for one league.
 *
 * @param {object} args
 * @param {string} args.date    YYYY-MM-DD (ET slate day)
 * @param {string} args.league  'MLB'
 * @param {string[]} [args.batterIdsOverride]  MLB only: explicit batter pool for a
 *        no-game day (All-Star break — the day's "slate batters" are the event's
 *        participants). SP/bullpen tabs drop (no probables); bats + injuries build
 *        from this pool. Ignored when today's slate has real games.
 * @param {string[]} [args.teamAbbrsOverride]  MLB only: team filter for the
 *        injuries tab in override mode (the pool players' teams).
 * @returns {Promise<Array<{date,league,tab,title,subtitle,sort_note,columns,rows}>>}
 */
export async function buildLeaguePulse({ date, league, batterIdsOverride, teamAbbrsOverride } = {}) {
  const lg = String(league || '').toUpperCase();
  if (lg === 'MLB') return buildMlbPulse(date, { batterIdsOverride, teamAbbrsOverride });
  return [];
}

// ═════════════════════════════════════════════════════════════════════════════
// MLB
// ═════════════════════════════════════════════════════════════════════════════

async function buildMlbPulse(date, { batterIdsOverride, teamAbbrsOverride } = {}) {
  const bdl = await loadBdl();
  if (!bdl) return [];

  const season = seasonForDate(date);
  const games = asArray(await safeCall(() => bdl.getMlbGamesForETDate(date), []))
    .map(normalizeGame)
    .filter(Boolean);
  // No-game day (All-Star break): the explicit pool stands in for the slate —
  // bats build from it (when present), the league-wide teams tab always
  // builds, game-anchored tabs (SP/bullpen) drop. An EMPTY pool still means
  // override mode (ASG day: no contest list, but team form stays).
  if (!games.length && batterIdsOverride != null) {
    const ids = asArray(batterIdsOverride).map(String);

    const packs = [];
    if (ids.length) {
      const bats = await safeCall(() => buildMlbHotColdBats({ date, season, bdl, batterIds: new Set(ids) }), null);
      if (bats) packs.push(bats);
    }
    // Break edition: league-wide TEAM form beats a slate-filtered injury list
    // ("hot or cold teams going into the break — more bettor-useful", founder).
    const teams = await safeCall(() => buildMlbHotColdTeams({ date, season, bdl }), null);
    if (teams) packs.push(teams);
    console.log(`[leaguePulse] MLB (pool override): built ${packs.length} tab(s): ${packs.map((p) => p.tab).join(', ') || 'none'}.`);
    return packs;
  }
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

  const hotTeams = await safeCall(() => buildMlbHotColdTeams({ date, season, bdl }), null);
  if (hotTeams) packs.push(hotTeams);

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
      // Short display name ("J. Caminero") — the BATTER column is the table's
      // narrowest cell and full first names truncate to "Ju…" on phones.
      player: shortName(meta.name),
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

// ─── 2b) HOT & COLD TEAMS ────────────────────────────────────────────────────
//
// League-wide team form — L10 record, live streak, L10 run differential —
// computed purely from the season game index (final scores). Born for the
// All-Star break ("who's rolling into the second half", founder Jul 13) but
// honest on any day. Shows BOTH ends: the hottest and the coldest.

async function buildMlbHotColdTeams({ date, season, bdl }) {
  const index = await safeCall(() => bdl.getMlbSeasonGameIndex(season), new Map());
  if (!index || !index.size) return null;
  const teams = asArray(await safeCall(() => bdl.getTeams('baseball_mlb'), []));
  if (!teams.length) return null;

  const dayMs = dayStartMs(date);
  // team id -> chronological completed regular-season games (before `date`).
  const byTeam = new Map();
  for (const [, g] of index) {
    if (g.status !== 'STATUS_FINAL' || g.seasonType === 'spring_training' || g.postseason) continue;
    if (g.homeRuns == null || g.awayRuns == null) continue;
    const ts = Date.parse(g.date);
    if (!Number.isFinite(ts) || ts >= dayMs) continue;
    for (const [tid, mine, theirs] of [[g.homeId, g.homeRuns, g.awayRuns], [g.awayId, g.awayRuns, g.homeRuns]]) {
      if (tid == null) continue;
      const k = String(tid);
      if (!byTeam.has(k)) byTeam.set(k, []);
      byTeam.get(k).push({ ts, won: mine > theirs, diff: mine - theirs });
    }
  }

  const rows = [];
  for (const t of teams) {
    const games = (byTeam.get(String(t.id)) || []).sort((a, b) => a.ts - b.ts);
    if (games.length < 10) continue;   // fail closed — no thin-sample form calls
    const last10 = games.slice(-10);
    const wins = last10.filter((g) => g.won).length;
    const diff = last10.reduce((s, g) => s + g.diff, 0);
    // Live streak off the full log (newest backwards).
    let streak = 0; const dir = games[games.length - 1].won;
    for (let i = games.length - 1; i >= 0 && games[i].won === dir; i--) streak++;
    rows.push({
      _sort: wins + diff / 1000,
      team: t.name || t.abbreviation || t.display_name,
      l10: `${wins}-${10 - wins}`,
      streak: `${dir ? 'W' : 'L'}${streak}`,
      diff: `${diff > 0 ? '+' : ''}${diff}`,
      ...(wins >= 7 ? { trend: 'hot' } : wins <= 3 ? { trend: 'cold' } : {}),
    });
  }
  if (rows.length < 6) return null;
  rows.sort((a, b) => b._sort - a._sort);
  // Both ends of the league — the 8 hottest and the 4 coldest.
  const top = rows.slice(0, 8);
  const bottom = rows.slice(-4).filter((r) => !top.includes(r));
  const shown = [...top, ...bottom].map(stripSort);

  return pack(date, 'MLB', 'hot_cold_teams', {
    title: 'Hot & Cold Teams',
    subtitle: 'Last 10 games',
    sort_note: 'Hottest first, coldest last',
    columns: [
      col('team', 'TEAM', 'leading', 'primary'),
      col('l10', 'L10', 'trailing', 'stat'),
      col('streak', 'STREAK', 'trailing', 'stat'),
      col('diff', 'RUN DIFF', 'trailing', 'muted'),
      col('trend', '', 'trailing', 'muted'),
    ],
    rows: shown,
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
      status: shortStatus(status) || '—',
      note: note || '—',
      ...(since ? { since } : {}),
    });
  }

  if (!rows.length) return null;
  // FRESH rows first (most actionable), then the rest; cap.
  rows.sort((a, b) => (a.since === 'FRESH' ? 0 : 1) - (b.since === 'FRESH' ? 0 : 1));
  const capped = rows.slice(0, TOP_N);

  // Column diet (no-ellipsis law): the team abbr already rides beside the
  // player's name in the primary cell — a second TEAM column is pure width
  // theft; and a NOTE column where every cell is "—" is a dead slot.
  const columns = [
    col('player', 'PLAYER', 'leading', 'primary'),
    col('status', 'STATUS', 'trailing', 'stat'),
    ...(capped.some((r) => r.note && r.note !== '—') ? [col('note', 'NOTE', 'trailing', 'muted')] : []),
    col('since', '', 'trailing', 'muted'),
  ];

  return pack(date, 'MLB', 'injuries', {
    title: 'Key Injuries',
    subtitle: 'Around the league',
    columns,
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

/** "Junior Caminero" → "J. Caminero" — narrow-column display name. */
function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length < 2) return String(full || '');
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

/** Fan-standard injury-status shorthand for the narrow STATUS cell (no-ellipsis
 *  law): "60-Day-IL" → "IL-60", "Day-To-Day" → "DTD". Unknown strings pass
 *  through untouched. */
function shortStatus(status) {
  if (!status) return status;
  const s = String(status).trim();
  const il = s.match(/^(\d+)[\s-]*Day[\s-]*IL$/i);
  if (il) return `IL-${il[1]}`;
  if (/^day[\s-]*to[\s-]*day$/i.test(s)) return 'DTD';
  if (/^out for season$/i.test(s)) return 'OUT (SZN)';
  return s;
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

export default { buildLeaguePulse };
