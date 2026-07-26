# Fantasy Corner + THE STREAK + Leaderboard/Settle-Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship all three founder-green-lit features end-to-end: the Hub's Fantasy Corner (with fact-checked, prod-daily content), the one-play-a-day STREAK game, and the opt-in leaderboard + bet-settled push notifications.

**Architecture:** Fantasy Corner = three new insight computers riding the existing `run-insight-connections.js` additive-freeze pipeline + a new `FantasyCornerView.swift`; STREAK = `user_bets.streak_pick` + server-written `user_streaks` updated inside the existing settle sweep; Leaderboard = opt-in `public_profiles` + SECURITY DEFINER board RPC over verified ledgers; settle push extends the settle sweep using the existing push_tokens infrastructure. Specs: `2026-07-26-fantasy-corner-design.md`, `2026-07-26-streak-game-design.md`, `2026-07-26-leaderboard-settle-push-design.md`.

**Tech Stack:** Node ESM insight computers (gemini-3-flash-preview reads), Supabase (SQL via `npx supabase db query --linked -f <file>`, Deno edge fns), SwiftUI.

## Global Constraints

- **Founder bar for Fantasy Corner:** "no errors, bugs, bad stats, funky writing/insight; works every day pushed to prod." Every computer gets a FACT-CHECK loop (numbers traced to source APIs) and a WRITING loop (read every generated line; no slop, no hype verbs, no hedging, no emojis, no ellipsis, no lingo-slop; plain sharp analyst voice) — iterate until TWO consecutive clean runs.
- **Deploy law:** edge-fn changes end with `npx supabase functions deploy <fn> --project-ref xuttubsfgdcjfgmskcol` + verification call; migrations applied via `cd gary2.0 && npx supabase db query --linked -f <file>` + REST verification (db push is blocked by missing-local-history; do NOT repair). After new RPCs: `npx supabase db query --linked "NOTIFY pgrst, 'reload schema';"`.
- **Hot tree:** parallel sessions active. `git status --short` + targeted `git diff` before touching ANY shared file (`Views.swift`, `HubView.swift`, `ContentView.swift`, pbxproj, `grade-results/index.ts`). Commit shared files ONLY via the filtered-hunk pattern (diff → keep hunks containing my symbols → `git apply --cached`). `pgrep -x Xcode` must print nothing before iOS edits.
- **iOS builds:** `xcodebuild -project ios/GaryApp/GaryApp.xcodeproj -scheme GaryApp -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath /Volumes/KINGSTON/gary-dd build > <scratch>/build.log 2>&1; echo EXIT=$?` — EXIT=0 required; never pipe xcodebuild.
- **Computer contract (from `fantasyPickups.js` + `generateInsightConnections.js`):** `export async function computeX(ctx)`; ctx = `{ date, season, league, games, bdl, helpers }` (games = BDL game objects; `helpers.gameLabel(game)`); return array of `makeRow({category, headline, detail, game, value, tone, relevance_score, player_id, team_id, game_id, meta})` from `../shared.js` (also exports `TONES, clampScore, round, pct3, nameKey`). Computers are fully defensive: return `[]` on any missing data, never throw. Register: import + append to `MLB_COMPUTERS` in `generateInsightConnections.js`.
- **Runner:** `cd gary2.0 && node run-insight-connections.js --league MLB --dry-run` to iterate; real writes are additive-freeze (first-write-wins per rowKey per day); `--reset` wipes+rebuilds the day (manual QA only). New categories need NO runner changes.
- **LLM reads:** copy the `writeAnalystReads` pattern from `fantasyPickups.js` exactly — grounded fact sheet, HARD RULES fencing to provided numbers only, STRICT JSON, failure keeps computed detail, `geminiService.generateResponse` with `gemini-3-flash-preview`.
- **Secrets:** `gary2.0/.env`; never print values. All times ET.
- Working dir = repo root `/Users/adam.preda/Desktop/Gary2.0` unless stated. Scratchpad for logs/patches.

---

## PART A — FANTASY CORNER

### Task A1: `twoStartWeek` computer

**Files:**
- Create: `gary2.0/src/services/insights/computers/twoStartWeek.js`
- Modify: `gary2.0/src/services/insights/generateInsightConnections.js` (import + `MLB_COMPUTERS` append)

