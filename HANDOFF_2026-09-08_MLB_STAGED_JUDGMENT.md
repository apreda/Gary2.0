# Complete MLB judgment process — September 8, 2026

The founder authorized completion, testing, commit/push to main and production
deployment of the remaining proposal before today's MLB picks. This extends
the earlier six-change baseline in `HANDOFF_2026-09-08_MLB_GARY_WINNERS.md`.
Work belongs to the canonical `/Users/adam.preda/Gary2.0` checkout. Concurrent
launch, native and Hub work is owned by other tasks and must not be staged here.

## What new production MLB decisions do

1. Gary receives the original game desk, existing research and only completed
   prospective memory available before this new read. Odds remain visible,
   following the founder's clarification. The existing model stays in the
   same conversation throughout investigation, commitment and card writing.
2. After investigating the matchup, Gary records the outright winner and exact
   allowed win/cover outcome he expects. He gives concrete opening, middle,
   finishing and offensive expectations, their supporting evidence and an
   observable event that would contradict each. The strongest opposing case
   and uncertain assumption are recorded too. This initial record must be
   durably acknowledged before the next stage.
3. Up to two consequential factual questions go to the existing researcher,
   with a separate three-minute limit and time reserved for a final decision.
   Questions concern answerable facts, not demands to predict performance.
   Unavailable answers remain explicitly unavailable. Gary then tests an
   alternative game path and records whether his judgment survives. A changed
   side or ticket requires an explicit change in his baseball reasoning.
4. Gary separately endorses or declines the same priced ticket. Price cannot
   select a different side or market at this step. A decline remains an
   ordinary game call with explicit `price_endorsement` metadata and is excluded
   from Winners. Gary is instructed to explain the decline in the rationale;
   the current validator does not guarantee that prose disclosure. The final
   card is checked against the recorded side, market, line
   and odds. Formatting cannot silently substitute another wager.
5. Confirmed publication receives its own durable receipt. Every stage and
   original source snapshot is private and immutable; server timestamps and
   chained hashes establish sequence and pregame timing. Whole-brain retries
   have distinct UUIDs. Uncertain write responses replay identical payloads.
   The Winners worker can recover a publication/receipt or desk-mirror gap
   from the actual saved public ticket and its immutable source ledger.
6. Sol checks factual eligibility. Gary compares endorsed, factually valid
   original picks for Winners with the existing chronological capacity of
   2/4/6 and maximum six. Neither confidence alone nor favorite/underdog quotas
   select the board. SQL checks the complete original ledger, exact ticket,
   unchanged sources, current slate, capacity and pregame completion.
7. After the original ticket is settled by the existing grading process,
   memory reviews those exact prospective expectations against official final
   game evidence. Pregame factual support and actual realization are separate
   findings. Wins and losses receive the same review. Original claims cannot
   be rewritten, non-unknown findings require matching source excerpts, and
   the reviewer is instructed to assess the evidence without prescribing a
   betting strategy from the result. Schema and text checks constrain that
   output; they do not prove the meaning of every sentence.

The policy names are `mlb-judgment-v2`, `mlb-conviction-v4` (factual schema 4)
and `mlb-expectation-v1`. Prior v1/v3 records remain separately accountable.
The existing -179 moneyline cap and pre-read run-line assignment remain:
predicting a favorite wins does not establish -1.5, and +1.5 need not mean
predicting an outright win. There is no odds-blind or calibrated-probability
claim. Today's first games have no retrospectively manufactured expectations.

## Operational limits and verification

The scheduled results process handles at most two expectation reviews within
a shared six-minute deadline, scanning the full new-policy backlog. Model
calls have at most three minutes each. A private attempt queue leases work,
records failures and retries with cooldowns; never-attempted games and then
least-recently attempted due games get attention. Completed reviews stay
immutable. The main read's memory lookup is bounded; unavailable memory is
explicitly recorded without substituting the old notebook. Prompt memory is
limited by complete reviewed games and a 20,000-character budget; full original
review evidence remains private. No new public picks, grades or notifications
are created for verification.

The model's research, judgment and card remain one session. The integration
test specifically checks that all pending requested tool responses arrive
before a forced transition can record a judgment. Both early formatted output
and the final formatting fallback retain the same recorded ticket.

## Deployment and verification receipts

- Applied `20260908155113_mlb_durable_judgment_ledger` at 15:51 UTC.
  Local filename and isolated-test loader match the Supabase-generated version.
  Four new private tables have RLS and service-only access. Security-advisor
  comparison introduced no warnings; the four INFO notices reflect the
  intentional absence of end-user policies on private tables. See
  https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.
- Final stable backend scope: **3,298 tests / 275 suites passed**. The earlier
  all-source run had **3,441 passes and seven failures** while other tasks
  edited native files: six native assertions/compiler timeouts and one MLB
  receipt-normalization test loaded before its fix. The final MLB contract
  rerun passes **155 tests / seven suites**, including **85 real PostgreSQL
  checks** (22 new and 63 existing), receipt recovery, same-session integration,
  memory leases and current runner behavior. **217 edge tests passed**.
  Native failures belong to the concurrently changing native release and are
  recorded in the full log; this task makes no native source changes.
