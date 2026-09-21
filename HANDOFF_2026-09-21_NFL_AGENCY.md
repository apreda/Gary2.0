# NFL single-answer agency — September 21, 2026

## Authorized scope

Adam: "Keep MLB the same but then yes do all this for NFL that you proposed."
This supersedes the NFL prompt wording and staged decision flow in
`HANDOFF_2026-09-20_NFL_NBA_BASELINE.md`, not that handoff's evidence/research
improvements. MLB, NBA and NCAAF behavior remain unchanged.

## NFL behavior

- The substantive ask is exactly: `What's your bet, and what are the reasons why?`
- `nflPrompts.js` owns NFL's minimal identity, factual-integrity rules, posted
  market context, optional researcher/web capabilities and storage schema.
  NFL no longer imports the NBA prompt template. NBA's original file is intact.
- Football awareness is declarative context: personnel/coaching continuity,
  small early-season samples, opponents, scoring sources, weekly circumstances,
  reported plans versus outcomes and divisional history. It does not assign
  questions, rank factors, favor a side or require a particular conclusion.
- Gary receives the original desk, full research briefing and available tools.
  Researcher instructions and evidence collection are unchanged. Gary may use
  tools and factual researcher follow-ups before answering.
- No mandatory case essays, investigation-complete marker, decision checkpoint,
  announcer opening, "Gary's Take" heading, paragraph count or word target.
  There is no separate prose draft followed by a formatting/editorial turn.
- The first valid final JSON answer supplies the ticket and original rationale.
  NFL rationale parsing does not repair JSON, splice prose, inject headings,
  require 1,000 characters or infer truncation from terminal punctuation.
  Whitespace, line breaks and Unicode in the rationale survive unchanged.
- Empty, malformed, ambiguous or explicitly provider-truncated answers fail the
  attempt; they do not commission a rewritten rationale. Existing whole-attempt
  failure/fallback policy remains. Tool/research turns are not editorial passes.
- Numeric evidence audits remain diagnostics, not requests to rewrite Gary's
  explanation. Factual-integrity instructions, market identity/price validation,
  moneyline eligibility and publication requirements remain in place.
- Injury tags, duration definitions and injury pipeline behavior are unchanged.

## Implementation and regression coverage

Primary files:

- `gary2.0/src/services/agentic/orchestrator/nflPrompts.js`
- `gary2.0/src/services/agentic/constitution/nflConstitution.js`
- NFL-only branches in `agentLoop.js`, `passBuilders.js`, `orchestratorMain.js`
  and `responseParser.js`; researcher import and football fingerprint updated.

The obsolete `nflNbaPrompts.js` adapter and its tests were replaced. The shared
test named `pass2Mlb.test.js` changes only its NFL assertion; MLB expectations
are unchanged. Tests cover original-answer publication, optional tools/research,
duplicates, multiple tool turns, browsing, diagnostic-only audits, short reasons,
strict failures without rewrites and non-NFL parser behavior.

Read-only comparison against pre-change commit `38e13f0f` confirmed 60 rendered
MLB/NBA/NCAAF prompt outputs match byte-for-byte and 24 parser outputs match.
MLB's frozen June fingerprint is still `9d3d2be7e50e`. NFL's new fingerprint is
`91ce9aac159a`. NCAAF's source fingerprint changes to `79ba03b9da61` because its
hash includes whole shared source files; this is not a NCAAF behavior change.

## Verification and delivery

- Backend: 431 files / 4,597 tests passed with `--maxWorkers=4`.
- Edge helpers: 243 tests passed.
- Web: 91 files / 958 tests passed with `--maxWorkers=4`.
- Backend lint, backend typecheck, web typecheck and `git diff --check` passed.
- Initial full run found one obsolete NFL checkpoint expectation; it was updated.
  A subsequent unrestricted parallel run hit unrelated native/Postgres timing
  failures. The complete four-worker rerun passed without changing those tests
  or their timeouts.
- Pre-commit read-only production audit confirmed the correct running scheduler,
  unchanged MLB June era, running Winners worker and all 22 edge timestamp checks.
  It correctly flagged this pending commit's dirty files. Check again after push;
  the known private plist remains an intentional working-tree exception.

No live model replay, new published pick, historical-pick rewrite, database
mutation, edge deployment, native build or scheduler restart was performed.
The running scheduler uses `/Users/adam.preda/Gary2.0/gary2.0` and launches fresh
pick children, so the next NFL generation loads this code without a restart.
Preserve the existing uncommitted private `ios/GaryApp/GoogleService-Info.plist`.
