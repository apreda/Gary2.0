# content — what the app and channels show besides the pick

- The daily board: `tomorrowService.js` (lane documentation, writes `tomorrow_board` for a date) with its parts in
  `tomorrowBoard/` (slate, starters, team form, weather, big games, Gary's pitcher/quarterback takes, the writer).
  The app reads the board by the game's own date, so a game's take exists from the day before (Sunday's NFL
  quarterback take appears Saturday).
- `dailySlateService.js` (the slate rows), `gameRecap.js` + `recapBox.js`, `streaksService.js`.
- `insights/` (player insight cards, connections, the hub), `copy/writingRules.js` (house writing rules),
  `diary/` (autopsies, the notebook).
