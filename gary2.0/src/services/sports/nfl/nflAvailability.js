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
    // An exempt-list or suspension "Out" is a status, not one game's designation (round 2 audit, Oct 13 2026:
    // Denver's Jonathon Cooper, on the exempt list since Aug 30, was dropped as last week's Out).
    if (/exempt list|suspend/i.test(String(row?.comment || ''))) return true;
    if (!isWeeklyNflDesignation(row?.status)) return true;
    const filed = Date.parse(row?.date || '');
    if (!Number.isFinite(filed) && /^inactive$/i.test(String(row?.status || '').trim())) return false;
    const lastEnd = gameEnds.get(teamIdOf(row));
    if (!Number.isFinite(filed) || !Number.isFinite(lastEnd)) return true;
    return filed > lastEnd;
  }).map((row) => {
    // Whether the row's note was written after the team's last game: a reserve listing keeps an old note
    // ("ruled out for Sunday's game against the Titans") into the next week.
    const filed = Date.parse(row?.date || '');
    const lastEnd = gameEnds.get(teamIdOf(row));
    return Number.isFinite(filed) && Number.isFinite(lastEnd) ? { ...row, noteCurrent: filed > lastEnd } : row;
  });
}

/**
 * The status this week's note gives when it disagrees with the feed's status word (round 2 audit, Oct 13 2026).
 * BDL keeps a player's last status word and re-dates the row with each new note, so Monday's "limited participant
 * on the estimated practice report" sat beside last week's Out, and a guard activated off injured reserve read
 * IR-R beside "listed as questionable for Thursday's game" (he started). Only a note written after the team's
 * last game counts. Returns { status, feed } where `feed` is the feed's word when the note overrides it.
 */
export function reconcileNflStatus(row) {
  const status = String(row?.status || '').trim();
  const note = String(row?.comment || row?.description || '');
  // This week's official game status is final, except for a downgrade the team announced after it (Oct 26 2026: the
  // Cowboys' Liufau and Locke read Questionable under notes saying both were downgraded from questionable to out for
  // Monday night). Only "downgraded ... to out/doubtful" counts: it can only follow the status it changes.
  if (row?.officialStatus) {
    const down = row?.noteCurrent === true && /^(questionable|doubtful)$/i.test(status)
      && note.match(/\bdowngraded\s+(?:from\s+(?:questionable|doubtful)\s+)?to\s+(out|doubtful)\b/i);
    if (down && down[1].toLowerCase() !== status.toLowerCase()) return { status: down[1][0].toUpperCase() + down[1].slice(1).toLowerCase(), feed: status, official: true };
    return { status, feed: null };
  }
  // Before the week's final report no game statuses are issued: a weekly word is the feed's placeholder, unless this
  // week's note has him ruled out already (Oct 29 2026 hunt).
  if (row?.statusesPending && isWeeklyNflDesignation(status)) {
    const out = row?.noteCurrent === true && /\b(?:ruled|declared|downgraded to)\s+out\b|\b(?:will not|won't)\s+play\b/i.test(note);
    if (out) return /^out$/i.test(status) ? { status, feed: null } : { status: 'Out', feed: status };
    return { status: 'No game status yet', feed: status, pending: true };
  }
  if (row?.noteCurrent !== true || !note) return { status, feed: null };
  const named = note.match(/\b(?:listed as|ruled|downgraded to|upgraded to|designated as|declared|is|was|remains)\s+(out|questionable|doubtful)\b/i);
  const reserve = /^(ir|pup|nfi|reserve|injured reserve)/i.test(status);
  if (named && !(reserve && /^out$/i.test(named[1]))) {
    const word = named[1][0].toUpperCase() + named[1].slice(1).toLowerCase();
    return word.toLowerCase() === status.toLowerCase() ? { status, feed: null } : { status: word, feed: status || null };
  }
  // "Will not be activated" is not an activation (Oct 23 2026 data check: Thornton read ACTIVATED from a note that said
  // he would not be).
  if (reserve && /\bactivated\b[^.]*\b(injured reserve|reserve|pup|physically unable|non-football)/i.test(note)
    && !/\b(?:not|n't|never|won't|without)\s+(?:be\s+|yet\s+|been\s+)?activated\b/i.test(note)) {
    return { status: 'Activated', feed: status };
  }
  if (isWeeklyNflDesignation(status) && /\b(limited|full|did not|didn't|non-?)[ -]?(participa\w*|practice)|estimated practice report/i.test(note)) {
    return { status: 'No game status yet', feed: status };
  }
  return { status, feed: null };
}
