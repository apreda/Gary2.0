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

-- Create the record variant that's specifically mentioned in the error
CREATE OR REPLACE FUNCTION jsonb_extract_path_text(data record, path unknown)
RETURNS text AS $$
BEGIN
  -- Cast record to jsonb
  RETURN jsonb_extract_path_text(to_jsonb(data), path::text);
END;
$$ LANGUAGE plpgsql;

-- Print success message
SELECT 'JSON functions created successfully. This should resolve the function missing error.' AS message;
