-- NBA player streaks for the Darts page (Oct 19 2026): 20-point games in a row (pts20) and double-doubles in a row
-- (dd), written nightly by nbaStreaksService.js beside the MLB and NFL kinds.
alter table public.streaks drop constraint if exists streaks_kind_check;
alter table public.streaks add constraint streaks_kind_check check (kind = any (array[
  'win', 'loss', 'hit', 'hitless', 'hr', 'over', 'under', 'cover', 'nocover', 'td', 'rush100', 'rec100', 'pts20', 'dd']));
