# Gary A.I. - Marketing Memory

> **⚠️ SUPERSEDED (June 16, 2026): posting rules below are OUTDATED.**
> The operative posting policy is `X_CONVERSION_STRATEGY.md` + the `VOICE_RULES`
> baked into `gary2.0/supabase/functions/social-auto-post/index.ts`. Key reversals:
> **NO hashtags ever, NO emojis**, single conversion-first tweets (not threads),
> and pick/results tweets now lead with branded card IMAGES (not text-only).
> The Branding & Logo and Accounts sections below are still current.

### X (Twitter) Best Practices
- Don't copy mood words from app screenshots
- For recap tweets: own the losses with transparency (open-receipt recaps)

### Branding & Logo (MANDATORY)
- **ALWAYS use the actual Gary logo / character files** — NEVER let AI generate its own version of the bear (Gary is a **bear**, not a lion).
- **The transparent logo is `GaryIconBG`** — `ios/GaryApp/Assets.xcassets/GaryIconBG.imageset/GaryIconBG.png` (1024×1024, transparent). This is the canonical overlay mark. *(The old `gary_bg.png` reference was wrong — no such file exists in the repo.)*
- Mood / character assets (`GaryFire`, `GaryCooking`, `GaryBeer`, `GaryCigar`, …) live in the same `Assets.xcassets/` — reference them by their real names, not loose `.png` paths.
- For graphics: generate the background / layout with AI, then overlay the REAL Gary asset with Pillow.
- **App color palette: see `DESIGNER_BRIEFING.md` (canonical)** — gold `#C9A227`, near-black `#08080A`, silver `#C7CCD6`, green wins / red losses. Marketing must match it; don't re-list hexes here (copies drift).
- **NO blue tint** — AI generators default to blue-ish dark tones, always specify warm black/no blue

### Content Voice
- No generic AI slop
- Don't copy words from screenshots
- Gary logo = small branding, not centerpiece
- ~~Tagline: "Every Game. Everyday. Always Free."~~ **OUTDATED — Winners is paid since June 8, 2026.** The free slate is the proof layer; don't market the whole product as free.

### Instagram Strategy (ON HOLD)
- Static posts get zero non-follower reach — need Reels
- Reels template v2 built with app pick card animation
- Resume when strategy is figured out

## Accounts & Handles
- X: @BetwithGary (VERIFIED ✓ blue check)
- Instagram: @betwithgary.ai (on hold)
- Website: betwithgary.ai
- App Store: https://apps.apple.com/us/app/gary-ai/id6751238914

## POTD Record
**System of record: the Supabase `social_post_log` table** (see `SESSION_HANDOFF.md`). Don't keep a static log here — it goes stale (this one had stopped at March). Pull the record live from Supabase instead.
