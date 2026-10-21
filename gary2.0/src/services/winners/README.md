# winners — real money ($10,000 bankroll)

Gary picks every game for the Picks page; Winners holds the ones he bets. The worker is
`scripts/run-winners-board.js --watch` (always on).

- **NFL** (`nflBoard.js`, Oct 19 2026): about 110 minutes before the first kickoff he hasn't boarded, he sees every
  picked game still to start, fresh, and names the ones he would bet, in order. `seat_nfl_board` (SQL) seats his top
  five whose pick is on the same side, 75 minutes before kickoff, after late news.
- **NBA** (`nbaBoard.js`, from Oct 21 2026): the same look about 50 minutes before the first tip he hasn't boarded;
  `seat_nba_board` seats his top five a day, 28 minutes before tip. (Oct 20, opening night, seated every NBA pick.)
- **The other game picks**: `garyBet.js` (play or pass, the amount) and `garyCard.js` (he places each pick on today's
  card and names his book); `seat_the_card` (SQL) seats the book 75 minutes before a start. Big games: the sweep.
- `lateNews.js`: before a pick seats, availability is compared with what it was at the pick; Gary stands or
  scratches. A scratch keeps the pick in the app, faded, with his reason, and never grades it.
- `winnersRules.js`, `winnersAdmissions.js`, `winnersBook.js`, `winnersProps.js` (props: the reader selects the clear
  and lean ones with its own stake), `winnersScore.js`, `winnersBigGames.json`, `ticketIdentity.js`,
  `garyBigGameStake.js`, `winnersDatabaseCall.js`. Darts are not on Winners.
- The database does the gating: `supabase/migrations/` (`admit_winners_candidate`, `seat_the_card`, `seat_nfl_board`,
  `seat_nba_board`, `winners_daily_floor` waits for late news, `scratch_game_pick`).
- Check the app decoder before changing a snapshot's shape (an emptied field once broke the whole board).
