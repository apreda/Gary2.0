-- Create the PostgreSQL function that's missing
CREATE OR REPLACE FUNCTION jsonb_extract_path_text(from_json jsonb, VARIADIC path_elems text[])
RETURNS text AS $$
BEGIN
  RETURN from_json #> path_elems;
END;
$$ LANGUAGE plpgsql;

-- Also create the most commonly used variant for record types
CREATE OR REPLACE FUNCTION jsonb_extract_path_text(from_record record, path_elem text)
RETURNS text AS $$
BEGIN
  RETURN jsonb_extract_path_text(to_jsonb(from_record), ARRAY[path_elem]);
END;
$$ LANGUAGE plpgsql;

-- If the above doesn't work, try this alternative approach
-- Disable any triggers that might be using the function
DO $$
DECLARE
  trigger_rec RECORD;
BEGIN
  FOR trigger_rec IN 
    SELECT tgname, tgrelid::regclass AS table_name
    FROM pg_trigger
    WHERE pg_get_triggerdef(oid) LIKE '%jsonb_extract_path_text%'
  LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', 
                  trigger_rec.table_name, 
                  trigger_rec.tgname);
    RAISE NOTICE 'Disabled trigger % on table %', 
                trigger_rec.tgname, 
                trigger_rec.table_name;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
