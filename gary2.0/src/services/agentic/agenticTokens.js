const TOKEN_DEFINITIONS = {
  pace: {
    id: 'pace',
    label: 'Pace',
    description: 'Team possessions per game and tempo clash indicators.'
  },
  efficiency: {
    id: 'efficiency',
    label: 'Efficiency',
    description: 'Offensive/defensive rating snapshot to judge quality of possessions.'
  },
  four_factors: {
    id: 'four_factors',
    label: 'Four Factors Snapshot',
    description: 'Effective FG%, turnover rate, offensive rebounding, and free-throw rate.'
  },
  rest_fatigue: {
    id: 'rest_fatigue',
    label: 'Rest & Travel',
    description: 'Days since last game, B2B flags, altitude spots, and travel mileage.'
  },
  paint_defense: {
    id: 'paint_defense',
    label: 'Paint Defense',
    description: 'Rim protection, points in the paint allowed, and interior matchup notes.'
  },
  perimeter_defense: {
    id: 'perimeter_defense',
    label: 'Perimeter Defense',
    description: '3PT attempt/allow rates, opponent 3PT%, close-out quality.'
  },
  advanced_profile: {
    id: 'advanced_profile',
    label: 'Advanced Efficiency Profile',
    description: 'True shooting %, offensive/defensive rating, net rating, usage context.'
  },
  rebounding: {
    id: 'rebounding',
    label: 'Glass Control',
    description: 'Offensive/defensive rebounding indicators that signal second-chance edges.'
  },
  injury_report: {
    id: 'injury_report',
    label: 'Key Injury Watch',
    description: 'Notable injuries or minutes restrictions that shift rotations.'
  },
  market_snapshot: {
    id: 'market_snapshot',
    label: 'Market Snapshot',
    description: 'Current best spread/moneyline along with notable line movement.'
  },
  recent_form: {
    id: 'recent_form',
    label: 'Recent Form',
    description: 'Last few games record and scoring margin for momentum context.'
  },
  top_players: {
    id: 'top_players',
    label: 'Top Player Impact',
    description: 'Top rotation players with production, usage, and availability notes.'
  },
  epa_per_play: {
    id: 'epa_per_play',
    label: 'EPA Per Play',
    description: 'Expected points added per play on offense/defense.'
  },
  success_rate: {
    id: 'success_rate',
    label: 'Success Rate',
    description: 'Conversion rates on critical downs to gauge sustained drives.'
  },
  ol_dl_matchup: {
    id: 'ol_dl_matchup',
    label: 'OL vs DL Matchup',
    description: 'Pass-rush vs pass-protection edges, sack rates, trenches leverage.'
  },
  turnover_luck: {
    id: 'turnover_luck',
    label: 'Turnover Luck',
    description: 'Turnover differential trends that might regress to the mean.'
  },
  red_zone_efficiency: {
    id: 'red_zone_efficiency',
    label: 'Red Zone Efficiency',
    description: 'Offensive/defensive red-zone scoring percentages.'
  },
  explosiveness: {
    id: 'explosiveness',
    label: 'Explosiveness',
    description: 'Big-play rates (20+ yard gains) that swing high-scoring games.'
  },
  talent_composite: {
    id: 'talent_composite',
    label: 'Talent Composite',
    description: 'Roster quality / recruiting composite for college programs.'
  },
  motivation_spot: {
    id: 'motivation_spot',
    label: 'Motivation Spot',
    description: 'Letdown/sandwich angles, rivalry focus, and travel fatigue.'
  },
  havoc_rate: {
    id: 'havoc_rate',
    label: 'Havoc Rate',
    description: 'TFLs, sacks, forced fumbles per play – underdog upset fuel.'
  },
  finishing_drives: {
    id: 'finishing_drives',
    label: 'Finishing Drives',
    description: 'Points per trip inside the opponent’s 40/red zone.'
  },
  adj_efficiency: {
    id: 'adj_efficiency',
    label: 'Adjusted Efficiency',
    description: 'Per-possession efficiency adjusted for opponent (KenPom/Torvik style).'
  },
  tempo: {
    id: 'tempo',
    label: 'Tempo',
    description: 'Possessions per game / pace of play for college hoops.'
  },
  turnover_rate: {
    id: 'turnover_rate',
    label: 'Turnover Rate',
    description: 'Turnovers per possession to gauge ball security.'
  },
  offensive_rebounding: {
    id: 'offensive_rebounding',
    label: 'Offensive Rebounding',
    description: 'Second-chance creation via offensive rebound percentage.'
  },
  three_pt_dependency: {
    id: 'three_pt_dependency',
    label: '3PT Dependency',
    description: 'Share of attempts from 3 and reliance on perimeter variance.'
  },
  home_court_value: {
    id: 'home_court_value',
    label: 'Home Court Value',
    description: 'Record splits and crowd advantage at home venues.'
  },
  ft_rate: {
    id: 'ft_rate',
    label: 'FT Rate',
    description: 'Free-throw attempts per field-goal attempt to flag foul pressure.'
  },
  // NFL Props-specific tokens
  player_stats: {
    id: 'player_stats',
    label: 'Player Season Stats',
    description: 'Season averages for passing, rushing, receiving yards and TDs.'
  },
  prop_lines: {
    id: 'prop_lines',
    label: 'Available Prop Lines',
    description: 'Current sportsbook lines for player props with over/under odds.'
  },
  player_recent_form: {
    id: 'player_recent_form',
    label: 'Player Recent Form',
    description: 'Last 3-5 game stats showing trends in player performance.'
  },
  opponent_vs_position: {
    id: 'opponent_vs_position',
    label: 'Opponent vs Position',
    description: 'How opponent defense ranks against QB/RB/WR/TE.'
  },
  target_share: {
    id: 'target_share',
    label: 'Target Share',
    description: 'Percentage of team targets for receivers, snap counts.'
  },
  game_script: {
    id: 'game_script',
    label: 'Projected Game Script',
    description: 'Expected game flow based on spread/total affecting pass/run ratio.'
  },
  red_zone_usage: {
    id: 'red_zone_usage',
    label: 'Red Zone Usage',
    description: 'Player involvement in red zone and goal line situations.'
  },
  weather_impact: {
    id: 'weather_impact',
    label: 'Weather Impact',
    description: 'Wind, temperature, precipitation affecting passing/outdoor games.'
  }
};

