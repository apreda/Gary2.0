# Gary AI — Marketing Strategy

> Owner: Claude (CMO), delegated by Adam Aug 5 2026: *"You are now officially the Chief Marketing Officer of Gary.ai... I'm not gonna give you any specific numbers to hit, I'll let you create those on your own."*
> Supersedes the growth framing in `X_CONVERSION_STRATEGY.md` (Jun 16), whose central premise no longer holds — see §2.
> Hard deadline: **NFL Kickoff, Sep 9 2026.** Five weeks.

---

## 1. Positioning — what we actually are

Gary is not a model and not an algorithm. He is an AI that bets **like a bettor**: no formula, no rule set, no
steering. We never tell Gary what a factor means, what to conclude, or how confident to be. He investigates and
decides. That is genuinely rare and it is the whole story.

Built by one person who has been gambling a long time, to answer a real question: can you build an AI that bets
the way a sharp friend bets, instead of one that optimizes a spreadsheet?

**What we give away, permanently:**
- A pick on **every game, every day**, free. (Winners = the select plays, the paid tier.)
- **Every result, win and loss, in public.** Nothing hidden on a bad day. A 5-10 night gets posted the same as
  a 10-5 night.

**Why that wins in this category:** betting X is wall-to-wall "verified cappers" with screenshotted parlays,
deleted losers, hidden records, and DM-for-my-locks. We are the opposite of that, on purpose. In a market where
everyone is selling certainty, the differentiated product is someone showing their whole tape. That is not a
marketing angle bolted on afterward — it is what the product already does. Marketing's only job is to make it
legible to people who have never heard of us.

---

## 2. Diagnosis — why growth has been zero

The Jun 16 strategy concluded this was *"a conversion failure, not a reach failure"* on the evidence that
threads earn replies. Measured across all 394 posts, that premise has broken:

| Format | Posts | Avg impressions | Avg likes | Avg retweets |
|---|---|---|---|---|
| standard pick | 115 | 548 | 0.4 | **0.0** |
| verdict | 90 | 654 | 0.6 | **0.0** |
| recap | 52 | 212 | 0.1 | **0.0** |
| top_pick | 36 | 385 | 0.5 | **0.0** |

**Zero retweets across 394 posts, in every format, without exception.** Reshares are the only mechanism for
out-of-network reach on X. With none, every post lands on roughly the same few hundred people no matter how good
it is — which is exactly why impressions sit near 550 regardless of content. Replies (0.9/post) exceeding likes
(0.4/post) with zero shares is the signature of reply-guy traffic, not audience.

**This is a distribution problem, not a copy problem.** Nothing published into an account with no out-of-network
path compounds. That reframes the whole plan: the fix is not better tweets, it is getting Gary in front of people
who have never seen him.

---

## 3. Guardrails — the things we will not do

Non-negotiable, from the founder and binding on every channel:

- No fake urgency, no "lock of the day", no manufactured scarcity.
- **Never delete or hide a losing pick.** The tape stays up, permanently.
- No engagement pods, follow/unfollow, giveaway-for-follow, or reply spam.
- No unsolicited DMs. No astroturfing — we never pretend to be an unaffiliated fan.
- No gimmicks to force a download. Free stays genuinely free.
- Community posting only where self-promotion is allowed, disclosed as the builder, following each community's
  rules. If a sub bans promo, we participate as a bettor or we don't post.

**One voice rule worth stating explicitly:** Gary the character never breaks the fourth wall — he never says he
is an AI. But the *company* is fully transparent that Gary is an AI. Those are two different speakers. Founder
voice ("I built an AI that makes its own reads") is honest and is the best story we have. Gary voice stays in
character. Never blur them.

---

## 4. The plan

### Unlock 1 — Measurement (in progress)
Cannot run marketing blind. `get-tweet-metrics` has always returned bookmarks, profile clicks and link clicks;
`social_post_log` had nowhere to store them, so we kept impressions/likes (the metrics the strategy calls noise)
and dropped the three that indicate intent. Code now persists all of them; the DDL is the one blocking step.

