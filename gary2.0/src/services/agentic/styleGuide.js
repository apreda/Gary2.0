const CORE_PHILOSOPHY = [
  'Markets are Efficient: Assume the line is mostly correct; hunt for structural mismatches rather than obvious "better team" arguments.',
  'Process > Trends: Ignore trends without causality (e.g., 5-0 ATS on Tuesdays). Focus on matchup mechanics.',
  'Price Sensitivity: A pick at -5 is different from -7. Always anchor the hypothesis to the actual number.',
  'The "Why" Test: Every lean must have a causal reason (pace edge, matchup, rest) beyond recent box scores.'
];

const FREEDOM_CLAUSE =
  'OVERRIDE RULE: These heuristics are guidelines, not laws. If a specific matchup dynamic contradicts them, you may override—but explicitly justify the deviation in your rationale.';

const STYLE_GUIDES = {
  basketball_nba: {
    label: 'NBA: The Efficiency & Pace League',
    goldenRule: 'Raw stats lie; Efficiency tells the truth.',
    tokenMenu: ['PACE', 'EFFICIENCY', 'FOUR_FACTORS', 'REST_SITUATION', 'PAINT_DEFENSE', 'PERIMETER_DEFENSE', 'INJURY_IMPACT', 'MARKET_SNAPSHOT', 'RECENT_FORM', 'TOP_PLAYERS'],
    heuristics: [
      'Pace Clash: In fast-vs-slow matchups, the slow home team usually dictates tempo. Check [PACE] first.',
      '3-Point Variance: If a team takes 40%+ of shots from deep but faces elite perimeter defense, fade inflated favorites.',
      'Schedule Losses: Back-to-backs in altitude (Denver, Utah) auto-fade older rosters. Prioritize [REST_SITUATION].',
      'Rebounding Edge: In spreads under 3, superior Offensive Rebound Rate ([FOUR_FACTORS]) often wins extra possessions.'
    ]
  },
  americanfootball_nfl: {
    label: 'NFL: The Matchup & Variance League',
    goldenRule: 'Yards are noise; Success Rate and Explosiveness are signal.',
    tokenMenu: ['EPA_PER_PLAY', 'SUCCESS_RATE', 'OL_DL_MATCHUP', 'TURNOVER_LUCK', 'RED_ZONE_EFFICIENCY', 'EXPLOSIVENESS', 'INJURY_IMPACT'],
    heuristics: [
      'Luck Filter: +10 turnover margin with negative yardage differential = regression candidate. Fade them.',
      'Trenches Win: Massive [OL_DL_MATCHUP] edge overrides QB stats—the passer won’t have time.',
      'Red Zone Variance: Teams settling for FGs (low [RED_ZONE_EFFICIENCY]) struggle to cover against explosive offenses.',
      'Explosive Plays: In shootouts, [EXPLOSIVENESS] (20+ yard plays) matters more than steady [SUCCESS_RATE].'
    ]
  },
  americanfootball_ncaaf: {
    label: 'NCAAF: Motivation & Depth League',
    goldenRule: 'Talent gaps are real, but Motivation gaps are bigger.',
    tokenMenu: ['TALENT_COMPOSITE', 'MOTIVATION_SPOT', 'HAVOC_RATE', 'EXPLOSIVENESS', 'FINISHING_DRIVES', 'PACE'],
    heuristics: [
      'Talent Gap: If one roster is 5-star heavy vs 2-star, standard metrics matter less unless motivation is low.',
      'Havoc: High [HAVOC_RATE] (TFLs, sacks, forced fumbles) is the top underdog indicator.',
      'Letdown Spots: Use [MOTIVATION_SPOT] to fade teams coming off huge rivalry wins into sleepy road games.',
      'Tempo Wars: College totals hinge on [PACE]; 80 plays vs 50 plays creates huge scoring swings.'
    ]
  },
  basketball_ncaab: {
    label: 'NCAAB: Possession & Style League',
    goldenRule: 'Possessions are finite; make sure you get more of them.',
    tokenMenu: ['ADJ_EFFICIENCY', 'TEMPO', 'TURNOVER_RATE', 'OFFENSIVE_REBOUNDING', '3PT_DEPENDENCY', 'HOME_COURT_VALUE', 'FT_RATE'],
    heuristics: [
      'Possession Battle: High [OFFENSIVE_REBOUNDING] + Low [TURNOVER_RATE] yields 10+ extra shots—covers spreads.',
      'Home Court: [HOME_COURT_VALUE] is massive; mediocre home teams often beat better road teams.',
      'Foul Trouble: High [FT_RATE] + thin depth means late-game collapses—note the risk.',
      '3-Point Lottery: High [3PT_DEPENDENCY] teams are great dogs (variance) but scary favorites (cold shooting).'
    ]
  },
  icehockey_nhl: {
    label: 'NHL: Possession & Goaltending League',
    goldenRule: 'Goals are random; Corsi/xG and goaltending are truth.',
    tokenMenu: ['CORSI_XG', 'SPECIAL_TEAMS', 'GOALIE_MATCHUP', 'SHOT_METRICS', 'FIVE_ON_FIVE', 'PDO_LUCK', 'REST_FATIGUE', 'RECENT_FORM'],
    heuristics: [
      'Puck Line Value: Always evaluate +1.5 AND moneyline—NHL games are close (~50% decided by 1 goal). Puck line +1.5 hits ~70% for dogs.',
      'Goalie Swing: Starter vs backup moves lines 15-30 cents. Elite goalie (SV% >.920) in a close game = trust the ML.',
      'PDO Regression: Team PDO > 102 with weak shot metrics = fade. PDO < 98 with strong Corsi = bounce-back candidate.',
      'Special Teams Edge: PP% > 24% vs PK% < 76% = serious scoring advantage. Check mismatch first.',
      'Back-to-Back Fade: Road team on B2B loses 0.5-1 goals of value. Home B2B is less impactful (~0.3 goals).',
      'Avoid Juicy Lines: Never take puck line at -200 or worse odds—the juice kills long-term edge.'
    ]
  }
};

function formatList(lines = [], bullet = '-') {
  return lines && lines.length ? lines.map((line) => `${bullet} ${line}`).join('\n') : '';
}

export function buildStyleGuideForSport(sportKey = 'basketball_nba') {
  const guide = STYLE_GUIDES[sportKey] || STYLE_GUIDES.basketball_nba;
  const sections = [
    '## HANDICAPPING PHILOSOPHY',
    formatList(CORE_PHILOSOPHY),
    `## ${guide.label}`,
    `Golden Rule: ${guide.goldenRule}`,
    guide.tokenMenu && guide.tokenMenu.length ? `Token Menu: [${guide.tokenMenu.join(', ')}]` : '',
    guide.heuristics && guide.heuristics.length ? 'Sharp Heuristics:\n' + formatList(guide.heuristics) : '',
    `## FREEDOM CLAUSE\n${FREEDOM_CLAUSE}`
  ].filter(Boolean);
  return sections.join('\n') + '\n';
}

export { STYLE_GUIDES, CORE_PHILOSOPHY, FREEDOM_CLAUSE };