const TOKENS_BY_SPORT = {
  basketball_nba: [
    'pace',
    'efficiency',
    'four_factors',
    'rest_fatigue',
    'paint_defense',
    'perimeter_defense',
    'injury_report',
    'market_snapshot',
    'recent_form',
    'top_players'
  ],
  americanfootball_nfl: [
    'epa_per_play',
    'success_rate',
    'ol_dl_matchup',
    'turnover_luck',
    'red_zone_efficiency',
    'explosiveness',
    'injury_report',
    'market_snapshot'
  ],
  americanfootball_nfl_props: [
    'player_stats',
    'prop_lines',
    'player_recent_form',
    'opponent_vs_position',
    'target_share',
    'game_script',
    'red_zone_usage',
    'weather_impact',
    'injury_report'
  ],
  americanfootball_ncaaf: [
    'talent_composite',
    'motivation_spot',
    'havoc_rate',
    'explosiveness',
    'finishing_drives',
    'pace',
    'injury_report',
    'market_snapshot'
  ],
  basketball_ncaab: [
    'adj_efficiency',
    'tempo',
    'turnover_rate',
    'offensive_rebounding',
    'three_pt_dependency',
    'home_court_value',
    'ft_rate',
    'injury_report',
    'market_snapshot'
  ]
};

export const SUPPORTED_AGENTIC_TOKENS = Object.values(TOKEN_DEFINITIONS);

export function getTokensForSport(sportKey = 'basketball_nba') {
  const ids = TOKENS_BY_SPORT[sportKey] || [];
  if (!ids.length) {
    return SUPPORTED_AGENTIC_TOKENS;
  }
  return ids.map((id) => TOKEN_DEFINITIONS[id] || null).filter(Boolean);
}

export function buildTokenDescriptionBullets(sportKey = 'basketball_nba') {
  const tokens = getTokensForSport(sportKey);
  return tokens.map((token) => `- ${token.id}: ${token.description}`).join('\n');
}

export function sanitizeTokenRequests(requestedTokens = [], sportKey = 'basketball_nba', max = 4) {
  if (!Array.isArray(requestedTokens)) return [];
  const allowedTokens = getTokensForSport(sportKey).map((token) => token.id);
  const allowed = new Set(allowedTokens.length ? allowedTokens : SUPPORTED_AGENTIC_TOKENS.map((t) => t.id));
  const unique = [];
  for (const token of requestedTokens) {
    const normalized = typeof token === 'string' ? token.trim().toLowerCase() : '';
    if (!normalized || !allowed.has(normalized)) continue;
    if (!unique.includes(normalized)) unique.push(normalized);
    if (unique.length >= max) break;
  }
  return unique;
}

