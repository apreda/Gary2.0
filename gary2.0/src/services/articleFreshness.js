// One reporting contract for every sport, search transport and browsing lane.
export const ARTICLE_FRESHNESS_VERSION = 'dated-reporting-v1';
export const CURRENT_REPORTING_HOURS = 48;
export const LIVE_STATUS_HOURS = 24;

export function articleFreshnessInstructions({ now = new Date(), freshnessHours = CURRENT_REPORTING_HOURS } = {}) {
  const instant = new Date(now);
  const hours = Number.isFinite(Number(freshnessHours)) && Number(freshnessHours) > 0
    ? Number(freshnessHours) : CURRENT_REPORTING_HOURS;
  const since = new Date(instant.getTime() - hours * 3600_000).toISOString();
  return `Reporting dates and freshness (${ARTICLE_FRESHNESS_VERSION}):
Research time: ${instant.toISOString()} (${instant.toLocaleString('en-US', { timeZone: 'America/New_York' })} US Eastern).
Use the freshest relevant reporting. For current news, the default publication window is the last ${hours} hours, since ${since}; a topic's explicitly requested window or earlier evidence cutoff takes precedence. Never use a source published after the request's cutoff or after research time.
Open the actual publisher page before using an article as evidence; a search snippet alone is insufficient. Retain the source URL, outlet, original publication date/time and date of the event or game it describes beside the findings. Read the date from the publisher, never invent it. A retrieval time, search-engine crawl date, copyright year or dateModified is not an original publication date and cannot make an old article current.
For injuries, availability, starting roles and workload/pitch/innings/snap limits, seek the latest game-specific update, preferably within ${LIVE_STATUS_HOURS} hours. Check that "today", "tonight" and "this week" refer to the target game's actual date. A new publication discussing an old event does not establish today's status. Search for later updates to an older announcement; retain an ongoing restriction as dated background, not a newly confirmed game-day plan.
Older articles may describe an explicitly requested past game, career or season background; label that period and preserve the original date. They cannot establish current availability, roles or workload. Undated articles cannot establish current status. An official current-season roster/staff directory may establish identity or coaching roles without an article date; label its season and retrieval time, never invent a publication date or use it for game-day availability.
If current dated reporting cannot be found, say that field is unverified or unavailable. Missing coverage is not evidence of health, unrestricted workload or an unchanged role. Keep the request's output format and do not add extra review steps.`;
}

export function withArticleFreshness(prompt, options = {}) {
  const text = String(prompt || '');
  return text.includes(`Reporting dates and freshness (${ARTICLE_FRESHNESS_VERSION})`)
    ? text : `${text}\n\n${articleFreshnessInstructions(options)}`;
}

/** Publisher metadata only; never dateModified, crawl time or a model date. */
export function publisherArticleDate(document) {
  const dates = [...document.querySelectorAll('meta[property="article:published_time"], meta[name="datePublished"], meta[itemprop="datePublished"]')].map(el => el.content);
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if ([value['@type']].flat().some(t => /^(NewsArticle|Article|ReportageNewsArticle|BlogPosting|SportsArticle)$/.test(t))) {
      if (value.isAccessibleForFree === false || value.isAccessibleForFree === 'false') throw new Error('Publisher marks this article as restricted');
      if (value.datePublished) dates.push(value.datePublished);
    }
    if (value['@graph']) walk(value['@graph']);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data; try { data = JSON.parse(script.textContent); } catch { continue; }
    walk(data);
  }
  const valid = dates.map(Date.parse).filter(Number.isFinite);
  return valid.length ? Math.min(...valid) : NaN;
}

export function articleDateIsCurrent(publishedAt, { asOf = Date.now(), observedAt = Date.now(), maxAgeMs = CURRENT_REPORTING_HOURS * 3600_000 } = {}) {
  const published = typeof publishedAt === 'number' ? publishedAt : Date.parse(publishedAt);
  const cutoff = Math.min(Number(asOf), Number(observedAt));
  return Number.isFinite(published) && Number.isFinite(cutoff)
    && published <= cutoff && published >= Number(asOf) - maxAgeMs;
}
