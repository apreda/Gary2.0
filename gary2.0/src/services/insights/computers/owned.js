// gary2.0/src/services/insights/computers/owned.js
//
// LANE: owned
// "A hitter has historically OWNED tonight's probable pitcher (or vice-versa)
//  — a career batter-vs-pitcher edge."
//
// Data path (documented BDL methods only):
//   - getMlbLineups(gameId) -> object keyed by team abbreviation; per team
//     { pitcher: { name, batsThrows, playerId } | null, batters: [{ name,
//       position, battingOrder, batsThrows, playerId }] }. A hitter faces the
//     pitcher on the OTHER team's entry, so each side is paired with the
//     OPPOSING probable starter (skip a side that has no probable pitcher).
//   - getMlbPlayerVsPlayer({ playerId, opponentTeamId }) -> array of career
//     batter-vs-pitcher lines, one per opposing pitcher the batter has faced:
//       [{ opponent_player: { id, full_name, position, ... }, opponent_team,
//          at_bats, hits, home_runs, walks, strikeouts, avg, obp, slg, ops }]
//     We keep the row whose opponent_player.id === tonight's probable starter
//     (fallback: nameKey match on opponent_player.full_name) and read the
//     career line off that single row.
//
// Gates (skip the mushy middle):
//   - at_bats >= MIN_AB (a real career sample).
//   - HITTER owns: avg >= .350 OR ops >= 1.000.
//   - PITCHER owns: avg <= .130 AND strikeouts >= 5.
//
// Relevance scales on the OPS gap from a .700 league baseline (hitter-owns on
// ops - .700, pitcher-owns on .700 - ops), weighted by sample confidence
// min(1, at_bats/25). At most MAX_PER_GAME rows per game, strongest by score,
// ties broken by AB desc.
//
// Tone: HOT when the hitter owns the matchup, CAUTION when the pitcher does.
// Defensive: any missing piece -> skip that batter/side silently; never throws.

import {
  makeRow, TONES, scoreFromEdge, nameKey, pct3, pickVariant, round,
} from '../shared.js';

// Tunables.
const MIN_AB = 10;                 // require a real career sample
const HITTER_AVG = 0.350;          // hitter owns: avg at/above this ...
const HITTER_OPS = 1.000;          // ... OR ops at/above this
const PITCHER_AVG = 0.130;         // pitcher owns: avg at/below this ...
const PITCHER_MIN_K = 5;           // ... AND this many strikeouts
const TOP_ORDER_SPOTS = 6;         // only spots 1-6 swing a game meaningfully
const OPS_BASELINE = 0.700;        // league-ish OPS midpoint for the edge calc
const AB_CONFIDENCE = 25;          // AB at/above this = full sample weight
const MAX_PER_GAME = 2;
const RELEVANCE_SCALE = 120;
const RELEVANCE_BASE = 45;
const RELEVANCE_CAP = 90;

const HITTER_VARIANTS = [
  (b, p, line, c) =>
    `${b} has gone ${line} (${pct3(c.avg)}) across ${c.ab} career at-bats off ${p}` +
    `${c.hr ? `, with ${c.hr} HR` : ''}. They meet again tonight.`,
  (b, p, line, c) =>
    `In ${c.ab} career at-bats against ${p}, ${b} is ${line} for a ${pct3(c.ops)} OPS` +
    `${c.bb ? ` (${c.bb} walk${c.bb === 1 ? '' : 's'})` : ''}. The two square off again tonight.`,
  (b, p, line, c) =>
    `${b}'s career line off ${p} is ${line}, a ${pct3(c.avg)} average over ${c.ab} at-bats` +
    `${c.hr ? ` with ${c.hr} home run${c.hr === 1 ? '' : 's'}` : ''} — they meet again tonight.`,
];

const PITCHER_VARIANTS = [
  (b, p, line, c) =>
    `${p} has limited ${b} to ${line} (${pct3(c.avg)}) with ${c.k} strikeouts in ` +
    `${c.ab} career at-bats. They face off again tonight.`,
  (b, p, line, c) =>
    `Across ${c.ab} career at-bats, ${b} is just ${line} against ${p} with ${c.k} ` +
    `strikeouts and a ${pct3(c.ops)} OPS. The rematch is tonight.`,
  (b, p, line, c) =>
    `${b} has managed only ${line} (${pct3(c.avg)}) off ${p}, striking out ${c.k} ` +
    `times in ${c.ab} career at-bats — they meet again tonight.`,
];

