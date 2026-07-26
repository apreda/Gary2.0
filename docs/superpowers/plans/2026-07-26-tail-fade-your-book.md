# Tail/Fade + Your Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-tap Tail/Fade on Gary's picks with server-locked unfakeable grading, a YOUR BOOK personal ledger in the Billfold (plus manual quick-log), a receipts-sharpened web record page, and a "My Ride with Gary" share card.

**Architecture:** New `user_bets` table holds all three entry points (tail/fade/manual) as one row shape. Tail/fade rows insert ONLY through SECURITY DEFINER RPCs that resolve the pick server-side (odds, lock time) and refuse post-lock writes; grading rides the existing `grade-results`/`grade-props` pg_cron edge functions. iOS gets one new file (`UserBookView.swift`) with two one-line mounts in `Views.swift`. Spec: `docs/superpowers/specs/2026-07-26-tail-fade-your-book-design.md`.

**Tech Stack:** Supabase (Postgres RLS + plpgsql RPC + Deno edge functions), SwiftUI (iOS 17), Next.js (web, custom version — read bundled docs first).

## Global Constraints

- **Deploy law (repo CLAUDE.md):** every edge-fn change ends with `npx supabase functions deploy <fn> --project-ref xuttubsfgdcjfgmskcol` + a verification call; the migration must actually be applied and verified, not just committed.
- **Hot tree:** `git status --short` + `git diff --stat` before touching any shared file. Parallel sessions have uncommitted edits in `ContentView.swift`, `HubView.swift`, `SupabaseAPI.swift`, `DesignSystem.swift`, `gary2.0/package.json`, `project.pbxproj` — do NOT edit or commit those hunks. `git add` only files named in each task's commit step.
- **Xcode must be closed** during iOS edit runs (open Xcode clobbers disk edits). Check: `pgrep -x Xcode` → if it prints a PID, STOP and ask Adam to close Xcode.
- **iOS builds:** `xcodebuild -project ios/GaryApp/GaryApp.xcodeproj -scheme GaryApp -destination 'generic/platform=iOS Simulator' -derivedDataPath /Volumes/KINGSTON/gary-dd build; echo EXIT=$?` — never pipe to tail (pipe eats the exit code). EXIT=0 required.
- **Copy laws:** no "..." ellipsis truncation anywhere; no emojis; plain professional copy; "Tail"/"Fade" are founder-approved verbs; "CALL" stays banned; all times ET; Gary never breaks the 4th wall.
- **No CLV/EV/closing-line language or tooling anywhere in this feature.**
- **Fonts:** existing `GaryFonts` helpers only (`GaryFonts.text`, `GaryFonts.mono` for small labels, matching current Billfold/PickCard usage). Never introduce a new font.
- **Never fabricate precision:** estimated fade odds carry `odds_estimated=true` and render with an `est` tag.
- **Working dir:** repo root `/Users/adam.preda/Desktop/Gary2.0` unless a step says otherwise.
- Secrets live in `gary2.0/.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Never print key values. Load per-shell: `SB_URL=$(grep '^SUPABASE_URL=' gary2.0/.env | cut -d= -f2- | tr -d '\r'); SB_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' gary2.0/.env | cut -d= -f2- | tr -d '\r')`.

---

### Task 1: `user_bets` table + integrity trigger + place RPCs (migration, applied + verified)

**Files:**
- Create: `gary2.0/supabase/migrations/20260726_user_bets_tail_fade.sql`

**Interfaces:**
- Produces (used by Tasks 2-6): table `public.user_bets` (columns below); RPC `public.place_user_bet(p_game_date date, p_pick_id text, p_pick_text text, p_kind text, p_stake numeric)` returning the row; RPC `public.place_user_prop_bet(p_game_date date, p_player text, p_prop_type text, p_kind text, p_stake numeric)` returning the row. Status values: `pending|won|lost|push|void`. Kind: `tail|fade|manual`. `pick_type`: `game|prop`.

- [ ] **Step 1: Write the migration file** at `gary2.0/supabase/migrations/20260726_user_bets_tail_fade.sql`:

