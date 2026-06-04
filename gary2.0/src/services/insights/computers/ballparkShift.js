// gary2.0/src/services/insights/computers/ballparkShift.js
//
// LANE: ballparkShift
// "Tonight's probable starter has a meaningful split at THIS venue vs his own
//  season-average performance — the park changes his profile in a direction
//  the total/team-total may not fully reflect."
//
// Approach (documented BDL methods only):
//   - The game's venue is the HOME team's park. getMlbLineups(gameId) gives
//     both probable pitchers (name + playerId). For each starter we read his
//     getMlbPlayerSplits().byArena entries and match the entry whose
//     split_name first-word matches tonight's venue (same matching rule the
//     fetchers use), then compare that arena ERA/opp-OPS to his season ERA
//     from getMlbPlayerSeasonStats({ season, teamId }).
//
// IMPORTANT — methods/fields quoted from the reference (no invention):
//   * getMlbPlayerSplits({ playerId, season }).byArena: "array of venue/stadium
//     splits. Each entry: { category, split_name, split_abbreviation, avg, ops,
//     home_runs, at_bats, plate_appearances, games }. Venue match is done by
//     split_name.toLowerCase().includes(venueName firstWord)." For pitcher
//     rows the relevant stats are "era and ops (opp OPS)", with "avg standing
//     in as opponent AVG when era absent".
//   * getMlbPlayerSeasonStats({ season, teamId }): per-player records incl.
//     pitching_era, pitching_whip, pitching_ip, and player ({ id, full_name }).
//     Pitchers have pitching_era set (vs hitters: batting_ops>0 && !pitching_era).
//   * getMlbLineups(gameId): per-team pitcher { name, batsThrows, playerId }.
//
// Venue source: BDL game objects don't carry a stadium name field in the
// documented shape, so we derive the venue from the HOME team's park name when
// available on the game/team object, falling back to the home team's
// city/full_name first word. byArena matching is first-word .includes, so this
// degrades safely (no match -> skip).
//
// Defensive: missing arena split, missing season ERA, or tiny arena sample -> skip.

import {
  makeRow, TONES, scoreFromEdge, round, venueFirstWord,
} from '../shared.js';

const MIN_ARENA_GAMES = 3;     // require a real venue sample for the pitcher
const MIN_ERA_GAP = 1.25;      // arena ERA must differ from season by this much
const MAX_PER_GAME = 2;
const RELEVANCE_SCALE = 16;    // 1.25 ERA gap -> ~+20 over base

export async function computeBallparkShift(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  for (const game of games) {
    try {
      rows.push(...(await ballparkForGame(game, { season, bdl, gameLabel: helpers.gameLabel })));
    } catch (err) {
      console.error('[ballparkShift] game error:', err?.message || err);
    }
  }
  return rows;
}

async function ballparkForGame(game, { season, bdl, gameLabel }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  const label = gameLabel(game);

  // Venue = home team's park. BDL game/home_team shapes vary, so try several
  // documented-ish fields; byArena matching is first-word includes anyway.
  const venueName =
    game?.venue ||
    game?.home_team?.venue ||
    game?.home_team?.stadium ||
    game?.home_team?.full_name ||
    game?.home_team?.city ||
    '';
  const venueWord = venueFirstWord(venueName);
  if (!venueWord) return [];

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
    if (playerId == null || teamId == null) continue;

    // Season ERA baseline (options-object form only).
    const seasonRows = (await bdl.getMlbPlayerSeasonStats({ season, teamId })) || [];
    const seasonRec = seasonRows.find((r) => r?.player?.id === playerId && r.pitching_era != null);
    const seasonEra = Number(seasonRec?.pitching_era);
    if (!Number.isFinite(seasonEra) || seasonEra <= 0) continue;

    // Arena split for this venue.
    const splits = await bdl.getMlbPlayerSplits({ playerId, season });
    const arenaRows = Array.isArray(splits?.byArena) ? splits.byArena : null;
    if (!arenaRows) continue;

    const arena = arenaRows.find(
      (a) => typeof a?.split_name === 'string' && a.split_name.toLowerCase().includes(venueWord),
    );
    if (!arena) continue;

    const arenaGames = Number(arena.games);
    if (!Number.isFinite(arenaGames) || arenaGames < MIN_ARENA_GAMES) continue;

    // For pitchers prefer ERA; opp-OPS is a secondary signal we surface as spark.
    const arenaEra = Number(arena.era);
    if (!Number.isFinite(arenaEra) || arenaEra < 0) continue;

    const gap = arenaEra - seasonEra; // + = pitches WORSE here, - = pitches BETTER here
    if (Math.abs(gap) < MIN_ERA_GAP) continue;

    const oppOps = Number(arena.ops);
    candidates.push({
      playerId,
      teamId,
      name: pitcher.name || seasonRec?.player?.full_name || 'Starter',
      seasonEra: round(seasonEra, 2),
      arenaEra: round(arenaEra, 2),
      gap: round(gap, 2),
      arenaGames,
      oppOps: Number.isFinite(oppOps) ? round(oppOps, 3) : null,
      worseHere: gap > 0,
    });
  }

  candidates.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return candidates.slice(0, MAX_PER_GAME).map((c) =>
    makeRow({
      category: 'ballparkShift',
      headline:
        `${c.name} runs a ${c.arenaEra} ERA at this park vs ${c.seasonEra} season`,
      detail:
        `${c.name} has a ${c.arenaEra} ERA in ${c.arenaGames} career games at ` +
        `tonight's venue, ${Math.abs(c.gap)} runs ${c.worseHere ? 'higher' : 'lower'} ` +
        `than his ${c.seasonEra} season ERA` +
        `${c.oppOps != null ? ` (opponents OPS ${c.oppOps} here)` : ''} — ` +
        `a venue effect his blended season line may not reflect.`,
      game: label,
      value: `${c.arenaEra}`,
      tone: c.worseHere ? TONES.CAUTION : TONES.EDGE,
      spark: [c.seasonEra, c.arenaEra],
      relevance_score: scoreFromEdge(c.gap, { scale: RELEVANCE_SCALE, base: 44 }),
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
    }),
  );
}

export default { computeBallparkShift };
