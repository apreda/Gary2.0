export function safeJsonParse(payload, fallback = null) {
  if (payload == null) return fallback;
  if (typeof payload === 'object') return payload;
  try {
    const trimmed = String(payload).trim();
    if (!trimmed) return fallback;
    let candidate = trimmed;
    if (candidate.startsWith('```')) {
      candidate = candidate.replace(/^```json\s*/i, '').replace(/^```/i, '').replace(/```\s*$/i, '').trim();
    }
    return JSON.parse(candidate);
  } catch (error) {
    console.warn('[Agentic] Failed to parse JSON payload:', error.message);
    return fallback;
  }
}

export const prettyJson = (data) => JSON.stringify(data, null, 2);

export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

