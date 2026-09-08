# Hub 917: restore the research baseline

Adam’s September 8 correction supersedes the unapproved judgment-first 916 feature. The immediate request is to restore the earlier gray-card Hub and original observational content, then discuss subsequent changes. This work is directly on canonical main.

## Current status

Restoration is complete on main and verified in the installed optimized Simulator build **2.25 (917)**. This is the restored baseline for Adam’s next discussion. The native input snapshot is the coherent checkpoint before the separate release task’s provider-source migration; it is not the final distribution/rights-ready candidate. No new archive, export, upload or submission was performed.

## User intent and scope

The Hub should surface the fact, anecdote or useful connection a person would otherwise hear during a game and wish they had known beforehand. It should make independent research quick through original observations and player, team and exact-game cards. Full game opinions belong in the existing Picks experience.

Restore the 914/915 gray lead, grouped supporting reads, original section placement and prominent League Pulse/Last Night tools. The saved Texas bullpen 18-IP lead and Cal Raleigh supporting-read captures establish the requested baseline. The two attached temporary screenshot paths were missing; matching saved captures were inspected.

The new judgment overlay must not reorder or suppress original observations, replace their headlines, or intercept their search and detail actions. The existing inline MLB Fantasy watch remains; no separate MLB Fantasy tab returns. NFL retains its weekly Fantasy desk. Current correctness and accessibility repairs stay in place, including exact-game/date identity and fixed head-to-head/innings calculations.

Header consolidation, shorter contextual copy, new series/sweep research and future lead-selection refinements are retained for discussion after the baseline is restored. They are not being added as speculative features in this step.

## Runtime

The dedicated `com.gary.hub-judgments` service was disabled and unloaded reversibly at 18:53:53 UTC. Its plist and stored research remain. Ordinary collectors now run without judgment synthesis; `--with-judgments` and `--judgments-only` are explicit opt-ins. Source filtering, ranking, duplicate selection and category limits ignore retained judgment metadata unless an explicit synthesis succeeds. The H2H, innings and source-provenance corrections remain. Other workers and data were not removed.

Backend commits: `8ed1c855` and `229bd73d`. Native restoration: `efd46e68`. Build-number reservation: `e6c726db`. Independent source review found no remaining restoration blocker. Native focused tests passed 69/69 across five suites; backend tests passed 36/36 and the subsequent overlapping 25/25 targeted checks. These are focused restoration checks, not a newly rerun full-app suite. Exact commands and receipts are in the evidence folder.

## Evidence

Evidence folder: `/Users/adam.preda/Documents/ChatGPT/Gary/hub-restoration-2026-09-08`.
The current product plan is `/Users/adam.preda/Documents/ChatGPT/Gary/HUB_PRODUCT_AND_DESIGN_PLAN_2026-09-08.md` (Version 4). The prior plan and 916 receipts remain historical, not current approval evidence.

## Actual build and app verification

The optimized arm64 Release Simulator build succeeded. All **131 public native inputs** matched the captured source through compilation. The source checkpoint was `229bd73d`, with the release owner’s already present FootballGameIntelView attribution-only edit recorded in the manifest. Protected Google/SecretsLocal configuration was excluded from inspection, hashing and commits. Build receipt: `simulator-build-receipt.json`; complete build log: `/Volumes/KINGSTON/gary-hub-917-restoration-simulator.log`.

Installed on iPhone 17 (Gary), `709A9235-5F15-40D3-BA98-F7693C47B640`. Executable SHA-256: `ca3d20d1eb2ed497ae4f6b74e2ac8aaa6ce0682cbb65e5000dbd717ba037a7db`.

Actual Simulator checks confirmed the original Texas bullpen 18-IP lead and gray supporting Cal Raleigh row; Cal’s exact TEX/SEA player card; original TEX/SEA game research including bullpen, heat check, head-to-head and streak; Rangers team card with the same exact game; and section navigation into the restored League Pulse table. Named dismissal controls worked and background dock controls stayed absent from the game modal accessibility tree. Last Night and the original specialist-section entries remain available; inline MLB Fantasy and NFL routing are covered by the focused native fixtures.

Independent static review compared the new top screen with the saved 915 baseline and reviewed League Pulse. No source or visual blocker was found. The original copy is deliberately restored too: existing bullpen/player prose still contains interpretation. Concise factual copy, lead selection, header consolidation and new series/sweep research are the next discussion, not claims of finished editorial changes in this restoration.

Actual swipes, a complete physical VoiceOver/Reduce Motion walkthrough and final-release provider/sign-in acceptance were not established by this local restoration check. The earlier Mac gesture-tool limitation remains documented. This is not a new full-app test run or an App Store readiness assertion.

Screens: `screens/01-restored-hub.jpeg`, `02-cal-raleigh-card.jpeg`, `03-texas-seattle-game.jpeg`, `04-rangers-team.jpeg`, `05-league-pulse.jpeg`; corresponding accessibility text is retained beside each image. Review entrypoint: `/Users/adam.preda/Documents/ChatGPT/Gary/hub-restoration-2026-09-08/README.md`.

The restored Hub’s local build/source/GUI work is complete. Native source and Simulator coordination were released to the submission owner; subsequent provider-source changes require their own final build verification. All protected 915 artifacts/installations remain unchanged.
