# content — what the app and channels show besides the pick

- The daily board: `tomorrowService.js` (lane documentation, writes `tomorrow_board` for a date) with its parts in
  `tomorrowBoard/` (slate, starters, team form, weather, big games, Gary's pitcher/quarterback takes, the writer).
  The day turns at 5 AM Eastern: the scheduler writes the day's plan, slate and board at 4:45. The app reads the
  board by the game's own date, so a game's take exists from the day before (Sunday's NFL quarterback take appears
  Saturday).
- `dailySlateService.js` (the slate rows), `gameRecap.js` + `recapBox.js`, `streaksService.js` (MLB; the NBA's is
  `../sports/nba/nbaStreaksService.js`).
- `insights/`: the player cards (`playerInsightCards.js` for MLB, `footballPlayerInsightCards.js`,
  `ncaafPlayerInsightCards.js`, `nbaPlayerInsightCards.js`), the hub and its connections, the wire, and one file per
  insight lane in `insights/computers/` (the NBA game page's THE STARS is `nbaStars.js`, its big numbers
  `nbaTeamTape.js`). A new lane's category must also be in the app (`ios/GaryApp/HubModules.swift`) and in
  `scripts/lib/cardCoverage.js`; `tests/scripts/cardCoverageMonitor.test.js` checks the three agree.
- `copy/writingRules.js` (house writing rules), `diary/` (autopsies, the notebook).