export async function computeOwned(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  let battersChecked = 0;
  let matchupsFound = 0;

  for (const game of games) {
    try {
      const result = await ownedForGame(game, { bdl, season, gameLabel: helpers.gameLabel });
      battersChecked += result.checked;
      matchupsFound += result.matched;
      rows.push(...result.rows);
    } catch (err) {
      console.error('[owned] game error:', err?.message || err);
      // continue to next game
    }
  }

  console.log(
    `[owned] examined ${battersChecked} batter(s), found ${matchupsFound} matchup(s), emitted ${rows.length}`,
  );
  return rows;
}

async function ownedForGame(game, { bdl, season, gameLabel }) {
  const empty = { checked: 0, matched: 0, rows: [] };
  const gameId = game?.id;
  if (gameId == null) return empty;

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return empty;

  const homeAbbr = game?.home_team?.abbreviation;
  const awayAbbr = game?.visitor_team?.abbreviation;
  if (!homeAbbr || !awayAbbr) return empty;

  const home = lineups[homeAbbr];
  const away = lineups[awayAbbr];
  if (!home || !away) return empty;

  const label = gameLabel(game);
  const candidates = [];
  let checked = 0;

  // Home hitters face the AWAY probable pitcher (opponent team = away team).
  // Away hitters face the HOME probable pitcher (opponent team = home team).
  const homeSide = await collectSide({
    side: home,
    teamId: game?.home_team?.id,
    oppPitcher: away?.pitcher,
    opponentTeamId: game?.visitor_team?.id,
    season,
    bdl,
  });
  const awaySide = await collectSide({
    side: away,
    teamId: game?.visitor_team?.id,
    oppPitcher: home?.pitcher,
    opponentTeamId: game?.home_team?.id,
    season,
    bdl,
  });

  checked += homeSide.checked + awaySide.checked;
  candidates.push(...homeSide.candidates, ...awaySide.candidates);

  // Strongest matchups first; deterministic tie-break by larger AB sample.
  candidates.sort((a, b) => (b.score - a.score) || (b.ab - a.ab));
  const top = candidates.slice(0, MAX_PER_GAME);

  const rows = top.map((c) => {
    const variants = c.kind === 'hitter' ? HITTER_VARIANTS : PITCHER_VARIANTS;
    const template = pickVariant(variants, c.playerId);
    let detail = template(c.batterName, c.pitcherName, c.line, c);

    // Current-form gate: tie the career edge to a NOW signal so a 2019 edge
    // doesn't read like a this-month one. Only on hitter-owns rows.
    const form = c.kind === 'hitter' ? c.recentForm : null;
    const formState = form
      ? (form.ops >= 0.800 ? 'hot' : (form.ops <= 0.650 ? 'cold' : 'steady'))
      : null;
    if (form) {
      detail += ` He enters ${formState} (${pct3(form.ops)} OPS, ${shortWin(form.label)}).`;
    }

    const headline = c.kind === 'hitter'
      ? `${c.batterName} vs ${c.pitcherName}: ${pct3(c.avg)}`
      : `${c.pitcherName} vs ${c.batterName}: ${c.line}, ${c.k} K`;

    return makeRow({
      category: 'owned',
      headline,
      detail,
      game: label,
      value: c.kind === 'hitter' ? pct3(c.avg) : c.line,
      tone: c.kind === 'hitter' ? TONES.HOT : TONES.CAUTION,
      relevance_score: c.score,
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
      meta: form ? { kind: 'h2h_form', recent_ops: round(form.ops, 3), recent_label: form.label, state: formState } : undefined,
    });
  });

  return { checked, matched: candidates.length, rows };
}

