// @ts-check
/**
 * Decode the documented BDL collection envelope.
 *
 * HTTP success is not data success: a proxy/login/error object returned with a
 * 2xx must fail the run instead of becoming a cacheable empty array. The one
 * valid empty response is an envelope whose `data` field is explicitly `[]`.
 * @param {unknown} payload
 * @param {string} [label]
 * @returns {unknown[]} Envelope validation does not validate each row's schema.
 */
export function decodeBdlRows(payload, label = 'BDL response') {
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
    throw new Error(`${label}: invalid response shape (expected { data: [] })`);
  }
  return payload.data;
}

/** The SDK sometimes unwraps the envelope and sometimes leaves it nested.
 * @param {unknown} response
 * @param {string} [label]
 * @returns {unknown[]}
 */
export function decodeBdlSdkRows(response, label = 'BDL SDK response') {
  const envelope = /** @type {{data?: unknown} | null | undefined} */ (response);
  if (Array.isArray(envelope?.data)) return envelope.data;
  if (envelope?.data && typeof envelope.data === 'object'
      && 'data' in envelope.data && Array.isArray(envelope.data.data)) {
    return envelope.data.data;
  }
  throw new Error(`${label}: invalid response shape (expected a data array)`);
}

/** Decode a single-resource envelope; a missing body is not a known null item.
 * @param {unknown} response
 * @param {string} [label]
 * @returns {object | null} The caller still owns resource-specific field validation.
 */
export function decodeBdlSdkItem(response, label = 'BDL SDK response') {
  if (!response || typeof response !== 'object' || !Object.hasOwn(response, 'data')) {
    throw new Error(`${label}: invalid response shape (expected a data item)`);
  }

  const outer = /** @type {Record<string, unknown>} */ (response).data;
  const item = outer && typeof outer === 'object' && !Array.isArray(outer)
    && Object.hasOwn(outer, 'data')
    ? /** @type {Record<string, unknown>} */ (outer).data
    : outer;

  if (item === null) return null;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`${label}: invalid response shape (expected a data item)`);
  }
  return item;
}
