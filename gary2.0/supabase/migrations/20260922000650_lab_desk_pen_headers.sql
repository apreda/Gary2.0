-- The pen headers lost their version tag and ISO timestamps (Sep 22): a team's
-- pen now reads "Detroit Tigers bullpen — observed through Sep 21, 3:12 PM ET."
-- and a reported pen "THE PEN, AS REPORTED — Detroit Tigers (status)". Keep the
-- older forms so desks stored before today still split.

create or replace function gary_private.lab_is_desk_header(p_line text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    p_line ~ '^#{1,4} \S'
    or p_line ~ '^═{2,}\s*[^═\s].*═{2,}\s*$'
    or (p_line ~ '^[A-Z][A-Z0-9 /&,:()\-]{8,}$' and position('/' in p_line) = 0)
    or p_line ~ '^[A-Z][A-Za-z .''-]+ bullpen — (bullpen-game-evidence-v[0-9]+;|observed through )'
    or p_line ~ '^THE PEN, AS REPORTED — ', false)
$$;

create or replace function gary_private.lab_desk_title(p_line text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := coalesce(p_line, ''); m text[];
begin
  m := regexp_match(t, '^([A-Z][A-Za-z .''-]+) bullpen — (bullpen-game-evidence-v[0-9]+;|observed through )');
  if m is not null then return m[1] || ' bullpen'; end if;
  m := regexp_match(t, '^THE PEN, AS REPORTED — ([^;(]+)');
  if m is not null then return btrim(m[1]) || ' bullpen, as reported'; end if;
  t := regexp_replace(t, '^#{1,4}\s*', '');
  t := regexp_replace(t, '^═+\s*', '');
  t := regexp_replace(t, '\s*═+\s*$', '');
  t := replace(t, chr(9888), '');
  t := replace(t, chr(65039), '');
  t := regexp_replace(t, '\s*[—–-]+\s*(AS WRITTEN|REPORTED OBSERVATIONS|FROM BDL)\s*$', '', 'i');
  t := regexp_replace(t, '\s*[—–-]+\s*(AS WRITTEN|REPORTED OBSERVATIONS|FROM BDL)\s*$', '', 'i');
  t := regexp_replace(t, ',\s*AS WRITTEN\s*$', '', 'i');
  t := regexp_replace(t, '\s*\([^)]*(BDL|AS WRITTEN|[0-9]{4})[^)]*\)', '', 'gi');
  t := regexp_replace(t, '\s+FROM BDL\y', '', 'gi');
  t := regexp_replace(t, '\s*[—–-]+\s*[a-z0-9]+(-[a-z0-9]+){2,}\s*$', '');
  t := regexp_replace(t, '\s*:\s*$', '');
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'), ' —–-');
  return gary_private.lab_title_case(t);
end $$;
