/**
 * Tale of the Tape — Verified Stats Comparison
 *
 * Builds a verified comparison table for both teams using BDL data.
 * Sport-specific stat rows: NBA/NCAAB (efficiency), NHL (goals/PP/PK), NFL (yards/points), NCAAF (yards).
 */

/**
 * Build a verified Tale of the Tape comparison from BDL stats.
 * Returns { text, rows } where rows is structured data for iOS app.
 */
export function buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, sport, injuries = {}, recentHome = [], recentAway = []) {
  const homeStats = homeProfile?.seasonStats || {};
  const awayStats = awayProfile?.seasonStats || {};

  // Calculate recent record from last N games
  const calcRecentRecord = (teamName, recentGames, count = 5) => {
    if (!recentGames || recentGames.length === 0) return 'N/A';

    // Filter to completed games only
    const completed = recentGames.filter(g => (g.home_team_score ?? g.home_score ?? 0) > 0 || (g.visitor_team_score ?? g.away_team_score ?? g.away_score ?? 0) > 0);
    if (completed.length === 0) return 'N/A';

    let wins = 0, losses = 0;
    const lastN = completed.slice(0, count);

    for (const game of lastN) {
      const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
      const isHome = homeTeamName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
                     teamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop());
      const teamScore = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0);
      const oppScore = isHome ? (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
      if (teamScore > oppScore) wins++;
      else losses++;
    }

    return `${wins}-${losses}`;
  };

  const homeL5 = calcRecentRecord(homeTeam, recentHome, 5);
  const awayL5 = calcRecentRecord(awayTeam, recentAway, 5);
  const homeL10 = calcRecentRecord(homeTeam, recentHome, 10);
  const awayL10 = calcRecentRecord(awayTeam, recentAway, 10);

  // Helper to format stat — neutral presentation, no directional arrows
  // Gary compares the numbers himself — we don't pre-digest who's "better"
  const formatStat = (homeStat, awayStat) => {
    return { arrow: '|', home: homeStat || 'N/A', away: awayStat || 'N/A' };
  };

  // Get key injuries for each team (truncate if too long)
  const getKeyInjuries = (teamInjuries) => {
    if (!teamInjuries || teamInjuries.length === 0) return 'None';
    const out = teamInjuries.filter(i => i.status === 'Out' || i.status === 'OUT');
    const questionable = teamInjuries.filter(i => i.status === 'Questionable' || i.status === 'GTD' || i.status === 'Day-To-Day');
    const parts = [];
    // FIX: i.player can be an object {first_name, last_name} or a string - handle both
    const getPlayerName = (i) => {
      if (typeof i.player === 'string') return i.player;
      if (i.player?.first_name) return `${i.player.first_name} ${i.player.last_name || ''}`.trim();
      if (i.name) return i.name;
      return 'Unknown';
    };
    if (out.length > 0) parts.push(out.slice(0, 2).map(i => `${getPlayerName(i)} (O)`).join(', '));
    if (questionable.length > 0) parts.push(questionable.slice(0, 1).map(i => `${getPlayerName(i)} (Q)`).join(', '));
    return parts.join(', ') || 'None';
  };

  const homeInjuries = getKeyInjuries(injuries?.home);
  const awayInjuries = getKeyInjuries(injuries?.away);

  // Pad strings for alignment
  const padLeft = (str, len) => String(str).padStart(len);
  const padRight = (str, len) => String(str).padEnd(len);

  // Calculate column widths based on team names
  const col1Width = Math.max(homeTeam.length, 20);
  const col2Width = Math.max(awayTeam.length, 20);

  let rows = [];

  // Helper to format a numeric stat with toFixed
  const fmtNum = (val, decimals = 1) => {
    if (val === undefined || val === null) return 'N/A';
    const num = typeof val === 'number' ? val : parseFloat(val);
    return !isNaN(num) ? num.toFixed(decimals) : 'N/A';
  };
  const fmtPct = (val, decimals = 1) => {
    const str = fmtNum(val, decimals);
    return str === 'N/A' ? str : str + '%';
  };

  // Sport-specific stats
  if (sport === 'NBA' || sport === 'basketball_nba') {
    // NBA: 19 rows from BDL advanced + base stats
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const l5Form = formatStat(homeL5, awayL5, true);
    const l10Form = formatStat(homeL10, awayL10, true);

    // Advanced stats (from getTeamSeasonAdvanced: off_rating, def_rating, pace, efg_pct, ts_pct)
    const offRtg = formatStat(fmtNum(homeStats.off_rating), fmtNum(awayStats.off_rating));
    const defRtg = formatStat(fmtNum(homeStats.def_rating), fmtNum(awayStats.def_rating));
    const homeNetRtg = (parseFloat(homeStats.off_rating) || 0) - (parseFloat(homeStats.def_rating) || 0);
    const awayNetRtg = (parseFloat(awayStats.off_rating) || 0) - (parseFloat(awayStats.def_rating) || 0);
    const netRtg = formatStat(
      homeNetRtg ? (homeNetRtg > 0 ? '+' : '') + homeNetRtg.toFixed(1) : 'N/A',
      awayNetRtg ? (awayNetRtg > 0 ? '+' : '') + awayNetRtg.toFixed(1) : 'N/A'
    );
    const pace = formatStat(fmtNum(homeStats.pace), fmtNum(awayStats.pace));
    const efgPct = formatStat(fmtPct(homeStats.efg_pct), fmtPct(awayStats.efg_pct));
    const tsPct = formatStat(fmtPct(homeStats.ts_pct), fmtPct(awayStats.ts_pct));

    // Base stats (from getTeamBaseStats: pts, reb, ast, fg_pct, fg3_pct, ft_pct, tov, oreb, dreb)
    const ppg = formatStat(fmtNum(homeStats.pts), fmtNum(awayStats.pts));
    const rpg = formatStat(fmtNum(homeStats.reb), fmtNum(awayStats.reb));
    const apg = formatStat(fmtNum(homeStats.ast), fmtNum(awayStats.ast));
    const fgPct = formatStat(fmtPct(homeStats.fg_pct), fmtPct(awayStats.fg_pct));
    const threePct = formatStat(fmtPct(homeStats.fg3_pct), fmtPct(awayStats.fg3_pct));
    const ftPct = formatStat(fmtPct(homeStats.ft_pct), fmtPct(awayStats.ft_pct));
    const tovGm = formatStat(fmtNum(homeStats.tov), fmtNum(awayStats.tov));
    const orebGm = formatStat(fmtNum(homeStats.oreb), fmtNum(awayStats.oreb));
    const drebGm = formatStat(fmtNum(homeStats.dreb), fmtNum(awayStats.dreb));

    rows = [
      { label: 'Record', ...record },
      { label: 'L5 Form', ...l5Form },
      { label: 'L10 Form', ...l10Form },
      { label: 'Off Rating', ...offRtg },
      { label: 'Def Rating', ...defRtg },
      { label: 'Net Rating', ...netRtg },
      { label: 'Pace', ...pace },
      { label: 'eFG Pct', ...efgPct },
      { label: 'TS Pct', ...tsPct },
      { label: 'PPG', ...ppg },
      { label: 'RPG', ...rpg },
      { label: 'APG', ...apg },
      { label: 'FG Pct', ...fgPct },
      { label: '3PT Pct', ...threePct },
      { label: 'FT Pct', ...ftPct },
      { label: 'TOV/Gm', ...tovGm },
      { label: 'OREB/Gm', ...orebGm },
      { label: 'DREB/Gm', ...drebGm },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];

  } else if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
    // NCAAB: 12 rows using Barttorvik advanced metrics + BDL records
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const confRecord = formatStat(homeProfile?.conferenceRecord, awayProfile?.conferenceRecord, true);
    const l5Form = formatStat(homeL5, awayL5, true);
    const l10Form = formatStat(homeL10, awayL10, true);

    // Barttorvik data (passed via seasonStats.barttorvik)
    const homeBart = homeStats.barttorvik || {};
    const awayBart = awayStats.barttorvik || {};
    const adjOE = formatStat(fmtNum(homeBart.adjOE), fmtNum(awayBart.adjOE));
    const adjDE = formatStat(fmtNum(homeBart.adjDE), fmtNum(awayBart.adjDE));
    const homeEM = homeBart.adjEM != null ? (homeBart.adjEM > 0 ? '+' : '') + parseFloat(homeBart.adjEM).toFixed(1) : 'N/A';
    const awayEM = awayBart.adjEM != null ? (awayBart.adjEM > 0 ? '+' : '') + parseFloat(awayBart.adjEM).toFixed(1) : 'N/A';
    const adjEM = formatStat(homeEM, awayEM);
    const tempo = formatStat(fmtNum(homeBart.tempo), fmtNum(awayBart.tempo));
    const barthag = formatStat(fmtNum(homeBart.barthag, 4), fmtNum(awayBart.barthag, 4));
    const homeWab = homeBart.wab != null ? (homeBart.wab > 0 ? '+' : '') + parseFloat(homeBart.wab).toFixed(1) : 'N/A';
    const awayWab = awayBart.wab != null ? (awayBart.wab > 0 ? '+' : '') + parseFloat(awayBart.wab).toFixed(1) : 'N/A';
    const wab = formatStat(homeWab, awayWab);

    // Barttorvik rankings
    const tRank = formatStat(
      homeBart.rank != null ? '#' + homeBart.rank : 'N/A',
      awayBart.rank != null ? '#' + awayBart.rank : 'N/A'
    );
    const adjoeRank = formatStat(
      homeBart.adjOE_rank != null ? '#' + homeBart.adjOE_rank : 'N/A',
      awayBart.adjOE_rank != null ? '#' + awayBart.adjOE_rank : 'N/A'
    );
    const adjdeRank = formatStat(
      homeBart.adjDE_rank != null ? '#' + homeBart.adjDE_rank : 'N/A',
      awayBart.adjDE_rank != null ? '#' + awayBart.adjDE_rank : 'N/A'
    );
    const projRecord = formatStat(
      homeBart.projW != null && homeBart.projL != null ? `${Math.round(homeBart.projW)}-${Math.round(homeBart.projL)}` : 'N/A',
      awayBart.projW != null && awayBart.projL != null ? `${Math.round(awayBart.projW)}-${Math.round(awayBart.projL)}` : 'N/A'
    );

    rows = [
      { label: 'Record', ...record },
      { label: 'Conf Record', ...confRecord },
      { label: 'L5 Form', ...l5Form },
      { label: 'L10 Form', ...l10Form },
      { label: 'T-Rank', ...tRank },
      { label: 'AdjOE', ...adjOE },
      { label: 'AdjOE Rank', ...adjoeRank },
      { label: 'AdjDE', ...adjDE },
      { label: 'AdjDE Rank', ...adjdeRank },
      { label: 'AdjEM', ...adjEM },
      { label: 'Tempo', ...tempo },
      { label: 'Barthag', ...barthag },
      { label: 'WAB', ...wab },
      { label: 'Proj Record', ...projRecord },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];

  } else if (sport === 'NHL' || sport === 'icehockey_nhl') {
    // NHL: 15 rows from BDL + MoneyPuck + NHL API
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const l5Form = formatStat(homeL5, awayL5, true);
    const l10Form = formatStat(homeL10, awayL10, true);

    // Format goals per game
    const formatGoals = (val) => {
      if (val === undefined || val === null) return 'N/A';
      const num = typeof val === 'number' ? val : parseFloat(val);
      return !isNaN(num) ? num.toFixed(2) : 'N/A';
    };

    const goalsFor = formatStat(formatGoals(homeStats.goals_for_per_game), formatGoals(awayStats.goals_for_per_game));
    const goalsAgainst = formatStat(formatGoals(homeStats.goals_against_per_game), formatGoals(awayStats.goals_against_per_game));

    // Format PP/PK percentages - handle decimal format (0.17619) vs percentage format
    const formatPctNhl = (val) => {
      if (val === undefined || val === null) return 'N/A';
      const num = typeof val === 'number' ? val : parseFloat(val);
      if (isNaN(num)) return 'N/A';
      return num < 1 ? (num * 100).toFixed(1) + '%' : num.toFixed(1) + '%';
    };

    const ppPct = formatStat(formatPctNhl(homeStats.power_play_percentage), formatPctNhl(awayStats.power_play_percentage));
    const pkPct = formatStat(formatPctNhl(homeStats.penalty_kill_percentage), formatPctNhl(awayStats.penalty_kill_percentage));
    const shotsFor = formatStat(fmtNum(homeStats.shots_for_per_game), fmtNum(awayStats.shots_for_per_game));
    const faceoffPct = formatStat(
      homeStats.faceoff_win_percentage ? (parseFloat(homeStats.faceoff_win_percentage) * 100).toFixed(1) + '%' : 'N/A',
      awayStats.faceoff_win_percentage ? (parseFloat(awayStats.faceoff_win_percentage) * 100).toFixed(1) + '%' : 'N/A'
    );

    // MoneyPuck advanced stats (passed via seasonStats.moneyPuck)
    const homeMP = homeStats.moneyPuck || {};
    const awayMP = awayStats.moneyPuck || {};
    const corsiPct = formatStat(fmtPct(homeMP.corsi_pct), fmtPct(awayMP.corsi_pct));
    const xgPct = formatStat(fmtPct(homeMP.xg_pct), fmtPct(awayMP.xg_pct));

    // NHL API advanced stats (passed via seasonStats.nhlApi)
    const homeNHL = homeStats.nhlApi || {};
    const awayNHL = awayStats.nhlApi || {};
    const pdo = formatStat(fmtNum(homeNHL.pdo, 3), fmtNum(awayNHL.pdo, 3));
    const shPct5v5 = formatStat(fmtPct(homeNHL.shooting_pct_5v5), fmtPct(awayNHL.shooting_pct_5v5));
    const svPct5v5 = formatStat(fmtPct(homeNHL.save_pct_5v5), fmtPct(awayNHL.save_pct_5v5));

    rows = [
      { label: 'L5 Form', ...l5Form },
      { label: 'L10 Form', ...l10Form },
      { label: 'Record', ...record },
      { label: 'Goals For/Gm', ...goalsFor },
      { label: 'Goals Agst/Gm', ...goalsAgainst },
      { label: 'Shots For/Gm', ...shotsFor },
      { label: 'PP Pct', ...ppPct },
      { label: 'PK Pct', ...pkPct },
      { label: 'FO Pct', ...faceoffPct },
      { label: 'Corsi Pct', ...corsiPct },
      { label: 'xG Pct', ...xgPct },
      { label: 'PDO', ...pdo },
      { label: 'SH Pct 5v5', ...shPct5v5 },
      { label: 'SV Pct 5v5', ...svPct5v5 },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];

  } else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
    // NFL stats - has points per game fields
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const ppg = formatStat(
      homeStats.total_points_per_game?.toFixed?.(1) || homeStats.total_points_per_game,
      awayStats.total_points_per_game?.toFixed?.(1) || awayStats.total_points_per_game,
      true
    );
    const oppPpg = formatStat(
      homeStats.opp_total_points_per_game?.toFixed?.(1) || homeStats.opp_total_points_per_game,
      awayStats.opp_total_points_per_game?.toFixed?.(1) || awayStats.opp_total_points_per_game,
      false
    );
    const rushYpg = formatStat(
      homeStats.rushing_yards_per_game?.toFixed?.(1) || homeStats.rushing_yards_per_game,
      awayStats.rushing_yards_per_game?.toFixed?.(1) || awayStats.rushing_yards_per_game,
      true
    );
    const passYpg = formatStat(
      homeStats.net_passing_yards_per_game?.toFixed?.(1) || homeStats.net_passing_yards_per_game,
      awayStats.net_passing_yards_per_game?.toFixed?.(1) || awayStats.net_passing_yards_per_game,
      true
    );

    // L5 Form
    const l5Form = formatStat(homeL5, awayL5, true);

    rows = [
      { label: 'L5 Form', ...l5Form },
      { label: 'Record', ...record },
      { label: 'Points/Gm', ...ppg },
      { label: 'Opp Pts/Gm', ...oppPpg },
      { label: 'Rush Yds/Gm', ...rushYpg },
      { label: 'Pass Yds/Gm', ...passYpg },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];

  } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
    // NCAAF stats - BDL provides different fields than NFL
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const passYpg = formatStat(
      homeStats.passing_yards_per_game?.toFixed?.(1) || homeStats.passing_yards_per_game,
      awayStats.passing_yards_per_game?.toFixed?.(1) || awayStats.passing_yards_per_game,
      true
    );
    const rushYpg = formatStat(
      homeStats.rushing_yards_per_game?.toFixed?.(1) || homeStats.rushing_yards_per_game,
      awayStats.rushing_yards_per_game?.toFixed?.(1) || awayStats.rushing_yards_per_game,
      true
    );
    // Calculate total yards per game
    const homeTotalYpg = (parseFloat(homeStats.passing_yards_per_game) || 0) + (parseFloat(homeStats.rushing_yards_per_game) || 0);
    const awayTotalYpg = (parseFloat(awayStats.passing_yards_per_game) || 0) + (parseFloat(awayStats.rushing_yards_per_game) || 0);
    const totalYpg = formatStat(
      homeTotalYpg > 0 ? homeTotalYpg.toFixed(1) : null,
      awayTotalYpg > 0 ? awayTotalYpg.toFixed(1) : null,
      true
    );
    // Opp yards (total season, not per game - but useful for comparison)
    const oppPassYds = formatStat(
      homeStats.opp_passing_yards,
      awayStats.opp_passing_yards,
      false
    );
    const oppRushYds = formatStat(
      homeStats.opp_rushing_yards,
      awayStats.opp_rushing_yards,
      false
    );

    // L5 Form
    const l5Form = formatStat(homeL5, awayL5, true);

    rows = [
      { label: 'L5 Form', ...l5Form },
      { label: 'Record', ...record },
      { label: 'Pass Yds/Gm', ...passYpg },
      { label: 'Rush Yds/Gm', ...rushYpg },
      { label: 'Total Yds/Gm', ...totalYpg },
      { label: 'Opp Pass Yds', ...oppPassYds },
      { label: 'Opp Rush Yds', ...oppRushYds },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];

  } else {
    // Generic fallback
    const record = formatStat(homeProfile?.record, awayProfile?.record, true);
    const l5Form = formatStat(homeL5, awayL5, true);
    rows = [
      { label: 'L5 Form', ...l5Form },
      { label: 'Record', ...record },
      { label: 'Key Injuries', home: homeInjuries, away: awayInjuries, arrow: '' }
    ];
  }

  // Build the formatted table
  const headerLine = `                    ${padRight(homeTeam, col1Width)}    ${awayTeam}`;
  const rowLines = rows.map(row => {
    const label = padRight(row.label, 14);
    const homeVal = padLeft(row.home, 12);
    const arrow = row.arrow ? `  ${row.arrow}  ` : '     ';
    const awayVal = row.away;
    return `${label}${homeVal}${arrow}${awayVal}`;
  });

  const formattedText = `TALE OF THE TAPE (VERIFIED FROM BDL)

${headerLine}
${rowLines.join('\n')}`;

  // Return both formatted text AND structured rows for iOS app
  // The structured rows can be used for pick card display when toolCallHistory is sparse
  return {
    text: formattedText,
    rows: rows.map(row => ({
      name: row.label,
      token: row.label.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
      home: { team: homeTeam, value: row.home },
      away: { team: awayTeam, value: row.away }
    }))
  };
}
