/** Assembling and writing the board snapshot, and the marquee refresh (split from tomorrowService.js, Oct 13 2026). */
import axios from 'axios';
import { getMlbSchedule, getMlbStandings, getMlbTeams, getPitcherMilbSeasonRaw, getTeamVsHandSplits } from '../../providers/mlbStatsApiService.js';
import { attachDebutContext, milbLineFromStatsReply } from '../../sports/mlb/starterDebut.js';
import { getPitcherXStats } from '../../providers/baseballSavantService.js';
import { ballDontLieService as bdl } from '../../providers/ballDontLieService.js';
import { readNflQuarterbacks, attachArmsTakes } from './armsTakes.js';
import { supabaseUrl, supabaseAnonKey, supabaseServiceKey, TABLE, CONFLICT_KEY, SEASON, tomorrowET, nameKey, rowGameIdentity, indexMlbTeams, indexStandings, indexPitcherEraByName, computeLeagueAvgEra } from './basics.js';
import { buildBigGames, nick, toBoardRow, marqueeGameKeys } from './bigGames.js';
import { buildSlate, PRESERVED_BOARD_ROW, mergeFailedTomorrowLeagues, TomorrowBoardSourceError } from './slate.js';
import { buildStarters, enrichStartersWithOutings, attachSeriesToBoard } from './starters.js';
import { buildReturns, slateTeamsMlb, buildForm, buildRecentTeamMetrics, buildRunProfile } from './teamForm.js';
import { buildWeather } from './weather.js';

/**
 * RAIL LADDER EXTRAS (founder GO, Aug 14 2026) — the per-game inputs for THE
 * BIG NUMBERS' conditional rows, attached to each MLB board row:
 *
 *   ml_open_home / ml_open_away — the day's OPENING moneylines. The first
 *     board write of the day stamps them from its own lines; every later
 *     refresh carries the stamp forward untouched, so open-vs-now is a real
 *     comparison on one book, never a recomputation ("the math has to work").
 *     Rows written before this feature existed adopt their earliest known
 *     line on the next refresh.
 *   nrfi — the posted 1st-inning-runs market (over/under 0.5, one vendor).
 *   vs_hand — each lineup's season OPS split against the OPPOSING probable's
 *     throwing hand (hand from the statsapi schedule hydrate; splits from the
 *     statsapi statSplits endpoint). Omitted when the probable or his hand
 *     isn't posted — never guessed.
 *
 * Fail-open per game: any miss leaves that field null and the rail's floor
 * rows carry the slot.
 */
