// Founder policy: xERA is excluded throughout Gary, including optional feeds
// and generated commentary. Actual ERA and other permitted measurements remain.
export function isXeraKey(key) {
  const normalized = String(key).replace(/[^a-z]/gi, '').toLowerCase();
  return normalized.includes('xera') || ['estera', 'expectedera', 'expectedearnedrunaverage'].includes(normalized);
}

export function stripXeraFields(value) {
  if (Array.isArray(value)) return value.map(stripXeraFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !isXeraKey(key))
    .map(([key, item]) => [key, stripXeraFields(item)]));
}

export function hasXeraAnalysis(value) {
  if (typeof value === 'string') return /\bx[\s_-]*era\b|\bexpected[\s-]+(?:era|earned[\s-]+run[\s-]+average)\b/i.test(value);
  if (Array.isArray(value)) return value.some(hasXeraAnalysis);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => (isXeraKey(key) && item != null) || hasXeraAnalysis(item));
}
