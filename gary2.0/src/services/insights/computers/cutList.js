// gary2.0/src/services/insights/computers/cutList.js
//
// LANE: cutList  (category token: cut_list) — MLB only.
// "The Cut List" — the other half of every real waiver column: who to DROP.
// Names still penciled into tonight's lineups (so managers genuinely hold
// them) whose season numbers say the roster spot is wasted, and starters
// whose surface ERA is hiding a liability.
//
// GROUNDED — a player appears only with tonight's lineup spot + his real
// season numbers attached. Never a rumor, never a vibe: the drop case is the
// stat line itself, and Gary's read explains what the numbers mean together.
//
// Sources:
//  • ctx.games + bdl.getMlbLineups(gameId): tonight's batters (order) + SPs.
//  • bdl.getMlbPlayerSeasonStats({season, teamId}): OPS / AVG for bats.
//  • getPitcherXStats(season) [Savant]: xERA vs ERA for arms.
// Defensive: missing data skips the player; failures return [].

import { makeRow, TONES, clampScore, round, nameKey, ordinal } from '../shared.js';
import { getPitcherXStats } from '../../baseballSavantService.js';
import { generateSolText } from '../solText.js';

const BAT_MAX_OPS = 0.680;        // an everyday bat below this is a wasted spot
const BAT_MAX_ORDER = 6;          // still in the heart of the order = still rostered
const ARM_MIN_XERA = 5.00;        // matchup-independent liability
const ERA_LYING_GAP = 0.50;       // era flatters xera by this much = "the ERA is lying"
const MAX_BATS = 4, MAX_ARMS = 3;

export async function computeCutList(ctx) {
  const { games, season, bdl } = ctx;
  if (!Array.isArray(games) || !games.length) return [];

  let xByName = new Map();
  try {
    for (const r of (await getPitcherXStats(season)) || []) {
      const last = r?.last_name || '', first = r?.first_name || '';
      if (last) xByName.set(nameKey(`${first} ${last}`), r);
      else if (r?.name) xByName.set(nameKey(r.name), r);
    }
  } catch (err) { console.error('[cutList] savant error (arms skipped):', err?.message || err); }

  const bats = [], arms = [];
  const statsCache = new Map();
  const teamStats = async (teamId) => {
    if (teamId == null) return new Map();
    if (statsCache.has(teamId)) return statsCache.get(teamId);
    const map = new Map();
    try {
      const rows = await bdl.getMlbPlayerSeasonStats({ season, teamId });
      for (const r of (Array.isArray(rows) ? rows : [])) {
        const id = r?.player?.id ?? r?.player_id;
        if (id == null) continue;
        map.set(String(id), { ops: Number(r?.batting_ops), avg: Number(r?.batting_avg) });
      }
    } catch (err) { console.error('[cutList] team stats error:', err?.message || err); }
    statsCache.set(teamId, map);
    return map;
  };

  for (const game of games) {
    let lineups = null;
    try { lineups = await bdl.getMlbLineups(game?.id); } catch { continue; }
    if (!lineups || typeof lineups !== 'object') continue;

    const sides = [
      { abbr: game?.home_team?.abbreviation, teamId: game?.home_team?.id },
      { abbr: game?.visitor_team?.abbreviation, teamId: game?.visitor_team?.id },
    ];
    for (const s of sides) {
      const side = lineups[s.abbr];
      if (!side) continue;

      // ── Arms: tonight's SP with liability-grade underlying numbers ────────
      const sp = side.pitcher;
      if (sp?.name) {
        const x = xByName.get(nameKey(sp.name));
        const xera = x ? Number(x.xera) : NaN;
        const era = x ? Number(x.era) : NaN;
        if (Number.isFinite(xera) && xera >= ARM_MIN_XERA) {
          const lying = Number.isFinite(era) && (xera - era) >= ERA_LYING_GAP;
          let score = 55 + (xera - ARM_MIN_XERA) * 10 + (lying ? 8 : 0);
          arms.push({
            name: sp.name, playerId: sp.playerId, teamId: s.teamId, team: s.abbr,
            gameId: game?.id, xera: round(xera, 2),
            era: Number.isFinite(era) ? round(era, 2) : null, lying,
            score: clampScore(score),
          });
        }
      }

      // ── Bats: everyday spots producing below the droppable line ───────────
      const batters = Array.isArray(side.batters) ? side.batters : [];
      if (!batters.length) continue;
      const stats = await teamStats(s.teamId);
      for (const b of batters) {
        const order = Number(b.order ?? b.batting_order ?? b.battingOrder);
        if (!Number.isFinite(order) || order > BAT_MAX_ORDER) continue;
        const pid = String(b?.playerId ?? b?.player_id ?? b?.id ?? '');
        const st = stats.get(pid);
        const ops = st ? st.ops : NaN;
        const avg = st ? st.avg : NaN;
        // Sanity bounds — same law as returnWatch: garbage lines never print.
        if (!Number.isFinite(ops) || ops < 0.2 || ops > BAT_MAX_OPS) continue;
        const name = b.name || b.full_name || '';
        if (!name) continue;
        let score = 50 + (BAT_MAX_OPS - ops) * 90 + (order <= 4 ? 6 : 0);
        bats.push({
          name, playerId: pid || null, teamId: s.teamId, team: s.abbr,
          gameId: game?.id, ops: round(ops, 3),
          avg: Number.isFinite(avg) ? round(avg, 3) : null,
          order, position: b.pos || b.position || 'BAT',
          score: clampScore(score),
        });
      }
    }
  }

  const topBats = bats.sort((a, b) => b.score - a.score).slice(0, MAX_BATS);
  const topArms = arms.sort((a, b) => b.score - a.score).slice(0, MAX_ARMS);
  console.log(`[cutList] bats=${topBats.length}/${bats.length}, arms=${topArms.length}/${arms.length}`);

  const rows = [];
  for (const a of topArms) {
    const note = `${a.xera} xERA` + (a.era != null ? ` behind a ${a.era} ERA` : '') +
      (a.lying ? ' — the ERA is flattering him' : '');
    rows.push(makeRow({
      category: 'cutList',
      headline: a.name,
      detail: `Starts tonight for ${a.team} — ${note}.`,
      game: `${a.team} tonight`,
      value: `${a.xera} xERA`,
      tone: TONES.WARN,
      relevance_score: a.score,
      player_id: a.playerId ?? undefined,
      team_id: a.teamId, game_id: a.gameId,
      meta: { kind: 'cut_list', role: 'SP', tier: 'CUT', team: a.team,
        xera: a.xera, ...(a.era != null ? { era: a.era } : {}), drop_note: note },
    }));
  }
  for (const b of topBats) {
    const note = `${String(b.ops.toFixed(3))} OPS` +
      (b.avg != null ? `, ${String(b.avg.toFixed(3))} AVG` : '') +
      ` from the ${b.order}-hole`;
    rows.push(makeRow({
      category: 'cutList',
      headline: b.name,
      detail: `Still hitting ${ordinal(b.order)} for ${b.team} — ${note}.`,
      game: `${b.team} tonight`,
      value: `${b.ops.toFixed(3)} OPS`,
      tone: TONES.WARN,
      relevance_score: b.score,
      player_id: b.playerId ?? undefined,
      team_id: b.teamId, game_id: b.gameId,
      meta: { kind: 'cut_list', role: 'HITTER', tier: 'CUT', team: b.team,
        position: b.position, ops: b.ops,
        ...(b.avg != null ? { avg: b.avg } : {}), batting_order: b.order, drop_note: note },
    }));
  }

  await writeReads(rows);
  return rows;
}

