# Gary A.I. - Marketing Memory

## Social Media Posting Rules

### Hashtag Research (MANDATORY)
- **Every single time** we post to X or Instagram, research the best hashtags FIRST
- Do NOT default to generic hashtags — research what the betting community actually uses
- For X: 2-3 hashtags max, place after content body, NEVER start with a hashtag
- For Instagram: 3-5 targeted hashtags in caption
- Use sport-specific community hashtags (e.g., #CBJ for Blue Jackets, #GamblingX for betting community)
- **Researched hashtag picks (March 2026):** #GamblingX > #GamblingTwitter (platform is X now, verified accounts use #GamblingX), #CBB for college basketball, #MarchMadness during tournament, #WorldBaseballClassic during WBC
- Source: Verified accounts like McBets use #CBB + #GamblingX combo

### X (Twitter) Best Practices
- **TEXT-ONLY tweets** — no images. Data shows text gets 10-20x more impressions (138-211 vs 10)
- Links hurt impressions — use "betwithgary.ai" as plain text only when needed
- Don't copy mood words from app screenshots
- For pick tweets: 3-tweet THREAD (hook → paragraph reasoning → app CTA), NOT bullet points. Paragraph reasoning with 4-6 deep stats from the Supabase rationale. See `SESSION_HANDOFF.md` for the canonical format. (Superseded the old "3 bullet points" rule on June 3, 2026.)
- For recap tweets: Vary creative style daily, own the losses with transparency

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
- Tagline: "Every Game. Everyday. Always Free."
- CTA: "Full slate of Gary's picks are live. Every game covered. Completely free."

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
