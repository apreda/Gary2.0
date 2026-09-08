# You / Gary Billfold parity — September 8, 2026

Source commit: `9cb29134`. Native version: **2.25 (913)**.

The personal book now shares Gary's balance typography, filter tabs, menu labels, section headings and result dots. Its centered balance, open 185-point equity chart, period rail, flat statistics and separated ledger rows replace the old nested cards. Personal logging, server streaks, verified/self-graded records, search, favorites, CSV export and bet-detail callbacks remain.

The headline, supporting statistics and curve use the selected verified source; Yours uses self-graded entries and visibly says so. The date, search and favorite filters apply to those summaries. The combined ledger still labels both sources separately. Pending slips ignore historical date windows. Share Verified explicitly shares the all-time verified record.

## Visual evidence

- [Overview](you-overview-fixture.png): the real updated SwiftUI section, using local sample bets reproducing the attached 1–2 history.
- [Lower layout](you-ledger-fixture.png): the actual streak/source/stat/search/ledger views in a fixture-only inspection mode that omits the three upper blocks to expose this layout. This is not an in-app alternate layout.
- Accessibility snapshots confirm favorites reduce the source record to 1–0 and search for Cardinals produces 0–1. Native taps verified Fades and empty-week filtering; the manual fixture's Yours filter showed +$20, 1–1 and self-graded labels.

The harness lives at `/Volumes/KINGSTON/gary-you-design-preview-2026-09-08`. It extracts actual declarations with no production auth bypass, configuration or network implementation. Its API/auth responses and sheet actions are local stubs, and its dock is display-only. The fixture uses Gary's public logo, fonts and gold tint; its display-only dock does not replace production navigation. Simulator wheel/drag input did not move either inspected page; lower layout was checked using the documented fixture mode. These checks do not establish physical-device scroll acceptance or authenticated server mutations.

## Verification

- Full optimized simulator app builds passed before the final date-tick refinement; the final fixture build and signed iOS archive include that refinement.
- Five focused regression files, seven tests passed, no skips. New tests execute production Swift for verified/manual separation, chronological daily totals, pushes/voids/pending handling, source/search/favorite/date filters and date-unbounded pending slips.
- Signed 913 archive passed deep/strict code-signature verification. Bundle `ai.betwithgary.app`, version 2.25, build 913. All 21 privacy manifests match signed 912, and root privacy matches canonical source.
- Logs: `/Volumes/KINGSTON/gary-913-book-regressions.log`, `/Volumes/KINGSTON/gary-you-parity-simulator-final.log`, `/Volumes/KINGSTON/gary-913-archive.log`, `/Volumes/KINGSTON/gary-913-upload.log`.

Apple upload/processing status is recorded in the root handoff. No App Review selection or approval is implied.
