// gary2.0/src/services/insights/computers/streaking.js
//
// LANE: streaking
// "Which MLB side enters tonight riding a run — straight W/L, or a totals
//  streak (their games keep going over / under the number)?"
//
// Approach (documented BDL methods only):
//   - Recent finals come from a day-by-day lookback over the last LOOKBACK_DAYS
//     dates via getMlbGamesForDate(dateStr) (5-min cached, shared across every
//     team on the slate), PLUS any already-final games sitting on TODAY'S slate
//     — BDL slate dates are UTC dates, so last night's late games carry today's
//     date and would otherwise be missed. Finals are de-duped by game id.
//     Final scores read from home_team_data.runs / away_team_data.runs
//     (the same fields run-grade-insights.js trusts).
//   - W/L streak: consecutive same-result finals, newest first. >= STREAK_MIN
//     surfaces, with the run differential across the run and the L10 record.
//   - O/U streak: each past final's total line is the genuine PREGAME total
//     from the `daily_slate` morning snapshot (keyed by ET date + team names,
//     read once via the REST API). The live BDL odds endpoint is NEVER used for
//     a PAST date — re-fetching it overwrites each game's row in place with a
//     frozen LIVE in-game line (collapsed toward the runs already scored), which
//     fabricated phantom UNDER streaks. A final with no stored pregame line (e.g.
//     before daily_slate existed) is SKIPPED — its O/U streak shortens, never
//     falls back to the live line. total runs > line = over, < = under; a push
//     or a missing line BREAKS the streak (strict consecutive). >= STREAK_MIN
//     surfaces. Tonight's posted total (median, via getMlbGameOdds({ gameIds }))
//     is stamped on line_val so the morning grader can settle the row — that's a
//     LIVE pregame fetch for TONIGHT's game, which is correct.
//   - Rows attach to the team's NOT-YET-FINAL slate game; a team with only a
//     finished game on the slate is skipped (a streak note about a game that
//     already ended is dead content).
//
// Tone: W/over runs read HOT, L/under runs read COLD. value = "W5" / "L4" /
// "O5" / "U4" — the grader branches on that first letter.
//
// Defensive: any missing piece -> skip that team/angle silently; never throws.

import axios from 'axios';
import {
  makeRow, TONES, pickVariant, round, median, shiftDateStr,
} from '../shared.js';

// Same env resolution as garyHrThreats.js / src/supabaseClient.js — daily_slate
// is read under whichever key is present (anon can SELECT it; service role too).
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY || '';

// Tunables.
const STREAK_MIN = 4;          // surface streaks of this length+
const LOOKBACK_DAYS = 14;      // calendar dates of finals to walk back through
const BASE_RELEVANCE = 55;
const PER_STREAK = 5;          // +5 relevance per game of streak length
const RELEVANCE_CAP = 85;
const MAX_ROWS = 6;            // slate-wide cap, relevance-ranked

