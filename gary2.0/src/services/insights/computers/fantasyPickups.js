// gary2.0/src/services/insights/computers/fantasyPickups.js
//
// LANE: fantasyPickups  (category token: fantasy_pickups) — MLB only.
// "Fantasy Pickups" — the players a real fantasy manager would ADD/STREAM today:
// WIDELY-AVAILABLE streamer pitchers + hitter pickups in plus matchups (modeled
// on an ESPN daily streamers column). NOT the aces everyone already owns.
//
// Two roles, one ranked board:
//  • STREAMER PITCHERS — probable SPs whose edge is the MATCHUP, with owned aces
//    GATED OUT (season xERA < 3.00 OR K/9 > 9.5 = rostered everywhere → skipped).
//  • HITTER PICKUPS — bats facing a STRUGGLING opposing SP (xERA ≥ 4.60), with
//    each team's top-OPS star skipped (the obvious roster lock), surfaced by
//    season OPS + lineup spot.
//
// Sources (no invention — every figure is real + shown):
//  • getMlbLineups(gameId): probable SPs + batters (name, playerId, order, pos).
//  • getPitcherXStats(season) [Savant]: xERA / ERA / pa.
//  • getMlbPlayerSeasonStats({season, playerIds}) [BDL]: pitching K/9, WHIP.
//  • getMlbPlayerSeasonStats({season, teamId}) [BDL]: a team's batting OPS/AVG.
//  • getMlbStandings(season): opponent run-scoring (matchup weakness).
// Defensive: any missing field is skipped; failures isolated (returns []).

import { makeRow, TONES, clampScore, round, pct3, nameKey } from '../shared.js';
import { getPitcherXStats } from '../../baseballSavantService.js';

const MIN_XERA_PA = 80;           // batters faced — xERA unstable below this
// Availability gates — exclude owned aces so we surface PICKUPS, not stars.
const MAX_PITCHER_XERA = 3.00;    // xERA below this = elite arm, rostered everywhere
const MAX_PITCHER_K9 = 9.5;       // K/9 above this = marquee strikeout name
// Pitcher matchup anchors (used only to ORDER real numbers).
const ANCHOR_XERA = 4.10, ANCHOR_K9 = 8.2, ANCHOR_WHIP = 1.28;
// Hitter pickup gates.
const STRUGGLING_SP_XERA = 4.60;  // opposing SP this bad = a hitter-friendly spot
const MIN_HITTER_OPS = 0.700;     // surface above-average bats
const MAX_HITTER_OPS = 0.850;     // ...but cap it — an .850+ OPS bat is an owned
                                  // regular, not a waiver pickup (availability proxy)
const MIN_PITCHER_SCORE = 52, MIN_HITTER_SCORE = 50;
const MAX_PITCHERS = 4, MAX_HITTERS = 4;

function tierFor(score) {
  if (score >= 74) return 'MUST_ADD';
  if (score >= 60) return 'STREAM';
  return 'DEEP';
}
function ordSuffix(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}

export async function computeFantasyPickups(ctx) {
  const { games, season, bdl, helpers } = ctx;
  if (!Array.isArray(games) || !games.length) return [];

  let xByName = new Map();
  try { xByName = indexXStatsByName(await getPitcherXStats(season)); }
  catch (err) { console.error('[fantasyPickups] savant xStats error:', err?.message || err); }
  if (!xByName.size) return [];

  const { oppRunsByTeamId, lgAvgRunsFor } = await opponentOffense(bdl, season);

  const pitchers = [], hitters = [];
  for (const game of games) {
    try {
      const r = await pickupsForGame(game, { season, bdl, xByName, oppRunsByTeamId, lgAvgRunsFor, gameLabel: helpers.gameLabel });
      pitchers.push(...r.pitchers);
      hitters.push(...r.hitters);
    } catch (err) {
      console.error('[fantasyPickups] game error:', err?.message || err);
    }
  }

  const topP = pitchers
    .filter((p) => p.relevance_score >= MIN_PITCHER_SCORE)
    .sort((a, b) => b.relevance_score - a.relevance_score).slice(0, MAX_PITCHERS);
  const topH = hitters
    .filter((h) => h.relevance_score >= MIN_HITTER_SCORE)
    .sort((a, b) => b.relevance_score - a.relevance_score).slice(0, MAX_HITTERS);

  console.log(`[fantasyPickups] pitchers=${topP.length}/${pitchers.length}, hitters=${topH.length}/${hitters.length}`);
  return [...topP, ...topH];
}

