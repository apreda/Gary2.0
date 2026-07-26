# Tail/Fade + Your Book — Design Spec

**Date:** 2026-07-26
**Origin:** Sandy Plashkes video on Action Network's fall-off + Grok pain-point report + independent research. The displaced Action Network cohort wants "the Action that used to exist + the tracking/social power of Pikkit." Nobody owns transparent expert records — Pikkit verifies user records, Action's experts hide theirs. Gary already has the transparent expert record; this feature weaponizes it and steals Pikkit's unfakeable-record feeling without sportsbook sync.

**Founder decisions (Jul 26):** Trust + Tail chosen, extended to Tail AND Fade; personal bet tracking included, built the Gary way (manual quick-log, no sync, no CLV/EV); build all of it in one ordered plan, verify-fix loop until 100% done.

## What we are building

One system, three entry points. A new `user_bets` table holds every personal bet a signed-in user records. A tail, a fade, and a manually logged outside bet are the same row with a different `kind`. Tails/fades link to a Gary pick and inherit its grading automatically; manual bets are self-graded.

Two ledgers, never mixed:
- **WITH GARY** — tails and fades. Server-timestamped, immutable after game lock, system-graded. The flagship, shareable, unfakeable stat.
- **YOUR PLAYS** — manually logged outside bets. Self-graded, labeled as self-tracked. Convenience and habit, never marketed as verified.

## What we are NOT building (guardrails)

- No sportsbook account linking / auto-sync (Pikkit's fight, ToS landmines, limiting-risk fear).
- No CLV / EV / closing-line tooling of any kind (north-star law: Gary is the FAN's app).
- No line shopping.
- No leaderboards yet — but the data model must not preclude them.
- No new fonts; GaryFonts only (never mono/JetBrains). No ellipsis truncation anywhere. No emojis in social output.
- "Tail" and "Fade" are founder-chosen feature verbs and allowed; no other betting-lingo slop in copy (CALL remains banned).

## Data model (Supabase)

New table `user_bets`:

| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| user_id | uuid not null | references `auth.users`, owner |
| kind | text not null | check: `tail` / `fade` / `manual` |
| pick_type | text | `game` / `prop`; null for manual |
| pick_id | uuid/bigint (match picks tables) | FK target row in `daily_picks` or prop picks table; null for manual |
| sport | text | denormalized for splits; from pick for tail/fade, user-entered for manual |
| description | text | manual only: freeform "Yankees ML" etc. For tail/fade derive display from the pick |
| odds_american | int | tail: pick's stored odds. fade: opposite-side odds when slate has them, else null |
| odds_estimated | bool default false | true when fade grades at assumed -110; UI shows `est.` — we never fabricate precision |
| stake_units | numeric not null default 1.0 | stepper in UI |
| status | text default `pending` | `pending` / `won` / `lost` / `push` / `void` |
| units_net | numeric | set at grading |
| placed_at | timestamptz default now() | server clock only; client never supplies |
| graded_at | timestamptz | |
| graded_by | text | `system` (tail/fade) / `user` (manual) |

**Integrity (the product itself):**
- RLS owner-only on all verbs (`auth.uid() = user_id`).
- BEFORE INSERT/UPDATE trigger on tail/fade rows: reject if the linked pick's game has started (compare server `now()` to the pick's game time). Post-lock, tail/fade rows are frozen except system grading fields. You cannot retro-tail a winner; you cannot delete a losing tail after lock (delete allowed pre-lock only for tail/fade).
- Manual rows are freely editable/gradable by owner (their own book; honestly labeled).
- One active tail-or-fade per user per pick (unique partial index); switching sides allowed pre-lock by updating `kind`.

## Grading flow

Extend existing edge functions (`gary2.0/supabase/functions/grade-results`, `grade-props`), which already run on pg_cron:
- After a pick grades: fetch linked `user_bets` where status `pending`; tail inherits the pick's result; fade inverts it (fade wins iff pick loses; push stays push; void stays void).
- `units_net` from `odds_american` and `stake_units`; fades without stored opposite odds grade at -110 with `odds_estimated = true`.
- Re-grade safety: like picks, user bets re-grade idempotently on every run (matches existing re-grade-every-run doctrine).
- Manual bets: graded in-app by the user (won/lost/push chips), `graded_by = 'user'`.

## iOS surfaces

New file `ios/GaryApp/UserBookView.swift` (views + API client extension) to minimize churn on the 24K-line hot `Views.swift`; only integration points touch existing files (PickCardBack, BillfoldView section mount, pbxproj file add).

1. **Tail/Fade on the pick card back** (`PickCardBack`, Views.swift:16297): two buttons below the rationale — the "I've read the case" moment. Tap → stake stepper (default 1u) → logged with instant confirmation chip. Switchable until lock. At lock: frozen chip ("You tailed · 1u"). After grading: result chip ("Tail won · +1.0u"). Signed-out tap presents existing AuthView.
2. **Billfold: YOUR BOOK section** (BillfoldView, Views.swift:11559): WITH GARY record (W-L, net units, streak) + the drama comparison line ("Gary +6.2u · You +4.1u this month") + YOUR PLAYS subtotal labeled self-tracked + recent slips list. Existing Billfold design language.
3. **Quick-log sheet** from YOUR BOOK: sport picker, freeform description, American odds, stake stepper → saves `manual` row. Pending manual slips carry self-grade chips.
4. **Flag:** new AppFlag gating the whole surface (ship ON; one-line kill switch, matching 2.19 flag pattern).

Day-cache law applies: any day-keyed cache of user-book data must not store empty async results (TabView `.task` cancellation poisoning).

## Web

Sharpen `web/app/results` into the receipts page: surface pre-lock `created_at` timestamps on picks, season archive completeness, "every pick timestamped before lock — nothing deleted, everything graded" framing. Copy voice: plain, professional, no slop. No interactive tail/fade on web in this build (iOS is the product; web is the shop window).

## Share card

"My ride with Gary" variant in the existing Stack Row share-card system: WITH GARY record + units + streak only (system-graded receipts; YOUR PLAYS never appears). This is the organic GTM ammo aimed at the displaced-Action cohort; fold into FALL_LAUNCH_GTM after ship.

## Build order

1. Supabase: `user_bets` + RLS + lock trigger + partial unique index (SQL, verified with test inserts).
2. Grading: extend `grade-results` + `grade-props` for linked user bets; verify with staged rows against a graded pick.
3. iOS: `UserBookView.swift` API client + Tail/Fade buttons on PickCardBack.
4. iOS: Billfold YOUR BOOK + quick-log + self-grade.
5. Web receipts sharpening.
6. Share card variant.
7. Full verify-fix loop until green: builds via KINGSTON derived data, GaryTour where applicable, edge-fn dry runs, suite runs. Repeat per founder instruction until 100%.

## Risks / execution notes

- Hot tree: `main` carries uncommitted parallel-session edits (ContentView/HubView/SupabaseAPI/DesignSystem/pbxproj). Full `git status` + `diff --stat` before touching shared files; commit only my files.
- Xcode-open clobbers disk edits: check Xcode is closed before iOS edit runs.
- Fade odds precision: est.-flag rather than fake precision.
- Paywall interaction: whoever can see a pick can tail it; when the paywall flips Sep 9, Winners tails become member-only implicitly. No special handling.
