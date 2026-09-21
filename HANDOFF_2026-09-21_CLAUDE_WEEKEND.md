# Claude handoff — Gary, September 19–21, 2026

Claude — Adam is done for today and asked for a consolidated handoff of this task and the other agents’ work since Saturday, September 19. This document consolidates repository history, current local changes, dated delivery receipts and relevant Codex task conversations. It is a handoff, not authorization to start a release, run tests, regenerate picks or resolve historical tickets.

Prepared September 21 at approximately 2:50 PM Eastern. The runtime and delivery facts below are attributed to their recorded checkpoints; I did not run a new production audit while preparing this document.

Updated September 21 after Adam authorized NFL market awareness and the single Colts–Chiefs replay completed at 4:21:59 PM Eastern. The current NFL section below replaces the earlier question wording and records that real replay. Other operational facts retain their stated checkpoints. The later [Jev props handoff](HANDOFF_2026-09-21_JEV_PROPS.md) supersedes the earlier prop-implementation snapshot below; NFL game context has its own separate authorization and [handoff](HANDOFF_2026-09-21_NFL_MARKET_AWARENESS.md).

## Start here: current state and working rules

- Canonical checkout: `/Users/adam.preda/Gary2.0`, branch `main`. Backend: `/Users/adam.preda/Gary2.0/gary2.0`. The Desktop location is a compatibility symlink. `/Users/adam.preda/Documents/ChatGPT/Gary/repo` is retired; do not work there.
- At handoff, local `HEAD` and the local `origin/main` tracking ref both equal `5d4d430e48879d9c2862061e87740a6c5c1bc7c5`. No remote fetch was performed for this handoff. There are intentional uncommitted changes listed below.
- Latest confirmed native delivery is **TestFlight 2.26 (944)**, uploaded September 21 at 11:59:51 AM ET; Apple confirmed availability at 12:01:39 PM and processing at 12:02:01 PM. Today’s subsequent native edits are **not in 944**.
- The last recorded public App Store check returned **2.25** in the US and Canada. TestFlight 2.26 is not proof of a public App Store update. This handoff does not recheck Apple.
- Read root `AGENTS.md` and `gary2.0/CLAUDE.md`. Adam explicitly changed his iteration rules today: **do not add or run tests unless he asks; do not show screenshots as proof or ask him to review them; do not archive/upload/TestFlight until he asks; do not push if that would indirectly trigger tests or release workflows.** He checks the actual app and reports whether the output is correct. “Today is done” here requests a handoff, not a release.
- These rules supersede older automatic verification, production-audit and TestFlight instructions in handoffs and maintenance docs. Historical green tests describe earlier revisions; they do not validate today’s unbuilt edits.
- Preserve others’ local work. Never commit the real `ios/GaryApp/GoogleService-Info.plist` or print its contents. The previously pending Deno lockfile metadata and NFL historical audit snapshot were intentionally committed in Sunday’s `44dfa1d1` closeout; they are no longer outstanding exceptions.
- Follow Adam’s current design request. No historical screenshot or deleted style guide is an independent requirement. He rejected the grey research-container fill on Saturday; retain the restored dark containers.
- No new recurring AI reviewer, five-minute repair monitor or launch-review automation. The first two were rejected/deleted earlier; the daily launch review was deleted at Adam’s request on Sunday.

## Prop-market issue — initial 2:50 PM checkpoint

**Later update:** The [Jev props handoff](HANDOFF_2026-09-21_JEV_PROPS.md) records the subsequently implemented standard-market corroboration and −179 floor. The following paragraphs describe the earlier checkpoint, not the current implementation. Scheduled publication remains to be observed in that handoff, and the original McCaffrey ticket's disposition remains unresolved.

This was found in another agent’s task and is **not fixed** by the quote-integrity repairs or Monday’s grading repair.

Adam flagged Christian McCaffrey **UNDER 104.5 receiving yards** and explicitly said props must be **−179 or better**. He then said: **“No alt lines ever for anything we will never use alternative lines. Only the normal standard lines.”**

The prior agent reported that BDL/FanDuel supplied receiving yards 104.5 at −113/−113 and the existing verifier merely confirmed that same provider row remained available. Its suggestion that the number belonged to rushing-plus-receiving was an inference, not an established provider explanation. That task proposed standard-market identification, corroboration across books, rejection of isolated incorrect lines, and repeating verification before publication; it did not implement them or resolve the published ticket.

