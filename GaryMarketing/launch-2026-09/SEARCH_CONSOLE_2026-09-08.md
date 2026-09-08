# Search Console verification — September 8, 2026

Inspected the actual `betwithgary.ai` domain property through the existing business Google account around midnight Eastern. No property was created, no ownership/access changed, and no sitemap was resubmitted. These are Google's reported states with their displayed update dates, not inferred from local XML checks.

## Sitemap fetch is now successful

| Submitted sitemap | Google status | Last read | Discovered pages |
|---|---|---|---:|
| `https://www.betwithgary.ai/sitemap-index.xml` | Success — Sitemap index | September 7, 2026 | 4,515 |
| `https://www.betwithgary.ai/sitemap.xml` | Success — Sitemap | September 7, 2026 | 33 |
| `https://www.betwithgary.ai/feed.xml` | Success — RSS | September 7, 2026 | 1 |
| `https://betwithgary.ai/sitemap.xml` | Success — historical non-www submission | May 21, 2025 | 10 |

The index was submitted September 4. Its earlier “Couldn't fetch” report has cleared. Discovered pages are not indexed pages, and Google's stored inventory may lag the current sitemap. Do not resubmit or delete successful entries just to refresh these counts.

## Indexing and current-page checks

The aggregate Page indexing report displayed **118 indexed** and **4,347 not indexed** pages, last update September 3. Its reasons were 4,308 discovered/currently not indexed, 30 crawled/currently not indexed, four redirects, three noindex exclusions and two 404s. These categories are not all website errors, and the aggregate report is not a current check of every URL.

The noindex examples were `/account`, `/today` and `/you`. Current public HTTP responses correctly retain noindex on the account and private Book pages; `/today` returns 200 without a noindex directive. More importantly, Google's individual URL Inspection for `https://www.betwithgary.ai/today` now reports **URL is on Google / Page is indexed**, successful fetch, crawl/indexing allowed, and the inspected URL as Google's selected canonical. Its displayed last crawl was September 7 at 7:42:52 PM by Googlebot smartphone. The older aggregate Today exclusion should not be treated as a current defect.

The two 404 examples were `/signin` and an old hashed `/_next/static/chunks/...js` deployment asset. Current `/signin` returns 308 to `https://www.betwithgary.ai/account`, which returns 200. No replacement page or fabricated static asset was added. The dated old asset example alone does not establish a missing current page dependency.

The overview's Core Web Vitals section had no data for mobile or desktop. Neither this report nor the earlier measured JavaScript reduction establishes a field LCP, INP or CLS improvement. Large discovered/not-indexed counts do not, by themselves, establish the cause or justify bulk indexing requests.

## Confirmed article-markup issue

The Events report, updated September 5 and first detecting this issue September 4, listed **25 invalid items missing `location`**. It also listed five valid event items and optional-field warnings. Two affected examples were verified live before the correction:

- [Nationals at Braves — July 31](https://www.betwithgary.ai/picks/mlb/2026-07-31/nationals-at-braves)
- [Rangers at Astros — July 31](https://www.betwithgary.ai/picks/mlb/2026-07-31/rangers-at-astros)

Both returned 200 with the expected Article and Breadcrumb markup, but `Article.about` embedded a `SportsEvent` without a location. This was still present in production, not just a stale report.

The correction in `1590c61d3fa92ffcd2a95b88a48d4d34fc80ea36` describes the matchup as an article subject and its two teams as `SportsTeam` subjects. These pages publish sports analysis, not bookable event listings. Article and Breadcrumb metadata, canonical URLs, dates, authors, images, raw reasoning, displayed venues, calls and results remain unchanged. No venue address, event end time, ticket offer or event status was invented. Google explicitly supports Article markup for sports articles; event-rich-result eligibility requires accurate event location information. [Article documentation](https://developers.google.com/search/docs/appearance/structured-data/article), [Event documentation](https://developers.google.com/search/docs/appearance/structured-data/event), [Schema.org subject property](https://schema.org/about).

Five rendered-page tests cover venue present/absent, preserved Article/Breadcrumb fields and canonical metadata, safe script escaping, missing publication timestamps and recorded losses. The full combined website run passed **418 tests across 59 files**, TypeScript and whole-website ESLint; this count includes other release work. Deployment and Google's subsequent validation must have their own receipts before being called complete.

## Production and Google validation receipt

Git deployment `dpl_8pWVffpz9dWQ7UvXUZBXzJvfCpAt` reached READY for exact commit `1590c61d`, with the actual production aliases including `www.betwithgary.ai`. Both affected examples above then returned 200 and the new Article subject array, preserving the article body with no `SportsEvent` node.

[Google's live Rich Results Test](https://search.google.com/test/rich-results/result?id=1CEMbO-NkqBuB96HScEjwg) crawled the Nationals–Braves example successfully September 8 at 12:07:54 AM. It reported three valid items: one Article, one Breadcrumb and Google's Paywalled Content classification; no Event item or event error. The article remains explicitly `isAccessibleForFree: true`; this test classification does not introduce a paywall.

After those live checks, the Missing field `location` issue's **Validate fix** action was submitted once. Search Console confirmed **Validation Started — Started: 9/8/26**. This is a pending Google recrawl/validation, not a completed or passed site-wide result. Do not resubmit while it is in progress; retain the actual status and inspect any failed example if Google reports one.

The same production commit includes the separate release owner's `4b02b98c` change. Read-only live checks confirmed its `/terms#profile-safety` anchor and subscription-versus-wagering distinction, the corresponding `/privacy` disclosures, and the anonymous leaderboard's normal no-qualifiers state after loading. No report/block action or user-data write was performed by this verification. The shared Terms change and profile-safety implementation belong to that separate owner, not this website-SEO session; this check is not a legal review or native release certification.
