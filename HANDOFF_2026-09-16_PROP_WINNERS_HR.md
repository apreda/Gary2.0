# September 16: daily prop Winners, HR audit, fresh Google data

## Founder direction

Props belong on Winners, up to five or six per day across active sports, fewer or zero if the evidence is weak. Keep Sol as the props primary. Investigate HR performance and underlying inputs. Open business Search Console and explain the reviewer kit. No outreach authorization was given in this turn; existing pitches remain drafts and the September 20 campaign hold remains.

## Live props and Winners

September 16 has 28 CORE and 14 HR props across 14 of 15 MLB games. Yankees–Twins (5060045) missed its pregame retries during the earlier revoked Codex/unsigned-Claude episode. That historical gap remains; no retrospective pick was created. Today's original props were produced before the Sol switch, by Luna or Sonnet. Sol connectivity is verified separately and the new Winners comparison below actually ran on Sol/Plus.

The old prop admission path used the game-card checklist and rejected every candidate, including omissions of price/counterarguments and real unsupported claims. It also exhausted the Plus quota without a Claude path. The new `daily-props-v1` selector reads the full original evidence and public rationale, assesses the exact priced prop and compares supported cases. It does not repair or rewrite a published rationale. Unsupported central claims remain ineligible; brief prose alone is not a veto.

- Hard maximum six CORE props per Eastern day across MLB, NFL and NCAAF. Zero is valid. HR/TD stay in their existing separate fun lanes.
- Chronological slate thirds reserve 2/4/6 places; equal starts stay together. Unused early capacity carries forward. Read within T-90; allow peers until T-65. No after-start admissions.
- Maximum two props per game, one per player/day. Compare evidence and price, not uncalibrated confidence numbers.
- Sol/high on dedicated Plus for Winners comparison, then Claude Sonnet/Fable subscriptions on provider failure. Personal Pro excluded. Ordinary props generation remains Sol/medium and its existing Claude cascade.
- Full input snapshots, decisions, source/rationale quotes, model and timing are retained in private `winners_prop_selection_runs`. Whole records are batched when required, never truncated; a final read compares validated findings across batches.
- Database leases, one global daily advisory lock, exact unchanged snapshot checks, source quotes, slate status and kickoff checks, atomic publication, duplicate and capacity checks. Idempotent commit retry does not rerun a completed model read.
- Existing web/native Winners already render prop board entries. Original pick, price, rationale and results contracts are unchanged. Existing simulated bankroll assigns props 0.25u, subject to its cash/exposure limits.
- Ordinary incident email collector reads a small private health view, alerts on failed/expired comparisons, and clears after a completed comparison. A valid zero-selection decision is healthy. No recurring AI monitor added.

Live receipt: selection run 1 completed on codex-gpt-5.6-sol / codex-plus, reading four original props. At 2026-09-17 01:25:44 UTC it admitted George Kirby over 5.5 hits allowed (-105) before 01:38 UTC and Merrill Kelly over 1.5 walks (-152) before 01:40 UTC. Kelly under strikeouts was a lower-ranked lean and excluded by player concentration. Kikuchi under strikeouts was unsupported by its central premise. No historical Winner was backfilled. `com.gary.winners` reloaded idle at 01:27:04 UTC as PID 94697.

Two applied migrations: `20260917011158_winners_daily_props.sql`, `20260917012429_winners_props_monitoring.sql`. The hosted migration service may assign its own applied timestamps. Old game selection/coverage functions are unchanged. Old prop per-card review no longer claims prospective candidates; old public release cannot bypass the new selector.

## HR findings and fixes

September 9–15: 14 wins, 63 losses, +7.64u at flat 1u risk and recorded original prices. September 14–15 alone: 2 wins, 23 losses, -14.30u. September 16 is excluded from these completed-day figures. A low longshot hit rate alone is not a profitability calculation.

All 25 September 14–15 HR results were independently matched by player/game to fresh BDL box scores; all actual HR counts and win/loss grades agreed. Audit artifact is in the task workspace, `HR_GRADING_AUDIT_2026-09-16.json`. No grade correction was warranted.

Fixed concrete defects:
1. HR prompt required a pick whenever a board existed. It now permits at most one, including a genuine pass.
2. HR shortlist could retain zero/negative estimated price gaps. It now requires finite positive gap and model estimate above the actual offered-price break-even point, within the existing odds cap and over 0.5 market. This heuristic is not a calibrated profitability guarantee.
3. Dedicated HR-only runs bypassed the screen and reused the two-core-props request. They now use the same HR screen and HR-only request. Thin core menus request only the available number of eligible candidates. Unsupported shortlisted HR markets cannot leak back through the sheets or an unscreened branch; off-menu output fails visibly.
4. Historical player fetching was tied to offered markets, so matchup context could omit starters/opposing hitters without odds. The props lane now resolves all 18 confirmed batters plus both starters, using actual BDL player IDs (never MLB person IDs). Ambiguous IDs, provider errors and empty required history fail visibly. A live Mariners–Angels read confirmed all 20 histories, including Kikuchi's 11 rows and Kirby's 28.
5. Starter HR tendency used to apply to every hitter plate appearance. It now scales only the expected starter share (expected batters faced / nine). Replay supplies the same workload field. This remains a simple screening estimate; future performance must be observed.
6. Core prop asks now explicitly request exact price/line reasoning, contrary evidence and sample/role context. MLB additionally disallows inferring batter-specific pitch weakness from pitcher-only evidence. The frozen MLB GAME decision engine was not changed.

The new HR generation policy has not produced a new live published HR card yet: all September 16 future games already had immutable published props. Do not regenerate completed cards to create an artificial demonstration. The live input read, prompt/selection tests and grading audit provide current verification; subsequent scheduled games will establish prospective output/performance.

## Verification

Full `npm run verify`: backend 394 files / 4,310 tests, edge helpers 242 tests, web 78 files / 890 tests, and Next/TypeScript checks passed. New local PostgreSQL tests exercised concurrent/idempotent cap enforcement, zero selection, no repeated completed readings, late/live-game rejection, fabricated citations, unsupported grades and private access. Additional incident tests and private health-view checks passed after the full suite. Live model selection and source-history read passed. The known private `ios/GaryApp/GoogleService-Info.plist` is intentionally unchanged/uncommitted. No Apple upload or App Store action was performed.

See `GaryMarketing/launch-2026-09/SEARCH_CONSOLE_2026-09-16.md` for authenticated fresh Google findings and the accepted homepage indexing request. Commit/CI receipts are in the task completion record.
