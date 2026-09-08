# MLB judgment and Gary's Winners selections — September 8, 2026

The founder authorized all six changes in the MLB picks conversation. Work is
in the canonical checkout `/Users/adam.preda/Gary2.0`, directly on main.
This handoff supersedes the September 4 admission design for new MLB games.
It does not change other sports, props, the pinned NBA prompts, injury handling,
the notebook experiment, formula history or existing immutable publications.

## Six changes

1. **Actual outcome judgment.** The MLB opening asks Gary to read the whole game
   and choose the win or cover outcome he expects. The board-first mispricing
   assignment, MLB implied-probability comparisons and inherited research
   price/perception task are removed. The final "What's your bet, and what are
   the reasons why?" question, original sources and visible available prices
   remain. No favorite/underdog quota or automatic baseball conclusion is added.
2. **Playable original tickets.** The existing -179 moneyline limit remains.
   Above-cap games are assigned -1.5/+1.5 before the read; an outright-win call
   cannot silently become a run-line bet. The factual reviewer also checks the
   exact original market and cap, and never rewrites the ticket.
3. **Gary chooses Winners.** Sol establishes factual eligibility. The configured
   primary game brain (currently Astra) compares the eligible original picks,
   their full original rationale, both cases, research briefing and factual review. It records a complete ranking,
   actual expected ticket outcomes, and reasons why each is stronger or weaker.
   Confidence numbers, payout and rhetorical price justification do not decide
   admission. Zero selections is permitted; six is the existing daily maximum.
4. **Factual review.** `mlb-conviction-v3` distinguishes factual premises from
   uncertain forecasts. Known decisive contradictions and wrong-ticket arguments
   matter; ordinary sporting uncertainty and an absent rhetorical rebuttal do
   not reject a pick. One bounded factual clarification can resolve a specific
   missing fact. Original findings and separately observed supplemental sources
   are retained; later review completion cannot validate future-at-read news.
   Candidate, public pick and version-2 original evidence must identify the
   same game, sides, date, start, price and decision before any model call.
5. **Planned publication.** The slate's chronological thirds reserve up to 2/4/6
   places, with unused earlier places carried forward. A single kickoff batch
   may use six; two batches reserve four places for the later batch. At T-25,
   the worker waits for pending or missing same-batch candidates until T-10.
   Gary compares ready future tickets in that chronological group. A separate
   loop prevents this call from blocking factual readers or other leagues.
   Atomic publication checks original snapshots, current slate, capacity,
   attempt lease and pregame completion. Published tickets remain immutable.
   A completed candidate set cannot be sampled repeatedly to fill a quota;
   genuinely new eligibility/evidence may cause a new comparison with prior
   decisions supplied. Failed infrastructure/format attempts are bounded to two.
6. **Prospective accountability.** `scripts/winners-book.js` now includes all
   public MLB tickets, including missing queue records. It separates admitted,
   considered-not-selected, factual blocks, unavailable reviews, and incomplete
   or failed comparisons. Every selection window stores original inputs,
   reasons, attempt errors, models and capacity. Outcomes use exact ticket
   identity and original prices. Pick policy/model/prompt eras stay separate;
   failed comparisons never count as Gary deciding against a pick.

## Policy and runtime

New MLB decisions carry `mlb-judgment-v1`, loaded with the decision prompts.
Only these original decisions receive `mlb-conviction-v3`; no historical pick
is retrospectively relabeled. The new June prompt era is `bfda39b6e5c2`, replacing
`9832b2250d71`. The migration stops legacy automatic MLB game admission for dates
from September 8. Other lanes and earlier dates keep their previous function.

The additive `winners_selection_runs` table and its claim/finish functions are
private, service-role only, RLS enabled, invoker functions with an empty search
path. The existing public board shape and client loading/grading contract stay
intact. No edge-function, web or native deployment is needed for this policy.
Fresh pick children load the prompts; the long-running Winners worker requires
a deliberate restart from the canonical folder after the migration.

## Verification and deployment receipt

The deployed migration and runtime were verified read-only. No production picks, grades or customer notifications
are generated as verification. Today's first scheduled MLB game is 6:35 p.m. ET;
first natural comparative publication is a separate later observation, not a
claim established by fixture tests or process health.


- Migration **20260908150211_mlb_gary_winners_selection** applied at 15:02 UTC.
  The tool-generated live version was reconciled to the local filename and
  isolated-test loader. Readback confirms schema-3 eligibility checks, live-game
  exclusion, disabled automatic MLB admission and service-only RPC grants.
  The private table has RLS; the advisor's one new INFO is the intentional lack
  of end-user policies. No new security warnings were introduced. Existing
  unrelated warnings remain outside this change. Supabase's explanation is
  https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.
- Restarted `com.gary.winners` while zero reviews were active and no new-day
  candidates existed. Startup **2026-09-08T15:04:49.051Z**, PID **83478**, logs
  `MLB policy=mlb-conviction-v3; mode=watch`, from the canonical backend on
  Node **22.23.2**. Config readback confirms Astra, era `bfda39b6e5c2` and cap -179.
  No candidates with mismatched new-policy/old-review markers were found.
- Final policy verification: **137 tests across five suites**, including
  **63 isolated PostgreSQL tests** with actual concurrency and wall-clock
  deadlines. Additional final prompt/selection and legacy routing checks pass.
  **217 edge-helper tests** pass. The broad backend sweep passed 3,145 checks;
  one then-in-progress absent-peer fixture was corrected and passed in the
  final database suite. Its 11 Swift compiler timeouts all passed in a serial
  rerun (**21 tests / eight suites**). No unresolved assertion failure remains.
- The full original dossiers proved too large for an ordinary multi-game
  comparison. The final packet uses original rationale/cases/briefing/review
  without rewriting them; all raw sources remain frozen in the ledger.
  Read-only token estimates on retained September 7 inputs dropped six-game
  input from 320,653 to 43,055 tokens. A representative hypothetical 15-game
  packet was 135,012 tokens. These use o200k_base, not a claimed exact Astra
  tokenizer. An 800,000-byte system+prompt limit records an explicit failure
  without model calls or truncation for unusually oversized inputs.
- The new read-only book succeeds against production and returns empty current
  day public/queue/selection arrays before today's publication. All 12 existing
  historical board rows remain present. First new-policy natural selection and
  its eventual outcomes remain prospective; no improvement in win rate or units
  has yet been measured.

Local verification logs are `/tmp/gary-mlb-six-backend-20260908.log`,
`/tmp/gary-mlb-six-swift-serial-20260908.log`,
`/tmp/gary-mlb-six-final-policy-20260908.log`,
`/tmp/gary-mlb-six-final-prompt-selection-20260908.log`, and
`/tmp/gary-mlb-six-edge-20260908.log`. The current-day read-only ledger is
`/tmp/gary-mlb-six-live-book-20260908.json`.
