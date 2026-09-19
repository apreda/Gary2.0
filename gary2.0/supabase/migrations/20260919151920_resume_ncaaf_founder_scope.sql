-- Adam authorized NCAAF resumption on September 19 at 11 AM.
drop trigger if exists ncaaf_publication_hold on public.daily_picks;
drop trigger if exists ncaaf_publication_hold on public.prop_picks;
drop trigger if exists ncaaf_publication_hold on public.winners_board;
drop function if exists public.enforce_ncaaf_publication_hold();
drop function if exists public.ncaaf_hold_ticket(jsonb);
do $resume$
declare source text;
begin
 source := pg_get_functiondef('public.winners_props_plan(text)'::regprocedure);
 execute replace(source, ' and (p_date < ''2026-09-19'' or league <> ''NCAAF'')', '');
 source := pg_get_functiondef('public.claim_winners_props(text)'::regprocedure);
 source := replace(source, ' and (p_date < ''2026-09-19'' or c.league <> ''NCAAF'')', '');
 execute replace(source, ' and (p_date < ''2026-09-19'' or s.league <> ''NCAAF'')', '');
end;
$resume$;
