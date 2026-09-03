import 'server-only';

export type EmailCadence = 'daily' | 'weekly' | 'both';
export type EmailKind = 'confirmation' | 'daily_board' | 'weekly_record';
export type SubscriptionStatus = 'pending' | 'active' | 'unsubscribed' | 'suppressed';
export type DeliveryFinishStatus = 'sent' | 'request_failed' | 'provider_failed' | 'skipped';

export interface EmailSubscription {
  id: string;
  email: string;
  cadence: EmailCadence;
  sports?: string[];
  status: SubscriptionStatus;
  consented_at: string | null;
  pending_cadence?: EmailCadence | null;
  confirmation_requested_at?: string | null;
  last_daily_sent_at: string | null;
  last_weekly_sent_at: string | null;
}

export interface EmailSubscriptionRequest extends EmailSubscription {
  send_confirmation: boolean;
}

export type EmailDeliveryClaim =
  | {
      state: 'claimed';
      id: string;
      status: 'queued';
      subscription_id: string;
    }
  | { state: 'duplicate' }
  | { state: 'ineligible' };

export interface ProviderSlotReservation {
  granted: boolean;
  wait_ms: number;
}

export interface ProviderCapacityReservation {
  granted: boolean;
  reason?: string;
  already_reserved?: boolean;
  daily_used?: number;
  daily_limit?: number;
  monthly_used?: number;
  monthly_limit?: number;
}

function serviceConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase email storage is not configured');
  return { url, key };
}

async function serviceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = serviceConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Email storage request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

export async function requestEmailSubscription(input: {
  email: string;
  cadence: EmailCadence;
  source: string;
  userAgent: string | null;
  tokenHash: string;
  rateKey: string;
  consentVersion: string;
}): Promise<EmailSubscriptionRequest> {
  return serviceRequest<EmailSubscriptionRequest>('rpc/request_web_email_subscription', {
    method: 'POST',
    body: JSON.stringify({
      p_email: input.email,
      p_cadence: input.cadence,
      p_source: input.source,
      p_user_agent: input.userAgent,
      p_token_hash: input.tokenHash,
      p_fingerprint_hash: input.rateKey,
      p_consent_version: input.consentVersion,
    }),
  });
}

export async function confirmEmailSubscription(
  id: string,
  tokenHash: string,
): Promise<{ id: string; cadence: EmailCadence; source: string; status: 'active' } | null> {
  const result = await serviceRequest<{ id: string; cadence: EmailCadence; source: string; status: string } | null>(
    'rpc/confirm_web_email_subscription',
    {
      method: 'POST',
      body: JSON.stringify({ p_id: id, p_token_hash: tokenHash }),
    },
  );
  return result?.status === 'active' ? { ...result, status: 'active' } : null;
}

/** Release only the still-current confirmation after a pre-acceptance failure,
 * so a visitor can request a fresh message immediately. */
