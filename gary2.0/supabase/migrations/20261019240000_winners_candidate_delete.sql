-- A never-admitted Winners candidate can be deleted (Oct 19 2026). guard_winners_publication returned NEW on a DELETE,
-- which is null, so Postgres skipped every delete of a candidate without a word: a test run's two stray NFL prop
-- candidates (464451, 464452, never admitted) could not be removed and would have been claimable Thursday. Admitted
-- candidates and published tickets stay immutable exactly as before.
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
    -- A founder rule pulls a game play the gate let through, or Gary scratches it on late news (Oct 13 2026).
    if tg_op = 'UPDATE'
       and old.kind = 'game'
       and old.scratched_at is null and new.scratched_at is not null
       and (new.scratch_reason like 'gate:%' or new.scratch_reason like 'Late news:%')
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

delete from public.winners_candidates
where id in (464451, 464452) and admitted_at is null and game_date = '2026-10-22' and kind = 'prop';
