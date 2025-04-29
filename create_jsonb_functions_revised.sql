-- Create the missing PostgreSQL JSON functions needed for picks processing

-- Create jsonb_extract_path_text function if it doesn't exist
CREATE OR REPLACE FUNCTION jsonb_extract_path_text(data jsonb, VARIADIC path text[])
RETURNS text AS $$
DECLARE
  result jsonb := data;
BEGIN
  FOR i IN 1..array_length(path, 1) LOOP
    result := result->path[i];
    IF result IS NULL THEN
      RETURN NULL;
    END IF;
  END LOOP;
  
  -- Convert the jsonb value to text
  RETURN result::text;
END;
$$ LANGUAGE plpgsql;

-- Create another common variant that might be used in triggers
CREATE OR REPLACE FUNCTION jsonb_extract_path_text(data jsonb, path text)
RETURNS text AS $$
BEGIN
  RETURN jsonb_extract_path_text(data, ARRAY[path]);
END;
$$ LANGUAGE plpgsql;

-- Another practical approach is to find and disable the trigger that's using the function
-- Let's create a function to identify these triggers
CREATE OR REPLACE FUNCTION find_triggers_using_jsonb_extract_path_text()
RETURNS TABLE(trigger_name text, table_name text, trigger_definition text) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.tgname::text as trigger_name,
    relname::text as table_name,
    pg_get_triggerdef(t.oid)::text as trigger_definition
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE pg_get_triggerdef(t.oid) LIKE '%jsonb_extract_path_text%';
END;
$$ LANGUAGE plpgsql;

-- Print success message
SELECT 'Run SELECT * FROM find_triggers_using_jsonb_extract_path_text() to identify problematic triggers' AS message;
