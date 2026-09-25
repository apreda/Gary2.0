// THE LINEUP-TIME REVIEW (founder GO, Sep 24 2026): when a game's props desk
// is built (lineups posted), Gary reviews his morning darts for that game with
// the full desk in front of him: he keeps each one or swaps it for another
// player in the same category from this game, and he may fill an open spot
// (a scratched dart anywhere today, or a category still short) from this
// game. Darts are not official picks, so a swap is allowed; the morning row
// stays, marked scratched with replaced_by pointing at the new dart, and
// leaves the page. The same review asks the parlay question per dart he
// keeps or throws. One Opus call per game, no new desk. Never fatal.
import { createModelSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { RATIONALE_WRITING_RULE } from '../copy/writingRules.js';
import { DART_CATEGORIES, SIDED_KINDS, dartCounts, fmtOdds, etDate } from './dartsCommon.js';
import { CATEGORY_LABEL } from './dartsScreen.js';
import { buildDartsSystemPrompt, dartWords, PRICED_IN, REASON_WORDS, DARTS_MODEL, DARTS_EFFORT, DARTS_PROMPT_SHA } from './dartsBrain.js';
import { buildMlbDartsBoard, mlbDartRow } from './mlbDartsBoard.js';
import { buildNflDartsBoard, nflDartRow, SIDED_MARKET } from './nflDartsBoard.js';
import { scratchDarts } from './dartsScratch.js';
import { parlaySection } from '../pickdesk/garyBet.js';

const TIMEOUT_MS = 10 * 60 * 1000;
const SUFFIX = { recyds: 'rec', rushyds: 'rush', passtd: 'pass', int: 'int' };

/** This game's dart prices now, per category, as { id, kind, c, line } from the league's board. */
function gameOptions(league, board, gameId) {
  const out = [];
  for (const [id, c] of board.candidates) {
    if (String(c.gameId) !== String(gameId)) continue;
    if (league === 'MLB') {
      if (c.kind === 'first_inning') out.push({ id, kind: 'first_inning', c, line: `yes ${fmtOdds(c.yes)} / no ${fmtOdds(c.no)}` });
      else {
        if (c.hr) out.push({ id: `${id}h`, kind: 'hr', c, line: `${c.player} (${String(c.team).replace(/^.* /, '')}) ${fmtOdds(c.hr.odds)}` });
        if (c.hits) out.push({ id: `${id}m`, kind: 'multihit', c, line: `${c.player} (${String(c.team).replace(/^.* /, '')}) ${fmtOdds(c.hits.odds)}` });
      }
    } else {
      if (c.td) out.push({ id: `${id}t`, kind: c.tdKind || 'td', c, line: `${c.player} (${c.position}) ${fmtOdds(c.td.odds)}` });
      for (const [kind, m] of Object.entries(SIDED_MARKET)) {
        const mk = c[m.key];
        if (mk) out.push({ id: `${id}${SUFFIX[kind]}`, kind, c, line: `${c.player} (${c.position}) ${mk.line} over ${fmtOdds(mk.over)} / under ${fmtOdds(mk.under)}` });
      }
    }
  }
  return out;
}

const rowFor = (league, kind, c, side) => (league === 'MLB' ? mlbDartRow(kind, c, { side }) : nflDartRow(kind, c, { side: side || 'over' }));

export function buildReviewAsk({ matchup, deskText, mine, open, options, parlay, dateLong }) {
  const byKind = new Map();
  for (const o of options) { if (!byKind.has(o.kind)) byKind.set(o.kind, []); byKind.get(o.kind).push(o); }
  const kinds = [...new Set([...mine.map((d) => d.kind), ...Object.keys(open).filter((k) => open[k] > 0)])];
  const priceBlock = kinds.map((k) => `${CATEGORY_LABEL[k] || k}: ${(byKind.get(k) || []).map((o) => `[${o.id}] ${o.line}`).join(' · ') || 'no price in this game now'}`).join('\n');
  const openText = Object.entries(open).filter(([, n]) => n > 0).map(([k, n]) => `${CATEGORY_LABEL[k] || k} ${n}`).join(', ');
  const section = parlaySection(parlay);
  return `## THE DESK — ${matchup}

${deskText}

═══ YOUR DARTS IN THIS GAME, thrown this morning (${dateLong}) ═══
${mine.length ? mine.map((d) => `[D${d.id}] ${CATEGORY_LABEL[d.kind] || d.kind} · ${dartWords(d)}${d.scratched_at ? ` · scratched: ${d.scratch_reason || 'not playing'}` : ''}\n    your reason this morning: ${d.reason}`).join('\n') : 'none in this game.'}

OPEN SPOTS TODAY: ${openText || 'none'}.

THIS GAME'S DART PRICES NOW:
${priceBlock}

${PRICED_IN}
${section ? `\n${section}\n` : ''}
The lineups are in. Your morning darts in this game are yours to keep or change: keep a dart, or swap it for another player in the same category from this game. An open spot can be filled from this game or left open. Darts are your fun leans, never on your record. For each dart you keep, swap in or throw, two or three sentences on why, from what is in front of you. ${REASON_WORDS}${section ? ' For each one, also say whether it goes on today\'s parlay.' : ''}

JSON only:

\`\`\`json
{ "darts": [ { "id": "[D id]", "action": "keep|swap", "to": "[price id when swapping]", "side": "[over|under or yes|no where the line is two-sided]", "reason": "[two or three sentences]"${section ? ', "parlay": false, "parlay_line": "[one sentence when parlay is true]"' : ''} } ],
  "adds": [ { "id": "[price id]", "side": "[where two-sided]", "reason": "[two or three sentences]"${section ? ', "parlay": false, "parlay_line": ""' : ''} } ] }
\`\`\`

${RATIONALE_WRITING_RULE}`;
}

function parseReview(text) {
  const raw = String(text || '');
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  for (const t of [...fenced.reverse(), raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)]) {
    try { const p = JSON.parse(t); if (p && (Array.isArray(p.darts) || Array.isArray(p.adds))) return p; } catch { /* next */ }
  }
  return null;
}

