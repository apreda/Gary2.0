# GARY — BRAND SYSTEM
## The one-page truth for every external surface

> Jul 24 2026. Owner: Claude (marketing). **Scope: marketing/external surfaces only** — X, web,
> ads, creator briefs, press, App Store. The app's UI is founder-delegated live design and this
> file never binds it (Design Authority rule, Jul 7 2026). Voice canonical: `POSITIONING.md` (v5).
> This file supersedes the root `Gary_AI_Brand_Guide.pdf` and the old Notion Brand Assets content.

---

## 1. The name

- Product: **Gary A.I** (X display name) · App Store: **Gary AI - Sports Betting Picks** (v2.22
  live Jul 22) · Legal: **Gary A.I. LLC** (site footer).
- Gary is **"he," never "it."** The NAME carries "A.I." — in Gary-voiced copy he never calls
  himself an AI, a model, or an algorithm. Company-voiced surfaces (store listing, press) may say
  "AI" plainly.
- Handles: **@BetwithGary** everywhere. Domains: **betwithgary.ai** (canonical, www), betwithgary.com
  aliases. App Store id **6751238914**.

## 2. The character & the mark

- **Site/app mark:** GaryIcon — the minted-badge bear (`web/public/brand/gary-icon.png`, 800px;
  og variant 400px). Never GaryHead; GaryIconBG only as the JSON-LD logo and on share cards.
- **Marketing face = the suit-and-cigar boss Gary.** X avatar AND banner are the cigar Gary
  (`GaryMarketing/profile_kit/banner_x_cigar_v3_1500x500.png`, avatar_1024). The in-app mood
  assets are no-cigar — that split is deliberate; do not "fix" it in either direction.
- **No team logos, ever** (licensing) — sport identity is carried by the sport-accent color token
  and text.
- The bear is a character with a record, not a mascot for hype: he appears with the tape, a card,
  or a take — never with money-flash or lifestyle props.

## 3. Color (per-surface truth)

**Brand constants (all surfaces):**
- Gold `#C9A227` (the signature — Gary's voice, primary CTA, branded labels)
- Gold light `#E8D48B` · gold warm `#F4E4BA`
- Win `#3FB950` · Loss `#E5484D` (colored letters/text, never filled bubbles)

**Web (warm "ink" system, R≥B on every surface):** ink `#0A0908`, card `#16140E`, chip `#211D12`,
elev `#1B1812`; text roles = white at 0.92 / 0.62 / 0.50 / 0.35; hairlines white 0.08.
**Share/OG cards:** canvas `#151311→#0B0A09` radial, card `#121110`.
**iOS scene values** (`DesignSystem.swift` — the app owns these; listed for reference only):
darkBg `#08080A`, cardBg `#121214`, elevated `#1E1A1A`, field `#131110`.

**Sport accents (web tokens):** MLB `#7BC267` (share-card grass `#63D17E`), NFL `#22C55E`,
NBA `#3B82F6`, NHL `#00A3E0`, NCAAB `#F97316`, NCAAF `#DC2626`.

## 4. Type (per-surface truth — do NOT cross-apply)

- **Web:** display = Barlow Condensed (poster headlines; uppercase only for short phrases ≤3
  words/line, sentence-length headlines are mixed-case), body = Inter, data/labels = JetBrains
  Mono (the web's Quant Terminal voice).
- **iOS (reference only):** display = Bebas Neue (CAPS-only face, founder-picked Jul 5), data =
  SF semibold/bold with tabular numerals (**JetBrains retired in-app Jul 12** — zeros read as
  eights at label sizes), accent kickers = SF black italic caps.
- **Marketing images:** share-card hero = Barlow Condensed Bold (`/api/share-card`); results card
  = Anton + Inter. Fonts live in `web/assets/og/`.
- Law (recurred): **never present a mock in mono/JetBrains by default** — check the target
  surface's real faces first.

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
- Stale/superseded: root `Gary_AI_Brand_Guide.pdf` + `Gary_AI_Product_Breakdown.pdf` (pre-warm-gold,
  pre-positioning); press gallery PNGs delisted pending regen.

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
