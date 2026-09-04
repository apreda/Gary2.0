import { describe, expect, it } from 'vitest';
import {
  isTransientExternalSourceError,
  sourceFailure,
} from '../../src/services/sourceFailurePolicy.js';

describe('source failure classification', () => {
  it.each([429, 500, 503, 599])('accepts structured HTTP %i as transient external', (status) => {
    expect(isTransientExternalSourceError({ response: { status } })).toBe(true);
  });

  it.each(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'])(
    'accepts structured transport code %s as transient external',
    (code) => expect(isTransientExternalSourceError({ code })).toBe(true),
  );

  it.each(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'])(
    'recognizes %s directly and as the cause of a failed fetch',
    (code) => {
      const cause = Object.assign(new Error('provider timed out'), { code });
      expect(isTransientExternalSourceError(cause)).toBe(true);
      expect(sourceFailure('NFL', new TypeError('fetch failed', { cause }))).toEqual({
        league: 'NFL',
        error: 'fetch failed',
        kind: 'transient_external',
        transient_external: true,
      });
    },
  );

  it('never treats schema/config wording as an external outage', () => {
    const error = new Error('network schema timeout: missing API key');
    expect(isTransientExternalSourceError(error)).toBe(false);
    expect(sourceFailure('NFL', error)).toMatchObject({
      kind: 'internal',
      transient_external: false,
    });
  });
});