Direct source inspection for this handoff confirms `gary2.0/src/services/propOddsService.js` still defines `MIN_ACCEPTABLE_ODDS = -200` and still contains milestone handling. Do not describe standard-lines-only or the −179 prop cutoff as enforced. The historical −179 **game-moneyline** rule is a separate rule, not proof the prop path meets Adam’s requirement.

The earlier agent’s proposal included tests and a historical void/correction. Adam’s newer no-tests-unless-requested rule now governs testing, and historical ticket disposition still needs his decision. Do not silently reprice or rewrite the original McCaffrey prediction. Relevant task ID: `01a0bfaa-978d-7830-8827-a2686c1fecf0`.

## Today’s local work awaiting an explicitly requested build

### Football price and casing follow-up — other agent

`ios/GaryApp/FootballGameIntelView.swift`:

- Removed the raw board-moneyline fallback that displayed “Vikings −900.” The stat rail may show only the existing validated, exact-game pregame receipt.
- Football prose team labels preserve normal source casing instead of forcing “BEARS” and other names to uppercase.
- Saved after 944; no subsequent build, tests or screenshots.

### Picks design — this task

Adam said the ALL-22 / Availability / Pace & Script strip felt disconnected from the cards below it and asked to fix the whole section’s hierarchy.

`ios/GaryApp/Picks/EdgesSection.swift` and the contained `SignalRow` presentation in `ios/GaryApp/HubModules.swift` now:

- Add a **SLATE INTEL** heading with the total read count.
- Replace large icon/underline category tabs with compact horizontal capsule filters; the selected filter is gold, with a 44-point tap target and selected accessibility trait.
- Align the filters and research cards with the showcase pick’s 22-point horizontal margins.
- Keep the existing dark card fill; soften borders, quiet category metadata, reduce oversized metrics, move disclosure to the metadata row and improve headline/detail spacing.
- Preserve filter behavior, original observations, samples and metric/status values. These changes do not repair source data or alter injury classifications.

### NFL/NCAAF week labels and college archive — this task

Adam asked for Week 1 / Week 2 etc. without dates for NFL, then explicitly confirmed **both** when asked whether to add NCAAF week history too. NCAAF previously only had Today/Yesterday.

Files: `ios/GaryApp/Picks/PicksHistory.swift`, `ios/GaryApp/PicksTab.swift`, `ios/GaryApp/SupabaseAPI.swift`.

- NFL entries now show `Week N` / `Preseason Week N`, without the ISO date suffix or date-range subtitle. The current NFL choice uses the stored current week label when available, otherwise This Week.
- NCAAF now reads the existing thin `pick_day_index` and offers selectable weeks with saved game picks. Selecting a week reads only that seven-day range of original daily picks, props, results, slate rows and exact game/date research.
- College navigation computes Tuesday–Monday windows anchored to Labor Day Week 1, including Week 0. This is a calendar-derived navigation mapping, not newly persisted provider week metadata or a newly designed postseason scheme. Its index is based on published game-pick days, not every possible research-only day.
- Archive caches are scoped by league and week and retain at most three snapshots; old-week polling remains off. Current Today/Yesterday shortcuts remain; NCAAF’s ordinary Today view was not converted into a new weekly live-board engine.
- Multiple archived seasons receive separate menu headings. Other sports retain their date controls.
- Historical college ranks and interruption labels use the selected archive snapshot. Archive loading/failure/empty messages distinguish a week from a day.
- No schema change, migration, cloud deployment, pick generation or grading change was made for this feature.

**All three native follow-ups are saved source only. They have not been compiled, tested, visually accepted in the app, committed, pushed or distributed since Adam’s rule change.** Review the current diff when he requests the next build. Do not call them verified merely because 944 passed earlier checks.

## Current decision and evidence policy

### NFL: single-answer flow with NBA-derived market awareness and Jev

Base flow: commit `36fec924`, [NFL agency](HANDOFF_2026-09-21_NFL_AGENCY.md). Adam's later approved implementation and replay: [NFL market awareness](HANDOFF_2026-09-21_NFL_MARKET_AWARENESS.md), saved locally on main.

NFL’s substantive ask is now exactly **“What's the best bet at the posted number and price, and why?”** `nflPrompts.js` owns the NFL prompt. Both the posted spread and eligible moneyline remain available. Gary gets original evidence, the full research briefing and optional tools/researcher follow-ups. Football awareness is declarative context about personnel, continuity, samples, scoring sources, weekly circumstances and divisional history.

