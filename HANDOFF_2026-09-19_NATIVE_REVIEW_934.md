# Native two-pass review and cleanup — September 19, 2026

Source commit: `e98bb3ce`. Delivered **2.26 (934)**. Final Simulator Release and
signed device archive passed. Upload succeeded at **3:41:58 PM ET**. Apple's
TestFlight email confirmed availability at **3:44:05 PM ET**, followed by the
processing-complete email at **3:44:08 PM ET**. Both receipts are saved in
`apple-delivery-934.json` in the evidence folder.

## Scope and result

Adam authorized two bug/performance review passes across current native pages,
MLB/NFL/NCAAF (excluding NBA), cleanup, and TestFlight delivery. Passes covered
Home/Today/Tomorrow, Winners games/props, each active league's Hub and Picks,
Billfold Gary/You/Board, Fantasy, profile and settings. Representative games,
research sheets, filters, return visits and load recovery were exercised.
No purchases, user bet writes or account changes were performed.

Fixes include large college spread/live verdicts, exact final-total pushes,
full Home labels, NFL upcoming-game links, both starting-QB writeups, duplicate
football intel, timestamped saved Sweat observations, stale league responses,
inactive movers polling, empty Picks retry, kickoff reveal updates, readable
result footers and dense Pulse values. Billfold history uses lazy rows; the Hub
no longer draws a duplicate full-page background.

The second pass found that `PropPick.from(dict:)` discarded string game IDs.
It now uses the existing exact provider-ID parser. A legacy saved showcase card
recovers only the ID from the identical fresh ticket; it keeps its published
prediction and price. Final Simulator observation confirmed the previously
stale Cutter Boley card showing live ASU–KU status.

`footballLeaguePulse.js` also turned null moneylines into `0 / 0`. Missing
prices now remain absent and a one-sided quote retains its away/home position.
Four affected values in today's college Pulse board (MER–GT, KENT–OSU,
BUF–PSU, ME–BC) were corrected through the existing service-role REST path.
Original/repaired rows are preserved in the evidence folder. Published picks
were not rewritten. Future fresh pipeline processes use the corrected formatter.

## Cleanup and verification

Removed unused legacy Picks/Props screens, duplicate popups, the unused judgment
view, obsolete profile staging, unused components and retired NHL/NCAAB manual
workflows. Consolidated panel styling and current CLAUDE instructions. NBA,
offseason features and still-used historical result decoding remain. Net change
is 3,800 fewer lines across 42 files (373 added / 4,173 removed).

[Remote CI](https://github.com/apreda/Gary2.0/actions/runs/35464734966) is green:
backend 4,369 passed / 12 skipped on Linux; Apple 8 passed; web 935 passed plus
types and fixture checks. Focused local regressions execute actual Swift spread
and prop-identity code and the real football Pulse builder. No new AI review,
recurring monitor or publication gate was introduced.

The final production recovery check read 56 stored picks for September 19.
MLB had 6/15 games published, zero started games without a pick and nine pending.
The scheduler and Winners worker were running from the canonical checkout;
edge deployment timestamps were current and nothing was unpushed. Its remaining
working-tree warning is explained by the three unrelated changes below.

Preserved unrelated local changes: `gary2.0/deno.lock`, the private
`ios/GaryApp/GoogleService-Info.plist`, and
`audit-evidence/nfl-70pct-snapshot-6f78c693/`. Never commit the real plist.

## Remaining limits

The data API intermittently returned long reads, HTTP 521 and PGRST002/503.
Direct SQL confirmed the database restarted at 3:36:52 PM ET. After recovery:
33/60 connections, one active query, no lock wait; size 547 MB. Later HTTP
reads returned 200 in 190–327 ms. The restart's cause is **not established**.
Do not claim this server instability permanently fixed by the UI retry change.

Simulator navigation/expansion/scroll-to-top worked. Automated drag/wheel
gestures were unreliable, so there is no physical-phone FPS result. The runtime
sample (~210 MB physical footprint, main thread mostly waiting in its event
loop) is not a scroll benchmark. Adam's TestFlight device review remains needed
for the feel of scrolling.

The full per-page matrix, screenshots, logs, API observations and delivery
receipts are in:
`/Users/adam.preda/Documents/ChatGPT/Gary/native-two-pass-2026-09-19/`.
Start with `review.md`. Earlier college repairs and today's publication counts
remain documented in `HANDOFF_2026-09-19_FAILURE_POLICY_AND_SUBSCRIPTIONS.md`.
