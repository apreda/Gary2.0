// gary2.0/src/services/insights/computers/nbaRestFatigue.js
//
// LANE: restFatigue (NBA)
// "How much rest does each side of tonight's slate have, and is there a
//  schedule mismatch (one team on a back-to-back, one team rested)?"
//
// Approach (all data from documented BDL methods only):
//   - The slate comes from ctx.games (getNbaGamesForDate(date)). In June the
//     NBA Finals slate is 0-1 games, so this lane is built to produce useful
//     rows from a single matchup and return [] gracefully on an empty slate.
//   - For each slate team we look back over the prior LOOKBACK_DAYS calendar
//     days using getNbaGamesForDate(dateStr) for each date, find that team's
//     most recent FINAL game, and compute "days since last game". A game on the
//     immediately-preceding calendar day = a back-to-back (B2B).
//   - In the Finals both teams usually share rest (the series sets the cadence),
//     so we ALSO surface the absolute spot ("both sides on 2 days rest") as a
//     lower-relevance context row. A genuine MISMATCH (one side on a B2B, the
//     other rested) is the strong row and tags the tired side with CAUTION.
//
// Data path / field names (verified against the live BDL surface):
//   * getNbaGamesForDate(dateStr) -> Array of NBA game objects:
//       { id, date, status, postseason, home_team_score, visitor_team_score,
//         home_team:{id,abbreviation,full_name}, visitor_team:{...} }.
//     We treat a game as FINAL when both scores are finite (BDL only carries
//     final scores once a game completes); a scheduled game has null scores.
//
// Defensive contract: never throws; returns [] when data is missing; emits a
// one-line summary log at the end so 0-row runs are diagnosable.

import {
  makeRow, TONES, scoreFromEdge, pickVariant,
} from '../shared.js';

// Tunables.
const LOOKBACK_DAYS = 10;          // how far back to search for the last game
const MISMATCH_RELEVANCE = 70;     // a real B2B-vs-rested mismatch
const SHARED_RELEVANCE = 50;       // shared-rest context row

/** YYYY-MM-DD for `daysAgo` days before `dateStr` (UTC-safe date math). */
function shiftDate(dateStr, daysAgo) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** A BDL NBA game is "final" once both team scores are present. */
function isFinal(game) {
  // Status-first, matching the codebase's canonical completed-game gate: BDL
  // carries LIVE scores during games, so score-presence alone would count an
  // in-progress game as final on a multi-game slate.
  const status = String(game?.status || '').toLowerCase();
  if (status.includes('final')) return true;
  if (status) return false; // scheduled (ISO datetime) or in-progress ("Qtr 2 ...")
  const h = Number(game?.home_team_score);
  const v = Number(game?.visitor_team_score);
  return Number.isFinite(h) && Number.isFinite(v) && (h > 0 || v > 0);
}

/** Does `game` involve the team id? */
function involvesTeam(game, teamId) {
  return game?.home_team?.id === teamId || game?.visitor_team?.id === teamId;
}

/**
 * Find, for `teamId`, the number of full calendar days between `slateDate` and
 * its most recent FINAL game, scanning back day-by-day up to LOOKBACK_DAYS.
 * Returns { daysSince, lastDate } or null when nothing is found.
 */
async function lastGameRest(teamId, slateDate, bdl) {
  for (let back = 1; back <= LOOKBACK_DAYS; back++) {
    const dateStr = shiftDate(slateDate, back);
    if (!dateStr) break;
    const games = (await bdl.getNbaGamesForDate(dateStr)) || [];
    const found = Array.isArray(games)
      ? games.find((g) => involvesTeam(g, teamId) && isFinal(g))
      : null;
    if (found) return { daysSince: back, lastDate: dateStr };
  }
  return null;
}

/** Plain-English rest descriptor for a daysSince value. */
function restPhrase(daysSince) {
  if (daysSince === 1) return 'a back-to-back (played yesterday)';
  if (daysSince === 2) return '2 days rest';
  return `${daysSince} days rest`;
}

