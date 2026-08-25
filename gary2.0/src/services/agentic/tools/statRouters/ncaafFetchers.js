import { ballDontLieService } from '../../../ballDontLieService.js';
import { getSpPlus, getFpi, getReturningProduction, rowFor } from '../../../cfbdService.js';
import { loadTeamResults, formSummary, homeAwaySplit, marginProfile, closeGameRecord, footballWeekLabel } from './footballTeamGames.js';

const NCAAF_BDL_SPORT = 'americanfootball_ncaaf';

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
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayValue(value, decimals = null) {
  const number = numberOrNull(value);
  if (number === null) return 'N/A';
  return decimals === null ? number : number.toFixed(decimals);
}

function sumAvailable(stats, keys, decimals = null) {
  const values = keys.map((key) => numberOrNull(stats?.[key])).filter((value) => value !== null);
  if (values.length === 0) return 'N/A';
  const total = values.reduce((sum, value) => sum + value, 0);
  return decimals === null ? total : total.toFixed(decimals);
}

async function fetchNcaafTeamPair(home, away, season) {
  const [homePayload, awayPayload] = await Promise.all([
    ballDontLieService.getTeamSeasonStats(NCAAF_BDL_SPORT, { teamId: home.id, season }),
    ballDontLieService.getTeamSeasonStats(NCAAF_BDL_SPORT, { teamId: away.id, season })
  ]);

  const homeStats = selectNcaafTeamStats(homePayload, home.id);
  const awayStats = selectNcaafTeamStats(awayPayload, away.id);

  if (!homeStats || !awayStats) {
    const missing = [!homeStats ? (home.full_name || home.name) : null, !awayStats ? (away.full_name || away.name) : null]
      .filter(Boolean)
      .join(', ');
    throw new Error(`BDL returned no team-matched NCAAF season stats for ${missing}`);
  }

  return { homeStats, awayStats };
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
  const rows = await ballDontLieService.getNcaafPlayerGameStats({ teamId: team.id, season });
  if (!rows || rows.length === 0) return null;

  const gameIds = new Set(rows.map((r) => r.game?.id).filter((id) => id != null));
  const games = gameIds.size || null;
  const total = (field) => rows.reduce((sum, r) => sum + (Number(r[field]) || 0), 0);
  const perGame = (n) => (games ? Number((n / games).toFixed(2)) : null);

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
    const disruption = (Number(r.sacks) || 0) + (Number(r.tackles_for_loss) || 0);
    if (disruption <= 0) continue;
    const entry = byPlayer.get(id) || {
      name: `${r.player.first_name || ''} ${r.player.last_name || ''}`.trim(),
      sacks: 0, tfl: 0
    };
    entry.sacks += Number(r.sacks) || 0;
    entry.tfl += Number(r.tackles_for_loss) || 0;
    byPlayer.set(id, entry);
  }
  const leaders = [...byPlayer.values()]
    .sort((a, b) => (b.sacks * 2 + b.tfl) - (a.sacks * 2 + a.tfl))
    .slice(0, 3)
    .map((p) => `${p.name} (${p.sacks} sacks, ${p.tfl} TFL)`);

  const dates = rows.map((r) => String(r.game?.date || '').slice(0, 10)).filter(Boolean).sort();

  return {
    games_used: games,
    span: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : null,
    sacks, sacks_per_game: perGame(sacks),
    tackles_for_loss: tfl, tfl_per_game: perGame(tfl),
    interceptions: ints,
    passes_defended: pbu,
    top_disruptors: leaders
  };
}

