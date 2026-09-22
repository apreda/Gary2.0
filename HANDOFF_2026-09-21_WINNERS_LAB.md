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

## September 22, 11 AM — Adam's third review (the pack + the board, live big game on Home, one list, the gate, Gary in the corner)

Saved locally, simulator build green, no archive (Adam batches releases).

- **The unveil, for approval:** `winners-unveil-pack-board.html` (repo root; also
  published as a private artifact). U2's pack rip, then the ticket parks at the
  top and the three biggest reasons from Gary's take clatter in on U4's
  split-flap board. Two stages on yesterday's real card (Tigers ML, Giants
  +6.5). Not in the app until Adam approves. When it is built: the three
  reasons should come from the pick at decision time (a short `reasons` list in
  the NFL/NCAAF/prop asks; MLB's frozen June lane cannot take a new field, so
  MLB's three would be read off the stored rationale by the sub worker, in
  Gary's own words), never assembled on the phone.
- **Home:** the marquee hero now follows the big game through its life. The
  game in progress that started first holds the slot with the score on each
  wire line, the clock where the countdown sat, and Gary's pick with
  COVERING/TRAILING under it; once it is final the next kickoff's countdown
  takes over. Supersedes the Jul 7 always-UP-NEXT rule (`HomeMarqueeTracker`).
- **Winners board:** games and props are one list per day (start time, finals
  last). The PROPS sub-sections are gone; the tape already counted both in one
  record and one bankroll.
- **The gate:** the server already decides access (`gary_private.has_winners_access`:
  the free preview through Sep 30, founding accounts created before Oct 1,
  active passes); a locked board arrives as counts only. New: `WinnersGate.preview`
  (Settings → "Preview the paywall") draws today's card locked on Adam's own
  phone; a locked board is a module in the sealed shape with the count and
  UNLOCK, tap → `PlansSheetView`. Nothing turns on early; Oct 1 turns it on by
  date. The on-state mock: `winners-paywall-on.html` (artifact).
- **Talk to Gary:** the bar above the dock is gone. `GaryTalkButton` (the mark
  on a plate) sits in the bottom-right corner on every page, mounted in
  `ContentView` above the tab pages; `GaryTalkContext.shared` carries the
  page's focus (LabPlayView sets the play, LabSystemView the system) and the
  unveil hides the button while it owns the screen. Tour verb `lab talk` still
  opens the sheet.
- **NFL short samples (user-facing copy):** `footballQbWatch` carries last
  season's line beside this season's through the first 8 games (the plate's
  `meta.passing_last_season`, the detail's "Last season: ..." sentence, the
  write-up's second sentence); `footballMismatch` puts last season's number on
  every fact sheet like `footballTeamEdges` already did. New writing rule in
  `writing.md` + `WRITING_RULES`: a one- or two-game rate is a count, not an
  identity; name the games and set last season beside it. The picks-page NFL
  research method already carried the same instruction.

Open: Adam's call on the unveil; where MLB's three reasons come from (above);
the Hub's purpose (his brainstorm, in the session report).

## Sep 22 ~11:15 AM ET — the desk Gary reads (commit `6f8a9858`)
- **Bullpen evidence is written as lines now, not JSON.** `renderBullpenTeam` (`gary2.0/src/services/bullpen/service.js`) keeps every field (velocity, spin, movement, release, strikes, whiffs, hard-hit share, platoon, entry situations) as compact rows; the Tigers pen went from 41.5K to 27.8K characters, the Nationals pen from 45.1K to 30.8K; the source-URL tail is one line. Live at the next pick batch (children run HEAD). 30/30 bullpen tests and the June-era pin tests are green.
- **Desk sections count honestly.** `gary_private.lab_desk_sections` treats each team's observed pen and its reported pen as its own section (migration `20260922000400_lab_desk_pen_sections.sql`, applied). The Tigers desk now reads Bullpen 1.4K · Tigers bullpen 41.5K · Nationals bullpen 45.1K · Tigers bullpen, as reported 7.8K · Nationals bullpen, as reported 8.9K instead of one 104.7K "Bullpen".
- Bug sweep, backend side: every dossier on the Sep 20 and Sep 21 boards (18 plays) decodes with result, tape, desk and briefing; the systems crons succeed; the subscription worker is up; KINGSTON is mounted again (`diskutil mount disk4s1`).
- KINGSTON: the drive disappears at the USB level behind the hub/dock (a "USB Billboard Device" sits in front of the XS2000); it is exFAT on MBR. Plug it straight into a Mac port with its own cable; when convenient, reformat to APFS.

## Sep 22 ~11:45 AM ET — real money, and the desk cleaned (founder GO)
- **Winners is real money.** Adam: "$100 minimum, and Gary can bet whatever he wants on the $10,000 bankroll", games and props alike; Winners props keep their admission logic and only gain the money. Shipped: curation (`winnersCuration.js`) and props (`winnersProps.js`) lanes request `stake_dollars` (whole dollars 100–1000, written reasons; malformed = $100 minimum); the bankroll trigger `gary_private.size_winners_bet` (migration `20260922000500_winners_real_money.sql`, applied) reads it for every kind, the assessment ceilings and the 2u/6u/12u caps are gone, cash on hand is the only trim; `winners_board.stake_units` check is now 0–10 (1 ledger unit = $100 of the $10,000 start). The app and `gary-talk` read dollars. `com.gary.winners` was kickstarted so the watch loop carries the new ask. Tickets admitted before today keep their old stakes ($25/$50).
- **The desk Gary reads** (commit after `83ea823c`): the pen reaches Gary once (the bullpen tools answer with a pointer to the desk when the scout report already carries the snapshot); the rules paragraph is in the system prompt only; pen headers/first pitches/cutoff are ET words, no version tags, ISO timestamps, game IDs or log flags; a starter's missing stat classes are one line; NFL pasted articles lose gallery paging and blank-line runs (articles stay whole), the six "Coverage unavailable" placeholders are one closing line, the measured-evidence block is rows not JSON. Tigers pen text: 41.5K → 25.7K per team; the duplicate tool payload (108–130K) is gone. June pin for `scoutReport/sports/mlb.js` updated under this GO.
- Splitter migration `20260922000600_lab_desk_pen_headers.sql` applied (old and new pen headers both split).
- Adam approved the locked Winners look ("put that in"); relayed to the peer session that owns the lab files.

## Sep 22 ~12:40 PM ET — Stripe verified end to end, and one real bug fixed
Ran a full checkout in TEST mode against a throwaway account (created and deleted; Stripe test customer/product removed; no live money, no live objects touched).
- **Verified working:** all four Stripe secrets are set on the project (`STRIPE_SECRET_KEY_LIVE/TEST`, `STRIPE_WEBHOOK_SECRET`/`_LIVE`); webhook endpoints registered and enabled in BOTH modes pointing at `functions/v1/stripe-webhook` with the right event list; `create-checkout` returns a real Stripe session URL; `customer.subscription.created` → webhook → `sync_subscription_access` writes the entitlement with the right owner, sport, pass, expiry and customer id; `get_my_access` then reports the sport; the double-purchase guard refuses a plan the account already holds; `customer.subscription.deleted` → status `canceled`.
- **BUG FOUND AND FIXED (`8d91cec3`, migration `20260922000800`, applied):** `user_entitlements.stripe_session_id` had a plain UNIQUE index while the writer keys `stripe_session_id = '<sub id>:<SPORT>'` and resolves conflicts on `(stripe_subscription_id, product_key, livemode)`. The same subscription id in the other mode raised 23505 → PostgREST 409 → the webhook 500'd on every Stripe retry. Uniqueness is now `(stripe_session_id, livemode)`. The stuck retry landed the moment the index changed.
- **Also added:** a TEST-mode billing-portal configuration (`bpc_1UIWYaLJVzRZvO5HmWuGqV6m`, cancel at period end + payment-method update + invoice history) — test mode had none, so `billing-portal` could never succeed from a DEBUG build. LIVE config `bpc_1TgbeRLqUC52RoAIzXYWJyO3` was already in place.
- **Prices match** between `DesignSystem.GaryPricing` and `create-checkout/billing.ts`: $9.99 / $17.99 / $24.99 by sport count, $29.99 monthly and $179 annual All-Access, 7-day trial.
- ⚑ Untested: the card form itself (needs a browser) and a LIVE-mode purchase. ⚑ Adam's call: whether the in-app paywall turns on for the App Store build.

## Sep 22 — MLB ARTICLES: the finding (no code written)
Adam asked whether Gary reads published articles about the starters and the last game, the way a fan would on ESPN. The answer: **we built exactly that for MLB on Aug 26-27 (`e1afb529`, the "article backbone") and the Sep 11 June-engine restore rolled it back.**
- The backbone lives in `src/services/agentic/scoutReport/sports/mlb.js` (2,924 lines): `fetchGameStory` pulls complete official MLB.com recaps untrimmed, each probable's last three starts print as full stories, team lanes print the recaps for the games the pen actually worked, `mlbGamesAsWritten.js` selects and renders them.
- The live MLB pick lane is `src/services/agentic/mlbJuneEra/` (pinned verbatim to the June 15 tree, which predates the backbone). Its `scoutReport/sports/mlb.js` is 1,171 lines and contains **zero** published article text — its "recaps" are BDL box-score lines, and its only prose is a Grounding search summary.
- NFL is unaffected: `nflArticlesAsWritten.js` pastes whole publisher articles (the Sep 21 Giants desk carried nine, 135K characters).

## Sep 22 ~1:15 PM ET — MLB READS THE GAME STORIES AGAIN (`1ed6ab92`, founder GO)
His GO: "let's go ahead and try it. If I start to see a bad result, we'll pull it out."
- **New module `src/services/agentic/scoutReport/sports/mlbStoriesAsWritten.js`.** Each club's last 2 finals and each probable's last 2 starts as their **complete official MLB recaps, untrimmed**, deduped so a story prints once and a second lane points at it; a game with no published recap is omitted, never summarized. Recaps cache a week (finals are immutable), so repeat desks cost ~$0.
- **The June lane takes one import and one call**; the section prints as `═══ THE GAMES, AS WRITTEN ═══` after RECENT RESULTS. June pin for `scoutReport/sports/mlb.js` updated to `306fc13b3a8891d5` under this GO.
- **Kill switch: `MLB_ARTICLES=off`** in the pick process's environment. That is the "pull it out" lever; nothing else needs touching.
- Verified live against the Sep 21 Tigers/Nationals clubs: ~23K characters of real recaps with the innings, the decisions and the postgame quotes.
- **Why a new module rather than porting `nflArticlesAsWritten`** (the reuse law wants a reason stated): MLB.com publishes an official recap for every game, addressable by gamePk, so MLB needs no search and gets guaranteed coverage at ~$0. The NFL has no per-game equivalent, which is why its lane discovers publisher articles by search. Same feature, different fetch, because the data sources differ.

### NFL: the lane already exists; the gap is fetch success
`nflArticlesAsWritten.js` + `nflArticleTopics.js` carry 17 topics per game including THE QUARTERBACKS, LAST COMPLETED GAME, THE SKILL PLAYERS, THE HEAD COACHES and THIS WEEK'S CHANGES — this is the reference implementation of the feature. **Across the last 6 NFL desks, 17 of 123 topics (14%) came back "Coverage unavailable"**, mostly publisher 404/403 on fetch, worst on the Sep 21 Giants desk (6 of 23, including the quarterbacks topic). So Adam's NFL ask is a reliability problem, not a missing feature. ⚑ Not fixed; wants its own pass (retry with the backup URL, a second publisher, or a different discovery prompt).

## Sep 22 ~1:45 PM ET — session close: the ticket, the bug pass, the cleanup
- **ONE TICKET PLATE (`49e7bae0`).** Adam sent the breakdown hero beside `winners-unveil-pack-board.html`; the hero had the matchup and time crowded left with price/stake/book in a row beneath. New `LabTicketPlate` (LabDesign.swift) carries the mock's numbers exactly — league 14/tracking 1.4, pick 38, price 30 down the left; matchup 12, `$` stamp 30 rotated −8°, state line 15/tracking 1 down the right, 150pt column, 18pt radius, gold hairline 70%. The hero and the unveil both draw it and nothing else. State line names both clubs ("WIN · WSH 2 · DET 9") and colours by result. Unveil stage is solid (the page was reading through 0.94 black). Flap rows end at their last letter (his ask, relayed).
- **BUGS FOUND AND FIXED IN MY OWN WORK THIS SESSION:**
  - `2bfbb070` — `fetchGameStory`/`starterStarts` returned null/[] on a non-ok response and the cache keeps whatever the fetch returns, so one transient 500 blanked a game's story for 7 days. Both now throw on a bad status; a 200 with no recap still caches as a real answer. (The repo's own guard: a failed fetch is not an empty result.)
  - `526bc3f6` — the bankroll's cash cap could trim a request to any fraction of a unit, so a short bankroll would place a $37 bet under a $100 minimum. Cash on hand is now all-or-nothing (migration `20260922001000`, applied).
  - `8d91cec3` — entitlement session-id uniqueness ignored livemode while the writer keys on it; webhook 500'd on every retry.
  - `098e7bf3` — the free streak pick was counted as a locked play.
- **CLEANUP:** `LabFormat.unitsWords`, `GaryPick.bookHolding`, `LabPrimetimeBadge` lost their only call sites with the hero rewrite; removed. Two of my migration files renamed off the peer's prefixes.
- **VERIFIED AT CLOSE:** full suite 441 files / 4,723 tests green. `production-truth.js`: every edge function deployed (gary-talk v4 carries the dollar wording), no open support reports. Its two flags are expected — `ios/GaryApp/GoogleService-Info.plist` stays uncommitted by project rule, and the commits are unpushed because Adam holds pushes.
- **June era hash moved** to `84aade46ff6e` (the articles restore + the starter line, both under his GO). Today's stored pick carries the older `9d3d2be7e50e`; the next batch picks up the new era.

## Sep 22 ~3:00 PM ET — THE REASONS ON THE CARD (`74ac82b0`, founder GO)
Adam: "take Gary's actual three- or four-paragraph rationale and turn it into an easy, nice, short, concise way to understand what Gary is saying." Slicing the take by sentence gave the flaps a fragment with numbers in it and a body that started mid-sentence; the mock's reasons were written as claims.
- **A formatting pass, not a review.** For every board ticket with a take, a `subscription_model_jobs` job (lane `winners-reasons`, the Mac worker, $0) writes 3 or 4 reasons: `claim` ≤ 40 chars in words with a period, `why` ≤ 200 chars carrying the numbers. Contract text is `gary_private.winners_reasons_contract()`; it formats his rationale and is told not to judge, add, soften or strengthen.
- **Fabrication guard:** `gary_private.winners_reasons_valid` refuses any reason whose numbers are not in the take (and any wrong shape); a rejected job is marked failed and the next enqueue asks again. No guard on his judgment.
- **Tables:** `winners_reasons(candidate_id pk, reasons, model, job_id)`; `winners_reason_jobs(job_id, candidate_id)` because the worker blanks a finished job's `request`. **Cron:** `winners-reasons-enqueue` */2 min (last 3 days of board, no reasons, no open job), `winners-reasons-collect` every minute. **Read:** `get_winners_board` tickets carry `reasons`; `get_winners_play` has top-level `reasons`. App: `LabBoardTicket.reasons` / `WinnersPlay.reasons`; the unveil board prefers them and falls back to slicing.
- **First outputs (Sep 20 plays):** "Jax has better recent control." / "Jax recorded 28 strikeouts against six walks across his last five starts; Sandoval had 27 strikeouts against 13 walks." Passed the guard. Throughput ≈ 2 min per ticket on the subscription, so a day's card fills over ~30 min after admission.
- **Kill:** `select cron.unschedule(jobid) from cron.job where jobname like 'winners-reasons-%'`; the app falls back to slicing by itself.
- ⚑ Reasons are only on the unveil board today; the breakdown page could show them under the ticket.
