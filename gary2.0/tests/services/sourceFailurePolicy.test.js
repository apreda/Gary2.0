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

  it('never treats schema/config wording as an external outage', () => {
    const error = new Error('network schema timeout: missing API key');
    expect(isTransientExternalSourceError(error)).toBe(false);
    expect(sourceFailure('NFL', error)).toMatchObject({
      kind: 'internal',
      transient_external: false,
    });
  });
});
