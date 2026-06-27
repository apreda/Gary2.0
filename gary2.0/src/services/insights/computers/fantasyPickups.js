// gary2.0/src/services/insights/computers/fantasyPickups.js
//
// LANE: fantasyPickups  (category token: fantasy_pickups)
// "Fantasy Pickups" — today's most streamable starting pitchers, ranked
// best→worst on REAL skill + matchup data (xERA, K/9, WHIP, opponent offense).
// The grounded answer to an ESPN "streamers for today" column: NO projected
// fantasy points, NO invented numbers — every figure is sourced and shown, and
// a pitcher with no stable sample is dropped rather than guessed.
//
// Sources (no invention):
//   * getMlbLineups(gameId) [BDL]: per-team probable { pitcher: {name, playerId} }.
//   * getPitcherXStats(season) [Savant]: { last_name, first_name, era, xera, pa }.
//   * getMlbPlayerSeasonStats({season, playerIds}) [BDL]: pitching_k_per_9, pitching_whip.
//   * getMlbStandings(season) [BDL]: opponent run-scoring, existence-checked.
// Defensive: any missing field is skipped; failures isolated (returns []).

import { makeRow, TONES, clampScore, round, nameKey } from '../shared.js';
import { getPitcherXStats } from '../../baseballSavantService.js';

const MIN_XERA_PA = 80;        // batters faced — xERA is unstable below this (~20 IP)
const MIN_STREAM_SCORE = 56;   // only surface clearly-above-average streamers
const MAX_ROWS = 8;            // cap per slate

// League-ish anchors for the grounded composite (a pitcher better than these on a
// term scores positive on it). Roughly MLB-average values, used only to ORDER the
// real numbers — they are not presented to the user as projections.
const ANCHOR_XERA = 4.10;
const ANCHOR_K9 = 8.2;
const ANCHOR_WHIP = 1.28;

export async function computeFantasyPickups(ctx) {
  const { games, season, bdl, helpers } = ctx;
  if (!Array.isArray(games) || !games.length) return [];

  // Savant pitcher xStats (whole-league CSV, cached 24h) indexed by name.
  let xByName = new Map();
  try {
    xByName = indexXStatsByName(await getPitcherXStats(season));
  } catch (err) {
    console.error('[fantasyPickups] savant xStats error:', err?.message || err);
  }
  if (!xByName.size) return []; // no skill data → nothing grounded to rank on

  // Opponent offense context (runs/game), existence-checked from standings.
  const { oppRunsByTeamId, lgAvgRunsFor } = await opponentOffense(bdl, season);

  const candidates = [];
  for (const game of games) {
    try {
      candidates.push(...(await streamersForGame(game, {
        season, bdl, xByName, oppRunsByTeamId, lgAvgRunsFor, gameLabel: helpers.gameLabel,
      })));
    } catch (err) {
      console.error('[fantasyPickups] game error:', err?.message || err);
    }
  }

  // Best→worst; only above-bar streams; capped.
  const ranked = candidates
    .filter((c) => c.relevance_score >= MIN_STREAM_SCORE)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, MAX_ROWS);

  console.log(`[fantasyPickups] examined=${candidates.length}, surfaced=${ranked.length}`);
  return ranked;
}

