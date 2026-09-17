# Gary SEO growth audit — September 17, 2026 (Workstream A)

Prepared September 17, 2026 (America/New_York) as Task 19 of `docs/superpowers/plans/2026-09-16-seo-growth-implementation.md`, against the spec `FABLE_SEO_GROWTH_IMPLEMENTATION_HANDOFF_2026-09-16.md` §4–§5. This is the page-level indexing audit, the fix ledger and the repeatable sample. It is not a ranking claim: Google crawling or indexing any of these pages later is an external outcome.

Product language used throughout: **The Picks** (Gary's game and player prop picks), **Winners** (Gary's best bets of the day; the number varies; a Winners designation is not a result), **The Hub** (insights and betting connections). Gary is an AI product operated by Gary A.I. LLC, not a person. Home run and touchdown picks are fun lanes with no public tally.

Evidence and how to read it:

- **Spec §4 tables** are copied verbatim in §1.1–1.2 with the dates the spec recorded. They are not refreshed here; refreshed Google and Vercel reads belong to Task 26 and must not overwrite these.
- **Live snapshot** = the curl probe saved under `scratchpad/live-probe/` (26 URLs, iPhone Safari user agent, no JavaScript), run 2026-09-16 at about 11:05 PM ET (server `date` headers read `Thu, 17 Sep 2026 03:05 GMT`). "SSR" means the text is present in the served HTML with `<head>`, `<script>`, `<style>` and `<svg>` stripped. Three dormant-sport pages were fetched the same way at 11:46 PM ET.
- **Source facts** (file:line) come from the Understand maps (`scratchpad/maps/*.json`), verified against `/Users/adam.preda/Gary2.0/web` at plan time (HEAD `87ecd166`).
- **Google-side columns** (Google-selected canonical, Google status, last crawl) are deliberately left as `pending URL Inspection (Task 26)`. They can only be read in Search Console on the business account.
- **Fix references** point to plan tasks. Commit SHAs are recorded in `HANDOFF_2026-09-17_SEO_GROWTH.md` (written in Task 28); every row below says `commit: see HANDOFF`.

---

## 1. Baseline

### 1.1 Website traffic (spec §4, copied verbatim)

Source: Vercel Analytics, project `gary2.0`, Production. Recorded in the spec on September 16, 2026 (ET); the spec does not state the clock time of the read.

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

### 1.2 Google Search Console (spec §4, copied verbatim)

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

Companion record: `SEARCH_CONSOLE_2026-09-16.md` (saved 2026-09-16 9:30 PM ET) adds the three-month view (June 15–September 14: 23 clicks, 972 impressions, 2.4% CTR, position 20.9), the sitemap read dates (`sitemap-index.xml` last read September 11 with 4,683 discovered; `sitemap.xml` read September 16 with 34; `feed.xml` read September 16 with 5), 104 valid breadcrumbs (September 14), and the homepage "Indexing requested" confirmation made on September 16.

### 1.3 Live snapshot, 2026-09-16 ~11:05 PM ET (added by this audit)

Discovery files, as served (probe files `body_*` and `hdr_*` in `scratchpad/live-probe/`):

| File | Status | Entries | `lastmod` | Notes |
|---|---|---:|---|---|
| `/robots.txt` | 200 | — | — | `User-Agent: *` Allow `/`; same for GPTBot, ClaudeBot, Claude-Web, PerplexityBot, Google-Extended; `Sitemap: https://www.betwithgary.ai/sitemap-index.xml`. Identical file on `www.betwithgary.com`. |
| `/sitemap-index.xml` | 200 | 3 sitemaps | none | `/sitemap.xml`, `/archive/sitemap.xml`, `/picks/sitemap/0.xml` |
| `/sitemap.xml` | 200 | **34** URLs | none | Static routes with `changefreq` + `priority`. Includes `/picks/nba`, `/picks/nhl`, `/picks/ncaab`, `/results/nhl`, `/results/ncaab`. `/winners` is not listed. `/you` and `/account` excluded. |
| `/archive/sitemap.xml` | 200 | **335** URLs | none | 16 `/archive/month/*` + 319 `/archive/YYYY-MM-DD`, span 2025-04-30 → 2026-09-16. Served `x-vercel-cache: STALE`, age 2337 (last-good XML behaviour). |
| `/picks/sitemap/0.xml` | 200 | **4,330** URLs (736,675 B) | none | The only game shard: 575 sport-day listings + 3,755 game pages. By path prefix: mlb 2,408, nba 890, ncaab 672, ncaaf 139, world-cup 122, nfl 99. Contains the day's 15 MLB game pages. |
| `/feed.xml` | 200 | **15** items | — | `<lastBuildDate>` and every item `<pubDate>` = `Thu, 17 Sep 2026 03:05:01 GMT`, the request time (`web/app/feed.xml/route.ts:19,32,45` used `new Date()`). |
| `/llms.txt` | 200 | — | — | 3,931 B; live record line "1838-1645-8 … as of 2026-09-16"; key-page list includes `/winners` and `/you`; described `/props` as "today's player props + Home Run Threats" (a Hub lane label). |

Totals: **34 + 335 + 4,330 = 4,699 sitemap URLs** at 11:05 PM ET on September 16, versus the spec's 4,683 "discovered pages" from the September 11 index read and Google's September 13 known set of 594 + 4,099 = 4,693. `<lastmod>` was present in none of the four files before Task 13.

Host behaviour (HEAD, no `-L`, 11:05 PM ET; `hosthdr_*.txt`):

| Request | Status | Location |
|---|---|---|
| `http://betwithgary.ai/` | 308 | `https://betwithgary.ai/` → 308 → `https://www.betwithgary.ai/` → 200 |
| `https://betwithgary.ai/` | 308 | `https://www.betwithgary.ai/` |
| `http://www.betwithgary.ai/` | 308 | `https://www.betwithgary.ai/` |
| `https://betwithgary.com/` | 308 | `https://www.betwithgary.com/` (not to `.ai`) |
| `https://www.betwithgary.com/` | **200**, no Location | Full site served: home body byte-identical to `.ai` (257,176 B) with only a cross-host `<link rel="canonical" href="https://www.betwithgary.ai">`; deep path `https://www.betwithgary.com/picks/mlb/2026-09-15/red-sox-at-rangers` → 200, 159,447 B, canonical → `.ai`. No host redirect existed in `web/next.config.ts:19-25` (three path redirects), `web/proxy.ts` (no routing) or `web/vercel.json`. |

Other observations from the same run: no sampled page sent an `X-Robots-Tag` header; every HTML page except `/how-it-works` was served `cache-control: private, no-cache, no-store` with `x-vercel-cache: MISS` (request-rendered; `rest()` awaits `connection()` in `web/lib/gary/supabase.ts:20`); `/how-it-works` was the only prerendered page (`x-nextjs-prerender: 1`, `x-vercel-cache: HIT`, age 2977). Four 404 probes (`/picks/mlb/2026-09-15/nobody-at-nowhere`, `/picks/mlb/2027-01-01`, `/archive/2024-01-01`, `/this-does-not-exist-xyz`) returned real HTTP 404 with `<meta name="robots" content="noindex"/>`. `/nfl` → 308 `/picks/nfl`; `/mlb` → 404.

Dormant-sport addendum, fetched 2026-09-16 11:46 PM ET with the same recipe (`scratchpad/live-probe-dormant/`): `/picks/nhl` 200 (39,524 B), `/picks/ncaab` 200 (41,279 B), `/picks/nba` 200 (41,373 B); all self-canonical, no robots meta, `Organization`/`WebSite`/`BreadcrumbList` JSON-LD, request-rendered.

---

## 2. Page-level audit table

Sample: the 26 URLs in `live-probe/urls.txt`, plus `/picks/ncaaf/2026-09-12` (fetched in the same run as `page_27`), the three dormant-sport pages (11:46 PM ET), and the two lane pages created in Task 3 (which did not exist at snapshot time). Columns follow the plan exactly. Every title below ends `| Gary AI` (omitted in the cells). "HTTP" is the no-redirect status, then the final status after redirects. "robots" covers both the meta tag and the `X-Robots-Tag` header. Byte sizes are the served HTML (`chain.txt`).

