import { describe, expect, it } from 'vitest';
import {
  isRetriableProviderError,
  runProviderSendAttempts,
  type ProviderAttemptResponse,
} from '@/lib/email/delivery-policy';

function rejected(name: string, statusCode: number | null): ProviderAttemptResponse {
  return { data: null, error: { name, statusCode } };
}

describe('email provider retry policy', () => {
  it('retries only the explicit transient conditions', () => {
    expect(isRetriableProviderError({ name: 'application_error', statusCode: null })).toBe(true);
    expect(isRetriableProviderError({ name: 'internal_server_error', statusCode: 500 })).toBe(true);
    expect(isRetriableProviderError({ name: 'validation_error', statusCode: 503 })).toBe(true);
    expect(isRetriableProviderError({ name: 'rate_limit_exceeded', statusCode: 429 })).toBe(true);
    expect(isRetriableProviderError({ name: 'concurrent_idempotent_requests', statusCode: 409 })).toBe(true);

    expect(isRetriableProviderError({ name: 'application_error', statusCode: 400 })).toBe(false);
    expect(isRetriableProviderError({ name: 'application_error' })).toBe(false);
    expect(isRetriableProviderError({ name: 'daily_quota_exceeded', statusCode: 429 })).toBe(false);
    expect(isRetriableProviderError({ name: 'monthly_quota_exceeded', statusCode: null })).toBe(false);
    expect(isRetriableProviderError(new Error('socket closed'))).toBe(false);
  });

  it('takes a distributed slot and rechecks eligibility before every retry', async () => {
    const order: string[] = [];
    const keys: string[] = [];
    let attempts = 0;
    let slots = 0;

    const outcome = await runProviderSendAttempts({
      idempotencyKey: 'gary-stable-key',
      reserveSlot: async () => {
        slots += 1;
        order.push(`slot:${slots}`);
        return { granted: true, waitMs: 7 };
      },
      wait: async milliseconds => {
        order.push(`wait:${milliseconds}`);
      },
      isEligible: async () => {
        order.push('eligible');
        return true;
      },
      send: async key => {
        keys.push(key);
        attempts += 1;
        order.push(`send:${attempts}`);
        return attempts < 3
          ? rejected('rate_limit_exceeded', 429)
          : { data: { id: 'provider-123' }, error: null };
      },
      onRetry: ({ attempt }) => order.push(`retry:${attempt}`),
    });

    expect(outcome).toEqual({ status: 'sent', providerId: 'provider-123' });
    expect(keys).toEqual(['gary-stable-key', 'gary-stable-key', 'gary-stable-key']);
    expect(order).toEqual([
      'slot:1', 'wait:7', 'eligible', 'send:1', 'retry:1', 'wait:1000',
      'slot:2', 'wait:7', 'eligible', 'send:2', 'retry:2', 'wait:2000',
      'slot:3', 'wait:7', 'eligible', 'send:3',
    ]);
  });

  it('marks an explicit provider rejection final without retrying', async () => {
    let sends = 0;
    const outcome = await runProviderSendAttempts({
      idempotencyKey: 'gary-key',
      reserveSlot: async () => ({ granted: true, waitMs: 0 }),
      wait: async () => {},
      isEligible: async () => true,
      send: async () => {
        sends += 1;
        return rejected('daily_quota_exceeded', 429);
      },
    });

    expect(sends).toBe(1);
    expect(outcome).toEqual({ status: 'provider_failed', errorCode: 'daily_quota_exceeded' });
  });

  it('keeps exhausted transient and uncertain thrown requests reclaimable', async () => {
    let transientSends = 0;
    const exhausted = await runProviderSendAttempts({
      idempotencyKey: 'gary-key',
      reserveSlot: async () => ({ granted: true, waitMs: 0 }),
      wait: async () => {},
      isEligible: async () => true,
      send: async () => {
        transientSends += 1;
        return rejected('application_error', null);
      },
    });
    expect(transientSends).toBe(3);
    expect(exhausted).toEqual({ status: 'request_failed', errorCode: 'application_error' });

    let thrownSends = 0;
    const uncertain = await runProviderSendAttempts({
      idempotencyKey: 'gary-key',
      reserveSlot: async () => ({ granted: true, waitMs: 0 }),
      wait: async () => {},
      isEligible: async () => true,
      send: async () => {
        thrownSends += 1;
        throw new Error('socket closed');
      },
    });
    expect(thrownSends).toBe(1);
    expect(uncertain).toEqual({ status: 'request_failed', errorCode: 'Error' });
  });

  it('stops after a queued unsubscribe and does not make the next provider call', async () => {
    let eligibilityChecks = 0;
    let sends = 0;
    let slots = 0;
    const outcome = await runProviderSendAttempts({
      idempotencyKey: 'gary-key',
      reserveSlot: async () => {
        slots += 1;
        return { granted: true, waitMs: 1 };
      },
      wait: async () => {},
      isEligible: async () => {
        eligibilityChecks += 1;
        return eligibilityChecks === 1;
      },
      send: async () => {
        sends += 1;
        return rejected('concurrent_idempotent_requests', 409);
      },
    });

    expect(outcome).toEqual({ status: 'skipped', errorCode: 'subscription_ineligible' });
    expect({ slots, eligibilityChecks, sends }).toEqual({ slots: 2, eligibilityChecks: 2, sends: 1 });
  });

  it('does not send when the distributed slot cannot be reserved', async () => {
    let checked = false;
    let sent = false;
    const outcome = await runProviderSendAttempts({
      idempotencyKey: 'gary-key',
      reserveSlot: async () => ({ granted: false, waitMs: 20_000 }),
      wait: async () => {},
      isEligible: async () => {
        checked = true;
        return true;
      },
      send: async () => {
        sent = true;
        return { data: { id: 'should-not-send' }, error: null };
      },
    });

    expect(outcome).toEqual({ status: 'request_failed', errorCode: 'provider_slot_unavailable' });
    expect({ checked, sent }).toEqual({ checked: false, sent: false });
  });
});
