# Home headline scores and TD/HR totals

Adam reported the empty right column on the SMU/Florida State headline card.
The score cache stored `displayFinalScore` (now `SMU 27 · FSU 24`) while the
box renderer still parsed a numeric away-home pair. This hid both scores and
the nested stat row, including on MLB cards with valid stored HR data.

The card now prefers its recap's structured away/home scores, with a numeric
fallback keyed by date, league, matchup and original ticket. Conflicting
duplicate results stay unavailable. The column labels the score FINAL and
shows TDs for NFL/NCAAF or HRs for MLB, including measured zeroes.

The active local football grader's recap writer never persisted `box`, and
the scheduled recap backfill skipped already-written stories. Both now store
the same deterministic box and retry missing stats without calling a model
or rewriting the story. Scores remain present when stats are unavailable.
The shared loader handles college order/score-value fields and NFL cursor
pages/play-type fields separately, checks exact game identity and final score,
and rejects incomplete or duplicate pages. It counts scoring events, including
return TDs, using score changes between scoring events; ordinary play snapshots
can temporarily reset to zero or show an upcoming score early.

Production repair: all **38 NCAAF recaps from September 4–7** have final scores
and complete TD totals. Anonymous readback checks all 88 recaps in that window:
only those 38 box fields changed; headlines, prose, bullets, picks, results,
dates and other fields match their original snapshots. SMU is **27–24, 6 TDs**.
A live NFL provider check for game 1393562 returns **PHI 7, BAL 24, 4 TDs**.
No game generation, grading, customer-book settlement or cloud deployment was
invoked for this repair. Scheduled local workers launch fresh scripts from
the canonical checkout, and the production box-only CLI executed successfully.

Verification: 330 focused backend/result-contract tests passed, followed by
33 tests after hardening the scoring ledger (overlapping suites). Seven initial
recap/native suites passed 36 checks, including executable Swift score mapping,
box decoding, football/baseball rows, zero/missing values, dated-ticket isolation,
and full/rolling Home request ownership. Current simulator build/visual evidence
is recorded in the workspace evidence directory below.

The production audit confirms canonical worker paths and no unpushed commits
at its snapshot. Global parity is not green: concurrent shared work includes
the unrelated new `mlb-live-batting` function, and the required private local
Google configuration remains different from the redacted template. Do not
interpret this task as verification or deployment of those separate changes.

Evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/headline-score-fix-2026-09-08`.
The native change still requires a newly built app; a data repair alone cannot
change an installed binary's numeric parser. This task does not claim an
App Store or TestFlight upload. Preserve the separate release owner's lane.
