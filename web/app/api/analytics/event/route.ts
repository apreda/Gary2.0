import { isSameOriginAnalyticsRequest, parseWebEventPayload } from '@/lib/gary/analytics-schema';
import { storeWebEvent } from '@/lib/gary/growth-ingest';
import { hasGrantedAnalyticsCookie } from '@/lib/gary/link-attribution';
import { requestRateFingerprint } from '@/lib/gary/request-fingerprint';

export const runtime = 'nodejs';

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

export async function POST(request: Request) {
  if (
    !isSameOriginAnalyticsRequest(request) ||
    !hasGrantedAnalyticsCookie(request.headers.get('cookie'))
  ) {
    return Response.json({ error: 'forbidden' }, { status: 403, headers: RESPONSE_HEADERS });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return Response.json({ error: 'invalid_event' }, { status: 413, headers: RESPONSE_HEADERS });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 8192) throw new Error('payload too large');
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'invalid_event' }, { status: 400, headers: RESPONSE_HEADERS });
  }

  const event = parseWebEventPayload(body);
  if (!event) {
    return Response.json({ error: 'invalid_event' }, { status: 400, headers: RESPONSE_HEADERS });
  }

  try {
    const accepted = await storeWebEvent(event, requestRateFingerprint(request));
    if (!accepted) {
      return Response.json({ error: 'rate_limited' }, { status: 429, headers: RESPONSE_HEADERS });
    }
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'web_analytics_ingest_failed',
      code: error instanceof Error ? error.name : 'unknown',
    }));
    return Response.json({ error: 'unavailable' }, { status: 503, headers: RESPONSE_HEADERS });
  }
}