async function attachRailExtras(board, etDateStr, { existingBoard, idByName, supabaseUrl, adminKey }) {
  const priorById = new Map();
  for (const b of existingBoard || []) {
    if (b?.bdl_game_id != null) priorById.set(String(b.bdl_game_id), b);
  }
  // Probable hands come from mlb_field_lineups — the schedule's probablePitcher
  // hydrate carries no pitchHand (probed live Aug 14), while the field-lineup
  // payloads have carried a verified hand for every game since the same-day
  // BDL-merge fix in the edge function. One query, keyed by BDL game id.
  const handsByGameId = new Map();
  try {
    const { data } = await axios.get(`${supabaseUrl}/rest/v1/mlb_field_lineups`, {
      params: { date: `eq.${etDateStr}`, select: 'game_id,payload' },
      headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
      timeout: 15000,
    });
    for (const row of data || []) {
      if (row?.game_id == null) continue;
      handsByGameId.set(String(row.game_id), {
        home: row?.payload?.home?.pitcher?.hand || null,
        away: row?.payload?.away?.pitcher?.hand || null,
      });
    }
  } catch { /* hands just won't resolve */ }
  const handFor = (row, side) => {
    const h = row.bdl_game_id != null ? handsByGameId.get(String(row.bdl_game_id)) : null;
    const code = h?.[side];
    return code === 'L' || code === 'R' ? code : null;
  };
  const splitsCache = new Map();
  const splitsFor = async (teamName) => {
    const id = idByName.get(nameKey(teamName || ''));
    if (id == null) return null;
    if (!splitsCache.has(id)) {
      splitsCache.set(id, await getTeamVsHandSplits(id, SEASON).catch(() => null));
    }
    return splitsCache.get(id);
  };

  for (const r of board) {
    if (r.league !== 'MLB') continue;
    try {
      const prior = r.bdl_game_id != null ? priorById.get(String(r.bdl_game_id)) : null;
      // SAME-BOOK LAW (founder, Aug 14: "we cant use seperate sportsbooks and
      // be like the line moved when its two different sportsbooks lines"). The
      // vendor rides every snapshot; if today's numbers come from a DIFFERENT
      // book than the stamped open (FanDuel blipped, priority walked on), the
      // open RESTAMPS from the new book and the comparison restarts — an
      // open→now pair is always one book against itself.
      const openBook = prior?.ml_open_book ?? prior?.ml_book ?? null;
      const sameBook = openBook == null || r.ml_book == null || openBook === r.ml_book;
      if (sameBook) {
        r.ml_open_home = prior?.ml_open_home ?? prior?.ml_home ?? r.ml_home ?? null;
        r.ml_open_away = prior?.ml_open_away ?? prior?.ml_away ?? r.ml_away ?? null;
        r.ml_open_book = openBook ?? r.ml_book ?? null;
      } else {
        console.warn(`[TomorrowBoard] ${r.away_abbr}@${r.home_abbr}: line book switched ${openBook} -> ${r.ml_book} — restamping open (no cross-book "movement")`);
        r.ml_open_home = r.ml_home ?? null;
        r.ml_open_away = r.ml_away ?? null;
        r.ml_open_book = r.ml_book ?? null;
      }

      const market = r.bdl_game_id != null
        ? await bdl.getMlbFirstInningRunsMarket(r.bdl_game_id).catch(() => null)
        : null;
      r.nrfi = market ? { over: market.overOdds ?? null, under: market.underOdds ?? null, vendor: market.vendor ?? null } : null;

      const homeHand = handFor(r, 'home');
      const awayHand = handFor(r, 'away');
      const sideRead = async (teamName, oppHand) => {
        if (!oppHand) return null;
        const sp = await splitsFor(teamName);
        if (!sp) return null;
        const vs = oppHand === 'L' ? sp.vsLeft : sp.vsRight;
        const other = oppHand === 'L' ? sp.vsRight : sp.vsLeft;
        const num = (x) => (x?.ops != null && Number.isFinite(Number(x.ops)) ? Number(x.ops) : null);
        if (num(vs) == null) return null;
        return { faces: oppHand, ops_vs: num(vs), ops_other: num(other) };
      };
      const away = await sideRead(r.away_team, homeHand);
      const home = await sideRead(r.home_team, awayHand);
      r.vs_hand = away || home ? { away, home } : null;
    } catch { /* fail-open: this game keeps nulls */ }
  }
}

/**
 * Assemble + persist tomorrow's board snapshot. Idempotent upsert on (date) —
 * re-runs (e.g. the evening line refresh) overwrite in place so overnight-posted
 * lines flip "—" to real numbers before users wake.
 *
 * @returns {Promise<{date,game_count,any_lines,big_games,starters,returns,form,run_profile,weather,league_avg_era,countdown_sport}>}
 */
