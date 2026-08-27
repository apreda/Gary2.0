/**
 * MLB Scout Report Builder
 *
 * Uses BDL (GOAT tier) for structured data:
 * - Standings (W-L, home/away, L10, streak, GB, division)
 * - Injuries (with FRESH/ESTABLISHED/SP-SCRATCH routing labels)
 * Uses MLB Stats API (free, no key) for:
 * - Rosters, recent games, probable pitchers, player career stats
 * - Lineup fallback when BDL's lineup feed gaps a team (boxscore is authoritative)
 * Uses Gemini Grounding for:
 * - Odds, live context, game preview, season storylines
 */

import { openaiWebSearch } from '../../../pickdesk/webSearch.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';
import { ballDontLieService, getCachedOrFetch } from '../../../ballDontLieService.js';
import { getPitcherArsenal, getPitcherStatcastProfile } from '../../../baseballSavantService.js';
import {
  getTeamRoster,
  getMlbRecentGames,
  getMlbUpcomingGames,
  getProbablePitchers,
  getMlbGameLineups,
  getGameBoxScore,
  getBatterGameTrips,
  getPitcherPlatoonSplits,
  getMlbTransactions,
  getPitcherLastStarts,
  getPlayerSeasonStats,
  getPitcherMonthSplits,
  getPitcherCareerProfile,
  getTeamVsHandSplits,
  getScoringFlowAttributed,
  getPitcherSituationalSplits,
  getTeamSituationalHitting,
  getMlbStandingsContext,
  getMlbPeopleHands,
  getPitcherMilbSeasonRaw,
  getPitcherGameLogRaw,
} from '../../../mlbStatsApiService.js';
import { computeSpVsHandByStart, computePitchTypeTrendByStart } from './mlbPlatoonRecency.js';
import { computeTeamMonthArc, computeBounceBackLine, computeRecordSince, computeCurrentStreak, computeRecentQuality, computeVenueTransition } from './mlbSeasonContext.js';
import { recentWindowLine, monthArcLine, longLayoffFlag, earlyCareerFlag, midSeasonGapFlag, singleStartDistortion, teamChangeFlags, seasonLineQualifier, matchupRecencyLine, homeRoadLine, whoHeIsLine } from './pitcherArc.js';
import { milbLineFromStatsReply } from '../../../starterDebut.js';
import { foldName } from '../../../../utils/nameUtils.js';
import { findStandingsRow } from '../../../teamIdentity.js';
import { computeMlbSeriesState, computeMlbSeasonSeries, computeMlbSeasonSeriesGroups, computeMlbScheduleShape, toEtDate, clubMatches } from './mlbSeriesState.js';
import { aggregateRecentWindow } from './mlbRecentWindow.js';
import { computePitcherWhiffByStart } from './mlbContactQuality.js';
import { renderBoxScore, buildPenPressQuery } from './mlbGamesAsWritten.js';
import {
  completedMlbTeamGames,
  resolveMlbGamesMissed,
  isMeaningfulMlbAbsence,
  classifyMlbInjuryContext,
  mlbGamesMissedLabel,
  isMlbPitcherPosition,
} from './mlbInjuryContext.js';

// ═══════════════════════════════════════════════════════════════════════
// THE MATCHUP SHELF (Aug 18 2026 — founder: "GARY NEEDS FULL CONTEXT AND
// FULL DATA"). The desk has carried these six sections since the Aug 5-13
// desk work; the engine's dossier never inherited them, so pen quality,
// pen workload, park, defense, catchers and SP pitch types reached Gary
// only when the researcher chose to summarize them. Now they are baseline.
// Replicated from pickdesk/mlbDesk.js buildMatchupLab (importing it would
// cycle: mlbDesk → scoutReportBuilder → this file).
// ═══════════════════════════════════════════════════════════════════════
const SCOUT_MATCHUP_SECTIONS = [
  ['MLB_PITCH_TYPES_SP', '═══ SP PITCH TYPES (usage / whiff / xwOBA per pitch) ═══'],
  ['MLB_TEAM_DEFENSE', '═══ TEAM DEFENSE ═══'],
  ['MLB_CATCHER_DEFENSE', '═══ CATCHERS — the running game ═══'],
  ['MLB_CLOSER_RELIEVER_STATS', '═══ THE PEN — high-leverage arms ═══'],
  ['MLB_BULLPEN_WORKLOAD', '═══ BULLPEN WORKLOAD (recent appearances) ═══'],
  ['MLB_PARK_FACTORS', '═══ THE PARK ═══'],
];

async function buildScoutMatchupShelf(game, homeTeam, awayTeam, gamePk) {
  // Lazy imports — a top-level import of the stat router from inside the
  // scout family creates an init-order cycle (router → fetchers → scout);
  // at call time every module is initialized and the cycle is harmless.
  const { fetchStats } = await import('../../tools/statRouters/index.js');
  const { summarizeStatForContext } = await import('../../orchestrator/orchestratorHelpers.js');
  const opt = { game: { ...game, gamePk: gamePk ?? game.gamePk, id: game.id ?? game.bdl_game_id } };
  const parts = await Promise.all(SCOUT_MATCHUP_SECTIONS.map(async ([token, header]) => {
    try {
      const r = await fetchStats('baseball_mlb', token, homeTeam, awayTeam, opt);
      if (!r || r.error) return null;
      const text = summarizeStatForContext(r, token, homeTeam, awayTeam);
      if (!text || text.trim().length < 20) return null;
      return `${header}\n${text.trim()}`;
    } catch { return null; }
  }));
  return parts.filter(Boolean).join('\n\n');
}