Adam explicitly approved adapting the historical NBA better-bet awareness to NFL: last week's strong/poor performances, blowouts and reputation can create possible overreactions or underreactions. The researcher supplies the contrast and context. Gary weighs the matchup, stats and data to decide whether that impression is misleading or reflects a genuine change. No calculated fair spread, betting percentage, demonstrated line movement, special statistic or certainty is required for a qualitative judgment. Claims of actual money flows or line movement still need evidence. No automatic fade, underdog quota, fixed point adjustment or factor-to-pick conclusion was added; CLAUDE.md's Layer 1/2/3 policy remains.

`src/services/jev/nflMarketAssessments.js` uses the shared Jev client to ask seven independent questions over bounded source excerpts and exact quotes: last-game contrast, each team's possible reaction, whether each team's circumstances are continuing or game-specific, and a useful source for each team. `agentLoop.js` supplies its tentative context after research and before the decision. Gary can accept or reject it; Jev does not choose the bet or supply cover probabilities. An unavailable assessment leaves the original evidence intact. Full desk/research context remains available to Gary. This NFL game integration is separately authorized from the other task's props-only implementation.

The implementation is saved for fresh NFL workers in the canonical backend; no scheduler restart is required for the module changes. The existing TypeSafe credential is used without being copied into source or documentation. `GARY_JEV_NFL_MARKET_ENABLED=false` disables NFL game assessment; the global `GARY_JEV_ENABLED=false` also disables it. No scheduled published NFL decision using this context has yet been observed. NBA's pinned April prompts, MLB's frozen June game lane, NCAAF decisions and locked injury handling remain unchanged.

Removed mandatory bilateral essays, investigation-complete markers, decision checkpoints, announcer openings, “Gary’s Take,” paragraph/word requirements, and the separate rationale-formatting/editorial turn. The first valid final JSON supplies the ticket and original rationale. Its whitespace, Unicode and line breaks are preserved. Malformed, empty, ambiguous or explicitly provider-truncated outputs fail the attempt; they do not trigger an editorial rewrite. Numeric audits remain diagnostics. Factual integrity, available-market identity, price constraints and existing failure recovery remain.

Sunday’s `38e13f0f` temporarily adapted the frozen NBA builders for NFL with separate case/decision/formatting stages. **That decision structure is superseded.** Its richer source collection and weekly team-reporting work remain. A separate read-only investigation recommended forcing a winner/margin/probability decision before the ticket; that recommendation is not the current authorized design. Do not reintroduce it.

Monday’s earlier agency-flow checks confirmed unchanged rendered MLB/NBA/NCAAF behavior. Its historical NFL fingerprint was `91ce9aac159a`; NCAAF’s `79ba03b9da61` changed because shared source files are fingerprinted, not because that change altered college’s prompts. Those are earlier checkpoints. The later market-awareness replay recorded NFL fingerprint `94a41d87ee33`. No test suites were added or run for market awareness; three existing literal-question expectations were updated. Adam declined a historical benchmarking/evaluation system and will judge the picks himself. His subsequent single-replay request is the limited exception below, not permission for additional runs or a broader benchmark.

### Actual Colts–Chiefs replay — one completed run, original output retained

Adam asked whether yesterday's game could be replayed without today's stats or the known result contaminating the inputs. One isolated replay completed September 21 at **4:21:59 PM Eastern**:

- Original September 20 pick: **Kansas City Chiefs −6.5 at −102**.
- Replay pick: **Indianapolis Colts +6.5 at −120**, Gary's stated confidence **0.56**.
- Same model as the original game: **codex-gpt-6-astra**. This did not change production model routing.
- Jev **jev-1.13.0** completed in **594 ms**, reporting **9,330 input tokens**. It identified the strong-Chiefs/poor-Colts contrast and possible overreaction to Indianapolis's poor opener; its top Kansas City interpretation was reasonable adjustment.

The original pregame capture was checked against its saved message hashes. The saved desk, original researcher briefing, pregame tool results and exact prices were reused with the current prompts and Jev helper. The researcher was not regenerated. Web, shell, apps and plugins were disabled. No fresh stats, articles or odds were fetched, and the actual result, previous Gary pick/rationale, user's desired side and current conversation were not supplied to Gary. There was one completed decision, no reroll and no rewrite of the explanation. Nothing was published or stored as a production pick.

Gary's actual opening, unchanged:

> I think the opener contrast exaggerates the durable gap enough to give Indianapolis a small edge getting 6.5. Kansas City deserves favoritism, but covering requires winning by at least seven.

