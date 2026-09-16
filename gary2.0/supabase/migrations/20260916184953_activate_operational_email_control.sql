create function public.set_operational_email_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare was_enabled boolean;
begin
  select enabled into was_enabled from gary_ops.settings where singleton for update;
  if not found then raise exception 'Configure operational email first'; end if;
  update gary_ops.settings set enabled=p_enabled,
    enabled_at=case when p_enabled then coalesce(enabled_at,now()) else enabled_at end where singleton;
  if p_enabled and not was_enabled then
    insert into gary_ops.events(source,key,title,detail,kind)
      values('setup','email-connection','Gary failure email alerts are enabled',
        'Connection test. This first email may include retained failures from earlier today; those are existing incidents, not new failures. Checks use ordinary code and no AI.','test');
  end if;
end;
$$;
revoke all on function public.set_operational_email_enabled(boolean) from public,anon,authenticated;
grant execute on function public.set_operational_email_enabled(boolean) to service_role;
