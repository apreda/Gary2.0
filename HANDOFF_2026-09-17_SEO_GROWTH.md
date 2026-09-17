# SEO, discovery and growth implementation — September 17, 2026

Executed from Adam's brief `FABLE_SEO_GROWTH_IMPLEMENTATION_HANDOFF_2026-09-16.md` (copy in `/Users/adam.preda/Documents/ChatGPT/Gary/`). Plan: `docs/superpowers/plans/2026-09-16-seo-growth-implementation.md` (28 tasks). Working documents: `GaryMarketing/launch-2026-09/SEO_GROWTH_AUDIT_2026-09-17.md`, `SEO_QUERY_PAGE_MAP_2026-09-17.md`, `SEO_GROWTH_MEASUREMENT_2026-09-17.md`, `SEO_OUTREACH_2026-09-17.md`, `SEO_OUTREACH_TRACKER_2026-09-17.csv`, evidence under `GaryMarketing/launch-2026-09/evidence/seo-growth-2026-09-17/`.

All times ET. Nothing was sent, submitted, purchased, enrolled or scheduled. No pick engine, model, price, entitlement, migration or X publisher file changed. The private `ios/GaryApp/GoogleService-Info.plist` stays uncommitted.

## 1. What is live

Production `www.betwithgary.ai`, Vercel project `gary2.0`, deployment `dpl_12bwyHHd1zimXuTyJEiEL4JfnRiV` READY at 3:05:58 AM from commit `ed2a1782`; the follow-up commit `123c75cc` (footer fix + baseline evidence) deployed after it and is live (the empty footer disclosure is gone). Live checks below were made against `ed2a1782` at 3:07–3:10 AM; browser QA at 9:10 AM ran against `123c75cc`.

