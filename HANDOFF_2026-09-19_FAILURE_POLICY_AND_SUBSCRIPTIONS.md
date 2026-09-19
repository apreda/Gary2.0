# Gary repair — September 19, 2026

Status at 1:53 PM ET: the bounded repair and manual publication batch are finished. Build 933 is in TestFlight; 49 game picks and 34 props are stored for the 50 eligible games, all on Sol. Adam authorized best-effort repair and resumption within three hours, starting 11:12 AM and ending no later than 2:12 PM. This supersedes the earlier college hold. Remaining provider omissions are listed below; this is not a claim of complete market coverage.

## Live changes

- NCAAF is resumed on Sol. Coverage is any game involving ACC, Big Ten, Big 12, SEC, Pac-12 or Notre Dame, regardless of opponent. The six 2026 Pac-12 arrivals are corrected where BDL still lists their previous conference. Today's eligible slate has 50 games.
- Each covered game produces one game pick and at most one player prop. The normal retry also completes a missing prop after an existing game pick, and the atomic writer prevents a second prop for the same college game. A missing bookmaker market remains a reported missing prop.
- The final database read at 1:52:47 PM has **49/50 game picks and 34 props across 34 distinct games**, all on `codex-gpt-5.6-sol`. The one-time three-worker evening batch ran from 1:08 to 1:52 PM and published 21 of its 22 games. Fresno State–San José State is the remaining game: BDL returns HTTP 200 with zero game-odds rows and zero prop rows. Its 11 PM kickoff remains scheduled for normal attempts at 7 PM, 8 PM, 9:30 PM and 10:30 PM ET. The real schedule was confirmed in the running scheduler log.
- Sixteen games lack a quoted prop. The final snapshot lists each game. Ten still-upcoming missing boards were re-read directly at 1:44 PM and all returned HTTP 200 with zero markets; later Boise State and Oregon State runs also found no board, and Fresno's empty prop response was confirmed at 1:52 PM. Three noon games are already past kickoff and must not receive late/backdated props. Upcoming games retain the normal retries; no second prop is generated for a covered game.
- Removed the timing rule that killed healthy NCAAF workers merely because another retry trigger was approaching. Existing kickoff limits remain: no late or backdated picks.
- Removed the extra prose-to-ticket AI rewrite and its unused module. It could mistake a statistic such as 4-for-10 for changed betting numbers, and unnecessarily call Astra. Gary keeps his original decision and explanation.
- Fixed a touchdown-menu mismatch: Gary saw YES while the parser required a numeric line. The menu now prints both, and the exact YES ticket resolves only to a unique matching player/market/side/price. Baylor's prop published successfully after this correction. College props explicitly start on Sol.
- Removed compulsory bilateral headings and the optional research-assistant prerequisite for college games. Source identities and real priced tickets still matter; headings and paragraph formats do not decide publication.

## Real causes found

CFBD's adapter matched the first school-name prefix. Georgia Tech could receive Georgia's advanced stats; Iowa State could receive Iowa's; ranked lookups could change identity based on rank order. The resolver now selects the complete school and rejects school-name extensions masquerading as mascots. Live corrected results: Georgia Tech offensive success 42.06%, Iowa State 32.04%, Ohio State 48.18%.

Some noon decisions had already been published before this was found. The Iowa State rationale used Iowa's numbers; the Mercer–Georgia Tech research encountered Georgia's numbers and questioned the inconsistency. Those are historical source defects, not evidence that the old picks were generated correctly. They were not rewritten after kickoff. Future processes use the repaired lookup.

Another global cap dropped valid football observations. NFL computed 32 QB rows but published only four. The cap is removed for football; current production now has both projected QBs for all 16 games. Native reads paginate the full college slate. NFL projected QB selection now uses the same current-depth logic as the game scout, instead of labeling a ruled-out QB1 as the starter.

The college season-stat tool also discarded both sides when only one team's BDL row was absent, commonly in FCS matchups. It now retains the available team's actual row and names the missing team's source failure. A live Nebraska–North Dakota read returned Nebraska's 248 opponent passing yards and 224 rushing yards while North Dakota remained unavailable. Partial components no longer masquerade as complete totals. The season passing leader is explicitly distinguished from today's reported starter.

Automated Codex calls were loading development configuration, repository instructions and browser/plugin tools. Sports calls now use a neutral directory and only the supplied task/tool context. Built-in web search still works. College press coverage is one cached dossier per matchup instead of six overlapping searches. There are no metered Anthropic/OpenAI request paths in active adapters.

## Gary's college judgment

