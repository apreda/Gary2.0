-- A Winners play is the same ticket as its free-page twin: it reads once, as
-- the play. A dart thrown before ranks existed reads without a number.
create or replace function gary_private.parlay_candidates(p_date date)
returns table(key text, source text, league text, text text, odds integer, matchup text, game_id text, commence_time timestamptz, grade jsonb, signal text, ord integer)
language sql stable set search_path = '' as $$
  with legs as (
    select * from gary_private.parlay_legs(p_date) l where l.commence_time > now() + interval '25 minutes'
  ), picks as (
    select 'pick:' || c.id as key, 'pick' as source, c.league,
      regexp_replace(c.pick_text, '\s*[+-][0-9]{3,4}\s*$', '') as text, c.odds,
      coalesce(c.pick_snapshot->>'matchup', nullif(concat(c.pick_snapshot->>'awayTeam', ' @ ', c.pick_snapshot->>'homeTeam'), ' @ ')) as matchup,
      c.game_id, c.commence_time,
      jsonb_build_object('kind', 'game', 'candidate_id', c.id, 'pick_text', c.pick_text, 'snapshot', c.pick_snapshot) as grade
    from public.winners_candidates c
    where c.game_date = to_char(p_date, 'YYYY-MM-DD') and c.kind = 'game' and c.admitted_at is null
      and c.odds is not null and abs(c.odds) >= 100 and c.commence_time > now() + interval '25 minutes'
      and c.pick_text !~* '\m(PASS|NO BET)\M'
  ), everything as (
    select l.key, l.source, l.league, l.text, l.odds, l.matchup, l.game_id, l.commence_time, l.grade from legs l
    where not (l.source = 'prop' and exists (
      select 1 from legs w where w.source = 'winners' and w.game_id = l.game_id
        and lower(w.grade->'snapshot'->>'player') = lower(l.grade->'snapshot'->>'player')
        and lower(w.grade->'snapshot'->>'bet') = lower(l.grade->'snapshot'->>'bet')))
    union all
    select p.key, p.source, p.league, p.text, p.odds, p.matchup, p.game_id, p.commence_time, p.grade from picks p
  ), signals as (
    select e.*,
      (select c.id from public.winners_candidates c where c.id = (e.grade->>'candidate_id')::bigint) as cid,
      (select c.id from public.winners_candidates c
        where e.source = 'prop' and c.game_date = to_char(p_date, 'YYYY-MM-DD') and c.kind = 'prop' and c.game_id = e.game_id
          and lower(c.pick_snapshot->>'player') = lower(e.grade->'snapshot'->>'player') and lower(c.pick_snapshot->>'bet') = lower(e.grade->'snapshot'->>'bet')
        order by c.id desc limit 1) as prop_cid,
      (select d.rank from public.darts d where e.key ~ '^dart:[0-9]+$' and d.id = substring(e.key from 6)::bigint) as dart_rank,
      (select d.kind from public.darts d where e.key ~ '^dart:[0-9]+$' and d.id = substring(e.key from 6)::bigint) as dart_kind,
      (select split_part(d.reason, '. ', 1) from public.darts d where e.key ~ '^dart:[0-9]+$' and d.id = substring(e.key from 6)::bigint) as dart_line
    from everything e
  ), described as (
    select s.*,
      c.review->>'assessment' as reader,
      coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean, false) as play,
      (c.pick_snapshot->'gary_bet'->>'stake_dollars')::numeric as asked,
      round(b.stake_units * 100) as on_board_dollars
    from signals s
    left join public.winners_candidates c on c.id = coalesce(s.cid, s.prop_cid)
    left join public.winners_board b on b.candidate_id = c.id and s.source = 'winners'
  )
  select d.key, d.source, d.league, d.text, d.odds, d.matchup, d.game_id, d.commence_time, d.grade,
    case
      when d.source = 'winners' then format('Winners play, $%s%s', coalesce(d.on_board_dollars::text, '100'), case when d.reader is not null then ', the reader: ' || replace(d.reader, '_', ' ') else '' end)
      when d.source = 'dart' then format('Dart, %s%s%s', upper(replace(coalesce(d.dart_kind, ''), '_', ' ')), case when d.dart_rank is not null then ' #' || d.dart_rank else '' end, case when d.dart_line <> '' then ': ' || d.dart_line || '.' else '' end)
      else format('%s%s', case when d.play then format('Gary''s play, $%s asked', d.asked) else 'Gary''s pick, not a play' end,
                  case when d.reader is not null then ', the reader: ' || replace(d.reader, '_', ' ') else '' end)
    end as signal,
    (row_number() over (order by
      case when d.source = 'winners' then 0 when d.play and d.reader in ('clear','lean') then 1 when d.source = 'dart' then 2 when d.play then 3 else 4 end,
      coalesce(d.on_board_dollars, d.asked, 0) desc,
      case d.reader when 'clear' then 0 when 'lean' then 1 else 2 end,
      coalesce(d.dart_rank, 9), d.commence_time, d.key))::integer as ord
  from described d
  where d.reader is distinct from 'unsupported'
  order by ord
$$;
