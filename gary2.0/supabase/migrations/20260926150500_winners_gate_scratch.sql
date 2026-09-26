-- GATE SCRATCH (founder, Sep 26 2026): a game play the gate should never have admitted
-- (a spread beyond 21.5, a team outside the power conferences) can be pulled. The ticket
-- itself stays immutable; only scratched_at and a scratch_reason beginning 'gate:' change.
-- Inactives still scratch props only. Pulled the same morning: Sam Houston +34.5, Bucknell +54.5,
-- Colorado State +13.5, Toledo ML (candidates 463901, 463906, 463897, 463909).
create or replace function public.guard_winners_publication() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'winners_board' then
    if tg_op = 'UPDATE'
       and old.kind = 'prop'
       and old.scratched_at is null and new.scratched_at is not null
       and (to_jsonb(new) - 'scratched_at' - 'scratch_reason') =
           (to_jsonb(old) - 'scratched_at' - 'scratch_reason') then
      return new;
    end if;
    -- A founder rule pulls a game play the gate let through.
    if tg_op = 'UPDATE'
       and old.kind = 'game'
       and old.scratched_at is null and new.scratched_at is not null
       and new.scratch_reason like 'gate:%'
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
  return new;
end; $$;
