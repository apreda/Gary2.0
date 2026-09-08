import { hasXeraAnalysis } from '../mlbMetricPolicy.js';
// The Fantasy board is one atomic row per publication date and league. This
// module never deletes a prior board and never treats a failed read as empty.

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const fingerprintPattern = /^[a-f0-9]{64}$/;
const isObject = value => value != null && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => typeof value === 'string' ? Date.parse(value) : NaN;

export function fantasyPartition(date, league) {
  const key = String(league || '').toUpperCase();
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!datePattern.test(String(date)) || !Number.isFinite(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== date || !['MLB', 'NFL'].includes(key)) {
    throw new Error('Fantasy publication requires a valid date and MLB/NFL league');
  }
  return { date, league: key };
}

export function validateFantasyPublication(payload) {
  if (!isObject(payload) || payload.schema_version !== 1) throw new Error('Invalid Fantasy briefing envelope');
  const partition = fantasyPartition(payload.date, payload.league);
  if (payload.league !== partition.league || !fingerprintPattern.test(payload.input_fingerprint || '')
      || !isObject(payload.coverage) || payload.coverage.complete !== true
      || !Array.isArray(payload.decisions) || payload.decisions.length > 24) {
    throw new Error('Fantasy publication requires a complete, bounded decision board');
  }
  const generated = timestamp(payload.generated_at);
  const fetched = timestamp(payload.fetched_as_of);
  const expires = timestamp(payload.expires_at);
  if (![generated, fetched, expires].every(Number.isFinite) || generated < fetched || expires <= generated) {
    throw new Error('Invalid Fantasy briefing freshness');
  }
  const players = new Set();
  for (const decision of payload.decisions) {
    const id = String(decision?.player_id ?? '').trim();
    if (!isObject(decision) || !id || players.has(id)
        || ['player_id', 'player_name', 'headline', 'why_now', 'fit', 'risk', 'watch_for']
          .some(key => typeof decision[key] !== 'string' || !decision[key].trim())
        || !['CONSIDER_ADD', 'START', 'HOLD', 'WATCH', 'SIT'].includes(decision.action)
        || !Array.isArray(decision.opportunities) || !Array.isArray(decision.evidence)) {
      throw new Error('Fantasy decisions require one named identity and complete call per player');
    }
    if (hasXeraAnalysis(decision)) throw new Error('xERA is excluded from Fantasy publications');
    players.add(id);
  }
  return payload;
}

export function canReuseFantasyBriefing(stored, { date, league, inputFingerprint, now = new Date(), minRemainingMs = 0 }) {
  if (!stored) return false;
  const partition = fantasyPartition(date, league);
  try { validateFantasyPublication(stored.payload); } catch { return false; }
  return stored.date === partition.date && stored.league === partition.league
    && stored.payload.date === partition.date && stored.payload.league === partition.league
    && stored.input_fingerprint === inputFingerprint
    && stored.payload.input_fingerprint === inputFingerprint
    && timestamp(stored.expires_at) === timestamp(stored.payload.expires_at)
    && timestamp(stored.expires_at) > new Date(now).getTime() + Math.max(0, minRemainingMs);
}

/** Read the app's already-published status reports verbatim. This is conflict
 * context, not an injury ledger: an absent row never establishes clearance. */
export function createFantasyStatusReader({ client, supabaseUrl, readKey, timeoutMs = 20_000 }) {
  if (!client || !supabaseUrl || !readKey) throw new Error('Fantasy status context requires a read connection');
  const base = `${String(supabaseUrl).replace(/\/$/, '')}/rest/v1`;
  const headers = { apikey: readKey, Authorization: `Bearer ${readKey}` };
  return async ({ date, signal }) => {
    fantasyPartition(date, 'MLB');
    const snapshots = [];
    const seen = new Set();
    for (let page = 0; page < 5; page++) {
      signal?.throwIfAborted();
      const { data } = await client({
        method: 'GET', url: `${base}/insight_connections`, headers, timeout: timeoutMs, signal,
        params: {
          date: `eq.${date}`, league: 'eq.MLB', category: 'eq.return_watch',
          select: 'id,date,league,category,player_id,meta,created_at,updated_at',
          order: 'id.asc', limit: 200, offset: page * 200,
        },
      });
      if (!Array.isArray(data) || data.length > 200) throw new Error('Invalid stored Fantasy status response');
      for (const row of data) {
        if (row?.id == null || seen.has(String(row.id)) || row.date !== date || row.league !== 'MLB'
            || row.category !== 'return_watch' || typeof row.player_id !== 'string' || !row.player_id
            || !isObject(row.meta) || !Number.isFinite(timestamp(row.created_at)) || !Number.isFinite(timestamp(row.updated_at))
            || (row.meta.status != null && typeof row.meta.status !== 'string')
            || (row.meta.injury != null && typeof row.meta.injury !== 'string')) {
          throw new Error('Invalid or conflicting stored Fantasy status row');
        }
        seen.add(String(row.id));
        snapshots.push({
          player_id: row.player_id, status: row.meta.status ?? null, injury: row.meta.injury ?? null,
          source: typeof row.meta.source === 'string' ? row.meta.source : 'Gary return_watch (stored report)',
          date: row.date, created_at: row.created_at, updated_at: row.updated_at,
        });
      }
      if (data.length < 200) return snapshots;
    }
    throw new Error('Stored Fantasy status context exceeded its pagination bound');
  };
}

export function createFantasyStorage({ client, supabaseUrl, serviceKey, timeoutMs = 20_000 }) {
  if (!client || !supabaseUrl || !serviceKey) throw new Error('Fantasy storage requires a service-role connection');
  const base = `${String(supabaseUrl).replace(/\/$/, '')}/rest/v1`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  return {
    async load({ date, league, signal }) {
      const partition = fantasyPartition(date, league);
      const { data } = await client({
        method: 'GET', url: `${base}/fantasy_briefings`, headers, timeout: timeoutMs, signal,
        params: {
          date: `eq.${partition.date}`, league: `eq.${partition.league}`,
          select: 'date,league,generated_at,expires_at,fetched_as_of,input_fingerprint,payload', limit: 2,
        },
      });
      if (!Array.isArray(data) || data.length > 1) throw new Error('Invalid Fantasy storage response');
      if (!data.length) return null;
      const row = data[0];
      if (row?.date !== partition.date || row?.league !== partition.league) throw new Error('Fantasy storage returned another partition');
      return row;
    },
    async publish(payload, { signal } = {}) {
      validateFantasyPublication(payload);
      const { data } = await client({
        method: 'POST', url: `${base}/rpc/publish_fantasy_briefing`, headers, timeout: timeoutMs, signal,
        data: {
          p_payload: payload,
          p_fetched_as_of: payload.fetched_as_of,
          p_input_fingerprint: payload.input_fingerprint,
        },
      });
      if (typeof data !== 'boolean') throw new Error('Invalid Fantasy publication receipt');
      return data;
    },
  };
}
