import { Resend } from 'resend';
import { recordEmailProviderEvent } from '@/lib/email/store';

export const runtime = 'nodejs';

const HANDLED_EVENTS = new Set([
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
]);
const GARY_CAMPAIGN_TAGS = new Set(['confirmation', 'daily-board', 'weekly-record']);

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    console.error(JSON.stringify({ event: 'resend_webhook_unconfigured' }));
    return Response.json({ error: 'webhook_unavailable' }, { status: 503 });
  }

  const payload = await request.text();
  const svixId = request.headers.get('svix-id') ?? '';
  let event: ReturnType<Resend['webhooks']['verify']>;
  try {
    event = new Resend(apiKey).webhooks.verify({
      payload,
      headers: {
        id: svixId,
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
      webhookSecret,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'resend_webhook_rejected', code: error instanceof Error ? error.name : 'unknown' }));
    return Response.json({ error: 'invalid_webhook' }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type) || !('email_id' in event.data)) {
    return new Response(null, { status: 204 });
  }

  try {
    const rawCampaignTag = 'tags' in event.data ? event.data.tags?.campaign : undefined;
    const campaignTag = typeof rawCampaignTag === 'string' && GARY_CAMPAIGN_TAGS.has(rawCampaignTag)
      ? rawCampaignTag as 'confirmation' | 'daily-board' | 'weekly-record'
      : null;
    const processed = await recordEmailProviderEvent({
      svixId,
      providerId: event.data.email_id,
      type: event.type as 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.failed' | 'email.suppressed',
      eventAt: event.created_at,
      recipients: event.data.to,
      campaignTag,
    });
    console.info(JSON.stringify({
      event: 'resend_webhook_processed',
      type: event.type,
      providerId: event.data.email_id,
      processed,
    }));
    return new Response(null, { status: 204 });
  } catch (error) {
    // A verified event with a transient storage failure must receive a 5xx so
    // Resend retries it; treating it as a bad signature would lose a bounce or
    // complaint and could allow a later send to a suppressed recipient.
    console.error(JSON.stringify({ event: 'resend_webhook_processing_failed', code: error instanceof Error ? error.name : 'unknown' }));
    return Response.json({ error: 'webhook_processing_unavailable' }, { status: 503 });
  }
}
