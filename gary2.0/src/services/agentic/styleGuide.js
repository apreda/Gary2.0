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
      'Pace Clash: In fast-vs-slow matchups, investigate who dictates tempo at home. Check [PACE] first.',
      '3-Point Variance: If a team takes 40%+ of shots from deep but faces elite perimeter defense, investigate if inflated favorites are mispriced.',
      'Schedule Awareness: Back-to-backs in altitude (Denver, Utah) may affect older rosters. Investigate [REST_SITUATION].',
      'Rebounding Edge: In spreads under 3, investigate if superior Offensive Rebound Rate ([FOUR_FACTORS]) creates extra possessions.'
    ]
  },
  americanfootball_nfl: {
    label: 'NFL: The Matchup & Variance League',
    goldenRule: 'Yards are noise; Success Rate and Explosiveness are signal.',
    tokenMenu: ['EPA_PER_PLAY', 'SUCCESS_RATE', 'OL_DL_MATCHUP', 'TURNOVER_LUCK', 'RED_ZONE_EFFICIENCY', 'EXPLOSIVENESS', 'INJURY_IMPACT'],
    heuristics: [
      'Luck Investigation: +10 turnover margin with negative yardage differential - investigate if this is sustainable or variance.',
      'Trenches Matter: Massive [OL_DL_MATCHUP] edge is a Hard Factor—investigate how it affects QB performance.',
      'Red Zone Efficiency: Teams settling for FGs (low [RED_ZONE_EFFICIENCY]) - investigate how this affects spread coverage potential.',
      'Explosive Plays: In shootouts, investigate whether [EXPLOSIVENESS] (20+ yard plays) or [SUCCESS_RATE] is more predictive.'
    ]
  },
  americanfootball_ncaaf: {
    label: 'NCAAF: Motivation & Depth League',
    goldenRule: 'Talent gaps are real, but Motivation gaps are bigger.',
    tokenMenu: ['TALENT_COMPOSITE', 'MOTIVATION_SPOT', 'HAVOC_RATE', 'EXPLOSIVENESS', 'FINISHING_DRIVES', 'PACE'],
    heuristics: [
      'Talent Gap: If one roster is 5-star heavy vs 2-star, investigate how motivation affects the matchup.',
      'Havoc: High [HAVOC_RATE] (TFLs, sacks, forced fumbles) - investigate if this creates upset potential.',
      'Letdown Spots: Use [MOTIVATION_SPOT] to investigate teams coming off huge rivalry wins into sleepy road games.',
      'Tempo Wars: College totals hinge on [PACE]; investigate how 80 plays vs 50 plays affects scoring.'
    ]
  },
  basketball_ncaab: {
    label: 'NCAAB: Possession & Style League',
    goldenRule: 'Possessions are finite; make sure you get more of them.',
    tokenMenu: ['ADJ_EFFICIENCY', 'TEMPO', 'TURNOVER_RATE', 'OFFENSIVE_REBOUNDING', '3PT_DEPENDENCY', 'HOME_COURT_VALUE', 'FT_RATE'],
    heuristics: [
      'Possession Battle: High [OFFENSIVE_REBOUNDING] + Low [TURNOVER_RATE] yields extra shots—investigate how this affects spread coverage.',
      'Home Court: [HOME_COURT_VALUE] is significant—investigate how home court has affected this specific team.',
      'Foul Trouble: High [FT_RATE] + thin depth—investigate how this affects late-game performance.',
      '3-Point Lottery: High [3PT_DEPENDENCY]—investigate how shooting variance affects this team as favorite vs underdog.'
    ]
  },
  icehockey_nhl: {
    label: 'NHL: Possession & Goaltending League',
    goldenRule: 'Goals are random; Corsi/xG and goaltending are truth.',
    tokenMenu: ['CORSI_XG', 'SPECIAL_TEAMS', 'GOALIE_MATCHUP', 'SHOT_METRICS', 'FIVE_ON_FIVE', 'PDO_LUCK', 'REST_FATIGUE', 'RECENT_FORM'],
    heuristics: [
      'Puck Line Value: Investigate both +1.5 AND moneyline—NHL games are close (~50% decided by 1 goal).',
      'Goalie Swing: Starter vs backup moves lines 15-30 cents. Investigate how goalie quality affects the matchup.',
      'PDO Investigation: Team PDO > 102 with weak shot metrics - investigate sustainability. PDO < 98 with strong Corsi - investigate if performance may improve.',
      'Special Teams Edge: PP% > 24% vs PK% < 76% - investigate if this creates a scoring advantage.',
      'Back-to-Back Awareness: Investigate how road B2B has affected this team specifically. Impact varies by roster.',
      'Line Value: Investigate if heavy juice (-150+) on puck lines affects long-term value.'
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

