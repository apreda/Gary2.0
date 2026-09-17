# SEO growth measurement — September 17, 2026

Workstream D of the September 16 SEO, discovery and growth handoff (spec `/Users/adam.preda/Downloads/FABLE_SEO_GROWTH_IMPLEMENTATION_HANDOFF_2026-09-16.md`, section 8; plan `docs/superpowers/plans/2026-09-16-seo-growth-implementation.md`, Tasks 15–17 and 21). This document is the reference for what the website measures, how attribution and deduplication work, how to exclude an internal browser, how to run the weekly report, how to count paid subscribers, and how the X publisher was verified for section 9.1. Baseline numbers are deferred to Task 27 and marked as such.

All times are Eastern (ET). On September 16–17, 2026 ET is UTC−4. Source line numbers cite the checkout `/Users/adam.preda/Gary2.0` at `main` HEAD `553079a0` (analytics code last changed in `04647d9f`, September 8, 2026 6:16 AM ET), read at about 11:30 PM ET on September 16, 2026. Tasks 15–17 change some of those files; where a task moves code, the task is named and the commit is "see HANDOFF" (`HANDOFF_2026-09-17_SEO_GROWTH.md`, written in Task 28).

This document supersedes nothing. `WEB_MEASUREMENT.md` (September 4–5) remains the record of the original instrumentation and its first baseline; the definitions here are the same definitions, restated with the three corrections below.

## 1. What changed in this pass

| Change | Task | Files | Commit |
|---|---|---|---|
| Internal-test exclusion for first-party events, `/go/app`, `/get`, `/c/*`, Vercel Analytics and Speed Insights, plus a control on the Privacy choices panel and a `beforeSend` test | 15 | `web/lib/gary/analytics-consent.ts`, `web/components/GrowthAnalytics.tsx`, `web/lib/gary/link-attribution.ts`, `web/app/get/route.ts`, `web/app/c/[handle]/route.ts`, tests `useful-session.test.ts`, `growth-analytics.test.ts`, `app-store.test.ts` | see HANDOFF |
| Attribution corrections: `betwithgary.com` treated as an owned host; an OAuth return no longer refreshes `latest_*`; `paywall_viewed` deduplicated per session | 16 | `web/lib/gary/analytics.ts`, `web/lib/gary/analytics-consent.ts`, `web/components/PricingPlans.tsx`, tests `analytics.test.ts`, `useful-session.test.ts` | see HANDOFF |
| Weekly report widened to acquisition (first touch, landing pages, X roll-up), returning browsers, App Store handoffs joined to redirect rows, paywall and plan selection, signups and shares; the reader fetches all 16 events and `web_link_clicks` | 17 | `web/lib/gary/funnel.ts`, `web/scripts/weekly-funnel.mjs`, test `funnel.test.ts` | see HANDOFF |

Not changed: the 16 event names, their property allowlists, the server parser, the database functions and indexes, the `meaningful_pick_view` / `reasoning_v2` definition, the consent model, the sanitization layers, the X publisher, prices, entitlements and pick generation. No new migration, cron job, monitor or vendor was added.

## 2. Event inventory

Sixteen event names are the single source of truth in `web/lib/gary/analytics-schema.ts:1-18` (`WEB_EVENTS`), with per-event allowed keys at `:54-71`, required keys at `:73-90`, and the same list enforced by the `web_events` CHECK constraint (`gary2.0/supabase/migrations/20260905125323_consented_book_milestones.sql:3-10`) and re-validated inside `log_web_event` (`:74-181`). Thirteen attribution keys (`session_id`, `first_`/`latest_` × `source`, `medium`, `campaign`, `content`, `referrer`, `landing`; `analytics-schema.ts:38-52`) are allowed on every event and merged automatically by `trackWebEvent` (`web/lib/gary/analytics.ts:218-222`).

Every emitter is gated by optional analytics consent (`hasAnalyticsConsent()`), and after Task 15 also by the internal-test flag (section 6). Nothing below fires before consent, after a decline, or from an excluded browser.