export const ncaafFetchers = {

  // ===== NCAAF BDL-BASED STATS (THESE WORK - use team_season_stats) =====
  
  NCAAF_PASSING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Passing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
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
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
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
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
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
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
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
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
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
      
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      
      return {
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
    const [homeResults, awayResults] = await Promise.all([
      loadTeamResults(NCAAF_BDL_SPORT, home.id, season),
      loadTeamResults(NCAAF_BDL_SPORT, away.id, season)
    ]);
    return {
      category: 'Recent Form (Last 5)',
      data_scope: 'Completed games this season, newest first, each with its opponent and score',
      home: { team: home.full_name || home.name, ...(formSummary(homeResults, 5) || { note: 'No completed games found' }) },
      away: { team: away.full_name || away.name, ...(formSummary(awayResults, 5) || { note: 'No completed games found' }) }
    };
  },

  NCAAF_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = await Promise.all([
      loadTeamResults(NCAAF_BDL_SPORT, home.id, season),
      loadTeamResults(NCAAF_BDL_SPORT, away.id, season)
    ]);
    const homeSplit = homeAwaySplit(homeResults);
    const awaySplit = homeAwaySplit(awayResults);
    return {
      category: 'Home/Away Splits',
      data_scope: 'Completed games this season, split by venue',
      home: { team: home.full_name || home.name, at_home: homeSplit.home, on_road: homeSplit.away },
      away: { team: away.full_name || away.name, at_home: awaySplit.home, on_road: awaySplit.away }
    };
  },

  NCAAF_CLOSE_GAME_RECORD: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = await Promise.all([
      loadTeamResults(NCAAF_BDL_SPORT, home.id, season),
      loadTeamResults(NCAAF_BDL_SPORT, away.id, season)
    ]);
    return {
      category: 'Close Game Record (within 7)',
      data_scope: 'Completed games decided by one score, with the margin profile behind the record',
      home: {
        team: home.full_name || home.name,
        ...(closeGameRecord(homeResults, 7) || { note: 'No one-score games found' }),
        margin_profile: marginProfile(homeResults)
      },
      away: {
        team: away.full_name || away.name,
        ...(closeGameRecord(awayResults, 7) || { note: 'No one-score games found' }),
        margin_profile: marginProfile(awayResults)
      }
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
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      return {
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
      const { homeStats, awayStats } = await fetchNcaafTeamPair(home, away, season);
      return {
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

  // ═══════════════════════════════════════════════════════════════════════
  // CHECKLIST ASKS WITH NO SOURCE (Aug 24 2026 audit)
  //
  // BDL's NCAAF season row carries 13 fields and its game box 10 — no points,
  // no sacks, no red zone, no explosive-play or havoc inputs, and no ratings.
  // These tokens previously fell through to "Unknown stat token", which reads
  // like a routing bug and invites the researcher to fill the hole itself.
  // Declaring them says the true thing — the number does not exist for us —
  // and names what would source it, so the absence stays visible and greppable.
  // ═══════════════════════════════════════════════════════════════════════



  NCAAF_EPA: async (bdlSport, home, away) => ({
    category: 'Epa',
    source: 'NOT AVAILABLE',
    reason: 'Per-play EPA needs play-by-play; BDL NCAAF provides season and game totals only.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_SUCCESS_RATE: async (bdlSport, home, away) => ({
    category: 'Success Rate',
    source: 'NOT AVAILABLE',
    reason: 'Per-play success rate needs play-by-play; BDL NCAAF provides season and game totals only.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),


  NCAAF_EXPLOSIVE_PLAYS: async (bdlSport, home, away) => ({
    category: 'Explosive Plays',
    source: 'NOT AVAILABLE',
    reason: 'Explosive-play counts need play-level yardage or long-play fields; BDL NCAAF carries neither.',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),

  NCAAF_REDZONE: async (bdlSport, home, away) => ({
    category: 'Redzone',
    source: 'NOT AVAILABLE',
    reason: 'BDL NCAAF box scores carry no red-zone attempts or scores (the NFL boxes do).',
    note: 'Do not estimate, derive or recall this figure. Report it as unavailable. A CollegeFootballData.com feed would source it.',
    home: { team: home.full_name || home.name },
    away: { team: away.full_name || away.name }
  }),




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
        const [rows, schedule] = await Promise.all([
          ballDontLieService.getNcaafPlayerGameStats({ teamId: team.id, season }),
          loadTeamResults(NCAAF_BDL_SPORT, team.id, season)
        ]);
        if (!rows || rows.length === 0) return [];
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
              name: `${row.player.first_name || ''} ${row.player.last_name || ''}`.trim(),
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
        const leader = (field) => players
          .filter((p) => p[field] > 0)
          .sort((a, b) => b[field] - a[field])[0] || null;

        const picked = [['passer', leader('passing')], ['rusher', leader('rushing')], ['receiver', leader('receiving')]]
          .filter(([, p]) => p)
          // one player can lead two roles; show him once, under the first
          .filter(([, p], i, arr) => arr.findIndex(([, q]) => q.id === p.id) === i);

        return picked.map(([role, p]) => ({
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
              if (Number(g.passing_yards)) line.push(`${g.passing_completions || 0}/${g.passing_attempts || 0}, ${g.passing_yards} pass yds, ${g.passing_touchdowns || 0} TD, ${g.passing_interceptions || 0} INT`);
              if (Number(g.rushing_yards)) line.push(`${g.rushing_attempts || 0} car, ${g.rushing_yards} rush yds, ${g.rushing_touchdowns || 0} TD`);
              if (Number(g.receiving_yards)) line.push(`${g.receptions || 0} rec, ${g.receiving_yards} rec yds, ${g.receiving_touchdowns || 0} TD`);
              // No opponent joined = say so; never render a venue we do not have.
              const against = opponent
                ? `${venue}${opponent}`
                : '(opponent not carried by BDL for this game)';
              return `${footballWeekLabel(g.game?.week)} ${against}: ${line.join('; ') || 'no offensive stats'}`;
            })
        }));
      };

      const [homePlayers, awayPlayers] = await Promise.all([teamLogs(home), teamLogs(away)]);
      return {
        category: 'Player Game Logs',
        source: 'Ball Don\'t Lie',
        data_scope: 'Last 5 games for each side\'s leading passer, rusher and receiver',
        home: { team: home.full_name || home.name, players: homePlayers },
        away: { team: away.full_name || away.name, players: awayPlayers }
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

  // ═══════════════════════════════════════════════════════════════════════
  // COLLEGE RATINGS — CollegeFootballData (Aug 25 2026)
  //
  // These five factors answered "not available" because BDL's NCAAF season
  // row has thirteen fields and no ratings. CFBD returns the WHOLE LEAGUE per
  // request (SP+ 137 teams in one call), and the free tier is 1,000 requests
  // per calendar month — so everything here is bulk-fetched and cached, and
  // nothing is ever called per game.
  // ═══════════════════════════════════════════════════════════════════════

  NCAAF_SP_PLUS_RATINGS: async (bdlSport, home, away, season) => {
    const sp = await getSpPlus(season);
    if (sp.unavailable) {
      return { category: 'SP+', source: 'NOT AVAILABLE', reason: sp.reason,
        home: { team: home.full_name || home.name }, away: { team: away.full_name || away.name } };
    }
    const line = (team) => {
      const r = rowFor(sp, team.full_name || team.name);
      if (!r) return { team: team.full_name || team.name, note: 'No SP+ row matched this school.' };
      return {
        team: team.full_name || team.name,
        sp_rating: r.rating, sp_rank: r.ranking,
        offense_rank: r.offense?.ranking ?? null, offense_rating: r.offense?.rating ?? null,
        defense_rank: r.defense?.ranking ?? null, defense_rating: r.defense?.rating ?? null,
        special_teams_rating: r.specialTeams?.rating ?? null,
        conference: r.conference || null
      };
    };
    return {
      category: 'SP+ Ratings',
      source: 'CollegeFootballData',
      data_scope: `Opponent-adjusted SP+ for the ${season} season, ranked against all ${sp.rows.length} rated teams. This is the opponent adjustment BDL's raw yardage cannot provide.`,
      home: line(home), away: line(away)
    };
  },

  NCAAF_FPI_RATINGS: async (bdlSport, home, away, season) => {
    const fpi = await getFpi(season);
    if (fpi.unavailable) {
      return { category: 'FPI', source: 'NOT AVAILABLE', reason: fpi.reason,
        home: { team: home.full_name || home.name }, away: { team: away.full_name || away.name } };
    }
    const line = (team) => {
      const r = rowFor(fpi, team.full_name || team.name);
      if (!r) return { team: team.full_name || team.name, note: 'No FPI row matched this school.' };
      return {
        team: team.full_name || team.name,
        fpi: r.fpi, fpi_rank: r.resumeRanks?.fpi ?? null,
        efficiency_overall: r.efficiencies?.overall ?? null,
        efficiency_offense: r.efficiencies?.offense ?? null,
        efficiency_defense: r.efficiencies?.defense ?? null,
        efficiency_special_teams: r.efficiencies?.specialTeams ?? null
      };
    };
    return {
      category: 'FPI Ratings',
      source: 'CollegeFootballData',
      data_scope: `ESPN FPI and efficiency splits for ${season}, across ${fpi.rows.length} rated teams.`,
      home: line(home), away: line(away)
    };
  },

  NCAAF_STRENGTH_OF_SCHEDULE: async (bdlSport, home, away, season) => {
    const fpi = await getFpi(season);
    if (fpi.unavailable) {
      return { category: 'Strength of Schedule', source: 'NOT AVAILABLE', reason: fpi.reason,
        home: { team: home.full_name || home.name }, away: { team: away.full_name || away.name } };
    }
    const line = (team) => {
      const r = rowFor(fpi, team.full_name || team.name);
      if (!r) return { team: team.full_name || team.name, note: 'No FPI row matched this school.' };
      return {
        team: team.full_name || team.name,
        strength_of_schedule_rank: r.resumeRanks?.strengthOfSchedule ?? null,
        strength_of_record_rank: r.resumeRanks?.strengthOfRecord ?? null,
        game_control_rank: r.resumeRanks?.gameControl ?? null,
        average_win_probability_rank: r.resumeRanks?.averageWinProbability ?? null
      };
    };
    return {
      category: 'Strength of Schedule',
      source: 'CollegeFootballData',
      data_scope: 'FPI resume ranks. Strength of schedule says how hard the season has been; strength of RECORD says how impressive the record is given that schedule — a 10-2 against the 5th-hardest slate and a 10-2 against the 110th are not the same record.',
      home: line(home), away: line(away)
    };
  },

  NCAAF_CONFERENCE_STRENGTH: async (bdlSport, home, away, season) => {
    const sp = await getSpPlus(season);
    if (sp.unavailable) {
      return { category: 'Conference Strength', source: 'NOT AVAILABLE', reason: sp.reason,
        home: { team: home.full_name || home.name }, away: { team: away.full_name || away.name } };
    }
    // Aggregate the bulk SP+ we already hold — no extra request.
    const byConf = new Map();
    for (const r of sp.rows) {
      if (!r.conference || !Number.isFinite(r.rating)) continue;
      if (!byConf.has(r.conference)) byConf.set(r.conference, []);
      byConf.get(r.conference).push(r.rating);
    }
    const table = [...byConf.entries()]
      .map(([conference, ratings]) => ({
        conference,
        teams: ratings.length,
        avg_sp_rating: Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
      }))
      .sort((a, b) => b.avg_sp_rating - a.avg_sp_rating);
    table.forEach((c, i) => { c.rank = i + 1; });

    const line = (team) => {
      const r = rowFor(sp, team.full_name || team.name);
      const conf = r?.conference || null;
      const entry = conf ? table.find((c) => c.conference === conf) : null;
      return {
        team: team.full_name || team.name,
        conference: conf,
        conference_rank: entry?.rank ?? null,
        conference_avg_sp: entry?.avg_sp_rating ?? null,
        conferences_ranked: table.length
      };
    };
    return {
      category: 'Conference Strength',
      source: 'CollegeFootballData',
      data_scope: 'Average SP+ per conference, computed from the same bulk ratings pull. Context for whether a record was built inside a strong league or a weak one.',
      conference_table: table.slice(0, 12),
      home: line(home), away: line(away)
    };
  },

  NCAAF_VS_POWER_OPPONENTS: async (bdlSport, home, away, season) => {
    const [sp, homeResults, awayResults] = await Promise.all([
      getSpPlus(season),
      loadTeamResults(NCAAF_BDL_SPORT, home.id, season),
      loadTeamResults(NCAAF_BDL_SPORT, away.id, season)
    ]);
    if (sp.unavailable) {
      return { category: 'Vs Ranked Opposition', source: 'NOT AVAILABLE', reason: sp.reason,
        home: { team: home.full_name || home.name }, away: { team: away.full_name || away.name } };
    }
    // Join each completed game to the opponent's SP+ rank. This is the answer
    // to "how good was that team" for every result on the schedule.
    const rankOf = (opponentName) => rowFor(sp, opponentName)?.ranking ?? null;
    const line = (team, results) => {
      const rated = results
        .map((r) => ({ ...r, oppRank: rankOf(r.opponent) }))
        .filter((r) => r.oppRank != null);
      const vsTop = (limit) => {
        const subset = rated.filter((r) => r.oppRank <= limit);
        if (subset.length === 0) return null;
        const wins = subset.filter((r) => r.won).length;
        return {
          record: `${wins}-${subset.length - wins}`,
          games: subset.map((r) => `${r.won ? 'W' : 'L'} ${r.scored}-${r.allowed} ${r.home ? 'vs' : '@'} ${r.opponent} (SP+ #${r.oppRank})`)
        };
      };
      return {
        team: team.full_name || team.name,
        games_with_a_rated_opponent: rated.length,
        vs_sp_top_25: vsTop(25) || { note: 'No games against SP+ top-25 opposition.' },
        vs_sp_top_50: vsTop(50) || { note: 'No games against SP+ top-50 opposition.' }
      };
    };
    return {
      category: 'Vs Ranked Opposition',
      source: 'CollegeFootballData SP+ joined to the BDL schedule',
      data_scope: 'Every completed game joined to the opponent\'s SP+ rank. A 5-0 start against SP+ 90th-and-worse is a different 5-0 from one with a top-25 win in it.',
      home: line(home, homeResults), away: line(away, awayResults)
    };
  },

  /**
   * College QB line, aggregated from per-player game rows.
   *
   * The bare QB_STATS token resolves to the NFL fetcher across the shared
   * football family, and NFL season fields do not exist in BDL's 13-field
   * NCAAF row — completion percentage and yards per attempt came back N/A on
   * every college game. The per-player GAME endpoint carries completions and
   * attempts, so both are countable.
   */
  NCAAF_QB_STATS: async (bdlSport, home, away, season) => {
    try {
      const forTeam = async (team) => {
        const rows = await ballDontLieService.getNcaafPlayerGameStats({ teamId: team.id, season });
        if (!rows || rows.length === 0) return { note: 'No player game rows returned.' };
        const byPlayer = new Map();
        for (const r of rows) {
          const id = r?.player?.id;
          if (!id || !(Number(r.passing_attempts) > 0)) continue;
          const e = byPlayer.get(id) || {
            name: `${r.player.first_name || ''} ${r.player.last_name || ''}`.trim(),
            att: 0, comp: 0, yds: 0, td: 0, int: 0, games: 0
          };
          e.att += Number(r.passing_attempts) || 0;
          e.comp += Number(r.passing_completions) || 0;
          e.yds += Number(r.passing_yards) || 0;
          e.td += Number(r.passing_touchdowns) || 0;
          e.int += Number(r.passing_interceptions) || 0;
          e.games += 1;
          byPlayer.set(id, e);
        }
        const lead = [...byPlayer.values()].sort((a, b) => b.yds - a.yds)[0];
        if (!lead) return { note: 'No passer with attempts on file.' };
        return {
          quarterback: lead.name,
          games: lead.games,
          completions: lead.comp,
          attempts: lead.att,
          completion_pct: lead.att ? `${((lead.comp / lead.att) * 100).toFixed(1)}%` : 'N/A',
          passing_yards: lead.yds,
          yards_per_attempt: lead.att ? Number((lead.yds / lead.att).toFixed(2)) : 'N/A',
          touchdowns: lead.td,
          interceptions: lead.int
        };
      };
      const [h, a] = await Promise.all([forTeam(home), forTeam(away)]);
      return {
        category: 'Quarterback',
        source: 'Ball Don\'t Lie',
        data_scope: 'Season totals for the leading passer, summed from his per-game rows — the number of games behind the line is stated so a two-start sample cannot read like a full season.',
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
          committed += Number(own.turnovers) || 0;
          forced += Number(opp.turnovers) || 0;
          games += 1;
        }
        if (games === 0) return { note: 'No game had boxes for both teams.' };
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
  }

};
