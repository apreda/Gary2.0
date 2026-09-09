# Ad.md — how Gary ads get made

Read this before touching any ad, social creative, App Store asset or marketing mock. It exists because the first pass on Sep 9 2026 got every one of these wrong at least once.

## 1. An ad is not a post
An ad has four things and nothing else: the product on screen, one benefit the fan can read in a second, a reason to tap now, and a button. If a board could run as a tweet with no app in it, it is a post. Start over.

## 2. Only real screens
- Every card, board, row or screen in an ad is captured from the app. Never redraw, restyle or "adapt" a card for the ad. Ever.
- Capture from the simulator with the tour harness (Debug build only):
  - Sim `iPhone 17 (Gary)` `709A9235-5F15-40D3-BA98-F7693C47B640`; build at `/Volumes/KINGSTON/gary-dd/Build/Products/Debug-iphonesimulator/GaryApp.app` → `xcrun simctl install` + `xcrun simctl launch <UDID> ai.betwithgary.app`.
  - Drive it: write a verb to `$(xcrun simctl get_app_container <UDID> ai.betwithgary.app data)/tmp/gary-tour.txt`, then `xcrun simctl spawn <UDID> notifyutil -p com.gary.tour`. Verbs: `tab 0..4` (Home, Winners, Hub, Picks, Billfold), `picksday today|yesterday`, `picks N` (carousel index), `flip` (card back), `homeboard mlb|nfl`, `hub mlb|nfl|ncaaf|nba`, `scroll 800`.
  - `xcrun simctl io <UDID> screenshot out.png` → 1206×2622 (3x). Picks-board card border box is x 47–1113, y 614–1310; crop at the border, 46px rounded mask, quantize to ~200 colors.
- The logo is `GaryBrand.mark` = `Assets.xcassets/GaryIconBG` (dark lenses on black). Not GaryHead, not GaryBadgeGold, not GaryChrome. Cut it off its black tile by flood fill when it needs to float.
- Real screens carry real numbers (header L7 record, Billfold net, "NO PICK", "DELAYED"). Look at every pixel in frame before showing a board; whether a bad number stays is Adam's call, not an accident.

## 3. Copy: count what the image already says, then write only the missing thing
Before any line goes on a board, list what the visual states. A real pick card already says whose pick it is, the matchup, the price, the time and the league. Then:
- Never restate any of it. Matchup once. Time once. Gary's name once outside the CTA. "Free" once.
- The headline says the one thing the image cannot: why open the app now, or what happens after.
- A board is one idea. If two elements make the same point, one goes.
- Placeholders are empty slots with a two-word tag. Never a paragraph inside a placeholder.
- No filler, no captions, no "say go" lines, no emoji anywhere.

## 4. A set is different ideas, not one template with different words
- Each board gets its own idea and its own format (hero card, card back, mosaic, full phone, recap card, feed frame). Four boards from one template is one ad.
- Every image is chosen for one argument, and the note on the canvas says what that argument is. If the reason for an image can't be said in a sentence, it is random.
- When Adam gives a direction ("use real images") it is a floor, not the whole brief. Bring the ideas.

## 5. Real numbers only
- Records, scores, prices and dates come from the ledger (`game_results`, `daily_picks`) or from the screen. Nothing is invented, including reviews and ratings.
- Supabase reads cap at 1000 rows; paginate before quoting a season record.
- Wins and losses may both appear, but showing losses is a decision made on purpose (one honesty board, retargeting audiences), never a side effect of a screenshot.

## 6. Format
- Creative: 1080×1350 (4:5). Headline in Bebas Neue at 100px or more; sub-line 34px or more; nothing that matters under 28px. Gold `#C9A227` on ink `#0A0908`, warm white `#F5F1E8`, loss red `#E5484D`.
- Brand lockup (mark + GARY A.I.) once, top left. CTA pill "Get Gary free", then "On the App Store". One legal line at the bottom (21+, not a sportsbook, 1‑800‑GAMBLER).
- Phone frames show the real screen from the status bar down, scaled to fit; bleed off the bottom only. Never a partial screen that starts mid-row.
- Feed mock (X): 600 wide, real handle @BetwithGary, real App Store name "Gary AI - Sports Betting Picks", real rating.

## 7. Voice
Plain and spoken, the way a fan says it at a bar. Gary is a character, never an AI, a model or software. Stamps are CASHED / LOST. "Fade the bear" and "Bet with Gary" are the app's own words and fine. No betting-tool lingo (CALL, EV, CLV), no hype, no exclamation points.

## 8. Before showing Adam
- Every card and screen on the board is a capture from the app.
- The logo is GaryIconBG.
- Each line adds something the image doesn't say; no fact appears twice.
- Each board is a different idea and I can say why that image.
- Every number is from the ledger or the screen.
- Type passes the thumb test at feed size.
- Looked at the rendered board myself before publishing.

## 9. Where the work lives
Canvas: https://claude.ai/code/artifact/4d4ffb87-e082-4401-b98b-79f8ae3f828b (page 1 feed format, page 2 install ads, page 3 NFL tonight). Sources for the Sep 9 set: `GaryMarketing/ads/2026-09-09-x-ads/` (build scripts, crops, subset fonts, canvas.json). Re-seed with the design canvas helper from a fresh session; the scratchpad copy is disposable.
