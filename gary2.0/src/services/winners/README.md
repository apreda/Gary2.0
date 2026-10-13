# winners — real money ($10,000 bankroll)

- `garyBet.js`: Gary's bet step (play or pass, the amount). `garyCard.js`: he places each pick on today's card and
  names his book; the book seats 75 minutes before a start (28 for an NBA tip) through `seat_the_card` (SQL).
- `lateNews.js`: before a pick seats, availability is compared with what it was at the pick; Gary stands or
  scratches. A scratch keeps the pick in the app, faded, with his reason, and never grades it.
- `winnersRules.js`, `winnersAdmissions.js`, `winnersBook.js`, `winnersProps.js`, `winnersScore.js`,
  `winnersBigGames.json`, `ticketIdentity.js`, `garyBigGameStake.js`.
- The database does the gating: `supabase/migrations/` (`admit_winners_candidate`, `seat_the_card`,
  `winners_daily_floor` waits for late news, `scratch_game_pick`). The worker is `scripts/run-winners-board.js`.
- Check the app decoder before changing a snapshot's shape (an emptied field once broke the whole board).
