// gary2.0/src/services/insights/computers/ballparkShift.js
//
// LANE: ballparkShift  (category token emitted: ballpark_shift)
// "Tonight's probable starter pitches meaningfully differently at THIS park
//  than everywhere else — a venue effect his blended season line may not
//  reflect."
//
// Approach (documented BDL methods only):
//   - For each slate game, take BOTH probable starters from getMlbLineups(gameId)
//     (pitcher per side; skip silently if the lineup/pitcher isn't posted).
//   - Fetch each starter's getMlbPlayerSplits({ playerId, season }) and read the
//     byArena rows with category === 'pitching'.
//   - Tonight's venue row is matched by split_name first-word against
//     venueFirstWord(game.venue). Require games_played >= 2 AND >= 10 innings
//     at the venue for a real sample.
//   - Baseline = his ERA everywhere else, computed exactly from the 'All Splits'
//     row minus the venue row (earned runs and innings subtract cleanly; innings
//     use the MLB thirds convention, 32.2 = 32⅔). Require >= 15 baseline innings.
//   - Edge = venueEra - baselineEra. Surface when |edge| >= 1.00 runs.
//
// IMPORTANT — byArena field shape for PITCHERS (probed live 2026-06-04):
//   * Rows have category 'pitching' with: era, wins, losses, games_played,
//     games_started, innings_pitched (thirds decimals), hits_allowed,
//     runs_allowed, earned_runs, home_runs_allowed, walks_allowed,
//     strikeouts_pitched, opponent_avg. All BATTING fields (at_bats, ops, avg…)
//     are null on pitching rows. A row with split_name 'All Splits' carries the
//     season totals. (Two prior versions of this lane emitted zero rows: the
//     first gated on `games`, which doesn't exist — it's `games_played` — and
//     the second required category 'batting', which pitcher rows never are.)
//   * getMlbLineups(gameId): keyed by team abbreviation; per team
//     { pitcher: { name, batsThrows, playerId }, batters: [...] } or null when
//     the lineup isn't posted yet.
//
// Tone: venue ERA much HIGHER than baseline = TONES.CAUTION for that pitcher
// (he struggles at this park); much LOWER = TONES.EDGE.
//
// Defensive: missing lineup/pitcher, no matching venue row, thin venue/baseline
// innings -> skip that starter silently; never throws. Emits a one-line
// examined/gate/emitted summary at the end for 0-row diagnosability.

import {
  makeRow, TONES, scoreFromEdge, round, pct3, venueFirstWord, pickVariant,
} from '../shared.js';

const MIN_VENUE_GAMES = 2;       // require a real venue sample (games_played)
const MIN_VENUE_IP = 10;         // ...and a real innings sample at the venue
const MIN_BASELINE_IP = 15;      // require a real "everywhere else" baseline
const MIN_ERA_EDGE = 1.0;        // venue ERA must differ from baseline by a run
const MAX_PER_GAME = 2;          // keep at most N starters per game
const RELEVANCE_SCALE = 16;      // 1-run gap -> ~56, 2 -> ~67, 3+ -> ~74+

export async function computeBallparkShift(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  const stats = { examined: 0, clearedVenueGate: 0 };

  for (const game of games) {
    try {
      const gameRows = await ballparkForGame(
        game, { season, bdl, gameLabel: helpers.gameLabel, stats },
      );
      rows.push(...gameRows);
    } catch (err) {
      console.error('[ballparkShift] game error:', err?.message || err);
      // continue to next game
    }
  }

  console.log(
    `[ballparkShift] starters examined ${stats.examined}, ` +
    `cleared venue-sample gate ${stats.clearedVenueGate}, emitted ${rows.length}`,
  );
  return rows;
}

