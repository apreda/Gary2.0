# Gary Social Growth — Three Engines + Engine 0

**Date:** July 5, 2026
**Status:** Direction approved by founder (Jul 5 session). This document is the spec for the build-out.
**Supersedes nothing:** `X_CONVERSION_STRATEGY.md` (Jun 16/22) remains the X-format bible. This spec adds the distribution layer that strategy assumed would come later.

## 1. Problem

The June work fixed the conversion layer (voice, cards, receipts, attribution, link placement). It did not fix distribution, and conversion of zero traffic is zero. Last 30 days of real data:

- ~154 posts, ~36k impressions (~240 avg/post), ~152 replies, ~25 likes.
- **5 total clicks ever** on `betwithgary.ai/get` (the only download-intent signal in the system).
- 3 @-mentions in the last 7 days. ~50 followers. X blocks the account's outbound API replies (account-level trust limit, Jun 18).

Diagnosis: a finished bottom-of-funnel on top of a top-of-funnel that is effectively zero. The remaining levers are founder-gated (manual engagement, new-channel signups, budget), not code-gated.

## 2. Founder inputs (locked Jul 5, 2026)

- **~15 min/day** of manual X engagement from his phone as @BetwithGary.
- **Signups:** TikTok, Instagram (Reels), YouTube (Shorts). Reddit declined.
- **Budget:** $250–750/mo.
- Hard requirement: **every new surface starts in preview mode** — nothing new auto-posts until the founder has approved real samples.

North star unchanged: **app downloads + retained, happy users.** Impressions/followers are diagnostics.

## 3. Research findings (Bookit network, reviewed live Jul 5)

Accounts studied: @BookitWithTrent (410K), @shadybiev (24.8K), @BookitHQ (brand hub).

1. **The pick → verdict quote-tweet loop is the core engine.** Every pick post gets quote-tweeted after settlement with a raw one-line verdict ("NEVER A FUCKIN DOUBT" / "shit ain't hitting sorry gang" / "I was on the lake so didn't see shit but how's ya 3-0?"). Doubles content per pick, farms replies twice, and the quote surfaces the original timestamped call — native receipts, no card required. Verdict posts routinely out-view the picks themselves (32K–108K).
2. **Personality carries reach; the brand collects it.** @BookitHQ gets ~5.8K views while Trent gets 65K–400K. @BetwithGary must behave like a personality account, never a brand account.
3. **Recurring vocabulary compounds.** biev's "how's ya," Trent's "MEGA MAX" — followers learn the bits and echo them. Gary needs his own fixed, repeated vocabulary.
4. **Season-long public arcs serialize the account.** Trent's pinned $10K→$100K challenge turns every post into an episode of a show.
5. **The room is hostile to AI slop** (biev literally posts "Don't have time for AI slop" above a pick). Gary steals these accounts' *mechanics*, never their costume: zero emojis, no ALL-CAPS cosplay, no fake cash-wager claims, voice rules intact.

## 4. Engine 0 — X mechanics upgrade

Extends `social-auto-post` + one small endpoint. This is the highest-priority X work; it replaces format-polish as the X lever.

### 4.1 The Verdict Loop (build first)

When a game that Gary tweeted a pick for goes FINAL, Gary quote-tweets **his own original pick tweet** with a one-line in-voice verdict, within ~1 hour of the final.

- **Endpoint:** new `post-quote-tweet` edge function (or extend an existing post fn) — X API v2 `POST /2/tweets` with `quote_tweet_id`, same OAuth 1.0a pattern as `post-reply-tweet`.
- **Mode:** new hourly path in `social-auto-post`. Join `game_results` (and `prop_results` where relevant) against `social_post_log` rows that have a `hook_tweet_id` and no verdict yet. Dedup via a `thread_format='verdict'` log row keyed to the original tweet id.
- **Scope:** all sports, only picks that were actually tweeted (~3–4/day ceiling by construction).
- **Voice:** new few-shot verdict examples — win = short swagger, loss = owned flat ("that one's on me"), push = shrug. Zero emojis, `killDashes`/`killEmoji` backstops, no records claimed except from the real-record block (same guard as the mention bot).
- **Preview:** `?dry_run=1` renders the exact verdicts without posting. Founder approves samples across at least one full slate day before the cron path goes live.

### 4.2 Gary's running bits

A small fixed vocabulary (~6–10 phrases) — Gary's equivalents of "how's ya," in cigar-boss-bear register — seeded verbatim into the VOICE_RULES few-shots of `social-auto-post` AND `gary-mention-reply` so every surface sounds like one guy. Deliverable: a one-page bits sheet the founder reacts to before it ships. Bits must be usable on wins, losses, and mid-game sweats, and must never claim a cash wager or break the never-an-AI rule.

### 4.3 Season arc pin ("$100 flat, every pick, all season")

