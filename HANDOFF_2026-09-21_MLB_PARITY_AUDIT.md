# MLB parity audit — NFL and NCAAF against the reference implementation

September 21, 2026. Adam's rule of the same day: MLB is how a Gary system is
supposed to work, sound and display. A feature asked for in football that MLB
already has is a port of MLB's system with the sport's nouns swapped, never a
new design. This is the inventory that rule needs: every MLB system, what
football has today, and a verdict. It was read from source on September 21;
nothing here was run. It is a worklist, not authorization. Items marked
**port** wait for Adam's go, one at a time or batched as he chooses.

Verdict key: **matches** (same system, nouns swapped) · **ported today** ·
**port** (MLB has it, football rebuilt it or lacks it) · **sport-specific**
(a stated reason it does not translate) · **verify** (not established from
source alone).

## 1. The game decision

| System | MLB | NFL | NCAAF | Verdict |
|---|---|---|---|---|
| Decision flow | June engine, frozen at `c27db5f0` (`mlbJuneEra/`): pass 1 investigation, cases, pass 2.5 decision | Single-answer flow `36fec924`: "What's the best bet at the posted number and price, and why?" | Legacy case path in `agentLoop.js` (`isNCAAFSport` retains cases), Sol high | **sport-specific by authorization.** Adam approved the NFL single-answer design on September 21; the June lane is frozen. Do not port either onto the other. |
| Researcher | on | on (weekly football research, `38e13f0f`) | **off** (`researcherOn = !isNCAAFSport`) | **port.** College decides from the desk alone. This is the "NCAAF has no researcher" flag from September 18. |
| Desk layout | Three buckets in this order: THE MATCHUP, THE MARKET, THE TEAMS (`mlbDeskLayout.js`, founder GO Sep 2 and Sep 9) | Flat, long desk: game context, injury report, articles as written, current state, baselines, team stats, betting context last | Flat desk (`ncaaf.js`) | **port the order.** MLB puts tonight's game first and the price right behind it; football buries BETTING CONTEXT at the end of a 2,000-line desk. Content stays; the bucket order is the port. |
| Injury labels with market meaning | FRESH / ESTABLISHED / SP SCRATCH with what each means for the number, plus the ESTABLISHED INJURY RULE | Tags were FRESH / STALE with no market meaning and no rule | Not audited today | **ported today (NFL).** Constitution now describes the real FRESH/STALE/IR/UNKNOWN tags with the NBA/MLB market meaning, the ESTABLISHED INJURY RULE, and Adam's two-way line (an absence is evidence about a roster, not a side). NCAAF: **port** on go. |
| Market awareness (overreaction, underreaction) | June text | NBA-derived awareness + Jev context (`3bcf68c8`) | none | **verify** whether college should carry it; one-game weekly samples and 65-game slates argue for the same text without the Jev call. Adam's call. |
| Jev before the decision | none (June lane frozen) | `nflMarketAssessments.js`, now with the absences channel | none | **sport-specific** for MLB (frozen). NCAAF: Adam's call. |
| Prompt fingerprint | `junePromptSha.js` | `footballPromptSha.js` (shared with NCAAF) | shared | **matches.** |

## 2. Props

| System | MLB | NFL | NCAAF | Verdict |
|---|---|---|---|---|
| Desk brain | `propsBrain.js`: desk, prop-model screen, sheets, Jev, Gary; CORE + HR | `footballPropsDesk.js`: desk, players shelf, game call, board, sheets, Jev, Gary; CORE + TD | `ncaafPiggybackProps.js`: one prop after the game pick, Sol | **matches (NFL).** Same chassis, same card contract, HR = TD fun lane. NCAAF is **sport-specific** by Adam's one-prop rule. |
| Prop-model screen | `propModel.js` screens the board before Gary (`screenBoard`, `lineupRates`, `pitcherProfile`) | no screen; the board goes to Gary with sheets | no screen | **verify.** The MLB screen is a Sep 2 system; football never had it. Adam decides whether a football screen is wanted or whether the players shelf is the football answer. |
| Standard-market corroboration and -179 floor | `standardPropMarkets.js` | same | same (piggyback) | **matches** (`7e1315dc`). |
| Live grading | cloud `grade-props` + Mac worker | Mac worker only | Mac worker only | **port** cloud grading to football, or accept the Mac dependency in writing. The Sep 21 handoff already names this. |

