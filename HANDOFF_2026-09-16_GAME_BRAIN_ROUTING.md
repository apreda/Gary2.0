# Game brain routing and restored Plus login — September 16, 2026

Adam explicitly requested this order for game picks in every sport:

1. Claude Fable 5.1, xhigh, on his Claude subscription.
2. GPT Astra 6, xhigh, on the separate Plus account first, then the main Pro account.
3. Claude Opus 5, max, on his Claude subscription.

This supersedes the older Sol game/MLB and NCAAF-specific model instructions. It changes provider selection, effort and account routing only. It does not change Gary's evidence, prompts, decision policy, published tickets or X writing policy. MLB's frozen June conversation remains intact; the approved model plumbing is explicitly marked in its adapter.

## Authentication evidence

The fresh device login completed successfully and the saved account under `~/.codex-plus` identifies as Plus. The main `~/.codex` account still identifies as Pro. Actual one-word calls through Gary's adapters succeeded for Fable 5.1/xhigh, Astra 6/xhigh on Plus, Astra 6/xhigh on Pro, and Opus 5/max. These prove the connections answered at the time of verification, not that future calls cannot fail. No tokens, authentication files, device codes or private Firebase configuration belong in source control.

The earlier rejection explicitly said the saved token was revoked. There is still no evidence establishing why OpenAI revoked it. Do not invent an account-security or billing explanation. A fresh login repaired the rejected credential.

## Runtime behavior

The runner preflights the game brains before buying research. A responsive Fable ends preflight, so the availability probe does not wake every other model. If Fable is unavailable, preflight tests Astra on Plus and then Pro before reaching Opus.

Each game attempt explicitly receives its model effort. Astra attempts are scoped to one account at a time. If Plus fails during an existing multi-turn analysis, the Pro attempt starts the complete game engine afresh with the full input; it does not try to resume Plus's thread from another account or hand over truncated context. Known capped accounts are skipped until the provider's reported reset, or the existing default cooldown when no reset is given. MLB retains its existing one retry on the selected first brain.

Missing required data and unavailable markets remain terminal failures. Another model/account cannot bypass readiness checks. Cancellation does not launch another provider. Required-data failures retain their operational failure receipts.

The account preference is scoped to game decisions through `GARY_GAME_CODEX_HOMES` (default Plus, Pro). Existing research and content account discovery is separate. Do not claim that all of Gary uses Plus before Pro.

Props retain their prior policy: Luna/medium on the props login, then Claude Sonnet/max, then Fable/xhigh. They are not universally Sonnet. Research and content retain their own policies. Non-game model cascades are separate from the new game cascade. The comparative MLB Winners selector retains Astra on its Codex adapter; tying its default to the newly Claude-based game model would break it. Tests caught and fixed that coupling.

## Activation and verification

Production is `/Users/adam.preda/Gary2.0` on `main`. The installed scheduler plist must set both `GARY_MODEL_OVERRIDE` and `GARY_MLB_BRAIN_MODEL` to `claude-fable-5-1`. Merely changing the source default does not override a live launchd process's older environment. Preserve all unrelated installed plist fields, wait until current pick/props children finish, then reload the scheduler and verify its PID, canonical directory, exact model environment and startup logs. Never terminate a live game to switch its model halfway through.

The two games already running when this work began were Brewers–Pirates (5060049) and Royals–Astros (5060054), on the prior Sol policy. Their completed picks should not be regenerated just to give them a new model stamp.

Coverage includes full-game Fable → Astra Plus → Astra Pro → Opus routing, a mocked real CLI transcript with Plus failing after its first turn and Pro receiving the full original desk, cancellation, terminal data failures, preflight account order, lane isolation, Winners selection and the frozen June source guard. Live provider checks above did not publish picks or tweets.

Run the full backend test suite and the production-truth check before reporting completion. GitHub Verify provides backend/web/native checks for the pushed commit. The production-truth report's known private Firebase plist difference is an intentional local exception. Supabase CLI edge-parity/support checks remain unverified if that separate CLI login is unavailable; this model change requires no edge deployment or native release.

The five-minute Codex automation remains deleted. Incident email alerts remain ordinary code. This change does not resolve Apple signing/account access or deliver the pending native build to TestFlight.
