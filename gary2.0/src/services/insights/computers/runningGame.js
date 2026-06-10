// gary2.0/src/services/insights/computers/runningGame.js
//
// LANE: runningGame  (category token emitted: running_game)
// "Catcher vs the running game: tonight's catcher either can't slow anyone
//  down and faces a team that runs, or he's an arm teams keep testing anyway."
//
// Approach (BDL lineups + the free MLB Stats API the pipeline already uses):
//   - Tonight's catcher per side from getMlbLineups(gameId) (position === 'C';
//     skip silently when the lineup isn't posted).
//   - The catcher's run-game numbers come from MLB Stats API season FIELDING
//     stats (getPlayerFieldingStats): stolenBases (allowed), caughtStealing,
//     innings — probed live 2026-06-10. His MLBAM id resolves via
//     searchPlayer(name) (BDL lineup ids are a different namespace), preferring
//     the catcher-position match. CS% computed from raw counts (cs / attempts),
//     never read off a formatted string.
//   - The OPPONENT's running volume comes from team season hitting stats
//     (getTeamHittingStats): stolenBases + caughtStealing per gamesPlayed.
//     MLBAM team id via findMlbTeam(display_name).
//   - Guards FAIL CLOSED: catcher needs MIN_CATCHER_INNINGS behind the plate
//     and MIN_ATTEMPTS attempts against; opponent needs MIN_TEAM_GAMES and a
//     real running habit (attempts/game >= MIN_OPP_ATTEMPTS_PG).
//   - GREEN LIGHT (tone COLD, the catcher's night to forget): a running team
//     vs a catcher at/below CS_PCT_LOW. SHUTDOWN (tone HOT): a running team
//     vs a catcher at/above CS_PCT_HIGH. League CS% has sat in the low 20s for
//     years; the bands are deliberately outside it so only real extremes fire.
//
// Tone is the CATCHER's perspective (he is the row's player_id), matching the
// player-perspective tone convention of heatCheck/coolingOff. The grader sums
// the OPPONENT's stolen_bases box rows: green-light rows confirm on 2+ steals,
// shutdown rows on a clean sheet.
//
// Defensive: missing lineup/catcher/fielding/team stats -> skip that side
// silently; never throws. Slate-wide cap, relevance-ranked.

import {
  makeRow, TONES, round, clampScore, pickVariant,
} from '../shared.js';
import mlbStatsApi from '../../mlbStatsApiService.js';

// Tunables.
const MIN_CATCHER_INNINGS = 120;   // real season workload behind the plate
const MIN_ATTEMPTS = 15;           // attempts against before CS% means anything
const MIN_TEAM_GAMES = 20;         // opponent sample floor
const MIN_OPP_ATTEMPTS_PG = 0.85;  // opponent actually runs (SB+CS per game)
const CS_PCT_LOW = 0.16;           // at/below: runners eat him alive
const CS_PCT_HIGH = 0.32;          // at/above: an arm teams should not test
const MAX_ROWS = 5;                // slate-wide cap, relevance-ranked

