# src/services — one folder per area (Oct 13 2026; refreshed Oct 21 2026)

| Folder | What lives there |
|---|---|
| `providers/` | Every outside data feed: BallDontLie, odds, MLB Stats API, nflverse, CFBD, ESPN, Savant, weather, the NBA injury report, Jev |
| `sports/<league>/` | League facts and policy that are not a feed: MLB starters and bullpens, the NFL play ledger and bettor's data, college policy, NBA opening night and team games |
| `gary/` | The pick system: `agentic/` (desks, orchestrator, tools, the frozen June MLB engine), `pickdesk/` (props desks), `darts/`, and the pick plumbing (publication, market truth, prop quotes) |
| `winners/` | Gary's bets: the bet step, his card, the NFL and NBA boards, late news, the Winners rules (SQL in `supabase/migrations/`) |
| `content/` | What the app and channels show besides the pick: the daily board, the slate, recaps, insights and cards, the diary |

## Each sport's pick, where it lives

| Sport | Game pick | Props | Darts | Winners bets |
|---|---|---|---|---|
| MLB | the frozen June engine `gary/agentic/mlbJuneEra/` (postseason: `playoffQuestion.js`) | `run-agentic-mlb-props.js` | `mlbDartsBoard.js` | Gary's card (`winners/garyCard.js`) |
| NFL | the NFL read `gary/agentic/orchestrator/nflRead.js` (Oct 19 new system) | `run-agentic-nfl-props.js` | `nflDartsBoard.js` | `winners/nflBoard.js` |
| NBA | the NBA read `gary/agentic/orchestrator/nbaRead.js` (Oct 21; `GARY_NBA_SYSTEM=april` = the April 8 prompts) | `run-agentic-nba-props.js` (`pickdesk/nbaPropsDesk.js`) | `nbaDartsBoard.js` | `winners/nbaBoard.js` (from Oct 21) |
| College football | the college read `gary/agentic/orchestrator/ncaafRead.js` (Oct 21) | none, ever | none | `winners/ncaafBoard.js` (from Oct 23) |
| NHL | held and out of the app since Oct 6 2026; its code stays | | | |

## Rules decided by sport name

Many files branch on the sport key (`'basketball_nba'`, `'americanfootball_nfl'`, ...). A list of sports in one place
that a new sport is missing from is a bug that looks like nothing until that sport runs (Oct 20 2026: the NBA opener
was missing from the line-election exemption in `scripts/run-agentic-picks.js` and from the research width in
`gary/agentic/orchestrator/footballResearchPolicy.js`). When a sport starts or changes, search for its key.

## Moving a file

Job entry points live in `../../scripts/` (see its README) and the four `run-*.js` files at the package root; launchd
and the scheduler start them by path, so moving a script means updating `scripts/launchd/` and `scripts/scheduler.js`.
Every relative import must follow a moved file, including dynamic `import()`, `new URL(..., import.meta.url)`,
`vi.mock` paths, template-string paths and source-text tests. The June MLB engine's freeze guard
(`tests/services/agentic/mlbJuneEra.test.js`) counts a relative path by its file name, so a move never reads as a
prompt edit; a content edit still fails it.
