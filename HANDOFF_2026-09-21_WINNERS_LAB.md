# The Winners Lab — September 21, 2026 (evening)

Adam gave the Winners rebuild to Claude to own: "it's just for fun right now,
exploring, no wrong answers". Winners is the paid room. The board stays
minimal; a play unveils full screen and lands on a dense breakdown; Talk to
Gary rides the bottom of both pages; the fan builds systems that mirror
Gary's board. Spec: `docs/superpowers/specs/2026-09-21-winners-lab-design.md`.

## Release state

- **2.26 (945)** — the App Store candidate, archived from `06cedfb9` (the
  September 21 design pass, nothing from the lab) and uploaded to TestFlight
  at 8:01 PM ET. Adam submits it in App Store Connect. Logs:
  `/Volumes/KINGSTON/gary-945-archive.log`, `gary-945-upload.log`.
- **2.26 (947)** — the lab, for Adam's phone only. 946 was taken by another
  session's design-pass archive that was uploading at the same time, so the
  lab took the next number. Archive `/Volumes/KINGSTON/Gary-2.26-947-winners-lab.xcarchive`,
  logs `gary-947-archive.log` / `gary-947-upload.log`.
- The classic Winners page is one switch away: Settings → "Winners lab" off
  (`@AppStorage("winnersLab")`). `PremiumPicksView` is untouched.

## What the lab is (iOS, `ios/GaryApp/WinnersLab/`)

- `WinnersLabView` — the board. Header (Winners + the date in words, a
  TODAY/YESTERDAY switch), the tape strip (today's record and units, open
  count, yesterday), text filters (GARY · YOU, then ALL · MLB · NFL · NCAAF),
  one module per game: sealed until unveiled on this device (dashed seal,
  "SEALED", countdown, the unit stamp), then the ticket, price, stake and a
  live state (Sealed / Live with the score / Final with the grade). Props
  admitted on a game with a game ticket ride under it. Locked leagues render
  an UNLOCK plate → `PlansSheetView` → `WinnersAccessStore.checkout`. Reads
  only `get_winners_board`; admission and units are the server's.
- `LabUnveil` — tap a sealed module: the seal splits, the ticket lands in
  Bebas, the price, the stake and the play's state follow, then the
  breakdown pushes. Long-press an unveiled module to re-seal it. Unveiled ids
  persist in `winnersLab.unveiled`.
