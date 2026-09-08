// Publish only the additive judgment envelope. The database merges that field
// under a row lock so other metadata, original prose and grading stay intact.
import { hubJudgmentSourceKey } from '../../src/services/insights/hubJudgment.js';

const id = value => value == null || String(value).trim() === '' ? null : String(value);
const isoMs = value => typeof value === 'string' && value.includes('T') ? Date.parse(value) : NaN;
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const validStatuses = new Set(['ready', 'context_changed', 'context_unavailable', 'superseded']);
const observationFields = ['computed_as_of', 'source_collected_at'];

// These clocks describe the collector observation, not the later insert or
// voice rewrite. Missing legacy clocks remain usable; a present malformed clock
// cannot verify the observation predates the argument.
function sourceObservedAfter(row, asOf) {
  return observationFields.some(field => {
    const value = row.meta?.[field];
    if (value == null) return false;
    const observed = isoMs(value);
    return !Number.isFinite(observed) || observed > asOf;
  });
}

function citedSourceKeys(judgment) {
  const references = new Set([...(judgment.supporting_evidence_ids || []), ...(judgment.counter_evidence_ids || [])]);
  return new Set([judgment.primary_source_key, ...(judgment.evidence || [])
    .filter(item => references.has(item?.id)).map(item => item.source_key).filter(Boolean)]);
}

/** Ordinary content repair retains its own fields, but cannot replace a newer
 * judgment. Keep this CAS small: a full evidence envelope exceeds URL limits.
 * Publication forbids conflicting equal-clock revisions, so clock plus input
 * fingerprint identifies the exact judgment revision read by the repair. */
export function hubJudgmentRevisionFilter(meta) {
  const judgment = meta?.judgment;
  // Text extraction treats both absent and explicit JSON null as SQL NULL.
  if (judgment == null) return { 'meta->>judgment': 'is.null' };
  if (!Number.isFinite(isoMs(judgment.as_of)) || !/^[a-f0-9]{64}$/.test(judgment.input_fingerprint || '')) {
    throw new Error('Cannot safely repair a malformed Hub judgment revision');
  }
  return { 'meta->judgment->>as_of': `eq.${judgment.as_of}`,
    'meta->judgment->>input_fingerprint': `eq.${judgment.input_fingerprint}` };
}

function partition(date, league) {
  const key = String(league || '').toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !['MLB', 'NFL', 'NCAAF', 'NBA'].includes(key)) {
    throw new Error('Hub judgment publication requires a supported dated league');
  }
  return key;
}

/** Cursor until an empty page: an API page cap smaller than our requested
 * limit must not turn a partial read into a falsely complete snapshot. */
export async function readHubJudgmentRows({ client, url, headers = {}, date, league,
  pageSize = 500, maxRows = 20_000, signal } = {}) {
  const key = partition(date, league);
  const rows = [];
  let cursor = '0';
  for (let page = 0; page < 100; page++) {
    signal?.throwIfAborted();
    const { data } = await client({ method: 'GET', url, headers, signal, timeout: 20_000,
      params: { date: `eq.${date}`, league: `eq.${key}`,
        select: 'id,date,league,category,headline,detail,game,value,spark,line_val,player_id,team_id,game_id,meta,created_at,updated_at',
        order: 'id.asc', id: `gt.${cursor}`, limit: pageSize } });
    if (!Array.isArray(data)) throw new Error('Hub judgment snapshot is not a row array');
    if (!data.length) return rows;
    for (const row of data) {
      if (!/^\d+$/.test(String(row?.id)) || BigInt(row.id) <= BigInt(cursor)
          || row.date !== date || row.league !== key) {
        throw new Error('Hub judgment snapshot has invalid identity or ordering');
      }
      rows.push(row); cursor = String(row.id);
      if (rows.length > maxRows) throw new Error('Hub judgment snapshot exceeded its row budget');
    }
  }
  throw new Error('Hub judgment snapshot exceeded its page budget');
}

