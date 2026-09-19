create table public.subscription_model_jobs (
 id uuid primary key default gen_random_uuid(), lane text not null,
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 request jsonb not null, response jsonb, error text,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '130 seconds',
 started_at timestamptz, completed_at timestamptz, route text
);
alter table public.subscription_model_jobs enable row level security;
revoke all on public.subscription_model_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.subscription_model_jobs to service_role;
create index subscription_model_jobs_pending on public.subscription_model_jobs(created_at) where status='queued';
create function public.claim_subscription_model_job() returns setof public.subscription_model_jobs
language sql set search_path='' as $$
 update public.subscription_model_jobs set status='running',started_at=now()
 where id=(select id from public.subscription_model_jobs where status='queued' and expires_at>now() order by created_at for update skip locked limit 1)
 returning *;
$$;
revoke all on function public.claim_subscription_model_job() from public,anon,authenticated;
grant execute on function public.claim_subscription_model_job() to service_role;
