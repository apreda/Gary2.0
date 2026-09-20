export function safeJsonParse(payload, fallback = null) {
  if (payload == null) return fallback;
  if (typeof payload === 'object') return payload;
  try {
    const trimmed = String(payload).trim();
    if (!trimmed) return fallback;
    let candidate = trimmed;
    if (candidate.startsWith('```')) {
      candidate = candidate.replace(/^```json\s*/i, '').replace(/^```/i, '').replace(/```\s*$/i, '').trim();
    }
    return JSON.parse(candidate);
  } catch (error) {
    console.warn('[Agentic] Failed to parse JSON payload:', error.message);
    return fallback;
  }
}

export const prettyJson = (data) => JSON.stringify(data, null, 2);

export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

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

