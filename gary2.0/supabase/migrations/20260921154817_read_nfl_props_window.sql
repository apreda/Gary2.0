-- Return only one selected NFL week; the caller retains the table's existing RLS.
create or replace function public.read_nfl_props_window(p_start date, p_end date)
returns table (date text, picks jsonb)
language plpgsql stable security invoker
set search_path = ''
as $$
begin
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 6 then
    raise exception 'Choose a window of one to seven calendar days' using errcode = '22023';
  end if;
  return query
    select pp.date, jsonb_agg(p.value order by p.ordinality)
    from public.prop_picks pp
    cross join lateral jsonb_array_elements(pp.picks) with ordinality p(value, ordinality)
    where pp.date >= p_start::text and pp.date <= p_end::text
      and upper(coalesce(nullif(p.value->>'league', ''), p.value->>'sport')) = 'NFL'
    group by pp.date
    order by pp.date;
end;
$$;
revoke all on function public.read_nfl_props_window(date, date) from public;
grant execute on function public.read_nfl_props_window(date, date) to anon, authenticated, service_role;
