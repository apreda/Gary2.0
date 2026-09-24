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
  // and will only render values it can decode for that token.
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

    // Ratings and conference records (NBA, NCAAF)
    'offensive_rating': 'Off Rating',
    'defensive_rating': 'Def Rating',
    'conference_record': 'Conf Record',
    'conference_win_pct': 'Conf Win %',

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

  return statsData;
}
