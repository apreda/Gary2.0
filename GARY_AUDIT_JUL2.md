# Gary 2.0 — Full-System Audit & Production Push (July 2, 2026)

Everything below was verified against the live database, deployed functions, and the actual code — not assumed from docs. Three sections: **what I fixed**, **what needs your decision/action**, and **the honest consult review** (picks methodology, social, design).

---

## 1. FIXED THIS SESSION (applied and verified)

### Production incident (found mid-audit)
- **The scheduler was DEAD when I looked** — 5th total-pick-loss. Died silently at 5:00:29 AM right after building today's plan (same signature as Jul 1), launchd showed exit 0, KeepAlive never restarted it, **0 picks stored by 1:17 PM**. Ran your documented recovery (clean `bootout` + `bootstrap` + kickstart) → recovered, rebuilt the plan (9 MLB + 3 WC), re-published slate + tomorrow board, and generated picks for all 11 still-upcoming games. Only Pirates @ Phillies (12:35 PM, already in progress) was unrecoverable.
- **The watchdog was ALSO wedged** — last fired June 22; its 120-second StartInterval simply doesn't fire (`runs = 0` even after a clean re-arm; manual kickstart works). launchd interval scheduling on this Mac is broken below the level your fix reaches. **The watchdog cannot be trusted at all right now** — see §2, cloud migration.

### Security (live DB, migrations applied + repo-tracked)
- **`append_daily_picks` RPC was anon-executable** — anyone with the app's public anon key could inject or replace picks in production `daily_picks` via one REST call. Zero legit callers (the pipeline re-implements its merge with the service role). Revoked all public execution. Verified locked.
- **`push_tokens` had anon SELECT/UPDATE `true` policies** — anyone could enumerate all 160 device tokens or overwrite them. Your own iOS comment says the table "needs NO anon policies" (registration goes through the `register_push_token` RPC). Dropped all three policies; RPC verified still working.
- **`user_entitlements` was anon-enumerable** — dump the table, take any active `installation_id`, set it locally → free premium (plus it leaked Stripe session ids and amounts). Replaced with a `get_entitlements(p_ids)` SECURITY DEFINER RPC (same trust model as your push-token RPC), dropped the open policy, and switched iOS to the RPC. Verified over REST both ways: RPC returns the real entitlement, direct select returns nothing.
- **iOS auth tokens moved from UserDefaults to Keychain** (`KeychainStorage.swift`, new) — with silent migration so existing sessions survive the update. `gary_user_id`/email deliberately stay in UserDefaults because `SupabaseAPI.identityId` reads the id there for checkout/entitlement identity.

### Payments (the big one — paywall is ON for 2.18)
- **`freeLaunch` flipped to `false`** — Winners boards now gate behind Stripe checkout, free slate stays free, exactly the Jun 8 pricing design. Verified the full chain first: live payment links are `#if DEBUG`-gated correctly, checkout requires sign-in, `client_reference_id` rides along, webhook is production-grade (HMAC + replay defense, test+live secrets, idempotent grants, revoke-on-cancel, LINK_MAP covers the Jun 9 $29.99/$179 links).
- **Caught a display-vs-charge pricing bug before it could ship**: the plans sheet displays **$17.99/mo** for a 2-sport bundle, but `create-checkout` charged a stale $19.99 ladder price. Reworked `create-checkout` to inline `price_data` at the exact GaryPricing amounts ($9.99/$17.99/$24.99), so displayed price and charged price can never drift again. Deployed + verified (test-mode session creates cleanly). Also tightened it to 1–3 sports (the picker caps at 3; All-Access covers more).
- **Version bumped 2.17 → 2.18 (build 6)**; SIWA entitlement fix rides along. `xcodegen` regenerated; **Debug build SUCCEEDED**; Release build running as I write this.

### Grading
- **`grade-props` was silently dropping data past page 1** of every Ball Don't Lie call (no cursor pagination). The WC season has 104 matches — the semifinals/final would never have graded, and multi-match-day lineups (~40 rows/match) already blew past the 100-row page so some players could never resolve. Added cursor pagination (same pattern as `fifaWorldCupService.js`), deployed v2, dry-run verified clean (42/42 props in window graded).

### Pick engine
- **Fixed a prompt contradiction working against your Jun 29 favorite-bias fix**: `mlbConstitution.js` still said "decide who wins, then choose ML or run line" — the exact winner-framing the "MONEYLINE IS A PRICE" reframe eliminated — and it was being injected into the same prompt. Aligned to price framing.
- **Deleted 73 lines of dead code** in `passBuilders.js` (`_oldNhlPass1Removed()` — unreachable body kept after a cleanup, violating your own Clean-Up rule). Syntax-checked.

