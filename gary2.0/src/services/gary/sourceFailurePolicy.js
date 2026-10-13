const TRANSIENT_EXTERNAL_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * Only structured transport evidence qualifies a failed league for last-good
 * preservation. Schema, configuration, identity, and other internal errors
 * intentionally remain non-transient even when their message contains words
 * such as "network" or "timeout".
 */
export function isTransientExternalSourceError(error) {
  const status = Number(error?.response?.status ?? error?.status);
  if (status === 429 || (status >= 500 && status <= 599)) return true;

  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (TRANSIENT_EXTERNAL_CODES.has(code)) return true;

  return error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || error?.cause?.name === 'AbortError'
    || error?.cause?.name === 'TimeoutError';
}

export function sourceFailure(league, error) {
  const transientExternal = isTransientExternalSourceError(error);
  return {
    league,
    error: error?.message || String(error),
    kind: transientExternal ? 'transient_external' : 'internal',
    transient_external: transientExternal,
  };
}