## 3. The pick card's scout page (iOS)

MLB order on the page (`ScoutTrio.swift`): THE ARMS, THE NOTEBOOK, THE BIG
NUMBERS, head-to-head, PLAYER INTEL, then `MLBGameIntelView` (lineups, THE
READ, MORE INTEL). Football order (`FootballGameIntelView.swift`): THE
QUARTERBACKS, news card, big-numbers rail, head-to-head, PLAYER INTEL,
availability card, MORE INTEL, THE SWEAT, line ladder.

| Section | MLB | NFL | NCAAF | Verdict |
|---|---|---|---|---|
| The two starters | THE ARMS: Gary's two sentences from one batched voice call on the board row (`attachArmsTakes`), plates from the starters | Was a deterministic stat template (`quarterbackWriteup`) joined per starter | Deterministic sentence + a note from dated reporting | **ported today (NFL).** `attachArmsTakes` now writes NFL rows from the day's quarterback rows with the same contract, cache and retries; the card reads `arms_take` like MLB. NCAAF keeps its reporting-backed reads until Adam says otherwise. |
| The notebook / news | `ScoutNotebookSection` → `ScoutNewsCard` off the wire | `ScoutNewsCard` off the wire | same | **matches.** |
| The big numbers | `ScoutBigNumbersSection`: lane rows, shape rows, `line-move`, the Gary number | `ScoutBigNumbersRail` with lane rows, shape rows, the Gary number | same as NFL | **verify** `line-move` parity; football's board row carries `spread`/`ml_*` but no `ml_open_*` stamps (`attachRailExtras` is MLB-only). Likely **port** the opening-line stamp. |
| Head-to-head | `GameH2HSection` off `headToHead.js` | same view off `footballHeadToHead.js` | same | **matches.** |
| Player intel | `PlayerIntelSection` | same | same | **matches.** |
| THE READ | `MLBGameIntelView` "THE READ" | none | none | **verify** what THE READ is fed by today (hub judgments are disabled on purpose); if it is live for MLB, **port**. |
| Lineups / availability | lineup card (`LINEUP NOT CONFIRMED YET`) | `FootballAvailabilityCard` with practice report and wire | same, coverage-verified | **matches** in role; sport-specific in content. |
| Line ladder | none | `LineLadderCard` | same | **sport-specific** (football has a line history feed; MLB has opening stamps). Fine. |
| Series | season series on the board row | none | none | **sport-specific** (one meeting a season, or two for divisional). Fine. |

## 4. The Hub (insight computers)

MLB computers (`insights/computers/`): streaking, heatCheck, coolingOff,
bullpenFatigue, closerWatch, firstInning, garyHrThreats, parkWeather,
platoonEdge, regressionWatch, hitterRegression, restFatigue, returnWatch,
runningGame, starterForm, starterTeamRecord, theSweat, owned, beneficiary,
headToHead, ballparkShift.

NFL computers: footballAvailability, footballPracticeReport, footballQbWatch,
footballDefensiveEdges, footballTeamEdges, footballMarketEdges,
footballMismatch, footballRestSpacing, footballSituational, footballStandings,
footballHeadToHead, nflFantasyEdges, nflNextSlate, afterGary. NCAAF:
ncaafAvailability, ncaafQbWatch, ncaafStandings, ncaafNextSlate, plus the
shared football computers that gate on `ncaaf`.