| URL | page type | indexing desirable? | HTTP | robots | declared canonical | Google-selected canonical | Google status | last crawl | source sitemap | internal referring page | visible original content (SSR) | proposed action / fix task |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | Home (navigation and start page) | Yes | 200 | none | `https://www.betwithgary.ai` (no trailing slash; the sitemap `<loc>` carries `/`; equivalent for the root) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (priority 1, daily) | Nav and footer on every sampled page (2 hrefs each) | Title "AI Sports Betting Picks for MLB & NFL"; hero "Game picks. Player props. Gary's best bets. For MLB, NFL and college football."; Offering cards for The Picks / Winners / The Hub with the approved Winners sentence; 15-game board with each take as prose; card headline only in `aria-hidden` SVG; 0 links to any date listing or game page; `Organization` + `WebSite` JSON-LD; 257,176 B | Preserved. Indexing already requested September 16; do not resubmit. Card headline as real text: Task 10 (commit: see HANDOFF). Root canonical form: no action (critic rank 46). |
| `/picks` | Today's board, all sports | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.9, daily) | Nav on every page (5 hrefs on sport pages); X profile link lands here (`content/README.md`) | Title "Today's Free Sports Picks & Analysis"; "Wed, Sep 16"; "Yesterday 8 - 7 +0.18u"; 15 game links (today's MLB) with takes as prose; headline only in SVG `<text>`; tabs link `/picks/mlb`, `/picks/nba`, `/picks/nfl`, `/picks/ncaaf`; `ItemList` JSON-LD; 353,871 B | Task 10 (headline text; commit: see HANDOFF). Otherwise preserved. |
| `/picks/mlb` | Sport page (primary "MLB picks today" destination) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.9, daily) | Home sport strip; `/picks` tabs; MLB game pages (2 hrefs); `/picks/mlb/2026-09-15` (1); `/results/mlb` (1) | Title "Free MLB Betting Picks & AI Analysis"; record line "L30 185 - 182 · ALL-TIME 1019 - 907 (53%)"; 15 game links; exactly ONE date-listing link ("Latest picks with results · 2026-09-15"); SportGuide; no `/props`, `/hub` or lane link; `ItemList` + `BreadcrumbList`; 357,751 B | Task 6: "Recent MLB boards" (last 7 dates incl. today), off-day last slate with results, `/props` + `/props/home-runs` + `/hub` sentence, Winners invitation, truthful empty copy (commit: see HANDOFF). Task 10. Request indexing (Task 26). |
| `/picks/nfl` | Sport page (off day at snapshot) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.9, daily) | Home; `/picks` tabs; NFL game page (2); `/picks/nfl/2026-09-14` (1); footer "NFL Kickoff" → `/nfl` → 308 on every page | Off-day shell "No NFL picks published today — see the graded NFL record (34 - 41) while the season's quiet."; record "L30 4 - 12 · ALL-TIME 34 - 41 (45%)"; 0 game links; 1 date link (`/picks/nfl/2026-09-14`); SportGuide; 41,367 B / 1,974 B text | Task 6 (recent boards = last 4 slates, last slate's game with result, `/props/touchdowns`, Winners); Task 14 footer link direct to `/picks/nfl` (commit: see HANDOFF). Request indexing (Task 26). |
| `/picks/ncaaf` | Sport page (off day) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.9, daily) | Home; `/picks` tabs; GSC recorded 1 click (spec §4) | Off-day shell; record "L30 25 - 43 · ALL-TIME 42 - 61 (41%)"; 0 game links; 1 date link (`/picks/ncaaf/2026-09-12`); SportGuide; 41,485 B | Task 6 (no lane page: NCAAF has no HR/TD lane; `/props` + `/hub` sentence, Winners) (commit: see HANDOFF). Not queued for an indexing request. |
| `/props` | Props board (today) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.8, daily) | Nav and footer on every page (3–4 hrefs); `/picks` "See Gary's player prop picks →" | Title "Today's Free Player Prop Picks"; "Wed, Sep 16"; "Props graded yesterday 21 - 9 +4.72u"; featured prop + 28 prop lines with full takes; no `BoardDateNotice`; no structured data; content links only `/results/audit`, `/data-sources`, `/results` (`web/app/props/page.tsx:187-189`); empty-state copy could not distinguish "no games" from "being prepared" (`page.tsx:153-160`); 354,433 B / 70,093 B text | Task 4: date notice, three truthful empty states from `fetchDailySlate`, links to `/props/home-runs`, `/props/touchdowns`, `/picks`, sport pages, Winners invitation; Task 3: `web/app/props/error.tsx` boundary (commit: see HANDOFF). |
| `/hub` | The Hub (insights and betting connections) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.8, daily) | Nav and footer on every page (4–5 hrefs) | Title "The Hub — Insights & Betting Connections"; masthead date "2026-09-16" (raw ISO); "29 OF 56 HIT YDAY"; Home Run Threats ×4, Heat Check ×14 and other lanes fully SSR'd (23,850 B text); zero outbound hrefs inside the content; no per-insight anchors; 221,789 B | Task 9: `id="insight-<row.id>"` anchors, "Gary's pick for this game →" where a published game page exists, "Today's {league} picks" link per league, Winners invitation (commit: see HANDOFF). |
| `/winners` | Winners (paid selection) | Yes as a destination; the server HTML is a loading shell | 200 | none (indexable) | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | **not in any sitemap** | Nav and footer on every page (3–4 hrefs); home Offering card "See Winners" | Title "Winners — Gary's Best Bets of the Day"; the approved sentence is SSR'd, then "Loading Gary's simulated bankroll…" and `<p role="status">Loading Winners picks…</p>`; 29,065 B / 1,127 B text; client-rendered by design (paid boundary, `WinnersClient` RPC) | No code change (spec §5.4 paid boundary; `WinnersClient` hooks untouchable). Recorded as "client-rendered by design". Product decision for Adam (Task 28): server-render a public, non-paid summary, or keep as is. Do not noindex. |
| `/pricing` | Pricing | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.7, weekly) | Footer on every page (1 href); the Winners invitation (Task 2) links `/winners`, not `/pricing` | Title "Gary AI Pricing — Winners, Gary's Best Bets"; description >300 characters; launch-preview terms; `FAQPage` JSON-LD; 57,535 B | Preserved. Measurement only: Task 16 dedupes `paywall_viewed` per session (commit: see HANDOFF). |
| `/results` | Public record | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.9, daily) | Nav and footer on every page (4–6 hrefs) | Title "Track Record — Every Pick Graded, Public"; "1,838 — 1,645 · 53% · 3,491 graded · 8 pushes · -6.1 units"; by-sport table; latest 25 graded rows as plain text with 25 game links; publication receipt sentence; bankroll widget SSRs "Loading Gary's simulated bankroll…"; links `/results.json`, `/results.csv`; 91,766 B | Preserved. Observation, no change: graded rows older than the latest 25 carry no link to their game page (`web/app/results/page.tsx:91-98, 206-216`). |
| `/results/mlb` | Sport record | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.7, daily) | `/picks/mlb` (2 hrefs); MLB game page (1); `/results` (2) | Title "MLB Baseball Picks Track Record"; all-time 1019 – 907, last 30 185 – 182; 50 graded rows as text with 50 game links; `BreadcrumbList`; 103,495 B | Preserved. |
| `/archive` | Archive index | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.8, daily) | Nav Product menu and footer on every page (2–3 hrefs) | Title "Daily Sports Pick Archive"; "319 stored days"; 319 day links + 16 month links on one page (no pagination); `CollectionPage` + `ItemList` + `BreadcrumbList`; 204,386 B | Preserved. Task 13 gives its child sitemap real `<lastmod>` (commit: see HANDOFF). |
| `/archive/2026-09-01` | Archive day (all sports) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `archive/sitemap.xml` (0.5) | `/archive`; `/archive/month/2026-09`; adjacent days (`/archive/2026-08-31`, `/archive/2026-09-02` link back); `/picks/mlb/2026-09-01` "Every sport this day" | Title "Sports Picks Archive — Tuesday, September 1, 2026"; description "15 game picks, 33 player props, 142 research notes, 48 graded results"; "238 stored items"; takes as prose, graded rows as text ("L Padres ML -136"); card headline SVG-only; 15 game links; 847,678 B / 134,693 B text. GSC: 83 impressions, 0 clicks (spec §4) | Task 10 (headline text); Task 13 (`<lastmod>` from `archive_day_index.published_at`) (commit: see HANDOFF). Otherwise preserved. |
| `/archive/month/2026-09` | Archive month | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `archive/sitemap.xml` (0.55, daily for the current month) | `/archive`; `/archive/2026-09-01` (2 hrefs); adjacent month | Title "September 2026 Sports Picks Archive"; "16 stored days"; 16 day links + "← August 2026"; 53,157 B | Preserved. Task 13 sets the month `<lastmod>` to the newest day's stored publish time (commit: see HANDOFF). |
| `/today` | Morning desk | Yes (secondary) | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.8, daily) | Nav on every page (2 hrefs); email templates link it with utm | Title "Today — Gary's Morning Sports Desk"; content is present (GARY'S PICK + takes, "Last 7 58–68 · 46%", "Last 30 215–238 · 47%") but streamed into 5 `<div hidden id="S:…">` slots after the footer (footer at byte 7,313, first "GARY'S PICK" at byte 55,346; `web/app/today/loading.tsx`); 79,832 B | No change: "streamed by design (loading.tsx)" (critic rank 45). Revisit only if `/today` is meant as a primary search destination. |
| `/press` | Press and brand kit | Yes (low priority) | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.4, weekly) | Footer on every page | Title "Press & Brand Kit"; brand facts (entity, App Store id 6751238914, @BetwithGary); reviewer walkthrough (MLB/NFL picks → game → results → methodology/corrections); live record labelled AS OF; downloadable guide; 55,742 B | Task 14: reviewer guide rewritten to the approved language with `/props`, `/props/home-runs`, `/props/touchdowns`, `/winners`, `/hub` in START HERE (commit: see HANDOFF). Page itself preserved. |
| `/how-it-works` | Methodology | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.6, monthly) | Nav and footer on every page (2–4 hrefs); SportGuide "full methodology" | Title "How Gary Works — Methodology"; the only prerendered page (`x-nextjs-prerender: 1`, `x-vercel-cache: HIT`, content-length 48,442); `FAQPage` JSON-LD | Preserved. No new guides added (spec §6.9; see `SEO_QUERY_PAGE_MAP_2026-09-17.md`). |
| `/picks/mlb/2026-09-15` | League date listing (completed day) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `picks/sitemap/0.xml` (0.5) | `/picks/mlb` ("Latest picks with results"); MLB game page (2 hrefs); `/picks/mlb/2026-09-16` (← prev); `/picks/mlb/2026-09-14` (next →); `/archive/2026-09-15` | Title "MLB Baseball Picks, Tue, Sep 15 — Every Game, Public Results" (no year); "MLB · 15 games · THE DAY · 8 - 7"; 15 plain-text rows ("8:05 PM Red Sox at Rangers Rangers ML -134 W Final 2-4"); 15 game links; prev/next; "Every sport this day"; App Store row; `ItemList` + `BreadcrumbList`; no `/results/mlb` link; 68,917 B | Task 7: year in the title, "The MLB record" → `/results/mlb`, Winners invitation; Task 13 `<lastmod>` (commit: see HANDOFF). |
| `/picks/nfl/2026-09-14` | League date listing (completed) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `picks/sitemap/0.xml` (0.5) | `/picks/nfl` (2); NFL game page (2); `/picks/nfl/2026-09-13` (next day links back); `/archive/2026-09-14` | Title "NFL Football Picks, Mon, Sep 14 — Every Game, Public Results"; "NFL · 1 game · THE DAY · 0 - 1"; row "8:15 PM Denver Broncos at Kansas City Chiefs Denver Broncos +2.5 -115 L Final 10-31"; 1 game link; "← 2026-09-13", no next link (latest slate); 35,752 B | Task 7; Task 13 (commit: see HANDOFF). |
| `/picks/mlb/2026-09-15/red-sox-at-rangers` | Game page (recent, completed) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `picks/sitemap/0.xml` (0.6) | `/picks/mlb/2026-09-15`; `/results` (latest 25); `/results/mlb` (latest 50) | H1 "Red Sox at Rangers"; "MLB · Tue, Sep 15 · 8:05 PM"; "O/U 7.5 · RL Rangers -1.5 · Globe Life Field"; `<dt>Published pick</dt><dd>Rangers ML -134</dd>`, Result Won, Final score 2-4, "✓ CASHED · BOS 2 · TEX 4"; 25 paragraphs over 200 characters; "Daily picks first stored September 15, 2026 at 3:16 PM ET"; `Article` (datePublished 2026-09-15T19:16:58Z, `isAccessibleForFree` true) + `BreadcrumbList`; og:image `/card` → 200 image/png; links `/picks/mlb` ×2, date listing ×2, `/results/mlb`; no `/archive/2026-09-15`, `/props` or `/hub` link from the content; 159,447 B | Task 8: "Every sport this day" → `/archive/<date>`, props sentence (+ lane link when the game carries an HR/TD prop), "More insights in the Hub", Winners invitation; Task 13 `<lastmod>` (commit: see HANDOFF). Content preserved. |
| `/picks/nfl/2026-09-14/denver-broncos-at-kansas-city-chiefs` | Game page (NFL, completed) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `picks/sitemap/0.xml` (0.6) | `/picks/nfl/2026-09-14`; `/results` (latest 25) | H1 "Denver Broncos at Kansas City Chiefs"; "NFL · Mon, Sep 14 · 8:15 PM"; "O/U 43.5 · SPREAD Kansas City Chiefs -2.5 · GEHA Field at Arrowhead Stadium"; Published pick "Denver Broncos +2.5 -115", Result Lost, Final 10-31; 45 paragraphs over 200 characters; `Article` + `BreadcrumbList`; `/card` 200 image/png; 231,011 B | Task 8; Task 13 (commit: see HANDOFF). |
| `/picks/mlb/2026-07-31/white-sox-at-rays` | Game page (older, completed) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `picks/sitemap/0.xml` (0.6) | `/picks/mlb/2026-07-31` (date listing) and `/archive/2026-07-31` (archive day), by the link pattern verified on the Sep 15 listing and the Sep 1 archive day; not on `/results` (latest 25) or `/results/mlb` (latest 50) | H1 "White Sox at Rays"; "MLB · Fri, Jul 31 · 7:10 PM"; "O/U 8.5 · RL Rays -1.5" (no venue in the source row); Published pick "Tampa Bay Rays Moneyline -142", Result Lost, Final 6-1, "LOST · CWS 6 · TB 1"; 39 paragraphs; "Daily picks first stored July 31, 2026 at 12:57 PM ET"; the long take appears three times in the body (card front, article, summary); `/card` 200; 165,671 B | Task 8; Task 13 (commit: see HANDOFF). Missing venue and repeated take: observation only (critic rank 46), no data rewrite (spec §7.7). |
| `/signin` | Legacy sign-in URL | No | 308 → `/account` → 200 | `/account`: `<meta name="robots" content="noindex">` | `https://www.betwithgary.ai/account` | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | none | None in the sample (site chrome links `/account?next=…&mode=signup` and `/account`); GSC listed `/signin` among the 3 "not found" URLs on September 13 (`SEARCH_CONSOLE_2026-09-16.md`) | Sign-in form SSR'd on `/account` ("Continue with Google or email"); 28,119 B | No change. The redirect already exists; Google needs to recrawl it. Expected to move from "not found" to "redirect". |
| `/picks/mlb/2026-09-16?utm_source=x&utm_medium=organic_social&utm_campaign=launch_sep26&utm_content=find_game_v1` | Campaign variant (X launch reply) | No (canonicalizes to the clean URL) | 200, query preserved, no redirect | none | `https://www.betwithgary.ai/picks/mlb/2026-09-16` (query stripped); og:url clean | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | none | External only (X reply copy in `content/README.md`); no internal href on any sampled page carries `utm_` (the only utm href is the outbound Product Hunt badge) | Visible text byte-identical to the clean URL; the only HTML difference is the RSC router payload (`utm_source=x` ×2 inside `self.__next_f.push`); 68,457 B | Preserved. No noindex and no redirect needed; campaign parameters do not create an alternate indexed copy (spec §5.6). |
| `/picks/mlb/2026-09-16` | League date listing (today at snapshot) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `picks/sitemap/0.xml` (0.5, daily) | `/picks/mlb/2026-09-15` ("2026-09-16 →"); `/archive/2026-09-16`; **not** linked from `/picks/mlb` (which linked only yesterday's listing) | Title "MLB Baseball Picks, Wed, Sep 16 — Every Game, Public Results"; "THE DAY · 6 - 6 · 3 not graded"; 15 rows with W/L/Final or "Not graded"; 15 game links; "← 2026-09-15"; 68,039 B | Task 6 (today's listing appears in "Recent MLB boards · today"); Task 7; Task 13 (commit: see HANDOFF). |
| `https://www.betwithgary.com/` | Duplicate host | No (should redirect) | 200, no Location | none | cross-host `https://www.betwithgary.ai` | pending URL Inspection (Task 26; outside the `sc-domain:betwithgary.ai` property) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | none (`.com/robots.txt` points at the `.ai` sitemap index) | External only: Vercel showed 3 of 60 visitors on the `betwithgary.com` hostname (spec §4); a legacy non-www sitemap remains recorded in GSC from 2025 (`SEARCH_CONSOLE_2026-09-16.md`) | Byte-identical to the `.ai` home (257,176 B); every path duplicated (deep game page 200, 159,447 B) | Task 11: host-matched permanent redirects in `web/next.config.ts` for `betwithgary.com` and `www.betwithgary.com` → `https://www.betwithgary.ai/:path*` (commit: see HANDOFF). Verify all four hosts × `/` and a deep path with `curl -I` after deploy (Task 24). |
| `/picks/ncaaf/2026-09-12` | League date listing (NCAAF, completed) | Yes | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `picks/sitemap/0.xml` (0.5) | `/picks/ncaaf` (2 hrefs) | Title "College Football Picks, Sat, Sep 12 — Every Game, Public Results"; "NCAAF · 19 games · THE DAY · 5 - 14"; 19 plain-text rows; 19 game links; 83,675 B | Task 7; Task 13 (commit: see HANDOFF). |
| `/picks/nhl` | Dormant sport (retired lane) | Low: an archive page with a 0-0 record; keep, never noindex | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.9, yearly) | None in the sample: retired sports are excluded from the sport tabs on other pages (`web/lib/gary/leagues.ts` `retired: true`); reachable from `sitemap.xml` and its own tab | Title "NHL Picks Archive — Gary's Graded Record"; "NHL RECORD · L30 0 - 0 · ALL-TIME 0 - 0"; "Gary no longer publishes new NHL picks."; no date links; links `/results/nhl` ×3; 39,524 B (11:46 PM ET) | No change (spec: no mass removal). Product decision for Adam (Task 28): whether NHL/NCAAB stay in `sitemap.xml`; historical URLs stay either way. |
| `/picks/ncaab` | Dormant sport (retired lane) | Low: archive page; keep | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.9, yearly) | None in the sample (same reason as NHL) | Title "NCAAB Picks Archive — Gary's Graded Record"; "ALL-TIME 269 - 263 (51%)"; "Latest picks with results · 2026-04-06" (1 date link); links `/results/ncaab` ×3; 41,279 B (11:46 PM ET) | No change; same product decision. Its 672 shard URLs (586 game pages + 86 sport-day pages) remain a useful historical record. |
| `/picks/nba` | Dormant sport (non-retired; relaunch planned) | Yes once picks resume; thin until then | 200 | none | self | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | `sitemap.xml` (0.9, daily) | `/picks` tabs and every sport page's tabs (1 href each) | Title "Free NBA Betting Picks & AI Analysis"; "No NBA picks published today — see the graded NBA record (357 - 288) while the season's quiet."; 1 date link (`/picks/nba/2026-06-13`); SportGuide; 41,373 B (11:46 PM ET) | Task 6 makes the empty copy truthful ("No NBA games on today's schedule" when the slate is empty). Tabs and sitemap membership before relaunch: product decision for Adam (Task 28). |
| `/props/home-runs` | New lane page: today's MLB home run picks (Task 3) | Yes | 404 at snapshot (route did not exist: `web/app/props` held only `page.tsx`, critic rank 4); 200 after Task 3 | after Task 3: none | after Task 3: `/props/home-runs` | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | after Task 3: `sitemap.xml` (0.8, daily); listed in `llms.txt` (Task 5) | after Tasks 4/6/8/14: `/props`, `/picks/mlb`, MLB game pages carrying an HR prop, reviewer guide | after Task 3: title "Today's MLB Home Run Picks"; masthead "Home run picks." with "MLB · <ET date>"; native `PropRow` cards filtered by `isMlbHomeRun` (Task 1); three truthful empty states (no MLB games / being prepared with first start time / unknown slate); source failure reaches `web/app/props/error.tsx`; `BreadcrumbList` always, `ItemList` only when picks exist; no results tally (HR is a fun lane); Winners invitation; guide section | Task 3 (commit: see HANDOFF). Request indexing (Task 26). |
| `/props/touchdowns` | New lane page: today's NFL anytime touchdown picks (Task 3) | Yes | 404 at snapshot; 200 after Task 3 | after Task 3: none | after Task 3: `/props/touchdowns` | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | pending URL Inspection (Task 26) | after Task 3: `sitemap.xml` (0.8, daily); `llms.txt` (Task 5) | after Tasks 4/6/8/14: `/props`, `/picks/nfl`, NFL game pages carrying an anytime-TD prop, reviewer guide | after Task 3: title "Today's NFL Anytime Touchdown Picks" (NFL-only; never first-TD; NCAAF scorer picks excluded by `isNflAnytimeTdPick`); same states, structured data and boundary as the HR lane; no TD results block | Task 3 (commit: see HANDOFF). Request indexing (Task 26). |

