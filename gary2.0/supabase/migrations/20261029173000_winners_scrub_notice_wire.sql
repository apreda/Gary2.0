-- THE SCRUB NOTICE ON HOME (founder, Oct 29 2026: "the disclaimer is up! we cant scrub until people understand").
-- The shipped app draws the bankroll notice only from its next build, so the notice also rides the Wire on Home,
-- first in the list, from today through the day after the scrub. Its own kind ('notice') and league ('WINNERS'):
-- the Wire run replaces rows by sport league, so it never touches these.
begin;

alter table public.wire_items drop constraint wire_items_kind_check;
alter table public.wire_items add constraint wire_items_kind_check
  check (kind = any (array['result','line_move','injury','voice','pace','moment','notice']));

insert into public.wire_items (date, league, kind, headline, relevance_score, meta, generated_by)
select d::date, 'WINNERS', 'notice',
  case when d < '2026-11-01'
    then 'Starting Nov 1, Oct 17 comes off Gary''s Winners record. A bug put all 20 of his college picks on Winners that day, so his bankroll will take a $1,000 charge in place of the $3,195 the day lost.'
    else 'As of Nov 1, Oct 17 is off Gary''s Winners record. A bug put all 20 of his college picks on Winners that day, so his bankroll took a $1,000 charge in place of the $3,195 the day lost.' end,
  100,
  jsonb_build_object('body', (select case when d < '2026-11-01' then notice else note end
                              from public.winners_scrubbed_days where game_date = '2026-10-17')),
  'founder'
from unnest(array['2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02']) d;

commit;
