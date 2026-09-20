/** Card stat shaping; verified tape and protected injury rows remain with the caller. */
export const tokenToIosKey = {
  // Common stats
  'L5_FORM': 'last_5',
  'L10_FORM': 'last_10',
  'RECORD': 'overall',
  'CONF_RECORD': 'conference_record',
  'EFG_PCT': 'efg_pct',
  // NBA stats (from BDL advanced + base)
  'OFF_RATING': 'offensive_rating',
  'DEF_RATING': 'defensive_rating',
  'NET_RATING': 'net_rating',
  'PACE': 'pace',
  'TS_PCT': 'true_shooting_pct',
  'PPG': 'points_per_game',
  'RPG': 'rebounds_per_game',
  'APG': 'assists_per_game',
  'FG_PCT': 'fg_pct',
  '3PT_PCT': 'three_pct',
  'FT_PCT': 'ft_pct',
  'TOV_GM': 'turnovers_per_game',
  'OREB_GM': 'oreb_per_game',
  'DREB_GM': 'dreb_per_game',
  // NFL verified Tale of the Tape rows
  'POINTS_GM': 'points_per_game',
  'OPP_PTS_GM': 'opp_points_per_game',
  'RUSH_YDS_GM': 'rushing_yards_per_game',
  'PASS_YDS_GM': 'passing_ypg',
  // NCAAB Barttorvik stats
  'ADJOE': 'offensive_rating',
  'ADJDE': 'defensive_rating',
  'ADJEM': 'net_rating',
  'TEMPO': 'tempo',
  'T_RANK': 'kenpom_rank',
  'BARTHAG': 'efg_pct',  // Reuse efg_pct slot for Barthag display
  'WAB': 'wab',
  // NHL stats
  'GOALS_FOR_GM': 'goals_for_per_game',
  'GOALS_AGST_GM': 'goals_against_per_game',
  'SHOTS_FOR_GM': 'shots_for',
  'PP_PCT': 'power_play_pct',
  'PK_PCT': 'penalty_kill_pct',
  'FO_PCT': 'faceoff_pct',
  'CORSI_PCT': 'corsi_pct',
  'XG_PCT': 'xg_pct',
  'PDO': 'pdo',
  'SH_PCT_5V5': 'sh_pct_5v5',
  'SV_PCT_5V5': 'sv_pct_5v5',
  // NCAAB Barttorvik rankings
  'ADJOE_RANK': 'adjoe_rank',
  'ADJDE_RANK': 'adjde_rank',
  'PROJ_RECORD': 'proj_record',
  // MLB stats (RECORD already mapped above; do not duplicate)
  'L10_RECORD': 'l10',
  'HOME_AWAY': 'home_away',
  'HOME_AWAY_RECORD': 'home_away',
  'SP_ERA': 'sp_era',
  'SP_WHIP': 'sp_whip',
  'SP_K9': 'sp_k9',
  'SP_BB9': 'sp_bb9',
  'SP_RECORD': 'sp_record',
  'SP_IP': 'sp_ip',
  'SP_SO': 'sp_so',
  'TEAM_AVG': 'team_avg',
  'TEAM_OBP': 'team_obp',
  'TEAM_SLG': 'team_slg',
  'TEAM_OPS': 'team_ops',
  'TEAM_HR': 'team_hr',
  'SP_NAME': 'sp_name',
  'SP_STARTS': 'sp_starts',
  // iOS StatValues carries matching fields for all three since Jul 22 2026
  // (they rendered N/A before — Models.swift getValue had no cases).
  'TEAM_ERA': 'team_era',
  'TEAM_OPS_BDL': 'team_ops',
  'RUNS_PER_GAME': 'runs_per_game',
};

