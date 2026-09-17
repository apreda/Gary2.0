# Gary: SEO, website discovery, and growth implementation handoff

Prepared for Adam to give to Fable. Baseline observed September 16, 2026, America/New_York. This is an implementation brief; the work below has not been completed merely because this document exists.

## Copy-and-paste starting instruction

Read this entire handoff and the applicable repository instructions. Implement the remaining website, indexing, measurement, and discovery work described here. Inspect the current source and live state first; preserve work already completed by other sessions. Make and verify the authorized changes, publish them through the repository's established production workflow, and leave a concise evidence-backed completion report. Prepare the external outreach materials, but do not send messages, submit review forms, purchase services, or start new recurring jobs without the separate authorization described below. Continue all independent work if one account or external action is blocked. Do not change Gary's pick engines, models, subscriptions, or product definitions to complete this task.

## 1. Objective and product language

The objective is to help new people discover Gary through useful picks and insights, then turn those visits into repeat use and paid Winners subscriptions. Measure both discovery and useful customer activity.

Adam approved this product explanation:

- **The Picks:** Gary's game and player prop picks across the games and sports he covers. Show what is published and what is still being prepared. Adam's intended product is coverage of every game in the supported sports; do not turn this into a promise that all picks are already available at every hour or that unsupported sports are covered.
- **Winners:** The select picks Gary likes most that day—his best bets, the picks he would bet on. Winners is a selection from the broader set of picks. The number varies; do not promise exactly three or four or imply that a Winners designation means a bet won.
- **The Hub:** Insights, stats, trends, and betting connections that help users spot something useful.
- Reasoning supports the picks. It is valuable detail, but should not become the main general value proposition.
- Home is a navigation/start page, not a separate product to sell.
- Use familiar language. Avoid selling a “board,” “card,” or “shortlist” without explaining what the user gets. “Gary's card is the product” was explicitly rejected.
- Home run and touchdown picks are important discovery opportunities. Verify supported markets from the current product before making coverage claims.
- A parlay of the day was an aside, not an implementation request. Do not add it here.
- Keep Gary's personality while clearly identifying him as AI. Do not invent a human expert biography, credentials, endorsements, or claims about what competitors cannot do.

## 2. Repository, working state, and authorization

Production checkout: `/Users/adam.preda/Gary2.0`.

Task artifacts: `/Users/adam.preda/Documents/ChatGPT/Gary`.

The old `/Users/adam.preda/Documents/ChatGPT/Gary/repo` is retired. Do not use it as the deployment source.

Before editing:

1. Run `git status --short --branch` and `git worktree list` in the production checkout.
2. Read `AGENTS.md`, `web/AGENTS.md`, `gary2.0/CLAUDE.md`, `web/README.md`, and the latest relevant handoffs. Read the installed Next.js documentation before changing framework behavior.
3. Read these existing handoffs and reports, using the newest evidence when they conflict:
   - `HANDOFF_2026-09-16_WEBSITE_OFFERING.md`
   - `HANDOFF_2026-09-16_SEO_SOL_PROPS.md`
   - `HANDOFF_2026-09-16_FULL_GAME_X_COVERAGE.md`
   - `HANDOFF_2026-09-16_X_PRIMARY_WRITER.md`
   - `GaryMarketing/launch-2026-09/SEARCH_CONSOLE_2026-09-16.md`
   - `GaryMarketing/launch-2026-09/SEO_OUTREACH_2026-09-16.md`
4. Inspect current state before assuming a documented defect remains. These files describe several separate sessions. For example, earlier SEO notes say Google access was blocked; business-account access subsequently succeeded.

Repository instructions authorize completed work directly on `main`, verification, and pushing to `origin/main` without a separate PR approval. Preserve that workflow unless Adam gives newer instructions. Several sessions share the checkout. Stage only your explicit files, never indiscriminately stage the working tree, and never discard someone else's changes.

At handoff, unrelated backend MLB/bullpen work and the private `ios/GaryApp/GoogleService-Info.plist` were modified. Preserve them. The private plist must remain uncommitted. Last verified website commit was `3a34a355a68882ae317f49edaf4cdc8b9566ba1e`; refresh HEAD rather than resetting to it.