His full rationale then used the saved matchup evidence, considered the Chiefs' pressure/run-game case, and explicitly accounted for −120 and missing the full seven. The complete original text and receipts are available here:

- [Full original response](</Users/adam.preda/Documents/ChatGPT/Gary/nfl-market-replay-2026-09-21/gary-response.txt>).
- [Readable result and complete rationale](</Users/adam.preda/Documents/ChatGPT/Gary/nfl-market-replay-2026-09-21/result.md>).
- [Every application-visible prompt and response](</Users/adam.preda/Documents/ChatGPT/Gary/nfl-market-replay-2026-09-21/complete-replay.md>).
- [Run manifest and frozen-input hashes](</Users/adam.preda/Documents/ChatGPT/Gary/nfl-market-replay-2026-09-21/manifest.json>).
- [Exact Jev request and response](</Users/adam.preda/Documents/ChatGPT/Gary/nfl-market-replay-2026-09-21/jev-request-response.json>).

The raw Gary response SHA-256 is `43015677576efab9e54dbaa12ebe6bb123be667100e4f0bbd9ab6c8453e68781`; its model session is `01a0c5a0-bc57-7343-a983-bd8d541646e2`. This is real model output from the requested replay, not a demonstration answer written to match Adam's example. It establishes that the requested reasoning appeared in this run. It does not isolate Jev's contribution, establish predictive accuracy or guarantee that model prior knowledge was absent. Adam welcomed the result and explicitly requested that this Claude handoff be updated. Do not turn that acceptance into permission to rerun until a preferred side appears or rewrite the historical ticket.

### Preserved sport boundaries and routing

- **MLB:** frozen June decision engine remains. Approved mechanical fixes to recent-player-log windows, bullpen playing dates, rest and Statcast date windows are allowed exceptions; they do not authorize prompt redesign. Latest recorded June/game fingerprint is `9d3d2be7e50e`; prop fingerprint `f5843ba2d3f8`.
- **NBA:** pinned April 8 prompts and seasonal features remain. Do not infer permission to align them to the new NFL prompt.
- **NCAAF:** Sol, high effort for game decisions; college props also start on Sol. Eligible games include either team in ACC, Big Ten, Big 12, SEC or the current Pac-12, plus Notre Dame. Boise State’s 2026 Pac-12 membership is intentional. One game pick and at most one player prop per eligible game.
- Active subscription recovery: Claude subscription → business GPT subscription → personal GPT subscription → configured DeepSeek last, with sport/model-specific routing retained. Paid Anthropic/OpenAI adapters are disabled; do not restore them because an old handoff suggests an API key. College remains Sol on GPT.
- Five cloud consumers use the private Mac subscription worker: social-auto-post, grade-results, reply-engine-scan, engagement-sheet and book-slip-scan. Mac availability still matters; this is not a silent paid-API fallback.
- No favorite/underdog quotas or new opinion-review gates. Missing data stays missing, never zero, healthy, or a fabricated starter. Original published tickets, rationale and research remain immutable except expressly approved, auditable historical corrections.
- Injury handling remains locked to explicit authorization. Prior approved display repairs do not authorize changing duration rules, status semantics or protected source modules now.
- Winners admission remains server-owned. Do not restore client-side favorite/underdog selection.

## Saturday: college, markets and backend recovery

The morning college repair corrected exact school joins (Georgia Tech must not receive Georgia’s stats; Iowa State must not receive Iowa’s), actual named-player versus team-total distinctions, current roster/QB/staff reporting, partial-team stat retention, defensive evidence and missing-value handling. Official current staff-directory pages now accept ordinary academic-year labels such as 2026–27 without being treated as fresh QB/injury reports.

College was resumed within Adam’s authorized scope on Sol. The scheduler no longer kills a healthy college run solely because another retry trigger approaches; kickoff and no-backdating restrictions remain. The unnecessary prose-to-ticket AI rewrite and college publication requirements for particular case headings were removed. Exact touchdown YES tickets resolve only against a unique matching player/market/side/price. Missing props are retried without creating a second prop for an already covered game.

The midday checkpoint was 49/50 eligible college game picks and 34 props; some QB/availability reporting and sixteen prop boards were missing. Those figures are dated, not current coverage. Fresno’s later normal recovery published **Fresno State −4.5 (−115), FanDuel** at 8:25 PM before its 11 PM kickoff. The later launch review recorded **65/65 eligible Saturday games stored**. Do not keep describing Fresno as unresolved, or interpret game coverage as complete prop/research coverage.

