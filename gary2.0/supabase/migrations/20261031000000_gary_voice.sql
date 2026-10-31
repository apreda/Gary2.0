-- Talking Gary (founder, Oct 30 2026: "give the Gary on the home page of the App a real voice people can ask
-- questions to"). The gary-voice edge function answers out loud from Gary's own picks, reasons and results.
-- Service role only: the app never reads these tables; the function admits each question, records its cost
-- and keeps a log of what was asked and what Gary said.

-- One row of switches the function reads on every question, so the voice, the speed and the caps change
-- without an app build.
create table if not exists public.gary_voice_config (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  voice_id text,
  tts_model text not null default 'sonic-3.6',
  speed numeric not null default 1.0 check (speed between 0.6 and 1.5),
  -- Dollars of Claude + Cartesia spend allowed per ET day across everyone; past it Gary is done for the night.
  daily_budget_usd numeric not null default 4 check (daily_budget_usd >= 0),
  user_daily_limit int not null default 30 check (user_daily_limit >= 0),
  anon_daily_limit int not null default 8 check (anon_daily_limit >= 0),
  updated_at timestamptz not null default now()
);
insert into public.gary_voice_config (id) values (1) on conflict (id) do nothing;

-- Questions and dollars per person per ET day. `who` is the account id, or 'install:<uuid>' signed out.
create table if not exists public.gary_voice_usage (
  day date not null,
  who text not null,
  questions int not null default 0,
  cost_usd numeric not null default 0,
  primary key (day, who)
);

create table if not exists public.gary_voice_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  who text not null,
  question text not null,
  answer text,
  tools text[],
  input_tokens int,
  cache_read_tokens int,
  cache_write_tokens int,
  output_tokens int,
  tts_chars int,
  cost_usd numeric,
  first_audio_ms int,
  total_ms int,
  error text
);
create index if not exists gary_voice_log_at_idx on public.gary_voice_log (at desc);

alter table public.gary_voice_config enable row level security;
alter table public.gary_voice_usage enable row level security;
alter table public.gary_voice_log enable row level security;
revoke all on public.gary_voice_config, public.gary_voice_usage, public.gary_voice_log from anon, authenticated;

-- Let a question in, or say why not: off, the night's budget spent, or this person's questions used up.
-- Counts the question when it is let in.
create or replace function gary_private.gary_voice_admit(p_who text, p_signed_in boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.gary_voice_config;
  v_day date := (now() at time zone 'America/New_York')::date;
  v_spent numeric;
  v_used int;
  v_limit int;
begin
  select * into c from public.gary_voice_config where id = 1;
  if c is null or not c.enabled then return jsonb_build_object('ok', false, 'reason', 'off'); end if;
  select coalesce(sum(u.cost_usd), 0) into v_spent from public.gary_voice_usage u where u.day = v_day;
  if v_spent >= c.daily_budget_usd then return jsonb_build_object('ok', false, 'reason', 'budget'); end if;
  v_limit := case when p_signed_in then c.user_daily_limit else c.anon_daily_limit end;
  insert into public.gary_voice_usage as u (day, who, questions) values (v_day, p_who, 1)
    on conflict (day, who) do update set questions = u.questions + 1
    where u.questions < v_limit
    returning u.questions into v_used;
  if v_used is null then return jsonb_build_object('ok', false, 'reason', 'limit'); end if;
  return jsonb_build_object('ok', true, 'voice_id', c.voice_id, 'tts_model', c.tts_model, 'speed', c.speed,
    'used', v_used, 'limit', v_limit);
end $$;

-- Add what a question cost once it is answered.
create or replace function gary_private.gary_voice_spend(p_who text, p_cost numeric)
returns void language sql volatile security definer set search_path = '' as $$
  update public.gary_voice_usage
     set cost_usd = cost_usd + greatest(coalesce(p_cost, 0), 0)
   where day = (now() at time zone 'America/New_York')::date and who = p_who;
$$;

revoke all on function gary_private.gary_voice_admit(text, boolean) from public, anon, authenticated;
revoke all on function gary_private.gary_voice_spend(text, numeric) from public, anon, authenticated;
grant execute on function gary_private.gary_voice_admit(text, boolean) to service_role;
grant execute on function gary_private.gary_voice_spend(text, numeric) to service_role;

-- PostgREST reaches gary_private only through these public wrappers, still service role only.
create or replace function public.gary_voice_admit(p_who text, p_signed_in boolean)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select gary_private.gary_voice_admit(p_who, p_signed_in);
$$;
create or replace function public.gary_voice_spend(p_who text, p_cost numeric)
returns void language sql volatile security definer set search_path = '' as $$
  select gary_private.gary_voice_spend(p_who, p_cost);
$$;
revoke all on function public.gary_voice_admit(text, boolean) from public, anon, authenticated;
revoke all on function public.gary_voice_spend(text, numeric) from public, anon, authenticated;
grant execute on function public.gary_voice_admit(text, boolean) to service_role;
grant execute on function public.gary_voice_spend(text, numeric) to service_role;
