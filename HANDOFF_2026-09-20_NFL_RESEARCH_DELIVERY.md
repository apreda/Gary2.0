# NFL research delivery and upfront evidence

Adam explicitly approved repairing researcher tool delivery, supplying core
offensive/defensive evidence upfront, adding factual scheme/personnel reporting
for each team, and keeping current-season samples separate from prior background.
This follows the morning player/prompt repair in
`HANDOFF_2026-09-20_NFL_DATA_AND_AWARENESS.md`.

Implementation: `88a33842`, pushed to `origin/main`.

The 10:27 follow-up below supersedes the initial transport-completion claim.

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
The final native stat check at 10:09:42 ET completed both tool calls (15 ms and
741 ms). At 10:14:38 ET, the shipping upfront bundle returned current 2026
offense/defense, separate 2025 background and current snap participation for
all 28 teams across today's 14 games. Full data is in `slate-data-check.json`.

NFL was not placed on a new hold. Scheduler PID 41418 remains in the canonical
backend directory. The 09:58 Saints game/props and Bengals props failures were
the scheduler's existing two-minute pre-trigger execution cutoff; 10:00 retries
were already running. Do not duplicate an active retry. No scheduler code changed,
so fresh child workers load the repair without a daemon restart.

The in-flight Saints–Ravens retry PID 71608 had imported the provider adapter
before credential forwarding landed. Its new scout had the upfront bundle,
but native factor subprocess arguments demonstrably lacked `env_vars`; uncached
stat calls stalled. At 10:13:50 ET, that still-unpublished attempt was stopped
with SIGTERM (existing owned-process cleanup removes its model descendants).
The scheduler correctly treated the exit as no verified game outcome and
started the fresh Saints prop worker, PID 90511. A single scoped game retry,
PID 90510, was launched from the committed repair using
`node --env-file=.env scripts/run-agentic-picks.js --nfl --game-id 1392239`.
No force/overwrite flag was used. Both were active at the handoff; publication
is still pending and must not be reported complete. The user-opened coordination
task `01a0bf18-2aea-7a82-a303-cf3092fd1e74` owns following these two runs to outcome.

Intermediate Claude/business-login quota warnings do not establish total search
failure: the shared subscription search explicitly tries the permitted personal
route afterward. The new game's preflight successfully selected personal Astra.
The same fallback sequence delivered all six live team article slots in this
verification. Inspect the final combined route outcome before diagnosing a
fresh authentication failure.

Full local evidence is in
`/Users/adam.preda/Documents/ChatGPT/Gary/nfl-review-2026-09-20/delivery-repair/`:
`01-original-team-reporting.md`, `02-researcher-actual-tool-responses.md`,
`03-upfront-data.json`, `03-upfront-data.md`, native MCP transcripts and test logs.
The earlier `actual-inputs-comparison` directory remains the original published
pick's historical input, not a claim that it used these later repairs.

Production-truth after push verifies canonical scheduler PID 41418, the pushed
implementation, running Winners worker, unchanged frozen hashes and all edge
deployment timestamps. It exits nonzero only for the preserved local deno.lock,
private Firebase plist and audit-snapshot exceptions. Its general daily_picks
section is not the NFL weekly publication table; use the NFL game's actual
storage outcome for its completion receipt. No edge or native deployment was
required here.

## 10:27 ET — uncached player requests and shared rate gate

The production follow-through found another environment boundary after the
initial cached-stat checks passed. Native MCP subprocesses had the credential
but did not inherit `GARY_BDL_LOCAL_REQUESTS_PER_MINUTE`. The parent used its
configured 120/minute limit; the MCP server fell back to 3/minute. The shared
gate's actual state confirmed 20,100 ms reservations, so uncached QB/RB/WR and
red-zone requests stalled across competing factor processes.

The MCP environment allowlist now also forwards the existing request-rate,
gate-directory and cache-directory settings. The rate limiter stays enabled;
no provider limit was increased. A regression check reconstructs the forwarded
environment and verifies that the parent's configured rate survives. The 31
focused bridge/MCP/rate-gate cases, lint and boundary type checks pass.

Still-unpublished Saints game PID 90510 was stopped at 10:27 ET to remove its
already-loaded slow configuration. Stored Saints props are untouched: they
completed at 10:22 ET. The corrected native Terra check then returned all four
previously stalled tokens: QB_STATS, RB_STATS, WR_TE_STATS and RED_ZONE_OFFENSE
between 10:27:26 and 10:27:30 ET. Calls took 29–33 seconds including the last
old gate reservation; afterward the shared gate recorded the configured 600 ms
interval. Receipts are `delivery-repair/mcp-player-rate.json` and its MCP log.
A fresh single scoped Saints game run follows this correction; the coordination
task owns monitoring its outcome. Do not confuse a successful data retrieval
check with accepted publication of the game pick.

Current NFL fingerprint: `d65b6109898f`; NCAAF: `57221a362938`. Frozen June and
prop hashes are unchanged. The earlier fingerprint in this handoff identifies
the first implementation stage. Adam subsequently asked whether historical
tables should remain upfront; the recommendation to remove that automatic
section is discussion only. No historical-data policy change was authorized
or made during this follow-up.
