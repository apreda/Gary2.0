/**
 * Normalizes team codes to standard 3-letter abbreviations (NBA/NFL/NHL)
 * DFS sites often use non-standard codes like "GS" or "NY"
 */
export function normalizeTeamAbbreviation(team = '') {
  if (!team) return 'UNK';
  const t = team.toUpperCase().trim();
  const map = {
    'GS': 'GSW', 'GOLDEN STATE': 'GSW',
    'NY': 'NYK', 'NEW YORK KNICKS': 'NYK',
    'BRK': 'BKN', 'BROOKLYN': 'BKN',
    'SA': 'SAS', 'SAN ANTONIO': 'SAS',
    'NO': 'NOP', 'NEW ORLEANS': 'NOP',
    'PHO': 'PHX', 'PHOENIX': 'PHX',
    'LA': 'LAL', 'LOS ANGELES LAKERS': 'LAL',
    'LAC': 'LAC', 'LOS ANGELES CLIPPERS': 'LAC',
    'UTAH': 'UTA',
    // NFL teams
    'JAC': 'JAX', 'JACKSONVILLE': 'JAX',
    'KC': 'KC', 'KANSAS CITY': 'KC',
    'TB': 'TB', 'TAMPA BAY': 'TB',
    'NE': 'NE', 'NEW ENGLAND': 'NE',
    'SF': 'SF', 'SAN FRANCISCO': 'SF',
    'LV': 'LV', 'LAS VEGAS': 'LV', 'OAK': 'LV',
    'LAR': 'LAR', 'LA RAMS': 'LAR',
    'WSH': 'WAS', 'WASHINGTON': 'WAS'
  };
  return map[t] || t;
}
