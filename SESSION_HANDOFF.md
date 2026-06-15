# Gary A.I. — Session Handoff (Marketing)

**Last updated:** June 9, 2026
**Read order:** This file → `GARY_VOICE.md` (character/voice playbook + content pillars — June 9, defines WHO Gary is) → `CHANNEL_ROLLOUT.md` (multi-channel plan: Threads → TikTok/Reels/Shorts — June 9) → `CLAUDE_MARKETING.md` (branding/voice) → `MARKETING_LOG.md` (running tweet log + KPI tracking) → `RAMP_PLAN_MAY6_TO_10.md` (5-day ramp reference, historical)

> **NEW (June 9):** On top of the automated pick threads, the daily manual layer is: 1 live **sweat** reaction + 1 **brain/character** standalone post (formats and examples in `GARY_VOICE.md`). Personality posts get logged in `social_post_log` with `pick_text = 'PERSONALITY <date>'`, `thread_format = 'personality'`.

> ⚠️ **NOTE (June 3):** Where `CLAUDE_MARKETING.md` says "3 bullet points" for POTD tweets, that is STALE. Current voice = **paragraph reasoning, NO bullets**, in the 3-tweet thread format described below. This file wins on any conflict.

---

## 🤖 AUTOMATION v2 — SERVER-SIDE (LIVE as of June 12, 2026; metrics-refresh added v6, June 13)

Posting no longer depends on the desktop app. **Supabase pg_cron job `social-auto-post-hourly`** (`45 * * * *` UTC) calls the **`social-auto-post` edge function**, which checks ET time internally (DST-proof): ET hour 10 → daily recap; ET hours 11/14/17/20 → pick slot. LLM = **Gemini** (`GEMINI_API_KEY` secret, already set; model default `gemini-3.5-flash`, override via `GEMINI_MODEL` secret).

- **Metrics auto-refresh (v6, June 13 2026):** EVERY hourly run (regardless of slot) first refreshes `impressions/likes/replies/retweets` for all `social_post_log` rows from the last 6 days, so KPI numbers stay live 24/7 with nobody in the loop. Each row's number = **SUM across all tweets in the thread** (hook + reasoning + CTA) = true thread reach — do NOT change this to hook-only, it would ~3× undercount. Refresh is wrapped in try/catch and can never block posting. Manual trigger: `GET /functions/v1/social-auto-post?metrics_only=1` (anon key). Verified June 13: June MTD ~9.6k impressions, ~875/active-day — above the 666/day pace for the 20k/month KPI.
- **Voice hardening + formatting (v7, June 13 2026):** VOICE_RULES now bans AI tells — NO em/en dashes (`killDashes()` is a hard backstop that survives even if the model slips), no rule-of-three lists, no "it's not just X, it's Y", no stacked inflated adjectives. Odds de-dupe: pick strings already embed odds (e.g. "Dodgers ML -174"), so we no longer append "(-174)" a second time. CTA reworded to drop the em-dash + "completely free". Preview any pick's composed thread anytime (ignores game timing, posts nothing): `GET /functions/v1/social-auto-post?preview=1`.
- **Personality layer / Option A (v9, June 13 2026):** New `personality` mode fires daily at **ET hour 12 (12:45pm)** — a single standalone CHARACTER tweet (no link, no bet breakdown), logged as `thread_format='personality'`, `slot='midday'`. It is GROUNDED so it's earned, not random: yesterday's win rate → **mood ladder** (≥80 Fire / 70-79 Cooking / 50-69 Beer / 40-49 IceCold / <40 Doomsday / no games Coin — Worried was merged into Beer per Adam) sets the emotional register, plus today's slate size + top pick for forward flavor. Decided to add as a MODE in the existing function (not a separate function): modes are isolated by the hour they fire, so a personality bug can't touch picks, and it reuses VOICE_RULES + killDashes + logging. Preview: `?dry_run=1&force_mode=personality`. To pause just this layer without touching picks, change `PERSONALITY_HOUR` off 12.

## 📉 CONVERSION FUNNEL (diagnosed June 13, 2026)

Impressions are above KPI pace but downloads lag. Per-tweet metrics show WHY: the App Store link sits in tweet 3 (the CTA reply), which only gets **~12-18% of the hook's impressions, and ~0 link clicks**. Meanwhile the hook earns more **profile** clicks than link clicks. So the profile is the real conversion surface, not the buried CTA. Fixes shipped:

- **Attribution links (so X→download is measurable):** all App Store links now carry an Apple campaign tag `ct=` + `mt=8`, distinct per surface: `ct=x_bio` (profile website), `ct=x_pinned` (pinned tweet), `ct=x_thread` (in-thread CTA). Check **App Store Connect → App Analytics** for these campaigns. For guaranteed first-party rows, owner can also generate official Campaign Links in ASC or supply a provider token (`pt`) to bake in.
- **Profile updated via API (June 13):** new `update-x-profile` edge function (X API v1.1 `account/update_profile`, OAuth 1.0a, verify_jwt false; v1.1 worked on this tier). Bio + website (`ct=x_bio`) set live. Body `{description?, url?, name?, location?}`, `?dry_run=1` to preview. NOTE: pinning a tweet has NO API endpoint — must be done in the X UI.
- **Pinned tweet posted:** `2065820358230376542` (evergreen what-is-Gary + `ct=x_pinned` link). OWNER STEP: pin it (••• menu → Pin to profile).
- **OPEN / strategic (not yet acted):** threads may give away the whole product (full pick + full analysis) leaving weak download incentive. Revisit tease-vs-payoff once attribution data is in. Bigger lever for raw volume = reply-engagement (Gary replying to big sports-Twitter accounts; currently zero).

