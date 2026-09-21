# NFL alignment to the preserved NBA baseline

Adam explicitly authorized the full implementation and double-check after the
read-only comparison: change NFL only, leave NBA and MLB alone, and add balanced
weekly football context without prescribing winners or factor weights.

## What now runs

- `nflNbaPrompts.js` calls the real frozen NBA builders, adapting exact sections
  for NFL. It does not edit or maintain a competing copy of the NBA baseline.
  NFL receives NBA's identity structure, core principles, investigation,
  independent synthesis/decision turn and separate formatting-only turn.
- Necessary NFL exceptions are explicit: football availability instead of
  basketball injury thresholds; real tool access; quoted NFL side/price pairs
  and the existing -179 ML cap; current versus historical/opponent personnel;
  and informed football judgments distinguished from sourced facts. No assumed
  market adjustment, automatic full-strength questionable player, or requirement
  for a statistic proving every opinion. NFL injury tag assignment is untouched.
- NFL asks for the strongest honest case and obstacles for both teams. The
  cases need not be equally strong. The decision explains why the selected side
  is preferable to the opposing side, not merely how an underdog could compete
  or why its spread is preferable to its own moneyline.
- `nflResearchPrompts.js` supplies neutral factual research and separately
  attributed assessments. Five grouped subjects preserve the entire old token
  menu: team identity/history; last game/opponent; this week's changes;
  offense/defense matchup; special teams. Verified August preseason retains its
  bounded original six-factor scout plan.
- Research asks who produced the result, what produced it, what changes this
  week, and what broader history supports. It does not decide that a strength
  translates, a weakness repeats, or one team improves. Gary owns that judgment.
- New team-specific identity and weekly-adjustment reporting slots complement
  the existing full original offense, defense and last-game articles. Current
  staff/roles and historical context remain explicitly distinguished. Missing
  slots remain missing, not invented. Old caches lacking the new topic keys
  fail the existing complete-topic validation and are rebuilt.
- NFL briefings and follow-ups retain complete sources, qualitative assessments
  and uncertainties, including structured fields. No new evidence truncation,
  AI reviewer, pick veto, betting quota or hindsight correction was added.

## Mechanical fixes found during verification

NBA-style `Case for Team` headings lacked the colon expected by the existing
football evidence extractor. The actual replay additionally used inline bold
`Case for Team.` headings. NFL now accepts standalone and inline variants
without changing the parser's behavior for other sports. Both complete cases
survive onto the returned pick's evidence fields.

NFL now always enters its separate formatting turn rather than taking the old
combined prose/JSON fast path. Token-cutoff retries preserve the current stage:
investigation continues investigating, decision continues prose, formatting
retries complete JSON. A parseable but truncated response is not accepted.
If Gary requests a tool during the decision stage, its result is delivered
before the completed prose decision and formatting turn; a tool request alone
does not complete the decision or requeue the already-sent decision prompt.

## Isolation and delivery

NBA prompt fixtures remain byte-identical. MLB's frozen June content hash is
`9d3d2be7e50e`; no MLB decision/data behavior was changed. NCAAF branches and
prompts are unchanged. Its source fingerprint changes because the existing
fingerprint includes shared source files, not because its prompt changed.

Fresh NFL processes stamp `3ef4e897b936`. No scheduler source, model routing,
database schema, edge function or native binary changed. Fresh pick children
load these modules from the canonical production backend; no daemon restart is
needed. Published tickets are never replaced by these tests.

## Verification and complete prompt evidence

The final full root verification passed: 4,583 backend tests in 431 files,
243 edge-helper tests and 958 web tests in 91 files, with no skipped tests.
Lint and backend/web type checks passed. NFL integration, retry/tool-stage,
case-extraction, research-delivery and article regressions are included; NBA
exact-prompt and MLB frozen-baseline tests remain green. The full rerun and
production-truth receipt are kept with the local audit artifacts below.

Local artifact directory:
`/Users/adam.preda/Documents/ChatGPT/Gary/nfl-review-2026-09-20/nfl-nba-implementation/`

- `complete-new-nfl-prompts.md`: full compiled main prompts and researcher
  follow-up instructions; only dynamic data inserts use explicit placeholders.
- `game-4-final-complete-replay.md`: every application-visible message in the
  final Chiefs replay, including complete supplied evidence and all five
  research conversations; no shortening. Private provider reasoning is not an
  application message and is not captured.
- `game-4-final-result.json`: original ticket, replay ticket, exact decision,
  and initial mechanical checks. Its initial case-capture check exposed the
  inline-heading bug; it is retained as an honest development receipt.
- `final-replay-validation.json`: all 14 checks pass with the repaired parser
  against the same immutable model output. The current system/decision/format
  prompt bodies exactly match those used in the replay. Both cases are complete,
  and Chiefs -6.5 at -102 remains identical from decision through formatting.

The replay uses the saved pregame Chiefs–Colts desk and saved pregame tool
returns, not current searches or the game result. It runs the new research
groups and decision prompts through the existing Astra subscription bridge.
For comparability the researcher also uses Astra in this offline test; normal
production routing is untouched. It does not exercise fresh article/stat
retrieval or establish predictive performance. The earlier `game-4` replay is
a development snapshot; `game-4-final` is the final prompt version.

The private `ios/GaryApp/GoogleService-Info.plist` difference is the preserved
local configuration exception. Never stage it with this delivery.
