> **September 4 update:** Use [the current launch runbook](launch-2026-09/LAUNCH_RUNBOOK.md) for the account-based founding offer, execution order and current channel-policy decisions. Use [the 2.25/899 review pack](APP_REVIEW_2_25_899.md) for submission facts. Earlier offer, release-state and policy statements below are historical.

# GARY — BRAND SYSTEM
## Brand and operational reference

> Jul 24 2026. Owner: Claude (marketing). **Scope: marketing/external surfaces only** — X, web,
> ads, creator briefs, press, App Store. Voice reference: `POSITIONING.md` (v5).
> Visual instructions were removed at Adam's request on September 8, 2026.
> Follow his current request; this file is not a visual design guide.

---

## 1. The name

- Product: **Gary A.I** (X display name) · App Store: **Gary AI - Sports Betting Picks** (v2.22
  live Jul 22) · Legal: **Gary A.I. LLC** (site footer).
- Gary is **"he," never "it."** The NAME carries "A.I." — in Gary-voiced copy he never calls
  himself an AI, a model, or an algorithm. Company-voiced surfaces (store listing, press) may say
  "AI" plainly.
- Handles: **@BetwithGary** everywhere. Domains: **betwithgary.ai** (canonical, www), betwithgary.com
  aliases. App Store id **6751238914**.

## 2. Asset reference

- Site/app asset: GaryIcon (`web/public/brand/gary-icon.png`, 800px; og variant 400px).
  GaryIconBG is also used on share cards and in JSON-LD.
- Existing marketing assets include suit-and-cigar Gary
  (`GaryMarketing/profile_kit/banner_x_cigar_v3_1500x500.png`, avatar_1024).
  In-app mood assets also exist. These describe available assets, not future design requirements.
- Team logos require appropriate licensing.

## 5. Voice — the hard laws (canonical: POSITIONING.md v5)

1. Published copy = **plain, checkable facts**, spoken-test passed. If it would sound at home in a
   commercial, cut it.
2. Wins AND losses, always. The record noun is **"the tape."** Never "graded" in public copy.
3. **Zero emojis. Zero hashtags** (single exception: the daily recap's 1-2 league tags). **No
   ellipsis. No em-dashes in tweets** (`killDashes` backstop).
4. Banned vocabulary: locks, guaranteed, free money, tail me, value play, +EV, sharps/squares/juice,
   fake wager claims ("I put 3 units on it"), win-rate promises in ads. "CALL" banned in product copy.
5. Gary never breaks the fourth wall and is never prompted "as a personality" — state facts in
   first person and the voice falls out.
6. Founder-supplied lines go in **verbatim**.
7. Conviction language is allowed and true (he sweats every pick); deception is not.
8. Recurring bits (GARY_BITS.md): max ONE per post, only where natural.

## 6. Asset inventory

- `GaryMarketing/profile_kit/` — X avatar + banners (cigar v3 = live), YouTube banner.
- `web/public/brand/gary-icon.png` (+og) — site mark. `web/assets/og/` — card fonts + GaryIconBG.
- Live card renderers (prod): `/api/share-card` (1080×1080 app-parity pick card; `&result=won|lost`
  stamps), `/api/results-card` (recap grid). Legacy unused: `/api/pick-card-app`, `/api/take-card`.
- `gary_asset_sheet.png` — character sheet. Launch film treatment: `LAUNCH_AD_TREATMENT.md`.
- The obsolete brand-guide PDF was deleted on September 8, 2026.
  `Gary_AI_Product_Breakdown.pdf` is a historical product reference; press
  gallery PNGs were delisted pending regeneration.

## 7. Links & attribution

- Install path: **betwithgary.ai/get** → App Store CPP (`ppid 3c207d81…` + `ct=x_bio`); pinned
  reply carries `ct=x_pinned`; creators get **betwithgary.ai/c/<handle>** → `ct=cr_<handle>`;
  the fall page is **betwithgary.ai/nfl** (waitlist + `nfl_page_*` event surfaces).
- Links NEVER ride in a tweet's main body (algorithm penalty) — bio, pin reply, or self-reply only.
- Keep ct tokens ≤ ~5 live at once (ASC reporting floor is ~5 installs/24h per token).

## 8. Compliance constants

- Store rating 17+; site legal line is 18+ with 1-800-GAMBLER — every outward ad/creator surface
  carries an age line. Never guarantee outcomes; entertainment/information framing.
- Creators: #ad disclosure ON, no fake betslips, no profit promises (CREATOR_FUNNEL.md).
- X: organic first-party posting is clear; PAID handicapping promotion is banned (Feb 2026) — no
  boosted posts, no paid partnerships on X.
- Meta/TikTok paid = restricted category; case-by-case review before any spend.
