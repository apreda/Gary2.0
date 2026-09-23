import { retrievedSearchRecords } from '../agentic/searchTrace.js';
import { subscriptionSearch } from '../agentic/orchestrator/subscriptionSearch.js';
import { requestSignal, withRequestSignal } from '../agentic/orchestrator/requestCancellation.js';

// Only URLs carried in provider result objects count as observed citations.
// Never mine the model's final prose/JSON string for invented source links.
export function observedWebUrls(raw) {
  const urls = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    // The installed Codex CLI exposes native opens as a completed web_search
    // event whose query is the exact URL and action is "other". Search result
    // lists are omitted. Count the tool event, never URLs in generated text.
    if (value.type === 'item.completed' && value.item?.type === 'web_search'
      && value.item.action?.type === 'other' && /^https?:\/\/\S+$/.test(value.item.query || '')) {
      urls.add(value.item.query);
    }
    if (typeof value.url === 'string' && /^https?:\/\//.test(value.url)) urls.add(value.url);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  };
  for (const record of retrievedSearchRecords(raw)) {
    visit(record);
    // Claude tool results can carry Markdown sources as text. This text is a
    // provider result block, never the assistant's generated answer.
    if (record.type === 'tool_result') {
      const text = typeof record.content === 'string' ? record.content : JSON.stringify(record.content || []);
      for (const match of text.matchAll(/https?:\/\/[^\s<>"\\)\]]+/g)) urls.add(match[0]);
    }
  }
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

/** Grounded Wire retrieval shares the bounded subscription account cascade. */
export async function callWireModel(prompt, {
  bridgeTimeoutMs = 90_000, timeoutMs = bridgeTimeoutMs + 10_000,
  model = process.env.GARY_WIRE_MODEL || process.env.GARY_GROUNDING_CODEX_MODEL || 'gpt-5.6-sol', signal,
  hasRecapContext = false,
} = {}) {
  const external = requestSignal(signal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Wire grounded call deadline exceeded')), Math.max(1, timeoutMs));
  const combined = requestSignal(external, controller.signal);
  try {
    return await withRequestSignal(combined, async () => {
      combined.throwIfAborted();
      const sourcePrompt = `${prompt}\n\n${hasRecapContext ? 'Game moments may use the supplied verified recap notes without a web search. ' : ''}Source capture requirement: before the final answer, open each public source you cite using the native web browser with its exact HTTPS URL, not a search reference ID. Only cite pages you successfully read. Search snippets alone are insufficient. Preserve the requested final JSON format. Do not use shell or command tools.`;
      // The runner already checks moments against supplied recap notes and
      // requires captured URLs for outside news. No extra search is needed
      // when the completed answer uses only those supplied game facts.
      // Heavy tier: Opus writes the Wire (app-visible copy), its GPT model behind.
      const result = await subscriptionSearch(sourcePrompt, { model, tier: 'heavy', timeoutMs, primaryTimeoutMs: bridgeTimeoutMs, signal: combined, requireRetrieval: !hasRecapContext });
      combined.throwIfAborted();
      if (!result.success) throw new Error(`Wire source retrieval failed: ${result.error}`);
      return { text: result.data, provider: result.transport, sourceUrls: observedWebUrls(result.raw) };
    });
  } finally { clearTimeout(timer); }
}