### Unlock 2 — Distribution (the actual growth lever)
Zero retweets means the only free out-of-network path is **being present in conversations that already have an
audience**: replies under big accounts during games.

**REPLY FORMAT — the pick, and nothing else** (founder, Aug 5 2026):

> *"I would want that to only be the pick, because I can't trust A.I. to say any sentences or such without
> sounding cringe and totally like A.I. ... I'm okay if the replies are just like 'Yankees ML' — aka just the
> pick, no odds, just the pick."*

Enforced in `barepick.ts`, not left to discipline: **there is no model in the reply path at all.** A reply is a
deterministic string derived from a pick Gary already made, and `isPublishableReply` rejects anything that is not
exactly that — no prose, links, hashtags, mentions, emoji or sentence punctuation, and never a pick we did not
make. A reply that cannot contain a generated sentence cannot contain a cringe one.

Why this is stronger than prose, not weaker: a bare call is a timestamped public receipt. It cannot be accused of
hype, it cannot be argued with on style, and when the verdict loop later quote-tweets that same pick with the
result, the record builds inside other people's conversations. It is slow and it compounds.

The rules that keep it from reading as bot spam: low volume, precise placement (only the game actually being
discussed), and **the same first-pitch deadline as the main timeline** — a bare pick replied after the game
started is the same retroactive call, in someone else's thread.

**Blocker to verify before this is a plan:** as of Jun 18 the account carried an X-level outbound reply
restriction (Gary could only reply where he had been mentioned), and `reply_queue` has never held a single row.
The approval machinery exists and is correct — `reply-engine-scan` drafts to `pending`, `reply-engine-send` posts
only what a human `approved`, with daily/per-account caps and spacing — but it has never run. Whether the
restriction has lifted in the seven weeks since is unknown and needs one real test.

### Unlock 3 — Proof as the primary asset
The record is the marketing. Priorities: the pinned tape stays current; the morning recap now leads with an
honest human line instead of a date stamp (shipped Aug 5); losing days get posted with the same energy as winners.

### Channel rule (founder, Aug 5 2026)

> *"Maybe we don't do Instagram or community posting yet either. Maybe only [surfaces] where it can be Gary,
> and that is allowed also."*

**Two tests, both required, before any channel is used:**
1. **Gary can speak as Gary.** The account is @BetwithGary, publicly and obviously. No founder-voice
   participation standing in for the brand, no unattributed accounts, nothing that reads as a person who
   happens to like the product.
2. **The platform permits it.** Branded/promotional participation is allowed by that surface's actual rules,
   not merely un-policed. If a community bans promo, we are not there — we do not "participate carefully"
   around a rule.

This is a stricter filter than audience fit, and it is the right one: every channel it rejects was a channel
where we would have been a guest hoping not to get thrown out. What survives, we own outright.

### Channels that pass

1. **X — the whole program for now.** Gary's own timeline plus **replies as Gary** under big sports accounts
   during games. This is the growth lever and it passes both tests cleanly: Gary's account, Gary's voice, a
   reply is what the surface is for. Quality-gated hard — a reply ships only if it says something specific and
   falsifiable about that game. Five real reads a night beats fifty generic ones. No link drops.
2. **Bluesky / Threads — free mirrors, near-zero cost.** Gary posts as Gary; brand accounts are unambiguously
   welcome on both; sports conversation is active. Same content pipeline, no new writing. Worth doing purely
   because the marginal cost is a deploy.

### Channels held (not rejected — parked with a reason)

- **Instagram** — parked. Gated on a visual system; image posts were tried and pulled because the quality was
  not there, and IG without strong visuals is worse than absent. Revisit after Kickoff.
- **Reddit / Discord gambling communities** — parked. Fails test 1 as originally scoped (it needed the founder's
  personal voice) and mostly fails test 2 (most betting subs ban self-promo outright).
