# Hub completion — September 7, 2026

This supersedes the build-905 handoff. Adam asked for sustained work toward a
production-quality Hub, then explicitly overrode every older aesthetic note.
Current conversation feedback and `docs/design/anti-ai-slop-design.md` are the
only design authority. That guide is an exact copy of his supplied Desktop
file; inherited font/layout comments are not requirements.

## Release state

Version 2.25 build 906 passes final Debug, signed Release and six post-fix
fresh launches. Upload is in progress; Apple processing is pending. Do not infer App Store availability from an
archive or upload. The App Store submission remains build 901, version 2.25,
Waiting for Review; the existing submission has not been withdrawn or replaced.

## Product behavior

The native main Hub has one warm, solid lead; two supporting reads; complete
expandable boards; and the preserved horizontal games strip. Native scalable
system typography replaces the inherited condensed font on the Hub and shared
MLB/NFL/NCAAF player cards. Gold monospaced context labels retain the brand.
Names and decision headlines wrap fully, including search and regression.
Larger text stacks navigation/stat layouts; section controls have clear labels
and useful touch targets. The floating section list appears after the masthead
scrolls away and remains bounded to the available height.

Full original reads fit their content, scroll when necessary, and keep close
controls outside the scrolling body. Background Hub controls are removed from
the accessibility tree while its custom modal is open. Player cards explicitly
label the original published read so its preserved numbers are distinguishable
from subsequently refreshed statistics. Hub grading uses the shared app stamp.

MLB/NFL alone offer Fantasy. NCAAF and NBA stay on their sport's main briefing
after a Fantasy switch; retired sports cannot reappear from cached rows.
NBA has season-series, rest/schedule, availability and team-form labels instead
of baseball-shaped headings. NFL/NCAAF quiet-day context lists verified upcoming
matchups and when the schedule was checked, without inventing kickoff times.

Search applies the same sport/date/proof eligibility as the displayed feed.
Reference tables require populated current-date player packs. Team and game
navigation uses exact league/game identity, including doubleheaders; missing
or ambiguous packs preserve the original full story. Tomorrow regression reads
cannot open today's card or today's Picks game, even when teams match.

## Loading and cost

Overlapping Hub refreshes share a task. The initial load respects a sport the
user selected while it was running. Failures retain only same-date last-good
content, surface retry feedback, and cannot hide a separately loaded games
strip. A successful empty schedule clears its older value. Date rollover
reissues the load without borrowing the previous slate's content.

Native player packs paginate by stable database ID, validate exact counts,
dates/ranges and monotonic IDs, coalesce concurrent reads, and cache only complete
snapshots. Later-page errors retain last-good data without renewing its age.
The bounded reader supports server page caps, a 30-second overall deadline,
40 pages/10,000 rows and two cached dates. No new hosting or model generation
was added. Per-player source requests are memoized across separate game packs.

A final fresh launch reproduced a SIGABRT in `fetchLeaguePulse` at the shared
Dictionary setter. MLB/NFL/NCAAF responses wrote the same cache from concurrent
cooperative queues. Cache state, in-flight requests and the accessor now share
MainActor; network requests still overlap. Requests for the same key share work.
Successful empty and failed-response behavior remain distinct, and failed reads
cannot renew the older cache entry. A dedicated concurrent URLSession regression
fixture and repeated post-fix launches validate this repair before upload.

## Applied data changes

Migration `20260907225151_player_card_game_identity` was applied at 22:51:51Z.
The unique identity is now (date, league, player_id, game_id), NULLS NOT DISTINCT.
All 21,906 existing rows and 409 NULL-game rows were preserved, as were the
primary key, RLS and physical table identity. A zero-row PostgREST upsert verified
the refreshed four-column conflict schema. Only the idle daily-insights launch
agent was briefly unloaded/restored for cutover. Scheduler PID 79083 and Winners
PID 89023 continued running. No access-policy changes were made.

Card assembly emits one pack for every observed exact lineup/game occurrence.
An unassigned season/form pack remains when the player has no posted lineup.
A bounded deterministic repair published Devers 410 (row 178176) and Jung Hoo
Lee 4841 (row 178177) for game 5059935 at 23:08:41Z after verifying fresh posted
orders and opposing starter Michael McGreevy. All 276 pre-existing current MLB
rows, including both NULL versions, remained unchanged. The repair used 43 BDL
reads, two free Savant reads and one two-row upsert; zero model calls/tokens.

NFL next-slate row 30158 received only the two optional schedule metadata fields
through a reviewed compare-and-swap. Readback confirms Patriots at Seahawks,
September 9 at 8:20 PM ET, provider game 1392216, checked 22:45:55Z. Original
headline, detail and existing metadata were preserved.

## Production monitor

Card coverage now executes the native resolution and payload rules. NFL Fantasy
projections no longer count as missing main-Hub cards. Bounded pagination avoids
false completeness at the database's response cap.

The NCAAF health check distinguishes a frozen AP-ranking publication from a
failed refresh only when a current slate game, latest successful NCAAF stage,
and rankings snapshot refreshed during that same attempt provide evidence.
Stale/failed stages, wrong dates/leagues, absent rows and read failures still fail.
Story timestamps remain unchanged. The actual seven-row frozen case was
verified at 23:11:15Z; later fresh content also passed normally.

The existing daily pipeline ran exactly card-watch and morning-health at
23:13:03Z. Both exited 0; the journal records recovery without erasing the older
failed attempt. The final health report was WARN with no failures. Known data
limits remain visible: five MLB signals have no posted-lineup exact pack and
keep their original reads; three NCAAF packs lack rendered statistics; complete
college cards may age; NCAAF Wire is empty. These are not invented player stats
or inferred injury status.

## Verification

Final checks passed: **2,486 backend tests across 262 files**, **180 edge tests**,
**349 web tests across 48 files**, and web TypeScript checks. PostgreSQL migration
fixtures ran with PostgreSQL 17. Debug build and signed Release archive passed;
the archive reports version 2.25/build906. Six fresh post-fix launches loaded the
real game strip and lead with no new crash report. The pulse fixture executes
300 overlapping detached requests and 61 coalesced refresh waiters with actor
runtime checks enabled. Diff checks passed. Structured results are in
`audit-evidence/hub-2026-09-07/verification.json`.

Native simulator checks covered the live MLB/NFL/NCAAF desks, refreshed Devers
and Burleson packs, exact TOR@ATH and STL@SF Picks routing, all specialist
boards, the ninth tomorrow-regression read, bounded modal and section navigation,
NFL Fantasy to NCAAF switching, league-scoped search and accessibility text.
The app supports portrait orientation. NBA offseason behavior is exercised by
executable fixtures; no fake live NBA feed was substituted.

Computer Use's accessibility actions successfully opened and scrolled to all
controls. Direct synthetic drag/wheel actions produced no observable movement,
so touch-gesture feel is not claimed as verified by this automation. The
horizontal strip's offscreen game remained reachable independently of the
vertical briefing, and source review confirms the viewport width constraint.

## Operational handoff

Canonical checkout `/Users/adam.preda/Gary2.0`, main. Keep the local private
`ios/GaryApp/GoogleService-Info.plist` uncommitted; do not read or stage it.
No push notification, pick prompt, injury-policy or hosting changes. New
content workers read the canonical checkout. Run production-truth after push
and distinguish its known private-plist exception from actual runtime failures.