Task 26 inspection set (at least 12, business account, read-only apart from the four indexing requests named in the plan): `/`, `/picks/mlb`, `/picks/nfl`, `/props`, `/props/home-runs`, `/props/touchdowns`, `/hub`, `/winners`, `/archive/2026-09-01`, `/picks/mlb/2026-09-15`, `/picks/mlb/2026-09-15/red-sox-at-rangers`, `/picks/nfl/2026-09-14/denver-broncos-at-kansas-city-chiefs`, `/picks/mlb/2026-07-31/white-sox-at-rays`, `/signin`, `https://www.betwithgary.com/`. Record "indexed copy" and "live test" separately, and fill the three Google columns above in place.

---

## 3. Findings and fixes

Ranked gaps come from the critic map (`scratchpad/maps/critic.json`, ranked by value and effort). Each row names the task that carries the fix; commit SHAs are in the handoff. "Documented" means the finding is recorded here, in the measurement document or the handoff, without a code change under this plan.

| Rank | Gap (evidence) | Task | Commit | Status |
|---:|---|---|---|---|
| 1 | `www.betwithgary.com` and `betwithgary.com` serve every page as a 200 duplicate; only the `.ai` canonical tag separated them (`hosthdr_www_betwithgary_com_.txt`, `body_dotcom_game.html`; no host rule in `next.config.ts:19-25`) | Task 11: host-matched permanent redirects → `https://www.betwithgary.ai/:path*` | see HANDOFF | implemented in task 11 |
| 2 | No developer/test exclusion for first-party or Vercel analytics; every emitter gated on consent only (`analytics.ts:217,242,351`; `GrowthAnalytics.tsx:39-40`; `route.ts:14-19`; `link-attribution.ts:38-44`) | Task 15: `gary_analytics_internal_v1` + cookie, `hasAnalyticsConsent` false when internal, `beforeSend` → null, `/get` and `/c/*` skip logging, Privacy-choices toggle, tests | see HANDOFF | implemented in task 15 |
| 3 | `isLongShot` merged MLB HR and NFL anytime TD (`prop-lanes.ts:19-22`); pick-side HR test narrower than results-side `isHrLaneResult` (`results.ts:157-162`) | Task 1: `isMlbHomeRun`, `isNflAnytimeTdPick`; `isLongShot` = their union | see HANDOFF | implemented in task 1 |
| 4 | `/props/home-runs` and `/props/touchdowns` did not exist (404 live) | Task 3: two server-rendered lane pages on the existing prop feed and native `PropRow` cards | see HANDOFF | implemented in task 3 |
| 5 | New routes absent from `sitemap.ts`, the FIXED test inventory and `llms.txt`; `llms.txt:52` described `/props` as "+ Home Run Threats" | Task 3 (sitemap entries after `/props`), Task 5 (`llms.txt` key pages incl. `/picks/mlb`, `/picks/nfl`, `/picks/ncaaf`, both lanes, `/app`, `/install`) | see HANDOFF | implemented in tasks 3 and 5 |
| 6 | `/props` printed the same empty sentence for an off day and a slate still being prepared (`props/page.tsx:153-160`) | Task 3 (lane pages read `fetchDailySlate`: no-games / preparing / unknown), Task 4 (`/props` same three branches) | see HANDOFF | implemented in tasks 3 and 4 |
| 7 | No Winners invitation on game pages, sport pages, date listings, `/props` or `/hub` | Task 2 (`WinnersInvitation`, approved sentence verbatim, "See Winners" → `/winners`); placed by Tasks 3, 4, 6, 7, 8, 9 | see HANDOFF | implemented in tasks 2–4, 6–9 |
| 8 | Game page next steps stopped at the sport trio; no `/archive/<date>`, `/props`, lane or `/hub` link (`[game]/page.tsx:302-331`; `page_20/21/22.links.txt`) | Task 8 | see HANDOFF | implemented in task 8 |
| 9 | Sport pages linked exactly one date listing and, on off days, zero game pages (`page_03/04/05.links.txt`; `[sport]/page.tsx:123,196-206`) | Task 6: "Recent boards" (7 MLB / 4 football), off-day last slate with results, today included | see HANDOFF | implemented in task 6 |
| 10 | Weekly report read only 5 events and never `web_link_clicks`; no landing pages, first-touch, returning, handoffs, paywall, signups or shares (`weekly-funnel.mjs:28`; `funnel.ts:75-78`) | Task 17 | see HANDOFF | implemented in task 17 |
| 11 | Card headline (team + market) rendered only inside `<svg aria-hidden="true">` on `/picks`, `/picks/<sport>`, `/archive/<date>` (`native-headline.tsx:45-57`; 0 "Guardians ML" text nodes on `/picks/mlb`) | Task 10: `<span class="sr-only">{team} {market}</span>` beside the SVG | see HANDOFF | implemented in task 10 |
| 12 | Sparse cross-links: sport pages had no `/props` or `/hub` link; `/props` never linked `/picks`; `/hub` had zero outbound hrefs | Tasks 4, 6, 9 | see HANDOFF | implemented in tasks 4, 6, 9 |
| 13 | `paywall_viewed` fired on every `PricingPlans` mount with no dedup (`PricingPlans.tsx:14-16`) | Task 16: `logPaywallViewed` deduped per session and surface | see HANDOFF | implemented in task 16 |
| 14 | An OAuth return (`accounts.google.com` referrer) overwrote `latest_*` attribution for the rest of the session (`analytics.ts:259-264`) | Task 16: `AUTH_RETURN_HOST` excluded from fresh-entry detection; historical rows not rewritten | see HANDOFF | implemented in task 16 |
| 15 | No canonical X channel label (bio link medium "campaign", replies "organic_social", bare t.co "referral"; `funnel.ts` keys on exact values) | Task 17 (`x_channel` roll-up in the report layer, detailed rows untouched); label set documented in `SEO_GROWTH_MEASUREMENT_2026-09-17.md`; `utm_medium` on the X bio link is an account change for Adam | see HANDOFF | implemented in task 17; bio link external |
| 16 | `/props` rendered no `BoardDateNotice` while `/picks`, sport pages, Home and Today did | Task 4 (`/props`), Task 3 (both lanes) | see HANDOFF | implemented in tasks 3 and 4 |
| 17 | League date listing had no link to `/results/<sport>` (`[date]/page.tsx:129-137`) | Task 7 | see HANDOFF | implemented in task 7 |
| 18 | `/feed.xml` stamped every `<pubDate>` and `<lastBuildDate>` with the request time (`feed.xml/route.ts:19,32,45`; live: all 15 items = fetch time) | Task 12: `<pubDate>` from `archive_day_index.published_at`, omitted when unknown; `<lastBuildDate>` stays the build time | see HANDOFF | implemented in task 12 |
| 19 | `WinnersClient.tsx:139` printed "GAME WINNER" / "PROP WINNER" above every ticket, including ungraded ones | Task 14: "WINNERS PICK · GAME / PROP" (string only; hooks untouched) | see HANDOFF | implemented in task 14 |
| 20 | Manifest description and social image alt led with "every game, every day … written reasoning" (`manifest.ts:18-21`; `metadata.ts:8`) | Task 14 | see HANDOFF | implemented in task 14 |
| 21 | Footer "NFL Kickoff" → `/nfl` → 308 on every page (`Footer.tsx:12`) | Task 14: direct `/picks/mlb`, `/picks/nfl`, `/picks/ncaaf` footer links; `/nfl` redirect kept for old campaign URLs | see HANDOFF | implemented in task 14 |
| 22 | Hub rows had no anchors, no link to the day's published pick, no league links (`hub/page.tsx:66,87,108`) | Task 9 | see HANDOFF | implemented in task 9 |
| 23 | No test asserted the Vercel `beforeSend` gate returns null when consent is declined or the browser is internal | Task 15 (`tests/growth-analytics.test.ts`) | see HANDOFF | implemented in task 15 |
| 24 | `app/props` had no `error.tsx`; an outage showed the global boundary without picks/archive links | Task 3 (`web/app/props/error.tsx` with `{ error, retry }`) | see HANDOFF | implemented in task 3 |
| 25 | `/props` emitted no structured data | Task 3: `BreadcrumbList` and, when picks exist, `ItemList` on both lane pages; nothing else (no ratings, reviews or FAQ) | see HANDOFF | implemented in task 3 (lane pages) |
| 26 | Reviewer guide called Winners "a separate reviewed selection", led with reasoning, never mentioned the Hub | Task 14 | see HANDOFF | implemented in task 14 |
| 27 | No sitemap emitted `<lastmod>` although `archive_day_index.published_at` exists (`sitemap.ts:15-25`; `archive.ts:203-231`) | Task 13: `<lastmod>` from the stored publish time on archive day, month and game-shard entries; never `Date.now()`; static sitemap still omits it | see HANDOFF | implemented in task 13 |
| 28 | A corrupt HTTP-200 `prop_picks` payload renders the empty state because `parsePicksJson` is permissive (`picks-fetch.test.ts:42-45` pins it) | none | — | documented; behaviour unchanged (shared parser also feeds the archive) |
| 29 | Fixture preview had no HR or NFL anytime-TD prop, so the lane pages could not be smoke-tested populated | Task 3 (`fixture-preview.mjs`: "Local QA Slugger" HR prop, "Local QA Runner" TD prop, NFL slate row) | see HANDOFF | implemented in task 3 |
| 30 | Native card share/copy buttons build URLs without utm and emit no `share_*` events (`native-card.tsx:129-161`) | none | — | documented as intentionally unlabelled (app parity); `ShareActions` on game pages remains the measured path |
| 31 | `referrerHost` treated only the landing hostname as internal, so a `.com` ↔ `.ai` hop recorded a self-referral (`analytics.ts:97-106`) | Task 16: `OWNED_HOSTS` {betwithgary.ai, betwithgary.com} | see HANDOFF | implemented in task 16 |
| 32 | 31 dates have indexable `/archive/<date>` pages absent from the archive sitemap because the sitemap's count rule is stricter than the page's own rule (`archive.ts:152-171` vs `:220-223`) | none | — | documented; those pages stay link-discoverable via "Every sport this day" on the sport-day listing; no noindex |
| 33 | `/picks/sitemap/N.xml` returns a 200 empty `<urlset>` for any N; `/sitemap-data/*` reachable directly (`game-sitemap.ts:15`) | none | — | documented; the index lists only `0.xml`; not a source-failure case |
| 34 | 33 World Cup day pages + 89 game pages link their sport hub to `/picks/world-cup`, which 308s to `/results/world-cup` | none | — | documented; historical pages kept in the shard; breadcrumb target is a housekeeping item |
| 35 | League date-listing `<title>` omitted the year, so titles repeat across seasons (`[date]/page.tsx:26`) | Task 7 | see HANDOFF | implemented in task 7 |
| 36 | Sport page empty copy did not distinguish "no games scheduled" from "not yet published"; NBA renders it daily until relaunch | Task 6 (slate-aware copy); NBA/NHL/NCAAB tab and sitemap membership → product decision (Task 28) | see HANDOFF | implemented in task 6; decision pending |
| 37 | No test rendered the league date listing or the sport → date hop; Nav/Footer mocked to null in every page test | Tasks 6 and 7 (`sport-page-links.test.ts`, `league-day-page.test.ts`) | see HANDOFF | partly implemented; chrome and press render tests not added |
| 38 | No aggregate paid-subscriber read path; `has_winners_access` grants everyone Winners until 2026-10-01, so access ≠ paid | Task 21 documents the read-only SQL; Task 27 runs it via the Supabase MCP and labels Stripe livemode separately from Apple | see HANDOFF | documented; run in task 27 |
| 39 | `email_signup_completed.source` silently dropped when it contains `:` `/` or uppercase (`analytics-schema.ts:35,125`) | none | — | documented in the measurement document |
| 40 | Nav/footer app CTAs link `/#the-app` and are never an `app_store_handoff`; `AppLink` hard-codes one surface | none | — | documented; measured handoffs remain `/go/app` surfaces |
| 41 | `/winners` server HTML is a loading shell, indexable, linked site-wide, not in the sitemap | none (paid boundary) | — | recorded in §2; product decision for Adam (Task 28) |
| 42 | `llms.txt` omitted the active sport pages, `/app`, `/install`, `/leaderboard` | Task 5 (sport pages, lanes, `/app`, `/install` added) | see HANDOFF | implemented in task 5 |
| 43 | Empty untracked `web/app/sitemap-index.xml/` and `web/app/archive/inventory.xml/` directories; dead `CARD_BASE` in the X publisher | none | — | documented; plan forbids adding route files there; publisher untouched |
| 44 | `robots.txt` has no `Disallow` for utility routes (all noindexed by headers) | none | — | documented; optional |
| 45 | `/today` streams its desk into hidden Suspense slots after the footer (`app/today/loading.tsx`) | none | — | recorded in §2 as "streamed by design" |
| 46 | Root canonical `https://www.betwithgary.ai` vs sitemap `…/`; older game page lacks venue and repeats the take three times | none | — | equivalent root forms; observations only, no data rewrite (spec §7.7) |
| 47 | §9.1 evidence: no test guards the publisher's no-URL contract; `social_post_log.link_clicks` is structurally empty for pick threads | Task 21 (read-only SQL over `social_post_log.post_text`, last 14 days, asserting no `https?://`; `link_clicks` labelled N/A) | see HANDOFF | documented; run in task 27 |
| 48 | `useful-session.postgres.test.ts` does not apply the book-milestones migration | none | — | documented |

