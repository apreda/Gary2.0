# SCOPE: Gary Reply-Engagement Engine

**Owner:** @BetwithGary growth / social automation
**Date:** 2026-06-16
**North Star:** App downloads + retained users (NOT impressions). Reply engagement is the single highest-leverage untapped lever — the account does zero automated reply outbound today.
**Scope boundary:** This doc covers reaching NEW users by replying into sports-Twitter conversations. It does NOT touch the existing `social-auto-post` broadcast function (compose+post on hourly cron), which stays exactly as is.

---

## PROBE RESULT — recorded Jun 16 2026 (step 1 DONE)

Ran `x-api-probe`. **All read access confirmed; the engine is NOT blocked on API tier:**
- `self` (`/2/users/me`): 200, user id `2001291581446631424`, handle BetwithGary, **access level `read-write`**.
- **Owned read** (`/2/users/:id/mentions`): 200, 5 results, rate remaining 299 → **Sub-Engine A (reply-backs) unblocked.**
- **Recent search** (`/2/tweets/search/recent`): 200, 10 results, rate remaining 299 → **conversation/target finding for Sub-Engine B unblocked.**
- **List reads** (`/2/lists/:id/tweets`): 200 (404-style not-found because a dummy list id was used, which still proves the endpoint is reachable), rate remaining 899 → **list reads work.**

Conclusion: `authOK / ownedReadOK / searchOK / listOK` ALL true. Both sub-engines are capability-cleared. Reads are pay-per-use; founder should set a monthly spend cap in the X Developer Console as a circuit breaker (checklist step 2). **The throwaway `x-api-probe` function should be DELETED now that the verdict is recorded** (Supabase MCP has no delete; remove it in the dashboard or via `supabase functions delete x-api-probe`).

---

## 0. TL;DR for the founder

- The X **developer** API in 2026 is now **pay-per-use credits**, not the old flat $200/$5,000 tiers (those are closed to new signups). Reads cost money per resource. This is good news: small reply-engine read volume is **cheap** (single-digit dollars/month), and reading **our own** posts' replies is the cheapest action of all.
- We do **not** know empirically what our current X app project's developer access level grants, because we've only ever used **write** endpoints (post/reply/delete/metrics). The metrics endpoint working tells us little about read scopes for mentions/search/lists.
- **Step 1 is a throwaway probe** (`x-api-probe`) that hits the three read endpoints once each and reports 200/403/429. Everything downstream is gated on its result.
- Build it as a **separate service**, not bolted onto the broadcast function. Different risk profile: outbound replies are the classic shape that gets accounts mass-reported, muted, and suspended. It needs its own listening loop, its own gates, and a **human-approval queue** before any auto-send.
- **Manual-first rollout.** System drafts, founder approves, for ~2 weeks. Only the safest slice (reply-backs to non-hostile people who replied to us) graduates to automation, and only after the probe confirms the tier.

---

## 1. X API capability gate (live-researched, June 2026)

### 1.1 The pricing model changed — this is the most important finding

As of **February 2026**, X moved new developers to **pay-per-use credits** as the default. You buy credits up front in the Developer Console; each request deducts credits. There are no contracts, no subscriptions, no minimum spend. The old flat **Basic ($200/mo)** and **Pro ($5,000/mo)** tiers still exist **only for accounts that already subscribed** — a new developer cannot buy them. The standalone **Free** tier was discontinued (new accounts start on pay-per-use). **Enterprise** (~$42,000+/mo) sits above pay-per-use for very high volume.

Pay-per-use rates (verified, current as of the April 20, 2026 update):

| Action | Price | Notes |
|---|---|---|
| Post read (non-owned) | **$0.005** per resource | reading other people's posts / search results / list tweets |
| **Owned read** | **$0.001** per resource (1,000 for $1) | your own posts, mentions of you, your bookmarks/followers/lists — when `{id}` is the authenticated app-owner |
| Post created (standard write) | **$0.015** per request | (was $0.010, raised April 2026) |
| Post containing a URL | **$0.20** per request | steep — relevant only if Gary ever posts links (our replies carry no links, so N/A) |
| Monthly read cap (pay-per-use) | **2,000,000** post reads/month | beyond this you must move to Enterprise |

