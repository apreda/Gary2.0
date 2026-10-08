-- DARTS ON WINNERS (founder GO, Oct 8 2026: "He already ranks them, and his order works ... There we go. We
-- have our system for which ones to send to winners.")
--
-- MLB only. Gary throws his darts exactly as before. The rule is ours, never his: his FIRST dart in H+R+RBI
-- and his first in total bases go on Winners (his order at the throw: #1 hit 10 of 12 since Oct 1; #5 hit
-- 6 of 12), plus the one first-inning dart he chooses. He names the amount at the throw (money at risk, $100
-- minimum, no maximum, his cash on hand in front of him; dartsBet.js). Home runs are never offered.
-- The first-inning dart is booked at the throw; a player dart is booked when the posted lineup confirms him
-- (dartsScratch.js), so nothing goes on Winners and then gets scratched. A booked dart is locked: it settles
-- from the dart's own grade (hit/miss/void), and a later scratch of the dart voids the Winners play.

alter table public.darts add column if not exists gary_bet jsonb;
alter table public.darts add column if not exists winners_candidate_id bigint references public.winners_candidates(id);

-- The dart as it reads on the board: "Brayan Rocchio under 1.5 H+R+RBI", "Guardians @ White Sox: no run in the 1st".
create or replace function gary_private.dart_words(d public.darts) returns text
language sql immutable set search_path to '' as $$
  select case d.kind
    when 'first_inning' then coalesce(d.matchup, d.player) || ': ' || case when lower(d.bet) = 'under' then 'no run in the 1st' else 'a run in the 1st' end
    when 'hrr' then d.player || ' ' || lower(d.bet) || ' ' || substring(d.prop from '[0-9.]+$') || ' H+R+RBI'
    when 'tb' then d.player || ' ' || lower(d.bet) || ' ' || substring(d.prop from '[0-9.]+$') || ' total bases'
    else d.player || ' ' || coalesce(lower(d.bet), '') || ' ' || d.prop end;
$$;

-- Book one dart on Winners at Gary's amount. Returns 'admitted' or why not.
create or replace function gary_private.admit_dart(p_dart_id bigint) returns text
language plpgsql set search_path to '' as $$
declare d public.darts; stake numeric; label text; line text; snap jsonb; mk text; tk text; cid bigint; words text;
begin
 select * into d from public.darts where id = p_dart_id for update;
 if not found then return 'missing'; end if;
 if d.winners_candidate_id is not null then return 'already'; end if;
 if d.league <> 'MLB' or d.kind not in ('hrr', 'tb', 'first_inning') then return 'not_a_winners_kind'; end if;
 if d.scratched_at is not null then return 'scratched'; end if;
 if d.result is not null or d.commence_time is null or d.commence_time <= clock_timestamp() then return 'started'; end if;
 if d.odds is null or abs(d.odds) < 100 then return 'no_price'; end if;
 if not coalesce((d.gary_bet->>'play')::boolean, false) or jsonb_typeof(d.gary_bet->'stake_dollars') <> 'number' then return 'no_amount'; end if;
 stake := (d.gary_bet->>'stake_dollars')::numeric;
 if stake <> trunc(stake) or stake < 100 then return 'no_amount'; end if;
 -- The same player and market already on the board through the props lane: one ticket, not two.
 if d.kind <> 'first_inning' and exists (
   select 1 from public.winners_board b where b.game_date = d.game_date::text and b.league = 'MLB' and b.kind = 'prop' and b.scratched_at is null
     and lower(btrim(coalesce(b.pick_snapshot->>'player', ''))) = lower(btrim(d.player))
     and lower(btrim(coalesce(b.pick_snapshot->>'prop', b.pick_snapshot->>'prop_type', ''))) = lower(btrim(d.prop))) then
   return 'twin_on_board';
 end if;
 label := case d.kind when 'hrr' then 'H+R+RBI' when 'tb' then 'total bases' else 'first-inning' end;
 line := substring(d.prop from '[0-9.]+$');
 words := gary_private.dart_words(d);
 snap := jsonb_build_object(
   'player', d.player, 'team', d.team, 'position', d.position,
   'prop', d.prop, 'line', line, 'bet', lower(d.bet),
   'odds', case when d.odds > 0 then '+' || d.odds::text else d.odds::text end,
   'league', 'MLB', 'sport', 'MLB', 'lane', 'CORE',
   'matchup', d.matchup, 'game_id', case when d.game_id ~ '^[0-9]+$' then to_jsonb(d.game_id::bigint) else to_jsonb(d.game_id) end,
   'commence_time', d.commence_time, 'book', d.book,
   'rationale', d.reason, 'model', d.model,
   'dart_id', d.id, 'dart_kind', d.kind, 'dart_rank', d.rank, 'pick_text', words,
   'gary_bet', d.gary_bet);
 mk := md5(concat_ws('|', d.game_date::text, 'MLB', 'dart', lower(d.player), lower(d.prop), line));
 tk := md5(concat_ws('|', d.game_date::text, 'MLB', 'dart', lower(d.player), lower(d.prop), line, lower(d.bet), d.odds::text));
 insert into public.winners_candidates(game_date, league, kind, game_id, ticket_key, market_key, pick_text, odds, commence_time, pick_snapshot, evidence_snapshot, policy_version, status, reason, admitted_at)
  values (d.game_date::text, 'MLB', 'prop', d.game_id, tk, mk, words, d.odds, d.commence_time, snap, '{}'::jsonb, 'darts-top-v1', 'qualified', 'dart', clock_timestamp())
  returning id into cid;
 insert into public.winners_board(candidate_id, game_date, league, kind, game_id, ticket_key, market_key, pick_snapshot, admitted_at, policy_version, reason)
  values (cid, d.game_date::text, 'MLB', 'prop', d.game_id, tk, mk, snap, clock_timestamp(), 'darts-top-v1',
          format('Gary''s #%s %s dart, $%s', coalesce(d.rank, 1), label, trunc(stake)));
 update public.darts set winners_candidate_id = cid where id = d.id;
 insert into public.winners_decision_events(candidate_id, event, detail)
  values (cid, 'admitted', jsonb_build_object('gate', 'dart', 'dart_id', d.id, 'kind', d.kind, 'rank', d.rank, 'stake_dollars', stake, 'policy_version', 'darts-top-v1'));
 return 'admitted';
end $$;
revoke all on function gary_private.admit_dart(bigint) from public, anon, authenticated;
grant execute on function gary_private.admit_dart(bigint) to service_role;
create or replace function public.admit_dart(p_dart_id bigint) returns text
language sql set search_path to '' as $$ select gary_private.admit_dart(p_dart_id); $$;
revoke all on function public.admit_dart(bigint) from public, anon, authenticated;
grant execute on function public.admit_dart(bigint) to service_role;

-- A dart scratched after booking (the book voids it too) voids its Winners play.
create or replace function gary_private.dart_scratch_voids_winners() returns trigger
language plpgsql set search_path to '' as $$
begin
 if new.winners_candidate_id is not null and new.scratched_at is not null and old.scratched_at is null then
  perform public.scratch_winners_play(new.winners_candidate_id, 'Dart scratched: ' || coalesce(new.scratch_reason, ''));
 end if;
 return new;
end $$;
drop trigger if exists dart_scratch_voids_winners on public.darts;
create trigger dart_scratch_voids_winners after update of scratched_at on public.darts
 for each row execute function gary_private.dart_scratch_voids_winners();

-- The app's ticket result: a booked dart settles from the dart's own grade.
create or replace function gary_private.lab_ticket_result(p_kind text, p_league text, p_game_date text, p_game_id text, p_pick_text text, p_snapshot jsonb)
 returns jsonb language sql stable security definer set search_path to '' as $function$
  select case
    when p_game_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then null
    when p_snapshot ? 'dart_id' then (
      select jsonb_build_object('result', case d.result when 'hit' then 'won' when 'miss' then 'lost' when 'void' then 'void' else null end,
        'actual_value', d.actual, 'line_value', gary_private.lab_num(p_snapshot->>'line'))
      from public.darts d where d.id = (p_snapshot->>'dart_id')::bigint and d.result is not null)
    when p_kind = 'prop' then (
      select jsonb_build_object('result', gary_private.lab_norm_result(r.result),
        'actual_value', r.actual_value, 'line_value', r.line_value)
      from public.prop_results r
      where r.game_date = p_game_date::date and r.result is not null
        and lower(btrim(coalesce(r.player_name, ''))) = lower(btrim(coalesce(p_snapshot->>'player', '')))
        and regexp_replace(regexp_replace(lower(btrim(coalesce(r.prop_type, ''))), '^player_', ''), '[\s_]+', '_', 'g')
          = regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(p_snapshot->>'prop', p_snapshot->>'prop_type', ''))),
              '\s+[+-]?[0-9]+(\.[0-9]+)?$', ''), '^player_', ''), '[\s_]+', '_', 'g')
        and r.line_value = gary_private.lab_num(p_snapshot->>'line')
        and lower(btrim(coalesce(r.bet, ''))) = lower(btrim(coalesce(p_snapshot->>'bet', '')))
      order by (r.game_id = p_game_id) desc nulls last, greatest(r.updated_at, r.created_at) desc nulls last
      limit 1)
    when upper(p_league) = 'NFL' then (
      select jsonb_build_object(
        'result', case when r.season_type = 1 then 'void' else gary_private.lab_norm_result(r.result) end,
        'final_score', r.final_score, 'home_score', r.home_score, 'away_score', r.away_score)
      from public.nfl_results r
      where r.game_date = p_game_date::date and r.result is not null
        and (gary_private.lab_norm_text(r.pick_text) = gary_private.lab_norm_text(p_pick_text) or r.game_id = p_game_id)
      order by (gary_private.lab_norm_text(r.pick_text) = gary_private.lab_norm_text(p_pick_text)) desc,
        greatest(r.updated_at, r.created_at) desc nulls last
      limit 1)
    else (
      select jsonb_build_object('result', gary_private.lab_norm_result(r.result), 'final_score', r.final_score,
        'home_score', case when r.final_score ~ '^[0-9]+-[0-9]+$' then split_part(r.final_score, '-', 2)::integer end,
        'away_score', case when r.final_score ~ '^[0-9]+-[0-9]+$' then split_part(r.final_score, '-', 1)::integer end)
      from public.game_results r
      where r.game_date = p_game_date::date and r.result is not null
        and upper(coalesce(r.league, '')) = upper(p_league)
        and (gary_private.lab_norm_text(r.pick_text) = gary_private.lab_norm_text(p_pick_text)
          or r.game_id = p_game_id
          or gary_private.lab_norm_text(r.matchup) = gary_private.lab_norm_text(
               coalesce(p_snapshot->>'awayTeam', '') || ' @ ' || coalesce(p_snapshot->>'homeTeam', '')))
      order by (gary_private.lab_norm_text(r.pick_text) = gary_private.lab_norm_text(p_pick_text)) desc,
        (r.game_id = p_game_id) desc nulls last, greatest(r.updated_at, r.created_at) desc nulls last
      limit 1)
  end
