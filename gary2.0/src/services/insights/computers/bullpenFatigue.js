// gary2.0/src/services/insights/computers/bullpenFatigue.js
//
// LANE: bullpenFatigue  (category token emitted: bullpen_fatigue)
// TEAM angle — "the Yankees' pen has thrown 13.2 innings over their last 3 games,
//  with 3 arms working multiple of them." A worked-down bullpen is a real, hard-
//  to-find edge for late-game and total bets, and it changes every single day.
//
// Approach (MLB Stats API box scores — the statsapi feed the pipeline already
// uses; same direct import as firstInning.js):
//   - Walk the last LOOKBACK_DAYS ET dates once (getMlbSchedule, 2-hr cached,
//     shared across teams). For every FINAL game, record per side the {date,
//     gamePk, side} so each MLBAM team has its recent finals newest-first.
//   - BDL slate team -> MLBAM id by full-name nameKey (firstInning's join).
//   - For each slate team, pull its last WINDOW_GAMES finals' box scores
//     (getGameBoxScore). In a final box, sideData.pitchers is the order of
//     appearance: [0] is the STARTER, the rest are RELIEF arms. Sum their
//     inningsPitched (thirds-decimal) + numberOfPitches across the window, and
//     count arms that appeared in 2+ of the last 3 games (worked multiple days).
//
// Surface only a genuinely worked-down pen (relief IP >= HEAVY_IP over the
// window, OR >= MULTI_ARMS arms used multiple days) — a normal pen is noise.
// Tone COLD (a gassed pen is a vulnerability). value = "13.2 IP".
//
// TEAM-subject row: team_id + game_id set, player_id omitted. game_id is ALWAYS
// the SLATE game's id (slate-membership gate). Never throws; thin data -> skip.

import {
  makeRow, TONES, parseIpThirds, nameKey, shiftDateStr, round, clampScore,
} from '../shared.js';
import mlbStatsApi from '../../mlbStatsApiService.js';

// Tunables.
const LOOKBACK_DAYS = 6;     // ET dates walked to find each team's recent finals
const WINDOW_GAMES = 3;      // "their last 3 games"
const MIN_GAMES = 3;         // need a full window for a fair workload read
const HEAVY_IP = 12.5;       // relief IP over the window that flags a gassed pen
const MAX_ROWS = 6;          // (multi-day arms enrich the read but don't gate —
                             // 3 arms across 7 light innings isn't a tired pen)

export async function computeBullpenFatigue(ctx) {
  const { games, date, helpers } = ctx;
  let examined = 0;

  // 1. Recent finals per MLBAM team (newest first), with the side they were on.
  const finalsByTeam = new Map();
  for (let back = 1; back <= LOOKBACK_DAYS; back++) {
    const d = shiftDateStr(date, -back);
    if (!d) break;
    let sched = [];
    try {
      sched = (await mlbStatsApi.getMlbSchedule(d)) || [];
    } catch (err) {
      console.error('[bullpenFatigue] schedule error:', err?.message || err);
      continue;
    }
    for (const g of sched) {
      if (g?.status?.detailedState !== 'Final') continue;
      const gd = String(g.officialDate || g.gameDate || d).slice(0, 10);
      for (const side of ['home', 'away']) {
        const tid = g?.teams?.[side]?.team?.id;
        if (tid == null) continue;
        if (!finalsByTeam.has(tid)) finalsByTeam.set(tid, []);
        finalsByTeam.get(tid).push({ date: gd, gamePk: g.gamePk, side });
      }
    }
  }
  for (const list of finalsByTeam.values()) list.sort((a, b) => b.date.localeCompare(a.date));

  // 2. BDL slate team -> MLBAM id, by full name.
  let mlbamIdByName = new Map();
  try {
    const teams = (await mlbStatsApi.getMlbTeams()) || [];
    mlbamIdByName = new Map(teams.map((t) => [nameKey(t.name), t.id]));
  } catch (err) {
    console.error('[bullpenFatigue] teams error:', err?.message || err);
    return [];
  }

  // 3. Per slate team, sum the bullpen's recent workload.
  const candidates = [];
  const seen = new Set();
  for (const game of games) {
    if (String(game?.status || '').toUpperCase().includes('FINAL')) continue;
    const gameId = game?.id;
    if (gameId == null) continue;
    const label = helpers.gameLabel(game);

    for (const bdlTeam of [game.home_team, game.visitor_team]) {
      const mlbamId = mlbamIdByName.get(nameKey(bdlTeam?.display_name || bdlTeam?.full_name || bdlTeam?.name));
      if (mlbamId == null) continue;
      const dedupe = `${gameId}:${mlbamId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const recent = (finalsByTeam.get(mlbamId) || []).slice(0, WINDOW_GAMES);
      if (recent.length < MIN_GAMES) continue;
      examined += 1;

      let reliefIp = 0;
      let reliefPitches = 0;
      const armGames = new Map(); // relieverId -> # of the last 3 he appeared in
      let ok = true;
      for (const { gamePk, side } of recent) {
        let box;
        try {
          box = await mlbStatsApi.getGameBoxScore(gamePk);
        } catch (err) {
          ok = false; break;
        }
        const sd = box?.teams?.[side];
        const pitchers = Array.isArray(sd?.pitchers) ? sd.pitchers : [];
        if (pitchers.length < 2) continue;        // starter only / opener edge cases
        for (const pid of pitchers.slice(1)) {     // [0] = starter; rest = relief
          const p = sd.players?.[`ID${pid}`];
          const ip = parseIpThirds(p?.stats?.pitching?.inningsPitched);
          reliefIp += ip;
          reliefPitches += Number(p?.stats?.pitching?.numberOfPitches) || 0;
          armGames.set(pid, (armGames.get(pid) || 0) + 1);
        }
      }
      if (!ok) continue;

      const multiArms = [...armGames.values()].filter((c) => c >= 2).length;
      if (reliefIp < HEAVY_IP) continue;

      const team = bdlTeam.display_name || bdlTeam.full_name || bdlTeam.name || bdlTeam.abbreviation;
      const ipDisp = round(reliefIp, 1);
      const armClause = multiArms > 0
        ? `, with ${multiArms} arm${multiArms === 1 ? '' : 's'} working multiple of them`
        : '';

      candidates.push(makeRow({
        category: 'bullpenFatigue',
        headline: `${team} pen: ${ipDisp} relief IP over their last ${recent.length} games`,
        detail: `${team}'s bullpen has thrown ${ipDisp} innings across their last ${recent.length} games${armClause}. A worked-down pen heading into tonight.`,
        game: label,
        value: `${ipDisp} IP`,
        tone: TONES.COLD,
        relevance_score: clampScore(52 + (reliefIp - HEAVY_IP) * 4 + multiArms * 5),
        team_id: bdlTeam.id,
        game_id: gameId,
        meta: {
          kind: 'bullpen_fatigue',
          relief_ip: ipDisp,
          relief_pitches: reliefPitches,
          multi_day_arms: multiArms,
          games: recent.length,
        },
      }));
    }
  }

  candidates.sort((a, b) => b.relevance_score - a.relevance_score);
  const rows = candidates.slice(0, MAX_ROWS);
  console.log(`[bullpenFatigue] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

export default { computeBullpenFatigue };
