/**
 * Shared NCAAF prop/stat semantics.
 *
 * Generation uses these mappings to reject markets BDL cannot validate;
 * grading uses the same mappings against an exact-game BDL player-stat row.
 * Missing fields stay null. A missing stat is never silently converted to 0.
 */

function numberOrNull(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function statOrNull(row, field) {
  const number = numberOrNull(row?.[field]);
  return number !== null && (field.endsWith('_yards') || number >= 0) ? number : null;
}

function normalizedType(type) {
  return String(type || '')
    .trim()
    .toLowerCase()
    .replace(/^player_/, '')
    .replace(/[\s-]+/g, '_');
}

function sumRequired(row, fields) {
  const values = fields.map((field) => statOrNull(row, field));
  return values.every((value) => value !== null)
    ? numberOrNull(values.reduce((sum, value) => sum + value, 0))
    : null;
}

export function ncaafActualFromStatRow(row, propType) {
  if (!row) return null;
  const type = normalizedType(propType);

  if (['passing_rushing_receiving_yards', 'pass_rush_reception_yds'].includes(type)) {
    return sumRequired(row, ['passing_yards', 'rushing_yards', 'receiving_yards']);
  }
  if (['passing_rushing_yards', 'pass_rush_yds'].includes(type)) {
    return sumRequired(row, ['passing_yards', 'rushing_yards']);
  }
  if (['rushing_receiving_yards', 'rush_reception_yds', 'rush_rec_yds'].includes(type)) {
    return sumRequired(row, ['rushing_yards', 'receiving_yards']);
  }
  if (['passing_rushing_receiving_touchdowns', 'pass_rush_reception_tds'].includes(type)) {
    return sumRequired(row, ['passing_touchdowns', 'rushing_touchdowns', 'receiving_touchdowns']);
  }
  if (['rushing_receiving_touchdowns', 'rush_reception_tds'].includes(type)) {
    return sumRequired(row, ['rushing_touchdowns', 'receiving_touchdowns']);
  }
  if (['anytime_touchdown', 'anytime_td'].includes(type)) {
    const rushing = statOrNull(row, 'rushing_touchdowns');
    const receiving = statOrNull(row, 'receiving_touchdowns');
    // One provider-confirmed TD is enough to prove YES even when the other
    // category is null/non-applicable. BDL's college player-stat schema does
    // not include special-teams TDs, which also count for this market. Even
    // two offensive zeroes cannot prove NO; leave the ticket unresolved.
    if ((rushing ?? 0) > 0 || (receiving ?? 0) > 0) return 1;
    return null;
  }

  const fieldByType = {
    passing_yards: 'passing_yards',
    pass_yds: 'passing_yards',
    passing_touchdowns: 'passing_touchdowns',
    pass_tds: 'passing_touchdowns',
    passing_attempts: 'passing_attempts',
    pass_attempts: 'passing_attempts',
    passing_completions: 'passing_completions',
    pass_completions: 'passing_completions',
    passing_interceptions: 'passing_interceptions',
    pass_interceptions: 'passing_interceptions',
    rushing_yards: 'rushing_yards',
    rush_yds: 'rushing_yards',
    rushing_attempts: 'rushing_attempts',
    rush_attempts: 'rushing_attempts',
    rushing_touchdowns: 'rushing_touchdowns',
    rush_tds: 'rushing_touchdowns',
    receiving_yards: 'receiving_yards',
    reception_yds: 'receiving_yards',
    rec_yds: 'receiving_yards',
    receptions: 'receptions',
    receiving_touchdowns: 'receiving_touchdowns',
    reception_tds: 'receiving_touchdowns',
    rec_tds: 'receiving_touchdowns',
  };

  const field = fieldByType[type];
  return field ? statOrNull(row, field) : null;
}

export function hasNcaafPropStatEvidence(row, propType) {
  if (['anytime_touchdown', 'anytime_td'].includes(normalizedType(propType))) {
    // A measured scoring category (including zero) grounds player analysis.
    // It need not establish the full exact-game outcome required to settle.
    return ['rushing_touchdowns', 'receiving_touchdowns'].some(field => statOrNull(row, field) !== null);
  }
  return ncaafActualFromStatRow(row, propType) !== null;
}

export function ncaafStatPlayerId(row) {
  const value = row?.player?.id ?? row?.player_id ?? row?.playerId ?? null;
  return value == null || String(value).trim() === '' ? null : String(value);
}

export function findExactNcaafStatRow(rows, playerId) {
  if (playerId == null || String(playerId).trim() === '') return null;
  const wanted = String(playerId);
  const matches = (Array.isArray(rows) ? rows : [])
    .filter((row) => ncaafStatPlayerId(row) === wanted);
  return matches.length === 1 ? matches[0] : null;
}

export default {
  findExactNcaafStatRow,
  ncaafActualFromStatRow,
  hasNcaafPropStatEvidence,
  ncaafStatPlayerId,
};