```sql
-- Tail/Fade + Your Book (Jul 26 2026).
--
-- One table for all three entry points: a TAIL, a FADE, and a manually
-- LOGGED outside bet are the same row with a different kind. Tail/fade rows
-- are the product's credibility: they insert ONLY through the SECURITY
-- DEFINER RPCs below, which resolve the pick server-side (odds, lock time
-- from the pick JSON's commence_time) and refuse any write at/after lock —
-- you cannot retro-tail a winner, and placed_at is always the server clock.
-- Manual rows are the user's own self-graded ledger (honest, labeled,
-- never mixed into the verified WITH-GARY record).

create table public.user_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tail','fade','manual')),
  pick_type text check (pick_type in ('game','prop')),
  game_date date not null,
  league text,
  pick_text text not null,
  matchup text,
  player_name text,
  prop_type text,
  description text,
  odds_american integer,
  odds_estimated boolean not null default false,
  stake_units numeric(6,2) not null default 1.0
    check (stake_units > 0 and stake_units <= 10),
  status text not null default 'pending'
    check (status in ('pending','won','lost','push','void')),
  units_net numeric(8,2),
  lock_at timestamptz,
  placed_at timestamptz not null default now(),
  graded_at timestamptz,
  graded_by text check (graded_by in ('system','user'))
);

comment on table public.user_bets is
  'Personal bet ledger: tail/fade rows (system-graded, lock-immutable) + manual self-logged bets.';

-- One live tail-or-fade per user per pick (switching sides = update kind pre-lock).
create unique index user_bets_one_tailfade
  on public.user_bets (user_id, game_date, pick_type, pick_text)
  where kind in ('tail','fade');
create index user_bets_grading on public.user_bets (game_date, pick_type, status);
create index user_bets_owner on public.user_bets (user_id, placed_at desc);

alter table public.user_bets enable row level security;

-- Owner-only reads. Direct INSERT is manual-only (tail/fade must come through
-- the RPCs so lock/odds are server-resolved). UPDATE/DELETE: manual rows are
-- freely editable by their owner; tail/fade rows only before lock.
create policy user_bets_select on public.user_bets
  for select using (auth.uid() = user_id);
create policy user_bets_insert_manual on public.user_bets
  for insert with check (auth.uid() = user_id and kind = 'manual');
create policy user_bets_update on public.user_bets
  for update using (
    auth.uid() = user_id
    and (kind = 'manual' or (lock_at is not null and now() < lock_at))
  ) with check (auth.uid() = user_id);
create policy user_bets_delete on public.user_bets
  for delete using (
    auth.uid() = user_id
    and (kind = 'manual' or (lock_at is not null and now() < lock_at))
  );

-- Belt-and-suspenders invariants RLS cannot express (needs OLD row):
-- authenticated users may never move a row across the manual/verified line,
-- never self-grade a tail/fade, never touch server-owned fields.
create or replace function public.user_bets_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('request.jwt.claims', true) is null
     or auth.role() = 'service_role' then
    return new;  -- graders (service role) are unrestricted
  end if;
  if old.kind = 'manual' and new.kind <> 'manual' then
    raise exception 'manual bets cannot become tail/fade';
  end if;
  if old.kind in ('tail','fade') then
    if new.kind = 'manual' then
      raise exception 'tail/fade bets cannot become manual';
    end if;
    if new.status <> 'pending' then
      raise exception 'tail/fade bets are graded by the system';
    end if;
    if new.odds_american is distinct from old.odds_american
       or new.odds_estimated is distinct from old.odds_estimated then
      raise exception 'odds are server-resolved';
    end if;
  end if;
  if new.user_id <> old.user_id
     or new.placed_at <> old.placed_at
     or new.lock_at is distinct from old.lock_at
     or new.game_date <> old.game_date then
    raise exception 'immutable field';
  end if;
  return new;
end $$;
create trigger user_bets_guard before update on public.user_bets
  for each row execute function public.user_bets_guard();

-- ── place a tail/fade on a GAME pick ────────────────────────────────────────
-- Resolves the pick inside daily_picks.picks (jsonb array) by pick_id, falling
-- back to exact pick text. Lock = the pick's commence_time (server clock
-- comparison). Odds: tail = the pick's own price; fade = the OPPOSITE
-- moneyline when this is an ML pick and both prices were captured, else
-- unknown → grades at -110 with odds_estimated = true.
create or replace function public.place_user_bet(
  p_game_date date, p_pick_id text, p_pick_text text, p_kind text,
  p_stake numeric default 1.0
) returns public.user_bets
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pick jsonb; v_lock timestamptz; v_odds integer; v_est boolean := false;
  v_home text; v_away text; v_picked_home boolean; v_row public.user_bets;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('tail','fade') then raise exception 'kind must be tail or fade'; end if;
  if p_stake is null or p_stake <= 0 or p_stake > 10 then raise exception 'stake out of range'; end if;

  select p into v_pick
  from public.daily_picks dp, lateral jsonb_array_elements(dp.picks) p
  where dp.date = p_game_date
    and ((p_pick_id is not null and p_pick_id <> '' and p->>'pick_id' = p_pick_id)
         or p->>'pick' = p_pick_text)
  limit 1;
  if v_pick is null then raise exception 'pick not found'; end if;

  v_lock := nullif(v_pick->>'commence_time','')::timestamptz;
  if v_lock is null then raise exception 'lock time unavailable'; end if;
  if now() >= v_lock then raise exception 'game is locked'; end if;

  v_home := v_pick->>'homeTeam'; v_away := v_pick->>'awayTeam';
  if p_kind = 'tail' then
    v_odds := nullif(regexp_replace(coalesce(v_pick->>'odds',''), '[^0-9+-]', '', 'g'),'')::integer;
    if v_odds is null then v_est := true; end if;
  else
    v_picked_home := v_home is not null
      and position(lower(v_home) in lower(coalesce(v_pick->>'pick',''))) > 0;
    if coalesce(v_pick->>'pick','') ilike '%ML%'
       and nullif(v_pick->>'moneylineHome','') is not null
       and nullif(v_pick->>'moneylineAway','') is not null then
      v_odds := round(case when v_picked_home
        then (v_pick->>'moneylineAway')::numeric
        else (v_pick->>'moneylineHome')::numeric end)::integer;
    else
      v_odds := null; v_est := true;
    end if;
  end if;

  insert into public.user_bets
    (user_id, kind, pick_type, game_date, league, pick_text, matchup,
     odds_american, odds_estimated, stake_units, lock_at)
  values
    (v_uid, p_kind, 'game', p_game_date, v_pick->>'league',
     coalesce(v_pick->>'pick', p_pick_text),
     coalesce(v_away,'') || ' @ ' || coalesce(v_home,''),
     v_odds, v_est, p_stake, v_lock)
  on conflict (user_id, game_date, pick_type, pick_text)
    where kind in ('tail','fade')
  do update set kind = excluded.kind, stake_units = excluded.stake_units,
    odds_american = excluded.odds_american, odds_estimated = excluded.odds_estimated
  returning * into v_row;
  return v_row;
end $$;

-- ── place a tail/fade on a PROP pick ────────────────────────────────────────
-- Resolves inside prop_picks.picks by player + prop first-token (the same
-- identity grade-props uses). Lock time comes from daily_slate via the prop's
-- bdl game_id (doubleheader-safe). Fade odds are unknown for props → est -110.
create or replace function public.place_user_prop_bet(
  p_game_date date, p_player text, p_prop_type text, p_kind text,
  p_stake numeric default 1.0
) returns public.user_bets
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pick jsonb; v_lock timestamptz; v_odds integer; v_est boolean := false;
  v_text text; v_row public.user_bets;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_kind not in ('tail','fade') then raise exception 'kind must be tail or fade'; end if;
  if p_stake is null or p_stake <= 0 or p_stake > 10 then raise exception 'stake out of range'; end if;

  select p into v_pick
  from public.prop_picks pp, lateral jsonb_array_elements(pp.picks) p
  where pp.date = p_game_date
    and lower(coalesce(p->>'player', p->>'player_name','')) = lower(p_player)
    and lower(split_part(coalesce(p->>'prop', p->>'prop_type',''), ' ', 1)) = lower(p_prop_type)
  limit 1;
  if v_pick is null then raise exception 'pick not found'; end if;

  select ds.commence_time into v_lock
  from public.daily_slate ds
  where ds.date = p_game_date
    and ds.bdl_game_id = nullif(v_pick->>'game_id','')::bigint
  limit 1;
  if v_lock is null then raise exception 'lock time unavailable'; end if;
  if now() >= v_lock then raise exception 'game is locked'; end if;

  if p_kind = 'tail' then
    v_odds := nullif(regexp_replace(coalesce(v_pick->>'odds',''), '[^0-9+-]', '', 'g'),'')::integer;
    if v_odds is null then v_est := true; end if;
  else
    v_odds := null; v_est := true;
  end if;

  v_text := coalesce(p_player,'') || ' ' || coalesce(v_pick->>'bet','over') || ' '
    || coalesce(v_pick->>'line','') || ' ' || p_prop_type;

  insert into public.user_bets
    (user_id, kind, pick_type, game_date, league, pick_text, matchup,
     player_name, prop_type, odds_american, odds_estimated, stake_units, lock_at)
  values
    (v_uid, p_kind, 'prop', p_game_date,
     upper(coalesce(v_pick->>'sport','MLB')), v_text, v_pick->>'matchup',
     p_player, p_prop_type, v_odds, v_est, p_stake, v_lock)
  on conflict (user_id, game_date, pick_type, pick_text)
    where kind in ('tail','fade')
  do update set kind = excluded.kind, stake_units = excluded.stake_units,
    odds_american = excluded.odds_american, odds_estimated = excluded.odds_estimated
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.place_user_bet(date, text, text, text, numeric) to authenticated;
grant execute on function public.place_user_prop_bet(date, text, text, text, numeric) to authenticated;
revoke execute on function public.place_user_bet(date, text, text, text, numeric) from anon;
revoke execute on function public.place_user_prop_bet(date, text, text, text, numeric) from anon;
```

- [ ] **Step 2: Apply the migration.** Try in order until one works, then note which in the commit message:
  1. `cd gary2.0 && npx supabase db push` (linked project `xuttubsfgdcjfgmskcol`; may read the DB password from the macOS keychain from a prior push). If it prompts or errors →
  2. `cd gary2.0 && npx supabase db push --db-url "$SUPABASE_DB_URL"` only if a `SUPABASE_DB_URL` exists in the environment (do not invent one). If neither works →
  3. Use the Supabase MCP (`mcp__plugin_supabase_supabase__authenticate`, Adam approves in browser once) and execute the SQL through it. Last resort →
  4. STOP and give Adam the file path to paste into the Supabase SQL editor (60-second founder step). Do not proceed to Step 3 until applied.

- [ ] **Step 3: Verify table + RLS + lock behavior via REST** (service key sees the table; anon is refused; RPC rejects a locked game):

```bash
SB_URL=$(grep '^SUPABASE_URL=' gary2.0/.env | cut -d= -f2- | tr -d '\r')
SB_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' gary2.0/.env | cut -d= -f2- | tr -d '\r')
SB_ANON=$(grep '^SUPABASE_ANON_KEY=' gary2.0/.env | cut -d= -f2- | tr -d '\r')
# 1) table exists (expect: [] with HTTP 200)
curl -s -w "\nHTTP %{http_code}\n" "$SB_URL/rest/v1/user_bets?select=id&limit=1" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
# 2) anon key, no user → RPC refuses (expect: error "not signed in" / 4xx)
curl -s -w "\nHTTP %{http_code}\n" "$SB_URL/rest/v1/rpc/place_user_bet" -X POST -H "apikey: $SB_ANON" -H "Authorization: Bearer $SB_ANON" -H "Content-Type: application/json" -d '{"p_game_date":"2026-07-25","p_pick_id":null,"p_pick_text":"x","p_kind":"tail","p_stake":1}'
# 3) anon select → expect: [] (RLS hides all rows) or 401 — never data
curl -s -w "\nHTTP %{http_code}\n" "$SB_URL/rest/v1/user_bets?select=id" -H "apikey: $SB_ANON" -H "Authorization: Bearer $SB_ANON"
```
Expected: (1) `[]` HTTP 200, (2) JSON error mentioning sign-in or permission with HTTP 4xx, (3) `[]` or 401.

- [ ] **Step 4: Full lock-integrity test with a real signed-in user.** Create a throwaway auth user with the service key, place a bet on YESTERDAY's slate (locked → must fail), then on a future/pending pick if today's slate has one (should succeed), then try to self-grade it (must fail):

```bash
# create test user (expect 200 + user json)
curl -s -X POST "$SB_URL/auth/v1/admin/users" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" -H "Content-Type: application/json" -d '{"email":"userbook-test@garytest.local","password":"Test-Userbook-1","email_confirm":true}'
# sign in as them (expect access_token in response; capture as $UTOK)
UTOK=$(curl -s -X POST "$SB_URL/auth/v1/token?grant_type=password" -H "apikey: $SB_ANON" -H "Content-Type: application/json" -d '{"email":"userbook-test@garytest.local","password":"Test-Userbook-1"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).access_token||''))")
# locked game (yesterday) → expect error "game is locked"
YD=$(date -v-1d +%F)
PICK=$(curl -s "$SB_URL/rest/v1/daily_picks?date=eq.$YD&select=picks" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d)[0];console.log(r?JSON.stringify(r.picks[0].pick):'')})")
curl -s "$SB_URL/rest/v1/rpc/place_user_bet" -X POST -H "apikey: $SB_ANON" -H "Authorization: Bearer $UTOK" -H "Content-Type: application/json" -d "{\"p_game_date\":\"$YD\",\"p_pick_id\":null,\"p_pick_text\":$PICK,\"p_kind\":\"tail\",\"p_stake\":1}"
```
Expected: final call returns an error containing `game is locked`. If today's `daily_picks` has an un-started game (check `commence_time` in the future), repeat with today's date and expect a full row back, then verify self-grade rejection: `PATCH $SB_URL/rest/v1/user_bets?id=eq.<id>` with `{"status":"won"}` under `$UTOK` → expect error `graded by the system`.

