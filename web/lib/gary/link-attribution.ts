import { normalizeAppStoreSurface } from '@/lib/gary/app-store';

export type LinkAttribution = {
  clickId: string;
  surface: string;
  campaignToken?: string;
  referrerHost?: string;
  firstSource?: string;
  firstMedium?: string;
  firstCampaign?: string;
  firstReferrer?: string;
  firstLanding?: string;
  latestSource?: string;
  latestMedium?: string;
  latestCampaign?: string;
  latestReferrer?: string;
  latestLanding?: string;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTrackableClickId(value: string | null | undefined): value is string {
  return Boolean(value && UUID_V4.test(value));
}

export function safeClickId(value: string | null | undefined): string {
  return isTrackableClickId(value) ? value.toLowerCase() : crypto.randomUUID();
}

export function hasGrantedAnalyticsCookie(cookieHeader: string | null): boolean {
  return Boolean(
    cookieHeader
      ?.split(';')
      .some(value => value.trim() === 'gary_analytics_consent=granted'),
  );
}

export function shouldTrackStandardHandoff(url: URL, cookieHeader: string | null): boolean {
  return Boolean(
    hasGrantedAnalyticsCookie(cookieHeader) &&
    url.searchParams.get('measure') === '1' &&
    isTrackableClickId(url.searchParams.get('click_id')),
  );
}

export function safeAttributionToken(value: string | null | undefined, max = 80): string | undefined {
  if (!value || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value)) return undefined;
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, max);
  return clean || undefined;
}

export function safeLandingPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith('/')) return undefined;
  const raw = value.split(/[?#]/, 1)[0];
  try {
    if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(decodeURIComponent(raw))) return undefined;
  } catch {
    return undefined;
  }
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240);
  return clean || undefined;
}

export function safeReferrerHost(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const host = (value.includes('://') ? new URL(value).hostname : value)
      .toLowerCase()
      .replace(/^www\./, '')
      .slice(0, 253);
    return /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
}

export function linkAttributionFromRequest(request: Request, surface: string, campaignToken?: string): LinkAttribution {
  const url = new URL(request.url);
  return {
    clickId: safeClickId(url.searchParams.get('click_id')),
    surface: normalizeAppStoreSurface(surface),
    campaignToken: safeAttributionToken(campaignToken, 40),
    referrerHost: safeReferrerHost(request.headers.get('referer')),
    firstSource: safeAttributionToken(url.searchParams.get('first_source')),
    firstMedium: safeAttributionToken(url.searchParams.get('first_medium')),
    firstCampaign: safeAttributionToken(url.searchParams.get('first_campaign')),
    firstReferrer: safeReferrerHost(url.searchParams.get('first_referrer')),
    firstLanding: safeLandingPath(url.searchParams.get('first_landing')),
    latestSource: safeAttributionToken(url.searchParams.get('latest_source')),
    latestMedium: safeAttributionToken(url.searchParams.get('latest_medium')),
    latestCampaign: safeAttributionToken(url.searchParams.get('latest_campaign')),
    latestReferrer: safeReferrerHost(url.searchParams.get('latest_referrer')),
    latestLanding: safeLandingPath(url.searchParams.get('latest_landing')),
  };
}
