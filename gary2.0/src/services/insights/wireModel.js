import { codexCliWebSearch } from '../agentic/orchestrator/providerAdapters/codexCliSession.js';
import { anthropicWebSearchRaw } from '../agentic/scoutReport/shared/anthropicWebSearch.js';
import { requestSignal, withRequestSignal } from '../agentic/orchestrator/requestCancellation.js';

// Only URLs carried in provider result objects count as observed citations.
// Never mine the model's final prose/JSON string for invented source links.
export function observedWebUrls(raw) {
  const urls = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.url === 'string' && /^https?:\/\//.test(value.url)) urls.add(value.url);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  };
  if (typeof raw === 'string') {
    for (const line of raw.split('\n')) { try { visit(JSON.parse(line)); } catch { /* not a JSONL event */ } }
  } else visit(raw);
  return [...urls];
}

export function supportedWireSources(item, observed) {
  const allowed = new Set(observed);
  return [...new Set((Array.isArray(item?.sources) ? item.sources : []).filter(url => typeof url === 'string' && allowed.has(url)))];
}

// Receipts are supplied by the host, never accepted from the generated item.
// The current Wire input has no verified total-price receipts; a web summary
// of an "opener" cannot substitute for dated observations at the same book.
export function verifiedWireMovement(item, { receipts = [], date } = {}) {
  const claim = item?.market_evidence;
  if (!claim || !date) return null;
  const first = receipts.find(row => String(row.id) === String(claim.first_receipt_id));
  const last = receipts.find(row => String(row.id) === String(claim.current_receipt_id));
  const fields = new Set(['moneyline_home', 'moneyline_away', 'spread_home', 'spread_away', 'total']);
  if (!first || !last || !fields.has(claim.market) || !first.line_vendor || first.line_vendor !== last.line_vendor
    || first.game_date !== date || last.game_date !== date || first.sport !== last.sport
    || first.game_id == null || String(first.game_id) !== String(last.game_id)
    || !Number.isFinite(Date.parse(first.seen_at)) || !Number.isFinite(Date.parse(last.seen_at))
    || Date.parse(first.seen_at) >= Date.parse(last.seen_at)) return null;
  const before = first[claim.market], after = last[claim.market];
  if (before == null || after == null || !Number.isFinite(Number(before)) || !Number.isFinite(Number(after))
    || Number(before) === Number(after) || Number(claim.first_value) !== Number(before) || Number(claim.current_value) !== Number(after)) return null;
  return { first_receipt_id: first.id, current_receipt_id: last.id, market: claim.market, first_value: Number(before), current_value: Number(after), line_vendor: first.line_vendor, first_seen_at: first.seen_at, current_seen_at: last.seen_at };
}

/** Same grounded Wire prompt and validation. Use the app's existing Codex
 * subscription search transport, with a bounded native web-search fallback.
 * No Claude CLI call: that retired transport was consuming the entire stage.
 */
export async function callWireModel(prompt, {
  bridgeTimeoutMs = 90_000, timeoutMs = bridgeTimeoutMs + 10_000,
  model = process.env.GARY_WIRE_MODEL || process.env.GARY_GROUNDING_CODEX_MODEL || 'gpt-5.6-sol', signal,
} = {}) {
  const external = requestSignal(signal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Wire grounded call deadline exceeded')), Math.max(1, timeoutMs));
  const combined = requestSignal(external, controller.signal);
  try {
    return await withRequestSignal(combined, async () => {
      combined.throwIfAborted();
      const primary = await codexCliWebSearch(prompt, { model: model.replace(/^codex-/, ''), timeoutMs: Math.min(bridgeTimeoutMs, timeoutMs), signal: combined });
      combined.throwIfAborted();
      if (primary.success && primary.data) return { text: primary.data, provider: `codex-${model.replace(/^codex-/, '')}`, sourceUrls: observedWebUrls(primary.raw) };
      console.warn(`   [Wire] Codex grounded search unavailable: ${String(primary.error || 'empty output').slice(0, 200)}`);
      const fallback = await anthropicWebSearchRaw(prompt, { maxTokens: 6000, signal: combined });
      combined.throwIfAborted();
      if (fallback.success && fallback.data) return { text: fallback.data, provider: 'anthropic-web-search', sourceUrls: observedWebUrls(fallback.raw) };
      throw new Error(`Wire grounded providers unavailable: ${primary.error || 'empty Codex output'}; ${fallback.error || 'empty API output'}`);
    });
  } finally { clearTimeout(timer); }
}
