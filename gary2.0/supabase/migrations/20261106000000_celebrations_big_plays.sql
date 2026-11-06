-- Celebrations follow big plays now, not prices (founder, Nov 6 2026): a fumble recovery or a defensive
-- touchdown can have no bet behind it, so those rows carry no price. They use their own status because every
-- app before build 1014 reads status = 'ready' and requires a price: one row without it would empty their list.
alter table public.celebrations alter column price drop not null;
alter table public.celebrations alter column hit_key drop not null;

drop policy if exists celebrations_read on public.celebrations;
create policy celebrations_read on public.celebrations for select to anon, authenticated using (status in ('ready', 'ready_nobet'));