Market integrity improvements retain immutable side/book/provider receipts, recheck the exact quote after analysis and reject disagreement between written and numeric tickets. Three saved MLB numeric spread fields were corrected from retained FanDuel rows, with original values recorded: Athletics +1.5 −102 and Padres −1.5 −128 on September 17, Giants +1.5 +122 on September 18. Their grades were already correct. Chase Burns over 0.5 at −187 was not rewritten to an assumed −400 because an equivalent historical quote was not established.

`backupGameOdds.js` supplements missing or reversed game markets with named sportsbook outcomes from The Odds API, preserving BDL game identity, kickoff, team names, book, source event and timestamp. The cached league board is shared across processes. It applies to MLB/NFL/NCAAF game boards; it did not add a player-prop fallback or change NBA sourcing. The replacement credential is only in the ignored local environment; never copy it into a handoff or client.

**Still unresolved:** BDL’s neutral-site ordering supplied Arizona State +5.5 and Virginia +10.5 where the named FanDuel markets made those teams favorites. Those original picks/rationales chose the bad lines; this was not a client-only sign error. Neither was on Winners. Adam has not chosen historical voiding versus an explicitly labeled correction. Do not silently flip the picks. The recorded native result formatter also needs proper VOID presentation if voiding is selected.

Operational fixes:

- Health reports retain same-day, league-specific publication evidence during read failures instead of reviving already-resolved failed attempts. Real current read failures still surface.
- Winners display reads were reduced from roughly 25 MB to about 22 KB and use bulk writes. Reconciliation reads lightweight receipts first and loads desks only when necessary. Comparison work respects its lease with bounded claim/finish calls and timestamped logs.
- The Braves–Astros failure was real input bloat: a requested recent player log returned a season and exceeded CLI/context limits. Both June callers now honor the requested game count while retaining complete source fields, relief appearances and zeroes. Recovery stored **Braves ML +114** at 5:26 PM.
- `gary_ops.social_requests` now shares pg_net’s unlogged crash lifetime, preventing recycled request IDs from blocking scheduled social enqueue. Two applied migrations are `20260919213333_align_social_request_lifetime_with_pg_net` and `20260919213627_prune_completed_pre_restart_social_lookups`. Durable publication/incident/email records were not deleted. The next scheduled X run succeeded.
- Wire may publish supplied completed-game recap facts without redundant search; it must not invent fresh reporting. Missing football markets now appear as actual no-board reasons in existing incidents.
- Coaching parsing recovered already-sourced entries without rewriting predictions; the later checkpoint confirmed coaching evidence for both teams in all 50 eligible college games.

**Database restart diagnosis remains open.** Multiple Postgres restarts and HTTP 521/PGRST002 outages were observed. Load reductions and recovery receipts do not establish the root cause. Adam deferred dashboard sign-in/log inspection. Do not declare this permanently repaired or increase paid compute without authorization.

## Saturday night: dates, native design and code ownership

- Bullpen workload uses the actual baseball playing date, preserving ordinary games across midnight while splitting verified suspended/resumed sessions. Exact pitch timestamps still own elapsed rest hours. The Giants/Foley/Seymour/Abner example was repaired prospectively; original evidence and published predictions were not rewritten. Dated clearance-report requirements remain separate from measurable workload.
- Shared Eastern calendar-key arithmetic fixes DST, date-only and season-boundary mistakes across grading, recaps, streaks, lineups and other readers. NFL windows remain Tuesday–Monday with their existing trigger allowance. Web rollover now matches native at 6 AM ET; Billfold uses 7 AM Eastern wall-clock time. June rest and Statcast windows received approved mechanical date corrections.
- Four cloud entry points were deployed in that date repair: grade-results v41, grade-props v25, mlb-field-lineups v14 and social-auto-post v124. These are recorded September 19/20 versions, not a new live check.
- Native two-pass work covered current MLB/NFL/NCAAF surfaces, fixing stale responses, prop game-ID decoding, exact result presentation, research navigation, duplicate intel, lazy history rendering and unused polling. A broad cleanup removed obsolete screens while keeping NBA and historical readers.
- Design follow-ups fixed opaque bottom navigation, Hub headings and report anchors, Pulse wrapping, Last Night/full-name layouts, recap behavior, losing-ticket contrast and settings duplication. The rejected grey fill was restored to dark in build 936.
- Home’s record/net/win rate now uses the selected sport and loaded slate date. Sports with active games lead the tabs. NCAAF uses school names and dated AP ranks; build 939 renders rankings as small raised numbers. Rankings never alter identity, quoted tickets or admission.
- Website’s approved gold stadium collection and college school-name presentation were published Saturday.

