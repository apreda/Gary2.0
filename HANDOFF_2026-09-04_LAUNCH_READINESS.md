# Launch readiness implementation

September 4, 2026. Implements Adam's approved order: submission disclosures and offer consistency, first useful experience measurement, X writing/reliability, polished content, then integrations supported by audience evidence.

## Shipped and verified

Main implementation commit: `f1769bc8`. Public-copy follow-up: `ec751968`. Both are pushed to `origin/main` in the canonical `/Users/adam.preda/Desktop/Gary2.0` checkout. The existing real `ios/GaryApp/GoogleService-Info.plist` remains uncommitted by instruction. `SecretsLocal.swift` was not staged.

The web deployment for `ec751968` is `gary20-2u30fx90t-adam-predas-projects.vercel.app`, Ready in Vercel and attached to `www.betwithgary.ai`. Live browser checks verified the account-based founding offer, the pricing action's sign-in destination, the build-qualified privacy controls, the iOS rollout notice, the expanded Brewers–Reds reasoning and its permanent game page. Optional analytics was declined in the QA browser; no artificial production acquisition event or account was created.

The website now uses the current launch promise: preview until October 1, 2026 at midnight Eastern; accounts created before the cutoff retain founding Winners access. The server's founding entitlement has no expiry. No new lifetime promise, season-end date or price was introduced. Current free features and historical boards stay free. Retired sports were removed from the marketed plan choices; NBA is identified as a planned relaunch. Game-pick records, core props and excluded home-run/touchdown fun lanes are identified accurately in the shared footer and pricing proof.

The website measures consented sessions and actual visible game reasoning for five foreground seconds. It deduplicates within a session and reports observed seven-day return cohorts with explicit maturity and missing-data rules. New event version `reasoning_v2` excludes legacy page-load events. Creative attribution uses `utm_content`. Migration `20260904225312_web_useful_session_funnel.sql` was applied alone and verified: anonymous/authenticated table access denied, service-only writer granted, unique milestone index present. Older remote migration-history divergences were not repaired or replayed.

Deployed edge functions:

| Function | Version / deployed UTC | Verified behavior |
|---|---|---|
| `social-auto-post` | v96 · September 4 23:22:21.425 | Safe verbatim reasons, daily plus active weekly NFL source, preserved no-repost gate, bounded source/post/log health |
| `engagement-sheet` | v6 · September 4 22:58:56.450 | Restored intended private-token authentication; authorized view 200, wrong/missing token 401; no generation or replies manually invoked |
| `delete-account` | v9 · September 4 22:44:11.726 | Account-linked analytics cleanup, Apple permission-removal guidance; anonymous POST 401, web OPTIONS 204; no customer deleted |

The existing 19:00 ET social cron under v94 returned HTTP 200, posted two picks and reported no posting failures/missed stored picks. Both posts matched safe verbatim reasons and the existing canonical bare-pick format, which omits book prices. All seven stored picks then had seven logged threads. **That is publishing coverage, not coverage of every scheduled game.** Final v96 source was retrieved and checked. A read-only replay of the real latest NFL week selected all 16 games on their respective Eastern date and preferred the canonical daily source for all 16 identity matches; no provider or posting calls were made. A natural v96 publishing run was not yet observed at this handoff.

The draft generator's old gateway configuration demanded a JWT that neither its cron nor private web page sends. The handler already uses `SHEET_TOKEN`; that gate is now tested and the intended function configuration is persisted. Its next natural generation is September 5 at 10:30 AM ET. Fresh drafts have not yet been observed; the report retains the stale-drafts alert. No new posting schedule, monitoring automation, ad spend or external outreach was created.

## iOS and submission

Version 2.25, build 899 was signed, archived and uploaded at 6:53 PM ET. Apple reported “Uploaded package is processing.” Archive: `/Volumes/KINGSTON/GaryApp-Privacy-2.25-899.xcarchive`; upload log: `/tmp/gary-privacy-899-upload.log`. Processing completion, attached review build and approval are not verified.

Build 899 adds default-off optional analytics, allowlisted properties, no signed-out analytics identifier, Firebase initialization after notification permission, updated privacy declarations, successful-deletion guidance and matching-account Apple credential-revocation handling. Its release purchase UI and checkout require Apple storefront `USA`; unknown and other storefronts show availability information without external purchase steering. Existing entitlements remain usable.

App Store Connect is signed out in both available browsers. The existing Chrome tab was left at the Apple login and handed back to Adam; the asynchronous sign-in request remains unanswered. No review withdrawal, submission, release-setting change or reviewer message occurred. Next authenticated actions are to reconcile the attached build and release mode, update the Data Not Collected label from the actual inventory, verify seller/territories/content questionnaire, and supply current screenshots/review access. The package does not certify conditional SDK data categories without examining their actual use. Fresh real-device Apple authentication still needs verification. Apple's documented manual permission-removal fallback is provided when the server does not hold revocation tokens; automatic token exchange/revocation infrastructure was not fabricated.