export async function computeRunningGame(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  let examined = 0;

  for (const game of games) {
    if (String(game?.status || '').toUpperCase().includes('FINAL')) continue;
    const gameId = game?.id;
    if (gameId == null) continue;

    let lineups = null;
    try {
      lineups = await bdl.getMlbLineups(gameId);
    } catch (err) {
      console.error('[runningGame] lineups error:', err?.message || err);
    }
    if (!lineups || typeof lineups !== 'object') continue;

    const label = helpers.gameLabel(game);
    const sides = [
      { team: game?.home_team, opp: game?.visitor_team },
      { team: game?.visitor_team, opp: game?.home_team },
    ];

    for (const { team, opp } of sides) {
      try {
        const abbr = team?.abbreviation;
        const catcher = abbr
          ? (lineups[abbr]?.batters || []).find((b) => String(b?.position || '').trim() === 'C')
          : null;
        if (!catcher?.name) continue;
        examined++;

        // Opponent running volume (season team hitting stats).
        const oppRun = await opponentRunningProfile(opp, season);
        if (!oppRun || oppRun.attemptsPg < MIN_OPP_ATTEMPTS_PG) continue;

        // Catcher arm (season fielding stats at C).
        const arm = await catcherArmProfile(catcher.name, season);
        if (!arm) continue;

        const greenLight = arm.csPct <= CS_PCT_LOW;
        const shutdown = arm.csPct >= CS_PCT_HIGH;
        if (!greenLight && !shutdown) continue;

        const csDisp = Math.round(arm.csPct * 100);
        const oppName = opp.full_name || opp.display_name || opp.abbreviation;
        const sbPgDisp = round(oppRun.sbPg, 1);

        const headline = greenLight
          ? `Green light: ${oppName} run, and ${catcher.name} has caught just ${csDisp}%`
          : `${oppName} like to run — ${catcher.name} (${csDisp}% caught) is the wrong catcher to test`;
        const detail = greenLight
          ? pickVariant([
            `${oppName} steal ${sbPgDisp} bags a game (${oppRun.sb} on the season) and ${catcher.name} has thrown out ${arm.cs} of ${arm.attempts} runners (${csDisp}%). Everything about tonight says they keep running.`,
            `${catcher.name} is catching tonight at ${csDisp}% on the season (${arm.cs}-for-${arm.attempts} throwing), and ${oppName} attempt ${round(oppRun.attemptsPg, 1)} steals a game. The track meet is on.`,
          ], catcher.playerId ?? catcher.name)
          : pickVariant([
            `${oppName} attempt ${round(oppRun.attemptsPg, 1)} steals a game, but ${catcher.name} has cut down ${arm.cs} of ${arm.attempts} runners (${csDisp}%). Someone is getting thrown out tonight.`,
            `${catcher.name} owns a ${csDisp}% caught-stealing rate (${arm.cs} of ${arm.attempts}) and ${oppName} run anyway — ${sbPgDisp} steals a game. Strength on strength on the bases.`,
          ], catcher.playerId ?? catcher.name);

        // Relevance: how far the arm sits from the band edge + how hard the
        // opponent runs. Both extremes already cleared real-sample gates.
        const armEdge = greenLight ? (CS_PCT_LOW - arm.csPct) : (arm.csPct - CS_PCT_HIGH);
        rows.push(makeRow({
          category: 'runningGame',
          headline,
          detail,
          game: label,
          value: `${csDisp}% CS`,
          tone: greenLight ? TONES.COLD : TONES.HOT,
          relevance_score: clampScore(52 + armEdge * 100 + (oppRun.attemptsPg - MIN_OPP_ATTEMPTS_PG) * 10),
          player_id: catcher.playerId ?? undefined,
          team_id: team?.id,
          game_id: gameId,
          meta: {
            kind: 'running_game',
            catcher: catcher.name,
            cs: arm.cs,
            attempts: arm.attempts,
            cs_pct: round(arm.csPct, 3),
            opp: opp.abbreviation || oppName,
            opp_sb: oppRun.sb,
            opp_sb_pg: round(oppRun.sbPg, 2),
            opp_attempts_pg: round(oppRun.attemptsPg, 2),
          },
        }));
      } catch (err) {
        console.error('[runningGame] side error:', err?.message || err);
      }
    }
  }

  rows.sort((a, b) => b.relevance_score - a.relevance_score);
  const capped = rows.slice(0, MAX_ROWS);
  console.log(`[runningGame] examined ${examined}, emitted ${capped.length}`);
  return capped;
}

/**
 * Opponent team running profile from MLB Stats API season hitting stats.
 * Returns { sb, cs, gp, sbPg, attemptsPg } or null when unresolvable/thin.
 */
async function opponentRunningProfile(oppTeam, season) {
  const name = oppTeam?.display_name || oppTeam?.full_name || oppTeam?.name;
  if (!name) return null;
  try {
    const mlbTeam = await mlbStatsApi.findMlbTeam(name);
    if (!mlbTeam?.id) return null;
    const stat = await mlbStatsApi.getTeamHittingStats(mlbTeam.id, season);
    const sb = Number(stat?.stolenBases);
    const cs = Number(stat?.caughtStealing);
    const gp = Number(stat?.gamesPlayed);
    if (!Number.isFinite(sb) || !Number.isFinite(gp) || gp < MIN_TEAM_GAMES) return null;
    const csN = Number.isFinite(cs) ? cs : 0;
    return { sb, cs: csN, gp, sbPg: sb / gp, attemptsPg: (sb + csN) / gp };
  } catch (err) {
    console.error('[runningGame] opp profile error:', err?.message || err);
    return null;
  }
}

/**
 * Catcher arm profile: MLBAM id via name search, then season fielding stats at
 * the C position. CS% from raw counts. Returns { cs, attempts, csPct } or null.
 */
async function catcherArmProfile(catcherName, season) {
  try {
    const people = (await mlbStatsApi.searchPlayer(catcherName)) || [];
    const person = people.find((p) => String(p?.primaryPosition?.abbreviation) === 'C') || (people.length === 1 ? people[0] : null);
    if (!person?.id) return null;

    const splits = (await mlbStatsApi.getPlayerFieldingStats(person.id, season)) || [];
    const cSplit = splits.find((s) => String(s?.position?.abbreviation) === 'C');
    const stat = cSplit?.stat;
    if (!stat) return null;

    const innings = Math.floor(Number(stat.innings)) || 0;
    const sbAllowed = Number(stat.stolenBases);
    const cs = Number(stat.caughtStealing);
    if (!Number.isFinite(sbAllowed) || !Number.isFinite(cs)) return null;
    const attempts = sbAllowed + cs;
    if (innings < MIN_CATCHER_INNINGS || attempts < MIN_ATTEMPTS) return null;

    return { cs, attempts, csPct: cs / attempts };
  } catch (err) {
    console.error('[runningGame] catcher profile error:', err?.message || err);
    return null;
  }
}

export default { computeRunningGame };
