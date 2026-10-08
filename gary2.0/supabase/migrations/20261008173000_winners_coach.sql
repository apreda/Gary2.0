-- THE WINNERS JUDGE (founder GO, Oct 8 2026). The reader's job changed from grading evidence to choosing the
-- lineup ("is this a bet or a guess"; winnersReader.js, policy winners-coach-v1). Two gate changes:
--   * Sunday Night Football is no longer automatic (founder: "let's not automatically qualify SNF anymore").
--   * A big game (winners_big_games, the MLB playoff rows) is on when the judge says clear or lean, at Gary's
--     amount or $100 on a pass; "unless unsupported" is gone, the judge's off stands.
-- Everything else in the gate is the September system: Gary plays it ∧ clear or lean, at his amount; college
-- clear or lean with more than $300, power conferences, spread ≤ 21.5. Plus the judge's weekly report (read-only).

create or replace function gary_private.admit_winners_candidate(p_id bigint) returns text
language plpgsql set search_path to '' as $function$
declare c public.winners_candidates; grade text; play boolean:=false; big boolean:=false; ok boolean:=false; why text; stake numeric;
        big_spread boolean:=false; small boolean:=false; pick text; away text; home text; away_ok boolean; home_ok boolean;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return 'missing'; end if;
 if c.admitted_at is not null then return 'already'; end if;
 if c.kind='prop' then return 'props_selection'; end if;   -- props: public.finish_winners_props
 if c.commence_time is null or c.commence_time<=clock_timestamp() then return 'kickoff'; end if;
 grade:=c.review->>'assessment';
 if grade is null or c.status<>'graded' then return 'unread'; end if;
 big_spread:=abs(coalesce(nullif(c.pick_snapshot->>'spread','')::numeric,0))>21.5;
 if c.league='NCAAF' then
  pick:=coalesce(c.pick_snapshot->>'pick', c.pick_text, '');
  away:=coalesce(c.pick_snapshot->>'awayTeam',''); home:=coalesce(c.pick_snapshot->>'homeTeam','');
  away_ok:=gary_private.winners_power_team(c.pick_snapshot->>'awayConference', away);
  home_ok:=gary_private.winners_power_team(c.pick_snapshot->>'homeConference', home);
  if away<>'' and pick ilike away||'%' then small:=not away_ok;
  elsif home<>'' and pick ilike home||'%' then small:=not home_ok;
  else small:=not (away_ok and home_ok); end if;   -- a total, or a side we cannot name
 end if;
 if c.policy_version='mlb-conviction-v4' and coalesce(c.pick_snapshot->>'price_endorsement','')<>'endorse' then
  why:='declined_price';
 elsif big_spread then
  why:='spread_over_21_5';
 elsif small then
  why:='small_conference';
 else
  play:=coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
    and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars')='number'
    and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>=100;
  stake:=case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 0 end;
  -- Big games: the founder's list only (winners_big_games). No automatic Sunday Night Football (Oct 8 2026).
  big:=exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
  if c.league='NCAAF' then
   ok:=play and (grade='clear' or (grade='lean' and stake>300));
  else
   ok:=grade in ('clear','lean') and (play or big);
  end if;
  why:=case when ok then 'admitted' when grade='unsupported' then 'unsupported' when grade='toss_up' then 'grade_toss_up'
            when not play then 'gary_pass' when c.league='NCAAF' and grade='lean' then 'lean_under_300' else 'grade_'||grade end;
 end if;
 if not ok then
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'assessment',grade,'play',play,'big_game',big,'stake_dollars',stake,'spread',c.pick_snapshot->>'spread',
          'away_conference',c.pick_snapshot->>'awayConference','home_conference',c.pick_snapshot->>'homeConference'));
  return why;
 end if;
 stake:=case when play then stake else 100 end;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),'winners-coach-v1',
   case when play then format('Gary plays it, $%s; judge: %s',trunc(stake),grade) else format('Big game; judge: %s',grade) end);
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when play then 'play_and_grade' else 'big_game' end,'assessment',grade,'stake_dollars',stake,'policy_version','winners-coach-v1'));
 return 'admitted';
end $function$;

drop function if exists gary_private.nfl_sunday_night(timestamp with time zone);

-- THE JUDGE'S WEEK: the board against the rest of Gary's bets and his passes, with the grade split. Read-only,
-- for Adam and me; never shown to Gary (no record patterns in anything he reads).
create or replace function public.winners_judge_report(p_from text, p_to text)
returns table(bucket text, league text, w bigint, l bigint, p bigint)
language sql stable set search_path='' as $$
 with picks as (
  select c.id, c.league, c.game_id, c.admitted_at, c.review->>'assessment' as grade,
    coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false) as play
  from public.winners_candidates c
  where c.kind='game' and c.game_date between p_from and p_to and c.league in ('MLB','NFL','NCAAF')
 ), res as (
  select game_id, league, result::text as result from public.game_results where game_date::text between p_from and p_to
  union all
  select game_id, 'NFL', result::text from public.nfl_results where game_date::text between p_from and p_to
 ), j as (
  select distinct on (pk.id) pk.*, r.result from picks pk join res r on r.game_id=pk.game_id and r.league=pk.league
  where r.result in ('won','lost','push') order by pk.id
 ), rows_ as (
  select case when admitted_at is not null then '1 board' when play then '2 bet, not on' else '3 pass' end as b, league as lg, result from j
  union all select case when admitted_at is not null then '1 board' when play then '2 bet, not on' else '3 pass' end, 'ALL', result from j
  union all select '4 grade '||coalesce(grade,'none'), 'ALL', result from j
  union all select '5 '||case when admitted_at is not null then 'board' when play then 'bet, not on' else 'pass' end||' · '||coalesce(grade,'none'), 'ALL', result from j
 )
 select b, lg, count(*) filter(where result='won'), count(*) filter(where result='lost'), count(*) filter(where result='push')
 from rows_ group by b, lg order by b, lg;
$$;
revoke all on function public.winners_judge_report(text,text) from public,anon,authenticated;
grant execute on function public.winners_judge_report(text,text) to service_role;