Gary's honest version of Trent's challenge, using math we already compute (the results-card $100-stake P/L): the pinned post announces the arc — every pick he posts, $100 flat stake, running P/L, all season, wins and losses on the tape. A weekly standing update posts as a reply appended to the pinned thread (keeps the anchor stable; no pin API — founder pins once). The App Store link stays in the pin's first reply with `ct=x_pinned`.

### 4.4 Live sweats — PHASE 2 (deferred)

Top-pick-of-the-day only, 1–2 in-game posts on big moments. Blocked on the ESPN-event-id→Gary-pick matcher. Do not build until the Verdict Loop has run cleanly for 2+ weeks.

## 5. Engine 1 — Vertical video pipeline (TikTok + Reels + Shorts)

One render pipeline, three channels, manual posting first.

- **Content:** daily 20–30s clip rendered from the same data the OG cards use. Two formats at launch: (a) **pick clip** — animated pick card + kinetic-text hook (the same angle/edge copy the X caption uses) + Gary voiceover; (b) **receipts clip** — "yesterday's tape" when the record is worth bragging about (or an honest-loss version; honesty is the differentiator). 1080×1920 MP4.
- **Voiceover:** a consistent character TTS voice (gravelly, boss-bear; ElevenLabs or equivalent, ~$5–22/mo). Gary is a character, never an AI, in video exactly as in text.
- **Build:** new `gary2.0/video-pipeline/` directory. Preferred tool: Remotion (React → MP4, reuses the design-token/typography system the OG cards already encode); fallback: the proven headless-Chrome frame render + ffmpeg assembly. Local-first like `results-card/` was; cloud later if the channel earns it.
- **Preview gallery (hard gate):** every render lands in a local gallery (folder + HTML index) the founder reviews. **For the first weeks, the founder posts approved clips manually from his phone** — new accounts posting natively is also what the platforms' cold-start algorithms favor. Automation is a later decision, per channel, after samples are approved and the channel shows signal.
- **Founder setup:** create the three accounts (handles/bios/avatars staged in `CHANNEL_ROLLOUT.md`); app-store link in every profile bio (distinct `ct` per channel: `ct=tiktok`, `ct=ig`, `ct=yt`).
- **Cadence:** 1 pick clip/day + receipts clips opportunistically. Consistency over volume.

## 6. Engine 2 — Daily Engagement Sheet (the founder's 15 min/day)

Turns the founder's thumbs into the distribution channel the API ban blocks.