export async function computeStreaking(ctx) {
  const { games, date, bdl, helpers } = ctx;
  const rows = [];
  let examined = 0;

  // 1. Recent finals: lookback dates + today's already-final slate games.
  const finalsById = new Map();
  const addFinals = (list) => {
    for (const g of list || []) {
      if (g?.id == null) continue;
      if (!String(g?.status || '').toUpperCase().includes('FINAL')) continue;
      if (!finalsById.has(g.id)) finalsById.set(g.id, g);
    }
  };
  addFinals(games);
  for (let back = 1; back <= LOOKBACK_DAYS; back++) {
    const d = shiftDateStr(date, -back);
    if (!d) break;
    try {
      addFinals(await bdl.getMlbGamesForDate(d));
    } catch (err) {
      console.error('[streaking] lookback error:', err?.message || err);
    }
  }
  if (finalsById.size === 0) {
    console.log('[streaking] examined 0, emitted 0 (no recent finals)');
    return [];
  }

  // 2. PREGAME total line per past final, sourced from the `daily_slate` morning
  //    snapshot (NEVER the live BDL odds endpoint for a past date — that re-fetch
  //    overwrites each game's row with a frozen LIVE in-game line and fabricates
  //    UNDER streaks). Joined by ET date + normalized team names. A final with no
  //    stored slate line is simply left line-less → its O/U streak shortens.
  const windowStart = shiftDateStr(date, -LOOKBACK_DAYS);
  const lineByGameId = await fetchSlateLines([...finalsById.values()], windowStart, date);

  // 3. Tonight's posted totals for line_val (one call for the whole slate).
  const tonightIds = games.filter((g) => !isFinal(g)).map((g) => g?.id).filter((x) => x != null);
  const tonightLineByGameId = new Map();
  if (tonightIds.length) {
    try {
      const odds = (await bdl.getMlbGameOdds({ gameIds: tonightIds })) || [];
      indexTotals(odds, tonightLineByGameId);
    } catch (err) {
      console.error('[streaking] tonight odds error:', err?.message || err);
    }
  }

  // 4. Per slate team with a live (non-final) game tonight.
  const seenTeams = new Set();
  for (const game of games) {
    if (isFinal(game)) continue;
    const gameId = game?.id;
    if (gameId == null) continue;
    const label = helpers.gameLabel(game);

    for (const team of [game?.home_team, game?.visitor_team]) {
      const teamId = team?.id;
      if (teamId == null || seenTeams.has(teamId)) continue;
      seenTeams.add(teamId);
      examined++;

      // Team's finals, newest first.
      const results = [...finalsById.values()]
        .filter((g) => g?.home_team?.id === teamId || g?.visitor_team?.id === teamId)
        .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')))
        .map((g) => resultForTeam(g, teamId, lineByGameId))
        .filter(Boolean);
      if (!results.length) continue;

      const teamName = team.full_name || team.display_name || team.abbreviation || 'Team';
      const abbr = team.abbreviation || teamName;

      // --- W/L streak ---
      const wl = wlStreak(results);
      if (wl && wl.len >= STREAK_MIN) {
        const verb = wl.won ? 'won' : 'lost';
        const diff = round(Math.abs(wl.runDiff), 0);
        const last10 = results.slice(0, 10);
        const w10 = last10.filter((r) => r.win).length;
        const variants = wl.won ? [
          `${teamName} have ${verb} ${wl.len} straight, outscoring teams by ${diff} runs over the run; ${w10}-${last10.length - w10} across their last ${last10.length}.`,
          `${wl.len} wins in a row for ${abbr}, a +${diff} run margin across the streak — they come in ${w10}-${last10.length - w10} over their last ${last10.length}.`,
          `${abbr} have taken ${wl.len} straight and own a +${diff} run differential over the run. Last ${last10.length}: ${w10}-${last10.length - w10}.`,
        ] : [
          `${teamName} have dropped ${wl.len} straight, outscored by ${diff} runs over the skid; ${w10}-${last10.length - w10} across their last ${last10.length}.`,
          `${wl.len} losses in a row for ${abbr}, a -${diff} run margin across the slide — they limp in ${w10}-${last10.length - w10} over their last ${last10.length}.`,
          `${abbr} have lost ${wl.len} straight and been outscored by ${diff} over the run. Last ${last10.length}: ${w10}-${last10.length - w10}.`,
        ];
        rows.push(makeRow({
          category: 'streaking',
          headline: `${abbr} have ${verb} ${wl.len} straight`,
          detail: pickVariant(variants, `${teamId}-wl-${wl.len}`),
          game: label,
          value: `${wl.won ? 'W' : 'L'}${wl.len}`,
          tone: wl.won ? TONES.HOT : TONES.COLD,
          relevance_score: Math.min(RELEVANCE_CAP, BASE_RELEVANCE + PER_STREAK * wl.len),
          team_id: teamId,
          game_id: gameId,
        }));
      }

      // --- O/U streak (only finals that had a resolvable total) ---
      const ou = ouStreak(results);
      if (ou && ou.len >= STREAK_MIN) {
        const word = ou.over ? 'OVER' : 'UNDER';
        const avgTotal = round(ou.runsSum / ou.len, 1);
        const avgLine = round(ou.lineSum / ou.len, 1);
        const tonightLine = tonightLineByGameId.get(gameId);
        const tonightClause = tonightLine != null ? ` Tonight's number sits at ${tonightLine}.` : '';
        const variants = ou.over ? [
          `${teamName} games have gone OVER ${ou.len} straight — ${avgTotal} runs a night against an average line of ${avgLine}.${tonightClause}`,
          `The over has cashed ${ou.len} in a row in ${abbr} games: ${avgTotal} combined runs per game vs lines averaging ${avgLine}.${tonightClause}`,
          `${ou.len} straight overs for ${abbr} — their games are producing ${avgTotal} runs against numbers around ${avgLine}.${tonightClause}`,
        ] : [
          `${teamName} games have stayed UNDER ${ou.len} straight — just ${avgTotal} runs a night against an average line of ${avgLine}.${tonightClause}`,
          `The under has cashed ${ou.len} in a row in ${abbr} games: ${avgTotal} combined runs per game vs lines averaging ${avgLine}.${tonightClause}`,
          `${ou.len} straight unders for ${abbr} — their games are producing only ${avgTotal} runs against numbers around ${avgLine}.${tonightClause}`,
        ];
        rows.push(makeRow({
          category: 'streaking',
          headline: `${abbr} games have gone ${word} ${ou.len} straight`,
          detail: pickVariant(variants, `${teamId}-ou-${ou.len}`),
          game: label,
          value: `${ou.over ? 'O' : 'U'}${ou.len}`,
          tone: ou.over ? TONES.HOT : TONES.COLD,
          relevance_score: Math.min(RELEVANCE_CAP, BASE_RELEVANCE + PER_STREAK * ou.len),
          line_val: tonightLine != null ? tonightLine : undefined,
          team_id: teamId,
          game_id: gameId,
        }));
      }
    }
  }

  rows.sort((a, b) => b.relevance_score - a.relevance_score);
  const capped = rows.slice(0, MAX_ROWS);
  console.log(`[streaking] examined ${examined}, emitted ${capped.length}`);
  return capped;
}

