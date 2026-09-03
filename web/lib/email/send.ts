import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { ReactNode } from 'react';
import { Resend } from 'resend';
import { emailRuntimeConfig, isEmailRuntimeReady, SITE_ORIGIN, type EmailRuntimeConfig } from './config';
import { runProviderSendAttempts } from './delivery-policy';
import {
  acquireEmailCampaignLease,
  claimEmailDelivery,
  finishEmailDelivery,
  isEmailDeliveryEligible,
  listCampaignSubscriptions,
  releaseEmailCampaignLease,
  reserveEmailProviderCapacity,
  reserveEmailProviderSlot,
  type DeliveryFinishStatus,
  type EmailKind,
  type EmailSubscription,
} from './store';
import {
  confirmationPageUrl,
  signUnsubscribeToken,
  unsubscribeApiUrl,
  unsubscribePageUrl,
  unsubscribeTokenHash,
} from './tokens';
import { ConfirmationEmail, DailyBoardEmail, WeeklyRecordEmail } from './templates';
import { filterWeeklyPicksForDate } from '@/lib/gary/archive';
import { fetchTodayGamePicks, fetchTodayPropPicks } from '@/lib/gary/picks';
import { normalizeLeague } from '@/lib/gary/leagues';
import { computeRecord, fetchAllGameResults, sinceDate } from '@/lib/gary/results';
import { daysAgoEST, todayEST } from '@/lib/gary/dates';

interface DeliveryContent {
  subject: string;
  text: string;
  react: ReactNode;
}

interface CampaignSummary {
  kind: 'daily_board' | 'weekly_record';
  eligible: number;
  sent: number;
  failed: number;
  requestFailed: number;
  providerFailed: number;
  duplicate: number;
  skippedRecipients: number;
  skipped: boolean;
}

export type DeliveryResult = 'sent' | 'request_failed' | 'provider_failed' | 'duplicate' | 'skipped';

type DeliveryRuntime = {
  config: EmailRuntimeConfig;
  resend: Resend;
};

function emptyCampaignSummary(
  kind: 'daily_board' | 'weekly_record',
  skipped = true,
): CampaignSummary {
  return {
    kind,
    eligible: 0,
    sent: 0,
    failed: 0,
    requestFailed: 0,
    providerFailed: 0,
    duplicate: 0,
    skippedRecipients: 0,
    skipped,
  };
}

function deliveryKey(subscriptionId: string, kind: EmailKind, contentKey: string): string {
  return `gary-${kind}-${createHash('sha256').update(`${subscriptionId}:${contentKey}`).digest('hex').slice(0, 32)}`;
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) return String(error.name).slice(0, 100);
  return 'delivery_error';
}

function formatDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(new Date(`${iso}T12:00:00Z`));
}

const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