/**
 * Fenced flash pass — the cut case per player (facts only). CHUNKED in
 * threes: thinking-model output budgets are shared with reasoning tokens,
 * so big single calls truncate mid-JSON (bit twice Jul 26). Small chunks
 * always fit; a failed chunk degrades only its three rows.
 */
async function writeReads(rows) {
  for (let i = 0; i < rows.length; i += 3) {
    await writeReadsChunk(rows.slice(i, i + 3));
  }
}

async function writeReadsChunk(rows) {
  if (!rows.length) return;
  const facts = rows.map((r, i) => {
    const m = r.meta || {};
    return m.role === 'SP'
      ? `${i}. PITCHER ${r.headline} (${m.team}) — season xERA ${m.xera}` +
        (m.era != null ? `, surface ERA ${m.era}` : '') + `. Starts tonight.`
      : `${i}. HITTER ${r.headline} (${m.team}, bats ${ordinal(m.batting_order)}) — season OPS ${m.ops}` +
        (m.avg != null ? `, AVG ${m.avg}` : '') + `. In tonight's lineup.`;
  }).join('\n');

  const prompt = `You are Gary — the bettor whose season-long fantasy column publishes in this app. You write as yourself, never as an AI, and your training data is old: the facts below are current and they are ALL you may use — never introduce a statistic, injury, prospect, or replacement name that isn't listed.

For each player below: the case for cutting him from a season-long roster, and the call.

Return STRICT JSON only: {"reads":[{"i":0,"read":"...","verdict":"..."}]}

PLAYERS:
${facts}`;

  try {
    const resp = await generateSolText(prompt, { maxTokens: 9000 });
    const text = typeof resp === 'string' ? resp : (resp?.content ?? resp?.text ?? '');
    const jsonStr = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr.slice(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1));
    for (const item of parsed?.reads || []) {
      const r = rows[item?.i];
      if (!r || !item?.read) continue;
      const verdict = (item.verdict || '').trim();
      r.detail = `${item.read.trim()}${verdict ? ` ${verdict}` : ''}`;
      r.meta = { ...(r.meta || {}), read: item.read.trim(), ...(verdict ? { verdict } : {}) };
    }
    console.log(`[cutList] reads attached: ${(parsed?.reads || []).length}/${rows.length}`);
  } catch (err) {
    console.error('[cutList] analyst pass failed (computed details kept):', err?.message || err);
  }
}

export default { computeCutList };
