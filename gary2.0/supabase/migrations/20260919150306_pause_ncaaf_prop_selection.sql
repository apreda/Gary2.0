-- Exclude the held sport before a model is claimed. Preserve historical plans,
-- existing admissions, all grading, and the exact live selection implementation.
do $hold$
declare source text; updated text;
begin
 source := pg_get_functiondef('public.winners_props_plan(text)'::regprocedure);
 updated := replace(source, 'and league in (''MLB'',''NFL'',''NCAAF'')',
  'and league in (''MLB'',''NFL'',''NCAAF'') and (p_date < ''2026-09-19'' or league <> ''NCAAF'')');
 if updated=source then raise exception 'Unrecognized Winners prop plan: hold not applied';end if;
 execute updated;
 source := pg_get_functiondef('public.claim_winners_props(text)'::regprocedure);
 updated := replace(source, 'c.league in (''MLB'',''NFL'',''NCAAF'')',
  'c.league in (''MLB'',''NFL'',''NCAAF'') and (p_date < ''2026-09-19'' or c.league <> ''NCAAF'')');
 if updated=source then raise exception 'Unrecognized Winners prop candidates: hold not applied';end if;
 source := updated;
 updated := replace(source, 's.league in (''MLB'',''NFL'',''NCAAF'')',
  's.league in (''MLB'',''NFL'',''NCAAF'') and (p_date < ''2026-09-19'' or s.league <> ''NCAAF'')');
 if updated=source then raise exception 'Unrecognized Winners prop peers: hold not applied';end if;
 execute updated;
end;
$hold$;