- [ ] **Step 5: Commit** (migration file only):

```bash
git add gary2.0/supabase/migrations/20260726_user_bets_tail_fade.sql
git commit -m "feat: user_bets table + lock-integrity trigger + tail/fade place RPCs (applied + verified)"
```

---

### Task 2: Settlement math + `grade-results` hook (tail/fade grading + stale-void sweep)

**Files:**
- Create: `gary2.0/supabase/functions/grade-results/userbets.ts`
- Create: `gary2.0/supabase/functions/grade-results/userbets.test.ts`
- Modify: `gary2.0/supabase/functions/grade-results/index.ts` (import + one call after the grading loop)

**Interfaces:**
- Consumes: `user_bets` rows from Task 1 (`game_date`, `pick_text`, `pick_type='game'`, `status='pending'`).
- Produces: `settleUserBet(kind, pickResult, stake, odds)` → `{ status: "won"|"lost"|"push", units: number, estimated: boolean }`; `settleUserBetsForDates(dates, graded, sbBase, sbHeaders)` → `{ settled: number, voided: number, failed: number }` where `graded` is `Array<{ game_date: string, pick_text: string, result: string }>`. Task 3 reuses `settleUserBet` + `patchUserBet` via relative import `../grade-results/userbets.ts`.

- [ ] **Step 1: Write the failing tests** at `gary2.0/supabase/functions/grade-results/userbets.test.ts`:

```ts
// deno test userbets.test.ts — pure settlement math for user tail/fade bets.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { settleUserBet } from "./userbets.ts";

Deno.test("tail inherits a win, pays at the pick's price", () => {
  const r = settleUserBet("tail", "won", 1, -158);
  assertEquals(r.status, "won");
  assertEquals(Math.round(r.units * 100), 63); // 100/158 = 0.633
  assertEquals(r.estimated, false);
});

Deno.test("tail inherits a loss at flat stake", () => {
  assertEquals(settleUserBet("tail", "lost", 2, -158), { status: "lost", units: -2, estimated: false });
});

Deno.test("fade inverts the pick result", () => {
  assertEquals(settleUserBet("fade", "lost", 1, 136).status, "won");
  assertEquals(settleUserBet("fade", "won", 1, 136).status, "lost");
});

Deno.test("fade win pays at the fade's own stored odds", () => {
  const r = settleUserBet("fade", "lost", 1, 136);
  assertEquals(Math.round(r.units * 100), 136);
});

Deno.test("push stays push for both kinds, zero units", () => {
  assertEquals(settleUserBet("tail", "push", 1, -110), { status: "push", units: 0, estimated: false });
  assertEquals(settleUserBet("fade", "push", 3, null), { status: "push", units: 0, estimated: true });
});

Deno.test("missing odds settle at assumed -110 and are flagged estimated", () => {
  const r = settleUserBet("fade", "lost", 1, null);
  assertEquals(r.status, "won");
  assertEquals(r.units, 0.91); // 100/110 rounded to 2 places
  assertEquals(r.estimated, true);
});

Deno.test("positive-odds tail win pays odds/100", () => {
  const r = settleUserBet("tail", "won", 2, 240);
  assertEquals(Math.round(r.units * 100), 480);
});
```

- [ ] **Step 2: Run to verify failure:** `cd gary2.0/supabase/functions/grade-results && deno test userbets.test.ts` → expect FAIL: `Module not found "userbets.ts"`. (If `deno` is not installed: `brew install deno` — the repo already ships `grading.test.ts` for this directory, so deno is the established test runner here.)

- [ ] **Step 3: Implement** `gary2.0/supabase/functions/grade-results/userbets.ts`:

```ts
// Settlement for user tail/fade bets (Your Book). Pure math + the REST sweep
// grade-results/grade-props call after picks grade. A TAIL inherits the
// pick's result; a FADE inverts it (fade wins iff the pick loses); push and
// void carry through untouched. Units pay at the row's stored odds — the
// place RPC resolved real prices where it could; rows without a price settle
// at an assumed -110 and stay flagged odds_estimated so the UI shows "est".
export type SettleStatus = "won" | "lost" | "push";

export function settleUserBet(
  kind: "tail" | "fade",
  pickResult: string,
  stake: number,
  odds: number | null,
): { status: SettleStatus; units: number; estimated: boolean } {
  const estimated = odds == null;
  const price = odds == null ? -110 : odds;
  const norm = String(pickResult || "").toLowerCase();
  let status: SettleStatus;
  if (norm === "push") status = "push";
  else if (norm === "won") status = kind === "tail" ? "won" : "lost";
  else status = kind === "tail" ? "lost" : "won";
  const units = status === "push" ? 0
    : status === "lost" ? -stake
    : stake * (price > 0 ? price / 100 : 100 / Math.abs(price));
  return { status, units: Math.round(units * 100) / 100, estimated };
}

export async function patchUserBet(
  sbBase: string, sbHeaders: Record<string, string>, id: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${sbBase}/rest/v1/user_bets?id=eq.${id}`, {
    method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// Settle every pending game-pick user bet whose pick graded this run, then
// void stale strays (pending tail/fades >48h past lock with no result to
// inherit — e.g. the pick was replaced by a regeneration before lock).
export async function settleUserBetsForDates(
  dates: string[],
  graded: Array<{ game_date: string; pick_text: string; result: string }>,
  sbBase: string, sbHeaders: Record<string, string>,
): Promise<{ settled: number; voided: number; failed: number }> {
  const out = { settled: 0, voided: 0, failed: 0 };
  const res = await fetch(
    `${sbBase}/rest/v1/user_bets?game_date=in.(${dates.join(",")})` +
    `&pick_type=eq.game&status=eq.pending&kind=in.(tail,fade)` +
    `&select=id,kind,game_date,pick_text,stake_units,odds_american,lock_at`,
    { headers: sbHeaders },
  );
  if (!res.ok) { out.failed++; return out; }
  const rows: any[] = await res.json();
  const byKey = new Map(graded.map((g) => [`${g.game_date}|${g.pick_text}`, g.result]));
  for (const r of rows) {
    const result = byKey.get(`${r.game_date}|${r.pick_text}`);
    if (result) {
      const s = settleUserBet(r.kind, result, Number(r.stake_units), r.odds_american ?? null);
      const ok = await patchUserBet(sbBase, sbHeaders, r.id, {
        status: s.status, units_net: s.units, odds_estimated: s.estimated || undefined,
        graded_at: new Date().toISOString(), graded_by: "system",
      });
      ok ? out.settled++ : out.failed++;
    } else if (r.lock_at && Date.now() - new Date(r.lock_at).getTime() > 48 * 3600_000) {
      const ok = await patchUserBet(sbBase, sbHeaders, r.id, {
        status: "void", units_net: 0,
        graded_at: new Date().toISOString(), graded_by: "system",
      });
      ok ? out.voided++ : out.failed++;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests:** `cd gary2.0/supabase/functions/grade-results && deno test userbets.test.ts` → expect: all 7 pass.

- [ ] **Step 5: Hook into `index.ts`.** In `gary2.0/supabase/functions/grade-results/index.ts`: add to the imports at the top (after the `grading.ts` import on line 32): `import { settleUserBetsForDates } from "./userbets.ts";`. In the `Deno.serve` handler, add a collector right after `const propsCache = new Map<string, any[]>();`:

```ts
  const gradedForUserBets: Array<{ game_date: string; pick_text: string; result: string }> = [];
```

Inside the pick loop, immediately after `stats[outcome]++;` add:

```ts
      if (outcome !== "fail") gradedForUserBets.push({ game_date: date, pick_text: pick.pick, result });
```

After the `for (const date of dates)` loop closes (before the final `return new Response(...)`), add:

```ts
  // Your Book: settle tail/fade rows against this run's grades; never fatal.
  let userBets = { settled: 0, voided: 0, failed: 0 };
  try {
    userBets = await settleUserBetsForDates(dates, gradedForUserBets, SUPABASE_URL, sbHeaders);
  } catch (e) {
    console.warn(`[UserBets] settle sweep failed: ${(e as Error).message}`);
  }
```

and extend the response body: `JSON.stringify({ ok: true, dates, ...stats, user_bets: userBets })`.

- [ ] **Step 6: Run the whole function's tests** (regression): `cd gary2.0/supabase/functions/grade-results && deno test .` → expect: `grading.test.ts` + `userbets.test.ts` all pass.

- [ ] **Step 7: Deploy + verify (deploy law):**

```bash
cd gary2.0 && npx supabase functions deploy grade-results --project-ref xuttubsfgdcjfgmskcol
SB_URL=$(grep '^SUPABASE_URL=' .env | cut -d= -f2- | tr -d '\r'); SB_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2- | tr -d '\r')
curl -s "$SB_URL/functions/v1/grade-results" -H "Authorization: Bearer $SB_KEY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('ok:',j.ok,'user_bets:',JSON.stringify(j.user_bets))})"
```
Expected: `ok: true` and a `user_bets: {"settled":0,...}` object (zero is correct — no user rows yet).

- [ ] **Step 8: End-to-end settle proof.** Insert a tail row AS THE SERVICE ROLE keyed to an already-graded pick from yesterday (service role bypasses RLS + lock — this simulates a bet placed before lock), re-run the function, confirm it settles:

```bash
YD=$(date -v-1d +%F)
ROW=$(curl -s "$SB_URL/rest/v1/game_results?game_date=eq.$YD&select=pick_text,result&limit=1" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY")
echo "$ROW"  # note pick_text + result
TESTUID=$(curl -s "$SB_URL/auth/v1/admin/users?page=1&per_page=1" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log((j.users||j)[0].id)})")
curl -s -X POST "$SB_URL/rest/v1/user_bets" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" -H "Content-Type: application/json" -H "Prefer: return=representation" -d "{\"user_id\":\"$TESTUID\",\"kind\":\"tail\",\"pick_type\":\"game\",\"game_date\":\"$YD\",\"pick_text\":<PICK_TEXT_JSON_FROM_ROW>,\"odds_american\":-120,\"stake_units\":1,\"lock_at\":\"${YD}T16:00:00Z\"}"
curl -s "$SB_URL/functions/v1/grade-results" -H "Authorization: Bearer $SB_KEY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(d))"
curl -s "$SB_URL/rest/v1/user_bets?game_date=eq.$YD&select=status,units_net,graded_by" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
```
Expected: run shows `user_bets: {"settled":1,...}`; the row reads `status` matching the pick result (tail of a won pick → `won`, units_net ≈ +0.83 at -120), `graded_by: "system"`. Then delete the test row: `curl -s -X DELETE "$SB_URL/rest/v1/user_bets?game_date=eq.$YD&user_id=eq.$TESTUID" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"` and re-verify it's gone (`select=id` returns `[]`).

- [ ] **Step 9: Commit:**

```bash
git add gary2.0/supabase/functions/grade-results/userbets.ts gary2.0/supabase/functions/grade-results/userbets.test.ts gary2.0/supabase/functions/grade-results/index.ts
git commit -m "feat: grade-results settles Your Book tail/fades + voids stale strays (deployed + settle-verified)"
```

---

### Task 3: `grade-props` hook (prop tail/fade settlement)

**Files:**
- Modify: `gary2.0/supabase/functions/grade-props/index.ts`

**Interfaces:**
- Consumes: `settleUserBet`, `patchUserBet` from `../grade-results/userbets.ts` (Task 2); `user_bets` rows with `pick_type='prop'` matched on `(game_date, player_name, prop_type)`.

- [ ] **Step 1: Add the hook.** In `gary2.0/supabase/functions/grade-props/index.ts`: top of file, after the const declarations (line ~27): `import { settleUserBet, patchUserBet } from "../grade-results/userbets.ts";`. In the handler, right after the write loop (`for (const w of writes) { stats[await writeProp(w)]++; }` inside the `else` branch), add:

```ts
    // Your Book: settle prop tail/fades against this run's grades; never fatal.
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_bets?game_date=in.(${dates.join(",")})` +
        `&pick_type=eq.prop&status=eq.pending&kind=in.(tail,fade)` +
        `&select=id,kind,game_date,player_name,prop_type,stake_units,odds_american`,
        { headers: sbHeaders },
      );
      if (res.ok) {
        const rows: any[] = await res.json();
        const byKey = new Map(writes.map((w) => [
          `${w.game_date}|${normalizeName(w.player_name)}|${w.prop_type.toLowerCase()}`, w.result,
        ]));
        for (const r of rows) {
          const result = byKey.get(
            `${r.game_date}|${normalizeName(r.player_name ?? "")}|${String(r.prop_type ?? "").toLowerCase()}`);
          if (!result) continue;
          const s = settleUserBet(r.kind, result, Number(r.stake_units), r.odds_american ?? null);
          await patchUserBet(SUPABASE_URL, sbHeaders, r.id, {
            status: s.status, units_net: s.units,
            graded_at: new Date().toISOString(), graded_by: "system",
          });
        }
      }
    } catch (e) {
      console.warn(`[UserBets] prop settle failed: ${(e as Error).message}`);
    }
```

(Stale-void for props is already covered: Task 2's sweep voids by `lock_at`, and prop rows carry `lock_at` too — extend the Task 2 sweep's filter from `pick_type=eq.game` to cover both by REMOVING that filter clause in `settleUserBetsForDates`'s fetch and keeping the game match on `(game_date, pick_text)`; prop rows won't match game keys and simply age into the void branch when truly stale. Make that one-line edit in `userbets.ts` now: delete `&pick_type=eq.game` from the fetch URL, and in the match branch guard game rows with `r.pick_type === "game"` by adding `pick_type` to the select list. Prop rows settled here in grade-props will already be non-pending.)

- [ ] **Step 2: Re-run Task 2 tests** (the shared helper changed): `cd gary2.0/supabase/functions/grade-results && deno test .` → all pass.

- [ ] **Step 3: Deploy + dry verify:**

```bash
cd gary2.0 && npx supabase functions deploy grade-props --project-ref xuttubsfgdcjfgmskcol && npx supabase functions deploy grade-results --project-ref xuttubsfgdcjfgmskcol
curl -s "$SB_URL/functions/v1/grade-props?dry=1" -H "Authorization: Bearer $SB_KEY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('ok:',j.ok,'dry:',j.dry,'picks:',j.picks)})"
```
Expected: `ok: true dry: true` with a sane pick count and no thrown errors in output.

- [ ] **Step 4: Commit:**

```bash
git add gary2.0/supabase/functions/grade-props/index.ts gary2.0/supabase/functions/grade-results/userbets.ts
git commit -m "feat: grade-props settles prop tail/fades; void sweep covers props (deployed)"
```

---

### Task 4: iOS `UserBookView.swift` — models, API client, flag, project registration

**Files:**
- Create: `ios/GaryApp/UserBookView.swift`
- Modify: `ios/GaryApp/GaryApp.xcodeproj/project.pbxproj` (register the new file — surgical, two entries; pbxproj is DIRTY from a parallel session: `git diff --stat` first, add only your own lines, never commit the file wholesale — commit it with `git add -p` selecting only the UserBookView hunks)

**Interfaces:**
- Consumes: `AuthManager.shared.bearerToken: String?`, `Secrets.supabaseURL: URL`, `Secrets.supabaseAnonKey: String`, `GaryPick` (`pick_id: String?`, `pick: String?`, `commence_time: String?`, `homeTeam/awayTeam/league`), `GaryFonts`, `GaryColors.gold`.
- Produces (Tasks 5-6, 8): `struct UserBet: Codable, Identifiable` (fields mirror the table); `enum UserBookAPI` with `placeBet(gameDate:pickId:pickText:kind:stake:) async throws -> UserBet`, `placePropBet(gameDate:player:propType:kind:stake:) async throws -> UserBet`, `fetchMyBets() async -> [UserBet]`, `logManual(_:) async throws -> UserBet`, `gradeManual(id:status:unitsNet:) async -> Bool`, `deleteBet(id:) async -> Bool`; `struct TailFadeRow: View` (`init(pick: GaryPick, gameResult: String?)`); `struct UserBookSection: View`; `struct QuickLogSheet: View`; `AppFlags.userBookEnabled`.

- [ ] **Step 1: Preconditions.** `pgrep -x Xcode` → must print nothing (else STOP, ask Adam to close Xcode). `git status --short ios/ && git diff --stat ios/GaryApp/GaryApp.xcodeproj/project.pbxproj` → note the parallel session's pending hunks; you will not touch them.

- [ ] **Step 2: Create `ios/GaryApp/UserBookView.swift`** — full content:

```swift
import SwiftUI

// ─────────────────────────────────────────────────────────────────────────────
// YOUR BOOK — Tail/Fade + personal ledger (Jul 26 2026).
//
// One system, three entry points: a TAIL, a FADE, and a manually logged
// outside bet are the same `user_bets` row with a different kind. Tail/fade
// go through server RPCs that resolve odds + lock time and refuse post-lock
// writes — the record is unfakeable, which is the whole point. Two ledgers,
// never mixed: WITH GARY (system-graded tails/fades — the flagship number)
// and YOUR PLAYS (self-logged, self-graded, labeled).
// ─────────────────────────────────────────────────────────────────────────────

extension AppFlags {
    /// Master switch for the whole Your Book surface (tail/fade row, Billfold
    /// section, quick-log). One-line kill, same pattern as the 2.19 flags.
    static let userBookEnabled = true
}

struct UserBet: Codable, Identifiable {
    let id: String
    let kind: String            // tail | fade | manual
    let pick_type: String?      // game | prop
    let game_date: String
    let league: String?
    let pick_text: String
    let matchup: String?
    let player_name: String?
    let prop_type: String?
    let description: String?
    let odds_american: Int?
    let odds_estimated: Bool?
    let stake_units: Double
    let status: String          // pending | won | lost | push | void
    let units_net: Double?
    let lock_at: String?
    let placed_at: String?
    let graded_by: String?

    var isVerified: Bool { kind == "tail" || kind == "fade" }
    var isPending: Bool { status == "pending" }
}

enum UserBookError: LocalizedError {
    case notSignedIn
    case server(String)
    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Sign in to keep a book."
        case .server(let m): return m
        }
    }
}

