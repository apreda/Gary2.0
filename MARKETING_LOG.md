# @BetwithGary Marketing Log

Running log of every post + engagement action. Pull impressions periodically via X API (public_metrics) to track against the **20,000 impressions/month KPI**.

KPI math: ~666/day, ~4,650/week. 5-day ramp (May 6 → May 10) target = ~3,300 impressions to be on pace.

---

## May 6, 2026 (Wed)

### Posts
| # | Time | Type | Tweet ID | Summary | Impressions (as of May 7 ~12:25pm ET) | Replies |
|---|------|------|----------|---------|------------|---|
| 1 | 2:11pm ET | Pick Thread (hook) | 2052088977025352158 | Dodgers -1.5 (-128) hook — "held together with tape" | 59 | 2 |
| 2 | 2:18pm ET | Pick Thread (body) | 2052090599310774468 | Reasoning — Glasnow vs McCullers, Astros injuries | 119 | 1 |
| 3 | 2:18pm ET | Pick Thread (CTA) | 2052090635721572799 | App Store link CTA reply | 16 | 0 |
| | | **Thread total** | | | **194** | **3** |

Thread URL: https://x.com/BetwithGary/status/2052088977025352158

### Engagement Replies
*(none yet today)*

### Notes
- Deployed new `post-reply-tweet` edge function — threading via API now works (the old `post-tweet-with-image` ignored the reply param, which was the April-9 bug)
- This is the format we're testing: hook → reasoning → CTA as a 3-part thread vs the old single long tweet

### Result
- ✅ Dodgers -1.5 cashed (Adam confirmed "great pick yesterday")

---

## May 7, 2026 (Thu)

### Posts
| # | Time | Type | Tweet ID | Summary | Impressions (as of May 7 ~12:25pm ET) | Replies |
|---|------|------|----------|---------|------------|---|
| 1 | 12:09pm ET | Pick Thread (hook) | 2052420440857907505 | Rangers ML (+136) hook — "Late scratch in the Bronx" | 23 | 1 |
| 2 | 12:09pm ET | Pick Thread (body) | 2052420469966463112 | Reasoning — Weathers scratched, Blackburn (reliever) starting, Rice out, wind to RF, Gore K/9, Latz/Junis pen | 29 | 1 |
| 3 | 12:09pm ET | Pick Thread (CTA) | 2052420493722943590 | App Store link CTA reply | 10 | 0 |
| | | **Thread total** | | | **62** | **2** |

*(Thread is ~15 min old at time of measurement — will keep accumulating through first pitch and into the evening)*

### Second Thread — Nationals ML -120 vs Twins, 1:05 PM ET first pitch
| # | Time | Type | Tweet ID | Summary | Impressions | Replies |
|---|------|------|----------|---------|------------|---|
| 1 | 12:45pm ET | Pick Thread (hook) | 2052429516144799986 | Nats ML (-120) hook — "Nats hung 15 on Minnesota yesterday" | TBD | TBD |
| 2 | 12:45pm ET | Pick Thread (body) | 2052429550651322820 | Reasoning — Woods Richardson 4.4 K/9, Abrams/Wood splits, Irvin 10.1 K/9, Twins pen 29th | TBD | TBD |
| 3 | 12:45pm ET | Pick Thread (CTA) | 2052429577071317099 | App Store link CTA reply | TBD | TBD |

Thread URL: https://x.com/BetwithGary/status/2052429516144799986

Thread URL: https://x.com/BetwithGary/status/2052420440857907505

Pick: Rangers ML +136 vs Yankees @ Yankee Stadium, 12:35 PM ET first pitch (1:35 PM update — actually 4:35 PM UTC = 12:35 PM ET). Confidence 0.68.

Other today's pick (NOT posted): Nationals ML -120 vs Twins, 1:05 PM ET.

### Engagement Replies
*(none yet today)*

### Notes
- Sanity check caught a rationale error: it listed "Brandon Nimmo" as a Rangers lefty (Nimmo is a Met). Omitted from tweet — only used Seager + generic "Rangers' lefty bats". This is the kind of pre-flight check that auto-posting will need to handle.

---

## Edge Functions Available (May 2026)

| Function | Purpose | Body |
|---------|---------|------|
| `post-single-tweet` | Single standalone tweet | `{ text }` |
| `post-tweet-with-image` | Single tweet w/ optional image | `{ text, image_base64? }` |
| `post-reply-tweet` | **Reply tweet (threading)** | `{ text, replyToId }` |
| `post-thread` | Hardcoded thread by `?thread=<id>` | (URL params only) |
| `delete-tweet` | Delete a tweet | `{ tweetId }` |

All use anon key in `Authorization: Bearer ...` header.

---

## Impression Tracking — DONE ✅ (May 7)

Deployed `get-tweet-metrics` edge function. Pulls live data from X API v2 (`tweet.fields=public_metrics,non_public_metrics,organic_metrics`).

**Endpoint:** `POST https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/get-tweet-metrics`
**Body:** `{ "tweetIds": ["id1", "id2", ...] }` (max 100 per request)
**Returns:** Per-tweet impressions, likes, replies, retweets, quotes, bookmarks, profile clicks, link clicks. Also returns `totals` across the batch.

Use this to grade any tweet, any thread, any week. From Monday onward this becomes part of the daily routine — pull metrics each morning, log to this file, see what's trending.