| # | Event | Allowed properties (required in bold) | Where it fires (file:line at HEAD 553079a0) |
|---|---|---|---|
| 1 | `session_started` | **path**, **session_id** | `analytics.ts:269` inside `initializeGrowthAnalytics` when a session is created: no prior session or 30 minutes idle (`:254`). Called on every pathname change and on tab return (`GrowthAnalytics.tsx:29`, `:31`), and by `logMeaningfulPickView` (`:296`) and `logBookMilestone` (`:310`). |
| 2 | `meaningful_pick_view` | **path**, **content_type**, measurement_version | `analytics.ts:304` from `logMeaningfulPickView`, only for a permanent game path `/picks/<sport>/<yyyy-mm-dd>/<game>` (`:44`, `:295`). Triggered by `MeaningfulPickView.tsx:13` after `observeReading` (`reading-visibility.ts:4-42`). Mounted on the card back when it is flipped and expanded and links to a game page (`components/picks/native-card.tsx:308-323`) and on the game page's reasoning (`app/picks/[sport]/[date]/[game]/page.tsx:241`, `:252`). Always `content_type: 'pick'`, `measurement_version: 'reasoning_v2'`. |
| 3 | `signup_started` | **method** (`email` or `google`) | `app/account/SignInForm.tsx:53` (Google, sign-up mode only) and `:76` (email). |
| 4 | `signup_completed` | **method** | `SignInForm.tsx:86` when an email sign-up returns a session immediately; otherwise `analytics.ts:271-280` reads a `?_gary_signup=email|google` marker that `app/auth/callback/route.ts:25-30` appends only when the request carried `gary_analytics_consent=granted`, the account is at most 26 hours old and a signup method is present. |
| 5 | `email_signup_completed` | **cadence** (`daily`, `weekly`, `both`), source | `components/EmailSignupTracker.tsx:19`, mounted by `app/email/confirm/page.tsx:48` only when the confirmation succeeded. |
| 6 | `book_action_started` | **action** (`tail`, `fade`), **content_type** (`game`, `prop`), item_id, path | `components/book/TailFadeRow.tsx:290` (game, `item_id` = lowercased pick id) and `:450` (prop, no item id). Fires on arming, before the sign-in check. |
| 7 | `first_book_action` | same as 6 | `TailFadeRow.tsx:318` (game) and `:477` (prop) after the Book write succeeds; once per browser. |
| 8 | `book_opened` | **path** (must be `/you`), **session_id** | `logBookMilestone` (`analytics.ts:308-317`; requires a visible tab) from `components/book/BookClient.tsx:156` when the Book loads on open or refocus. Automatic minute refreshes never log. |
| 9 | `manual_bet_saved` | **path** (`/you`), **session_id** | `logBookMilestone` from `components/book/LogBet.tsx:133` after a new manual entry saves (not edits). |
| 10 | `manual_bet_settled` | **path** (`/you`), **session_id** | `logBookMilestone` from `components/book/BookSlips.tsx:61` after a confirmed non-pending result saves. |
| 11 | `return_visit` | **path**, **days_since_last_visit** (integer 0–3650) | `analytics.ts:282-287`: a new session, an existing attribution record, and at least 4 hours since the browser was last seen (`RETURN_VISIT_AFTER_MS`, `:21`). |
| 12 | `share_started` | **method** (`native`, `copy_link`), **surface**, **content_type** (`pick`, `dataset`), item_id, **path** | `components/ShareActions.tsx:91` (copy link) and `:114` (native share sheet). Mounted on the game page (`page.tsx:202-210`, surface `matchup_page`, content `pick`) and on `app/results/audit/page.tsx:52-60` (surface `results_audit`, content `dataset`). |
| 13 | `share_completed` | same as 12 | `ShareActions.tsx:95` (copy succeeded) and `:118` (share sheet resolved; an `AbortError` leaves only `share_started`). |
| 14 | `app_store_handoff` | **surface**, **click_id**, **destination** (`app_store`), plan, sport, billing | `beginAppStoreHandoff` (`analytics.ts:349-360`) from `components/AppStoreButton.tsx:21` and `components/site/AppLink.tsx:13` on click; the returned `/go/app?surface=…&measure=1&click_id=…&first_*&latest_*` path (`:331-341`) is the redirect. Surfaces in use: `home_app_section`, `app_page_hero`, `app_page_footer`, `contact`, `how_it_works`, `nfl_page_hero`, `nfl_page_footer`, `game_page_<slug>`, `league_day_<slug>`, `pricing_footer` (allowlist `lib/gary/app-store.ts:4-31`). `plan`, `sport`, `billing` are allowed but no caller passes them. |
| 15 | `paywall_viewed` | **surface**, **trigger** | `components/PricingPlans.tsx:14-16` on mount, `{surface:'web', trigger:'pricing_page'}`; `PricingPlans` is mounted only at `app/pricing/page.tsx:101`. Task 16 routes this through `logPaywallViewed` (section 7). |
| 16 | `plan_selected` | **surface**, **plan** (`all_access`, `all_access_annual`, `single`), sport, **billing** (`annual`, `monthly`) | `PricingPlans.tsx:18-27` on every plan click. A plan click is an intent; checkout does not start on the website (`PricingPlans.tsx:29-33` sends the visitor to `/account`). |

Rows outside `web_events`: `web_link_clicks` receives one row per App Store redirect. `/go/app` writes only with the consent cookie, `measure=1` and a valid `click_id` (`app/go/app/route.ts:24-35`; joinable to event 14 on `click_id`). `/get` (X bio short link, surface `x_bio`, `app/get/route.ts:11-27`) and `/c/<handle>` (creator link, surface `creator`, `app/c/[handle]/route.ts:10-24`) write on every GET without a consent check; `app/privacy/page.tsx:80-88` discloses this. `HEAD` requests never write (`go/app:44-46`, `get:34-39`, `c:31-37`). No row stores a user agent, a network address, an account id, an email, a query string or a referrer path (section 10).

Not measured, by design or by omission: the native card's own copy and share buttons (`native-card.tsx:296-305`) do not emit `share_*`; so `share_*` covers `ShareActions` surfaces only. Installs, purchases and in-app activity are not website events (section 9). `email_signup_completed.source` is dropped client-side when it contains `:`, `/` or uppercase (confirm page allows them, schema token regex `analytics-schema.ts:35` does not); only simple sources are recorded.

## 3. Definitions that did not change

- **Session.** A per-tab session id in `sessionStorage` (`gary_session_v1`, `analytics.ts:17`, `:247-256`) that renews after 30 minutes without measured navigation or foreground activity. Separate tabs can be separate sessions. A session is observed browser use, not a person.
- **Useful session** = `meaningful_pick_view` with `measurement_version = 'reasoning_v2'`: pick reasoning visible for five continuous foreground seconds (`READING_INTERVAL_MS = 5_000`, `reading-visibility.ts:1`; timer restarts on hide or scroll-away, `:11-27`; at least 32 px intersecting, tab visible). A route load alone does not count; closed content, a thin sliver and a hidden tab do not count. This definition is unchanged. Any other pick engagement measure must be a separately named and versioned event, never a redefinition of this one (spec 8.6). The report counts only `reasoning_v2` (`funnel.ts:33`).
- **Return cohort.** The browser's first observed `session_started` in the reporting week, then another session at least 24 hours and less than 7 days later; only completed 7-day windows enter the denominator (`funnel.ts:57-68`). "First observed" is not proof of a first-ever visit.
- **Book milestones.** Session counts of `/you` activity, not bet counts; no selections, odds, stakes, sportsbook, notes or outcomes are accepted (schema `analytics-schema.ts:103`; DB `20260905125323:159-161`).
- **Identity.** A pseudonymous browser UUID in `localStorage` (`gary_web_id`) that exists only after consent; it resets when storage is cleared, and a blocked storage API yields a per-page ephemeral id (`analytics.ts:61-72`).

## 4. Attribution rules

Classification lives in `attributionTouch` (`web/lib/gary/analytics.ts:119-159`). Only a hostname (www stripped, at most 253 characters) and a pathname are kept; full URLs, query strings, fragments and referrer paths are never stored (`:86-106`).

1. **Campaign first.** If any of `utm_source` (or `src`), `utm_medium`, `utm_campaign`, `utm_content` is present: `source = utm_source ?? src ?? referrer host ?? 'campaign'`, `medium = utm_medium ?? 'campaign'`, plus campaign, content and referrer host when present (`:133-147`). Explicit campaign values win over any referrer, including an account-domain referrer (tested `tests/analytics.test.ts:56-63`).
2. **Then external referrer.** `medium = 'organic'` when the host is a search engine, else `'referral'`; `source` = the host (`:149-156`).
3. **Else direct.** `{ source: 'direct', medium: 'none' }` (`:158`).

