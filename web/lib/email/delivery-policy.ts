export interface ProviderErrorLike {
  name?: unknown;
  statusCode?: unknown;
}

export interface ProviderAttemptResponse {
  data: { id?: unknown } | null;
  error: ProviderErrorLike | null;
}

export type ProviderSendOutcome =
  | { status: 'sent'; providerId: string }
  | { status: 'skipped'; errorCode: string }
  | { status: 'request_failed'; errorCode: string }
  | { status: 'provider_failed'; errorCode: string };

const TRANSIENT_ERROR_NAMES = new Set([
  'rate_limit_exceeded',
  'concurrent_idempotent_requests',
]);

export function providerErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
    return error.name.slice(0, 100);
  }
  return 'provider_request_error';
}

/** Keep retries deliberately narrow. Resend's SDK represents transport
 * failures as application_error with a null status; explicit 5xx responses
 * and the two documented concurrency/rate-limit codes are also transient. */
export function isRetriableProviderError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
  const status = 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : 'statusCode' in error && error.statusCode === null
      ? null
      : undefined;

  return TRANSIENT_ERROR_NAMES.has(name)
    || (typeof status === 'number' && status >= 500 && status <= 599)
    || (name === 'application_error' && status === null);
}

export async function runProviderSendAttempts(input: {
  idempotencyKey: string;
  reserveSlot: () => Promise<{ granted: boolean; waitMs: number }>;
  wait: (milliseconds: number) => Promise<void>;
  isEligible: () => Promise<boolean>;
  send: (idempotencyKey: string) => Promise<ProviderAttemptResponse>;
  onRetry?: (input: { attempt: number; code: string }) => void;
  maxAttempts?: number;
}): Promise<ProviderSendOutcome> {
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? 3, 3));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let slot: { granted: boolean; waitMs: number };
    try {
      slot = await input.reserveSlot();
    } catch {
      return { status: 'request_failed', errorCode: 'provider_slot_reservation_failed' };
    }
    if (!slot.granted) {
      return { status: 'request_failed', errorCode: 'provider_slot_unavailable' };
    }

    const slotWait = Number.isFinite(slot.waitMs) ? Math.max(0, Math.min(slot.waitMs, 30_000)) : 0;
    if (slotWait > 0) await input.wait(slotWait);

    // This must remain immediately after the distributed slot wait. It closes
    // the normal unsubscribe/suppression window before each provider attempt.
    let eligible: boolean;
    try {
      eligible = await input.isEligible();
    } catch {
      return { status: 'request_failed', errorCode: 'eligibility_check_failed' };
    }
    if (!eligible) return { status: 'skipped', errorCode: 'subscription_ineligible' };

    let response: ProviderAttemptResponse;
    try {
      response = await input.send(input.idempotencyKey);
    } catch (error) {
      const code = providerErrorCode(error);
      if (isRetriableProviderError(error) && attempt < maxAttempts) {
        input.onRetry?.({ attempt, code });
        await input.wait(attempt * 1_000);
        continue;
      }
      // A thrown request has no authoritative provider rejection. Whether it
      // was transient or not, keep it reclaimable instead of marking final.
      return { status: 'request_failed', errorCode: code };
    }

    if (response.error) {
      const code = providerErrorCode(response.error);
      if (isRetriableProviderError(response.error) && attempt < maxAttempts) {
        input.onRetry?.({ attempt, code });
        await input.wait(attempt * 1_000);
        continue;
      }
      return isRetriableProviderError(response.error)
        ? { status: 'request_failed', errorCode: code }
        : { status: 'provider_failed', errorCode: code };
    }

    const providerId = typeof response.data?.id === 'string' ? response.data.id.trim() : '';
    if (!providerId) {
      return { status: 'request_failed', errorCode: 'provider_response_invalid' };
    }
    return { status: 'sent', providerId };
  }

  return { status: 'request_failed', errorCode: 'provider_attempts_exhausted' };
}
