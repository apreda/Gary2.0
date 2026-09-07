# App and MLB / NFL / NCAAF performance audit — September 7, 2026

Work is in the production checkout, `/Users/adam.preda/Gary2.0`, on `main`.
This follows the Mac recovery and second cleanup pass. The Mac remains the
production host. Push notifications, injury handling and pinned NBA prompts
were outside this change. The private GoogleService-Info.plist remains untouched
and uncommitted.

## Confirmed repairs

| Area | Before | Result |
| --- | --- | --- |
| MLB player logs | The shared tool rejected the provider's `STATUS_FINAL` status, discarding completed games. | Completed MLB rows reach the tool. Scheduled/postponed rows remain excluded. |
| Player identity | Whole-name searches missed BDL's first/last-name contract; one page could miss current players or namesakes. | Narrow first/last filters, complete pagination, accent/punctuation matching and exact full-name checks. Ambiguous names remain unavailable unless the matchup resolves them. |
| NFL history | Last-N summaries could be reused across different historical cutoffs; the single-player fallback read one page. | Cache full raw seasons, apply cutoff/player/season/completion/duplicate checks before choosing N, and paginate the fallback. Late-July preseason remains eligible. Outages no longer trigger a request for every player. |
| Incomplete collections | MLB and NCAAF page caps or repeated cursors could produce cacheable partial samples. | A complete collection or an explicit failure; malformed rows/pages and repeated cursors do not become cached evidence. |
| Sample freshness | A season label could conceal how old a player's latest returned game was. | Player-log evidence includes the cutoff, latest game timestamp and days since that game. |
| Model usage | Astra subscription calls inherited Haiku prices; searches inherited retired vendor prices; cached input was dropped. | All Codex subscription models have zero marginal model charge. Cached/uncached input is reported. Unpriced providers/searches make the total unavailable instead of inventing an invoice. Existing metered rates remain estimates. |
| Native MLB props | Name-only totals could cross games/days; doubleheaders chose the first schedule entry; an old live box could become a final grade. | Cache by slate/game/player, resolve doubleheaders by unique start time, refresh final boxes before grading and handle late player registration. Missing/DNP stats stay unknown; pitching markets cannot borrow batting values. |
| Hub bullpen table | A whole-season box download hit the old cap before recent games; the longest outing was assumed to be the starter. | Select each slate team's three prior completed games first, fetch only their boxes, and use the actual starter flag, including measured zero-out starts. |

The changed evidence surfaces advance MLB/NFL/NCAAF game fingerprints and the
affected MLB/NCAAF prop fingerprints. Model choices, decision prompts and
research budgets were not changed.

## Live evidence and timing

- Carson Benge's MLB tool response now contains September 4–6 game rows.
- Carlos Del Rio-Wilson resolves to NCAAF player 51520: three November 2025
  games for the historical baseline and one September 5 game for 2026.
- Josh Allen resolves to Buffalo's player 38 when the matchup is supplied.
  December and September 2025 windows are correctly separated; changing the
  cutoff reuses the downloaded stats (0–1 ms in the measured warm calls).
- The new bullpen query covered 22 slate teams using 42 distinct game IDs,
  three filtered requests and 1,285 stat rows in about 11 seconds. Each request
  can paginate. The resulting top-15 table has three observed games per team.
  No bullpen table existed for today; this one was published to `league_pulse`
  and all 15 rows were read back and compared with the reviewed preview.
- All 69 recent saved MLB/NCAAF decision envelopes retain exact desk and
  research copies and both team cases. MLB desks are 100,495–118,000 characters;
  NCAAF desks are 35,709–58,167. This verifies stored evidence, not invisible
  compaction inside a model provider. The CLI sends full prompt text over stdin.
- Three recent MLB log files contain 1.25–1.84 million reported total tokens
  across 17–22 calls, including research. Cached input accounts for about
  29–42% of those totals. This is cumulative usage, not one oversized prompt;
  the denominator includes output. Complete original desks remain available
  to research factors. No evidence was trimmed to make a token total smaller.
- The latest stored NFL slate is the August 25 preseason week. Those picks
  predate the new evidence envelopes. NFL verification therefore combines
  recorded run logs, integration fixtures and live provider reads, rather than
  claiming a new regular-season production pick was generated during this audit.

Detailed receipts are in `audit-evidence/performance-2026-09-07/`.

## Verification and delivery

- `npm run verify`: **2,193 backend + 180 edge-helper + 349 web = 2,722 passing
  tests**, plus Next/TypeScript checks. Final log:
  `/tmp/gary-performance-final-checks.log`.
- The native fixture compiles the actual LivePropStatsCache and drives it with
  HTTP fixtures: doubleheaders, ambiguous schedules, day rollover, final-box
  failures, late players, DNP/missing values, zeroes and market isolation.
- Web smoke passed against a temporary credential-free copy of the real web
  source. The initial production-folder invocation correctly refused
  `web/.env.local`; no live credentials were removed or passed to fixtures.
- Simulator build succeeded. Home MLB/NFL/NCAAF switching, Home horizontal
  scrolling, Picks, Winners, Hub and Billfold were checked. The simulator is
  signed out; authenticated purchases and account flows were not tested.
  A process snapshot settled to 1.2% CPU and about 347 MiB resident memory after
  navigation. This is an observation, not a frame-rate or leak benchmark.
- Version **2.25 build 903** archived on the external disk and was accepted by
  Apple for processing at **12:37:51 ET**. It includes these native repairs and
  the NCAAF abbreviations from the preceding task. Upload acceptance does not
  establish TestFlight processing/review completion. Build 901's existing
  App Store review submission was not changed.
- Archive: `/Volumes/KINGSTON/Gary-2.25-903-Performance.xcarchive`.
  Logs: `/tmp/gary-performance903-archive.log` and
  `/tmp/gary-performance903-upload.log`.

Backend pick runs are fresh children of the production scheduler and read the
updated files without a daemon restart. Scheduler PID 79083 and Winners PID
89023 remained running from the canonical checkout. Existing saved picks retain
their original era and were not rewritten. Run `node scripts/production-truth.js`
after the commit/push; the known private plist is the expected working-tree
exception. The edge check is timestamp parity, not deployed-source comparison.

## Observed limits

- BDL returns no 2025 or 2026 stat rows for Devin Carter (3226739), EJ Kelly
  (3227852) or Christian Rhodes (3227854). Their three college cards remain
  limited; no missing measurements were turned into zeroes. All 90 MLB and
  six NCAAF player links still reach a card.
- Aaron Judge's returned 2026 rows stop on May 31. The tool now exposes that
  sample age. This audit cannot establish whether the missing later rows are
  a provider coverage gap or an absence of appearances. Edwin Diaz has two
  exact provider identities; an unscoped request now reports ambiguity.
- The production board contains all 12 games. At 12:39 ET, seven MLB picks were
  saved, with four MLB and one NCAAF game still ahead of their publication
  windows. No started game or final retry window was missing a pick.
- Internal storage remains low: **8.8 GiB free** at 12:43 ET. New signed archives
  went to the external drive. Source, saved simulator data and private config
  were preserved. Existing Xcode Cloud release-config failure remains the
  tracked redacted-Google-config issue; the signed Mac archive/upload succeeded.