async function ballparkForGame(game, { season, bdl, gameLabel, stats }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  const label = gameLabel(game);

  // Venue = the home team's park. The orchestrator aliases game.venue.
  const venueWord = venueFirstWord(game?.venue);
  if (!venueWord) return [];
  const venueName = String(game?.venue || 'this park');

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  const homeAbbr = game?.home_team?.abbreviation;
  const awayAbbr = game?.visitor_team?.abbreviation;

  // Both starters pitch at this venue tonight, so check both.
  const starters = [
    { entry: lineups[homeAbbr], teamId: game?.home_team?.id },
    { entry: lineups[awayAbbr], teamId: game?.visitor_team?.id },
  ];

  const candidates = [];
  for (const { entry, teamId } of starters) {
    const pitcher = entry?.pitcher;
    const playerId = pitcher?.playerId;
    if (playerId == null) continue;
    stats.examined += 1;

    const splits = await bdl.getMlbPlayerSplits({ playerId, season });
    const arenaRows = Array.isArray(splits?.byArena) ? splits.byArena : null;
    if (!arenaRows || arenaRows.length === 0) continue;

    // Tonight's venue row + the season-total 'All Splits' row (both pitching).
    // Prefer an exact split_name match on the full venue name; fall back to the
    // first-word includes only when no exact row exists (an ambiguous pick here
    // would feed the wrong ER/IP into the baseline subtraction below).
    const venueLower = venueName.toLowerCase();
    const venue = findPitchingArena(arenaRows, (a) =>
      a.split_name.toLowerCase() === venueLower)
      || findPitchingArena(arenaRows, (a) =>
        a.split_name.toLowerCase().includes(venueWord));
    const allSplits = findPitchingArena(arenaRows, (a) =>
      a.split_name.toLowerCase() === 'all splits');
    if (!venue || !allSplits) continue;

    const venueGames = Number(venue.games_played);
    const venueIp = ipToInnings(venue.innings_pitched);
    const venueEra = Number(venue.era);
    const venueEr = Number(venue.earned_runs);
    if (!Number.isFinite(venueGames) || venueGames < MIN_VENUE_GAMES) continue;
    if (!Number.isFinite(venueIp) || venueIp < MIN_VENUE_IP) continue;
    if (!Number.isFinite(venueEra) || venueEra < 0) continue;
    stats.clearedVenueGate += 1;

    // Baseline = everywhere except tonight's venue, subtracted exactly from
    // the season totals (ER and IP both subtract cleanly).
    const allIp = ipToInnings(allSplits.innings_pitched);
    const allEr = Number(allSplits.earned_runs);
    if (!Number.isFinite(allIp) || !Number.isFinite(allEr) || !Number.isFinite(venueEr)) continue;
    const baseIp = allIp - venueIp;
    const baseEr = allEr - venueEr;
    if (baseIp < MIN_BASELINE_IP || baseEr < 0) continue;
    const baselineEra = (baseEr * 9) / baseIp;

    const edge = venueEra - baselineEra; // + = worse at this park
    if (Math.abs(edge) < MIN_ERA_EDGE) continue;

    const oppAvg = Number(venue.opponent_avg);
    candidates.push({
      playerId,
      teamId,
      name: pitcher.name || 'the starter',
      venueEra: round(venueEra, 2),
      baselineEra: round(baselineEra, 2),
      venueGames,
      venueIp: round(venueIp, 1),
      baseIp: round(baseIp, 1),
      oppAvg: Number.isFinite(oppAvg) ? round(oppAvg, 3) : null,
      edge,
      worseHere: edge > 0,
    });
  }

  // Surface the starkest park splits first (bigger |edge| = more relevant).
  candidates.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
  return candidates.slice(0, MAX_PER_GAME).map((c) => {
    const direction = c.worseHere ? 'jumps to' : 'drops to';
    const headlineVariants = [
      `${c.name}'s ERA ${direction} ${c.venueEra.toFixed(2)} at ${venueName}`,
      `${c.name} owns a ${c.venueEra.toFixed(2)} ERA at ${venueName} — ${c.baselineEra.toFixed(2)} everywhere else`,
      `At ${venueName}, ${c.name} pitches to a ${c.venueEra.toFixed(2)} ERA`,
    ];
    const oppClause = c.oppAvg != null ? ` Hitters bat ${pct3(c.oppAvg)} off him here.` : '';
    const detailVariants = [
      `${c.name} carries a ${c.venueEra.toFixed(2)} ERA over ${c.venueGames} games ` +
        `(${c.venueIp} IP) at tonight's park vs ${c.baselineEra.toFixed(2)} across ` +
        `${c.baseIp} innings everywhere else.${oppClause} He starts here tonight.`,
      `Across ${c.venueGames} games (${c.venueIp} IP) at this venue, ${c.name} has a ` +
        `${c.venueEra.toFixed(2)} ERA against ${c.baselineEra.toFixed(2)} at his other ` +
        `parks (${c.baseIp} IP).${oppClause} He draws the start here tonight.`,
      `${c.name} starts at ${venueName} tonight, where his ERA is ${c.venueEra.toFixed(2)} ` +
        `over ${c.venueIp} innings — ${c.baselineEra.toFixed(2)} on a ${c.baseIp}-inning ` +
        `baseline elsewhere.${oppClause}`,
    ];

    return makeRow({
      category: 'ballparkShift',
      headline: pickVariant(headlineVariants, c.playerId),
      detail: pickVariant(detailVariants, c.playerId),
      game: label,
      value: c.venueEra.toFixed(2),
      tone: c.worseHere ? TONES.CAUTION : TONES.EDGE,
      spark: [c.baselineEra, c.venueEra],
      relevance_score: scoreFromEdge(c.edge, { scale: RELEVANCE_SCALE, base: 42, cap: 92 }),
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
    });
  });
}

/** Find a pitching-category byArena row matching a split_name predicate. */
function findPitchingArena(arenaRows, predicate) {
  return arenaRows.find((a) => {
    if (!a || typeof a.split_name !== 'string') return false;
    if (a.category !== 'pitching') return false;
    return predicate(a);
  }) || null;
}

/** MLB thirds-decimal innings (32.2 = 32⅔) -> true innings as a float. */
function ipToInnings(ip) {
  const n = Number(ip);
  if (!Number.isFinite(n) || n < 0) return NaN;
  const whole = Math.floor(n);
  const thirds = Math.round((n - whole) * 10); // .0/.1/.2
  return whole + thirds / 3;
}

export default { computeBallparkShift };