/** Both probable starters in a game → streamer candidate rows. */
async function streamersForGame(game, { season, bdl, xByName, oppRunsByTeamId, lgAvgRunsFor, gameLabel }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  const label = gameLabel(game);

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  const homeAbbr = game?.home_team?.abbreviation;
  const visAbbr = game?.visitor_team?.abbreviation;
  const sides = [
    { entry: lineups[homeAbbr], teamAbbr: homeAbbr, teamId: game?.home_team?.id, oppAbbr: visAbbr, oppId: game?.visitor_team?.id },
    { entry: lineups[visAbbr], teamAbbr: visAbbr, teamId: game?.visitor_team?.id, oppAbbr: homeAbbr, oppId: game?.home_team?.id },
  ];

  const out = [];
  for (const { entry, teamAbbr, teamId, oppAbbr, oppId } of sides) {
    const pitcher = entry?.pitcher;
    const name = pitcher?.name;
    if (!name) continue;

    const x = xByName.get(nameKey(name)) || xByName.get(lastNameKey(name));
    if (!x) continue;
    const xera = Number(x.xera);
    const era = Number(x.era);
    if (!Number.isFinite(xera)) continue;
    const pa = Number(x.pa);
    if (Number.isFinite(pa) && pa < MIN_XERA_PA) continue; // tiny sample → skip

    // K/9 + WHIP from BDL season stats (by lineup playerId).
    const { k9, whip } = await fetchPitcherRates(bdl, season, pitcher?.playerId);

    // Opponent offense (runs/game), existence-checked.
    const oppRf = oppId != null && oppRunsByTeamId.has(oppId) ? oppRunsByTeamId.get(oppId) : NaN;

    // --- grounded composite stream score (each term real; missing terms skipped) ---
    let score = 50;
    score += (ANCHOR_XERA - xera) * 12;                              // run-prevention skill
    if (Number.isFinite(k9)) score += (k9 - ANCHOR_K9) * 3.5;        // strikeout upside
    if (Number.isFinite(whip)) score += (ANCHOR_WHIP - whip) * 18;   // baserunner suppression
    if (Number.isFinite(oppRf) && Number.isFinite(lgAvgRunsFor)) {
      score += (lgAvgRunsFor - oppRf) * 6;                           // weak opponent offense = better stream
    }
    score = clampScore(score);

    // Factual detail — only real figures, in plain language.
    const parts = [`${round(xera, 2)} xERA`];
    if (Number.isFinite(k9)) parts.push(`${round(k9, 1)} K/9`);
    if (Number.isFinite(whip)) parts.push(`${round(whip, 2)} WHIP`);
    const statLine = parts.join(' · ');
    const oppBit = Number.isFinite(oppRf)
      ? ` ${oppAbbr} are scoring ${round(oppRf, 2)} R/G` +
        (Number.isFinite(lgAvgRunsFor) && oppRf < lgAvgRunsFor ? ' (below league average).' : '.')
      : ` Drawing ${oppAbbr}.`;

    out.push(makeRow({
      category: 'fantasyPickups',
      headline: `${name} (${teamAbbr})`,
      detail: `Streamable start — ${statLine}.${oppBit}`,
      game: label,
      value: Number.isFinite(k9) ? `${round(k9, 1)} K/9` : `${round(xera, 2)} xERA`,
      tone: TONES.EDGE,
      relevance_score: score,
      // BDL lineup playerId → unlocks the iOS player-breakdown sheet on tap.
      player_id: pitcher?.playerId != null ? pitcher.playerId : undefined,
      team_id: teamId,
      game_id: gameId,
      meta: {
        kind: 'fantasy_pickup',
        role: 'SP',
        xera: round(xera, 2),
        ...(Number.isFinite(era) ? { era: round(era, 2) } : {}),
        ...(Number.isFinite(k9) ? { k9: round(k9, 1) } : {}),
        ...(Number.isFinite(whip) ? { whip: round(whip, 2) } : {}),
        ...(Number.isFinite(oppRf) ? { opp_runs: round(oppRf, 2) } : {}),
        opp: oppAbbr || '',
      },
    }));
  }
  return out;
}

/** Opponent offense map (teamId → runs/game) + league avg, existence-checked. */
async function opponentOffense(bdl, season) {
  const map = new Map();
  let lgAvgRunsFor = NaN;
  try {
    const standings = (await bdl.getMlbStandings(season)) || [];
    const vals = [];
    for (const row of standings) {
      const teamId = row?.team?.id;
      if (teamId == null) continue;
      const rf = readRunsFor(row);
      if (Number.isFinite(rf)) { map.set(teamId, rf); vals.push(rf); }
    }
    if (vals.length) lgAvgRunsFor = vals.reduce((a, b) => a + b, 0) / vals.length;
  } catch (err) {
    console.error('[fantasyPickups] standings error:', err?.message || err);
  }
  return { oppRunsByTeamId: map, lgAvgRunsFor };
}

/** Per-game runs-scored from a standings row IF a sane field exists (no fabrication). */
function readRunsFor(row) {
  const candidates = [row?.avg_runs_for, row?.runs_for_per_game, row?.runs_per_game];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0 && n < 12) return n; // sane R/G band
  }
  const rf = Number(row?.runs_for ?? row?.runs_scored);
  const gp = Number(row?.games_played ?? ((Number(row?.wins) || 0) + (Number(row?.losses) || 0)));
  if (Number.isFinite(rf) && Number.isFinite(gp) && gp > 0) return rf / gp;
  return NaN;
}

/** K/9 + WHIP for a pitcher from BDL season stats. Defensive; NaN when absent. */
async function fetchPitcherRates(bdl, season, playerId) {
  if (playerId == null) return { k9: NaN, whip: NaN };
  try {
    const rows = await bdl.getMlbPlayerSeasonStats({ season, playerIds: [playerId] });
    const r = Array.isArray(rows)
      ? (rows.find((row) => String(row?.player?.id ?? row?.player_id) === String(playerId)) || rows[0])
      : null;
    return { k9: Number(r?.pitching_k_per_9), whip: Number(r?.pitching_whip) };
  } catch (err) {
    console.error('[fantasyPickups] season-rate error:', err?.message || err);
    return { k9: NaN, whip: NaN };
  }
}

/** Index Savant pitcher xStats rows by full-name + last-name keys. */
function indexXStatsByName(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const last = r?.last_name || '';
    const first = r?.first_name || '';
    if (last) {
      map.set(nameKey(`${first} ${last}`), r);
      if (!map.has(nameKey(last))) map.set(nameKey(last), r);
    } else if (r?.name) {
      map.set(nameKey(r.name), r);
    }
  }
  return map;
}

function lastNameKey(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return nameKey(parts[parts.length - 1] || '');
}

export default { computeFantasyPickups };