export function hubJudgmentPublication(row, judgment, { date, league, now = new Date().toISOString() } = {}) {
  const key = partition(date, league);
  if (!row || row.date !== date || row.league !== key || !id(row.id) || !id(row.game_id)) return null;
  if (judgment?.schema_version !== 1 || !validStatuses.has(judgment.status)
      || judgment.date !== date || String(judgment.league || '').toUpperCase() !== key
      || id(judgment.game_id) !== id(row.game_id)
      || judgment.primary_source_key !== hubJudgmentSourceKey(row)
      || typeof judgment.input_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(judgment.input_fingerprint)) return null;
  const asOf = isoMs(judgment.as_of), until = isoMs(judgment.valid_until), at = isoMs(now);
  if (![asOf, until, at].every(Number.isFinite) || asOf > at + 60_000) return null;
  if (judgment.status === 'ready' ? until <= at || until <= asOf : until > asOf) return null;
  if (judgment.status === 'ready' && sourceObservedAfter(row, asOf)) return null;
  const previous = row.meta?.judgment;
  if (judgment.status !== 'ready' && !previous) return null;
  const previousAsOf = isoMs(previous?.as_of);
  if (Number.isFinite(previousAsOf) && (previousAsOf > asOf || (previousAsOf === asOf && !same(previous, judgment)))) return null;
  return { p_row_id: row.id, p_date: date, p_league: key, p_category: row.category,
    p_game_id: id(row.game_id), p_player_id: id(row.player_id), p_team_id: id(row.team_id),
    p_judgment: judgment };
}

/** Re-read after the ordinary runner writes, because volatile lanes can replace
 * primary keys. Source keys keep metadata attached to the exact new row. */
export async function publishHubJudgments({ rows = [], invalidations = [], storedRows,
  client, url, headers = {}, date, league, signal, now = () => new Date().toISOString() } = {}) {
  const key = partition(date, league);
  const updates = new Map();
  const selectUpdate = (source, judgment) => {
    const previous = updates.get(source);
    if (!previous || isoMs(judgment?.as_of) > isoMs(previous.as_of)) updates.set(source, judgment);
  };
  for (const judgment of invalidations) {
    if (judgment?.primary_source_key) selectUpdate(judgment.primary_source_key, judgment);
  }
  for (const row of rows) {
    const judgment = row?.meta?.judgment;
    if (judgment) selectUpdate(hubJudgmentSourceKey(row), judgment);
  }
  const result = { requested: updates.size, published: 0, unchanged: 0, absent: 0, rejected: 0, missing: 0 };
  if (!updates.size) return result;
  const existing = storedRows || await readHubJudgmentRows({ client, url, headers, date, league: key, signal });
  const bySource = new Map();
  for (const row of existing) {
    const source = hubJudgmentSourceKey(row);
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(row);
  }
  const rpc = new URL('rpc/publish_hub_judgment', new URL('./', url)).href;
  for (const [source, judgment] of updates) {
    signal?.throwIfAborted();
    const matches = bySource.get(source) || [];
    if (!matches.length) {
      // A departed volatile source is already withdrawn by its owning writer.
      // A ready case still needs an actual row to anchor the app's navigation.
      if (validStatuses.has(judgment?.status) && judgment.status !== 'ready') result.absent++;
      else result.missing++;
      continue;
    }
    if (judgment.status === 'ready') {
      const cited = citedSourceKeys(judgment);
      // A capped source may never have been stored. Only an observed newer
      // exact source contradicts the analyzed snapshot. The RPC rechecks the
      // locked primary and current cited rows; native selection also checks
      // subsequent source refreshes before displaying or suppressing a read.
      if (existing.some(row => row.date === date && row.league === key
          && id(row.game_id) === id(judgment.game_id) && cited.has(hubJudgmentSourceKey(row))
          && sourceObservedAfter(row, isoMs(judgment.as_of)))) {
        result.rejected += matches.length;
        continue;
      }
    }
    for (const row of matches) {
      const body = hubJudgmentPublication(row, judgment, { date, league: key, now: now() });
      if (!body) { result.rejected++; continue; }
      if (same(row.meta?.judgment, judgment)) { result.unchanged++; continue; }
      const { data } = await client({ method: 'POST', url: rpc, headers,
        data: body, signal, timeout: 20_000 });
      if (data === true) result.published++;
      else if (data === false) result.rejected++;
      else throw new Error('Hub judgment publication returned an invalid receipt');
    }
  }
  return result;
}