async function deliver(
  subscription: EmailSubscription,
  kind: EmailKind,
  contentKey: string,
  content: (unsubscribeUrl: string, config: EmailRuntimeConfig) => DeliveryContent,
  runtime?: DeliveryRuntime,
): Promise<DeliveryResult> {
  const config = runtime?.config ?? emailRuntimeConfig();
  const resend = runtime?.resend ?? new Resend(config.apiKey);
  const idempotencyKey = deliveryKey(subscription.id, kind, contentKey);
  const unsubscribeToken = signUnsubscribeToken(subscription.id, config.tokenSecret);

  let claim: Awaited<ReturnType<typeof claimEmailDelivery>>;
  try {
    claim = await claimEmailDelivery({
      subscriptionId: subscription.id,
      kind,
      contentKey,
      idempotencyKey,
      unsubscribeTokenHash: unsubscribeTokenHash(unsubscribeToken),
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'email_delivery_claim_failed',
      kind,
      code: errorCode(error),
    }));
    return 'request_failed';
  }

  if (claim.state === 'duplicate') return 'duplicate';
  if (claim.state === 'ineligible') return 'skipped';
  const deliveryId = claim.id;

  const finish = async (
    status: DeliveryFinishStatus,
    options: { providerId?: string; errorCode?: string } = {},
  ) => {
    try {
      await finishEmailDelivery({
        deliveryId,
        subscriptionId: subscription.id,
        kind,
        status,
        ...options,
      });
    } catch (storageError) {
      console.error(JSON.stringify({
        event: 'email_delivery_record_failed',
        kind,
        deliveryId,
        status,
        code: errorCode(storageError),
      }));
    }
  };

  let message: DeliveryContent;
  try {
    message = content(unsubscribePageUrl(subscription.id, config.tokenSecret), config);
  } catch (error) {
    const code = errorCode(error);
    await finish('request_failed', { errorCode: code });
    console.error(JSON.stringify({ event: 'email_content_failed', kind, deliveryId, code }));
    return 'request_failed';
  }

  let capacity: Awaited<ReturnType<typeof reserveEmailProviderCapacity>>;
  try {
    capacity = await reserveEmailProviderCapacity(deliveryId);
  } catch (error) {
    await finish('request_failed', { errorCode: 'capacity_check_failed' });
    console.error(JSON.stringify({
      event: 'email_provider_capacity_check_failed',
      kind,
      deliveryId,
      code: errorCode(error),
    }));
    return 'request_failed';
  }

  if (!capacity.granted) {
    const code = capacity.reason === 'capacity_exhausted'
      ? 'provider_capacity_exhausted'
      : 'provider_capacity_unavailable';
    await finish('request_failed', { errorCode: code });
    console.error(JSON.stringify({
      event: 'email_provider_capacity_exhausted',
      kind,
      deliveryId,
      reason: capacity.reason ?? 'unknown',
      dailyUsed: capacity.daily_used,
      dailyLimit: capacity.daily_limit,
      monthlyUsed: capacity.monthly_used,
      monthlyLimit: capacity.monthly_limit,
    }));
    return 'request_failed';
  }

  const oneClickUrl = unsubscribeApiUrl(subscription.id, config.tokenSecret);
  const payload = {
    from: config.from,
    to: subscription.email,
    replyTo: config.replyTo,
    subject: message.subject,
    react: message.react,
    text: message.text,
    headers: {
      'List-Unsubscribe': `<${oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [{ name: 'campaign', value: kind.replaceAll('_', '-') }],
  };

  const outcome = await runProviderSendAttempts({
    idempotencyKey,
    reserveSlot: async () => {
      const slot = await reserveEmailProviderSlot();
      return { granted: slot.granted, waitMs: slot.wait_ms };
    },
    wait,
    isEligible: () => isEmailDeliveryEligible({
      deliveryId,
      subscriptionId: subscription.id,
      kind,
    }),
    // The same deterministic key is deliberately reused for every retry.
    send: key => resend.emails.send(payload, { idempotencyKey: key }),
    onRetry: ({ attempt, code }) => {
      console.warn(JSON.stringify({
        event: 'email_provider_retry',
        kind,
        deliveryId,
        attempt,
        code,
      }));
    },
  });

  if (outcome.status === 'sent') {
    // Once Resend accepts the idempotent request, a later bookkeeping outage
    // must not cause the caller to release a live confirmation token.
    await finish('sent', { providerId: outcome.providerId });
    console.info(JSON.stringify({ event: 'email_delivery_sent', kind, deliveryId }));
    return 'sent';
  }

  await finish(outcome.status, { errorCode: outcome.errorCode });
  const level = outcome.status === 'skipped' ? 'info' : 'error';
  console[level](JSON.stringify({
    event: outcome.status === 'skipped' ? 'email_delivery_skipped' : 'email_delivery_failed',
    kind,
    deliveryId,
    status: outcome.status,
    code: outcome.errorCode,
  }));
  return outcome.status;
}

export async function sendConfirmationEmail(
  subscription: EmailSubscription,
  token: string,
): Promise<DeliveryResult> {
  if (!isEmailRuntimeReady()) return 'request_failed';
  const cadence = subscription.pending_cadence ?? subscription.cadence;
  const confirmUrl = confirmationPageUrl(subscription.id, token);
  // The confirmation token, rather than the calendar day, is the content
  // identity. A legitimately re-requested confirmation on the same day must
  // not collide with an earlier delivery claim.
  const contentKey = createHash('sha256').update(token).digest('hex');
  return deliver(subscription, 'confirmation', contentKey, (unsubscribeUrl, config) => ({
    subject: 'Confirm your Gary website updates',
    react: ConfirmationEmail({ cadence, confirmUrl, unsubscribeUrl, postalAddress: config.postalAddress }),
    text: `Confirm your request for Gary’s website updates: ${confirmUrl}\n\nIf you did not request this, ignore this email. The request expires in 24 hours. Unsubscribe: ${unsubscribeUrl}\n\nGary A.I. LLC · ${config.postalAddress}`,
  }));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 8,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

async function deliverCampaign(
  subscriptions: EmailSubscription[],
  kind: 'daily_board' | 'weekly_record',
  contentKey: string,
  content: (subscription: EmailSubscription, unsubscribeUrl: string, config: EmailRuntimeConfig) => DeliveryContent,
): Promise<DeliveryResult[]> {
  const config = emailRuntimeConfig();
  const runtime: DeliveryRuntime = { config, resend: new Resend(config.apiKey) };
  return mapWithConcurrency(
    subscriptions,
    subscription => deliver(
      subscription,
      kind,
      contentKey,
      (unsubscribeUrl, deliveryConfig) => content(subscription, unsubscribeUrl, deliveryConfig),
      runtime,
    ),
  );
}

function summarizeCampaign(
  kind: 'daily_board' | 'weekly_record',
  eligible: number,
  outcomes: DeliveryResult[],
): CampaignSummary {
  const requestFailed = outcomes.filter(value => value === 'request_failed').length;
  const providerFailed = outcomes.filter(value => value === 'provider_failed').length;
  return {
    kind,
    eligible,
    sent: outcomes.filter(value => value === 'sent').length,
    failed: requestFailed + providerFailed,
    requestFailed,
    providerFailed,
    duplicate: outcomes.filter(value => value === 'duplicate').length,
    skippedRecipients: outcomes.filter(value => value === 'skipped').length,
    skipped: false,
  };
}

async function withCampaignLease(
  kind: 'daily_board' | 'weekly_record',
  contentKey: string,
  work: () => Promise<CampaignSummary>,
): Promise<CampaignSummary> {
  const ownerId = randomUUID();
  const lease = { kind, contentKey, ownerId };
  const acquired = await acquireEmailCampaignLease(lease);
  if (!acquired) {
    console.info(JSON.stringify({ event: 'email_campaign_overlap_skipped', kind, contentKey }));
    return emptyCampaignSummary(kind);
  }

  try {
    return await work();
  } finally {
    try {
      await releaseEmailCampaignLease(lease);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'email_campaign_lease_release_failed',
        kind,
        code: errorCode(error),
      }));
    }
  }
}

export async function runDailyBoardCampaign(): Promise<CampaignSummary> {
  if (!isEmailRuntimeReady()) return emptyCampaignSummary('daily_board');

  const date = todayEST();
  return withCampaignLease('daily_board', date, async () => {
    const [unfilteredGamePicks, propPicks] = await Promise.all([
      fetchTodayGamePicks(0),
      fetchTodayPropPicks(0),
    ]);
    // The public Today fetch includes the full current NFL week. Email only
    // games actually scheduled for this Eastern calendar date.
    const nonNfl = unfilteredGamePicks.filter(pick => normalizeLeague(pick.league, pick.sport) !== 'NFL');
    const nflToday = filterWeeklyPicksForDate(
      unfilteredGamePicks.filter(pick => normalizeLeague(pick.league, pick.sport) === 'NFL'),
      date,
    );
    const gamePicks = [...nonNfl, ...nflToday];
    if (gamePicks.length === 0 && propPicks.length === 0) return emptyCampaignSummary('daily_board');

    const leagues = [...new Set(gamePicks.map(p => (p.league ?? p.sport ?? '').trim().toUpperCase()).filter(Boolean))];
    const subscribers = await listCampaignSubscriptions('daily_board');
    const outcomes = await deliverCampaign(
      subscribers,
      'daily_board',
      date,
      (_subscription, unsubscribeUrl, config) => ({
        subject: `Gary’s ${formatDateLabel(date)} board is live`,
        react: DailyBoardEmail({
          dateLabel: formatDateLabel(date),
          gameCount: gamePicks.length,
          propCount: propPicks.length,
          leagues,
          unsubscribeUrl,
          postalAddress: config.postalAddress,
        }),
        text: `Gary’s ${formatDateLabel(date)} board is live with ${gamePicks.length} game picks and ${propPicks.length} props. ${SITE_ORIGIN}/today?utm_source=gary_email&utm_medium=email&utm_campaign=daily_board\n\nUnsubscribe: ${unsubscribeUrl}\n\nGary A.I. LLC · ${config.postalAddress}`,
      }),
    );
    return summarizeCampaign('daily_board', subscribers.length, outcomes);
  });
}

export async function runWeeklyRecordCampaign(): Promise<CampaignSummary> {
  if (!isEmailRuntimeReady()) return emptyCampaignSummary('weekly_record');

  const start = daysAgoEST(7);
  const end = daysAgoEST(1);
  const contentKey = `${start}_${end}`;
  return withCampaignLease('weekly_record', contentKey, async () => {
    const rows = sinceDate(await fetchAllGameResults(0), start).filter(row => (row.game_date ?? '') <= end);
    const record = computeRecord(rows);
    if (record.graded === 0) return emptyCampaignSummary('weekly_record');

    const dateLabel = `Week ending ${formatDateLabel(end)}`;
    const subscribers = await listCampaignSubscriptions('weekly_record');
    const outcomes = await deliverCampaign(
      subscribers,
      'weekly_record',
      contentKey,
      (_subscription, unsubscribeUrl, config) => ({
        subject: `Gary’s weekly receipt: ${record.wins}-${record.losses}-${record.pushes}`,
        react: WeeklyRecordEmail({
          dateLabel,
          wins: record.wins,
          losses: record.losses,
          pushes: record.pushes,
          pct: record.pct,
          graded: record.graded,
          unsubscribeUrl,
          postalAddress: config.postalAddress,
        }),
        text: `Gary’s seven-day record: ${record.wins}-${record.losses}-${record.pushes} (${record.pct}%) across ${record.graded} graded game picks. Audit every result: ${SITE_ORIGIN}/results/audit?utm_source=gary_email&utm_medium=email&utm_campaign=weekly_record\n\nUnsubscribe: ${unsubscribeUrl}\n\nGary A.I. LLC · ${config.postalAddress}`,
      }),
    );
    return summarizeCampaign('weekly_record', subscribers.length, outcomes);
  });
}