| Change | Where | Verified live |
|---|---|---|
| **Home run picks page** `/props/home-runs` (MLB batter home runs, same native prop cards, truthful empty states, breadcrumb + ItemList schema) | Tasks 1, 3 | 200, canonical `https://www.betwithgary.ai/props/home-runs`, title "Today's MLB Home Run Picks", state "being prepared — the first game starts at 12:35 PM ET", links to `/picks/mlb`, `/props`, `/props/touchdowns`, `/winners`, yesterday's archive |
| **Touchdown picks page** `/props/touchdowns` (NFL anytime touchdown only; says Gary does not publish first-touchdown picks) | Tasks 1, 3 | 200, canonical, title "Today's NFL Anytime Touchdown Picks", state "being prepared — the first game starts at 8:15 PM ET" |
| `/props`: date-rollover notice, no-games / being-prepared / unknown empty states from the slate, links to both lane pages and the sport pages, Winners invitation | Task 4 | 200; links to `/props/home-runs`, `/props/touchdowns`, `/picks/mlb`, `/picks/nfl`, `/winners` present |
| Prop-page error boundary `/props/error.tsx` (retry + links to `/picks` and `/archive`) | Task 3 | unit-tested; not triggered live |
| **Sport pages**: "Recent MLB picks" (last 7 dates) / last 4 for NFL and NCAAF, the last published slate with results on off days, links to Player Props, the lane page and the Hub, Winners invitation; empty state distinguishes "no games on today's schedule" from "no picks published yet" | Task 6 | `/picks/mlb` links 2026-09-10…16; `/picks/nfl` links 09-09, 09-10, 09-13, 09-14 plus `/props/touchdowns` |
| **League day listings**: link to the sport record, year in the title, Winners invitation | Task 7 | unit-tested (`league-day-page.test.ts`) |
| **Game pages**: "Every sport this day" → `/archive/<date>`, "Today's player props" (today only), lane links when the game carries an HR/TD prop, "More insights in the Hub" / "All research from this day", Winners invitation before the App Store row | Task 8 | `/picks/mlb/2026-09-16/white-sox-at-guardians` links `/archive/2026-09-16`, `/props`, `/winners`, `/hub` |
| **Hub**: every insight has `id="insight-<id>"`, "Today's MLB picks" per league, "Gary's pick for this game →" when the insight's game has a published page, Winners invitation | Task 9 | 8 anchors live; pick links appear once today's picks publish |
| **Shared Winners invitation** ("Gary's best bets of the day. From everything he's picked, these are the bets he likes most." → See Winners) on game, sport, day, props, lane and Hub pages | Task 2 | present on all sampled pages |
| Card headline (team + market) as real `sr-only` text beside the fitted SVG on every board and archive card | Task 10 | unit-tested; production cards render after picks publish |
| **`betwithgary.com` and `www.betwithgary.com` → 308 `https://www.betwithgary.ai/<path>?<query>`** in `next.config.ts` | Task 11 | `www.betwithgary.com/picks/mlb/2026-09-15/red-sox-at-rangers` → 308 to the `.ai` canonical; query preserved; apex `.com` still hops via `www.betwithgary.com` (platform-level) then to `.ai` |
| `feed.xml` `<pubDate>` from the day's stored `published_at` (omitted when unknown); `lastBuildDate` stays request time | Task 12 | feed had no items at 3 AM (no picks yet); fixture preview showed the stored time |
| **Sitemap `<lastmod>`** from `archive_day_index.published_at` on archive dates, months (newest date) and every day/game entry in the picks shard; static `sitemap.xml` still has none by design | Task 13 | `/archive/sitemap.xml` 334 of 336 URLs, `/picks/sitemap/0.xml` 4,330 of 4,330 URLs, e.g. `2026-09-16T15:04:39.036Z` |
| `sitemap.xml` and `llms.txt` list both lane pages and the three sport pages; llms.txt no longer calls `/props` "Home Run Threats" | Tasks 3, 5 | 2 lane URLs in `sitemap.xml`; llms.txt updated |
| Copy alignment: web app manifest description ("Gary's free game picks and player props, his best bets in Winners, and insights and betting connections in the Hub."), shared social image alt, footer sport links (MLB / NFL / College Football Picks replace the stale "NFL Kickoff"), Winners ticket label "WINNERS PICK · GAME/PROP" (never "GAME WINNER"), reviewer guide rewritten to the approved language with `/props`, `/hub`, `/winners` | Task 14 | manifest live; footer live |
| Footer "Get Gary's Email Updates" hidden when the email runtime is not configured (production had an empty disclosure) | post-verification fix `123c75cc` | deploys with `123c75cc` |
| **Internal-test analytics exclusion**: `localStorage gary_analytics_internal_v1=1` + cookie `gary_analytics_internal=1`; gates every first-party event, App Store handoffs (`/go/app`, `/get`, `/c/*`) and Vercel Analytics + Speed Insights via `beforeSend`; toggle in the "Privacy choices" panel ("Internal testing? Exclude this browser from analytics") | Task 15 | unit-tested (`growth-analytics.test.ts`, `useful-session.test.ts`, `app-store.test.ts`) and verified in Chrome on production (section 5): toggle on → no first-party event and no Vercel script after reload |
| Attribution: `betwithgary.com` treated as the same site; a Google/Apple/Supabase login return no longer overwrites `latest_*`; `paywall_viewed` once per session per surface | Task 16 | unit-tested |
| Weekly report now also emits first-touch channels, landing pages, an X roll-up (`x` + t.co/x.com), returning-browser sessions, App Store handoffs joined to `web_link_clicks`, paywall/plan clicks, signups, shares; reads all 16 events and `web_link_clicks` | Task 17 | ran live (section 6) |

Practical benefit: searchers for home run / touchdown picks now have a real destination; every sport page reaches its recent dated listings and last slate; game pages reach the day's archive, props and Hub; Google gets one host, accurate `lastmod`, real headline text on cards and a Winners path after useful content; measurement can exclude Adam's own browsers and report acquisition end-to-end.

## 2. Already correct and preserved (not redone)

From the source audit (`SEO_GROWTH_AUDIT_2026-09-17.md` §4): game pages server-render pick, date, matchup, reasoning and result with Article + BreadcrumbList schema and a per-game 1080×1080 card image; every canonical is relative and resolved to `www.betwithgary.ai`; campaign parameters never alter canonicals; sitemaps only list canonical public pages, outage behaviour (last-good XML, cold failure ≥500) intact and re-verified by `smoke:sitemaps`; private/utility routes noindexed; `/signin` → `/account` 308; `/props` public feed, native cards, Winners boundary (no public props page can grant access; HR/TD never admitted to Winners); consent gating, sanitization and dedup of the 16 analytics events; Google login referrers already classified as referral (commit `04647d9f`); `meaningful_pick_view` / `reasoning_v2` definition untouched; pricing headline and entitlements untouched; X publisher coverage, cadence, writer and no-URL policy untouched.

