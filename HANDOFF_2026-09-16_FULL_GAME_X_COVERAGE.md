# September 16 — every MLB/NFL game on X

Adam requested an X post for every daily MLB and NFL game pick. The September 12 audience subset and twelve-root cap no longer apply to those two sports. Other sports retain audience selection with a separate twelve-root budget.

## Behavior

- Every published, non-PASS MLB/NFL pick is eligible 5–120 minutes before kickoff, ordered by deadline. International morning games are also eligible. The writer remains the existing single Sonnet primary over the full rationale: fact / bare ticket / fact, with no alternate copy or provider.
- The ordinary authenticated Supabase publisher runs every five minutes. This is the actual posting worker, not the deleted Codex AI monitor. It drafts only when a real pick is eligible. The database enforces four minutes between reservations/receipts, leaving one minute of latency headroom for the five-minute cron; one successful root per invocation.
- A primary composition failure is reported and the next game's own primary can proceed (up to three candidates per invocation). Unknown sends never auto-resend. Existing duplicate, durable-receipt, hard-deadline and incident-email behavior remains.
- MLB/NFL no longer depends on historical engagement reads. Other-sport history errors remain visible and block that sport's audience decision while MLB/NFL can proceed using their independent policy.
- A prepared old receipt re-reserves the current interval when resumed. Atomic claims still serialize concurrent invocations and retain service-only privileges.
- Untweeted MLB/NFL games count as missed even without a claim beginning September 17, the first full coverage day. September 16's earlier intentional omissions are not retroactive incidents; attempted failures still report immediately. No started games were replayed.

## Verification

393 backend suites / 4,296 tests passed, including isolated PostgreSQL concurrent claims, MLB/NFL posts beyond twelve, retained college cap, resume protection and preservation of the authenticated cron command. All 242 edge helper tests passed, including a mixed thirty-game Sunday simulation with eighteen simultaneous starts and variable composition latency. Real bundled-handler tests preserve the writer/authorization path and confirm a failed first game's primary does not prevent trying the next game's primary. Deno type-check passed. The task's final receipt records production version/source parity, migration, schedule and CI result.

## Model and record clarification

The requested 44–35 snapshot is all MLB: September 9–15 plus the first settled September 16 win (Guardians ML -164). Published ticket prices yield +5.51545031 units / +$551.55 at $100 risked per ticket. Stored responder model records: Sol 31–23, Fable 9–8, Sonnet 3–4, Astra 1–0. The next Giants +136 win makes the same window 45–35 / +6.87545031u. A small mixed sample is not a controlled model test. Adam's conditional Astra-first instruction was not triggered: game routing remains Fable → Astra Plus → Opus → Astra Pro; props remain Luna → Sonnet → Fable.

Six run-line rows have generic odds/spreadOdds metadata inconsistent with the published pick_text. Social and web game-results P/L already parse ticket text, which is the basis above. A September 15 Dodgers run-line card also argues ML in its rationale. Historical tickets and the frozen June engine were not rewritten as part of this posting change. This must be investigated as a separate exact-ticket data-integrity defect, not represented as a fully clean decision pipeline.

OpenAI's advanced account-auth documentation supports persistent private-runner auth with automatic refresh but explicitly warns against concurrent jobs sharing one auth.json. Gary currently has no per-account serialization; this is an auth reliability risk, not an established cause of the prior revoked token. Automatic Plus/Pro rotation is not explicitly endorsed by that page. No API spending, new accounts, daily sign-in automation, or model changes were added here.