/** A BDL MLB game is final by status (scores live during play, so status only). */
function isFinal(game) {
  return String(game?.status || '').toUpperCase().includes('FINAL');
}

// ── daily_slate pregame-line join ───────────────────────────────────────────

const TEAM_ALIASES = { 'oakland athletics': 'athletics' };

/** Team name → join key (lower, accent/punct-stripped, A's aliased). */
function normalizeName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip accents
  s = s.replace(/[.'’\-]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return TEAM_ALIASES[s] || s;
}

/** ISO datetime → ET calendar date (YYYY-MM-DD). */
function isoToETDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Per-game daily_slate join key: "ETdate|normAway|normHome". */
function slateKey(etDate, awayName, homeName) {
  return `${etDate}|${normalizeName(awayName)}|${normalizeName(homeName)}`;
}

// daily_slate stores oddsService's mapTeamName output (full_name || name); BDL
// MLB game teams carry NO full_name, so the slate holds the NICKNAME (`name`,
// e.g. "Padres"). Join on that nickname — display_name ("San Diego Padres")
// would never match. (full_name kept as a defensive fallback for other shapes.)
const slateTeamName = (t) => t?.name || t?.full_name || t?.display_name || '';

/**
 * PREGAME total per BDL game id, read from the `daily_slate` morning snapshot —
 * NEVER the live BDL odds endpoint for a past date (that re-fetch fabricates
 * UNDER streaks off frozen in-game lines). daily_slate is keyed by (ET date,
 * away_team, home_team), so each final joins by date + normalized team names. A
 * final with no resolvable slate line is absent from the map → it's line-less,
 * never given a live-snapshot fallback. Never throws (a read failure → {}).
 *
 * @param finals  BDL MLB final game objects
 * @returns Map<bdlGameId, number>
 */
async function fetchSlateLines(finals, startET, endET) {
  const lines = new Map();
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[streaking] missing Supabase config — O/U streaks skipped (no pregame line source)');
    return lines;
  }

  // Pull every MLB daily_slate row across the window once, indexed by join key.
  const slateByKey = new Map();
  try {
    const resp = await axios.get(
      `${SUPABASE_URL}/rest/v1/daily_slate`,
      {
        params: {
          league: 'eq.MLB',
          date: `gte.${startET}`,
          select: 'date,away_team,home_team,total',
        },
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        timeout: 15000,
      },
    );
    for (const r of Array.isArray(resp?.data) ? resp.data : []) {
      if (!r?.date || r.date > endET) continue; // upper bound (params allow one filter per key)
      const tv = Number(r?.total);
      if (r.away_team == null || r.home_team == null || !Number.isFinite(tv)) continue;
      slateByKey.set(slateKey(r.date, r.away_team, r.home_team), tv);
    }
  } catch (err) {
    console.error('[streaking] daily_slate read failed (O/U streaks skipped):', err?.message || err);
    return lines;
  }

  for (const g of finals) {
    if (g?.id == null || !g.date) continue;
    const homeName = slateTeamName(g.home_team);
    const awayName = slateTeamName(g.visitor_team || g.away_team);
    if (!homeName || !awayName) continue;
    const total = slateByKey.get(slateKey(isoToETDate(g.date), awayName, homeName));
    if (Number.isFinite(total)) lines.set(g.id, total);
  }
  return lines;
}