- **Selection (timing-aware):** posts the unposted pick whose game starts NEXT; ties (same start) → highest confidence. **Last-chance rule:** if no later run could catch a game before it starts, post it now (fixes games falling between slots, e.g. the June 5 zero-post day). Catch-all: if nothing upcoming remains and cap not hit, may post a game that started <60 min ago with live framing. Cap = 3 pick threads/day + recap (recap/personality rows don't count).\n- **Testing:** `GET /functions/v1/social-auto-post?dry_run=1&force_mode=pick|recap` (anon key auth) — composes without posting/logging.\n- **The old Cowork scheduled tasks (`betwithgary-auto-tweet`, `betwithgary-daily-recap`, `betwithgary-nhl-cupfinal-tonight`) are DISABLED** — do not re-enable, they'd double-post against the edge function. The section below describes v1 for historical reference; voice/format rules in it still apply.

## 🤖 AUTOMATION v1 — COWORK TASK (DISABLED June 12, 2026; was live June 3)

Daily posting is now automated via a **Cowork scheduled task** — `betwithgary-auto-tweet` (file: `~/Claude/Scheduled/betwithgary-auto-tweet/SKILL.md`). It is the single source of posting logic; read it to see exactly what runs.

- **Schedule:** 11:45am, 2:45pm, 5:45pm, 8:45pm ET daily (cron `45 11,14,17,20 * * *`, ±5 min jitter). Each run posts **at most one** thread for a game starting in that slot's window (~20 min ago to ~150 min ahead), choosing the **highest-confidence unposted pick**. Daily cap = **3**. Net effect: 2–3 threads/day spread across time slots, each ~75 min before its game.
- **Selection by TIME, then confidence** — Adam wants coverage across the day (a ~1pm game, a ~4pm game, a ~7pm game, a late west-coast game) so X users in every time zone see fresh content, picking the best-confidence game within each slot.
- **System of record:** the **`social_post_log`** table (Supabase, project `xuttubsfgdcjfgmskcol`). Columns include the three tweet IDs, thread_url, confidence, commence_time, and impressions/likes/replies/retweets (refreshed each run via `get-tweet-metrics`). Use it for idempotency (a `unique(post_date, pick_text)` constraint prevents double-posting) and for live KPI status. Query it instead of eyeballing this file.
- **Constraint:** Cowork scheduled tasks only fire **while the Claude desktop app is open**. If the app is closed at a slot time, that slot is skipped (it does NOT back-fill old slots, only catches the next one on relaunch). For true 24/7 coverage, keep the app open — or migrate posting into a Supabase pg_cron + edge-function job (pg_cron and pg_net are both installed; not yet built).
- **DEPRECATED:** the old `tweet-pick-of-the-day` edge function (single tweet, ▸ bullets, `#NBABets` hashtags, regex reason-extraction) is the OLD voice. Do not trigger it. The scheduled task replaces it.

This document is the single source of truth for the @BetwithGary social media work. If you're picking this up cold, read top to bottom — every section matters.

---

## Who You're Working With

- **User:** Adam (apreda31@gmail.com)
- **Project:** Gary A.I. (@BetwithGary on X, verified blue check) — a free sports betting AI picks app on iOS
- **App Store:** https://apps.apple.com/us/app/gary-ai/id6751238914
- **Sports covered:** MLB, NBA, NFL, NCAAB, NCAAF, NHL (also WBC in season). NO EPL. NO WNBA.

## Adam's Standing Instructions

- **You have full autonomy on @BetwithGary social media.** Strategize, post, engage, adjust toward the KPI. Adam trusts you to run this.
- **KPI:** 20,000 X impressions per month for @BetwithGary. ~666/day average pace.
- **Don't touch the iOS app product code** in `ios/`. Marketing files, Supabase edge functions, and Supabase tooling are fair game.
- **Adam's personal account is @AdamPreda007** — never post from or reference it. All posting from @BetwithGary only.

---

## Technical Setup

### Supabase

**Project ID:** `xuttubsfgdcjfgmskcol`

**Auth header for all edge function calls (anon key):**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dHR1YnNmZ2RjamZnbXNrY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4OTY4MDQsImV4cCI6MjA1OTQ3MjgwNH0.wppXQAUHQXoD0z5wbjy93_0KYMREPufl_BCtb4Ugd40
```

**Endpoints:** `POST https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/<slug>`

**Edge Functions:**

| Slug | Body | Purpose |
|---|---|---|
| `post-single-tweet` | `{ text }` | Post a standalone tweet (no reply) |
| `post-tweet-with-image` | `{ text, image_base64? }` | Tweet with optional image. ⚠️ Does NOT support reply threading. |
| `post-reply-tweet` | `{ text, replyToId }` | **Reply to a tweet — threading via X API v2 `in_reply_to_tweet_id`. Use this for all thread replies.** |
| `post-thread` | `?thread=<id>` URL param | Hardcoded preset threads only (rarely needed) |
| `delete-tweet` | `{ tweetId }` | Delete a tweet |
| `get-tweet-metrics` | `{ tweetIds: [...] }` or `{ tweetId }` | **Pull live impressions, likes, replies, retweets, quotes, bookmarks, profile clicks, link clicks for any tweet IDs. Max 100 IDs per request.** |

All functions use OAuth 1.0a (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET) via env vars to authenticate as @BetwithGary.

### Supabase Tables

- `daily_picks` — `date` (TEXT, format `YYYY-MM-DD`), `picks` (JSONB array of pick objects)
- `game_results` — `league`, `result`, `game_date`

**Pulling today's picks (ranked by confidence):**
```sql
SELECT idx, pick->>'pick' AS pick_text, pick->>'league' AS league,
       pick->>'awayTeam' AS away, pick->>'homeTeam' AS home,
       pick->>'time' AS time, (pick->>'confidence')::float AS confidence
FROM daily_picks, jsonb_array_elements(picks) WITH ORDINALITY AS arr(pick, idx)
WHERE date = '<YYYY-MM-DD>'
ORDER BY (pick->>'confidence')::float DESC NULLS LAST;
```

**Pulling the full rationale for a specific pick:**
```sql
SELECT pick FROM daily_picks, jsonb_array_elements(picks) AS pick
WHERE date = '<YYYY-MM-DD>' AND pick->>'pick' = '<exact pick string>';
```

The full pick object contains: `rationale` (Gary's narrative text — your main source for tweet content), `statsData` (structured stat array), `injuries`, `confidence`, `commence_time` (UTC ISO timestamp for first pitch), `sportsbook_odds`, etc.

### Live Game State (ESPN, no auth required)

For live in-game reactions or recap posts, ESPN's public API works without auth:

- **Today's scoreboard:** `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard`
- **Specific game summary:** `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=<gameId>`

ESPN's game IDs are NOT the same as Gary's internal `game_id`. You'll need to find ESPN's ID via WebSearch (`"<team A> vs <team B> live score ESPN"`) or by scanning the scoreboard endpoint for matching team names.

**Important:** ESPN responses are massive JSON blobs (300K-700K chars). Don't try to read the full payload into context. Save it to `/tmp/espn_game.json` via curl in the bash sandbox, then use Python to extract only the fields you need (status, score, last play, situation, linescores). Pattern example:

```bash
curl -s "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=401815248" -o /tmp/espn_game.json
python3 -c "
import json
data = json.load(open('/tmp/espn_game.json'))
hdr = data.get('header', {}); comp = hdr.get('competitions', [{}])[0]
status = comp.get('status', {}).get('type', {})
print('STATUS:', status.get('detail'))
for c in comp.get('competitors', []):
    print(f\"  {c.get('team',{}).get('displayName')} ({c.get('homeAway')}): {c.get('score')}\")
plays = data.get('plays', [])
print('LAST 3 PLAYS:')
for p in plays[-3:]: print(' -', p.get('text','')[:150])
"
```

### Chrome MCP (fallback only)

Chrome is logged into @BetwithGary. Use only if API path fails. `form_input` does NOT work on X's contenteditable divs — must use `computer` action `left_click` on textbox then `type`. Use `tabs_context_mcp` with `createIfEmpty: true` (boolean, not string) to get tab IDs.

---

## Tweet Posting Workflow

### Standard Pick Format (3-tweet thread)

**Tweet 1 (hook) — via `post-single-tweet`:**
```
[Punchy 1-line hook tied to the news/story]

⚾️ [Pick] ([odds])

Full breakdown ↓
```

**Tweet 2 (reasoning) — via `post-reply-tweet` with `replyToId` = hook tweetId:**
```
[Condensed paragraph using DEEP stats: xERA, barrel rate, WHIP, K/9, wRC+, OPS splits, H2H, bullpen workload, lineup splits, weather. NEVER lead with ERA alone.]

[Closing call: "Lay the runline." / "Take the over." / "Take the dog." etc.]

#MLBPicks #GamblingX
```

**Tweet 3 (CTA) — via `post-reply-tweet` with `replyToId` = reasoning tweetId:**
```
Get Gary's full card daily — every game, every day, completely free.

https://apps.apple.com/us/app/gary-ai/id6751238914
```

### Top Pick of the Day Format

Same 3-tweet thread structure but the hook leads with the tag:

```
🎯 TOP PICK OF THE DAY

[Punchy hook]

⚾️ [Pick] ([odds])

Full breakdown ↓
```

Reasoning and CTA tweets stay identical to the standard format. Use Top Pick of the Day when Adam explicitly asks for it OR when one pick clearly stands above the others in confidence + narrative.

### Sport Emoji

- ⚾️ MLB
- 🏀 NBA
- 🏈 NFL / NCAAF
- 🏒 NHL
- 🏀 NCAAB

### Hashtags

- **MLB:** `#MLBPicks #GamblingX`
- **NBA:** `#NBAPicks #GamblingX`
- **NHL:** `#NHLPicks #GamblingX`
- **NCAAB:** `#CBB #GamblingX`
- Use `#GamblingX` always (replaces `#GamblingTwitter`). 2 hashtags is preferred over 3 — added more dilutes reach.

### Voice Rules — What Adam DOES Want

- **Condensed reasoning** — the tweet is the teaser, the app is the payoff. Don't dump Gary's full rationale; pick the 4-6 best stats and write tight.
- **Deep analytics** — xERA, barrel rate, WHIP, K/9, wRC+, OPS vs LHP/RHP, bullpen workload, H2H, weather/wind. ERA alone is too shallow.
- **Paragraph reasoning** — not bullet points.
- **Specific player names + numbers** — concrete > abstract.
- **News-tied hooks** — late scratches, injury news, line moves, ride-the-momentum angles all hook well.

### Voice Rules — What Adam Does NOT Want

- NO corny lines ("Who's riding? 🏇", "Let's get it", "Lock it in")
- NO emoji spam
- NO ERA as the lead stat
- NO bullet point lists in tweets
- NO links in the main tweet (suppresses reach — link goes in the CTA reply only)
- NO salesy / spammy language
- NO image-only tweets (text gets 10-20x more impressions)

---

## Reply Engagement Workflow

When running a reply engagement session (replying to other accounts' tweets to drive impressions back to @BetwithGary):

1. Space replies 5–10 min apart
2. Like the tweet first, wait a beat, then reply
3. Find tweets with **>200 views** (don't waste time on low-view posts)
4. Search using **Top tab** (not Latest) for higher-view tweets
5. Keep replies SHORT, human, non-salesy
6. **Vary phrasing** — never repeat the same reply
7. **You CAN counter-take** — engaging with what the tweet actually says (even disagreeing) is good
8. Only reply with **Gary's REAL picks** for that session — no general engagement
9. Cap at ~10–15 replies/day total

**Approved reply style examples** (paraphrase the energy, not the words):
- "Riding. Reds ML and Sal Stewart over 1.5 total bases. Meyer's barrel rate is 14.3% and Sal's been hitting .448 his last 10"
- "Respect the fade but I'm on the other side. Reds pen is fully rested and Miami used 4 arms yesterday. Plus Elly owns Meyer career, 1.333 OPS in those ABs"
- "Taking the other side. Royals ML for me, Cantillo's making his 2026 debut into a 6-RHB lineup and the wind's blowing out to left at Progressive"

---

## Live Game Reactions

Capability confirmed (May 7 test). Workflow:

1. Pull live ESPN game state (`/summary?event=<gameId>`)
2. Read score, inning, last 3 plays, situation (bases, count, outs)
3. React in Gary's voice as a fan with money on the line — own missed opportunities, ride momentum, stay analytical but human
4. Post the reaction as a `post-reply-tweet` chained off the LATEST tweet in the original pick's thread (keeps the chain linear)
5. No hashtags on live reactions — they clutter

**Cadence (when doing this):** Don't spam. React to:
- Lead changes
- Big innings (3+ runs)
- Late-inning rallies / collapses
- Key strikeouts (when Gary's pick depends on the pitcher)
- Final score

**Status:** Manual / on-demand only. A "live-tweet poller" auto-cron is a future build.

---

## KPI Tracking

Pull metrics anytime via `get-tweet-metrics`:

```bash
curl -s -X POST 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/get-tweet-metrics' \
  -H 'Authorization: Bearer <anon_key>' \
  -H 'Content-Type: application/json' \
  -d '{"tweetIds": ["id1", "id2", ...]}'
```

Returns per-tweet: `impressions`, `likes`, `replies`, `retweets`, `quotes`, `bookmarks`, `url_link_clicks`, `user_profile_clicks`, plus `totals` across the batch.

**Logging discipline:** Every tweet posted should land in `MARKETING_LOG.md` with its tweet ID, type (Hook / Reasoning / CTA / Live / Reply), summary, posting time, and a placeholder for impressions. Pull metrics at end of day (or on demand) and update the log.

**KPI math:**
- Target: 20,000 impressions / month
- Daily pace: ~666
- Weekly pace: ~4,650

---

## What's Live Right Now (May 31, 2026)

### Today's Top Pick of the Day Thread — Yankees -1.5 (-115) vs Athletics, 4:05 PM ET at Sutter Health Park
- **Hook:** 2061218654004392056 — "🎯 TOP PICK OF THE DAY... lineup mismatch lead"
- **Reasoning:** 2061218695221841973 — Goldschmidt 1.180 OPS vs LHP, Schuemann 1.056, Rice .999, Lopez 1.77 WHIP, A's pen burned 8 arms yesterday after Severino injury, Warren 3.16 xERA / 10.0 K/9 / 1.59 career ERA vs OAK
- **CTA:** 2061218725349495036
- **URL:** https://x.com/BetwithGary/status/2061218654004392056

### Other Picks Today (NOT posted — available if needed)
There are 14 picks today total. The other two top-confidence (0.85) picks not posted:
- **Rays -1.5 (+104)** vs Angels, 1:40 PM ET
- **Braves ML (-126)** at Reds, 1:40 PM ET

See full slate via the SQL query above.

---

## Open Items / Not Yet Built

These are noted for future sessions. None are urgent for today.

1. **Daily-tweet automation (cron + LLM).** Adam wants the system to auto-post the daily top-confidence pick and the morning recap without him in the loop. Architecture sketched: pg_cron poller running every 15 min from 9am-11pm ET, checks `daily_picks` for today's row, checks a `posting_log` table for idempotency, posts when picks are ≥5 min old AND first pitch is at least 60 min away. Hasn't been built. Adam still needs to answer 5 design questions: (a) pick selection rule, (b) post time, (c) recap timing, (d) LLM choice (Anthropic vs Gemini already-paid), (e) kill switch flag location. See earlier strategy thread in this conversation history.

2. **Live-tweet poller.** Capability exists but no cron. Future build.

3. **Promoted-tweet experimentation.** We discussed paid tweet boosts ($20-30 per post via X's promote button) as a higher-ROI alternative to Premium+ upgrade. Adam is currently on Premium (not Premium+). Recommendation was to wait for 2 weeks of organic data, then try one promoted tweet on a high-conviction pick.

4. **Recap automation.** Morning recap tweets from `game_results` are easy to automate (deterministic). Not yet built.

---

## Lessons Learned (read before posting anything)

1. **Threading works via API** — use `post-reply-tweet` with `replyToId`. The older `post-tweet-with-image` ignored the reply param (now bypassed).
2. **Trust Gary's data on sports facts.** Gary is wired into live, real-time sports data sources that are better than Claude's training data (May 2025 cutoff). Default to trusting Gary's rationale on player-team assignments, recent stats, current rotations, injury status. Only override when something is certainly wrong (e.g., a stat mathematically impossible). **Specific incident (May 7):** Claude incorrectly removed Brandon Nimmo from a Rangers tweet thinking he was still a Met — Nimmo was traded to Texas and was batting leadoff. Adam corrected this and the tweet had to be defended.
3. **Do double-check stat-to-PLAYER attribution.** Don't confuse a pitcher's WHIP with a hitter's. Don't attribute one player's stat line to another.
4. **Condensed tweet > full Gary rationale.** The tweet is the teaser, the app is the payoff. Don't dump 2,000+ chars of rationale — pick the punchiest 4-6 stats.
5. **Threaded format > single long tweet.** Each tweet in the thread counts impressions separately. The hook lands first in feed. The reasoning earns "Show this thread" expansions.
6. **Image tweets get 10–20x fewer impressions.** Default to text-only.
7. **Search Top tab** (not Latest) for higher-view reply targets.
8. **Adam hates corny AI language.** No "Who's riding?", no emoji spam, no "Let's get it". Stay human.
9. **Paragraph reasoning, not bullets.** Tweets read more naturally as prose.
10. **Don't put links in the main tweet** — they suppress reach. Link goes only in the CTA reply.

---

## Quick Reference Commands

**Pull today's picks:**
```sql
-- via mcp__461456cf-1d55-4975-ae27-c8651df9e8da__execute_sql
SELECT idx, pick->>'pick' AS pick_text, pick->>'league' AS league,
       (pick->>'confidence')::float AS confidence
FROM daily_picks, jsonb_array_elements(picks) WITH ORDINALITY AS arr(pick, idx)
WHERE date = '<YYYY-MM-DD>'
ORDER BY (pick->>'confidence')::float DESC NULLS LAST;
```

**Post a hook tweet:**
```bash
curl -s -X POST 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/post-single-tweet' \
  -H 'Authorization: Bearer <anon_key>' \
  -H 'Content-Type: application/json' \
  -d '{"text": "..."}'
```

**Post a threaded reply:**
```bash
curl -s -X POST 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/post-reply-tweet' \
  -H 'Authorization: Bearer <anon_key>' \
  -H 'Content-Type: application/json' \
  -d '{"text": "...", "replyToId": "<previous_tweet_id>"}'
```

**Pull metrics:**
```bash
curl -s -X POST 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/get-tweet-metrics' \
  -H 'Authorization: Bearer <anon_key>' \
  -H 'Content-Type: application/json' \
  -d '{"tweetIds": ["id1","id2","id3"]}'
```

**Delete a tweet (if needed):**
```bash
curl -s -X POST 'https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/delete-tweet' \
  -H 'Authorization: Bearer <anon_key>' \
  -H 'Content-Type: application/json' \
  -d '{"tweetId": "..."}'
```

---

## File Map

- `SESSION_HANDOFF.md` — this file. Single source of truth.
- `CLAUDE_MARKETING.md` — branding, logo files, color palette, hashtag research notes, accounts. Static reference.
- `MARKETING_LOG.md` — running log of every tweet posted, with metrics. Update daily.
- `RAMP_PLAN_MAY6_TO_10.md` — historical, the original 5-day ramp plan. Reference only.
- `ios/` — **DO NOT TOUCH.** iOS app product code.

---

**End of handoff. When in doubt, check the rationale in `daily_picks` and trust Gary.**