### Social / X
- **Mention-reply bot ("Grok for Gary") reworked and re-enabled.** Root causes of the "Grok 1" feel: zero few-shot examples in the reply prompt (the exact technique that fixed the main poster's voice in v14), plus a contradictory identity instruction ("information delivery, not a character bit") that produced voiceless stat-dumps. Rewrote it: one coherent Gary voice, six few-shot mention→reply pairs, match-their-energy rules, brevity rules. Testing then exposed the model copying an example's *invented* record ("5-1 on the weekend") into a checkable public claim — so I wired a **real RECORD block** (yesterday + last-7-days W-L from `game_results`) into the prompt with a hard rule that record claims come only from it. Sample replies now: honest "4-13 yesterday, 76-68 on the week", real Spain xGA numbers, real Lorenzen 8.20 home ERA, actual wit. **pg_cron job re-activated** — live now, capped 30/hr.
- Fixed `social-auto-post`'s stale header (still advertised the retired personality mode).
- **Pulled 4 deployed-only edge functions into the repo** (`create-checkout`, `post-single-tweet`, `post-reply-tweet`, `get-tweet-metrics`) — they had no source control at all.

### Web + docs
- Fixed stale World Cup copy ("kicks off June 11" on the homepage; "Kicks off June 11" badge on the pricing page — it's the knockout rounds). Web typecheck clean.
- `CLAUDE_MARKETING.md` was actively dangerous (mandated hashtags, text-only tweets, and an "Always Free" tagline — all three contradicted by shipped policy). Added a SUPERSEDED banner pointing at `X_CONVERSION_STRATEGY.md`, removed the dead rules, kept the still-good branding section.

---

## 2. NEEDS YOU (decisions or founder-only access)

**Before submitting 2.18:**
1. **Stripe live-mode sanity pass** (~10 min): open each live payment link once and eyeball the price ($9.99 singles, $29.99 ALL, $179 annual, $14.99 WC) — the app displays from `GaryPricing`, Stripe charges the link; you're the only one who can see the live dashboard. Also confirm the live webhook endpoint is pointed at `stripe-webhook` and firing (Stripe → Developers → Webhooks).
2. **One end-to-end test purchase** in TestFlight (test-mode links, card 4242…) — checkout → webhook → board unlocks. The chain is verified piece-by-piece; buy one thing to see it whole.
3. **Google/Facebook OAuth** (you chose to keep the buttons): create the OAuth apps (Google Cloud Console + Meta Developer), enable both providers in Supabase Auth with those credentials, and add `com.gary.app://auth-callback` to Supabase Auth → URL Configuration → Redirect URLs. Client plumbing is verified correct — the buttons work the moment the providers are on. **Until then they error for every user; don't submit before this or removing the buttons.**
4. **SIWA on a real iPad** via TestFlight (the 2.1(a) rejection follow-up) — build 6 carries the entitlement fix; verify on-device before resubmitting.

**Reliability (the most important thing on this list):**
5. **Do the cloud migration this week.** Five total-pick-loss incidents in one month, and today I watched both the scheduler AND its watchdog be dead simultaneously while launchd reported exit 0. Interval scheduling on this Mac is broken beneath the level any plist fix reaches. `DEPLOY_CLOUD.md` is written; Railway/Render is a one-evening job; the laptop should become the backup, not the host.

**Cleanups to approve (I didn't act — your call):**
6. **Apply the DFS/Talk drop migration** (`20260702_drop_dfs_and_talk_tables.sql` — written Jul 2, never run; `dfs_lineups`/`pick_context`/`test_dfs_lineups` still live). Destructive, so it stays your trigger.
7. **Undeploy dead edge functions**: `ODDS_API_KEY` (a function literally named after an env var — deploy accident from April), `gary-chat` (Talk-to-Gary is removed), `x-api-probe`, `reply-with-pick` (both already flagged in your cleanup notes), plus old-generation `tweet-pick-of-the-day`, `post-thread`, `post-tweet-with-image`, `delete-tweet`, `update-x-profile` if the current pipeline no longer calls them.
8. **Prop push handling**: `gradeProp` marks `actual === line` as **lost** for both sides (game-pick grading pushes correctly — props don't). Rare (integer lines only) but it's grading users' money wrong when it hits. Needs a product decision: does `prop_results`/iOS render a "push" state? Then I'll fix both graders.
9. Legacy tables to archive/drop when convenient: `gary_thoughts`, `weekly_nfl_picks`, `nfl_results`, `ncaab_bracket`, `bracket_picks`, `user_stats`. Plus low-priority hardening: ~25 DB functions with mutable search_path, leaked-password protection off, OTP expiry >1hr.

---

## 3. THE CONSULT REVIEW (honest opinions)

### How Gary makes picks — genuinely impressive, two watch-outs
This is the strongest part of the codebase. The three-layer prompt discipline (awareness/investigation/never-conclusions) is real and enforced — I hunted every constitution for Layer 3 leaks and found essentially none; the NHL "option set" rule is even correctly framed as a structural constraint rather than a directional hint. The two-model split (Flash investigates, Gary decides), phase-aligned constitution injection, bilateral-case forcing, and statAudit as a *safety net* rather than the primary defense — this is a more disciplined LLM-decision architecture than most funded quant-adjacent products I could name. The Jun 29 price-framing fix is the right mental model and the props "argue both sides before choosing" rule directly attacks the measured 84% over-bias.

Watch-outs: **(1)** The system's biggest epistemological risk isn't fabrication anymore — it's *contradictory prompt drift*: the MLB winner-framing leftover I fixed today is the recurring class (a decided fix ships in one file while an older sentence pulls the other way in another). A quarterly grep of every prompt surface for the current doctrine would catch these. **(2)** WC props constitution says thin markets are "where edges live" and links "underdog → more tackle volume" — both mild violations of your own never-label-edge / no-factor-conclusions rules. Small, but this is the one file where L3 discipline slipped.

### Grading & transparency — the moat, treat it as such
Open-receipt grading (fact-checks per pick, recaps, public ledger, losses kept on the books) is Gary's actual moat — most competitors delete losses. The cloud graders are well-built (finality gates, idempotent, dedup'd). The laptop grader (`run-all-results.js`) still exists with known divergences (anytime-brace bug, no finality gate) — finish retiring it so there's one grading truth.

### Social — the strategy is right, the bottleneck is distribution volume
The conversion-first redesign (card-forward tweets, zero emoji, withhold-the-depth, honest recaps) is correct and the voice rules are the best-written prompt in the repo. Now the honest part: **`link_clicks` has 3 rows.** The funnel from X → `/get` → App Store effectively doesn't exist yet at current volume. The system is a beautifully automated megaphone at low reach. The re-enabled mention bot is the right lever (replies are the cheapest reach on X in 2026), and the finals-chained WC posting is clever — but the next constraint is impressions, not automation. That's a content-cadence and engagement-loop problem (quote-tweets of big game moments, being *in* the conversation minutes after finals, the recap card as a shareable artifact), not an engineering one. Everything is in place to focus entirely on this — which was your goal for this session.

### iOS app — strong identity, now a real business
The design system discipline (GaryFonts/GaryColors/GaryBrand single-sourcing, the locked surfaces, matte-not-glossy, gold-as-signature) gives the app an identity that doesn't look like AI-slop dark SaaS — rare and worth protecting. The Winners date-browser transparency surface is a genuine differentiator. Structure-wise, the 26k-line `Views.swift` monolith is your biggest tech debt: it makes builds slow, editing hazardous (today's Xcode dance), and it *will* cause a bad merge someday. Split it file-by-feature next quiet week — zero behavior change, big safety gain. The paywall flow is well-designed (auth-gated checkout, in-app SFSafariViewController, entitlement union across sign-in states) — with one strategic note: external-purchase-link subscriptions on iOS are legally fine post-Epic but still carry App Store review friction risk; if 2.18 review goes sideways, the fallback conversation is StoreKit IAP, at Apple's 15-30% cut.

### Web — quietly excellent
The betwithgary.ai rebuild is the most polished surface in the project: the record-as-hero information architecture, warm-black palette discipline, real data everywhere (live picks, streak chips, per-sport last-30 records on the pricing cards). The pricing page's "the web sells, the app closes" funnel is correctly reasoned. Only real gap: freshness copy (two stale "June 11" strings today — worth a monthly sweep or a date-aware component).

### Hub — pipelines healthy, watch information density
Every Hub/Home data pipe wrote today (wire, market pulse, league pulse, insight connections, player cards, recaps, highlights, streaks — all fresh within hours; one false alarm: `mlb_field_lineups` upserts don't bump `updated_at`, so the table *looks* stale when it isn't — one-line fix worth making). Product-wise the Hub is the "ESPN for bettors" bet paying off: Regression Board + look-ahead is exactly the fan-facing drama layer the north star calls for. My one design opinion: the Hub is close to the density ceiling — the collapsible-disclosure redesign was the right move; resist adding more open-by-default lanes.

---

## 4. Session state
- iOS: Debug build **green** with all changes; Release build verification in flight. Working tree is uncommitted — review, then commit/push to trigger Xcode Cloud for build 6.
- Scheduler: alive (recovered), generating tonight's picks now. Watchdog: unreliable — see cloud migration.
- Reply bot: live. Auto-poster: unchanged and healthy. Grading: cloud fns v2/v3 healthy.
- Migrations applied live AND written to `gary2.0/supabase/migrations/` so repo and DB agree.