export async function computeNbaRestFatigue(ctx) {
  const { games, bdl, helpers, date } = ctx;
  const rows = [];
  let examined = 0;

  for (const game of games || []) {
    try {
      const gameId = game?.id;
      const home = game?.home_team;
      const away = game?.visitor_team;
      if (gameId == null || !home?.id || !away?.id) continue;
      examined++;

      const label = helpers.gameLabel(game);

      const [homeRest, awayRest] = await Promise.all([
        lastGameRest(home.id, date, bdl),
        lastGameRest(away.id, date, bdl),
      ]);

      // Need at least one side's rest to say anything.
      if (!homeRest && !awayRest) continue;

      const homeDays = homeRest?.daysSince;
      const awayDays = awayRest?.daysSince;

      // MISMATCH: exactly one side is on a B2B while the other is rested (>= 2).
      const homeB2B = homeDays === 1;
      const awayB2B = awayDays === 1;
      const haveBoth = homeDays != null && awayDays != null;

      if (haveBoth && homeB2B !== awayB2B && (homeB2B || awayB2B)) {
        const tiredTeam = homeB2B ? home : away;
        const restedTeam = homeB2B ? away : home;
        const restedDays = homeB2B ? awayDays : homeDays;
        const tiredKey = String(tiredTeam.id);
        const variants = [
          `${tiredTeam.abbreviation} is on the back end of a back-to-back; ${restedTeam.abbreviation} comes in on ${restPhrase(restedDays)}.`,
          `${tiredTeam.abbreviation} played the night before while ${restedTeam.abbreviation} sat — a ${restedDays}-day edge on the legs for ${restedTeam.abbreviation}.`,
          `Schedule gap: ${tiredTeam.abbreviation} on no rest, ${restedTeam.abbreviation} on ${restPhrase(restedDays)}.`,
        ];
        rows.push(makeRow({
          category: 'restFatigue',
          headline: `${tiredTeam.abbreviation} on a back-to-back, ${restedTeam.abbreviation} rested`,
          detail: pickVariant(variants, tiredKey),
          game: label,
          value: `B2B vs ${restedDays}d`,
          tone: TONES.CAUTION,
          relevance_score: MISMATCH_RELEVANCE,
          team_id: tiredTeam.id,
          game_id: gameId,
        }));
        continue;
      }

      // SHARED / ABSOLUTE SPOT: both sides on the same rest (Finals cadence), or
      // a single notable absolute spot when one side's history is missing.
      if (haveBoth && homeDays === awayDays) {
        const both = restPhrase(homeDays);
        const variants = [
          `Both teams enter on ${both} — neither side holds a schedule edge tonight.`,
          `Even footing on rest: each club is on ${both} after the last game of the series.`,
          `No rest gap here — both sides on ${both}.`,
        ];
        rows.push(makeRow({
          category: 'restFatigue',
          headline: `Both sides on ${both}`,
          detail: pickVariant(variants, String(gameId)),
          game: label,
          value: `${homeDays}d both`,
          tone: TONES.NEUTRAL,
          relevance_score: SHARED_RELEVANCE,
          game_id: gameId,
        }));
        continue;
      }

      // ASYMMETRIC but not a B2B mismatch (e.g. 2 vs 3 days) — surface the gap.
      if (haveBoth && homeDays !== awayDays) {
        const moreRested = homeDays > awayDays ? home : away;
        const lessRested = homeDays > awayDays ? away : home;
        const gap = Math.abs(homeDays - awayDays);
        const moreDays = Math.max(homeDays, awayDays);
        const lessDays = Math.min(homeDays, awayDays);
        rows.push(makeRow({
          category: 'restFatigue',
          headline: `${moreRested.abbreviation} on ${moreDays}d, ${lessRested.abbreviation} on ${lessDays}d`,
          detail: `${moreRested.abbreviation} comes in on ${restPhrase(moreDays)} to ${lessRested.abbreviation}'s ${restPhrase(lessDays)} — a ${gap}-day difference on the schedule.`,
          game: label,
          value: `${moreDays}d vs ${lessDays}d`,
          tone: TONES.NEUTRAL,
          // small gaps barely matter; scoreFromEdge eases a 1-2 day gap up from base.
          relevance_score: scoreFromEdge(gap, { scale: 14, base: SHARED_RELEVANCE, cap: 66 }),
          game_id: gameId,
        }));
      }
    } catch (err) {
      console.error('[nbaRestFatigue] game error:', err?.message || err);
    }
  }

  console.log(`[nbaRestFatigue] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

export default { computeNbaRestFatigue };