Use existing accounts, tooling, and infrastructure. This brief does not authorize new paid services, advertising spend, bulk content services, outbound pitches, or new scheduled monitoring. The outreach notes preserve a September 20 campaign hold; reaching that date alone is not permission to send.

Calling the implementation agent Fable does not authorize changing Gary's production model routing to Fable.

## 3. What is already done

Do not recreate these as if they were missing:

- The website wording now explains The Picks, Winners, and The Hub. Navigation, pricing, homepage, app/about pages, metadata, press materials, and related copy were updated.
- Pricing headline: “Gary's best bets. That's Winners.” Preserve current pricing and entitlements.
- Existing sport pages include `/picks/mlb`, `/picks/nfl`, and `/picks/ncaaf`.
- Permanent game pages exist at `/picks/[sport]/[date]/[game]`, with original reasoning and a server-rendered receipt of the original ticket, odds, and result when known.
- Public results, archives, methodology, corrections, data-source information, and reviewer materials already exist.
- Sitemaps and their outage/recovery handling already exist and were verified.
- Consent-aware first-party analytics, Vercel Analytics, Speed Insights, App Store handoff tracking, and a weekly funnel report already exist.
- X publishing has existing machinery and newer instructions for every eligible published MLB/NFL game pick. Do not create a second publisher or revive the superseded audience cap.

Review existing implementation, improve specific gaps, and report which items were already satisfactory.

## 4. Baseline to preserve and refresh

Read live reports if access is available. Record the property, environment, exact reporting dates, comparison dates, and retrieval time. Do not overwrite historical evidence with new numbers.

### Website traffic

