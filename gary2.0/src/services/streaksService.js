/**
 * Streaks — active MLB player streaks as of the last completed night ($0 —
 * data fetches only, no LLM): hitting streaks, hitless skids and
 * consecutive-HR-game runs. No over/under runs (founder, Sep 23 2026). Team
 * win/loss runs are the `team-streaks` edge function's, live every five
 * minutes (Sep 24 2026); this builder never writes or deletes them.
 *
 * For an "as of" ET date, walks the last STREAK_WINDOW_DAYS of BDL finals
 * (games + per-game batting lines) and emits rows:
 *   - 'hit' (player)       hitting streak >= 8 games → "16 games — 24-for-61 (.393)"
 *   - 'hitless' (player)   0-for-last-N AB, N >= 15  → "0-for-22 since June 2" (length = AT-BATS)
 *   - 'hr' (player)        HR in >= 3 straight games → "HR in 4 straight — 5 total"
 *
 * Hitting-streak rules (standard, with documented simplifications):
 *   - A game with at_bats == 0 neither extends nor breaks any player streak
 *     (pinch-run / all-walk nights — per the product spec, a 0-AB game with a
 *     sac fly does NOT break the streak, a simplification of official rule
 *     9.23(b) which would break it).
 *   - Hitless skids count only COMPLETE hitless games' at-bats; the trailing
 *     hitless ABs inside the game where the last hit fell are not counted
 *     (no within-game ordering in the data) — lengths are slightly
 *     conservative, never inflated.
 *   - Doubleheader games order by their real start datetimes, so same-day
 *     games resolve correctly.
 *   - Streaks longer than the lookback window report the window-truncated
 *     length (a 40+ game run would be national news long before this caps it).
 *
 * next_game comes from the MLB Stats API schedule for TODAY (ET): if the
 * subject's team plays today → "vs Brewers · 7:10 PM ET" / "at Brewers ·
 * 7:10 PM ET" (earliest game of a doubleheader), else null.
 *
 * Team names are full display names ("Chicago Cubs") on players' `team` —
 * matching the streaks table contract.
 *
 * Rows land in `streaks` (supabase/migrations/20260610_create_streaks.sql);
 * the iOS app reads them under the anon role. Idempotent: delete-then-insert
 * per (game_date, league) for the player kinds only, then the day's win/loss
 * runs are carried forward if the edge function hasn't written the date yet.
 *
 * HOT & COLD (founder GO, Sep 25 2026) rides the same pass into
 * `player_form`: the hottest and coldest bats over their last seven games and
 * today's probable starters over their last three starts, in counts, for the
 * clubs playing today (Darts featured row).
 *
 * Callers: scripts/run-all-results.js (nightly, non-fatal) and
 * scripts/run-streaks.js (manual/backfill).
 */

const BDL_BASE = 'https://api.balldontlie.io';
const STATSAPI_BASE = 'https://statsapi.mlb.com';

