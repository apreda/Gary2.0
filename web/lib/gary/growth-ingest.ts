import 'server-only';
import type { ValidatedWebEvent } from '@/lib/gary/analytics-schema';
import type { LinkAttribution } from '@/lib/gary/link-attribution';

function serviceConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Website measurement storage is not configured');
  return { url, key };
}

async function serviceRpc(name: string, body: Record<string, unknown>): Promise<boolean> {
  const { url, key } = serviceConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`${name} returned ${response.status}`);
  return (await response.json()) === true;
}

export function storeWebEvent(event: ValidatedWebEvent, requestFingerprint: string): Promise<boolean> {
  return serviceRpc('log_web_event', {
    p_event: event.event,
    p_identity: event.identity,
    p_props: event.props,
    p_request_fingerprint: requestFingerprint,
  });
}

export function storeWebLinkClick(input: LinkAttribution, requestFingerprint: string): Promise<boolean> {
  return serviceRpc('log_web_link_click', {
    p_click_id: input.clickId,
    p_surface: input.surface,
    p_request_fingerprint: requestFingerprint,
    p_ct: input.campaignToken,
    p_referrer_host: input.referrerHost,
    p_first_source: input.firstSource,
    p_first_medium: input.firstMedium,
    p_first_campaign: input.firstCampaign,
    p_first_referrer: input.firstReferrer,
    p_first_landing: input.firstLanding,
    p_latest_source: input.latestSource,
    p_latest_medium: input.latestMedium,
    p_latest_campaign: input.latestCampaign,
    p_latest_referrer: input.latestReferrer,
    p_latest_landing: input.latestLanding,
  });
}
