# MLB Props Desk — design spec (founder-approved in chat, Jul 26 2026)

Props get the exact treatment game picks got in the Jul 26 rebuild: ONE
`gpt-5.6-sol` call at xhigh, `tools: []`, over the complete desk — the same
desk game Gary reads (`buildMlbDesk`), plus one new section, THE PROP BOARD.
Founder: "it should be close to how game picks work just for props… if ALL
the factors, context, data are there it wont matter what bets we ask gary to
think about." Props card back stays as it is today (his word).

## What stays (the chassis — audit-hardened, all downstream of generation)

- `run-agentic-mlb-props.js` / `run-mlb-hr-picks.js` entry names + scheduler wiring
- No-stats gate (validated-player pool), odds reconciliation + HARD odds gate
  (provider price only — Jul 5 audit F-5), 2-per-game cap + Gary Specials,
  1-HR-per-game + "MLB HR" lane routing, line normalization + iOS display
  format, slate dedupe, per-day `prop_picks` upsert, EST-day filter,
  scheduler-retry dedupe, `test_prop_picks` test mode
- NBA/NFL/NHL props pipelines — untouched, old path intact

## What dies (MLB-scoped)

- `src/services/agentic/mlbPropsAgenticContext.js` (1,394-line context builder)
- `src/services/agentic/constitution/mlbPropsConstitution.js` (+ index maps to '')
- MLB's use of the sharp framework / `mode: 'props'` orchestrator path
  (the code path survives for other sports; MLB branches before it)

## The new lane — `src/services/pickdesk/propsBrain.js`

- `analyzeMlbPropsDesk(game, playerProps, options)`:
  `buildMlbDesk(game)` → THE PROP BOARD from the same `playerProps` array the
  odds gate verifies against → one Sol xhigh call → `{ picks: [...] }` in the
  CLI's existing mapping shape → statAudit rail (per-pick, one corrective
  retry, failing picks dropped individually).
- THE PROP BOARD: grouped by player, prop keys printed verbatim
  (`hits 1.5 (Over +120 / Under -150)`, one-priced milestones as single
  price). When tonight's lineups are posted, the board carries only players
  in them (starters + probables) — a scratched player's props never render.
  Validated pool for the no-stats gate = the board's players.
- Empty board or lineup-filtered-to-zero → `{ picks: [] }` (pass, no call).

## The prompt surface (zero-based; entry rule same as garyBrain)

System prompt = game Gary's, card sentence swapped for the props surface:

    Today is ${dateLong}. You are Gary — the bettor whose picks publish in
    this app. You write as yourself, never as an AI or a system, and you
    have no favorite team.

    Your training data is old; the desk is current.

    Each prop you take publishes as its own card with its own "Gary's Take"
    — the reasoning is yours. No emojis. Never mention data feeds, tools,
    or missing data.

THE PROPS ASK:

    Pick the prop bets you want from tonight's board — an empty list means
    you pass this game.

    Injuries: an absence already games old is already in the price and in
    the team's recent results; fresh news — today's scratch — is the
    exception.

    Output:

    ```json
    { "picks": [ { "player": "[full name]", "team": "[team]",
      "prop_type": "[key from the board]", "line": 1.5, "bet": "over",
      "odds": "[exact odds]", "confidence_score": 0.XX,
      "rationale": "Gary's Take\n\n[the prose]" } ] }
    ```

    bet is "over" or "under" — "over" for one-priced lines.
    confidence_score (0.50–1.00): how strongly your read beats this price.

## Explicitly out of scope

- Investigative cues / question lists for props — founder asked for analysis
  of the old NBA/NFL cue systems SEPARATELY, no edits from it.
- Card/UI changes (props card back stays as-is), grading changes, other sports.

## Cost

~15 games × one xhigh call ≈ $0.15–0.25/game ≈ $3/day. Founder: quality over
cost, standing.