- Live database readback before runtime restart: zero judgment runs, events,
  memories or active reviews/selections, 15 scheduled MLB games with first
  kickoff 18:35 ET, and all 12 historical Winners board rows preserved.
- Additional market-data guard: a partial original MLB menu cannot force Gary
  onto the only priced club. It returns a market-unavailable result before
  scouting/model work; later scheduled market refresh can retry without
  wasting a whole-brain cascade on missing prices.

Verification logs: `/tmp/gary-mlb-complete-backend-stable-20260908.log`,
`/tmp/gary-mlb-complete-final-contract-20260908.log`,
`/tmp/gary-mlb-complete-edge-20260908.log`. The earlier mixed working-tree run
is `/tmp/gary-mlb-complete-backend-20260908.log`.

## Source and production readback

Implementation commit **1c96ce0e** is pushed to `origin/main`. The first verified
new-policy Winners restart was **2026-09-08T15:54:31.296Z**, PID **36403**, from
the canonical backend on Node **22.23.2**, logging `mlb-conviction-v4`. The
scheduler remains PID96216 and launches fresh pick children from that checkout.
The live-config read confirms **Astra**, **-179** and era **4294d3b5a7d2**. Main
memory reads and the bounded postgame worker both successfully read the new
production schema; their zero-row result is expected before any new-policy
pick has been made. No model review or public QA write was needed for this check.

The full read-only production checker verifies the new era, canonical folder,
running worker, no unpushed commits and all 20 existing edge deployment times.
It exits 1 for unrelated working-tree changes from concurrent Hub/native work
and the existing private Firebase configuration exception. None belongs to this
MLB deployment. This is an explicit shared-workspace exception, not a globally
clean release claim. The earlier broad run's native failures were sent to the
native release owner; this task leaves those files untouched.

Final reporting verification found that the CLI did not fetch the new journal
field. Its narrow JSON projection now includes the saved journal, so complete
v4 decisions cannot be mislabeled unavailable. JSON-mode model diagnostics go
to stderr, preserving parseable stdout. **42 final reporting/model/integration
tests pass**, and the production read-only report returns valid empty arrays
before today's picks. Logs: `/tmp/gary-mlb-complete-book-20260908.log`,
`/tmp/gary-mlb-complete-live-book-20260908.json`, and
`/tmp/gary-mlb-complete-production-20260908.log`.

The first scheduled MLB decision window is **17:05 ET**, for the **18:35 ET**
first game. Upcoming fresh children will use v2 and v4. The first natural
publication and first completed expectation memory remain future observations;
there is no measured win-rate or profit improvement claim from fixture tests.

The reporting follow-up is pushed as **f2976edb**. After that push, with no
active reviews or selections, the Winners worker restarted at
**2026-09-08T16:02:41.273Z**, PID **45706**, logging `mlb-conviction-v4`.
Its stderr remains unchanged from September 6. The final read-only production
check again confirms the canonical scheduler, era **4294d3b5a7d2**, all 20 edge
deployments, no unpushed commits and 0 started games missing picks. Its sole
parity failure is the shared working tree (32 unrelated changes at that
snapshot). Final log: `/tmp/gary-mlb-complete-production-final-20260908.log`.

## Independent identity review follow-up

Independent review found two missing database identity checks, with no observed
bad records. Live migration **20260908161624_mlb_original_evidence_identity_guards**
now binds the Winners candidate's complete ordered tool-response array to the
immutable original source. Altered, omitted or injected responses cannot enter
the comparison or survive a change between selection and admission.

Postgame snapshot `game_pk` must be an exact JSON copy of the original source's
`gamePk ?? game_pk ?? mlb_game_pk ?? null`. A manufactured ID cannot bypass the
exact scheduled-start check when the original source lacks an official ID.
Known original official IDs continue to support a changed scheduled start for
the same identified game. This prevents same-date, same-team doubleheader
substitution. Function body hashes match the tested migration exactly; private
grants and security modes are unchanged, with no new security advisor findings.

The related formatter gap is also closed: after the staged judgment completes,
every card-writing and correction turn uses the recorded sources and ticket.
New tool or researcher requests fail before execution; final evidence is checked
against the frozen original tool-response list rather than silently dropping
later information. A failed attempt uses the existing whole-brain recovery.
The resulting era is **343f7f327a80**.

Final consolidated verification: **1,075 tests in 75 suites pass**, covering
orchestrator, agentic, pickdesk and diary paths. This includes **38 real
PostgreSQL ledger cases** with direct tool-evidence tampering and official-ID,
null/type, alias and doubleheader cases, plus the existing database contracts.
Log: `/tmp/gary-mlb-identity-final-contract-20260908.log`.
