# sports — league facts and policy

- `mlb/`: starters and their identity (`pitcherIdentity.js`, `starterDebut.js`, `mlbPitcherStarts.js`), the bullpen
  ledger (`bullpen/`), game rows and frames, data readiness, umpires, team form.
- `nfl/`: the play-by-play ledger (`nflPlayLedger.js`), availability (`nflAvailability.js`: the week's note beats the
  feed's leftover status), the schedule and neutral sites, team baselines, player context and logs, red zone.
- `ncaaf/`: coverage policy (`ncaafGamePolicy.js`, 2026 conference map), the SEC/ACC/American/MAC availability
  reports, game context and metadata. No college props, ever (`ncaafPropStats.js` only grades props already published).
- `nba/`: `nbaOpeningNight.js` (before a team's first game: last season's finish and this season's roster, no
  departures, no last-season stats) and `nbaTeamRecentStats.js` (L1/L3/L5/L10 from BDL box scores).
- `football/`: evidence shared by NFL and college. `nhl/`: the held NHL lane's game data.
