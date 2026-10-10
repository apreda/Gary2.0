import { ballDontLieService } from '../../../ballDontLieService.js';
import { rowFor,
         getAdvancedSeasonStats, rankBy, rankedFor } from '../../../cfbdService.js';
import { loadTeamResults, formSummary, homeAwaySplit, marginProfile, closeGameRecord, footballWeekLabel, gameStoryLine } from './footballTeamGames.js';
import { withNeutralSites, neutralWording } from './ncaafNeutralSites.js';
import { opponentContext } from '../../scoutReport/sports/ncaafSchedule.js';
import { aggregateNcaafPlayerRows, cleanNcaafPlayerRows } from '../../scoutReport/sports/ncaafPlayerEvidence.js';

const NCAAF_BDL_SPORT = 'americanfootball_ncaaf';

/** CFBD rates arrive as long floats; round without inventing precision. */
function cfbdNum(v) {
  const value = numberOrNull(v);
  return value === null ? null : Number(value.toFixed(4));
}



function normalizeId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function rowTeamId(row) {
  return normalizeId(
    row?.team?.id ??
    row?.team_id ??
    row?.teamId ??
    row?.team?.team_id
  );
}

/**
 * Select the season-stat row that actually belongs to the requested team.
 *
 * BDL normally honors team_id and returns one row, but treating `rows[0]` as
 * authoritative caused a historical failure mode where the same row could be
 * presented for both sides. A single unlabelled row is accepted because some
 * BDL responses omit the nested team object; an explicitly mismatched row is
 * never accepted.
 */
