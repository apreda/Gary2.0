/** Scout-report data: Team profiles (record, season stats) and name helpers. (split from dataFetchers.js, Oct 13 2026) */
import { ballDontLieService } from '../../../../ballDontLieService.js';
import { seasonForSport, sportToBdlKey, findTeam, formatStreak } from '../utilities.js';
import { hasSubstantiveNflSeasonStats, fetchNflTeamBaseline } from '../../../../nflTeamBaseline.js';

/**
 * Do two club names refer to the same club? (shared-mascot class, Aug 19
 * sweep): a bare last-word join reads "Ohio State" and "Oklahoma State" —
 * or "Red Sox" and "White Sox" — as the same club. Match only when the
 * shorter name appears in the longer one as a whole-word sequence, which
 * keeps every honest pairing ("Ohio State" ↔ "Ohio State Buckeyes",
 * "Red Sox" ↔ "Boston Red Sox") and rejects shared single words.
 * (mlbSeriesState.clubMatches is suffix-only — right for MLB nicknames,
 * wrong for college names where the school is the PREFIX.)
 */
/** The GAME's ET calendar date as display text ("August 27, 2026") for
 * narrative search queries — never the wall clock (a dossier rendered ahead
 * of a weekly game must not search "today's" matchup). Falls back to today
 * on a missing/bad timestamp. */
export function etGameDateLong(commenceTime) {
  const d = commenceTime ? new Date(commenceTime) : new Date();
  const instant = Number.isNaN(d.getTime()) ? new Date() : d;
  return instant.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  });
}

