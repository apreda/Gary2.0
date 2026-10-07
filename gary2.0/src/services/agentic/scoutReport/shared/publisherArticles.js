/**
 * Reading a publisher's article: which pages qualify and how the text comes off
 * the page. No league lives here. MLB, the NFL and college football each own
 * their topics, searches and desk sections (founder law, Aug 25 2026: the NFL
 * and college share nothing); this is only the page reader under them.
 *
 * Founder, Oct 7 2026: "i want Gary reading them in full no summaries", any
 * outlet, and other people's picks kept out ("good call on the experts thing
 * lets keep them out"). There is no fixed publisher list: the first MLB run
 * found the Dodgers' game-day story on abc7.com, which a list dropped. Any
 * public news page qualifies except the sites below; each reader still checks
 * the publication date, the length and the teams named.
 */
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

const MAX_HTML_BYTES = 2_000_000;

export const EXCLUDED_SITES = Object.freeze((
  // Betting and picks sites
  'actionnetwork.com covers.com oddsshark.com pickswise.com sportsbookreview.com vegasinsider.com sportsline.com bettingpros.com '
  + 'dimers.com oddstrader.com betmgm.com draftkings.com fanduel.com caesars.com espnbet.com bet365.com fanatics.com '
  + 'pointsbet.com betrivers.com sportsgrid.com docsports.com wagertalk.com '
  // Not articles, or behind a paywall
  + 'youtube.com x.com twitter.com reddit.com facebook.com instagram.com tiktok.com threads.net bsky.app '
  + 'theathletic.com nytimes.com').split(/\s+/).filter(Boolean));

// Someone else's pick is not reporting.
const BETTING = /\b(betting|odds|predictions?|best bets?|player props?|prop bets?|parlays?|sportsbooks?|expert picks?|free picks?)\b/i;

/** A betting piece by its title or its address. */
export const isBettingPiece = (text) => BETTING.test(String(text || '').replace(/[-_/]/g, ' '));

/** AP's automated previews (Data Skrive) are a template of season stats and the line, not a writer's reporting. */
export const isAutomatedStory = (body) => /created this story using technology provided by/i.test(String(body || ''));

/** The canonical https address of a public news page, or null. `excludeSites` adds a reader's own exclusions. */
export function publicArticleUrl(value, { excludeSites = [] } = {}) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || /(^|\.)(localhost|local|internal)$/.test(host)) return null;
    if ([...EXCLUDED_SITES, ...excludeSites].some((site) => host === site || host.endsWith(`.${site}`))) return null;
    if (isBettingPiece(u.pathname)) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}

/**
 * Publisher page furniture that is not article text: photo-gallery paging
 * ("12 / 196"), photo credits ("BRENNAN ASPLEN/NEW YORK GIANTS") and runs of
 * blank lines.
 */
export function cleanArticleBody(body) {
  // A publisher's "RELATED CONTENT" rail and everything after it is not the article.
  const lines = String(body || '').split('\n');
  const rail = lines.findIndex(line => /^\s*(RELATED CONTENT|RELATED STORIES|MORE FROM|RECOMMENDED)\s*$/i.test(line));
  return (rail > 0 ? lines.slice(0, rail) : lines)
    .filter(line => !/^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(line))
    .filter(line => !(line.trim().length < 90 && /^[A-Za-z .'’-]+(\/[A-Za-z .'’-]+)+$/.test(line.trim())))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The article's title, byline and text as Readability finds them, paragraphs kept, nothing rewritten. */
export function readableArticle(document) {
  const article = new Readability(document).parse();
  const fragment = JSDOM.fragment(article?.content || '');
  for (const block of fragment.querySelectorAll('p, h1, h2, h3, h4, li, blockquote, tr, div')) block.append('\n\n');
  const body = cleanArticleBody(String(fragment.textContent || '').split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim());
  const title = String(article?.title || document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim();
  return { title, byline: article?.byline || null, body };
}

/** The page's HTML and final address; every redirect must land on a qualifying page. */
export async function fetchPublisherHtml(url, { qualify = publicArticleUrl, fetchImpl = fetch, signal } = {}) {
  let next = qualify(url);
  if (!next) throw new Error('Unsupported publisher URL');
  const timeout = AbortSignal.timeout(20_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchImpl(next, { redirect: 'manual', signal: combined, headers: { Accept: 'text/html' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      next = qualify(new URL(response.headers.get('location'), next).href);
      if (!next) throw new Error('Redirect left the supported publishers');
      continue;
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      await response.body?.cancel();
      throw new Error(`Publisher article unavailable (${response.status})`);
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_HTML_BYTES) throw new Error('Publisher page exceeds retrieval limit; no partial article used');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    return { html: Buffer.concat(chunks).toString('utf8'), url: next };
  }
  throw new Error('Too many publisher redirects');
}