**Interfaces:**
- Consumes: `getMlbSchedule(date)` from `../../mlbStatsApiService.js` (returns statsapi schedule dates[].games[] hydrated with `probablePitcher` — verify exact row shape in Step 1); `getPitcherXStats(season)` from `../../baseballSavantService.js`; `makeRow/TONES/clampScore/round/nameKey` from `../shared.js`.
- Produces: rows with `category: 'twoStartWeek'`, `meta.kind: 'two_start'`, `meta.starts: [{date, opp, home}]`, `meta.tier: 'PLAN_AROUND'|'STREAM_BOTH'|'MATCHUP_CALL'`. iOS (A5) reads this category token from `insight_connections` (stored category = the makeRow category string — confirm in Step 1 how existing categories appear in the table and match casing EXACTLY).

- [ ] **A1.1 Probe the real data.** Run a scratch probe to lock shapes (do not guess):
```bash
cd gary2.0 && node --input-type=module -e "
import './src/loadEnv.js';
const { getMlbSchedule } = await import('./src/services/mlbStatsApiService.js');
const d = await getMlbSchedule('2026-07-28');
const g = d?.dates?.[0]?.games?.[0] ?? d?.[0] ?? d;
console.log(JSON.stringify(g, null, 1).slice(0, 1500));
"
```
Also: `SB=...; curl "$SB_URL/rest/v1/insight_connections?select=category&limit=20&date=eq.$(date +%F)"` (service key) to see stored category casing (e.g. `fantasyPickups` vs `fantasy_pickups`). Record: probable pitcher field path, game date field, team abbreviation path, and the exact stored category convention. Adjust A1.2 code to the observed shapes before writing.

- [ ] **A1.2 Write the computer.** Next ET Monday-Sunday window (from tomorrow if today is Sunday); fetch each day's schedule once; count probable starts per pitcher id; keep pitchers with exactly 2+ starts; tier by Savant xERA when present (`< 3.40 PLAN_AROUND`, `< 4.20 STREAM_BOTH`, else `MATCHUP_CALL`); score 70 base + (4.2 − xERA)×8 clamped; detail lists both starts with ET dates + opponents ("Two starts next week — Tue 7/29 at CLE, Sun 8/3 vs KC"). Every number/date/opponent comes from the schedule rows; when xERA is missing, tier = MATCHUP_CALL and no xERA appears in copy. Include the `writeAnalystReads`-style flash pass (2 sentences per arm + a verdict matched to tier). All failures → `[]`.

- [ ] **A1.3 Dry-run + FACT-CHECK loop.** `node run-insight-connections.js --league MLB --dry-run` → find `twoStartWeek` rows. Then verify EVERY listed pitcher against the source of truth:
```bash
curl -s "https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=<mon>&endDate=<sun>&hydrate=probablePitcher" | node -e "<count starts for the named pitchers>"
```
Each claimed start (date + opponent + venue side) must match; any mismatch = bug, fix, re-run. Read every generated read for the writing bar. Two consecutive clean dry-runs required.

- [ ] **A1.4 Commit:** `git add` the two files; message `feat: fantasy corner — two-start week computer (fact-checked vs statsapi)`.

### Task A2: `closerWatch` computer

**Files:**
- Create: `gary2.0/src/services/insights/computers/closerWatch.js`
- Modify: `gary2.0/src/services/insights/generateInsightConnections.js`

**Interfaces:**
- Consumes: `ctx.games` (today's BDL slate — scope is slate teams: tonight's save chances); BDL season stats via `ctx.bdl.getMlbPlayerSeasonStats({season, teamId})` — probe for a saves field (`pitching_sv`/`pitching_saves`); fallback source `getGameBoxScore` from mlbStatsApiService over last-14d team games if BDL lacks saves.
- Produces: `category: 'closerWatch'`, one row per slate team with a real ninth-inning answer; `meta.kind: 'closer_watch'`, `meta: {closer, saves_14d or saves_season, committee: bool, note}`.

- [ ] **A2.1 Probe saves availability** (BDL first — one call): dump one team's season pitching stat row keys; grep for save-like fields. If absent, probe `getGameBoxScore` pitching entries for `saves`/`sv` on a known final. Record the chosen source + field names.
- [ ] **A2.2 Write the computer.** Per slate team: identify the save leader (season saves from the probed source) + last-14d save count when derivable; flag `committee` when two pitchers are within 2 saves over the window; detail states the numbers plainly ("Diaz has 9 of the Mets' last 10 saves — locked role" / "Committee alert: two arms splitting the ninth"). Flash read pass optional per row set; verdicts: "Roster him for saves." / "Split situation — handcuff both if you chase saves." All numbers from fetched stats only.
- [ ] **A2.3 Dry-run + fact-check loop:** cross-check three teams' save counts against statsapi season pitching totals; writing bar; two clean runs.
- [ ] **A2.4 Commit.**