The architecture cleanup was completed through build 941: one BDL facade with endpoint-family modules; focused pick discovery/shaping/storage/publication modules; separate results provider/grading/storage/enrichment coordination; scheduler clock/discovery/process helpers; native `Home/`, `Hub/`, `Picks/`, `Book/`, `Models/` ownership. Home’s initial request wave fell from 20 tasks to 10. Shared date/ticket/provider boundary contracts and fixtures were introduced. It is not a claim of full JavaScript type coverage or permission to rewrite frozen prompts.

Ownership references: [architecture](docs/maintenance/ARCHITECTURE.md), [cleanup receipt](docs/maintenance/CLEANUP.md), [contracts](contracts/README.md). Their older automatic-test/release prose is subordinate to today’s rules.

## Sunday: NFL evidence delivery, narrative QBs and native lifecycle

NFL player tools now join individual season stats to current roster IDs instead of attributing team totals to a named player. Prior-year player history can follow a player’s team change, with actual season/sample and explicit unavailable fields.

The research transport had several real failures, all repaired in the recorded Sunday work: read tools lacked annotations; stdio MCP did not inherit the BDL credential; then it failed to inherit the parent request-rate setting and defaulted to three requests/minute. The bridge forwards only allowed environment-variable names, resolves the shared cache from the backend location, rejects failed/unfinished tool calls, and keeps shell disabled/read-only model context. The configured limiter remains enabled; the fix did not raise the provider rate limit.

Both teams receive upfront offense/defense, early-down/red-zone/pressure/tempo data, separately labeled team aggregates, available charting and named snap usage. Current samples remain separate from prior-season background. Team-specific last-game/offensive/defensive reporting preserves original publisher text, dates and attribution; later identity/weekly-adjustment reporting remains from Sunday’s research expansion. Missing charting and blocked publishers remain visible.

Some old worker attempts were stopped and replaced only while unpublished. Their temporary PIDs in Sunday handoffs are historical, not evidence of a still-active run. Do not duplicate a retry based on an old handoff.

Commit `0d9fe9ef` makes NFL QB insight boxes narrative prose grounded in each named starter’s verified sample, consistent with the pitcher/college QB presentation. The owner recorded all 32 entries refreshed and successful production checks.

Native build 942 keeps Thursday’s NFL grade visible through the week and moves confirmed finals behind unfinished games while preserving selection. Build 943 fixes the clipped incoming-card header/logo by sharing the published card’s header/background and spacing. Published-ticket appearance and identity were preserved.

## Monday morning: NFL settlement and retained research — shipped in 944

Commit `5d4d430e`; [full receipt](HANDOFF_2026-09-21_NFL_HISTORY_944.md).

- Yesterday and older games now read saved research by exact game/date instead of hiding Today-only data. CIN–HOU’s original Burrow/Stroud information was restored without regeneration.
- The app loads one selected NFL week on demand, including original picks, props, scores and grades. No 24-hour expiry or forced website-only cutoff; archive/research caches are bounded and archives do not run live-board polling.
- Prop grades match sport, game, day, player, market, side and line. A final with no grade displays FINAL · AWAITING STATS.
- Settlement now handles verified defensive returns, the provider’s safety shape, overtime endings and certain administrative events while refusing contradictory/incomplete ledgers. Missing receiving rows can become zero only with exact-game positive snaps, exact player identity and a complete reconciled receiving box. Missing players are never automatically zero/DNP.
- All 47 September 20 NFL prop tickets had matching saved results at the final readback; the eleven initially missing tickets were resolved. The existing Lamar Jackson zero-TD grade was preserved when a fresh ledger would not reconcile; that was not a new evidence-based regrade.
- Applied migration: `20260921154817_read_nfl_props_window.sql`, a SECURITY INVOKER read capped at seven days with existing RLS. It filters NFL before returning prop JSON.
- NFL and MLB props share the core decision framework but different settlement infrastructure: NFL uses the Mac worker; MLB also has cloud grading.

Pre-rule-change verification recorded 4,635 backend tests, 243 edge checks, 958 web tests, types/lint, native compilation and historical views. A later Linux CI issue came from a history fixture importing Apple Combine; remaining CI was cancelled at Adam’s direction. When he requests test work, route that fixture to the Apple job. Do not resume it automatically.

