-- College main-game qualification must not depend on a successful reader job.
-- Reuse MLB's exact published-ticket admission route. A named, priced college
-- main game qualifies immediately; ordinary college games and props retain
-- their existing grade/stake thresholds. Published snapshots remain immutable.

CREATE OR REPLACE FUNCTION gary_private.admit_winners_candidate(p_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.winners_candidates; grade text; play boolean:=false; big boolean:=false; ok boolean:=false; why text; stake numeric;
        big_spread boolean:=false; small boolean:=false; pick text; away text; home text; away_ok boolean; home_ok boolean;
        automatic_mlb boolean:=false; automatic_game boolean:=false;
begin
 select * into c from public.winners_candidates where id=p_id for update;
 if not found then return 'missing'; end if;
 if c.admitted_at is not null then return 'already'; end if;
 if c.commence_time is null or c.commence_time<=clock_timestamp() then return 'kickoff'; end if;
 big:=c.kind='game' and exists(select 1 from public.winners_big_games g where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id);
 automatic_mlb:=c.kind='game' and c.league='MLB';
 automatic_game:=automatic_mlb or (c.league='NCAAF' and big);
 if automatic_game then
  if nullif(trim(c.game_id),'') is null or nullif(trim(c.pick_text),'') is null
     or c.odds is null or abs(c.odds::numeric)<100
     or c.pick_snapshot->'odds' is distinct from to_jsonb(c.odds)
     or coalesce(c.pick_snapshot->>'game_id',c.pick_snapshot->>'bdl_game_id','')<>c.game_id
     or trim(coalesce(c.pick_snapshot->>'pick',''))<>c.pick_text
     or coalesce(c.pick_snapshot->>'league','')<>c.league then
   return 'invalid_original_ticket';
  end if;
  -- A queued draft is insufficient. Match the complete published original,
  -- including its kickoff, rather than constructing or rewriting a ticket.
  if not exists (
   select 1 from public.daily_picks d
   cross join lateral jsonb_array_elements(d.picks) published(pick)
   where d.date=c.game_date and published.pick=c.pick_snapshot
     and (published.pick->>'commence_time')::timestamptz=c.commence_time
  ) then return 'unpublished'; end if;
 end if;
 grade:=c.review->>'assessment';
 if not automatic_game and (grade is null or c.status<>'graded') then return 'unread'; end if;
 big_spread:=c.kind='game' and abs(coalesce(nullif(c.pick_snapshot->>'spread','')::numeric,0))>21.5;
 if c.kind='game' and c.league='NCAAF' then
  pick:=coalesce(c.pick_snapshot->>'pick', c.pick_text, '');
  away:=coalesce(c.pick_snapshot->>'awayTeam',''); home:=coalesce(c.pick_snapshot->>'homeTeam','');
  away_ok:=gary_private.winners_power_team(c.pick_snapshot->>'awayConference', away);
  home_ok:=gary_private.winners_power_team(c.pick_snapshot->>'homeConference', home);
  if away<>'' and pick ilike away||'%' then small:=not away_ok;
  elsif home<>'' and pick ilike home||'%' then small:=not home_ok;
  else small:=not (away_ok and home_ok); end if;
 end if;
 if not automatic_mlb and c.policy_version='mlb-conviction-v4' and coalesce(c.pick_snapshot->>'price_endorsement','')<>'endorse' then
  why:='declined_price';
 elsif not automatic_mlb and big_spread and not (c.league='NCAAF' and big) then
  why:='spread_over_21_5';
 elsif small and not (c.league='NCAAF' and big) then
  why:='small_conference';
 else
  play:=coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
    and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars')='number'
    and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>=100;
  stake:=case when play then (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric else 0 end;
  if automatic_game then
   ok:=true;
  elsif c.kind='game' and c.league='NCAAF' then
   ok:=big or (play and (grade='clear' or (grade='lean' and stake>300)));
  elsif c.kind='game' then
   ok:=(play and grade in ('clear','lean')) or (big and grade<>'unsupported');
  else
   ok:=play and (grade='clear' or stake>=300);
  end if;
  why:=case when ok then 'admitted' when grade='unsupported' then 'unsupported' when not play then 'gary_pass'
            when c.kind='game' and c.league='NCAAF' and grade='lean' then 'lean_under_300'
            when c.kind='prop' then 'prop_not_clear_under_300' else 'grade_'||grade end;
 end if;
 if not ok then
  insert into public.winners_decision_events(candidate_id,event,detail)
   values(p_id,'not_admitted',jsonb_build_object('why',why,'assessment',grade,'play',play,'big_game',big,'stake_dollars',stake,'spread',c.pick_snapshot->>'spread',
          'away_conference',c.pick_snapshot->>'awayConference','home_conference',c.pick_snapshot->>'homeConference'));
  return why;
 end if;
 stake:=case when play then stake else 100 end;
 insert into public.winners_board(candidate_id,game_date,league,kind,game_id,ticket_key,market_key,pick_snapshot,admitted_at,policy_version,reason)
  values(c.id,c.game_date,c.league,c.kind,c.game_id,c.ticket_key,c.market_key,c.pick_snapshot,clock_timestamp(),'winners-gate-v1',
   case when automatic_mlb then 'MLB game pick; automatic qualification'
        when c.league='NCAAF' and big then 'College main game; automatic qualification'
        when play then format('Gary plays it, $%s; reader: %s',trunc(stake),grade)
        else format('Big game; reader: %s',grade) end);
 update public.winners_candidates set admitted_at=clock_timestamp() where id=c.id;
 insert into public.winners_decision_events(candidate_id,event,detail)
  values(c.id,'admitted',jsonb_build_object('gate',case when automatic_mlb then 'mlb_game_automatic' when c.league='NCAAF' and big then 'big_game' when play then 'play_and_grade' else 'big_game' end,'assessment',grade,'stake_dollars',stake,'policy_version','winners-gate-v1'));
 return 'admitted';
end $function$;

-- Recover publication/queue gaps and later main-game designations. Automatic
-- games need no reader; ordinary game/prop thresholds remain unchanged.
CREATE OR REPLACE FUNCTION public.admit_winners_pending(p_date text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer:=0; r record;
begin
 for r in select c.id from public.winners_candidates c
   where c.game_date=p_date and c.admitted_at is null
     and c.commence_time>clock_timestamp()
     and (
       (c.kind='game' and (c.league='MLB' or (c.league='NCAAF' and exists(
         select 1 from public.winners_big_games g where g.game_date=c.game_date
         and g.league=c.league and g.game_id=c.game_id))))
       or (c.status='graded' and (
         (c.kind='game' and (c.league='NCAAF' or c.review->>'assessment'<>'unsupported') and exists(
           select 1 from public.winners_big_games g
           where g.game_date=c.game_date and g.league=c.league and g.game_id=c.game_id))
         or (coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false)
           and jsonb_typeof(c.pick_snapshot->'gary_bet'->'stake_dollars')='number'
           and case when c.kind='prop' then
             c.review->>'assessment'='clear' or (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>=300
           when c.league='NCAAF' then
             c.review->>'assessment'='clear' or (c.review->>'assessment'='lean' and (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric>300)
           else c.review->>'assessment' in ('clear','lean') end)
       ))
     )
 loop
  if gary_private.admit_winners_candidate(r.id)='admitted' then n:=n+1; end if;
 end loop;
 return n;
end $function$;

-- Both automatic game routes share the publication-time hook. Props do not.
DROP TRIGGER winners_mlb_game_on_insert ON public.winners_candidates;
DROP FUNCTION gary_private.admit_published_mlb_game();

CREATE FUNCTION gary_private.admit_published_automatic_game()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.league='MLB' or exists (
  select 1 from public.winners_big_games g where g.game_date=new.game_date
    and g.league=new.league and g.game_id=new.game_id
 ) then perform gary_private.admit_winners_candidate(new.id); end if;
 return new;
end $function$;

REVOKE ALL ON FUNCTION gary_private.admit_published_automatic_game() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gary_private.admit_published_automatic_game() TO service_role;

CREATE TRIGGER winners_automatic_game_on_insert
 AFTER INSERT ON public.winners_candidates
 FOR EACH ROW WHEN (new.kind='game' and new.league in ('MLB','NCAAF'))
 EXECUTE FUNCTION gary_private.admit_published_automatic_game();

select public.admit_winners_pending(to_char(clock_timestamp() at time zone 'America/New_York','YYYY-MM-DD'));