Current reporting introduces current players, transfers, freshmen, roles, coaches and program changes. The prompt explicitly invites reasoned opinions about this opponent, personnel, defense, game plan, stakes and venue. Statistics describe what happened; they do not have to prove every prediction. Removed assumptions that known injuries were automatically priced correctly or that small samples automatically invalidated an advantage. There is no favorite/underdog quota. Today's small sample cannot prove that all bias is eliminated.

The house-limit re-ask now neutrally offers either side of the spread or a moneyline within the existing price limit; it no longer singles out the underdog's moneyline. Historical automatic underdog Winners admission was already superseded by the September 12 curation path; that old migration is not today's selection rule.

Useful recent work was retained: dated college player evidence, NFL team statistics on both sides of the ball, current-depth QB selection, and football defensive context. NFL's decision report now includes opponent scoring, passing/rushing production, third-down rates, sacks and turnover context, alongside individual defenders and current reporting. This is useful coverage, not a claim that every advanced defensive metric is available.

BDL remains the schedule, roster, box-score and market source; CFBD supplements advanced college metrics and ratings. Bulk endpoints and shared caches are appropriate. The specific problems were joins, repeated research, cap-based data loss and job timing—not the mere presence of BDL stats. Missing advanced metrics or reports must not be invented.

## App changes

Current official season staff pages may establish coaching roles without a new weekly article. Their retrieval time is recorded; no publication date is invented. They cannot establish current QB or injury status. Real uncertainty remains explicit—for example, Utah State had not announced Hillstead versus Brosterhous, and Rutgers had not confirmed its starter in the retrieved reporting.

The final source refresh completed its 39 remaining pregame games and published 403 current QB/availability rows. A cached refresh under the corrected staff-source policy resolved Florida–Auburn's remaining coaching warning. At 1:46 PM, all 100 team/game coaching entries were ready, 94/100 QB entries were ready, and 97/100 availability entries were ready. The six unresolved QBs were Utah State, Rutgers, Western Kentucky, Murray State, West Virginia and New Mexico, each with documented competition/injury uncertainty. USC and Mississippi State each had one reported absence not matched to the current roster; Northwestern's availability report remained incomplete. Their other sourced information was retained.

NFL Picks now reads the full Tuesday–Monday week. The existing daily collection refreshes its information; actual game picks remain day-of. Both projected QBs, current injury/practice data, matchup observations and line history are available before a pick. Weekdays are included in weekly game labels.

THE LINE is below football analysis. The Ohio State screenshot's latest -52 (-115) and 59.5 over (-102) match the stored BetMGM snapshot. The first captured quote is labeled FIRST SEEN, not falsely claimed as the bookmaker's opening line. Signed spread moves and total over-price labels are explicit.

The inherited native repair provides opaque football containers, wrapping injury labels, equal Hub tiles including an odd final tile, no gold left bar in the team read, fewer eager offscreen game views, and less repeated formatting/layout work. Equal college Hub tiles, named QBs and NFL information before picks were observed in the running simulator. A later live check exposed duplicate injury names with/without position suffixes; build 933 merges those by player, uses current reporting ahead of the pick snapshot, and colors out-for-season correctly. Physical-phone scroll performance is not yet measured.

Chase Burns -187 was a stored provider quote. There is no matching historical book/time receipt proving -400 for the identical ticket; it was not changed to an assumed price. Exact player/market/line/side/book pairing is preserved.

## Accounts and alerts

Claude subscription → business GPT subscription → personal GPT subscription → configured DeepSeek last. College decisions stay Sol on GPT. Paid Anthropic/OpenAI adapters refuse, cloud API keys were removed, and CLI subprocesses strip API keys. Research, source search, football grounding, Wire, cloud writing, recaps and slip scanning previously had metered Anthropic paths.

Five cloud functions use the private subscription worker: social-auto-post, grade-results, reply-engine-scan, engagement-sheet and book-slip-scan. The worker is running with two slots. This requires the Mac to remain available; it does not silently return to paid API use.

The alert collector previously retained errors after manual recovery. It now uses the existing published-output snapshot to clear those failures, without extra network checks, and college prop publication resolves its prior incident. Ten stale game failures cleared, including a game excluded by the new scope. Valid pregame context no longer becomes a new collection failure merely because its game finished hours earlier. Actual no-board errors now say why in the email.

The unwanted five-minute AI failure automation was DELETED. No replacement AI polling was created. Ordinary code failure emails remain, with source reasons and incident deduplication. There is no promise that a stopped chat wakes automatically to repair an incident.

## Verification and delivery

