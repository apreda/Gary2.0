# sports — league facts and policy

- `mlb/`: starters and their identity (`pitcherIdentity.js`, `starterDebut.js`, `mlbPitcherStarts.js`), the bullpen
  ledger (`bullpen/`), game rows and frames, data readiness, umpires, team form.
- `nfl/`: the bettor's data for the NFL read (`nflBettorData.js`: the line and its moves, the quarterbacks, how good
  each team is with ranks, the season game by game, the spot), the play-by-play ledger (`nflPlayLedger.js`),
  availability (`nflAvailability.js`: the week's note beats the feed's leftover status), the schedule and neutral
  sites, team baselines, player context and logs, red zone.
- `ncaaf/`: coverage policy (`ncaafGamePolicy.js`, 2026 conference map), the SEC/ACC/American/MAC availability
  reports, game context and metadata. No college props, ever (`ncaafPropStats.js` only grades props already published).
- `nba/`: `nbaOpeningNight.js` (before a team's first game: last season's finish, this season's roster with newcomers
  marked, and who left with where they went; no last-season stats), `nbaTeamRecentStats.js` (L1/L3/L5/L10 from BDL
  box scores), `nbaTeamGames.js` (finals into `team_games` and the win/loss runs, fed by the live-score poller),
  `nbaStreaksService.js` (player streaks and Hot & Cold for Darts).
- `football/`: evidence shared by NFL and college. `nhl/`: the held NHL lane's game data.
