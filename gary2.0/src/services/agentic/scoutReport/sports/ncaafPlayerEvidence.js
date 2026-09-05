// College season totals are derived from dated player-game rows. The provider's
// season-total endpoint has returned prior-year totals labeled as the new year.
// This module never infers a current roster or a season from that endpoint.
const COUNT_FIELDS = [
  'passing_attempts', 'passing_completions', 'passing_yards', 'passing_touchdowns',
  'passing_interceptions', 'rushing_attempts', 'rushing_yards', 'rushing_touchdowns',
  'receptions', 'receiving_yards', 'receiving_touchdowns', 'total_tackles', 'sacks',
  'interceptions', 'tackles_for_loss', 'solo_tackles', 'passes_defended',
];

function number(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function easternGameDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

/** Reject ambiguous duplicates rather than picking whichever page arrived last. */
export function cleanNcaafPlayerRows(rows, { season, playerIds, teamId = null, asOf = new Date() }) {
  const roster = new Set(playerIds.map(String));
  const groups = new Map();
  const diagnostics = { wrongSeason: 0, wrongPlayerOrTeam: 0, invalidDate: 0, unfinished: 0, duplicates: 0, conflicts: 0 };
  const cutoff = new Date(asOf).getTime();
  for (const row of rows || []) {
    const player = row?.player?.id;
    const game = row?.game;
    if (Number(row?.season ?? game?.season) !== Number(season)
        || (game?.season != null && Number(game.season) !== Number(season))) {
      diagnostics.wrongSeason++;
      continue;
    }
    if (!roster.has(String(player)) || (teamId != null && String(row?.team?.id) !== String(teamId))) {
      diagnostics.wrongPlayerOrTeam++;
      continue;
    }
    const date = Date.parse(game?.date || '');
    // The date independently checks the season label (college seasons run Aug–Jan).
    const calendar = Number.isFinite(date) ? easternGameDate(game.date) : null;
    const dateSeason = calendar ? Number(calendar.slice(0, 4)) - (Number(calendar.slice(5, 7)) < 8 ? 1 : 0) : null;
    if (game?.id == null || !Number.isFinite(cutoff) || !Number.isFinite(date) || date >= cutoff || dateSeason !== Number(season)) {
      diagnostics.invalidDate++;
      continue;
    }
    const status = String(game.status || '').trim().toLowerCase();
    if (status && !/^final(?:\b|\/)/.test(status) && !['post', 'complete', 'completed'].includes(status)) {
      diagnostics.unfinished++;
      continue;
    }
    const key = `${player}:${game.id}`;
    const signature = JSON.stringify([date, row?.team?.id, ...COUNT_FIELDS.map(field => number(row[field]))]);
    const old = groups.get(key);
    if (!old) groups.set(key, { row, signature, conflict: false });
    else if (old.signature === signature) diagnostics.duplicates++;
    else {
      if (!old.conflict) diagnostics.conflicts++;
      old.conflict = true;
    }
  }
  return { rows: [...groups.values()].filter(group => !group.conflict).map(group => group.row), diagnostics };
}

/** Missing fields remain unknown, including when only part of a sample has them. */
export function aggregateNcaafPlayerRows(rows, season) {
  const result = new Map();
  for (const row of rows) {
    const id = String(row.player.id);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(row);
  }
  for (const [id, games] of result) {
    const line = {};
    for (const field of COUNT_FIELDS) {
      const values = games.map(row => number(row[field]));
      line[field] = values.every(value => value !== null) ? values.reduce((a, b) => a + b, 0) : null;
    }
    line.rushing_avg = line.rushing_yards !== null && line.rushing_attempts > 0
      ? line.rushing_yards / line.rushing_attempts : null;
    line.receiving_avg = line.receiving_yards !== null && line.receptions > 0
      ? line.receiving_yards / line.receptions : null;
    const dates = games.map(row => easternGameDate(row.game.date)).sort();
    line.evidence = {
      season, games: games.length, from: dates[0], through: dates.at(-1),
      teams: [...new Set(games.map(row => row.team?.full_name || row.team?.name || row.team?.abbreviation).filter(Boolean))],
    };
    result.set(id, line);
  }
  return result;
}

export function formatNcaafPlayerEvidence(evidence, currentSeason) {
  if (!evidence) return ' [no dated player-game stats available]';
  const prior = evidence.season !== currentSeason;
  return ` [${evidence.season}${prior ? ' prior season' : ''}; ${evidence.games} dated game row${evidence.games === 1 ? '' : 's'}; ${evidence.from}–${evidence.through}${prior && evidence.teams.length ? `; played for ${evidence.teams.join(', ')}` : ''}]`;
}
