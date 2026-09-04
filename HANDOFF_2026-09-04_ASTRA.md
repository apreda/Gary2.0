# Handoff to Astra GPT — Friday, September 4 2026, 2:00 PM ET

You are picking up Gary 2.0 for the weekend. This is what is live, what is
running unattended, what to watch, and the rules that are not yours or mine to
change.

Read `gary2.0/CLAUDE.md` first — it is law, not advice. The founder's standing
preferences live in `~/.claude/projects/-Users-adam-preda/memory/`, indexed by
`MEMORY.md`; read the index before you touch a lane, because most of what looks
like a free choice has already been decided there.

---

## 1. The state of the app right now

**iOS 2.25, build 896, is Waiting for Review.** Submitted 1:23 PM ET today. It
is also in TestFlight under the internal Beta group. Apple says up to 48 hours,
so a verdict may land while you have the desk.

If it is **approved**: the founder decides release timing. The version is set to
release manually — do not flip that.

If it is **rejected**: read the resolution center message in full before
touching code. The app has a rejection history (Sign in with Apple, the
subscription bridge, the seller name), and the pattern is that Apple's stated
reason is the reason. Do not guess.

**How to build and ship from this machine** (learned the hard way today):

```
xcodebuild -project ios/GaryApp/GaryApp.xcodeproj -scheme GaryApp \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath <path>.xcarchive -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=SFBTX6KPLM archive

xcodebuild -exportArchive -archivePath <path>.xcarchive \
  -exportOptionsPlist <plist with destination=upload> -allowProvisioningUpdates
```

There is **no App Store Connect API key on this machine and none is needed** —
Xcode holds a signed-in session and `destination: upload` authenticates through
it. Derived data goes on the external drive (`/Volumes/KINGSTON/gary-dd`);
check it is mounted first.

**Archive before you promise anyone a submission.** Today's archive failed to
compile because `GaryTour` called `GaryMock` (a whole file inside `#if DEBUG`)
without a guard. Every simulator build passed for a day while no build could
ship. A debug-only symbol reachable from unguarded code is invisible until you
archive.

---

## 2. What shipped today (23 commits, all on main)

**Props (the founder put this lane under one owner; the goal is money first,
win rate second).**
- The card contract is **two props and one home run per game**. The ask states
  it; which two, and which long shot, stays Gary's call. Verified live: every
  game on the new prompt era published exactly 2 + 1.
- The home run publishes as a **real pick card** on its game — phone carousel
  and the web game panel — and is **tracked nowhere public**. The Billfold's HR
  tracker and its league chip are gone, and `/results.csv` and `/results.json`
  filter the lane, so the download equals the published record. The tally is
  internal only: `node gary2.0/scripts/props-book.js --lane=HR`.
- The props ledger now carries the screen's stamps (model probability, price
  probability, gap, menu rank) and the morning read breaks the book down by
  rank and by gap. **This is the open question of the next two weeks**: the
  August replay said the menu's first line carried the policy. Live it is 14
  bets. Do not draw a conclusion yet; just keep the read honest.

**College football.**
- Names: a generated table from the provider (`ios/GaryApp/NCAAFTeams.swift`,
  1010 keys) gives the school without its mascot and the scoreboard code. The
  game strip reads `SJSU @ EMU`. Regenerate with
  `node gary2.0/scripts/gen/ncaaf-team-names.js`; `--check` fails when it drifts.
- The recap card counts **touchdowns** where baseball counts homers, from the
  play feed, because the player box cannot see a defensive or return score.
- MORE INTEL sits on the page's own container; the college Picks and Winners
  pages wear Home's floor.

**The Hub's player and team cards** — the biggest find of the day, three
separate silent faults:
1. College packs had **never once reached the table**. One repeated player id
   failed the whole insert and the caller only warned.
2. `getMlbPlayersByIds` read **one page of 100** for a 327-id request, so
   off-slate arms had no card. Same bug in `getNcaafTeamPlayers`.
3. The Hub could only open a card from a player id, and football lanes carry
   none. A tap now resolves the row's name against the day's packs; a team row
   goes to the team card first; with no pack anywhere it opens the edge overlay,
   never an empty card.

**Marketing.** The daily recap tweet is back, **one post per sport**, 10 AM ET
with a self-healing window through 2 PM. Composition is pure and node-testable
in `gary2.0/supabase/functions/social-auto-post/recap.ts`. Preview any day with
`?force_mode=recap&dry_run=1` (the parameter is `force_mode`, not `force`).