---

## 4. Preserved and already correct

Verified by the Understand phase (`critic.json` `already_satisfactory`, with file:line evidence) and by the live probe. These are reported as satisfactory and were not recreated.

1. **Game pages server-render pick, date, matchup, original reasoning and result** without client fetching: `PublishedPickReceipt` `<dl>` (Published pick / Published odds / Result / Final score), the matchup H1, the day label plus stored publish time, 25–45 paragraphs of reasoning, `Article` JSON-LD with `articleBody`. Live-verified on the Sep 15 MLB, Sep 14 NFL and Jul 31 MLB pages; tests `gamepage-jsonld.test.ts`, `published-pick-receipt.test.ts` (spec §5.4).
2. **League date listings and results pages render picks and results as plain text rows** ("Red Sox at Rangers Rangers ML -134 W Final 2-4", "THE DAY · 8 - 7") with per-row result letters (spec §5.4).
3. **Canonical hosts and clean canonical paths on `.ai`**: every page declares a relative canonical via `pageMetadata` resolved by `metadataBase`; campaign parameters do not change canonical, og:url or body; http → https and apex → www are 308 at the platform level; `/signin` 308 → `/account` with noindex (spec §5.6). The one genuine duplicate (the `.com` host) is Task 11.
4. **Sitemaps**: robots → sitemap index → static (34), archive (16 months + 319 dates), one 4,330-URL game shard; only canonical public pages; zero query strings, trailing slashes, duplicates or card routes; `/you`, `/account`, `/picks/world-cup` excluded; outage behaviour preserved (`rest()` throws on `!ok`, generators do not catch, `force-static` + `revalidate 600` keeps last-good XML, a cold failure returns ≥ 500, malformed inventory ids 404 before any DB read); no request-time `lastmod` anywhere before Task 13; 40,000-URL shard cap; `smoke:sitemaps` and `tests/sitemap.test.ts` cover it (spec §5.7).
5. **Real link hops already existed**: date listing → every game page + prev/next + `/archive/<date>`; game page → date listing, sport page, sport record; board cards → game page with descriptive anchor text when `pick_page_index` has the page; `/results` → latest 25 and `/results/<sport>` → latest 50 game pages; archive index → 319 days + 16 months → games; sport pages ↔ archive (spec §5.5, partial; gaps closed in Tasks 6–9).
6. **Private and utility routes are noindexed** by meta or `X-Robots-Tag` (`/you`, `/account*`, `/players/[id]`, `/email/*`, `/api/*`, `/auth/*`, `/go/app`, `/get`, `/c/[handle]`, `/sheet`, `/results.json`, `/results.csv`); invalid dates, unknown games and random paths return real HTTP 404 with noindex; no useful page carries noindex.
7. **`/props` exists on the public `prop_picks` feed** with native `PropRow` → `PropCard` → `NativePickCard`, grouped by game with a featured core prop, in nav, footer and sitemap, linked from `/picks` (spec §6.3).
8. **`isNflAnytimeTd` is NFL-only and anytime-only** (passing/rushing/receiving TD totals excluded; first-TD keys are never published; no 2+ TD market); the backend stamps every MLB `home_runs` pick `sport: 'MLB HR'` (`run-agentic-props-cli.js:469`) with line 0.5 over; pinned by `tests/picks.test.ts:58-67` (spec §6.4).
9. **`/props` shows the date, league and time per game panel, player, market, line, side, odds and full reasoning in the initial HTML** with the same native cards and Book controls; `propCardPick` labels long shots "THE LONG SHOT" (spec §6.5).
10. **A `prop_picks` HTTP failure reaches the error boundary** instead of rendering "no picks" (`featured-prop-ticket.test.ts:76-79`); the query is date-keyed (`date=eq.todayEST()`) so yesterday's row is never fetched as today's; the 3 AM ET slate clock is implemented in `dates.ts` and tested (spec §6.6).
11. **`/props` metadata**: title, description, canonical, Open Graph (shared 1200×630 image), Twitter `summary_large_image`, RSS alternate (`tests/seo-metadata.test.ts`) (spec §6.7).
12. **No public props page can grant paid access or imply Winners**: `/props` imports only public feed helpers and never mentions Winners; silver/gold finishes exist only inside `WinnersClient` behind the `get_winners_board` RPC; HR/TD props are structurally ineligible for Winners (`winnersAdmissions.js:25-26`); checkout only from `AccessCard` via edge functions with a Stripe host allowlist; `PricingPlans` CTA → `/account` (spec §7.4).
13. **Share links lead to the exact page**: `ShareActions` uses the absolute canonical URL with `utm_source=gary&utm_medium=referral&utm_campaign=matchup_page`; each game page has a 1080×1080 `/card` image (live 200 image/png) and `Article` + `BreadcrumbList` JSON-LD without a fabricated `Event`; nickname slugs `permanentRedirect` to the canonical slug (spec §7.5).
14. **App Store handoff** is first-party, consent-aware, noindexed and surface-allow-listed (`/go/app`, `/get`, `/c/[handle]`); account sign-in uses safe `next` paths; `/signin` redirects; Book CTAs on `/picks`, `/props`, `/hub`; `/install`, manifest and apple-touch-icon provide add-to-home-screen (spec §7.6, partial).
15. **Ticket and result integrity**: `PublishedPickReceipt` reads published odds from the ticket text only; doubleheader games are flagged "Game identity unresolved"; losing picks render with crack/LOST marks; `Article.isAccessibleForFree` only on free analysis (spec §7.7). No ticket/rationale disagreement was rewritten under this plan.
16. **Product language**: The Picks / Winners / The Hub are explained in the approved words on the Home Offering, `/pricing` ("Gary's best bets. That's Winners."), `/app`, `/about`, press boilerplates, root and `/picks` metadata, `llms.txt` and `AccessCard`; count language says "up to six … some days fewer or none" and "the number varies"; no "shortlist", "exactly three/four", "winners board/card" or "card is the product" strings; Gary is identified as AI with no human biography (spec §1, §3).
17. **Event inventory** is complete and enforced in three layers: 16 events in `analytics-schema.ts` with per-event allowlists and required keys, mirrored by the `web_events` CHECK constraint and the `log_web_event` validators (spec §8.1).
18. **Google account/login referrers are classified "referral", not "organic"** (`isSearchEngine` anchored to Google search roots, fixed in `04647d9f` on 2026-09-08 and tested); www ↔ apex alias is internal; explicit utm wins over an account-domain referrer; `first_*` is never overwritten (spec §8.2). Rows before 2026-09-08 may still carry `accounts.google.com` as organic and are not rewritten.
19. **Consent**: `GrowthSignals` mounts only when consent is granted; every emitter checks `hasAnalyticsConsent`; decline/revoke clears identity, attribution, session and dedup keys; `/api/analytics/event` returns 403 without the granted cookie; Vercel `beforeSend` returns null when not consented; sanitization on client, server and DB; no emails, query strings or betting details (spec §8.3).
20. **Distinct event semantics and deduplication**: `share_started` vs `share_completed`; `app_store_handoff` intent with `click_id` vs the `web_link_clicks` redirect row; `meaningful_pick_view` = five continuous foreground seconds, `measurement_version 'reasoning_v2'`, unchanged; client and DB dedup for `session_started`, `return_visit`, `meaningful_pick_view` and the three Book milestones (spec §8.5–8.6).
21. **Weekly funnel** already reported sessions, useful sessions, the 7-day return cohort, Book milestones and latest-touch channels with `partial_week`, `small_sample`, `awaiting_seven_day_window` and null-denominator labels; `npm run report:funnel` documented; no cron or monitor exists (spec §8.7 partial, §8.10).
22. **An authoritative subscription source exists**: `public.user_entitlements`, written only by `sync_subscription_access` from the Stripe webhook function and read by `get_my_access`; no new billing integration (spec §8.8).
23. **X publisher**: every-game MLB/NFL coverage, the 5-minute pregame deadline, 4-minute interval guard, publication-key dedup and the single primary writer preserved; dry-run/preview modes and read-only receipt tables exist; explicit X utm values reach analytics as source `x` (spec §9.1). Game threads carry no URL by design (`social-auto-post/index.ts:18-20, 60-67`); this plan adds none.
24. **`/press` and the reviewer guide**: every referenced asset and route exists (`GaryIconBG.png`, `gary-reviewer-guide.txt`, `/record-badge.svg`, `/results.csv`, `/results.json`, all START HERE routes); the live record is labelled AS OF with last-30 beside all-time; independent-review disclaimers present; three-step try-it walkthrough (spec §9.5). Copy alignment only in Task 14.
25. **The approved Winners sentence exists verbatim** in `components/site/Sections.tsx:105-109` and `app/winners/page.tsx:19`; Task 2 reuses it rather than writing a new one.