Source: [Vercel Analytics](https://vercel.com/adam-predas-projects/gary2.0/analytics), Production.

Last 30 days, approximately August 17 at 10 p.m. through September 16 at 10:59 p.m.:

| Metric | Value | Dashboard comparison |
|---|---:|---:|
| Recorded visitors | 60 | -22% |
| Page views | 266 | +46% |
| Bounce rate | 58% | Dashboard showed -10%; do not reinterpret as percentage points |

Last seven days: 7 visitors, 32 page views, 43% bounce rate. Visitor and page-view changes were -68% and -82%.

Top pages by 30-day visitors: `/` 38, `/picks` 13, `/today` 10, `/results` 9, `/picks/mlb` 8, `/pricing` 7, `/props` 7. Counts across pages are not additive unique people.

Reported referrers: google.com 7, t.co 3, accounts.google.com 2, betwithgary.ai 2, duckduckgo.com 1. Google account/login traffic is not organic search; same-site referrals are not new acquisition. Do not calculate direct traffic by subtracting these rows from the visitor total.

Hostnames: betwithgary.ai 57 visitors; betwithgary.com 3. Devices were about 63% desktop, 36% mobile, 2% tablet, with rounding.

These are consented, recorded browser visitors, not an exact census of people or customers. Testing may be included. Declined consent and blocked trackers are outside this measurement.

### Google Search Console

Property: `sc-domain:betwithgary.ai`. The successful browser session used `adam.preda@betwithgary.ai`; the personal account did not own the property. Use legitimate existing access; do not copy authentication secrets.

Latest complete comparison: **August 18–September 14 versus July 21–August 17, 2026**.

| Metric | Latest 28 days | Previous 28 days |
|---|---:|---:|
| Google clicks | 6 | 11 |
| Impressions | 468 | 351 |
| CTR | 1.3% | 3.1% |
| Average position | 24.1 | 19.8 |

Selected latest-query positions: `gary app` 5.1 on 37 impressions; `garyai` 5.2 on 5; `ai sports picks today` 76.8 on 4; `best ai sports betting picks today` 81.6 on 14; `free sports picks daily` 79.4 on 17.

An average across queries is not one stable keyword rank. Query rows can omit private/low-volume detail and need not sum to totals. At this volume, small absolute changes produce large percentages.

Top click destinations included `/app` with 3, `/picks` with 1, `/` with 1, and `/picks/ncaaf` with 1. The `/archive/2026-09-01` page had 83 impressions and no clicks; do not turn its small-base percentage increase into a growth claim.

Indexing report, updated September 13: **594 indexed; 4,099 not indexed**. Reasons: 3,993 discovered/currently not indexed; 97 crawled/currently not indexed; 4 redirects; 3 not found; 2 noindex.

Sitemaps showed Success. The sitemap index reported 4,683 discovered pages; the static sitemap 34 and feed 5, with overlap. `/signin` already redirects to `/account`; two reported missing URLs were old hashed build assets. Do not introduce changes just to clear expected historical 404s. The saved same-day report records an already-successful homepage indexing request; avoid repeatedly resubmitting it.

Links report: 38 external links, all reported from apple.com, split between the homepage and privacy page. Treat this as what Google's report currently exposes, not a complete internet backlink inventory.

Speed Insights: desktop experience score 100 from only 37 metric events over seven days. Mobile had no data. Search Console Core Web Vitals had insufficient data. Do not call mobile's no-data placeholder a score of zero or declare performance solved.

September 16 website improvements postdate this Google reporting window. Their search impact has not yet been measured.

## 5. Workstream A: identify and fix important indexing gaps

Deliverables: a page-level audit table, targeted fixes supported by that audit, and a repeatable sample for later measurement.

1. Select approximately 20 representative canonical pages: key sport/props pages, recent published games, older completed games, sport/date listings, and archive pages. Include both indexed and unindexed examples where available.
2. For each, record URL, page type, whether indexing is desirable, HTTP status, robots directives, declared canonical, Google's selected canonical when available, Google indexing status, last crawl, source sitemap, internal referring page, visible original content, and proposed action.
3. Use Search Console URL Inspection for the sample. Distinguish Google's last indexed copy from a live test. If account access fails, complete source and live-page checks, and mark only Google-specific fields unavailable.
4. Check ordinary mobile and server-rendered HTML. Confirm published picks, date, matchup, original reasoning, and applicable result are available without relying solely on clicking or client-side fetching. Respect existing paid-access boundaries.
5. Trace real links from sport pages to daily listings and game pages, and from completed games to their appropriate results/archive context. Add useful descriptive links where absent. Do not generate huge footer link lists.
6. Confirm consistent canonical hosts and clean canonical paths. Campaign parameters should not create alternate indexed copies. Inspect any actual duplicate-content issues before using redirects, canonicals, or noindex.
7. Verify sitemaps contain intended, canonical public pages and preserve the existing outage behavior. Never replace a source failure with a successful empty sitemap. If adding `lastmod`, use actual content changes, not the time of every request.
8. If fresh, important URLs remain discovered but uncrawled, inspect available crawl statistics and server failures before diagnosing the cause. Discovery status alone does not prove low-quality content, missing links, or a crawl-budget problem.
9. Request indexing only for a small number of materially improved, important URLs when appropriate and accessible. Record any request as submitted, not indexed. Do not use bulk indexing services or an indexing API intended for unrelated content types.

Acceptance: sample table complete or explicitly scoped for unavailable fields; genuine site defects fixed and tested; important pages linked and indexable; no mass deletion/noindex treatment of useful historical records. Google choosing to index later is an external outcome, not a reason to keep the coding task open indefinitely.

## 6. Workstream B: improve search destinations for real picks

Deliverables: query-to-page map, stronger existing sport pages, and useful home run/TD destinations where the existing content supports them.

1. Research current searches and search results for MLB picks today, NFL picks today, college football picks, home run picks, and touchdown scorer picks. These are candidate topics, not verified search-volume claims. Use available Search Console data and actual search results; record uncertainty and do not buy keyword tools.
2. Map each distinct visitor intent to one primary page. Improve existing sport pages rather than creating competing pages with near-identical names.
3. Inspect `/props` and its public feed. Preferred new routes, if there is no better existing equivalent, are `/props/home-runs` and `/props/touchdowns`. Choose once and document the final paths.
4. Reuse the current public data, components, and classification helpers. Inspect `web/lib/gary/prop-lanes.ts`; `isLongShot` combines MLB home runs and NFL anytime touchdowns, so it is not sufficient by itself to distinguish the two pages. Validate league and market, including records with incomplete fields. Do not equate all touchdowns with anytime touchdowns or invent first-touchdown coverage.
5. Show the date, sport/market, real published picks, player, matchup, selection, original odds when available, and supporting explanation. Use the same native prop cards and controls. Do not create another data pipeline or rewrite Gary's selections.
6. Handle no games, picks still being prepared, and source failures accurately. Do not show yesterday's picks as today's or an API failure as “no picks.” Use useful recent results only when clearly dated and available; do not fabricate an archive the source cannot support.
7. Give each destination a clear title, heading, description, canonical, internal links, and appropriate existing structured data. Keep search copy readable. Only add schema that accurately represents visible content; no fabricated reviews, ratings, or unsupported FAQ promises.
8. Connect the new destinations from relevant sport pages and `/props`, and include them in the sitemap if they are useful indexable pages. Avoid crowding the global navigation.
9. Evaluate a small number of original, lasting guides or explanations only if they fill a real user need. Prioritize actual picks and useful Hub insights. Do not produce hundreds of generic AI articles to increase page count.

Acceptance: each chosen intent has a clear destination; published picks match the existing source; empty/error states are truthful; mobile cards and links work; pages are discoverable through ordinary links and server-rendered content; no changes to generation, grading, prices, or access.

## 7. Workstream C: turn discovery into useful visits and repeat use

Deliverables: a verified journey from search/social landing page to picks, related insight, Winners, and the existing app/account flow.

1. Walk through a first visit to an MLB game, an NFL game, a prop destination, and a Hub insight. The visitor should immediately understand what the page contains and which day it applies to.
2. Provide relevant next steps such as “See today's MLB picks,” related props, or a related Hub insight. Use actual relationships and existing content; do not invent connections or expose private insights.
3. Place a natural Winners invitation after useful content, for example “See Gary's best bets of the day.” Explain Winners in simple language without turning every card into an intrusive sales prompt.
4. Keep existing subscription boundaries and plan destinations accurate. A general props page must not accidentally grant paid access or imply every prop is a Winners pick.
5. Verify share links lead to the exact content being discussed. Preserve stable game URLs and existing social image support. New discovery pages should have meaningful share titles/descriptions and a valid image using existing assets.
6. Verify existing account, App Store, and return-use affordances. Improve placement or wording where the audit shows a gap. Do not add forced registration, a new email campaign, or new notifications as an unrequested growth experiment.
7. Preserve original ticket/result integrity. If a historical ticket and rationale disagree, document the specific issue and use the established correction process; do not silently rewrite history or hide losing picks to improve conversion.

Acceptance: tested journeys work without dead ends; users can reach related picks and understand Winners; no broken authentication or purchase links; current design and native card behavior preserved.

## 8. Workstream D: make measurement reliable

Deliverables: verified instrumentation, corrected attribution where necessary, documented internal-test exclusion, and a reusable report of acquisition and subsequent activity.

Start by reading:

- `web/components/GrowthAnalytics.tsx`
- `web/lib/gary/analytics.ts`
- `web/lib/gary/analytics-consent.ts`
- `web/lib/gary/analytics-schema.ts`
- `web/lib/gary/link-attribution.ts`
- `web/lib/gary/funnel.ts`
- `web/lib/gary/app-store.ts`
- `web/app/api/analytics/event/route.ts`
- `web/scripts/weekly-funnel.mjs`
- Related analytics, attribution, funnel, and App Store tests.

Required work:

1. Inventory existing events before adding any. Current events include sessions, meaningful pick views, signup milestones, shares, App Store handoffs, paywall views, and plan selections. Reuse sound instrumentation.
2. Verify Google account/login referrals are not classified as organic search. Current source may already contain this correction; distinguish historical data from current behavior. Also check same-site aliases, direct return visits, X campaign labels, and first-versus-latest attribution.
3. Keep analytics consent intact. No nonessential tracking before consent, after decline, or after revocation. Preserve property allowlists and sanitization; do not send emails, raw sensitive URLs, or private betting details into analytics.
4. Add or document a deliberate developer/test exclusion that works for the first-party pipeline and Vercel where supported. Prefer an explicit local opt-out for testing, checked before event transmission. Do not exclude all desktop users, all US users, or arbitrary inferred groups. If exclusions cannot cover a vendor, document the exact limitation.
5. Verify event semantics and deduplication. A card display, a reasoning read, a share-sheet open, a completed copy/share action, an App Store visit, an install, and a purchase are distinct.
6. The current `meaningful_pick_view` / `reasoning_v2` measure requires five continuous foreground seconds of visible reasoning. Keep that definition accurate. If measuring other pick engagement, create a separately defined/versioned event rather than silently redefining historical “useful sessions.” Update client, server schema, reporting, and tests together.
7. Extend existing aggregate reporting to cover source/landing page, useful visits, returning visitors, App Store handoffs, paywall views, plan selections, and signups where supported. The current weekly reader only fetches a subset of events, so adding a chart without updating the underlying query is insufficient.
8. Show verified paid subscriber counts only through an existing authoritative subscription source and legitimate access. A plan click is not a purchase. Keep Apple install/subscription reporting separate where cross-device attribution is unavailable; do not infer identities or build a new billing integration for this brief.
9. Label date windows, denominators, partial weeks, immature return cohorts, small samples, consent scope, internal exclusions, and unavailable metrics. Do not silently rewrite raw historical events to make the trends look cleaner.
10. Produce one baseline report after deployment and document the existing command/manual workflow for future weekly reports. Reuse the existing reporting infrastructure; no new cron job or AI monitor is authorized.

Acceptance tests should cover consent granted/declined/revoked, internal test opt-out, search versus login referral, self-referral aliases, campaign attribution, refresh/double-fire protection, input sanitization, and complete versus partial reporting windows. New return-cohort numbers must use enough follow-up time.

## 9. Workstream E: distribution and earned coverage

Deliverables that can be completed now: current materials, tailored drafts, verified contact routes, a tracking sheet, and a precise dispatch-ready summary.

1. Review the existing X publisher and latest handoffs. Verify that content links lead to the exact published game, share previews work, and campaign/source labels reach analytics. Use dry runs or read-only receipts; do not publish test posts. Preserve every-game coverage, rate controls, publication windows, duplicate protection, and the approved writing model.
2. Read `GaryMarketing/launch-2026-09/SEO_OUTREACH_2026-09-16.md`. It contains drafts for Sports Gambling Podcast Network, Sports Business Journal, and App Review Central. These are prospects, not confirmed placements. Refresh contact routes and assess fit before relying on them.
3. Update those drafts to the approved simple product language. Lead with a relevant product demonstration: Gary makes game and prop picks, Winners contains his favorites, and the Hub surfaces useful insights. The public record supports credibility; reasoning need not dominate the general pitch.
4. Prepare a manageable initial list, approximately 5–10 well-matched sports newsletters, podcasts, creators, or app reviewers. Record why each audience fits, the official contact route, a tailored angle, and useful page links. Prioritize fit over volume.
5. Review `/press` and the downloadable reviewer guide for consistency and working assets. Include a straightforward way to try Gary and inspect original picks/results. Do not present Gary's own record as independently certified or a favorable short window as all-time performance.
6. Maintain a tracker with prospect, draft, approval status, hold date, send date, reply, placement URL, link destination, referral visits, and useful visits. Leave unsent fields empty.
7. Preserve the September 20 campaign hold and separate dispatch authorization. Do not send, submit forms, enroll in a review service, pay for links, promise positive reviews, or schedule follow-ups under this brief. Prepare everything concrete first, then leave the exact small set of messages ready for Adam's approval.

Acceptance: materials and drafts are complete and fact-checked; outbound state is honestly “prepared” until sent with authorization; no claimed backlinks, partnerships, reviews, or traffic that have not occurred.

## 10. Verification and production release

Use meaningful tests for changed behavior. Copy edits alone do not need tests that merely mirror text.

From `/Users/adam.preda/Gary2.0`, run the relevant required checks:

```sh
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run build
npm run smoke:web
npm run smoke:sitemaps
```

Follow current repository requirements for `npm run verify` and backend/edge/database tests if those surfaces change. Do not run dependency setup over a shared active checkout unless needed. Report unrelated pre-existing failures separately, without treating them as passing or endlessly repeating identical checks.

Browser verification:

- Check 320/390px mobile, 768px tablet, and 1440px desktop for affected pages.
- Verify no horizontal overflow, clipped headings, obstructive consent UI, or unusable tap targets.
- Exercise native card flip/expand/share, related links, Winners access, and App Store/account handoffs.
- Check real populated content and controlled no-picks/error states using the existing safe fixtures.
- Verify consent and analytics behavior without completing real payments, sending emails, or generating public test picks/posts.
- For new routes, verify valid/invalid route behavior, canonical/title/description, server-rendered content, sitemap inclusion, and links from existing pages.

Release:

1. Review the exact diff and stage only completed owned files.
2. Commit and push through the existing approved `main` workflow. Do not force-push or bypass a failed credential/access requirement.
3. Verify the production deployment matches the commit and reaches READY.
4. Visit the actual production alias `https://www.betwithgary.ai`, not just a preview. Confirm changed routes, fresh content, navigation, metadata, consent, and relevant errors/logs.
5. Run repository production checks when applicable. The backend's `node scripts/production-truth.js` is run from the `gary2.0` subdirectory; its broader results may include unrelated infrastructure and the known private plist exception.
6. Stop temporary local servers. Never deploy fixture configuration or test credentials.

## 11. Deliverables and completion criteria

Keep artifacts under `GaryMarketing/launch-2026-09/` using the actual execution date, plus a root handoff. Suggested files:

- `SEO_GROWTH_AUDIT_<date>.md`: current baseline and the 20-page indexing table.
- `SEO_QUERY_PAGE_MAP_<date>.md`: candidate queries, evidence, primary pages, and implemented changes.
- `SEO_GROWTH_MEASUREMENT_<date>.md`: event definitions, exclusions, report commands, numbers, and limitations.
- `SEO_OUTREACH_<date>.md` plus a simple CSV tracker: reviewed prospects and ready-to-send drafts.
- `HANDOFF_<date>_SEO_GROWTH.md`: changed files, commit, test results, deployment evidence, and remaining external actions.

The final response to Adam should state:

1. What is live, with links and the practical benefit.
2. What was already correct and therefore preserved.
3. What was tested, the deployment commit, and any material failures or limitations.
4. What is prepared but awaiting explicit outbound authorization.
5. What depends on Google crawling/indexing or future visitor activity.
6. The exact next reporting window and command/manual steps; do not imply monitoring was scheduled.

Implementation is complete when the supported fixes are live and verified, the measurement/reporting workflow works, and the outreach package is ready. SEO results are a later outcome. Do not mark “Google rankings improved” based on a deployment, an indexing request, or one day's tiny sample.

## 12. Priority and how to judge progress

Suggested order:

1. Refresh baseline, inspect the important-page sample, and resolve evidenced indexing defects.
2. Verify measurement and internal-test exclusion so subsequent results are interpretable.
3. Improve existing sport destinations and add supported home run/TD destinations.
4. Complete related-page journeys, Winners clarity, share links, and production verification.
5. Finish distribution materials and the dispatch-ready outreach package.

In weekly operational reviews, check for regressions, whether important sampled pages have been crawled/indexed, and whether campaigns bring useful visits. For search progress, compare complete 28-day periods and separate branded from non-branded queries. Track actual counts alongside percentages.

Useful outcomes are more visits from people who did not already know Gary, more visitors reading picks, more return visits, and verified subscription growth. Indexed-page count, average position, or impressions alone are incomplete outcomes.

Use 4 weeks as an initial comparison point after release and 8–12 weeks as a broader review horizon, not a promise of rankings or traffic. Google says changes can take hours to months, and recommends allowing weeks before assessing effects. No numerical growth guarantee is justified by the current sample.

## Official reference material

These support the strategy; check the current documentation when implementing:

- [Google: page indexing report](https://support.google.com/webmasters/answer/7440203): interpret exclusion reasons and prioritize important canonical pages rather than 100% URL coverage.
- [Google: crawlable links](https://developers.google.com/search/docs/crawling-indexing/links-crawlable): real links, descriptive text, and contextual internal linking.
- [Google: helpful original content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content): useful original picks/analysis and accurate authorship/process information.
- [Google: SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): discovery, readable useful pages, promotion, and time to assess impact.
- [Google: spam policies](https://developers.google.com/search/docs/essentials/spam-policies): avoid manipulative link schemes and scaled low-value content.
- [Google: impressions, clicks, and position](https://support.google.com/webmasters/answer/7042828?hl=en): interpret metrics correctly.
- [Gary Search Console](https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Abetwithgary.ai): use the business account and correct property.
- [Gary Vercel Analytics](https://vercel.com/adam-predas-projects/gary2.0/analytics): select Production and record exact dates.
