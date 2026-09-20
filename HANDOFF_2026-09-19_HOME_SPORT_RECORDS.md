# Home sport records and daily tab order — build 937

Adam requested that the Home board's bottom record reflect only the selected
sport and that sports with games lead the tab order. Source
`8b1a0115ba65c4423745ae031e66812c2afdc21e` is pushed to main.

The board footer uses the selected sport's graded game picks for the loaded
slate date. Record, net, best cash and store-safe win rate share that same
receipt. The LIVE label is sport-specific; an idle sport shows today's 0–0.
Preseason exclusions, the separate daily recap and the user's YOU record
remain intact. No prediction, provider or grading behavior changed.

Sports with games lead, with NFL/NCAAF/MLB breaking ties. A college/baseball
day reads NCAAF → MLB → NFL; an NFL/baseball day reads NFL → MLB → NCAAF.
Inactive tabs remain selectable and the user's explicit choice persists.
The YOU tab stays last when personal bets exist.

64 focused checks passed across the Home/football suites, including executed
Swift accounting and day-order fixtures. The Release Simulator build and
signed device archive passed. Simulator UI verified NCAAF 12–15 / -$408,
MLB 2–2 / -$53, and NFL 0–0 / $0 during the live Saturday slate. Those values
are a verification snapshot, not the day's final record.

All [source CI checks](https://github.com/apreda/Gary2.0/actions/runs/35479175142)
passed. Build 2.26 (937) uploaded successfully September 19 at 8:40:41 PM ET.
Apple confirmed TestFlight availability at 8:42:50 PM ET and completed
processing at 8:42:54 PM ET. It is ready to install from TestFlight.

Archive: `/Volumes/KINGSTON/Gary-2.26-937-Sep19.xcarchive`.
Evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/home-sport-records-2026-09-19/`.
See `review.md`, the UI snapshots, build logs and delivery receipt.

Production truth confirms the canonical scheduler and Winners process, edge
deployment timestamps, 15/15 published MLB games and no unpushed code. Its
only flags are the three preexisting local exceptions: `gary2.0/deno.lock`,
the private uncommitted `ios/GaryApp/GoogleService-Info.plist`, and the unrelated
NFL evidence folder. They were preserved and excluded from this delivery.
