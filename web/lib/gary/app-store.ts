const APP_STORE_BASE_URL = 'https://apps.apple.com/us/app/gary-ai/id6751238914';
const EXISTING_CUSTOM_PRODUCT_PAGE_ID = '3c207d81-dc0d-4cc3-a50d-b5f47e29b18f';

const FIXED_SURFACES = new Set([
  'home_app_section',
  'pricing_footer',
  'pricing_plan',
  'how_it_works',
  'contact',
  'app_page_hero',
  'app_page_footer',
  'nfl_page_hero',
  'nfl_page_joined',
  'nfl_page_footer',
  'x_bio',
  'creator',
  'unknown',
]);

export function normalizeAppStoreSurface(raw: string | null | undefined): string {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);

  if (FIXED_SURFACES.has(value)) return value;
  if (/^(league_day|game_page)_[a-z0-9_]{1,24}$/.test(value)) return value;
  return 'unknown';
}

export function normalizeCreatorHandle(raw: string | null | undefined): string {
  // Keep `cr_` + handle inside Apple's campaign-token length limit.
  return (
    String(raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 27) || 'unknown'
  );
}

function providerToken(value: string | null | undefined): string | undefined {
  const clean = value?.trim();
  return clean && /^\d{1,20}$/.test(clean) ? clean : undefined;
}

export function campaignToken(value: string | null | undefined): string | undefined {
  const clean = value?.trim();
  return clean && /^[a-zA-Z0-9._-]{1,40}$/.test(clean) ? clean : undefined;
}

function productPageId(value: string | null | undefined): string | undefined {
  const clean = value?.trim().toLowerCase();
  return clean && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(clean)
    ? clean
    : undefined;
}

export function buildAppStoreUrl(options: {
  providerToken?: string | null;
  campaignToken?: string | null;
  productPageId?: string | null;
} = {}): string {
  const destination = new URL(APP_STORE_BASE_URL);
  const pt = providerToken(options.providerToken);
  const ct = campaignToken(options.campaignToken);
  const ppid = productPageId(options.productPageId);
  if (pt) destination.searchParams.set('pt', pt);
  if (ct) destination.searchParams.set('ct', ct);
  if (ppid) destination.searchParams.set('ppid', ppid);
  return destination.toString();
}

function configuredProductPageId(): string {
  return process.env.APP_STORE_CUSTOM_PRODUCT_PAGE_ID || EXISTING_CUSTOM_PRODUCT_PAGE_ID;
}

/** App Store destination for CTAs rendered on the website. */
export function websiteAppStoreUrl(): string {
  return buildAppStoreUrl({
    providerToken: process.env.APP_STORE_PROVIDER_TOKEN,
    campaignToken: process.env.APP_STORE_WEB_CAMPAIGN_TOKEN,
    productPageId: configuredProductPageId(),
  });
}

/** Existing short X-bio campaign destination, now optionally joined to a provider token. */
export function xBioAppStoreUrl(): string {
  return buildAppStoreUrl({
    providerToken: process.env.APP_STORE_PROVIDER_TOKEN,
    campaignToken: process.env.APP_STORE_X_BIO_CAMPAIGN_TOKEN || 'x_bio',
    productPageId: configuredProductPageId(),
  });
}

export function creatorAppStoreUrl(handle: string): string {
  return buildAppStoreUrl({
    providerToken: process.env.APP_STORE_PROVIDER_TOKEN,
    campaignToken: `cr_${normalizeCreatorHandle(handle)}`,
    productPageId: configuredProductPageId(),
  });
}