export function buildToolStats(result, config) {
  // Extract stat data with values for structured Tale of the Tape display
  // NOTE: iOS expects statsData rows to be keyed by the STAT TOKEN (e.g. TURNOVER_RATE),
  // and will only render values it can decode for that token. For NCAAB we keep 1 row per
  // token so the iOS app can show the full set Gary requested.
  const seenStatKeys = new Set(); // Track unique stat keys to avoid duplicates
  const statsData = [];

  // Helper to check if a value is valid
  const isValidValue = (k, v) => {
    if (k === 'team' || k === 'category' || k === 'note' || k === 'interpretation') return false;
    if (v === 'N/A' || v === '' || v === null || v === undefined) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === 'object') return false; // Skip nested objects
    if (String(v).includes('Check scout')) return false;
    // Filter out invalid zero rates
    if ((k.includes('rate') || k.includes('pct') || k.includes('_pct')) &&
      (v === '0.000' || v === 0 || v === '0' || v === '0.0' || v === '0.00')) {
      return false;
    }
    return true;
  };

  // Human-readable names for common stat keys
  const statNameMap = {
    // Football (NFL/NCAAF)
    'yards_per_game': 'Total YPG',
    'yards_per_play': 'Yards/Play',
    'points_per_game': 'PPG',
    'opp_yards_per_game': 'Opp Yards/Game',
    'opp_points_per_game': 'Opp PPG',
    'opp_ppg': 'Opp PPG',
    'third_down_pct': '3rd Down %',
    'fourth_down_pct': '4th Down %',
    'opp_third_down_pct': 'Opp 3rd Down %',
    'opp_fourth_down_pct': 'Opp 4th Down %',
    'turnover_diff': 'Turnover +/-',
    'takeaways': 'Takeaways',
    'giveaways': 'Giveaways',
    'qb_rating': 'QB Rating',
    'completion_pct': 'Completion %',
    'yards_per_attempt': 'Yards/Attempt',
    'passing_tds': 'Pass TDs',
    'interceptions': 'INTs',
    'rushing_yards_per_game': 'Rush YPG',
    'yards_per_carry': 'Yards/Carry',
    'rushing_tds': 'Rush TDs',
    'sacks_made': 'Sacks',
    'sacks_allowed': 'Sacks Allowed',
    'qb_hits': 'QB Hits',
    'fumble_recoveries': 'Fumble Rec',
    'total_takeaways': 'Total Takeaways',
    'point_diff': 'Point Diff',
    'red_zone_td_pct': 'Red Zone TD %',
    'red_zone_scores': 'Red Zone Scores',
    'red_zone_attempts': 'Red Zone Attempts',
    'receiving_yards_per_game': 'Receiving YPG',
    'receiving_tds': 'Receiving TDs',
    'yards_per_catch': 'Yards/Catch',
    'longest_pass': 'Long Pass',
    'total_yards_per_game': 'Total YPG',
    'passing_ypg': 'Passing YPG',
    'rushing_ypg': 'Rush YPG',
    'total_ypg': 'Total YPG',
    'total_tds': 'Total TDs',
    'opp_passing_yards': 'Opp Pass Yds',
    'opp_rushing_yards': 'Opp Rush Yds',
    'opp_total_yards': 'Opp Total Yds',
    'total_yards': 'Total Yards',
    'passing_yards': 'Pass Yards',
    'rushing_yards': 'Rush Yards',
    'passing_ints': 'Pass INTs',
    'interceptions_thrown': 'INTs Thrown',
    'sacks': 'Sacks',

    // NHL - Special Teams
    'pp_pct': 'Power Play %',
    'pk_pct': 'Penalty Kill %',
    'pp_opportunities': 'PP Ops',
    'ppPct': 'Power Play %',
    'pkPct': 'Penalty Kill %',

    // NHL - Advanced Analytics
    'corsi_for_pct': 'Corsi For %',
    'expected_goals_for_pct': 'xG For %',
    'xg_for_pct': 'xG For %',
    'cf_pct': 'Corsi For %',
    'xgf_pct': 'xG For %',
    'high_danger_pct': 'High Danger %',
    'high_danger_chances_for_pct': 'HD Chances %',
    'pdo': 'PDO',

    // NHL - Goalie Stats
    'save_pct': 'Save %',
    'gsax': 'GSAX',
    'gaa': 'GAA',
    'starter': 'Starting Goalie',
    'record': 'Goalie Record',

    // NHL - Shots & Goals
    'shots_for_pg': 'Shots For/G',
    'shots_against_pg': 'Shots Against/G',
    'goals_for_pg': 'Goals For/G',
    'goals_against_pg': 'Goals Against/G',
    'shot_diff': 'Shot Diff',
    'shotsForPerGame': 'Shots For/G',
    'shotsAgainstPerGame': 'Shots Against/G',
    'goalsForPerGame': 'Goals For/G',

    // NHL - Rest & Form
    'daysSinceLastGame': 'Days Rest',
    'isBackToBack': 'Back-to-Back',
    'gamesLast7Days': 'Games Last 7D',
    'goalsPerGame': 'Goals/Game',
    'goalsAgainstPerGame': 'GA/Game',
    'last5': 'Last 5',
    'last10': 'Last 10',

    // NHL - League Ranks
    'pp_rank': 'PP Rank',
    'pk_rank': 'PK Rank',
    'gf_rank': 'GF Rank',
    'ga_rank': 'GA Rank',
    'goals_for_rank': 'GF Rank',
    'goals_against_rank': 'GA Rank',

    // NCAAB
    'kenpom_rank': 'KenPom Rank',
    'adj_em': 'AdjEM',
    'adj_offense': 'AdjO',
    'adj_defense': 'AdjD',
    'net_rank': 'NET Rank',
    'net_ranking': 'NET Rank',
    'offensive_rating': 'Off Rating',
    'defensive_rating': 'Def Rating',
    'conference_record': 'Conf Record',
    'conference_win_pct': 'Conf Win %',
    'tempo': 'Tempo',

    // Weather
    'temperature': 'Temperature',
    'feels_like': 'Feels Like',
    'wind_speed': 'Wind Speed',
    'conditions': 'Conditions',
    'impact': 'Weather Impact'
  };

  // Normalize stat keys for dedup (e.g., opp_ppg and opp_points_per_game are the same)
  const normalizeKey = (key) => {
    const lower = key.toLowerCase();
    // Map common variations to canonical forms
    if (lower === 'opp_ppg' || lower === 'opp_points_per_game') return 'opp_ppg';
    if (lower === 'ppg' || lower === 'points_per_game') return 'ppg';
    if (lower === 'total_ypg' || lower === 'yards_per_game' || lower === 'total_yards_per_game' || lower === 'ypg') return 'ypg';
    if (lower === 'opp_ypg' || lower === 'opp_yards_per_game' || lower === 'opp_total_yards') return 'opp_ypg';
    if (lower === 'pass_tds' || lower === 'passing_tds' || lower === 'passing_touchdowns') return 'pass_tds';
    if (lower === 'rush_tds' || lower === 'rushing_tds' || lower === 'rushing_touchdowns') return 'rush_tds';
    if (lower === 'ints' || lower === 'interceptions' || lower === 'interceptions_thrown' || lower === 'passing_interceptions') return 'ints';
    if (lower === 'recv_ypg' || lower === 'receiving_yards_per_game' || lower === 'receiving_ypg') return 'recv_ypg';
    if (lower === 'recv_tds' || lower === 'receiving_tds' || lower === 'receiving_touchdowns') return 'recv_tds';
    if (lower === 'pp_pct' || lower === 'pppct' || lower === 'power_play_pct') return 'pp_pct';
    if (lower === 'pk_pct' || lower === 'pkpct' || lower === 'penalty_kill_pct') return 'pk_pct';
    if (lower === 'cf_pct' || lower === 'corsiforpct' || lower === 'corsi_for_pct') return 'cf_pct';
    if (lower === 'xgf_pct' || lower === 'xgforpct' || lower === 'xg_for_pct') return 'xgf_pct';
    return lower;
  };

  if (result.toolCallHistory) {
    // All sports now use flattened stats for better Tale of the Tape depth
    for (const t of result.toolCallHistory) {
      if (!t.token) continue;
      // Skip tracking-only entries (no actual stat data) — these are coverage markers, not display stats
      if (t.homeValue === undefined && t.awayValue === undefined) continue;
      // Skip unavailable stats
      if (t.quality === 'unavailable') continue;

      const homeVal = t.homeValue;
      const awayVal = t.awayValue;

      // If home/away are objects, flatten each key into its own stat row
      if (typeof homeVal === 'object' && homeVal !== null &&
        typeof awayVal === 'object' && awayVal !== null) {
          const homeKeys = Object.keys(homeVal).filter(k => isValidValue(k, homeVal[k]));
          const awayKeys = Object.keys(awayVal).filter(k => isValidValue(k, awayVal[k]));
          const allKeys = [...new Set([...homeKeys, ...awayKeys])];

          for (const key of allKeys) {
            const hv = homeVal[key];
            const av = awayVal[key];

            // Skip if both are invalid
            if (!isValidValue(key, hv) && !isValidValue(key, av)) continue;

            // Create unique key for dedup using normalized key
            const normalizedKey = normalizeKey(key);
            const statKey = `${normalizedKey}:${hv}:${av}`;
            if (seenStatKeys.has(statKey)) continue;
            seenStatKeys.add(statKey);

            // Get human-readable name
            const displayName = statNameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            statsData.push({
              name: displayName,
              token: key.toUpperCase(),
              home: { team: homeVal.team, [key]: hv ?? 'N/A' },
              away: { team: awayVal.team, [key]: av ?? 'N/A' }
            });
          }
        } else {
          // Primitive values - store directly
          if (homeVal === 'N/A' || awayVal === 'N/A') continue;

          const statKey = `${t.token}:${homeVal}:${awayVal}`;
          if (seenStatKeys.has(statKey)) continue;
          seenStatKeys.add(statKey);

          statsData.push({
            name: t.token.replace(/_/g, ' '),
            token: t.token,
            home: homeVal,
            away: awayVal
        });
      }
    }
  }

  // For NCAAF/NFL: Filter out useless stats that BDL doesn't provide
  if (config.key === 'americanfootball_ncaaf' || config.key === 'americanfootball_nfl') {
    // Remove stats with 0.0 or N/A values (BDL doesn't have this data)
    for (let i = statsData.length - 1; i >= 0; i--) {
      const stat = statsData[i];
      const home = stat.home || {};
      const away = stat.away || {};

      // Get values (excluding team name)
      const getVal = (obj) => {
        if (typeof obj !== 'object') return obj;
        const vals = Object.entries(obj).filter(([k]) => k !== 'team').map(([, v]) => v);
        return vals[0]; // First non-team value
      };

      const hv = getVal(home);
      const av = getVal(away);

      // Remove if both are zero or N/A
      const isZeroOrNA = (v) => v === '0.0' || v === '0' || v === 0 || v === 'N/A' || v === null || v === undefined;
      if (isZeroOrNA(hv) && isZeroOrNA(av)) {
        statsData.splice(i, 1);
      }
    }
  }

  // For NCAAB: Filter out stats that BDL doesn't provide for college basketball
  if (config.key === 'basketball_ncaab') {
    // Remove stats with 0.0 net ratings - BDL doesn't have efficiency ratings for NCAAB
    const efficiencyTokens = ['ADJ_EFFICIENCY_MARGIN', 'NET_RATING', 'ADJ_OFFENSIVE_EFF', 'ADJ_DEFENSIVE_EFF'];
    for (let i = statsData.length - 1; i >= 0; i--) {
      const stat = statsData[i];
      if (efficiencyTokens.includes(stat.token)) {
        const home = stat.home || {};
        const away = stat.away || {};
        // Check if net_rating is 0.0 or all values are N/A
        const netRatingZero = home.net_rating === '0.0' || home.net_rating === 0 ||
          away.net_rating === '0.0' || away.net_rating === 0;
        const allNA = Object.entries(home).filter(([k]) => k !== 'team').every(([, v]) => v === 'N/A') &&
          Object.entries(away).filter(([k]) => k !== 'team').every(([, v]) => v === 'N/A');
        if (netRatingZero || allNA) {
          statsData.splice(i, 1);
        }
      }

      // For TURNOVER_RATE and OREB_RATE - remove N/A rate fields, keep only per_game
      if (stat.token === 'TURNOVER_RATE' && stat.home && stat.away) {
        // Remove tov_rate if N/A, keep turnovers_per_game
        if (stat.home.tov_rate === 'N/A') delete stat.home.tov_rate;
        if (stat.away.tov_rate === 'N/A') delete stat.away.tov_rate;
        // Rename token for cleaner display
        stat.name = 'TURNOVERS PER GAME';
      }

      if (stat.token === 'OREB_RATE' && stat.home && stat.away) {
        // Remove oreb_rate if N/A, keep oreb_per_game
        if (stat.home.oreb_rate === 'N/A') delete stat.home.oreb_rate;
        if (stat.away.oreb_rate === 'N/A') delete stat.away.oreb_rate;
        // Rename token for cleaner display
        stat.name = 'OFFENSIVE REBOUNDS PER GAME';
      }

      // Filter out RECENT_FORM if it has undefined scores (means no completed games)
      if (stat.token === 'RECENT_FORM' && stat.home && stat.away) {
        const hasUndefinedScores = (stat.home.summary && stat.home.summary.includes('undefined-undefined')) ||
          (stat.away.summary && stat.away.summary.includes('undefined-undefined'));
        const allTies = (stat.home.last_5 && stat.home.last_5.match(/^T+$/)) ||
          (stat.away.last_5 && stat.away.last_5.match(/^T+$/));
        if (hasUndefinedScores || allTies) {
          statsData.splice(i, 1);
        }
      }
    }
  }
  return statsData;
}