async function pickupsForGame(game, opts) {
  const { season, bdl, xByName, oppRunsByTeamId, lgAvgRunsFor, gameLabel } = opts;
  const gameId = game?.id;
  if (gameId == null) return { pitchers: [], hitters: [] };
  const label = gameLabel(game);
  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return { pitchers: [], hitters: [] };

  const homeAbbr = game?.home_team?.abbreviation;
  const visAbbr = game?.visitor_team?.abbreviation;
  const sides = [
    { abbr: homeAbbr, teamId: game?.home_team?.id, oppAbbr: visAbbr, oppId: game?.visitor_team?.id },
    { abbr: visAbbr, teamId: game?.visitor_team?.id, oppAbbr: homeAbbr, oppId: game?.home_team?.id },
  ];

  const pitchers = [], hitters = [];

  // ── STREAMER PITCHERS (availability-gated) ──────────────────────────────
  for (const s of sides) {
    const pitcher = lineups[s.abbr]?.pitcher;
    const name = pitcher?.name;
    if (!name) continue;
    const x = xByName.get(nameKey(name)) || xByName.get(lastNameKey(name));
    if (!x) continue;
    const xera = Number(x.xera), era = Number(x.era);
    if (!Number.isFinite(xera)) continue;
    const pa = Number(x.pa);
    if (Number.isFinite(pa) && pa < MIN_XERA_PA) continue;
    const { k9, whip } = await fetchPitcherRates(bdl, season, pitcher?.playerId);
    // AVAILABILITY GATE — skip owned aces / strikeout marquee names.
    if (xera < MAX_PITCHER_XERA || (Number.isFinite(k9) && k9 > MAX_PITCHER_K9)) continue;

    const oppRf = s.oppId != null && oppRunsByTeamId.has(s.oppId) ? oppRunsByTeamId.get(s.oppId) : NaN;
    // MATCHUP-FORWARD score (opponent weakness weighted heaviest).
    let score = 48;
    score += (ANCHOR_XERA - xera) * 9;
    if (Number.isFinite(k9)) score += (k9 - ANCHOR_K9) * 3;
    if (Number.isFinite(whip)) score += (ANCHOR_WHIP - whip) * 14;
    if (Number.isFinite(oppRf) && Number.isFinite(lgAvgRunsFor)) score += (lgAvgRunsFor - oppRf) * 11;
    score = clampScore(score);
    const tier = tierFor(score);

    const oppBit = Number.isFinite(oppRf)
      ? `${s.oppAbbr} scoring ${round(oppRf, 2)} R/G` + (Number.isFinite(lgAvgRunsFor) && oppRf < lgAvgRunsFor ? ' (below avg)' : '')
      : '';
    const parts = [`${round(xera, 2)} xERA`];
    if (Number.isFinite(k9)) parts.push(`${round(k9, 1)} K/9`);
    if (Number.isFinite(whip)) parts.push(`${round(whip, 2)} WHIP`);

    pitchers.push(makeRow({
      category: 'fantasyPickups',
      headline: name,
      detail: `Streamer vs ${s.oppAbbr} — ${parts.join(' · ')}.` + (oppBit ? ` ${oppBit}.` : ''),
      game: label,
      value: `${round(xera, 2)} xERA`,
      tone: TONES.EDGE,
      relevance_score: score,
      player_id: pitcher?.playerId != null ? pitcher.playerId : undefined,
      team_id: s.teamId, game_id: gameId,
      meta: {
        kind: 'fantasy_pickup', role: 'SP', tier, position: 'SP',
        xera: round(xera, 2),
        ...(Number.isFinite(era) ? { era: round(era, 2) } : {}),
        ...(Number.isFinite(k9) ? { k9: round(k9, 1) } : {}),
        ...(Number.isFinite(whip) ? { whip: round(whip, 2) } : {}),
        opp: s.oppAbbr || '', reason: oppBit || `vs ${s.oppAbbr || ''}`.trim(),
      },
    }));
  }

  // ── HITTER PICKUPS (vs a struggling opposing SP) ────────────────────────
  for (const s of sides) {
    const oppPitcher = lineups[s.oppAbbr]?.pitcher;
    const oppName = oppPitcher?.name;
    if (!oppName) continue;
    const oppX = xByName.get(nameKey(oppName)) || xByName.get(lastNameKey(oppName));
    const oppXera = oppX ? Number(oppX.xera) : NaN;
    if (!(Number.isFinite(oppXera) && oppXera >= STRUGGLING_SP_XERA)) continue;

    const batters = lineups[s.abbr]?.batters;
    if (!Array.isArray(batters) || !batters.length) continue;
    const teamStats = await safeSeasonStats(bdl, season, s.teamId);
    if (!teamStats.size) continue;

    // Find this team's top-OPS hitter in the lineup → the star to SKIP.
    let starId = null, starOps = -1;
    for (const b of batters) {
      const st = teamStats.get(String(batterId(b)));
      if (st && Number.isFinite(st.ops) && st.ops > starOps) { starOps = st.ops; starId = String(batterId(b)); }
    }

    for (const b of batters) {
      const pid = String(batterId(b));
      if (!pid || pid === 'undefined' || pid === starId) continue; // skip star + unknowns
      const st = teamStats.get(pid);
      const ops = st ? st.ops : NaN;
      const avg = st ? st.avg : NaN;
      if (!Number.isFinite(ops) || ops < MIN_HITTER_OPS || ops > MAX_HITTER_OPS) continue;
      const order = Number(b.order ?? b.batting_order ?? b.battingOrder);

      let score = 40;
      score += (oppXera - STRUGGLING_SP_XERA) * 8;     // worse opposing SP = better spot
      score += (ops - MIN_HITTER_OPS) * 60;            // in-form bat
      if (Number.isFinite(order) && order >= 2 && order <= 6) score += 8; // PA opportunity
      score = clampScore(score);
      const name = b.name || b.full_name || '';
      if (!name) continue;
      const tier = tierFor(score);
      const pos = b.pos || b.position || 'BAT';

      hitters.push(makeRow({
        category: 'fantasyPickups',
        headline: name,
        detail: `Pickup vs ${oppName} (${round(oppXera, 2)} xERA) — ${pct3(ops)} OPS` +
          (Number.isFinite(order) ? `, bats ${order}${ordSuffix(order)}` : '') + '.',
        game: label,
        value: `${pct3(ops)} OPS`,
        tone: TONES.EDGE,
        relevance_score: score,
        player_id: batterId(b) != null ? batterId(b) : undefined,
        team_id: s.teamId, game_id: gameId,
        meta: {
          kind: 'fantasy_pickup', role: 'HITTER', tier, position: pos,
          ops: round(ops, 3),
          ...(Number.isFinite(avg) ? { avg: round(avg, 3) } : {}),
          ...(Number.isFinite(order) ? { batting_order: order } : {}),
          opp_sp: oppName, opp_sp_era: round(oppXera, 2), opp: s.oppAbbr || '',
          reason: `vs ${oppName} ${round(oppXera, 2)} xERA`,
        },
      }));
    }
  }

  return { pitchers, hitters };
}