**Google search roots only.** `isSearchEngine` (`:108-113`) matches `google.com`, `google.cat`, `google.<cc>`, `google.co.<cc>`, `google.com.<cc>`, plus `bing.com`, `duckduckgo.com`, `search.yahoo.com`, `ecosia.org` and `search.brave.com`. `accounts.google.com`, `docs`, `mail`, `drive` and `calendar` subdomains are `referral` (tested `analytics.test.ts:46-54`). This correction shipped in `04647d9f` on September 8, 2026.

**Owned hosts are internal (Task 16, commit: see HANDOFF).** `referrerHost` already dropped a referrer equal to the landing host with www stripped (`:97-106`, tested `:71-79`). Task 16 adds `OWNED_HOSTS = {betwithgary.ai, betwithgary.com}` so a hop from `betwithgary.com` to `www.betwithgary.ai` (or the reverse) is no longer recorded as a `betwithgary.com` referral; with no campaign parameters it becomes `direct`/`none` (test: "treats the legacy betwithgary.com host as the same site"). Task 11 separately redirects both `betwithgary.com` hosts to `https://www.betwithgary.ai` with a permanent redirect, so new traffic should stop arriving on the alias at all.

**First versus latest.** Both are stored (`AttributionState`, `:38-42`; `localStorage gary_attribution_v1`). `first` is never overwritten (`:263`). `latest` refreshes when there is no previous record, when a new session starts, when the URL carries explicit campaign parameters, or on the first initialization of a document that arrived with an external referrer (`:259-264`). All twelve `first_*`/`latest_*` keys ride on every event (`:197-213`). The report's `channels` rows group by `latest_*`; Task 17 adds `first_touch_channels` grouped by `first_*` (section 8).

**Auth return no longer refreshes `latest_*` (Task 16, commit: see HANDOFF).** Before Task 16, landing on `/account` after Google or Apple sign-in carried `document.referrer = accounts.google.com`, which counted as a fresh external entry and overwrote `latest_*` to `accounts.google.com`/`referral` for the rest of the session, so a later `signup_completed`, `plan_selected` or `app_store_handoff` was channel-attributed to the login provider (`first_*` was preserved). Task 16 adds `AUTH_RETURN_HOST` (`accounts.google.com`, `appleid.apple.com`, `*.supabase.co`) and excludes those referrers from the fresh-external-entry rule, so a browser that arrived from an X campaign keeps `latest_source: x` through the OAuth round-trip (test: "does not let an OAuth return overwrite the campaign that brought the browser").

**Historical rows are not rewritten.** Three cohorts of stored rows carry values the current code would not produce, and none is edited (spec 8.9):

- Rows created before the `04647d9f` deploy (September 8, 2026, about 6:16 AM ET) may carry `first_source`/`latest_source = accounts.google.com` with `medium = organic`. The stored medium alone cannot tell an inferred value from an explicit one (comment at `tests/analytics.test.ts:64-68`). If a pre-September-8 organic figure is ever needed, derive it from the `*_source` hostname with the current `isSearchEngine` rule at report time.
- Rows created before the Task 16 deploy may carry `latest_source = accounts.google.com`/`referral` after a sign-in, and `latest_source = betwithgary.com`/`referral` after a host hop. Read `first_*` for acquisition on those rows.
- Rows created before the Task 15 deploy include any consented visits from Adam's own browsers; the internal exclusion has no retroactive effect (section 6).

## 5. X label set and the report roll-up

X traffic reaches the website under several labels because the links themselves differ. None of the automated pick threads carries a URL (section 11), so every X-labelled website session comes from a manual link.

| Origin | Link | Stored `latest_source` / `latest_medium` / `latest_campaign` / `latest_content` |
|---|---|---|
| Launch replies (`content/README.md:23-29`) | `https://www.betwithgary.ai/picks?utm_source=x&utm_medium=organic_social&utm_campaign=launch_sep26&utm_content=find_game_v1` (also `reasoning_v1` → `/picks`, `your_book_v1` → `/you`, `record_v1` → `/results`) | `x` / `organic_social` / `launch_sep26` / the creative token |
| X profile website field (`content/README.md:59`) | `https://www.betwithgary.ai/picks?utm_source=x&utm_content=bio_v1` (no `utm_medium`) | `x` / `campaign` / (none) / `bio_v1` |
| Any bare website URL clicked on X (no parameters) | referrer `t.co` (or `x.com`, `twitter.com`, `mobile.twitter.com`) | `t.co` / `referral` / (none) / (none) (tested `analytics.test.ts:46-54`) |
| X bio App Store short link | `https://www.betwithgary.ai/get` → App Store 302 | not a `web_events` row; a `web_link_clicks` row with surface `x_bio`, `ct` = `APP_STORE_X_BIO_CAMPAIGN_TOKEN` or `x_bio` (`app/get/route.ts:11-27`, `lib/gary/app-store.ts:91-97`) |
| Unit-test fixture only (`tests/analytics.test.ts:7`, `:58`) | `utm_medium=social` | not a live link; do not read it as the channel's label |

Rules: never relabel X traffic as a new channel (`content/README.md:31`); never rewrite stored rows; keep the detailed channel rows exactly as stored. **Task 17 (commit: see HANDOFF)** adds one reporting-side roll-up, `x_channel`, defined in the report output itself as "latest_source x, or a t.co/x.com/twitter.com source or referrer; the detailed channel rows are not relabelled" (`X_HOSTS = {t.co, x.com, twitter.com, mobile.twitter.com}`). It sums the three label rows above into one sessions/useful-sessions figure alongside, not instead of, the detailed rows. Share links generated on the website are a separate channel (`utm_source=gary&utm_medium=referral&utm_campaign=<surface>`, `components/ShareActions.tsx:29-36`) and are not part of the X roll-up even when shared on X, because the parameters win over the `t.co` referrer.

