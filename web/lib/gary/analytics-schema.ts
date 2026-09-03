export const WEB_EVENTS = [
  'meaningful_pick_view',
  'signup_started',
  'signup_completed',
  'email_signup_completed',
  'book_action_started',
  'first_book_action',
  'return_visit',
  'share_started',
  'share_completed',
  'app_store_handoff',
  'paywall_viewed',
  'plan_selected',
] as const;

export type WebEvent = (typeof WEB_EVENTS)[number];
export type AnalyticsPrimitive = string | number | boolean | null;
export type WebEventProperties = Record<string, AnalyticsPrimitive | undefined>;

export type ValidatedWebEvent = {
  event: WebEvent;
  identity: string;
  props: Record<string, AnalyticsPrimitive>;
};

const WEB_EVENT_SET = new Set<string>(WEB_EVENTS);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_LIKE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const PATH = /^\/[^?#\u0000-\u001f\u007f]{0,239}$/;
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const TOKEN = /^[a-z0-9._-]+$/;
const ITEM_ID = /^[a-z0-9._:-]+$/;

const ATTRIBUTION_KEYS = [
  'first_source',
  'first_medium',
  'first_campaign',
  'first_referrer',
  'first_landing',
  'latest_source',
  'latest_medium',
  'latest_campaign',
  'latest_referrer',
  'latest_landing',
] as const;

const EVENT_KEYS: Record<WebEvent, readonly string[]> = {
  meaningful_pick_view: ['path', 'content_type'],
  signup_started: ['method'],
  signup_completed: ['method'],
  email_signup_completed: ['cadence', 'source'],
  book_action_started: ['action', 'content_type', 'item_id', 'path'],
  first_book_action: ['action', 'content_type', 'item_id', 'path'],
  return_visit: ['path', 'days_since_last_visit'],
  share_started: ['method', 'surface', 'content_type', 'item_id', 'path'],
  share_completed: ['method', 'surface', 'content_type', 'item_id', 'path'],
  app_store_handoff: ['surface', 'click_id', 'destination', 'plan', 'sport', 'billing'],
  paywall_viewed: ['surface', 'trigger'],
  plan_selected: ['surface', 'plan', 'sport', 'billing'],
};

const REQUIRED_KEYS: Record<WebEvent, readonly string[]> = {
  meaningful_pick_view: ['path', 'content_type'],
  signup_started: ['method'],
  signup_completed: ['method'],
  email_signup_completed: ['cadence'],
  book_action_started: ['action', 'content_type'],
  first_book_action: ['action', 'content_type'],
  return_visit: ['path', 'days_since_last_visit'],
  share_started: ['method', 'surface', 'content_type', 'path'],
  share_completed: ['method', 'surface', 'content_type', 'path'],
  app_store_handoff: ['surface', 'click_id', 'destination'],
  paywall_viewed: ['surface', 'trigger'],
  plan_selected: ['surface', 'plan', 'billing'],
};

function oneOf(value: unknown, choices: readonly string[]): boolean {
  return typeof value === 'string' && choices.includes(value);
}

function validPropertyValue(event: WebEvent, key: string, value: unknown): value is AnalyticsPrimitive {
  if (key === 'days_since_last_visit') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3650;
  }
  if (typeof value !== 'string' || value.length === 0 || EMAIL_LIKE.test(value)) return false;
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return false;

  if (key === 'path' || key === 'first_landing' || key === 'latest_landing') return PATH.test(value);
  if (key === 'first_referrer' || key === 'latest_referrer') return HOST.test(value);
  if (key === 'click_id') return UUID_V4.test(value);
  if (key === 'item_id') return value.length <= 160 && ITEM_ID.test(value);
  if (key === 'method') {
    return event === 'signup_started' || event === 'signup_completed'
      ? oneOf(value, ['email', 'google'])
      : oneOf(value, ['native', 'copy_link']);
  }
  if (key === 'action') return oneOf(value, ['tail', 'fade']);
  if (key === 'content_type') {
    if (event === 'meaningful_pick_view') return value === 'pick';
    if (event === 'book_action_started' || event === 'first_book_action') return oneOf(value, ['game', 'prop']);
    return oneOf(value, ['pick', 'dataset']);
  }
  if (key === 'cadence') return oneOf(value, ['daily', 'weekly', 'both']);
  if (key === 'destination') return value === 'app_store';
  if (key === 'plan') return oneOf(value, ['all_access', 'all_access_annual', 'single']);
  if (key === 'billing') return oneOf(value, ['monthly', 'annual']);
  if (key === 'sport') return value.length <= 24 && TOKEN.test(value);
  if (key === 'source') return value.length <= 100 && TOKEN.test(value);
  if (key === 'surface' || key === 'trigger') return value.length <= 64 && TOKEN.test(value);
  if (ATTRIBUTION_KEYS.includes(key as (typeof ATTRIBUTION_KEYS)[number])) {
    return value.length <= 80 && TOKEN.test(value);
  }
  return false;
}

function isEvent(value: unknown): value is WebEvent {
  return typeof value === 'string' && WEB_EVENT_SET.has(value);
}

export function isSameOriginAnalyticsRequest(request: Request): boolean {
  if (request.headers.get('x-gary-analytics') !== '1') return false;
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return false;
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Strict server-side parser. Unknown keys, PII-like strings and wrong value types reject the whole event. */
export function parseWebEventPayload(input: unknown): ValidatedWebEvent | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as { event?: unknown; identity?: unknown; props?: unknown };
  if (!isEvent(candidate.event) || typeof candidate.identity !== 'string' || !UUID_V4.test(candidate.identity)) return null;
  if (!candidate.props || typeof candidate.props !== 'object' || Array.isArray(candidate.props)) return null;

  const entries = Object.entries(candidate.props as Record<string, unknown>);
  if (entries.length > 24) return null;
  const allowed = new Set<string>([...ATTRIBUTION_KEYS, ...EVENT_KEYS[candidate.event]]);
  const props: Record<string, AnalyticsPrimitive> = {};
  for (const [key, value] of entries) {
    if (!allowed.has(key) || !validPropertyValue(candidate.event, key, value)) return null;
    props[key] = value;
  }
  if (REQUIRED_KEYS[candidate.event].some(key => !(key in props))) return null;

  return { event: candidate.event, identity: candidate.identity.toLowerCase(), props };
}

/** Client-side privacy filter. Invalid optional values are omitted before the strict server check. */
export function safeWebEventProperties(
  event: WebEvent,
  input: WebEventProperties,
): Record<string, AnalyticsPrimitive> | null {
  const allowed = new Set<string>([...ATTRIBUTION_KEYS, ...EVENT_KEYS[event]]);
  const props: Record<string, AnalyticsPrimitive> = {};
  for (const [key, value] of Object.entries(input).slice(0, 24)) {
    if (value === undefined || !allowed.has(key) || !validPropertyValue(event, key, value)) continue;
    props[key] = value;
  }
  return REQUIRED_KEYS[event].some(key => !(key in props)) ? null : props;
}