## 3. Tests, checks and commits

- Web unit: **88 files / 923 tests passed** (`npm --prefix web test`, 3:10 AM at `123c75cc`); earlier gate at `bea9e4cb`: 87 / 921.
- `npm --prefix web run typecheck` exit 0; `run lint` 0 errors, the 2 known warnings (BookClient / DeleteAccount `window.location.assign`); `run build` exit 0.
- `npm run smoke:web` passed with the two new fixture assertions (`/props/home-runs` shows "Local QA Slugger", `/props/touchdowns` shows "Local QA Runner"). It had to run from a disposable worktree with a real `node_modules` (the launcher refuses `web/.env.local` by design; a symlinked `node_modules` breaks Next's request scope in dev). Documented in the measurement doc.
- `npm run smoke:sitemaps` 6/6 passed (build during outage, cold failure, recovery, last-good XML byte-identical across four warm-outage rounds).
- Fixture preview curls confirmed SSR content, canonicals, `<lastmod>` and `<pubDate>` before release.
- `node scripts/production-truth.js` (from `gary2.0`, 3:08 AM): scheduler PID 99243 on `ed2a1782`, game model Fable / props Sol, Winners worker running, 0/9 MLB picks published at 3 AM (normal), 9 pending; edge parity and support queue **unverified** for the usual reason (no Supabase CLI access token in this shell); working tree flagged for the private plist and, at that moment, the not-yet-committed baseline files.

Commits on `main` (oldest first), all with explicit pathspecs; each code task was implemented, adversarially reviewed and, where the reviewer objected, fixed and re-reviewed:

`f14a6a6f` lanes · `8febdc60` Winners invitation · `6becf182` lane pages · `981e568b` /props · `e78a4df1` llms.txt · `69a1bb66` + `66bfe87a` sport pages (review fix: "picks", not "boards") · `c05022a1` day listings · `9ad5b6d7` game pages · `9c8356eb` Hub · `fb4cbee6` card headline text · `bd34a522` host redirect · `d0ef05bf` feed pubDate · `a333f5a1` sitemap lastmod · `f9c40251` copy alignment · `c2bb9439` + `1c549595` internal exclusion (review fix: control on its own line) · `24c5d550` attribution + paywall dedup · `bea9e4cb` weekly report · `ed2a1782` documents + plan · `123c75cc` footer fix + baseline evidence. (Another session's `5e5b0c48` / `2d888a27` midnight-collector fix landed between tasks 4 and 5 and is unrelated.)

Pre-existing failures reported, not fixed: `tests/public-marketing-copy.test.ts` "labels actual previous-board picks when today is empty" fails only between midnight and 3 AM ET because `app/page.tsx` derives the previous date with `daysAgoEST(1)` while `todayEST()` rolls at 3 AM; byte-identical to the plan base, passes after 3 AM.

## 4. Prepared, awaiting Adam's explicit authorization

- **Outreach** (`SEO_OUTREACH_2026-09-17.md` + tracker CSV): the three September 16 prospects re-verified (SGPN contact form, SBJ `news@`, App Review Central free submission form only — no paid service) and rewritten in the approved product language, plus ten new prospects (Ben Fawkes' Substack, Circles Off / The Hammer, Gambling With an Edge, Sharp Football Analysis, VSiN, Front Office Sports, MacStories, TapSmart Indie Apps, Springboard by Daryl Baxter — only if the app installs from the UK store — and THE WINDOW / Matt Russell), each with fit, official route, angle and links. Thirteen tracker rows, all `prepared`, hold date 2026-09-20, send/reply/placement fields empty. Sender identity not chosen. Nothing sent.
- **Search Console indexing requests** for `/props/home-runs`, `/props/touchdowns`, `/picks/mlb`, `/picks/nfl` (section 5).

## 5. External reads done, and what still needs Adam

Done in Chrome (business Google session) at 9:10–9:45 AM, recorded in `SEO_GROWTH_AUDIT_2026-09-17.md` §7:
1. Browser QA on production at 320/390/768 px (same-origin frames) and the 1470 px window for the eight affected pages: no overflow, no clipped headings, Winners link everywhere, card flip / headline text / share controls working; consent decline → no requests, grant → one `session_started`, internal exclusion → no first-party or Vercel requests; browser restored afterwards. Screenshots in `GaryMarketing/launch-2026-09/evidence/seo-growth-2026-09-17/`.
2. Search Console: 28-day window unchanged (6 clicks / 468 impressions / 1.3% / 24.1, Aug 18–Sep 14); indexing totals unchanged (594 / 4,099); 15 URLs inspected. **Indexing requested** for `/props/home-runs`, `/props/touchdowns` and `/picks/mlb` (recorded as requested, not indexed). `/picks/nfl` is "crawled – currently not indexed" (crawled Sep 13) and its request button gave no confirmation twice — **one click by Adam in URL Inspection finishes that item**. `/props` and `/hub` have never been crawled; `/winners` is unknown to Google.
3. Vercel Analytics could not be re-read: the Chrome extension has no permission for `vercel.com`. The September 16 figures stand as the baseline.

Environment items observed live, Adam's call: `/go/app` redirects to the App Store with `ppid` but **no `ct` / `pt`** (`APP_STORE_WEB_CAMPAIGN_TOKEN` / `APP_STORE_PROVIDER_TOKEN` unset in production, as `WEB_MEASUREMENT.md` anticipated); the footer email form's runtime env is incomplete in production (the disclosure is now hidden rather than empty); Supabase CLI token for `production-truth` edge parity; the X profile link has no `utm_medium` (account setting); allowing `vercel.com` in the Chrome extension if future sessions should read Vercel Analytics.

Product decisions left as-is and flagged, not inferred: NCAAF anytime-TD picks (backend fun lane, web core; the touchdowns page is NFL-only per the brief); any TD results block (none added; HR never gets a tally); `/winners` is an indexable client-rendered shell that Google has never seen; NBA/NHL/NCAAB remain in tabs and the static sitemap; per-game X links (publisher policy is no in-thread URL); the OG image artwork still reads "Every game. Every day. On the record." (its alt matches the artwork; changing the artwork is a visual decision); `BRAND.tagline` "Find your game. See Gary's pick." differs from the site's "Your game. Gary's take."; `/app` closing heading "Every game. Every day."

## 6. Baseline after deployment (details in `SEO_GROWTH_MEASUREMENT_2026-09-17.md` §12)

Weekly funnel run at 3:05 AM from `ed2a1782` with the existing service credentials (read-only):

| Week (UTC) | Sessions | Useful | New browsers | 7-day return | Returning-browser sessions | X roll-up | Signups | Paywall sessions |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| 2026-09-07 (complete) | 24 | 1 | 4 | 1 of 4 | 12 | 2 | 1 Google started, 1 completed | 0 |
| 2026-09-14 (partial) | 8 | 0 | 2 | window open | 3 | 0 | 0 | 1 |

Consented browsers only; small samples; pre-2026-09-08 rows keep their old labels; Adam's own visits are not yet excluded in these rows. Stripe livemode active subscriptions: **0** (3:05:56 AM; the launch preview grants Winners to everyone until October 1, so access ≠ payment; Apple not joined). X publisher: 196 posts in the last 14 days, 0 containing a URL, 196 with receipts — the "content link" of §9.1 does not exist by design; share previews were verified on the destination pages.

## 7. What depends on Google or future visitors

Indexing of the two lane pages, recrawl of the sport pages with their new links, the `.com` duplicates resolving to the `.ai` canonical, `lastmod` influencing crawl priority among the ~3,993 discovered-not-indexed leaves, and any visitor or subscription change. None of this is claimed. Compare complete 28-day Search Console windows and separate branded from non-branded queries.

## 8. Next reporting window (manual; nothing scheduled)

- On or after **Monday, September 28, 2026**: `cd /Users/adam.preda/Gary2.0/web && node --env-file=../gary2.0/.env.local --experimental-strip-types scripts/weekly-funnel.mjs --week 2026-09-14` (complete 7-day return windows) and `--week 2026-09-21`.
- **October 14, 2026**: 4-week comparison; **November 11 – December 9**: 8–12 week review. Search Console: latest complete 28 days vs previous, branded vs non-branded, indexing report, the audit sample re-inspected.
- Subscriber count: the read-only SQL in the measurement doc §9 through the Supabase MCP or `psql`.
- Re-run the audit sample: `scratchpad` recipe reproduced in `SEO_GROWTH_AUDIT_2026-09-17.md` §6 (`urls.txt` + `fetch.sh`).
