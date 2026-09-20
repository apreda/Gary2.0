# Upcoming pick-card layout — build 943

Adam's 12:11 PM screenshot showed the NFL MIA @ SF incoming card with its
eyebrow and bear clipped against the top edge. The separate `TeasedPickCard`
layout exceeded the regular 232-point card height: its larger hero, wrapping
description and extra results-button row consumed more vertical space than the
card allowed. Its older flat surface also differed from published pick cards.
The earlier build 942 grade/order correction had not changed this placeholder.

Implementation: `454a51c349e67a6679f39a87f0d98b3cf8ed2460`, pushed to main.

## Correction

Published and unpublished game cards now use the same `PickCardHeader` and
`PickCardBackground`. The placeholder follows the regular 52-point hero,
padding, divider and footer spacing. Short status copy fits one line, while
the existing yesterday-results action uses the footer chevron with its
44-point button and accessibility label. Its caller supplies the card width.
The existing incoming, no-pick and provider-interruption states remain.

The shared extraction preserves the published-card appearance exactly. The
existing DEBUG renderer now includes actual placeholders at 320, 375, 402 and
430-point phone widths, plus started, postponed and no-action cases.

## Verification

All four width renders and the unpublished states were visually inspected.
The MLB/NBA stacked published render and the college gold/long-name render
are byte-for-byte identical to build 942. Production read-only simulator QA
also confirms the user's MIA @ SF screen fits correctly; CAR @ ATL remains
the first matchup, and Thursday's original Lions +5.5 -108 shows
`LOST · DET 31 · BUF 41` at the end of the row after Monday.

Local backend lint, backend/web type checks, 4,569 backend tests in 428 files,
243 edge tests, 953 web tests in 89 files, native source membership, and the
complete iOS Simulator compile passed. Backend tests used two workers and
passed on the first run for this change.

Evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/pick-placeholder-2026-09-20/`.
`visual-verification.json` records published-render hashes; `nfl-mia-sf-incoming.png`,
`nfl-first-game.png`, and `nfl-thursday-final.png` record the live screen checks.

## Delivery

Build 2.26 (943) was successfully archived at
`/Volumes/KINGSTON/Gary-2.26-943-pick-card-placeholder.xcarchive`; strict, deep
codesign verification passed. Upload succeeded September 20 at 12:27:53 ET.
Apple confirmed completed processing at 12:30:25 ET and TestFlight availability
at 12:30:27 ET.

- [TestFlight 2.26 (943)](https://testflight.apple.com/v1/app/6751238914).
- Availability receipt: `1a0bfa79c0890a70`.
- Processing receipt: `1a0bfa797c705543`.
- Upload log and machine-readable receipt: `upload.log` and `delivery.json` in
  the evidence directory above.
- [Implementation verification](https://github.com/apreda/Gary2.0/actions/runs/35522654998)
  passed all four jobs, including the complete iOS Simulator compile. The web
  job also passed fixture-page/export and sitemap-outage smoke checks.

This is native presentation maintenance. No backend handler, stored ticket,
publication timing, TD cap, research/history policy, injury handling, or dark
research-container styling changed. Preserve the local deno.lock, private
Firebase plist, and audit-snapshot exceptions.
