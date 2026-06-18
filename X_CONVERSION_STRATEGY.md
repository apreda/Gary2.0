# @BetwithGary Growth Strategy: From Pick-Bot to Conversion Engine

> Generated June 16 2026 via the `gary-x-growth` multi-agent pass (audit + 6 research angles + 4 adversarial reviewers).
> **This supersedes the impressions framing in `SESSION_HANDOFF.md`.** North Star = APP DOWNLOADS + retained, happy users. Impressions/likes/followers are lagging proxies at most.
> Founder decisions baked in: ZERO emojis; "give the pick, hold the depth" withhold policy; clean and distinct from generic gambling-X accounts.

## A note on the numbers in this document

The platform-behavior multipliers cited below (reply weighting, link reach, pinned-post lift, video reach, CPP lift, deep-link lift, poll engagement) are industry-reported and reverse-engineered, unverified for this specific account. Treat them as directional ordering, not measured Gary data. The one scoreboard that is real and ours is App Store Connect campaign-attributed installs plus the X-side intent signals (profile clicks, bookmarks, link clicks) we already pull per tweet via `get-tweet-metrics`. Every recommendation below is robust to the platform numbers being off; the operational moves survive even where the exact figures do not.

The canonical App Store link used throughout is `https://apps.apple.com/us/app/gary-ai/id6751238914`, the form already deployed across the codebase. Campaign tags extend the live `ct=x_bio` / `ct=x_pinned` / `ct=x_thread` scheme. The provider token `pt=` is optional and only included if a real token is provisioned in App Store Connect; it is never shipped as a literal placeholder.

## PROGRESS LOG

- **Jun 16 — auto-poster redesign SHIPPED (edge fn v14):** emoji/badge/hashtag/buried-link removed, withhold policy, open-receipt recaps, human first-person voice via baked few-shot examples. Verified by dry-run. Function now in repo at `gary2.0/supabase/functions/social-auto-post/`.
- **Jun 16 — reply-engine probe DONE:** `x-api-probe` confirmed full read access (read-write, healthy rate limits) — both sub-engines unblocked. See `REPLY_ENGINE_SCOPE.md`. (Delete the throwaway probe fn.)
- **Jun 18 — Custom Product Page SUBMITTED to review:** "X / social cold traffic", 9 screenshots + promo text. **Correct ppid = `3c207d81-dc0d-4cc3-a50d-b5f47e29b18f`** → `https://apps.apple.com/us/app/gary-ai/id6751238914?ppid=3c207d81-dc0d-4cc3-a50d-b5f47e29b18f`. (The earlier `be3c9310-...` was WRONG — that was the internal address-bar page-path, not the ppid.) Submitted with the ORIGINAL screenshot order (leads with 2 pick cards; Settings 4th, results 5th); the "results higher" reorder did not make it but it's acceptable — reordering means another review round, deferred (no urgency). **Awaiting Apple approval.** The `?ppid=` URL only serves the custom page AFTER approval (until then it shows the default page), so do NOT put it anywhere yet. Keep `?ct=x_bio` on the bio now. When approved and using the ppid link, format it as `?ppid=...&ct=x_bio` and confirm Campaigns still logs installs. Founder will ping when approved → then confirm the live link works and wire ppid+ct.
- **Attribution:** staying on hand-appended `?ct=` tags. Campaigns tab shows nothing until a tagged link clears ~5 installs / 24h.
- **Still open:** reorder CPP screenshots + submit to review; X profile pass (bio + `?ct=x_bio` website + pin a receipts post with `?ct=x_pinned` in the first reply + header image).

## 1. Diagnosis (conversion-first)

The current system is a competently-built impressions machine pointed at the wrong target. Every structural choice (threaded for separate impression counts, text-only, 6-day metrics refresh, the 20k-impressions/month KPI in every doc) optimizes a number that does not pay rent. The North Star is installs and retained users. Read against that, the June metrics (18 threads, 31 replies, 3 likes, ~0 link clicks, ~0 installs) are not a reach failure. They are a conversion failure, and the two are different diseases with different cures.

Here is the tell. The account already gets attention: threads earn replies. Replies are among the heaviest-weighted signals on X by reverse-engineered estimates (ordering reliable, exact figures directional), and the raw material of distribution is therefore present. What is missing is the machinery that turns an engaged viewer into a downloader. Specifically:

- **The link is buried where reach has already decayed.** In a thread, the lead tweet carries the reach and the later tweets ride its decay; the App Store link lives in tweet 3, which one rough estimate (from a low-confidence, contested model of thread ranking) puts at around 12-18% of the hook's impressions, and it earns ~0 clicks. Separately, in-tweet external links empirically underperform every other format in 2026, whether by a hard rule or learned model down-ranking; the research does not settle which. The one tweet built to convert is placed where almost no one sees it, in the format that converts worst.
- **The product is given away for free in-feed.** Tweet 1 hands over the pick and odds; tweet 2 hands over the full multi-factor breakdown plus the closing call. A viewer's curiosity is fully satisfied without opening anything. There is no payoff left to download for. This is the core conversion leak, and it is self-inflicted.
- **The replies it earns are the wrong replies, and they are abandoned.** Pick threads attract people who want to argue the pick, not bettors who want to install. Worse, the auto-poster posts and walks away, leaving author-reply-back (one of the strongest distribution signals on the platform) completely unused. The argument energy converts to nothing.
- **The funnel past the click is thin, but the X-side instrumentation already exists.** What is genuinely absent is downstream install attribution. What is already in hand and underused: `get-tweet-metrics` already returns per-tweet profile clicks, link clicks, and bookmarks, and the v6 hourly refresh already stores them in `social_post_log`. The diagnosis of "~0 link clicks, profile out-converts the link" came from that instrumentation. So the X-side signal is live today; the missing half is joining it to installs.

**What genuinely helps conversion vs what is noise.** Helps: profile clicks (high intent, the surface that already out-converts the buried link), bookmarks (save-for-later intent, the closest proxy to "I will act on this"), dwell (people pausing to read a specific play), and replies under bigger accounts (out-of-network discovery of new genuine bettors). Noise: raw impressions, likes, follower count, and argument-reply volume. The legacy 20k-impressions KPI is formally demoted to a lagging diagnostic at most. A 400-view post that pulls ten genuine bettors to a strong profile and converts installs beats a 5,000-view post that converts zero. From here forward the scoreboard is: profile clicks and bookmarks (already pulled by `get-tweet-metrics`, surface them weekly now), App-Store-Connect `ct`-attributed installs, first sessions, and day-7/day-30 retention. Argument-reply volume is explicitly a non-goal; any format whose only lift is reply count gets cut. Nothing else is a goal.

## 2. The conversion funnel (the core of this document)

The real path is: **post then profile/link then App Store page then install then first session then habit.** Today it leaks at every joint. Here is each stage, what is leaking, and the fix.

### Stage 1: Post to Profile/Link

**Leaking:** The system tries to convert *inside the tweet* via a buried link in the worst-performing format. It never drives to the profile, which is the surface that already out-converts the link in Gary's own data.

**Fix, where the link lives:** Get the App Store link out of the main body of every pick tweet. External links in the first tweet reduce reach by roughly 50% (this specific first-tweet figure is high-confidence in the research); link-in-main-tweet posts empirically underperform regardless of the exact mechanism. Order of preference for any given link:
1. **Bio / website field (primary).** Always-visible, never throttles a post, carries its own campaign tag.
2. **Pinned post (primary).** Every profile visitor sees it first; pinned posts earn materially more impressions than normal tweets.
3. **First self-reply on a thread (secondary).** A link in a self-reply rather than the lead tweet preserves the main tweet's reach.
4. **Never the lead tweet, never tweet 3 as the only path.**

The tweets' job is no longer "deliver a link." It is "earn a profile click." That means ending pick and personality posts on a stance about the pick worth arguing, or a real question, which drives the profile-click and reply signals that actually compound. This closer is used in a minority of posts (see the cadence rule in Section 3), never as a default appended to everything.

### Stage 2: The Profile as a Conversion Landing Page

The profile is the highest-leverage no-budget asset and it is partly built already (the bio plus tracked website was set via `update-x-profile` on June 13, and an evergreen pinned tweet already exists awaiting a swap). Treat it as a landing page with one job: install. The remaining delta:

- **Bio (rewrite):** One plain line. What Gary is, free, plus the hook. Example: `AI that picks every game across MLB, NBA, NFL, NHL, college. Every result owned, win or lose. Free in the app below.` No emojis, no dashes, no hype. Settable via the existing `update-x-profile` function.
- **Website field (repoint):** Campaign-tracked link, `ct=x_profile`, pointed at a Custom Product Page once built.
- **Pinned post (replace the current evergreen):** A rolling, timestamped results receipt (record to date, recent wins and losses shown honestly) with the App Store link in the *first reply* to the pin (`ct=x_pinned`). Bio makes the promise, pinned delivers the proof. The system can compose and post the pin candidate and flag it; the owner pins manually (no pin API).
- **Header image (set):** A clean screenshot of the verified pick card / results view (reuse the existing Quant Terminal / Stack Row design) so the value is visible before anyone reads a word. Every screenshot doubles as free app-UI advertising. Manual.

### Stage 3: App Store Page (free levers, no budget)

