/**
 * Decode the documented BDL collection envelope.
 *
 * HTTP success is not data success: a proxy/login/error object returned with a
 * 2xx must fail the run instead of becoming a cacheable empty array. The one
 * valid empty response is an envelope whose `data` field is explicitly `[]`.
 */
export function decodeBdlRows(payload, label = 'BDL response') {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
    throw new Error(`${label}: invalid response shape (expected { data: [] })`);
  }
  return payload.data;
}

/** The SDK sometimes unwraps the envelope and sometimes leaves it nested. */
export function decodeBdlSdkRows(response, label = 'BDL SDK response') {
  if (Array.isArray(response?.data)) return response.data;
  if (response?.data && typeof response.data === 'object' && Array.isArray(response.data.data)) {
    return response.data.data;
  }
  throw new Error(`${label}: invalid response shape (expected a data array)`);
}

/** Decode the SDK's single-resource response without accepting a missing body as null. */
export function decodeBdlSdkItem(response, label = 'BDL SDK response') {
  if (!response || typeof response !== 'object' || !Object.hasOwn(response, 'data')) {
    throw new Error(`${label}: invalid response shape (expected a data item)`);
  }

  const outer = response.data;
  const item = outer && typeof outer === 'object' && !Array.isArray(outer)
    && Object.hasOwn(outer, 'data')
    ? outer.data
    : outer;

  if (item === null) return null;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`${label}: invalid response shape (expected a data item)`);
  }
  return item;
}