Open account-level decision (not code; listed for Adam in the handoff): adding `utm_medium=organic_social` to the X profile website field would make the bio link land in the same detailed row as the launch replies. Until then the `x_channel` roll-up is the figure to quote for "X". The remaining launch replies stay held until September 20, 2026 (`content/README.md:3`); no new campaign link or label was created in this pass.

## 6. Internal-test exclusion (Task 15, commit: see HANDOFF)

Before Task 15 there was no developer or test exclusion anywhere: every emitter, both `beforeSend` callbacks, `/api/analytics/event` and `/go/app` gated on consent only, and the only way to stop sends from a test browser was to decline analytics, which conflates internal with declined and also disables Speed Insights (evidence: grep of `web/app`, `components`, `lib`, `scripts`, `vercel.json`, `next.config.ts` for `va-disable`, `internal`, `opt_out`; vendored `@vercel/analytics` 2.0.1 contains no disable string).

**What the flag is.** `localStorage['gary_analytics_internal_v1'] = '1'` mirrored by a same-site cookie `gary_analytics_internal=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure` (constants `ANALYTICS_INTERNAL_KEY`, `ANALYTICS_INTERNAL_COOKIE` in `web/lib/gary/analytics-consent.ts`). It is a deliberate, explicit, per-browser opt-out. It never excludes an inferred group (no desktop, country, network or user-agent rule; spec 8.4).

**How to enable it.** Either:

1. On any page, open **Privacy choices** (the small fixed control at the bottom-left of the page; it is the consent prompt itself on a first visit) and use the third, quieter control under the two buttons: **"Internal testing? Exclude this browser from analytics"**. When the flag is on the same control reads **"Internal testing: this browser is excluded from analytics. Include it again"**, and clicking it clears the flag.
2. Or, from the browser console on `https://www.betwithgary.ai`:

```js
localStorage.setItem('gary_analytics_internal_v1','1'); document.cookie='gary_analytics_internal=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure'
```

To include the browser again, use the same control, or `localStorage.removeItem('gary_analytics_internal_v1'); document.cookie='gary_analytics_internal=; Path=/; Max-Age=0; SameSite=Lax; Secure'`. The flag survives a consent decline on purpose (`ANALYTICS_INTERNAL_KEY` is not in any clear list), so an internal browser stays excluded regardless of the consent choice it makes afterwards.

**What it covers.** `hasAnalyticsConsent()` returns `false` whenever the browser is internal, so one predicate gates every client emitter:

- First-party events: `trackWebEvent`, `initializeGrowthAnalytics` (no session, no `session_started`, no `return_visit`), `logMeaningfulPickView`, `logBookMilestone`, `logSignupCompleted`, `logFirstBookAction`, and every `log*` helper built on `trackWebEvent`. No identity is created and no storage key is written.
- App Store handoffs: `beginAppStoreHandoff` returns the unmeasured `/go/app?surface=…` path (no `measure=1`, no `click_id`), so `/go/app` writes no `web_link_clicks` row.
- Server side: `hasGrantedAnalyticsCookie` returns `false` when the internal cookie is present, so `/api/analytics/event` answers 403 to anything that still arrives, and `shouldTrackStandardHandoff` is false for `/go/app`. `/get` and `/c/<handle>` skip their `after()` write when the request carries the internal cookie (`hasInternalAnalyticsCookie`).
- Vercel Analytics and Speed Insights: `GrowthSignals` mounts only when consent is granted **and** the browser is not internal, so a browser flagged before the page loads never injects `/_vercel/insights/script.js` or the Speed Insights script. If the scripts are already present in an open page, both `beforeSend` callbacks return `null` (the vendor-documented cancel: `@vercel/analytics/dist/index.d.ts:12`, `:52`; `@vercel/speed-insights/dist/index.d.ts:20`), which is asserted by `tests/growth-analytics.test.ts`.

**Exact limitations.**

