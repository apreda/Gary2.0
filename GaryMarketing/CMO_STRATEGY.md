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
audience**: timely, genuinely useful replies under big accounts during games, from a real point of view. This is
Engine 1/3 in the existing plan, currently parked — the mention-reply bot has been off since Jul 7.

The line between this and spam is quality and restraint: a reply is worth posting only if it says something
specific and falsifiable about that game. No "great post!", no link drops, no volume targets. Better to send five
real replies a night than fifty generic ones.

### Unlock 3 — Proof as the primary asset
The record is the marketing. Priorities: the pinned tape stays current; the morning recap now leads with an
honest human line instead of a date stamp (shipped Aug 5); losing days get posted with the same energy as winners.

### Channels, ranked by fit
1. **X** — home base. Fixed and instrumented; distribution work next.
2. **Gambling communities (Reddit and Discord)** — highest audience fit. Entry is the founder's own credibility as
   a bettor, not a pitch. Rules-first: most betting subs ban self-promo outright, so this is participation with
   disclosure, not campaigns.
3. **AI/builder communities** — genuinely strong fit because the *build* is the story: an AI that is given no
   rules and no steering. Show HN / Indie Hackers / builder Discords. This audience cares about the architecture,
   not the picks, and it is the one place the "zero steering" story lands hardest.
4. **Instagram** — real upside, but gated on a visual system. Image posts were tried and pulled because quality
   was not there. IG without strong visuals is worse than absent. Needs a design pass before any posting.

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

1. **Run the SQL** in §7 — three columns plus the cron reschedule. Unblocks all measurement.
2. **Instagram**: confirm whether to invest in a visual system, or stay off IG until after Kickoff.
3. **Community posting**: confirm I may post as/for the founder in gambling and builder communities, with
   disclosure. I will not post outward on your behalf without an explicit yes.

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
- **Aug 5 2026** — Posting engine rebuilt (commit `9930e4c`): hard first-pitch deadline, game-paced drip,
  day-part reservations, per-pick failure isolation, miss alerting, marquee tiebreak, recap voice restored,
  intent metrics persisted. Strategy established; targets set.
