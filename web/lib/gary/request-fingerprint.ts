import 'server-only';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

function analyticsSecret(): string {
  const value = process.env.WEB_ANALYTICS_HMAC_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error('Website analytics server secret is not configured');
  return value;
}

function clientAddress(request: Request): string {
  // Vercel overwrites x-vercel-forwarded-for at its edge to prevent client IP
  // spoofing. Outside Vercel, use the last proxy-appended XFF value; invalid or
  // missing values intentionally collapse into one conservative shared bucket.
  const vercelAddress = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  const forwardedAddress = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  const candidate = process.env.VERCEL === '1'
    ? vercelAddress
    : (request.headers.get('x-real-ip')?.trim() || forwardedAddress);
  return candidate && isIP(candidate) ? candidate : 'unknown';
}

/**
 * Daily-rotating, one-way request key used only for ingress rate limiting.
 * Raw addresses never leave the server and the key cannot track across days.
 */
export function requestRateFingerprint(request: Request): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHmac('sha256', analyticsSecret())
    .update(`gary-web-rate-v2\n${day}\n${clientAddress(request)}`)
    .digest('hex');
}
