# Verified NFL historical measurement correction

Applied and independently read back September 8, 2026 at 06:51:34 UTC through migration `20260908065134_correct_verified_legacy_nfl_touchdown_measurement`. The actual is now 1; the result remains `won`. The original parent, ticket identity, date, nullable game/sport fields and creation timestamp remain intact. Only the measurement and normal update timestamp changed.

The December 21, 2025 Travis Etienne Jr. Anytime TD over 0.5 result contains `actual_value = 0` and `result = won`. The win is correct; the saved measurement is not. The official Jaguars [scoring summary](https://www.jaguars.com/game-day/2025/reg-week16/jaguars-at-broncos/scoring-summary) records his receiving touchdown. The official [NFL gamebook](https://static.www.nfl.com/image/upload/v1766403331/gamecenter/f8fa1a18-311e-11f0-b670-ae1250fadad1.pdf) independently records one receiving touchdown and zero rushing touchdowns.

Observed original public-result fields:

| Field | Original value |
| --- | --- |
| id | `7f4f0472-64ed-4a2c-870d-897bf333f6be` |
| prop_pick_id | `58efb81a-6459-430d-a6a3-0f50a07c1935` |
| game_date | `2025-12-21` |
| player_name | `Travis Etienne Jr.` |
| prop_type / bet / line_value | `Anytime TD` / `over` / `0.5` |
| actual_value / result | `0` / `won` |
| matchup | `Jacksonville Jaguars @ Denver Broncos` |
| sport / game_id | `null` / `null` |
| created_at | `2025-12-21 21:37:06.646+00` |

The original ticket is not recoverable in the retained parent array, so this is a measurement correction to the existing result, not a claim of newly recovered pregame evidence. No original pick, line, odds, matchup, published reasoning or win/loss grade is changed. No missing sport or game identity is invented.

The [migration](../../../gary2.0/supabase/migrations/20260908065134_correct_verified_legacy_nfl_touchdown_measurement.sql) resolves and locks the existing row by its complete public ticket identity before changing only `actual_value` from 0 to 1. Generated database IDs are not embedded in the migration. An already-corrected value of 1 is an idempotent no-op; duplicate identity or changed prior state aborts. An environment without this historical row is unchanged. The sole noninternal trigger on `prop_results` is its normal timestamp update. No notification, user-bet or grading trigger is attached to this table. The correction did not run the grader or recalculate public records.

Validation: all 11 isolated PostgreSQL operational-repair cases passed, including eight correction cases for field preservation, an unrelated alternate line, repeat application, missing history, changed values/grade/identity and duplicate matching rows. An initial attempt through the read-only query interface was rejected before any write; the audited migration then succeeded through the migration interface. A separate read-only query confirmed `actual_value = 1`, `result = won` and `updated_at = 2026-09-08 06:51:34.070796+00`.
