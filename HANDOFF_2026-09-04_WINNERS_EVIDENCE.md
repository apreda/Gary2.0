# Gary — Winners and evidence handoff, September 4, 2026

The founder approved these changes in the September 4 Codex conversation.
The canonical checkout is `/Users/adam.preda/Desktop/Gary2.0`; the retired
Documents clone must not launch picks. The marketing launch remains September 13.

## Models and judgment

Game picks use `codex-gpt-6-astra`; props remain `codex-gpt-5.6-sol` at the
founder's explicit correction. Winners review, research and content keep their
existing models. Confidence remains Gary's own judgment. It is neither a
calibrated probability nor a Winners qualification gate. The NBA April prompts
and injury handling remain pinned.

## Winners

`com.gary.winners` runs `gary2.0/scripts/run-winners-board.js --watch` from the
canonical checkout, independently of pick publication. Two readers process
saved original evidence while a separate loop reconciles publications and
releases qualified tickets. Review failures do not hold up public picks.

`winners_candidates` stores the exact original ticket, price, model and evidence.
`winners_decision_events` records review attempts, decisions, admissions and
expiry. Both are private service-role tables. `winners_board` contains immutable
public ticket snapshots. All privileged RPCs require the service role.

First underdogs and marquee games no longer qualify automatically. They can
feature on Home, but admission requires the same exact-ticket review. The
review checks supported decisive facts, sample/date context, the actual line
and price, opposing evidence, and unresolved central assumptions. There is no
blanket recent-stat preference and no favorite/underdog preference.

Six is a ceiling per league and kind, not a target. Prop publication reserves
space for later kickoff groups from the full slate: up to two early, up to four
across early and middle, and six total. Unused earlier places carry forward.
A single kickoff batch can use six. Empty slots may remain.
Published admissions cannot be removed, repriced, or replaced by later choices.

The one-time September 4 cutover preserved six selections already visible under
the prior policy. They carry `legacy-captured-2026-09-04` and are excluded from
new-policy performance comparisons. Do not rerun the capture script to admit
later publications. Older football tickets without saved two-sided cases remain
unreviewable; new NFL/NCAAF publications now preserve the original Pass 1 cases.

Read the prospective comparison with `node gary2.0/scripts/winners-book.js`.
It separates admitted, qualified without admission, rejected, unavailable and
unreviewed tickets, and uses original odds with explicit missing-grade counts.
Both graders use exact board identity from September 4 onward. The cloud grader
offers a read-only verification at
`/functions/v1/grade-results?winners=1&date=2026-09-04`.

## Evidence and notebook

NCAAF player evidence uses dated per-game rows and the active roster. The
known-poisoned season-total endpoint is excluded from active decision paths.
Rows are checked for season, dates, identity and conflicting duplicates; missing
stats remain unknown. Prior-season samples retain their year and team context.
The account-wide provider rate limit still applies.

Research separates reported figures and sources from interpretations, retains
sample context, and identifies repeated evidence and unresolved conflicts.
The MLB/football decision asks three small questions: which supplied facts carry
the decision, what remains an assumption, and what unresolved fact could change it.

The notebook is still a separate experiment. Its v2 autopsies review wins,
losses and pushes; original decision quality and outcome realization are
separate. Exact citations must match the preserved inputs. Legacy hindsight
notes are retained historically but are not fed into new notebook reads.
These changes do not establish predictive skill or profitability; that remains
an empirical question for the prospective record.

## Operations and remaining external dependencies

Pick runs are fresh children and load the current code automatically. The
Winners worker holds its loaded code and needs a restart after worker edits.
Prefer restarting when no candidates are reviewing; interrupted reviews retain
their leases until expiry, and stale completions cannot override newer attempts.

Build 2.25/897 contains immutable Winners loading and the Home underdog feature.
It archived, signed, uploaded and finished processing. Apple shows Complete /
Ready to Submit, associated with the internal Beta group. The archive is
`/Volumes/KINGSTON/GaryApp-Winners-2.25-897.xcarchive`.

Build 896 still has the App Store review slot and is Waiting for Review. The
actual release setting is automatic, contrary to the earlier handoff's manual
release description. The founder has been asked whether to switch it to manual;
no setting or review submission was changed during this implementation.

All four Winners/notebook migrations were applied. The cloud `grade-results`
function was deployed and its read-only Winners verification returned HTTP 200
with the expected exact-ticket flags. The Winners worker was restarted while
no reviews were active and is running from the canonical backend directory.
The combined 210-check suite, ten real PostgreSQL checks, pagination checks,
and Release archive passed; the final prop-accounting refinement passed all
14 accounting tests. No live test picks were generated.

The Fresno State–USC child launched at 4:29:59 PM ET, before the 4:52 PM football
case-storage fix. Its missing stored cases are an in-flight cutover limitation.
The new extractor was verified read-only against its actual original Astra
response (1,195 home-case characters, 1,453 away-case characters). Existing
public tickets were not regenerated or retrospectively rewritten.

College props still depend on reactivating the existing Odds API access. This
work did not change billing or bypass missing live markets.

The local `ios/GaryApp/GoogleService-Info.plist` contains the machine's real
Firebase configuration. Its intentional difference from the tracked redacted
copy must stay uncommitted.