async function collectSide({ side, teamId, oppPitcher, opponentTeamId, season, bdl }) {
  const out = { checked: 0, candidates: [] };

  const pitcherId = oppPitcher?.playerId;
  const pitcherName = oppPitcher?.name;
  // No probable starter for the opposing side -> nothing to "own".
  if (pitcherId == null && !pitcherName) return out;
  if (opponentTeamId == null) return out;

  const pitcherKey = pitcherName ? nameKey(pitcherName) : null;
  const batters = Array.isArray(side?.batters) ? side.batters : [];

  for (const b of batters) {
    const order = Number(b?.battingOrder);
    if (!Number.isFinite(order) || order < 1 || order > TOP_ORDER_SPOTS) continue;

    const playerId = b?.playerId;
    if (playerId == null) continue;

    out.checked += 1;

    // Career batter-vs-pitcher lines vs everyone on the opponent's staff
    // (120-min cached per (player, oppTeam)). Await serially per side.
    const pvp = await bdl.getMlbPlayerVsPlayer({ playerId, opponentTeamId });
    const row = matchPitcherRow(pvp, pitcherId, pitcherKey);
    if (!row) continue;

    const ab = Number(row.at_bats);
    if (!Number.isFinite(ab) || ab < MIN_AB) continue;

    const hits = Number(row.hits) || 0;
    const avg = Number(row.avg);
    const ops = Number(row.ops);
    const k = Number(row.strikeouts) || 0;
    const bb = Number(row.walks) || 0;
    const hr = Number(row.home_runs) || 0;
    if (!Number.isFinite(avg) || !Number.isFinite(ops)) continue;

    const hitterOwns = avg >= HITTER_AVG || ops >= HITTER_OPS;
    const pitcherOwns = avg <= PITCHER_AVG && k >= PITCHER_MIN_K;
    if (!hitterOwns && !pitcherOwns) continue; // skip the mushy middle

    // Second-order: a career edge is stale on its own. Gate it on CURRENT form
    // (recent-window OPS from the same splits source the other lanes use) so the
    // card reads "owns him career AND is hot now" vs "owns him but ice-cold."
    let recentForm = null;
    if (hitterOwns) {
      try {
        const splits = await bdl.getMlbPlayerSplits({ playerId, season });
        recentForm = recentOpsFromSplits(splits);
      } catch (err) {
        console.error('[owned] splits error:', err?.message || err);
      }
    }

    const confidence = Math.min(1, ab / AB_CONFIDENCE);
    const kind = hitterOwns ? 'hitter' : 'pitcher';
    const edge = kind === 'hitter' ? ops - OPS_BASELINE : OPS_BASELINE - ops;
    const score = scoreFromEdge(edge * confidence, {
      scale: RELEVANCE_SCALE,
      base: RELEVANCE_BASE,
      cap: RELEVANCE_CAP,
    });

    out.candidates.push({
      kind,
      playerId,
      teamId,
      batterName: b.name || row.player?.full_name || 'The hitter',
      pitcherName: pitcherName || row.opponent_player?.full_name || 'the starter',
      line: `${hits}-for-${ab}`,
      ab,
      avg,
      ops,
      k,
      bb,
      hr,
      recentForm,
      score,
    });
  }

  return out;
}

/**
 * From a getMlbPlayerVsPlayer() result, pick the row whose opponent_player is
 * tonight's probable starter — by id first (most reliable), then a tolerant
 * nameKey fallback on opponent_player.full_name.
 */
function matchPitcherRow(pvp, pitcherId, pitcherKey) {
  if (!Array.isArray(pvp) || pvp.length === 0) return null;
  if (pitcherId != null) {
    // BDL player ids can arrive as string or number across endpoints; compare
    // loosely on the string form so a lineup id matches the PvP opponent id.
    const wantId = String(pitcherId);
    const byId = pvp.find((r) => r?.opponent_player?.id != null
      && String(r.opponent_player.id) === wantId);
    if (byId) return byId;
  }
  if (pitcherKey) {
    const byName = pvp.find(
      (r) => nameKey(r?.opponent_player?.full_name) === pitcherKey,
    );
    if (byName) return byName;
  }
  return null;
}

/**
 * Recent-window OPS from getMlbPlayerSplits().byDayMonth ("Last 7/15/30 Days") —
 * the same source the cooling/heat lanes use. Returns null when no real window.
 */
function recentOpsFromSplits(splits) {
  const buckets = Array.isArray(splits?.byDayMonth) ? splits.byDayMonth : null;
  if (!buckets) return null;
  const byName = (n) => buckets.find((e) => String(e?.split_name || '').trim().toLowerCase() === n);
  const rec = byName('last 15 days') || byName('last 7 days') || byName('last 30 days');
  const ops = Number(rec?.ops);
  if (!Number.isFinite(ops) || ops <= 0) return null;
  return { ops, label: rec.split_name || 'recent' };
}

/** "Last 15 Days" -> "L15". */
function shortWin(label) {
  const s = String(label || '').toLowerCase();
  if (s.includes('15')) return 'L15';
  if (s.includes('7')) return 'L7';
  if (s.includes('30')) return 'L30';
  return label;
}

export default { computeOwned };