See `GaryMarketing/APP_REVIEW_2_25_899.md` and `PRIVACY_INVENTORY_2_25_899.json` for exact review copy, app-owned data and 21 bundled SDK manifests. The public policy identifies the new controls by build so it does not imply older installed versions already contain them.

## Content and operating files

`GaryMarketing/launch-2026-09/LAUNCH_RUNBOOK.md` is the current operating plan. Older launch and brand documents point to it where their offers, dates or policy claims are stale.

The content package contains four finished concepts in portrait and landscape: finding a game, reading reasoning, inspecting the record and keeping Your Book. Eight JPEG exports were inspected at their final sizes. Captions, tracked destinations, profile/pin drafts, alt text and three founder-recording scripts are included. The dated card screenshot is an actual September 4 app example; the manual Book graphic is labeled as a feature overview. Nothing was posted or scheduled from this package, and no video footage was claimed to exist.

The integration packet distinguishes affiliate distribution from authorized account-data import. It includes a product brief, honest audience limitations, a sandbox/pilot acceptance table and an unsent vendor inquiry. No direct FanDuel/DraftKings relationship, imported history, paid SDK contract, user geography, app installations or retained customer count is claimed. Instagram/TikTok category eligibility remains unresolved; preparing creative does not establish permission to publish it there.

`WEB_MEASUREMENT.md` contains exact report commands and event definitions. Existing ignored credentials suffice for the read-only web report. App Store provider/general campaign tokens are still unconfigured and require verified ASC values; no fabricated token was deployed. Aggregate snapshots are under `launch-2026-09/evidence/`.

## Verification and limits

The main implementation passed 1,717 backend tests, 153 edge-helper tests, 291 web tests and Next/TypeScript checks. The NFL source follow-up passed 163 edge-helper tests and Deno checks; 60 focused backend tests passed during that work and all 42 affected cases passed again after the final identity/dedup correction. The final public-copy follow-up passed 33 relevant web tests and TypeScript. Ten deletion-handler cases, compiled Swift privacy/storefront checks and the signed release archive also passed. The website fixture smoke check passed Home, Picks, Results, Leaderboard, permanent game/archive discovery, sitemaps/feed and the results export.

The first fixture command correctly refused the canonical checkout's real `web/.env.local`. Smoke then ran against a separate source snapshot with environment files excluded and local read-only fixtures. Production credentials were not moved, printed or copied into that snapshot. Local preview servers were stopped after verification.

Production truth confirms the canonical scheduler and Winners worker are running and the edge deployment timestamps satisfy its check. This is timestamp-based parity, not a universal deployed-source hash comparison. The known real Firebase plist causes the overall working-tree check to fail intentionally; do not commit it to make the checker green. Final source/evidence edits should be committed and pushed before the last parity run.

## Newly exposed launch risk: scheduled-game coverage

The final 7:23 PM ET readiness snapshot showed 21 scheduled games, seven with published picks, six without picks past their stored scheduled start and eight future games without picks. No uncovered game was marked interrupted in that snapshot; an earlier snapshot had one, demonstrating that schedule statuses change. Read-only scheduler inspection found delayed-game handling, superseded retries and successive 45-minute research deadlines among the contributing conditions. The missing football game also prompted extensive exact-ID data paging; its final run logged unparseable primary responses followed by both Anthropic fallbacks rejecting requests for insufficient credits. No provider recharge was authorized or attempted. This does not prove every listed game actually began at its stored start time.

The daily marketing readout now shows the scheduled-game denominator separately from stored-pick posting, with exact game identity for doubleheaders and interrupted games distinguished from ordinary gaps. It uses the same daily-plus-weekly NFL source merge as the poster, filters weekly games to their Eastern date and rejects stale or future weeks. Daily canonical picks take precedence over duplicate weekly games; actual weekly `bdl_game_id` values and legacy `game_id` aliases are supported. Existing posting windows remain unchanged. All 169 standard/top-pick log rows in the inspected August 21–September 4 period had start timestamps, and the report's exact-ticket/start matching still recognizes all seven of today's posted picks.

Publisher dedup deliberately preserves the existing unique date/ticket-text database contract, preventing a corrected start from reposting a ticket. Consequently, identical-ticket doubleheaders can be suppressed, while the stricter report shows their coverage gap; corrected timestamps can also require manual reconciliation. Full game-identity logging is separate work. Log-write failure after a successful tweet now appears in health as `POST_LOG_WRITE_FAILED`, with the tweet still counted as posted. This adds visibility, not cross-run crash recovery or an exactly-once guarantee.

These gaps are a product-availability risk before scaled promotion; improving X delivery does not resolve upstream research/generation delays. This marketing pass did not change the pick brain, rerun research or manufacture missing picks. Investigate the specific scheduler/data-retrieval and provider failure paths in the production lane before promising dependable complete coverage. The runbook now holds slate-wide promotion when unresolved past-schedule gaps remain.
