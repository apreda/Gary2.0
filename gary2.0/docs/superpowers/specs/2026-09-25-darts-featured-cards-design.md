# Darts featured cards: Marquee, Hot & Cold, All Darts

Founder GO, Sep 25 2026 (design approved in chat: "that all looks good. Go ahead and make it real").

## Row

- MLB: Parlay · Marquee · Winners · Hot & Cold · All Darts
- NFL: Parlay · Primetime · Winners · Fantasy · Hot & Cold · All Darts
- Each tab shows its own sport's game and players. Four cards fit on screen; the rest scroll.

## Marquee (MLB) / Primetime (NFL)

- The MLB game of the day "the way ESPN or the public would think of it"; nothing to do with Gary's picks.
- `scripts/run-marquee.js` (launchd `com.gary.marquee`, 7:05 to 10:05 AM ET) gives one light editor call only facts
  (records and race position from the standings, national TV, the probable starters' season lines), then
  locks the pick in `marquee_games`. It is separate from `winners_big_games`, which admits Winners plays.
- `gary_private.primetime_games` lists the marquee game at any start time as `MARQUEE GAME`, so the existing
  Primetime page, pieces writer and bets list serve it unchanged. `get_primetime` lists NFL games first
  (2.27 shows the first game). The 6 PM Primetime alert skips the marquee game.

## Hot & Cold

- `player_form`, read by `get_player_form`. It is kept out of `streaks` because the shipped 2.26 Hub lists every row there.
- MLB (`streaksService.js`, nightly with the streaks): bats over their last 7 games (20+ at-bats, within 12
  days), today's probable starters over their last 3 starts. NFL (`nflStreaksService.js`): players over their
  last 3 games (cold = established, 70+ yards a game before), quarterbacks over their last 3 starts.
- Counts only. `short` is the figure; `detail` says only what the figure doesn't. Five per list; a hot name is
  never also cold. Gary's dart on a listed player rides under the line; nothing is added otherwise.

## All Darts

- Every dart today for the tab's league, by category in the board's order, then first pitch. `darts_day`
  now returns each dart's `result`; a hit gets ✓, a miss carries no mark (Darts celebrates what landed).