$function$;

-- The bankroll ledger: a booked dart settles from the dart's grade; the props branch leaves darts alone.
create or replace view gary_private.bankroll_ledger as
 select b.candidate_id, b.game_date, b.league, b.kind, b.game_id, b.admitted_at, b.stake_units,
   c.pick_text, c.odds, c.commence_time,
   case when b.scratched_at is not null then 'void' when g.grades = 1 then g.result else 'pending' end as result,
   case when b.scratched_at is not null then b.scratched_at when g.grades = 1 then g.settled_at else null end as settled_at,
   case when b.scratched_at is not null then 0::numeric
        when g.grades = 1 then case g.result
          when 'won' then case when c.odds > 0 then c.odds::numeric / 100.0 else 100.0 / abs(c.odds)::numeric end
          when 'lost' then -1::numeric else 0::numeric end
        else 0::numeric end as flat_net_units
 from public.winners_board b
 join public.winners_candidates c on c.id = b.candidate_id
 cross join lateral (
   select count(distinct results.outcome) as grades, min(results.outcome) as result, max(results.at) as settled_at
   from (
     select case d.result when 'hit' then 'won' when 'miss' then 'lost' when 'void' then 'void' else null end as outcome,
            d.graded_at as at
     from public.darts d
     where b.policy_version = 'darts-top-v1' and d.id = (b.pick_snapshot->>'dart_id')::bigint
     union all
     select case lower(btrim(r.result)) when 'win' then 'won' when 'loss' then 'lost' when 'pushed' then 'push' when 'voided' then 'void' else lower(btrim(r.result)) end,
            greatest(r.created_at, r.updated_at)
     from public.game_results r
     where b.kind = 'game' and b.league <> 'NFL' and r.game_date = b.game_date::date and r.league = b.league and r.game_id = b.game_id
       and lower(regexp_replace(btrim(r.pick_text), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(c.pick_text), '\s+', ' ', 'g'))
     union all
     select case when r.season_type = 1 then 'void' else
              case lower(btrim(r.result)) when 'win' then 'won' when 'loss' then 'lost' when 'pushed' then 'push' when 'voided' then 'void' else lower(btrim(r.result)) end end,
            greatest(r.created_at, r.updated_at)
     from public.nfl_results r
     where b.kind = 'game' and b.league = 'NFL' and r.game_date = b.game_date::date and r.game_id = b.game_id
       and lower(regexp_replace(btrim(r.pick_text), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(c.pick_text), '\s+', ' ', 'g'))
     union all
     select case lower(btrim(r.result)) when 'win' then 'won' when 'loss' then 'lost' when 'pushed' then 'push' when 'voided' then 'void' else lower(btrim(r.result)) end,
            greatest(r.created_at, r.updated_at)
     from public.prop_results r
     where b.kind = 'prop' and b.policy_version <> 'darts-top-v1' and r.game_date = b.game_date::date and upper(r.sport) = b.league and r.game_id = b.game_id
       and lower(btrim(r.player_name)) = lower(btrim(b.pick_snapshot->>'player'))
       and regexp_replace(regexp_replace(lower(btrim(r.prop_type)), '^player_', ''), '[\s_]+', '_', 'g')
         = regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(b.pick_snapshot->>'prop', b.pick_snapshot->>'prop_type'))), '\s+[+-]?[0-9]+(\.[0-9]+)?$', ''), '^player_', ''), '[\s_]+', '_', 'g')
       and r.line_value = case when coalesce(b.pick_snapshot->>'line', '') ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then (b.pick_snapshot->>'line')::numeric else null end
       and lower(btrim(r.bet)) = lower(btrim(b.pick_snapshot->>'bet'))
   ) results
   where results.outcome in ('won', 'lost', 'push', 'void')) g
 where b.bankroll_policy = 'daily-bankroll-v1' and b.stake_units > 0;

