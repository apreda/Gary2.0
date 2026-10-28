# winners — real money ($10,000 bankroll)

Gary picks every game for the Picks page; Winners holds the ones he bets. The worker is
`scripts/run-winners-board.js --watch` (always on).

**Since Oct 23 2026 (evening), game bets are the big games plus a few of Gary's best** (founder: entertain and win).
The big games (`winners_big_games`, written with the daily slate in `dailySlateService.js`) follow the TV: MLB playoff
games; TNF/SNF/MNF and Sunday's best 1 PM and 4:05/4:25 games by ESPN's FPI (`powerRatings.js`); college's top two
ranked games and up to three on ABC/CBS/FOX/NBC (`ncaafNationalGames.js`); the NBA's national-TV games, up to two a
night (`nbaNationalGames.js`). Each goes on at Gary's amount or his number after the late-news check. Gary's boards add
his best: two a day for the NFL, two a night for the NBA, three a day for college (migration
`20261023230000_winners_boards_back_small.sql`); big games and, for the NFL and NBA, the slate's two worst matchups of
bottom-third teams by ESPN's power index stay off the boards. Gary's card seats nothing. Props are unchanged (clear only).

- **NFL** (`nflBoard.js`, Oct 19 2026): about 110 minutes before the first kickoff he hasn't boarded, he sees every
  picked game still to start, fresh, and names the ones he would bet, in order. `seat_nfl_board` (SQL) seats his top
  two whose pick is on the same side (since Oct 23 2026), 75 minutes before kickoff, after late news.
- **NBA** (`nbaBoard.js`, from Oct 21 2026): the same look about 110 minutes before the first tip he hasn't boarded (50 until Oct 28 2026, when the picks moved to five hours out),
  each game read the way the NBA pick reads it (`buildNbaBoardEntry` in `nbaRead.js`, Oct 22 2026);
  `seat_nba_board` seats five a night, 28 minutes before tip, spread over the night (Oct 21 2026): the first third of
  tip times can take two, the first two thirds four, the late games the rest. (Oct 20, opening night, seated every NBA pick.)
- **College** (`ncaafBoard.js`, from Oct 23 2026): the NFL's look about 110 minutes before the first kickoff he hasn't
  boarded, each game read the way the college pick reads it (`buildNcaafBoardEntry` in `ncaafRead.js`);
  `seat_ncaaf_board` seats five a day spread over the kickoff times as the NBA's are, 75 minutes before kickoff.
- **The other game picks**: `garyBet.js` (play or pass, the amount) and `garyCard.js` (he places each pick on today's
  card and names his book); `seat_the_card` (SQL) seats the book 75 minutes before a start. Big games: the sweep.
- `lateNews.js`: before a pick seats, availability is compared with what it was at the pick and the changes are
  recorded for the data check. A published pick is final: nothing asks Gary to reconsider and nothing scratches it
  (founder, Oct 23 2026).
- `winnersRules.js`, `winnersAdmissions.js`, `winnersBook.js`, `winnersProps.js` (props: clear only since Oct 21
  2026, a lean only when nothing else would make it that day; six a day for MLB/NFL/college, three a night for the NBA), `winnersScore.js`, `winnersBigGames.json`, `ticketIdentity.js`,
  `garyBigGameStake.js`, `winnersDatabaseCall.js`. Darts are not on Winners.
- The database does the gating: `supabase/migrations/` (`admit_winners_candidate`, `seat_the_card`, `seat_nfl_board`,
  `seat_nba_board`, `winners_daily_floor` waits for late news; `scratch_game_pick` is no longer called).
- Check the app decoder before changing a snapshot's shape (an emptied field once broke the whole board).
