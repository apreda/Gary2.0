/**
 * NFL availability that describes the NEXT game, not the last one
 * (founder, Sep 24 2026: "he can't be injured forever... all the information
 * has to stay up to date 24/7").
 *
 * BDL's player_injuries feed keeps each player's last filed status until a
 * new one replaces it. A game-day "Inactive", an in-game "questionable to
 * return" or last week's final-report "Out" therefore stayed on the feed into
 * the following week (Sep 21: the Rams' Week 1 healthy scratches in Melbourne
 * were still listed as current inactives ten days later).
 *
 * The rule: a weekly or game-day designation (Questionable, Doubtful, Out,
 * Inactive, Probable, Day-To-Day) describes one game. Once the team has
 * played a game that kicked off after the report was filed, that designation
 * is history, not availability. A report filed after the team's last game
 * (this week's practice report, Monday's "out a few weeks") stays. Reserve
 * designations — IR, PUP, NFI, suspensions, reserve lists — describe a
 * status, not a game, and always stay until the provider changes them.
 */

// A game that kicked off this long ago is over; a report filed before then
// belongs to that game or an earlier one.
const GAME_LENGTH_MS = 4 * 60 * 60 * 1000;

const WEEKLY_STATUS = /^(questionable|doubtful|out|inactive|probable|day[- ]to[- ]day|active)$/i;

export function isWeeklyNflDesignation(status) {
  return WEEKLY_STATUS.test(String(status || '').trim());
}

/** teamId → epoch ms at which that team's most recent completed game ended. */
export function lastGameEndByTeam(games = []) {
  const ends = new Map();
  for (const game of games || []) {
    const status = String(game?.status || '').toLowerCase();
    if (!status.startsWith('final') && game?.status_state !== 'final') continue;
    const kickoff = Date.parse(game?.date || game?.datetime || '');
    if (!Number.isFinite(kickoff)) continue;
    const end = kickoff + GAME_LENGTH_MS;
    for (const team of [game?.home_team, game?.visitor_team ?? game?.away_team]) {
      const id = team?.id;
      if (id == null) continue;
      const key = String(id);
      if (!ends.has(key) || ends.get(key) < end) ends.set(key, end);
    }
  }
  return ends;
}

function teamIdOf(row) {
  const id = row?.player?.team?.id ?? row?.team?.id ?? row?.team_id ?? null;
  return id == null ? null : String(id);
}

/**
 * Drop weekly/game-day designations filed before the team's last completed
 * game ended. An undated "Inactive" goes too: inactives are named for one
 * game on its own day, so one with no date cannot be tonight's. Other rows
 * without a readable report date or team keep their place — an undated
 * reserve listing is still a reserve listing, and nothing else is dropped on
 * a guess.
 */
export function currentNflInjuries(rows = [], gameEnds = new Map()) {
  if (!Array.isArray(rows) || !gameEnds?.size) return Array.isArray(rows) ? rows : [];
  return rows.filter((row) => {
    if (!isWeeklyNflDesignation(row?.status)) return true;
    const filed = Date.parse(row?.date || '');
    if (!Number.isFinite(filed) && /^inactive$/i.test(String(row?.status || '').trim())) return false;
    const lastEnd = gameEnds.get(teamIdOf(row));
    if (!Number.isFinite(filed) || !Number.isFinite(lastEnd)) return true;
    return filed > lastEnd;
  });
}
