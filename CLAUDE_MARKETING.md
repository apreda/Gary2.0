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
- Instagram: @betwithgary.ai (bio + profile refreshed Jul 5 2026; link editing is mobile-only — add betwithgary.ai link from the phone app)
- Threads: @betwithgary.ai (LIVE Jul 5 2026 — public profile, bio + betwithgary.ai link set, bear avatar inherited from IG)
- YouTube: "Gary A.I." @betwithgary (LIVE Jul 5 2026 — brand channel on APreda31@gmail.com, channel id UC_jbOagwn4yEWeam16VGMsw; avatar/banner still to upload)
- TikTok: NOT created yet — Adam must sign up (fastest: Continue with Google), then profile setup can be finished for him
- Website: betwithgary.ai
- App Store: https://apps.apple.com/us/app/gary-ai/id6751238914

## Ops notes (Jul 5 2026)
- Bio on IG/Threads = MIRROR OF THE LIVE X BIO (Adam's call Jul 5 after two bad rewrites; keep all three identical, change X first): "AI that calls every game. MLB, NBA, NFL, NHL, college. I post my plays before start and grade every one, win or loss. Free in the app below."
- X API spend cap set to $100/billing cycle in console.x.com (was Unlimited).
- x-api-probe + other dead edge functions confirmed gone from Supabase project xuttubsfgdcjfgmskcol.
- Daily engagement sheet: scheduled Cowork task "gary-engagement-sheet-daily" regenerates the sheet ~10:17am ET and pings Adam. NEVER auto-post sheet drafts via API — X bans automated unsolicited replies (see engagement-sheet function header).

## POTD Record
**System of record: the Supabase `social_post_log` table** (see `SESSION_HANDOFF.md`). Don't keep a static log here — it goes stale (this one had stopped at March). Pull the record live from Supabase instead.
