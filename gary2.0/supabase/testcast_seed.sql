-- TEST CAST SEED (Aug 20 2026, founder: "populate it all with fake accounts
-- and data just so we know it's all working — test only").
--
-- Nine locked test accounts (they can never sign in: the password column
-- holds a non-bcrypt sentinel) with claimed handles and full verified-lane
-- bet histories crafted to land the exact records/streaks of the mock cast.
-- Every account lives at @testcast.betwithgary.ai with a fixed UUID — the
-- companion testcast_cleanup.sql removes all of it in one run.
--
-- PURGE BEFORE LAUNCH (Sep 5) — run testcast_cleanup.sql and flip
-- AppFlags.bookPreviewCast to false. The launch board is real records only.
--
-- Sequences are built oldest→newest as: [run-kind block] [opposite block]
-- [current run], so the current streak is exactly the designed one.
-- BigSarge stars every play (streak reads designated rows), MToro22 stars
-- only his last 8 (subset path), everyone else has no stars (fallback path)
-- — all three streak-source branches of your_book_leaderboard_v2 get
-- exercised.

do $$
declare
  r record;
  seq text[];
  i int;
  n int;
  d date;
  star bool;
  bk text;
begin
  -- The user_bets guard trigger only admits verified-lane writes from the
  -- marked RPC transaction; mark this one the same way.
  perform set_config('app.user_bets_rpc', '1', true);

  for r in
    select * from (values
      ('00000000-0000-4000-a000-000000000001'::uuid, 'BigSarge',     24, 11, 1, 'won',  7, 'all'),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'MToro22',      31, 22, 2, 'won',  5, 'tail8'),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'TheLedger',     9,  6, 0, 'won',  3, 'none'),
      ('00000000-0000-4000-a000-000000000004'::uuid, 'NightcapNina', 22, 14, 1, 'won',  2, 'none'),
      ('00000000-0000-4000-a000-000000000005'::uuid, 'DogHouseDan',  18, 21, 0, 'won',  1, 'none'),
      ('00000000-0000-4000-a000-000000000006'::uuid, 'SweatEquity',  15, 12, 1, 'lost', 1, 'none'),
      ('00000000-0000-4000-a000-000000000007'::uuid, 'FadeTheBear',  21, 25, 2, 'lost', 2, 'none'),
      ('00000000-0000-4000-a000-000000000008'::uuid, 'ParlayPat',    18, 15, 0, 'lost', 3, 'none'),
      ('00000000-0000-4000-a000-000000000009'::uuid, 'ColdBrewKev',  12, 19, 1, 'lost', 6, 'none')
    ) as t(uid, handle, w, l, p, run_kind, run_len, star_mode)
  loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (r.uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            lower(r.handle) || '@testcast.betwithgary.ai', 'TESTCAST-NO-LOGIN',
            now(), now(), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"test_cast":true}'::jsonb)
    on conflict (id) do nothing;

    insert into public.public_profiles (user_id, display_name)
    values (r.uid, r.handle)
    on conflict (user_id) do update set display_name = excluded.display_name;

    if r.run_kind = 'won' then
      seq := array_fill('won'::text,  array[r.w - r.run_len])
          || array_fill('lost'::text, array[r.l])
          || array_fill('won'::text,  array[r.run_len]);
    else
      seq := array_fill('lost'::text, array[r.l - r.run_len])
          || array_fill('won'::text,  array[r.w])
          || array_fill('lost'::text, array[r.run_len]);
    end if;

    n := array_length(seq, 1);
    for i in 1..n loop
      d := date '2026-08-19' - (n - i);
      star := case r.star_mode when 'all' then true when 'tail8' then i > n - 8 else false end;
      bk := case when i % 4 = 0 then 'fade' else 'tail' end;
      insert into public.user_bets (user_id, kind, pick_type, game_date, league, pick_text,
        odds_american, odds_estimated, stake_units, status, units_net,
        lock_at, placed_at, graded_at, graded_by, streak_pick)
      values (r.uid, bk, 'game', d, 'MLB', 'Sample play ' || i,
        -110, false, 1.0, seq[i],
        case seq[i] when 'won' then 0.91 else -1.0 end,
        d::timestamptz + interval '23 hours',
        d::timestamptz + interval '16 hours',
        d::timestamptz + interval '27 hours',
        'system', star);
    end loop;

    -- Pushes ride as the oldest rows (streak math skips them by design).
    for i in 1..r.p loop
      d := date '2026-08-19' - n - i;
      insert into public.user_bets (user_id, kind, pick_type, game_date, league, pick_text,
        odds_american, odds_estimated, stake_units, status, units_net,
        lock_at, placed_at, graded_at, graded_by, streak_pick)
      values (r.uid, 'tail', 'game', d, 'MLB', 'Sample play push ' || i,
        -110, false, 1.0, 'push', 0,
        d::timestamptz + interval '23 hours',
        d::timestamptz + interval '16 hours',
        d::timestamptz + interval '27 hours',
        'system', false);
    end loop;
  end loop;
end $$;