- **Custom Product Pages (CPPs):** Free, up to 35 per app. They tailor the cold X visitor's first impression: lead with the verified pick card, the live results/receipts view, and "free daily picks, no signup wall." Apple's published case-study figure is a 156% conversion lift for a CPP vs the default page; treat that as a vendor best-case, not an expected result, with conservative reported lifts in the 15-30% range. Sequencing matters more than the headline number: ship **one** focused CPP alongside attribution first, because at this account's traffic the binding constraint is click *volume* reaching the page, not page conversion rate. Build the additional CPPs only once a single `ct` token clears the reporting floor (below) so there is data to differentiate them. (Guideline guardrail: a CPP must reflect the real app; use real screenshots, no invented claims.)
- **Apple campaign tags (the measurement spine):** `https://apps.apple.com/us/app/gary-ai/id6751238914?ct=CAMPAIGN&mt=8` (append `pt=PROVIDER` only if a provider token is actually provisioned in App Store Connect). Give each surface a distinct `ct`: `x_profile`, `x_pinned`, `x_pick_reply`, `x_recap`, `x_reply_engine`. App Store Connect then reports impressions, product-page views, installs, and retention per token, free, no MMP. Keep the total to roughly five tokens so each clears the reporting floor. Verification step before relying on a CPP for attribution: post the tagged CPP URL on one surface and confirm App Store Connect attributes installs to that `ct` token; CPP deep-link URLs do not always co-carry `ct` cleanly. If they do not report, fall back to the default product page URL with `ct` on the surfaces where measurement matters most, and use the CPP only where install-rate lift outweighs losing the token.

### Stage 4: Install to First Session to Habit

- **Deferred deep link (upgrade, not day-one):** A small landing page on the existing betwithgary.ai domain with a Smart App Banner, Universal Links, and deferred deep linking, so a "see the full breakdown" tap opens the app *to the exact pick the tweet teased*. Deep-linked owned media can convert meaningfully better than a cold store link (one source cites roughly double for deep-linked owned media), and it turns curiosity into a completed first session on the specific pick the reader already wanted. Lower priority than profile, CPP, and attribution; do it when a domain and Universal Links are wired. A bare redirect page gives no attribution by itself; it needs the `ct` link or UTMs.
- **Habit:** Recurring named segments (Section 4) and honest daily receipts bring an installed user back. Retention is won by the app delivering the payoff the tweet promised, then the account reinforcing the habit with a daily verdict and an honest record.

### The Withhold Policy, applied mechanically (this is the engine of the funnel)

The "give the pick, hold the depth" policy is on-brand and algorithm-aligned: a specific-but-incomplete pick maximizes dwell and bookmark intent ("save this for tip-off," "I want the rest") without satisfying curiosity. Enforce it server-side per mode:

- **Pick tweets:** Lead with the *single strongest, most specific, falsifiable* factor and stop. Quality of the one stat matters more than the count; the retained factor must be concrete and checkable (a number or a named situational edge), never vague, so credibility survives the hold. Show the actual pick plus odds plus that one factor. The full multi-factor breakdown and the rest of the day's slate stay in the app. The pick-mode guard leads with the strongest factor and strips the remaining supporting factors, rather than blindly truncating to one line.
- **Recaps:** Show receipts openly. Wins *and* losses, timestamped, running record. Proof is the install driver for a picks product; going silent on losing days is the single biggest distrust signal on betting X.
- **Personality:** Give freely. Pure character, no app pull, no hashtag.

The discipline line: a pick tweet must always contain a real, specific, falsifiable play. "Big pick inside, download to see it" is engagement-bait and repels the high-intent bettors Gary wants. The credibility is on the post; the payoff is in the app.

### Measuring X to install for a tiny indie app

Two halves. The X-side (profile clicks, bookmarks, link clicks per tweet) is already pulled by `get-tweet-metrics` and stored in `social_post_log`; start a weekly scoreboard from it now instead of the impressions sum, and read hook-level profile clicks directly off the hook row. The downstream half (installs and retention per surface) is the genuinely new instrumentation: per-token App Store Connect attribution, free, no MMP. Caveats to set expectations: a token needs at least five first-time installs and about 24 hours before it reports, so for a small account give each token weeks and do not proliferate tokens past the point where none clears the five-install floor. Start with five tokens, not fifteen. Judge every format by attributed installs and first-session/retention, never by impressions.

## 3. Per-format redesign

Every example below is emoji-free and dash-free, with no rule-of-three, no "not just X it's Y," no corny capper lines, and no hashtags on conversion-critical surfaces. The sport emoji map, the literal `Full breakdown` arrow, and the `TOP PICK OF THE DAY` block are constants in `index.ts` and must be deleted outright; they are code, not model slips.

### 3a. Pick Hook (tweet 1)

**How it fails to convert:** Same skeleton daily (angle, emoji-pick-line, arrow). The arrow promises depth in tweet 2 that the withhold policy now wants held in the app, so the hook over-promises the thread and under-promises the app. The sport emoji violates the zero-emoji rule. The hook is engineered to land in-feed, not to earn a profile click or create curiosity that only the app resolves.

**Redesigned structure:** Lead with the story or the sharp angle. State the pick and odds in clean, machine-readable shorthand (this makes it Playbook-parseable and re-shareable, a free distribution lever). Show the single strongest, most specific, falsifiable factor. In a minority of posts, close on a stance about the pick worth arguing or a real question; most hooks close on a flat declarative stance. No arrow, no emoji, no link, no "full breakdown" promise.

**Before:**
```
Washington's rotation is in shambles

⚾️ Dodgers ML -174

Full breakdown ↓
```

