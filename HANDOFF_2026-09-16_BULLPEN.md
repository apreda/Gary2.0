# MLB bullpen evidence repair — September 16, 2026

Adam explicitly authorized fixing all findings from the bullpen audit. This is a scoped exception to June's freeze: bullpen data, interpretation instructions, delivery, freshness and original-evidence retention. The June constitution, decision passes, starter xERA treatment, model order and account policy remain unchanged. No historical pick or research record was rewritten.

## Active path

`scripts/run-agentic-picks.js` runs `agentic/mlbJuneEra`. That engine previously used three capped/inconsistent bullpen readers; the newer shared `penArms` implementation was not the active game-pick reader. The three June tokens now share `src/services/bullpen/snapshot.js`, and the complete record is preloaded into both Gary's scout and the research assistant's scout. The dormant/shared reader and Hub display are separate consumers; this repair targets the active MLB game decision path.

## Coverage

| Human-observable information | Implementation |
| --- | --- |
| Current personnel and roles | Dated active roster; every pitcher retained, including failed/empty MLB logs; transactions; rotation and uncertain roles labeled |
| Actual relief appearances | Box pitching order; zero-out and five-plus-inning relief retained; early-exit starters and position players separated |
| Workload and recovery dates | Pitch counts, prior 1/2/3/7/14/30 calendar-day totals, full off-days, consecutive calendar days, same-day work and doubleheaders |
| Elapsed recovery | Pitch timestamps only when tracking is complete; otherwise unknown; tracked resumed-game pitches use actual pitch dates |
| New arrivals | Affiliated-minor logs separately queried by singular sportId 11–16; same-day work requires a verified completed game; excluded from MLB quality totals |
| Recent and longer-term performance | Last five outings; relief-only last seven/30 calendar days and season; ERA, WHIP, K/BB, HR, inherited runners, saves/holds and runner control |
| Manager deployment | Entry inning, score, outs and runners; leading/tied/trailing and late entries; historical multi-inning use and next-day returns |
| Stuff, command and contact | Newest three tracked relief outings versus prior tracked outings, by pitch type: usage, velocity, spin, movement/release coordinates, strikes, swings/whiffs and hard contact |
| Opponent context | Confirmed batting-order handedness, observed recent L/R plate appearances and named batter/pitch-type exposure against the opponent |
| Team relief versus available depth | Actual sampled team relief labeled separately from today's roster; departed pitchers do not become available arms |
| Relief demand | Conditional three/five/seven-inning starter-exit scenarios and remaining outs; historical maxima do not establish today's capacity |
| Upcoming pressure | Upcoming schedule, game times, announced starters and transactions |
| Availability and restrictions | Separate dated reporting search for both teams, including warm-ups, soreness, role changes and rehab restrictions; preserves URLs, reported claims, forecasts and unknowns |
| Freshness and audit trail | Pregame cutoff, source URLs/collection times, request gaps, three-minute scout cache, saved snapshot and exact research/decision tool responses |

## Interpretation and boundaries

Low pitch counts, an idle day and IL activation do not establish clearance or availability. September 13 and 15 are not consecutive days. The research checklist and Gary's system instructions now state these distinctions explicitly. Unreported warm-ups, restrictions and health remain unknown.

Pitch/entry/platoon detail covers at most 14 days/20 completed games. Recent platoon observations are not season splits; pitch-coordinate fields preserve provider units. Ambiguous mid-PA changes are omitted from pitch detail while box workload remains. Missing season logs never turn recent boxes into a claimed full season. Work without complete timestamps retains official dates and unknown elapsed hours. Historical manager use is evidence, not a promised assignment.

This is a pregame snapshot, not a continuous live monitor. After-start/final target games are refused. New information requires a new analysis; published tickets remain immutable. Unavailable core roster/schedule/game identity stops scouting with a non-model-retryable required-data error. Optional source failures remain visible.

The reporting search uses the existing `groundingSearch` transport/account/cost policy without the general breaking-news wrapper's 48-hour rejection, which hid older ongoing restrictions during the live check. Older announcements require dates and subsequent-change checks. Search output remains attributed findings, not independent verification.

## Delivery and storage

Tool responses are retained outside working-context pruning. A regression test also exposed pruning discarding unsent responses; the active June loop now queues them independently. Research receipts are recorded after successful delivery. Early and normal decision exits preserve research and decision receipts. `originalGameEvidence` copies these and the bullpen snapshot into the existing JSONB envelope. No migration is needed.

The June era hash includes all five shared bullpen modules. Only authorized June text pins changed; the remaining frozen pins pass.

## Verification

- Backend: **398 files / 4,343 tests passed**.
- Edge helpers: **242 tests passed**.
- Web: **78 files / 890 tests passed**; Next/TypeScript checks passed.
- Focused fixtures cover zero-out/long relief, starters, position players, failed/empty logs, off-days, doubleheaders, future results, resumed dates, same-day minor work, ambiguous pitcher changes, scouting, reporting, pruning and both real decision exits.
- Read-only Brewers/Pirates check (game 823334): **28 active pitchers**, 20 relief/uncertain candidates, 166 successful source reads, no request gaps. Call-ups' minor work appeared separately from MLB performance. All three active tools returned the complete record. Both reporting searches returned dated links and explicit unknowns.
- Final live snapshot cutoff: `2026-09-17T02:47:30.893Z`; collection completed `02:49:58.037Z`; era **163874bf45e9**. Stat collection alone took about three seconds; complete reporting took about 147 seconds. No test picks were published.
- A final optional-box failure regression was then repaired and verified: **51 focused tests passed**. Final-release read-only source smoke at `02:55:34.935Z` again returned 28 pitchers and no source gaps, under release era **6221ac75e804**.

Exact receipts and test logs are in the task workspace's `bullpen-fix-2026-09-16/` folder.

## Production

Scheduler PID 8541 launches fresh pick children from `/Users/adam.preda/Gary2.0/gary2.0`. No scheduler edit/restart is required. The next new MLB child reads this engine and era. September 16's 15/15 stored picks retain their original eras; none proves a new-engine publication until a fresh pick is stored.

`production-truth.js` confirms the scheduler path, model overrides, Winners worker and 15/15 coverage. Its broader edge/support checks remain unavailable without Supabase CLI authentication. A connected Supabase timestamp check found 16/22 local edge functions current and six baseline timestamp mismatches: book-slip-scan, create-checkout, delete-account, engagement-sheet, social-auto-post and stripe-webhook. Timestamps alone do not establish source drift. No edge function was edited here; do not claim a globally green deployment audit.

The private local `ios/GaryApp/GoogleService-Info.plist` remains untouched and uncommitted.