Cost-control levers built into the console: **max spend per billing cycle** (hard stop — requests blocked once hit) and **auto-recharge**. We will set a low monthly cap (e.g. $25) as a circuit breaker.

> **Uncertainty flag (read honestly):** training data predates some of mid-2026. The per-action rates above are corroborated across the official `docs.x.com/x-api/getting-started/pricing` page and the X Developers April-2026 announcement, but X has changed this pricing **repeatedly** (Feb 2026 launch, April 2026 revision). Treat exact cents as "confirm in the Developer Console at build time." The **shape** (pay-per-use credits, owned-reads cheapest, $0.005 non-owned reads, 2M/mo cap) is well-sourced. The legacy flat tiers being closed to new signups is also well-sourced.

### 1.2 Which access do our endpoints need

All four target endpoints are **X API v2 GET** endpoints. They require an app **tied to a Project** with **read** access (OAuth 1.0a user context or OAuth 2.0 bearer). Under pay-per-use, "access" is less about an endpoint being tier-locked and more about **whether our existing project has a read-capable access level and credits attached**. Endpoint-by-endpoint:

| Endpoint | What it gives Gary | Billing class | Caveat |
|---|---|---|---|
| `GET /2/users/:id/mentions` | replies/mentions of @BetwithGary | **Owned read** ($0.001) when `:id` = our own user id | cheapest; the core of Sub-Engine A |
| `GET /2/tweets/search/recent` | target tweets via query, and replies in a thread via `query=conversation_id:<id>` | **Non-owned read** ($0.005) | recent = last ~7 days only; full archive is Pro/Enterprise-only and we don't need it |
| `GET /2/lists/:id/tweets` | tweets from a curated List of 15-30 accounts | **Non-owned read** ($0.005) | feeds Sub-Engine B targeting |
| `GET /2/users/:id/tweets` | a specific account's recent posts | Non-owned read ($0.005) | optional/secondary targeting source |

### 1.3 Minimum access Gary needs

- **(a) Reading replies to our own posts** → `GET /2/users/:id/mentions` (and/or `search/recent` with `conversation_id`). Needs a **read-enabled project on pay-per-use** with credits. Mentions of self = **owned read = $0.001**. This is the cheapest possible path and the foundation of the whole engine. Likely **$1-3/month** at our volume.
- **(b) Finding target tweets from a List or via search** → `GET /2/lists/:id/tweets` and/or `GET /2/tweets/search/recent`. Needs the same read-enabled pay-per-use project; these are **non-owned reads ($0.005)**. At ~30 list pulls/day × ~25 tweets = ~750 reads/day ≈ 22,500/mo ≈ **$110/mo at full tilt**, but our actual targeting reads far fewer (poll a List a few times/day, dedupe). Realistically **<$15/mo**.

**Net:** the minimum we need is a **read-enabled v2 Project on the pay-per-use plan with a small credit balance and a monthly spend cap.** We are NOT forced into legacy Basic/Pro. Whether our *current* project already has read access attached is exactly what the probe in §2 determines.

> **Premium+ reminder (do not conflate):** the account's **$40/mo X Premium+ consumer subscription** boosts own-post reach and reply visibility, but grants **zero** API read scopes. API read access is governed entirely by the **developer** pay-per-use plan / project access level above.

**Sources:**
- https://docs.x.com/x-api/getting-started/pricing
- https://devcommunity.x.com/t/x-api-pricing-update-owned-reads-now-0-001-other-changes-effective-april-20-2026/263025
- https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476
- https://www.xpoz.ai/blog/guides/understanding-twitter-api-pricing-tiers-and-alternatives/
- https://docs.x.com/x-api/posts/search-recent-posts
- https://developer.x.com/en/support/x-api/v2

---

## 2. API-tier verification probe — `x-api-probe`

