# Pick tweets quote the actual reasons — September 7, 2026

## Current policy: present the facts

Adam's latest correction supersedes the thesis-first behavior and the narrow
`for me` cleanup below. Pick tweets select concrete performance, workload and
personnel facts directly from the saved rationale. No narrator introduction,
abstract conclusion or commentary sentence is required. The formatter that
removed `for me` has been retired: unsuitable sentences are now excluded whole,
and every published sentence is once again an exact original source sentence.

`isConcreteFactSentence` is shared by candidate selection and final validation.
Both the model and deterministic fallback use the same factual candidates.
The fallback selects in source order, with an optional following fact from the
same paragraph. Explicit counterargument paragraphs cannot supply an opener or
a closing fact. Model instructions no longer ask for a thesis or a stronger
expression of conviction. No pick-generation prompts or decisions changed.

The 72-pick replay produced 70 valid factual previews, including all nine
September 7 picks. Two historical cards (North Texas September 5 and Wisconsin
September 6) have no suitable complete, named supporting fact that fits; they
are withheld instead of falling back to commentary, unnamed context or the
opposing case. This is a copy eligibility check against saved sources, not an
independent verification of their sports data. Exact outputs are preserved in
`audit-evidence/social-reasons-2026-09-07/facts-only-previews.json`.

Production runs `social-auto-post` version 106, active with JWT verification.
All 12 deployed source files exactly match the tested source. The final checks
passed 100 focused copy/claim tests, 180 edge helper tests and Deno checking.
An isolated checkout of committed `a3dcf9c8` plus only the three social source/
test changes passed all 2,397 backend tests across 252 files. The initial shared
checkout run encountered five failures in native Hub tests while another
session edited those files; its work was preserved and excluded from the
isolated verification. The temporary verification worktree was removed.

The live dry run returned HTTP 200 and health `ok` with no metric or tweet
writes. All nine publication intents were already completed, leaving no
unposted pick for a live copy preview; the copy itself was verified with the
saved-source replay and tests. Full receipt:
`audit-evidence/social-reasons-2026-09-07/facts-only-verification.json`.

The updated Twins preview is:

> Gómez, Hoffman and Minter all sat Sunday after throwing seven, 17 and 18 pitches Saturday.
>
> Twins ML
>
> Detroit’s relief work improved in Cleveland, but Jansen, Holton, Kinley and Sommers pitched Sunday, and Finnegan worked consecutive days.

## Earlier implementation history

Adam supplied the Royals and Twins tweets and asked for the actual reasons
from Gary's published rationale / Gary Take, using Gary's literal words.
Both screenshot openers already existed verbatim in the saved September 7
rationales. The deterministic selector explicitly preferred `my assumption`
and other first-person framing over the clearer case earlier in each card.
The pre-fix regression replay reproduced both screenshots exactly.

The shared selector now excludes assumption/assessment commentary, generic
signposts and references whose context was omitted. Every selected reason
names a team or player. First-person phrasing no longer earns priority over
the original argument. Nearby concrete evidence is preferred. Two sentences
must come from the same original paragraph; otherwise one whole reason is
enough. The model receives paragraph labels and the final code gate enforces
the same rule for model selections and deterministic fallback.

The original rationale, qualifiers and tickets are unchanged. The model selects
whole original sentences. Adam's follow-up permits one narrow formatting
exception after source validation: drop redundant `for me` attribution, with
the corresponding comma or opening capitalization when needed. An unsuitable
sentence is excluded whole rather than having its uncertainty stripped out.
No model/pick-generation prompts, injury handling, posting schedule, daily
cap, publication reservations, prop replies or X account settings changed.
No verification tweets were sent, and existing tweets were not edited or
deleted. There is no evidence here establishing the cause of follower loss.

## Verification

- The screenshot sources are preserved in
  `gary2.0/tests/fixtures/social-rationales-2026-09-07.json`.
- Focused copy regressions and claim guards: 62 tests passed.
- Full backend suite: 252 files and 2,359 tests passed.
- Edge helper suite: 180 tests passed. The real entrypoint passes `deno check`.
- A read-only replay of 71 saved picks from September 5–7 produced 71 valid,
  verbatim previews within the character budget, with no withheld picks.
  Full previews: `audit-evidence/social-reasons-2026-09-07/previews.json`.
- The live dry run uses `dry_run=1&preview=1&force_mode=pick`; it does not
  refresh metrics, reserve publications or send tweets. Its exact response,
  final test counts and source-comparison receipt are recorded in
  `audit-evidence/social-reasons-2026-09-07/verification.json`.
- The first live preview exposed a cross-paragraph counter-case pairing for
  SMU. The final paragraph gate has a regression for it and uses the single
  original SMU reason instead. This was found without publishing the preview.
- Final deployment: `social-auto-post` version 104, active with JWT checking
  enabled, deployed at 2026-09-07T19:58:59.788Z. All 12 deployed source files
  exactly match the tested local files. The final live dry run returned HTTP
  200 and health `ok`, with no posts or metric writes. All seven September 7
  publication intents were completed; none held an old prepared draft.
- Implementation commit `07267137` was pushed to `origin/main`. The required
  production audit passed every edge deployment check and found no unpushed
  commits. It exited 1 only for the known private Firebase configuration file
  below; no source deployment mismatch was flagged.

The production checkout is `/Users/adam.preda/Gary2.0` on main. Preserve the
machine's real `ios/GaryApp/GoogleService-Info.plist` as the known uncommitted
configuration exception. Other sessions' completed work remains intact.

## Earlier follow-up: matter-of-fact wording (superseded)

Adam pointed out that `for me` is redundant on Gary's own account. The sentence
selector now prefers a direct matchup statement over unnecessary self-reference
when an equally useful original sentence exists. It still returns the exact
original text. `formatReasonForTweet` then removes narrow `for me` attribution
shapes from validated opening and closing sentences. It leaves predictions,
conditions, integral `for me to ...` constructions and quoted speech intact.

The Twins preview now starts:

> Minnesota’s rested late-inning group tips this close matchup.

Replaying the 71 previously verified sentence selections changed only the five
previews containing redundant attribution. All 71 stay within the character
budget, with no remaining `for me` in that sample. The actual before/after
outputs are in `audit-evidence/social-reasons-2026-09-07/matter-of-fact-previews.json`.

The follow-up passed 73 focused tests, all 2,370 backend tests across 252 files,
all 180 edge-helper tests and the real entrypoint's Deno check. Production runs
`social-auto-post` version 105 with JWT checking enabled. All 12 deployed source
files match the tested local files exactly; the live dry run returned HTTP 200
and health `ok` without publishing a tweet. The complete receipt is
`audit-evidence/social-reasons-2026-09-07/matter-of-fact-verification.json`.