/** Index odds rows' median total_value per game id into `map`. */
function indexTotals(oddsRows, map) {
  const byGame = new Map();
  for (const r of oddsRows || []) {
    const gid = r?.game_id;
    const tv = Number(r?.total_value);
    if (gid == null || !Number.isFinite(tv)) continue;
    if (!byGame.has(gid)) byGame.set(gid, []);
    byGame.get(gid).push(tv);
  }
  for (const [gid, totals] of byGame) {
    const m = median(totals);
    if (m != null && !map.has(gid)) map.set(gid, m);
  }
}

/**
 * One final from the team's perspective:
 * { win, margin, total (runs), line (consensus total or null) } | null.
 */
function resultForTeam(game, teamId, lineByGameId) {
  const h = Number(game?.home_team_data?.runs);
  const a = Number(game?.away_team_data?.runs);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  const isHome = game?.home_team?.id === teamId;
  const teamRuns = isHome ? h : a;
  const oppRuns = isHome ? a : h;
  return {
    win: teamRuns > oppRuns,
    margin: teamRuns - oppRuns,
    total: h + a,
    line: lineByGameId.get(game.id) ?? null,
  };
}

/** Current W/L streak from newest-first results. */
function wlStreak(results) {
  if (!results.length) return null;
  const won = results[0].win;
  let len = 0;
  let runDiff = 0;
  for (const r of results) {
    if (r.win !== won) break;
    len++;
    runDiff += r.margin;
  }
  return { won, len, runDiff };
}

/**
 * Current O/U streak from newest-first results. A final without a line, or a
 * push, breaks the streak (strict consecutive — no waving games through).
 */
function ouStreak(results) {
  const first = results.find(() => true);
  if (!first || first.line == null || first.total === first.line) return null;
  const over = first.total > first.line;
  let len = 0;
  let runsSum = 0;
  let lineSum = 0;
  for (const r of results) {
    if (r.line == null || r.total === r.line) break;
    if ((r.total > r.line) !== over) break;
    len++;
    runsSum += r.total;
    lineSum += r.line;
  }
  return { over, len, runsSum, lineSum };
}

export default { computeStreaking };