A tiny, **throwaway**, **read-only** Supabase edge function. Purpose: learn our project's *actual* read access **empirically** by hitting each endpoint once and reporting the HTTP status, instead of guessing from docs. Delete it once the answer is recorded.

**Project ref:** `xuttubsfgdcjfgmskcol` (same as existing X functions).
**Auth:** reuse the existing OAuth 1.0a secrets already in the project — `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` — signing exactly the way `post-reply-tweet` already does (copy its OAuth 1.0a header-builder verbatim; do not rewrite the signing). For GET requests with query params, **the query params must be included in the OAuth signature base string**, alphabetically sorted, which is the one gotcha vs. the existing POST helpers.

**Three probes (each wrapped in try/catch, never throws, always returns its status):**

| Probe | Method + URL | Tests |
|---|---|---|
| (a) own mentions | `GET https://api.twitter.com/2/users/:id/mentions?max_results=5` (`:id` = @BetwithGary's numeric user id) | owned-read access |
| (b) conversation search | `GET https://api.twitter.com/2/tweets/search/recent?query=conversation_id:<KNOWN_ID>&max_results=10` | recent-search / non-owned read |
| (c) list tweets | `GET https://api.twitter.com/2/lists/:listId/tweets?max_results=5` (any test List id) | list-read access |

Bootstrap helper inside the same function: `GET https://api.twitter.com/2/users/me` to resolve our own numeric `:id` (needed for probe (a)) and confirm auth works at all. If `me` itself 401s, the secrets/scope are wrong and nothing else matters.

**Verdict mapping per probe:** `200 → "OK"`, `403 → "TIER_GATED"` (read the `x-access-level` / error `detail` body — e.g. `client-not-enrolled` means our project lacks that read scope/credits), `429 → "RATE_LIMITED"` (capture `x-rate-limit-remaining` / `x-rate-limit-reset` headers; means we DO have access, just throttled — a *pass* for capability purposes), `401 → "AUTH_FAIL"` (signing/secrets broken). Always surface the raw status code and the first ~200 chars of the error body so we can read X's exact reason.

**Safety:** GET-only, `max_results` tiny (5-10), one call per endpoint per invocation, no writes, no loops. Trigger manually — no cron. Total cost of one run: a handful of reads (~$0.01). **Delete the function after recording the verdict** in the build log.

---

## 3. Two sub-engines

Both produce the same artifact: a **drafted reply row** in an approval queue. Neither posts directly in the manual-first phase.

### Sub-Engine A — Reply-BACK on Gary's own posts (the safe, high-distribution one)

- **Why:** an **author replying back** to a genuine reply on their own post is a heavy distribution signal — it resurfaces the original post and pulls the replier (and lurkers) toward the profile. Lowest abuse risk because these people **already engaged with us**. Cheapest reads (owned, $0.001).
- **Trigger:** for each @BetwithGary post from the last **2-3 hours**, fetch its repliers.
- **How targets are found:** `GET /2/users/:id/mentions` (owned read) filtered to replies whose `in_reply_to_user_id` = us / `conversation_id` matches one of our recent post ids; OR `GET /2/tweets/search/recent?query=conversation_id:<ourPostId>`. Dedupe against an `engaged_replies` table so we never reply to the same person on the same thread twice. Skip our own founder account `@AdamPreda007`.
- **Loop:** `find replier → relevance+sentiment gate (§4) → Gemini drafts a short, fact-carrying reply that answers the person → enqueue for approval → on approve, post via post-reply-tweet({text, replyToId: replierTweetId})`.
- **Cadence/safety:** only act inside the **first 2-3 hours** of a post. Max **1 reply-back per unique person per thread**. Cap **~8-12 reply-backs/day** total. Space sends **5-10 min apart**. Skip if sentiment gate flags hostile/troll/spam.

### Sub-Engine B — OUTBOUND replies into a curated List (the growth one, higher risk)

- **Why:** this is how we reach people who've **never heard of Gary** — by adding a genuinely useful, specific reply under an active tweet from a relevant account. Highest new-user reach, **highest abuse risk** (it's literally the unsolicited-reply pattern spam classifiers hunt).
- **Targets:** a hand-curated X **List** of **15-30 accounts** strictly within Gary's leagues — **MLB / NBA / NFL / NHL / NCAAB / NCAAF** beat writers, odds/handicapping accounts, team accounts. **Never** EPL, **never** WNBA, **never** the founder's personal `@AdamPreda007`.
- **How targets are found:** poll `GET /2/lists/:id/tweets` (and/or `search/recent` scoped to those handles) a few times/day. Filter to tweets **above ~200 views/impressions** (the validated manual bar — proxy via `public_metrics` reply/like/retweet counts since impressions aren't always exposed), posted in the last ~60-90 min (replying while the thread is live), in-league, not already replied to.
- **Loop:** `pull list tweets → in-league + freshness + min-engagement filter → relevance+sentiment gate (§4) → Gemini drafts a short counter-take or specific factual add (counter-takes ALLOWED, must carry a real fact, never salesy, no link) → enqueue for approval → on approve, post via post-reply-tweet`.
- **Cadence/safety:** **Top-tab logic, not Latest**. **Like-then-reply** (founder likes on approve in v1). Space **5-10 min apart**. **Max 1 reply per target account per day** and **max 1 reply per thread**. Total outbound cap **~6-10/day**, and **combined A+B ≤ 15/day** to respect the manual playbook ceiling. Vary phrasing every time (anti-repetition check against the last N sent replies). Hard skip on any hostile/political/non-sports thread.

### Shared sentiment/quality gate (applies to both)

Before drafting, classify the target tweet/replier. **Skip entirely** if: hostile/insulting toward us or anyone, troll/ragebait, spam/bot, off-topic (not one of the six leagues), political, contains a slur or NSFW, is itself an ad, or is from a locked/tiny/throwaway account. Only **neutral-to-positive, genuinely-sports** targets pass. This gate is what keeps Gary from getting dragged into fights that trigger reports.

---

## 4. Architecture

**Recommendation: build a SEPARATE service. Do NOT extend `social-auto-post`.**

Rationale: `social-auto-post` is a fire-and-forget **broadcaster** (compose → post on a clock). The reply engine is a **listener** (poll → score → queue → human → post) with a fundamentally **different risk profile**: outbound replies are the spam-classifier blast radius. Coupling them means a reply-engine bug or a spam flag could jeopardize the broadcast cron. Isolate the blast radius.

### Components (minimal, concrete)

1. **Poller (edge function `reply-engine-poll`, on cron):** Sub-A fetch own mentions / `conversation_id` replies for posts <3h old; Sub-B pull the curated List's recent tweets with in-league + freshness + min-engagement filters; dedupe against `reply_targets` / `engaged_replies`.
2. **Scorer:** Gemini relevance + safety gate (reuse the Gemini wiring in `social-auto-post`); on pass, drafts the reply text under the HARD VOICE RULES; writes a `reply_drafts` row `pending_review`.
3. **Voice/rule validator (deterministic):** rejects any draft with emojis, em/en dashes, hashtags, URLs, banned capper phrases, motivational/corporate filler, or any first-person cash-wager / lived-human-experience claim. Runs regardless of approval mode.
4. **Human-approval queue (`reply_drafts` table + thin review surface):** founder approves/rejects; in automation phase the safest slice auto-flips to approved.
5. **Poster (`reply-engine-send`, on cron):** picks up `approved` drafts, enforces cadence/caps, posts via existing `post-reply-tweet`, logs the result; optionally calls `get-tweet-metrics` 24h later to measure `user_profile_clicks` (closest proxy to "moved someone toward the app").

### Data tables (Supabase)

```
reply_targets   -- id, source ('mention'|'list'|'conversation'), target_tweet_id, target_user_id,
                   target_handle, league, conversation_id, public_metrics jsonb, discovered_at,
                   status ('new'|'gated_skip'|'drafted'|'duplicate'), gate_reason
reply_drafts    -- id, target_id fk, reply_text, sub_engine ('A'|'B'), gemini_model,
                   validator_passed bool, status ('pending_review'|'approved'|'rejected'|'sent'|'error'),
                   approved_by, created_at, sent_at, posted_tweet_id, error_detail
engaged_replies -- id, target_user_id, conversation_id, posted_tweet_id, sub_engine, sent_at
reply_engine_config -- single row: daily_cap, per_account_cap, spacing_minutes, list_id,
                       auto_mode bool, max_post_age_minutes, min_engagement
```

### Cron / loop cadence

- `reply-engine-poll` + scorer: every **15-20 min** during sports hours, quiet overnight.
- `reply-engine-send`: every **5-10 min**, posts at most one approved draft per tick (this is the spacing mechanism), respects daily caps.

---

## 5. Manual-first rollout

**Principle: earn automation. Start fully human-in-the-loop and graduate only the provably-safe slice.**

- **Stage 0 — Probe (gate everything):** deploy + run `x-api-probe`. Record `ownedReadOK / searchOK / listOK`. If owned-read fails, the engine is blocked until read access + credits are attached. If only search/list fail, **Sub-A (mentions-only) can still ship**.
- **Stage 1 — Manual drafting, founder approves (~2 weeks):** system fills `reply_drafts` with `pending_review` rows; nothing posts without approval. Track approval rate, rejection reasons, and `user_profile_clicks` per reply. Goal: prove the voice/relevance bar (>80% approvable, zero voice-rule violations) before any automation.
- **Stage 2 — Graduate the safest slice only:** flip **Sub-A reply-backs to non-hostile repliers** to auto-approve once the bar holds and the tier is confirmed. **Sub-B outbound stays human-approved** for longer (or indefinitely).

**Why raw auto-replies are dangerous:** unsolicited, automated, AI-generated replies into strangers' threads are the textbook pattern X's spam systems and human reporters target. Volume + sameness + irrelevance + salesiness = mass-report → mute → shadow-limit → suspension, which would kill both this engine and the broadcast KPI. The gates (sentiment skip, deterministic voice validator, anti-repetition + caps + spacing, human approval first) are the insurance.

---

## 6. Build checklist (ordered by dependency)

1. **[probe]** Build + deploy `x-api-probe` (reuse OAuth 1.0a signer from `post-reply-tweet`; GET query params go into the signature base string). Resolve own `:id` via `/2/users/me`. **GATE: run it, record `ownedReadOK / searchOK / listOK`.**
2. **[manual/ops]** Based on the probe, attach read access + a small credit balance to the X developer project; set a monthly spend cap (~$25) as a circuit breaker. Confirm rates in-console.
3. **[manual/ops]** Curate the X List of 15-30 in-league accounts (no EPL/WNBA/@AdamPreda007). Record `list_id`.
4. **[new service]** Create the four Supabase tables; seed config with conservative caps (daily 10, per-account 1, spacing 7 min, `auto_mode=false`).
5. **[edge-function]** `reply-engine-poll` (Sub-A gated on `ownedReadOK`; Sub-B on `searchOK`/`listOK`).
6. **[edge-function]** Scorer (Gemini gate + draft).
7. **[edge-function]** Deterministic voice validator on every draft.
8. **[new service]** Approval surface (admin view or Supabase table view).
9. **[edge-function]** `reply-engine-send` (spacing + caps, posts via `post-reply-tweet`).
10. **[manual/ops]** Set crons.
11. **[manual/ops]** Stage 1 — ~2 weeks fully human-approved; track metrics.
12. **[manual/ops]** Stage 2 — flip `auto_mode=true` for Sub-A only.
13. **[manual/ops]** Delete `x-api-probe` after recording the verdict.

---

**One honest caveat:** X's developer pricing changed multiple times in 2026 (Feb pay-per-use launch, April revision). The model and shape in §1 are well-sourced, but verify exact cents and your project's actual read access **in the Developer Console at build time** — which is precisely why the empirical probe in §2 is step 1 and gates everything else.
