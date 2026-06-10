/**
 * Streaks — active MLB streaks as of the last completed night ($0 — data
 * fetches only, no LLM). Teams riding W/L runs or over/under runs, players
 * riding hitting streaks, hitless skids, or consecutive-HR-game runs.
 *
 * For an "as of" ET date, walks the last STREAK_WINDOW_DAYS of BDL finals
 * (games + per-game batting lines + per-date closing totals) and emits rows:
 *   - 'win'/'loss' (team)  current W/L streak >= 4   → "W7 — outscored foes 41-18"
 *   - 'over'/'under' (team) games O/U the total >= 5 → "6 straight overs — 11.2 rpg vs 8.7 avg line"
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
 * O/U streaks use the per-date consensus closing total from BDL odds (median
 * total_value across vendors — verified to return totals for PAST dates, same
 * probe as src/services/insights/computers/streaking.js). A final with no
 * resolvable line, or a push, BREAKS the streak — strict consecutive, nothing
 * waved through.
 *
 * next_game comes from the MLB Stats API schedule for TODAY (ET): if the
 * subject's team plays today → "vs Brewers · 7:10 PM ET" / "at Brewers ·
 * 7:10 PM ET" (earliest game of a doubleheader), else null.
 *
 * Team names are BDL full display names ("Chicago Cubs") for both team
 * subjects and players' `team` — matching the streaks table contract.
 *
 * Rows land in `streaks` (supabase/migrations/20260610_create_streaks.sql);
 * the iOS app reads them under the anon role. Idempotent: delete-then-insert
 * per (game_date, league).
 *
 * Callers: scripts/run-all-results.js (nightly, non-fatal) and
 * scripts/run-streaks.js (manual/backfill).
 */

const BDL_BASE = 'https://api.balldontlie.io';
const STATSAPI_BASE = 'https://statsapi.mlb.com';

const STREAK_WINDOW_DAYS = 45;   // lookback of finals to walk through
const WL_MIN = 4;                // team W/L streaks surface at 4+ ("more than 3")
const OU_MIN = 5;                // team over/under streaks surface at 5+
const HIT_MIN = 8;               // hitting streaks surface at 8+ games
const HITLESS_MIN_AB = 15;       // hitless skids surface at 0-for-15+
const HR_MIN = 3;                // HR-game streaks surface at 3+ games
const HIT_CAP = 12;              // keep only the longest N hit streaks
const HITLESS_CAP = 12;          // ... and hitless skids
const REGULAR_MIN_SEASON_AB = 150;  // hitless skids: regulars only —
const REGULAR_MIN_AB_PER_GAME = 3;  // season AB >= 150 OR AB/G >= 3.0
const STATS_BATCH = 3;           // game_ids per stats request (~30 lines/game, 100/page)

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

/** ".393" from hits/ab (data-voice batting average, no leading zero). */
function avgStr(hits, ab) {
  if (!ab) return '.000';
  return (hits / ab).toFixed(3).replace(/^0/, '');
}

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// ─────────────────────────────────────────────────────────────────────────────
// BDL fetches (429 retry + timeout idiom from nightHighlights.js)
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
 * nightHighlights.js / run-all-results.js).
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
 * Consensus closing total per game id: median total_value across vendors,
 * fetched per UTC date over the window (BDL returns totals for past dates).
 */
