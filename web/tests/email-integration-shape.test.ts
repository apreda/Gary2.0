import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

const store = source('lib/email/store.ts');
const sender = source('lib/email/send.ts');
const signup = source('app/email/actions.ts');
const unsubscribeAction = source('app/email/unsubscribe/actions.ts');
const unsubscribeApi = source('app/api/email/unsubscribe/route.ts');
const webhook = source('app/api/webhooks/resend/route.ts');

describe('website email integration shape', () => {
  it('uses atomic delivery RPCs rather than REST mutations', () => {
    expect(store).toContain("'rpc/claim_web_email_delivery'");
    expect(store).toContain("'rpc/is_web_email_delivery_eligible'");
    expect(store).toContain("'rpc/reserve_web_email_provider_slot'");
    expect(store).toContain("'rpc/reserve_web_email_provider_capacity'");
    expect(store).toContain("'rpc/finish_web_email_delivery'");
    expect(store).not.toMatch(/web_email_deliveries\?[^`'\"]+/);
    expect(store).toContain('p_unsubscribe_token_hash: input.unsubscribeTokenHash');
    expect(store).toContain('p_spacing_ms: 550');
  });

  it('passes the published consent version and preserves the runtime launch gate', () => {
    expect(signup).toContain('consentVersion: EMAIL_CONSENT_VERSION');
    expect(signup).toContain('isEmailRuntimeReady()');
    expect(sender).toMatch(/sendConfirmationEmail[\s\S]+!isEmailRuntimeReady\(\)/);
    expect(sender).toMatch(/runDailyBoardCampaign[\s\S]+!isEmailRuntimeReady\(\)/);
    expect(sender).toMatch(/runWeeklyRecordCampaign[\s\S]+!isEmailRuntimeReady\(\)/);
  });

  it('uses durable token-hash unsubscribe RPCs everywhere', () => {
    expect(store).toContain("'rpc/is_web_email_unsubscribe_token_valid'");
    expect(store).toContain("'rpc/unsubscribe_web_email_subscription'");
    for (const implementation of [unsubscribeAction, unsubscribeApi]) {
      expect(implementation).toContain('unsubscribeTokenHash(token)');
      expect(implementation).not.toContain('verifyUnsubscribeToken');
      expect(implementation).not.toContain('emailTokenSecret');
    }
  });

  it('runs campaigns under a lease and removes the process-local provider gate', () => {
    expect(sender).toContain('acquireEmailCampaignLease');
    expect(sender).toContain('releaseEmailCampaignLease');
    expect(sender).toContain('reserveEmailProviderCapacity');
    expect(sender).toContain('reserveEmailProviderSlot');
    expect(sender).toContain('isEmailDeliveryEligible');
    expect(sender).toContain('runProviderSendAttempts');
    expect(sender).not.toContain('providerRequestGate');
  });

  it('records the verified svix id and only forwards recognized Gary campaign tags', () => {
    expect(webhook).toContain("request.headers.get('svix-id')");
    expect(webhook).toContain('GARY_CAMPAIGN_TAGS.has(rawCampaignTag)');
    expect(webhook).toContain('svixId,');
    expect(store).toContain("'rpc/record_web_email_provider_event'");
    expect(store).toContain('p_campaign_tag: input.campaignTag');
  });
});
