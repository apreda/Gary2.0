// Consolidated team abbreviation utility for Gary 2.0
// Provides both getTeamAbbreviation and getIndustryAbbreviation

const TEAM_ABBREVIATIONS = {
  'Los Angeles Lakers': 'LAL',
  'Golden State Warriors': 'GSW',
  'New York Yankees': 'NYY',
  'Boston Red Sox': 'BOS',
  // ...add all teams as needed
};

const INDUSTRY_ABBREVIATIONS = {
  'Los Angeles Lakers': 'LAL',
  'Golden State Warriors': 'GSW',
  'New York Yankees': 'NYY',
  'Boston Red Sox': 'BOS',
  // ...add all teams as needed, or use a different mapping if required
};

export function getTeamAbbreviation(teamName) {
  return TEAM_ABBREVIATIONS[teamName] || teamName;
}

export function getIndustryAbbreviation(teamName) {
  return INDUSTRY_ABBREVIATIONS[teamName] || getTeamAbbreviation(teamName);
}
