import { footballWeekLabel, gameStoryLine } from './footballTeamGames.js';

/**
 * The canonical game ledger, and records that CITE it (Aug 25 2026).
 *
 * THE FOUNDER'S ARGUMENT, and it is a good one. A record is not a measurement
 * — it is a tally with the reasoning removed. Points per game lets a desk
 * infer something about an offence. "5-0" does not: it says five things
 * happened without saying what any of them were, against whom, or how. He
 * called records "descriptive", and the fix is not to withhold them but to
 * make sure they never arrive naked:
 *
 *     If a number can be attacked with "which games?", the games ship with it.
 *
 * Records, streaks, primetime, home-and-away, versus-winning-teams all fail
 * that test. Rates pass it and need qualifiers instead.
 *
 * THE OTHER HALF OF THE CONSTRAINT. He was equally clear that Gary must not
 * be fed the same games over and over: five record lanes each re-printing the
 * season would bury the game it is meant to illuminate. So the games are
 * listed ONCE, in one ledger, and every record points into it by reference:
 *
 *     primetime 2-3 — games G3, G7, G11, G14, G16
 *
 * Attached once, cited many times. That is the whole design.
 */

/**
 * Build the one ledger every record refers to.
 *
 * @param {Array}  results   from toTeamResults, newest first
 * @param {Object} options
 * @param {Object} options.leagueContext   loadLeagueContext result, optional
 * @param {Function} options.opponentQuality  opponentQualityLine, optional
 * @param {Map}    options.playLines       week -> per-game EPA line, optional
 */
export function buildGameLedger(results, {
  leagueContext = null, opponentQuality = null, playLines = null
} = {}) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const games = results.map((r, i) => {
    const ref = `G${i + 1}`;
    const context = (leagueContext && opponentQuality)
      ? opponentQuality(leagueContext, r.opponentId)
      : null;
    const line = playLines && r.week != null ? playLines.get(Number(r.week)) : null;
    return {
      ref,
      week: footballWeekLabel(r.week),
      date: r.date,
      account: gameStoryLine(r, { opponentContext: context }),
      won: r.won,
      margin: r.margin,
      home: r.home,
      opponent: r.opponent,
      opponentId: r.opponentId,
      raw: r,
      // Per-play quality for THAT game, so a win over a bad team and a loss
      // in which the offence played well are distinguishable.
      ...(line ? {
        offense_epa_per_play: line.offense_epa_per_play,
        offense_success_rate: line.offense_success_rate,
        defense_epa_per_play_allowed: line.defense_epa_per_play_allowed,
        quarterback: line.quarterback || null
      } : {})
    };
  });

  return {
    games,
    // The reference list is what records point at. Kept separate so a caller
    // can render the ledger once and the records as citations.
    byRef: new Map(games.map((g) => [g.ref, g]))
  };
}

/** The ledger rendered for a payload — accounts, in order, each with its ref. */
export function ledgerLines(ledger, limit = null) {
  if (!ledger) return null;
  const games = limit ? ledger.games.slice(0, limit) : ledger.games;
  return games.map((g) => {
    const quality = [
      g.offense_epa_per_play != null ? `offence ${g.offense_epa_per_play > 0 ? '+' : ''}${g.offense_epa_per_play} EPA/play` : null,
      g.defense_epa_per_play_allowed != null ? `defence allowed ${g.defense_epa_per_play_allowed > 0 ? '+' : ''}${g.defense_epa_per_play_allowed}` : null
    ].filter(Boolean).join(', ');
    return `[${g.ref}] ${g.week} — ${g.account}${quality ? `\n      (${quality})` : ''}`;
  });
}

/**
 * A record, with the games it is made of cited rather than repeated.
 *
 * @returns {{label:string, record:string, games_used:number, games:string[], caution:string}|null}
 */
export function recordSlice(ledger, predicate, label) {
  if (!ledger) return null;
  const hits = ledger.games.filter((g) => predicate(g.raw, g));
  if (hits.length === 0) {
    return { label, record: null, games_used: 0, games: [], note: `No ${label.toLowerCase()} games on the schedule yet this season.` };
  }
  const wins = hits.filter((g) => g.won).length;
  return {
    label,
    record: `${wins}-${hits.length - wins}`,
    games_used: hits.length,
    // References, not re-printed accounts. The accounts live in the ledger.
    games: hits.map((g) => g.ref),
    caution: RECORD_CAUTION(hits.length)
  };
}

/**
 * The sentence that travels with every record. Deliberately the same wording
 * every time so it reads as a property of records rather than a comment on
 * any particular team.
 */
const RECORD_CAUTION = (n) => (
  `A record is a tally of ${n} result${n === 1 ? '' : 's'}, not a measure of quality — read the cited games in the ledger before drawing anything from it.`
);

/**
 * The per-game strip: the last game, the one before it, the one before that,
 * each on its own, WITH the rolling windows beside them.
 *
 * Not either-or. The founder's reasoning: an NFL season is seventeen games,
 * so a five-game window is nearly a third of it — in the NBA the same window
 * is six percent. Aggregating first is right for basketball and wrong here.
 */
export function recencyStrip(ledger, { games = 3, windows = [1, 3, 5] } = {}) {
  if (!ledger) return null;
  const strip = ledger.games.slice(0, games).map((g, i) => ({
    position: i === 0 ? 'most recent' : i === 1 ? 'second most recent' : `${i + 1} games back`,
    ref: g.ref,
    week: g.week,
    account: g.account,
    ...(g.offense_epa_per_play != null ? {
      offense_epa_per_play: g.offense_epa_per_play,
      offense_success_rate: g.offense_success_rate,
      defense_epa_per_play_allowed: g.defense_epa_per_play_allowed
    } : {})
  }));

  const rolling = {};
  for (const w of windows) {
    const slice = ledger.games.slice(0, w);
    if (slice.length === 0) continue;
    const wins = slice.filter((g) => g.won).length;
    const epa = slice.map((g) => g.offense_epa_per_play).filter((v) => v != null);
    const def = slice.map((g) => g.defense_epa_per_play_allowed).filter((v) => v != null);
    rolling[`last_${w}`] = {
      record: `${wins}-${slice.length - wins}`,
      games_used: slice.length,
      points_per_game: round(avg(slice.map((g) => g.raw.scored))),
      points_allowed_per_game: round(avg(slice.map((g) => g.raw.allowed))),
      ...(epa.length ? { offense_epa_per_play: round(avg(epa), 3) } : {}),
      ...(def.length ? { defense_epa_per_play_allowed: round(avg(def), 3) } : {}),
      refs: slice.map((g) => g.ref)
    };
  }

  return {
    game_by_game: strip,
    rolling,
    reading_note: 'The individual games and the rolling windows are both here on purpose. Seventeen games is a short season: a five-game average is nearly a third of it, so it can hide a team that changed three weeks ago. Read the games first, the windows second.'
  };
}

/** Night games, by kickoff hour in Eastern time. */
export function isNightGame(iso) {
  if (!iso) return false;
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false
  }).format(new Date(iso)));
  return Number.isFinite(hour) && hour >= 20;
}

function avg(values) {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function round(value, dp = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(dp)) : null;
}