## KPI Status (as of May 7)

**Target:** 20,000 impressions / month
**24-hour total on May 7:** 256 impressions across 6 tweets (May 6 + May 7)
**Pace:** ~38% of target during ramp test — under, but the engagement layer (reply runs, recaps) was intentionally not running yet pre-Monday.

---

## May 31, 2026 (Sun)

### Top Pick of the Day Thread — Yankees -1.5 (-115) at Athletics, 4:05 PM ET, Sutter Health Park
| # | Time | Type | Tweet ID | Summary | Impressions | Replies |
|---|------|------|----------|---------|------------|---|
| 1 | ~early afternoon ET | Top Pick Thread (hook) | 2061218654004392056 | 🎯 TOP PICK OF THE DAY — Yankees -1.5 (-115), lineup mismatch hook ("Three Yankees hitters with 1.000+ OPS against lefties...") | TBD | TBD |
| 2 |  | Top Pick Thread (body) | 2061218695221841973 | Reasoning — Goldschmidt 1.180 OPS vs LHP, Schuemann 1.056, Rice .999, Lopez 1.77 WHIP, A's pen burned 8 arms yesterday (Severino injury), Warren 3.16 xERA / 10.0 K/9 / 1.59 career ERA vs OAK | TBD | TBD |
| 3 |  | Top Pick Thread (CTA) | 2061218725349495036 | App Store link CTA reply | TBD | TBD |

Thread URL: https://x.com/BetwithGary/status/2061218654004392056

**Pick selected from:** 3 picks tied at 0.85 confidence (Rays -1.5, Braves ML, Yankees -1.5). Adam picked Yankees specifically for Top Pick of the Day. Used Option C hook angle (lineup mismatch lead) of three drafted options.

### Other Picks Today (NOT posted)
- Rays -1.5 (+104) vs Angels, 1:40 PM ET — confidence 0.85
- Braves ML (-126) at Reds, 1:40 PM ET — confidence 0.85
- White Sox ML (-130), Mariners ML (-144), Rockies ML (-104), Mets ML (-164) — all 0.78 confidence
- Plus 8 more lower-confidence picks across the slate

### Engagement Replies
*(none yet)*

### Notes
- First use of the "🎯 TOP PICK OF THE DAY" hook tag, codified as a format variant in `SESSION_HANDOFF.md`
- All other infrastructure (post-single-tweet, post-reply-tweet, get-tweet-metrics) working cleanly

### Next Steps (handoff to next agent)
- Pull metrics on the Yankees thread later today / tomorrow via `get-tweet-metrics`
- Log impressions, calculate end-of-day total
- Decide whether to post a recap tweet tomorrow morning (Sun → Mon = first recap of the week)
- Continue ramping toward the 20k/mo KPI

---

## June 3, 2026 (Wed) — AUTOMATION WENT LIVE

From today, posting is automated. See the new **Automation** section in `SESSION_HANDOFF.md`. The system of record for posts + impressions is now the **`social_post_log`** Supabase table (not this file) — query it for live KPI status. This file is kept as a human-readable narrative log.

### Thread — Marlins ML (-110) at Nationals, 1:05 PM ET, Nationals Park (confidence 0.72)
| # | Time | Type | Tweet ID | Summary | Impressions | Replies |
|---|------|------|----------|---------|------------|---|
| 1 | 12:51pm ET | Hook | 2062215450788802681 | "Washington's rotation is in shambles" — converted reliever (Alvarez) first start vs red-hot Marlins | TBD | TBD |
| 2 | 12:51pm ET | Reasoning | 2062215610168201715 | Meyer 1.24 day-game ERA; Alvarez .335 xwOBA; Otto Lopez .483/1.142 OPS vs LHP, Edwards .956; WSH pen 4.77 ERA; Wood .114 L10; Fish 4-of-5 H2H, +14-6 in series | TBD | TBD |
| 3 | 12:51pm ET | CTA | 2062215678296203307 | App Store link CTA reply | TBD | TBD |

Thread URL: https://x.com/BetwithGary/status/2062215450788802681

**Notes:** Thin 1-pick slate today; posted ~13 min before first pitch (manual, to go live same-day). Logged in `social_post_log` (id 326c772d). All stats sourced strictly from Gary's Supabase rationale — no outside knowledge injected (trust-Supabase rule).

## June 9, 2026 (Tue) — Personality layer debut

New Social/Growth direction kicked off. `GARY_VOICE.md` (character playbook) and `CHANNEL_ROLLOUT.md` (Threads → TikTok/Reels/Shorts plan) created.

| # | Time | Type | Tweet ID | Summary |
|---|------|------|----------|---------|
| 1 | 10:21pm ET | Live Sweat (reply on Nats thread) | 2064533314719903787 | García Jr. HR + Alvarez 3K + Houser 46 pitches — "Exactly the script." |
| 2 | 10:21pm ET | Character (standalone) | 2064533403727253762 | "Confidence was 0.82... Some things don't get automated." |

Also logged in `social_post_log` as `PERSONALITY 2026-06-09` (personality format) so metrics refresh picks them up.

Context: pick threads earn replies but ~zero likes/follows (June: 18 threads, 31 replies, 3 likes). Personality + sweat + brain posts (see GARY_VOICE.md pillars) are the fix. Daily targets going forward: 1 sweat, 1 brain/character post on top of automated pick threads.
