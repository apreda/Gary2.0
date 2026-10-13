# src/services — one folder per area (Oct 13 2026)

| Folder | What lives there |
|---|---|
| `providers/` | Every outside data feed: BallDontLie, odds, MLB Stats API, nflverse, CFBD, ESPN, Savant, weather, the NBA injury report, Jev |
| `sports/<league>/` | League-specific facts and policy that are not a feed: MLB starters and bullpens, NFL play ledger and availability, college policy and availability reports, NBA opening night, NHL |
| `gary/` | The pick system: `agentic/` (desks, orchestrator, tools, constitution, the frozen June MLB engine), `pickdesk/` (props desk and game-desk helpers), `darts/`, and the pick plumbing (publication, market truth, prop quotes) |
| `winners/` | Gary's bet, his card and book, late news, and the Winners rules and admissions (the SQL lives in `supabase/migrations/`) |
| `content/` | What the app and channels show besides the pick: the daily board (`tomorrowService.js` + `tomorrowBoard/`), the slate, recaps, insights, copy rules, the diary |

Each folder has a short README. Job entry points live in `../../scripts/` (see its README) and the four
`run-*.js` files at the package root; launchd and the scheduler start them by path, so moving a script means
updating `scripts/launchd/` and `scripts/scheduler.js`.

Moving a file: every relative import must follow it, including dynamic `import()`, `new URL(..., import.meta.url)`,
`vi.mock` paths, template-string paths and source-text tests. The June MLB engine's freeze guard
(`tests/services/agentic/mlbJuneEra.test.js`) counts a relative path by its file name, so a move never reads as a
prompt edit; a content edit still fails it.
