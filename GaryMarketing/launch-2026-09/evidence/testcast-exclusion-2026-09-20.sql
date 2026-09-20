-- Applied September 20, 2026. One-time data repair, not a schema migration.
begin;
do $$
begin
 if (select count(*) from public.public_profiles p join auth.users u on u.id=p.user_id
     where p.user_id between '00000000-0000-4000-a000-000000000001'::uuid and '00000000-0000-4000-a000-000000000009'::uuid
       and u.email like '%@testcast.betwithgary.ai' and u.raw_user_meta_data->>'test_cast'='true') <> 9 then
   raise exception 'Expected exactly the nine documented test-cast profiles; no changes made';
 end if;
end $$;
update public.public_profiles set leaderboard_visible=false
where user_id between '00000000-0000-4000-a000-000000000001'::uuid and '00000000-0000-4000-a000-000000000009'::uuid;
insert into user_experience_private.excluded_profiles(user_id,reason)
select user_id,'legacy demonstration cast; launch review 2026-09-20'
from public.public_profiles
where user_id between '00000000-0000-4000-a000-000000000001'::uuid and '00000000-0000-4000-a000-000000000009'::uuid
on conflict (user_id) do nothing;
commit;
