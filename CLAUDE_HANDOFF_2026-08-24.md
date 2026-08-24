# CLAUDE HANDOFF — August 24, 2026

Adam asked Codex to diagnose and fix missing MLB picks, an apparent Picks-page refresh crash, and the NFL/NCAAF tendency to choose the plus side. The approved work is committed and pushed. Read `gary2.0/CLAUDE.md` and `HANDOFF_GPT_WEEKEND.md` as well; their production and safety rules still apply.

## Start here

The only production checkout is:

```text
/Users/adam.preda/Desktop/Gary2.0
```

Do not work in `/Users/adam.preda/Documents/ChatGPT/Gary/repo`; that checkout is retired.

At takeover, run:

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git fetch origin
git status --short --branch
cd gary2.0
node scripts/production-truth.js
tail -n 80 logs/scheduler/scheduler-$(date +%F).log
```

At 10:00 AM ET on August 24, production was on `main`, the scheduler was alive from the canonical checkout, today's 10-game MLB slate was published, and all 40 unchanged T-90/T-60/T-30/T-15 trigger entries were armed. The first batch is at 5:10 PM ET. There are no NFL or NCAAF games on today's slate.

The current Git history at handoff is:

- `4a8ad4f7` — Dependabot Vitest 4.1.10 to 4.1.11 (remote fast-forward; test dependency only)
- `251f438f` — Repair football side evaluation and market truth
- `79eb527d` — Keep MLB drift checks on the slate date
- `f692bc43` — Fix Picks refresh league state

The scheduler started before the Dependabot fast-forward. That commit changes only `package.json` and `package-lock.json`, not runtime scheduler code, so no scheduler restart was needed.

## MLB: what happened and what changed

The August 22 Blue Jays at Yankees pick was not lost by a broken scheduler or model. Toronto's official lineup was 0/9 at T-90 and T-60, so the existing intentional hard lineup gate rejected both runs. The lineup reached 9/9 before T-30 and the unchanged retry stored `Blue Jays ML -104` at 1:12 PM ET. Do not weaken or bypass that gate without Adam's explicit approval.

Other verified August 22 examples:

- Braves at Brewers stored `Brewers ML -156`.
- Nationals at Marlins stored `Marlins -1.5 +116` after its 9/9 lineup gate opened.
- All 15 games were armed. The retry path was idempotent and did not duplicate stored picks.

The only MLB reliability code change was `79eb527d`: the drift guard now checks each pending entry's stable slate date, not the wall-clock date. This prevents a delayed game crossing midnight from holding the shared MLB lane forever. It does not change the pick prompt, factors, model decision, lineup gate, or trigger tiers.

## Picks-page refresh issue

The simulator evidence did not show an iOS process crash: the PID stayed alive, network responses remained HTTP 200, and there was no crash report or fatal exception. The visible failure was stale league state. An automatically selected NFL desk could remain sticky after MLB became the first authoritative live desk, so pull-to-refresh appeared to lose the expected MLB pick.

Commit `f692bc43` makes automatic selections follow the refreshed first sport while preserving manual user selections. The patched app was built and installed; cold load selected MLB, the Toronto pick and both props rendered, and three consecutive pull-to-refresh gestures kept the same PID and content with no fault logs.

Commit `251f438f` also fixes a separate display-only spread issue: the app now uses the authoritative stored `GaryPick.spread` before falling back to a raw sportsbook row for legacy records. A first-book outlier can no longer flip the displayed sign or replace the elected line.

The iOS archive uploaded on August 22 was GaryApp 2.24 build 887. Apple's upload response showed accepted/PROCESSING with zero validation errors or warnings. Processing completion was not verified because the authenticated App Store Connect session expired. Re-check before claiming READY or selecting it for TestFlight.

## NFL and NCAAF plus-side audit

The skew was real in the pre-fix sample: 14 of 16 recent completed NFL spread decisions were plus-side picks. This was not caused by best-line selection flipping the chosen team. Four upstream quality problems were found:

1. The initial NFL/NCAAF Pass 1 prompt omitted the exact teams, posted spread, and required bilateral cover-case headings. In 12 inspected football transcripts, 0 had the intended `Case for...` sections.
2. The soft validator mistakenly accepted generic prose that merely mentioned both teams.
3. Missing preseason rotation/current-state evidence was repeatedly converted into a reason to take points.
4. The shared market formatter gave Gary the home-side spread price as one generic price. In 11 of 13 preseason decisions, the stored line or price had to be normalized after the choice.

Commit `251f438f` fixes those causes without imposing a favorite/underdog quota and without post-hoc side flipping:

- NFL/NCAAF Pass 1 now receives exact home/away cases and the posted lines on the first turn.
- Every normal and forced progression route passes one strict, substantial bilateral gate before Pass 2.5.
- The validator bounds each case section and rejects duplicate-history padding or thin second cases.
- A neutral football side-independence check says unresolved evidence supports neither side and requires verified four-quarter paths for both teams.
- NFL preseason analysis separates starter and reserve phases and only extends an advantage across quarters when current playing-time evidence supports it.
- Two-sided spread lines and prices are shown truthfully; ambiguous football team labels fail closed.
- Football current-state research has a football-only Anthropic server web-search fallback when Gemini grounding fails.
- The app uses the server-elected spread, and the diagnostic DOG tag no longer mistakes positive juice for a positive spread.

Do not "correct" the distribution toward favorites. The intended standard is equal evidence treatment, not a target split. MLB's dedicated formatter and MLB pick process were kept unchanged.

Registered football prompt fingerprints:

- NFL: `e83387a99515`
- NCAAF: `3b4c9e2e8bb2`

Post-deploy proof on August 22:

- Bears at Bengals stored `Bengals +2 -110` at Fanatics, confidence 0.57. Bilateral sections were 1009/995 characters, and Anthropic fallback returned 6 search blocks / 3,631 characters.
- Eagles at Patriots stored `Patriots +1.5 -110` at BetMGM, confidence 0.61. Bilateral sections were 1141/1234 characters, and Anthropic fallback returned 5 search blocks / 3,863 characters.

Both happened to remain underdog picks, but their rationales used affirmative opponent-specific roster, line, rest, and matchup evidence; neither used a quota or treated unresolved uncertainty as plus-side evidence. Two observations are not enough to retune the process.

## Verification already completed

The full repository suite passed after the `4a8ad4f7` dependency fast-forward on Vitest 4.1.11: 130 test files and 1,083 tests. Focused prompt, validator, force-progression, market-truth, iOS source-contract, adjacent orchestrator, odds, and MLB regression suites were also green before deployment. The app compiled successfully for the iOS simulator, and the live post-deploy picks carried the new NFL prompt SHA.

## Operational caveats

- The Mac launchd scheduler is the active production scheduler. Railway is offline and there is no cloud scheduler backup. Do not start a second scheduler without a duplicate-write design.
- The watchdog was tightened to require the exact canonical Node scheduler command and can bootstrap the canonical launchd registration if it disappears.
- Gemini grounding had billing/dunning failures, and OpenAI web search lacked credits during the incident. The football-only Anthropic web-search fallback recovered the verified post-deploy NFL runs. MLB still completed through its existing desk path.
- `ios/GaryApp/GoogleService-Info.plist` contains the real local Firebase API key. The public repository copy is intentionally redacted. Never stage or commit the local value.
- `ios/GaryShots/` contains simulator QA receipts from the completed UI work. They were checked in at Adam's explicit request to commit everything.

## Rules for the next change

- Ask Adam before editing unless he directly asks for a fix.
- Do not change the MLB pick process to solve an operational symptom.
- Do not add favorite/underdog quotas, side targets, or a result-based flipper.
- Preserve the prompt Layer 3 boundary: define what to investigate, never tell Gary what a fact must mean for the pick.
- Keep injury handling locked unless Adam explicitly approves touching it.
- Test picks belong in `test_daily_picks`, never production `daily_picks`.
- Commit explicit paths only. Never use `git add -A`, and never stage `GoogleService-Info.plist`.
- For production claims, verify the actual daemon path/era and the stored record, not just Git or tests.
