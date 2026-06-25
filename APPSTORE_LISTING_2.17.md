# App Store Listing — 2.17 (ASO overhaul, June 25 2026)

Status: DRAFT — paste into the 2.17 "Prepare for Submission" page in App Store Connect.
Build: marketing version **2.17** already set (project.pbxproj `MARKETING_VERSION = 2.17`,
Info.plist `CFBundleShortVersionString = 2.17`, ChangelogView 2.17). Re-archive from current `main`
(includes the in-app review prompt below).

> ⚠️ **THE BIG CHANGE vs 2.15/2.16 is the SEARCH METADATA (ASO).** The old App Name was the bare
> brand "Gary.ai" — which is why searching "sports betting", "picks", or even "gary" didn't surface
> the app (the name held zero keywords, and `gary.ai` indexes as a single token). The Name now
> carries keywords and splits the brand into `gary` + `ai`. **All counts below were independently
> recounted ≤ Apple's hard limits** (Name 30, Subtitle 30, Keyword field 100). Rationale came from
> the `aso-review` multi-agent workflow (keyword + competitor research, adversarially verified — its
> verifier caught two over-limit drafts before this final set).

---

## App Name (30/30) — CHANGED (was "Gary.ai")

```
Gary AI - Sports Betting Picks
```

- Splits the single `gary.ai` token into two searchable tokens **gary** + **ai** (fixes the
  "have to type the full name" brand-search problem) and fills the highest-weight ASO field with
  five searched words: gary, ai, sports, betting, picks.
- Keep the stylized ".ai" on the ICON and SCREENSHOTS only — the store NAME field uses the space.

Verified alternatives (your call):
- `Gary AI Sports Handicapper` (26) — honors the "handicapper" identity; very 5.3-safe
- `Gary AI - Sports Picks & Tips` (29) — **STANDBY**: zero betting words; one-swap insurance if a
  reviewer ever flags Guideline 5.3

## Subtitle (30/30) — CHANGED (was "A.I Sports Handicapper")

```
Props, Parlay, Odds, Best Bets
```

- Five fresh high-intent words NOT in the Name (props, parlay, odds, best, bets). Apple combines
  words across Name + Subtitle + Keywords into phrases — this yields "best bets", "prop bets",
  "parlay picks", and (with the Name) "sports betting". "best bets" is a top daily-intent search.

## Keyword field (97/100) — CHANGED, de-duped vs Name+Subtitle (no repeated words)

```
handicapper,prediction,expert,tips,moneyline,spread,mlb,nba,nfl,nhl,ncaa,soccer,fifa,worldcup,dfs
```

- "Handicapper" lives here (high intent, lower 5.3 profile than in the Name). World Cup terms kept
  LIVE through July 19. Comma-separated, NO spaces (spaces waste characters).

### July 20 swap — CALENDAR IT (off-season football pivot, 99/100)

```
handicapper,prediction,expert,tips,moneyline,spread,over,under,mlb,nba,nfl,nhl,ncaa,cfb,futures,dfs
```

- Drops dead `soccer,fifa,worldcup`; adds `over,under,cfb,futures` for NFL/NCAAF training-camp demand.

## Promotional Text (168/170) — captures the "A.I handicapper + data engine" identity (Adam's line)

```
Gary is an A.I sports betting handicapper and data engine. He reads the whole slate, calls every game with full reasoning, and grades every pick in public, win or loss.
```

- Promotional Text does NOT affect search ranking — it's the first line users read and is refreshable
  anytime without a new build. This is the right home for the "data engine" framing (nobody searches it).

## Guideline 5.3 (gambling) — SAFE to ship the "Betting" title

5.3 gates on FACILITATING real-money wagers (deposits, placing bets, payouts) — not on the word
"betting." Gary takes no money and places no bets (informational/entertainment, with the IMPORTANT
disclaimer block + 1-800-GAMBLER). The ranking set all ships betting language in live titles: Rithmm
("AI Sports Betting"), Pickswise (runs "Gambling" in its subtitle), Action Network, OddsJam, Outlier.
You also lead with "Gary AI", not "Betting", which keeps the first word clean. If a reviewer ever
pushes back, swap to the standby `Gary AI - Sports Picks & Tips` (29) — one resubmit, not a redesign.

## Ratings & install velocity — the OTHER half (co-equal with keywords)

Perfect keywords still under-rank at 3 ratings. Shipping in the 2.17 BUILD:
- **In-app review prompt** (`SKStoreReviewController` via SwiftUI `@Environment(\.requestReview)`) fired
  on the post-WIN moment — when a tracked pick shows **CASHED** — gated to once per app version after
  ≥3 sessions. Apple throttles to ~3 prompts/365 days, so it can't nag.
  Implemented: `ReviewPrompt` helper in `ContentView.swift`; session counter on the `scenePhase`
  `.active` hook; trigger folded into `CompactPickRow`'s `.onAppear` (win cards only).
- **"Rate Gary" CTA** in the social recaps + X bio → review deep link
  `https://apps.apple.com/app/id6751238914?action=write-review` (app id 6751238914 verified live).

## What's New (fill from the 2.17 changelog)

ChangelogView 2.17 = "A sharper player card and cleaner World Cup reads." Use the in-app 2.17 bullets.
(The ASO metadata + review-prompt changes are not user-facing copy.)

## Unchanged from 2.15

Description (the free-build version), IMPORTANT block, Copyright (© 2026 Gary A.I. LLC),
Support/Marketing URLs, category (Sports / Entertainment), age rating.

## What changed vs the 2.15 listing

- **App Name:** "Gary.ai" → "Gary AI - Sports Betting Picks" (the headline ASO fix).
- **Subtitle:** "A.I Sports Handicapper" → "Props, Parlay, Odds, Best Bets".
- **Keyword field:** rebuilt + de-duped vs Name/Subtitle; WC terms now seasonal (July 20 swap noted).
- **Promotional Text:** new "A.I sports betting handicapper and data engine" identity line.
- **Build:** adds the in-app review prompt (ratings driver).