## Website, launch and marketing work from other agents

- `ee3f63bd` corrected public NFL/NCAAF pending labels to the scheduler’s four-hour first-attempt window; it is not a guaranteed completion time. Other sports retain their prior timing logic. The owner recorded production delivery.
- `a24fa9c8` added bounded database reads (8-second timeout, one retry) and public-page Vercel edge caching/stale fallback. The owner recorded live Googlebot-style MISS→HIT checks, 958 web tests and all-four-job CI success. Redirecting `/nfl` to `/picks/nfl` is expected; this is not a guarantee Google has indexed every destination.
- Nine fixed demo profiles were hidden and added to existing private leaderboard exclusions. Their 323 test entries were retained; real users/records and RLS were not changed. Anonymous leaderboard reads then correctly showed no qualified participants.
- The saved Product Hunt schedule **actually launched Sunday, September 20**. Adam requested Thursday, September 24 and deleted the daily launch-review automation. The live editor has no reschedule control.
- After explicit authorization, the launch agent sent support mail to `help+launch@producthunt.com` on September 21 at **2:19:22 PM ET**, requesting September 24 at **12:01 AM Pacific / 3:01 AM Eastern**. Gmail confirmed SENT; message `1a0c531ac89536c1`, thread `1a0bf204c8a29989`. **Product Hunt has not confirmed the change.** No deletion or duplicate launch was created. The local marketing docs were updated today and remain uncommitted.
- The September 13 forum-date correction and other campaign follow-ups remain prepared, not published. Do not recreate the deleted review automation or infer outreach permission from this handoff.
- Remaining launch acceptance includes the inline archive-link click issue, the exact public-version device journey, signed-in Book saves/recovery, October 1 midnight Eastern account-access transition, current native marketing footage and channel eligibility. No new public App Store submission was recorded.
- Evidence remains limited: the September 14–20 consented funnel snapshot had 21 sessions, one useful reasoning read and zero Book open/save/settlement sessions. Two App Store handoffs are not installs. The mature X sample had 98 posts/50,062 impressions, but 71 threads included Gary’s own reply; reply totals are not independent conversations. Link clicks were unavailable. No sportsbook partnership, new rights agreement or real user-demand validation was established.

Current launch receipt: [September 21 status at the top of the launch handoff](HANDOFF_2026-09-20_LAUNCH_REVIEW.md) and [sent support request](GaryMarketing/launch-2026-09/LAUNCH_RESCHEDULE_REQUEST_2026-09-20.md). Those updates override older Sunday/Monday recommendations farther down the same documents.

## Release sequence and local inventory

Recorded TestFlight progression: 932–933 college repair/resumption and display follow-up; 934 native review; 935 layout fixes; 936 dark-container restoration; 937 sport-scoped Home records; 938 calendar fixes; 939 raised college ranks; 940–941 ownership cleanup; 942 NFL grades/order; 943 incoming-card layout; **944 NFL settlement/history**. Initial drive/auth problems in earlier Saturday notes were subsequently overcome; they are not a current confirmed signing blocker. No new release was made in this handoff task.

Working-tree modifications observed at the initial 2:50 PM checkpoint (later NFL/props work is listed separately below):

```text
AGENTS.md
gary2.0/CLAUDE.md
HANDOFF_2026-09-20_LAUNCH_REVIEW.md
HANDOFF_2026-09-21_NFL_HISTORY_944.md
GaryMarketing/launch-2026-09/EXECUTION_REVIEW_2026-09-20.md
GaryMarketing/launch-2026-09/LAUNCH_COMPLETION_TRACKER.md
GaryMarketing/launch-2026-09/LAUNCH_RESCHEDULE_REQUEST_2026-09-20.md
GaryMarketing/launch-2026-09/LAUNCH_RUNBOOK.md
GaryMarketing/launch-2026-09/PRODUCT_HUNT_PACKET.md
ios/GaryApp/FootballGameIntelView.swift
ios/GaryApp/HubModules.swift
ios/GaryApp/Picks/EdgesSection.swift
ios/GaryApp/Picks/PicksHistory.swift
ios/GaryApp/PicksTab.swift
ios/GaryApp/SupabaseAPI.swift
ios/GaryApp/GoogleService-Info.plist  [private; never stage]
```

