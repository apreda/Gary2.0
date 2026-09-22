-- Winners Lab follow-up (same day): Supabase's default privileges grant
-- EXECUTE to anon/authenticated/service_role on every new function in
-- public, so the first migration's "revoke ... from public" left anon able
-- to call the Lab RPCs. Drop anon everywhere, keep the two cron entry
-- points server-side, and tidy two title-case rules (a trailing verb was
-- lowercased; "NO" was treated as an abbreviation).

revoke all on function public.get_winners_play(bigint) from public, anon;
revoke all on function public.get_winners_desk_section(bigint, integer) from public, anon;
revoke all on function public.system_matches(jsonb, text) from public, anon;
revoke all on function public.upsert_system(uuid, text, jsonb, boolean) from public, anon;
revoke all on function public.delete_system(uuid) from public, anon;
revoke all on function public.my_systems() from public, anon;
revoke all on function public.enter_system_bets(uuid, text) from public, anon;
revoke all on function public.beat_gary(integer) from public, anon;
revoke all on function public.system_bets_for(uuid, text) from public, anon;
revoke all on function public.record_gary_talk() from public, anon;
revoke all on function public.enter_all_active_systems() from public, anon, authenticated;
revoke all on function public.settle_system_bets() from public, anon, authenticated;

create or replace function gary_private.lab_title_case(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  w text; core text; nw text; i integer := 0; out_words text[] := '{}';
  acr text[] := array['NFL','MLB','NCAAF','NBA','NHL','AFC','NFC','AL','NL','QB','QBS','RB','RBS','WR','WRS','TE','TES',
    'OL','DL','LB','LBS','DB','DBS','CB','CBS','SP','RP','DH','ERA','WHIP','OPS','OBP','SLG','AVG','RBI','RBIS','HR','HRS',
    'BB','IP','H2H','ATS','ML','MNF','SNF','TNF','TD','TDS','INT','INTS','IR','IL','PFF','EPA','DVOA','YPA','YPC',
    'USA','ESPN','MVP','ACC','SEC','CFP','AP','ET','EDT','EST','PM','AM','ID','BDL','API','MLBAM','FBS','FCS','OT','PAT',
    'FG','FGS','XP','LHP','RHP','LHB','RHB','L1','L3','L5','L10','L20','L30','II','III','IV','TBD','TBA','NY','LA','KC',
    'SF','GB','NE','TB','LV','JAX','DAL','PHI','CHI','DET','ATL','PIT','CLE','BAL','CIN','HOU',
    'SEA','ARI','MIA','IND','WAS','WSH','NYG','NYJ','LAR','LAC','BUF','TOR','BOS','TEX','SD','STL','MIL','COL','CWS'];
  small text[] := array['a','an','and','the','of','for','to','in','on','at','by','vs','or','from','with','as'];
begin
  foreach w in array regexp_split_to_array(coalesce(p, ''), '\s+') loop
    i := i + 1;
    core := regexp_replace(w, '[^A-Za-z0-9]', '', 'g');
    if core ~ '^[A-Z0-9]+$' and core ~ '[A-Z]' then
      if core = any(acr) then nw := w;
      elsif i > 1 and lower(core) = any(small) then nw := lower(w);
      else
        nw := initcap(lower(w));
        nw := regexp_replace(nw, '''S$', '''s');
        nw := replace(replace(replace(nw, '-To-', '-to-'), '-Of-', '-of-'), '-And-', '-and-');
      end if;
    else
      nw := w;
    end if;
    out_words := out_words || nw;
  end loop;
  return btrim(array_to_string(out_words, ' '));
end $$;
revoke all on function gary_private.lab_title_case(text) from public;