### Task A3: `returnWatch` computer

**Files:**
- Create: `gary2.0/src/services/insights/computers/returnWatch.js`
- Modify: `gary2.0/src/services/insights/generateInsightConnections.js`

**Interfaces:**
- Consumes: the injuries source existing computers use — recon `computers/beneficiary.js` + `ballDontLieService` injury exports (LOCKED FILES WARNING: injury handling in `ballDontLieService.js`/`bdlInjuries.js` is founder-locked — READ ONLY, no edits there; consume the existing API surface untouched).
- Produces: `category: 'returnWatch'`, `meta.kind: 'return_watch'` — players on slate teams with an imminent-return signal (day-to-day, rehab, listed return date within ~7 days) + their season line (OPS or ERA from season stats). Copy: "stash before your league notices."

- [ ] **A3.1 Recon** beneficiary.js's injury access pattern (10-min read; note exact fn + row shape incl. return-date/status fields).
- [ ] **A3.2 Write the computer** (defensive; skip rows without a concrete status/date signal — NEVER invent a timeline; if the feed has no date, the copy says "day-to-day" only).
- [ ] **A3.3 Dry-run + fact-check** (spot-verify three players' statuses against the raw feed dump); writing bar; two clean runs.
- [ ] **A3.4 Commit.**

### Task A4: Prod write + every-day guarantee

- [ ] **A4.1** Real write for today: `node run-insight-connections.js --league MLB` (additive — safe by design). Verify rows: `curl "$SB_URL/rest/v1/insight_connections?date=eq.$(date +%F)&category=in.(twoStartWeek,closerWatch,returnWatch)&select=category,headline,detail" -H ...` — read them ALL once more in-place (the stored copy is what users see).
- [ ] **A4.2** Scheduler recon: `grep -n "insight" gary2.0/scripts/scheduler.js` — confirm run-insight-connections is on the 4x-daily cadence and new computers ride it automatically (they do — registry only). Determine the PROD runner: memory says the scheduler also runs on Railway (`gary-scheduler`). `which railway && railway status` from the scheduler's directory; if the Railway service deploys from this repo, redeploy (`railway up`) so prod carries the new computers; if the CLI/link is absent, STOP and give Adam the exact one-liner — the every-day guarantee is not met until the prod runner has the code.
- [ ] **A4.3** Next-day spot check (follow-up): tomorrow, `curl` the three categories for tomorrow's date — rows present without any manual run = guarantee proven. Record in memory.

### Task A5: iOS `FantasyCornerView.swift` + Hub entry

**Files:**
- Create: `ios/GaryApp/FantasyCornerView.swift` (register in pbxproj via the `add_userbook.py` uuid-anchor script pattern, anchored on `UserBookView.swift` this time)
- Modify: `ios/GaryApp/HubView.swift` (nav entry + teaser lane mount — filtered-hunk commit)

**Interfaces:**
- Consumes: `insight_connections` rows for today via the same anon REST pattern SupabaseAPI uses at :852 (recon that fetch + the row Decodable it uses — reuse the existing `InsightConnection`-style model if one exists; else define a local Decodable with the columns from `toRow()` in the runner). Hub design: `HubFont` (HubView.swift:28), gold hairline section heads (`SectionHead` ~:64), `AppFlags` extension pattern.
- Produces: `struct FantasyCornerView: View` + `AppFlags.fantasyCornerEnabled = true` + a small `FantasyTeaser` view for the Hub front.

- [ ] **A5.1** Recon: the Hub's nav mechanism (`grep -n "menu\|Menu\|nav\|drawer" ios/GaryApp/HubView.swift ios/GaryApp/ContentView.swift | head -20`) and the existing insight fetch + model (SupabaseAPI.swift:852 region). Record exact mount anchors from CURRENT disk state (parallel sessions).
- [ ] **A5.2** Build the page: four sections — FANTASY PICKUPS (category `fantasyPickups`), TWO-START WEEK, CLOSER WATCH, BACK SOON — each a list of rows (headline / detail / value chip); day-cache law (never latch empty async results); empty categories collapse (no empty frames); no ellipsis anywhere.
- [ ] **A5.3** Mount: nav entry "FANTASY CORNER" + front teaser (top pickup headline + two-start count) linking in; both behind `AppFlags.fantasyCornerEnabled`.
- [ ] **A5.4** Build EXIT=0 → sim refresh → eyeball the page against stored rows → filtered-hunk commit.

---

## PART B — THE STREAK

### Task B1: Migration — streak columns + `user_streaks` + RPC param

**Files:**
- Create: `gary2.0/supabase/migrations/20260727_streak_game.sql`

Contents (complete): `alter table user_bets add column if not exists streak_pick boolean not null default false;` + partial unique `create unique index user_bets_one_streak_per_day on public.user_bets (user_id, game_date) where streak_pick;` + `create table public.user_streaks (user_id uuid primary key references auth.users(id) on delete cascade, current int not null default 0, best int not null default 0, last_counted_date date, updated_at timestamptz default now());` RLS owner-select only (writes = service role) + replace `place_user_bet` and `place_user_prop_bet` with a new `p_streak boolean default false` param: sets `streak_pick`, and on conflict-update also `streak_pick = excluded.streak_pick`; moving the streak flag to a different pick same-day = clear it on the old row first inside the RPC (single statement: `update user_bets set streak_pick=false where user_id=v_uid and game_date=p_game_date and streak_pick and pick_text <> <new>` before insert, guarded by the RPC trust flag). Guard trigger: allow `streak_pick` changes pre-lock via the RPC flag path only.

- [ ] **B1.1** Write + apply (`db query --linked -f`) + `NOTIFY pgrst` + verify: place a 2099-sandbox streak tail (seed the 2099 daily_picks row as in the Jul 26 battery, place with `"p_streak":true`, verify `streak_pick=true` returned; place a second streak bet on a different 2099 pick → first row's flag clears; self-set `streak_pick` via direct PATCH post-lock → refused). Clean up sandbox.
- [ ] **B1.2** Commit.

### Task B2: Settle-side streak writer

**Files:**
- Create: `gary2.0/supabase/functions/grade-results/streaks.ts` + `streaks.test.ts`
- Modify: `gary2.0/supabase/functions/grade-results/userbets.ts` (call after each settle PATCH when the row has `streak_pick` — add `streak_pick` to the sweep's select list), `grade-props/index.ts` (same after its settle)

**Interfaces:**
- Produces: `applyStreakResult(prev: {current,best,last_counted_date}|null, gameDate: string, status: "won"|"lost"|"push"|"void") -> {current,best,last_counted_date}|null` (null = no change: push/void hold and same-day recount guard) + `updateUserStreak(sbBase, headers, userId, gameDate, status)` (fetch row, apply, upsert). Idempotency: if `last_counted_date === gameDate`, recompute that day from scratch is NOT possible without history — so the rule is: same-day repeat with the SAME terminal status = no-op; a same-day status FLIP (re-grade) adjusts: won→lost = current back to pre-day value... store `prev_current int` on user_streaks to make the day reversible (add column in B1: `prev_current int not null default 0`). Transitions: won (new day) → prev_current=current, current+1, best=max; lost (new day) → prev_current=current, current=0; won→lost same day → current=prev_current then apply lost; lost→won same day → current=prev_current then apply won. push/void → never counts (and a day that graded then re-grades to push → restore prev_current).
- Tests (write FIRST, deno): fresh win, consecutive wins, loss reset, push holds, same-day flip both directions, best watermark never decreases.

- [ ] **B2.1** Tests → RED. **B2.2** Implement → GREEN (all grade-results tests). **B2.3** Wire both settle paths; `deno check`; deploy BOTH fns; verification call shows `ok:true`. **B2.4** Live battery: stage tail rows w/ `streak_pick=true` for yesterday keyed to real graded picks (service role, distinct fake user), run grader, assert `user_streaks` transitions (win day then loss day), clean up rows + user. **B2.5** Commit.

### Task B3: iOS streak surfaces

**Files:**
- Modify: `ios/GaryApp/UserBookView.swift` only (all mine)

- [ ] **B3.1** Stake picker gains "Streak play" toggle (chip; only one per day — server enforces; place calls pass `p_streak`). Placed chip shows a small `STREAK` mark when `streak_pick`. UserBet model + placeBet gain the field/param.
- [ ] **B3.2** YOU page crown module: CURRENT STREAK big number + personal best + state line ("Day 4 — tonight: your streak play is set" / "No streak play picked today"); fetch `user_streaks` (owner RLS select). Share card gains the "DAY N" variant when current ≥ 2.
- [ ] **B3.3** Build EXIT=0, sim refresh, commit.

---

## PART C — LEADERBOARD + SETTLE PUSH

### Task C1: Migration — profiles + board RPC

**Files:**
- Create: `gary2.0/supabase/migrations/20260727_leaderboard_profiles.sql`

`public_profiles(user_id uuid pk references auth.users on delete cascade, display_name text unique not null check (char_length(display_name) between 3 and 18 and display_name ~ '^[A-Za-z0-9_]+$'), created_at timestamptz default now())`; RLS: owner insert/update/select-own + NO public select; `claim_handle(p_name text)` SECURITY DEFINER upsert-own with a small blocklist check; `fantasy_leaderboard(p_window text)` → wait, name it `your_book_leaderboard(p_window text)` SECURITY DEFINER returning `(display_name text, wins int, losses int, pushes int, units numeric, best_streak int)` — aggregates over `user_bets` (kind tail/fade, graded, window 7d/30d/season by `game_date`) joined to `public_profiles` (opted-in only) + `user_streaks.best`; HAVING count(*) filter (status in won,lost) >= 5; order by units desc limit 50; grant execute to authenticated + anon (public standings, aggregate only).

- [ ] **C1.1** Apply + NOTIFY + verify: claim a handle as a sandbox user, seed graded rows (service role) crossing the 5-bet floor, board returns exactly the opted-in aggregate; a second user WITHOUT a profile never appears despite rows. Clean up. **C1.2** Commit.

### Task C2: iOS — handle claim + board module

**Files:**
- Modify: `ios/GaryApp/UserBookView.swift` only

- [ ] **C2.1** YOU page LEADERBOARD module: window chips (7D/30D/SEASON), rows (rank, handle, record, money-or-units via BookMoney using the VIEWER's unit size only for their own row header — board rows show units, the shared currency); footer state when signed-in-but-unclaimed: "Claim a handle to enter the standings" → `HandleClaimSheet` (inline field, availability error from the RPC surfaced plainly). Respect floor copy ("appears after 5 graded plays").
- [ ] **C2.2** Build, sim, commit.

### Task C3: Settle push

**Files:**
- Recon then modify: `gary2.0/supabase/functions/grade-results/userbets.ts` (+ possibly a tiny new `push.ts` helper shared to grade-props)

- [ ] **C3.1** Recon the EXISTING send path end-to-end: `sed -n 1,60p gary2.0/scripts/send-scheduled-push.js` + `sed -n 1,80p gary2.0/supabase/functions/notify-new-pick/index.ts` — identify the APNs/FCM mechanism and the `push_tokens` matching key (`identity_id` = the auth user id per `register_push_token`). Copy that exact send mechanic.
- [ ] **C3.2** After each settle PATCH: look up `push_tokens` where `identity_id = user_id`, send "Your tail settled: +$X / +X.Xu" (money only if... server doesn't know unit size — ALWAYS units in pushes, plain: "Your tail won: +0.63u" / streak variant "Day 5 lives." when the row was the streak play and streak survived; "Streak over at 4." on loss). Non-fatal, rate-safe (batch per user per run: one push summarizing N settles: "3 plays settled: +1.2u on the night").
- [ ] **C3.3** Deploy both graders; verify via staged settle with a FAKE token row (send attempt logged, failure tolerated) — real-device proof lands on Adam's phone next grade cycle (note in wrap). **C3.4** Commit.

### Task C4: Full verify-fix loop + wrap

- [ ] All gates: deno suite; vitest suite; both edge fns live `ok:true`; RLS battery (user_bets + public_profiles + user_streaks anon checks); iOS build; web build untouched-but-run; copy sweep (`grep` new files for ellipsis strings / CALL / emojis); fresh dry-run of the insights runner still clean; `git status` = only parallel-session files. Fix and repeat until all green twice.
- [ ] Memory topic files + MEMORY.md lines updated (fantasy corner shipped state, streak, leaderboard, push; Railway/prod-runner state; next-day spot-check reminder). Commit + push everything (push = Vercel deploy of unchanged web is a no-op).
- [ ] Wrap report: what's live, what needs his device (push proof, streak toggle feel), the next-day fantasy spot check, and the one-liner if Railway redeploy needed his hands.
