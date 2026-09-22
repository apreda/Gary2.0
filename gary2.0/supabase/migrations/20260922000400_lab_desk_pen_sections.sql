-- The desk's bullpen region holds four sub-blocks under one "═══ BULLPEN ═══"
-- header (each team's observed pen, then each team's reported pen). The
-- section splitter attributed all of it to "Bullpen" (104K of a 128K desk).
-- Recognise the sub-block headers so every section's count is its own text.

create or replace function gary_private.lab_is_desk_header(p_line text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    p_line ~ '^#{1,4} \S'
    or p_line ~ '^═{2,}\s*[^═\s].*═{2,}\s*$'
    or (p_line ~ '^[A-Z][A-Z0-9 /&,:()\-]{8,}$' and position('/' in p_line) = 0)
    or p_line ~ '^[A-Z][A-Za-z .''-]+ bullpen — bullpen-game-evidence-v[0-9]+;'
    or p_line ~ '^THE PEN, AS REPORTED — ', false)
$$;

create or replace function gary_private.lab_desk_title(p_line text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := coalesce(p_line, ''); m text[];
begin
  m := regexp_match(t, '^([A-Z][A-Za-z .''-]+) bullpen — bullpen-game-evidence-v[0-9]+;');
  if m is not null then return m[1] || ' bullpen'; end if;
  m := regexp_match(t, '^THE PEN, AS REPORTED — ([^;]+);');
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
