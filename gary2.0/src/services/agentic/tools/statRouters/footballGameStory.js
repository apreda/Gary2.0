import { ballDontLieService } from '../../../ballDontLieService.js';
import { BDL_API_KEY } from './statRouterCommon.js';

/**
 * What actually happened in a football game.
 *
 * MLB gives Gary real journalism — statsapi's editorial recap, headline plus
 * ~4,500 characters of prose with quotes and the shape of the game. Football
 * has no free equivalent, and BDL's one-line `summary` ("Buccaneers ride 2 TD
 * catches by rookie Egbuka to dramatic 23-20 win") is a headline, not an
 * account.
 *
 * The founder's point, Aug 25: a 50-yard catch that nearly got intercepted and
 * fell into the receiver's lap is a completely different fact from "caught for
 * 50 yards", and a desk that only sees the yardage over-rates that offense.
 * Stats about stats are not context; what happened is.
 *
 * BDL's play-by-play carries the two things that reconstruct it: `text`, the
 * full play description including penalties and injuries, and
 * `home_win_probability` on almost every play. Win-probability SWING is what
 * separates the plays that decided the game from the 160 that did not — and it
 * is also how garbage time is identified honestly rather than by a score rule.
 *
 * COST AND RESTRAINT. A game is ~169 plays over 2 pages. Handing Gary all of
 * them would bury the story in the noise, which is the founder's own warning.
 * This returns the scoring plays, the biggest turning points, and the
 * garbage-time boundary — the beats, not the transcript.
 */

const GARBAGE_TIME_WP = 0.95; // one side beyond this is no longer a contest
const MAX_PAGES = 3;

/** All plays for one game, following the cursor. */
export async function loadPlays(gameId, { fetchImpl = globalThis.fetch } = {}) {
  if (gameId == null) return null;
  const plays = [];
  let cursor = null;
  const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ game_id: String(gameId), per_page: '100' });
    if (cursor) params.append('cursor', String(cursor));
    let payload;
    try {
      const response = await fetchImpl(`https://api.balldontlie.io/nfl/v1/plays?${params}`, {
        headers: { Authorization: BDL_API_KEY },
        signal: AbortSignal.timeout(20_000)
      });
      if (!response.ok) return plays.length ? plays : null;
      payload = await response.json();
    } catch {
      // A failed fetch is not an empty game.
      return plays.length ? plays : null;
    }
    plays.push(...(payload?.data || []));
    const next = payload?.meta?.next_cursor;
    if (!next || seen.has(String(next))) break;
    seen.add(String(next));
    cursor = next;
  }
  return plays;
}

const wp = (play) => {
  const v = Number(play?.home_win_probability);
  return Number.isFinite(v) ? v : null;
};

/**
 * The moment the game stopped being a contest, by win probability rather than
 * an arbitrary score margin — a 17-point lead in the first quarter and the
 * same lead with two minutes left are not the same situation.
 */
function garbageTimeIndex(plays) {
  for (let i = 0; i < plays.length; i += 1) {
    const p = wp(plays[i]);
    if (p === null) continue;
    if (p >= GARBAGE_TIME_WP || p <= 1 - GARBAGE_TIME_WP) {
      // Require it to STAY decided — a single spike is not garbage time.
      const rest = plays.slice(i).map(wp).filter((v) => v !== null);
      const decided = rest.filter((v) => v >= GARBAGE_TIME_WP || v <= 1 - GARBAGE_TIME_WP);
      if (rest.length > 0 && decided.length / rest.length > 0.9) return i;
    }
  }
  return -1;
}

/** The plays that actually moved the game, biggest swing first. */
function turningPoints(plays, limit = 4) {
  const swings = [];
  let previous = null;
  for (const play of plays) {
    const current = wp(play);
    if (current === null) continue;
    if (previous !== null) {
      swings.push({ delta: Math.abs(current - previous), play });
    }
    previous = current;
  }
  swings.sort((a, b) => b.delta - a.delta);
  return swings.slice(0, limit).map(({ delta, play }) => ({
    quarter: play.period,
    clock: play.clock_display,
    win_probability_swing: `${(delta * 100).toFixed(1)} points`,
    what_happened: play.text
  }));
}

function scoringPlays(plays) {
  return plays
    .filter((p) => p.scoring_play)
    .map((p) => ({
      quarter: p.period,
      clock: p.clock_display,
      score_after: `${p.away_score}-${p.home_score}`,
      what_happened: p.text
    }));
}

