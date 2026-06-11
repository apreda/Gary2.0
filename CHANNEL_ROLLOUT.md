# Gary A.I. — Multi-Channel Rollout Plan

**Created:** June 9, 2026 · Pairs with `GARY_VOICE.md` (voice/pillars) and `SESSION_HANDOFF.md` (X mechanics)

## Rollout Order

| Wave | Channel | Why | Production cost |
|---|---|---|---|
| 1 (this week) | **Threads** | 1:1 repurpose of X content, betting content underserved, zero new production | None |
| 2 (week of Jun 15) | **TikTok + IG Reels** | Where betting content actually grows in 2026. IG account already exists (@betwithgary.ai, parked) — Reels fixes the zero-reach problem static posts had | One AI video pipeline |
| 2 | **YouTube Shorts** | Same vertical videos, third distribution leg, plus YouTube search longevity | Same pipeline |
| 3 (later) | **Discord** | Retention/community once video drives installs | Community mgmt time |

## What Adam needs to do (one-time, ~30 min)

1. **Threads:** Log into Instagram (@betwithgary.ai) → enable Threads profile. Handle inherits automatically.
2. **TikTok:** Create account — handle `@betwithgary` (fallback: `@betwithgary.ai` / `@garyai.picks`). Needs phone/email verification. Mark as business account, category Sports.
3. **YouTube:** Create channel "Gary A.I." with handle `@betwithgary`. 
4. Share logins (or session access via Chrome) so I can post/schedule.

## Profile kit (consistent everywhere)

- **Avatar:** Gary bear mark on near-black `#08080A` (use `GaryIconBG.png`)
- **Banner:** gold `#C9A227` on warm black, tagline lockup
- **Bio:** "I'm Gary. An AI that bets on sports — every game, every day, always free. Picks + full reasoning in the app. 21+. Never a guarantee, always the work."
- **Link:** betwithgary.ai (App Store link on TikTok/IG where direct links convert better)

## AI Video Pipeline (fully automated — to build)

Source of truth: `daily_picks` rationale + app pick-card UI. Stack: Python (Pillow/moviepy) + TTS voiceover, run from the marketing sandbox like existing image tooling.

**Format A — "Gary's Card" (daily, 25-40s):** animated pick card (team, line, odds, confidence) → 3-4 stat callouts rendered as motion text from the rationale → CTA end-card. AI voiceover reads a condensed hook + reasoning in Gary's voice (warm, sharp, not robotic).

**Format B — "Receipts" (weekly, 20-30s):** record recap, wins AND losses shown, green/red ledger animation. Trust content — this is the differentiator.

**Format C — "The Angle" (2-3x/week, 15-25s):** single contrarian stat for tonight's slate, big type, fast cuts. Designed for non-followers / FYP reach.

**Rules:** real Gary bear assets only (`ios/GaryApp/Assets.xcassets/`), gold/near-black palette, NO blue tint, no guarantees ("lock", "can't lose" banned), "always free" in every CTA, 21+ in captions. Caption style follows `GARY_VOICE.md`.

**Voiceover note:** pick ONE consistent TTS voice and never change it — the voice becomes the brand. Test 2-3 candidates with Adam before first post.

## Cadence once live

- Threads: mirror X daily (picks hook+reasoning merged into one post, personality posts 1:1)
- TikTok/Reels/Shorts: 1 Format A daily, 1 Format B weekly, Format C 2-3x/week → 8-10 videos/week, all from one render pipeline
- Track: follower growth, profile→App Store taps, and view-through rate per format; kill/iterate formats monthly

## Compliance guardrails (all channels)

- 21+ disclosure in bios and video captions
- Never "guaranteed", "risk-free", "lock of the century"
- Gambling-content policies are strictest on TikTok — no sportsbook promo codes, no deposit language ever (we're free, lean into it: "the only betting app that never asks for a dollar")
