-- THE FIRST PICK OF THE DAY ANSWERS ITS OWN BOOK (Oct 13 2026, audit; founder: "Do whatever is best you can make the
-- decisions"). Under the cut, the day's first pick took slot 1 with no call and the card needed two picks before
-- anything seated, so a pick whose window closed before the second placement (Sunday's London game: a $250 Jaguars
-- bet on Oct 11) could never reach Winners. garyCard.js now asks the first pick whether it is in his book, and a
-- card of one seats. The weekly report counts a pick as a board play only while a live board row exists (six Oct 4
-- founder removals kept admitted_at and read as board plays).

create or replace function public.seat_the_card(p_date text)
returns integer language plpgsql set search_path='' as $$
declare book bigint[]; n_card integer; r record; n integer := 0; why text;
begin
  if p_date is null or p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  select count(*) into n_card from public.winners_card_placements p where p.game_date = p_date;
  if n_card < 1 then return 0; end if;   -- Oct 13 2026: the first pick answers its own book, so one pick is a card
  book := gary_private.card_book(p_date);
  for r in
    select c.id, c.admitted_at, c.commence_time, o.rank, o.of
    from gary_private.card_order(p_date) o join public.winners_candidates c on c.id = o.candidate_id
    where not exists (select 1 from public.winners_big_games g where g.game_date = p_date and g.league = c.league and g.game_id = c.game_id)
    order by o.rank
  loop
    if r.admitted_at is not null then continue; end if;
    if exists (select 1 from public.winners_decision_events e where e.candidate_id = r.id and e.event = 'card_seated') then
      why := gary_private.admit_winners_candidate(r.id);   -- a seated pass whose number arrived
      if why = 'admitted' then n := n + 1; end if;
      continue;
    end if;
    if not (r.id = any(book)) then continue; end if;
    if r.commence_time is null or r.commence_time <= clock_timestamp() + interval '20 minutes'
       or r.commence_time > clock_timestamp() + interval '75 minutes' then continue; end if;
    insert into public.winners_decision_events(candidate_id, event, detail)
    values (r.id, 'card_seated', jsonb_build_object('rank', r.rank, 'of', r.of, 'book', coalesce(array_length(book,1),0), 'card', n_card));
    why := gary_private.admit_winners_candidate(r.id);
    if why = 'admitted' then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.seat_the_card(text) from public, anon, authenticated;
grant execute on function public.seat_the_card(text) to service_role;

create or replace function public.winners_judge_report(p_from text, p_to text)
returns table(bucket text, league text, w bigint, l bigint, p bigint)
language sql stable set search_path='' as $$
 with picks as (
  select c.id, c.league, c.game_id,
    -- on the board means a live board row: a founder removal that left admitted_at set is not a board play
    (case when exists (select 1 from public.winners_board b where b.candidate_id = c.id and b.scratched_at is null) then c.admitted_at end) as admitted_at,
    c.review->>'assessment' as grade,
    coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false) as play,
    (select o.rank from gary_private.card_order(c.game_date) o where o.candidate_id = c.id) as slot,
    (c.id = any(gary_private.card_book(c.game_date))) as in_book
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
  union all select '6 card '||case when slot is null then 'not placed' when slot=1 then '#1' when slot<=3 then '#2-3' when slot<=5 then '#4-5' else '#6+' end, 'ALL', result from j
  union all select '6 card '||case when slot is null then 'not placed' when slot=1 then '#1' when slot<=3 then '#2-3' when slot<=5 then '#4-5' else '#6+' end, league, result from j
  union all select '7 his book: '||case when slot is null then 'not placed' when in_book then 'in' else 'out' end, 'ALL', result from j
  union all select '7 his book: '||case when slot is null then 'not placed' when in_book then 'in' else 'out' end, league, result from j
 )
 select b, lg, count(*) filter(where result='won'), count(*) filter(where result='lost'), count(*) filter(where result='push')
 from rows_ group by b, lg order by b, lg;
$$;
revoke all on function public.winners_judge_report(text,text) from public,anon,authenticated;
grant execute on function public.winners_judge_report(text,text) to service_role;