**After:**
```
Washington is starting a bullpen game on zero rest after burning eight arms last night.

Dodgers -1.5 (+115)

LA has covered the runline in 7 of their last 9 against sub-.500 staffs. The market has them too cheap on the spread.
```

**How it helps conversion:** One specific, checkable factor proves Gary is sharp (credibility) while leaving the rest of the reasoning and the slate unresolved (reason to download). When a closing stance is used, it manufactures genuine replies from real bettors, and those replies drive profile visits, which is the actual conversion surface.

### 3b. Pick Reasoning (tweet 2)

**How it fails to convert:** This is the core conflict with the withhold policy. It dumps 4-6 deep stats plus the closing call, fully satisfying curiosity and removing the reason to install. The two hashtags (#MLBPicks #GamblingX) are the generic-gambling-bot signature that attracts bots and touts, not installers.

**Redesigned structure:** In most cases, *eliminate this tweet.* The single strongest factor now lives in the hook. The full breakdown is the app's payoff. Where a second tweet adds value, it is the profile/app handoff, not more free analysis. No hashtags ever on a pick thread. A server-side guard rejects any handoff line that strings three or more comma-or-and-joined clauses together (no rule-of-three).

**Before:**
```
Goldschmidt 1.180 OPS vs LHP, Schuemann 1.056, Rice .999, Lopez 1.77 WHIP, A's pen burned 8 arms yesterday after Severino injury, Warren 3.16 xERA. Lay the runline.

#MLBPicks #GamblingX
```

**After (the thread's second-and-final tweet, a handoff not a dump):**
```
The rest of why, and tonight's other plays, are in the app. Link in bio.
```

**How it helps conversion:** Removing the free breakdown restores the reason to download. Killing the hashtags removes the generic-bot signal that repels genuine bettors. Routing to the bio (not an inline link) avoids the link penalty and sends intent to the surface that converts.

### 3c. Pick CTA (tweet 3)

**How it fails to convert:** The single biggest structural conversion failure in the system. A buried, identical-every-day raw App Store link in the tweet that gets the least reach and ~0 clicks.

**Redesigned structure:** Eliminate the standalone raw-link CTA tweet. The handoff (3b After) routes to the bio. If a link must appear in-thread, it goes in the *first self-reply* with a `ct=x_pick_reply` tag and a specific, contextual line, never a generic "link below." Better is no in-feed link at all, with the bio and pinned post carrying the install path.

**Before:**
```
Gary's full card is free in the app. Every game, every day.

https://apps.apple.com/us/app/gary-ai/id6751238914?ct=x_thread&mt=8
```

**After (only if an in-thread link is used at all, as a self-reply):**
```
Tonight's full card, free, no signup wall: [CPP link, ct=x_pick_reply]
```

**How it helps conversion:** Moves conversion off the buried link and onto the profile, which already out-converts it. When a link is used, the CPP destination converts product-page views to installs better than the default page, and the campaign tag finally tells us whether any of it works.

### 3d. Top-Pick variant

**How it fails to convert:** The `TOP PICK OF THE DAY` label (currently shipped with a target emoji) violates the zero-emoji rule, reads exactly like every capper's "LOCK OF THE DAY," and works against the withhold policy by positioning X as the place to get the single best play for free, reducing the reason to open the app for the rest of the slate. Auto-firing on a confidence threshold means it can fire daily and lose all signal.

**Redesigned structure:** Kill the label entirely. Conviction lives in the *language* of the hook, not a stamped badge. A high-confidence pick gets a hook that carries more certainty in Gary's voice. Cap any "this is the one I keep circling" framing to genuinely rare days so it retains meaning.

**Before:**
```
🎯 TOP PICK OF THE DAY

⚾️ Yankees -1.5 (+135)
```

**After:**
```
Of everything on the board tonight, this is the one I keep coming back to.

Yankees -1.5 (+135)

Cole has held lefty-heavy lineups under three runs in five straight starts, and Oakland is starting four left-handed bats. The runline is the play. The rest of why is in the app.
```

**How it helps conversion:** Conviction-in-voice differentiates Gary from generic cappers (attracts the right audience) while the held-back "rest of why" preserves the install reason. No badge to imitate the touts the brief says to avoid sounding like.

### 3e. Morning Recap

**How it fails to convert:** Cites only winning picks by name, which softens the receipts angle into a cherry-picked tout screenshot. Re-appends the same buried App Store CTA. It is a thin two-tweet record line, not the credibility-building ledger the trust-driven funnel needs.

**Redesigned structure:** Lean fully transparent. Open with the record. Name wins *and* losses with results. Show the running record to date. End by pointing to the profile/pinned for the standing ledger and the app, not a hard sell. This is the trust engine that converts skeptics into installers, and it is on-brand (Gary owns wins and losses).

**Before:**
```
Yesterday's card: Gary went 3-2. Dodgers ML cashed at -120, Yankees runline hit, Celtics under landed. Back for today's slate.

#GamblingX
```

**After:**
```
Yesterday: 3 and 2.

Wins: Dodgers ML -120, Yankees -1.5, Celtics under 218.
Losses: Astros ML, Rangers team total over. The Rangers bat I leaned on went 0 for 4.

That puts the week at 11 and 8. Every result, win or loss, is tracked in the app. Back with today's card this morning.
```

**How it helps conversion:** Honest, falsifiable receipts are the documented trust mechanism for picks accounts; showing losses openly converts skeptics better than wins-only because it is verifiable. Post-hoc fluffing or hiding losses is permanently disqualifying in this community, so transparency is both the safe and the high-converting path.

### 3f. Midday Personality

**How it fails to convert:** This is the closest format to the brand ideal (pure character, give freely) and the most on-brand surface, but it is the newest and least-iterated, capped at one post a day, and it allows an optional #GamblingX that re-attaches the generic-bot signal to the one format meant to feel human.

**Redesigned structure:** Keep it pure voice, give freely, no app pull, no hashtag ever. In a minority of posts (no more than one in three, never two days running), make it a genuine open question to the audience. Let Gary own losses fast and human. Lean into being openly an AI when it fits.

**A note on the in-it-with-you pillar (resolving a real brand-doc tension):** GARY_VOICE makes "in it with you, Gary bets what he posts" a load-bearing pillar and the differentiator versus every tout. This strategy preserves that pillar and refines it: Gary is openly an AI that *models, calls, and sweats* every game he posts. Sweat and conviction language ("this is the one I keep circling," "three more outs," "that one is on me") is fully allowed because it is true of the persona. What is not allowed is claiming a personal cash wager or a lived human experience he did not have ("I put three units on this myself," "I watched every minute"), which is deceptive and FTC-exposed. The in-it-with-you hook survives intact; only the false-money and false-viewing claims are out. This refines the GARY_VOICE pillar rather than contradicting it, and it sits alongside the existing compliance line (never guarantee outcomes, 21+).

**Before:**
```
Confidence was 0.82 and it still lost. Some things don't get automated.

#GamblingX
```

**After:**
```
Had a pick at 82 percent confidence last night and it still found a way to lose in the ninth. I can model the matchup down to the platoon splits. I cannot model a reliever forgetting how to throw strikes with two outs.
```

**How it helps conversion:** Personality posts earn the genuine replies, follows, and dwell that pick threads do not, building the followable character that drives sustained profile visits. When an open question is used, it pulls new eyes to the profile. No hashtag keeps it human.

## 4. New formats worth adding, ranked by conversion impact

### 1. Receipts / results posts (the flagship)
**What:** When a graded pick settles, quote-tweet Gary's *own* original pick tweet next to the final score with a one-line honest verdict. The win receipt is the most repostable format in the niche; the bad-beat receipt is just as relatable and does not require a win to post.
**Example (win):** Quote of the original Dodgers -1.5 hook with: `Called this one yesterday at +115. Final 6 to 2, runline never in doubt. The full read was in the app before first pitch.`
**Example (loss):** `Took the Rangers team total over and watched them score twice. That one is on me. The bat I leaned on has gone cold and I should have weighted it less. It is in the ledger.`
**Conversion rationale:** Receipts are the trust engine; trust is what makes a free download feel safe for a picks product. Showing the *original timestamped call* next to the result is falsifiable proof, the opposite of a tout's cherry-picked screenshot. The pick-card screenshot doubles as app-UI advertising.
**Automatable?** Yes, with one small new endpoint. The current posting functions (`post-single-tweet`, `post-reply-tweet`, `post-tweet-with-image`, `post-thread`) do not attach a quoted tweet; X API v2 needs `quote_tweet_id` on the create call. So this is **[edge-function mode + small new endpoint]**: add `post-quote-tweet` (or extend `post-single-tweet` with an optional `quoteTweetId`) that sets `quote_tweet_id` in the v2 payload, mirroring how `post-reply-tweet` sets `in_reply_to_tweet_id`. The mode looks up the original `hook_tweet_id` from `social_post_log`. Day-one fallback that needs no new endpoint: a plain reply that pastes the original tweet URL (X auto-cards it), or a text recap naming the original call. Reading prior tweet text, if needed, uses the syndication endpoint (`cdn.syndication.twimg.com/tweet-result`) since x.com reads are paywalled.

### 2. Quote-tweet / reply reactions to big accounts (covered in depth in Section 5)
**What:** Short, substantive, in-voice reactions to breaking sports news and live moments under accounts 2-10x Gary's size.
**Conversion rationale:** The single largest untapped path to NEW out-of-network bettors, routing them to the now-optimized profile. Quote-tweets additionally appear as original content on Gary's own profile.
**Automatable?** Reply *generation* is automatable; *target selection and a relevance/quality gate* start manual or human-reviewed. See Section 5. This warrants a small dedicated service, not the existing edge function.

### 3. Transparent running record (pinned + weekly card)
**What:** A standing, always-current W/L/ROI ledger that lives as the pinned post and gets a weekly summary post.
**Example (weekly):** `This week: 14 and 11, plus 4.2 units. Best call was the Dodgers runline at +115. Worst was leaning on a cold Rangers bat twice. Every line is in the app, graded, win or lose.`
**Conversion rationale:** A verifiable record is the documented trust mechanism that converts skeptics. As the pinned post it sits on the surface every profile visitor sees first.
**Automatable?** Yes, edge function. The app already grades picks; surface the aggregate. Owner pins manually once.

### 4. Live game-thread sweats
**What:** Short in-voice reactions chained off the original pick's thread as the game unfolds (a Gary pick cashing or busting, a key moment).
**Example:** `Cole through six, two hits, lefties 0 for 11 against him. This is the exact script the runline needed. Three more outs.`
**Conversion rationale:** Real-time reaction is the one thing a template-bot structurally cannot fake; it is what makes a persona feel alive and followable, the "in it with you" content that builds the character driving follows and installs.
**Automatable?** The live-reaction content workflow and ESPN `/summary?event=` polling pattern already exist and are tested. The genuinely-new build is narrow: an auto-cron on a tighter loop plus the ESPN-game-ID-to-Gary-pick matcher (ESPN IDs differ from Gary's `game_id` and are currently resolved by search), gated to games where Gary has a posted pick. That ID-matching is the actual hard part to scope. The native-sports-surface distribution claim is low-confidence 2025 reporting; verify in-app before relying on it. Manual sweats must route through `killDashes` (the June 9 manual sweat shipped an em-dash).

### 5. Marquee-game poll
**What:** One poll a day, at most, on a genuine marquee game.
**Example:** `Yankees and Astros tonight, both aces going. Who you got on the runline.` (poll options: Yankees -1.5 / Astros +1.5)
**Conversion rationale:** Polls reportedly out-engage standard text tweets and generate interaction without giving away a pick. But this is the format most exposed to the brief's cheap-engagement-no-install failure mode. So it ships *gated*: keep it only if poll days produce a measurable lift in profile clicks and bookmarks (existing metrics endpoint) AND in `ct`-attributed installs versus non-poll days. If it only moves the poll-vote count, kill it. Used sparingly so it reads as fan banter, never an engagement-bait gimmick.
**Automatable?** Needs a confirmed small change: `post-single-tweet` currently takes only `{ text }` and has no poll field. Native polls require the v2 `poll` object (`options[]`, `duration_minutes`), which OAuth 1.0a user-context can post. **[small edge-function change, confirmed needed].** One per day, max.

### 6. Native short-form video / bet-card (upgrade lane)
**What:** Auto-generated 20-40s captioned 9:16 clips: "tonight's play plus one stat, the rest is in the app," or a morning recap reel.
**Conversion rationale:** Native video is reported as a high-leverage reach format (roughly 2-4x, medium confidence and platform-wide), so treat it as directional and A/B test against attributed installs. Must be native upload, never a YouTube link. Tight completion matters more than length.
**Automatable?** Needs a new build (video generation pipeline plus native upload). Higher effort. Start at a couple per week, scale only if watch-time and attributed installs hold. Do not give away the full breakdown in the clip.

### 7. Machine-readable shorthand (free distribution primitive)
**What:** Not a post type but a formatting rule: state every pick in clean shorthand (`Yankees -1.5 +135`) so the @Playbook bot can parse it into a trackable betslip and others can re-tag it.
**Conversion rationale:** Extends distribution to new audiences with zero extra work and adds a concrete next-action, without violating the withhold policy. Whether it moves installs for Gary specifically is unproven, so treat it as a free side-benefit of good formatting, not a pillar.
**Automatable?** Yes, it is already a formatting constraint in the hook redesign.

## 5. Reply-engagement engine

This is the single biggest untapped growth lever and Gary does zero of it automatically. It is also the highest-ROI no-budget change available, because replies are heavily weighted on the platform and replying under bigger accounts is the proven path to NEW out-of-network bettors. The mechanism that matters for the North Star: a sharp reply under a big account puts Gary's voice in front of that account's audience, a fraction click the handle, and the now-optimized profile converts them. The reply is not the goal; the profile visit it produces is. A manual reply playbook already exists and is validated (target tweets above ~200 views, Top tab, vary phrasing, counter-takes allowed, 10-15/day cap). The job here is to productize that playbook into a gated service, not to build a reply engine from scratch.

**Two distinct sub-engines, both needed:**

**A. Reply-back on Gary's own posts.** The threads already draw arguing replies, and the auto-poster abandons them. Have Gary auto-reply to the first few genuine repliers within the first 2-3 hours (the early window). Author-reply-back is among the heaviest signals on the platform by reverse-engineered estimates. This converts wasted argument energy into a strong distribution boost and reads as a confident persona defending a take. **Dependency to confirm before automating:** reading who replied requires pulling conversation replies or mentions, and the current function table has no `get-mentions` or conversation-lookup endpoint (`get-tweet-metrics` returns counts, not authors or text). So 7A requires a new read endpoint AND verification that the account's X API tier permits conversation reads. Until read access is confirmed, the feasible path is founder-in-the-loop: the system surfaces the replies it can see (or the founder eyeballs notifications) and drafts the reply-back. The sentiment/quality gate must skip hostile or troll replies so Gary never dignifies bait.

**B. Outbound replies under big accounts.** Build a List of 15-30 relevant accounts: team beat writers, league/game-thread accounts, sports-media handles, betting personalities, strictly within MLB/NBA/NFL/NHL/NCAAB/NCAAF (never EPL, never WNBA, never @AdamPreda007). Reply within the first 10-15 minutes of their posts with a short, specific, genuinely additive take in Gary's voice. Quote-tweet instead of reply when Gary has real value to add (it appears as original content on his own profile too). `post-reply-tweet` is already the posting primitive.

**Hard rules for every reply (violations torch distribution and the brand):**
- Substantive and specific every time. A real read on the game or the news, a concrete stat, an actual angle. Never generic.
- Never a link. Never "tail me," "who's riding," "lock it in." The conversion happens when the reader taps to the profile, not from anything in the reply.
- Never imitate the parent account's copy or any named capper's phrasing.
- Zero emojis, zero dashes, all voice rules apply (the `killDashes` backstop only catches dashes; the prompt must enforce the rest).
- Vary wording structurally across replies. Identical or templated replies trigger reply-deboosting and bot-detection, which is stricter in 2026.

**Cadence:** Start conservative, 10-15 quality replies a day, well under the ~50/day soft cap. Never reply to the same account 3-4+ times a day. Concentrate Gary's own-post reply-backs in the first 2-3 hours after posting.

**Automatable vs manual:** The *generation* (given a target tweet, produce an in-voice reply) is automatable via Gemini. The *target selection* and a *relevance/quality/safety gate* start with human review, because fully-automated raw-AI replies can kill the account and a single bad pattern can trip the spam classifier (mutes and reports are catastrophic signals). Recommended path: the system drafts replies to a curated List; a human approves for the first few weeks until the voice and relevance bar is proven; then graduate the safest, highest-precision slice (reply-backs on Gary's own non-hostile repliers, once read access is confirmed) to full automation while outbound stays human-gated longer.

**Why this wants its own service:** The reply engine needs to *listen* (poll a List for new posts), score relevance, generate, gate, and post on a much tighter loop than the hourly broadcast cron. Bolting a listening loop onto the broadcast edge function couples two very different cadences and risks the spam-detection blast radius hitting the whole account. A small dedicated repo/service for the reply engine, with the broadcast function left as-is, is the cleaner architecture. The new code is narrow: List-polling listener, relevance/safety scorer, human-approval queue. The posting primitive (`post-reply-tweet`) and the cadence rules already exist.

## 6. Prioritized roadmap

Ordered by conversion impact per unit of effort. Downloads first, never reach.

1. **Finish the profile-as-landing-page (delta on what shipped June 13).** Rewrite the bio to the value line and repoint the website to a CPP-tagged link via the existing `update-x-profile` function `[edge-function change, function already exists]`; compose a rolling results-receipt pin to replace the current evergreen one `[edge-function compose]` and re-pin `[manual, no pin API]`; set the header to a pick-card/results screenshot `[manual]`. Highest ROI, near-zero net-new code, fixes the surface that already out-converts everything.

2. **Wire App Store Connect campaign tags plus one Custom Product Page (then scale).** Distinct `ct` tokens per surface (keep to ~5); route profile/pinned to one focused CPP; verify the tagged CPP URL actually attributes installs to its `ct` before relying on it. `[manual/ops]` in App Store Connect. This is the measurement spine and the biggest downstream install-rate multiplier. Do it before changing tweet formats so you can tell what works. Build the additional CPPs only after a token clears the five-install floor. Set expectations: weeks before tokens report.

3. **Stand up the weekly X-side scoreboard from existing data.** Pull per-tweet profile clicks, bookmarks, and link clicks (already stored by `get-tweet-metrics` / the v6 refresh in `social_post_log`) into a weekly view, reading hook-level profile clicks off the hook row, and retire the impressions sum as the headline. `[edge-function change / re-surface, already instrumented]`. Lets every format be judged on intent signals immediately, before ASC attribution matures.

4. **Remove the code-baked voice violations.** Delete the EMOJI map application, the `Full breakdown` arrow, the `TOP PICK OF THE DAY` block, and the appended hashtags from pick/recap output. `[edge-function change]`. Trivial effort, removes the generic-bot signals repelling the right audience.

5. **Enforce the withhold policy in pick mode plus restructure the thread.** Hook = angle + shorthand pick/odds + the single strongest falsifiable factor (lead-with-strongest, strip the rest), with a stance-to-argue closer used in a minority of posts only; kill the free breakdown tweet; replace tweet 3 with a bio handoff (no inline link, or a self-reply CPP link with `ct=x_pick_reply`); add the no-rule-of-three handoff guard. `[edge-function change]`. Restores the reason to download.

6. **Flip recaps to fully open receipts.** Name wins and losses, show running record, point to profile not a buried link. `[edge-function change]`. The trust engine; low effort, high conversion for a picks product.

7. **Add the receipts/results quote-tweet mode.** On grading, quote-tweet the original pick with an honest verdict. `[edge-function mode + small new endpoint]`: add `post-quote-tweet` (or extend `post-single-tweet` with `quoteTweetId`) reading `hook_tweet_id` from `social_post_log`; until it ships, use the paste-the-URL reply fallback. The flagship repostable format.

8. **Productize the reply-engagement engine.** Start with own-post reply-backs (human-gated, then automate the safe slice once X API read access is confirmed), then outbound replies to a curated List (human-gated longer). `[new build]`, a **dedicated repo/service** with its own listening loop, kept separate from the broadcast function to contain spam-detection blast radius. Reuse the existing manual playbook (above-200-views, Top tab, vary phrasing, 10-15/day cap, counter-takes OK) as the gate spec; reuse `post-reply-tweet` as the posting primitive. **Precondition for 8A:** confirm the X API tier permits conversation/mention reads and build a `get-mentions` endpoint; full reply-back automation is blocked until then. Biggest untapped reach-to-NEW-bettors lever; gated rollout because raw-AI replies can kill the account.

9. **Fix posting timing and add daily personality variety/poll (gated).** Shift picks toward pregame/slate-lock windows and the weekday peak instead of blind hourly firing; rotate in free personality posts to break template monotony (also a 2026 bot-detection risk). Add the marquee poll only as a gated experiment (Section 4 item 5): keep it solely if poll days lift profile clicks/bookmarks and `ct`-attributed installs, kill it if it only moves vote count. Polls need `post-single-tweet` extended with an optional `poll` object `[small edge-function change, confirmed needed]`.

10. **Cap and vary cadence.** Move volume from broadcasts to replies; ensure no two days ship the identical skeleton; never default-append a question-closer. `[edge-function change]`.

11. **Upgrade lanes (when bandwidth allows):** deferred-deep-link landing page on betwithgary.ai `[new build]`, completes first sessions on the teased pick and can convert better than a cold store link; native short-form video pipeline `[new build]`, directional reach upside, A/B test against attributed installs before scaling; the live game-thread sweat auto-cron + ESPN-ID matcher `[new build]`, verify native-sports surfaces first.

**Architecture note:** Items 1-7 and 9-10 extend the existing `social-auto-post` edge function (item 7 adds one small posting endpoint). Item 8 (the reply engine) is the one piece that genuinely benefits from a separate service: a fundamentally different cadence (continuous listening vs hourly broadcast) and a different risk profile (spam-classifier exposure), and isolating it protects the broadcast account from a bad reply pattern. The video and landing-page lanes (item 11) are also net-new builds outside the function. Everything else stays in Deno/Gemini where it already lives.

**One measurement discipline to close on:** start the weekly profile-clicks-and-bookmarks scoreboard from existing data now, wire `ct`-attributed installs and first-session/retention next, then kill any format that produces reach without installs, even if it "performs" on impressions or likes. The legacy 20k-impressions KPI is retired to a diagnostic. The scoreboard is installs and retained, happy bettors.

---

## Top 5 changes to ship first

1. **Remove the code-baked voice violations in `index.ts`** (EMOJI map, `Full breakdown` arrow, `TOP PICK OF THE DAY` block, appended hashtags). `[edge-function]` — Conversion effect: strips the generic-gambling-bot signature that repels the genuine bettors Gary needs and attracts touts/bots, raising the quality of every profile visit a post produces.

2. **Enforce the withhold policy in pick mode and kill the buried CTA tweet** (hook = angle + shorthand pick/odds + single strongest falsifiable factor; drop the free breakdown; replace tweet 3 with a bio handoff). `[edge-function]` — Conversion effect: restores the reason to download by holding the full read and the rest of the slate in the app, and moves the install path off the throttled buried link onto the bio/profile that already out-converts it.

3. **Finish the profile-as-landing-page** (rewrite bio to the value line and repoint website to a CPP-tagged link via `update-x-profile`; compose and pin the rolling receipts post; set the header screenshot). `[manual]` (bio/website via existing function; pin and header by owner) — Conversion effect: turns the profile, the surface that already earns the most clicks, into a promise-plus-proof page whose one job is the install.

4. **Wire App Store Connect `ct` tags + one CPP, and stand up the weekly X-side scoreboard from existing `get-tweet-metrics` data.** `[manual]` (ASC tags/CPP) — Conversion effect: makes installs and retention attributable per surface and lets profile-clicks/bookmarks be tracked today, so every later format change is judged on downloads instead of impressions.

5. **Flip recaps to fully open receipts** (name wins and losses, running record, point to profile not a buried link). `[edge-function]` — Conversion effect: builds the verifiable trust that makes a free picks-app download feel safe, the documented driver that converts skeptical bettors into installers.
