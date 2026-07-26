// gary2.0/src/services/insights/computers/closerWatch.js
//
// LANE: closerWatch  (category token: closer_watch) — MLB only.
// "Closer Watch" — who actually gets the ninth for tonight's teams. The saves
// column every season-long manager checks daily: locked roles to roster,
// committees to handcuff, and the setup man one blown save from the job.
//
// GROUNDED — season save/hold totals straight from BDL team season stats
// (pitching_sv / pitching_hld). No role speculation: a committee is a FACT of
// the numbers (top two arms within 2 saves), never a beat-writer rumor.
//
// Sources:
//  • ctx.games (today's BDL slate): the teams in action tonight.
//  • bdl.getMlbPlayerSeasonStats({season, teamId}): pitching_sv, pitching_hld.
// Defensive: a team with no saves yet, or a failed fetch, is skipped; returns [].

import { makeRow, TONES, clampScore } from '../shared.js';
import { geminiService } from '../../geminiService.js';

const COMMITTEE_GAP = 2;   // leader within this of runner-up = shared ninth
const MAX_TEAMS = 8;

export async function computeCloserWatch(ctx) {
  const { games, season, bdl, helpers } = ctx;
  if (!Array.isArray(games) || !games.length) return [];

  const teams = new Map(); // teamId -> { abbr, name, gameId, gameLabel }
  for (const g of games) {
    for (const side of ['home_team', 'visitor_team']) {
      const t = g?.[side];
      if (t?.id != null && !teams.has(t.id)) {
        teams.set(t.id, {
          abbr: t.abbreviation || '', name: t.full_name || t.name || '',
          gameId: g?.id, label: helpers.gameLabel(g),
        });
      }
    }
  }

  const rows = [];
  for (const [teamId, t] of teams) {
    try {
      const stats = await bdl.getMlbPlayerSeasonStats({ season, teamId });
      const arms = (Array.isArray(stats) ? stats : [])
        .map((r) => ({
          id: r?.player?.id,
          name: [r?.player?.first_name, r?.player?.last_name].filter(Boolean).join(' '),
          sv: Number(r?.pitching_sv) || 0,
          hld: Number(r?.pitching_hld) || 0,
        }))
        .filter((a) => a.id != null && a.name && a.sv > 0)
        .sort((a, b) => b.sv - a.sv);
      if (!arms.length) continue;

      const leader = arms[0];
      const runner = arms[1] || null;
      const committee = !!runner && (leader.sv - runner.sv) <= COMMITTEE_GAP;

      let score = 55;
      if (committee) score += 12;                 // actionable drama — handcuff spot
      else if (leader.sv >= 20) score += 5;       // bankable locked role
      score = clampScore(score);

      const detail = committee
        ? `Shared ninth in ${t.abbr || t.name}: ${leader.name} ${leader.sv} saves, ${runner.name} ${runner.sv}. The role is live.`
        : `${leader.name} owns the ninth for the ${clubDisplay(t.name)} — ${leader.sv} saves this season` +
          (runner ? ` (next closest: ${runner.name} with ${runner.sv})` : '') + '.';

      rows.push(makeRow({
        category: 'closerWatch',
        headline: committee ? `${leader.name} / ${runner.name}` : leader.name,
        detail,
        game: t.label,
        value: `${leader.sv} SV`,
        tone: committee ? TONES.WARN : TONES.NEUTRAL,
        relevance_score: score,
        player_id: leader.id,
        team_id: teamId,
        game_id: t.gameId,
        meta: {
          kind: 'closer_watch', committee,
          team: t.abbr || t.name,
          leader: { name: leader.name, sv: leader.sv, hld: leader.hld },
          ...(runner ? { runner: { name: runner.name, sv: runner.sv, hld: runner.hld } } : {}),
        },
      }));
    } catch (err) {
      console.error(`[closerWatch] team ${teamId} error:`, err?.message || err);
    }
  }

  rows.sort((a, b) => b.relevance_score - a.relevance_score);
  const out = rows.slice(0, MAX_TEAMS);
  console.log(`[closerWatch] teams=${out.length}/${teams.size} (${out.filter((r) => r.meta.committee).length} committees)`);
  await writeReads(out);
  return out;
}

/** "Chicago White Sox" -> "White Sox"; general club display, mascot-safe. */
function clubDisplay(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length < 2) return fullName || '';
  const last = parts[parts.length - 1];
  if (last === 'Sox' || last === 'Jays') return parts.slice(-2).join(' ');
  return last;
}

/** Fenced flash pass — the saves-chaser read per team (facts only). */
async function writeReads(rows) {
  if (!rows.length) return;
  const facts = rows.map((r, i) => {
    const m = r.meta || {};
    const base = `${i}. TEAM ${m.team} — leader ${m.leader.name}: ${m.leader.sv} saves` +
      (m.leader.hld ? `, ${m.leader.hld} holds` : '');
    const run = m.runner ? `; next: ${m.runner.name} ${m.runner.sv} saves` +
      (m.runner.hld ? `, ${m.runner.hld} holds` : '') : '';
    const committee = m.committee ? `YES (within ${COMMITTEE_GAP} saves)` : 'no';
    return `${base}${run}. Committee: ${committee}. Plays tonight: ${r.game}.`;
  }).join('\n');

  const prompt = `You are Gary, a sharp fantasy baseball analyst writing the daily saves column for season-long managers. For each team below, write the ninth-inning situation.

HARD RULES:
- Use ONLY the names and numbers listed for that team. Never introduce any pitcher, statistic, injury, trade, or role change not provided.
- 2 sentences per team, plain confident analyst voice. Committees: name both arms and what the split means for anyone chasing saves. Locked roles: what the save total says about how safe the job is.
- BANNED phrasing: "valuable asset", "solidify", "high-upside", "keep an eye on", and any sentence that could describe every team on the list.
- Then one short verdict sentence: locked role = "Roster him for saves." style; committee = "Handcuff both if you chase saves." style.
- No hedging boilerplate, no exclamation marks, never mention being an AI or a model.

Return STRICT JSON only: {"reads":[{"i":0,"read":"...","verdict":"..."}]}

TEAMS:
${facts}`;

  try {
    const resp = await geminiService.generateResponse(
      [{ role: 'user', content: prompt }],
      { model: 'gemini-3-flash-preview', maxTokens: 6000 }
    );
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
    console.log(`[closerWatch] reads attached: ${(parsed?.reads || []).length}/${rows.length}`);
  } catch (err) {
    console.error('[closerWatch] analyst pass failed (computed details kept):', err?.message || err);
  }
}

export default { computeCloserWatch };
