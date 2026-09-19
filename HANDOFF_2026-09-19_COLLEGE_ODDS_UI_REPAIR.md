# College data, quote integrity and native layout repair — September 19

Adam authorized the audit fixes and the four screenshot repairs. Work is in the canonical production checkout on main. Preserve the other session's staged Winners deletions, deno.lock change, audit evidence, and private GoogleService plist.

## Implemented

- NCAAF game decisions and the personal-account recovery route use Sol at high effort. Other leagues retain their model policy. Preflight caching is keyed by the actual routes, so an earlier MLB preflight cannot stand in for college Sol availability.
- College uses the common research/decision sequence with five grouped research factors retaining the original factor tokens. The desk automatically includes current QB/availability/staff reporting and defensive evidence. The shared research cache crosses process boundaries and avoids repeated CFBD bulk downloads and repeated game-context searches.
- College context joins reported names to BDL rosters, retains actual retrieved source URLs, rejects stale/future citations and known conflicts with retrieved page ages, and distinguishes confirmed/projected starters from unknown. Where transport metadata lacks a publication date, the reported date remains attributed to the search report, not independently verified. No public availability report is unknown, never a healthy roster. A bounded formatting repair can preserve incomplete reporting; it cannot promote prose into a starting-QB confirmation.
- NFL defense is automatically included: EPA/success/explosive rates, red-zone defense, sacks and QB hits. Missing PFR charting stays explicitly unavailable. College receives BDL defense/disruption and CFBD success, explosiveness and scoring-opportunity evidence. Missing measurements no longer render as zero.
- Prop prices retain the exact side's book and original provider row, survive in immutable quote receipts, and are fetched again after analysis. Changed lines, sides, players, markets, games, books or prices are withheld; prices are never silently rewritten. A 300+ milestone retains its over-299.5 ticket meaning.
- The MLB parser now retains the selected spread's sign and selected price. Publication rejects disagreement between written and numeric ticket fields.
- Ordinary content coverage is pending until 06:30 ET, reflecting the actual 06:00 run. Changed health failures/warnings retain incident-time evidence instead of only overwriting latest.json.
- Native: both named college starting-QB plates, opaque reading panels, wrapping injury/status/research text, equal Hub tile dimensions including the odd last tile, and removal of the shared team-card gold rule. Picks mounts only the selected heavy page and its neighbors. Shared panels use one smaller shadow; receipt formatters are reused.

## Live data repair and evidence

The final readback after refreshing all 53 September 19 college games contains **110 collector rows: 40 named QBs and 70 injuries across 33 games**. Ten games have both named QBs. Twenty-one games have a usable report for both teams, including explicit uncertainties; **32 still have incomplete/rejected reporting**. This is not full starter/availability coverage. Missing source evidence still blocks a game decision rather than being disguised as a model failure or invented data.

Georgia–Arkansas was repaired and checked in the simulator: Gunner Stockton and KJ Jackson have separate player plates and actual dated player statistics. Current confirmed/projected status follows the latest validated report. The published availability includes the season-ending Maddox Lassiter status without an ellipsis.

Three historical MLB numeric tickets were corrected against their saved FanDuel rows, with original values retained in ticket_integrity_correction:

| Date | Game | Correct selected ticket |
| --- | --- | --- |
| September 17 | 5060060 | Athletics +1.5, -102 |
| September 17 | 5060061 | Padres -1.5, -128 |
| September 18 | 5060081 | Giants +1.5, +122 |

Their grades were already correct. Chase Burns over 0.5 at -187 matched Gary's saved menu; no evidence established -400 for that same saved quote, so it was not rewritten. BDL's [MLB prop documentation](https://mlb.balldontlie.io/#player-props) describes a live feed without historical snapshots, which is why Gary now retains its own immutable receipt.

The Bowling Green–Iowa State canary completed the full common sequence on **codex-gpt-5.6-sol** in **405 seconds**, including bilateral cases and the final decision. It was deliberately run with --store=false. Plus was capped; the already authorized personal-account game recovery route worked. The rehearsal is not an additional published pick.

## Verification and delivery boundary

- Full verification: **409 backend suites / 4,414 tests**, **242 edge-helper tests**, **88 web suites / 935 tests**, and Next/TypeScript pass. Initial parallel Swift compile timeouts passed with bounded concurrency. Later collector/routing changes passed 34 targeted tests; formatting/evidence boundary checks passed separately.
- Simulator Release **2.26 (932)** compiled successfully. Dedicated simulator checks confirmed equal Hub tiles, no gold team-card rule, opaque college panels, full player identities and expanding injury text. This is not a physical-device frame-time benchmark.
- Clean-checkout web smoke passed Home/Picks/Results/export and other routes until the existing **/archive/sitemap.xml 500**: connection() called outside a request scope. Reproduced on unchanged HEAD 07b70267. No web source was changed in this repair.
- Device archive failed when **/Volumes/KINGSTON disconnected** during compilation (device-not-configured / disk-I/O errors). Do not describe it as a completed signed archive.
- No TestFlight/App Store delivery occurred. The existing Apple account authentication gate also remains. Do not repeat the unchanged failing upload, withdraw the shipped version, or claim 932 is available to testers.
- Last health check had no failing coverage checks; warnings were internal free space (8.4 GiB) and an empty NCAAF Wire feed. Preserve the private plist exception and unrelated pending changes when assessing production parity.

Detailed logs, source samples and screenshots are in `/Users/adam.preda/Documents/ChatGPT/Gary/repair-2026-09-19/`. The earlier audit and fix plan remain in the adjacent `audit-2026-09-19/` directory.

## Outstanding work

Restore the external drive to finish the device archive, then restore Apple account access and verify the available version/build before distribution. The source collection still needs better current reports for the 32 incomplete college games; cached diagnostics identify each team and rejection. Do not substitute passing leaders for starters or make missing injury reports look healthy. The unrelated archive-sitemap baseline failure remains a separate web repair.