enum UserBookAPI {
    private static var rest: URL { Secrets.supabaseURL.appendingPathComponent("/rest/v1") }

    private static func authedRequest(_ url: URL, method: String = "GET", body: Data? = nil) throws -> URLRequest {
        guard let token = AuthManager.shared.bearerToken else { throw UserBookError.notSignedIn }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        return req
    }

    private static func run(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            // PostgREST error bodies carry {"message": "..."} — surface the
            // real reason ("game is locked") instead of a generic failure.
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["message"]
                ?? String(data: data, encoding: .utf8) ?? "Request failed"
            throw UserBookError.server(msg)
        }
        return data
    }

    static func placeBet(gameDate: String, pickId: String?, pickText: String, kind: String, stake: Double) async throws -> UserBet {
        let url = rest.appendingPathComponent("rpc/place_user_bet")
        let payload: [String: Any?] = ["p_game_date": gameDate, "p_pick_id": pickId,
                                       "p_pick_text": pickText, "p_kind": kind, "p_stake": stake]
        let body = try JSONSerialization.data(withJSONObject: payload.compactMapValues { $0 })
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        return try JSONDecoder().decode(UserBet.self, from: data)
    }

    static func placePropBet(gameDate: String, player: String, propType: String, kind: String, stake: Double) async throws -> UserBet {
        let url = rest.appendingPathComponent("rpc/place_user_prop_bet")
        let body = try JSONSerialization.data(withJSONObject: [
            "p_game_date": gameDate, "p_player": player, "p_prop_type": propType,
            "p_kind": kind, "p_stake": stake])
        let data = try await run(try authedRequest(url, method: "POST", body: body))
        return try JSONDecoder().decode(UserBet.self, from: data)
    }

    static func fetchMyBets() async -> [UserBet] {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return [] }
        comps.queryItems = [URLQueryItem(name: "select", value: "*"),
                            URLQueryItem(name: "order", value: "placed_at.desc"),
                            URLQueryItem(name: "limit", value: "400")]
        guard let url = comps.url, let req = try? authedRequest(url) else { return [] }
        guard let data = try? await run(req) else { return [] }
        return (try? JSONDecoder().decode([UserBet].self, from: data)) ?? []
    }

    struct ManualBetDraft {
        var league: String = "MLB"
        var description: String = ""
        var odds: Int? = nil
        var stake: Double = 1.0
    }

    static func logManual(_ draft: ManualBetDraft) async throws -> UserBet {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { throw UserBookError.server("bad url") }
        comps.queryItems = [URLQueryItem(name: "select", value: "*")]
        guard let uid = AuthManager.shared.currentUserId else { throw UserBookError.notSignedIn }
        var payload: [String: Any] = [
            "user_id": uid, "kind": "manual",
            "game_date": SupabaseAPI.todayEST(),
            "league": draft.league,
            "pick_text": draft.description,
            "description": draft.description,
            "stake_units": draft.stake,
        ]
        if let o = draft.odds { payload["odds_american"] = o }
        let body = try JSONSerialization.data(withJSONObject: payload)
        var req = try authedRequest(comps.url!, method: "POST", body: body)
        req.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let data = try await run(req)
        let rows = try JSONDecoder().decode([UserBet].self, from: data)
        guard let row = rows.first else { throw UserBookError.server("insert returned nothing") }
        return row
    }

    static func gradeManual(id: String, status: String, unitsNet: Double) async -> Bool {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return false }
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        let payload: [String: Any] = ["status": status, "units_net": unitsNet,
                                      "graded_at": ISO8601DateFormatter().string(from: Date()),
                                      "graded_by": "user"]
        guard let body = try? JSONSerialization.data(withJSONObject: payload),
              let req = try? authedRequest(comps.url!, method: "PATCH", body: body) else { return false }
        return (try? await run(req)) != nil
    }

    static func deleteBet(id: String) async -> Bool {
        guard var comps = URLComponents(url: rest.appendingPathComponent("user_bets"), resolvingAgainstBaseURL: false) else { return false }
        comps.queryItems = [URLQueryItem(name: "id", value: "eq.\(id)")]
        guard let req = try? authedRequest(comps.url!, method: "DELETE") else { return false }
        return (try? await run(req)) != nil
    }

    /// Manual settle math mirrors the server's: win pays at the row's odds
    /// (assumed -110 when none was entered), loss is -stake, push is zero.
    static func manualUnits(status: String, stake: Double, odds: Int?) -> Double {
        let price = Double(odds ?? -110)
        switch status {
        case "won": return (stake * (price > 0 ? price / 100 : 100 / abs(price))).rounded(toPlaces: 2)
        case "lost": return -stake
        default: return 0
        }
    }
}

private extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let f = pow(10.0, Double(places))
        return (self * f).rounded() / f
    }
}
```

(Views — `TailFadeRow`, `UserBookSection`, `QuickLogSheet`, share card — land in Tasks 5, 6, 8 by APPENDING to this same file; this task establishes the file, data layer, and flag.)

- [ ] **Step 3: Check `AuthManager` for `currentUserId`.** `grep -n "currentUserId\|var user\b\|userId" ios/GaryApp/AuthManager.swift`. If no `currentUserId: String?` accessor exists, add one to `AuthManager` (NOT a dirty region — verify with `git diff ios/GaryApp/AuthManager.swift` first; the file is currently clean): expose the signed-in user's id from the stored session/user object, e.g. `var currentUserId: String? { user?.id }` next to `bearerToken` (line ~317), matching whatever the stored `GaryUser` field is named (check `struct GaryUser` in the same file or Models.swift).

- [ ] **Step 4: Register the file in the Xcode project.** `project.pbxproj` uses explicit file lists (no fileSystemSynchronized groups). Write a python script `/private/tmp/claude-501/-Users-adam-preda/99207ee7-94c9-49d6-92b5-73d6478d7825/scratchpad/add_userbook.py`:

```python
import re, uuid, sys
P = "ios/GaryApp/GaryApp.xcodeproj/project.pbxproj"
src = open(P).read()
if "UserBookView.swift" in src: print("already registered"); sys.exit(0)
fid = uuid.uuid4().hex[:24].upper(); bid = uuid.uuid4().hex[:24].upper()
# anchor on an existing sibling: GaryTour.swift appears in all four sections
m = re.search(r"(\t\t([0-9A-F]{24}) /\* GaryTour\.swift in Sources \*/ = \{isa = PBXBuildFile; fileRef = ([0-9A-F]{24}) /\* GaryTour\.swift \*/; \};\n)", src)
assert m, "GaryTour.swift PBXBuildFile anchor not found"
src = src.replace(m.group(1), m.group(1) + f"\t\t{bid} /* UserBookView.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {fid} /* UserBookView.swift */; }};\n", 1)
ref = re.search(r"(\t\t" + m.group(3) + r" /\* GaryTour\.swift \*/ = \{isa = PBXFileReference;[^\n]*\n)", src)
assert ref, "GaryTour.swift PBXFileReference anchor not found"
src = src.replace(ref.group(1), ref.group(1) + f"\t\t{fid} /* UserBookView.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = UserBookView.swift; sourceTree = \"<group>\"; }};\n", 1)
src = src.replace(f"\t\t\t\t{m.group(3)} /* GaryTour.swift */,\n", f"\t\t\t\t{m.group(3)} /* GaryTour.swift */,\n\t\t\t\t{fid} /* UserBookView.swift */,\n", 1)
src = src.replace(f"\t\t\t\t{m.group(2)} /* GaryTour.swift in Sources */,\n", f"\t\t\t\t{m.group(2)} /* GaryTour.swift in Sources */,\n\t\t\t\t{bid} /* UserBookView.swift in Sources */,\n", 1)
open(P, "w").write(src); print("registered", fid, bid)
```

Run: `cd /Users/adam.preda/Desktop/Gary2.0 && python3 <scratchpad>/add_userbook.py` → expect `registered <id> <id>`. Verify: `grep -c "UserBookView.swift" ios/GaryApp/GaryApp.xcodeproj/project.pbxproj` → expect `4`.

- [ ] **Step 5: Build:** `xcodebuild -project ios/GaryApp/GaryApp.xcodeproj -scheme GaryApp -destination 'generic/platform=iOS Simulator' -derivedDataPath /Volumes/KINGSTON/gary-dd build; echo EXIT=$?` → `EXIT=0`. Fix any compile errors (field-name mismatches against `AuthManager`/`Secrets` are the likely class) and re-run until green.

- [ ] **Step 6: Commit** (the pbxproj needs hunk-selective staging — parallel session owns other hunks):

```bash
git add ios/GaryApp/UserBookView.swift
git add -p ios/GaryApp/GaryApp.xcodeproj/project.pbxproj   # stage ONLY the four UserBookView lines
git add -p ios/GaryApp/AuthManager.swift                   # only if Step 3 added currentUserId
git commit -m "feat: Your Book data layer — UserBet model, RPC client, flag, project registration"
```

---

### Task 5: Tail/Fade row on the pick card back

**Files:**
- Modify: `ios/GaryApp/UserBookView.swift` (append views)
- Modify: `ios/GaryApp/Views.swift` (ONE mount line in `PickCardBack`)

**Interfaces:**
- Consumes: `UserBookAPI.placeBet`, `UserBet`, `AppFlags.userBookEnabled` (Task 4); `AuthView` (existing sign-in sheet); `GaryPick.commence_time` ISO string.
- Produces: `struct TailFadeRow: View { init(pick: GaryPick, gameResult: String?) }` — the only symbol Views.swift consumes.

- [ ] **Step 1: Append the views to `UserBookView.swift`:**

```swift
// ── Tail/Fade row (pick card back) ──────────────────────────────────────────
// Sits under the conviction bar — the "I've read the case" moment. One tap
// arms a stake stepper; confirm logs it through the lock-checked RPC. After
// lock the row freezes into a receipt chip; after grading it shows the result.
struct TailFadeRow: View {
    let pick: GaryPick
    var gameResult: String? = nil
    @ObservedObject private var auth = AuthManager.shared
    @State private var mine: UserBet? = nil
    @State private var arming: String? = nil      // "tail" | "fade" while picking stake
    @State private var stake: Double = 1.0
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var showAuth = false
    @State private var loaded = false

