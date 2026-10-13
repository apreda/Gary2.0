/** Key returns, team form, recent team metrics and the run profile (split from tomorrowService.js, Oct 13 2026). */
import { getETDateStr } from '../dailySlateService.js';
import { getMlbSchedule } from '../../providers/mlbStatsApiService.js';
import { ballDontLieService as bdl } from '../../providers/ballDontLieService.js';
import { SEASON, nameKey, abbrFor } from './basics.js';

/* ──────────────────────────── 3. KEY RETURNS ────────────────────────────── */

/**
 * Best-effort IL->active "key returns" lane. No dedicated return-date feed
 * exists, and an IL->active diff needs a prior-day roster snapshot we don't
 * persist — so this honestly yields [] today rather than inventing returns.
 * Structured as its own try/catch lane so it can be populated later (when a
 * roster-status snapshot store is added) WITHOUT ever blocking the board.
 * GROUNDED: returns only real status-change rows; empty otherwise.
 */
export async function buildReturns() {
  try {
    // Intentionally empty until a prior-day roster-status snapshot exists to
    // diff against. Never fabricate a return.
    return [];
  } catch (e) {
    console.warn(`[TomorrowBoard] returns lane failed (honest-empty): ${e.message}`);
    return [];
  }
}

/* ──────── 3b. EXTRA TABBED LANES (FORM · RUN PROFILE · WEATHER) ──────────── */

/**
 * Build the distinct MLB teams playing tomorrow from the slate rows, each as
 * { team (full name), abbr, id, opp (full name), home (bool) }. One entry per
 * team per appearance (a team in a doubleheader shows once after slate de-dupe).
 */
export function slateTeamsMlb(board, teamIndex, idByName) {
  const out = [];
  const seen = new Set();
  for (const row of board) {
    if (row.league !== 'MLB') continue;
    for (const [team, opp, home] of [
      [row.away_team, row.home_team, false],
      [row.home_team, row.away_team, true],
    ]) {
      const id = idByName.get(nameKey(team));
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      out.push({ team, abbr: abbrFor(team, teamIndex), id, opp, home });
    }
  }
  return out;
}

/**
 * FORM — each MLB team's last-10 (W-L) + current streak, straight from standings
 * (records.splitRecords lastTen + streak.streakCode). GROUNDED: a team is omitted
 * when its L10 split is absent. l10 is a "W-L" string; streak is "W3"/"L1" (null
 * when none). Grouped by league for the iOS tab.
 */
export function buildForm(mlbTeams, standings) {
  const mlb = [];
  for (const t of mlbTeams) {
    const st = standings.get(t.id);
    if (!st || st.l10W == null || st.l10L == null) continue; // grounded-only
    mlb.push({
      league: 'MLB',
      team: t.team,
      abbr: t.abbr,
      l10: `${st.l10W}-${st.l10L}`,
      streak: st.streakCode || null,
      home: t.home,
    });
  }
  return mlb;
}

const RECENT_METRICS_DAYS = 14;
const RECENT_METRICS_BATCH = 25;

/** MLB/BDL innings use baseball thirds ("1.2" = five outs), not decimals. */
function ipOuts(ip) {
  const n = Number(ip);
  if (!Number.isFinite(n) || n < 0) return 0;
  const whole = Math.trunc(n);
  const thirds = Math.round((n - whole) * 10);
  return thirds >= 0 && thirds <= 2 ? whole * 3 + thirds : 0;
}

/**
 * Recent team facts for THE BIG NUMBERS.
 *
 * One season-index read supplies completed-game dates and scores. BDL box rows
 * then ground the two facts scores alone cannot provide: team homers and the
 * relief staff's earned runs/outs. The windows stop before `etDateStr`, so a
 * morning card remains the same card all day as tonight's games go live.
 *
 * Returns a map keyed by MLB abbreviation. A metric is omitted unless its
 * whole advertised window is present; partial API data never becomes a number.
 */