- **AI/builder communities (Show HN, Indie Hackers)** — parked. The "zero steering" build story is genuinely the
  strongest thing we have for that audience, but it is *company* voice, not Gary voice, so it fails test 1 as
  written. Worth revisiting deliberately later as a founder-voice exception rather than smuggling it in now.

---

## 5. Targets

Set by me, deliberately leading-indicator-first. The install baseline is unmeasured until the DDL lands, so
committing to an install number today would be invented precision.

**By Aug 12 (week 1)**
- 100% of posts carrying bookmarks/profile-clicks/link-clicks. *(Blocked on DDL.)*
- Zero picks tweeted after first pitch. *(Shipped — now a hard rule with tests.)*
- Zero silently dropped picks; every miss visible as `MISSED_PICKS`. *(Shipped.)*
- Baseline published: profile clicks and bookmarks per format, so every later claim is measured.

**By Aug 26 (week 3)**
- First non-zero retweet week. This is the single most diagnostic number on the account.
- Median post impressions 550 → 1,200.
- Reply presence live and running inside the guardrails above.

**By Sep 9 (NFL Kickoff)**
- Median post impressions ≥ 2,000.
- Profile clicks per pick post ≥ 5 (currently unmeasured, assumed near zero).
- First measured week of attributed installs from social, whatever the number — the point is that it is *known*.
- NFL posting live from Kickoff, with the day-part logic already proven on MLB.

**Explicitly not goals:** follower count, impressions for their own sake, argument-reply volume.

---

## 6. Needs the founder

1. **Run the SQL** in §7 — three columns plus the cron reschedule. Unblocks all measurement. *(Only open item.)*

Resolved Aug 5: Instagram and community posting are parked (see the channel rule in §4). Nothing is posted
outward in the founder's own name, anywhere, without an explicit yes on that specific thing.

## 7. The SQL

```sql
alter table social_post_log add column if not exists bookmarks integer;
alter table social_post_log add column if not exists profile_clicks integer;
alter table social_post_log add column if not exists link_clicks integer;

do $$
declare target_jobid bigint;
begin
  select jobid into target_jobid from cron.job where command like '%social-auto-post%' limit 1;
  if target_jobid is null then raise warning 'social-auto-post cron job not found';
  else perform cron.alter_job(target_jobid, schedule => '*/15 * * * *');
  end if;
end $$;
```

---

## Changelog
- **Sep 1 2026 — Full review + rulings (co-founder).** Review artifact: claude.ai/code/artifact/44ec1d0f-50be-4043-9244-c2ecfbf6b893.
  Measured: volume x2, total impressions x4, per-post reach flat (~600), RT 0 -> 0.05/post, 125 followers, /get 23/mo, site
  8-26 visitors/wk, waitlist table never existed, 1 paid sub ever, Winners free in the shipping build. The Aug 5 distribution
  diagnosis stands; the plan is rewritten around what I can run alone (LAUNCH_SEP13.md). Rulings: founding cohort (free
  through Sep, in before Oct 1 keeps Winners free for the season, paywall for new installs Oct 1); one Monday week tape
  (shipped, deterministic); verdict shape gate (shipped); per-game pages on the site (built); Sep 13 = marketing launch;
  founder thread on his own account (the one founder-voice exception); video off the plan unless he is on camera; affiliate
  not now. **Founder overruled the volume cut: every MLB game keeps posting until NFL kicks off.** Targets restated in
  LAUNCH_SEP13.md; the "median 2,000 impressions" target is dropped — per-post reach is a function of the network.
  **Outage:** account silent since Aug 30 6 PM ET — X API 402 credits depleted; founder tops up.
- **Aug 5 2026** — Posting engine rebuilt (commit `9930e4c`): hard first-pitch deadline, game-paced drip,
  day-part reservations, per-pick failure isolation, miss alerting, marquee tiebreak, recap voice restored,
  intent metrics persisted. Strategy established; targets set.