    private var locked: Bool {
        guard let ct = pick.commence_time, let d = ISO8601DateFormatter().date(from: ct) else { return false }
        return Date() >= d
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let bet = mine {
                placedChip(bet)
            } else if locked {
                EmptyView()   // never advertise a bet you can no longer place
            } else if let side = arming {
                stakePicker(side)
            } else {
                armButtons
            }
            if let e = errorText {
                Text(e)
                    .font(GaryFonts.mono(9.5))
                    .foregroundStyle(Color(hex: "#EF4444").opacity(0.9))
                    .lineLimit(2)
            }
        }
        .task(id: pick.id) {
            guard !loaded, auth.bearerToken != nil else { return }
            let all = await UserBookAPI.fetchMyBets()
            // Task cancellation guard: never latch an empty result as truth.
            if !all.isEmpty || mine == nil {
                mine = all.first { $0.pick_text == (pick.pick ?? "") && $0.pick_type == "game" }
            }
            loaded = true
        }
        .sheet(isPresented: $showAuth) { AuthView() }
    }

    private var armButtons: some View {
        HStack(spacing: 8) {
            tailFadeButton("TAIL", tint: GaryColors.gold) { arm("tail") }
            tailFadeButton("FADE", tint: Color(hex: "#8B93A7")) { arm("fade") }
            Spacer()
            Text("On the record at lock")
                .font(GaryFonts.mono(9))
                .foregroundStyle(.white.opacity(0.38))
        }
    }

    private func tailFadeButton(_ label: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                .foregroundStyle(tint)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 6).stroke(tint.opacity(0.55), lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func stakePicker(_ side: String) -> some View {
        HStack(spacing: 10) {
            Text(side.uppercased())
                .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                .foregroundStyle(side == "tail" ? GaryColors.gold : Color(hex: "#8B93A7"))
            Stepper(value: $stake, in: 0.5...5, step: 0.5) {
                Text(String(format: "%.1fu", stake))
                    .font(GaryFonts.mono(12, bold: true))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .fixedSize()
            Button("Lock it in") { place(side) }
                .font(GaryFonts.mono(11, bold: true))
                .foregroundStyle(.black)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 6).fill(GaryColors.gold))
                .disabled(busy)
            Button("Back") { arming = nil }
                .font(GaryFonts.mono(10))
                .foregroundStyle(.white.opacity(0.5))
        }
    }

    private func placedChip(_ bet: UserBet) -> some View {
        HStack(spacing: 8) {
            let label = bet.kind == "tail" ? "YOU TAILED" : "YOU FADED"
            let tint: Color = bet.kind == "tail" ? GaryColors.gold : Color(hex: "#8B93A7")
            Text("\(label) · \(String(format: "%.1fu", bet.stake_units))")
                .font(GaryFonts.mono(10, bold: true)).tracking(1)
                .foregroundStyle(tint)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 6).fill(tint.opacity(0.12)))
            if bet.status != "pending" {
                resultTag(bet)
            } else if !locked {
                Button("Undo") { remove(bet) }
                    .font(GaryFonts.mono(10))
                    .foregroundStyle(.white.opacity(0.5))
            }
            Spacer()
        }
    }

    private func resultTag(_ bet: UserBet) -> some View {
        let won = bet.status == "won"
        let push = bet.status == "push" || bet.status == "void"
        let units = bet.units_net ?? 0
        let text = push ? "PUSH" : String(format: "%@%.2fu", won ? "+" : "", units)
        let est = (bet.odds_estimated ?? false) && won ? " est" : ""
        return Text(text + est)
            .font(GaryFonts.mono(10, bold: true))
            .foregroundStyle(push ? .white.opacity(0.5) : (won ? Color(hex: "#22C55E") : Color(hex: "#EF4444")))
    }

    private func arm(_ side: String) {
        errorText = nil
        guard auth.bearerToken != nil else { showAuth = true; return }
        arming = side
    }

    private func place(_ side: String) {
        guard let dateStr = currentPickDateEST() else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                mine = try await UserBookAPI.placeBet(
                    gameDate: dateStr, pickId: pick.pick_id,
                    pickText: pick.pick ?? "", kind: side, stake: stake)
                arming = nil
            } catch {
                errorText = error.localizedDescription
            }
        }
    }

    private func remove(_ bet: UserBet) {
        busy = true
        Task {
            defer { busy = false }
            if await UserBookAPI.deleteBet(id: bet.id) { mine = nil; loaded = false }
        }
    }

    /// The pick's ET calendar date — derived from its own commence_time so a
    /// late-night card can never post against the wrong daily_picks row.
    private func currentPickDateEST() -> String? {
        guard let ct = pick.commence_time, let d = ISO8601DateFormatter().date(from: ct) else {
            return SupabaseAPI.todayEST()
        }
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone(identifier: "America/New_York")
        return fmt.string(from: d)
    }
}
```

- [ ] **Step 2: Mount in `PickCardBack`.** In `ios/GaryApp/Views.swift`, locate the conviction bar block inside `struct PickCardBack` (search `struct PickCardBack`, then the `if pick.confidence != nil { GeometryReader` block ending `.frame(height: 2)`). Immediately AFTER that block's closing `}`, insert:

```swift
            if AppFlags.userBookEnabled {
                TailFadeRow(pick: pick, gameResult: gameResult)
            }
```

- [ ] **Step 3: Build:** same xcodebuild command → `EXIT=0`. Likely fixes: `AuthManager` may not be `ObservableObject`-published for `bearerToken` (it is a `final class AuthManager: ObservableObject`); if `@ObservedObject` complains, hold it as `private let auth = AuthManager.shared` and read `auth.bearerToken` directly.

- [ ] **Step 4: Commit:**

```bash
git add ios/GaryApp/UserBookView.swift
git add -p ios/GaryApp/Views.swift    # ONLY the TailFadeRow mount hunk
git commit -m "feat: Tail/Fade row on the pick card back — lock-aware, auth-gated, receipt chip after grade"
```

---

### Task 6: Billfold YOUR BOOK section + quick-log + self-grade

**Files:**
- Modify: `ios/GaryApp/UserBookView.swift` (append)
- Modify: `ios/GaryApp/Views.swift` (ONE mount line in `BillfoldView`)

**Interfaces:**
- Consumes: `UserBookAPI.fetchMyBets/logManual/gradeManual/deleteBet`, `UserBet` (Task 4).
- Produces: `struct UserBookSection: View` (no-arg init) — the only symbol Views.swift consumes. Internally: WITH GARY record header, YOUR PLAYS subtotal, slips list, `QuickLogSheet`.

- [ ] **Step 1: Append to `UserBookView.swift`:**

```swift
// ── YOUR BOOK (Billfold section) ────────────────────────────────────────────
// Two ledgers, never mixed: WITH GARY = system-graded tails/fades (the
// flagship, unfakeable number); YOUR PLAYS = self-logged bets, labeled.
struct UserBookSection: View {
    @State private var bets: [UserBet] = []
    @State private var loading = true
    @State private var showQuickLog = false
    private let auth = AuthManager.shared

