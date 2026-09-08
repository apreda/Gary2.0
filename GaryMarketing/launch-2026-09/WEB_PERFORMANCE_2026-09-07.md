# Website performance and SEO verification — September 7, 2026

Verified production release: `ef491056135872a2cf2290e7172e006cabbf275d` (13 website files). Live responses from [betwithgary.ai](https://www.betwithgary.ai) identified deployment `dpl_12u2PNrW8VSUaqwM7Wpwyy8rzxk4`. Post-deployment probes completed September 7 at 10:58 PM Eastern (`2026-09-08T02:58:10Z`).

## Measured result

The Today page's initial modern JavaScript fell from **233,363 to 166,054 bytes**, a **67,309-byte reduction (28.8%)**. Its Supabase auth bundle is no longer referenced by initial script tags. Personal Book code loads as its section approaches the viewport; authentication, query contents and public-board freshness remain unchanged. Other sampled pages' initial JavaScript totals were unchanged.

All values below are bytes except TTFB, which is milliseconds. HTML and JavaScript totals measure compressed response bodies.

| Page | Initial JS before | Initial JS after | HTML before | HTML after | TTFB before | TTFB after |
|---|---:|---:|---:|---:|---:|---:|
| Home | 158,005 | 158,005 | 14,724 | 14,722 | 390 | 1,240 |
| Picks | 165,540 | 165,540 | 29,107 | 29,077 | 327 | 337 |
| Today | 233,363 | 166,054 | 12,189 | 12,152 | 215 | 299 |
| Archive | 155,333 | 155,333 | 15,078 | 14,969 | 276 | 261 |
| Archived matchup | 158,341 | 158,341 | 9,929 | 9,927 | 186 | 183 |

The matched archived URL was [Cubs at Pirates, April 30, 2025](https://www.betwithgary.ai/picks/mlb/2025-04-30/chicago-cubs-at-pittsburgh-pirates). Every sampled page returned HTTP 200.

These are individual network probes from one Mac, not a controlled latency experiment or Core Web Vitals measurement. In particular, the slower post-deployment Home response does not establish a regression or a cold-start cause. No claim of improved LCP, INP or CLS follows from these results.

## Sitemap and discovery checks

All four public XML routes returned HTTP 200:

| Inventory | URLs | Latest represented date |
|---|---:|---|
| [Stable sitemap](https://www.betwithgary.ai/sitemap.xml) | 35 | Not applicable |
| [Sitemap index](https://www.betwithgary.ai/sitemap-index.xml) | 3 child sitemaps | Not applicable |
| [Archive sitemap](https://www.betwithgary.ai/archive/sitemap.xml) | 326 | September 7, 2026 |
| [Game sitemap](https://www.betwithgary.ai/picks/sitemap/0.xml) | 4,174 | September 7, 2026 |

The stable sitemap now includes `/leaderboard` and retains `/today`. The [leaderboard](https://www.betwithgary.ai/leaderboard) returned HTTP 200 with its own canonical URL and no `noindex` meta directive. These checks establish live publication and discoverability signals, not Google indexing or a successful Google fetch.

## Verification and known limitation

- The combined working-tree verification recorded **372 passing tests**, plus passing TypeScript and ESLint. That count includes another session's in-flight test; it is not a count attributed solely to the 13-file release.
- Independently run focused Today suites passed **12 tests**, including deferred initialization, one-time activation, signed-out fallback, auth-event ordering, stale-response protection and unmount cleanup.
- Mobile fixture browser QA confirmed the Book remains in its loading shell while offscreen and displays the signed-out invitation as the section approaches the viewport.
- The existing production sitemap smoke test passed on **Node 24.19.0** with a local, read-only fixture database: builds succeed during outage without generating inventories; dated pages remain request-rendered; cold outages return errors; failed ISR regeneration preserves the last-good XML; recovery publishes new dates. No production database or credentials were used.
- The broader development fixture smoke encounters an existing **Next.js 16.3.2 Webpack-development request-context failure** at `/archive/sitemap.xml`: `connection()` reports that it is outside a request scope. This reproduced on Node 25 and Node 24.19 after the ordinary page checks passed. Production build/start verification passes, and the production routes work. The deeper framework cause remains unconfirmed; the production cache architecture was left unchanged.

## Reproduction method

Use Node's built-in `https.get` with `Accept-Encoding: br,gzip` and collect raw response buffers. Record the buffer length before Brotli/gzip decompression. Parse decoded HTML for script `src` attributes, exclude `noModule` scripts, fetch each unique script once with the same headers, and sum the raw compressed body sizes for each route. Browser `fetch().arrayBuffer()` transparently decompresses these responses and is unsuitable for that compressed-size total. Initial-script totals exclude subsequent dynamic imports, navigation prefetches, browser rendering costs, fonts, CSS and images.

No application, pick-process, backend, database or native-app changes were needed for the measurement. This report was added after the production probes and is not part of the 13-file release commit.

## Later launch checks

At about 11:10 PM Eastern, the live pricing button “CHECK YOUR WINNERS ACCESS” opened `https://www.betwithgary.ai/account?next=%2Faccount`, preserving the membership destination through sign-in. This signed-out check does not certify a real user's entitlement.

The later website-email correction and its separate production receipts are documented in [email and support readiness](EMAIL_SUPPORT_READINESS_2026-09-07.md). The final copy-only follow-up `cab21f17` passed 385 working-tree website tests across 54 files, TypeScript and ESLint, and was verified in production at about 11:19 PM Eastern. This includes concurrent website work by other sessions. The byte comparisons above remain the earlier matched `ef491056` measurements and are not reattributed to later releases.

## Additional public-copy review and deployment

Website-only follow-up `f7fd671d28f637e6b74eed3da428f12f7fe4311e` corrected unsupported every-game, every-morning and next-morning-grading promises on Home, root metadata and Hub. The AI-readable `/llms.txt` response now uses the existing authoritative free/launch-offer constants and accurately describes account-owned Winners access on both surfaces. No data fetch, cache, authentication, pick-generation, grading or native-app behavior was changed by this six-file commit.

Git-built production deployment `dpl_CkjRvc5PtKy1pqh5WiBE3ryHvMfN` reached READY with `www.betwithgary.ai` and the normal production aliases. Real-domain Home and Hub browser checks at approximately 11:51 PM Eastern confirmed the new visible copy, page titles/descriptions and unchanged canonical destinations. A public HTTP check of `/llms.txt` returned 200 with `text/plain; charset=utf-8`, the exact account-created-before-cutoff offer, pricing destination and no obsolete all-free/every-pick claim. The browser could not display this plain-text route, so this last check was an HTTP response check, not a rendered-page claim.

Five focused new tests pass, including empty feeds and unavailable record data. The subsequent combined working-tree run passed **410 tests across 58 files**, TypeScript and whole-website ESLint. The combined count includes concurrent work by the separate release owner; it is not attributed solely to this copy commit. That owner's in-flight lint issue was resolved by its owner before this final passing run. No new performance or Core Web Vitals measurement was made for this copy-only release.
