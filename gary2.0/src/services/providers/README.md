# providers — outside data feeds

- **BallDontLie** (`ballDontLieService.js` facade, endpoint families in `bdl/`, `ballDontLie/`): games, odds, props,
  stats and injuries for every league. `bdl/transport.js` owns caching, single-flight, the cross-process pacing gate
  (football and NBA keys) and the 429 ladder (waits BDL's Retry-After). NFL/MLB keys read 600 requests/minute; the
  NBA tier must too (`curl -s -D - -o /dev/null -H "Authorization: $BALLDONTLIE_API_KEY" https://api.balldontlie.io/nba/v1/teams | grep -i ratelimit`).
  NBA team lists hold 59 defunct franchises: `getTeams('basketball_nba')` keeps the 30 with a conference.
  NBA game `date` is a bare Eastern date: format it with `providerGameDateLabel` (`utils/dateUtils.js`), never `new Date(date)`.
- **Odds**: `oddsService.js` (BDL first), `backupGameOdds.js` and the Odds API on a 500-credit plan (`oddsApiBudget.js`
  meters every call), `propOddsService.js`, `oddsSnapshots.js`.
- **League feeds**: `mlbStatsApiService.js`, `baseballSavantService.js`, `nflverseService.js` (play-by-play, schedule,
  snaps, the official injury report), `cfbdService.js` (college; reads one week at a time), `nhlApiService.js`,
  `nbaOfficialInjuryReport.js` + `nbaInjuryReportService.js` (the league's PDF, every 15 minutes, read with pdftotext).
- **ESPN** (free JSON): `espnRecaps.js` (AP recaps, college and NBA), `espnNbaDepthChart.js`, `espnCollegeService.js`.
  Never pass ESPN's predictor, odds or against-the-spread blocks to Gary.
- **Jev / TypeSafe** (`jev/`): MLB and NFL prop assessments; switches are `GARY_JEV_*` in `.env`.
- `weatherService.js`. (Tank01 lapsed and was deleted Oct 13 2026; the NBA tools run on BDL box scores and ESPN.)