- Source is committed and pushed directly to production main. Main repair `7b55463d`; identity/health/NFL completion `815b3b59`; canonical board/current showcase `f1cf4c27`; touchdown/Sol correction `855f502f`; current official staff sources `335fa644`; native injury merge `2d70bd04`; prop recovery `0f2e0967`; published-output incident recovery `e96f6d1f`; pregame context age `cef734ee`; neutral ticket wording/QB role `bf58a78a`; independent team-stat availability `501bd866`.
- Cloud deployment succeeded at 12:13 PM: social-auto-post v123, grade-results v40, reply-engine-scan v16, engagement-sheet v12, book-slip-scan v6.
- The Mac restarted at 12:35 PM. Launchd recovered the canonical scheduler (PID 1565), subscription worker (1558) and Winners worker (1574). Afternoon publication continued. Interrupted manual research/card/build work was resumed after verifying the former processes were gone.
- The canonical app board is `tomorrow_board`, including today's date. The manual `--today` command now writes that same table. Today's snapshot has 65 games: 50 eligible NCAAF plus 15 MLB.
- All 50 eligible college games have player cards (841 cards); all 16 NFL games have cards (375 cards), with 32 projected-QB rows. Old same-day out-of-scope observations/cards were backed up locally and retired: 129 observations and 151 cards for 14 games. Historical picks were preserved.
- Removed 126 malformed component-health rows keyed as game `undefined` and fixed the missing game identity. A later read confirmed zero malformed rows. A health-write error no longer discards collected sports information.
- Earlier full repository checks passed before this bounded repair. Subsequent focused checks covered the actual team-name collision, missing-value handling, identity, quoted touchdowns, coaching sources and incident recovery. The 89 focused recovery checks passed after removing an obsolete paused-college assertion; 78 morning-output checks passed after retaining valid pregame context through the evening. Eight focused stat-pairing regressions also passed, and the missing-opponent case was read directly from BDL. These are development checks, not a publication approval layer around Gary.
- Build 2.26 (932) archived, uploaded at 12:50:05 PM, completed Apple processing at 12:52:46 and became available in TestFlight at 12:52:53. Apple email confirmations are saved in `apple-delivery.json`. Build 933 adds the final injury-display correction; its archive and Release simulator build passed. Upload succeeded at 1:05:43 PM, Apple processing completed at 1:07:47, and TestFlight availability was confirmed at 1:07:48. `apple-delivery-933.json` records the Apple receipts. 933 supersedes 932. No public App Store submission was made.
- The final production read found the canonical workers and deployed edge functions; its parity flag is the five preserved unrelated local changes, not failed pick publication. Preserve deno.lock, the staged winnersCascade deletions, the NFL audit folder and the private GoogleService plist. Never read/hash/stage the private plist.

The manual evening batch and source refresh have exited. The regular scheduler remains running for ordinary collection, future game/prop attempts and grading. Fresno's missing game market, sixteen missing prop boards, six unresolved starting-QB decisions and three incomplete availability reports remain explicit limitations. There is no fabricated replacement information and no new recurring AI repair automation.

Evidence is saved in `/Users/adam.preda/Documents/ChatGPT/Gary/failure-policy-2026-09-19/`: `final-delivery-snapshot.json` contains every eligible game's publication status and the final model/component counts; `remaining-prop-markets.json` contains the direct empty-board responses; `apple-delivery-933.json` contains Apple's delivery confirmations. Visual evidence includes `NCAAF-Hub-equal-tiles.jpeg`, `NCAAF-quarterbacks-933.jpeg`, `NCAAF-injury-933.jpeg`, and `NFL-week-final.jpeg`.

## Follow-up: failure email investigation, 2:03 PM ET

Adam supplied the 10:27–12:38 email screenshots after the initial report. The incident ledger confirms the component-reader HTTP 400 resolved at 10:50:15; scheduler heartbeat delay at 12:13:57; Mac reporting interruption at 12:38:00; Baylor prop incident at 1:01:43; and Mercer game incident at 1:04:46. FSU–Alabama, Miami OH–Cincinnati and Duquesne–Washington State prop incidents remain actual missing BDL boards. Generic job-failed messages were inadequate. Scheduler title now accurately says heartbeat delayed, without claiming active workers stopped or changing detection/recovery. No new monitor or AI job was added.

GitHub CI had remained red after the repair; the earlier report should have identified this. Investigation found obsolete conference/routing/retry/heading expectations and missing NFL-week methods/fields in the Apple fixture. These were updated to the authorized behavior. Optional explicit football case text is retained when present, without becoming a progression gate. Next-slate copy no longer falsely labels major-team/FCS games FBS-vs-FBS. The two preexisting staged winnersCascade deletions are deliberately included now: both live Winners callers use the shared modelCascade, and a reference search confirms the old module is unused. Private plist, deno.lock and NFL audit folder remain untouched. Focused failed-backend cases pass; the corrected Apple fixture and operational alert checks pass. Fresh remote CI is being observed; do not claim green before it completes.
