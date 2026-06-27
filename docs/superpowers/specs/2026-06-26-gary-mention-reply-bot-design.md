# Gary Mention-Reply Bot — Design Spec

**Date:** 2026-06-26
**Status:** Approved design — pre-implementation
**Owner:** Adam (founder) + Claude

---

## 1. Goal

"Grok for Gary." When someone **@-mentions @BetwithGary** on X, Gary replies in-thread with a real, useful answer in his sharp-handicapper voice that **always pivots to a betting pick**. The point is engagement → app downloads, with every reply doubling as a soft ad for a play.

The north-star example (founder, hand-written, the voice template):

> **@JunaidAckroyd:** "The best engineers don't prompt anymore"
> **@BetwithGary:** "Yeah yeah they loop. /goal win money by taking Royals ML"

Gary engaged the off-topic tweet with a quick beat, then pivoted to a pick. That "always land on a pick" rule is the whole design.

---

## 2. Scope

**IN:**
- Reply **only when @BetwithGary is @-mentioned** (reactive / invited).
- Answer anything:
  - **Pick questions** ("who you got for France?", "what's the rationale?", "props?") → pull the **real pick + rationale/props from Supabase**.
  - **Factual / general** ("what WC games matter today?" — Portnoy's tweet) → Gemini answers with real info.
  - **Off-topic** (Junaid's engineering tweet) → Gemini riffs.
  - …and **every** reply pivots to a real pick.

**OUT (explicit non-goals):**
- **No proactive / unsolicited replies** to tweets that didn't tag Gary. X's automation rules treat that as spam → account suspension. The founder can manually summon Gary by tagging from a personal account.
- No DMs, no automated likes/follows.
- See Future Phases (§8) for what's deliberately deferred.

---

## 3. Architecture

### Mention detection: **polling** (chosen over webhook)
- New Supabase edge function **`gary-mention-reply`**, triggered by **pg_cron every ~90 seconds**.
- Polls `GET /2/users/:GARY_ID/mentions` with **`since_id`** so it only pulls *new* mentions. Idle polls return ~0 posts ≈ $0.
- **Rejected:** Account Activity webhook — instant, but heavier to stand up and uncertain availability on pay-per-use. Revisit as a Phase-2 upgrade if instant ever matters. A 60–90s reply delay is invisible for a pick bot.

### Pipeline (per new mention)
1. **LISTEN** — pull new mentions since the stored `since_id`.
2. **UNDERSTAND** — fetch the mention text + the tweet it's replying to (context) + **today's real picks** from Supabase (`daily_picks` / `game_results`).
3. **ANSWER** — one **Gemini** call. Input: the mention, the context tweet, today's real picks+rationales **as ground truth**, and Gary's voice rules + guardrails. Gemini uses the relevant real pick when the question maps to a game Gary picked; otherwise it answers/riffs and pivots to the day's **featured pick** (the highest-confidence play on the slate). **Real picks injected = no hallucinated picks.** If asked about a game Gary *didn't* pick, he says so honestly and pivots to a real play he does have — he **never fabricates a pick for an un-picked game** (locked principle — see `feedback-prevent-fabrication-not-detect`).
4. **REPLY** — post as a reply to the mention via the existing X post path (`api.x.com/2/tweets` with `reply.in_reply_to_tweet_id`). **Replies dodge the $0.20 link surcharge**, so pointing at the app stays cheap.
5. **REMEMBER** — log the mention id (idempotency — never double-reply) + advance `since_id`.

### Reused vs new
- **Reused:** Supabase (picks/rationale/props), Gemini (Gary's brain), the existing X posting auth (user-context OAuth already used by `post-tweet-media`).
- **New:** the `gary-mention-reply` function; a **`bot_mention_log`** table (`mention_id`, `replied_at`, `reply_tweet_id`, `status`) + `since_id` state; a pg_cron entry.

---

## 4. Voice

- **Factual + useful, but fully IN CHARACTER.** Gary is a sharp handicapper; he **never reveals he's an AI / model / bot** and never breaks the 4th wall (locked brand rule — see `feedback-gary-character-not-ai`).
- Reconciles "factual like Grok" with "Gary's a character": he gives the real info, but **as a knowledgeable bettor**, and **always pivots to a pick**. He is not an answer machine — he's a handicapper who'll riff on anything and then tell you what he's on.
- **Template:** brief engage on their tweet → pivot to the real pick (Junaid example).
- **Reuse** the existing `VOICE_RULES` from `social-auto-post` (first-person, no emojis, no marketing voice, character-not-AI).

---

## 5. Guardrails (non-negotiable for a public bot)

- **No loops:** never reply to self or known bots; **one reply per mention**; cap thread depth (don't keep going if Gary already has N replies in the thread).
- **Sensitive-topic deflect:** politics, tragedy, harassment, personal attacks, anything off-brand → Gary gives a light non-answer and pivots to a pick, never takes the bait. (Gemini instructed to deflect + a cheap pre-filter on obvious red-flag terms.)
- **Rate limits:** per-user cap (e.g. max 2 replies/user/hour) + a **global hourly cap** (cost + spam safety). Skip empty/pure-spam mentions.
- **Responsible gambling:** no "guaranteed / lock / can't lose" language.
- The hard caps protect both the **brand** and the **bill**.

---

## 6. Cost

- **Pay-per-use** (the account moves off Free): ~**$0.005** to read a mention + ~**$0.015** to reply ≈ **~$0.02 per handled mention**; Gemini ≈ a fraction of a cent. **Idle ≈ $0.** The global hourly cap bounds the worst case.
- **Side effect:** the existing daily card posts also become billed (~$0.015 each) instead of free-tier-free — pennies/day, negligible.

---

## 7. Dependencies / Founder TODO (blockers for go-live)

1. **Enable pay-per-use billing** on the X developer account. It's currently **Free** (100 reads/mo — too few to poll mentions). *This is the gating step.*
2. Confirm the X app's access can **read the mentions timeline** (the public mentions endpoint should work with the app-only Bearer token; posting replies already works via the existing user-context OAuth).
3. Confirm **@BetwithGary's numeric user id** (needed for the mentions endpoint).

---

## 8. Future phases (deferred — not in this build)

- **Phase 2 — instant:** Account Activity webhook for near-real-time replies, if the ~90s delay ever feels slow.
- **Phase 3 — narrow proactive:** a tiny, hand-picked allowlist of big accounts, heavily rate-limited (a few replies/day), **only** after observing how X treats the reactive bot. Still carries ban risk; explicit opt-in required.

---

## 9. Success criteria

- Someone @s @BetwithGary "who you got for [game]?" → within ~2 min, a reply with the **real stored pick** + a sharp one-liner, **no hallucination**.
- Off-topic / factual mentions get a witty on-brand reply that **pivots to a pick**.
- **Zero account-safety incidents** (no spam flags, no sensitive-topic blowups).
- Cost tracks usage and stays bounded by the caps.

Related: `project_social_automation` (the @BetwithGary poster — shares the X auth + VOICE_RULES), `feedback-gary-character-not-ai`, `project_results_card_system`.
