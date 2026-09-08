const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value) {
  if (!UUID.test(value || '')) throw new Error('Use the complete report or profile UUID.');
  return `'${value}'::uuid`;
}

function text(value, maximum, label) {
  const trimmed = String(value || '').trim();
  if (!trimmed || Array.from(trimmed).length > maximum) {
    throw new Error(`${label} must contain 1–${maximum} characters.`);
  }
  // Hex encoding keeps operator text out of SQL syntax, including quotes,
  // backslashes and dollar quoting. The CLI never interpolates shell commands.
  return `convert_from(decode('${Buffer.from(trimmed).toString('hex')}','hex'),'UTF8')`;
}

export function profileSafetyReadQuery(command = 'status', reference) {
  if (command === 'status') return `
    select count(*) filter (where status='open')::integer as open_reports,
      min(created_at) filter (where status='open') as oldest_open_report,
      count(*) filter (where status='open' and created_at < now()-interval '24 hours')::integer as open_over_24_hours,
      (select max(created_at) from profile_safety_private.review_log) as last_review
    from profile_safety_private.reports;`;
  if (command === 'queue') return `
    select id, reason, created_at
    from profile_safety_private.reports where status='open'
    order by created_at,id limit 50;`;
  if (command === 'show') return `
    select r.id,r.subject_id,r.reason,r.details,r.profile_snapshot,r.created_at,r.status,
      jsonb_build_object('display_name',p.display_name,'handle',p.handle,'bio',p.bio) as current_identity,
      coalesce(m.hidden,false) as currently_hidden
    from profile_safety_private.reports r
    left join public.public_profiles p on p.user_id=r.subject_id
    left join profile_safety_private.moderation m on m.user_id=r.subject_id
    where r.id=${uuid(reference)};`;
  throw new Error('Read commands are status, queue, or show REPORT_UUID.');
}

export function profileSafetyDecisionQuery({ action, reference, reviewer, note }) {
  if (!['hide', 'dismiss', 'restore'].includes(action)) throw new Error('Decision must be hide, dismiss, or restore.');
  const target = uuid(reference);
  const by = text(reviewer, 80, 'Reviewer');
  const reason = text(note, 1000, 'Decision note');
  // The report itself selects the subject. The audited RPC rechecks the open
  // report while holding the existing per-profile lock before changing it.
  const subject = action === 'restore' ? target
    : `(select subject_id from profile_safety_private.reports where id=${target} and status='open')`;
  const report = action === 'restore' ? 'null::uuid' : target;
  return `begin;
    select public.review_profile_safety(${subject},'${action}',${reason},${by},${report}) as decision;
    commit;`;
}
