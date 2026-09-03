import { unsubscribeEmailSubscription } from '@/lib/email/store';
import { isSubscriptionId, isUnsubscribeToken, unsubscribeTokenHash } from '@/lib/email/tokens';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const token = url.searchParams.get('token') ?? '';

  if (!isSubscriptionId(id) || !isUnsubscribeToken(token)) {
    return Response.json({ error: 'invalid_unsubscribe_token' }, { status: 400 });
  }

  try {
    const unsubscribed = await unsubscribeEmailSubscription(id, unsubscribeTokenHash(token));
    if (!unsubscribed) {
      return Response.json({ error: 'invalid_unsubscribe_token' }, { status: 400 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(JSON.stringify({ event: 'email_one_click_unsubscribe_failed', code: error instanceof Error ? error.name : 'unknown' }));
    return Response.json({ error: 'unsubscribe_unavailable' }, { status: 503 });
  }
}