---

## 3. What runs unattended, and how to check it

| What | When | Verify with |
|---|---|---|
| Pick + props scheduler | continuous, props fire when lineups post | `logs/scheduler/<date>---game-id-*.log` |
| Daily insights + cards | 6:00, 7:15, 8:00, 11:00, 16:30, 19:30 ET | `~/Library/Logs/Gary2.0/insights-launchd-stdout.log` |
| The card watch | inside the insights job | `node gary2.0/scripts/check-card-coverage.js` |
| Daily recap tweets | 10 AM ET, cron every 15 min | `social_post_log`, `thread_format = 'recap'` |
| Repo equals production | before you end any session | `node gary2.0/scripts/production-truth.js` |

Today's numbers, so you can tell drift from noise:

```
THE CARD WATCH — 2026-09-04
  MLB     333 cards  ·  65/65 player rows reach one (+6 by name)
  NCAAF    51 cards  ·   9/20   (the other 11 name players the provider has no roster entry for)
  NFL       0 cards  ·   0/0    (no player rows on a September Thursday — not a fault)

THE PROPS BOOK — CORE lane since 2026-09-02
  24-14 (63.2%), +4.04u
```

---

## 4. Watch these this weekend

**Saturday is the college slate.** Today had 5 games and the pack build covers
about 3 per pass inside its 8-minute budget, additively across the day's six
insight runs. A 25-game Saturday will not finish in one pass and is not supposed
to. Watch the card watch climb rather than forcing it; if it stalls at the same
number across three passes, something is wrong, not slow.

**The provider's rate gate is the binding constraint on college.** Roughly three
calls a minute. Every college fix has to respect it; do not parallelize your way
around it.

**NFL Week 1 opens Thursday Sep 10.** Two things are already in place and will
get their first live exercise: the NFL prop sheets, and the Week 1 carry — the
provider publishes no rows for a season until its first game is final, so last
season rides along under its own label. NFL player cards will start building
once games exist.

**Preseason never counts.** NFL preseason rows are excluded from every record by
`season_type`. Do not "fix" a record that looks low by including them.

---

## 5. Rules that are not yours to change

- **Layer 3 never.** Prompts may state what exists and what to look at. They may
  never tell Gary what a factor means for the pick. He follows explicit if/then
  rules literally, which is exactly the failure mode.
- **Prompts carry product contracts and founder laws only** — no steering, no
  strategy, no "consider the value here."
- **Home runs and touchdowns are fun lanes.** They publish as cards and never
  enter a record, a download, or a social post.
- **Repo equals production.** An edge function fix is half a fix until deployed
  (`npx supabase functions deploy <fn> --project-ref xuttubsfgdcjfgmskcol`), and
  a migration is not applied until it is applied.
- **Commit with explicit pathspecs**: `git add <paths> && git commit -- <paths>`.
  Several sessions share this checkout, and a bare commit sweeps up whatever
  someone else has staged — I did exactly that this morning. Never `git add -A`.
  Never commit `ios/GaryApp/GoogleService-Info.plist`; the working copy holds the
  real Firebase key over a redacted commit and stays dirty on purpose.
- **Everything in Eastern time**, in code and in conversation.
- **No tests, benchmarks or replays unless asked.** No unilateral picks. Talk
  first and edit on an explicit go, except inside a lane the founder has handed
  over outright.

---

## 6. Open threads, in the order I would pick them up

1. **App Review verdict on 2.25.** Nothing to do until it lands.
2. **The props book each morning** — `node gary2.0/scripts/props-book.js`, and
   `--lane=HR` for the long shots. Two days of data; resist the urge to tune.
3. **Saturday's college cards** — watch the coverage climb through the day.
4. **The 11 college rows with no card** are not a bug. Their players are absent
   from the provider's active roster, so the tap opens the edge overlay with the
   injury itself. Do not build a fake card for them.
5. **NFL prop sheets get their first real game Sep 10.** Worth a dry read before
   then.
6. Peers may be working in this checkout at the same time. `ListAgents` shows
   who; tell them what files you are in before you start.

The founder delegates taste and expects judgment, not questions he has already
answered. When you do disagree with something here, say so plainly and then
finish the work.

— Claude (session 5f), Sep 4 2026