export function selectNcaafTeamStats(payload, requestedTeamId) {
  const rows = Array.isArray(payload) ? payload : (payload ? [payload] : []);
  const wantedId = normalizeId(requestedTeamId);
  if (!wantedId || rows.length === 0) return null;

  const exact = rows.find((row) => rowTeamId(row) === wantedId);
  if (exact) return exact;

  if (rows.length === 1 && rowTeamId(rows[0]) === null) {
    return rows[0];
  }

  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function cleanTeamPlayerRows(team, season) {
  const raw = await ballDontLieService.getNcaafPlayerGameStats({ teamId: team.id, season });
  return cleanNcaafPlayerRows(raw, {
    season, teamId: team.id,
    playerIds: (raw || []).map(row => row?.player?.id).filter(id => id != null),
  });
}

function returnedTotal(rows, field) {
  const values = rows.map(row => numberOrNull(row[field])).filter(value => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function displayValue(value, decimals = null) {
  const number = numberOrNull(value);
  if (number === null) return 'N/A';
  return decimals === null ? number : number.toFixed(decimals);
}

function sumAvailable(stats, keys, decimals = null) {
  const values = keys.map((key) => numberOrNull(stats?.[key])).filter((value) => value !== null);
  if (values.length !== keys.length) return 'N/A';
  const total = values.reduce((sum, value) => sum + value, 0);
  return decimals === null ? total : total.toFixed(decimals);
}

async function fetchNcaafTeamPair(home, away, season) {
  const [homeResult, awayResult] = await Promise.allSettled([
    ballDontLieService.getTeamSeasonStats(NCAAF_BDL_SPORT, { teamId: home.id, season }),
    ballDontLieService.getTeamSeasonStats(NCAAF_BDL_SPORT, { teamId: away.id, season })
  ]);

  const homeStats = homeResult.status === 'fulfilled' ? selectNcaafTeamStats(homeResult.value, home.id) : null;
  const awayStats = awayResult.status === 'fulfilled' ? selectNcaafTeamStats(awayResult.value, away.id) : null;
  const unavailableTeams = [[home, homeStats, homeResult], [away, awayStats, awayResult]]
    .filter(([, stats]) => !stats)
    .map(([team, , result]) => ({
      team: team.full_name || team.name,
      reason: result.status === 'rejected' ? result.reason?.message || String(result.reason) : 'BDL returned no team-matched NCAAF season stats',
    }));

  if (!homeStats && !awayStats) {
    const missing = [!homeStats ? (home.full_name || home.name) : null, !awayStats ? (away.full_name || away.name) : null]
      .filter(Boolean)
      .join(', ');
    throw new Error(`BDL returned no team-matched NCAAF season stats for ${missing}`);
  }

  // Missing one side must not erase the other team's real data. Its fields
  // stay N/A and its source failure remains explicit in the tool response.
  return { homeStats: homeStats || {}, awayStats: awayStats || {}, unavailableTeams };
}

function unavailableResult(error, home, away) {
  return {
    error: error.message,
    source: 'Ball Don\'t Lie',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  };
}

/**
 * Team defensive disruption, aggregated from per-player game rows.
 *
 * BDL's NCAAF SEASON row carries 13 fields and none of them are defensive
 * beyond opponent yards — which is why HAVOC and PRESSURE_RATE were answering
 * "not available" and why the NFL PRESSURE_RATE fetcher, borrowed across the
 * family, came back 8/10 N/A. But the per-player GAME endpoint does carry
 * sacks, tackles_for_loss, interceptions and passes_defended, so the team
 * totals are countable — they were simply never counted.
 *
 * Per-PLAY havoc rate still is not available: that needs a defensive snap or
 * play count BDL does not publish. The counts and per-game figures are real;
 * the rate is not, and the lane says so rather than inventing a denominator.
 */
async function ncaafDisruption(team, season) {
  const { rows, diagnostics } = await cleanTeamPlayerRows(team, season);
  if (!rows || rows.length === 0) return null;

  const gameIds = new Set(rows.map((r) => r.game?.id).filter((id) => id != null));
  const games = gameIds.size || null;
  // Offensive player rows legitimately omit every defensive field. Retain
  // the counts that are returned, with explicit coverage; never interpret
  // absent player fields as a recorded zero or claim a complete rate.
  const total = (field) => returnedTotal(rows, field);
  const perGame = (n, field) => (games && n !== null && rows.every(row => numberOrNull(row[field]) !== null)
    ? Number((n / games).toFixed(2)) : null);

  const sacks = total('sacks');
  const tfl = total('tackles_for_loss');
  const ints = total('interceptions');
  const pbu = total('passes_defended');

  // Who is generating it — a number with no name behind it invites the
  // question the founder's standard forbids leaving open.
  const byPlayer = new Map();
  for (const r of rows) {
    const id = r?.player?.id;
    if (!id) continue;
    const entry = byPlayer.get(id) || {
      name: r.player.full_name || `${r.player.first_name || ''} ${r.player.last_name || ''}`.trim(),
      rows: []
    };
    entry.rows.push(r);
    byPlayer.set(id, entry);
  }
  const leaders = [...byPlayer.values()]
    .map(p => ({ name: p.name, sacks: returnedTotal(p.rows, 'sacks'), tfl: returnedTotal(p.rows, 'tackles_for_loss') }))
    .filter(p => p.sacks > 0 || p.tfl > 0)
    .sort((a, b) => (b.sacks * 2 + b.tfl) - (a.sacks * 2 + a.tfl))
    .slice(0, 3)
    .map((p) => `${p.name} (${displayValue(p.sacks)} recorded sacks, ${displayValue(p.tfl)} recorded TFL)`);

  const dates = rows.map((r) => String(r.game?.date || '').slice(0, 10)).filter(Boolean).sort();

  return {
    season, diagnostics,
    count_scope: 'Sums of returned defensive fields. Missing values are omitted, so counts may be incomplete; coverage is stated per field. Per-game rates require complete fields.',
    stat_coverage: Object.fromEntries(['sacks', 'tackles_for_loss', 'interceptions', 'passes_defended']
      .map(field => [field, { rows_with_value: rows.filter(row => numberOrNull(row[field]) !== null).length, rows_used: rows.length }])),
    games_used: games,
    span: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : null,
    sacks, sacks_per_game: perGame(sacks, 'sacks'),
    tackles_for_loss: tfl, tfl_per_game: perGame(tfl, 'tackles_for_loss'),
    interceptions: ints,
    passes_defended: pbu,
    top_disruptors: leaders
  };
}

// Stats arrive as stats, never as where they rank (founder, Oct 1 2026:
// "Gary knows what good is ... rankings are just rankings").
/** A percentage. */
function pctRank(entry) {
  if (!entry) return 'N/A';
  return `${(entry.value * 100).toFixed(1)}%`;
}

/** A raw number. */
function numRank(entry) {
  if (!entry) return 'N/A';
  return entry.value.toFixed(3);
}

/** One shape for "CFBD could not answer", so the reason always travels. */
function advUnavailable(category, result, home, away) {
  return {
    category,
    source: 'NOT AVAILABLE',
    reason: result.reason,
    note: 'Do not estimate or recall this figure. Report it as unavailable.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  };
}

/** Both teams' completed games this season, each marked when it was at a neutral site. */
async function teamResultsWithSites(home, away, season) {
  return Promise.all([home, away].map(async team => withNeutralSites(
    await loadTeamResults(NCAAF_BDL_SPORT, team.id, season), team.full_name || team.name, season)));
}

/**
 * Who each opponent was, for the game lines these tools return (founder,
 * Oct 3 2026: a record needs the games behind it). The same describer the
 * desk uses: conference, current record, AP rank.
 */
async function opponentDescriber(resultLists, season) {
  const [teams, poll] = await Promise.all([
    ballDontLieService.getTeams(NCAAF_BDL_SPORT),
    ballDontLieService.getNcaafRankings(season).catch(() => []),
  ]);
  const week = Math.max(0, ...(poll || []).map(r => Number(r?.week) || 0));
  const rank = new Map((poll || []).filter(r => (Number(r?.week) || 0) === week).map(r => [Number(r?.team?.id), r.rank]));
  const describe = await opponentContext({ teams, resultLists, season, apRankOf: (_name, team) => rank.get(Number(team?.id)) ?? null });
  return (opponentId) => (describe(opponentId) ? `opponent: ${describe(opponentId)}` : null);
}

/** One game as a dated line: score, site, how the halves went, who the opponent was. */
const datedGameLine = (result, describe) => `${new Date(result.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })} · `
  + gameStoryLine(neutralWording(result), { opponentContext: describe(result.opponentId) });

export const ncaafFetchers = {

  /**
   * LEAGUE ISOLATION (founder, Aug 25 2026).
   *
   * These two lanes were the ONLY place a college game could execute an
   * NFL-owned fetcher. NCAAF's checklist declares OL_RANKINGS and
   * DL_RANKINGS, no NCAAF_ variant existed, and the ownership guard permits
   * it because both leagues share the "americanfootball" family — so the
   * dispatcher handed college matchups to the NFL implementation.
   *
   * The founder's ruling is that the NFL and college football are to be as
   * separate as the NFL and baseball: same sport, different league, different
   * players, nothing shared. A branch inside a shared function is not
   * separation — it is one blast radius wearing two labels. Declaring the
   * NCAAF_ variants here makes resolveTokenForSport pick these, so no NFL
   * code path executes for a college game at all.
   *
   * The data is CollegeFootballData throughout. Nothing here can reach
   * nflverse, PFR charting, or the NFL play ledger, and nothing there can
   * reach this.
   */
  NCAAF_OL_RANKINGS: async (bdlSport, home, away, season) => {
    const advanced = await getAdvancedSeasonStats(season);
    if (advanced.unavailable) {
      return {
        category: 'Offensive Line',
        source: 'NOT AVAILABLE',
        reason: advanced.reason,
        note: 'Do not estimate, derive or recall this figure. Report it as unavailable.',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
    const side = (team) => {
      const row = rowFor(advanced, team.full_name || team.name);
      if (!row) return { team: team.full_name || team.name, note: 'No CFBD advanced row for this team (FBS only).' };
      return {
        team: team.full_name || team.name,
        line_yards: cfbdNum(row.offense?.lineYards),
        stuff_rate: cfbdNum(row.offense?.stuffRate),
        power_success: cfbdNum(row.offense?.powerSuccess),
        second_level_yards: cfbdNum(row.offense?.secondLevelYards),
        open_field_yards: cfbdNum(row.offense?.openFieldYards)
      };
    };
    return {
      category: 'Offensive Line',
      source: 'CollegeFootballData',
      data_scope: 'Advanced season stats — line yards, stuff rate and power success for all FBS teams',
      home: side(home),
      away: side(away),
      reading_note: 'Line yards credit the blocking rather than the back. Stuff rate is the share of carries stopped at or behind the line. Power success is short-yardage and goal-line conversion.'
    };
  },

  NCAAF_DL_RANKINGS: async (bdlSport, home, away, season) => {
    const advanced = await getAdvancedSeasonStats(season);
    if (advanced.unavailable) {
      return {
        category: 'Defensive Line',
        source: 'NOT AVAILABLE',
        reason: advanced.reason,
        note: 'Do not estimate, derive or recall this figure. Report it as unavailable.',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
    const side = (team) => {
      const row = rowFor(advanced, team.full_name || team.name);
      if (!row) return { team: team.full_name || team.name, note: 'No CFBD advanced row for this team (FBS only).' };
      return {
        team: team.full_name || team.name,
        line_yards_allowed: cfbdNum(row.defense?.lineYards),
        stuff_rate: cfbdNum(row.defense?.stuffRate),
        power_success_allowed: cfbdNum(row.defense?.powerSuccess),
        havoc_total: cfbdNum(row.defense?.havoc?.total),
        havoc_front_seven: cfbdNum(row.defense?.havoc?.frontSeven),
        havoc_secondary: cfbdNum(row.defense?.havoc?.db)
      };
    };
    return {
      category: 'Defensive Line',
      source: 'CollegeFootballData',
      data_scope: 'Advanced season stats — line yards allowed, stuff rate and havoc for all FBS teams',
      home: side(home),
      away: side(away),
      reading_note: 'Havoc split into front seven and secondary says WHERE disruption comes from. It is the closest college equivalent to a pass-rush win rate; it is not the same measurement and must not be called one.'
    };
  },


  // ===== NCAAF BDL-BASED STATS (THESE WORK - use team_season_stats) =====
  
  NCAAF_PASSING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Passing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      const { homeStats, awayStats, unavailableTeams } = await fetchNcaafTeamPair(home, away, season);
      return {
        ...(unavailableTeams.length ? { unavailable_teams: unavailableTeams } : {}),
        category: 'Passing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_yards: displayValue(homeStats.passing_yards),
          passing_ypg: displayValue(homeStats.passing_yards_per_game, 1),
          passing_tds: displayValue(homeStats.passing_touchdowns),
          passing_ints: displayValue(homeStats.passing_interceptions)
        },
        away: {
          team: awayTeamName,
          passing_yards: displayValue(awayStats.passing_yards),
          passing_ypg: displayValue(awayStats.passing_yards_per_game, 1),
          passing_tds: displayValue(awayStats.passing_touchdowns),
          passing_ints: displayValue(awayStats.passing_interceptions)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Passing Offense fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_RUSHING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Rushing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats, unavailableTeams } = await fetchNcaafTeamPair(home, away, season);
      return {
        ...(unavailableTeams.length ? { unavailable_teams: unavailableTeams } : {}),
        category: 'Rushing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          rushing_yards: displayValue(homeStats.rushing_yards),
          rushing_ypg: displayValue(homeStats.rushing_yards_per_game, 1),
          rushing_tds: displayValue(homeStats.rushing_touchdowns)
        },
        away: {
          team: awayTeamName,
          rushing_yards: displayValue(awayStats.rushing_yards),
          rushing_ypg: displayValue(awayStats.rushing_yards_per_game, 1),
          rushing_tds: displayValue(awayStats.rushing_touchdowns)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Rushing Offense fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_TOTAL_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Total Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats, unavailableTeams } = await fetchNcaafTeamPair(home, away, season);
      return {
        ...(unavailableTeams.length ? { unavailable_teams: unavailableTeams } : {}),
        category: 'Total Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          total_yards: sumAvailable(homeStats, ['passing_yards', 'rushing_yards']),
          total_ypg: sumAvailable(homeStats, ['passing_yards_per_game', 'rushing_yards_per_game'], 1),
          passing_ypg: displayValue(homeStats.passing_yards_per_game, 1),
          rushing_ypg: displayValue(homeStats.rushing_yards_per_game, 1)
        },
        away: {
          team: awayTeamName,
          total_yards: sumAvailable(awayStats, ['passing_yards', 'rushing_yards']),
          total_ypg: sumAvailable(awayStats, ['passing_yards_per_game', 'rushing_yards_per_game'], 1),
          passing_ypg: displayValue(awayStats.passing_yards_per_game, 1),
          rushing_ypg: displayValue(awayStats.rushing_yards_per_game, 1)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Total Offense fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_DEFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Defense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats, unavailableTeams } = await fetchNcaafTeamPair(home, away, season);
      return {
        ...(unavailableTeams.length ? { unavailable_teams: unavailableTeams } : {}),
        category: 'Defense (Yards Allowed)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          opp_passing_yards: displayValue(homeStats.opp_passing_yards),
          opp_rushing_yards: displayValue(homeStats.opp_rushing_yards),
          opp_total_yards: sumAvailable(homeStats, ['opp_passing_yards', 'opp_rushing_yards'])
        },
        away: {
          team: awayTeamName,
          opp_passing_yards: displayValue(awayStats.opp_passing_yards),
          opp_rushing_yards: displayValue(awayStats.opp_rushing_yards),
          opp_total_yards: sumAvailable(awayStats, ['opp_passing_yards', 'opp_rushing_yards'])
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Defense fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_SCORING: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Scoring for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats, unavailableTeams } = await fetchNcaafTeamPair(home, away, season);
      return {
        ...(unavailableTeams.length ? { unavailable_teams: unavailableTeams } : {}),
        category: 'Scoring (Touchdowns)',
        data_scope: 'Touchdowns only (total points/PPG not available from BDL for NCAAF)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_tds: displayValue(homeStats.passing_touchdowns),
          rushing_tds: displayValue(homeStats.rushing_touchdowns),
          total_tds: sumAvailable(homeStats, ['passing_touchdowns', 'rushing_touchdowns'])
        },
        away: {
          team: awayTeamName,
          passing_tds: displayValue(awayStats.passing_touchdowns),
          rushing_tds: displayValue(awayStats.rushing_touchdowns),
          total_tds: sumAvailable(awayStats, ['passing_touchdowns', 'rushing_touchdowns'])
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Scoring fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_TURNOVER_MARGIN: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Turnover Data for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const { homeStats, awayStats, unavailableTeams } = await fetchNcaafTeamPair(home, away, season);
      return {
        ...(unavailableTeams.length ? { unavailable_teams: unavailableTeams } : {}),
        category: 'Interceptions',
        data_scope: 'INTs thrown only (full turnover data unavailable from BDL for NCAAF)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          interceptions_thrown: displayValue(homeStats.passing_interceptions)
        },
        away: {
          team: awayTeamName,
          interceptions_thrown: displayValue(awayStats.passing_interceptions)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Turnover fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SPORT-SPECIFIC OVERRIDES (Aug 24 2026 audit)
  //
  // INJURIES, RECENT_FORM, HOME_AWAY_SPLITS and CLOSE_GAME_RECORD are owned
  // by the NBA map, so the cross-sport guard refused them on every NCAAF run
  // while the checklist kept asking. NCAAF runs the full factor menu all
  // season — there is no preseason scope to mask this — so these were live
  // holes, not dormant ones.
  // ═══════════════════════════════════════════════════════════════════════

  NCAAF_RECENT_FORM: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = (await teamResultsWithSites(home, away, season)).map(results => results.map(neutralWording));
    const describe = await opponentDescriber([homeResults, awayResults], season);
    const context = { leagueContext: true, opponentQuality: (_league, opponentId) => describe(opponentId) };
    return {
      category: 'Recent Form (Last 5)',
      data_scope: 'Completed games this season, newest first, each with its score, site, halves and who the opponent was (conference, current record, AP rank)',
      home: { team: home.full_name || home.name, ...(formSummary(homeResults, 5, context) || { note: 'No completed games found' }) },
      away: { team: away.full_name || away.name, ...(formSummary(awayResults, 5, context) || { note: 'No completed games found' }) }
    };
  },

  NCAAF_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = await teamResultsWithSites(home, away, season);
    const describe = await opponentDescriber([homeResults, awayResults], season);
    // A record arrives with the games behind it: each one dated, with its
    // score, halves and who the opponent was. A neutral-site game is neither
    // a home nor a road game; it gets its own row.
    const block = (games) => {
      const totals = homeAwaySplit(games.map(r => ({ ...r, home: true }))).home;
      return totals ? { ...totals, games: games.map(r => datedGameLine(r, describe)) } : { games_used: 0, note: 'no games yet this season' };
    };
    const split = (results) => {
      const neutral = results.filter(r => r.neutral);
      return { at_home: block(results.filter(r => !r.neutral && r.home)), on_road: block(results.filter(r => !r.neutral && !r.home)),
        ...(neutral.length ? { at_neutral_sites: block(neutral) } : {}) };
    };
    return {
      category: 'Home/Away Splits',
      data_scope: 'Completed games this season, split by venue, each record with the games behind it; neutral-site games are counted separately',
      home: { team: home.full_name || home.name, ...split(homeResults) },
      away: { team: away.full_name || away.name, ...split(awayResults) }
    };
  },

  NCAAF_CLOSE_GAME_RECORD: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = await teamResultsWithSites(home, away, season);
    const describe = await opponentDescriber([homeResults, awayResults], season);
    // The record with its games: each close game dated, with its halves and who the opponent was.
    const close = (results) => {
      const games = results.filter(r => Math.abs(r.margin) <= 7);
      const totals = closeGameRecord(games, 7);
      return totals ? { ...totals, results: games.map(r => datedGameLine(r, describe)) } : { note: 'No one-score games found' };
    };
    return {
      category: 'Close Game Record (within 7)',
      data_scope: 'Completed games decided by one score, each with its date, halves and opponent, and the margin profile behind the record',
      home: { team: home.full_name || home.name, ...close(homeResults), margin_profile: marginProfile(homeResults) },
      away: { team: away.full_name || away.name, ...close(awayResults), margin_profile: marginProfile(awayResults) }
    };
  },

  NCAAF_INJURIES: async (bdlSport, home, away) => {
    // BDL publishes no NCAAF injury endpoint (ncaaf/v1/player_injuries is a
    // 404). Say so plainly rather than returning an ownership error that
    // reads like a routing bug.
    return {
      category: 'Injury Report',
      source: 'NOT AVAILABLE',
      note: 'BDL does not publish an NCAAF injury feed. Use the availability and roster information in the scout report; do not infer availability from its absence here.',
      home: { team: home.full_name || home.name },
      away: { team: away.full_name || away.name }
    };
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CHECKLIST ASKS WITH A REAL BDL SOURCE (Aug 24 2026 audit)
  // Both were on the no-fetcher list while the fields sat in the same season
  // row the other NCAAF fetchers already pull.
  // ═══════════════════════════════════════════════════════════════════════

  NCAAF_PASS_EFFICIENCY: async (bdlSport, home, away, season) => {
    try {
      const { homeStats, awayStats, unavailableTeams } = await fetchNcaafTeamPair(home, away, season);
      return {
        ...(unavailableTeams.length ? { unavailable_teams: unavailableTeams } : {}),
        category: 'Passing Efficiency',
        source: 'Ball Don\'t Lie',
        data_scope: 'Season passing rate stats (not per-play EPA or success rate)',
        home: {
          team: home.full_name || home.name,
          qb_rating: displayValue(homeStats.passing_qb_rating, 1),
          passing_ypg: displayValue(homeStats.passing_yards_per_game, 1),
          passing_tds: displayValue(homeStats.passing_touchdowns),
          passing_ints: displayValue(homeStats.passing_interceptions)
        },
        away: {
          team: away.full_name || away.name,
          qb_rating: displayValue(awayStats.passing_qb_rating, 1),
          passing_ypg: displayValue(awayStats.passing_yards_per_game, 1),
          passing_tds: displayValue(awayStats.passing_touchdowns),
          passing_ints: displayValue(awayStats.passing_interceptions)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Pass Efficiency fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  NCAAF_RUSH_EFFICIENCY: async (bdlSport, home, away, season) => {
    try {
      const { homeStats, awayStats, unavailableTeams } = await fetchNcaafTeamPair(home, away, season);
      return {
        ...(unavailableTeams.length ? { unavailable_teams: unavailableTeams } : {}),
        category: 'Rushing Efficiency',
        source: 'Ball Don\'t Lie',
        data_scope: 'Season rushing rate stats (not per-play EPA or success rate)',
        home: {
          team: home.full_name || home.name,
          rushing_ypg: displayValue(homeStats.rushing_yards_per_game, 1),
          rushing_yards: displayValue(homeStats.rushing_yards),
          rushing_tds: displayValue(homeStats.rushing_touchdowns)
        },
        away: {
          team: away.full_name || away.name,
          rushing_ypg: displayValue(awayStats.rushing_yards_per_game, 1),
          rushing_yards: displayValue(awayStats.rushing_yards),
          rushing_tds: displayValue(awayStats.rushing_touchdowns)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Rush Efficiency fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  /**
   * Game-by-game lines for each side's leading passer, rusher and receiver,
   * from ncaaf/v1/player_stats. Rows carry `game`, so each line arrives with
   * its date, week and opponent rather than as a bare season total.
   */
  NCAAF_PLAYER_GAME_LOGS: async (bdlSport, home, away, season) => {
    try {
      const teamLogs = async (team) => {
        // ncaaf/v1/player_stats embeds a `game` object whose home_team and
        // visitor_team are NULL, so the opponent is not in this payload. Join
        // it to the team's schedule by game id rather than printing a guess —
        // an unjoined line previously rendered "@ Unknown" for every game,
        // inventing a road venue as well as losing the opponent.
        const [{ rows, diagnostics }, schedule] = await Promise.all([
          cleanTeamPlayerRows(team, season),
          loadTeamResults(NCAAF_BDL_SPORT, team.id, season)
        ]);
        if (rows.length === 0) return { players: [], diagnostics };
        const byGameId = new Map();
        for (const g of (schedule || [])) {
          if (g.gameId != null) byGameId.set(String(g.gameId), g);
        }

        // Sum each player's season from their game rows, then keep the leader
        // in each role. Season totals and game rows come from one call.
        const byPlayer = new Map();
        for (const row of rows) {
          const id = row?.player?.id;
          if (!id) continue;
          if (!byPlayer.has(id)) {
            byPlayer.set(id, {
              id,
              name: row.player.full_name || `${row.player.first_name || ''} ${row.player.last_name || ''}`.trim(),
              position: row.player.position_abbreviation || row.player.position || null,
              passing: 0, rushing: 0, receiving: 0, games: []
            });
          }
          const entry = byPlayer.get(id);
          entry.passing += Number(row.passing_yards) || 0;
          entry.rushing += Number(row.rushing_yards) || 0;
          entry.receiving += Number(row.receiving_yards) || 0;
          entry.games.push(row);
        }

        const players = [...byPlayer.values()];
        const activityField = { passing: 'passing_attempts', rushing: 'rushing_attempts', receiving: 'receptions' };
        const leader = (field) => players
          .filter((p) => p[field] > 0 || p.games.some(row => numberOrNull(row[activityField[field]]) > 0))
          .sort((a, b) => b[field] - a[field])[0] || null;

        const picked = [['passer', leader('passing')], ['rusher', leader('rushing')], ['receiver', leader('receiving')]]
          .filter(([, p]) => p)
          // one player can lead two roles; show him once, under the first
          .filter(([, p], i, arr) => arr.findIndex(([, q]) => q.id === p.id) === i);

        const playersWithLogs = picked.map(([role, p]) => ({
          player: p.name,
          role,
          position: p.position,
          last_5: p.games
            .sort((a, b) => new Date(b.game?.date || 0) - new Date(a.game?.date || 0))
            .slice(0, 5)
            .map((g) => {
              const joined = byGameId.get(String(g.game?.id ?? ''));
              const opponent = joined?.opponent || null;
              const isHome = joined?.home ?? null;
              const venue = isHome === null ? '' : (isHome ? 'vs ' : '@ ');
              const line = [];
              if (numberOrNull(g.passing_attempts) > 0 || numberOrNull(g.passing_yards) !== null) line.push(`${displayValue(g.passing_completions)}/${displayValue(g.passing_attempts)}, ${displayValue(g.passing_yards)} pass yds, ${displayValue(g.passing_touchdowns)} TD, ${displayValue(g.passing_interceptions)} INT`);
              if (numberOrNull(g.rushing_attempts) > 0 || numberOrNull(g.rushing_yards) !== null) line.push(`${displayValue(g.rushing_attempts)} car, ${displayValue(g.rushing_yards)} rush yds, ${displayValue(g.rushing_touchdowns)} TD`);
              if (numberOrNull(g.receptions) > 0 || numberOrNull(g.receiving_yards) !== null) line.push(`${displayValue(g.receptions)} rec, ${displayValue(g.receiving_yards)} rec yds, ${displayValue(g.receiving_touchdowns)} TD`);
              // No opponent joined = say so; never render a venue we do not have.
              const against = opponent
                ? `${venue}${opponent}`
                : '(opponent not carried by BDL for this game)';
              return `${g.game.date} · ${footballWeekLabel(g.game?.week)} ${against}: ${line.join('; ') || 'no offensive stats returned'}`;
            })
        }));
        return { players: playersWithLogs, diagnostics };
      };

      const [homePlayers, awayPlayers] = await Promise.all([teamLogs(home), teamLogs(away)]);
      return {
        category: 'Player Game Logs',
        source: 'Ball Don\'t Lie',
        season,
        data_scope: 'Last 5 games for each side\'s leading passer, rusher and receiver',
        home: { team: home.full_name || home.name, ...homePlayers },
        away: { team: away.full_name || away.name, ...awayPlayers }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Player Game Logs fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  /**
   * Poll position for both sides. In college the ranking IS the stakes —
   * ranked-vs-ranked, an unranked team hosting a top-10, a team that just
   * moved up or dropped out. BDL publishes rank, first-place votes, trend and
   * record; MOTIVATION had no token at all before this.
   */
  NCAAF_RANKINGS_CONTEXT: async (bdlSport, home, away, season) => {
    try {
      const rankings = await ballDontLieService.getNcaafRankings(season) || [];
      const findRank = (team) => {
        const row = rankings.find((r) => Number(r?.team?.id) === Number(team.id));
        if (!row) return { ranked: false, note: 'Not in the current poll' };
        return {
          ranked: true,
          rank: row.rank,
          record: row.record || null,
          trend: row.trend || null,
          first_place_votes: row.first_place_votes ?? null,
          poll_week: row.week ?? null
        };
      };
      const homeRank = findRank(home);
      const awayRank = findRank(away);
      return {
        category: 'Poll Position',
        source: 'Ball Don\'t Lie',
        data_scope: 'Current AP-style poll: rank, record, movement. Poll standing only — no implication for this game.',
        both_ranked: homeRank.ranked && awayRank.ranked,
        home: { team: home.full_name || home.name, ...homeRank },
        away: { team: away.full_name || away.name, ...awayRank }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Rankings Context fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  /**
   * Real defensive disruption for college — replaces the previous
   * "not available" declaration now that the per-player game endpoint is
   * being counted. Per-play havoc RATE remains unavailable (no snap count).
   */
  NCAAF_HAVOC: async (bdlSport, home, away, season) => {
    try {
      const [homeD, awayD] = await Promise.all([
        ncaafDisruption(home, season),
        ncaafDisruption(away, season)
      ]);
      if (!homeD && !awayD) {
        return {
          category: 'Havoc',
          source: 'NOT AVAILABLE',
          reason: 'BDL returned no NCAAF player game rows for either team this season.',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name }
        };
      }
      return {
        category: 'Defensive Disruption (Havoc components)',
        source: 'Ball Don\'t Lie',
        data_scope: 'Sacks, tackles for loss, interceptions and passes defended, counted from per-player game rows. Per-PLAY havoc rate is NOT available — BDL publishes no defensive snap or play count for NCAAF.',
        home: { team: home.full_name || home.name, ...(homeD || { note: 'No player game rows returned' }) },
        away: { team: away.full_name || away.name, ...(awayD || { note: 'No player game rows returned' }) }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Havoc fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  /**
   * College pass rush. The bare PRESSURE_RATE token resolves to the NFL
   * fetcher across the shared football family, which reads NFL-only season
   * fields and came back 8/10 N/A for college. This is the sport's own.
   */
  NCAAF_PRESSURE_RATE: async (bdlSport, home, away, season) => {
    try {
      const [homeD, awayD] = await Promise.all([
        ncaafDisruption(home, season),
        ncaafDisruption(away, season)
      ]);
      const line = (d) => (d ? {
        games_used: d.games_used,
        span: d.span,
        sacks: d.sacks,
        sacks_per_game: d.sacks_per_game,
        tackles_for_loss: d.tackles_for_loss,
        tfl_per_game: d.tfl_per_game,
        top_disruptors: d.top_disruptors
      } : { note: 'No player game rows returned' });
      return {
        category: 'Pass Rush',
        source: 'Ball Don\'t Lie',
        data_scope: 'Sacks and tackles for loss counted from per-player game rows. True pressure rate and QB hits are not published for NCAAF.',
        home: { team: home.full_name || home.name, ...line(homeD) },
        away: { team: away.full_name || away.name, ...line(awayD) }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Pressure Rate fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  // COLLEGE RATINGS REMOVED (founder, Oct 9 2026): SP+, FPI and the schedule,
  // conference and opponent-tier tools built from them are no longer served.

  NCAAF_QB_STATS: async (bdlSport, home, away, season) => {
    try {
      const forTeam = async (team) => {
        const { rows, diagnostics } = await cleanTeamPlayerRows(team, season);
        if (rows.length === 0) return { note: 'No eligible player game rows returned.', diagnostics };
        const byPlayer = new Map();
        for (const r of rows) {
          const id = r?.player?.id;
          if (!id) continue;
          const e = byPlayer.get(id) || { name: r.player.full_name || `${r.player.first_name || ''} ${r.player.last_name || ''}`.trim(), rows: [] };
          e.rows.push(r);
          byPlayer.set(id, e);
        }
        const passers = [...byPlayer.values()].map(p => ({ ...p,
          returnedAttempts: p.rows.reduce((sum, row) => sum + (numberOrNull(row.passing_attempts) ?? 0), 0),
          line: aggregateNcaafPlayerRows(p.rows, season).values().next().value,
        })).filter(p => p.returnedAttempts > 0);
        const lead = passers.sort((a, b) => b.returnedAttempts - a.returnedAttempts)[0];
        if (!lead) return { note: 'No passer with attempts on file.' };
        const { line } = lead;
        return {
          quarterback: lead.name,
          role: 'Season passing-attempts leader; current starter status is established separately by dated reporting.',
          games: line.evidence.games,
          completions: line.passing_completions,
          attempts: line.passing_attempts,
          completion_pct: line.passing_completions !== null && line.passing_attempts > 0 ? `${((line.passing_completions / line.passing_attempts) * 100).toFixed(1)}%` : 'N/A',
          passing_yards: line.passing_yards,
          yards_per_attempt: line.passing_yards !== null && line.passing_attempts > 0 ? Number((line.passing_yards / line.passing_attempts).toFixed(2)) : 'N/A',
          touchdowns: line.passing_touchdowns,
          interceptions: line.passing_interceptions,
          evidence: line.evidence, diagnostics,
        };
      };
      const [h, a] = await Promise.all([forTeam(home), forTeam(away)]);
      return {
        category: 'Quarterback',
        source: 'Ball Don\'t Lie',
        season,
        data_scope: 'Season totals for the passer with the most returned passing attempts, summed from eligible per-game rows. This does not identify today\'s starter; use the current QB report for that role and any uncertainty. Missing sample fields remain unknown.',
        home: { team: home.full_name || home.name, ...h },
        away: { team: away.full_name || away.name, ...a }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF QB Stats fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  /**
   * College turnovers, both directions, from the per-game team boxes.
   *
   * The bare TURNOVER_LUCK token resolves to the NFL fetcher, whose season
   * fields do not exist for NCAAF — it returned 10 of 14 values as N/A. The
   * per-game box carries `turnovers` and a game_ids query returns BOTH teams,
   * so committed and forced are each countable.
   */
  NCAAF_TURNOVER_LUCK: async (bdlSport, home, away, season) => {
    try {
      const forTeam = async (team) => {
        const results = await loadTeamResults(NCAAF_BDL_SPORT, team.id, season);
        const gameIds = results.map((r) => r.gameId).filter((id) => id != null).slice(0, 20);
        if (gameIds.length === 0) return { note: 'No completed games found.' };
        // game_ids is IGNORED unless seasons[] rides along — a documented BDL
        // trap that returns an unfiltered page instead of an error.
        const boxes = await ballDontLieService.getNcaafTeamStatsByGameIds(gameIds, season);
        if (!boxes || boxes.length === 0) return { note: 'No per-game team boxes returned.' };
        let committed = 0; let forced = 0; let games = 0;
        for (const gid of gameIds) {
          const rows = boxes.filter((b) => Number(b?.game?.id) === Number(gid));
          if (rows.length !== 2) continue;
          const own = rows.find((r) => Number(r?.team?.id) === Number(team.id));
          const opp = rows.find((r) => Number(r?.team?.id) !== Number(team.id));
          if (!own || !opp) continue;
          const ownTurnovers = numberOrNull(own.turnovers);
          const opponentTurnovers = numberOrNull(opp.turnovers);
          if (ownTurnovers === null || opponentTurnovers === null) continue;
          committed += ownTurnovers;
          forced += opponentTurnovers;
          games += 1;
        }
        if (games === 0) return { note: 'No game had turnover counts for both teams.', games_used: 0 };
        return {
          games_used: games,
          turnovers_committed: committed,
          turnovers_forced: forced,
          turnover_margin: forced - committed,
          committed_per_game: Number((committed / games).toFixed(2)),
          forced_per_game: Number((forced / games).toFixed(2))
        };
      };
      const [h, a] = await Promise.all([forTeam(home), forTeam(away)]);
      return {
        category: 'Turnovers',
        source: 'Ball Don\'t Lie',
        data_scope: 'Turnovers committed and forced, counted from per-game team boxes (a game_ids query returns both teams). Fumble-vs-interception split is not published for NCAAF.',
        home: { team: home.full_name || home.name, ...h },
        away: { team: away.full_name || away.name, ...a }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Turnover Luck fetch failed:', error.message);
      return unavailableResult(error, home, away);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ADVANCED SEASON STATS — one CFBD request, 136 teams (Aug 25 2026)
  //
  // These four factors were declining because BDL's NCAAF row cannot support
  // them. CFBD's /stats/season/advanced carries all of it. The rates arrive
  // as rates, without their league rank (founder, Oct 1 2026).
  // ═══════════════════════════════════════════════════════════════════════

  NCAAF_SUCCESS_RATE: async (bdlSport, home, away, season) => {
    const adv = await getAdvancedSeasonStats(season);
    if (adv.unavailable) return advUnavailable('Success Rate', adv, home, away);
    const offRank = rankBy(adv, 'offense.successRate');
    const defRank = rankBy(adv, 'defense.successRate', { lowerIsBetter: true });
    const stdRank = rankBy(adv, 'offense.standardDowns.successRate');
    const passRank = rankBy(adv, 'offense.passingDowns.successRate');
    const side = (team) => {
      const name = team.full_name || team.name;
      return {
        team: name,
        offense_success_rate: pctRank(rankedFor(offRank, name)),
        defense_success_rate_allowed: pctRank(rankedFor(defRank, name)),
        standard_downs: pctRank(rankedFor(stdRank, name)),
        passing_downs: pctRank(rankedFor(passRank, name))
      };
    };
    return {
      category: 'Success Rate',
      source: 'CollegeFootballData',
      data_scope: `Per-play success rate for ${season}, FBS. Standard downs and passing downs are split out because a team that stays on schedule and one that lives in third-and-long can share an overall rate.`,
      home: side(home), away: side(away)
    };
  },

  NCAAF_EXPLOSIVE_PLAYS: async (bdlSport, home, away, season) => {
    const adv = await getAdvancedSeasonStats(season);
    if (adv.unavailable) return advUnavailable('Explosiveness', adv, home, away);
    const offRank = rankBy(adv, 'offense.explosiveness');
    const defRank = rankBy(adv, 'defense.explosiveness', { lowerIsBetter: true });
    const side = (team) => {
      const name = team.full_name || team.name;
      return {
        team: name,
        offense_explosiveness: numRank(rankedFor(offRank, name)),
        defense_explosiveness_allowed: numRank(rankedFor(defRank, name))
      };
    };
    return {
      category: 'Explosiveness',
      source: 'CollegeFootballData',
      data_scope: 'Explosiveness is the average value of a team\'s SUCCESSFUL plays — how much damage it does when it does move the ball, which is a different question from how often it moves it.',
      home: side(home), away: side(away)
    };
  },

  NCAAF_EPA: async (bdlSport, home, away, season) => {
    const adv = await getAdvancedSeasonStats(season);
    if (adv.unavailable) return advUnavailable('PPA', adv, home, away);
    const offRank = rankBy(adv, 'offense.ppa');
    const defRank = rankBy(adv, 'defense.ppa', { lowerIsBetter: true });
    const side = (team) => {
      const name = team.full_name || team.name;
      return {
        team: name,
        offense_ppa_per_play: numRank(rankedFor(offRank, name)),
        defense_ppa_allowed_per_play: numRank(rankedFor(defRank, name))
      };
    };
    return {
      category: 'Predicted Points Added',
      source: 'CollegeFootballData',
      data_scope: 'PPA is CFBD\'s expected-points model, per play. This is genuine per-play value, not the yards-and-points proxy the NFL lanes use under an EPA label.',
      home: side(home), away: side(away)
    };
  },

  NCAAF_REDZONE: async (bdlSport, home, away, season) => {
    const adv = await getAdvancedSeasonStats(season);
    if (adv.unavailable) return advUnavailable('Scoring Opportunities', adv, home, away);
    const offRank = rankBy(adv, 'offense.pointsPerOpportunity');
    const defRank = rankBy(adv, 'defense.pointsPerOpportunity', { lowerIsBetter: true });
    const side = (team) => {
      const name = team.full_name || team.name;
      const row = rowFor(adv, name);
      return {
        team: name,
        points_per_scoring_opportunity: numRank(rankedFor(offRank, name)),
        points_allowed_per_opportunity: numRank(rankedFor(defRank, name)),
        total_opportunities: row?.offense?.totalOpportunies ?? null
      };
    };
    return {
      category: 'Scoring Opportunities',
      source: 'CollegeFootballData',
      data_scope: 'Points per scoring opportunity (a drive reaching the opponent 40). BDL publishes no red-zone data for NCAAF at all; this is the finishing measure that replaces it — and it captures drives that stall at the 25 as well as those that reach the 20.',
      home: side(home), away: side(away)
    };
  }

};
