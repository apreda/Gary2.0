import { ballDontLieService } from '../../ballDontLieService.js';

/**
 * Check if Gary has investigated enough to proceed to bilateral cases.
 * Based on tool call breadth and iteration count.
 *
 * @param {Array} toolCallHistory - Array of tool calls with token property
 * @param {number} iteration - Current iteration number
 * @returns {Object} - { sufficient: boolean, categoryCount: number, totalCalls: number }
 */
export function isInvestigationSufficient(toolCallHistory, iteration) {
  // Count unique stat categories (base tokens without player-specific suffixes)
  const uniqueCategories = new Set(
    toolCallHistory
      .filter(t => t.token && t.quality !== 'unavailable')
      .map(t => t.token.split(':')[0])
  );
  const categoryCount = uniqueCategories.size;
  const totalCalls = toolCallHistory.length;

  // Investigation is sufficient when:
  // - 6+ unique categories at any point, OR
  // - 4+ unique categories after 5+ iterations (time-based safety)
  const sufficient = categoryCount >= 6 || (iteration >= 5 && categoryCount >= 4);

  return { sufficient, categoryCount, totalCalls };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT SUMMARIZATION (Signal-to-Noise Optimization)
// ═══════════════════════════════════════════════════════════════════════════
// Convert raw JSON stat responses to natural language summaries.
// This reduces context size by ~70% and helps the model REASON about
// basketball instead of PARSING JSON brackets.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Summarize a stat result into natural language for the model
 * @param {Object} statResult - Raw stat result from statRouter
 * @param {string} statToken - The stat token (e.g., 'NET_RATING', 'RECENT_FORM')
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {string} Natural language summary
 */
export function summarizeStatForContext(statResult, statToken, homeTeam, awayTeam) {
  if (!statResult) return `${statToken}: No data available`;

  // Check for error responses from fetchers — don't format empty objects as if they contain data
  if (statResult.error) return `${statToken}: ${statResult.error}`;

  try {
    const { home, away, homeValue, awayValue } = statResult;
    const h = home || homeValue || {};
    const a = away || awayValue || {};

    // Randomize team presentation order to prevent primacy bias
    const homeFirst = Math.random() < 0.5;
    const orderTeams = (label, homeStr, awayStr, suffix) => {
      const line = homeFirst
        ? `${label}: ${homeTeam} ${homeStr} | ${awayTeam} ${awayStr}`
        : `${label}: ${awayTeam} ${awayStr} | ${homeTeam} ${homeStr}`;
      return suffix ? `${line} ${suffix}` : line;
    };

    switch (statToken) {
      case 'NET_RATING':
        return orderTeams('NET RATING',
          formatNum(h.net_rating || h.netRating),
          formatNum(a.net_rating || a.netRating));

      case 'OFFENSIVE_RATING':
        return orderTeams('OFFENSIVE RATING',
          formatNum(h.offensive_rating || h.off_rating || h.offRating),
          formatNum(a.offensive_rating || a.off_rating || a.offRating),
          '(points per 100 possessions)');

      case 'DEFENSIVE_RATING':
        return orderTeams('DEFENSIVE RATING',
          formatNum(h.defensive_rating || h.def_rating || h.defRating),
          formatNum(a.defensive_rating || a.def_rating || a.defRating));

      case 'RECENT_FORM': {
        // NHL returns l5/l10 objects; other sports return summary/last_5 strings
        const awayForm = a.summary || a.last_5 || (a.l5?.record ? `${a.l5.record} (L5)` : 'N/A');
        const homeForm = h.summary || h.last_5 || (h.l5?.record ? `${h.l5.record} (L5)` : 'N/A');
        return orderTeams('RECENT FORM (Last 5)', homeForm, awayForm);
      }

      case 'HOME_AWAY_SPLITS':
        // Standard contract: all sports return { home_record, away_record, home_margin?, away_margin? }
        return orderTeams('HOME/AWAY SPLITS',
          `home ${h.home_record}${h.home_margin ? ` (${h.home_margin > 0 ? '+' : ''}${h.home_margin} margin)` : ''} | road ${h.away_record}`,
          `home ${a.home_record} | road ${a.away_record}${a.away_margin ? ` (${a.away_margin > 0 ? '+' : ''}${a.away_margin} margin)` : ''}`);

      case 'PACE':
        return orderTeams('PACE',
          formatNum(h.pace),
          formatNum(a.pace),
          'possessions/game');

      case 'EFG_PCT':
        return orderTeams('EFFECTIVE FG%',
          formatPct(h.efg_pct || h.eFG),
          formatPct(a.efg_pct || a.eFG));

      case 'TURNOVER_RATE':
        return orderTeams('TURNOVER RATE',
          formatPct(h.tov_rate || h.tovRate),
          formatPct(a.tov_rate || a.tovRate));

      case 'OREB_RATE':
        return orderTeams('OFFENSIVE REBOUND RATE',
          formatPct(h.oreb_pct || h.oreb_rate || h.orebRate),
          formatPct(a.oreb_pct || a.oreb_rate || a.orebRate));

      case 'THREE_PT_SHOOTING':
        return orderTeams('3PT SHOOTING',
          `${formatPct(h.three_pct || h.fg3_pct || h.threePct)} on ${formatNum(h.three_attempted_per_game || h.fg3a || h.threeAttempts)} attempts`,
          `${formatPct(a.three_pct || a.fg3_pct || a.threePct)} on ${formatNum(a.three_attempted_per_game || a.fg3a || a.threeAttempts)} attempts`);

      case 'PAINT_SCORING':
        return orderTeams('PAINT SCORING',
          `${formatPct(h.pct_paint || h.paint_ppg || h.value)} of scoring in paint`,
          `${formatPct(a.pct_paint || a.paint_ppg || a.value)} of scoring in paint`);
      case 'PAINT_DEFENSE':
        return orderTeams('PAINT DEFENSE',
          `${formatNum(h.opp_pts_paint || h.paint_ppg || h.value)} opp PPG in paint`,
          `${formatNum(a.opp_pts_paint || a.paint_ppg || a.value)} opp PPG in paint`);

      // ===== NCAAB TOKENS =====

      case 'NCAAB_FOUR_FACTORS':
        return orderTeams('FOUR FACTORS',
          `eFG ${formatPct(h.efg_pct)} | TOV ${formatPct(h.tov_rate)} | ORB ${formatPct(h.oreb_pct)} | FT Rate ${formatNum(h.fta_rate)}`,
          `eFG ${formatPct(a.efg_pct)} | TOV ${formatPct(a.tov_rate)} | ORB ${formatPct(a.oreb_pct)} | FT Rate ${formatNum(a.fta_rate)}`);

      case 'NCAAB_EFG_PCT':
        return orderTeams('EFFECTIVE FG% (NCAAB)',
          formatPct(h.efg_pct),
          formatPct(a.efg_pct));

      case 'NCAAB_BARTTORVIK':
        return orderTeams('BARTTORVIK T-RANK',
          `#${formatNum(h.t_rank)} | AdjOE ${formatNum(h.adj_oe)} | AdjDE ${formatNum(h.adj_de)} | AdjEM ${formatNum(h.adj_em)} | Tempo ${formatNum(h.tempo)}`,
          `#${formatNum(a.t_rank)} | AdjOE ${formatNum(a.adj_oe)} | AdjDE ${formatNum(a.adj_de)} | AdjEM ${formatNum(a.adj_em)} | Tempo ${formatNum(a.tempo)}`);

      case 'NCAAB_OFFENSIVE_RATING':
        return orderTeams('ADJ OFFENSIVE EFFICIENCY (NCAAB)',
          `${formatNum(h.offensive_rating)} (Rank ${formatNum(h.adjOE_rank)})`,
          `${formatNum(a.offensive_rating)} (Rank ${formatNum(a.adjOE_rank)})`);

      case 'NCAAB_DEFENSIVE_RATING':
        return orderTeams('ADJ DEFENSIVE EFFICIENCY (NCAAB)',
          `${formatNum(h.defensive_rating)} (Rank ${formatNum(h.adjDE_rank)})`,
          `${formatNum(a.defensive_rating)} (Rank ${formatNum(a.adjDE_rank)})`);

      case 'NCAAB_TEMPO':
        return orderTeams('TEMPO (NCAAB)',
          `${formatNum(h.tempo)} poss/game`,
          `${formatNum(a.tempo)} poss/game`);

      case 'NCAAB_L5_EFFICIENCY':
        return orderTeams('L5 EFFICIENCY (NCAAB)',
          `eFG ${formatPct(h.efg_pct)} | TS ${formatPct(h.ts_pct)} | ORtg ${formatNum(h.approx_ortg)} | DRtg ${formatNum(h.approx_drtg)} | Net ${formatNum(h.approx_net_rtg)}`,
          `eFG ${formatPct(a.efg_pct)} | TS ${formatPct(a.ts_pct)} | ORtg ${formatNum(a.approx_ortg)} | DRtg ${formatNum(a.approx_drtg)} | Net ${formatNum(a.approx_net_rtg)}`);

      case 'SCORING':
        return orderTeams('SCORING',
          `${formatNum(h.points_per_game || h.pts)} PPG (FG ${formatPct(h.fg_pct)})`,
          `${formatNum(a.points_per_game || a.pts)} PPG (FG ${formatPct(a.fg_pct)})`);

      case 'REBOUNDS':
        return orderTeams('REBOUNDING',
          `${formatNum(h.rebounds_per_game || h.reb)} RPG (OREB ${formatNum(h.oreb_per_game || h.oreb)} | DREB ${formatNum(h.dreb_per_game || h.dreb)})`,
          `${formatNum(a.rebounds_per_game || a.reb)} RPG (OREB ${formatNum(a.oreb_per_game || a.oreb)} | DREB ${formatNum(a.dreb_per_game || a.dreb)})`);

      case 'ASSISTS':
        return orderTeams('ASSISTS',
          `${formatNum(h.assists_per_game || h.ast)} APG`,
          `${formatNum(a.assists_per_game || a.ast)} APG`);

      case 'STEALS':
        return orderTeams('STEALS',
          `${formatNum(h.steals_per_game || h.stl)} SPG`,
          `${formatNum(a.steals_per_game || a.stl)} SPG`);

      case 'BLOCKS':
        return orderTeams('BLOCKS',
          `${formatNum(h.blocks_per_game || h.blk)} BPG`,
          `${formatNum(a.blocks_per_game || a.blk)} BPG`);

      case 'FT_RATE':
        return orderTeams('FREE THROW RATE',
          `${formatNum(h.ft_rate)} FT Rate | ${formatPct(h.ft_pct)} FT% | ${formatNum(h.fta_per_game)} FTA/g`,
          `${formatNum(a.ft_rate)} FT Rate | ${formatPct(a.ft_pct)} FT% | ${formatNum(a.fta_per_game)} FTA/g`);

      case 'NCAAB_VENUE': {
        // NCAAB_VENUE returns { venue, home_team, away_team } at top level (no home/away objects)
        const venueName = statResult.venue || 'N/A';
        return `VENUE: ${venueName} (${statResult.home_team || homeTeam} home)`;
      }

      case 'H2H_HISTORY':
        // Preserve FULL context: dates, scores, margins, revenge status, sweep context, PERSONNEL
        const h2hGames = statResult.meetings_this_season || statResult.games || statResult.h2h || [];
        if (h2hGames.length === 0) {
          return `H2H HISTORY: No matchups this season. ${statResult.IMPORTANT || 'Check Scout Report for prior season data.'}`;
        }
        // Include personnel notes (DNPs, top scorers) so Gary sees WHO PLAYED in each H2H game
        const h2hDetails = h2hGames.slice(0, 5).map(g => {
          const date = g.date || 'N/A';
          const result = g.result || g.score || 'N/A';
          const personnel = g.personnel_note && g.personnel_note !== '(Box score unavailable)' 
            ? ` [${g.personnel_note}]` 
            : '';
          return `${date}: ${result}${personnel}`;
        }).join(' | ');
        const seriesRecord = statResult.this_season_record || '';
        const revengeNote = statResult.revenge_note || '';
        
        // Include sweep context if detected (NBA-specific trap detection)
        const sweepContext = statResult.sweep_context;
        let sweepContextStr = '';
        if (sweepContext?.triggered) {
          const marginInfo = sweepContext.margin_context ? ` ${sweepContext.margin_context}` : '';
          sweepContextStr = ` | ${sweepContext.sweep_note}${marginInfo}`;
        }
        
        // Add CONDITIONS CHANGED context if detected
        const conditionsChanged = statResult.conditions_changed_context;
        let conditionsChangedStr = '';
        if (conditionsChanged?.triggered) {
          conditionsChangedStr = ` | ${conditionsChanged.note}`;
        }
        
        return `H2H HISTORY (${h2hGames.length} games this season): ${seriesRecord}. Meetings: ${h2hDetails}${revengeNote ? ` [REVENGE: ${revengeNote}]` : ''}${sweepContextStr}${conditionsChangedStr}`;
      
      case 'CLUTCH_STATS':
        return orderTeams('CLUTCH PERFORMANCE',
          `${h.clutch_record || 'N/A'} (Net ${h.clutch_net_rating || 'N/A'}, Rank ${h.clutch_net_rank || 'N/A'}, eFG ${h.clutch_efg_pct || 'N/A'})`,
          `${a.clutch_record || 'N/A'} (Net ${a.clutch_net_rating || 'N/A'}, Rank ${a.clutch_net_rank || 'N/A'}, eFG ${a.clutch_efg_pct || 'N/A'})`);

      case 'BENCH_DEPTH':
        return orderTeams('BENCH DEPTH',
          `bench ${formatNum(h.bench_ppg || h.value)} PPG (${h.bench_pct || ''} of scoring, ${h.rotation_size || '?'}-man rotation${h.top_bench ? ', top bench: ' + h.top_bench : ''})`,
          `bench ${formatNum(a.bench_ppg || a.value)} PPG (${a.bench_pct || ''} of scoring, ${a.rotation_size || '?'}-man rotation${a.top_bench ? ', top bench: ' + a.top_bench : ''})`);

      case 'REST_SITUATION':
        return orderTeams('REST',
          `${h.days_rest ?? 'N/A'} days rest${h.is_b2b ? ' (B2B)' : ''}`,
          `${a.days_rest ?? 'N/A'} days rest${a.is_b2b ? ' (B2B)' : ''}`);

      // ===== NBA / GENERAL TOKENS =====

      case 'CONFERENCE_STANDING':
      case 'STANDINGS': {
        // Some fetchers return a top-level context string instead of home/away objects
        if (statResult.context) return `${statToken}: ${statResult.context}`;
        if (statResult.comparison) return `${statToken}: ${statResult.comparison}`;
        if (statResult.data_scope) return `${statToken}: ${statResult.data_scope}`;
        const hStanding = h.record || h.standing || h.seed || 'N/A';
        const aStanding = a.record || a.standing || a.seed || 'N/A';
        return orderTeams(statToken.replace(/_/g, ' '),
          String(hStanding),
          String(aStanding));
      }

      case 'DREB_RATE': {
        const hDrebPct = h.dreb_pct || h.dreb_rate;
        const aDrebPct = a.dreb_pct || a.dreb_rate;
        const hDreb = h.dreb_per_game || h.dreb;
        const aDreb = a.dreb_per_game || a.dreb;
        // Show percentage if available (NBA), otherwise show per-game with rebounds breakdown
        if (hDrebPct || aDrebPct) {
          return orderTeams('DEFENSIVE REBOUND RATE',
            `${formatPct(hDrebPct)} DREB% (${formatNum(hDreb)} DREB/g)`,
            `${formatPct(aDrebPct)} DREB% (${formatNum(aDreb)} DREB/g)`);
        }
        return orderTeams('DEFENSIVE REBOUNDING',
          `${formatNum(hDreb)} DREB/g (${formatNum(h.oreb_per_game || h.oreb)} OREB | ${formatNum(h.reb_per_game || h.reb)} Total)`,
          `${formatNum(aDreb)} DREB/g (${formatNum(a.oreb_per_game || a.oreb)} OREB | ${formatNum(a.reb_per_game || a.reb)} Total)`);
      }

      case 'OPP_EFG_PCT':
        return orderTeams('OPPONENT eFG%',
          formatPct(h.opp_efg_pct || h.opp_fg_pct),
          formatPct(a.opp_efg_pct || a.opp_fg_pct));

      case 'OPP_TOV_RATE':
        return orderTeams('FORCED TURNOVER RATE',
          formatPct(h.opp_tov_rate || h.opp_tov_pct),
          formatPct(a.opp_tov_rate || a.opp_tov_pct));

      case 'OPP_FT_RATE':
        return orderTeams('OPPONENT FT RATE',
          formatNum(h.opp_ft_rate || h.opp_fta_rate),
          formatNum(a.opp_ft_rate || a.opp_fta_rate));

      case 'THREE_PT_DEFENSE':
      case 'PERIMETER_DEFENSE':
        return orderTeams('OPPONENT 3PT%',
          formatPct(h.opp_fg3_pct || h.opp_three_pct),
          formatPct(a.opp_fg3_pct || a.opp_three_pct));

      case 'TRANSITION_DEFENSE':
        return orderTeams('TRANSITION DEFENSE',
          `${formatNum(h.opp_pts_fb || h.fastbreak_pts_allowed)} fastbreak PPG allowed`,
          `${formatNum(a.opp_pts_fb || a.fastbreak_pts_allowed)} fastbreak PPG allowed`);

      case 'EFFICIENCY_LAST_10': {
        if (statResult.context) return `EFFICIENCY LAST 10: ${statResult.context}`;
        if (statResult.comparison) return `EFFICIENCY LAST 10: ${statResult.comparison}`;
        return orderTeams('L10 EFFICIENCY',
          `${formatNum(h.point_diff || h.net_rating || h.l10_net_rating)} net`,
          `${formatNum(a.point_diff || a.net_rating || a.l10_net_rating)} net`);
      }

      case 'PACE_LAST_10': {
        if (statResult.context) return `PACE LAST 10: ${statResult.context}`;
        if (statResult.comparison) return `PACE LAST 10: ${statResult.comparison}`;
        return orderTeams('L10 PACE',
          `${formatNum(h.recent_pace || h.l10_pace)} recent vs ${formatNum(h.season_pace || h.pace)} season`,
          `${formatNum(a.recent_pace || a.l10_pace)} recent vs ${formatNum(a.season_pace || a.pace)} season`);
      }

      case 'SCHEDULE_STRENGTH': {
        if (statResult.context) return `SCHEDULE STRENGTH: ${statResult.context}`;
        if (statResult.comparison) return `SCHEDULE STRENGTH: ${statResult.comparison}`;
        return orderTeams('SOS',
          `${formatNum(h.sos || h.strength_of_schedule || h.sos_rank)}`,
          `${formatNum(a.sos || a.strength_of_schedule || a.sos_rank)}`);
      }

      case 'LINEUP_NET_RATINGS': {
        if (statResult.context) return `LINEUP NET RATINGS: ${statResult.context}`;
        if (statResult.comparison) return `LINEUP NET RATINGS: ${statResult.comparison}`;
        return orderTeams('LINEUP NET RATING',
          `bench ${formatNum(h.bench_net_rating || h.bench_net)} | starter ${formatNum(h.starter_net_rating || h.starter_net)}`,
          `bench ${formatNum(a.bench_net_rating || a.bench_net)} | starter ${formatNum(a.starter_net_rating || a.starter_net)}`);
      }

      case 'QUARTER_SCORING': {
        if (statResult.context) return `QUARTER SCORING: ${statResult.context}`;
        if (statResult.comparison) return `QUARTER SCORING: ${statResult.comparison}`;
        if (statResult.data_scope) return `QUARTER SCORING: ${statResult.data_scope}`;
        return orderTeams('Q1-Q4 SCORING',
          `Q1 ${formatNum(h.q1)} | Q2 ${formatNum(h.q2)} | Q3 ${formatNum(h.q3)} | Q4 ${formatNum(h.q4)}`,
          `Q1 ${formatNum(a.q1)} | Q2 ${formatNum(a.q2)} | Q3 ${formatNum(a.q3)} | Q4 ${formatNum(a.q4)}`);
      }

      case 'FIRST_HALF_SCORING': {
        if (statResult.context) return `FIRST HALF SCORING: ${statResult.context}`;
        if (statResult.comparison) return `FIRST HALF SCORING: ${statResult.comparison}`;
        return orderTeams('1H SCORING',
          `${formatNum(h.first_half_ppg || h.h1_ppg || h.first_half)} PPG`,
          `${formatNum(a.first_half_ppg || a.h1_ppg || a.first_half)} PPG`);
      }

      case 'SECOND_HALF_SCORING': {
        if (statResult.context) return `SECOND HALF SCORING: ${statResult.context}`;
        if (statResult.comparison) return `SECOND HALF SCORING: ${statResult.comparison}`;
        return orderTeams('2H SCORING',
          `${formatNum(h.second_half_ppg || h.h2_ppg || h.second_half)} PPG`,
          `${formatNum(a.second_half_ppg || a.h2_ppg || a.second_half)} PPG`);
      }

      // ===== NHL TOKENS =====

      case 'CORSI_FOR_PCT':
        return orderTeams('CORSI / FENWICK',
          `CF% ${formatPct(h.corsi_for_pct || h.corsi_pct || h.cf_pct)} | FF% ${formatPct(h.fenwick_pct || h.ff_pct)} | SA diff ${formatNum(h.shot_attempt_diff)}`,
          `CF% ${formatPct(a.corsi_for_pct || a.corsi_pct || a.cf_pct)} | FF% ${formatPct(a.fenwick_pct || a.ff_pct)} | SA diff ${formatNum(a.shot_attempt_diff)}`);

      case 'EXPECTED_GOALS':
        return orderTeams('EXPECTED GOALS',
          `xGF% ${formatPct(h.xg_pct || h.xgf_pct)} (xGF ${formatNum(h.xg_for || h.xgf)} | xGA ${formatNum(h.xg_against || h.xga)} | GAE ${formatNum(h.goals_above_expected)})`,
          `xGF% ${formatPct(a.xg_pct || a.xgf_pct)} (xGF ${formatNum(a.xg_for || a.xgf)} | xGA ${formatNum(a.xg_against || a.xga)} | GAE ${formatNum(a.goals_above_expected)})`);

      case 'GOALIE_STATS': {
        // Goalies come as an array — extract starter info
        const hGoalies = Array.isArray(h.goalies) ? h.goalies : [];
        const aGoalies = Array.isArray(a.goalies) ? a.goalies : [];
        const hStarter = hGoalies[0];
        const aStarter = aGoalies[0];
        const fmtGoalie = (g) => g ? `${g.name || 'Unknown'} ${formatPct(g.save_pct || g.sv_pct)} SV%` : 'N/A';
        return orderTeams('GOALIE STATS', fmtGoalie(hStarter), fmtGoalie(aStarter));
      }

      case 'SPECIAL_TEAMS':
        return orderTeams('SPECIAL TEAMS',
          `PP ${formatPct(h.power_play_pct || h.pp_pct)} | PK ${formatPct(h.penalty_kill_pct || h.pk_pct)}`,
          `PP ${formatPct(a.power_play_pct || a.pp_pct)} | PK ${formatPct(a.penalty_kill_pct || a.pk_pct)}`);

      case 'GOALS_FOR':
        return orderTeams('GOALS FOR',
          formatNum(h.goals_for_per_game || h.gf_per_game || h.goals_for) + ' G/gm',
          formatNum(a.goals_for_per_game || a.gf_per_game || a.goals_for) + ' G/gm');

      case 'GOALS_AGAINST':
        return orderTeams('GOALS AGAINST',
          formatNum(h.goals_against_per_game || h.ga_per_game || h.goals_against) + ' GA/gm',
          formatNum(a.goals_against_per_game || a.ga_per_game || a.goals_against) + ' GA/gm');

      case 'SHOTS_FOR':
        return orderTeams('SHOTS FOR',
          formatNum(h.shots_for_per_game || h.sf_per_game || h.shots_for) + ' SF/gm',
          formatNum(a.shots_for_per_game || a.sf_per_game || a.shots_for) + ' SF/gm');

      case 'SHOTS_AGAINST':
        return orderTeams('SHOTS AGAINST',
          formatNum(h.shots_against_per_game || h.sa_per_game || h.shots_against) + ' SA/gm',
          formatNum(a.shots_against_per_game || a.sa_per_game || a.shots_against) + ' SA/gm');

      case 'PDO':
        return orderTeams('PDO',
          formatNum(h.pdo),
          formatNum(a.pdo));

      case 'ONE_GOAL_GAMES': {
        if (statResult.context) return `ONE-GOAL GAMES: ${statResult.context}`;
        if (statResult.comparison) return `ONE-GOAL GAMES: ${statResult.comparison}`;
        return orderTeams('ONE-GOAL GAMES',
          `${h.record || h.one_goal_record || 'N/A'}`,
          `${a.record || a.one_goal_record || 'N/A'}`);
      }

      case 'REGULATION_WIN_PCT':
        return orderTeams('REGULATION WIN%',
          formatPct(h.regulation_win_pct || h.reg_win_pct),
          formatPct(a.regulation_win_pct || a.reg_win_pct));

      case 'PLAYOFF_POSITION': {
        if (statResult.context) return `PLAYOFF POSITION: ${statResult.context}`;
        if (statResult.comparison) return `PLAYOFF POSITION: ${statResult.comparison}`;
        return orderTeams('PLAYOFF POSITION',
          `${h.position || h.playoff_position || h.seed || 'N/A'}`,
          `${a.position || a.playoff_position || a.seed || 'N/A'}`);
      }

      case 'NHL_GSAX': {
        const hGsaxGoalies = Array.isArray(h.goalies) ? h.goalies : [];
        const aGsaxGoalies = Array.isArray(a.goalies) ? a.goalies : [];
        const hGsax = hGsaxGoalies[0];
        const aGsax = aGsaxGoalies[0];
        const fmtGsax = (g) => g ? `${g.name || 'Unknown'} GSAx ${formatNum(g.gsax || g.goals_saved_above_expected)} (${formatPct(g.save_pct || g.sv_pct)} SV%)` : formatNum(h.gsax || h.goals_saved_above_expected);
        return orderTeams('GOALS SAVED ABOVE EXPECTED', fmtGsax(hGsax), fmtGsax(aGsax));
      }

      case 'NHL_GOALIE_RECENT_FORM': {
        if (statResult.context) return `GOALIE RECENT FORM: ${statResult.context}`;
        if (statResult.comparison) return `GOALIE RECENT FORM: ${statResult.comparison}`;
        if (statResult.data_scope) return `GOALIE RECENT FORM: ${statResult.data_scope}`;
        return orderTeams('GOALIE RECENT FORM',
          `${h.goalie || 'N/A'}: ${formatPct(h.recent_sv_pct || h.sv_pct)} SV% (L${h.recent_starts || h.starts || '?'} starts)`,
          `${a.goalie || 'N/A'}: ${formatPct(a.recent_sv_pct || a.sv_pct)} SV% (L${a.recent_starts || a.starts || '?'} starts)`);
      }

      case 'GOAL_DIFFERENTIAL':
        return orderTeams('GOAL DIFFERENTIAL',
          formatNum(h.goal_differential || h.gd),
          formatNum(a.goal_differential || a.gd));

      case 'HIGH_DANGER_CHANCES':
        return orderTeams('HIGH DANGER CHANCES (5v5)',
          `HDCF% ${h.hd_pct ?? 'N/A'} (${formatNum(h.hd_shots_for)} for / ${formatNum(h.hd_shots_against)} against, ${formatNum(h.hd_goals_for)} HD goals)`,
          `HDCF% ${a.hd_pct ?? 'N/A'} (${formatNum(a.hd_shots_for)} for / ${formatNum(a.hd_shots_against)} against, ${formatNum(a.hd_goals_for)} HD goals)`);

      case 'SHOT_DIFFERENTIAL':
        // Fetcher returns: { shots_for, shots_against, differential, shot_attempts_for, shot_attempts_against } from MoneyPuck
        return orderTeams('SHOT DIFFERENTIAL (5v5)',
          `${formatNum(h.shots_for)} SOG for / ${formatNum(h.shots_against)} against (diff ${formatNum(h.differential)})`,
          `${formatNum(a.shots_for)} SOG for / ${formatNum(a.shots_against)} against (diff ${formatNum(a.differential)})`);

      case 'POWER_PLAY_PCT':
        return orderTeams('POWER PLAY%',
          formatPct(h.power_play_pct || h.pp_pct),
          formatPct(a.power_play_pct || a.pp_pct));

      case 'PENALTY_KILL_PCT':
        return orderTeams('PENALTY KILL%',
          formatPct(h.penalty_kill_pct || h.pk_pct),
          formatPct(a.penalty_kill_pct || a.pk_pct));

      case 'TOP_SCORERS': {
        if (statResult.context) return `TOP SCORERS: ${statResult.context}`;
        if (statResult.comparison) return `TOP SCORERS: ${statResult.comparison}`;
        if (statResult.data_scope) return `TOP SCORERS: ${statResult.data_scope}`;
        const hScorers = h.top_scorers || h.scorers || h.leaders || 'N/A';
        const aScorers = a.top_scorers || a.scorers || a.leaders || 'N/A';
        return orderTeams('TOP SCORERS',
          typeof hScorers === 'string' ? hScorers : JSON.stringify(hScorers),
          typeof aScorers === 'string' ? aScorers : JSON.stringify(aScorers));
      }

      case 'PLAYER_GAME_LOGS':
        // Preserve FULL game-by-game breakdown for Gary to interpret
        const player = statResult.player || statResult.playerName || 'Player';
        const logs = statResult.games || statResult.logs || [];
        if (logs.length === 0) return `${player} GAME LOGS: No recent games`;
        
        // Show individual game scores and context
        const gameByGame = logs.slice(0, 20).map(g => {
          const pts = g.pts || g.points || 0;
          const reb = g.reb || g.rebounds || g.total_rebounds || 0;
          const ast = g.ast || g.assists || 0;
          const opp = g.opponent || g.vs || g.matchup || '';
          const loc = g.isHome === false ? '@' : (g.isHome === true ? 'vs' : '');
          return `${pts}/${reb}/${ast}${opp ? ` ${loc}${opp}` : ''}`;
        }).join(', ');
        
        // Calculate averages
        const avgPts = logs.reduce((sum, g) => sum + (g.pts || g.points || 0), 0) / logs.length;
        const avgReb = logs.reduce((sum, g) => sum + (g.reb || g.rebounds || g.total_rebounds || 0), 0) / logs.length;
        const avgAst = logs.reduce((sum, g) => sum + (g.ast || g.assists || 0), 0) / logs.length;
        
        return `${player} GAME LOGS (Last ${logs.length}): Avg ${avgPts.toFixed(1)}/${avgReb.toFixed(1)}/${avgAst.toFixed(1)} (PTS/REB/AST). Game-by-game: ${gameByGame}`;
      
      // ═══════════════════════════════════════════════════════════
      // CROSS-SPORT TOKENS — field names verified against fetcher output
      // ═══════════════════════════════════════════════════════════
      case 'TOP_PLAYERS': {
        // Fetcher returns: { players: [{ name, position, games, ppg, rpg, apg, fg_pct, fg3_pct, min_pg }] }
        const formatPlayers = (team) => {
          const players = team.players || [];
          if (!Array.isArray(players) || players.length === 0) return 'No player data';
          return players.slice(0, 5).map(p => {
            const name = p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
            return `${name} ${p.ppg || p.pts || '?'}/${p.rpg || p.reb || '?'}/${p.apg || p.ast || '?'} (${p.fg_pct || '?'} FG)`;
          }).join(', ');
        };
        return orderTeams('TOP PLAYERS (PPG/RPG/APG)',
          formatPlayers(h),
          formatPlayers(a));
      }

      case 'INJURIES': {
        // Fetcher returns: { injuries: [{ player, position, status, comment }] }
        const formatInjuries = (team) => {
          const injuries = team.injuries || [];
          if (!Array.isArray(injuries) || injuries.length === 0) return 'No injuries reported';
          return injuries.map(i => {
            const name = i.player || 'Unknown';
            const status = i.status || 'Unknown';
            const comment = i.comment ? ` (${i.comment})` : '';
            return `${name} [${status}]${comment}`;
          }).join(', ');
        };
        return orderTeams('INJURIES',
          formatInjuries(h),
          formatInjuries(a));
      }

      case 'BACK_TO_BACK':
        // Fetcher returns: { days_rest, status, is_back_to_back, last_game, b2b_history: { record, win_pct } }
        return orderTeams('REST/SCHEDULE',
          `${h.status || h.days_rest + ' days rest'}${h.is_back_to_back ? ' (B2B)' : ''}${h.b2b_history ? ` | B2B record: ${h.b2b_history.record}` : ''}`,
          `${a.status || a.days_rest + ' days rest'}${a.is_back_to_back ? ' (B2B)' : ''}${a.b2b_history ? ` | B2B record: ${a.b2b_history.record}` : ''}`);

      case 'FG_PCT':
        // Fetcher returns: { fg_pct, fgm_per_game, fga_per_game }
        return orderTeams('FG%',
          `${h.fg_pct || formatPct(h.fgPct)}${h.fgm_per_game ? ` (${h.fgm_per_game}/${h.fga_per_game} per game)` : ''}`,
          `${a.fg_pct || formatPct(a.fgPct)}${a.fgm_per_game ? ` (${a.fgm_per_game}/${a.fga_per_game} per game)` : ''}`);

      // ═══════════════════════════════════════════════════════════
      // NHL — field names verified against fetcher output
      // ═══════════════════════════════════════════════════════════
      case 'LINE_COMBINATIONS':
        // Fetcher returns grounding text in statResult.context or statResult.data — home/away may be empty
        if (statResult.context) return `LINE COMBINATIONS: ${statResult.context}`;
        if (statResult.data) return `LINE COMBINATIONS: ${statResult.data}`;
        // Grounding results land in top-level, not home/away
        return `LINE COMBINATIONS: ${JSON.stringify(statResult).slice(0, 500)}`;

      case 'SHOOTING_REGRESSION':
        // Fetcher returns: { shooting_pct_5v5, save_pct_5v5, goals_above_expected, xg_pct }
        return orderTeams('SHOOTING REGRESSION (5v5)',
          `Sh% ${h.shooting_pct_5v5 || 'N/A'} | Sv% ${h.save_pct_5v5 || 'N/A'} | GSAx ${formatNum(h.goals_above_expected)}`,
          `Sh% ${a.shooting_pct_5v5 || 'N/A'} | Sv% ${a.save_pct_5v5 || 'N/A'} | GSAx ${formatNum(a.goals_above_expected)}`);

      case 'DIVISION_STANDING':
        // Fetcher returns: { wins, losses, overall_record, home_record, away_record, division_rank, conference_rank }
        return orderTeams('STANDINGS',
          `${h.overall_record || `${h.wins}-${h.losses}`} (Home ${h.home_record || 'N/A'} | Away ${h.away_record || 'N/A'})`,
          `${a.overall_record || `${a.wins}-${a.losses}`} (Home ${a.home_record || 'N/A'} | Away ${a.away_record || 'N/A'})`);

      // ═══════════════════════════════════════════════════════════
      // NBA — field names verified against fetcher output
      // ═══════════════════════════════════════════════════════════
      case 'PACE_HOME_AWAY':
        // Fetcher returns: { season_pace, home_total_ppg, away_total_ppg, home_away_diff, note }
        return orderTeams('PACE (HOME/AWAY)',
          `Pace ${h.season_pace} | Home PPG ${h.home_total_ppg} | Away PPG ${h.away_total_ppg} (diff ${h.home_away_diff})`,
          `Pace ${a.season_pace} | Home PPG ${a.home_total_ppg} | Away PPG ${a.away_total_ppg} (diff ${a.home_away_diff})`);

      case 'EFFICIENCY_TREND':
        // Fetcher returns: { l5_margin, l10_margin, season_margin, games_analyzed }
        return orderTeams('EFFICIENCY TREND (margin)',
          `L5 ${h.l5_margin} | L10 ${h.l10_margin} | Season ${h.season_margin}`,
          `L5 ${a.l5_margin} | L10 ${a.l10_margin} | Season ${a.season_margin}`);

      case 'TRAVEL_SITUATION':
        // Fetcher returns: { time_zone, status }
        return orderTeams('TRAVEL', h.status, a.status);

      case 'VS_ELITE_TEAMS':
        // Fetcher returns: { record, win_pct, games_played, recent_results }
        return orderTeams('VS ELITE TEAMS',
          `${h.record} (${h.win_pct}) in ${h.games_played} games`,
          `${a.record} (${a.win_pct}) in ${a.games_played} games`);

      case 'USAGE_RATES': {
        // Fetcher returns: { usage_concentration, top_players: [{ name, usage_pct, minutes }], scoring_profile }
        const fmtUsage = (team) => {
          const players = team.top_players || [];
          if (!Array.isArray(players) || players.length === 0) return 'No usage data';
          return players.slice(0, 3).map(p => `${p.name} ${p.usage_pct} USG (${p.minutes} min)`).join(', ');
        };
        return orderTeams('USAGE RATES', fmtUsage(h), fmtUsage(a));
      }

      case 'LUCK_ADJUSTED':
        // Fetcher returns: { actual_record, actual_win_pct, expected_wins, expected_win_pct, ppg, opp_ppg, luck_factor }
        return orderTeams('LUCK-ADJUSTED',
          `${h.actual_record} (${h.actual_win_pct}) | Expected ${h.expected_win_pct} | Luck ${h.luck_factor}`,
          `${a.actual_record} (${a.actual_win_pct}) | Expected ${a.expected_win_pct} | Luck ${a.luck_factor}`);

      default: {
        // If homeValue/awayValue are pre-formatted strings (MLB fetchers do this),
        // use them directly — don't try to Object.keys() a string (produces character-index garbage)
        if (typeof h === 'string' || typeof a === 'string') {
          const hStr = typeof h === 'string' ? h : (statResult.comparison || 'No data');
          const aStr = typeof a === 'string' ? a : '';
          const important = statResult.IMPORTANT ? ` [NOTE: ${statResult.IMPORTANT}]` : '';
          if (aStr) {
            return homeFirst
              ? `${statToken}: ${hStr}\n${aStr}${important}`
              : `${statToken}: ${aStr}\n${hStr}${important}`;
          }
          return `${statToken}: ${hStr}${important}`;
        }

        // GENERIC FORMATTER: Extract actual numbers from home/away objects.
        const homeKeys = Object.keys(h).filter(k => k !== 'team');
        const awayKeys = Object.keys(a).filter(k => k !== 'team');

        if (homeKeys.length > 0 || awayKeys.length > 0) {
          // Use the union of home and away keys for comprehensive coverage
          const allDataKeys = [...new Set([...homeKeys, ...awayKeys])];
          const homeName = h.team || homeTeam || 'Home';
          const awayName = a.team || awayTeam || 'Away';
          const homeFields = allDataKeys.map(k => `${k}=${formatNum(h[k])}`).join(' ');
          const awayFields = allDataKeys.map(k => `${k}=${formatNum(a[k])}`).join(' ');
          const important = statResult.IMPORTANT ? ` [NOTE: ${statResult.IMPORTANT}]` : '';
          return homeFirst
            ? `${statToken}: ${homeName} ${homeFields} | ${awayName} ${awayFields}${important}`
            : `${statToken}: ${awayName} ${awayFields} | ${homeName} ${homeFields}${important}`;
        }

        // Fallback: no home/away structure — format top-level fields (excluding metadata)
        const metadataKeys = ['home', 'away', 'homeValue', 'awayValue', 'category', 'note', 'IMPORTANT', 'error', 'token', 'sport', 'quality', 'source'];
        const topLevelKeys = Object.keys(statResult).filter(k => !metadataKeys.includes(k));

        if (topLevelKeys.length === 0) {
          return `${statToken}: Data received but empty`;
        }

        // Show all data fields for complex stats — no truncation
        const fieldSummaries = topLevelKeys.map(k => {
          const val = statResult[k];
          if (typeof val === 'object' && val !== null) {
            const nestedKeys = Object.keys(val);
            return `${k}: {${nestedKeys.map(nk => `${nk}=${formatNum(val[nk])}`).join(', ')}}`;
          }
          return `${k}=${formatNum(val)}`;
        });

        const importantNote = statResult.IMPORTANT ? ` [NOTE: ${statResult.IMPORTANT}]` : '';
        return `${statToken}: ${fieldSummaries.join(', ')}${importantNote}`;
      }
    }
  } catch (e) {
    // Honest about failure — never pretend data was received
    return `${statToken}: Data unavailable (parsing error)`;
  }
}

// Helper formatters
export function formatNum(val) {
  if (val === undefined || val === null) return 'N/A';
  if (typeof val === 'number') return val.toFixed(1);
  return String(val);
}


export function formatPct(val) {
  if (val === undefined || val === null) return 'N/A';
  if (typeof val === 'number') {
    return val > 1 ? `${val.toFixed(1)}%` : `${(val * 100).toFixed(1)}%`;
  }
  return String(val);
}

/**
 * Summarize player game logs into natural language - preserving FULL game-by-game detail
 * @param {string} playerName - Player name
 * @param {Array|Object} logs - Game logs array or object
 * @returns {string} Natural language summary
 */
export function summarizePlayerGameLogs(playerName, logs) {
  if (!logs || (Array.isArray(logs) && logs.length === 0)) {
    return `${playerName} GAME LOGS: No recent games found`;
  }
  
  const gamesArray = Array.isArray(logs) ? logs : (logs.games || logs.data || [logs]);
  if (gamesArray.length === 0) {
    return `${playerName} GAME LOGS: No recent games found`;
  }
  
  try {
    // Game-by-game breakdown with opponent context
    const gameByGame = gamesArray.slice(0, 20).map(g => {
      const pts = g.pts || g.points || 0;
      const reb = g.reb || g.rebounds || g.total_rebounds || 0;
      const ast = g.ast || g.assists || 0;
      const opp = g.opponent || g.vs || g.matchup || '';
      const loc = g.isHome === false ? '@' : (g.isHome === true ? 'vs' : '');
      return `${pts}/${reb}/${ast}${opp ? ` ${loc}${opp}` : ''}`;
    });
    
    // Calculate averages
    let totalPts = 0, totalReb = 0, totalAst = 0;
    for (const game of gamesArray.slice(0, 20)) {
      totalPts += game.pts || game.points || 0;
      totalReb += game.reb || game.rebounds || game.total_rebounds || 0;
      totalAst += game.ast || game.assists || 0;
    }
    const gamesCount = Math.min(gamesArray.length, 20);
    const avgPts = (totalPts / gamesCount).toFixed(1);
    const avgReb = (totalReb / gamesCount).toFixed(1);
    const avgAst = (totalAst / gamesCount).toFixed(1);
    
    return `${playerName} GAME LOGS (Last ${gamesCount}): Avg ${avgPts}/${avgReb}/${avgAst} (PTS/REB/AST). Games: ${gameByGame.join(', ')}`;
  } catch (e) {
    return `${playerName} GAME LOGS: Data unavailable (parsing error)`;
  }
}

/**
 * Summarize NBA player advanced stats into labeled text (prevents LLM misattribution)
 *
 * When Gary receives raw JSON with 10 players' stats, he misattributes numbers
 * to the wrong player. This function bakes player names into each stat line,
 * making misattribution impossible.
 *
 * @param {Array} stats - Raw array from getNbaSeasonAverages() — each item has { player: { first_name, last_name }, stats: { ... } }
 * @param {string} statType - ADVANCED, USAGE, DEFENSIVE, or TRENDS
 * @param {string} teamName - Team full name
 * @returns {string} Human-readable text with player names per line
 */
export function summarizeNbaPlayerAdvancedStats(stats, statType, teamName) {
  if (!stats || !Array.isArray(stats) || stats.length === 0) {
    return `${teamName} ${statType} STATS: No data available`;
  }

  try {
    // Signed format for ratings (shows +/- prefix)
    const signed = (val) => {
      if (val === undefined || val === null) return 'N/A';
      if (typeof val === 'number') return val >= 0 ? `+${val.toFixed(1)}` : val.toFixed(1);
      return String(val);
    };

    const lines = stats.map(entry => {
      const name = entry.player
        ? `${entry.player.first_name} ${entry.player.last_name}`
        : `Player #${entry.player_id || '?'}`;
      const s = entry.stats || entry;

      switch (statType) {
        case 'ADVANCED':
          return `${name}: eFG ${formatPct(s.efg_pct)} | TS ${formatPct(s.ts_pct)} | ORtg ${formatNum(s.off_rating)} | DRtg ${formatNum(s.def_rating)} | NetRtg ${signed(s.net_rating)} | USG ${formatPct(s.usg_pct)} | PIE ${formatPct(s.pie)}`;

        case 'USAGE':
          return `${name}: USG ${formatPct(s.usg_pct)} | %PTS ${formatPct(s.pct_pts)} | %FGA ${formatPct(s.pct_fga)} | %REB ${formatPct(s.pct_reb)} | %AST ${formatPct(s.pct_ast)} | %TOV ${formatPct(s.pct_tov)}`;

        case 'DEFENSIVE':
          return `${name}: DRtg ${formatNum(s.def_rating)} | STL ${formatNum(s.stl)} | BLK ${formatNum(s.blk)} | DREB ${formatNum(s.dreb)} | PF ${formatNum(s.pf)}`;

        case 'TRENDS':
        default:
          return `${name}: PTS ${formatNum(s.pts)} | REB ${formatNum(s.reb)} | AST ${formatNum(s.ast)} | FG% ${formatPct(s.fg_pct)} | 3P% ${formatPct(s.fg3_pct)} | FT% ${formatPct(s.ft_pct)} | MIN ${formatNum(s.min)}`;
      }
    });

    return `${teamName} ${statType} STATS (${stats.length} players):\n${lines.join('\n')}`;
  } catch (e) {
    return `${teamName} ${statType} STATS: Data unavailable (parsing error: ${e.message})`;
  }
}

/**
 * Summarize player stats into natural language
 * @param {Object} statResult - Raw stat result
 * @param {string} statType - Type of stat (e.g., 'RUSHING', 'PASSING')
 * @param {string} teamName - Team name
 * @returns {string} Natural language summary
 */
export function summarizePlayerStats(statResult, statType, teamName) {
  if (!statResult || !statResult.data || statResult.data.length === 0) {
    return `${teamName} ${statType} STATS: No data available`;
  }
  
  try {
    const players = statResult.data.slice(0, 10); // Full rotation depth
    const summaries = players.map(p => {
      const name = p.player?.full_name || p.name || p.player_name || 'Unknown';
      // Extract key stats based on stat type
      const keyStats = [];
      
      if (statType.includes('RUSH') || statType.includes('rushing')) {
        if (p.rushing_yards) keyStats.push(`${p.rushing_yards} yds`);
        if (p.rushing_tds) keyStats.push(`${p.rushing_tds} TD`);
        if (p.yards_per_carry) keyStats.push(`${p.yards_per_carry} YPC`);
      } else if (statType.includes('PASS') || statType.includes('passing')) {
        if (p.passing_yards) keyStats.push(`${p.passing_yards} yds`);
        if (p.passing_tds) keyStats.push(`${p.passing_tds} TD`);
        if (p.interceptions) keyStats.push(`${p.interceptions} INT`);
      } else if (statType.includes('RECEIV') || statType.includes('receiving')) {
        if (p.receiving_yards) keyStats.push(`${p.receiving_yards} yds`);
        if (p.receptions) keyStats.push(`${p.receptions} rec`);
        if (p.receiving_tds) keyStats.push(`${p.receiving_tds} TD`);
      } else {
        // Generic: just grab first few numeric values
        const numericKeys = Object.keys(p).filter(k => typeof p[k] === 'number' && !k.includes('id'));
        for (const k of numericKeys.slice(0, 3)) {
          keyStats.push(`${k}: ${p[k]}`);
        }
      }
      
      return `${name}: ${keyStats.join(', ') || 'stats available'}`;
    });
    
    return `${teamName} ${statType} (Top ${players.length}): ${summaries.join(' | ')}`;
  } catch (e) {
    return `${teamName} ${statType} STATS: Data unavailable (parsing error)`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT PRUNING (Attention Decay Prevention)
// ═══════════════════════════════════════════════════════════════════════════

export const MAX_CONTEXT_MESSAGES = 20; // Target max messages during analysis

export const PRUNE_AFTER_ITERATION = 4; // Start pruning at iteration 4

/**
 * Prune message history to prevent context bloat
 * SMART PRUNING: Keeps tool response messages (stat data) from the middle,
 * only drops assistant analysis text (which is summarized in toolCallHistory anyway).
 * This prevents Gary from re-requesting stats he already fetched.
 * @param {Array} messages - Current message array
 * @param {number} iteration - Current iteration number
 * @returns {Array} Pruned message array
 */
export function pruneContextIfNeeded(messages, iteration) {
  if (iteration < PRUNE_AFTER_ITERATION || messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages; // No pruning needed
  }

  // Always keep: system prompt (index 0) and user's initial query (index 1)
  const preserved = [messages[0], messages[1]];

  // Recent messages always kept (last 16 — active analysis window)
  const recentCount = MAX_CONTEXT_MESSAGES - 4;
  const recent = messages.slice(-recentCount);

  // Middle section: eligible for pruning
  const middle = messages.slice(2, -recentCount);

  // From middle, keep tool response messages (contain stat data Gary needs)
  // Drop assistant analysis and user nudge messages (insights are in toolCallHistory)
  const keptFromMiddle = middle.filter(m => {
    // Keep tool/function response messages (contain stat data)
    if (m.role === 'tool') return true;
    // Keep assistant messages that have tool_calls (stat request + response pairs)
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) return true;
    // Drop pure text assistant messages and user nudge messages
    return false;
  });

  const result = [...preserved, ...keptFromMiddle, ...recent];
  console.log(`[Orchestrator] Pruning context: ${messages.length} → ${result.length} messages (kept ${keptFromMiddle.length} tool exchanges from middle)`);
  return result;
}

/**
 * Normalize sport to league name
 */
export function normalizeSportToLeague(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'icehockey_nhl': 'NHL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'baseball_mlb': 'MLB',
    'NBA': 'NBA',
    'NFL': 'NFL',
    'NHL': 'NHL',
    'NCAAB': 'NCAAB',
    'NCAAF': 'NCAAF',
    'MLB': 'MLB'
  };
  return mapping[sport] || sport;
}

// Canonical research briefing categories used by tests and planning prompts.
export const RESEARCH_BRIEFING_FACTORS = Object.freeze({
  basketball_nba: Object.freeze([
    'pace_and_efficiency',
    'shooting_profile',
    'rebounding_and_turnovers',
    'injuries_and_rotations',
    'schedule_and_rest'
  ]),
  americanfootball_nfl: Object.freeze([
    'epa_and_success_rate',
    'explosiveness_and_red_zone',
    'trenches_and_pressure',
    'injuries_and_usage',
    'weather_and_game_script'
  ]),
  icehockey_nhl: Object.freeze([
    'expected_goals_and_shot_quality',
    'special_teams',
    'goalie_form',
    'line_matchups',
    'travel_and_rest'
  ]),
  basketball_ncaab: Object.freeze([
    'tempo_and_efficiency',
    'shot_selection',
    'rebounding_and_turnovers',
    'foul_and_free_throw_profile',
    'injuries_and_depth'
  ]),
  americanfootball_ncaaf: Object.freeze([
    'sp_plus_and_efficiency',
    'explosiveness_and_havoc',
    'line_play_and_pressure',
    'injuries_and_depth_chart',
    'situational_and_travel'
  ])
});