    private var withGary: [UserBet] { bets.filter { $0.isVerified } }
    private var yourPlays: [UserBet] { bets.filter { $0.kind == "manual" } }

    private func record(_ rows: [UserBet]) -> (w: Int, l: Int, p: Int, units: Double) {
        var w = 0, l = 0, p = 0; var u = 0.0
        for b in rows {
            switch b.status {
            case "won": w += 1
            case "lost": l += 1
            case "push": p += 1
            default: break
            }
            u += b.units_net ?? 0
        }
        return (w, l, p, u)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("YOUR BOOK")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                    .foregroundStyle(GaryColors.gold)
                Spacer()
                Button {
                    showQuickLog = true
                } label: {
                    Text("+ Log a bet")
                        .font(GaryFonts.mono(10, bold: true))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .buttonStyle(.plain)
            }

            if auth.bearerToken == nil {
                Text("Sign in and every pick you tail or fade goes on your own record — graded by the same system that grades Gary.")
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            } else if loading {
                ProgressView().tint(.white.opacity(0.4)).frame(maxWidth: .infinity)
            } else if withGary.isEmpty && yourPlays.isEmpty {
                Text("No entries yet. Tail or fade any pick from its card — your side locks at first pitch and grades itself.")
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ledgerHeader
                slipsList
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.035)))
        .padding(.horizontal, 16)
        .task {
            guard auth.bearerToken != nil else { loading = false; return }
            let rows = await UserBookAPI.fetchMyBets()
            // Day-cache law: a cancelled fetch returns [] — do not latch it
            // over data we already have.
            if !rows.isEmpty || bets.isEmpty { bets = rows }
            loading = false
        }
        .sheet(isPresented: $showQuickLog) {
            QuickLogSheet { newBet in bets.insert(newBet, at: 0) }
        }
    }

    private var ledgerHeader: some View {
        let g = record(withGary.filter { !$0.isPending })
        let m = record(yourPlays.filter { !$0.isPending })
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("WITH GARY")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.5))
                Text("\(g.w)-\(g.l)\(g.p > 0 ? "-\(g.p)" : "")")
                    .font(GaryFonts.text(22, .heavy))
                    .foregroundStyle(.white.opacity(0.92))
                Text(String(format: "%+.1fu", g.units))
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(g.units >= 0 ? Color(hex: "#22C55E") : Color(hex: "#EF4444"))
                Spacer()
            }
            if !yourPlays.isEmpty {
                HStack(spacing: 10) {
                    Text("YOUR PLAYS")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.4))
                    Text("\(m.w)-\(m.l)\(m.p > 0 ? "-\(m.p)" : "")")
                        .font(GaryFonts.mono(12, bold: true))
                        .foregroundStyle(.white.opacity(0.65))
                    Text(String(format: "%+.1fu", m.units))
                        .font(GaryFonts.mono(11, bold: true))
                        .foregroundStyle(m.units >= 0 ? Color(hex: "#22C55E").opacity(0.8) : Color(hex: "#EF4444").opacity(0.8))
                    Text("self-tracked")
                        .font(GaryFonts.mono(8.5)).tracking(0.5)
                        .foregroundStyle(.white.opacity(0.35))
                    Spacer()
                }
            }
        }
    }

    private var slipsList: some View {
        VStack(spacing: 0) {
            ForEach(bets.prefix(12)) { bet in
                UserBetSlipRow(bet: bet) { updated in
                    if let i = bets.firstIndex(where: { $0.id == updated.id }) { bets[i] = updated }
                } onDelete: {
                    bets.removeAll { $0.id == bet.id }
                }
                if bet.id != bets.prefix(12).last?.id {
                    Rectangle().fill(.white.opacity(0.05)).frame(height: 0.5)
                }
            }
        }
    }
}

private struct UserBetSlipRow: View {
    let bet: UserBet
    var onUpdate: (UserBet) -> Void
    var onDelete: () -> Void
    @State private var busy = false

