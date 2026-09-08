// Internal scheduled writer. Native clients read the public, bounded cache;
// neither a BDL credential nor a direct league request ships in the app.
import { isCacheServiceRequest } from '../live-scores/authorization.ts';
import { normalizeMlbLiveBatting } from '../_shared/mlbLiveBatting.js';
import { normalizeMlbGameStatus } from '../_shared/mlbGameStatus.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BDL_KEY = Deno.env.get('BALLDONTLIE_API_KEY');
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
const etDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);

async function getJSON(url: string, auth: Record<string, string>) {
  const res = await fetch(url, { headers: auth, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Source HTTP ${res.status}`);
  return res.json();
}
async function gameStats(gameId: number) {
  const rows: any[] = [], cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 4; page++) {
    const query = new URLSearchParams({ 'game_ids[]': String(gameId), per_page: '100' });
    if (cursor != null) query.set('cursor', cursor);
    const data = await getJSON(`https://api.balldontlie.io/mlb/v1/stats?${query}`, { Authorization: BDL_KEY! });
    if (!Array.isArray(data?.data) || data.data.some((r: any) => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('Invalid batting stats page');
    rows.push(...data.data);
    if (data.meta != null && (typeof data.meta !== 'object' || Array.isArray(data.meta))) throw new Error('Invalid stats pagination');
    const next = data.meta?.next_cursor;
    if (next == null) return rows;
    if (!data.data.length || !((typeof next === 'number' && Number.isSafeInteger(next) && next >= 0) ||
        (typeof next === 'string' && next.trim())) || cursors.has(String(next))) throw new Error('Incomplete batting stats');
    cursor = String(next); cursors.add(cursor);
  }
  throw new Error('Incomplete batting stats after page limit');
}

Deno.serve(async (req) => {
  if (!isCacheServiceRequest(req, SERVICE_KEY)) return Response.json({ ok: false, error: 'Service authorization required' }, { status: 403 });
  if (!BDL_KEY) return Response.json({ ok: false, error: 'BDL connection unavailable' }, { status: 503 });
  const today = etDate(new Date()), yesterday = etDate(new Date(Date.now() - 86_400_000));
  const window = `and=(date.gte.${yesterday},date.lte.${today})`;
  try {
    const candidates = await getJSON(`${SUPABASE_URL}/rest/v1/live_scores?league=eq.MLB&${window}&status=in.(live,final)&select=date,game_id,status&limit=40`, headers);
    const cached = await getJSON(`${SUPABASE_URL}/rest/v1/mlb_live_batting?${window}&select=date,game_id,is_final&limit=100`, headers);
    if (!Array.isArray(candidates) || !Array.isArray(cached) || candidates.length >= 40) throw new Error('Invalid batting cache scope');
    const finalKeys = new Set(cached.filter((r: any) => r.is_final === true).map((r: any) => `${r.date}|${r.game_id}`));
    const seen = new Set<string>();
    let written = 0, settled = 0;
    const failures: string[] = [];
    // Bounded concurrency keeps a full slate under the cron timeout without
    // letting each app installation multiply provider traffic.
    const pending = candidates.filter((r: any) => !finalKeys.has(`${r.date}|${r.game_id}`));
    const worker = async () => {
      while (pending.length) {
        const candidate = pending.shift();
        const key = `${candidate.date}|${candidate.game_id}`;
        try {
          const gameId = Number(candidate.game_id);
          if (!/^\d+$/.test(String(candidate.game_id)) || !Number.isSafeInteger(gameId) || gameId <= 0 ||
              ![today, yesterday].includes(candidate.date) || seen.has(key)) throw new Error('Invalid cache game identity');
          seen.add(key);
          const payload = await getJSON(`https://api.balldontlie.io/mlb/v1/games/${gameId}`, { Authorization: BDL_KEY });
          const game = payload?.data;
          if (game?.id !== gameId || !game.date || Number.isNaN(Date.parse(game.date)) || etDate(new Date(game.date)) !== candidate.date) throw new Error('Provider game/date mismatch');
          const status = normalizeMlbGameStatus(game.status).status;
          if (!['live', 'final'].includes(status)) continue;
          const fetchedAt = new Date().toISOString();
          // The game state is fetched BEFORE stats: a scoreboard transition
          // cannot promote an earlier live box. Reconciliation also prevents
          // a provider's lagging final totals from freezing the wrong grade.
          const normalized = normalizeMlbLiveBatting(game, await gameStats(gameId));
          if (!normalized.lines.length) continue;
          const isFinal = status === 'final' && normalized.complete;
          const row = { p_date: candidate.date, p_game_id: String(gameId), p_is_final: isFinal,
            p_fetched_at: fetchedAt, p_lines: normalized.lines };
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/publish_mlb_live_batting`, {
            method: 'POST', headers, body: JSON.stringify(row), signal: AbortSignal.timeout(12_000),
          });
          if (!response.ok) throw new Error(`Cache write HTTP ${response.status}`);
          const accepted = await response.json();
          if (typeof accepted !== 'boolean') throw new Error('Invalid cache publication receipt');
          if (accepted) { written++; if (isFinal) settled++; }
        } catch (error) { failures.push(`${key}: ${error instanceof Error ? error.message : 'refresh failed'}`); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
    return Response.json({ ok: !failures.length, written, settled, failures }, { status: failures.length ? 502 : 200 });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Refresh failed' }, { status: 502 });
  }
});
