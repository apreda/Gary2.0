import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SITE_ORIGIN } from './config';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSubscriptionId(value: string): boolean {
  return UUID_RE.test(value);
}

export function signUnsubscribeToken(id: string, secret: string): string {
  return createHmac('sha256', secret).update(`gary-email-unsubscribe:${id}`).digest('base64url');
}

export function isUnsubscribeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function unsubscribeTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function unsubscribePageUrl(id: string, secret: string): string {
  const params = new URLSearchParams({ id, token: signUnsubscribeToken(id, secret) });
  return `${SITE_ORIGIN}/email/unsubscribe?${params}`;
}

export function unsubscribeApiUrl(id: string, secret: string): string {
  const params = new URLSearchParams({ id, token: signUnsubscribeToken(id, secret) });
  return `${SITE_ORIGIN}/api/email/unsubscribe?${params}`;
}

export function createConfirmationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isConfirmationToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function confirmationTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function confirmationPageUrl(id: string, token: string): string {
  const params = new URLSearchParams({ id, token });
  return `${SITE_ORIGIN}/email/confirm?${params}`;
}

export function signConfirmationReceipt(
  id: string,
  cadence: string,
  source: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`gary-email-confirmed:${id}:${cadence}:${source}`)
    .digest('base64url');
}

export function verifyConfirmationReceipt(
  id: string,
  cadence: string,
  source: string,
  receipt: string,
  secret: string,
): boolean {
  if (!isSubscriptionId(id) || receipt.length < 20 || receipt.length > 128) return false;
  const expected = Buffer.from(signConfirmationReceipt(id, cadence, source, secret));
  const received = Buffer.from(receipt);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function signupRateFingerprint(ip: string, secret: string): string {
  return createHmac('sha256', secret)
    // Do not include User-Agent: it is attacker-controlled and would let one
    // address evade the quota by rotating header strings.
    .update(`gary-email-rate:${ip.slice(0, 80)}`)
    .digest('hex');
}