    private var kindLabel: String {
        switch bet.kind {
        case "tail": return "TAIL"
        case "fade": return "FADE"
        default: return "YOURS"
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Text(kindLabel)
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                .foregroundStyle(bet.kind == "fade" ? Color(hex: "#8B93A7") : GaryColors.gold)
                .frame(width: 38, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(bet.pick_text)
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(bet.game_date) · \(String(format: "%.1fu", bet.stake_units))\(bet.odds_american.map { " · \($0 > 0 ? "+" : "")\($0)" } ?? "")")
                    .font(GaryFonts.mono(9))
                    .foregroundStyle(.white.opacity(0.4))
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.vertical, 9)
    }

    @ViewBuilder private var trailing: some View {
        if bet.isPending && bet.kind == "manual" {
            HStack(spacing: 6) {
                gradeChip("W", "won", Color(hex: "#22C55E"))
                gradeChip("L", "lost", Color(hex: "#EF4444"))
                gradeChip("P", "push", .white.opacity(0.5))
            }
        } else if bet.isPending {
            Text("PENDING")
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                .foregroundStyle(.white.opacity(0.35))
        } else {
            let won = bet.status == "won"
            let wash = bet.status == "push" || bet.status == "void"
            Text(wash ? bet.status.uppercased() : String(format: "%@%.2fu", won ? "+" : "", bet.units_net ?? 0))
                .font(GaryFonts.mono(11, bold: true))
                .foregroundStyle(wash ? .white.opacity(0.45) : (won ? Color(hex: "#22C55E") : Color(hex: "#EF4444")))
        }
    }

    private func gradeChip(_ label: String, _ status: String, _ tint: Color) -> some View {
        Button {
            busy = true
            let units = UserBookAPI.manualUnits(status: status, stake: bet.stake_units, odds: bet.odds_american)
            Task {
                defer { busy = false }
                if await UserBookAPI.gradeManual(id: bet.id, status: status, unitsNet: units) {
                    var copy = bet
                    onUpdate(UserBet(id: copy.id, kind: copy.kind, pick_type: copy.pick_type,
                        game_date: copy.game_date, league: copy.league, pick_text: copy.pick_text,
                        matchup: copy.matchup, player_name: copy.player_name, prop_type: copy.prop_type,
                        description: copy.description, odds_american: copy.odds_american,
                        odds_estimated: copy.odds_estimated, stake_units: copy.stake_units,
                        status: status, units_net: units, lock_at: copy.lock_at,
                        placed_at: copy.placed_at, graded_by: "user"))
                }
            }
        } label: {
            Text(label)
                .font(GaryFonts.mono(10, bold: true))
                .foregroundStyle(tint)
                .frame(width: 26, height: 26)
                .background(Circle().stroke(tint.opacity(0.5), lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }
}

// ── Quick-log sheet (manual outside bets) ───────────────────────────────────
struct QuickLogSheet: View {
    var onLogged: (UserBet) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft = UserBookAPI.ManualBetDraft()
    @State private var oddsText = ""
    @State private var busy = false
    @State private var errorText: String? = nil
    private let leagues = ["MLB", "NFL", "NBA", "NHL", "OTHER"]

    var body: some View {
        NavigationStack {
            Form {
                Section("The bet") {
                    Picker("League", selection: $draft.league) {
                        ForEach(leagues, id: \.self) { Text($0) }
                    }
                    TextField("What did you bet? (Yankees ML, Over 8.5, a parlay)", text: $draft.description, axis: .vertical)
                    TextField("Odds (American, like -120 or +145)", text: $oddsText)
                        .keyboardType(.numbersAndPunctuation)
                    Stepper(value: $draft.stake, in: 0.5...10, step: 0.5) {
                        Text(String(format: "Stake: %.1fu", draft.stake))
                    }
                }
                if let e = errorText { Section { Text(e).foregroundStyle(.red) } }
                Section {
                    Button(busy ? "Saving" : "Add to Your Plays") { save() }
                        .disabled(busy || draft.description.trimmingCharacters(in: .whitespaces).isEmpty)
                } footer: {
                    Text("Self-tracked entries stay in YOUR PLAYS — separate from your verified record with Gary.")
                }
            }
            .navigationTitle("Log a bet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    private func save() {
        draft.odds = Int(oddsText.replacingOccurrences(of: "+", with: ""))
        busy = true
        Task {
            defer { busy = false }
            do {
                let bet = try await UserBookAPI.logManual(draft)
                onLogged(bet)
                dismiss()
            } catch { errorText = error.localizedDescription }
        }
    }
}
```

- [ ] **Step 2: Mount in `BillfoldView`.** In `ios/GaryApp/Views.swift` find the section stack (search `balanceBlock` — the `VStack(spacing: 26)` listing `balanceBlock / performanceChart / recentCarousel / dailyLedger / performanceLedger` around line 11820). Insert between `balanceBlock` and `performanceChart`:

```swift
                            if AppFlags.userBookEnabled { UserBookSection() }
```

- [ ] **Step 3: Build:** xcodebuild command → `EXIT=0`; fix and repeat.

- [ ] **Step 4: Commit:**

```bash
git add ios/GaryApp/UserBookView.swift
git add -p ios/GaryApp/Views.swift    # ONLY the UserBookSection mount hunk
git commit -m "feat: Billfold YOUR BOOK — with-Gary vs self-tracked ledgers, quick-log, self-grade chips"
```

---

### Task 7: Web receipts sharpening (`/results`)

**Files:**
- Modify: `web/app/results/page.tsx`

**Interfaces:**
- Consumes: existing `PageMasthead`, `StitchRule`, `fetchAllGameResults`, plus `daily_picks.created_at` IF the column exists (probe first).

- [ ] **Step 1: Read the framework docs first** (repo law — this Next.js differs from training data): read `web/AGENTS.md`, then skim `node_modules/next/dist/docs/` for anything touching app-router pages/data fetching before editing.

- [ ] **Step 2: Probe for post-time provenance.** `curl -s "$SB_URL/rest/v1/daily_picks?select=created_at&limit=1" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"` →
  - If it returns a timestamp: pass `postedAt` through to the receipts block below and render the "posted HH:MM AM ET" line.
  - If it 400s (column missing): render the receipts block WITHOUT a per-day time claim (never fabricate provenance).

- [ ] **Step 3: Add "The receipts" block** to `web/app/results/page.tsx`, directly after the `<PageMasthead .../>` and before the headline section. Copy stays plain and true — every claim below is enforced by the system built in Tasks 1-3:

```tsx
      {/* The receipts — why this record can be trusted (and most can't) */}
      <section className="mt-8 grid gap-4 rounded-lg border border-line p-5 md:grid-cols-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-gold">Posted before lock</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-mid">
            Every pick is stored server-side before the game starts. Nothing is added after the fact.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-gold">Nothing deleted</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-mid">
            Wins, losses, and pushes all stay on the record. The archive below is the complete history.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-gold">Graded by machine</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-mid">
            Results grade automatically from final scores — the same pipeline grades Gary and everyone who tails him in the app.
          </p>
        </div>
      </section>
```

Also update the masthead `sub` line to carry the claim: change the existing `sub=` to `sub="Every pick is stored before lock, graded after the final, and stays on the record — wins, losses, and pushes. Units assume flat 1-unit stakes at the listed odds."`.

- [ ] **Step 4: Build:** `cd web && npm run build; echo EXIT=$?` → `EXIT=0`. (Do NOT push — a push deploys Vercel prod; the commit rides until Adam pushes.)

- [ ] **Step 5: Commit:**

```bash
git add web/app/results/page.tsx
git commit -m "web: results page carries the receipts — posted-before-lock, nothing-deleted, machine-graded"
```

---

### Task 8: "My Ride with Gary" share card + full verify-fix loop

**Files:**
- Modify: `ios/GaryApp/UserBookView.swift` (append share card + share button in `UserBookSection` header)

**Interfaces:**
- Consumes: `UserBet` rows (WITH GARY ledger only), `ImageRenderer` pattern from `renderPickShareImages` (Views.swift ~16278), `GaryX_white` asset if available (check `Assets.xcassets`), `UIActivityViewController` via the existing share-sheet pattern (`PickShareItem` — grep its definition and mirror it).

- [ ] **Step 1: Append the card + renderer to `UserBookView.swift`:**

```swift
// ── MY RIDE WITH GARY share card ────────────────────────────────────────────
// WITH GARY ledger only — every number on this card is system-graded and
// lock-verified. YOUR PLAYS never appears here; the share card IS the receipt.
struct RideShareCardView: View {
    let record: (w: Int, l: Int, p: Int, units: Double)
    let streakText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("MY RIDE WITH GARY")
                .font(GaryFonts.mono(13, bold: true)).tracking(2)
                .foregroundStyle(GaryColors.gold)
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text("\(record.w)-\(record.l)\(record.p > 0 ? "-\(record.p)" : "")")
                    .font(GaryFonts.text(56, .heavy))
                    .foregroundStyle(.white)
                Text(String(format: "%+.1fu", record.units))
                    .font(GaryFonts.mono(24, bold: true))
                    .foregroundStyle(record.units >= 0 ? Color(hex: "#22C55E") : Color(hex: "#EF4444"))
            }
            if let s = streakText {
                Text(s)
                    .font(GaryFonts.mono(13, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.7))
            }
            Spacer(minLength: 0)
            HStack {
                Text("Locked before first pitch. Graded by machine.")
                    .font(GaryFonts.mono(10)).tracking(0.5)
                    .foregroundStyle(.white.opacity(0.45))
                Spacer()
                Text("betwithgary.ai")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1)
                    .foregroundStyle(GaryColors.gold.opacity(0.9))
            }
        }
        .padding(28)
        .frame(width: 420, height: 420, alignment: .topLeading)
        .background(Color(hex: "#141212"))
    }
}

@MainActor
func renderRideShareImage(record: (w: Int, l: Int, p: Int, units: Double), streakText: String?) -> UIImage? {
    let renderer = ImageRenderer(content: RideShareCardView(record: record, streakText: streakText))
    renderer.scale = 3
    return renderer.uiImage
}
```

- [ ] **Step 2: Wire the share button.** In `UserBookSection`'s header `HStack` (built in Task 6), before the `+ Log a bet` button, add a share button shown only when the WITH GARY ledger has at least one graded entry. Grep how the existing card back presents share sheets (`PickShareItem` + `.sheet(item:)` near `PickCardBack`) and mirror that pattern exactly:

```swift
                if withGary.contains(where: { !$0.isPending }) {
                    Button {
                        let g = record(withGary.filter { !$0.isPending })
                        let streak = currentStreakText(withGary)
                        if let img = renderRideShareImage(record: g, streakText: streak) {
                            shareImage = ShareableImage(image: img)
                        }
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    .buttonStyle(.plain)
                }
```

with supporting pieces in `UserBookSection`: `@State private var shareImage: ShareableImage? = nil`, a `struct ShareableImage: Identifiable { let id = UUID(); let image: UIImage }`, `.sheet(item: $shareImage) { item in ShareSheet(items: [item.image]) }` (grep `ShareSheet` / `UIActivityViewController` in Views.swift — a wrapper already exists for pick shares; reuse the existing one rather than duplicating if found), and:

```swift
    private func currentStreakText(_ rows: [UserBet]) -> String? {
        let graded = rows.filter { !$0.isPending && $0.status != "void" && $0.status != "push" }
            .sorted { ($0.placed_at ?? "") > ($1.placed_at ?? "") }
        guard let first = graded.first else { return nil }
        var count = 0
        for b in graded { if b.status == first.status { count += 1 } else { break } }
        guard count >= 2 else { return nil }
        return first.status == "won" ? "Riding a \(count)-bet heater" : nil
    }
```

- [ ] **Step 3: Build:** xcodebuild → `EXIT=0`.

- [ ] **Step 4: FULL verify-fix loop (founder's instruction: repeat until 100%).** Run every gate; fix anything red and re-run the loop from the top:
  1. `cd gary2.0/supabase/functions/grade-results && deno test .` → all pass.
  2. Edge fns live-verify: `curl -s "$SB_URL/functions/v1/grade-results" -H "Authorization: Bearer $SB_KEY"` → `ok:true` with `user_bets` key; `curl -s "$SB_URL/functions/v1/grade-props?dry=1" ...` → `ok:true`.
  3. RLS re-verify (Task 1 Step 3 curls) → same expected results.
  4. iOS build → `EXIT=0`.
  5. Web build → `EXIT=0`.
  6. Copy sweep over new code: `grep -n '\.\.\.' ios/GaryApp/UserBookView.swift web/app/results/page.tsx | grep -v "Swift range\|spread"` — manually confirm zero user-facing "..." strings (code-level `...` ranges are fine); grep for banned word `CALL` in new user-facing strings → none.
  7. Orchestrator suite regression (backend untouched, but confirm): `cd gary2.0 && npm test 2>/dev/null || node --test 2>/dev/null` — use whatever the established suite runner is (check `package.json` scripts; memory says the suite reports as N/N). Expect no new failures vs the pre-task baseline.
  8. `git status --short` → nothing of MINE unstaged; parallel session's files untouched.

- [ ] **Step 5: Commit:**

```bash
git add ios/GaryApp/UserBookView.swift
git commit -m "feat: My Ride with Gary share card — verified WITH-GARY ledger only"
```

- [ ] **Step 6: Wrap.** Report to Adam: what shipped, what's deployed (edge fns + migration = LIVE; iOS = built, ships with his next archive; web = committed NOT pushed — pushing deploys Vercel), the test-user cleanup state, and the one taste-pass he owes: run the app, tail something, react.