---

## 5. "Discovered – currently not indexed: 3,993" — what it is and is not

Figures: Google's page indexing report updated September 13 (spec §4): 594 indexed, 4,099 not indexed, of which 3,993 discovered/currently not indexed, 97 crawled/currently not indexed, 4 redirects, 3 not found, 2 noindex. Live sitemap inventory September 16 at ~11:05 PM ET: 4,699 URLs. Per-sport and per-layer counts below are from `scratchpad/maps/read_sitemaps.json`, which parsed the live shard; the arithmetic is this document's.

**It is inventory-sized.** Google's known set on September 13 was 594 + 4,099 = 4,693 URLs; the live inventory three days later was 4,699. The two are the same population: Google read the sitemap files (that is what "discovered" means) and has not yet crawled most of the leaves. The 594 indexed pages are about 12.7% of the known set (594 ÷ 4,693; arithmetic). Earlier data points for the same inventory: the sitemap index reported 4,683 discovered on Google's September 11 read (`SEARCH_CONSOLE_2026-09-16.md`), and `read_sitemaps.json` cites `HANDOFF_2026-09-06_DEPLOYMENT_RELIABILITY.md` recording 4,140 game-shard URLs and 325 archive URLs on September 6. These are not the same measure (a Google read versus a live count), so treat the map's "about 25–40 URLs per day" growth estimate as approximate; the direction is certain because every new slate adds one sport-day listing plus one page per game.

