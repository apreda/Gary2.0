-- Check for any triggers that might be automatically creating wagers
SELECT 
  t.tgname AS trigger_name, 
  c.relname AS table_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname IN ('daily_picks', 'wagers');
