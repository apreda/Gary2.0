-- RLS on prompt_eras (Supabase advisor CRITICAL, Aug 3 2026): the Jul 29
-- migration created the era registry with no row security — anon could read
-- and WRITE it. Scripts use the service role (bypasses RLS); the app never
-- touches this table. RLS on + zero policies = service-only, the same
-- posture as pick_desks.
alter table public.prompt_eras enable row level security;