async function fetchTotalsForWindow(startET, endET, apiKey) {
  const byGame = new Map(); // game_id → [totals]
  for (let d = startET; d <= shiftDateStr(endET, 1); d = shiftDateStr(d, 1)) {
    try {
      const json = await bdlFetch(`${BDL_BASE}/mlb/v1/odds?dates[]=${d}&per_page=100`, apiKey);
      for (const r of json?.data || []) {
        const tv = Number(r?.total_value);
        if (r?.game_id == null || !Number.isFinite(tv)) continue;
        if (!byGame.has(r.game_id)) byGame.set(r.game_id, []);
        byGame.get(r.game_id).push(tv);
      }
    } catch (err) {
      console.warn(`  ⚠️ odds fetch failed for ${d} (O/U streaks may shorten): ${err.message}`);
    }
    await sleep(120);
  }
  const lines = new Map();
  for (const [gid, totals] of byGame) lines.set(gid, median(totals));
  return lines;
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

/** Team W/L + O/U streak rows from newest-first finals. */
function buildTeamStreaks(finals, lineByGameId) {
  const rows = [];
  const byTeam = new Map(); // team name → { results: [{ win, runsFor, runsAgainst, total, line }] } newest first
  for (const g of finals) {
    const h = Number(g?.home_team_data?.runs);
    const a = Number(g?.away_team_data?.runs);
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
    for (const side of ['home', 'away']) {
      const team = side === 'home' ? g.home_team : g.away_team;
      const name = canonicalTeam(team?.display_name || team?.full_name);
      if (!name) continue;
      if (!byTeam.has(name)) byTeam.set(name, []);
      const runsFor = side === 'home' ? h : a;
      const runsAgainst = side === 'home' ? a : h;
      byTeam.get(name).push({
        win: runsFor > runsAgainst,
        runsFor,
        runsAgainst,
        total: h + a,
        line: lineByGameId.get(g.id) ?? null,
      });
    }
  }

  for (const [name, results] of byTeam) {
    if (!results.length) continue;

    // W/L streak with run differential across the run.
    const won = results[0].win;
    let len = 0, runsFor = 0, runsAgainst = 0;
    for (const r of results) {
      if (r.win !== won) break;
      len++;
      runsFor += r.runsFor;
      runsAgainst += r.runsAgainst;
    }
    if (len >= WL_MIN) {
      rows.push({
        subject_type: 'team', subject: name, team: name,
        kind: won ? 'win' : 'loss', length: len,
        detail: won
          ? `W${len} — outscored foes ${runsFor}-${runsAgainst}`
          : `L${len} — outscored ${runsAgainst}-${runsFor} in the skid`,
      });
    }

    // O/U streak — strict consecutive: missing line or push breaks it.
    const first = results[0];
    if (first.line != null && first.total !== first.line) {
      const over = first.total > first.line;
      let ouLen = 0, runsSum = 0, lineSum = 0;
      for (const r of results) {
        if (r.line == null || r.total === r.line) break;
        if ((r.total > r.line) !== over) break;
        ouLen++;
        runsSum += r.total;
        lineSum += r.line;
      }
      if (ouLen >= OU_MIN) {
        const rpg = (runsSum / ouLen).toFixed(1);
        const avgLine = (lineSum / ouLen).toFixed(1);
        rows.push({
          subject_type: 'team', subject: name, team: name,
          kind: over ? 'over' : 'under', length: ouLen,
          detail: `${ouLen} straight ${over ? 'overs' : 'unders'} — ${rpg} rpg vs ${avgLine} avg line`,
        });
      }
    }
  }
  return rows;
}

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

/** Player hit / hitless / hr streak rows (hitless filtered to regulars later). */
function buildPlayerStreaks(playerLogs) {
  const hit = [];
  const hitless = [];
  const hr = [];

  for (const [pid, log] of playerLogs) {
    const games = log.games;
    if (!games.length) continue;

    // Hitting streak: consecutive games with a hit; 0-AB games neither
    // extend nor break (see file header for the documented simplifications).
    let hitLen = 0, hitH = 0, hitAB = 0;
    for (const g of games) {
      if (g.ab === 0) continue;
      if (g.hits >= 1) { hitLen++; hitH += g.hits; hitAB += g.ab; continue; }
      break;
    }
    if (hitLen >= HIT_MIN) {
      hit.push({
        subject_type: 'player', subject: log.name, team: log.team,
        kind: 'hit', length: hitLen,
        detail: `${hitLen} games — ${hitH}-for-${hitAB} (${avgStr(hitH, hitAB)})`,
      });
    }

    // Hitless skid: at-bats across complete hitless games since the last hit.
    let hitlessAB = 0, sinceET = null;
    for (const g of games) {
      if (g.hits > 0) break;
      hitlessAB += g.ab;
      if (g.ab > 0) sinceET = g.etDate; // oldest hitless game with an AB so far
    }
    if (hitlessAB >= HITLESS_MIN_AB && sinceET) {
      hitless.push({
        subject_type: 'player', subject: log.name, team: log.team,
        kind: 'hitless', length: hitlessAB,
        detail: `0-for-${hitlessAB} since ${humanDate(sinceET)}`,
        _playerId: pid, // regulars filter joins season stats on this, then strips it
      });
    }

    // HR-game streak: consecutive games WITH a homer; any game played (AB > 0)
    // without one breaks it; 0-AB games skip.
    let hrLen = 0, hrTotal = 0;
    for (const g of games) {
      if (g.ab === 0 && g.hr === 0) continue;
      if (g.hr >= 1) { hrLen++; hrTotal += g.hr; continue; }
      break;
    }
    if (hrLen >= HR_MIN) {
      hr.push({
        subject_type: 'player', subject: log.name, team: log.team,
        kind: 'hr', length: hrLen,
        detail: `HR in ${hrLen} straight — ${hrTotal} total`,
      });
    }
  }

  return { hit, hitless, hr };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build + store active streaks as of one ET date. Idempotent
 * (delete-then-insert per game_date+league) and cheap ($0 — BDL + statsapi +
 * Supabase only).
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

  const lineByGameId = await fetchTotalsForWindow(startET, date, bdlApiKey);
  console.log(`  📈 closing totals resolved for ${lineByGameId.size} games`);

  const teamRows = buildTeamStreaks(finals, lineByGameId);

  const statRows = await fetchStatsForGames(finals.map((g) => g.id), bdlApiKey);
  console.log(`  📊 ${statRows.length} stat lines across ${finals.length} games`);
  const playerLogs = buildPlayerLogs(statRows, gamesById);
  let { hit, hitless, hr } = buildPlayerStreaks(playerLogs);

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
  const rows = [...teamRows, ...hit, ...hitless, ...hr].map((r) => {
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
    const { error: delErr } = await supabase
      .from('streaks')
      .delete()
      .eq('game_date', date)
      .eq('league', 'MLB');
    if (delErr) throw new Error(`streaks delete failed: ${delErr.message}`);
    if (finalRows.length) {
      const { error } = await supabase.from('streaks').insert(finalRows);
      if (error) throw new Error(`streaks insert failed: ${error.message}`);
    }
  }

  console.log(`  🔥 ${finalRows.length} streaks — ${
    ['win', 'loss', 'hit', 'hitless', 'hr', 'over', 'under']
      .map((k) => `${k}=${counts[k] || 0}`).join(' ')
  }${dryRun ? ' [not written]' : ''}`);
  return { rows: finalRows, counts };
}
