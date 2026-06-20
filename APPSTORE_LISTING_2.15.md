# App Store Listing — 2.15 (draft for submission, June 20, 2026)

Status: DRAFT — paste into the 2.15 "Prepare for Submission" page in App Store Connect.
Build: marketing version 2.15 (Info.plist + project.pbxproj both 2.15). Re-archive from current `main` so it includes the LiveScoreCache main-thread fix (commit a5225a2a).

**⚠️ READ FIRST — the build is FREE (no paywall).** `PremiumPicksView.freeLaunch = true`
(Views.swift:5495) makes `sportUnlocked` return true for every board, so 2.15 ships with
no paywall and no active in-app purchase. The Description below is corrected to match that —
the old 2.13 "take All-Access with a free trial" line is GONE. If your ASC listing still has
active IAPs attached, don't submit them with this build (metadata-mismatch rejection risk,
Guideline 2.3.1). When you flip `freeLaunch = false`, restore the paid-Winners paragraph.

**Screenshots:** the 10 existing captures still represent the app. Swap the Hub shot if you
want to show the new digest / Regression Board (Previews and Screenshots → 6.5" Display).

---

## Promotional Text (163/170)

The 2026 World Cup is on — every match covered with real lineups and form. Cleaner pick cards everywhere, the live score on the card, the full read on every call.

## Keywords (95/100) — unchanged from 2.13, still accurate

world cup,soccer,bets,picks,parlay,props,odds,predictions,mlb,nba,nfl,nhl,ncaa,betting,fifa,dfs

## What's New (≈760/4000)

Gary 2.15 — cleaner cards, real World Cup lineups, and picks you can trust

• Pick cards are cleaner on every page — odds in each sport's color, handicaps and totals formatted right, and one card size everywhere
• The live score shows right on the card while a game is in play
• World Cup lineups on the pitch: each nation's real kit colors, the true formation, and the stadium on the back of the card
• The Hub reads like a digest now — tap any section to open it, tap a player for the full breakdown
• Regression Board adds tomorrow's projected starters, plus deeper reads on tonight's arms: ERA vs xERA, hard-hit and barrel rates, and the verdict
• Your nightly recap reflects how the night actually went — wins and losses, on the record
• Gary won't post a pick on a game he can't truly read. No real data, no pick.

Every game, every day. Full reasoning on every card, and the whole record on the books.

## Description (≈2300/4000) — CORRECTED for the free build

Gary is an AI that bets on sports — and he's honest about both halves of that sentence.

Every morning, Gary's research engine works through the whole slate: odds and line movement, injuries, matchup history, bullpen workloads, advanced stats most apps never surface. Then Gary — a 30-year-veteran bettor who happens to be a machine (and a bear) — makes his calls: spreads, moneylines, totals, player props. Every pick ships with the full reasoning, so you always see why. No locks, no hype, no guesswork.

EVERY GAME. EVERY DAY. ON THE RECORD.

• The Slate, Free — every game covered, every day, every pick with the reasoning behind it
• Full Reasoning — flip any card for Gary's Take, the Tale of the Tape, key stats and sportsbook odds
• Player Props — over/under calls built on recent form and matchup data
• The Wire — market pulse, betting angles and storylines for tonight's games
• Live Mode — sweat the slate in real time: scores, bases, Gary's running verdicts
• Talk to Gary — ask about any game, line or prop, and he'll talk it through
• Billfold — the whole ledger in your pocket: all-time, last 30, net units. Nothing deleted, ever.

2026 FIFA WORLD CUP — LIVE NOW

All 104 matches, June 11 to July 19. Three-way moneylines (yes, including the draw), Asian handicap and total goals — with form, xG, real starting lineups and head-to-head history on every match card.

EVERYTHING IS FREE

Every board, every sport, no paywall — accounts optional. Winners is Gary's highest-conviction board: the handful of plays per sport he'd actually bet, each with its own graded record. The whole app is open right now.

SPORTS COVERED

MLB · NBA · NFL · NHL · NCAAB · NCAAF · 2026 World Cup

THE HONEST PART

Most pick services show you the wins. Gary shows you the record. Every pick is graded in public the next morning — losses stay on the books with the wins, no deletions, no restatements.

IMPORTANT

Gary.ai is for informational and entertainment purposes only. This app does NOT:
- Facilitate real-money gambling
- Accept deposits or process withdrawals
- Place bets on your behalf
- Guarantee any outcomes

You must be of legal age and comply with local laws. Sports betting involves risk. If you or someone you know has a gambling problem, call 1-800-GAMBLER.

Gary does the research. You make the calls.

---

## What changed vs the 2.13 listing

- **Promotional Text:** rewritten — leads with the World Cup being live (still true through July 19) and the 2.15 card/clarity story instead of the launch-day "all 104 matches" framing.
- **What's New:** all-new 2.15 entry, mirrors the in-app ChangelogView 2.15 bullets exactly.
- **Description — Winners paragraph:** replaced "Go single-sport, bundle up, or take All-Access with a free trial" (markets a subscription that ISN'T in the free build) with an "EVERYTHING IS FREE" block. This is the metadata-mismatch fix.
- **Description — World Cup paragraph:** added "real starting lineups" (the new on-pitch formation/kit work).
- **Keywords, Description opening, IMPORTANT block, Copyright (© 2026 Gary A.I. LLC), Support/Marketing URLs, subtitle, category, age rating:** unchanged from 2.13.

## Open question for Adam — did 2.14 ship to the App Store?

The 2.13 listing note said it was "saved … not added for review — waiting on the build," so I
can't tell whether 2.13 or 2.14 ever reached store users. If the last version users actually
SAW on the store was 2.13, you may want to fold a couple of 2.14 highlights into the What's New
so nothing reads as missing:

  • The Wire now reports only real games — no stale or off-day news
  • World Cup matchups get their own page on the Picks tab, like every other sport

If 2.14 already shipped, leave the What's New as written above (2.15-only). Your call.

## Apple gambling-rules note (Guideline 5.3)

This stays a safe listing: Gary is framed as analysis/informational + entertainment, the
IMPORTANT block explicitly disclaims real-money gambling / deposits / placing bets / guarantees,
and the 1-800-GAMBLER line is present. Keep the What's New free of imperative wager language
("bet this", "lock", "guaranteed") — the current copy is analysis-framed ("the read", "the
verdict", "record on the books"), which is the right side of the line.
