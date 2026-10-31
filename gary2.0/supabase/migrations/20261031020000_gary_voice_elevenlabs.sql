-- Gary's voice moves to ElevenLabs (founder, Oct 31 2026, on Cartesia and the open-source takes: "none of these
-- are even close to what elevenlabs voices can do"). Eleven v4 Turbo speaks for him; his voice is "Gary B",
-- designed with ElevenLabs Voice Design from his look and cloned into the production account. Cartesia stays
-- switchable with tts_provider.
alter table public.gary_voice_config
  add column if not exists tts_provider text not null default 'cartesia' check (tts_provider in ('cartesia', 'elevenlabs')),
  add column if not exists eleven_voice_id text,
  add column if not exists eleven_model text not null default 'eleven_v4_turbo';

update public.gary_voice_config
   set tts_provider = 'elevenlabs', eleven_voice_id = 'VQizeSzkof9XgzkbkdLI', updated_at = now()
 where id = 1;

create or replace function gary_private.gary_voice_admit(p_who text, p_signed_in boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.gary_voice_config;
  v_day date := (now() at time zone 'America/New_York')::date;
  v_spent numeric;
  v_used int;
  v_limit int;
  v_voice jsonb;
begin
  select * into c from public.gary_voice_config where id = 1;
  if c is null or not c.enabled then return jsonb_build_object('ok', false, 'reason', 'off'); end if;
  v_voice := jsonb_build_object('tts_provider', c.tts_provider, 'voice_id', c.voice_id, 'tts_model', c.tts_model,
    'eleven_voice_id', c.eleven_voice_id, 'eleven_model', c.eleven_model, 'speed', c.speed);
  select coalesce(sum(u.cost_usd), 0) into v_spent from public.gary_voice_usage u where u.day = v_day;
  -- Even a refusal is said in his voice, so it carries the voice too.
  if v_spent >= c.daily_budget_usd then return v_voice || jsonb_build_object('ok', false, 'reason', 'budget'); end if;
  v_limit := case when p_signed_in then c.user_daily_limit else c.anon_daily_limit end;
  insert into public.gary_voice_usage as u (day, who, questions) values (v_day, p_who, 1)
    on conflict (day, who) do update set questions = u.questions + 1
    where u.questions < v_limit
    returning u.questions into v_used;
  if v_used is null then return v_voice || jsonb_build_object('ok', false, 'reason', 'limit'); end if;
  return v_voice || jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit);
end $$;
revoke all on function gary_private.gary_voice_admit(text, boolean) from public, anon, authenticated;
grant execute on function gary_private.gary_voice_admit(text, boolean) to service_role;
