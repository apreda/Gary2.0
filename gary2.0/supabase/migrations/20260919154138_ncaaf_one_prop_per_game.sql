-- One college prop per game, including concurrent retries. Other sports retain exact-ticket deduplication.
do $change$
declare source text;
begin
 source := pg_get_functiondef('public.upsert_prop_picks_atomic(text,text,jsonb,jsonb)'::regprocedure);
 source := replace(source,
 'and v_existing_player = v_new_player
        and v_existing_prop = v_new_prop
        and v_existing_bet = v_new_bet
        and v_existing_line = v_new_line
        and v_existing_td_category = v_new_td_category;',
 'and ((v_new_sport = ''NCAAF'' and p_date >= ''2026-09-19'')
          or (v_existing_player = v_new_player
        and v_existing_prop = v_new_prop
        and v_existing_bet = v_new_bet
        and v_existing_line = v_new_line
        and v_existing_td_category = v_new_td_category));');
 execute source;
end;
$change$;
