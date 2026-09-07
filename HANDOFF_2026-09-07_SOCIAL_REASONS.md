# Pick tweets quote the actual reasons — September 7, 2026

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

The original rationale, qualifiers, wording, punctuation and tickets are
unchanged. Sentences are selected, never rewritten or cut. An unsuitable
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

The production checkout is `/Users/adam.preda/Gary2.0` on main. Preserve the
machine's real `ios/GaryApp/GoogleService-Info.plist` as the known uncommitted
configuration exception. Other sessions' completed work remains intact.
