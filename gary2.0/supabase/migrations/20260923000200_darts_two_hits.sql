-- DARTS: 2+ hits, not 2+ hits and a run (founder, Sep 23 2026: "2 hits and a
-- run isn't a real bet"). The MLB category is the posted hits market, over
-- 1.5. Today's five darts of the old kind keep their players and their 2+ hits
-- price; the run leg goes, and their form is filled again on the new rule by
-- the darts job. A parlay leg reads "Mike Trout 2+ hits".
begin;

update public.darts
   set kind = 'multihit', prop = 'hits 1.5', odds_alt = null, form = null
 where kind = 'hits_run' and game_date >= date '2026-09-23';

create or replace function gary_private.parlay_leg_words(p_player text, p_bet text, p_prop text, p_kind text, p_matchup text) returns text
language sql immutable as $$
  select case p_kind
    when 'hr' then p_player || ' to homer'
    when 'multihit' then p_player || ' 2+ hits'
    when 'hits_run' then p_player || ' 2+ hits and a run'
    when 'first_inning' then coalesce(split_part(p_matchup, ' @ ', 2), p_matchup) || ' game: ' || case when lower(p_bet) = 'under' then 'no run in the 1st' else 'a run in the 1st' end
    when 'td' then p_player || ' anytime touchdown'
    when 'tetd' then p_player || ' anytime touchdown'
    when 'qbtd' then p_player || ' rushing touchdown'
    when 'ftd' then p_player || ' first touchdown'
    when 'int' then p_player || ' to throw an interception'
    else concat_ws(' ', p_player, lower(p_bet), substring(p_prop from '[0-9.]+$'),
           replace(regexp_replace(regexp_replace(coalesce(p_prop,''), '\s+[0-9.]+$', ''), '^(pitcher|batter|player)_', ''), '_', ' '))
  end
$$;

commit;
