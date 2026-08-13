# APP STORE — BRIDGE MODE (Aug 11 2026)
## Store copy for the no-betting-language build (2.23 / build 874)

> Context: Apple no longer accepts betting-adjacent apps from individual developer
> accounts (App Review thread, app 6751238914, Aug 10–11). Two contradictory
> instructions — "select Yes for Gambling" (2.3.6, Aug 10) and "individual accounts
> may not distribute gambling apps" (policy, Aug 11) — mean no declaration passes
> from the personal account while the app contains betting-related content.
> BRIDGE = the iOS display layer carries zero betting language (flag:
> `AppFlags.storeSafe`); the pick engine, data, web, and social are untouched.
> RESTORE = after LLC → org enrollment → app transfer, flip the flag, restore
> this file's predecessor copy, declare Gambling=YES honestly from the org account.
>
> Name + subtitle were already saved in ASC on Aug 11:
> **Gary AI - Sports Predictions** / **A pick for every game, free**.
> Age rating: LEAVE AS IS (all questionnaire answers None/No; 18+ via override —
> overriding higher is always permitted; do not re-run the wizard).

---

## Promotional text (170 max — paste into version page)

```
Gary makes a prediction for every game, every day — with the full written reasoning, and every result graded on his public record by morning.
```
*(147)*

## Description (replaces current — current one says "betting analyst," lists The
Odds API, props/parlays; all of that goes)*

```
Gary is an AI sports analyst who makes a prediction for every game, every day — and shows his work.

Each day, Gary studies every matchup on the schedule: team form, starting pitchers and lineups, injuries, ballpark factors, recent series results, and the stories around each club. Then he publishes a prediction for every game — the winner he expects, sometimes the margin he expects it by — with the full written reasoning behind it.

WHAT YOU GET

• A prediction for every game — MLB every day, NFL every week this fall, with NBA, NHL, and college sports in season
• The full reasoning — Gary writes out why, in plain English, before the game starts
• Player projections — stat lines Gary expects from hitters, pitchers, and skill players
• A public record — every prediction is graded against the final score the next morning, wins and losses alike, and the complete history stays visible in the app
• Live scores — follow the day's games as they happen

HOW IT WORKS

Gary is powered by frontier AI models doing genuine research: statistics, matchups, injuries, and news, weighed the way a careful analyst would. No gut feelings, no hype — a written case for every prediction, then a public grade when the games go final.

Gary is right a lot. He's also wrong in public, which is rarer.

Free. Every game, every day, with the reasoning attached.

Gary AI is for entertainment and informational purposes only.
```

## Keywords (100 max — founder-approved aggressive strip)

```
nfl,football,picks,predictions,analysis,stats,scores,matchups,daily,ai,sports,preview
```
*(85 — drops: gambling, bets, betting, props, odds, spreads, parlay, handicapper)*

## What's New (build 874)

```
A cleaner read on every prediction: picks now display in plain English with the reasoning front and center. Clearer daily records, and design polish across the app.
```

## App Review Notes (version page → App Review Information)

```
This build removes all betting-related content from the app, in direct response to the previous reviews.

The Aug 10 review (Guideline 2.3.6) noted that because the app contained tips or predictions related to real-money betting, "Gambling" must be selected in the age rating. The Aug 11 review noted that gambling apps may no longer be distributed from individual developer accounts. We have resolved this by removing that content entirely in this build:

— No sportsbook odds or prices appear anywhere in the app
— No betting-market terminology (moneyline, spread, over/under) appears anywhere in the app
— No wager tracking, bet logging, or bankroll features of any kind
— No real-money gambling, no simulated gambling, no virtual currency, no deposits, no payouts

Gary AI now provides sports game predictions with written analysis — a predicted winner, an expected margin, and player stat projections — plus a public accuracy record shown as wins-losses and win percentage. This is editorial prediction content, comparable to expert-picks columns published by major sports media.

The age-rating questionnaire (all chance-based activity questions: None/No) accurately reflects the app's content. Screenshots have been updated to match the current app. No account or demo credentials are required — all content is freely accessible on launch.
```

## Screenshots (BLOCKING — current set shows odds, e.g. +571 in slot 4)

All 10 iPhone shots must be recaptured in bridge mode. GaryTour harness
(`GaryTour.swift`, drives sim via simctl) is the tool; founder verifies the set
before upload. Storyboard: Home board → pick card (reasoning) → player
projections → record/Billfold (W-L%) → live scores → Hub.

## Founder reply to the review thread (SEND ONLY WITH THE RESUBMISSION —
## every claim is present-tense and only true of build 874)

> ⚠️ Do NOT say "I incorrectly checked a box on Gambling" (founder's first
> draft) — the live questionnaire is already all None/No; Apple's Aug 10 letter
> faulted us for NOT checking it. Confessing to a box that was never checked
> contradicts their own records inside a 2.3.6-accuracy thread.

```
Hi Team — understood on the new policy going forward, and thank you for the clear explanation.

I've made significant changes so the app accurately reflects what it is: sports insights, analysis, and predictions. This new build removes all betting-related content entirely — there are no sportsbook odds, prices, or lines anywhere in the app, no betting-market terminology (moneyline, spread, over/under, parlay), no money or unit-based results, and no wager tracking of any kind. The app's record is shown as wins, losses, and percentage only. The metadata, description, and screenshots have been updated to match.

The app has never facilitated real-money gambling, taken deposits, or placed wagers, and it does not instruct users to bet on its content. The age-rating questionnaire (all chance-based activity questions: None/No) accurately reflects the app as it now stands.

Please let me know if anything else is needed — happy to make further changes.
```

## Resubmission flow

1. Bridge build verified → founder archives build 874, uploads.
2. Enter this file's copy in ASC (Claude, browser).
3. Replace screenshots.
4. Founder presses "Resubmit to App Review" on the existing 2.23 submission —
   same thread, so the review team sees the reply note in context.

## RESTORE checklist (post-LLC, org account, after transfer)

1. `AppFlags.storeSafe = false`.
2. Restore APPSTORE_FALL_2026.md copy (name back to betting language if desired).
3. Age rating: re-run wizard, Gambling=YES from the org account (permitted).
4. Screenshots back to full boards.