**It is not variant inflation.** The shard has zero query-string, trailing-slash, uppercase or duplicate `<loc>` entries; card image routes (`/picks/…/card`) are in no sitemap; `/archive/inventory.xml` is a sitemap alias, not a page; campaign URLs canonicalize to the clean path with identical bodies (§2, utm row); apex and `.com` hosts are outside the `sc-domain:betwithgary.ai` property's URL list (apex 308s; `.com` served twins until Task 11).

**A large share is dormant or retired sport history.** Of the 3,755 game pages in the shard, NBA 721 + NCAAB 586 + World Cup 89 = 1,396 belong to a sport that is not publishing today (37.2%; arithmetic on the map's counts). Adding their sport-day listings (NBA 169, NCAAB 86, WC 33 = 288), 1,684 of the 4,330 shard URLs (38.9%) are dormant-or-retired-sport pages. MLB carries 2,165 game pages + 243 sport-day listings; NFL 81 + 18; NCAAF 113 + 26; NHL 0. The spec's acceptance rule forbids mass deletion or noindex of useful historical records, so these stay; they simply should not be read as "important pages Google is refusing".

**Three listing layers overlap by design.** Each day has `/archive/<date>` (all sports; 319 in the archive sitemap), `/picks/<sport>/<date>` (per sport; 575 in the shard) and the game pages themselves (3,755). That is 894 listing URLs over 349 distinct dates with game pages, plus 16 month pages, competing for crawl attention with the leaves. Thirty-one dates additionally have an indexable `/archive/<date>` page that is absent from the archive sitemap (§3 rank 32); those are link-discoverable and were left alone.

**Discovery status alone proves nothing about quality, links or crawl budget** (spec §5.8). The live sample showed no server failures (every sampled URL 200 within timeout; all HTML request-rendered with `x-vercel-cache: MISS`, which is a cost per crawl hit, not an error). Crawl statistics and any 5xx history can only be read in Search Console's Crawl stats report and Vercel logs (Task 26); nothing in this audit diagnoses a crawl-budget problem.

**What this plan changed that can affect it** (all additive; commits in the handoff):

- The `.com` twin of every URL now 308s to `www.betwithgary.ai` (Task 11), so Google stops seeing a second live copy of each page.
- Archive and game-shard sitemap entries carry `<lastmod>` from the stored publish time (Task 13), the one signal Google can use to prioritise among the discovered leaves; the static sitemap still omits it, and no entry uses request time.
- `/feed.xml` items carry their real publish time (Task 12), so the feed registered in Search Console stops presenting every item as new on every read.
- Internal links from the pages Google already crawls to the pages it has not: sport pages → recent boards and the last slate's games (Task 6); date listings → the sport record (Task 7); game pages → their archive day, props, lanes and the Hub (Task 8); the Hub → today's picks and league pages (Task 9); footer → the three active sport pages (Task 14); `/props` → the lanes and sport pages (Task 4).
- Card headlines are real text on board and archive pages (Task 10), so a crawler reading the board sees "Guardians Moneyline" as HTML, not only inside an `aria-hidden` SVG.
- Two new indexable destinations with server-rendered picks (Task 3) and their listing in `sitemap.xml` and `llms.txt` (Tasks 3, 5).

**What only time and outside links can change.** Whether Google crawls and indexes the 3,993 leaves is Google's decision on its schedule; the spec cites Google's own guidance that effects take hours to months and should be assessed over weeks. Independent links (Workstream E, prepared and on hold until Adam approves dispatch after September 20) are the other lever; the Links report currently shows 38 external links, all from apple.com. Compare complete 28-day Search Console windows after Google has recrawled the changed pages: the plan schedules the first 4-week comparison around October 14 and a broader 8–12-week review, with branded and non-branded queries separated and actual counts kept beside percentages.

**What not to do.** Do not noindex or delete retired-sport or thin archive pages to make the ratio look better; do not resubmit the homepage (requested September 16); do not use bulk indexing services or an indexing API meant for other content types; request indexing only for the four materially changed URLs named in Task 26 (`/props/home-runs`, `/props/touchdowns`, `/picks/mlb`, `/picks/nfl`) and record each as "requested", never "indexed".

---

## 6. Repeatable sample

The same sample can be re-run at any time to compare status, canonical, robots, links and SSR text against this snapshot. Working directory in the recipe is the session scratchpad; substitute any writable directory.

`urls.txt` (the 26-URL sample, verbatim):

```
01 home https://www.betwithgary.ai/
02 picks https://www.betwithgary.ai/picks
03 picks_mlb https://www.betwithgary.ai/picks/mlb
04 picks_nfl https://www.betwithgary.ai/picks/nfl
05 picks_ncaaf https://www.betwithgary.ai/picks/ncaaf
06 props https://www.betwithgary.ai/props
07 hub https://www.betwithgary.ai/hub
08 winners https://www.betwithgary.ai/winners
09 pricing https://www.betwithgary.ai/pricing
10 results https://www.betwithgary.ai/results
11 results_mlb https://www.betwithgary.ai/results/mlb
12 archive https://www.betwithgary.ai/archive
13 archive_day https://www.betwithgary.ai/archive/2026-09-01
14 archive_month https://www.betwithgary.ai/archive/month/2026-09
15 today https://www.betwithgary.ai/today
16 press https://www.betwithgary.ai/press
17 how_it_works https://www.betwithgary.ai/how-it-works
18 mlb_date_0915 https://www.betwithgary.ai/picks/mlb/2026-09-15
19 nfl_date_0914 https://www.betwithgary.ai/picks/nfl/2026-09-14
20 game_mlb_0915 https://www.betwithgary.ai/picks/mlb/2026-09-15/red-sox-at-rangers
21 game_nfl_0914 https://www.betwithgary.ai/picks/nfl/2026-09-14/denver-broncos-at-kansas-city-chiefs
22 game_mlb_0731 https://www.betwithgary.ai/picks/mlb/2026-07-31/white-sox-at-rays
23 signin https://www.betwithgary.ai/signin
24 campaign_0916 https://www.betwithgary.ai/picks/mlb/2026-09-16?utm_source=x&utm_medium=organic_social&utm_campaign=launch_sep26&utm_content=find_game_v1
25 clean_0916 https://www.betwithgary.ai/picks/mlb/2026-09-16
26 dotcom_home https://www.betwithgary.com/
```

Additions used by this audit (append to `urls.txt` for future runs):

```
27 ncaaf_date_0912 https://www.betwithgary.ai/picks/ncaaf/2026-09-12
28 picks_nhl https://www.betwithgary.ai/picks/nhl
29 picks_ncaab https://www.betwithgary.ai/picks/ncaab
30 picks_nba https://www.betwithgary.ai/picks/nba
31 props_home_runs https://www.betwithgary.ai/props/home-runs
32 props_touchdowns https://www.betwithgary.ai/props/touchdowns
```

`fetch.sh` (verbatim; iPhone Safari user agent, no JavaScript; a no-redirect request first, then a followed request that saves headers and body per URL):

```bash
#!/bin/bash
cd /private/tmp/claude-501/-Users-adam-preda/9a3fc2d9-897f-4d53-8364-78910e2217ca/scratchpad/live-probe
UA="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
: > chain.txt
while read -r n slug url; do
  noL=$(curl -sS -A "$UA" -m 40 -o /dev/null -w '%{http_code} %{redirect_url}' "$url" 2>&1)
  fin=$(curl -sS -L -A "$UA" -m 60 -D "page_${n}_${slug}.hdr" -o "page_${n}_${slug}.html" -w '%{http_code} %{url_effective} %{num_redirects} %{size_download}' "$url" 2>&1)
  echo "$n $slug | noL: $noL | final: $fin" | tee -a chain.txt
done < urls.txt
```

Companion steps from the same run:

- `extract_meta.sh` (saved beside `fetch.sh`) reads each `page_*.html` and `.hdr` and prints title, description, canonical(s), robots and googlebot meta, og:image, og:url, JSON-LD block count and `@type` list, plus `x-robots-tag`, `content-length`, `cache-control`, `x-vercel-cache`, `x-nextjs-*`, `content-type`, `age`, `vary` and body bytes → `meta_report.txt`.
- Visible text: strip `<head>`, `<script>`, `<style>`, `<svg>` and tags → `page_NN_<slug>.txt`. Links: count unique `<a href>` targets, scripts excluded → `page_NN_<slug>.links.txt`.
- Discovery files: `curl -sS -D hdr_<name>.txt -o body_<name> <url>` for `/robots.txt`, `/sitemap-index.xml`, `/sitemap.xml`, `/archive/sitemap.xml`, `/picks/sitemap/0.xml`, `/feed.xml`, `/llms.txt`; count `<loc>`/`<lastmod>`/`<item>`/`<pubDate>` with `grep -c`.
- Hosts: `curl -sS -I` without `-L` on `http://` and `https://` × apex and `www` for both domains, plus one deep game path on `www.betwithgary.com`; after Task 11 every `.com` request must answer 308 with a `Location` on `www.betwithgary.ai` and the path and query preserved.
- 404 probes: a nonexistent game slug, a future date listing, an empty archive day and a random path; expect HTTP 404 with `<meta name="robots" content="noindex">`.

Record the run time in ET (the server `date` header is UTC) and keep each run in its own directory; compare `chain.txt`, `meta_report.txt` and the `.links.txt` counts between runs. "Today" surfaces (`/`, `/picks`, `/picks/mlb`, `/props`, `/today`, `/feed.xml`, the lane pages) change every day by design, so compare their structure (links, canonical, states), not their picks.

---

## 7. Deferred fields and open items

- **Google columns** (Google-selected canonical, Google status, last crawl) for every row in §2: filled in Task 26 from URL Inspection on `sc-domain:betwithgary.ai` with the business account; if that session is signed out, they stay "unavailable — business account signed out" and this document says so rather than guessing.
- **Indexing requests**: only `/props/home-runs`, `/props/touchdowns`, `/picks/mlb`, `/picks/nfl` (Task 26), each recorded as "requested (not indexed)". The homepage request of September 16 is not repeated.
- **Crawl stats and server errors** behind the 3,993 figure (spec §5.8): Search Console Crawl stats + Vercel logs, Task 26; not diagnosed here.
- **Refreshed Vercel Analytics and 28-day GSC comparison**: Task 26, recorded with exact date ranges and retrieval time, never overwriting §1.
- **Live verification of the fixes** named in §3 (host redirect on all four hosts, `<lastmod>` in the archive and game sitemaps, `<pubDate>` equal to the stored publish time, the new links on `/props`, `/picks/mlb`, `/picks/nfl`, a game page and `/hub`, the two lane URLs in `/sitemap.xml`): Task 24 after the deployment reaches READY; commit SHAs and curl output go in the handoff.
- **Product decisions for Adam** (not code defects, Task 28): NCAAF anytime-touchdown picks on the touchdowns page (backend stamps NCAAF TD as a fun lane, web keeps it core; the page stays NFL-only); any TD results block (never HR); a server-rendered public summary on `/winners`; NBA, NHL and NCAAB in the `/picks` tabs and `sitemap.xml` before the NBA relaunch; per-game links in X threads (publisher policy is no in-thread URL); `utm_medium` on the X bio link.
- **Outreach** (Workstream E) stays prepared and unsent; the September 20 campaign hold and Adam's dispatch approval are unchanged by anything in this audit.