1. A Vercel pageview that fires before React registers `beforeSend`. The remote `/_vercel/insights/script.js` is not vendored and cannot be inspected offline; the supported hook is `beforeSend`. If the flag is turned on in a page where the scripts were already injected earlier in that document (consent was granted, then the toggle was clicked), the pageview already sent for that document stands and only later events are cancelled. Reload after toggling. A browser flagged before load has no such gap because the scripts are never injected.
2. Other devices, browsers and profiles are separate. The flag is per browser profile; each internal browser must be flagged on its own (phone Safari, a second Chrome profile, a private window).
3. Cleared storage. Clearing site data, cookies or using a private window removes the flag; the browser counts again until it is re-flagged. The in-memory fallback lasts only for the current page.
4. No retroactive effect. Rows written before the Task 15 deploy from Adam's browsers remain in `web_events`, `web_link_clicks` and the Vercel dashboards; reports over those windows must say so (section 8). Rows are never deleted or edited.
5. Server-side campaign links from a browser without the cookie. `/get` and `/c/<handle>` are documented public tracked links; a click from a browser that does not carry the internal cookie (for example X's in-app browser on a phone that was never flagged) is logged exactly as the privacy page says.
6. The `_gary_signup` marker. `app/auth/callback/route.ts:27` parses the consent cookie itself rather than through `hasGrantedAnalyticsCookie`, so an internal browser that signed in with consent granted still receives the `?_gary_signup=<method>` marker on `/account`. No event is sent, because `initializeGrowthAnalytics` and `logSignupCompleted` both return early when `hasAnalyticsConsent()` is false. The marker is stripped from the address bar only after a consented `initializeGrowthAnalytics` run (`analytics.ts:271-280`) or on a decline (`GrowthAnalytics.tsx:45-50`, `:68-72`), so on an internal browser it can stay visible until the next navigation. It is harmless: it carries only the word `email` or `google`.
7. Vercel dashboards have no per-browser exclusion of their own; the only supported client-side gate is `beforeSend`. Vercel preview deployments run with `NODE_ENV=production`, so a consented preview visit reaches the Preview environment; read Production only.
8. The iOS app is out of scope; the flag is a website mechanism.

**Privacy page.** `app/privacy/page.tsx:80-88` is unchanged. It continues to say that `/get` and `/c/<handle>` record an aggregate click even when no analytics choice is available on the redirect; that remains true for the public. The internal cookie exists only on browsers Adam flags himself, so the disclosure does not need a new sentence.

## 7. Deduplication and double-fire protection, per event

| Event | Client protection | Database protection | Report treatment |
|---|---|---|---|
| `session_started` | `sessionStorage gary_session_v1 {id, lastSeenAt}`: a reload within 30 minutes reuses the id (`analytics.ts:247-256`) | Unique partial index `web_events_session_milestone_idx` on (identity, event, session_id, path-for-views) for `session_started`, `return_visit`, `meaningful_pick_view` (`20260904225312:12-16`) with `INSERT … ON CONFLICT DO NOTHING` (`20260905125323:189-191`); verified `tests/useful-session.postgres.test.ts:41-52` (6 rows from 9 logs) | one session per (identity, session_id) |
| `meaningful_pick_view` | once per mount until hidden or scrolled away, then re-armable (`reading-visibility.ts:5-27`); key `gary_meaningful_view_v1:<session>:<path>` in `sessionStorage` plus memory (`analytics.ts:297-303`; works with storage blocked) | same index, per (identity, session_id, path) | a session is useful once, however many reads |
| `return_visit` | at most once per new session (`:282-287`) | same index, per (identity, session_id) | counted as events |
| `book_opened`, `manual_bet_saved`, `manual_bet_settled` | memory key `book:<event>:<session>` (`:313-315`) | unique partial index `web_events_book_milestone_idx` (identity, event, session_id) (`20260905125323:12-14`) | sessions with activity |
| `signup_completed` | `localStorage gary_signup_completed_v1:<method>` once per browser and method (`:371-373`) | none | counted by method |
| `first_book_action` | `localStorage gary_first_book_action_v1` once ever per browser (`:392-393`) | none | counted |
| `email_signup_completed` | `sessionStorage gary_email_signup_tracked:<cadence>:<source>` (`EmailSignupTracker.tsx:12-15`) | none | counted by cadence |
| `paywall_viewed` | **Task 16 (commit: see HANDOFF):** `logPaywallViewed(surface, trigger)` keys `gary_paywall_v1:<session>:<surface>:<trigger>` in `sessionStorage` plus memory; a reload of `/pricing` within the session adds no row (test: "records one paywall view per session across reloads"). Before Task 16 every mount was a new row. | none (no migration added) | `paywall_sessions` = distinct session ids, which is also correct for pre-Task-16 rows |
| `plan_selected` | none: each click is a distinct intent | none | `plan_selection_clicks` and `plan_selection_sessions` both reported |
| `app_store_handoff` | none: each click mints a fresh `click_id`; each row is a distinct intent | `web_link_clicks.click_id` UNIQUE (`20260903180543:281`) for the companion redirect row | `handoff_clicks`, `handoff_sessions`, and `redirects_logged` (joined on `click_id`) |
| `share_started`, `share_completed` | none; `started` and `completed` are distinct steps, and a cancelled share sheet leaves only `started` | none | both counted, by surface and method |
| `book_action_started`, `signup_started` | none (intents) | none | counted |

Identity caveat: if `localStorage` throws, the identity is a per-page ephemeral UUID (`analytics.ts:70-71`), so a hard refresh in that browser yields a new identity and a new session row.

Distinct semantics kept distinct (spec 8.5): a card display is not an event; a reasoning read is `meaningful_pick_view`; a share-sheet open is `share_started`; a completed copy or share is `share_completed`; an App Store click is `app_store_handoff` (intent) and the redirect is a `web_link_clicks` row; an install and a purchase are not observable on the website.

## 8. Weekly report

**Command** (from the repository root, no secrets printed or copied; the backend env file is read by Node only):

```sh
cd /Users/adam.preda/Gary2.0/web && node --env-file=../gary2.0/.env.local --experimental-strip-types scripts/weekly-funnel.mjs --week 2026-09-07
```

Equivalent when the two variables are already in the environment: `npm run report:funnel -- --week 2026-09-07` (`web/package.json:11`). Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Without `--week` the default is the previous complete Monday–Sunday UTC week. The script makes GET requests only, paginates by id in pages of 1,000, stops rather than printing partial totals past 250,000 rows, and never prints browser identities (`tests/funnel.test.ts`). No scheduler, cron job or monitor runs it; it is a manual command.

**Weeks are UTC.** `week_start_utc` is Monday 00:00 UTC (`funnel.ts:16-20`). While ET is UTC−4 (through November 1, 2026), the week `2026-09-07` covers Sunday, September 6 at 8:00 PM ET through Sunday, September 13 at 8:00 PM ET; `2026-09-14` covers Sunday, September 13 at 8:00 PM ET through Sunday, September 20 at 8:00 PM ET. State the offset whenever a report is quoted in ET; the stored labels are not changed. The read horizon is the earlier of now and week start + 14 days, which is enough for the 7-day return window.

**What the report contains.** Existing keys are unchanged: `week_start_utc`, `week_end_exclusive_utc`, `as_of`, `partial_week`, `definitions`, `sessions`, `useful_sessions`, `useful_session_percent`, `small_sample`, `personal_tracking{…}`, `cohort{…}`, `channels[…]` (by `latest_*`). Task 17 (commit: see HANDOFF) extends the reader to all 16 `WEB_EVENTS` plus a second paginated read of `web_link_clicks` for the window, and adds:

| Key | Meaning | Denominator and labels |
|---|---|---|
| `first_touch_channels` | sessions in the week grouped by `first_source`, `first_medium`, `first_campaign`, `first_content` | the browser's first stored touch, which can predate the week |
| `landing_pages` | sessions and useful sessions by `latest_landing`, top 20 | pathname only |
| `x_channel` | roll-up defined in section 5 | sums rows; detailed rows unchanged |
| `returning` | `sessions_from_returning_browsers` (week sessions whose browser had a `session_started` before the week) and `return_visit_events` | distinct from the 7-day cohort return |
| `app_store` | `handoff_clicks`, `handoff_sessions`, `redirects_logged` (handoffs whose `click_id` has a `web_link_clicks` row in the window), `by_surface`, `tracked_links` (redirect rows by surface and `ct`, including `/get` and `/c/*`) | installs and purchases are not observable here; the output states it |
| `paywall` | `paywall_sessions` (distinct sessions), `plan_selection_clicks`, `plan_selection_sessions`, `by_plan` (plan, billing, sport) | "A plan click is not a purchase. Paid subscriptions come only from the Stripe-backed user_entitlements table." (printed in the output) |
| `signups` | `signup_started` and `signup_completed` by method; `email_signup_completed` by cadence | consented browsers only |
| `shares` | `started`, `completed`, `by_surface` (surface, method, event) | `ShareActions` surfaces only |

**Reading rules that must accompany any quoted number.** Consent scope (consented browsers only; declined consent, blocked storage, failed requests, other devices and the iOS app are outside); partial week when `partial_week` is true; immature cohorts (`awaiting_seven_day_window`; a return percentage exists only for completed windows); small samples (`small_sample` flags under 20 observations; rates are `null` on an empty denominator); internal exclusion not active for historical rows (any week before the Task 15 deploy may include Adam's own consented visits); first-touch values can predate the week; UTC week boundaries; `x_channel` is a roll-up. Percentages at these volumes are directional only; report counts alongside them.

**When to run next.** `--week 2026-09-07` (complete week) and `--week 2026-09-14` (partial) are the Task 27 baseline. Run `--week 2026-09-14` again on or after September 28, 2026 so its 7-day return windows are complete. The 4-week comparison point is October 14, 2026. The handoff repeats these dates; nothing is scheduled.

## 9. Paid subscriber count

The only authoritative subscription source is `public.user_entitlements`, written solely by `public.sync_subscription_access` (`20260904220001_…sql:15-60`, service role) from the Stripe webhook edge function (`gary2.0/supabase/functions/stripe-webhook/index.ts:84-105`). One row per subscription and sport; bundles write one row per sport under the unique index (`stripe_subscription_id`, `product_key`, `livemode`) (`20260904220000:90-92`), so count distinct subscriptions, never rows. The website has no aggregate read path (only `get_my_access` for the signed-in account, `web/lib/book/access.ts:35-39`), so the count is a read-only, service-role query:

```sql
select count(distinct stripe_subscription_id)
  filter (where status = 'active' and (expires_at is null or expires_at > now())) as active_subscriptions
from public.user_entitlements
where livemode and stripe_subscription_id is not null;
```

Run it through the Supabase MCP `execute_sql` (read-only) on project `xuttubsfgdcjfgmskcol` ("Gary"), or with `psql` using the existing service credentials. Paste the result with its retrieval time in section 12 (Task 27). Label it **"Stripe livemode active subscriptions"**.

Caveats that must travel with the number:

- **Access is not payment.** `gary_private.has_winners_access` grants Winners to everyone until October 1, 2026 at 12:00 AM ET, and to accounts created before that cutoff afterwards (`20260904220000_winners_account_access.sql:16-30`). Neither a Winners view nor a `plan_selected` click is a subscription.
- **Stripe only.** Apple installs and any App Store subscriptions are reported separately from App Store Connect and are not joined to website rows; cross-device attribution is unavailable and no identity inference or billing integration is built for this brief (spec 8.8).
- Sandbox rows are excluded by `livemode`; `cs_test_` sessions were marked `livemode = false` by the migration.
- The count is a point-in-time state, not a weekly flow; a week's new subscriptions would need `event_created` or Stripe's own reporting, which this document does not define.

## 10. Consent and sanitization (unchanged, verified)

- No first-party event, identity or storage key exists before consent; a decline or revocation clears identity, attribution, session and dedup keys and strips a pending `_gary_signup` marker (`analytics-consent.ts:81-111`, `GrowthAnalytics.tsx:58-72`; `tests/useful-session.test.ts:52-63`). The server returns 403 without the granted cookie (`app/api/analytics/event/route.ts:14-19`).
- Vercel Analytics and Speed Insights mount only after a grant and cancel through `beforeSend` afterwards (section 6). In development and test the vendor loads its debug script, which logs and does not send.
- Three sanitization layers: client `cleanToken`, `cleanPath`, `referrerHost` and `safeWebEventProperties` (`analytics.ts:75-106`, `analytics-schema.ts:173-184`); server `parseWebEventPayload` rejects the whole event on any unknown key, wrong type, email-like string or missing required key (`analytics-schema.ts:153-170`); `log_web_event` re-validates every key, length and regex (`20260905125323:74-181`) and rate-limits 60 events per minute per keyed client address (`consume_web_ingest_quota`, `20260903180543:53-87`; the raw address is never stored, `request-fingerprint.ts:27-32`).
- Tests covering the acceptance list in spec 8: consent granted, declined and revoked (`useful-session.test.ts`); internal opt-out (`useful-session.test.ts`, `growth-analytics.test.ts`, `app-store.test.ts`; Task 15); search versus login referral and self-referral aliases (`analytics.test.ts`; Task 16 adds `betwithgary.com`); campaign attribution and the OAuth round-trip (`analytics.test.ts`, `useful-session.test.ts`; Task 16); refresh and double-fire protection (`useful-session.test.ts`, `useful-session.postgres.test.ts`, and the paywall case in Task 16); input sanitization (`analytics-schema.test.ts`, `useful-session.postgres.test.ts`); complete versus partial reporting windows (`funnel.test.ts`, extended in Task 17).

## 11. Section 9.1: X publisher verification

**Finding: the automated pick threads contain no URL, by design.** The `social-auto-post` edge function's header comment records the founder decision: no in-thread App Store link because the buried link "converted ~0" and the bio plus pinned post carry the install path (`gary2.0/supabase/functions/social-auto-post/index.ts:18-20`); the in-thread handoff is one of three rotating sentences ending "Link in bio." with "No URL on purpose" (`index.ts:60-67`, `APP_HANDOFF`). The root tweet is composed by `composeGamePickHook` whose rules forbid links (`gamePickHook.ts:10`); the claim payload carries no URL field (`index.ts:482-487`); `CARD_BASE` at `index.ts:50` is defined and never referenced. There is therefore no X-to-game-page link to verify, and nothing in the writer, cadence, reply format or coverage was touched (spec 9.1 asks that they be preserved). The only X-to-website labels are the manual campaign links in section 5.

**Read-only check over the last 14 days** (Supabase MCP `execute_sql`, project `xuttubsfgdcjfgmskcol`, retrieved September 16, 2026 at 11:46:42 PM ET / 2026-09-17 03:46:42 UTC):

```sql
select count(*) as posts_last_14_days,
       count(*) filter (where post_text ~* 'https?://') as posts_with_url,
       count(*) filter (where post_text ~* 'betwithgary') as posts_mentioning_domain,
       min(posted_at), max(posted_at),
       count(*) filter (where link_clicks is null) as link_clicks_null,
       coalesce(sum(link_clicks), 0) as link_clicks_sum
from public.social_post_log
where posted_at >= now() - interval '14 days';
```

Result: **196 posts** between September 3, 2026 11:15:09 AM ET and September 16, 2026 7:45:05 PM ET; **0 contain `http://` or `https://`**; 0 mention the domain; `link_clicks` is null on all 196 rows (sum 0).

A second read over the durable pick-thread receipts (`public.social_publication_intents`, created by the September 7 migration; retrieved September 16, 2026 at 11:46:43 PM ET): **98 intents** in the last 14 days, 98 in state `completed`, **0 root texts (`log_payload->>'post_text'`) and 0 reply texts contain a URL**. The two tables differ in scope (`social_post_log` holds every posted row including recaps and other lanes; the intents table holds the durable pick-thread receipts since September 7), so the counts are not expected to match.

**`social_post_log.link_clicks` is not applicable for pick threads.** It mirrors X's organic-only `url_link_clicks` (`index.ts:221-233`); with no in-thread URL it is null or zero by construction, and a zero must never be read as a click-through failure. `gary2.0/scripts/lib/marketingReadiness.sql:22` reports it; treat that column as N/A for this lane.

**Share previews verified live** (live probe `scratchpad/live-probe/`, fetched with the mobile Safari user agent at September 16, 2026 11:06 PM ET, HTTP 200 with no redirects per `chain.txt`), all three game pages carry `og:type article`, `og:url` equal to the canonical, `og:image` and `twitter:image` pointing at the absolute `/card` route at 1080×1080, and `twitter:card summary_large_image`:

| Page | Canonical and card image |
|---|---|
| Red Sox at Rangers, September 15, 2026 (MLB) | `https://www.betwithgary.ai/picks/mlb/2026-09-15/red-sox-at-rangers` and `…/card`; `twitter:image:alt` "Rangers ML — Gary's pick" |
| Denver Broncos at Kansas City Chiefs, September 14, 2026 (NFL) | `https://www.betwithgary.ai/picks/nfl/2026-09-14/denver-broncos-at-kansas-city-chiefs` and `…/card`; alt "Denver Broncos +2.5 — Gary's pick" |
| White Sox at Rays, July 31, 2026 (MLB, older completed game) | `https://www.betwithgary.ai/picks/mlb/2026-07-31/white-sox-at-rays` and `…/card`; alt "Tampa Bay Rays Moneyline — Gary's pick" |

Source: `generateMetadata` (`app/picks/[sport]/[date]/[game]/page.tsx:55-83`), `pageMetadata` (`lib/seo/metadata.ts:46-86`), `metadataBase` (`app/layout.tsx:16`); the card route 404s on a non-canonical slug (`card/route.tsx:28`). Campaign parameters do not enter the canonical or `og:url` (live probe rows 24 and 25: the `utm_` variant of `/picks/mlb/2026-09-16` serves the clean canonical).

**Granularity note.** The website's permanent game page is matchup plus ET date; a doubleheader shares one page with both tickets shown and receipts flagged ambiguous (`lib/gary/gamepage.ts:83-88`; `page.tsx:107-108`, `:213-218`). Any future per-game link from X would land on the matchup page, not a game-number page. Adding such a link is a separate founder decision recorded in the handoff (the website side is ready: stable canonical, card image, published-path check in `lib/gary/pick-links.ts:34-38`); it is not implemented here.

## 12. Baseline numbers — filled in Task 27

Both runs below were made at 3:05 AM ET on September 17, 2026 from the production checkout at commit `ed2a1782` (the report code from Task 17), reading the live `web_events` and `web_link_clicks` tables with the existing service credentials. Historical rows written before 2026-09-08 keep their original attribution labels (section 4); rows before the Task 15 deploy have no internal-test exclusion and may include Adam's own consented visits. The `accounts.google.com / organic` rows are that pre-2026-09-08 classification, not search traffic.

### 12.1 Weekly funnel, week 2026-09-07 (Sunday, September 6, 8:00 PM ET through Sunday, September 13, 8:00 PM ET)

Command: `cd /Users/adam.preda/Gary2.0/web && node --env-file=../gary2.0/.env.local --experimental-strip-types scripts/weekly-funnel.mjs --week 2026-09-07`

Retrieved 2026-09-17T07:05:14.006Z UTC (3:05 AM ET, September 17, 2026); `partial_week: false`.

- Sessions 24 · useful sessions 1 (4.17%) · small sample false
- New browsers 4 · useful first sessions 1 · eligible for 7-day return 4 · awaiting window 0 · returned within 7 days 1 (25%)
- Returning: sessions from browsers first seen before the week 12 · `return_visit` events 5
- X roll-up (source `x` or a t.co/x.com referrer): sessions 2 · useful 1
- App Store: handoff clicks 0 · sessions 0 · redirects logged 0
- Paywall: sessions 0 · plan clicks 0 (a plan click is not a purchase)
- Signups: started {"google": 1} · completed {"google": 1} · email {}
- Shares: started 0 · completed 0
- Book: opens 1 · manual saves 1 · settlements 1 · first-save browsers 1

Latest-touch channels (sessions · useful):

| source | medium | campaign | content | sessions | useful |
|---|---|---|---|---:|---:|
| direct | none | (none) | (none) | 20 | 0 |
| accounts.google.com | organic | (none) | (none) | 2 | 0 |
| x | campaign | (none) | bio_v1 | 1 | 1 |
| x | organic_social | launch_sep26 | find_game_v1 | 1 | 0 |

First-touch channels:

| source | medium | campaign | content | sessions | useful |
|---|---|---|---|---:|---:|
| direct | none | (none) | (none) | 18 | 0 |
| x | campaign | (none) | bio_v1 | 4 | 1 |
| accounts.google.com | organic | (none) | (none) | 2 | 0 |

Landing pages (top):

| landing | sessions | useful |
|---|---:|---:|
| `/` | 9 | 0 |
| `/picks` | 3 | 1 |
| `/account` | 3 | 0 |
| `/today` | 2 | 0 |
| `/you` | 2 | 0 |
| `/picks/mlb` | 1 | 0 |
| `/hub` | 1 | 0 |
| `/results` | 1 | 0 |
| `/data-sources` | 1 | 0 |
| `/archive/2026-09-05` | 1 | 0 |

Raw JSON: `evidence/seo-growth-2026-09-17/funnel-2026-09-07.json`.

Labels: consent scope; complete week (`partial_week` expected `false`); 7-day return cohort complete only if `as_of` is on or after September 21, 2026 00:00 UTC; small samples; internal exclusion not active for these rows (they predate the Task 15 deploy and may include Adam's own consented visits); first-touch values can predate the week; `x_channel` is a roll-up.

### 12.2 Weekly funnel, week 2026-09-14 (Sunday, September 13, 8:00 PM ET through Sunday, September 20, 8:00 PM ET)

Command: `… --week 2026-09-14`

Retrieved 2026-09-17T07:05:14.653Z UTC (3:05 AM ET, September 17, 2026); `partial_week: true`.

- Sessions 8 · useful sessions 0 (0%) · small sample true
- New browsers 2 · useful first sessions 0 · eligible for 7-day return 0 · awaiting window 2 · returned within 7 days 0 (None%)
- Returning: sessions from browsers first seen before the week 3 · `return_visit` events 4
- X roll-up (source `x` or a t.co/x.com referrer): sessions 0 · useful 0
- App Store: handoff clicks 0 · sessions 0 · redirects logged 0
- Paywall: sessions 1 · plan clicks 0 (a plan click is not a purchase)
- Signups: started {} · completed {} · email {}
- Shares: started 0 · completed 0
- Book: opens 0 · manual saves 0 · settlements 0 · first-save browsers 0

Latest-touch channels (sessions · useful):

| source | medium | campaign | content | sessions | useful |
|---|---|---|---|---:|---:|
| direct | none | (none) | (none) | 8 | 0 |

First-touch channels:

| source | medium | campaign | content | sessions | useful |
|---|---|---|---|---:|---:|
| direct | none | (none) | (none) | 8 | 0 |

Landing pages (top):

| landing | sessions | useful |
|---|---:|---:|
| `/` | 5 | 0 |
| `/press` | 1 | 0 |
| `/results` | 1 | 0 |
| `/picks` | 1 | 0 |

Raw JSON: `evidence/seo-growth-2026-09-17/funnel-2026-09-14.json`.

Labels: partial week (`partial_week` expected `true` at retrieval); immature cohorts (`awaiting_seven_day_window` will be non-zero); small samples; internal exclusion active only from the Task 15 deploy time onward within this week; re-run on or after September 28, 2026 for complete return windows.

### 12.3 Stripe livemode active subscriptions

Query: section 9. Result (Supabase MCP `execute_sql`, project `xuttubsfgdcjfgmskcol`, retrieved September 17, 2026 at 3:05:56 AM ET): **0 active livemode Stripe subscriptions**, 0 livemode Stripe subscriptions ever recorded in `user_entitlements`, 0 active paid accounts. This is consistent with the launch preview granting Winners to every account until October 1, 2026, so nobody has needed to buy; it is a count of Stripe rows, not of people using Winners. Labels: Stripe only; access is not payment (launch preview until October 1, 2026); Apple reported separately and not joined.

### 12.4 Reference figures already recorded elsewhere (not repeated here)

The September 16 Vercel Analytics and Search Console figures live in the spec section 4 and `SEARCH_CONSOLE_2026-09-16.md`; the September 4–5 pre-launch zeros live in `WEB_MEASUREMENT.md` and `evidence/web-measurement-2026-09-04.json`. Task 26 records fresh Vercel and Search Console reads in `SEO_GROWTH_AUDIT_2026-09-17.md` without overwriting those.

## 13. What is outside this measurement

Declined consent and blocked trackers; browsers without the consent cookie on the redirect routes; installs, in-app activity and App Store subscriptions; identities across devices; card displays that were not read; shares from the native card's own buttons; pre-consent or post-decline activity; Vercel Preview traffic; and any event whose properties failed validation (the whole event is dropped, never partially stored). None of these is estimated or backfilled.

## 14. Sources

- Repository at `main` HEAD `553079a0` (read about 11:30 PM ET, September 16, 2026): `web/lib/gary/analytics.ts`, `analytics-consent.ts`, `analytics-schema.ts`, `link-attribution.ts`, `funnel.ts`, `app-store.ts`, `web/components/GrowthAnalytics.tsx`, `PricingPlans.tsx`, `web/app/api/analytics/event/route.ts`, `web/app/go/app/route.ts`, `web/app/get/route.ts`, `web/app/c/[handle]/route.ts`, `web/app/auth/callback/route.ts`, `web/app/privacy/page.tsx`, `web/scripts/weekly-funnel.mjs`, `web/package.json`, `web/tests/analytics.test.ts`; `gary2.0/supabase/migrations/20260903180543_web_growth_measurement.sql`, `20260904225312_web_useful_session_funnel.sql`, `20260905125323_consented_book_milestones.sql`, `20260904220000_winners_account_access.sql`, `20260904220001`; `gary2.0/supabase/functions/social-auto-post/index.ts`, `gamePickHook.ts`.
- Plan Tasks 15, 16, 17 and 21 for the shape of the code landing in this pass (commits: see HANDOFF).
- Understand maps (verified file:line facts): `scratchpad/maps/read_analytics.json`, `read_xpub.json`, `critic.json`.
- Live probe `scratchpad/live-probe/` (`urls.txt`, `fetch.sh`, `chain.txt`, `meta_report.txt`, `page_20_game_mlb_0915.html`, `page_21_game_nfl_0914.html`, `page_22_game_mlb_0731.html`), fetched September 16, 2026 at 11:06 PM ET.
- Supabase MCP `execute_sql`, read-only, project `xuttubsfgdcjfgmskcol`, September 16, 2026 at 11:46 PM ET (section 11).
- Existing documents: `WEB_MEASUREMENT.md`, `content/README.md`, `SEARCH_CONSOLE_2026-09-16.md`, `SEO_BASELINE_2026-09-16.md`, `SEO_OUTREACH_2026-09-16.md` (none modified).
