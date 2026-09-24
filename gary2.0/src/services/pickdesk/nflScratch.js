/** FOOTBALL INACTIVES (founder GO, Sep 24 2026): the NFL's official inactives
 * post at T-90. From then to kickoff, a Winners play whose case leans on a
 * player now Out or Inactive comes off the board. Nothing is re-picked; the
 * free pick stands as published. College has no inactives report. */
import { normName } from '../darts/dartsCommon.js';

const OUT = /^(out|inactive)$/i;
const WATCH_MS = 95 * 60_000;

/** Normalized full names of every Out or Inactive player on the report. */
export function namesOut(rows = []) {
  const out = new Set();
  for (const r of rows) {
    if (!OUT.test(String(r?.status || r?.injury_status || '').trim())) continue;
    const n = normName(`${r?.player?.first_name || ''} ${r?.player?.last_name || ''}`);
    if (n) out.add(n);
  }
  return out;
}

/** The inactive the play leans on, or null. A prop is its player; a game is
 *  any name in the brief or the rationale (full name, or a surname of six letters or more). */
export function scratchFor(play, outNames) {
  const p = play.pick_snapshot || {};
  if (play.kind === 'prop') {
    const n = normName(p.player);
    return n && outNames.has(n) ? n : null;
  }
  const text = ` ${normName([...(p.brief?.reasons || []), p.rationale || ''].join(' '))} `;
  for (const n of outNames) {
    if (text.includes(` ${n} `)) return n;
    const last = n.split(' ').pop();
    if (last.length > 5 && text.includes(` ${last} `)) return n;
  }
  return null;
}

/** Scratch NFL plays inside the inactives window. Returns how many. */
export async function scratchNflPlays(client, { injuries, now = Date.now(), log = console } = {}) {
  const { data: board, error } = await client.from('winners_board').select('candidate_id,kind,pick_snapshot')
    .eq('league', 'NFL').is('scratched_at', null).gte('game_date', new Date(now - 86400000).toISOString().slice(0, 10));
  if (error) throw error;
  if (!board?.length) return 0;
  const { data: cands, error: candError } = await client.from('winners_candidates').select('id,commence_time').in('id', board.map((b) => b.candidate_id));
  if (candError) throw candError;
  const starts = new Map((cands || []).map((c) => [c.id, Date.parse(c.commence_time)]));
  const due = board.filter((b) => { const t = starts.get(b.candidate_id); return Number.isFinite(t) && t > now && t <= now + WATCH_MS; });
  if (!due.length) return 0;
  const out = namesOut(await injuries());
  if (!out.size) return 0;
  let n = 0;
  for (const play of due) {
    const who = scratchFor(play, out);
    if (!who) continue;
    const { data: ok, error: e } = await client.rpc('scratch_winners_play', { p_candidate_id: play.candidate_id, p_reason: `${who} inactive` });
    if (e) { log.error(`[Winners] scratch ${play.candidate_id}: ${e.message}`); continue; }
    if (ok) { n++; log.log(`[Winners] ${new Date().toISOString()} SCRATCHED NFL ${play.kind} ${play.candidate_id}: ${who} is inactive`); }
  }
  return n;
}