export async function buildRecentTeamMetrics(mlbTeams, etDateStr) {
  const anchor = new Date(`${etDateStr}T12:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return new Map();
  const shiftedDay = (days) => {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const start14Day = shiftedDay(-RECENT_METRICS_DAYS);
  const earliestDay = shiftedDay(-50);

  const [seasonIndex, bdlTeams] = await Promise.all([
    bdl.getMlbSeasonGameIndex(SEASON),
    bdl.getTeams('baseball_mlb'),
  ]);
  if (!seasonIndex?.size || !bdlTeams?.length) return new Map();

  const bdlByAbbr = new Map(
    bdlTeams
      .filter((t) => t?.id != null && t?.abbreviation)
      .map((t) => [String(t.abbreviation).toUpperCase(), t]),
  );
  // The odds/slate feed uses the franchise's current display codes while BDL
  // retains MLB's legacy API codes for these two clubs.
  const bdlAbbr = (abbr) => ({ AZ: 'ARI', ATH: 'OAK' }[String(abbr || '').toUpperCase()]
    || String(abbr || '').toUpperCase());
  const targets = mlbTeams
    .map((t) => ({ slate: t, bdl: bdlByAbbr.get(bdlAbbr(t.abbr)) }))
    .filter((t) => t.bdl?.id != null);
  if (!targets.length) return new Map();

  const gamesByTeam = new Map(targets.map((t) => [String(t.bdl.id), []]));
  for (const [gameId, g] of seasonIndex) {
    const played = Date.parse(g?.date || '');
    if (!Number.isFinite(played)) continue;
    // BDL timestamps are UTC; slate ownership is ET. A 10:10 PM ET West Coast
    // final lands after midnight UTC but still belongs to the previous ET day.
    const playedDay = getETDateStr(new Date(played));
    if (playedDay >= etDateStr || playedDay < earliestDay) continue;
    if (g?.status !== 'STATUS_FINAL' || g?.seasonType === 'spring_training' || g?.postseason) continue;
    for (const [teamId, mine, theirs] of [
      [g.homeId, g.homeRuns, g.awayRuns],
      [g.awayId, g.awayRuns, g.homeRuns],
    ]) {
      const bucket = gamesByTeam.get(String(teamId));
      if (!bucket || !Number.isFinite(Number(mine)) || !Number.isFinite(Number(theirs))) continue;
      bucket.push({ id: gameId, played, playedDay, mine: Number(mine), theirs: Number(theirs) });
    }
  }
  for (const games of gamesByTeam.values()) games.sort((a, b) => a.played - b.played);

  // FIRST-INNING SCORED, LAST 10 (founder pick, Aug 14 2026 — replaces the run
  // differential row on THE BIG NUMBERS). BDL's season index carries no
  // per-inning lines, so this walks recent ET days over the MLB Stats API
  // schedule (linescore-hydrated, the firstInning insights lane's proven
  // source) and counts, per club, how many of its last ten finals had a
  // first-inning run. Same discipline as the other windows: exactly ten
  // linescored finals or the field is omitted — never a silently short sample.
  const firstInnByTeamKey = new Map(); // nameKey(club) -> [{day, scored}] newest first
  {
    const targetKeys = new Set();
    for (const { bdl: team } of targets) {
      for (const n of [team.display_name, team.short_display_name, team.name,
        team.location && team.name ? `${team.location} ${team.name}` : null]) {
        if (n) targetKeys.add(nameKey(n));
      }
    }
    const needMore = () => [...targetKeys].some((k) => (firstInnByTeamKey.get(k) || []).length < 10);
    for (let back = 1; back <= 24 && needMore(); back += 1) {
      const day = shiftedDay(-back);
      let sched = [];
      try { sched = (await getMlbSchedule(day)) || []; } catch { continue; }
      for (const g of sched) {
        const stateOk = ['F', 'O'].includes(g?.status?.codedGameState || '');
        const first = g?.linescore?.innings?.[0];
        if (!stateOk || first == null) continue;
        for (const [side, runs] of [['home', first?.home?.runs], ['away', first?.away?.runs]]) {
          if (runs == null) continue;
          const key = nameKey(g?.teams?.[side]?.team?.name || '');
          if (!targetKeys.has(key)) continue;
          const bucket = firstInnByTeamKey.get(key) || [];
          if (bucket.length < 10) bucket.push({ day, scored: Number(runs) > 0 });
          firstInnByTeamKey.set(key, bucket);
        }
      }
    }
  }

  // LIVE STREAKS, LEAGUE-WIDE (founder GO, Aug 14 2026 — the rail's streak row
  // carries "longest live streak in baseball", which needs every club, not just
  // tonight's slate). One in-memory pass over the season index.
  const allByTeam = new Map(); // teamId -> [{played, won}] chronological
  for (const [, g] of seasonIndex) {
    const played = Date.parse(g?.date || '');
    if (!Number.isFinite(played)) continue;
    const playedDay = getETDateStr(new Date(played));
    if (playedDay >= etDateStr) continue;
    if (g?.status !== 'STATUS_FINAL' || g?.seasonType === 'spring_training' || g?.postseason) continue;
    const h = Number(g.homeRuns); const a = Number(g.awayRuns);
    if (!Number.isFinite(h) || !Number.isFinite(a) || h === a) continue;
    for (const [teamId, won] of [[g.homeId, h > a], [g.awayId, a > h]]) {
      const b = allByTeam.get(String(teamId)) || [];
      b.push({ played, won });
      allByTeam.set(String(teamId), b);
    }
  }
  const streakById = new Map(); // teamId -> signed length (+win / -loss)
  let longestW = 0; let longestL = 0;
  for (const [teamId, gs] of allByTeam) {
    gs.sort((x, y) => x.played - y.played);
    let n = 0;
    for (let i = gs.length - 1; i >= 0; i -= 1) {
      if (i === gs.length - 1) n = gs[i].won ? 1 : -1;
      else if (gs[i].won && n > 0) n += 1;
      else if (!gs[i].won && n < 0) n -= 1;
      else break;
    }
    streakById.set(teamId, n);
    if (n > longestW) longestW = n;
    if (-n > longestL) longestL = -n;
  }

  const neededIds = new Set();
  for (const games of gamesByTeam.values()) {
    for (const g of games.slice(-5)) neededIds.add(g.id);
    for (const g of games.filter((x) => x.playedDay >= start14Day)) neededIds.add(g.id);
  }

  // Keep individual paginated collections small to bound retries and latency.
  // Three batches at a time is fast without bursting the upstream API.
  const ids = [...neededIds];
  const batches = [];
  for (let i = 0; i < ids.length; i += RECENT_METRICS_BATCH) {
    batches.push(ids.slice(i, i + RECENT_METRICS_BATCH));
  }
  const statRows = [];
  for (let i = 0; i < batches.length; i += 3) {
    const page = await Promise.all(
      batches.slice(i, i + 3).map((gameIds) => bdl.getMlbGameStats({ gameIds })),
    );
    for (const rows of page) statRows.push(...(rows || []));
  }
  const statsByGame = new Map();
  for (const r of statRows) {
    if (!statsByGame.has(r.game_id)) statsByGame.set(r.game_id, []);
    statsByGame.get(r.game_id).push(r);
  }

  const out = new Map();
  for (const { slate, bdl: team } of targets) {
    const games = gamesByTeam.get(String(team.id)) || [];
    const teamKeys = new Set([
      team.display_name, team.short_display_name, team.name,
      team.location && team.name ? `${team.location} ${team.name}` : null,
    ].filter(Boolean).map(nameKey));
    const rowsFor = (gameId) => (statsByGame.get(gameId) || [])
      .filter((r) => teamKeys.has(nameKey(r.team_name)));

    const last5 = games.slice(-5);
    const last10 = games.slice(-10);
    const last14Days = games.filter((g) => g.playedDay >= start14Day);
    const fiveCovered = last5.length === 5 && last5.every((g) =>
      rowsFor(g.id).some((r) => r.at_bats != null));
    const penCovered = last14Days.length > 0 && last14Days.every((g) =>
      rowsFor(g.id).some((r) => ipOuts(r.ip) > 0));

    let homeRunsL5 = null;
    if (fiveCovered) {
      homeRunsL5 = last5.reduce((sum, g) =>
        sum + rowsFor(g.id).reduce((s, r) => s + (Number(r.hr) || 0), 0), 0);
    }

    let bullpenOuts = 0;
    let bullpenEr = 0;
    if (penCovered) {
      for (const g of last14Days) {
        for (const r of rowsFor(g.id)) {
          if (Number(r.games_started) === 1) continue;
          const outs = ipOuts(r.ip);
          if (outs <= 0) continue;
          bullpenOuts += outs;
          bullpenEr += Number(r.er) || 0;
        }
      }
    }

    out.set(String(slate.abbr || '').toUpperCase(), {
      home_runs_l5: homeRunsL5,
      bullpen_era_l14: bullpenOuts > 0
        ? Number(((bullpenEr * 27) / bullpenOuts).toFixed(2))
        : null,
      run_diff_l10: last10.length === 10
        ? last10.reduce((sum, g) => sum + g.mine - g.theirs, 0)
        : null,
      first_inning_scored_l10: (() => {
        for (const k of teamKeys) {
          const rows = firstInnByTeamKey.get(k) || [];
          if (rows.length === 10) return rows.filter((r) => r.scored).length;
        }
        return null;
      })(),
      // Rail ladder inputs (founder GO, Aug 14): the live streak (with the
      // league-longest tag) and the pen's workload over the last three games.
      streak_l: (() => {
        const n = streakById.get(String(team.id)) || 0;
        if (n === 0) return null;
        return n > 0 ? `W${n}` : `L${-n}`;
      })(),
      streak_longest: (() => {
        const n = streakById.get(String(team.id)) || 0;
        if (n >= 2 && n === longestW) return true;
        if (n <= -2 && -n === longestL) return true;
        return false;
      })(),
      // Floor #3 for the rail: runs per game over the exact last ten (both
      // clubs always have this by August — the guaranteed fifth row).
      runs_pg_l10: last10.length === 10
        ? Number((last10.reduce((sum, g) => sum + g.mine, 0) / 10).toFixed(1))
        : null,
    });
  }
  return out;
}

/**
 * RUN PROFILE — the grounded, day-before scoring/run-prevention shape for each MLB
 * team (the honest stand-in for an "over/under trend": game_results stores no
 * betting total to compute a real O/U record from, so we never fabricate one).
 * Season runs scored / allowed / differential + per-game rates, straight from
 * standings (runsScored / runsAllowed / runDifferential / wins+losses). GROUNDED:
 * a team is omitted when its run totals are absent.
 */
export function buildRunProfile(mlbTeams, standings, recentMetrics = new Map()) {
  const mlb = [];
  for (const t of mlbTeams) {
    const st = standings.get(t.id);
    const recent = recentMetrics.get(String(t.abbr || '').toUpperCase()) || {};
    const hasSeason = st?.runsScored != null && st?.runsAllowed != null;
    const hasRecent = Object.values(recent).some((v) => v != null);
    if (!hasSeason && !hasRecent) continue; // grounded-only
    const gp = hasSeason ? (Number(st.wins) || 0) + (Number(st.losses) || 0) : 0;
    const rsg = gp > 0 ? st.runsScored / gp : null; // runs scored / game
    const rag = gp > 0 ? st.runsAllowed / gp : null; // runs allowed / game
    mlb.push({
      league: 'MLB',
      team: t.team,
      abbr: t.abbr,
      runs_scored: hasSeason ? st.runsScored : null,
      runs_allowed: hasSeason ? st.runsAllowed : null,
      run_diff: hasSeason ? (st.runDiff != null ? st.runDiff : (st.runsScored - st.runsAllowed)) : null,
      rs_per_game: rsg != null ? Number(rsg.toFixed(2)) : null,
      ra_per_game: rag != null ? Number(rag.toFixed(2)) : null,
      home: t.home,
      ...recent,
    });
  }
  return mlb;
}