const readSide = (kind, raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (kind === 'first_inning') return s.startsWith('n') ? 'no' : s.startsWith('y') ? 'yes' : null;
  if (SIDED_KINDS.has(kind)) return s.startsWith('u') ? 'under' : s.startsWith('o') ? 'over' : null;
  return null;
};

/**
 * Review one game's darts. `deskText` = the props desk Gary just read for this
 * game. Returns { kept, swapped, added } counts; logs and returns zeros on any failure.
 */
export async function reviewGameDarts({ supabase, league, game, deskText, dry = false, log = console }) {
  const none = { kept: 0, swapped: 0, added: 0 };
  try {
    if (!supabase || !deskText || !['MLB', 'NFL'].includes(league)) return none;
    const date = etDate(Date.parse(game.commence_time));
    const gameId = String(game.bdl_game_id ?? game.id ?? '');
    if (!gameId) return none;
    if (league === 'MLB') await scratchDarts({ supabase, date, log: () => {} }).catch(() => 0);
    const { data: today, error } = await supabase.from('darts')
      .select('id, kind, player, player_id, team, matchup, game_id, prop, bet, odds, reason, rank, scratched_at, scratch_reason, reviewed_at, replaced_by')
      .eq('game_date', date).eq('league', league).is('replaced_by', null);
    if (error) throw new Error(error.message);
    const mine = (today || []).filter((d) => String(d.game_id) === gameId && !d.reviewed_at);
    const board = league === 'MLB' ? await buildMlbDartsBoard({ supabase, date }) : await buildNflDartsBoard({ date });
    if (!board.games) return none;
    const quota = dartCounts(league, board.games, date);
    const standing = {};
    for (const d of today || []) if (!d.scratched_at) standing[d.kind] = (standing[d.kind] || 0) + 1;
    const open = Object.fromEntries(DART_CATEGORIES[league].map((c) => [c.kind, Math.max(0, (quota[c.kind] || 0) - (standing[c.kind] || 0))]));
    const live = mine.filter((d) => !d.scratched_at);
    if (!live.length && !Object.values(open).some((n) => n > 0)) return none;
    const options = gameOptions(league, board, gameId);
    const byId = new Map(options.map((o) => [o.id, o]));
    const { data: parlay } = await supabase.rpc('parlay_ticket_state', { p_date: date });
    const dateLong = new Date(`${date}T12:00:00-04:00`).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });
    const matchup = mine[0]?.matchup || `${game.away_team} @ ${game.home_team}`;
    const ask = buildReviewAsk({ matchup, deskText, mine, open, options, parlay, dateLong });
    const session = await createModelSession({ modelName: DARTS_MODEL, systemPrompt: buildDartsSystemPrompt(dateLong), tools: [], thinkingLevel: DARTS_EFFORT, breakerLane: 'content', timeoutMs: TIMEOUT_MS });
    const res = await sendToSessionWithRetry(session, ask, {});
    const model = `${res.model || session.modelName || DARTS_MODEL} · review · ${DARTS_PROMPT_SHA}`;
    const answer = parseReview(res.content);
    if (!answer) { log.warn(`[Darts review] ${matchup}: no JSON in the answer; darts stand as thrown`); return none; }
    if (dry) { log.log(`[Darts review] dry: ${options.length} prices in this game, open ${JSON.stringify(open)}\n${JSON.stringify(answer, null, 1)}`); return { ...none, dry: answer }; }
    const now = new Date().toISOString();
    const parlayFields = (x) => (x?.parlay === true && !parlay?.locked ? { parlay_at: now, parlay_line: String(x.parlay_line || '').trim() || null } : {});
    const lastRank = {};
    for (const d of today || []) lastRank[d.kind] = Math.max(lastRank[d.kind] || 0, d.rank || 0);
    const counts = { ...none };
    const insert = async (row) => {
      const { data, error: e } = await supabase.from('darts').insert(row).select('id').single();
      if (e) throw new Error(e.message);
      return data.id;
    };
    for (const a of answer.darts || []) {
      const d = live.find((x) => `D${x.id}` === String(a?.id || '').replace(/^\[|\]$/g, ''));
      if (!d) continue;
      const reason = String(a?.reason || '').trim();
      if (a?.action === 'swap') {
        const o = byId.get(String(a?.to || '').replace(/^\[|\]$/g, ''));
        const side = o ? readSide(o.kind, a?.side) : null;
        if (!o || o.kind !== d.kind || !reason || ((o.kind === 'first_inning' || SIDED_KINDS.has(o.kind)) && !side)
          || (today || []).some((x) => x.kind === o.kind && (o.kind === 'first_inning' ? String(x.game_id) === String(o.c.gameId) : x.player === o.c.player) && !x.scratched_at && x.id !== d.id)) {
          log.warn(`[Darts review] ${matchup}: swap for D${d.id} not valid; the dart stands`);
          await supabase.from('darts').update({ reviewed_at: now }).eq('id', d.id);
          continue;
        }
        const newId = await insert({ ...rowFor(league, o.kind, o.c, side), game_date: date, reason, model, rank: d.rank, reviewed_at: now, ...parlayFields(a) });
        await supabase.from('darts').update({ scratched_at: now, scratch_reason: 'swapped at lineup time', replaced_by: newId, reviewed_at: now }).eq('id', d.id);
        counts.swapped += 1;
        log.log(`  🔁 ${CATEGORY_LABEL[d.kind]}: ${d.player} → ${o.c.player || o.c.matchup} · ${reason}`);
      } else {
        await supabase.from('darts').update({ reviewed_at: now, ...parlayFields(a) }).eq('id', d.id);
        counts.kept += 1;
      }
    }
    for (const d of live) if (!(answer.darts || []).some((a) => String(a?.id || '').replace(/^\[|\]$/g, '') === `D${d.id}`)) await supabase.from('darts').update({ reviewed_at: now }).eq('id', d.id);
    for (const d of mine.filter((x) => x.scratched_at)) await supabase.from('darts').update({ reviewed_at: now }).eq('id', d.id);
    for (const a of answer.adds || []) {
      const o = byId.get(String(a?.id || '').replace(/^\[|\]$/g, ''));
      if (!o || !(open[o.kind] > 0)) continue;
      const side = readSide(o.kind, a?.side);
      const reason = String(a?.reason || '').trim();
      if (!reason || ((o.kind === 'first_inning' || SIDED_KINDS.has(o.kind)) && !side)) continue;
      if ((today || []).some((x) => x.kind === o.kind && (o.kind === 'first_inning' ? String(x.game_id) === String(o.c.gameId) : x.player === o.c.player))) continue;
      lastRank[o.kind] = (lastRank[o.kind] || 0) + 1;
      await insert({ ...rowFor(league, o.kind, o.c, side), game_date: date, reason, model, rank: lastRank[o.kind], reviewed_at: now, ...parlayFields(a) });
      open[o.kind] -= 1;
      counts.added += 1;
      log.log(`  ➕ ${CATEGORY_LABEL[o.kind]}: ${o.c.player || o.c.matchup} · ${reason}`);
    }
    log.log(`🎯 Darts review ${matchup}: ${counts.kept} kept, ${counts.swapped} swapped, ${counts.added} added`);
    return counts;
  } catch (e) {
    log.warn(`[Darts review] ${game?.away_team} @ ${game?.home_team}: ${e.message}; darts stand as thrown`);
    return none;
  }
}