- `LabPlayView` — the breakdown, one RPC (`get_winners_play`): hero, the
  tracker (`LabTracker`: a prop's running value against its line with the
  line marker; a game's score and cover margin against the number; pregame
  countdown), THE NUMBER (opened → now from `line_ladder`), THE TAPE (the
  board's 30-day record for this league and kind, every sport's line), THE
  CASE (Gary's rationale in full), WHAT BEATS THIS / THE PATH (the two written cases),
  ON THE CARD WITH IT (the other admitted tickets on the game), THE BOOKS,
  KEY NUMBERS (the existing tale-of-the-tape rows and injuries), WHAT GARY
  READ (the desk's character count and its sections; a section opens as
  cleaned reading text), THE RESEARCH BRIEFING (collapsed).
- `GaryTalk` — the bar above the dock on the board, the breakdown and a
  system page; the sheet is the conversation. Gary's reply shows the reader
  lines the server sends ("Opened the Giants @ Rams desk", "Checked the
  number"…). Voice toggle in the sheet header: the text arrives first, then
  a second request renders Gary's designed voice on the Mac and plays it;
  if that fails the phone reads the reply itself (`AVSpeechSynthesizer`,
  lowest available en-US voice, slowed). "Hear it" replays.
- `LabSystems` — YOU on the board: the compare strip (Gary's 30 days vs the
  fan's best system), the systems list with records, START A NEW SYSTEM.
  The builder is text rows with the gold underline (sports, side, market,
  price band, spread, time, with/against Gary) and a live "Matches tonight"
  preview. Saving enters tonight's matches at one unit; the server enters
  the rest every 30 minutes and settles every 10. A system page lists its
  bets with Live/Win/Loss states and Gary's own ticket on the same game
  ("Gary agrees" / "Gary went the other way"), opening his breakdown.
- Tour verbs (DEBUG): `lab you|gary|yesterday|today|reseal|talk|unveil|open <candidate id>`.

## Backend

- `gary2.0/supabase/migrations/20260922000000_winners_lab.sql` (builder A):
  `get_winners_play`, `get_winners_desk_section`, the systems tables and
  functions (`system_matches`, `upsert_system`, `delete_system`,
  `my_systems`, `enter_system_bets`, `enter_all_active_systems`,
  `settle_system_bets`, `beat_gary`, `system_bets_for`), `gary_talk_usage` +
  `record_gary_talk`, two pg_cron jobs. See the builder's receipt at the end.
- `gary2.0/supabase/migrations/20260922000100_gary_talk_allowlist.sql`
  (applied): `gary_talk_allowlist` seeded with apreda31@gmail.com, storage
  bucket `gary-voice`. While the table has rows only listed emails reach
  Gary; delete the rows to open the line to every signed-in member.
- Edge function **`gary-talk`** (deployed, `verify_jwt`): session check,
  allowlist, the cap, the desk context (the day's board with reasons and
  units; the focused play's case, both sides, the storylines/injury/betting
  sections of its desk, the score or the final, the 30-day tape, the
  research briefing), then one model job through the Mac worker's
  subscription cascade (`subscription_model_jobs`, lane `gary-talk`,
  `claude-opus-5` request shape, observed route claude-subscription, about
  20 seconds). `{voice_text}` alone renders a reply's audio (lane
  `gary-voice`, 130-second budget) and returns `{audio_url}`.
- Worker lane `gary-voice` in `gary2.0/src/services/cloudModelJob.js`: runs
  `scripts/gary-voice/say.py`, uploads the WAV to the private bucket, returns
  a one-hour signed URL. `com.gary.subscription-model-worker` was restarted
  and serves it.

## The voice

`gary2.0/scripts/gary-voice/` — Qwen3-TTS 1.7B VoiceDesign (Apache 2.0)
through mlx-audio in a uv venv (Python 3.12). No cloning of anyone: the voice
is designed from words. `voice.txt` (base: an older man, low and gravelly,
cigar-worn, dry, unhurried, clipped, a slight New Jersey edge, confident,
never shouting), `voice-b.txt` (heavier gravel, thick Jersey), `voice-c.txt`
(light gravel, neutral). Samples of the same Gary paragraph:
`outputs/gary-voice/gary-a.wav`, `gary-b.wav`, `gary-c.wav`. Render cost is
about 1.1 seconds per second of speech plus a 4.5-second warm model load (22
seconds cold). The model cache (4.7 GB) lives on the external drive at
`/Volumes/KINGSTON/hf-cache` with a symlink at `~/.cache/huggingface`
because the internal disk hit 154 MB free during the build; the voice lane
needs the drive mounted.

## Verification

- iOS: Debug simulator build green (iPhone 17); the board rendered tonight's
  three games (Nationals @ Tigers ½u live INN 7, Giants @ Rams ¼u with the
  Skattebo prop riding, Twins @ Giants ¼u sealed) and yesterday's 8-6 -0.5u
  tape; the Giants breakdown rendered every plate against the live RPC
  (score 0-0 Q1, covering by 6.5, the case in full, the books, 188,757
  desk characters in 44 sections). Release archive for 947.
- Backend: `get_winners_play(463713)` as Adam's user returned the documented
  shape (candidate with reason and 0.25 units, 44 reader-titled desk
  sections, the Skattebo companion, the live row, the 30-day tape); the SQL
  builder exercised every RPC including a rolled-back settlement of seven
  Sunday bets (5-1-1, +4.78u) and `beat_gary(30)` (Gary 55-62, -16.39u).
  `gary-talk` answered end to end through the worker in about 20 seconds;
  a voice job rendered and signed a WAV (30 seconds for a short line).
- Adam checks the phone. No screenshots as proof.

## September 22 morning — Adam's review of 947 ("a lot still looks bad and isn't working"; "take out all the explainer words")

Build **949** carries the fixes (948 went to a peer session's no-ellipsis build):
- Every caption and explainer is gone: no "Tap to unveil", no "Plays land here as…", no "Gary never sees your systems", no talk-sheet opener, no question counter, no "characters on this game before he wrote a word", no line-history notes, no asterisk footnotes. Labels stay; sentences that explained the interface do not.
- The admission memos never show. The board's "why" line and the breakdown's "Why it made the board" plate are removed; the curation reason is reviewer voice, not reader copy. The case is Gary's own words and stays.
- Raw strings fixed: the hero and "On the card with it" name a prop in words ("Cam Skattebo over 51.5 rushing yards"), the book label only appears when exactly one book held Gary's price, desk sections open cleaned of rules, marks and source stamps, and section titles wrap instead of truncating.
- Bugs: the systems preview could not decode the slate's game ids (every "Matches tonight" came up empty); switching to yesterday never reloaded the board; server errors printed as raw enum text; anonymous founding users had lost the breakdown RPC (anon grant restored, migration `20260922000300_winners_lab_anon_reads.sql`); sheets on one view now each have their own host.
- Sealed modules now lead with the matchup ("GIANTS @ RAMS", "2 PLAYS") instead of a sentence; the prop tracker shows the line as its figure until a live stat exists.
- Verified in the simulator against yesterday's real board (Tigers ML won, Giants +6.5 lost, Skattebo lost, Twins ML lost; 1-3, -0.4u) through the unveil and the breakdown.

## September 22, 10 AM — second review ("pause the systems", "the props are missing", "marry today and yesterday", "closer to the HOF layout", "a real pack-opening unveil")

Build **950**:
- Beat Gary / systems is paused: the GARY · YOU tabs are gone from the board. The code stays (`LabSystems.swift`, the RPCs, the crons) for when it returns.
- Props are back as their own section. Every admitted prop is its own module under PROPS, never nested under a game.
- Today and yesterday are one page: TODAY (sealed modules, or a sealed "TODAY'S CARD" plate before anything is admitted) then YESTERDAY (graded modules, never sealed, with its own PROPS section). The date toggle is gone.
- The breakdown moves THE MATCHUP (the tale-of-the-tape table and injuries) directly under the hero, then the game, the number and the tape, the books, the case, what beats it. That is the HOF order: header, table, then the rest.
- The unveil shows the play's state (Win with the score, Live with the clock) instead of "Seals 6:40 PM" for a game that already played.
- Five animated unveil concepts for Adam to tap: `winners-unveil-concepts-5.html` (the seal, the pack, the vault, the Vegas board, the match). Not in the app yet; his pick decides which one gets built.
- Still to build for the HOF layout: the game-log bar chart (a player's last games against the line, green/red). It needs a server endpoint that reads BDL game logs with the server key (`BALLDONTLIE_API_KEY` is in the edge environment; the NFL prop snapshot carries `player_id`, MLB props need a name lookup). Proposed as the next backend piece.

The desk question (Adam: "why is Gary fed 104K characters of bullpen?"): the 104,707 figure was the section splitter's artifact — everything after the last recognized header was attributed to "Bullpen". The real composition of the Tigers desk (128,074 characters): 19 per-reliever pitch-profile lines from the September 16 bullpen evidence repair, about 30K characters (23%); transactions about 3K; the game logs about 4K; the rest is the team sections, rosters, storylines and research. Gary does read all of it (a 128K desk is about 32K tokens, well inside the models' windows) and the pick is a pure function of that desk by design. Whether the bullpen evidence should be condensed before it reaches him is a lane decision on the June MLB engine's approved exception; a per-reliever table would be a fraction of the size. Not changed here.

The external drive dropped off the machine at about 10:04 AM (no USB device present). Derived data, the archives and the voice model cache live there; this build and archive ran from the internal disk (`~/Library/Developer/Xcode/DerivedData/gary-local`, archive under `~/Library/Developer/Xcode/Archives`). Gary's rendered voice is unavailable until the drive is back; the app reads replies with the phone's voice meanwhile.

## Open

- Adam's ear picks the voice (a, b or c) and its pace; the instruction text
  is the only speed lever.
- The paths in "What beats this" read like memos in places ("the supplied
  context"); if customers see them, that is a generation-time contract fix.
- Raw desk sections carry internal labels; fine for Adam, not for customers.
- The tape counts units only for sized plays (stakes exist since the
  September 16 bankroll). The app and Gary quote the same definition.
- Systems: totals and spreads use a standard price unless Gary holds the same
  side; marked with an asterisk in the app.
