# September 13: X game-pick format

Adam explicitly corrected the image labels: **screenshot 1 is his preference throughout**. Use an opening factual sentence, a blank line, the bare pick, a blank line, and a second factual sentence. The Falcons/Bijan Robinson example is the requested layout. Do not restore the two-block Cardinals layout based on the earlier mixed-up image references. This is a founder preference, not a proven engagement uplift.

## Delivered

Source `831f0b78` is committed and pushed on main. `social-auto-post` **v112** is active in `xuttubsfgdcjfgmskcol`, deployed September 13 at 18:42:01.697 UTC with JWT verification enabled. Future game-pick roots require both factual sentences in the model selection, retry, deterministic outage fallback, final validator, and unsent prepared-payload path. No test tweet was sent and no existing post was edited or deleted.

Both sentences still must be distinct, whole, standalone, concrete facts copied from the same supporting paragraph of Gary's original rationale, within the existing character budget. If no pair fits, the composer records `NO_SAFE_COPY` and skips that tweet; it does not invent filler, truncate facts or fall back to two blocks. The deterministic selector continues looking for a later valid pair when an earlier opening has no partner. The generic shared helper keeps its old optional-closing default for other consumers; this composer explicitly requires the closing. No prepared intents existed at the pre-deploy check. Already-sent publication recovery remains intact.

This changes the game-pick root format. It does not change pick generation, June's engine, rationale writing, the original facts, props replies, recaps, audience selection, cap, cadence or pregame windows. Current launch/Apple/model direction remains in the launch-review and Sunday-recovery handoffs.

## Verification and limits

- 137 focused Vitest cases pass, including actual bundled composer fixtures with the model unavailable, a single-fact rejection, and prepared-copy/cadence guards.
- All 235 edge-helper tests pass; Deno check passes.
- Live authenticated dry-run preview returned HTTP 200, health `ok`, and a three-block Tigers hook at 18:43:36 UTC. Preview deliberately ignores pregame timing, so its negative lead time is not a scheduled posting approval. No posting or metrics writes occurred. See `docs/operations/social-format-2026-09-13/preview.json`.
- Production truth confirms v112 deployment timestamp, no unpushed source, the correct scheduler folder and running scheduler/Winners workers, Sol games/MLB and Luna props. The sampled daily MLB store had 14/15 games published, zero started without a pick, and one pending. This is a point-in-time check, not complete NFL or historical results verification.
- Overall production truth remains flagged for the 11 pre-existing native/configuration working-tree entries, including the private Firebase plist. These are preserved and excluded from this commit. Edge checks compare timestamps, not deployed-source byte equality. Full output: `docs/operations/social-format-2026-09-13/production-truth.txt`.