- **Generator:** revive the held `find-reply-targets` concept for MANUAL use: X API search (pay-per-use reads, confirmed working; ~$5–15/mo bounded) over a curated list of big open-reply sports accounts (beat writers, league/media accounts, betting personalities), filtered to today's slate teams and recent high-engagement tweets. Gemini drafts one Gary reply per target, grounded in `daily_picks` (no fabrication; declines when no relevant pick — same anti-spam rule as `reply-with-pick`).
- **Sheet contents:** 8–10 outbound targets with drafted replies + a **reply-backs section** (recent replies to Gary's own posts worth answering, with drafts — the +75 algorithm signal) + at most one quote-tweet opportunity.
- **Delivery:** a token-gated page on betwithgary.ai (unlisted URL the founder bookmarks on his phone), regenerated each morning ~9:30am ET by cron. Tap target → opens the tweet in the X app; copy draft → paste → send. Push/notification delivery is a later nicety.
- **Rules carried over:** never a link in replies, no "tail me," vary structure, zero emojis, counter-takes welcome, skip hostile bait.

## 7. Engine 3 — Paid floor + weekly scoreboard

- **Apple Search Ads:** ~$300/mo (~$10/day), Advanced (keyword control). I deliver the keyword plan (high-intent: "sports betting picks," "AI sports picks," prediction/competitor terms), campaign structure (exact-match core + discovery), and a CPI guardrail (~$5 initial; kill/rebid weekly). Founder does the account + payment step. ASA attribution is native in App Store Connect.
- **Micro-influencer tests:** $200–400 held back. Trigger: ASA shows installs retain (D7 signal). Two tests with 10K–100K genuine-engagement betting/degen accounts; honest framing; founder DMs and pays. I deliver the shortlist + outreach brief.
- **Weekly scoreboard (Mondays):** one short report joining `/get` clicks by `ct`, X followers + per-format engagement (`social_post_log`), ASA spend/installs, App Store Connect Campaigns units, and manual video-view reads. Every engine gets kill/scale decisions from this sheet, nothing from vibes. Legacy impressions KPI stays retired.

## 8. Preview-first discipline (applies to everything above)

| Surface | Preview mechanism | Goes live when |
|---|---|---|
| Verdict Loop | `?dry_run=1` full-slate samples | Founder approves a full day of verdicts |
| Bits sheet | One-page doc | Founder reacts/edits |
| Season arc pin | Draft post + first weekly update | Founder pins it himself |
| Video clips | Local render gallery | Founder approves + posts manually (weeks 1–n) |
| Engagement sheet | Inherently human-sent | Immediately (founder is the gate) |
| ASA | Campaign plan doc | Founder funds the account |

## 9. Measurement — 30-day checkpoints (directional targets, not promises)

By ~Aug 5, 2026: X followers 50 → 300+; `/get` clicks ~0.5/day → 5+/day; ASA CPI < $5 with D7 retention ≥ 20%; at least one video > 10K views; verdict-loop posts out-engaging pick posts (replies/views per post). Any engine that misses badly gets rethought or killed at the 30-day mark.

## 10. Non-goals

Emojis; ALL-CAPS persona cosplay; fabricated cash-wager or "watched every minute" claims; engagement-bait polls; buying followers; Reddit (declined for now); further X post-format polish as a growth strategy; automating video posting before channels earn it.

## 11. Founder action items

1. Create TikTok / Instagram / YouTube accounts (handles+bios will be staged; ~1 hour).
2. Apple Search Ads account + payment method (~$300/mo authorization).
3. Commit to the 15 min/day engagement-sheet routine.
4. Pin the season-arc post when it's ready.
5. (Carried over, still open) Set the X Developer Console monthly spend cap; delete the throwaway `x-api-probe` fn.

## 12. Sequencing (two weeks)

**Week 1:** `post-quote-tweet` endpoint + Verdict Loop behind dry-run → founder approves a slate day → live. Bits sheet drafted + approved → seeded into both fns' prompts. Engagement Sheet v1 (curated account list + generator + token page). Founder: signups + ASA account. Video pipeline scaffold (first render, no channels needed yet).
**Week 2:** Season-arc pin drafted + pinned. First video clips through the preview gallery → founder starts manual posting cadence. ASA campaigns live. Influencer shortlist prepared (held for retention data). First Monday scoreboard.

## 13. Addendum (Jul 5, post-approval) — the Cal AI / RizzGPT playbook, applied

Founder pointed at the Blake Anderson (RizzGPT, Umax) / Zach Yadegari (Cal AI, ~$30M ARR 2025, acquired by MyFitnessPal) playbook; their thesis is that distribution, not the app, is the moat. Reviewed their public material Jul 5. Amendments:

1. **3-second demonstrability rule (amends Engine 1).** Every clip's first 3 seconds must show the money shot, legible with sound OFF. Gary's money shot = the graded tape (green/red receipts + record) or the instant pick reveal. "If you cannot explain the value proposition in a 7-second silent video, organic reach will struggle" — this is now a hard acceptance criterion in the video preview gallery. Also adopted: native lo-fi over polish, subtle/indirect CTAs, batch hook testing (3–5 hook variants/week at our scale; keep winners, kill losers).
2. **Influencer lane restructured to a standing funnel (amends Engine 3).** Not "2 curated tests" — a weekly funnel: I build creator target lists (sports/betting/degen niches, TikTok+IG) and draft personalized DMs; founder sends 20–30/week; expect roughly a 10% reply and ~2% post rate (their observed funnel: 500 → 50 → 10); pay $50–100/post for native-style content with creator creative control (never a forced script). Per-creator attribution via minted redirect links (`betwithgary.ai/get?ct=cr_<handle>` — the `/get` route + `link_clicks` table already support arbitrary `ct`). Up to ~$300/mo of the envelope may fund micro-posts alongside ASA once the first hooks validate.
3. **Channel-economics rule (amends the scoreboard).** Scale only channels where 2×LTV > CAC (their RPM/CPM rule). Paywall LTV from app analytics feeds this as install data accrues; until LTV data exists, CPI + D7 retention are the proxies.
4. **Scale honesty.** Their revenue came from thousands of outreach messages and, later, $1M/mo paid. We adopt the funnel discipline and demonstrability rules at our budget; targets in §9 are unchanged.
5. **Future app-side K-factor lever (out of scope for this spec):** a shareable "wrapped"-style recap (Spotify-recap mechanic) building on the locked share card — noted for a future app cycle, not this build.

## 14. Architecture notes

- Engine 0 extends `social-auto-post` (one new small posting endpoint), same deploy path: `supabase functions deploy <fn> --project-ref xuttubsfgdcjfgmskcol --use-api`, and commit to git `main` (web routes on betwithgary.ai auto-deploy from git; CLI-only Vercel deploys get clobbered).
- Engine 2's generator is a new edge fn + one table (sheet rows) + one token-gated web route in `web/`.
- Engine 1 is a new local-first directory (`video-pipeline/`), isolated from the posting infra.
- Nothing in this spec touches Gary's pick logic — presentation and distribution only.
