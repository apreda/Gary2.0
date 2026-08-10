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
import { getBatterXStats, getPitcherArsenal, getPitcherStatcastProfile } from '../../../baseballSavantService.js';
import {
  getTeamRoster,
  getMlbRecentGames,
  getMlbUpcomingGames,
  getProbablePitchers,
  getMlbGameLineups,
  getGameBoxScore,
  getPitcherPlatoonSplits,
  getMlbTransactions,
  getPitcherLastStarts,
  getPlayerSeasonStats,
  getPitcherMonthSplits,
  getPitcherCareerProfile,
} from '../../../mlbStatsApiService.js';
import { recentWindowLine, monthArcLine, longLayoffFlag, earlyCareerFlag, midSeasonGapFlag, singleStartDistortion, teamChangeFlags, seasonLineQualifier } from './pitcherArc.js';
import { foldName } from '../../../../utils/nameUtils.js';
import { computeMlbSeriesState, computeMlbSeasonSeries, computeMlbSeasonSeriesGroups, computeMlbScheduleShape, computeMlbRecentSeriesForm, groupGamesIntoSeries, situationalSeriesLine, toEtDate } from './mlbSeriesState.js';
import { computeHitterContact, hitterContactLine, computePitcherWhiffByStart } from './mlbContactQuality.js';
import {
  completedMlbTeamGames,
  resolveMlbGamesMissed,
  isMeaningfulMlbAbsence,
  classifyMlbInjuryContext,
  mlbGamesMissedLabel,
  isMlbPitcherPosition,
} from './mlbInjuryContext.js';

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
        const candidates = schedule.filter(g => {
          const hName = (g.teams?.home?.team?.name || '').toLowerCase();
          const aName = (g.teams?.away?.team?.name || '').toLowerCase();
          const homeLast = homeTeam.toLowerCase().split(' ').pop();
          const awayLast = awayTeam.toLowerCase().split(' ').pop();
          return hName.includes(homeLast) && aName.includes(awayLast);
        });
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
    lastGameRecaps,
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
      `Do not re-list a player's static, ongoing injured-list absence as a current storyline. Include injury context here only when there is a new status change, scratch, activation/return, rehab-role development, or other concrete new development today; the structured injury section owns absence freshness. ` +
      `Attribute reported narratives to their source. Do NOT include picks, predictions, or betting advice.`,
      { maxTokens: 2200 }
    ).then(r => r?.data || '').catch(() => ''),
    // LAST GAME, THE STORY (Jul 26 2026): our own nightly recap rows — the
    // narrative of each team's most recent game, already generated and graded.
    (async () => {
      try {
        const { supabase } = await import('../../../../supabaseClient.js');
        const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const { data } = await supabase
          .from('game_recaps')
          .select('game_date, matchup, headline, recap')
          .gte('game_date', twoDaysAgo)
          .order('game_date', { ascending: false })
          .limit(60);
        return data || [];
      } catch { return []; }
    })(),
  ]);

  console.log(`[Scout Report] BDL standings: ${bdlStandings?.length || 0} teams, BDL injuries: ${bdlInjuries?.length || 0}`);

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
  // BASEBALL SAVANT xSTATS — raw values only; the reasoning model interprets.
  // Always use current season — stale prior-year data is misleading.
  // ═══════════════════════════════════════════════════════════════════
  const xStatsSeason = season;
  const [batterXStats] = await Promise.all([
    getBatterXStats(xStatsSeason).catch(() => []),
  ]);
  console.log(`[Scout Report] Savant xStats: ${batterXStats.length} batters (${xStatsSeason} season)`);

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
  // Also fetch last game via MLB Stats API for the detailed box score (SP line, bullpen detail)
  const lastHomeGamePk = homeRecentGames?.[homeRecentGames.length - 1]?.gamePk;
  const lastAwayGamePk = awayRecentGames?.[awayRecentGames.length - 1]?.gamePk;
  const [lastHomeBoxScore, lastAwayBoxScore] = await Promise.all([
    lastHomeGamePk ? getGameBoxScore(lastHomeGamePk).catch(() => null) : null,
    lastAwayGamePk ? getGameBoxScore(lastAwayGamePk).catch(() => null) : null,
  ]);
  console.log(`[Scout Report] Box stats: ${recentBoxStats.length} player records for ${allBoxGameIds.length} games. MLB API box: ${homeTeam}=${lastHomeBoxScore ? 'Y' : 'N'}, ${awayTeam}=${lastAwayBoxScore ? 'Y' : 'N'}`);

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
    return await getCachedOrFetch(`mlb_game_story_${gamePk}`, async () => {
      const resp = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/content`);
      if (!resp.ok) return null;
      const j = await resp.json();
      const rec = j?.editorial?.recap?.mlb || j?.editorial?.wrap?.mlb || null;
      if (!rec?.body) return null;
      const clean = String(rec.body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return { headline: rec.headline || '', body: clean.slice(0, 4000) };
    }, 7 * 24 * 60).catch(() => null);
  };

  const sentenceTrim = (body, cap) => {
    const str = String(body || '');
    if (str.length <= cap) return str;
    const cut = str.slice(0, cap);
    const end = cut.lastIndexOf('. ');
    return end > cap * 0.5 ? cut.slice(0, end + 1) : cut;
  };

  let probablePitchersSection = 'Probable pitchers not yet announced.';
  const pitcherStats = {};
  const pitcherArcData = {}; // per-side career/season provenance for the SAMPLE CONTEXT flags

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
        const [arsenal, platoon, contact, seasonPitching, lastStarts, monthSplits, careerProfile] = await Promise.all([
          getPitcherArsenal(mlbamId ?? pitcher.fullName, season).catch(() => null),
          mlbamId ? getPitcherPlatoonSplits(mlbamId, season).catch(() => null) : Promise.resolve(null),
          getPitcherStatcastProfile(mlbamId ?? pitcher.fullName, season).catch(() => null),
          mlbamId ? getPlayerSeasonStats(mlbamId, season, 'pitching').catch(() => null) : Promise.resolve(null),
          mlbamId ? getPitcherLastStarts(mlbamId, season, 6).catch(() => []) : Promise.resolve([]),
          mlbamId ? getPitcherMonthSplits(mlbamId, season).catch(() => []) : Promise.resolve([]),
          mlbamId ? getPitcherCareerProfile(mlbamId).catch(() => null) : Promise.resolve(null),
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
          // Fuse the sample qualifier INTO the season line's parenthetical
          // (founder GO, Aug 10) — the aggregate can't be quoted without it.
          if (seasonLineIdx != null) {
            const qual = seasonLineQualifier({ season, firstStartDate: pitcherArcData[side].firstStartDate, starts: allStarts });
            if (qual) parts[seasonLineIdx] = parts[seasonLineIdx].replace(/ starts\)$/, ` starts${qual})`);
          }
        }

        if (lastStarts.length) {
          // Start-by-start ledger w/ the TEAM's result in each (Jul 30,
          // founder: "team is 7-1 in his last 8" must arrive as the raw
          // ledger — dates, opponents, his line, who won — so the brain can
          // weigh WHY, not inherit a headline).
          const fmtStart = (g) => `${g.date} ${g.isHome ? 'vs' : '@'} ${g.opponent}: ${g.ip}IP ${g.h}H ${g.er}ER ${g.k}K${g.bb ? ` ${g.bb}BB` : ''}${g.hr ? ` ${g.hr}HR` : ''}${g.pitches ? ` ${g.pitches}p` : ''}${g.win == null ? '' : g.win ? ' (team W)' : ' (team L)'}`;
          parts.push(`  Last ${lastStarts.length} start${lastStarts.length === 1 ? '' : 's'}: ${lastStarts.slice().reverse().map(fmtStart).join(' | ')}`);
          // The ledger's own arithmetic (Aug 4) — the recent window as a
          // number, as citable as the season figure above it.
          const rw = recentWindowLine(lastStarts, 3);
          if (rw) parts.push(`  ${rw}`);
          const decided = lastStarts.filter((g) => g.win != null);
          if (decided.length >= 3) {
            const w = decided.filter((g) => g.win).length;
            parts.push(`  Team in these ${decided.length} starts: ${w}-${decided.length - w}`);
          }
          // Innings arc (Jul 26): stretching out vs managed down, as bare IP.
          if (lastStarts.length >= 2) {
            parts.push(`  IP by start (oldest→newest): ${lastStarts.map(g => g.ip ?? '?').join(', ')}`);
          }
          // HIS LAST START, AS WRITTEN (founder GO, Aug 10): the official
          // game story rides the ledger's newest row — the distortion flag's
          // device, now on every starter, because "5.2IP 1ER" can't say how
          // the outing actually went.
          const lastPk = lastStarts[lastStarts.length - 1]?.gamePk;
          if (lastPk) {
            const st = await fetchGameStory(lastPk).catch(() => null);
            if (st?.body) parts.push(`  His last start, as written: ${sentenceTrim(String(st.body).replace(/\s*\n+\s*/g, ' '), 1200)}`);
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
        const press = pressRaw ? sentenceTrim(pressRaw.replace(/\s*\n+\s*/g, ' '), 4000) : '';
        if (press && press.length > 60 && !/^(no|none|unverified)\b/i.test(press)) {
          parts.push(`  His recent work, as written: ${press}`);
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
    smallSampleFlags.push(...teamChangeFlags({
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
    }));
  })).catch(() => {});

  const smallSampleFlagsSection = smallSampleFlags.length
    ? smallSampleFlags.join('\n')
    : 'No mid-season team changes or home debuts for tonight\'s starting pitchers.';

  // (DIVISION STANDINGS section REMOVED — founder, Aug 5 2026: "do we need
  // league standings at all? doesn't seem relevant to picking each game
  // night by night." THE STAKES lines + the tape's season-record row are
  // the surviving standings surface; the bdlStandings fetch stays for them
  // and the schedule lookahead.)

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
    const oppWord = (oppNick || '').toLowerCase().split(' ').pop();
    for (let i = finals.length - 1; i >= 0; i--) {
      const g = finals[i];
      const names = [g.teams?.home?.team?.name, g.teams?.away?.team?.name].map(n => (n || '').toLowerCase());
      if (!names.some(n => n.endsWith(oppWord))) break;
      picked.set(g.gamePk, g);
    }
    return [...picked.values()].sort((a, b) => new Date(a.gameDate || a.officialDate || 0) - new Date(b.gameDate || b.officialDate || 0));
  };
  const wireLabel = (g, teamNick) => {
    const word = (teamNick || '').toLowerCase().split(' ').pop();
    const homeSide = (g.teams?.home?.team?.name || '').toLowerCase().endsWith(word);
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
  const wireSection = (() => {
    const inHome = (pk) => homeWireGames.some(g => g.gamePk === pk);
    const inAway = (pk) => awayWireGames.some(g => g.gamePk === pk);
    const union = [...new Map([...homeWireGames, ...awayWireGames].map(g => [g.gamePk, g])).values()]
      .sort((a, b) => new Date(a.gameDate || a.officialDate || 0) - new Date(b.gameDate || b.officialDate || 0));
    const lastPkOf = (arr) => (arr.length ? arr[arr.length - 1].gamePk : null);
    const fullPks = new Set([lastPkOf(homeWireGames), lastPkOf(awayWireGames)].filter(Boolean));
    const entries = [];
    for (const g of union) {
      const story = wireStoryByPk.get(g.gamePk);
      if (!story) continue;
      const label = inHome(g.gamePk) && inAway(g.gamePk)
        ? `These two, ${String(g.officialDate || g.gameDate || '').slice(0, 10)}`
        : wireLabel(g, inHome(g.gamePk) ? homeTeam : awayTeam);
      const body = sentenceTrim(story.body, fullPks.has(g.gamePk) ? 2000 : 650);
      entries.push(`${label} — ${story.headline}\n${body}`);
    }
    if (entries.length) return entries.join('\n\n');
    // Fallback: our own recap rows, Gary-sentences stripped (pre-Aug 5 behavior).
    const cleanBody = (row) => String(row.recap || '')
      .split(/(?<=[.!?])\s+/)
      .filter(sent => sent && !/gary/i.test(sent))
      .slice(0, 3).join(' ');
    const findRow = (nick) => {
      const lw = nick.toLowerCase().split(' ').pop();
      return (lastGameRecaps || []).find(r => (r.matchup || '').toLowerCase().includes(lw)) || null;
    };
    const h = findRow(homeTeam);
    const a = findRow(awayTeam);
    if (h && a && h === a) return `These two, last night — ${h.headline || ''}\n  ${cleanBody(h)}`;
    const line = (nick, row) => (row ? `${nick} — ${row.headline || ''}\n  ${cleanBody(row)}` : null);
    return [line(homeTeam, h), line(awayTeam, a)].filter(Boolean).join('\n') || 'No game stories available.';
  })();

  // LAST NIGHT, AS WRITTEN (founder GO, Aug 10): each club's most recent
  // final's official story rides IN TONIGHT with the decision inputs — the
  // weekend receipt was a 12-inning war both pens paid for that lived only
  // at the desk's tail, where 45 straight reads never quoted from. The full
  // week stays in THE WIRE; this is the one-game cut, up front. A shared
  // game ("These two") prints once. Fail-open: no story, no line.
  const lastNightSection = (() => {
    const homeLast = homeWireGames[homeWireGames.length - 1] || null;
    const awayLast = awayWireGames[awayWireGames.length - 1] || null;
    const entries = [];
    if (homeLast && awayLast && homeLast.gamePk === awayLast.gamePk) {
      const story = wireStoryByPk.get(homeLast.gamePk);
      if (story) entries.push(`These two, ${String(homeLast.officialDate || homeLast.gameDate || '').slice(0, 10)} — ${story.headline}\n${sentenceTrim(story.body, 1200)}`);
    } else {
      for (const [g, nick] of [[awayLast, awayTeam], [homeLast, homeTeam]]) {
        const story = g && wireStoryByPk.get(g.gamePk);
        if (story) entries.push(`${wireLabel(g, nick)} — ${story.headline}\n${sentenceTrim(story.body, 1200)}`);
      }
    }
    return entries.join('\n\n');
  })();

  // SITUATIONAL BOXSCORE (founder GO, Aug 10 — "what actually happens in
  // the games"): per-game team RISP, LOB, and the pen arms with decision
  // notes, from the official boxscore. Finals are immutable → 7d cache.
  const fetchGameSituational = async (gamePk) => {
    if (!gamePk) return null;
    return await getCachedOrFetch(`mlb_game_situ_${gamePk}`, async () => {
      const resp = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
      if (!resp.ok) return null;
      const j = await resp.json();
      const side = (s) => {
        const t = j?.teams?.[s];
        if (!t) return null;
        let risp = null;
        for (const blk of t.info || []) {
          for (const f of blk.fieldList || []) {
            if (f.label === 'Team RISP') risp = String(f.value || '').replace(/\.$/, '');
          }
        }
        // pitchers[] is appearance order — everyone after the first arm is
        // the pen (an opener's bulk guy lands here too; the note says what
        // each appearance actually was).
        const pen = (t.pitchers || []).slice(1).map((pid) => {
          const p = t.players?.[`ID${pid}`];
          const st = p?.stats?.pitching || {};
          return {
            name: String(p?.person?.fullName || '?').split(' ').pop(),
            note: st.note || null,
            er: st.earnedRuns ?? null,
          };
        });
        return { name: t.team?.name || '', lob: t.teamStats?.batting?.leftOnBase ?? null, risp, pen };
      };
      return { away: side('away'), home: side('home') };
    }, 7 * 24 * 60).catch(() => null);
  };

  // THIS SERIES + LAST SERIES, SITUATIONALLY (founder GO, Aug 10): the
  // series grain baseball is played in, game by game, arms named. A game
  // with no boxscore, or a club with no rows, simply prints nothing.
  const situationalBlock = await (async () => {
    try {
      const fmtD = (iso) => {
        const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
        return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10)
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      };
      const rowsFor = async (games, nick) => {
        const word = nick.toLowerCase().split(' ').pop();
        const out = [];
        for (const g of (games || []).slice(-3)) {
          if (!g?.gamePk) continue;
          const box = await fetchGameSituational(g.gamePk);
          if (!box) continue;
          const us = (box.home?.name || '').toLowerCase().endsWith(word) ? box.home : box.away;
          if (!us) continue;
          const mySide = (g.teams?.home?.team?.name || '').toLowerCase().endsWith(word) ? 'home' : 'away';
          const myRuns = g.teams?.[mySide]?.score;
          const theirRuns = g.teams?.[mySide === 'home' ? 'away' : 'home']?.score;
          const oneRun = myRuns != null && theirRuns != null && Math.abs(myRuns - theirRuns) === 1;
          const penEvents = (us.pen || []).filter(p => p.note || (Number(p.er) || 0) > 0);
          out.push({ date: fmtD(g.officialDate || g.gameDate), risp: us.risp, lob: us.lob, oneRun, penEvents });
        }
        return out;
      };
      const nickOf = (name) => String(name || '').split(' ').pop();
      const lines = [];
      for (const [games, nick, oppNick] of [[homeRecentGames, homeTeam, awayTeam], [awayRecentGames, awayTeam, homeTeam]]) {
        const groups = groupGamesIntoSeries(games, nick);
        const cur = groups[groups.length - 1] || null;
        const prev = groups[groups.length - 2] || null;
        const oppWord = oppNick.toLowerCase().split(' ').pop();
        const curIsTonight = cur && cur.opp.toLowerCase().endsWith(oppWord);
        if (curIsTonight) {
          const l1 = situationalSeriesLine(`${nick}, this series`, await rowsFor(cur.games, nick));
          if (l1) lines.push(l1);
          if (prev) {
            const l2 = situationalSeriesLine(`${nick}, last series (${prev.home ? 'vs' : '@'} ${nickOf(prev.opp)})`, await rowsFor(prev.games, nick));
            if (l2) lines.push(l2);
          }
        } else if (cur) {
          const l = situationalSeriesLine(`${nick}, last series (${cur.home ? 'vs' : '@'} ${nickOf(cur.opp)})`, await rowsFor(cur.games, nick));
          if (l) lines.push(l);
        }
      }
      return lines.join('\n');
    } catch { return ''; }
  })();

  // RECENT FORM, SERIES-SHAPED (founder, Aug 10): windows cut at series
  // boundaries with the opponent named — a flat "last 7" silently spans
  // three different clubs, and Gary has to see that context.
  const recentSeriesBlock = [
    [homeRecentGames, homeTeam], [awayRecentGames, awayTeam],
  ].map(([games, nick]) => {
    const line = computeMlbRecentSeriesForm(games, nick, 4, nick === homeTeam ? awayTeam : homeTeam);
    return line ? `${nick}: ${line}` : null;
  }).filter(Boolean).join('\n');

  // THE TAPE prefetch: scoring flows for the recent games shown below —
  // one cached single-game fetch each (curated scoring_summary field).
  // A failed fetch just omits that game's flow line.
  const scoringFlowById = new Map();
  {
    const wanted = new Set();
    for (const g of [...(homeRecentGames || []).slice(-4), ...(awayRecentGames || []).slice(-4)]) {
      const id = resolveBdlId(g, g && (homeRecentGames || []).includes(g) ? homeBdlGames : awayBdlGames) ?? resolveBdlId(g, homeBdlGames) ?? resolveBdlId(g, awayBdlGames);
      if (id != null) wanted.add(id);
    }
    await Promise.all([...wanted].map(async (id) => {
      try {
        const flow = await ballDontLieService.getMlbGameScoringFlow(id);
        if (flow && flow.length) scoringFlowById.set(id, flow);
      } catch { /* tape optional */ }
    }));
  }

  let recentPerformanceSection = '';
  {
    const lastWord = (name) => name.toLowerCase().split(' ').pop();

    // Build per-game recap from BDL box stats + game result
    const formatGameRecap = (game, teamName, bdlCandidates) => {
      if (!game) return null;
      const tLast = lastWord(teamName);
      const homeName = (game.teams?.home?.team?.name || '').toLowerCase();
      const isHome = homeName.includes(tLast);
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
        .filter(s => (s.team_name || '').toLowerCase().includes(tLast));
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
        // Full batting lineup — every hitter who had an at-bat, in batting order
        const hitters = gameStats.filter(s => s.at_bats != null && s.at_bats > 0)
          .sort((a, b) => (b.total_bases || 0) - (a.total_bases || 0));
        for (const h of hitters) {
          let extras = [];
          if (h.hr > 0) extras.push(`${h.hr}HR`);
          if (h.doubles > 0) extras.push(`${h.doubles}2B`);
          if (h.rbi > 0) extras.push(`${h.rbi}RBI`);
          if (h.runs > 0) extras.push(`${h.runs}R`);
          if (h.bb > 0) extras.push(`${h.bb}BB`);
          if (h.k > 0) extras.push(`${h.k}K`);
          if (h.stolen_bases > 0) extras.push(`${h.stolen_bases}SB`);
          keyHitters.push(`${h.player?.last_name || '?'} ${h.hits}-${h.at_bats}${extras.length ? ' ' + extras.join(' ') : ''}`);
        }
      }

      let recap = `  ${date}: ${wl} ${teamScore}-${oppScore} ${loc} ${oppName}`;
      if (spLine) recap += `\n    ${spLine}`;
      if (bullpenLines.length) recap += `\n    Bullpen: ${bullpenLines.join(' | ')}`;
      if (keyHitters.length) recap += `\n    Batting: ${keyHitters.join(' | ')}`;
      // THE TAPE (Jul 26): how the runs actually arrived — the game's scoring
      // flow from play-by-play, inning by inning. Facts verbatim from the feed.
      const flow = bdlId != null ? scoringFlowById.get(bdlId) : null;
      if (flow && flow.length) recap += `\n    How it went: ${flow.slice(0, 14).join(' · ')}`;
      return recap;
    };

    // L5/L10 aggregate
    const aggregateGames = (games, teamName, count) => {
      if (!games || games.length === 0) return null;
      const slice = games.slice(-count);
      let wins = 0, losses = 0, runsFor = 0, runsAgainst = 0;
      const tLast = lastWord(teamName);
      for (const g of slice) {
        const homeName = (g.teams?.home?.team?.name || '').toLowerCase();
        const homeScore = g.teams?.home?.score ?? 0;
        const awayScore = g.teams?.away?.score ?? 0;
        const isHome = homeName.includes(tLast);
        if (isHome) {
          runsFor += homeScore; runsAgainst += awayScore;
          homeScore > awayScore ? wins++ : losses++;
        } else {
          runsFor += awayScore; runsAgainst += homeScore;
          awayScore > homeScore ? wins++ : losses++;
        }
      }
      const gp = slice.length;
      return gp > 0 ? `${wins}-${losses} (${(runsFor / gp).toFixed(1)} R/G, ${(runsAgainst / gp).toFixed(1)} RA/G)` : null;
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
      // L5/L10: aggregates
      const l5 = aggregateGames(games, teamName, 5);
      const l10 = aggregateGames(games, teamName, 10);
      if (l5) lines.push(`  [L5 aggregate] ${l5}`);
      if (l10) lines.push(`  [L10 aggregate] ${l10}`);
      return lines.join('\n');
    };

    recentPerformanceSection = [formatTeamRecent(homeTeam, homeRecentGames, homeBdlGames), formatTeamRecent(awayTeam, awayRecentGames, awayBdlGames)].join('\n\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // THIS SERIES — WHO'S DOING WHAT (Jul 26 2026): per-player aggregates over
  // the current series' games, from the same box rows as RECENT FORM.
  // ═══════════════════════════════════════════════════════════════════
  let thisSeriesHotSection = '';
  try {
    const pairGame = (g) => {
      const an = (g?.teams?.away?.team?.name || '').toLowerCase();
      const hn = (g?.teams?.home?.team?.name || '').toLowerCase();
      const hl = homeTeam.toLowerCase().split(' ').pop();
      const al = awayTeam.toLowerCase().split(' ').pop();
      return (an.includes(al) && hn.includes(hl)) || (an.includes(hl) && hn.includes(al));
    };
    const seriesGames = [];
    for (let i = (homeRecentGames || []).length - 1; i >= 0; i--) {
      if (pairGame(homeRecentGames[i])) seriesGames.unshift(homeRecentGames[i]);
      else break;
    }
    if (seriesGames.length >= 1 && recentBoxStatsById.size > 0) {
      const perTeam = new Map(); // teamLastWord -> Map(player -> agg)
      for (const g of seriesGames) {
        const bdlId = resolveBdlId(g, homeBdlGames);
        const rows = (bdlId != null && recentBoxStatsById.get(bdlId)) || [];
        for (const r of rows) {
          const tKey = (r.team_name || '').toLowerCase().split(' ').pop();
          if (!perTeam.has(tKey)) perTeam.set(tKey, new Map());
          const players = perTeam.get(tKey);
          const nm = r.player?.last_name || '?';
          if (!players.has(nm)) players.set(nm, { ab: 0, h: 0, hr: 0, rbi: 0, ip: 0, er: 0, k: 0 });
          const a = players.get(nm);
          a.ab += r.at_bats || 0; a.h += r.hits || 0; a.hr += r.hr || 0; a.rbi += r.rbi || 0;
          a.ip += parseFloat(r.ip || 0) || 0; a.er += r.er || 0; a.k += r.p_k || 0;
        }
      }
      const teamLine = (nick) => {
        const players = perTeam.get(nick.toLowerCase().split(' ').pop());
        if (!players) return null;
        const bats = [...players.entries()].filter(([, a]) => a.ab > 0)
          .sort((x, y) => (y[1].h + y[1].hr * 2) - (x[1].h + x[1].hr * 2)).slice(0, 5)
          .map(([nm, a]) => `${nm} ${a.h}-${a.ab}${a.hr ? ` ${a.hr}HR` : ''}${a.rbi ? ` ${a.rbi}RBI` : ''}`);
        const arms = [...players.entries()].filter(([, a]) => a.ip > 0)
          .sort((x, y) => y[1].ip - x[1].ip).slice(0, 3)
          .map(([nm, a]) => `${nm} ${a.ip.toFixed(1)}IP ${a.er}ER ${a.k}K`);
        const bits = [];
        if (bats.length) bits.push(`Bats: ${bats.join(' | ')}`);
        if (arms.length) bits.push(`Arms: ${arms.join(' | ')}`);
        return bits.length ? `${nick} this series — ${bits.join('  ·  ')}` : null;
      };
      thisSeriesHotSection = [teamLine(homeTeam), teamLine(awayTeam)].filter(Boolean).join('\n');
    }
  } catch { thisSeriesHotSection = ''; }

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
    const recordOf = (teamNameStr) => {
      const tn = String(teamNameStr || '').toLowerCase();
      const row = (bdlStandings || []).find(st => {
        const dn = (st.team?.display_name || st.team?.full_name || '').toLowerCase();
        return dn && (tn === dn || tn.endsWith(dn.split(' ').pop()));
      });
      return row ? ` (${row.wins}-${row.losses})` : '';
    };
    const formatRecentGames = (games, teamName) => {
      if (!games || games.length === 0) return `${teamName}: No recent games`;
      const lw = teamName.toLowerCase().split(' ').pop();
      const lines = games.map(g => {
        const home = g.teams?.home;
        const away = g.teams?.away;
        const date = g.officialDate || g.gameDate?.split('T')[0] || '';
        const homeIsUs = (home?.team?.name || '').toLowerCase().endsWith(lw);
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
      const lw = teamName.toLowerCase().split(' ').pop();
      const per = rows.map(g => {
        const homeSide = (g.teams.home?.team?.name || '').toLowerCase().endsWith(lw);
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
      const oppLastWord = opponentName.toLowerCase().split(' ').pop();
      let seriesGames = 0;
      for (let i = recentGames.length - 1; i >= 0; i--) {
        const g = recentGames[i];
        const homeT = (g?.teams?.home?.team?.name || '').toLowerCase();
        const awayT = (g?.teams?.away?.team?.name || '').toLowerCase();
        if (homeT.includes(oppLastWord) || awayT.includes(oppLastWord)) {
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

  // ═══════════════════════════════════════════════════════════════════
  // LAST GAME (DETAILED — full box score from most recent completed game)
  // ═══════════════════════════════════════════════════════════════════
  let lastGameSection = '';
  {
    /**
     * Format a detailed box score for a team's last game.
     * Uses MLB Stats API boxscore data (teams.home/away.players with stats.pitching / stats.batting).
     */
    const formatDetailedLastGame = (teamName, recentGames, boxScoreData) => {
      if (!recentGames || recentGames.length === 0) {
        return `${teamName}: No recent game data`;
      }
      const lastGame = recentGames[recentGames.length - 1];
      const homeT = lastGame?.teams?.home;
      const awayT = lastGame?.teams?.away;
      if (!homeT || !awayT) return `${teamName}: Last game data incomplete`;

      const homeScore = homeT.score ?? '?';
      const awayScore = awayT.score ?? '?';
      const homeName = homeT.team?.name || 'Home';
      const awayName = awayT.team?.name || 'Away';
      const date = lastGame.officialDate || lastGame.gameDate?.split('T')[0] || '';
      const dateFormatted = date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

      // Determine if this team was home or away, and W/L
      const teamLastWord = teamName.toLowerCase().split(' ').pop();
      const wasHome = homeName.toLowerCase().includes(teamLastWord);
      const teamScore = wasHome ? homeScore : awayScore;
      const oppScore = wasHome ? awayScore : homeScore;
      const oppName = wasHome ? awayName : homeName;
      const result = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T';
      const prefix = wasHome ? 'vs' : '@';

      // Header line
      const headerLine = `${teamName}: ${result} ${teamScore}-${oppScore} ${prefix} ${oppName} (${dateFormatted})`;

      // If no box score data, fall back to basic line
      if (!boxScoreData) {
        return headerLine;
      }

      // Extract this team's side from the box score
      const teamSide = wasHome ? 'home' : 'away';
      const teamBoxData = boxScoreData.teams?.[teamSide];
      if (!teamBoxData) return headerLine;

      const players = teamBoxData.players || {};
      const pitcherIds = teamBoxData.pitchers || [];
      const batterIds = teamBoxData.batters || [];

      // ── Starting Pitcher (first pitcher listed) ──
      let spLine = '';
      const relievers = [];
      for (let i = 0; i < pitcherIds.length; i++) {
        const p = players[`ID${pitcherIds[i]}`];
        if (!p) continue;
        const pStats = p.stats?.pitching;
        if (!pStats || (pStats.inningsPitched === '0.0' && !pStats.outs)) continue;
        const name = p.person?.fullName?.split(' ').pop() || p.person?.fullName || 'Unknown';
        const ip = pStats.inningsPitched || '0.0';
        const h = pStats.hits ?? 0;
        const r = pStats.runs ?? 0;
        const er = pStats.earnedRuns ?? 0;
        const bb = pStats.baseOnBalls ?? 0;
        const k = pStats.strikeOuts ?? 0;

        if (i === 0) {
          // Starting pitcher — full line
          spLine = `  SP: ${name} ${ip} IP, ${h}H, ${er}ER, ${bb}BB, ${k}K`;
        } else {
          // Reliever — compact line
          const sv = pStats.saves > 0 ? ' (SV)' : '';
          const hld = pStats.holds > 0 ? ' (HLD)' : '';
          const bs = pStats.blownSaves > 0 ? ' (BS)' : '';
          const tag = sv || hld || bs;
          relievers.push(`${name} ${ip} IP, ${er}ER${tag}`);
        }
      }

      // ── Bullpen line ──
      let bullpenLine = '';
      if (relievers.length > 0) {
        bullpenLine = `  Bullpen: ${relievers.join(' | ')}`;
      }

      // ── Key Hitters (anyone with 1+ hits) ──
      const hitters = [];
      for (const batterId of batterIds) {
        const p = players[`ID${batterId}`];
        if (!p) continue;
        const bStats = p.stats?.batting;
        if (!bStats) continue;
        const hits = parseInt(bStats.hits) || 0;
        const ab = parseInt(bStats.atBats) || 0;
        if (hits === 0 || ab === 0) continue;
        const name = p.person?.fullName?.split(' ').pop() || p.person?.fullName || 'Unknown';
        const hr = parseInt(bStats.homeRuns) || 0;
        const rbi = parseInt(bStats.rbi) || 0;
        const bb = parseInt(bStats.baseOnBalls) || 0;
        const doubles = parseInt(bStats.doubles) || 0;
        const triples = parseInt(bStats.triples) || 0;
        const sb = parseInt(bStats.stolenBases) || 0;

        let extras = '';
        if (hr > 0) extras += ` ${hr}HR`;
        if (rbi > 0) extras += ` ${rbi}RBI`;
        if (doubles > 0) extras += ` ${doubles}2B`;
        if (triples > 0) extras += ` ${triples}3B`;
        if (bb > 0) extras += ` ${bb}BB`;
        if (sb > 0) extras += ` ${sb}SB`;

        hitters.push({ name, hits, ab, extras: extras.trim(), totalBases: hits + doubles + triples * 2 + hr * 3 });
      }
      // Sort by total bases descending (most impactful hitters first)
      hitters.sort((a, b) => b.totalBases - a.totalBases);
      const keyHittersLine = hitters.length > 0
        ? `  Key Hitters: ${hitters.slice(0, 6).map(h => `${h.name} ${h.hits}-${h.ab}${h.extras ? ' ' + h.extras : ''}`).join(' | ')}`
        : '  Key Hitters: None (0 hits)';

      // ── Team Totals (from linescore if available) ──
      const linescore = lastGame.linescore?.teams?.[teamSide];
      let totalsLine = '';
      if (linescore) {
        const runs = linescore.runs ?? teamScore;
        const totalHits = linescore.hits ?? '?';
        const errors = linescore.errors ?? '?';
        totalsLine = `  Team: ${runs}R, ${totalHits}H, ${errors}E`;
      }

      // Assemble
      const lines = [headerLine];
      if (spLine) lines.push(spLine);
      if (bullpenLine) lines.push(bullpenLine);
      lines.push(keyHittersLine);
      if (totalsLine) lines.push(totalsLine);
      return lines.join('\n');
    };

    const homeLast = formatDetailedLastGame(homeTeam, homeRecentGames, lastHomeBoxScore);
    const awayLast = formatDetailedLastGame(awayTeam, awayRecentGames, lastAwayBoxScore);
    lastGameSection = `${homeLast}\n\n${awayLast}`;
  }

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
  const formatLineup = (teamData, teamName) => {
    if (!teamData || teamData.batters.length === 0) return `${teamName}: Not yet posted`;
    let out = `${teamName}:\n`;
    out += teamData.batters.map(b => `  ${b.battingOrder}. ${b.name} (${b.position}) [Bats: ${b.batsThrows?.split('/')[0] || '?'}]`).join('\n');
    if (teamData.pitcher) out += `\n  SP: ${teamData.pitcher.name} (Throws: ${teamData.pitcher.batsThrows?.split('/')[1] || '?'})`;
    return out;
  };
  const matchLineupSide = (data, abbr, teamName) =>
    data?.[abbr] || Object.values(data || {}).find(t => t.teamName?.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()));
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

  if (homeData || awayData) {
    confirmedLineupsSection = [formatLineup(homeData, homeTeam), formatLineup(awayData, awayTeam)].join('\n\n');
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
    throw new Error(`[Scout Report] HARD FAIL — MLB requires lineups + starting pitchers for ${awayTeam} @ ${homeTeam} (checked BDL + MLB Stats API). Missing: ${missing.join(', ')}. Run picks closer to game time (per BDL docs, lineups typically appear 1-2 hours before first pitch — the T-90 tier can race the posting; later tiers pick it up).`);
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

  // ═══════════════════════════════════════════════════════════════════
  // LINEUP RECENT BATTING — last 7 / 15 day rolls for tonight's starters
  // (Jul 22 2026, founder-approved: a fan always knows who is 12-for-28
  // this week; the desk served only season xStats + raw box lines. BDL
  // splits byDayMonth, one cached call per starter. Facts only — no
  // hot/cold labels; the reasoning model decides what a roll means.)
  // ═══════════════════════════════════════════════════════════════════
  const isDayGame = startTime
    ? parseInt(new Date(startTime).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10) < 17
    : false;

  // CONTACT QUALITY, LAST ~7 (Jul 27): per-hitter Statcast aggregates over
  // both teams' recent finals — loud-contact-unlucky vs genuinely-lost is
  // visible instead of inferred. One cached fetch per game, shared by every
  // hitter in it; failures just omit the clause.
  let contactByPid = new Map();
  try {
    const recentGameIds = [
      ...homeBdlGames.slice(-7).map(g => g.id),
      ...awayBdlGames.slice(-7).map(g => g.id),
    ];
    const lineupHitterIds = [...(homeData?.batters || []), ...(awayData?.batters || [])]
      .map(b => b?.playerId).filter(id => id != null);
    if (recentGameIds.length && lineupHitterIds.length) {
      contactByPid = await computeHitterContact({ gameIds: recentGameIds, hitterIds: lineupHitterIds });
    }
  } catch { /* contact layer optional */ }

  const battingRollFor = async (batter) => {
    if (batter?.playerId == null) return null;
    try {
      const splits = await ballDontLieService.getMlbPlayerSplits({ playerId: batter.playerId, season });
      const rows = splits?.byDayMonth || [];
      const roll = (name) => rows.find(r => r.category === 'batting' && r.split_name === name);
      const fmt = (r) => r && r.at_bats > 0
        ? `${r.hits}-${r.at_bats}, ${r.home_runs || 0} HR, ${r.rbis ?? r.rbi ?? 0} RBI, ${r.avg ?? '?'} AVG/${r.ops ?? '?'} OPS`
        : null;
      const l7 = fmt(roll('Last 7 Days'));
      const l15 = fmt(roll('Last 15 Days'));
      // Day games only: the batter's day-game season line rides along (same
      // splits response, byBreakdown) — a fan checks it for a 1 PM start.
      let dayBit = '';
      if (isDayGame) {
        const day = (splits?.byBreakdown || []).find(r => r.category === 'batting' && r.split_name === 'Day');
        if (day && day.at_bats > 0) dayBit = ` | Day games: ${day.hits}-${day.at_bats}, ${day.avg ?? '?'} AVG/${day.ops ?? '?'} OPS`;
      }
      const contact = hitterContactLine(contactByPid.get(String(batter.playerId)));
      const contactBit = contact ? `\n     Contact (recent): ${contact}` : '';
      if (!l7 && !l15 && !dayBit && !contactBit) return null;
      return `  ${batter.battingOrder}. ${batter.name}: ${l7 ? `L7 ${l7}` : ''}${l7 && l15 ? ' | ' : ''}${l15 ? `L15 ${l15}` : ''}${dayBit}${contactBit}`;
    } catch { return null; }
  };
  const battingRollsFor = async (data, teamName) => {
    const lines = (await Promise.all((data?.batters || []).map(battingRollFor))).filter(Boolean);
    return lines.length ? `${teamName}:\n${lines.join('\n')}` : null;
  };
  const [homeBattingRolls, awayBattingRolls] = await Promise.all([
    battingRollsFor(homeData, homeTeam),
    battingRollsFor(awayData, awayTeam),
  ]);
  const lineupRecentBattingSection = [homeBattingRolls, awayBattingRolls].filter(Boolean).join('\n\n')
    || 'Recent batting rolls unavailable for tonight\'s starters.';

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
      const lw = teamName.toLowerCase().split(' ').pop();
      const row = (bdlStandings || []).find(st =>
        (st.team?.display_name || st.team?.full_name || '').toLowerCase().includes(lw));
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
  }

  // ═══════════════════════════════════════════════════════════════════
  // xSTATS (Baseball Savant) — raw values only; the reasoning model interprets.
  // ═══════════════════════════════════════════════════════════════════
  let xStatsSection = '';
  {
    const findXStats = (data, name) => {
      if (!name || !data.length) return null;
      const lastName = name.split(' ').pop()?.toLowerCase();
      const firstName = name.split(' ')[0]?.toLowerCase();
      return data.find(p => {
        const pLast = (p.last_name || '').toLowerCase();
        const pFirst = (p.first_name || '').toLowerCase();
        return pLast === lastName && (pFirst.startsWith(firstName?.substring(0, 3)) || firstName?.startsWith(pFirst.substring(0, 3)));
      }) || data.find(p => (p.last_name || '').toLowerCase() === lastName) || null;
    };

    const lines = [];

    // xERA REMOVED ENTIRELY (founder ruling, Aug 10 — "we need to not be
    // using stats we ourselves don't believe in": it loses to SIERA
    // predictively, K-BB% beats them all, and the model clung to it in
    // losing reads). No pitcher expected-stats line at all; K, BB, results
    // and the arc carry the pitcher. Batter xwOBA stays — with a 100 PA
    // floor, because under that the number is noise and Gary should simply
    // never see it (his call: strip, don't caveat).
    const XWOBA_MIN_PA = 100;

    // Key batter xStats (top 3 per team from roster if available)
    for (const [teamName, roster] of [[homeTeam, homeRoster], [awayTeam, awayRoster]]) {
      const hitters = (roster || []).filter(p => p.positionType !== 'Pitcher').slice(0, 4);
      const xLines = [];
      for (const h of hitters) {
        const x = findXStats(batterXStats,h.name);
        if (x && Number(x.pa) >= XWOBA_MIN_PA) {
          xLines.push(`  ${h.name}: BA ${x.ba} | SLG ${x.slg} | xwOBA ${x.est_woba} (${x.pa} PA)`);
        }
      }
      if (xLines.length > 0) {
        lines.push(`${teamName} Key Hitters:`);
        lines.push(...xLines);
      }
    }

    if (lines.length > 0) {
      xStatsSection = lines.join('\n');
      console.log(`[Scout Report] Savant xStats section: ${lines.length} lines`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SERIES CONTEXT (simple one-liner for the header)
  // ═══════════════════════════════════════════════════════════════════
  let seriesLine = '';
  {
    // Detect current series by looking at recent games between these two teams
    const homeLast = lastWord(homeTeam);
    const awayLast = lastWord(awayTeam);
    const recentAll = [...(homeRecentGames || [])].reverse(); // most recent first
    let seriesGames = 0;
    let homeWins = 0;
    let awayWins = 0;
    for (const g of recentAll) {
      const hName = (g.teams?.home?.team?.name || '').toLowerCase();
      const aName = (g.teams?.away?.team?.name || '').toLowerCase();
      const isSeriesGame = (hName.includes(homeLast) && aName.includes(awayLast)) ||
                           (hName.includes(awayLast) && aName.includes(homeLast));
      if (!isSeriesGame) break;
      seriesGames++;
      const hScore = g.teams?.home?.score ?? 0;
      const aScore = g.teams?.away?.score ?? 0;
      if (hName.includes(homeLast)) {
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

  // Helper used above
  function lastWord(name) { return (name || '').toLowerCase().split(' ').pop(); }

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
${weatherSection}
══════════════════════════════════════════════════════════════════

═══ PROBABLE PITCHERS ═══
${probablePitchersSection}

═══ PITCHER SAMPLE CONTEXT ═══
${smallSampleFlagsSection}

═══ CONFIRMED LINEUPS ═══
${confirmedLineupsSection}

═══ LINEUP RECENT BATTING (last 7 / last 15 days) ═══
${lineupRecentBattingSection}

═══ BETTING CONTEXT ═══
${oddsSection}


═══ TEAM SEASON STATS ═══
${teamSeasonStatsSection || 'No team season stats available.'}

Expected, per Savant xStats${xStatsSeason !== season ? ` (${xStatsSeason} season)` : ''}:
${xStatsSection || 'No xStats data available.'}

═══ INJURIES (BDL Structured) ═══
${injuriesSection || 'No structured injury data available.'}

═══ RECENT FORM ═══
Rolling splits (L1/L3/L5/L10):
${recentPerformanceSection || 'No recent performance data.'}


═══ SERIES STATE ═══
${computeMlbSeriesState(homeTeam, awayTeam, homeRecentGames, homeUpcomingGames).line}${seasonSeriesBlock}${thisSeriesHotSection ? `\n\nThis series, who's doing what:\n${thisSeriesHotSection}` : ''}${situationalBlock ? `\n\nSituationally, game by game (team RISP, runners left on, pen events):\n${situationalBlock}` : ''}

${recentSeriesBlock ? `Recent series:\n${recentSeriesBlock}\n\n` : ''}Recent results:
${recentResults}

Last game (inning detail):
${lastGameSection}

═══ THE WIRE — THE WEEK AS WRITTEN (official game stories) ═══
${wireSection}

${situationFlagsSection ? `═══ SITUATION FLAGS ═══\n${situationFlagsSection}\n\n` : ''}${lastNightSection ? `═══ LAST NIGHT, AS WRITTEN ═══\n${lastNightSection}\n\n` : ''}═══ ROSTER MOVES — LAST 14 DAYS ═══
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
  const tzOf = (id) => { const n = nameOf(id); return n ? (TZ[n.toLowerCase()] || null) : null; };
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
      const lastWord = teamName.toLowerCase().split(' ').pop();
      return bdlStandings.find(s => {
        const name = (s.team?.display_name || s.team?.full_name || '').toLowerCase();
        const abbr = (s.team?.abbreviation || '').toLowerCase();
        return name.includes(lastWord) || abbr === lastWord;
      }) || null;
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
    const isHome = (g.teams?.home?.team?.name || '').toLowerCase().includes(lastWord(teamName));
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
