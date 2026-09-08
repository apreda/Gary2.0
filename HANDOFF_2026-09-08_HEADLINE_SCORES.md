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
and full/rolling Home request ownership. Release simulator build 917 passed;
the completed build's three affected native source hashes match this fix.
An isolated signed-out simulator shows FINAL, SMU 27, FSU 24, TDs 6 on the
reported card. The rendered accessibility tree also confirms all five MLB
cards have final scores and HR totals (Mets 9, Marlins 4, HRs 1, for example).
`headline-final.png`, `headline-accessibility.txt`, and the source/binary parity
receipt are saved in the workspace evidence directory below. Horizontal input
did not advance the simulator carousel, so the MLB visual check is limited
to its rendered accessibility output and the executable Swift tests.

The final production audit confirms canonical worker paths, healthy Winners
workers, all 21 edge functions deployed, and no unpushed commits at its snapshot.
Global parity still reports concurrent shared uncommitted work, including the
required private local Google configuration exception. No task-owned source
remains uncommitted. Do not interpret this task as verification or deployment
of those separate changes.

Evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/headline-score-fix-2026-09-08`.
The native change still requires a newly built app; a data repair alone cannot
change an installed binary's numeric parser. This task does not claim an
App Store or TestFlight upload. Preserve the separate release owner's lane.

## Follow-up: balanced Home spacing

Adam approved tightening the gap below the featured matchup card after comparing
it with the gap above. `homeSheet` now draws its neutral divider as an overlay
within the existing 18pt page gap. Previously the standalone rule contributed
another 18pt gap plus its 7pt padded height, leaving 43pt below the matchup.
Both card-to-card gaps are now 18pt; the divider, board and league actions stay.
The decorative divider ignores input and is hidden from accessibility.

Swift parsing and diff checks pass; the two existing Home rendering/football
wiring suites pass 55 tests. No new simulator build or screenshot is claimed for
this spacing-only follow-up; the earlier 917 image predates it. Include the
updated `HomeView.swift` in the next native candidate. The production audit
again confirms worker paths and all 21 deployed edge timestamps, with a global
warning for shared uncommitted work and the preserved Google config exception.
Audit receipt: `home-spacing-2026-09-08/production-truth.log` in the workspace.