-- The streak (free) pick never comes from a dart: darts are the Darts page's leans.
create or replace function public.select_streak_pick(p_date text) returns boolean
language plpgsql security definer set search_path to '' as $function$
declare v_pass timestamptz; r record; v_by text := 'stake bar'; v_waiting boolean; v_first_admitted timestamptz; v_own text[];
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  if exists (select 1 from public.streak_picks where game_date = p_date::date) then return false; end if;
  v_pass := gary_private.day_pass_at(p_date::date);
  -- Sunday's NFL games that post as their own free picks; never the day's free pick.
  v_own := array(select f.game_id from gary_private.sunday_nfl_free_games(p_date::date) f);

  -- The streak pick: the first Winners play at $300 or more; else the biggest stake at the day pass.

  select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
         coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
         c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
    into r
  from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
  where w.game_date = p_date and c.commence_time > now() and w.stake_units >= 3
    and w.policy_version <> 'darts-top-v1'
    and not (w.kind = 'game' and w.league = 'NFL' and w.game_id = any(v_own))
  order by w.admitted_at asc, w.stake_units desc
  limit 1;
  if not found then
    if v_pass is not null and now() < v_pass then return false; end if;
    v_by := 'biggest stake';
    select w.candidate_id, w.league, w.kind, c.pick_text, c.odds, c.game_id, c.commence_time, w.stake_units,
           coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
           c.pick_snapshot->>'player' as player, c.pick_snapshot->>'prop' as prop, c.pick_snapshot->>'bet' as bet
      into r
    from public.winners_board w join public.winners_candidates c on c.id = w.candidate_id
    where w.game_date = p_date and c.commence_time > now()
      and w.policy_version <> 'darts-top-v1'
      and not (w.kind = 'game' and w.league = 'NFL' and w.game_id = any(v_own))
    order by coalesce(w.stake_units, 0) desc, (w.kind = 'game') desc, w.admitted_at asc
    limit 1;
    if not found then return false; end if;
  end if;
  insert into public.streak_picks (game_date, candidate_id, league, kind, pick_text, odds, matchup, game_id, commence_time, stake_units, player, prop, bet, chosen_by)
  values (p_date::date, r.candidate_id, r.league, r.kind, r.pick_text, r.odds, r.matchup, r.game_id, r.commence_time, r.stake_units, r.player, r.prop, r.bet, v_by)
  on conflict do nothing;
  return found;
end $function$;