Later NFL market-awareness work adds local changes in `nflConstitution.js`, `nflPrompts.js`, `nflResearchPrompts.js`, `agentLoop.js`, `orchestratorMain.js`, `footballPromptSha.js`, the new `src/services/jev/nflMarketAssessments.js`, three existing literal-question expectations, and `HANDOFF_2026-09-21_NFL_MARKET_AWARENESS.md`. AGENTS.md and CLAUDE.md describe the separately authorized game/prop scopes consistently. The separate [Jev props handoff](HANDOFF_2026-09-21_JEV_PROPS.md) owns its shared client, prop integration and market-identity edits; preserve them. Replay artifacts live outside the repo in the linked evidence folder.

This handoff is also local. A future commit must use explicit paths and preserve the private plist. No commit, push, build, release, scheduler restart or production-pick rewrite was performed for the NFL market-awareness/replay work. Do not push or initiate CI/release work until Adam requests it.

## Source map for the next session

All handoff paths below are at the canonical repo root. They provide full evidence and detailed implementation receipts; later policies/statuses above supersede their obsolete instructions.

- College identity, rankings, exact quotes: `HANDOFF_2026-09-19_COLLEGE_RANKINGS.md`, `HANDOFF_2026-09-19_COLLEGE_ODDS_UI_REPAIR.md`, `HANDOFF_2026-09-19_FAILURE_POLICY_AND_SUBSCRIPTIONS.md`.
- Operations, providers, missing markets, unresolved historical tickets: `HANDOFF_2026-09-19_BACKEND_FAILURES.md`.
- Native review/design/Home/ranks: `HANDOFF_2026-09-19_NATIVE_REVIEW_934.md`, `HANDOFF_2026-09-19_NATIVE_DESIGN_935.md`, `HANDOFF_2026-09-19_HOME_SPORT_RECORDS.md`, `HANDOFF_2026-09-19_COLLEGE_RANK_STYLE_939.md`.
- Bullpen/date tools: `HANDOFF_2026-09-19_BULLPEN_PLAYING_DATES.md`, `HANDOFF_2026-09-19_CALENDAR_AUDIT.md`.
- Completed cleanup: `HANDOFF_2026-09-20_CODEBASE_CLEANUP_941.md` supersedes remaining-work claims in the 940 handoff.
- NFL research: `HANDOFF_2026-09-20_NFL_DATA_AND_AWARENESS.md`, `HANDOFF_2026-09-20_NFL_RESEARCH_DELIVERY.md`, then the source/research portions of `HANDOFF_2026-09-20_NFL_NBA_BASELINE.md`.
- Current NFL decision flow: `HANDOFF_2026-09-21_NFL_AGENCY.md`, followed by `HANDOFF_2026-09-21_NFL_MARKET_AWARENESS.md` for the current question, Jev context and actual replay.
- Jev props and subsequently implemented standard-market/−179 enforcement: `HANDOFF_2026-09-21_JEV_PROPS.md`. Its props-only scope describes that task; the NFL game integration has separate explicit authorization above.
- Native latest delivery: `HANDOFF_2026-09-20_NFL_PICKS_LIFECYCLE_942.md`, `HANDOFF_2026-09-20_PICK_CARD_PLACEHOLDER_943.md`, `HANDOFF_2026-09-21_NFL_HISTORY_944.md`.
- Marketing: `HANDOFF_2026-09-20_LAUNCH_REVIEW.md`, `GaryMarketing/launch-2026-09/EXECUTION_REVIEW_2026-09-20.md`, `LAUNCH_COMPLETION_TRACKER.md`, `LAUNCH_RESCHEDULE_REQUEST_2026-09-20.md` in that same marketing folder.

Evidence folders are under `/Users/adam.preda/Documents/ChatGPT/Gary/`, especially `failure-policy-2026-09-19/`, `backend-failures-2026-09-19/`, `giants-bullpen-2026-09-19/`, `date-time-audit-2026-09-19/`, `codebase-cleanup-2026-09-19/`, `nfl-review-2026-09-20/` and `nfl-history-2026-09-21/`. Complete original NFL conversations are in `nfl-review-2026-09-20/today-exact-conversations/`; they describe the inputs at that time, not Monday’s new prompt. If Adam asks to read original content, provide it complete rather than replacing it with a summary.

Next session: acknowledge this state, preserve the pending edits and the current NFL market-awareness design, and follow Adam’s next request. Use the later props handoff for the implemented market enforcement and remaining operational evidence. Historical-ticket decisions, database logs, app acceptance and Product Hunt confirmation remain unresolved at their recorded checkpoints. Do not add historical benchmarking, extra replay attempts, tests or release work without Adam's request.
