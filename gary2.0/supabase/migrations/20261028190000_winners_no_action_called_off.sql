-- A called-off game settles as no action (founder OK, Oct 28 2026): the Oct 16 Rays game (15467425) was postponed and
-- replayed the next day as a new game, and its two Winners plays sat at risk for twelve days. The results grader marks
-- the Winners plays on a postponed or canceled game, once its day has passed, scratched with "no action: ...", which
-- the bankroll ledger settles as void. The guard admits that reason for game plays (props already could).
CREATE OR REPLACE FUNCTION public.guard_winners_publication()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_table_name = 'winners_board' then
    if tg_op = 'UPDATE'
       and old.kind = 'prop'
       and old.scratched_at is null and new.scratched_at is not null
       and (to_jsonb(new) - 'scratched_at' - 'scratch_reason') =
           (to_jsonb(old) - 'scratched_at' - 'scratch_reason') then
      return new;
    end if;
    -- A founder rule pulls a game play the gate let through, or Gary scratches it on late news (Oct 13 2026),
    -- or the game was called off and never played under its id: no action (Oct 28 2026).
    if tg_op = 'UPDATE'
       and old.kind = 'game'
       and old.scratched_at is null and new.scratched_at is not null
       and (new.scratch_reason like 'gate:%' or new.scratch_reason like 'Late news:%' or new.scratch_reason like 'no action:%')
       and (to_jsonb(new) - 'scratched_at' - 'scratch_reason') =
           (to_jsonb(old) - 'scratched_at' - 'scratch_reason') then
      return new;
    end if;
    -- Correct an old game scratch without changing the published ticket.
    if tg_op = 'UPDATE'
       and old.kind = 'game'
       and old.scratched_at is not null and new.scratched_at is null
       and new.scratch_reason is null
       and (to_jsonb(new) - 'scratched_at' - 'scratch_reason') =
           (to_jsonb(old) - 'scratched_at' - 'scratch_reason') then
      return new;
    end if;
    raise exception 'Published Winners tickets are immutable';
  end if;
  if old.admitted_at is not null then
    raise exception 'An admitted Winners candidate is immutable';
  end if;
  -- A delete has no NEW: returning it cancelled every delete silently, never-admitted candidates included.
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $function$;
