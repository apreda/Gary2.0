-- Every touchdown-scorer result graded before Sep 24 2026 came from the TD
-- lane (the retired "pick two touchdowns" ask and last season's first-TD /
-- anytime-TD scorer cards), never from Gary's regular props. Founder, Sep 24
-- 2026: only a touchdown Gary picks as a prop on the Picks page counts, not a
-- touchdown lane and not Darts. Stamping these TD lets the app and the site
-- keep all of them (NFL, college and the unstamped 2025-26 rows) out of every
-- props record. Regular TD props are stamped CORE by the grader from Sep 24.
update public.prop_results
set lane = 'TD'
where lane is null
  and game_date < '2026-09-24'
  and (prop_type ~* 'anytime.?(td|touchdown)' or prop_type ~* 'first.?(td|touchdown)' or prop_type ~* '^(td|touchdown).?scorer$');