export async function buildMlbScoutReport(game, options = {}) {
  // home_team/away_team are strings; team objects with IDs are in home_team_data/away_team_data
  const homeTeam = typeof game.home_team === 'string' ? game.home_team : (game.home_team?.full_name || game.home_team?.name || 'Home');
  const awayTeam = typeof game.away_team === 'string' ? game.away_team : (game.away_team?.full_name || game.away_team?.name || 'Away');
  // MLBAM team ids. Odds-feed game rows carry NO team ids at all (found Jul 22
  // 2026: every MLBAM-keyed section — recent games, rosters, rest, series
  // state — silently emptied), so the schedule match below is the primary
  // source; any ids already on the game object are the fallback.
  let homeTeamId = game.home_team_data?.id || game.home_team?.id;
  let awayTeamId = game.away_team_data?.id || game.away_team?.id;
  let gamePk = game.gamePk || null;
  const venue = game.venue || game._raw?.venue?.name || 'Unknown Venue';
  const gameDesc = game.description || '';
  const startTime = game.start_time || game.commence_time || '';

  console.log(`[Scout Report] Building MLB report: ${awayTeam} @ ${homeTeam}`);

  // Doubleheader awareness — filled by the schedule match below, or by the
  // fallback probe when the gamePk arrived pre-resolved.
  let dhInfo = null;

  // Resolve MLB Stats API gamePk + MLBAM team ids when missing (BDL/odds-feed
  // games have neither; the schedule match carries both).
  if ((!gamePk || !homeTeamId || !awayTeamId) && startTime) {
    try {
      const { getMlbSchedule } = await import('../../../mlbStatsApiService.js');
      // MLB Stats API ?date= is keyed by the game's OFFICIAL (ET-local) date.
      // toISOString() shifts any ≥8 PM ET first pitch onto the next UTC day,
      // probing the wrong schedule day — mid-series that resolves TOMORROW'S
      // gamePk (wrong probables, inert lineup fallback), and on a series
      // finale it resolves nothing. Resolve in ET; ET+1 is a safety probe only.
      const startMs = new Date(startTime).getTime();
      const etDate = new Date(startTime).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const etNext = new Date(startMs + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      for (const d of [etDate, etNext]) {
        const schedule = await getMlbSchedule(d).catch(() => []);
        const candidates = schedule.filter(g =>
          clubMatches(g.teams?.home?.team?.name, homeTeam) && clubMatches(g.teams?.away?.team?.name, awayTeam));
        // Doubleheaders share teams + date — take the game whose scheduled
        // first pitch is closest to this game's start, never just the first.
        const match = candidates.sort((a, b) =>
          Math.abs(new Date(a.gameDate || 0).getTime() - startMs) -
          Math.abs(new Date(b.gameDate || 0).getTime() - startMs)
        )[0];
        if (match?.gamePk) {
          gamePk = gamePk || match.gamePk;
          homeTeamId = homeTeamId || match.teams?.home?.team?.id || null;
          awayTeamId = awayTeamId || match.teams?.away?.team?.id || null;
          // DOUBLEHEADER (founder GO, Aug 18): the schedule row knows; the
          // desk's only prior signal was a rest line reading "played today".
          if (match.doubleHeader === 'Y' || match.doubleHeader === 'S') {
            dhInfo = { gameNumber: match.gameNumber || null, split: match.doubleHeader === 'S' };
          }
          break;
        }
      }
      console.log(`[Scout Report] Resolved MLB Stats API gamePk: ${gamePk || 'not found'}, team ids: ${homeTeam}=${homeTeamId || '?'}, ${awayTeam}=${awayTeamId || '?'}`);
    } catch (e) {
      console.warn(`[Scout Report] gamePk resolution failed: ${e.message}`);
    }
  }

  // Stamp the resolved gamePk back onto the game object so the agent loop's
  // tool router can find it. MLB pitcher tools (MLB_PITCHER_SEASON_STATS,
  // MLB_PITCHER_RECENT_FORM, MLB_STARTING_PITCHERS, etc.) all need this to call
  // getProbablePitchers() — without it they fall back to BDL game id which
  // MLB Stats API doesn't recognize, and the tool returns "not identified".
  if (gamePk && !game.gamePk) {
    game.gamePk = gamePk;
  }

  // DH fallback probe: a gamePk that arrived pre-resolved skipped the
  // schedule match above — one cached schedule read fills the flag.
  if (!dhInfo && gamePk && startTime) {
    try {
      const { getMlbSchedule } = await import('../../../mlbStatsApiService.js');
      const etDate = new Date(startTime).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const schedule = await getMlbSchedule(etDate).catch(() => []);
      const row = (schedule || []).find((g) => g.gamePk === gamePk);
      if (row && (row.doubleHeader === 'Y' || row.doubleHeader === 'S')) {
        dhInfo = { gameNumber: row.gameNumber || null, split: row.doubleHeader === 'S' };
      }
    } catch { /* flag is additive */ }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RESOLVE BDL TEAM IDs (needed for structured standings + injuries)
  // ═══════════════════════════════════════════════════════════════════
  const [homeBdlTeam, awayBdlTeam] = await Promise.all([
    ballDontLieService.getTeamByNameGeneric('baseball_mlb', homeTeam).catch(e => {
      console.warn(`[Scout Report] BDL home team lookup error: ${e.message}`);
      return null;
    }),
    ballDontLieService.getTeamByNameGeneric('baseball_mlb', awayTeam).catch(e => {
      console.warn(`[Scout Report] BDL away team lookup error: ${e.message}`);
      return null;
    }),
  ]);
  const homeTeamBdlId = homeBdlTeam?.id || null;
  const awayTeamBdlId = awayBdlTeam?.id || null;
  console.log(`[Scout Report] BDL team IDs: ${homeTeam}=${homeTeamBdlId}, ${awayTeam}=${awayTeamBdlId}`);

  // ═══════════════════════════════════════════════════════════════════
  // PARALLEL DATA FETCH
  // ═══════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  // CONSOLIDATED GROUNDING: 2 mega-queries instead of 6 small ones
  // Uses thinkingLevel 'low' — these are fact-retrieval, not reasoning
  // ═══════════════════════════════════════════════════════════════════
  const groundingOpts = { maxTokens: 1500 };
  const season = new Date().getFullYear();

  const [
    homeRoster,
    awayRoster,
    bdlStandings,
    bdlInjuries,
    probablePitchersData,
    homeRecentGames,
    awayRecentGames,
    gameContextGrounding,
    confirmedLineups,
    homeUpcomingGames,
    storylinesGrounding,
    homePenPress,
    awayPenPress,
  ] = await Promise.all([
    homeTeamId ? getTeamRoster(homeTeamId).catch(e => { console.warn(`[Scout Report] Home roster error: ${e.message}`); return []; }) : Promise.resolve([]),
    awayTeamId ? getTeamRoster(awayTeamId).catch(e => { console.warn(`[Scout Report] Away roster error: ${e.message}`); return []; }) : Promise.resolve([]),
    // BDL GOAT-tier standings (replaces mlbStatsApiService standings)
    ballDontLieService.getMlbStandings(season).catch(e => { console.warn(`[Scout Report] BDL Standings error: ${e.message}`); return []; }),
    // BDL structured injuries
    (homeTeamBdlId || awayTeamBdlId)
      ? ballDontLieService.getInjuriesGeneric('baseball_mlb', {
          team_ids: [homeTeamBdlId, awayTeamBdlId].filter(Boolean)
        }).catch(e => { console.warn(`[Scout Report] BDL Injuries error: ${e.message}`); return []; })
      : Promise.resolve([]),
    gamePk ? getProbablePitchers(gamePk).catch(e => { console.warn(`[Scout Report] Probable pitchers error: ${e.message}`); return null; }) : Promise.resolve(null),
    homeTeamId ? getMlbRecentGames(homeTeamId, 10).catch(e => { console.warn(`[Scout Report] Home recent games error: ${e.message}`); return []; }) : Promise.resolve([]),
    awayTeamId ? getMlbRecentGames(awayTeamId, 10).catch(e => { console.warn(`[Scout Report] Away recent games error: ${e.message}`); return []; }) : Promise.resolve([]),
    // BREAKING NEWS ONLY (tightened Jun 29 2026): same-day, actionable news for THIS game. Was two broad grounding
    // blobs ("game preview/storylines" + "offseason moves/spring training/team outlook") that duplicated the structured
    // sections (odds, lineups, standings, pitchers) and dragged in stale preseason narrative. The structured data carries
    // the matchup; grounding now only adds what no API has: late-breaking, same-day news.
    // Jul 26 2026 (founder GO, de-Gemini step one): the game lane's news search
    // runs on OpenAI web_search; the freshness protocol rode along verbatim.
    openaiWebSearch(
      `MLB ${season}: ${awayTeam} at ${homeTeam} TODAY — only same-day breaking news that affects this game: ` +
      `late injuries or scratches, lineup or rotation changes, and weather. ` +
      `Name the specific players involved in any injury or roster note — a report without names is not usable. ` +
      `Report only concrete, same-day facts. If there is no breaking news, say so briefly.`,
      // Hard news is a 24-hour window (founder, Aug 10) — storylines and
      // press keep the wider one.
      { maxTokens: groundingOpts.maxTokens, freshnessHours: 24 }
    ).then(r => r?.data || '').catch(() => ''),
    // Lineups: BDL API first (pre-game, includes handedness + probable pitchers);
    // the MLB Stats API boxscore fills any side BDL leaves short, downstream.
    (async () => {
      const gameId = game.id || game.gameId;
      if (!gameId) return null;
      const bdl = await ballDontLieService.getMlbLineups(gameId).catch(() => null);
      return bdl ? { source: 'bdl', data: bdl } : null;
    })(),
    // SERIES STATE lookahead (Jul 9 2026): remaining meetings vs tonight's
    // opponent complete the "Game 2 of 3" (a finale reads "Game 4 of 4").
    // null = lookahead failed → the section omits "of N" rather than guess.
    homeTeamId ? getMlbUpcomingGames(homeTeamId, 4).catch(() => null) : Promise.resolve(null),
    // STORYLINES (Jul 26 2026, situational layer): the narrative a fan holds —
    // separate from same-day hard news. Facts and reported narratives only.
    openaiWebSearch(
      `MLB: what are the current storylines around the ${awayTeam} and the ${homeTeam} heading into today's ${awayTeam} at ${homeTeam} game — team momentum narratives as reported, manager or clubhouse news, notable player storylines, post-game comments from managers or players after each team's last game, tonight's scheduled starting pitchers' situations (role changes such as a converted reliever or an opener/bullpen game, innings or pitch limits, rehab returns, rotation shuffles), and trade-deadline rumors involving either team's players as reported, and how each team's last week has actually gone as reported — the shape of any current streak or skid and what has driven it. ` +
      // SEASON-ARC CLAUSE RESTORED (founder ruling, Aug 12 — reverses his own
      // Aug 10 kill, knowingly: arc narratives are allowed BECAUSE the desk
      // now carries the underlying form data — series ledger, L20 run shape,
      // standings — so Gary can validate or puncture what the press claims).
      `Also: each team's longer season arc as the press has written it — how the last month has actually gone and what reporters say is driving it (rotation health, lineup changes, a trade working out or not, a slump or surge), attributed to the outlet. ` +
      `Do not re-list a player's static, ongoing injured-list absence as a current storyline. Include injury context here only when there is a new status change, scratch, activation/return, rehab-role development, or other concrete new development today; the structured injury section owns absence freshness. ` +
      `Attribute reported narratives to their source. Do NOT include picks, predictions, or betting advice.`,
      { maxTokens: 2200 }
    ).then(r => r?.data || '').catch(() => ''),
    // THE PEN, AS REPORTED (founder GO, Aug 27 — the pen press beat): what
    // the beat is writing about each bullpen, attributed. Failure ≠ empty
    // (funnel law): a thrown search is marked failed and prints an
    // honest-absence line; a clean empty result omits the section.
    openaiWebSearch(buildPenPressQuery(homeTeam), { maxTokens: 1200, freshnessHours: 72 })
      .then(r => ({ text: r?.data || '' })).catch(() => ({ failed: true })),
    openaiWebSearch(buildPenPressQuery(awayTeam), { maxTokens: 1200, freshnessHours: 72 })
      .then(r => ({ text: r?.data || '' })).catch(() => ({ failed: true })),
    // (OUR-OWN-RECAPS fetch DELETED Aug 12 2026: it existed only as the
    // WIRE section's fallback, and the WIRE dissolved into colocated
    // official stories the same day. Every story on the desk is now MLB's
    // own reporting — the desk never quotes Gary back to himself.)
  ]);

  console.log(`[Scout Report] BDL standings: ${bdlStandings?.length || 0} teams, BDL injuries: ${bdlInjuries?.length || 0}`);

  // Opponent record lookup, shared by every ledger that names an opponent
  // (founder GO, Aug 18: "3.10 ERA his last three — against WHOM?"). Exact
  // whole-name match first; a bare nickname resolves only when it names ONE
  // club (a bare "Sox" prints nothing — the shared-mascot lesson, Aug 17).
  const standingsRecordOf = (teamNameStr) => {
    const tn = String(teamNameStr || '').toLowerCase().trim();
    if (!tn) return '';
    const rows = bdlStandings || [];
    const nameOf = (st) => (st.team?.display_name || st.team?.full_name || '').toLowerCase();
    let row = rows.find((st) => nameOf(st) === tn);
    if (!row) {
      // Whole-nickname fallback via clubMatches (Aug 19): "Red Sox" resolves
      // uniquely; a bare ambiguous word still prints nothing over guessing.
      const candidates = rows.filter((st) => clubMatches(nameOf(st), tn));
      if (candidates.length === 1) row = candidates[0];
    }
    return row ? ` (${row.wins}-${row.losses})` : '';
  };

  // ═══════════════════════════════════════════════════════════════════
  // TEAM SEASON STATS (BDL GOAT-tier — batting + pitching aggregates)
  // Player-level season stats (full team) — used to find probable pitcher's
  // current-year line. No career fallback: if a pitcher has no 2026 starts
  // we just don't show stats for them.
  // ═══════════════════════════════════════════════════════════════════
  const [homeTeamStats, awayTeamStats, homePlayerSeasonStats, awayPlayerSeasonStats] = await Promise.all([
    homeTeamBdlId ? ballDontLieService.getTeamSeasonStats('baseball_mlb', { teamId: homeTeamBdlId, season }).catch(() => null) : null,
    awayTeamBdlId ? ballDontLieService.getTeamSeasonStats('baseball_mlb', { teamId: awayTeamBdlId, season }).catch(() => null) : null,
    homeTeamBdlId ? ballDontLieService.getMlbPlayerSeasonStats({ teamId: homeTeamBdlId, season }).catch(() => []) : Promise.resolve([]),
    awayTeamBdlId ? ballDontLieService.getMlbPlayerSeasonStats({ teamId: awayTeamBdlId, season }).catch(() => []) : Promise.resolve([]),
  ]);
  console.log(`[Scout Report] MLB team season stats: ${homeTeam}=${homeTeamStats ? 'loaded' : 'N/A'}, ${awayTeam}=${awayTeamStats ? 'loaded' : 'N/A'}`);
  console.log(`[Scout Report] MLB player season stats: ${homeTeam}=${homePlayerSeasonStats.length}, ${awayTeam}=${awayPlayerSeasonStats.length}`);

  // ═══════════════════════════════════════════════════════════════════
  // LAST 4 GAME BOX SCORES (BDL per-game stats for L1-L4 recaps)
  // ═══════════════════════════════════════════════════════════════════
  // homeRecentGames / awayRecentGames come from MLB Stats API (gamePk-keyed).
  // BDL box stats need BDL game IDs — different namespace. Prior code did
  // `(homeRecentGames || []).slice(-4).map(g => g.id)` which is always
  // undefined → filter(Boolean) emptied the array → zero box stats fetched.
  // Pull BDL games for each team (1 cached call each) and build a
  // date→BDL-id lookup so we can resolve real BDL ids for the recap loop.
  // Source these from the season game index, NOT getGames — the BDL games
  // endpoint ignores start_date/end_date and returns the franchise's earliest
  // rows (2001 games, found Jul 22 2026), which zeroed this whole section.
  // The index is the same source the stat routers use (cached 60 min).
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const seasonIndex = (homeTeamBdlId || awayTeamBdlId)
    ? await ballDontLieService.getMlbSeasonGameIndex(season).catch(() => new Map())
    : new Map();
  const indexGamesFor = (bdlTeamId) => {
    if (!bdlTeamId) return [];
    const out = [];
    for (const [id, g] of seasonIndex.entries()) {
      if (g.homeId !== bdlTeamId && g.awayId !== bdlTeamId) continue;
      // ET date, matching MLB Stats API officialDate — the UTC slice put every
      // West-Coast night game on the wrong day and broke the score-pair join.
      const date = toEtDate(g.date);
      if (date < thirtyDaysAgoIso || date > todayIso) continue;
      if (!/final/i.test(String(g.status || ''))) continue;
      out.push({ id, date, homeRuns: g.homeRuns, awayRuns: g.awayRuns });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  };
  const homeBdlGames = indexGamesFor(homeTeamBdlId);
  const awayBdlGames = indexGamesFor(awayTeamBdlId);
  // Resolve one MLB Stats API game to its BDL id within ONE team's candidate
  // list: same official date AND same final score pair. Exact even for
  // doubleheaders (two games that day = two different score pairs). The old
  // join was a date map SHARED across both teams — any day both teams played,
  // one game silently overwrote the other and every recap downstream carried
  // the wrong box score (found Jul 22 2026: Yankees recaps showing Pirates@
  // Guardians box lines labeled "vs Dodgers").
  const resolveBdlId = (mlbGame, candidates) => {
    const date = String(mlbGame?.officialDate || mlbGame?.gameDate || '').slice(0, 10);
    const hs = mlbGame?.teams?.home?.score;
    const as = mlbGame?.teams?.away?.score;
    const sameDay = (candidates || []).filter(c => c.date === date);
    const exact = sameDay.find(c => c.homeRuns === hs && c.awayRuns === as);
    return (exact || (sameDay.length === 1 ? sameDay[0] : null))?.id ?? null;
  };
  const collectBdlIds = (games, candidates) => (games || [])
    .slice(-4)
    .map(g => resolveBdlId(g, candidates))
    .filter(id => id != null);
  const allBoxGameIds = [...new Set([
    ...collectBdlIds(homeRecentGames, homeBdlGames),
    ...collectBdlIds(awayRecentGames, awayBdlGames),
  ])];
  const recentBoxStats = allBoxGameIds.length > 0
    ? await ballDontLieService.getMlbGameStats({ gameIds: allBoxGameIds }).catch(e => { console.warn(`[Scout Report] BDL box stats error: ${e.message}`); return []; })
    : [];
  // Box stats keyed by their own BDL game id; recaps resolve per game via
  // resolveBdlId and then filter to the team's OWN players (records carry
  // team_name — without the filter every recap listed both teams' lines).
  const recentBoxStatsById = new Map();
  for (const s of recentBoxStats) {
    const list = recentBoxStatsById.get(s.game_id) || [];
    list.push(s);
    recentBoxStatsById.set(s.game_id, list);
  }
  console.log(`[Scout Report] Box stats: ${recentBoxStats.length} player records for ${allBoxGameIds.length} games.`);

  // BULLPEN USAGE, LAST 3 GAMES (Jul 7 — founder: "not sure Gary is fully aware
  // of bullpen usage"). The 3-day picture lived only behind a fetch token the
  // research may or may not call; the report itself showed yesterday alone.
  // Compute it here from the same MLB Stats API boxscores so who-threw-when
  // (with pitch counts — the real workload signal) is ALWAYS on the desk.
  // (Inner BULLPEN USAGE block REMOVED — Aug 5 hunt: it duplicated the lab's
  // BULLPEN WORKLOAD section, which now carries ER + decision notes per
  // appearance. One pen-recency surface, the richer one.)

  // ═══════════════════════════════════════════════════════════════════
  // PROBABLE PITCHERS — current-season (BDL) only, no career fallback
  // ═══════════════════════════════════════════════════════════════════
  // Match probable pitchers (from MLB Stats API) into BDL season stats by name.
  // BDL uses its own player IDs, but full names are stable across both sources.
  const findBdlPitcherByName = (statsArray, fullName) => {
    if (!fullName) return null;
    // foldName (Aug 5, the Luzardo outage): accents/punctuation/case folded on
    // BOTH sides — "Jesús" from the probables feed must match BDL's "Jesus".
    const target = foldName(fullName);
    return statsArray.find(s => {
      const candidate = foldName(s.player?.full_name || `${s.player?.first_name || ''} ${s.player?.last_name || ''}`);
      return candidate === target;
    }) || null;
  };

  const fetchGameStory = async (gamePk) => {
    if (!gamePk) return null;
    // UNTRIMMED (founder ruling, Aug 26 — "why are we trimming?"): 9 of 15
    // recaps on a measured slate ran past the old 4,000-char cap, and the cut
    // landed on the END of the article — where writers put the quotes and the
    // what-it-means. Stories now arrive whole. Cache key bumped (v2) so
    // week-old truncated bodies cannot outlive the ruling.
    return await getCachedOrFetch(`mlb_game_story_v2_${gamePk}`, async () => {
      const resp = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/content`);
      if (!resp.ok) return null;
      const j = await resp.json();
      const rec = j?.editorial?.recap?.mlb || j?.editorial?.wrap?.mlb || null;
      if (!rec?.body) return null;
      const clean = String(rec.body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return { headline: rec.headline || '', body: clean };
    }, 7 * 24 * 60).catch(() => null);
  };

  const sentenceTrim = (body, cap) => {
    const str = String(body || '');
    if (str.length <= cap) return str;
    const cut = str.slice(0, cap);
    // Whole sentences only (founder law, Aug 12 — a lede ending "with a
    // homer a" reached a live desk): any sentence boundary wins; the old
    // half-cap threshold fell through to a mid-word hard cut. Word boundary
    // is the last resort, never mid-word.
    const end = cut.lastIndexOf('. ');
    if (end > 0) return cut.slice(0, end + 1);
    const sp = cut.lastIndexOf(' ');
    return sp > 0 ? cut.slice(0, sp) : cut;
  };

  let probablePitchersSection = 'Probable pitchers not yet announced.';
  const pitcherStats = {};
  const pitcherArcData = {}; // per-side career/season provenance for the SAMPLE CONTEXT flags
  // gamePk -> "Pitcher Name (Team)" for every start story printed in the
  // probables block — the team lanes point at these instead of reprinting.
  const pitcherStoryPks = new Map();

  if (probablePitchersData) {
    const parts = [];
    // THE PRESS, PER STARTER (founder GO, Aug 10 — fan-parity for the arms):
    // how each starter's recent work has been DESCRIBED this week, as
    // written — the layer a stat ledger cannot carry ("how he looked").
    // Both searches fire in parallel before the loop; the freshness
    // protocol rides along inside openaiWebSearch; an empty or "no
    // coverage" result prints nothing.
    const pressBySide = {};
    for (const [side, label] of [['away', awayTeam], ['home', homeTeam]]) {
      const p = probablePitchersData[side];
      if (!p?.fullName) continue;
      pressBySide[side] = openaiWebSearch(
        `MLB: how has ${p.fullName} (${label} starting pitcher) been described this week — ` +
        `who he is in the club's plans as written (top prospect, established ace, journeyman filler, converted reliever — his pedigree and what's expected of him), ` +
        `how he looked in his most recent start and his recent starts as reported (command, stuff, velocity, how hitters handled him), ` +
        `any mechanical, workload, or health notes as written, and manager or coach comments about him. ` +
        `Do NOT relay box-score numbers (innings, runs, strikeouts, pitch counts) — the official line is already on file; bring only the descriptions, quotes, and evaluations around it. ` +
        `Use beat reporters and major outlets (MLB.com, team beats, ESPN, The Athletic, SNY-class regionals); skip fan blogs and aggregators. ` +
        `Reported descriptions only, attributed to their sources. No picks, no predictions. ` +
        `Start directly with the reporting, most recent start first. Never narrate your process, mention these instructions, or write any preamble — the first words of your answer must already be reporting.`,
        { maxTokens: 900 }
      ).then(r => String(r?.data || '').trim()).catch(() => '');
    }
    for (const [side, label] of [['away', awayTeam], ['home', homeTeam]]) {
      const pitcher = probablePitchersData[side];
      let seasonLineIdx = null;
      if (!pitcher?.fullName) {
        parts.push(`${label}: TBD`);
        continue;
      }
      const pool = side === 'home' ? homePlayerSeasonStats : awayPlayerSeasonStats;
      const bdlRow = findBdlPitcherByName(pool, pitcher.fullName);
      if (bdlRow && (bdlRow.pitching_gs || 0) > 0) {
        const w = bdlRow.pitching_w ?? 0;
        const l = bdlRow.pitching_l ?? 0;
        const era = bdlRow.pitching_era != null ? bdlRow.pitching_era.toFixed(2) : '—';
        const whip = bdlRow.pitching_whip != null ? bdlRow.pitching_whip.toFixed(2) : '—';
        const k = bdlRow.pitching_k ?? 0;
        const ip = bdlRow.pitching_ip != null ? bdlRow.pitching_ip.toFixed(1) : '—';
        const gs = bdlRow.pitching_gs;
        // BB on the season line (founder, Aug 5 PM: "certain pitchers
        // naturally walk a lot of guys" — a team-grain fact, naked).
        const bbSeason = bdlRow.pitching_bb ?? null;
        seasonLineIdx = parts.length;
        parts.push(`${label}: ${pitcher.fullName} — ${w}-${l}, ${era} ERA, ${whip} WHIP, ${k} K${bbSeason != null ? `, ${bbSeason} BB` : ''}, ${ip} IP (${gs} ${season} starts)`);
        pitcherStats[side] = { name: pitcher.fullName, ...bdlRow };
      } else if (bdlRow) {
        // Lookup SUCCEEDED, zero starts — a true rookie/reliever fact.
        parts.push(`${label}: ${pitcher.fullName} — no ${season} starts yet`);
        pitcherStats[side] = { name: pitcher.fullName };
      } else {
        // Lookup FAILED — never assert a negative the data didn't establish
        // (Jul 29 + Aug 4: "Luzardo — no 2026 starts yet" printed off a name
        // mismatch while THE WORLD called him elite two sections up).
        parts.push(`${label}: ${pitcher.fullName} — season stats unavailable in source`);
        pitcherStats[side] = { name: pitcher.fullName };
      }

      // Always-on SP detail: velocity arsenal + platoon splits + contact quality.
      // These are the stat classes rationales kept inventing when the data
      // wasn't in context — surface them (or an explicit NOT AVAILABLE) for
      // every pick so the brain never has to fill the gap from memory.
      try {
        const mlbamId = pitcher.id;
        // (Career-vs-opponent fetch REMOVED — founder ruling, Aug 10: prior-
        // season numbers off the desk.)
        const [arsenal, platoon, contact, seasonPitching, lastStarts, monthSplits, careerProfile, situational] = await Promise.all([
          getPitcherArsenal(mlbamId ?? pitcher.fullName, season).catch(() => null),
          mlbamId ? getPitcherPlatoonSplits(mlbamId, season).catch(() => null) : Promise.resolve(null),
          getPitcherStatcastProfile(mlbamId ?? pitcher.fullName, season).catch(() => null),
          mlbamId ? getPlayerSeasonStats(mlbamId, season, 'pitching').catch(() => null) : Promise.resolve(null),
          mlbamId ? getPitcherLastStarts(mlbamId, season, 6).catch(() => []) : Promise.resolve([]),
          mlbamId ? getPitcherMonthSplits(mlbamId, season).catch(() => []) : Promise.resolve([]),
          mlbamId ? getPitcherCareerProfile(mlbamId).catch(() => null) : Promise.resolve(null),
          // Situational splits (founder GO, Aug 18 — the checklist asked, no
          // data answered): first inning, ahead/behind in count.
          // (xERA was here for one night — founder ruling Aug 19 re-affirmed
          // the Aug 10 purge: modeled ERA estimators are off the desk. The
          // ERA's context arrives as decomposition — ledger, flows, contact —
          // never as another model's number.)
          mlbamId ? getPitcherSituationalSplits(mlbamId, season).catch(() => null) : Promise.resolve(null),
        ]);

        // THE ARC (Aug 4 2026, founder GO — the Bieber/Chandler autopsy):
        // the season's own decomposition, as quotable as the aggregate.
        // Career line REMOVED (founder ruling, Aug 10: no career stats or
        // prior-season numbers on the desk — "keep him current"; who-a-
        // pitcher-is now arrives as written via the press layer). The
        // careerProfile fetch stays: the layoff/rookie TRIGGERS read it,
        // they just print current-framed lines.
        {
          const ml = monthArcLine(monthSplits);
          if (ml) parts.push(`  ${ml}`);
          // Stash for the SAMPLE CONTEXT flags below. The full-season game
          // log is already cached by the lastStarts fetch, so the first-start
          // date costs no extra network.
          const allStarts = mlbamId ? await getPitcherLastStarts(mlbamId, season, 99).catch(() => []) : [];
          pitcherArcData[side] = { careerProfile, firstStartDate: allStarts[0]?.date ?? null, startDates: allStarts.map(g => g.date), starts: allStarts };
          // HOME/ROAD (founder GO, Aug 12 — the Baz miss): the season's venue
          // halves, printed for BOTH starters always — never again one
          // starter with a venue split and the other without.
          const hrl = homeRoadLine(allStarts);
          if (hrl) parts.push(`  ${hrl}`);
          // DAYS REST (founder GO, Aug 12; swingman fix Aug 19): the rest
          // line reads from his last APPEARANCE, not just his last start —
          // "23 days rest" for an arm who threw in relief three days ago is
          // a lie of omission (the Basso case). Both facts print when they
          // differ.
          const lastStartDate = allStarts.length ? allStarts[allStarts.length - 1]?.date : null;
          if (lastStartDate) {
            const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            const daysSince = (d) => Math.round((new Date(todayEt) - new Date(d)) / 86400000) - 1;
            const startRest = daysSince(lastStartDate);
            let lastAppDate = lastStartDate;
            try {
              const log = mlbamId ? await getPitcherGameLogRaw(mlbamId, season) : [];
              const apps = (log || []).filter((g) => g?.date && g.date < todayEt && g?.stat?.inningsPitched != null);
              if (apps.length) lastAppDate = apps[apps.length - 1].date;
            } catch { /* appearance refinement is additive */ }
            const appRest = daysSince(lastAppDate);
            if (Number.isFinite(startRest) && startRest >= 0 && startRest <= 60) {
              if (lastAppDate !== lastStartDate && Number.isFinite(appRest) && appRest >= 0) {
                parts.push(`  Rest: ${startRest} days since his last START — but he pitched in relief ${lastAppDate} (${appRest} day${appRest === 1 ? '' : 's'} ago)`);
              } else {
                parts.push(`  Rest: ${startRest} days since his last start`);
              }
            }
          }
          // Fuse the sample qualifier INTO the season line's parenthetical
          // (founder GO, Aug 10) — the aggregate can't be quoted without it.
          if (seasonLineIdx != null) {
            const qual = seasonLineQualifier({ season, firstStartDate: pitcherArcData[side].firstStartDate, starts: allStarts });
            if (qual) parts[seasonLineIdx] = parts[seasonLineIdx].replace(/ starts\)$/, ` starts${qual})`);
          }

          // WHO HE IS (founder GO, Aug 19 — the Jobe case): a short-sample
          // starter gets his identity as DATA, not just a tiny ERA — his
          // minor-league season this year, the call-up transaction as
          // officially written, and his role shape. The press layer still
          // carries the pedigree narrative; this is the numbers behind it.
          try {
            if (mlbamId && allStarts.length < 5) {
              // MiLB season line: first level with a real line, AAA then AA.
              let milb = null;
              for (const level of ['AAA', 'AA']) {
                milb = milbLineFromStatsReply(await getPitcherMilbSeasonRaw(mlbamId, season, level).catch(() => null), level);
                if (milb) break;
              }
              // The call-up, as officially written — season-wide transaction
              // scan for his name (recall/selection/purchase class only).
              let callUp = null;
              const sideTeamId = side === 'home' ? homeTeamId : awayTeamId;
              if (sideTeamId) {
                const seasonStart = `${season}-02-01`;
                const rows = await getMlbTransactions(sideTeamId, seasonStart, todayIso).catch(() => []);
                const lastName = String(pitcher.fullName || '').trim().split(' ').pop();
                const mine = (rows || []).filter((r) =>
                  String(r.description || '').includes(lastName)
                  && /recall|select|purchas|called up|contract|reinstat|activat|returned/i.test(String(r.description || '')));
                const last = mine[mine.length - 1];
                if (last) {
                  callUp = `${last.date}: ${last.description}`;
                  // A returnee's activation says when, not why — ride the
                  // placement's own reason clause when the IL is the story
                  // (the Jobe case: "Recovering from Tommy John surgery").
                  if (/injured list/i.test(last.description)) {
                    const placed = (rows || []).filter((r) =>
                      String(r.description || '').includes(lastName)
                      && /placed/i.test(String(r.description || ''))
                      && r.date < last.date);
                    const reason = String(placed[placed.length - 1]?.description || '').match(/injured list\.\s*(.+)$/i)?.[1];
                    if (reason) callUp += ` (${reason.trim()})`;
                  }
                }
              }
              // Role shape: relief outings beside the starts, from the same
              // cached official game log the usage devices read.
              let reliefCount = 0;
              try {
                const log = await getPitcherGameLogRaw(mlbamId, season);
                reliefCount = (log || []).filter((g) => g?.stat?.inningsPitched != null && !(g.stat?.gamesStarted > 0)).length;
              } catch { /* role shape optional */ }
              const line = whoHeIsLine({ seasonGs: allStarts.length, reliefCount, milb, callUp });
              if (line) parts.push(line);
            }
          } catch { /* identity line is additive — never sinks the starter block */ }
        }

        if (lastStarts.length) {
          // Start-by-start ledger w/ the TEAM's result in each (Jul 30,
          // founder: "team is 7-1 in his last 8" must arrive as the raw
          // ledger — dates, opponents, his line, who won — so the brain can
          // weigh WHY, not inherit a headline).
          // Opponent record beside every start (founder GO, Aug 18): the
          // ledger's "against whom" now says how good the whom was.
          const fmtStart = (g) => `${g.date} ${g.isHome ? 'vs' : '@'} ${g.opponent}${standingsRecordOf(g.opponent)}: ${g.ip}IP ${g.h}H ${g.er}ER ${g.k}K${g.bb ? ` ${g.bb}BB` : ''}${g.hr ? ` ${g.hr}HR` : ''}${g.pitches ? ` ${g.pitches}p` : ''}${g.win == null ? '' : g.win ? ' (team W)' : ' (team L)'}`;
          parts.push(`  Last ${lastStarts.length} start${lastStarts.length === 1 ? '' : 's'}: ${lastStarts.slice().reverse().map(fmtStart).join(' | ')}`);
          // The ledger's own arithmetic (Aug 4) — the recent window as a
          // number, as citable as the season figure above it.
          const rw = recentWindowLine(lastStarts, 3);
          if (rw) parts.push(`  ${rw}`);
          // MATCHUP RECENCY (founder GO, Aug 10 night): his latest start
          // against TONIGHT'S opponent, un-buried — full-season ledger, not
          // just the visible six.
          const mrl = matchupRecencyLine({
            oppNick: side === 'home' ? awayTeam : homeTeam,
            starts: pitcherArcData[side]?.starts || lastStarts,
            today: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
          });
          if (mrl) parts.push(`  ${mrl}`);
          // SEASON SHAPE (founder GO, Aug 12 — Plan A5): every start of the
          // season in one compact line — consistent vs yo-yo is VISIBLE, not
          // derivable. Date, opponent, IP/ER; the six above carry full detail.
          const seasonStarts = pitcherArcData[side]?.starts || [];
          if (seasonStarts.length > lastStarts.length) {
            const shape = seasonStarts
              .map((g) => `${String(g.date || '').slice(5)} ${g.isHome ? 'vs' : '@'}${String(g.opponent || '?').split(' ').pop()} ${g.ip}/${g.er}ER`)
              .join(' · ');
            parts.push(`  Season, start by start (date, opp, IP/ER): ${shape}`);
          }
          // SEASON VS TONIGHT'S OPPONENT (Plan A5): every meeting this year,
          // aggregated — the matchup-recency line above carries the latest.
          {
            const oppTeamName = side === 'home' ? awayTeam : homeTeam;
            const vsOpp = seasonStarts.filter((g) => clubMatches(g.opponent, oppTeamName));
            if (vsOpp.length) {
              let vOuts = 0, vEr = 0;
              let ok = true;
              for (const g of vsOpp) {
                const o = (() => { const n = parseFloat(g.ip); return Number.isFinite(n) ? Math.floor(n) * 3 + Math.round((n % 1) * 10) : null; })();
                if (o == null) { ok = false; break; }
                vOuts += o;
                vEr += Number(g.er) || 0;
              }
              if (ok && vOuts > 0) {
                const decided = vsOpp.filter((g) => g.win != null);
                const w = decided.filter((g) => g.win).length;
                const rec = decided.length ? `, team ${w}-${decided.length - w}` : '';
                parts.push(`  Vs ${side === 'home' ? awayTeam : homeTeam} this season: ${vsOpp.length} start${vsOpp.length === 1 ? '' : 's'}, ${((vEr * 27) / vOuts).toFixed(2)} ERA${rec} (${vsOpp.map((g) => g.date).join(', ')})`);
              }
            }
          }
          const decided = lastStarts.filter((g) => g.win != null);
          if (decided.length >= 3) {
            const w = decided.filter((g) => g.win).length;
            parts.push(`  Team in these ${decided.length} starts: ${w}-${decided.length - w}`);
          }
          // Innings arc (Jul 26): stretching out vs managed down, as bare IP.
          if (lastStarts.length >= 2) {
            parts.push(`  IP by start (oldest→newest): ${lastStarts.map(g => g.ip ?? '?').join(', ')}`);
          }
          // HIS STARTS, AS WRITTEN (founder GO Aug 10/12; rebuilt as FULL
          // ARTICLES on his Aug-26 ruling: "literally pull an article and
          // have Gary read the entire thing"). The last THREE starts each
          // carry their complete official game story — no starter-anchored
          // slicing, no cap: the old excerpt device amputated the article,
          // and the trimmed tail was where the quotes and the what-it-means
          // lived. Newest start first. A story printed here is remembered in
          // pitcherStoryPks so the team lanes below point at it instead of
          // reprinting it. Finals are immutable — the story cache makes
          // repeat desks ~$0.
          const storyStarts = lastStarts.slice(-3).filter((g) => g?.gamePk);
          const stories = await Promise.all(storyStarts.map(async (g) => ({
            g,
            st: await fetchGameStory(g.gamePk).catch(() => null),
          })));
          const withBody = stories.filter((s) => s.st?.body);
          for (const { g, st } of withBody.slice().reverse()) {
            pitcherStoryPks.set(g.gamePk, `${pitcher.fullName || 'the starter'} (${label})`);
            const flatBody = String(st.body).replace(/\s*\n+\s*/g, ' ');
            parts.push(`  His start ${g.date} ${g.isHome ? 'vs' : '@'} ${g.opponent}, as written${st.headline ? ` — ${st.headline}` : ''}: ${flatBody}`);
          }
        }
        // The week's press on him (fired pre-loop; see pressBySide above).
        // No editorial cap (founder, Aug 10: "doesn't make sense to cut off
        // context") — the 4000 bound is a runaway guard, not a trim.
        // Skip short/no-coverage returns — never print an empty shrug.
        // Meta-leak strip (Aug 10 smoke catch: "Let me write it up per the
        // instructions" reached a desk line): when the searcher narrates
        // before its first real section marker, start at the marker.
        let pressRaw = pressBySide[side] ? String(await pressBySide[side]) : '';
        const metaLead = pressRaw.slice(0, 600);
        if (/\b(per the instructions|compile the report|let me write|these instructions)\b/i.test(metaLead)) {
          const marker = pressRaw.search(/\*\*|^##\s/m);
          if (marker > 0) pressRaw = pressRaw.slice(marker);
        }
        pressRaw = pressRaw.replace(/^##\s*Reporting\s*/i, '');
        // REFUSAL ARTIFACTS (Aug 12 — the Baz block): a grounding session
        // that misreads the ask refuses in first person, and that refusal is
        // NOT press — it printed as a starter's coverage on a live desk.
        // Scaffold tokens or refusal phrasing anywhere in the return = drop
        // the whole block; a missing press line beats a corrupted one.
        if (/grounding_instructions|date_anchor|system-reminder|prompt.injection|<query>|\bI(?:'|’)?m not going to\b|\bI (?:won(?:'|’)?t|will not|refuse)\b|\bI(?:'|’)?m flagging\b|\bClaude\b/i.test(pressRaw)) {
          pressRaw = '';
        }
        // SENTENCE SNAP (Aug 12 — the desk showed "Kyle Leahy has been" as a
        // full press line): a return that arrives mid-sentence (upstream
        // token cut) is snapped back to its last complete sentence. A return
        // with NO complete sentence keeps its fragment — dropped signal is
        // worse than a trailing comma, and the search seam owns the real fix.
        const sentenceSnap = (s) => {
          const str = String(s || '').trim();
          if (!str || /[.!?]["'”]?$/.test(str)) return str;
          const end = str.lastIndexOf('. ');
          return end > 0 ? str.slice(0, end + 1) : str;
        };
        const press = pressRaw ? sentenceSnap(sentenceTrim(pressRaw.replace(/\s*\n+\s*/g, ' '), 4000)) : '';
        if (press && press.length > 60 && !/^(no|none|unverified)\b/i.test(press)) {
          parts.push(`  His recent work, as written: ${press}`);
        } else if (pressBySide[side]) {
          // A press lane that came back empty SAYS SO (Aug 26 — for weeks
          // this line silently vanished on search failures and the desk read
          // as stats-only): absence of coverage is not absence of news.
          parts.push('  His recent work, as written: (press retrieval returned nothing this run — treat as missing coverage, not as a quiet story)');
        }
        // TONIGHT'S-VENUE split (Jul 31 — the Lowder autopsy: the Hub
        // headlined his 3.09-at-home while the desk priced the 5.61 season
        // number; Gary must never be blind to a split we publish). Same
        // byArena source + subtraction math as the Hub's ballpark lane,
        // thirds-true, sample-gated (>=5 IP there, baseline >=10 IP).
        try {
          const bdlPid = bdlRow?.player?.id;
          if (bdlPid && venue && venue !== 'Unknown Venue') {
            const spSplits = await ballDontLieService.getMlbPlayerSplits({ playerId: bdlPid, season }).catch(() => null);
            const arena = (spSplits?.byArena || []).filter((a) => a?.era != null || a?.innings_pitched != null);
            const normV = (s) => String(s || '').toLowerCase();
            const vWord = normV(venue).split(/\s+/)[0];
            const venueRow = vWord ? arena.find((a) => normV(a.split_name).startsWith(vWord)) : null;
            const totalRow = arena.find((a) => normV(a.split_name).includes('all splits'));
            const outsOf = (ip) => {
              const n = parseFloat(ip);
              return Number.isFinite(n) ? Math.floor(n) * 3 + Math.round((n % 1) * 10) : null;
            };
            if (venueRow?.era != null && totalRow) {
              const vOuts = outsOf(venueRow.innings_pitched) ?? 0;
              const tOuts = outsOf(totalRow.innings_pitched) ?? 0;
              const baseOuts = tOuts - vOuts;
              const baseEr = (Number(totalRow.earned_runs) || 0) - (Number(venueRow.earned_runs) || 0);
              const baseEra = baseOuts > 0 ? (baseEr * 27) / baseOuts : null;
              if (vOuts >= 15) {
                const gp = venueRow.games_played != null ? `${venueRow.games_played} G, ` : '';
                parts.push(`  At ${venue}: ${Number(venueRow.era).toFixed(2)} ERA (${gp}${(vOuts / 3).toFixed(1)} IP)` +
                  (baseEra != null && baseOuts >= 30 ? ` — ${baseEra.toFixed(2)} everywhere else (${(baseOuts / 3).toFixed(1)} IP)` : ''));
              }
            }
          }
        } catch { /* venue split is additive — never sinks the starter block */ }

        if (arsenal?.pitches?.length) {
          parts.push(`  Arsenal velocity (Savant): ${arsenal.pitches.map(p => `${p.name} ${p.mph} mph`).join(' | ')}`);
        } else {
          parts.push(`  Arsenal velocity: NOT AVAILABLE — do not cite pitch speeds for ${pitcher.fullName}`);
        }

        // Swing-and-miss trend across his own recent starts (BDL Statcast
        // plate appearances, cached per finished game). Facts only.
        try {
          const whiffTrend = await computePitcherWhiffByStart({ pitcherId: bdlRow?.player?.id, season });
          if (whiffTrend) parts.push(`  Whiff% by start (oldest→newest): ${whiffTrend}`);
        } catch { /* trend optional */ }

        // PLATOON RECENCY (founder GO, Aug 18 — Tier 3 of the gap audit):
        // the season platoon split below has no time axis; these rows give it
        // one — per-start vs-hand results, who did the hitting last time out,
        // and each top pitch's own recent effectiveness. Same cached PA
        // payloads the whiff device reads; facts only.
        try {
          const bdlPid = bdlRow?.player?.id;
          if (bdlPid != null) {
            const startLabels = new Map();
            for (const g of pitcherArcData[side]?.starts || []) {
              const nick = String(g.opponent || '').split(' ').pop();
              startLabels.set(String(g.date || '').slice(0, 10), `${g.isHome ? 'vs' : '@'} ${nick}`);
            }
            const vsHand = await computeSpVsHandByStart({ pitcherBdlId: bdlPid, season, startLabels });
            if (vsHand?.lines?.length) {
              parts.push(`  Vs-hand by start:`);
              for (const line of vsHand.lines) parts.push(`    ${line}`);
              if (vsHand.damageLine) parts.push(`    ${vsHand.damageLine}`);
            }
            const chrono = await ballDontLieService.getMlbPlayerGameRowsChrono(bdlPid, season).catch(() => []);
            const recentIds = (chrono || []).filter((r) => r?.ip != null && parseFloat(r.ip) > 0).slice(-3).map((r) => r.game_id);
            const ptTrend = await computePitchTypeTrendByStart({ pitcherBdlId: bdlPid, gameIds: recentIds });
            if (ptTrend) parts.push(`  ${ptTrend}`);
          }
        } catch { /* recency layer is additive — never sinks the starter block */ }

        // HIS RUNS, AS THEY ARRIVED (founder GO, Aug 19 — ERA context is
        // decomposition, never another model's number): the official scoring
        // plays off HIM in each recent start — one big inning or a trickle,
        // homers or strung singles, in the feed's own words. Same cached
        // play-by-play the team recaps read.
        try {
          const starterLast = String(pitcher.fullName || '').trim().split(' ').pop();
          if (starterLast && lastStarts.length) {
            const runLines = [];
            let hrPlays = 0;
            let totalPlays = 0;
            for (const g of lastStarts) {
              if (!g?.gamePk) continue;
              const flow = await getScoringFlowAttributed(g.gamePk).catch(() => []);
              const mine = (flow || []).filter((l) => l.includes(`off ${starterLast}`));
              if (!mine.length) continue;
              totalPlays += mine.length;
              for (const l of mine) if (/homers|home run/i.test(l)) hrPlays++;
              runLines.push(`    ${g.date} ${g.isHome ? 'vs' : '@'} ${g.opponent}: ${mine.map((l) => l.replace(` — off ${starterLast}`, '')).join(' · ')}`);
            }
            if (runLines.length) {
              parts.push(`  His runs, as they arrived (every scoring play off him, recent starts):`);
              parts.push(...runLines);
              if (totalPlays >= 3) {
                parts.push(`    Across these starts: ${totalPlays} scoring plays off him — ${hrPlays} via home runs, ${totalPlays - hrPlays} without leaving the yard`);
              }
            }
          }
        } catch { /* decomposition is additive */ }

        if (platoon?.vsLeft || platoon?.vsRight) {
          const fmt = (p) => p ? `${p.avg ?? '—'} AVG / ${p.ops ?? '—'} OPS, ${p.hr ?? '—'} HR (${p.ab ?? '—'} AB)` : 'no data';
          parts.push(`  Platoon (opp batting): vs LHB ${fmt(platoon.vsLeft)} | vs RHB ${fmt(platoon.vsRight)}`);
        } else {
          parts.push(`  Platoon (vs LHB/RHB): NOT AVAILABLE — do not characterize ${pitcher.fullName}'s platoon splits`);
        }

        const goao = seasonPitching?.groundOutsToAirouts;
        if (contact && (contact.brlPercent != null || contact.ev95Percent != null)) {
          const bits = [];
          if (contact.brlPercent != null) bits.push(`Barrel% allowed ${contact.brlPercent}%`);
          if (contact.ev95Percent != null) bits.push(`Hard-hit% allowed ${contact.ev95Percent}%`);
          if (contact.battedBallEvents != null) bits.push(`${contact.battedBallEvents} BBE`);
          if (goao != null) bits.push(`GO/AO ${goao}`);
          parts.push(`  Contact quality allowed: ${bits.join(', ')}`);
        } else {
          parts.push(`  Contact quality allowed: NOT AVAILABLE — do not characterize ${pitcher.fullName}'s batted-ball profile`);
        }

        // First inning (statsapi statSplits). Ahead/behind-count splits were
        // dropped Aug 19 (founder: too granular — context stays high-level).
        if (situational?.firstInning?.era != null) {
          parts.push(`  First inning: ${situational.firstInning.era} ERA (${situational.firstInning.ip} IP)`);
        }
        // Running game vs him (season): completes the chain the catcher
        // shelf starts — pitcher hold, catcher arm, team speed.
        {
          const sb = seasonPitching?.stolenBases;
          const cs = seasonPitching?.caughtStealing;
          if (sb != null && cs != null && (Number(sb) + Number(cs)) > 0) {
            parts.push(`  Running game vs him: ${sb}-for-${Number(sb) + Number(cs)} stealing this season`);
          }
        }
      } catch (e) {
        console.warn(`[Scout Report] SP detail enrichment failed for ${pitcher.fullName}: ${e.message}`);
      }
    }
    probablePitchersSection = parts.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // SMALL SAMPLE FLAGS — surface metadata that invalidates "season" stats
  //   - Pitchers who changed teams mid-season (their splits include data
  //     from a different team, ballpark, and catcher)
  //   - Pitchers making their home debut at the current ballpark
  //
  // Layer 1 awareness: lay out the facts. Do NOT instruct Gary how to weight
  // them — he'll read the count and apply normal judgment.
  // ═══════════════════════════════════════════════════════════════════
  const smallSampleFlags = [];
  await Promise.all([['home', homeTeam, homeTeamBdlId, homeBdlTeam], ['away', awayTeam, awayTeamBdlId, awayBdlTeam]].map(async ([side, label, currentTeamBdlId, bdlTeam]) => {
    const pitcher = probablePitchersData?.[side];
    const stats = pitcherStats?.[side];
    // ARC SAMPLE FLAGS (Aug 4 2026, the Bieber/Chandler autopsy): layoff
    // returns and first-real-season arms — the two cases where a season
    // aggregate quietly spans a different pitcher. Career profile comes from
    // the starter block's stash (MLBAM), so no BDL id is required and these
    // run before the BDL-dependent flags below. Provenance facts only.
    try {
      const arc = pitcherArcData[side];
      if (pitcher?.fullName && arc?.careerProfile) {
        const seasons = arc.careerProfile.seasons || [];
        const seasonRow = seasons.find(s => Number(s.season) === season);
        const early = earlyCareerFlag({
          name: pitcher.fullName, label,
          careerGs: arc.careerProfile.career?.gs, seasonGs: seasonRow?.gs,
        });
        if (early) smallSampleFlags.push(early);
        const layoff = longLayoffFlag({
          name: pitcher.fullName, label, seasons, season,
          firstStartDate: arc.firstStartDate,
        });
        if (layoff) smallSampleFlags.push(layoff);
        const gap = midSeasonGapFlag({
          name: pitcher.fullName, label, season,
          startDates: arc.startDates,
        });
        if (gap) smallSampleFlags.push(gap);
        // DISTORTION FLAG (founder GO, Aug 5 PM): one start moving the
        // starts-only ERA >= 0.75 prints both numbers, the game named, and
        // that game's official story — context, not another naked rate.
        const dist = singleStartDistortion(arc.starts);
        if (dist) {
          const g = dist.worst;
          const ipNum = parseFloat(g.ip);
          // Mid-inning exit only — a whole-number IP means he finished the
          // frame, and "pulled in the Nth" would then be a guess.
          const frac = Number.isFinite(ipNum) && Math.round((ipNum % 1) * 10) > 0;
          const exitN = Math.floor(ipNum || 0) + 1;
          const ordWord = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
          let line = `${pitcher.fullName} (${label}): across his ${dist.startCount} starts — ${dist.base.toFixed(2)} ERA, ${dist.without.toFixed(2)} outside ${g.date} ${g.isHome ? 'vs' : '@'} ${g.opponent} (${g.ip} IP, ${g.er} ER${g.bb ? `, ${g.bb} BB` : ''}${frac ? ` — pulled in the ${ordWord(exitN)}` : ''}).`;
          if (g.gamePk) {
            const story = await fetchGameStory(g.gamePk).catch(() => null);
            if (story?.body) line += `\n  That game, as written: ${sentenceTrim(story.body, 450)}`;
          }
          smallSampleFlags.push(line);
        }
      }
    } catch { /* arc flags are additive — never sink the section */ }
    const pitcherId = stats?.player?.id;
    if (!pitcher?.fullName || !pitcherId) return;

    // Chrono rows, not raw getMlbGameStats: /mlb/v1/stats rows are unordered,
    // include spring training, and carry no team ids (team_name only) — the
    // raw derivation here flagged EVERY starter as "first start for [club]"
    // on all desks Aug 6-9 and inflated start counts with spring rows.
    let rows;
    try {
      rows = await ballDontLieService.getMlbPlayerGameRowsChrono(pitcherId, season);
    } catch (_) { return; }
    const changeFlags = teamChangeFlags({
      name: pitcher.fullName,
      label,
      season,
      clubId: currentTeamBdlId,
      clubNames: [
        bdlTeam?.display_name,
        bdlTeam?.full_name,
        [bdlTeam?.location, bdlTeam?.name].filter(Boolean).join(' '),
      ],
      rows,
    });
    if (changeFlags.length) {
      // THE MOVE, AS WRITTEN (founder GO, Aug 19): a mid-season team change
      // carries its official transaction — trade, claim, or signing — so
      // "his numbers were built for another club" travels with the why. The
      // press layer carries the move's reported shape on top.
      try {
        const teamIdForTx = side === 'home' ? homeTeamId : awayTeamId;
        if (teamIdForTx) {
          const txRows = await getMlbTransactions(teamIdForTx, `${season}-02-01`, todayIso).catch(() => []);
          const lastNm = String(pitcher.fullName || '').trim().split(' ').pop();
          const moves = (txRows || []).filter((r) => String(r.description || '').includes(lastNm)
            && /trade|claim|acquir|sign/i.test(String(r.description || '')));
          const mv = moves[moves.length - 1];
          if (mv) changeFlags[changeFlags.length - 1] += `\n  The move, as written: ${mv.date}: ${mv.description}`;
        }
      } catch { /* move line is additive */ }
      smallSampleFlags.push(...changeFlags);
    }
  })).catch(() => {});

  const smallSampleFlagsSection = smallSampleFlags.length
    ? smallSampleFlags.join('\n')
    : 'No mid-season team changes or home debuts for tonight\'s starting pitchers.';

  // ═══════════════════════════════════════════════════════════════════
  // STANDINGS & SEASON SHAPE (removed Aug 5, RESTORED by founder order
  // Aug 18: "bring back standings" — with his records-need-context law:
  // every record prints beside the desk's ledgers and stories that carry
  // what actually happened). Division tables from the already-fetched BDL
  // standings; streak/ranks/run differential and the bettor split records
  // (vs LH/RH starters, one-run, extra innings) FETCHED from the official
  // standings feed — never derived. Month arcs + tonight's-spot lines
  // compute from the cached season index.
  // ═══════════════════════════════════════════════════════════════════
  let standingsSection = '';
  try {
    const ctx = await getMlbStandingsContext(season).catch(() => new Map());
    const ctxLine = (mlbamId, teamName) => {
      const c = mlbamId != null ? ctx.get(mlbamId) : null;
      if (!c) return null;
      const bits = [];
      if (c.divisionRank) bits.push(`division rank ${c.divisionRank}${c.gamesBack && c.gamesBack !== '-' ? ` (${c.gamesBack} GB)` : ''}`);
      if (c.wildCardGamesBack && c.wildCardGamesBack !== '-') bits.push(`wild card ${c.wildCardGamesBack} back`);
      if (c.streak) bits.push(`streak ${c.streak}`);
      if (c.runDifferential != null) bits.push(`run differential ${c.runDifferential > 0 ? '+' : ''}${c.runDifferential} (${c.runsScored} scored / ${c.runsAllowed} allowed, ${c.gamesPlayed} G)`);
      const s = c.splits || {};
      const rec = [];
      if (s.left) rec.push(`vs LH starters ${s.left}`);
      if (s.right) rec.push(`vs RH starters ${s.right}`);
      if (s.oneRun) rec.push(`one-run games ${s.oneRun}`);
      if (s.extraInning) rec.push(`extra innings ${s.extraInning}`);
      const line1 = `${teamName}: ${bits.join(' · ')}`;
      return rec.length ? `${line1}\n  Records: ${rec.join(' | ')}` : line1;
    };
    const divisionOf = (teamName) => findStandingsRow(bdlStandings, teamName)?.division_name || null;
    const divTable = (divName) => {
      const rows = divName ? (bdlStandings || []).filter((t) => t.division_name === divName) : [];
      if (!rows.length) return null;
      const sorted = rows.slice().sort((a, b) => (b.wins || 0) - (a.wins || 0));
      return `--- ${divName} ---\n${sorted.map((t) =>
        `${t.team?.display_name || t.team?.full_name || '?'}: ${t.wins}-${t.losses} | L10 ${t.last_ten_games || '—'} | Streak ${t.streak || '—'} | GB ${t.division_games_behind ?? t.games_behind ?? '—'}`).join('\n')}`;
    };
    const parts = [];
    const ctxLines = [ctxLine(homeTeamId, homeTeam), ctxLine(awayTeamId, awayTeam)].filter(Boolean);
    if (ctxLines.length) parts.push(ctxLines.join('\n'));
    for (const d of [...new Set([divisionOf(homeTeam), divisionOf(awayTeam)].filter(Boolean))]) {
      const t = divTable(d);
      if (t) parts.push(t);
    }
    const monthArcs = [
      [homeTeamBdlId, homeTeam],
      [awayTeamBdlId, awayTeam],
    ].map(([id, nm]) => { const a = computeTeamMonthArc(seasonIndex, id); return a ? `${nm} ${a}` : null; }).filter(Boolean);
    if (monthArcs.length) parts.push(`Season shape:\n${monthArcs.join('\n')}`);
    // (The tonight's-spot lines moved to THE SITUATION, Aug 19 — one home.)
    standingsSection = parts.join('\n\n');
  } catch { standingsSection = ''; }

  // ═══════════════════════════════════════════════════════════════════
  // L1-L4: INDIVIDUAL GAME RECAPS (what actually happened — narrative box scores)
  // L5/L10: STATISTICAL AGGREGATES (trend lines)
  // ═══════════════════════════════════════════════════════════════════
  // THE WIRE (Jul 26 2026): the official MLB.com game story for each team's
  // most recent final — the AP-style factual narrative, sourced as DATA from
  // the Stats API content endpoint (no search). Finals are immutable → 7d cache.
  // (fetchGameStory hoisted above the starter block — the distortion flag uses it too.)
  // THE WEEK AS WRITTEN (founder GO, Aug 5 2026): the last THREE finals per
  // team — most recent story in full, the two before as ledes — plus any
  // earlier games of the current head-to-head series. A five-game skid stops
  // being five bare "L"s: the arc arrives in writer prose. A game the two
  // teams shared prints once, labeled "These two".
  // (sentenceTrim hoisted above the starter block.)
  const wireGamesFor = (games, oppNick) => {
    const finals = (games || []).filter(g => g?.gamePk);
    const picked = new Map();
    for (const g of finals.slice(-3)) picked.set(g.gamePk, g);
    // Trailing consecutive finals vs tonight's opponent = this series so far.
    for (let i = finals.length - 1; i >= 0; i--) {
      const g = finals[i];
      const names = [g.teams?.home?.team?.name, g.teams?.away?.team?.name];
      if (!names.some((n) => clubMatches(n, oppNick))) break;
      picked.set(g.gamePk, g);
    }
    return [...picked.values()].sort((a, b) => new Date(a.gameDate || a.officialDate || 0) - new Date(b.gameDate || b.officialDate || 0));
  };
  const wireLabel = (g, teamNick) => {
    const homeSide = clubMatches(g.teams?.home?.team?.name, teamNick);
    const us = homeSide ? g.teams?.home : g.teams?.away;
    const them = homeSide ? g.teams?.away : g.teams?.home;
    const date = String(g.officialDate || g.gameDate || '').slice(0, 10);
    const wl = us?.score != null && them?.score != null ? ` (${us.score > them.score ? 'W' : 'L'} ${us.score}-${them.score})` : '';
    return `${teamNick}, ${date} ${homeSide ? 'vs' : '@'} ${them?.team?.name || '?'}${wl}`;
  };
  const homeWireGames = wireGamesFor(homeRecentGames, awayTeam);
  const awayWireGames = wireGamesFor(awayRecentGames, homeTeam);
  const wireStoryByPk = new Map();
  await Promise.all([...new Set([...homeWireGames, ...awayWireGames].map(g => g.gamePk))]
    .map(async (pk) => { const st = await fetchGameStory(pk); if (st) wireStoryByPk.set(pk, st); }));
  // THE WIRE DISSOLVED (founder GO, Aug 12: "the stories should exist where
  // they go" — the wire was only ever the fetch, never the home). Each
  // story now prints exactly once, in its natural place:
  //   most recent final per club  → LAST NIGHT, AS WRITTEN (in TONIGHT)
  //   head-to-head series games   → SERIES STATE, "This series, as written"
  //   other recent games          → that team's RECENT FORM game entry
  const headToHeadPks = new Set(
    homeWireGames.filter((g) => awayWireGames.some((a) => a.gamePk === g.gamePk)).map((g) => g.gamePk)
  );

  // LAST NIGHT, AS WRITTEN (founder GO, Aug 10): each club's most recent
  // final's official story rides IN TONIGHT with the decision inputs. A
  // shared game ("These two") prints once. Fail-open: no story, no line.
  const lastNightPks = new Set();
  const lastNightSection = (() => {
    const homeLast = homeWireGames[homeWireGames.length - 1] || null;
    const awayLast = awayWireGames[awayWireGames.length - 1] || null;
    const entries = [];
    // Untrimmed (founder ruling, Aug 26). A story already printed whole in
    // the probables block prints here as a pointer, never twice.
    const bodyOrPointer = (pk, story) => (pitcherStoryPks.has(pk)
      ? `(full story printed above, under ${pitcherStoryPks.get(pk)}'s starts as written)`
      : String(story.body).replace(/\s*\n+\s*/g, ' '));
    if (homeLast && awayLast && homeLast.gamePk === awayLast.gamePk) {
      const story = wireStoryByPk.get(homeLast.gamePk);
      if (story) {
        lastNightPks.add(homeLast.gamePk);
        entries.push(`These two, ${String(homeLast.officialDate || homeLast.gameDate || '').slice(0, 10)} — ${story.headline}\n${bodyOrPointer(homeLast.gamePk, story)}`);
      }
    } else {
      for (const [g, nick] of [[awayLast, awayTeam], [homeLast, homeTeam]]) {
        const story = g && wireStoryByPk.get(g.gamePk);
        if (story) {
          lastNightPks.add(g.gamePk);
          entries.push(`${wireLabel(g, nick)} — ${story.headline}\n${bodyOrPointer(g.gamePk, story)}`);
        }
      }
    }
    return entries.join('\n\n');
  })();

  // THIS SERIES, AS WRITTEN (founder GO, Aug 12): every earlier game of the
  // current head-to-head series, its official story in full, beside the
  // series' situational data. Last night's story already prints up front.
  const seriesStoriesBlock = (() => {
    const games = homeWireGames
      .filter((g) => headToHeadPks.has(g.gamePk) && !lastNightPks.has(g.gamePk))
      .sort((a, b) => new Date(a.gameDate || a.officialDate || 0) - new Date(b.gameDate || b.officialDate || 0));
    const entries = [];
    for (const g of games) {
      const story = wireStoryByPk.get(g.gamePk);
      if (!story?.body) continue;
      // Untrimmed (founder ruling, Aug 26); pointer when the probables block
      // already carries this game's story whole.
      const body = pitcherStoryPks.has(g.gamePk)
        ? `(full story printed above, under ${pitcherStoryPks.get(g.gamePk)}'s starts as written)`
        : String(story.body).replace(/\s*\n+\s*/g, ' ');
      entries.push(`These two, ${String(g.officialDate || g.gameDate || '').slice(0, 10)} — ${story.headline}\n${body}`);
    }
    return entries.join('\n\n');
  })();

  // THE BOX SCORES (founder, Aug 27: "i want the full box scores AND the
  // context that stats dont show which comes from the stories"): the
  // complete official box for last night's game(s) and every current-series
  // game, printed beside the stories those same games carry. Failure ≠
  // empty: a fetch that throws prints an honest-absence line.
  const boxScoresSection = await (async () => {
    const rows = [];
    const seen = new Set();
    for (const g of [...homeWireGames, ...awayWireGames]
      .filter((g) => lastNightPks.has(g.gamePk) || headToHeadPks.has(g.gamePk))
      .sort((a, b) => new Date(a.gameDate || a.officialDate || 0) - new Date(b.gameDate || b.officialDate || 0))) {
      if (seen.has(g.gamePk)) continue;
      seen.add(g.gamePk);
      rows.push(g);
    }
    const parts = [];
    for (const g of rows) {
      const date = String(g.officialDate || g.gameDate || '').slice(0, 10);
      const head = `${date} ${g.teams?.away?.team?.name ?? 'Away'} ${g.teams?.away?.score ?? ''} @ ${g.teams?.home?.team?.name ?? 'Home'} ${g.teams?.home?.score ?? ''}`.replace(/\s+/g, ' ').trim();
      try {
        const box = await getGameBoxScore(g.gamePk);
        const rendered = renderBoxScore(head, box);
        if (rendered) parts.push(rendered);
      } catch {
        parts.push(`BOX SCORE — ${head}: box score retrieval failed this run — treat as missing data, not an empty game.`);
      }
    }
    return parts.join('\n\n');
  })();

  // THE PEN, AS REPORTED — see the fetch above for the failure contract.
  const penPressSection = (() => {
    const rows = [];
    for (const [teamName, res] of [[awayTeam, awayPenPress], [homeTeam, homePenPress]]) {
      if (res?.failed) rows.push(`${teamName}: press retrieval returned nothing this run — treat as missing coverage, not a quiet story.`);
      else if (res?.text && res.text.trim()) rows.push(`${teamName}:\n${res.text.trim()}`);
    }
    return rows.join('\n\n');
  })();

  // (SITUATIONAL BOXSCORE, RECENT-SERIES-FORM, and FORM-ARC blocks retired
  // Aug 26 — founder duplication audit: RISP/LOB/pen-event compressions and
  // W-L restatements narrated games whose full official stories now print
  // beside them. The stories carry the how; the L5/L10 line and standings
  // carry the record book.)

  // THE TAPE prefetch: scoring flows for the recent games shown below —
  // one cached single-game fetch each (curated scoring_summary field).
  // A failed fetch just omits that game's flow line.
  // ATTRIBUTED FLOW (founder GO, Aug 12 — "off of who? in what inning?"):
  // the official play-by-play's scoring plays, pitcher named on every one.
  // Replaces the BDL curated summary, which carried no pitcher. Keyed by
  // gamePk — the recent-game rows are Stats API games already.
  const scoringFlowByPk = new Map();
  {
    const wanted = new Set();
    for (const g of [...(homeRecentGames || []).slice(-4), ...(awayRecentGames || []).slice(-4)]) {
      if (g?.gamePk) wanted.add(g.gamePk);
    }
    await Promise.all([...wanted].map(async (pk) => {
      try {
        const flow = await getScoringFlowAttributed(pk);
        if (flow && flow.length) scoringFlowByPk.set(pk, flow);
      } catch { /* tape optional */ }
    }));
  }

  // (OPPOSING-STARTER stat stamps retired Aug 26, hours after shipping —
  // founder duplication audit: each game's full official story now prints in
  // these entries and names the arm the offense faced, with the how.)
  let recentPerformanceSection = '';
  {
    const lastWord = (name) => name.toLowerCase().split(' ').pop();

    // Build per-game recap from BDL box stats + game result
    const formatGameRecap = (game, teamName, bdlCandidates) => {
      if (!game) return null;
      const isHome = clubMatches(game.teams?.home?.team?.name, teamName);
      const teamScore = isHome ? (game.teams?.home?.score ?? 0) : (game.teams?.away?.score ?? 0);
      const oppScore = isHome ? (game.teams?.away?.score ?? 0) : (game.teams?.home?.score ?? 0);
      const oppName = isHome ? (game.teams?.away?.team?.name || 'Opp') : (game.teams?.home?.team?.name || 'Opp');
      const wl = teamScore > oppScore ? 'W' : 'L';
      const date = (game.officialDate || game.gameDate || '').split('T')[0];
      const loc = isHome ? 'vs' : '@';

      // Per-game join (date + final score) into this TEAM's candidate list,
      // then keep only this team's own player lines.
      const bdlId = resolveBdlId(game, bdlCandidates);
      const gameStats = ((bdlId != null && recentBoxStatsById.get(bdlId)) || [])
        .filter(s => clubMatches(s.team_name, teamName));
      let spLine = '';
      let bullpenLines = [];
      let keyHitters = [];

      if (gameStats.length > 0) {
        // All pitchers sorted by IP (starter first, then bullpen in order of appearance)
        const pitchers = gameStats.filter(s => s.ip != null && parseFloat(s.ip) > 0)
          .sort((a, b) => parseFloat(b.ip || 0) - parseFloat(a.ip || 0));
        if (pitchers[0]) {
          const sp = pitchers[0];
          spLine = `SP: ${sp.player?.last_name || '?'} ${sp.ip}IP ${sp.p_hits || 0}H ${sp.er || 0}ER ${sp.p_k || 0}K ${sp.p_bb || 0}BB${sp.p_hr ? ' ' + sp.p_hr + 'HR' : ''}`;
        }
        // Full bullpen — every reliever who pitched
        for (const rp of pitchers.slice(1)) {
          bullpenLines.push(`${rp.player?.last_name || '?'} ${rp.ip}IP ${rp.er || 0}ER ${rp.p_k || 0}K`);
        }
        // (Per-game Batting: lines moved into the player blocks Aug 27 —
        // player-major replaces game-major; the game keeps its score, flow,
        // and story.)
      }

      let recap = `  ${date}: ${wl} ${teamScore}-${oppScore} ${loc} ${oppName}`;
      if (spLine) recap += `\n    ${spLine}`;
      if (bullpenLines.length) recap += `\n    Bullpen: ${bullpenLines.join(' | ')}`;
      // THE TAPE (Jul 26; pitcher-attributed Aug 12): how the runs actually
      // arrived — the official scoring plays, inning by inning, the pitcher
      // named on every one. Facts verbatim from the feed.
      const flow = game.gamePk != null ? scoringFlowByPk.get(game.gamePk) : null;
      if (flow && flow.length) recap += `\n    How it went: ${flow.slice(0, 14).join(' · ')}`;
      // AS WRITTEN, IN PLACE (founder GO, Aug 12 — the WIRE dissolves: "the
      // stories should exist where they go"): this game's official story
      // rides its own recap entry. One home per story: last night's lives in
      // TONIGHT, head-to-head games live in SERIES STATE.
      if (game.gamePk != null && !lastNightPks.has(game.gamePk) && !headToHeadPks.has(game.gamePk) && wireStoryByPk.has(game.gamePk)) {
        const st = wireStoryByPk.get(game.gamePk);
        // Untrimmed (founder ruling, Aug 26); pointer when the probables
        // block already carries this game's story whole.
        if (st?.body) {
          recap += pitcherStoryPks.has(game.gamePk)
            ? `\n    As written: (full story printed above, under ${pitcherStoryPks.get(game.gamePk)}'s starts as written)`
            : `\n    As written: ${String(st.body).replace(/\s*\n+\s*/g, ' ')}`;
        }
      }
      return recap;
    };


    const formatTeamRecent = (teamName, games, bdlCandidates) => {
      if (!games || games.length === 0) return `${teamName}: No recent games`;
      const lines = [`${teamName}:`];
      // L1-L4: individual game recaps (most recent first)
      const last4 = games.slice(-4).reverse();
      for (let i = 0; i < last4.length; i++) {
        const recap = formatGameRecap(last4[i], teamName, bdlCandidates);
        if (recap) lines.push(`  [L${i + 1}]${recap.trim().startsWith(' ') ? recap : ' ' + recap.trim()}`);
      }
      // L5/L10: aggregates. The bracket names the window ASKED for; the line
      // itself states how many games were actually available, so the two can
      // never quietly disagree. When the club has played 5 or fewer, the L10
      // window is the same games — print it once instead of twice.
      const l5 = aggregateRecentWindow(games, teamName, 5);
      if (l5) lines.push(`  [Last 5] ${l5}`);
      if (games.length > 5) {
        const l10 = aggregateRecentWindow(games, teamName, 10);
        if (l10) lines.push(`  [Last 10] ${l10}`);
      }
      return lines.join('\n');
    };

    recentPerformanceSection = [formatTeamRecent(homeTeam, homeRecentGames, homeBdlGames), formatTeamRecent(awayTeam, awayRecentGames, awayBdlGames)].join('\n\n');
  }

  // (THE MLB DEEP READ retired Aug 26, same day it shipped — founder's
  // articles-over-digests ruling: the statsapi recaps now arrive whole for
  // the team lanes AND each probable's last three starts, which is the
  // material those search lanes were summarizing. The per-starter press
  // search in the probables block remains the one search lane.)

  // ═══════════════════════════════════════════════════════════════════
  // THIS SERIES — WHO'S DOING WHAT (Jul 26 2026): per-player aggregates over
  // the current series' games, from the same box rows as RECENT FORM.
  // ═══════════════════════════════════════════════════════════════════
  // Series batters per team, hoisted for the SAT TODAY diff in the lineups
  // section below (founder GO, Aug 12 — the Cowser miss: the desk shows who
  // IS in tonight; who ISN'T is invisible unless someone diffs the series).
  // Per-batter series aggregates: feeds the lineup card's "this series" line
  // and the SAT TODAY diff. (The printed who's-doing-what tallies died
  // Aug 27 — founder: the facts ride the lineup card, the stories carry
  // the narrative.)
  const seriesBattersByTeam = new Map(); // folded full team name -> Map(lastName -> {ab,h,hr,rbi})
  let pairSeriesGameCount = 0;
  try {
    const pairGame = (g) => {
      const an = g?.teams?.away?.team?.name;
      const hn = g?.teams?.home?.team?.name;
      return (clubMatches(an, awayTeam) && clubMatches(hn, homeTeam))
        || (clubMatches(an, homeTeam) && clubMatches(hn, awayTeam));
    };
    const seriesGames = [];
    for (let i = (homeRecentGames || []).length - 1; i >= 0; i--) {
      if (pairGame(homeRecentGames[i])) seriesGames.unshift(homeRecentGames[i]);
      else break;
    }
    if (seriesGames.length >= 1 && recentBoxStatsById.size > 0) {
      // Keys = the box rows' FULL folded team names; lookups scan with
      // clubMatches because the desk's team labels are NICKNAMES ("Rays")
      // while BDL box rows carry full names ("Tampa Bay Rays") — and a
      // last-word bridge is exactly the shared-mascot bug (Aug 19 sweep).
      const perTeam = new Map(); // foldName(full team name) -> Map(player -> agg)
      for (const g of seriesGames) {
        const bdlId = resolveBdlId(g, homeBdlGames);
        const rows = (bdlId != null && recentBoxStatsById.get(bdlId)) || [];
        for (const r of rows) {
          // Keyed by the FULL folded name (Aug 19 shared-mascot sweep): a
          // last-word key merged both Sox clubs' hitters into one bucket.
          const tKey = foldName(r.team_name || '');
          if (!perTeam.has(tKey)) perTeam.set(tKey, new Map());
          const players = perTeam.get(tKey);
          const nm = r.player?.last_name || '?';
          if (!players.has(nm)) players.set(nm, { ab: 0, h: 0, hr: 0, rbi: 0, ip: 0, er: 0, k: 0 });
          const a = players.get(nm);
          a.ab += r.at_bats || 0; a.h += r.hits || 0; a.hr += r.hr || 0; a.rbi += r.rbi || 0;
          a.ip += parseFloat(r.ip || 0) || 0; a.er += r.er || 0; a.k += r.p_k || 0;
        }
      }
      pairSeriesGameCount = seriesGames.length;
      for (const [tKey, players] of perTeam.entries()) {
        const bats = new Map();
        for (const [nm, a] of players.entries()) if (a.ab > 0) bats.set(nm, a);
        if (bats.size) seriesBattersByTeam.set(tKey, bats);
      }
    }
  } catch (e) { console.warn(`[Scout Report] series-batters failed: ${e.message}`); }

  // ═══════════════════════════════════════════════════════════════════
  // (SITUATIONAL RECORDS section REMOVED — founder, Aug 5 PM: "record tells
  // the end result with zero context of what happened." After-a-loss /
  // after-a-win / finale / off-day season records are the exact species —
  // end-results as pattern bait. Its one recency clause (14-day run rates)
  // is covered by the run-shape lines and TEAM SEASON STATS' season R/G.)

  // ═══════════════════════════════════════════════════════════════════
  // RECENT RESULTS (last 10 games for each team — individual game scores)
  // ═══════════════════════════════════════════════════════════════════
  let recentResults = 'No recent games available.';
  {
    // Opponent records ride each row (founder, Aug 5 PM: "3-7 against WHOM —
    // you can tell a lot about the quality of a team even in the losses").
    // Shared helper (Aug 18): exact-name-first lookup — the old local copy
    // could hand a Sox team the other Sox team's record.
    const recordOf = standingsRecordOf;
    const formatRecentGames = (games, teamName) => {
      if (!games || games.length === 0) return `${teamName}: No recent games`;
      const lines = games.map(g => {
        const home = g.teams?.home;
        const away = g.teams?.away;
        const date = g.officialDate || g.gameDate?.split('T')[0] || '';
        const homeIsUs = clubMatches(home?.team?.name, teamName);
        const awayTag = homeIsUs ? recordOf(away?.team?.name) : '';
        const homeTag = homeIsUs ? '' : recordOf(home?.team?.name);
        return `  ${date}: ${away?.team?.name}${awayTag} ${away?.score || 0} @ ${home?.team?.name}${homeTag} ${home?.score || 0}`;
      });
      return `${teamName} (Last ${games.length}):\n${lines.join('\n')}`;
    };
    // RUN SHAPE (founder GO, Aug 5 PM): the two-week scoring truth with the
    // single outlier named — "the 18 runs is what it is; say who it was
    // against." One line per club, exclusions only past a full run per game.
    const runShape = (games, teamName) => {
      const rows = (games || []).filter(g => g?.teams);
      if (rows.length < 5) return null;
      const per = rows.map(g => {
        const homeSide = clubMatches(g.teams.home?.team?.name, teamName);
        const us = homeSide ? g.teams.home : g.teams.away;
        const them = homeSide ? g.teams.away : g.teams.home;
        return {
          f: Number(us?.score) || 0,
          a: Number(them?.score) || 0,
          date: (g.officialDate || g.gameDate || '').slice(0, 10),
          opp: them?.team?.name || '?',
          vs: homeSide ? 'vs' : '@',
        };
      });
      const n = per.length;
      const sumF = per.reduce((acc, x) => acc + x.f, 0);
      const sumA = per.reduce((acc, x) => acc + x.a, 0);
      const bits = [`${teamName}, last ${n}: scored ${(sumF / n).toFixed(1)}/gm, allowed ${(sumA / n).toFixed(1)}/gm`];
      const maxF = per.reduce((m, x) => (x.f > m.f ? x : m), per[0]);
      const outF = (sumF - maxF.f) / (n - 1);
      if (sumF / n - outF >= 1.0) bits.push(`— scoring ${outF.toFixed(1)} outside ${maxF.date} ${maxF.vs} ${maxF.opp} (${maxF.f} runs)`);
      const maxA = per.reduce((m, x) => (x.a > m.a ? x : m), per[0]);
      const outA = (sumA - maxA.a) / (n - 1);
      if (sumA / n - outA >= 1.0) bits.push(`— allowing ${outA.toFixed(1)} outside ${maxA.date} ${maxA.vs} ${maxA.opp} (${maxA.a} allowed)`);
      return bits.join(' ');
    };
    const parts = [];
    const shapes = [runShape(homeRecentGames, homeTeam), runShape(awayRecentGames, awayTeam)].filter(Boolean);
    if (shapes.length) parts.push(shapes.join('\n'));
    parts.push(formatRecentGames(homeRecentGames, homeTeam));
    parts.push(formatRecentGames(awayRecentGames, awayTeam));
    recentResults = parts.join('\n\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // REST & SCHEDULE SITUATION
  // ═══════════════════════════════════════════════════════════════════
  let restScheduleSection = '';
  {
    const formatRestSchedule = (teamName, recentGames, opponentName) => {
      if (!recentGames || recentGames.length === 0) {
        return `${teamName}: Schedule data unavailable`;
      }
      const parts = [];

      // Most recent completed game
      const lastGame = recentGames[recentGames.length - 1];
      const lastGameDate = lastGame?.officialDate || lastGame?.gameDate?.split('T')[0] || null;
      // ET date, never UTC (Jul 30): toISOString() rolls past midnight at
      // 8 PM ET, shifting every evening window's rest math one day high.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      // Days rest
      if (lastGameDate) {
        const diff = Math.floor((new Date(today) - new Date(lastGameDate)) / (1000 * 60 * 60 * 24));
        if (diff === 0) {
          parts.push('played today');
        } else if (diff === 1) {
          parts.push('0 days rest (played yesterday)');
        } else {
          parts.push(`${diff - 1} day(s) rest`);
        }
      } else {
        parts.push('rest data unavailable');
      }

      // Series detection — count consecutive recent games vs the same opponent (today's opponent)
      // Walk backwards through recent games to find how many were against today's opponent
      let seriesGames = 0;
      for (let i = recentGames.length - 1; i >= 0; i--) {
        const g = recentGames[i];
        if (clubMatches(g?.teams?.home?.team?.name, opponentName) || clubMatches(g?.teams?.away?.team?.name, opponentName)) {
          seriesGames++;
        } else {
          break;
        }
      }

      if (seriesGames > 0) {
        // They've already played seriesGames games vs this opponent recently, so today is game seriesGames+1
        parts.push(`Game ${seriesGames + 1} of series vs ${opponentName}`);
      } else {
        parts.push(`Game 1 of series vs ${opponentName}`);
      }

      return `${teamName}: ${parts.join('. ')}.`;
    };

    const homeRest = formatRestSchedule(homeTeam, homeRecentGames, awayTeam);
    const awayRest = formatRestSchedule(awayTeam, awayRecentGames, homeTeam);
    restScheduleSection = `${homeRest}\n${awayRest}`;
  }

  // (HP umpire line built then REMOVED same hour — founder, Aug 12: "the
  // umpire is not going to be a factor to drive a bet on. That's insanity.")

  // (LAST GAME inning-detail block retired Aug 26 — founder duplication
  // audit: it restated the [L1] recent-form entry beside the same game's
  // full official story.)

  // ═══════════════════════════════════════════════════════════════════
  // WEATHER / VENUE CONTEXT
  // ═══════════════════════════════════════════════════════════════════
  let weatherSection = '';
  if (probablePitchersData?.weather) {
    const w = probablePitchersData.weather;
    weatherSection = `Weather: ${w.condition || 'Unknown'}, ${w.temp || '—'}°F, Wind: ${w.wind || 'Unknown'}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ODDS (BDL structured odds preferred, Gemini Grounding fallback)
  // ═══════════════════════════════════════════════════════════════════
  let oddsSection = '';
  // Use structured BDL odds if available on the game object
  if (game.moneyline_home != null || game.moneyline_away != null) {
    const lines = [];
    if (game.moneyline_home != null && game.moneyline_away != null) {
      lines.push(`Moneyline: ${homeTeam} ${game.moneyline_home > 0 ? '+' : ''}${game.moneyline_home} / ${awayTeam} ${game.moneyline_away > 0 ? '+' : ''}${game.moneyline_away}`);
    }
    if (game.spread_home != null) {
      lines.push(`Run Line: ${homeTeam} ${game.spread_home > 0 ? '+' : ''}${game.spread_home} (${game.spread_home_odds || ''}) / ${awayTeam} ${game.spread_away > 0 ? '+' : ''}${game.spread_away} (${game.spread_away_odds || ''})`);
    }
    oddsSection = lines.join('\n');
    console.log(`[Scout Report] MLB: Using structured BDL odds`);
  } else {
    oddsSection = 'No odds data available.';
  }

  // ═══════════════════════════════════════════════════════════════════
  // CONFIRMED LINEUPS — BDL first; the official MLB Stats API boxscore
  // fills whichever side BDL leaves short (BDL's feed can gap a whole
  // team: 2026-06-10 it returned 0 batters while statsapi had 9/9).
  // HARD FAIL only when BOTH sources come up short — Gary cannot pick
  // without confirmed lineups + starting pitchers.
  // ═══════════════════════════════════════════════════════════════════
  const formatLineup = (teamData, teamName, blocks = new Map()) => {
    if (!teamData || teamData.batters.length === 0) return `${teamName}: Not yet posted`;
    let out = `${teamName}:\n`;
    out += teamData.batters.map((b) => {
      const head = `  ${b.battingOrder}. ${b.name} (${b.position}) [Bats: ${b.batsThrows?.split('/')[0] || '?'}]`;
      const lines = blocks.get(b);
      return lines?.length ? `${head}\n${lines.map((l) => `     ${l}`).join('\n')}` : head;
    }).join('\n');
    if (teamData.pitcher) out += `\n  SP: ${teamData.pitcher.name} (Throws: ${teamData.pitcher.batsThrows?.split('/')[1] || '?'})`;
    return out;
  };
  const matchLineupSide = (data, abbr, teamName) =>
    data?.[abbr] || Object.values(data || {}).find(t => clubMatches(t.teamName, teamName));
  const lineupShort = d => !(d?.batters?.length >= 9) || !d?.pitcher?.name;

  let confirmedLineupsSection = 'Lineups not yet posted — check closer to game time.';
  let homeData = null;
  let awayData = null;
  const homeLineupAbbr = game.home_team?.abbreviation || game.home_team_data?.abbreviation || '';
  const awayLineupAbbr = game.away_team?.abbreviation || game.away_team_data?.abbreviation || '';
  if (confirmedLineups?.source === 'bdl' && confirmedLineups.data) {
    homeData = matchLineupSide(confirmedLineups.data, homeLineupAbbr, homeTeam);
    awayData = matchLineupSide(confirmedLineups.data, awayLineupAbbr, awayTeam);
    console.log(`[Scout Report] MLB lineups from BDL: ${homeTeam}=${homeData?.batters?.length || 0} batters, ${awayTeam}=${awayData?.batters?.length || 0} batters`);
  }

  if (gamePk && (lineupShort(homeData) || lineupShort(awayData))) {
    const statsLineups = await getMlbGameLineups(gamePk).catch(() => null);
    if (statsLineups) {
      // Pre-game boxscores can omit the pitcher — complete the side from the
      // probable-pitchers feed (already fetched above) before judging it short.
      const completeSide = (side, probable) =>
        side && !side.pitcher?.name && probable?.fullName
          ? { ...side, pitcher: { name: probable.fullName, batsThrows: `${probable.batSide?.code || '?'}/${probable.pitchHand?.code || '?'}` } }
          : side;
      const homeFb = completeSide(matchLineupSide(statsLineups, homeLineupAbbr, homeTeam), probablePitchersData?.home);
      const awayFb = completeSide(matchLineupSide(statsLineups, awayLineupAbbr, awayTeam), probablePitchersData?.away);
      if (lineupShort(homeData) && homeFb && !lineupShort(homeFb)) homeData = homeFb;
      if (lineupShort(awayData) && awayFb && !lineupShort(awayFb)) awayData = awayFb;
      console.log(`[Scout Report] MLB lineups after MLB Stats API fallback: ${homeTeam}=${homeData?.batters?.length || 0} batters, ${awayTeam}=${awayData?.batters?.length || 0} batters`);
    }
  }

  // LINEUP NORMALIZATION (bug fix, Aug 19 eve — the [Bats: ?] render): a
  // statsapi-fallback lineup carries no handedness (needs person hydration)
  // and no BDL player ids. Hydrate hands from the people batch; join BDL
  // ids by folded name against the season stats already in memory (the id
  // bridge stays for the card's possible platoon/month additions, pending
  // the founder's post-review ruling). BDL-sourced lineups pass untouched.
  try {
    const needHands = [];
    for (const sideData of [homeData, awayData]) {
      for (const b of sideData?.batters || []) {
        if (String(b.batsThrows || '?').startsWith('?') && b.personId) needHands.push(b.personId);
      }
      const pt = sideData?.pitcher;
      if (pt && String(pt.batsThrows || '').split('/')[1] === '?' && pt.personId) needHands.push(pt.personId);
    }
    const lineupHands = needHands.length ? await getMlbPeopleHands(needHands).catch(() => new Map()) : new Map();
    const normalizeSide = (sideData, pool) => {
      for (const b of sideData?.batters || []) {
        const h = b.personId != null ? lineupHands.get(b.personId) : null;
        if (h && String(b.batsThrows || '?').startsWith('?')) b.batsThrows = `${h.bat}/${h.throw}`;
        if (b.playerId == null) {
          const row = (pool || []).find((s) =>
            foldName(s.player?.full_name || `${s.player?.first_name || ''} ${s.player?.last_name || ''}`) === foldName(b.name));
          if (row?.player?.id != null) b.playerId = row.player.id;
        }
      }
      const pt = sideData?.pitcher;
      if (pt) {
        const h = pt.personId != null ? lineupHands.get(pt.personId) : null;
        if (h && String(pt.batsThrows || '').split('/')[1] === '?') {
          pt.batsThrows = `${String(pt.batsThrows || '').split('/')[0] || h.bat}/${h.throw}`;
        }
      }
    };
    normalizeSide(homeData, homePlayerSeasonStats);
    normalizeSide(awayData, awayPlayerSeasonStats);
  } catch { /* normalization is additive — never blocks the lineup gate */ }

  if (homeData || awayData) {
    // SAT TODAY (founder GO, Aug 12): series batters missing from tonight's
    // confirmed nine, with their series line — bare facts, no read. 2+ series
    // AB floor keeps pinch-hit cameos out; last-name containment match
    // tolerates BDL last_name vs full-name differences (De La Cruz).
    const satToday = (nick, sideData) => {
      try {
        const satKey = [...seriesBattersByTeam.keys()].find((k) => clubMatches(k, nick));
        const players = satKey ? seriesBattersByTeam.get(satKey) : null;
        if (!players || !(sideData?.batters?.length >= 9)) return null;
        const inTonight = sideData.batters.map((b) => foldName(String(b.name || ''))).filter(Boolean);
        const out = [...players.entries()]
          .filter(([, a]) => a.ab >= 2)
          .filter(([last]) => { const f = foldName(last); return f && !inTonight.some((n) => n.includes(f)); })
          .sort((x, y) => (y[1].h + y[1].hr * 2) - (x[1].h + x[1].hr * 2))
          .slice(0, 4)
          .map(([last, a]) => `${last} (${a.h}-${a.ab}${a.hr ? ` ${a.hr}HR` : ''} this series)`);
        return out.length ? `  Sat today, after playing this series: ${out.join(' · ')}` : null;
      } catch { return null; }
    };
    const withSat = (formatted, satLine) => (satLine ? `${formatted}\n${satLine}` : formatted);
    // HANDEDNESS COUNT (founder GO, Aug 18; vs-starter tag removed Aug 27 —
    // founder: the lineup is a fact and the starter's split is a fact, but
    // pointing the count at tonight's arm was our multiplication, not data).
    const handsLine = (sideData) => {
      const counts = { L: 0, R: 0, S: 0 };
      for (const b of sideData?.batters || []) {
        // BDL says S for switch, statsapi says B — one bucket (Aug 19 fix:
        // a B-coded switch hitter made the count come up 8/9 and vanish).
        let c = String(b.batsThrows || '').split('/')[0].toUpperCase();
        if (c === 'B') c = 'S';
        if (counts[c] != null) counts[c] += 1;
      }
      const total = counts.L + counts.R + counts.S;
      if (total < 9) return null;
      return `  Handedness: ${counts.L} LHB, ${counts.R} RHB${counts.S ? `, ${counts.S} switch` : ''}`;
    };
    const withHands = (formatted, line) => (line ? `${formatted}\n${line}` : formatted);
    // THE FULL PLAYER BLOCK (founder GO, Aug 27 PM — "if the lineup says Sal
    // Steward then along with that should be all the info we have on him"):
    // everything player-shaped prints under his name — the stats a sharp
    // looks up (season full line, MLB.com-standard 7/15-day rolls, platoon,
    // month arc) AND what a fan just knows (his series, his history with
    // tonight's arm, every trip to the plate with the pitcher and the spot,
    // and the writers' own words on him from the last game's story). Games
    // and full stories stay game-shaped in their own sections. Career BvP is
    // the founder-ruled carve-out to the Aug-10 no-prior-season law. One
    // batter's bad vendor row loses only his lines, never the card.
    const three = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(3).replace(/^0\./, '.') : null; };
    const poolRowOf = (batter, pool) => {
      const target = foldName(batter?.name);
      return (pool || []).find((r) => foldName(r.player?.full_name || `${r.player?.first_name || ''} ${r.player?.last_name || ''}`) === target) || null;
    };
    const seasonLineOf = (row) => {
      if (!row || !(row.batting_ab > 0)) return null;
      const rate = [
        three(row.batting_avg) ? `${three(row.batting_avg)} AVG` : null,
        three(row.batting_obp) ? `${three(row.batting_obp)} OBP` : null,
        three(row.batting_slg) ? `${three(row.batting_slg)} SLG` : null,
      ].filter(Boolean).join(' / ') + (three(row.batting_ops) ? ` (${three(row.batting_ops)} OPS)` : '');
      const counts = [
        `${row.batting_ab} AB`,
        row.batting_r != null ? `${row.batting_r} R` : null,
        `${row.batting_hr ?? 0} HR`,
        row.batting_rbi != null ? `${row.batting_rbi} RBI` : null,
        row.batting_2b != null ? `${row.batting_2b} 2B` : null,
        row.batting_bb != null ? `${row.batting_bb} BB` : null,
        row.batting_so != null ? `${row.batting_so} K` : null,
        row.batting_sb != null ? `${row.batting_sb} SB` : null,
      ].filter(Boolean).join(', ');
      return `Season: ${rate} — ${counts}`;
    };
    const HITTER_MONTHS = { March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10 };
    const splitsLinesOf = async (batter) => {
      if (batter?.playerId == null) return [];
      const splits = await ballDontLieService.getMlbPlayerSplits({ playerId: batter.playerId, season }).catch(() => null);
      if (!splits) return [];
      const out = [];
      const dayRows = splits.byDayMonth || [];
      const roll = (nm) => dayRows.find((r) => r.category === 'batting' && r.split_name === nm && r.at_bats > 0);
      const fmtRoll = (label, r) => (r ? `${label} ${r.hits}-${r.at_bats}, ${r.home_runs || 0} HR (${three(r.avg) ?? '—'}/${three(r.ops) ?? '—'})` : null);
      const rollBits = [fmtRoll('last 7 days', roll('Last 7 Days')), fmtRoll('last 15 days', roll('Last 15 Days'))].filter(Boolean);
      if (rollBits.length) out.push(`Rolling (AVG/OPS): ${rollBits.join(' | ')}`);
      const bd = splits.byBreakdown || [];
      const hand = (nm) => bd.find((r) => r.category === 'batting' && r.split_name === nm && r.at_bats > 0);
      const fmtHand = (r) => `${three(r.avg) ?? '—'}/${three(r.ops) ?? '—'}${r.home_runs ? `, ${r.home_runs} HR` : ''} (${r.at_bats} AB)`;
      const vl = hand('vs. Left');
      const vr = hand('vs. Right');
      if (vl || vr) out.push(`Platoon (AVG/OPS): vs LHP ${vl ? fmtHand(vl) : 'no ABs'} | vs RHP ${vr ? fmtHand(vr) : 'no ABs'}`);
      const months = dayRows
        .filter((r) => r.category === 'batting' && HITTER_MONTHS[r.split_name] && r.at_bats > 0)
        .sort((a, b) => HITTER_MONTHS[a.split_name] - HITTER_MONTHS[b.split_name])
        .map((r) => `${r.split_name.slice(0, 3)} ${three(r.avg) ?? '—'}/${three(r.ops) ?? '—'} (${r.at_bats} AB${r.home_runs ? `, ${r.home_runs} HR` : ''})`);
      if (months.length >= 2) out.push(`By month (AVG/OPS): ${months.join(' · ')}`);
      return out;
    };
    // "This series" derives from the same official play-by-play as the trip
    // lines (Aug 27 live catch: the BDL box join missed a whole series and
    // printed 'no ABs' under three-hit nights — one source, one truth).
    const seriesLineFromTrips = (bId, trailData, oppTeamName) => {
      const seriesGames = (trailData || []).filter((g) => clubMatches(g.opp, oppTeamName));
      if (!seriesGames.length) return null;
      let ab = 0; let h = 0; let hr = 0; let seen = false;
      for (const g of seriesGames) {
        for (const t of g.trips?.[bId] || []) {
          seen = true;
          const lead = String(t).split(' ')[0];
          if (['BB', 'IBB', 'HBP', 'SB', 'caught'].includes(lead) || /^sac/.test(lead)) continue;
          ab += 1;
          if (['1B', '2B', '3B', 'HR'].includes(lead)) h += 1;
          if (lead === 'HR') hr += 1;
        }
      }
      if (!seen) return 'This series: no ABs';
      return `This series: ${h}-${ab}${hr ? `, ${hr} HR` : ''}`;
    };
    const rosterIdByName = (roster, name) => {
      const target = foldName(name);
      return (roster || []).find((p) => foldName(p.name) === target)?.id ?? null;
    };
    const careerBvpBitOf = async (batter, roster, oppProbable) => {
      const spId = oppProbable?.id ?? null;
      const spLast = String(oppProbable?.fullName || '').trim().split(/\s+/).pop();
      if (!spId || !spLast) return null; // no announced arm — nothing to compare
      const batterId = batter?.personId ?? rosterIdByName(roster, batter?.name);
      if (!batterId) return `Career vs ${spLast}: unavailable this run`;
      try {
        const r = await getCachedOrFetch(`mlb_bvp_career_${batterId}_${spId}`, async () => {
          const resp = await fetch(`https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=vsPlayerTotal&opposingPlayerId=${spId}&group=hitting`);
          if (!resp.ok) throw new Error(`vsPlayerTotal HTTP ${resp.status}`);
          const j = await resp.json();
          const st = j?.stats?.[0]?.splits?.[0]?.stat || null;
          return { ab: st?.atBats ?? 0, h: st?.hits ?? 0, hr: st?.homeRuns ?? 0 };
        }, 24 * 60);
        if (!r || !(r.ab > 0)) return `No career ABs vs ${spLast}`;
        return `Career vs ${spLast}: ${r.h}-${r.ab}${r.hr ? `, ${r.hr} HR` : ''}`;
      } catch { return `Career vs ${spLast}: unavailable this run`; }
    };
    // Trail window: the whole current series and never fewer than the last
    // three games — the founder's recency floor, same grain as the pen's.
    const trailGamesFor = (recentGames, teamName) => {
      const finals = (recentGames || []).filter((g) => g?.gamePk);
      if (!finals.length) return [];
      const oppOfG = (g) => (clubMatches(g?.teams?.home?.team?.name, teamName) ? g?.teams?.away?.team?.name : g?.teams?.home?.team?.name);
      const lastOpp = oppOfG(finals[finals.length - 1]);
      const picked = new Map();
      for (let i = finals.length - 1; i >= 0; i -= 1) {
        if (oppOfG(finals[i]) === lastOpp) picked.set(finals[i].gamePk, finals[i]);
        else break;
      }
      for (const g of finals.slice(-3)) picked.set(g.gamePk, g);
      return [...picked.values()]
        .sort((a, b) => String(a.officialDate || a.gameDate || '').localeCompare(String(b.officialDate || b.gameDate || '')))
        .slice(-6);
    };
    const trailDataFor = async (recentGames, teamName) => {
      const games = trailGamesFor(recentGames, teamName);
      return await Promise.all(games.map(async (g) => {
        const isHome = clubMatches(g?.teams?.home?.team?.name, teamName);
        const opp = String(isHome ? g?.teams?.away?.team?.name : g?.teams?.home?.team?.name || '?');
        const day = String(g.officialDate || g.gameDate || '').slice(5, 10).replace('-', '/');
        const [trips, box] = await Promise.all([
          getBatterGameTrips(g.gamePk).catch(() => ({})),
          getGameBoxScore(g.gamePk).catch(() => null),
        ]);
        const oppSide = box?.teams
          ? (box.teams.home?.team && clubMatches(box.teams.home.team.name, teamName) ? box.teams.away : box.teams.home)
          : null;
        const starterId = Array.isArray(oppSide?.pitchers) ? oppSide.pitchers[0] : null;
        const starter = starterId != null
          ? String(oppSide?.players?.[`ID${starterId}`]?.person?.fullName || '').split(' ').pop() || null
          : null;
        return { pk: g.gamePk, day, opp, vsAt: isHome ? 'vs' : '@', starter, trips };
      }));
    };
    const nickOfClub = (name) => (String(name).match(/\b(Blue Jays|Red Sox|White Sox)$/) || [])[1] || String(name || '?').split(' ').pop();
    const tripsLinesOf = (batter, roster, trailData) => {
      const bId = batter?.personId ?? rosterIdByName(roster, batter?.name);
      if (!bId || !trailData?.length) return [];
      const lines = trailData.slice().reverse().map((g) => {
        const t = g.trips?.[bId];
        const head = `${g.day} ${g.vsAt} ${nickOfClub(g.opp)}${g.starter ? ` (started ${g.starter})` : ''}`;
        return `  ${head}: ${t && t.length ? t.join(' · ') : 'did not play'}`;
      });
      return ['Every trip to the plate — this series, and always at least his last 3 games:', ...lines];
    };
    const pressLinesOf = (batter, lastPk) => {
      const story = lastPk != null ? wireStoryByPk.get(lastPk) : null;
      if (!story?.body) return [];
      const last = String(batter?.name || '').trim().split(/\s+/).pop();
      if (!last) return [];
      const sentences = String(story.body).replace(/\s*\n+\s*/g, ' ').split(/(?<=[.!?"”])\s+(?=[A-Z"“])/);
      const first = String(batter?.name || '').trim().split(/\s+/)[0];
      // Surname guard (Aug 27 live catch: Jordan Walker's block quoted a
      // sentence about reliever Josh Walker): a bare surname only counts
      // when the sentence doesn't attach it to a different first name.
      const namesHim = (s) => {
        if (first && s.includes(`${first} ${last}`)) return true;
        if (!s.includes(last)) return false;
        const owners = [...s.matchAll(new RegExp(`([A-Z][\\w'’.-]+)\\s+${last}\\b`, 'g'))].map((m) => m[1]);
        return owners.length === 0 || owners.some((o) => o === first);
      };
      const picked = [];
      for (let i = 0; i < sentences.length; i += 1) {
        if (namesHim(sentences[i])) {
          picked.push(sentences[i]);
          const nxt = sentences[i + 1];
          if (nxt && /^["“]/.test(nxt)) { picked.push(nxt); i += 1; }
        }
      }
      if (!picked.length) return ['The press on him, last game: (not named in the game story)'];
      return [
        'The press on him, last game (from the official game story — the full article prints whole in the games section):',
        `  "${picked.join(' ')}"`,
      ];
    };
    const buildPlayerBlocks = async (sideData, pool, teamName, roster, oppProbable, recentGames, oppTeamName) => {
      const blocks = new Map();
      const trailData = await trailDataFor(recentGames, teamName).catch(() => []);
      const lastPk = trailData.length ? trailData[trailData.length - 1].pk : null;
      await Promise.all((sideData?.batters || []).map(async (b) => {
        // One batter's bad row loses only his lines — never the card.
        try {
          const lines = [];
          const s = seasonLineOf(poolRowOf(b, pool));
          if (s) lines.push(s);
          lines.push(...await splitsLinesOf(b));
          const bId = b?.personId ?? rosterIdByName(roster, b?.name);
          const bits = [
            bId != null ? seriesLineFromTrips(bId, trailData, oppTeamName) : null,
            await careerBvpBitOf(b, roster, oppProbable),
          ].filter(Boolean);
          if (bits.length) lines.push(bits.join(' · '));
          lines.push(...tripsLinesOf(b, roster, trailData));
          lines.push(...pressLinesOf(b, lastPk));
          if (lines.length) blocks.set(b, lines);
        } catch { /* block prints bare */ }
      }));
      return blocks;
    };
    const [homePlayerBlocks, awayPlayerBlocks] = await Promise.all([
      buildPlayerBlocks(homeData, homePlayerSeasonStats, homeTeam, homeRoster, probablePitchersData?.away, homeRecentGames, awayTeam),
      buildPlayerBlocks(awayData, awayPlayerSeasonStats, awayTeam, awayRoster, probablePitchersData?.home, awayRecentGames, homeTeam),
    ]);
    confirmedLineupsSection = [
      withSat(withHands(formatLineup(homeData, homeTeam, homePlayerBlocks), handsLine(homeData)), satToday(homeTeam, homeData)),
      withSat(withHands(formatLineup(awayData, awayTeam, awayPlayerBlocks), handsLine(awayData)), satToday(awayTeam, awayData)),
    ].join('\n\n');
  }

  // HARD FAIL: Gary cannot pick MLB without confirmed lineups + starting pitchers
  const homeHasLineup = homeData?.batters?.length >= 9;
  const awayHasLineup = awayData?.batters?.length >= 9;
  const homeHasPitcher = !!homeData?.pitcher?.name;
  const awayHasPitcher = !!awayData?.pitcher?.name;
  if (!homeHasLineup || !awayHasLineup || !homeHasPitcher || !awayHasPitcher) {
    const missing = [];
    if (!homeHasLineup) missing.push(`${homeTeam} lineup (${homeData?.batters?.length || 0}/9 batters)`);
    if (!awayHasLineup) missing.push(`${awayTeam} lineup (${awayData?.batters?.length || 0}/9 batters)`);
    if (!homeHasPitcher) missing.push(`${homeTeam} starting pitcher`);
    if (!awayHasPitcher) missing.push(`${awayTeam} starting pitcher`);
    // TEST-ONLY bypass (Aug 18 2026): bench harnesses may run the full engine
    // before lineups post. Never set in production paths — production keeps
    // the hard gate (LOCKED pick coverage policy).
    if (options.testAllowMissingLineups) {
      console.warn(`[Scout Report] ⚠️ TEST RUN — lineup gate bypassed. Missing: ${missing.join(', ')}`);
    } else {
    throw new Error(`[Scout Report] HARD FAIL — MLB requires lineups + starting pitchers for ${awayTeam} @ ${homeTeam} (checked BDL + MLB Stats API). Missing: ${missing.join(', ')}. Run picks closer to game time (per BDL docs, lineups typically appear 1-2 hours before first pitch — the T-90 tier can race the posting; later tiers pick it up).`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // INJURIES — TEAM GAMES MISSED IS A ROUTING CLOCK, NOT A CAUSAL MODEL.
  //
  // 0-2 completed team games: show as a fresh roster change.
  // 3-9: show only a mechanical regular/meaningful-role filter, neutrally.
  // 10+: keep off the nightly desk; confirmed lineups and current team form
  // already describe the roster Gary is evaluating. No "with/without" record
  // is calculated, so later team results are never attributed to one injury.
  // This one shared path handles both teams and every injured player.
  // ═══════════════════════════════════════════════════════════════════
  let injuriesSection = '';
  if (Array.isArray(bdlInjuries) && bdlInjuries.length > 0) {
    const sameId = (a, b) => a != null && b != null && String(a) === String(b);
    const playerNameOf = (injury) => injury?.player?.full_name
      || [injury?.player?.first_name, injury?.player?.last_name].filter(Boolean).join(' ')
      || 'Unknown player';
    const injuryTeamName = (injury) => injury?.player?.team?.display_name
      || injury?.player?.team?.full_name
      || injury?.team?.display_name
      || injury?.team?.full_name
      || injury?.team_name
      || '';
    const sideFor = (injury) => {
      const teamId = injury?.player?.team?.id ?? injury?.team?.id ?? injury?.team_id;
      if (sameId(teamId, homeTeamBdlId)) return 'home';
      if (sameId(teamId, awayTeamBdlId)) return 'away';
      const teamName = injuryTeamName(injury).toLowerCase();
      if (teamName.includes(lastWord(homeTeam))) return 'home';
      if (teamName.includes(lastWord(awayTeam))) return 'away';
      return null;
    };
    const formatMlbDate = (value) => {
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return null;
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
    };

    const sides = {
      home: {
        teamName: homeTeam,
        teamGames: completedMlbTeamGames(seasonIndex, homeTeamBdlId),
        seasonStats: homePlayerSeasonStats,
        lines: [],
      },
      away: {
        teamName: awayTeam,
        teamGames: completedMlbTeamGames(seasonIndex, awayTeamBdlId),
        seasonStats: awayPlayerSeasonStats,
        lines: [],
      },
    };

    // A structured injury row can lag an activation. The confirmed lineup is
    // authoritative for tonight, so a player actually starting is not "out."
    const lineupNames = new Set([
      ...(homeData?.batters || []).map((b) => b.name),
      homeData?.pitcher?.name,
      ...(awayData?.batters || []).map((b) => b.name),
      awayData?.pitcher?.name,
    ].filter(Boolean).map(foldName));

    const relevantInjuries = bdlInjuries.filter((injury) => {
      const side = sideFor(injury);
      return side && injury?.player?.id != null && !lineupNames.has(foldName(playerNameOf(injury)));
    });
    const statsByPlayerId = new Map(
      [...homePlayerSeasonStats, ...awayPlayerSeasonStats]
        .filter((row) => row?.player?.id != null)
        .map((row) => [String(row.player.id), row]),
    );

    // One cached log lookup per relevant injured player. Exact game-id matching
    // makes doubleheaders safe. If logs come back empty for someone whose
    // season stats prove he played, leave the clock unresolved instead of
    // falsely treating a feed failure as "out all season."
    const lastAppearanceById = new Map();
    await Promise.all(
      [...new Set(relevantInjuries.map((injury) => injury.player.id))].map(async (playerId) => {
        try {
          const rows = await ballDontLieService.getMlbPlayerGameRowsChrono(playerId, season);
          const played = (Array.isArray(rows) ? rows : []).filter(
            (row) => row?.at_bats != null || row?.plate_appearances != null
              || (row?.ip != null && parseFloat(row.ip) > 0),
          );
          const last = played.length ? played[played.length - 1] : null;
          if (!last) {
            const seasonRow = statsByPlayerId.get(String(playerId));
            const knownGames = Number(
              seasonRow?.batting_gp ?? seasonRow?.pitching_gp
              ?? seasonRow?.games_played ?? seasonRow?.gp ?? 0,
            );
            if (knownGames > 0) return;
          }
          lastAppearanceById.set(playerId, last ? {
            gameId: last.game_id,
            date: last._game?.date || last.game?.date || last.date,
          } : null);
        } catch (error) {
          console.warn(`[Scout Report] MLB injury clock unavailable for player ${playerId}: ${error.message}`);
        }
      }),
    );

    const routedCounts = { FRESH: 0, ESTABLISHED: 0, 'SP SCRATCH': 0, omitted: 0, unresolved: 0 };
    for (const injury of relevantInjuries) {
      const sideKey = sideFor(injury);
      const side = sides[sideKey];
      if (!side) continue;

      const playerId = injury.player.id;
      const playerName = playerNameOf(injury);
      const position = injury.player?.position || injury.position || '—';
      const injuryType = injury.type || injury.detail || 'Unknown';
      const injurySide = injury.side ? ` (${injury.side})` : '';
      const status = injury.status || 'Unknown';
      const comment = injury.short_comment || injury.long_comment || '';
      const isPitcher = isMlbPitcherPosition(position);
      const scratchText = [status, injuryType, comment].filter(Boolean).join(' ').toLowerCase();
      const isScratch = /\bscratch(?:ed)?\b/.test(scratchText);
      const lastAppearance = lastAppearanceById.has(playerId)
        ? lastAppearanceById.get(playerId)
        : undefined;
      // An empty completed-game list may mean Opening Day, but it may also mean
      // the season-index request failed. Do not call every absence "fresh" in
      // either case; only an explicit SP scratch can bypass an unresolved clock.
      const { gamesMissed, isMinimum } = side.teamGames.length > 0
        ? resolveMlbGamesMissed(side.teamGames, lastAppearance)
        : { gamesMissed: null, isMinimum: false };
      const isMeaningful = isMeaningfulMlbAbsence(
        injury,
        side.seasonStats,
        side.teamGames.length,
      );
      const route = classifyMlbInjuryContext({
        gamesMissed,
        gamesMissedIsMinimum: isMinimum,
        isPitcher,
        isScratch,
        isMeaningful,
      });

      if (!route.include) {
        routedCounts.omitted += 1;
        if (route.reason === 'missing_game_clock') routedCounts.unresolved += 1;
        continue;
      }
      routedCounts[route.tag] += 1;

      const dateBits = [];
      const lastPlayedLabel = formatMlbDate(lastAppearance?.date);
      const updateLabel = formatMlbDate(injury.date);
      if (lastPlayedLabel) dateBits.push(`last played ${lastPlayedLabel}`);
      else if (lastAppearance === null) dateBits.push('no appearances this season');
      if (updateLabel) dateBits.push(`update ${updateLabel}`);
      // Team record since he last played (founder GO, Aug 18 — sources the
      // "has the team's record changed since the injury" ask with data).
      // Purely additive display; the LOCKED clock/label logic is untouched.
      try {
        const sinceRec = computeRecordSince(seasonIndex, sideKey === 'home' ? homeTeamBdlId : awayTeamBdlId, lastAppearance?.date);
        if (sinceRec) dateBits.push(`team ${sinceRec.wins}-${sinceRec.losses} since`);
      } catch { /* additive only */ }
      const clock = route.tag === 'SP SCRATCH'
        ? ''
        : ` — ${mlbGamesMissedLabel(gamesMissed, isMinimum)}`;
      side.lines.push(
        `[${route.tag}${clock}] ${playerName} (${position}) — ${injuryType}${injurySide}: ${comment || status}`
        + (dateBits.length ? ` (${dateBits.join('; ')})` : ''),
      );
    }

    const parts = Object.values(sides)
      .filter((side) => side.lines.length > 0)
      .map((side) => `${side.teamName}:\n${side.lines.map((line) => `  ${line}`).join('\n')}`);
    injuriesSection = parts.join('\n\n')
      || 'No fresh or lineup-relevant absences. Long-term and depth IL entries are represented by tonight\'s confirmed lineups and current team baselines.';
    console.log(
      `[Scout Report] MLB injury routing: fresh=${routedCounts.FRESH}, established=${routedCounts.ESTABLISHED}, `
      + `scratches=${routedCounts['SP SCRATCH']}, omitted=${routedCounts.omitted}, unresolved=${routedCounts.unresolved}`,
    );
  } else {
    injuriesSection = 'No current structured injuries reported.';
  }

  // (LINEUP RECENT BATTING wall retired Aug 27 — founder: the fan facts
  // now ride the lineup card, one line per name; per-game batting lines
  // and the stories carry recency. Platoon and month arcs await his
  // ruling after he reviews the new card.)

  // (Season BvP grid retired Aug 27 — founder: every batter's CAREER line
  // vs tonight's arm now prints on the lineup card itself.)

  // ═══════════════════════════════════════════════════════════════════
  // BENCH TONIGHT (founder GO, Aug 18): who is actually available to hit
  // late — active roster minus the confirmed nine minus the IL, with bats
  // side and the season line. The platoon caddy question, answered.
  // ═══════════════════════════════════════════════════════════════════
  let benchSection = '';
  try {
    const injuredFolds = new Set((bdlInjuries || [])
      .map((i) => foldName(i?.player?.full_name || [i?.player?.first_name, i?.player?.last_name].filter(Boolean).join(' ')))
      .filter(Boolean));
    // FRESH IL placements (bug fix, Aug 19 eve — the Mesa contradiction: a
    // man the desk itself flags as a fresh absence was listed on the bench).
    // Same 3-day transaction window the SITUATION FLAGS parse uses; rosters
    // and the structured injury feed can both lag a day-of placement.
    try {
      const threeDaysAgoB = new Date(Date.now() - 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const todayEtB = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      for (const tid of [homeTeamId, awayTeamId]) {
        if (!tid) continue;
        const rows = await getMlbTransactions(tid, threeDaysAgoB, todayEtB).catch(() => []);
        for (const r of rows) {
          const m = String(r.description || '').match(/placed\s+(?:[A-Z0-9]{1,3}\s+)?(.+?)\s+on the .*injured list/i);
          if (m) injuredFolds.add(foldName(m[1]));
        }
      }
    } catch { /* additive guard */ }
    const benchFor = async (roster, sideData, seasonPool, teamName) => {
      if (!roster?.length || !(sideData?.batters?.length >= 9)) return null;
      const inLineup = new Set([
        ...(sideData.batters || []).map((b) => foldName(b.name)),
        sideData.pitcher?.name ? foldName(sideData.pitcher.name) : null,
      ].filter(Boolean));
      const bench = roster.filter((p) => p.positionType !== 'Pitcher'
        && !/injured|60-day|15-day|10-day|7-day/i.test(String(p.ilStatus || ''))
        && p.name && !inLineup.has(foldName(p.name))
        && !injuredFolds.has(foldName(p.name)));
      if (!bench.length) return null;
      const hands = await getMlbPeopleHands(bench.map((p) => p.id)).catch(() => new Map());
      const rows = bench.slice(0, 6).map((p) => {
        const bat = hands.get(p.id)?.bat || '?';
        const sRow = (seasonPool || []).find((s) => foldName(s.player?.full_name || `${s.player?.first_name || ''} ${s.player?.last_name || ''}`) === foldName(p.name));
        const line = sRow && (sRow.batting_ab || 0) > 0
          ? `${sRow.batting_avg != null ? sRow.batting_avg.toFixed(3) : '—'}/${sRow.batting_ops != null ? sRow.batting_ops.toFixed(3) : '—'}, ${sRow.batting_hr ?? 0} HR (${sRow.batting_ab} AB)`
          : 'no season line in source';
        return `${p.name} (${p.position}, bats ${bat}) ${line}`;
      });
      return `${teamName}: ${rows.join(' · ')}`;
    };
    const [homeBench, awayBench] = await Promise.all([
      benchFor(homeRoster, homeData, homePlayerSeasonStats, homeTeam),
      benchFor(awayRoster, awayData, awayPlayerSeasonStats, awayTeam),
    ]);
    benchSection = [homeBench, awayBench].filter(Boolean).join('\n');
  } catch { benchSection = ''; }

  // Season head-to-head — computed from the cached season index, zero calls.
  const seasonSeries = computeMlbSeasonSeries(seasonIndex, homeTeamBdlId, awayTeamBdlId, homeTeam, awayTeam);
  // Grouped by set (founder, Aug 10): "won the series back in June" beats
  // nine raw dated lines — same meetings, series-shaped. Falls back to the
  // raw dated list when grouping has nothing.
  const seasonSeriesGroups = computeMlbSeasonSeriesGroups(seasonIndex, homeTeamBdlId, awayTeamBdlId, homeTeam, awayTeam);

  // (Historic head-to-head, prior 3 seasons — REMOVED, founder ruling
  // Aug 10: no prior-season numbers on the desk. The 2026 season series
  // stays; last year's rosters aren't tonight's teams.)

  // SITUATION FLAGS (founder GO, Aug 5 night): the detectable states behind
  // betting lore — "first games without the everyday star", "just activated",
  // — printed as naked facts in exactly the shape the pattern keys on. The
  // state prompts the model's own knowledge; no effect names, no direction.
  // Built from transactions + season stats only; the locked injury rendering
  // is not touched. Same-day lineup scratches stay news-borne (no transaction
  // exists for a scratch).
  let situationFlagsSection = '';
  try {
    const teamGamesOf = (teamName) => {
      // Exact whole-name lookup (leakage-audit finding 2, Aug 17): last-word
      // `.includes` let a Sox team read the other Sox team's games-played.
      const row = findStandingsRow(bdlStandings, teamName);
      return row ? (Number(row.wins) || 0) + (Number(row.losses) || 0) : null;
    };
    const gpOf = (stats, playerName) => {
      const target = foldName(playerName);
      const row = (stats || []).find(st => foldName(st.player?.full_name) === target);
      if (!row) return null;
      return row.batting_gp ?? row.games_played ?? row.batting_games ?? null;
    };
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const todayEtFlag = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const flagLines = [];
    for (const [teamName, teamId, seasonStats] of [
      [homeTeam, homeTeamId, homePlayerSeasonStats],
      [awayTeam, awayTeamId, awayPlayerSeasonStats],
    ]) {
      if (!teamId) continue;
      const rows = await getMlbTransactions(teamId, threeDaysAgo, todayEtFlag).catch(() => []);
      const seen = new Set();
      for (const r of rows) {
        const d = String(r.description || '');
        const placed = d.match(/placed\s+(?:[A-Z0-9]{1,3}\s+)?(.+?)\s+on the .*injured list/i);
        const activated = d.match(/activated\s+(?:[A-Z0-9]{1,3}\s+)?(.+?)\s+from the .*injured list/i);
        const m = placed || activated;
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        const playerName = m[1];
        if (placed) {
          const gp = gpOf(seasonStats, playerName);
          const tg = teamGamesOf(teamName);
          const share = gp != null && tg ? ` — had played ${gp} of the team's ${tg} games` : '';
          flagLines.push(`FRESH ABSENCE: ${playerName} (${teamName}) — placed on the injured list ${r.date}${share}. First game(s) without him.`);
        } else {
          flagLines.push(`JUST BACK: ${playerName} (${teamName}) — activated from the injured list ${r.date}.`);
        }
      }
    }
    situationFlagsSection = flagLines.join('\n');
  } catch { situationFlagsSection = ''; }

  // Roster moves, last 14 days (founder, Aug 5 PM: a fan knows who got
  // traded — deadline arrivals must stay visible past the one-week mark, so
  // "he was traded to the Dodgers on Jul 31" is on the desk through mid-Aug).
  const todayEtStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const weekAgoStr = new Date(Date.now() - 14 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const txFor = async (mlbamTeamId, teamName) => {
    if (!mlbamTeamId) return null;
    try {
      const rows = await getMlbTransactions(mlbamTeamId, weekAgoStr, todayEtStr);
      if (!rows.length) return `${teamName}: no moves in the last 14 days.`;
      return `${teamName}:\n${rows.slice(-10).map(r => `  ${r.date}: ${r.description}`).join('\n')}`;
    } catch { return null; }
  };
  const [homeTx, awayTx] = await Promise.all([txFor(homeTeamId, homeTeam), txFor(awayTeamId, awayTeam)]);
  const rosterMovesSection = [homeTx, awayTx].filter(Boolean).join('\n\n') || 'Transaction data unavailable.';

  // Schedule shape from the season index (homestand/trip position, 7-day load,
  // night-then-day turnaround).
  const homeShape = computeMlbScheduleShape(seasonIndex, homeTeamBdlId, todayEtStr, startTime);
  const awayShape = computeMlbScheduleShape(seasonIndex, awayTeamBdlId, todayEtStr, startTime);
  const scheduleShapeBlock = [
    homeShape ? `${homeTeam}: ${homeShape.line}` : null,
    awayShape ? `${awayTeam}: ${awayShape.line}` : null,
  ].filter(Boolean).join('\n');
  const seasonSeriesBlock = seasonSeries
    ? `\n${seasonSeries.line}\n${(seasonSeriesGroups || seasonSeries.results).map(r => `  ${r}`).join('\n')}`
    : '';

  // ═══════════════════════════════════════════════════════════════════
  // THE SITUATION (founder GO, Aug 19 — "the environment of baseball"):
  // each club's spot, stated plainly in one place the way a fan holds it —
  // the current run of results WITH the games behind it, the last week
  // with its exceptions named, where they are in the travel schedule,
  // whether tonight is a division game, and how they've actually answered
  // wins and losses. Facts only; what the spot means tonight is the
  // brain's read. Streaks stay natural (founder: don't tunnel on the
  // word) — a 2-game run prints as one quiet line, a real run brings its
  // own ledger.
  // ═══════════════════════════════════════════════════════════════════
  let situationSection = '';
  try {
    const teamNameOfBdlId = new Map((bdlStandings || []).filter((t) => t.team?.id != null)
      .map((t) => [String(t.team.id), t.team.display_name || t.team.full_name || '?']));
    const nickOfId = (id) => String(teamNameOfBdlId.get(String(id)) || '?');
    const situationCtx = await getMlbStandingsContext(season).catch(() => new Map());
    const [homeSituHit, awaySituHit] = await Promise.all([
      homeTeamId ? getTeamSituationalHitting(homeTeamId, season).catch(() => null) : null,
      awayTeamId ? getTeamSituationalHitting(awayTeamId, season).catch(() => null) : null,
    ]);
    const homeDiv = findStandingsRow(bdlStandings, homeTeam)?.division_name || null;
    const awayDiv = findStandingsRow(bdlStandings, awayTeam)?.division_name || null;

    const spotFor = (teamName, bdlId, isHome, situHit) => {
      const lines = [];
      const streak = computeCurrentStreak(seasonIndex, bdlId);
      if (streak && streak.len >= 3) {
        const games = streak.games.map((g) => {
          const opp = nickOfId(g.oppId);
          return `${g.date.slice(5)} ${g.won ? 'W' : 'L'} ${g.rf}-${g.ra} ${g.home ? 'vs' : '@'} ${opp.split(' ').pop()}${standingsRecordOf(opp)}`;
        });
        lines.push(`${streak.won ? `Won ${streak.len} straight` : `Lost ${streak.len} straight`}: ${games.join(' · ')}`);
      } else if (streak && streak.len === 2) {
        lines.push(streak.won ? 'Won their last 2.' : 'Lost their last 2.');
      }
      const q = computeRecentQuality(seasonIndex, bdlId, 7);
      if (q) {
        if (q.exceptions.length && q.exceptions.length <= 2) {
          const exBits = q.exceptions.map((g) => {
            const opp = nickOfId(g.oppId);
            return `${g.date.slice(5)} ${g.home ? 'vs' : '@'} ${opp.split(' ').pop()}${standingsRecordOf(opp)} ${g.won ? 'W' : 'L'} ${g.rf}-${g.ra}`;
          });
          const label = q.wins > q.losses
            ? (q.losses === 1 ? 'the loss' : 'the losses')
            : (q.wins === 1 ? 'the win' : 'the wins');
          lines.push(`Last 7: ${q.wins}-${q.losses} — ${label}: ${exBits.join('; ')}`);
        } else {
          lines.push(`Last 7: ${q.wins}-${q.losses}`);
        }
      }
      const vt = computeVenueTransition(seasonIndex, bdlId, isHome);
      if (vt) lines.push(`Tonight: ${vt}.`);
      const bounce = computeBounceBackLine(seasonIndex, bdlId, teamName);
      if (bounce) {
        let bLine = bounce;
        const lastWon = / won their last game /.test(bounce);
        const s = lastWon ? situHit?.afterWin : situHit?.afterLoss;
        if (s?.avg && s?.ops) {
          bLine += ` In games ${lastWon ? 'after a win' : 'after a loss'} this season their bats hit ${s.avg}/${s.ops} (${s.games} G).`;
        }
        lines.push(bLine);
      }
      return lines.length ? `${teamName}:\n${lines.map((l) => `  ${l}`).join('\n')}` : null;
    };

    const parts = [
      spotFor(awayTeam, awayTeamBdlId, false, awaySituHit),
      spotFor(homeTeam, homeTeamBdlId, true, homeSituHit),
    ].filter(Boolean);

    if (homeDiv && awayDiv && homeDiv === awayDiv) {
      const divRec = (id) => situationCtx.get(id)?.divisionRecords?.[homeDiv] || null;
      const bits = [`Division game (${homeDiv}).`];
      const hd = divRec(homeTeamId);
      const ad = divRec(awayTeamId);
      if (hd) bits.push(`${homeTeam} vs the division this season: ${hd}.`);
      if (ad) bits.push(`${awayTeam}: ${ad}.`);
      if (seasonSeries?.line) bits.push(seasonSeries.line);
      parts.push(bits.join(' '));
    }

    // Fresh roster changes ride the spot — names only, detail stays in
    // SITUATION FLAGS (the founder's injuries-tie-into-the-situation ask).
    if (situationFlagsSection) {
      const names = situationFlagsSection.split('\n').map((l) => {
        const m = l.match(/^(FRESH ABSENCE|JUST BACK): ([^(]+) \(/);
        return m ? `${m[2].trim()} (${m[1] === 'FRESH ABSENCE' ? 'fresh absence' : 'just back'})` : null;
      }).filter(Boolean);
      if (names.length) parts.push(`Fresh roster changes in this game — ${names.join(' · ')} (detail in SITUATION FLAGS).`);
    }
    situationSection = parts.join('\n\n');
  } catch { situationSection = ''; }

  // ═══════════════════════════════════════════════════════════════════
  // TEAM SEASON STATS — FORMAT COMPARISON SECTION
  // ═══════════════════════════════════════════════════════════════════
  let teamSeasonStatsSection = '';
  {
    const fmtBattingLine = (teamName, stats) => {
      if (!stats) return `${teamName}: Team season stats unavailable`;
      const avg = stats.batting_avg != null ? parseFloat(stats.batting_avg).toFixed(3) : '—';
      const ops = stats.batting_ops != null ? parseFloat(stats.batting_ops).toFixed(3) : '—';
      const gp = stats.gp || 1;
      const runsTotal = stats.batting_r ?? stats.batting_runs ?? null;
      const rpg = runsTotal != null ? (parseFloat(runsTotal) / gp).toFixed(1) : '—';
      const era = stats.pitching_era != null ? parseFloat(stats.pitching_era).toFixed(2) : '—';
      const whip = stats.pitching_whip != null ? parseFloat(stats.pitching_whip).toFixed(2) : '—';
      // K/9: use pitching_k_per_9 if available, else calculate from pitching_k / pitching_ip * 9
      let k9 = '—';
      if (stats.pitching_k_per_9 != null) {
        k9 = parseFloat(stats.pitching_k_per_9).toFixed(1);
      } else if (stats.pitching_k != null && stats.pitching_ip != null && parseFloat(stats.pitching_ip) > 0) {
        k9 = (parseFloat(stats.pitching_k) / parseFloat(stats.pitching_ip) * 9).toFixed(1);
      }
      const fp = stats.fielding_fp != null ? parseFloat(stats.fielding_fp).toFixed(3) : null;
      const errs = stats.fielding_e ?? null;
      const sb = stats.batting_sb ?? null;
      const fielding = fp != null || errs != null ? ` | Fielding: ${fp ?? '—'} FP, ${errs ?? '—'} E` : '';
      const running = sb != null ? ` | SB: ${sb}` : '';
      // Offense shape (Jul 26): how the runs arrive — power, walks, whiffs —
      // as per-game counts. Facts only; the fingerprint is Gary's to read.
      const per = (v) => (v != null && gp > 0 ? (parseFloat(v) / gp).toFixed(2) : null);
      const hrG = per(stats.batting_hr);
      const bbG = per(stats.batting_bb);
      const soG = per(stats.batting_so ?? stats.batting_k);
      const shapeBits = [];
      if (hrG != null) shapeBits.push(`${hrG} HR/gm`);
      if (bbG != null) shapeBits.push(`${bbG} BB/gm`);
      if (soG != null) shapeBits.push(`${soG} K/gm`);
      const shape = shapeBits.length ? ` | Shape: ${shapeBits.join(', ')}` : '';
      return `${teamName}: ${avg} AVG / ${ops} OPS / ${rpg} R/G | Pitching: ${era} ERA / ${whip} WHIP / ${k9} K/9${fielding}${running}${shape}`;
    };
    if (homeTeamStats || awayTeamStats) {
      teamSeasonStatsSection = [
        fmtBattingLine(homeTeam, homeTeamStats),
        fmtBattingLine(awayTeam, awayTeamStats),
      ].join('\n');
    }
    // TEAM VS-HAND (founder GO, Aug 12): how each lineup hits lefties and
    // righties, season-long — the platoon picture from the hitters' side.
    // Bare splits for BOTH hands; which one matters tonight is Gary's read.
    try {
      const fmtHand = (label, s) => (s ? `vs ${label}: ${s.avg ?? '—'} AVG / ${s.ops ?? '—'} OPS, ${s.hr ?? '—'} HR, ${s.so ?? '—'} K (${s.pa ?? '—'} PA)` : null);
      const handLine = async (teamName, teamId) => {
        if (!teamId) return null;
        const sp = await getTeamVsHandSplits(teamId, season).catch(() => null);
        if (!sp) return null;
        const bits = [fmtHand('LHP', sp.vsLeft), fmtHand('RHP', sp.vsRight)].filter(Boolean);
        return bits.length ? `${teamName} ${bits.join(' | ')}` : null;
      };
      const handLines = (await Promise.all([
        handLine(homeTeam, homeTeamId),
        handLine(awayTeam, awayTeamId),
      ])).filter(Boolean);
      if (handLines.length) teamSeasonStatsSection += `\n${handLines.join('\n')}`;
    } catch { /* fail-open — the season lines above still print */ }
  }


  // ═══════════════════════════════════════════════════════════════════
  // SERIES CONTEXT (simple one-liner for the header)
  // ═══════════════════════════════════════════════════════════════════
  let seriesLine = '';
  {
    // Detect current series by looking at recent games between these two teams
    const recentAll = [...(homeRecentGames || [])].reverse(); // most recent first
    let seriesGames = 0;
    let homeWins = 0;
    let awayWins = 0;
    for (const g of recentAll) {
      const hName = g.teams?.home?.team?.name;
      const aName = g.teams?.away?.team?.name;
      const isSeriesGame = (clubMatches(hName, homeTeam) && clubMatches(aName, awayTeam))
        || (clubMatches(hName, awayTeam) && clubMatches(aName, homeTeam));
      if (!isSeriesGame) break;
      seriesGames++;
      const hScore = g.teams?.home?.score ?? 0;
      const aScore = g.teams?.away?.score ?? 0;
      if (clubMatches(hName, homeTeam)) {
        hScore > aScore ? homeWins++ : awayWins++;
      } else {
        aScore > hScore ? homeWins++ : awayWins++;
      }
    }
    if (seriesGames > 0) {
      const gameNum = seriesGames + 1; // tonight is the next game
      seriesLine = `Series: Game ${gameNum} | ${homeTeam} ${homeWins}-${awayWins} ${awayTeam}`;
    }
  }

  // Retained for the LOCKED injury block's name-fallback only (its primary
  // path is team-ID based). Every other join uses clubMatches (Aug 19).
  function lastWord(name) { return (name || '').toLowerCase().split(' ').pop(); }

  const matchupShelfSection = await buildScoutMatchupShelf(game, homeTeam, awayTeam, gamePk).catch(() => '');

  // ═══════════════════════════════════════════════════════════════════
  // ASSEMBLE REPORT
  // ═══════════════════════════════════════════════════════════════════
  const text = `
══════════════════════════════════════════════════════════════════
MATCHUP: ${awayTeam} @ ${homeTeam}
${gameDesc ? `Context: ${gameDesc}` : ''}
Venue: ${typeof venue === 'string' ? venue : venue?.name || 'Unknown'}
${startTime ? `Start: ${new Date(startTime).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} ET` : ''}
${seriesLine ? seriesLine : ''}
${dhInfo ? `DOUBLEHEADER today${dhInfo.gameNumber ? ` — this is game ${dhInfo.gameNumber}` : ''}${dhInfo.split ? ' (split doubleheader)' : ''}.` : ''}
${weatherSection}
══════════════════════════════════════════════════════════════════

${situationSection ? `═══ THE SITUATION ═══\n${situationSection}\n\n` : ''}═══ PROBABLE PITCHERS ═══
${probablePitchersSection}

═══ PITCHER SAMPLE CONTEXT ═══
${smallSampleFlagsSection}

═══ CONFIRMED LINEUPS ═══
${confirmedLineupsSection}

${benchSection ? `═══ THE BENCH TONIGHT ═══\n${benchSection}\n\n` : ''}${matchupShelfSection ? matchupShelfSection + '\n\n' : ''}═══ BETTING CONTEXT ═══
${oddsSection}


═══ TEAM SEASON STATS ═══
${teamSeasonStatsSection || 'No team season stats available.'}

${standingsSection ? `═══ STANDINGS & SEASON SHAPE ═══\n${standingsSection}\n\n` : ''}═══ INJURIES (BDL Structured) ═══
${injuriesSection || 'No structured injury data available.'}

═══ RECENT FORM ═══
Rolling splits (L1/L3/L5/L10):
${recentPerformanceSection || 'No recent performance data.'}


═══ SERIES STATE ═══
${computeMlbSeriesState(homeTeam, awayTeam, homeRecentGames, homeUpcomingGames).line}${seasonSeriesBlock}${seriesStoriesBlock ? `\n\nThis series, as written:\n${seriesStoriesBlock}` : ''}

Recent results:
${recentResults}

${situationFlagsSection ? `═══ SITUATION FLAGS ═══\n${situationFlagsSection}\n\n` : ''}${lastNightSection ? `═══ LAST NIGHT, AS WRITTEN ═══\n${lastNightSection}\n\n` : ''}${boxScoresSection ? `═══ THE BOX SCORES ═══\n${boxScoresSection}\n\n` : ''}${penPressSection ? `═══ THE PEN, AS REPORTED ═══\n${penPressSection}\n\n` : ''}═══ ROSTER MOVES — LAST 14 DAYS ═══
${rosterMovesSection}

═══ SCHEDULE SHAPE ═══
${scheduleShapeBlock || 'Schedule shape unavailable.'}
${(() => {
  // Lookahead / getaway / travel (Jul 26): facts for letdown-lookahead spots.
  const TZ = { rays: 'ET', guardians: 'ET', tigers: 'ET', yankees: 'ET', 'red sox': 'ET', 'blue jays': 'ET', orioles: 'ET', phillies: 'ET', mets: 'ET', braves: 'ET', marlins: 'ET', nationals: 'ET', pirates: 'ET', reds: 'ET', brewers: 'CT', cubs: 'CT', 'white sox': 'CT', cardinals: 'CT', royals: 'CT', twins: 'CT', astros: 'CT', rangers: 'CT', rockies: 'MT', diamondbacks: 'MT', dodgers: 'PT', angels: 'PT', padres: 'PT', giants: 'PT', athletics: 'PT', mariners: 'PT' };
  const nameOf = (id) => {
    const row = (bdlStandings || []).find(r => r.team?.id === id);
    return row?.team?.display_name?.split(' ').pop() || null;
  };
  // TZ keys include the two-word Sox nicknames — match the FULL display name
  // against each key (Aug 19 sweep: the one-word pop meant neither Sox club
  // ever resolved a timezone and their travel lines silently dropped it).
  const tzOf = (id) => {
    const row = (bdlStandings || []).find(r => r.team?.id === id);
    const full = (row?.team?.display_name || '').toLowerCase();
    if (!full) return null;
    const key = Object.keys(TZ).find((k) => full.endsWith(k));
    return key ? TZ[key] : null;
  };
  const line = (teamId, teamName) => {
    if (!teamId || !seasonIndex?.entries) return null;
    let next = null;
    for (const [, g] of seasonIndex.entries()) {
      if (g.homeId !== teamId && g.awayId !== teamId) continue;
      if (g.seasonType === 'spring_training') continue;
      const et = toEtDate(g.date);
      if (et <= todayEtStr) continue;
      if (!next || et < next.et) next = { et, oppId: g.homeId === teamId ? g.awayId : g.homeId, hostId: g.homeId };
    }
    if (!next) return `${teamName}: no scheduled game found after today.`;
    const tomorrow = new Date(new Date(todayEtStr + 'T12:00:00').getTime() + 86400000).toISOString().slice(0, 10);
    const when = next.et === tomorrow ? 'tomorrow' : `next on ${next.et}`;
    const opp = nameOf(next.oppId) || 'TBD';
    const sameOppAsTonight = next.oppId === (teamId === homeTeamBdlId ? awayTeamBdlId : homeTeamBdlId);
    const hereTz = tzOf(homeTeamBdlId);
    const nextTz = tzOf(next.hostId);
    const travel = hereTz && nextTz && hereTz !== nextTz ? ` (${hereTz}→${nextTz})` : '';
    if (sameOppAsTonight) return `${teamName}: same series continues ${when}.`;
    return `${teamName}: new series ${when} ${next.hostId === teamId ? 'vs' : '@'} ${opp}${travel} — tonight is the getaway game of this set.`;
  };
  const out = [line(homeTeamBdlId, homeTeam), line(awayTeamBdlId, awayTeam)].filter(Boolean).join('\n');
  return out ? `\nLooking ahead:\n${out}` : '';
})()}

═══ REST & SCHEDULE SITUATION ═══
${restScheduleSection}

═══ TODAY'S BREAKING NEWS ═══
${gameContextGrounding || 'No same-day breaking news.'}
${storylinesGrounding ? `\n— THE STORYLINES —\n${storylinesGrounding}` : ''}
`.trim();

  // Token menu for Flash
  const tokenMenu = formatTokenMenu('MLB');

  // Tale of Tape (12-15 rows: SP pitching + team batting + season record)
  // Must return { text, rows } to match buildVerifiedTaleOfTape() format used by all other sports
  const tapeRows = [];
  const fmtNum = (v, d = 3) => { if (v == null) return '—'; const n = parseFloat(v); return isNaN(n) ? '—' : n.toFixed(d); };
  const fmtInt = (v) => { if (v == null) return '—'; const n = parseInt(v); return isNaN(n) ? '—' : String(n); };

  // Season Record — from BDL GOAT-tier standings
  {
    const findBdlTeamStanding = (teamName) => {
      if (!bdlStandings || bdlStandings.length === 0) return null;
      return bdlStandings.find(s =>
        clubMatches(s.team?.display_name || s.team?.full_name, teamName)
        || (s.team?.abbreviation || '').toLowerCase() === teamName.toLowerCase()) || null;
    };
    const homeBdlStanding = findBdlTeamStanding(homeTeam);
    const awayBdlStanding = findBdlTeamStanding(awayTeam);

    // Record — uses BDL `total` field (e.g., "94-68") or falls back to wins-losses
    const homeRecord = homeBdlStanding?.total || (homeBdlStanding ? `${homeBdlStanding.wins || 0}-${homeBdlStanding.losses || 0}` : '—');
    const awayRecord = awayBdlStanding?.total || (awayBdlStanding ? `${awayBdlStanding.wins || 0}-${awayBdlStanding.losses || 0}` : '—');
    tapeRows.push({ name: 'Record', token: 'RECORD', away: { team: awayTeam, value: awayRecord }, home: { team: homeTeam, value: homeRecord } });

    // L10 Record — uses BDL `last_ten_games` field (e.g., "5-5")
    const homeL10 = homeBdlStanding?.last_ten_games || '—';
    const awayL10 = awayBdlStanding?.last_ten_games || '—';
    tapeRows.push({ name: 'L10 Record', token: 'L10_RECORD', away: { team: awayTeam, value: awayL10 }, home: { team: homeTeam, value: homeL10 } });

    // Home/Away Record — uses BDL `home` and `road` fields
    const homeAtHome = homeBdlStanding?.home || '—';
    const awayOnRoad = awayBdlStanding?.road || '—';
    tapeRows.push({ name: 'Home/Away', token: 'HOME_AWAY_RECORD', away: { team: awayTeam, value: `Away: ${awayOnRoad}` }, home: { team: homeTeam, value: `Home: ${homeAtHome}` } });
  }

  // Starting Pitcher names — last name only for clean display
  {
    const getLastName = (fullName) => fullName?.split(' ').pop() || fullName;
    const awaySPName = getLastName(pitcherStats.away?.name || probablePitchersData?.away?.fullName);
    const homeSPName = getLastName(pitcherStats.home?.name || probablePitchersData?.home?.fullName);
    if (awaySPName && homeSPName) {
      tapeRows.push({ name: 'Starter', token: 'SP_NAME', away: { team: awayTeam, value: awaySPName }, home: { team: homeTeam, value: homeSPName } });
    }
  }

  // NOTE: Moneyline, Run Line, and Venue are shown on the pick card front — not in the tape

  // Starting Pitcher stats — current season (BDL) only.
  // Skip the row if either pitcher has no current-season starts. We do not
  // fall back to career: a misleading lifetime average is worse than a blank.
  {
    const awayP = pitcherStats.away || {};
    const homeP = pitcherStats.home || {};
    const bothHavePitched = (awayP.pitching_gs || 0) > 0 && (homeP.pitching_gs || 0) > 0;
    if (bothHavePitched) {
      tapeRows.push({ name: 'SP ERA', token: 'SP_ERA',
        away: { team: awayTeam, value: fmtNum(awayP.pitching_era, 2) },
        home: { team: homeTeam, value: fmtNum(homeP.pitching_era, 2) } });
      tapeRows.push({ name: 'SP WHIP', token: 'SP_WHIP',
        away: { team: awayTeam, value: fmtNum(awayP.pitching_whip, 2) },
        home: { team: homeTeam, value: fmtNum(homeP.pitching_whip, 2) } });
      tapeRows.push({ name: 'SP K/9', token: 'SP_K9',
        away: { team: awayTeam, value: fmtNum(awayP.pitching_k_per_9, 1) },
        home: { team: homeTeam, value: fmtNum(homeP.pitching_k_per_9, 1) } });
      tapeRows.push({ name: 'SP Record', token: 'SP_RECORD',
        away: { team: awayTeam, value: `${awayP.pitching_w ?? 0}-${awayP.pitching_l ?? 0}` },
        home: { team: homeTeam, value: `${homeP.pitching_w ?? 0}-${homeP.pitching_l ?? 0}` } });
      tapeRows.push({ name: 'SP IP', token: 'SP_IP',
        away: { team: awayTeam, value: fmtNum(awayP.pitching_ip, 1) },
        home: { team: homeTeam, value: fmtNum(homeP.pitching_ip, 1) } });
      tapeRows.push({ name: 'SP Starts', token: 'SP_STARTS',
        away: { team: awayTeam, value: fmtInt(awayP.pitching_gs) },
        home: { team: homeTeam, value: fmtInt(homeP.pitching_gs) } });
    }
  }

  // Team Season Stats (BDL GOAT-tier — team-level batting + pitching aggregates).
  // These rows are the current-season Team AVG/OBP/SLG/OPS/ERA/Runs view.
  // Show only when both teams have real current-season data; no fallback.
  {
    // Stale-mirror guard: early in the season BDL can echo LAST year's full-season
    // stats (a big gp weeks after opening day). The old check was a flat gp<100,
    // which became a date-bomb — by late July real gp passes 100 and the block
    // vanished (found Jul 22 2026, tape stuck at 10 rows). Only distrust big gp
    // during the opener window (Jan-Apr).
    const seasonYoung = new Date().getMonth() < 4;
    const hasReal = (s) => s && (s.gp || 0) > 0 && !(seasonYoung && (s.gp || 0) > 60);
    const hStats = hasReal(homeTeamStats) ? homeTeamStats : null;
    const aStats = hasReal(awayTeamStats) ? awayTeamStats : null;
    if (hStats && aStats) {
      tapeRows.push({ name: 'Team AVG', token: 'TEAM_AVG',
        away: { team: awayTeam, value: fmtNum(aStats.batting_avg) },
        home: { team: homeTeam, value: fmtNum(hStats.batting_avg) } });
      tapeRows.push({ name: 'Team OBP', token: 'TEAM_OBP',
        away: { team: awayTeam, value: fmtNum(aStats.batting_obp) },
        home: { team: homeTeam, value: fmtNum(hStats.batting_obp) } });
      tapeRows.push({ name: 'Team SLG', token: 'TEAM_SLG',
        away: { team: awayTeam, value: fmtNum(aStats.batting_slg) },
        home: { team: homeTeam, value: fmtNum(hStats.batting_slg) } });
      tapeRows.push({ name: 'Team OPS', token: 'TEAM_OPS',
        away: { team: awayTeam, value: fmtNum(aStats.batting_ops) },
        home: { team: homeTeam, value: fmtNum(hStats.batting_ops) } });
      tapeRows.push({ name: 'Team ERA', token: 'TEAM_ERA',
        away: { team: awayTeam, value: fmtNum(aStats.pitching_era, 2) },
        home: { team: homeTeam, value: fmtNum(hStats.pitching_era, 2) } });
      const homeRpg = hStats.batting_r != null ? (parseFloat(hStats.batting_r) / hStats.gp).toFixed(1) : null;
      const awayRpg = aStats.batting_r != null ? (parseFloat(aStats.batting_r) / aStats.gp).toFixed(1) : null;
      if (homeRpg && awayRpg) {
        tapeRows.push({ name: 'Runs/Game', token: 'RUNS_PER_GAME',
          away: { team: awayTeam, value: awayRpg },
          home: { team: homeTeam, value: homeRpg } });
      }
    }
  }

  let verifiedTaleOfTape = null;
  if (tapeRows.length > 0) {
    const col1Width = Math.max(homeTeam.length, 20);
    const headerLine = `                    ${homeTeam.padEnd(col1Width)}    ${awayTeam}`;
    const rowLines = tapeRows.map(row => {
      const label = row.name.padEnd(14);
      const homeVal = String(row.home.value).padStart(12);
      const awayVal = String(row.away.value);
      return `${label}${homeVal}  |  ${awayVal}`;
    });
    const formattedText = `TALE OF THE TAPE (VERIFIED)\n\n${headerLine}\n${rowLines.join('\n')}`;
    verifiedTaleOfTape = { text: formattedText, rows: tapeRows };
  }

  console.log(`[Scout Report] MLB report complete: ${text.length} chars, ${tapeRows.length} tape rows`);

  // Structured runs-scored history (chronological) — feeds the count-claim
  // verifier in the pick engine; same MLB Stats API games the recaps use.
  const runsFor = (games, teamName) => (games || []).map(g => {
    const isHome = clubMatches(g.teams?.home?.team?.name, teamName);
    return isHome ? (g.teams?.home?.score ?? null) : (g.teams?.away?.score ?? null);
  }).filter(r => r != null);
  const recentScores = {
    homeTeam, awayTeam,
    homeScores: runsFor(homeRecentGames, homeTeam),
    awayScores: runsFor(awayRecentGames, awayTeam),
  };

  return {
    text,
    injuries: injuriesSection || gameContextGrounding || '',
    verifiedTaleOfTape,
    recentScores,
    // The exact confirmed lineups that passed the shared BDL + official MLB
    // fallback gate. Downstream desks must reuse this object instead of
    // independently fetching a weaker lineup source.
    confirmedLineups: { home: homeData, away: awayData },
    venue: typeof venue === 'string' ? venue : venue?.name || 'Unknown',
    tokenMenu,
    homeRecord: null,
    awayRecord: null,
    // Resolved MLB Stats API gamePk — needed by pitcher tools at agent loop time.
    // Stored here so it survives the scout report disk cache (the game object
    // mutation above won't be visible on a cache hit).
    gamePk,
  };
}