/**
 * Offensive rates split by whether the game was still a contest.
 *
 * This is the qualifier the founder named for PPG and yards per play: points
 * and yardage piled up after the result was settled inflate a season average
 * without describing the team.
 */
/**
 * Plays that are NOT a snap from scrimmage. Defined by exclusion because the
 * type_slug vocabulary is wide and hyphenated — rush, pass-reception,
 * pass-incompletion, rushing-touchdown, sack, fumble-recovery-opponent and
 * more. An inclusion list of ['rush','pass'] silently matched ONLY plain
 * rushes and dropped every pass in the game, which is exactly the
 * quiet-undercount failure this audit keeps finding.
 */
const NON_SCRIMMAGE = new Set([
  'kickoff', 'punt', 'timeout', 'official-timeout', 'end-period', 'end-of-half',
  'end-of-game', 'two-minute-warning', 'field-goal-good', 'field-goal-missed',
  'field-goal-blocked', 'extra-point-good', 'extra-point-missed', 'penalty',
  'coin-toss', 'kickoff-return-touchdown', 'punt-return-touchdown'
]);

const isScrimmage = (play) => !NON_SCRIMMAGE.has(String(play?.type_slug || ''));

function splitByCompetitiveness(plays, cutIndex, teams) {
  const count = (subset, abbr) => {
    const run = subset.filter((p) => isScrimmage(p) && p?.team?.abbreviation === abbr);
    const yards = run.reduce((a, p) => a + (Number(p.stat_yardage) || 0), 0);
    return {
      plays: run.length,
      yards,
      yards_per_play: run.length ? Number((yards / run.length).toFixed(2)) : null
    };
  };
  const meaningful = cutIndex === -1 ? plays : plays.slice(0, cutIndex);
  const garbage = cutIndex === -1 ? [] : plays.slice(cutIndex);

  const out = {};
  for (const abbr of teams) {
    out[abbr] = {
      competitive: count(meaningful, abbr),
      after_decided: cutIndex === -1 ? null : count(garbage, abbr)
    };
  }
  return out;
}

/**
 * The account of one game: the headline, the scoring, what turned it, and
 * where it stopped being a contest.
 */
export async function buildGameNarrative(game, opts = {}) {
  const gameId = game?.id ?? game?.gameId;
  if (gameId == null) return null;
  const plays = await loadPlays(gameId, opts);
  if (!plays || plays.length === 0) {
    return {
      headline: game?.summary || null,
      note: 'Play-by-play unavailable for this game; only the headline is on file.'
    };
  }

  const cut = garbageTimeIndex(plays);
  const teams = [...new Set(plays.map((p) => p?.team?.abbreviation).filter(Boolean))];
  const split = splitByCompetitiveness(plays, cut, teams);
  const cutPlay = cut === -1 ? null : plays[cut];
  // A cut inside the last few snaps is not garbage time — it is a game that
  // stayed live to the whistle. Say that rather than reporting a boundary.
  const remaining = cut === -1 ? 0 : plays.length - cut;
  const wasCompetitiveThroughout = cut === -1 || remaining <= Math.max(4, plays.length * 0.03);

  return {
    // BDL writes a real headline for 94% of finals and it was being discarded.
    headline: game?.summary || null,
    plays_on_file: plays.length,
    scoring: scoringPlays(plays),
    turning_points: turningPoints(plays),
    stopped_being_a_contest: wasCompetitiveThroughout
      ? 'Never — competitive to the whistle, so no snap here is garbage time'
      : `Q${cutPlay.period} ${cutPlay.clock_display} — ${remaining} of ${plays.length} snaps came after the result was settled`,
    yards_per_play_by_team: split
  };
}

/** Convenience: narrative for a team's most recent completed game. */
export async function latestGameNarrative(bdlSport, teamId, season, opts = {}) {
  const games = await ballDontLieService.getGames(bdlSport, {
    team_ids: [teamId], seasons: [season], per_page: 100
  });
  const finals = (games || [])
    .filter((g) => String(g.status || '').toLowerCase().includes('final'))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (finals.length === 0) return null;
  const narrative = await buildGameNarrative(finals[0], opts);
  return narrative ? { game: finals[0], ...narrative } : null;
}
