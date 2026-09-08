// Bounded unit repair for current hot/cold research whose recent-window text
// labels a provider at-bat count as plate appearances. The provider's recent
// window carries at_bats only, and the retired fallback printed that count as
// "PA". This relabels the unit from the live provider schema; it never invents
// or changes the count, and it never touches graded or historical rows.
import { recentBattingSample, recentBattingSampleMeta } from '../../src/services/insights/recentBattingSample.js';

const SCOPE = new Set(['heat_check', 'cooling_off']);
const WINDOW = 'last 15 days';
const token = /\b(\d+) (PA|AB)\b/g;

export function recentBattingSampleRepair(row, window, today, repairedAt = new Date().toISOString()) {
  const refuse = reason => ({ patch: null, reason });
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today) || row?.date !== today) return refuse('outside_current_date');
  if (row.league !== 'MLB' || !Object.hasOwn(row, 'result') || row.result !== null || row.graded_at != null) return refuse('outside_ungraded_mlb');
  if (row.generated_by !== 'insights-cli' || !SCOPE.has(row.category) || row.player_id == null
    || typeof row.detail !== 'string' || !row.meta || typeof row.meta !== 'object') return refuse('outside_scope');
  if (row.meta.recent_sample != null) return refuse('already_sealed');
  if (!window || typeof window !== 'object') return refuse('missing_source_window');
  if (String(window.split_name || '').trim().toLowerCase() !== WINDOW) return refuse('window_mismatch');
  // The window sample is the first count token; a later "across N AB" is the
  // vs-hand split from another provider bucket and keeps its own true unit.
  const tokens = [...row.detail.matchAll(token)];
  const extra = tokens.slice(1).filter(match => !(match[2] === 'AB' && row.detail.slice(0, match.index).endsWith('across ')));
  if (tokens.length === 0 || extra.length) return refuse('no_single_sample_token');
  const [, countText, unit] = tokens[0];
  const count = Number(countText);
  const source = recentBattingSample(window, { minPA: 0, minAB: 0 });
  if (!source) return refuse('missing_source_window');
  if (unit === source.unit) return refuse(count === source.count ? 'already_correct' : 'count_disagrees_with_source');
  if (source.unit !== 'AB') return refuse('count_disagrees_with_source');
  const verification = count === source.count ? 'count_and_unit' : 'unit_schema';
  const relabel = text => { let done = false; return typeof text === 'string'
    ? text.replace(token, (whole, n, u) => { if (done || n !== countText || u !== unit) return whole; done = true; return `${n} ${source.unit}`; }) : text; };
  const detail = relabel(row.detail);
  const meta = { ...row.meta, read: detail, evidence: detail,
    ...(typeof row.meta.computed_detail === 'string' ? { computed_detail: relabel(row.meta.computed_detail) } : {}),
    ...recentBattingSampleMeta({ count, unit: source.unit, field: source.field }, window.split_name),
    recent_sample_repair: { from_unit: unit, source_count_now: source.count, verification, repaired_at: repairedAt } };
  return { patch: { detail, meta }, reason: verification };
}
