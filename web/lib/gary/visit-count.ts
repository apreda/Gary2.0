import { hasInternalAnalyticsCookie } from '@/lib/gary/link-attribution';

// Every page load counted without cookies or consent (founder, Oct 9 2026:
// "count page and source only"). A visit is the page, where it came from
// and, for a crawler, its name. No IP, no user agent string, no visitor id.

export type Visit = {
  path: string;
  source: string;
  medium: 'direct' | 'organic' | 'social' | 'referral' | 'internal' | 'campaign' | 'crawler';
  bot: string | null;
};

const SITE_HOSTS = new Set(['betwithgary.ai', 'www.betwithgary.ai']);
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|yandex|baidu|startpage|qwant)\./;
const SOCIAL: [RegExp, string][] = [
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, 'x'],
  [/(^|\.)(instagram\.com|l\.instagram\.com)$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|l\.facebook\.com|m\.facebook\.com)$/, 'facebook'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)(tiktok\.com)$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(threads\.net)$/, 'threads'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
];
const BOTS: [RegExp, string][] = [
  [/googlebot|google-inspectiontool|storebot-google|googleother/i, 'googlebot'],
  [/bingbot|bingpreview/i, 'bingbot'],
  [/applebot/i, 'applebot'],
  [/duckduckbot/i, 'duckduckbot'],
  [/yandexbot/i, 'yandexbot'],
  [/gptbot|oai-searchbot|chatgpt-user/i, 'openai'],
  [/claudebot|claude-web|claude-user|claude-searchbot/i, 'claude'],
  [/perplexitybot|perplexity-user/i, 'perplexity'],
  [/ahrefsbot/i, 'ahrefs'],
  [/semrushbot/i, 'semrush'],
  [/twitterbot/i, 'x'],
  [/facebookexternalhit|meta-externalagent/i, 'meta'],
];
const GENERIC_BOT = /bot\b|crawler|spider|crawl|slurp|preview|fetch|monitor|headless|python-requests|curl\/|wget/i;

function botName(userAgent: string): string | null {
  for (const [pattern, name] of BOTS) if (pattern.test(userAgent)) return name;
  return GENERIC_BOT.test(userAgent) ? 'other' : null;
}

function token(value: string | null, max = 64): string | null {
  const clean = (value ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, max);
  return clean || null;
}

/** A page load worth counting: a document request, not a prefetch, a data fetch or an API call. */
export function countableVisit(request: Request): Visit | null {
  if (request.method !== 'GET') return null;
  const h = request.headers;
  if (h.get('rsc') || h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) return null;
  const dest = h.get('sec-fetch-dest');
  if (dest ? dest !== 'document' : !(h.get('accept') ?? '').includes('text/html')) return null;
  if (hasInternalAnalyticsCookie(h.get('cookie'))) return null;
  const url = new URL(request.url);
  const path = url.pathname;
  if (/^\/(api|_next|c|go|get|auth|sitemap-data)(\/|$)/.test(path) || /\.[a-z0-9]{2,5}$/i.test(path)) return null;

  const bot = botName(h.get('user-agent') ?? '');
  if (bot) return { path: path.slice(0, 200), source: bot, medium: 'crawler', bot };

  const utm = token(url.searchParams.get('utm_source'));
  if (utm) return { path: path.slice(0, 200), source: utm, medium: 'campaign', bot: null };

  let host: string | null = null;
  try {
    const ref = h.get('referer');
    host = ref ? new URL(ref).hostname.toLowerCase() : null;
  } catch {
    host = null;
  }
  if (!host) return { path: path.slice(0, 200), source: 'direct', medium: 'direct', bot: null };
  if (SITE_HOSTS.has(host)) return { path: path.slice(0, 200), source: 'betwithgary.ai', medium: 'internal', bot: null };
  const search = host.match(SEARCH);
  if (search) return { path: path.slice(0, 200), source: search[2], medium: 'organic', bot: null };
  for (const [pattern, name] of SOCIAL) if (pattern.test(host)) return { path: path.slice(0, 200), source: name, medium: 'social', bot: null };
  return { path: path.slice(0, 200), source: token(host.replace(/^www\./, '')) ?? 'other', medium: 'referral', bot: null };
}

/** One row in web_visits with the service role. Failures are dropped: a count must never slow or break a page. */
export async function storeVisit(visit: Visit): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/web_visits`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(visit),
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // A missed count is acceptable; a slow page is not.
  }
}