const STREAK_WINDOW_DAYS = 45;   // lookback of finals to walk through
const HIT_MIN = 7;               // hitting streaks surface at 7+ games (Sep 23 2026: room to scroll)
const HITLESS_MIN_AB = 12;       // hitless skids surface at 0-for-12+ (founder, Sep 23 2026: five a side, and more to scroll)
const HR_MIN = 3;                // HR-game streaks surface at 3+ games
const HIT_CAP = 12;              // keep only the longest N hit streaks
const HITLESS_CAP = 12;          // ... and hitless skids
const REGULAR_MIN_SEASON_AB = 150;  // hitless skids: regulars only —
const REGULAR_MIN_AB_PER_GAME = 3;  // season AB >= 150 OR AB/G >= 3.0
// A player streak must be LIVE: its owner appeared within this many days of
// the as-of date. Without this gate an IL'd player's frozen log read as an
// eternal skid — Friedl "0-for-18 since July 17" was still on the board
// Aug 6 (founder: "we shouldnt show injured players"). Injury-clock doctrine:
// clock from LAST APPEARANCE, data-side. 4 covers off-days + a short benching.
const PLAYER_ACTIVE_MAX_IDLE_DAYS = 4;
// A hitless skid must be CURRENT, full usage — not a returning/part-time bat
// drip-feeding ABs (Friedl post-IL: 18 AB across 19 days slid under every
// gap rule). A slumping REGULAR takes this many AB inside the last 7 days
// (Schwarber's real skid: 17 in 5 days); a rehab cameo doesn't.
const HITLESS_MIN_RECENT_AB = 8;
const STATS_BATCH = 3;           // game_ids per stats request (~30 lines/game, 100/page)
// HOT & COLD (founder GO, Sep 25 2026): tonight's players only, in counts.
const FORM_GAMES = 7;            // a bat's form: his last seven games with an at-bat
const FORM_MIN_AB = 20;          // ... and at least this many at-bats across them
const FORM_MAX_SPAN_DAYS = 12;   // those seven games inside the last twelve days
const ARM_STARTS = 3;            // an arm's form: his last three starts
const ARM_MIN_OUTS = 24;         // ... covering at least eight innings
const FORM_CAP = 5;              // five to a list

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// BDL's games endpoint still calls the A's "Oakland Athletics"; the MLB Stats
// API schedule (and BDL's own stats team_name) says just "Athletics" — alias
// so the next_game lookup still lands (verified live 2026-06-10).
const NEXT_GAME_ALIASES = { 'oakland athletics': 'athletics' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Canonical full team names. BDL's games endpoint is the lone outlier league-
 * wide (probed 2026-06-10): it still says "Oakland Athletics" while BDL stat
 * rows AND the MLB Stats API both say "Athletics" — canonicalize so team
 * subjects match player `team` values and the next_game schedule lookup.
 */
const TEAM_ALIASES = { 'Oakland Athletics': 'Athletics' };
const canonicalTeam = (name) => (name ? (TEAM_ALIASES[name] || name) : name);

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (ET-aware — BDL indexes MLB games by UTC date)
// ─────────────────────────────────────────────────────────────────────────────

function shiftDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoToETDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** "2026-06-02" → "June 2" */
function humanDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Whole days between two ET date strings (a - b). */
function dayGap(aET, bET) {
  const a = Date.parse(`${aET}T12:00:00Z`), b = Date.parse(`${bET}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / 86400000);
}

/** ".393" from hits/ab (data-voice batting average, no leading zero). */
function avgStr(hits, ab) {
  if (!ab) return '.000';
  return (hits / ab).toFixed(3).replace(/^0/, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// BDL fetches (429 retry + timeout)
// ─────────────────────────────────────────────────────────────────────────────

async function bdlFetch(url, apiKey) {
  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    break;
  }
  if (!res.ok) throw new Error(`BDL ${res.status} for ${url}`);
  return res.json();
}

/**
 * All FINAL MLB games whose ET date falls in [startET, endET]. BDL indexes by
 * UTC date, so a 9:38 PM ET game files under the next UTC day — query through
 * endET+1 and filter by each game's real ET date (same pattern as
 * run-all-results.js).
 */
async function fetchFinalsForWindow(startET, endET, apiKey) {
  const finals = new Map(); // id → game
  for (let d = startET; d <= shiftDateStr(endET, 1); d = shiftDateStr(d, 1)) {
    const json = await bdlFetch(`${BDL_BASE}/mlb/v1/games?dates[]=${d}&per_page=100`, apiKey);
    for (const g of json?.data || []) {
      if (!g || g.id == null || finals.has(g.id)) continue;
      if (!/final/i.test(g.status || '')) continue;
      if (!g.date) continue;
      const et = isoToETDate(g.date);
      if (et < startET || et > endET) continue;
      finals.set(g.id, g);
    }
    await sleep(120);
  }
  return [...finals.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))); // newest first
}

/**
 * Per-game MLB batting lines for the window's finals. game_ids[] batched
 * (per_page=100 is per request — ~30 lines/game, so 3 games fit one page) with
 * cursor pagination. NOTE: /mlb/v1/stats silently IGNORES dates[] (probed
 * 2026-06-10 — two different dates returned identical rows), so game_ids[] is
 * the only correct filter.
 */
async function fetchStatsForGames(gameIds, apiKey) {
  const all = [];
  for (let i = 0; i < gameIds.length; i += STATS_BATCH) {
    const batch = gameIds.slice(i, i + STATS_BATCH);
    let cursor;
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams();
      for (const id of batch) params.append('game_ids[]', String(id));
      params.append('per_page', '100');
      if (cursor != null) params.append('cursor', String(cursor));
      const json = await bdlFetch(`${BDL_BASE}/mlb/v1/stats?${params.toString()}`, apiKey);
      all.push(...(json?.data || []));
      cursor = json?.meta?.next_cursor;
      if (cursor == null) break;
      await sleep(120);
    }
    await sleep(120);
  }
  return all;
}

/** Season batting GP/AB for the regulars filter, batched by player id. */
async function fetchSeasonBatting(playerIds, season, apiKey) {
  const out = new Map(); // player_id → { gp, ab }
  for (let i = 0; i < playerIds.length; i += 25) {
    const batch = playerIds.slice(i, i + 25);
    const params = new URLSearchParams();
    for (const id of batch) params.append('player_ids[]', String(id));
    params.append('season', String(season));
    params.append('per_page', '100');
    try {
      const json = await bdlFetch(`${BDL_BASE}/mlb/v1/season_stats?${params.toString()}`, apiKey);
      for (const r of json?.data || []) {
        const pid = r?.player?.id;
        if (pid == null) continue;
        out.set(pid, { gp: r.batting_gp || 0, ab: r.batting_ab || 0 });
      }
    } catch (err) {
      console.warn(`  ⚠️ season_stats fetch failed (regulars filter degrades): ${err.message}`);
    }
    await sleep(120);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Today's schedule → next_game (MLB Stats API, free)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map of lowercased full team name → "vs Brewers · 7:10 PM ET" for every team
 * playing TODAY (ET). Earliest game wins for doubleheaders. statsapi full
 * names match BDL display names ("Chicago Cubs"); a miss just leaves
 * next_game null.
 */
async function fetchNextGameMap() {
  const map = new Map();
  try {
    const date = todayET();
    const res = await fetch(
      `${STATSAPI_BASE}/api/v1/schedule?sportId=1&date=${date}&hydrate=team`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) throw new Error(`statsapi ${res.status}`);
    const json = await res.json();
    const games = (json?.dates?.[0]?.games || [])
      .slice()
      .sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)));
    for (const g of games) {
      const home = g?.teams?.home?.team;
      const away = g?.teams?.away?.team;
      if (!home?.name || !away?.name || !g?.gameDate) continue;
      const time = new Date(g.gameDate).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
      });
      const homeKey = home.name.toLowerCase();
      const awayKey = away.name.toLowerCase();
      if (!map.has(homeKey)) map.set(homeKey, `vs ${away.teamName || away.name} · ${time} ET`);
      if (!map.has(awayKey)) map.set(awayKey, `at ${home.teamName || home.name} · ${time} ET`);
    }
  } catch (err) {
    console.warn(`  ⚠️ today's schedule fetch failed (next_game will be null): ${err.message}`);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Streak computation (pure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-player game logs (newest first, ordered by real game start datetime so
 * doubleheaders resolve) from window stat rows. Player's team = most recent
 * game's team_name (trade-safe). Pitcher-only lines (at_bats == null) skip.
 */
function buildPlayerLogs(statRows, gamesById) {
  const byPlayer = new Map(); // player_id → { name, team, games: [] }
  for (const s of statRows) {
    const pid = s?.player?.id;
    const game = gamesById.get(s?.game_id);
    if (pid == null || !game || s.at_bats == null) continue;
    const name = s.player.full_name
      || `${s.player.first_name || ''} ${s.player.last_name || ''}`.trim();
    if (!name) continue;
    if (!byPlayer.has(pid)) byPlayer.set(pid, { name, games: [] });
    byPlayer.get(pid).games.push({
      date: game.date,
      etDate: isoToETDate(game.date),
      team: canonicalTeam(s.team_name) || null,
      ab: s.at_bats || 0,
      hits: s.hits || 0,
      hr: s.hr || 0,
    });
  }
  for (const log of byPlayer.values()) {
    log.games.sort((a, b) => String(b.date).localeCompare(String(a.date))); // newest first
    log.team = log.games[0]?.team || null;
  }
  return byPlayer;
}

/** Player hit / hitless / hr streak rows (hitless filtered to regulars later).
 *  asOfDate drives the recent-usage floor on hitless skids. */
function buildPlayerStreaks(playerLogs, asOfDate) {
  const recentFloor = shiftDateStr(asOfDate, -6); // last 7 days incl. as-of
  const hit = [];
  const hitless = [];
  const hr = [];

  for (const [pid, log] of playerLogs) {
    const games = log.games;
    if (!games.length) continue;
    // Newest game's ET date rides every row this player produces — the
    // liveness gate in writeStreaks() compares it to the as-of date.
    const lastET = games[0]?.etDate || null;

    // Hitting streak: consecutive games with a hit; 0-AB games neither
    // extend nor break (see file header for the documented simplifications).
    let hitLen = 0, hitH = 0, hitAB = 0, hitPrevET = null;
    for (const g of games) {
      if (g.ab === 0) continue;
      // An activity gap (IL stint, option) BREAKS the streak — a run glued
      // across weeks a player didn't play isn't a streak (Friedl, Aug 6).
      if (hitPrevET && dayGap(hitPrevET, g.etDate) > PLAYER_ACTIVE_MAX_IDLE_DAYS) break;
      if (g.hits >= 1) { hitLen++; hitH += g.hits; hitAB += g.ab; hitPrevET = g.etDate; continue; }
      break;
    }
    if (hitLen >= HIT_MIN) {
      hit.push({
        subject_type: 'player', subject: log.name, team: log.team,
        kind: 'hit', length: hitLen,
        detail: `${hitLen} games — ${hitH}-for-${hitAB} (${avgStr(hitH, hitAB)})`,
        _lastET: lastET,
      });
    }

    // Hitless skid: at-bats across complete hitless games since the last hit.
    let hitlessAB = 0, sinceET = null, coldPrevET = null;
    for (const g of games) {
      if (g.hits > 0) break;
      // Same gap rule as the hit streak: an IL stint inside the window ends
      // the skid — only the CONTIGUOUS run since his return counts, so a
      // returning bat shows "0-for-8 since August 1", not an IL-spanning
      // "0-for-18 since July 17".
      if (coldPrevET && g.ab > 0 && dayGap(coldPrevET, g.etDate) > PLAYER_ACTIVE_MAX_IDLE_DAYS) break;
      hitlessAB += g.ab;
      if (g.ab > 0) { sinceET = g.etDate; coldPrevET = g.etDate; } // oldest hitless game with an AB so far
    }
    const recentAB = games.reduce(
      (sum, g) => sum + (g.etDate >= recentFloor ? (g.ab || 0) : 0), 0);
    if (hitlessAB >= HITLESS_MIN_AB && sinceET && recentAB >= HITLESS_MIN_RECENT_AB) {
      hitless.push({
        subject_type: 'player', subject: log.name, team: log.team,
        kind: 'hitless', length: hitlessAB,
        detail: `0-for-${hitlessAB} since ${humanDate(sinceET)}`,
        _playerId: pid, // regulars filter joins season stats on this, then strips it
        _lastET: lastET,
      });
    }

    // HR-game streak: consecutive games WITH a homer; any game played (AB > 0)
    // without one breaks it; 0-AB games skip.
    let hrLen = 0, hrTotal = 0, hrPrevET = null;
    for (const g of games) {
      if (g.ab === 0 && g.hr === 0) continue;
      if (hrPrevET && dayGap(hrPrevET, g.etDate) > PLAYER_ACTIVE_MAX_IDLE_DAYS) break;
      if (g.hr >= 1) { hrLen++; hrTotal += g.hr; hrPrevET = g.etDate; continue; }
      break;
    }
    if (hrLen >= HR_MIN) {
      hr.push({
        subject_type: 'player', subject: log.name, team: log.team,
        kind: 'hr', length: hrLen,
        detail: `HR in ${hrLen} straight — ${hrTotal} total`,
        _lastET: lastET,
      });
    }
  }

  return { hit, hitless, hr };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hot & cold (founder GO, Sep 25 2026)
// ─────────────────────────────────────────────────────────────────────────────

/** A bat's last FORM_GAMES games with an at-bat, as counts. Null when he is
 *  not an everyday bat right now (too few at-bats, or the games spread out). */
function batForm(log, asOfDate) {
  const games = log.games.filter((g) => g.ab > 0).slice(0, FORM_GAMES);
  if (games.length < FORM_GAMES) return null;
  if (dayGap(asOfDate, games[games.length - 1].etDate) > FORM_MAX_SPAN_DAYS) return null;
  const ab = games.reduce((s, g) => s + g.ab, 0);
  const hits = games.reduce((s, g) => s + g.hits, 0);
  const hr = games.reduce((s, g) => s + g.hr, 0);
  if (ab < FORM_MIN_AB) return null;
  return { ab, hits, hr, n: games.length, lastET: games[0].etDate };
}

/** Hot bats lead on hits plus the extra bases of their homers per at-bat;
 *  cold bats trail on hits per at-bat. */
function buildBatForm(playerLogs, asOfDate) {
  const rows = [];
  for (const log of playerLogs.values()) {
    const f = batForm(log, asOfDate);
    if (f) rows.push({ log, f, hot: (f.hits + 3 * f.hr) / f.ab, cold: f.hits / f.ab });
  }
  // `short` is the figure; `detail` says only what the figure doesn't.
  const games = (f) => `last ${f.n} games`;
  const hot = rows.slice().sort((a, b) => b.hot - a.hot).map(({ log, f }) => {
    const homers = f.hr >= 2;
    return {
      kind: 'hot', player: log.name, team: log.team, _lastET: f.lastET,
      short: homers ? `${f.hr} HR · ${f.n} G` : `${f.hits}-for-${f.ab}`,
      detail: homers ? `${f.hits}-for-${f.ab} · ${games(f)}` : `${f.hr ? `${f.hr} HR · ` : ''}${games(f)}`,
    };
  });
  const cold = rows.slice().sort((a, b) => a.cold - b.cold || b.f.ab - a.f.ab).map(({ log, f }) => ({
    kind: 'cold', player: log.name, team: log.team, _lastET: f.lastET,
    short: `${f.hits}-for-${f.ab}`, detail: `${f.hr ? `${f.hr} HR · ` : ''}${games(f)}`,
  }));
  return { hot, cold };
}

/** Innings as a fan writes them: 18 outs → "6", 20 → "6.2". */
const inningsWords = (outs) => `${Math.floor(outs / 3)}${outs % 3 ? `.${outs % 3}` : ''}`;
const outsOf = (ip) => {
  const [whole, part] = String(ip ?? '0').split('.');
  return (Number(whole) || 0) * 3 + (Number(part) || 0);
};

/** Today's probable starters and their last ARM_STARTS starts (MLB Stats API,
 *  free). Ids here are MLBAM ids; they never leave this function. */
async function fetchArmForm(season) {
  const out = [];
  try {
    const res = await fetch(`${STATSAPI_BASE}/api/v1/schedule?sportId=1&date=${todayET()}&hydrate=team,probablePitcher`,
      { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`statsapi ${res.status}`);
    const games = (await res.json())?.dates?.[0]?.games || [];
    const arms = new Map();
    for (const g of games) {
      // His own game's line, so a doubleheader's second starter reads its start.
      const time = g?.gameDate ? new Date(g.gameDate).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : null;
      for (const side of ['away', 'home']) {
        const p = g?.teams?.[side]?.probablePitcher;
        const team = g?.teams?.[side]?.team?.name;
        const opp = g?.teams?.[side === 'home' ? 'away' : 'home']?.team;
        const next = time && opp ? `${side === 'home' ? 'vs' : 'at'} ${opp.teamName || opp.name} · ${g?.status?.startTimeTBD ? 'after Game 1' : `${time} ET`}` : null;
        if (p?.id && p?.fullName && !arms.has(p.id)) arms.set(p.id, { name: p.fullName, team: canonicalTeam(team) || null, next });
      }
    }
    for (const [id, arm] of arms) {
      try {
        const r = await fetch(`${STATSAPI_BASE}/api/v1/people/${id}/stats?stats=gameLog&group=pitching&season=${season}`,
          { signal: AbortSignal.timeout(15000) });
        if (!r.ok) continue;
        const starts = ((await r.json())?.stats?.[0]?.splits || [])
          .filter((s) => Number(s?.stat?.gamesStarted) === 1)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .slice(0, ARM_STARTS);
        if (starts.length < ARM_STARTS) continue;
        const outs = starts.reduce((s, x) => s + outsOf(x.stat.inningsPitched), 0);
        const er = starts.reduce((s, x) => s + (Number(x.stat.earnedRuns) || 0), 0);
        const k = starts.reduce((s, x) => s + (Number(x.stat.strikeOuts) || 0), 0);
        if (outs < ARM_MIN_OUTS) continue;
        out.push({ ...arm, outs, er, k, runsPerNine: (er * 27) / outs });
      } catch { /* one arm's log missing leaves him off the list */ }
      await sleep(80);
    }
  } catch (err) {
    console.warn(`  ⚠️ probable starters unavailable (no arms on Hot & Cold): ${err.message}`);
  }
  const line = (a) => `${a.k} K · last ${ARM_STARTS} starts`;
  const short = (a) => `${a.er} ER · ${inningsWords(a.outs)} IP`;
  return {
    hotArms: out.slice().sort((a, b) => a.runsPerNine - b.runsPerNine || b.k - a.k)
      .map((a) => ({ kind: 'hot_arm', player: a.name, team: a.team, next: a.next, detail: line(a), short: short(a) })),
    coldArms: out.slice().sort((a, b) => b.runsPerNine - a.runsPerNine)
      .map((a) => ({ kind: 'cold_arm', player: a.name, team: a.team, next: a.next, detail: line(a), short: short(a) })),
  };
}

/** Store tonight's hot and cold bats and arms for the as-of date. Only players
 *  whose club plays today make a list. Never fatal to the streaks. */
async function writePlayerForm({ supabase, date, playerLogs, nextGameMap, dryRun }) {
  const nextFor = (team) => {
    const key = team ? team.toLowerCase() : null;
    return key ? (nextGameMap.get(key) ?? nextGameMap.get(NEXT_GAME_ALIASES[key]) ?? null) : null;
  };
  const activeFloor = shiftDateStr(date, -PLAYER_ACTIVE_MAX_IDLE_DAYS);
  const { hot, cold } = buildBatForm(playerLogs, date);
  const { hotArms, coldArms } = await fetchArmForm(Number(date.slice(0, 4)));
  const pick = (list, skip = new Set()) => list
    .filter((r) => (r._lastET == null || r._lastET >= activeFloor) && (r.next || nextFor(r.team)) && !skip.has(r.player))
    .slice(0, FORM_CAP)
    .map(({ _lastET, next, ...r }, i) => ({ game_date: date, league: 'MLB', ...r, rank: i + 1, next_game: next || nextFor(r.team) }));
  // A name on a hot list never also sits on the cold one.
  const hotBats = pick(hot);
  const hotArmRows = pick(hotArms);
  const rows = [...hotBats, ...pick(cold, new Set(hotBats.map((r) => r.player))),
    ...hotArmRows, ...pick(coldArms, new Set(hotArmRows.map((r) => r.player)))];
  if (!dryRun) {
    const { error: delErr } = await supabase.from('player_form').delete().eq('game_date', date).eq('league', 'MLB');
    if (delErr) throw new Error(`player_form delete failed: ${delErr.message}`);
    if (rows.length) {
      const { error } = await supabase.from('player_form').insert(rows);
      if (error) throw new Error(`player_form insert failed: ${error.message}`);
    }
  }
  const count = (k) => rows.filter((r) => r.kind === k).length;
  console.log(`  🌡️ hot & cold — bats ${count('hot')}/${count('cold')}, arms ${count('hot_arm')}/${count('cold_arm')}${dryRun ? ' [not written]' : ''}`);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build + store active player streaks as of one ET date. Idempotent
 * (delete-then-insert per game_date+league, win/loss rows untouched) and
 * cheap ($0 — BDL + statsapi + Supabase only).
 *
 * @param {object} args
 * @param {object} args.supabase  service-role Supabase client
 * @param {string} args.bdlApiKey BallDontLie API key
 * @param {string} args.date      "as of" ET date YYYY-MM-DD (last completed night)
 * @param {boolean} [args.dryRun] build rows but skip the write
 * @returns {Promise<{rows: Array, counts: object}>}
 */
export async function writeStreaks({ supabase, bdlApiKey, date, dryRun = false }) {
  if (!bdlApiKey) throw new Error('BDL API key required for streaks');
  console.log(`\n🔥 STREAKS — as of ${date}${dryRun ? ' (DRY RUN)' : ''}`);

  const startET = shiftDateStr(date, -(STREAK_WINDOW_DAYS - 1));
  const finals = await fetchFinalsForWindow(startET, date, bdlApiKey);
  console.log(`  ⚾ ${finals.length} MLB finals in window ${startET} → ${date}`);
  if (!finals.length) {
    console.log('  No finals — nothing to compute.');
    return { rows: [], counts: {} };
  }
  const gamesById = new Map(finals.map((g) => [g.id, g]));

  const statRows = await fetchStatsForGames(finals.map((g) => g.id), bdlApiKey);
  console.log(`  📊 ${statRows.length} stat lines across ${finals.length} games`);
  const playerLogs = buildPlayerLogs(statRows, gamesById);
  let { hit, hitless, hr } = buildPlayerStreaks(playerLogs, date);

  // LIVE streaks only: the owner must have appeared within the idle window of
  // the as-of date. An IL'd bat's log freezes, and a frozen log is not a
  // streak — it's an absence (Friedl/Steer, Aug 6).
  const activeFloor = shiftDateStr(date, -PLAYER_ACTIVE_MAX_IDLE_DAYS);
  const isLive = (r) => r._lastET != null && r._lastET >= activeFloor;
  const staleN = [...hit, ...hitless, ...hr].filter((r) => !isLive(r)).length;
  if (staleN) console.log(`  💤 dropped ${staleN} streak(s) from players idle since before ${activeFloor}`);
  hit = hit.filter(isLive);
  hitless = hitless.filter(isLive);
  hr = hr.filter(isLive);
  for (const r of [...hit, ...hitless, ...hr]) delete r._lastET;

  // Hitless skids surface for REGULARS only (season AB >= 150 or AB/G >= 3.0)
  // — a bench bat sitting 0-for-16 across a month isn't a story.
  if (hitless.length) {
    const season = Number(date.slice(0, 4));
    const seasonBatting = await fetchSeasonBatting(hitless.map((r) => r._playerId), season, bdlApiKey);
    hitless = hitless.filter((r) => {
      const s = seasonBatting.get(r._playerId);
      if (!s) return false;
      return s.ab >= REGULAR_MIN_SEASON_AB || (s.gp > 0 && s.ab / s.gp >= REGULAR_MIN_AB_PER_GAME);
    });
    for (const r of hitless) delete r._playerId;
  }

  // Cap the player lists to the longest runs.
  hit = hit.sort((a, b) => b.length - a.length).slice(0, HIT_CAP);
  hitless = hitless.sort((a, b) => b.length - a.length).slice(0, HITLESS_CAP);

  const nextGameMap = await fetchNextGameMap();
  // HOT & COLD rides the same finals and today's schedule; it never blocks the streaks.
  try {
    await writePlayerForm({ supabase, date, playerLogs, nextGameMap, dryRun });
  } catch (err) {
    console.warn(`  ⚠️ hot & cold not written: ${err.message}`);
  }
  const rows = [...hit, ...hitless, ...hr].map((r) => {
    const teamKey = r.team ? r.team.toLowerCase() : null;
    return {
      game_date: date,
      league: 'MLB',
      ...r,
      detail: r.detail && r.detail.length > 60 ? r.detail.slice(0, 60) : r.detail,
      next_game: teamKey
        ? (nextGameMap.get(teamKey) ?? nextGameMap.get(NEXT_GAME_ALIASES[teamKey]) ?? null)
        : null,
    };
  });

  // Guard the (game_date, league, kind, subject) unique key: two players
  // sharing a full name (it happens) would fail the whole insert — keep the
  // longer run.
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.kind}|${r.subject}`;
    if (!byKey.has(key) || byKey.get(key).length < r.length) byKey.set(key, r);
  }
  const finalRows = [...byKey.values()];

  const counts = {};
  for (const r of finalRows) counts[r.kind] = (counts[r.kind] || 0) + 1;

  if (!dryRun) {
    // The team runs on this date are the edge function's; leave them.
    const { error: delErr } = await supabase
      .from('streaks')
      .delete()
      .eq('game_date', date)
      .eq('league', 'MLB')
      .not('kind', 'in', '(win,loss)');
    if (delErr) throw new Error(`streaks delete failed: ${delErr.message}`);
    if (finalRows.length) {
      const { error } = await supabase.from('streaks').insert(finalRows);
      if (error) throw new Error(`streaks insert failed: ${error.message}`);
    }
    const { error: carryErr } = await supabase.rpc('carry_streaks_forward', { p_date: date, p_league: 'MLB' });
    if (carryErr) throw new Error(`streaks carry failed: ${carryErr.message}`);
  }

  console.log(`  🔥 ${finalRows.length} streaks — ${
    ['hit', 'hitless', 'hr']
      .map((k) => `${k}=${counts[k] || 0}`).join(' ')
  }${dryRun ? ' [not written]' : ''}`);
  return { rows: finalRows, counts };
}