function batterId(b) { return b?.playerId ?? b?.player_id ?? b?.id ?? b?.player?.id; }

/** teamId → Map(playerId → {ops, avg}) from BDL season stats (one call/team). */
async function safeSeasonStats(bdl, season, teamId) {
  const map = new Map();
  if (teamId == null) return map;
  try {
    const rows = await bdl.getMlbPlayerSeasonStats({ season, teamId });
    for (const r of (Array.isArray(rows) ? rows : [])) {
      const id = r?.player?.id ?? r?.player_id;
      if (id == null) continue;
      map.set(String(id), { ops: Number(r?.batting_ops), avg: Number(r?.batting_avg) });
    }
  } catch (err) {
    console.error('[fantasyPickups] team stats error:', err?.message || err);
  }
  return map;
}

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

function readRunsFor(row) {
  const candidates = [row?.avg_runs_for, row?.runs_for_per_game, row?.runs_per_game];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0 && n < 12) return n;
  }
  const rf = Number(row?.runs_for ?? row?.runs_scored);
  const gp = Number(row?.games_played ?? ((Number(row?.wins) || 0) + (Number(row?.losses) || 0)));
  if (Number.isFinite(rf) && Number.isFinite(gp) && gp > 0) return rf / gp;
  return NaN;
}

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

function indexXStatsByName(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const last = r?.last_name || '', first = r?.first_name || '';
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