export function namesRefer(a, b) {
  const x = String(a || '').toLowerCase().trim();
  const y = String(b || '').toLowerCase().trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const [long, short] = x.length >= y.length ? [x, y] : [y, x];
  const esc = short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${esc}(\\s|$)`).test(long);
}

// ============================================================================
// TEAM PROFILE FUNCTIONS
// ============================================================================

const NCAAF_TAPE_PERFORMANCE_FIELDS = [
  'passing_yards_per_game',
  'rushing_yards_per_game',
  'opp_passing_yards',
  'opp_rushing_yards'
];

function exactFootballSeasonStatsRow(rows, teamId) {
  if (!Array.isArray(rows)) return rows || null;
  const exactRows = rows.filter((row) =>
    String(row?.team?.id ?? row?.team_id ?? '') === String(teamId)
  );
  return exactRows.length === 1 ? exactRows[0] : null;
}

export function hasSubstantiveNcaafSeasonStats(row) {
  if (!row || Array.isArray(row)) return false;
  return NCAAF_TAPE_PERFORMANCE_FIELDS.some((field) => {
    const value = row[field];
    if (value === null || value === undefined || value === '') return false;
    if (String(value).trim().toUpperCase() === 'N/A') return false;

    // BDL can expose an opening-week placeholder row whose performance fields
    // are all zero. That is not played-game evidence and must not suppress the
    // labeled prior-season baseline. Once a game has been played, at least one
    // of these yardage fields will be positive.
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric > 0 : false;
  });
}

export async function fetchTeamProfile(teamName, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return createEmptyProfile(teamName);
    
    // Get team data
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) return createEmptyProfile(teamName);
    
    // Calculate current season dynamically
    const currentSeason = seasonForSport(sport);
    
    // August uses the prior regular season. In September the provider can
    // expose last year's 17-game stats with this year's season label before
    // opening night; current rows also need a verified played-game sample.
    const isNfl = bdlSport === 'americanfootball_nfl';
    const isNcaaf = bdlSport === 'americanfootball_ncaaf';
    const isFootball = isNfl || isNcaaf;
    const priorSeason = currentSeason - 1;
    const nflBaseline = isNfl ? await fetchNflTeamBaseline(team.id,currentSeason) : null;
    let seasonStatsSeason = isNfl ? nflBaseline.season : currentSeason;
    let seasonStats = isNfl ? nflBaseline.stats : await ballDontLieService.getTeamSeasonStats(bdlSport, {
      teamId: team.id,
      season: seasonStatsSeason,
      postseason: false
    });
    
    // Both football team-season endpoints return arrays. Resolve the exact
    // requested team before Tale of the Tape reads the stat fields; leaving an
    // NFL response as an array made every verified row render N/A and tripped
    // the no-stats hard gate after Gary had completed a real investigation.
    if (isFootball && Array.isArray(seasonStats)) {
      seasonStats = exactFootballSeasonStatsRow(seasonStats, team.id);
      if (isNcaaf && seasonStats) {
        console.log(`[Scout Report] NCAAF ${teamName} season stats:`,
          `Pass YPG=${seasonStats.passing_yards_per_game ?? 'N/A'}, ` +
          `Rush YPG=${seasonStats.rushing_yards_per_game ?? 'N/A'}`);
      } else if (!seasonStats) {
        console.log(`[Scout Report] ${bdlSport === 'americanfootball_nfl' ? 'NFL' : 'NCAAF'} ${teamName} - no exact team season stats from BDL`);
      }
    }

    const currentRegularGamesPlayed = nflBaseline?.currentRegularGamesPlayed ?? null;

    // NCAAF opens in August before BDL has a current-season aggregate row.
    // Keep current-season data authoritative whenever it is substantive; only
    // then fall back to the exact prior completed season as an explicitly
    // labeled baseline. This preserves the no-stats hard gate when neither
    // season has verified performance data.
    if (isNcaaf && seasonStatsSeason === currentSeason && !hasSubstantiveNcaafSeasonStats(seasonStats)) {
      const priorRows = await ballDontLieService.getTeamSeasonStats(bdlSport, {
        teamId: team.id,
        season: priorSeason,
        postseason: false
      });
      const priorStats = exactFootballSeasonStatsRow(priorRows, team.id);
      if (hasSubstantiveNcaafSeasonStats(priorStats)) {
        seasonStats = priorStats;
        seasonStatsSeason = priorSeason;
      } else {
        // The current-season endpoint can expose an all-zero opening-week
        // placeholder before any game has been played. If the exact prior
        // season is also unavailable, surface no performance data so the
        // downstream hard gate retries instead of treating placeholder zeros
        // as an analyzed matchup and caching them for three hours.
        seasonStats = null;
        seasonStatsSeason = null;
      }
    }

    const seasonStatsScope = isFootball && seasonStatsSeason != null
      ? (seasonStatsSeason === priorSeason
          ? (isNfl ? 'prior_completed_regular_season' : 'prior_completed_season')
          : (isNfl ? 'current_regular_season' : 'current_season'))
      : null;
    const seasonStatsLabel = isFootball && seasonStatsSeason != null
      ? (seasonStatsSeason === priorSeason
          ? (isNfl
              ? `${seasonStatsSeason} prior completed regular-season baseline (not current-season form)`
              : `${seasonStatsSeason} prior completed season baseline (not current-season form)`)
          : `${seasonStatsSeason} current${isNfl ? ' regular' : ''} season`)
      : null;

    if (isNfl && hasSubstantiveNflSeasonStats(seasonStats)) {
      console.log(`[Scout Report] NFL ${teamName} performance baseline: ${seasonStatsSeason} (${seasonStatsScope})`);
    }
    if (isNcaaf && hasSubstantiveNcaafSeasonStats(seasonStats)) {
      console.log(`[Scout Report] NCAAF ${teamName} performance baseline: ${seasonStatsSeason} (${seasonStatsScope})`);
    }
    
    // Fetch standings - NCAAF requires conference_id from the team data
    let standings = [];
    let teamStanding = null;
    if (bdlSport === 'americanfootball_ncaaf') {
      // NCAAF: Requires conference_id - get from team.conference field
      const conferenceId = team.conference?.id ?? team.conference;
      if (conferenceId) {
        try {
          console.log(`[Scout Report] Fetching NCAAF standings for ${teamName} (conference: ${conferenceId})`);
          const standingsData = await ballDontLieService.getNcaafStandings(currentSeason, conferenceId);
          standings = standingsData || [];
          teamStanding = standings.find(s => String(s.team?.id) === String(team.id)
            && Number(s.season) === currentSeason);
          if (teamStanding) {
            // BDL can return null for 0 losses/wins - coerce to 0
            const w = teamStanding.wins ?? 0;
            const l = teamStanding.losses ?? 0;
            console.log(`[Scout Report] NCAAF ${teamName} standings: ${w}-${l}`);
          }
        } catch (e) {
          console.warn(`[Scout Report] NCAAF standings fetch failed for ${teamName}:`, e.message);
        }
      }
    } else {
      // NBA, NFL - no conference_id needed
      standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
      teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.name === teamName);
    }
    
    // BDL standings return wins/losses separately, not as "overall_record"
    // Use BDL as primary source, Gemini grounding as fallback when BDL fails
    // Note: BDL may return null for 0 wins/losses, so use ?? to coerce to 0
    let record = 'N/A';
    let homeRecord = teamStanding?.home_record || 'N/A';
    let awayRecord = teamStanding?.away_record || teamStanding?.road_record || 'N/A';
    let conferenceRecord = teamStanding?.conference_record || 'N/A';
    
    // Try BDL first - check that wins exists (can be 0, which is falsy but valid)
    const standingWins = teamStanding?.wins;
    const standingLosses = teamStanding?.losses;
    const statsWins = seasonStats?.wins;
    const statsLosses = seasonStats?.losses;
    
    const isNHL = sport === 'NHL' || bdlSport === 'icehockey_nhl';
    
    let recordSeason = null;
    let recordSource = null;
    if (standingWins !== undefined || standingLosses !== undefined) {
      // Use ?? to coerce null to 0 (BDL returns null for teams with 0 losses)
      if (isNHL) {
        const otLosses = teamStanding?.ot_losses ?? 0;
        record = `${standingWins ?? 0}-${standingLosses ?? 0}-${otLosses}`;
      } else {
        record = `${standingWins ?? 0}-${standingLosses ?? 0}`;
      }
      recordSeason = currentSeason;
      recordSource = 'standings';
      console.log(`[Scout Report] ${teamName} record from BDL standings: ${record}, conf: ${conferenceRecord}`);
    } else if (statsWins !== undefined || statsLosses !== undefined) {
      if (isNHL) {
        const otLosses = seasonStats?.ot_losses ?? 0;
        record = `${statsWins ?? 0}-${statsLosses ?? 0}-${otLosses}`;
      } else {
        record = `${statsWins ?? 0}-${statsLosses ?? 0}`;
      }
      recordSeason = seasonStatsSeason;
      recordSource = seasonStatsScope;
      console.log(`[Scout Report] ${teamName} record from BDL season stats: ${record}`);
    }
    
    // College standings answer one conference at a time, and a school new to its
    // league can be missing from them (Oct 9 2026: Utah State in the Pac-12).
    // Its finished games this season give the same record.
    if (record === 'N/A' && isNcaaf) {
      try {
        const { loadTeamResults } = await import('../../tools/statRouters/footballTeamGames.js');
        const results = await loadTeamResults(bdlSport, team.id, currentSeason);
        if (results.length) {
          const wins = results.filter(r => r.won).length;
          record = `${wins}-${results.length - wins}`;
          recordSeason = currentSeason;
          recordSource = 'completed games';
          console.log(`[Scout Report] ${teamName} record from this season's completed games: ${record}`);
        }
      } catch (e) {
        console.warn(`[Scout Report] ${teamName} completed-games record failed: ${e.message}`);
      }
    }

    // No grounding fallback — if BDL doesn't have the record, surface the gap
    if (record === 'N/A') {
      console.warn(`[Scout Report] ⚠️ ${teamName} record unavailable from BDL — check standings API. Returning N/A.`);
    }
    
    return {
      name: teamName,
      record,
      homeRecord,
      awayRecord,
      conferenceRecord,
      streak: formatStreak(teamStanding),
      seasonStats: seasonStats,
      seasonStatsSeason,
      seasonStatsScope,
      seasonStatsLabel,
      currentRegularGamesPlayed,
      recordSeason,
      recordSource,
      teamId: team.id,
      standing: teamStanding,
    };
  } catch (error) {
    console.warn(`[Scout Report] Error fetching profile for ${teamName}:`, error.message);
    return createEmptyProfile(teamName);
  }
}

/**
 * Create empty profile for missing data
 */
export function createEmptyProfile(teamName) {
  return {
    name: teamName,
    record: 'N/A',
    homeRecord: 'N/A',
    awayRecord: 'N/A',
    streak: 'N/A',
    seasonStats: null,
    standing: null
  };
}
