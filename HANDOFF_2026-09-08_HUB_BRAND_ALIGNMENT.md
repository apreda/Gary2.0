# Hub/Fantasy brand alignment and SEO verification — September 8, 2026

Adam asked to keep the new Hub redesign and approved typography, brighten Fantasy, and make both feel more consistent with the rest of Gary. He also supplied a Search Console email about validation of missing Event `location` data.

## Native result

Commit `12f4df5a` brings the shared Gary mark, backdrop, brand colors, panel borders/shadows, radii and page gutter into the existing Hub layout. Fantasy uses brighter opaque reading surfaces, stronger supporting text and a clearer full-case link. Fonts, information hierarchy, league/scoring filters, evidence, expiry and player routing remain intact. The shared panel modifier keeps its previous defaults for other screens.

Version 2.25/build 914 also integrates the launch review's independently owned fixes:

- `875fc9bb`: Billfold's filtering and top-pick performance consistently exclude preseason results. An actual NFL sport selection in the optimized simulator displays All time **30–29–0, −1.0u, −$104** at $100/bet, matching the 59 eligible results from the 93-row fixture.
- `a82c2ea6`: today's related team signals exclude tomorrow's projections; native player profiles decode and display the supplied slate context, including off-slate status.

Final native source freeze is `a82c2ea61f7ae23e746047ac13a42b253f05929e`. Seven relevant source-file hashes are recorded in the local evidence folder. Later backend/web/documentation commits do not change this binary input.

## Verification

- Five focused Hub suites: 17 tests passed (lifecycle, optimized league routing, front-page selection, exact card identity and team routing).
- Executable Fantasy model assertions passed for full copy, numbered citations, date/league isolation, expiry, overnight recovery and exact player/game routing.
- Primary text contrast is at least 13.01:1 on both reading surfaces; secondary text at least 10.02:1, metadata 7.82:1 and gold labels 6.05:1. This is a bounded check of those roles/backgrounds.
- Optimized 914 visual QA passed for the MLB Hub lead/full-story route, Fantasy Points selection, Pickups empty state, Lineup restoration, NFL Fantasy and the Herbert full-case fallback. Four larger preferred-text-size steps keep the masthead/scoring/filter controls stacked correctly; normal size was restored.
- Independent source/screenshot review found no actionable regression in the styling changes. The separate native slate-context fix passed an optimized actual-Swift fixture and independent review.
- Final integrated optimized Release simulator build and signed device archive passed. Strict/deep signature verification passed, all seven native source hashes remained frozen, and all 21 privacy manifests match signed build 913 byte for byte.
- Final integrated UI checks passed: NFL sport selection retains the corrected totals; Hub search Cleveland → Tanner Bibee record → clubhouse Foster Griffin visibly displays **NOT ON TONIGHT'S SLATE**. The team sheet's accessibility tree lists only today's head-to-head under “More on this team today,” with tomorrow's Foster regression absent. Final Hub/Fantasy appearance and scoring selection also passed.
- Upload succeeded September 8 at **13:33:26 UTC** (9:33:26 AM Eastern), with `Upload succeeded`, `Uploaded GaryApp`, `EXPORT SUCCEEDED` and terminal exit 0. At 13:41 UTC, authenticated App Store Connect independently confirmed processing **Complete** and build 914 **Testing** in the internal Beta group (one tester). [Build details](https://appstoreconnect.apple.com/teams/521830ee-c476-4bdd-8b08-b703cfda627d/apps/6751238914/testflight/ios/7df2c9e4-fbc3-4276-962c-f22bf97d9b3a). **Do not upload 914 again.**

Simulator drag/wheel automation did not move the viewport. No physical long-scroll, VoiceOver, purchase, App Review or complete launch acceptance is claimed here. The launch session owns those remaining gates and Apple review selection.

## SEO result

The supplied email says Google has started validating a prior fix. Existing commit `1590c61d` already replaced an incomplete nested `SportsEvent` with accurate Article subjects on matchup analysis pages. These pages publish analysis. Google's [Article guidance](https://developers.google.com/search/docs/appearance/structured-data/article) covers sports articles, while its [Event guidance](https://developers.google.com/search/docs/appearance/structured-data/event) requires actual venue/address information for event rich results. No location was invented.

The signed-in report inspected September 8 has 22 affected examples, with its aggregate last updated September 6. Validation started September 8 and shows **22 pending, 0 passed, 0 failed, 0 other**. The email's older snapshot says 25.

All 22 reported URLs were fetched from production: every page returned HTTP 200, its own canonical URL, a populated Article and BreadcrumbList, and no Event/SportsEvent node. The three source suites for game-page JSON-LD, SEO metadata and game-page behavior passed 41 tests. Google's fresh live URL test for the first reported example completed at 8:48 AM Eastern: available to Google, indexable, one valid Breadcrumb item, no Event enhancement; its indexed view also reports it indexed.

The existing correction is live. Google's full validation remains pending. The ongoing validation was not restarted and no additional indexing request was submitted. Raw signed-in Search Console output and screenshots remain local.

## Evidence and release paths

Local evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/hub-brand-alignment-2026-09-08/` (README, screenshots, source hashes, 22 live URL results, Google live test and validation snapshot).

- Final simulator product: `/Volumes/KINGSTON/gary-release-dd/Build/Products/Release-iphonesimulator/GaryApp.app`
- Final simulator log: `/Volumes/KINGSTON/gary-914-final-integrated-simulator.log`
- Verified final archive: `/Volumes/KINGSTON/Gary-2.25-914-Hub-Brand-final.xcarchive`
- Final archive log: `/Volumes/KINGSTON/gary-914-archive-final.log`
- Upload log: `/Volumes/KINGSTON/gary-914-upload.log`

Archive executable SHA-256: `db359ebb8c837a53c8ccb7606712f9418c94ccca44b5577de4654d7d5e78e513`. The local `final-archive-verification.json` records version, source freeze, source-hash parity, signature and all manifest hashes.

The initial style-only archive was renamed `/Volumes/KINGSTON/Gary-2.25-914-PRE-BILLFOLD-FIX-DO-NOT-UPLOAD.xcarchive`; do not upload it. The final archive must include both launch fixes above.

App Store Connect processing and internal TestFlight availability were verified read-only and reported to the launch root. Its App Review selection and broader launch acceptance remain with that session. The root released the temporary shared push hold after independently verifying the stored Hub corrections, then pushed main through `12396853`, including this session's release-doc commits `e3794efe` and `11a48a1b`. This task's native code and release docs are pushed. Other active launch/backend work and private local configuration remain outside this session's commits.

Final production check: `/Volumes/KINGSTON/gary-914-production-truth-final.log` ran at checkout `ac6aff03` during the active shared launch work. The scheduler runs from the canonical checkout (PID 96216), Winners runs (PID 89023), configured models match the intended lanes, and all 20 edge-function deployment checks pass, including the newly deployed prop grader. No started MLB game lacks a pick (15 future games remain pending). The command exits 1 because the shared checkout has 13 uncommitted changes and one unpushed commit at that snapshot, including this handoff's then-uncommitted docs and other owners' active work. This is explicitly an in-progress shared-checkout exception, not a claim of clean repository parity. The private local Google configuration remains untouched and excluded from this session's commits.
