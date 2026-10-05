-- What each pick rested on (founder, Oct 4 2026: "not just from a spread
-- standpoint but from a reasoning standpoint too ... the market led decisions
-- vs football led decision ... the actual reasoning might tell more").
-- One row per published game pick: the kind of reason that mainly carries it,
-- whether its write-up argues the number is wrong, and whether it depends on a
-- player being out. Tagged the same way for every pick by Jev (source 'jev'),
-- so Gary's record can be read by kind of reasoning, not only by ticket type.
create table if not exists public.gary_pick_reasons (
  candidate_id bigint primary key references public.winners_candidates(id) on delete cascade,
  rests_on text not null check (rests_on in ('matchup', 'availability', 'form', 'situation', 'number', 'unclear')),
  rests_on_confidence numeric,
  number_wrong numeric,          -- probability the write-up argues the line or price is wrong
  relies_on_absence numeric,     -- probability the case depends on a player being out or a backup starting
  source text not null default 'jev',
  model text,
  created_at timestamptz not null default now()
);
alter table public.gary_pick_reasons enable row level security;
revoke all on public.gary_pick_reasons from public, anon, authenticated;
grant all on public.gary_pick_reasons to service_role;