export async function releaseEmailConfirmation(id: string, tokenHash: string): Promise<void> {
  await serviceRequest<void>(
    `web_email_subscriptions?id=eq.${encodeURIComponent(id)}` +
      `&confirmation_token_hash=eq.${encodeURIComponent(tokenHash)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        pending_cadence: null,
        pending_consent_version: null,
        confirmation_token_hash: null,
        confirmation_requested_at: null,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

export async function isEmailUnsubscribeTokenValid(id: string, tokenHash: string): Promise<boolean> {
  return serviceRequest<boolean>('rpc/is_web_email_unsubscribe_token_valid', {
    method: 'POST',
    body: JSON.stringify({ p_id: id, p_token_hash: tokenHash }),
  });
}

export async function unsubscribeEmailSubscription(id: string, tokenHash: string): Promise<boolean> {
  return serviceRequest<boolean>('rpc/unsubscribe_web_email_subscription', {
    method: 'POST',
    body: JSON.stringify({ p_id: id, p_token_hash: tokenHash }),
  });
}

export async function listCampaignSubscriptions(
  kind: 'daily_board' | 'weekly_record',
): Promise<EmailSubscription[]> {
  const cadences = kind === 'daily_board' ? 'daily,both' : 'weekly,both';
  const pageSize = 1000;
  const subscriptions: EmailSubscription[] = [];
  let afterId: string | null = null;

  for (;;) {
    const cursorFilter: string = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
    const page: EmailSubscription[] = await serviceRequest<EmailSubscription[]>(
      `web_email_subscriptions?select=id,email,cadence,sports,status,consented_at,last_daily_sent_at,last_weekly_sent_at` +
        `&status=eq.active&cadence=in.(${cadences})${cursorFilter}&order=id.asc&limit=${pageSize}`,
    );
    subscriptions.push(...page);
    if (page.length < pageSize) break;
    afterId = page[page.length - 1].id;
  }
  return subscriptions;
}

export async function claimEmailDelivery(input: {
  subscriptionId: string;
  kind: EmailKind;
  contentKey: string;
  idempotencyKey: string;
  unsubscribeTokenHash: string;
}): Promise<EmailDeliveryClaim> {
  return serviceRequest<EmailDeliveryClaim>('rpc/claim_web_email_delivery', {
    method: 'POST',
    body: JSON.stringify({
      p_subscription_id: input.subscriptionId,
      p_kind: input.kind,
      p_content_key: input.contentKey,
      p_idempotency_key: input.idempotencyKey,
      p_unsubscribe_token_hash: input.unsubscribeTokenHash,
    }),
  });
}

export async function isEmailDeliveryEligible(input: {
  deliveryId: string;
  subscriptionId: string;
  kind: EmailKind;
}): Promise<boolean> {
  return serviceRequest<boolean>('rpc/is_web_email_delivery_eligible', {
    method: 'POST',
    body: JSON.stringify({
      p_delivery_id: input.deliveryId,
      p_subscription_id: input.subscriptionId,
      p_kind: input.kind,
    }),
  });
}

export async function reserveEmailProviderSlot(): Promise<ProviderSlotReservation> {
  return serviceRequest<ProviderSlotReservation>('rpc/reserve_web_email_provider_slot', {
    method: 'POST',
    body: JSON.stringify({ p_spacing_ms: 550, p_max_wait_ms: 15_000 }),
  });
}

export async function reserveEmailProviderCapacity(deliveryId: string): Promise<ProviderCapacityReservation> {
  return serviceRequest<ProviderCapacityReservation>('rpc/reserve_web_email_provider_capacity', {
    method: 'POST',
    body: JSON.stringify({
      p_delivery_id: deliveryId,
      p_daily_limit: 90,
      p_monthly_limit: 2_700,
      p_daily_campaign_reserve: 20,
      p_monthly_campaign_reserve: 600,
    }),
  });
}

export async function finishEmailDelivery(input: {
  deliveryId: string;
  subscriptionId: string;
  kind: EmailKind;
  status: DeliveryFinishStatus;
  providerId?: string;
  errorCode?: string;
}): Promise<void> {
  const finished = await serviceRequest<boolean>('rpc/finish_web_email_delivery', {
    method: 'POST',
    body: JSON.stringify({
      p_delivery_id: input.deliveryId,
      p_subscription_id: input.subscriptionId,
      p_kind: input.kind,
      p_status: input.status,
      p_provider_id: input.providerId ?? null,
      p_error_code: input.errorCode?.slice(0, 100) ?? null,
    }),
  });
  if (!finished) throw new Error('Email delivery finish was rejected');
}

export async function acquireEmailCampaignLease(input: {
  kind: 'daily_board' | 'weekly_record';
  contentKey: string;
  ownerId: string;
}): Promise<boolean> {
  return serviceRequest<boolean>('rpc/acquire_web_email_campaign_lease', {
    method: 'POST',
    body: JSON.stringify({
      p_kind: input.kind,
      p_content_key: input.contentKey,
      p_owner_id: input.ownerId,
      p_lease_seconds: 330,
    }),
  });
}

export async function releaseEmailCampaignLease(input: {
  kind: 'daily_board' | 'weekly_record';
  contentKey: string;
  ownerId: string;
}): Promise<void> {
  await serviceRequest<void>('rpc/release_web_email_campaign_lease', {
    method: 'POST',
    body: JSON.stringify({
      p_kind: input.kind,
      p_content_key: input.contentKey,
      p_owner_id: input.ownerId,
    }),
  });
}

export async function recordEmailProviderEvent(input: {
  svixId: string;
  providerId: string;
  type: 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.failed' | 'email.suppressed';
  eventAt: string;
  recipients: string[];
  campaignTag: 'confirmation' | 'daily-board' | 'weekly-record' | null;
}): Promise<number> {
  const recipients = [...new Set(input.recipients
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length <= 320 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))];

  return serviceRequest<number>('rpc/record_web_email_provider_event', {
    method: 'POST',
    body: JSON.stringify({
      p_svix_id: input.svixId,
      p_provider_id: input.providerId,
      p_event_type: input.type,
      p_event_at: input.eventAt,
      p_recipients: recipients,
      p_campaign_tag: input.campaignTag,
    }),
  });
}