export async function writeTomorrowBoard(etDateStr = tomorrowET(), table = TABLE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etDateStr)) {
    throw new Error(`writeTomorrowBoard: invalid date "${etDateStr}" (expected YYYY-MM-DD)`);
  }
  const adminKey = supabaseServiceKey || supabaseAnonKey;
  if (!supabaseUrl || !adminKey) {
    throw new Error(
      'writeTomorrowBoard: Supabase config missing — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  // 1. SLATE + LINES (single source of truth, in lockstep with the Today slate).
  const slate = await buildSlate(etDateStr);
  let slateRows = slate.rows;
  const { byLeague, failures } = slate;

  // Last-good is an emergency bridge for typed external outages only. A
  // schema/config/identity/internal failure is our code to fix; preserving the
  // old league would disguise it as current data, so fail before any write.
  const nonTransientFailures = failures.filter((failure) => failure.transient_external !== true);
  if (nonTransientFailures.length > 0) {
    throw new TomorrowBoardSourceError({
      date: etDateStr,
      game_count: slateRows.length,
      byLeague,
      failures,
      source_health: 'failed',
      preserved_leagues: [],
    });
  }

  // The table is one row per date, so an upsert replaces every league at once.
  // If one league failed, load that SAME date's prior board and retain only its
  // rows. If the preservation read itself fails, refuse the destructive write.
  let existingBoard = null;
  let preservedLeagues = [];
  const readExistingBoard = async () => {
    if (existingBoard !== null) return existingBoard;
    const { data } = await axios.get(`${supabaseUrl}/rest/v1/${table}`, {
      params: { date: `eq.${etDateStr}`, select: 'board' },
      headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
      timeout: 15000,
    });
    if (!Array.isArray(data)) {
      throw new Error('existing board read returned a non-array response');
    }
    const prior = data[0]?.board ?? [];
    if (!Array.isArray(prior)) {
      throw new Error('existing board row has a non-array board payload');
    }
    existingBoard = prior;
    return existingBoard;
  };

  if (failures.length > 0) {
    let prior;
    try {
      prior = await readExistingBoard();
    } catch (error) {
      throw new Error(
        `Tomorrow board has failed league source(s) and last-good preservation could not be read; refusing overwrite: ${error.message}`,
      );
    }
    slateRows = mergeFailedTomorrowLeagues(slateRows, failures, prior);
    preservedLeagues = failures
      .map(({ league }) => league)
      .filter((league) => prior.some((row) => row?.league === league));
    for (const { league } of failures) {
      byLeague[league] = prior.filter((row) => row?.league === league).length;
    }
  }

  // MLB join indexes (teams / standings / aces) — each best-effort.
  let teams = [];
  try { teams = await getMlbTeams(); } catch (e) { console.warn(`[TomorrowBoard] teams fetch failed: ${e.message}`); }
  const teamIndex = indexMlbTeams(teams);
  const idByName = buildIdByName(teams);

  let standings = new Map();
  try { standings = indexStandings(await getMlbStandings(SEASON)); }
  catch (e) { console.warn(`[TomorrowBoard] standings fetch failed: ${e.message}`); }

  // Savant pitcher xStats — one fetch grounds BOTH the per-starter ERA index
  // AND the top-level league-average ERA (PA-weighted mean of this corpus).
  let eraByName = new Map();
  let leagueAvg = { league_avg_era: null };
  try {
    const pitcherX = await getPitcherXStats(SEASON);
    eraByName = indexPitcherEraByName(pitcherX);
    leagueAvg = computeLeagueAvgEra(pitcherX);
  } catch (e) { console.warn(`[TomorrowBoard] savant ERA fetch failed: ${e.message}`); }

  // 2. STARTERS (+ ace-by-game AND both-pitchers-by-game maps from the same
  // schedule read).
  const { starters, acesByGame, pitchersByGame } = await buildStarters(etDateStr, teamIndex, eraByName);

  // 3. RETURNS (best-effort, honest-empty).
  const returns = await buildReturns();

  // 3b. EXTRA TABBED LANES — FORM · RUN PROFILE · WEATHER. All GROUNDED-only
  // (omit a team/game when its source data is absent; never fabricate).
  const mlbSlateTeams = slateTeamsMlb(slateRows, teamIndex, idByName);
  const form = buildForm(mlbSlateTeams, standings);
  let recentMetrics = new Map();
  try {
    recentMetrics = await buildRecentTeamMetrics(mlbSlateTeams, etDateStr);
  } catch (e) {
    console.warn(`[TomorrowBoard] recent team metrics failed (honest-empty): ${e.message}`);
  }
  const run_profile = buildRunProfile(mlbSlateTeams, standings, recentMetrics);
  let weather = [];
  try {
    // getMlbSchedule is 2-hr cached (already read in buildStarters) → free here.
    const sched = await getMlbSchedule(etDateStr);
    weather = await buildWeather(sched, etDateStr, teamIndex);
  } catch (e) {
    console.warn(`[TomorrowBoard] weather lane failed (honest-empty): ${e.message}`);
  }

  // 2c. SCOUT EXTRAS — each probable's last outing + this-season record vs
  // tonight's opponent (BDL box scores; grounded, omit-when-short).
  try {
    await enrichStartersWithOutings(starters, etDateStr, teamIndex);
  } catch (e) {
    console.warn(`[TomorrowBoard] starter outings failed (honest-empty): ${e.message}`);
  }

  // 2d. DEBUT STARTERS (founder GO, Aug 17) — a probable with zero MLB data
  // gets an honest empty-state flag plus his labeled AAA/AA season line, so
  // his plate never renders as a silent void or a fake 0.00.
  try {
    await attachDebutContext(starters, {
      fetchLevel: async (personId, level) =>
        milbLineFromStatsReply(await getPitcherMilbSeasonRaw(personId, SEASON, level), level),
    });
  } catch (e) {
    console.warn(`[TomorrowBoard] debut-starter pass failed (honest-empty): ${e.message}`);
  }

  // 4. BIG GAMES.
  const bigGames = buildBigGames(slateRows, {
    mlb: { teamIndex, standings, idByName, acesByGame, pitchersByGame },
  });
  const marqueeKeys = marqueeGameKeys(bigGames);

  // 5. COUNTDOWN — earliest CONFIRMED commence_time across all slate rows.
  // A date-only NCAAF fixture belongs on the board but can never own a clock.
  let countdown_iso = null;
  let countdown_sport = null;
  for (const r of slateRows) {
    if (r.kickoff_status === 'date_only') continue;
    if (!r.commence_time) continue;
    const t = new Date(r.commence_time).getTime();
    if (Number.isNaN(t)) continue;
    if (countdown_iso == null || t < new Date(countdown_iso).getTime()) {
      countdown_iso = r.commence_time;
      countdown_sport = r.league;
    }
  }

  // board[] presentation rows.
  const board = slateRows.map((r) => (
    r[PRESERVED_BOARD_ROW] ? { ...r[PRESERVED_BOARD_ROW] } : toBoardRow(r, marqueeKeys, teamIndex)
  ));
  // SCOUT EXTRAS — per-MLB-game season series (record + venue split + last
  // three meetings) off the season game index. Grounded; omit-when-short.
  try {
    await attachSeriesToBoard(board);
  } catch (e) {
    console.warn(`[TomorrowBoard] season series failed (honest-empty): ${e.message}`);
  }
  // Rail ladder extras — needs the PRIOR snapshot so opening lines survive
  // every later refresh of the same date.
  try {
    let priorBoard = [];
    try {
      priorBoard = await readExistingBoard();
    } catch { /* first write of the day */ }
    await attachRailExtras(board, etDateStr, { existingBoard: priorBoard, idByName, supabaseUrl, adminKey });
  } catch (e) {
    console.warn(`[TomorrowBoard] rail extras failed (honest-empty): ${e.message}`);
  }
  // Commentary is optional. Fresh schedules, lines and starters still publish
  // when the model is unavailable; old takes require matching exact inputs.
  let quarterbacks = [];
  try {
    quarterbacks = await readNflQuarterbacks(etDateStr, { supabaseUrl, adminKey });
  } catch (e) {
    console.warn(`[TomorrowBoard] NFL quarterback rows unavailable (takes wait for the next refresh): ${e.message}`);
  }
  const arms = await attachArmsTakes(board, starters, { existingBoard: existingBoard || [], quarterbacks });
  const any_lines = board.some(
    (r) => r.spread != null || r.ml_home != null || r.ml_away != null || r.total != null,
  );

  // The opening matchup(s) — the game(s) at the earliest commence time, named
  // (abbreviations) for the countdown hero (founder: "whatever game or games
  // kick off the day"). De-duped, up to 3 joined with " · ".
  let countdown_matchup = null;
  if (countdown_iso != null) {
    const openers = board
      .filter((r) => r.commence_time === countdown_iso)
      .map((r) => {
        const away = r.away_abbr || r.away_team;
        const home = r.home_abbr || r.home_team;
        return away && home ? `${away} @ ${home}` : null;
      })
      .filter(Boolean);
    if (openers.length) countdown_matchup = [...new Set(openers)].slice(0, 3).join(' · ');
  }

  const record = {
    date: etDateStr,
    countdown_iso,
    countdown_sport,
    countdown_matchup,
    game_count: board.length,
    any_lines,
    board,
    big_games: bigGames,
    starters,
    returns,
    form,
    run_profile,
    weather,
    // Grounded current MLB league-average ERA (PA-weighted mean of the
    // Savant pitcher corpus) — the reference the iOS colors each starter's
    // ERA against (below avg = good/green, above = bad/red).
    league_avg_era: leagueAvg.league_avg_era,
    updated_at: new Date().toISOString(),
  };

  const sanitized = JSON.parse(JSON.stringify(record));
  await axios({
    method: 'POST',
    url: `${supabaseUrl}/rest/v1/${table}`,
    data: sanitized,
    params: { on_conflict: CONFLICT_KEY },
    headers: {
      apikey: adminKey,
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
  });

  const summary = Object.entries(byLeague).map(([l, n]) => `${l}=${n}`).join(', ');
  const status = failures.length > 0 ? '⚠️ PARTIAL' : '✅';
  console.log(
    `[TomorrowBoard] ${status} ${etDateStr}: ${board.length} game(s)${summary ? ` (${summary})` : ''}, ` +
    `${bigGames.length} big game(s), ${starters.length} starter(s), ${returns.length} return(s), ` +
    `${form.length} form, ${run_profile.length} run-profile, ${weather.length} weather, ` +
    `lgERA=${leagueAvg.league_avg_era ?? '—'}, ` +
    `lines=${any_lines ? 'posted' : 'open soon'}, countdown=${countdown_sport || 'none'}`,
  );

  const result = {
    date: etDateStr,
    game_count: board.length,
    any_lines,
    big_games: bigGames,
    starters,
    returns,
    form,
    run_profile,
    weather,
    league_avg_era: leagueAvg.league_avg_era,
    countdown_sport,
    failures,
    source_health: failures.length > 0 ? 'degraded' : 'healthy',
    preserved_leagues: preservedLeagues,
    arms,
  };
  if (failures.length > 0) throw new TomorrowBoardSourceError(result);
  return result;
}

/* ───────────────────────── supporting builders ──────────────────────────── */

/** team-name (full/nick) -> id, from getMlbTeams (so slate names resolve to ids). */
function buildIdByName(teams) {
  const map = new Map();
  for (const t of teams || []) {
    if (t?.id == null) continue;
    for (const nm of [t.name, t.teamName, t.clubName, t.shortName, t.locationName && t.teamName ? `${t.locationName} ${t.teamName}` : null]) {
      if (nm) map.set(nameKey(nm), t.id);
    }
  }
  return map;
}

/** Refresh only marquee selection on an existing snapshot, preserving its other lanes. */
export async function refreshMarqueeBoard(etDateStr, table = TABLE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etDateStr)) throw new Error('Invalid marquee date');
  const adminKey = supabaseServiceKey || supabaseAnonKey;
  if (!supabaseUrl || !adminKey) throw new Error('Marquee refresh: Supabase config missing');
  const headers = { apikey: adminKey, Authorization: `Bearer ${adminKey}` };
  const [{ data: saved }, { data: ranks }, teams, rawStandings] = await Promise.all([
    axios.get(`${supabaseUrl}/rest/v1/${table}`, {
      params: { date: `eq.${etDateStr}`, select: 'board,starters,updated_at' }, headers, timeout: 15000,
    }),
    axios.get(`${supabaseUrl}/rest/v1/daily_slate`, {
      params: { date: `eq.${etDateStr}`, league: 'eq.NCAAF', select: 'bdl_game_id,away_ranking,home_ranking' }, headers, timeout: 15000,
    }),
    getMlbTeams(),
    getMlbStandings(Number(etDateStr.slice(0, 4))),
  ]);
  if (saved.length !== 1 || !Array.isArray(saved[0].board)) throw new Error('Marquee refresh requires an existing board');
  const snapshot = saved[0];
  const ranksById = new Map(ranks.map((row) => [String(row.bdl_game_id), row]));
  const rows = snapshot.board.map((row) => {
    const rank = row.league === 'NCAAF' ? ranksById.get(String(row.bdl_game_id)) : null;
    return rank ? { ...row, away_ranking: rank.away_ranking, home_ranking: rank.home_ranking } : row;
  });
  const teamIndex = indexMlbTeams(teams);
  const eraByName = new Map((snapshot.starters || [])
    .filter((starter) => starter.full_name && starter.era != null)
    .map((starter) => [nameKey(starter.full_name), { era: starter.era }]));
  const { acesByGame, pitchersByGame } = await buildStarters(etDateStr, teamIndex, eraByName);
  const bigGames = buildBigGames(rows, {
    mlb: { teamIndex, standings: indexStandings(rawStandings), idByName: buildIdByName(teams), acesByGame, pitchersByGame },
  });
  const keys = marqueeGameKeys(bigGames);
  const board = rows.map((row) => ({ ...row, is_marquee: keys.has(rowGameIdentity(row)) }));
  const { data: written } = await axios.patch(`${supabaseUrl}/rest/v1/${table}`,
    { big_games: bigGames, board, updated_at: new Date().toISOString() }, {
      params: { date: `eq.${etDateStr}`, updated_at: `eq.${snapshot.updated_at}`, select: 'date,big_games' },
      headers: { ...headers, Prefer: 'return=representation' }, timeout: 15000,
    });
  if (written.length !== 1) throw new Error('Board changed during marquee refresh; retry from the new snapshot');
  return written[0];
}