| MLB lane | Football analog | Verdict |
|---|---|---|
| starterForm / starterTeamRecord | footballQbWatch (identity + line), no team-record-with-starter lane | **port** the starter-team-record idea only if a weekly sample supports it; **verify** with Adam. |
| restFatigue | footballRestSpacing | **matches.** |
| returnWatch (players back from absence) | none | **port.** A returning starter is the same story in football, and the availability lane already knows the report dates. |
| streaking / heatCheck / coolingOff | none | **sport-specific.** One game a week; a "streak" is the standings lane. |
| theSweat | FootballSweatSection | **matches.** |
| headToHead | footballHeadToHead | **matches.** |
| owned / beneficiary (fantasy) | nflFantasyEdges | **matches** in role. NCAAF fantasy was deleted on purpose (Sep 4). |
| parkWeather / ballparkShift | none | **verify.** Weather for outdoor football is a fan fact; the desk carries it, the Hub does not. |
| bullpenFatigue / closerWatch / firstInning / platoonEdge / HR threats / regression | none | **sport-specific.** No football analog. |
| afterGary (NFL weekly review) | MLB has the daily recap instead | **matches** in role. |

## 5. Content and social

| System | MLB | NFL | NCAAF | Verdict |
|---|---|---|---|---|
| Game recap | `gameRecap.js` / `recapBox.js`, daily recap per sport (`2fc6464e`) | same lane | same lane | **verify** the recap voice is one contract across sports; the code is shared. |
| Social auto-post | every MLB game pick | every NFL game pick (Sep 16) | audience selection | **sport-specific** by the 65-game slate. Fine. |
| Winners board | reviewer + first dog + big game, `winners_reviews` | same definition | same | **matches.** |
| Wire | shared | shared | shared | **matches.** |

## 6. Data and operations

| System | MLB | NFL | NCAAF | Verdict |
|---|---|---|---|---|
| Board row (`tomorrow_board`) | full: starters, series, rail extras, park, arms take | slate + lines + arms take (today) | slate + lines | **port** `ml_open_*` stamps (section 3). Everything else is baseball. |
| Starters source | `mlb_field_lineups` (pg_cron) | BDL roster depth via `footballQbWatch` rows | dated reporting via `ncaafGameContext` | **sport-specific** sources feeding the same card. Fine. |
| Grading infrastructure | cloud + Mac | Mac | Mac | see section 2. |
| Scheduler shape | per-game workers, era pins | same, football = MLB shape (Aug 24 law) | same | **matches.** |

## 7. Worklist, in the order I would take it

1. **NCAAF researcher** (section 1). The biggest single gap in what Gary reads.
2. **Desk bucket order for NFL and NCAAF** (section 1): THE MATCHUP, THE MARKET, THE TEAMS. Content unchanged.
3. **NCAAF injury framework** (section 1): the same constitution text as NFL's today, with the college tags.
4. **NCAAF Quarterbacks in Gary's voice** (section 3): the NFL port again, nouns unchanged.
5. **Opening-line stamps on football board rows** (sections 3 and 6).
6. **returnWatch for football** (section 4).
7. **Cloud grading for football props** (section 2).
8. The **verify** items, each a one-line question to Adam: prop-model screen for football, THE READ, weather in the Hub, market awareness text for college.

## Today's ports, for the record

- `attachArmsTakes` in `tomorrowService.js` writes NFL rows from the day's
  `insight_connections` quarterback rows: same contract shape with quarterback
  nouns, one batched call per league, same exact-input cache, same partial
  sentence when one starter is named, same retries. A failed quarterback read
  leaves NFL takes for the next board refresh.
- `FootballGameIntelView.quarterbackTake` reads the board row's `arms_take`
  for NFL, exactly as `ScoutArmsSection` does for MLB. College is unchanged.
- NFL constitution: real FRESH/STALE/IR/UNKNOWN tags with market meaning, the
  ESTABLISHED INJURY RULE, and ABSENCES AND THE NUMBER (Adam's two-way line).
- NFL researcher: names each absence with report date, role in the recent
  sample, replacement, and whether the last game was played without him.
- Jev NFL market assessment `v2`: an absences question per team over the
  desk's injury report; its answer rides the same context block.

None of this is built into a TestFlight build or observed in a scheduled
production decision yet. The paired replays of September 20's four games
(Jev on and off) are recorded in `HANDOFF_2026-09-21_JEV_REPLAYS.md` when
they finish.
