# September 19: repeated failure investigation

Adam's 3:02 PM game-pick and 3:05 PM Winners screenshots showed two different problems. All seven named college game tickets were saved before their noon kickoffs. Their first candidate records were created between 11:32 and 11:55 AM ET. A failed database coverage read discarded the collector's evidence of publication and revived old scheduler failures. This also recurred around 4:10 PM; those incidents cleared at 4:19 PM.

Winners prop comparison 65 really exceeded its ten-minute lease. It involved twelve candidates across eleven games, so one failed batch generated eleven incidents. Its second attempt completed at 3:10:58 PM; the incidents cleared at 3:11:42 PM. The original attempt's detailed error is not retained in that row, and the old worker errors lacked timestamps. Do not assert a proven cause for that first timeout. The database/API was unavailable around the same time.

## Live corrections

- The existing host-health report retains same-day, league-specific published game IDs across read failures. Successful reads replace that evidence; Eastern midnight clears it. Current read failures remain failures. Previously observed conference exclusions clear older attempts without suppressing a newer failure after the last known slate.
- Winners display mirroring reads only display fields: the live response measured 21,834 bytes instead of roughly 25 MB of unnecessary research. It performs one bulk write instead of a write for every game. Only the coverage loop owns this mirror.
- Reconciliation reads small receipt fields first (17,481 bytes for today's 102 candidates) and loads original desks only for missing/incomplete game records. Complete tickets are not repeatedly recovered and rewritten. Original evidence and published predictions remain immutable.
- Removed the daemon's obsolete per-ticket readers and historical release scans. Current daily game/prop curation and publication continue independently.
- Comparison time is limited by the actual database lease, with one minute reserved before expiry. Database claims have a 30-second response limit and finishes 15 seconds; only the same idempotent finish is retried. No extra model review or scheduled AI monitor was added. Logs now identify the run, attempt, lease and time; worker errors no longer dump multi-megabyte response bodies.

The canonical `com.gary.winners` worker restarted at 4:58:14 PM ET, PID 66729, after a database query confirmed zero active comparisons. The existing host-health/operations jobs read their updated scripts directly. No schema or edge function changed. Native build 2.26 (936) remains the current TestFlight delivery; these are server/worker changes.

## Still open

Postgres restarted at 4:36:45 PM and again 4:57:48 PM ET; earlier investigation also observed a 3:36:52 PM restart. The 4:57 outage produced HTTP 521 across all twelve coverage reads. The code changes remove substantial avoidable load, but memory exhaustion versus another server cause is unconfirmed. The connector lacks server logs and the browser dashboard is signed out. Adam explicitly deferred dashboard sign-in: **do the remaining work now; inspect those logs later**. Do not claim that recurring database restarts are solved or change paid compute without authorization.

At 4:58 PM there were 49/50 eligible NCAAF game picks, with none missing after kickoff, plus 34 distinct college props. Raw daily-pick totals also include earlier out-of-scope entries and are not the eligible coverage denominator. Missing BDL markets remain absent. Some starting-QB, availability and coaching source records remain unresolved, with specific reasons in `host-health-latest.json`.

The 4:33 PM Wire refresh failed for MLB: Claude subscription quota was exhausted and both GPT retrieval attempts produced no completed search receipts. NCAAF refreshed successfully in that pass. A single targeted Wire recovery was run during this investigation; its receipt is in the evidence folder. Do not treat a source-free model answer as retrieved news.

That recovery completed at 5:02:53 PM ET: one sourced MLB item and six NCAAF items published through the personal GPT subscription; the Wire stage is successful again. No paid Claude/OpenAI route was used.

## Additional live failure: MLB player-log window

Braves–Astros failed at 4:58:53 PM for a separate code defect. Both June player-log callers ignored `num_games`, despite the tool promising five by default and fifteen at most. Six recent-form hitter requests sent full seasons (including a 145-row Drake Baldwin season). One tool response reached 1,972,885 characters against the CLI's 1,048,576-character request limit. After fallback, accumulated research exceeded DeepSeek's context too. This was actual input bloat, not a missing sportsbook quote or a judgment about Gary's writing.

Both research and decision callers now use the same existing recent-game selection as the current player-log tool. It keeps every field and all batting/pitching rows belonging to each requested game, selects by actual dates, and retains relief appearances and zeroes. Full-season queries remain full-season. June's prompts, factors, checklist, decision order and opinions are unchanged. The two frozen-file pins change solely for this authorized data-window repair. A flow regression verifies a 145-game source becomes the requested five-game research sample and two-game decision sample, with complete row equality.

The fresh Braves–Astros recovery started at approximately 5:10 PM ET and completed successfully at 5:26 PM: **Braves ML +114**, game `5060089`, was saved in `daily_picks` with June era `224f81048bd5`. A direct database read at 5:26:42 PM confirmed the stored ticket, model and era; the row's update time was 5:26:19 PM. The process exited zero after all twelve research sections and the normal decision flow. Its single-run output is `braves-recovery.log`, and `database-final-receipt.json` contains the saved-record receipt. Future scheduler children load the repair directly; no scheduler interruption was required.

At 5:11 PM Postgres had remained up since 4:57:48. Fifty executions of the new display read averaged 6.29 ms, versus 579.26 ms for the old full-record query observed immediately before worker replacement. This is measured query improvement, not proof that the server restart cause is resolved. GitHub verification for the first fix commit `89f9b1dd` passed all three jobs. Production parity confirmed the running canonical worker, deployed functions and pushed main; only the three preserved unrelated working-tree changes keep its overall flag non-green.

The final 5:26:42 PM database receipt still showed the same 4:57:48 PM server start, about 29 minutes without another restart. Winners prop comparison **67**, created at 5:10:21 PM under the updated worker, completed on its first attempt at **5:11:17 PM** with no error. The latest three comparisons were all completed. These are live recovery receipts; the underlying server restart diagnosis remains deferred.

Verification: after the final scope-memory and player-log changes, the complete backend suite passed 409 files / 4,388 checks. GitHub run [35469680261](https://github.com/apreda/Gary2.0/actions/runs/35469680261) for `095503c3` passed backend/edge, web/types and Apple checks. These are development regressions, not an AI approval layer for picks. Evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/backend-failures-2026-09-19/`. Preserve unrelated `deno.lock`, the private uncommitted GoogleService plist and the NFL audit folder.
