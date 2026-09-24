-- A manual settlement carries its reason and cannot be overwritten by a
-- grader (founder, Sep 24 2026: "just void the Dart's rushing... with an
-- injury protection label"). The graders re-grade every final prop on every
-- pass so a corrected box score can repair a result; a row settled by hand
-- keeps its result and measurement until its note itself is changed.
alter table public.prop_results add column if not exists result_note text;

comment on column public.prop_results.result_note is
  'Manual settlement reason (e.g. an injury-protection void). A row with a note keeps its result; graders cannot overwrite it.';

create or replace function public.prop_results_keep_manual_settlement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.result_note is not null and new.result_note is not distinct from old.result_note then
    new.result := old.result;
    new.actual_value := old.actual_value;
  end if;
  return new;
end
$$;

drop trigger if exists prop_results_keep_manual_settlement on public.prop_results;
create trigger prop_results_keep_manual_settlement
  before update on public.prop_results
  for each row execute function public.prop_results_keep_manual_settlement();

-- Jaxson Dart, rushing yards over 33.5, Giants @ Rams (Sep 21 2026). Dart
-- left the game after five pass attempts and never carried the ball; the
-- ticket is voided under injury protection. Push is the record's settled
-- no-decision state.
insert into public.prop_results
  (prop_pick_id, game_date, player_name, prop_type, line_value, actual_value, result,
   odds, pick_text, matchup, bet, game_id, sport, lane, result_note)
select 'e07a9b8d-7eb3-4f5f-8b22-0ae92b638d6a', date '2026-09-21', 'Jaxson Dart', 'rushing_yards', 33.5, null, 'push',
       '-113', 'Jaxson Dart over 33.5 rushing_yards', 'New York Giants @ Los Angeles Rams', 'over', '1392247', 'NFL', 'CORE',
       'Void — injury protection: left the game after five pass attempts, no carries'
where not exists (
  select 1 from public.prop_results
  where game_date = date '2026-09-21' and player_name = 'Jaxson Dart' and prop_type = 'rushing_yards' and bet = 'over'
);
