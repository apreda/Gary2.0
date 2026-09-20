# NFL research delivery and upfront evidence

Adam explicitly approved repairing researcher tool delivery, supplying core
offensive/defensive evidence upfront, adding factual scheme/personnel reporting
for each team, and keeping current-season samples separate from prior background.
This follows the morning player/prompt repair in
`HANDOFF_2026-09-20_NFL_DATA_AND_AWARENESS.md`.

## Delivery repair

The actual Bears–Vikings research sessions contained native tool errors saying
`MCP tool call requires approval, but approval policy is never`. The server's
three sports retrieval tools lacked read-only annotations. They now declare
their actual behavior, and the Codex bridge permits only requested, known Gary
tools under a server-scoped `writes` approval policy. Shell remains disabled
and the model sandbox remains read-only. No broad approval bypass was added.

Live verification then exposed a second boundary: stdio MCP did not inherit
the BDL credential. The bridge now forwards only the relevant variable names
and TMPDIR, without writing credential values into arguments or context files.
The server resolves the backend working folder from its own module path so
evidence caches are shared with ordinary workers rather than the neutral model
workspace. The bridge rejects failed/unfinished native MCP calls even if the
model finishes a paragraph. Existing research recovery handles the failure.

At 10:03:48 ET, the real Terra researcher completed OFFENSIVE_EPA,
DEFENSIVE_PLAYMAKERS, Caleb Williams's individual 2026 game log, and current
official Bears reporting through MCP. All four tool receipts were available.
The PFR 2026 passing/defensive charting gap remains a source gap, not a login
or permission failure. No new user sign-in was necessary.

## Evidence packet

`nflGameEvidence.js` supplies both teams' offense and defense, early downs,
red-zone plays, sacks/hits/dropbacks, formation/tempo rates, separately labelled
BDL team aggregates, available named PFR charting and named snap participation.
`footballEvidenceBundle.js` integrates it through the existing scout interface;
NCAAF's six-token bundle and formatting remain unchanged.

Each source retains its season and denominator. Missing charting is unavailable,
not zero. Missing current evidence never inherits prior values under a current
label. Thin or missing current samples receive a separate prior-season section.
Live CHI/MIN data has one 2026 regular-season game each. Chicago's 2025 ledger
contains 17 regular-season plus two postseason games; Minnesota has 17 regular
games. The packet explicitly reports those different samples. Snap participation
is past usage, not a new starting-player or availability decision.

## Reporting and prompts

Each team now gets separate last-game, offensive scheme/personnel and defensive
scheme/personnel article slots. Discovery asks for documented coaches, actual
play callers, formations/approach, player roles and changes, without assigning
a betting consequence. Original publisher paragraphs/headings, author, URL,
publication date and retrieval date survive extraction; duplicate bodies are
referenced rather than printed repeatedly. Team-specific articles must identify
the required team. Last-game coverage checks the known opponent and rejects
articles predating that game. One bounded focused retry seeks missing team
coverage after a publisher/date failure. Unavailable sources remain explicit.

Previous-meeting reporting can be historical rather than incorrectly requiring
publication within 14 days. Source publication dates never relabel prior staff
or results as current. The live CHI/MIN check filled all six team-specific slots;
one additional head-to-head article was blocked by its publisher (403), visibly
unavailable. The two actual last-game recaps were preserved in full.

Six older advanced-tool notes asserted causal diagnoses from pressure, sack or
coverage figures. These now describe measures and interpretation limits instead
of asserting a line problem, intent to target a defender or future performance.
Gary still owns the bet and its rationale. No AI reviewer, factor weighting,
favorite/underdog quota or new opinion gate was added.

NFL fingerprint: `fe083ea73e2c`; NCAAF: `112f76d63634` (shared transport/fingerprint
surface changed). The tracking surface now includes MCP, upfront evidence and
article modules. June remains `9d3d2be7e50e`. NBA's pinned prompts, the frozen June
tree, protected injury code and published tickets were not edited.

## Verification and operations

Full backend: 4,568 tests in 427 files passed. After the final reporting retry
and neutral tool-note edits, 57 focused cases passed. Lint and checked-boundary
type checks passed. Read-only source checks exercised the real formatter and
real Codex/MCP route; no verification picks were written to production.

NFL was not placed on a new hold. Scheduler PID 41418 remains in the canonical
backend directory. The 09:58 Saints game/props and Bengals props failures were
the scheduler's existing two-minute pre-trigger execution cutoff; 10:00 retries
were already running. Do not duplicate an active retry. No scheduler code changed,
so fresh child workers load the repair without a daemon restart.

Full local evidence is in
`/Users/adam.preda/Documents/ChatGPT/Gary/nfl-review-2026-09-20/delivery-repair/`:
`01-original-team-reporting.md`, `02-researcher-actual-tool-responses.md`,
`03-upfront-data.json`, `03-upfront-data.md`, native MCP transcripts and test logs.
The earlier `actual-inputs-comparison` directory remains the original published
pick's historical input, not a claim that it used these later repairs.

Run production-truth after push. Preserve the known local deno.lock, private
Firebase plist and audit-snapshot exceptions; do not claim its exit status is
green while those flags remain. No edge or native deployment is required here.
