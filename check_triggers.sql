-- Check for triggers or functions referencing bankroll table
SELECT tgname, tgrelid::regclass, tgtype, tgenabled
FROM pg_trigger
WHERE tgrelid = 'daily_picks'::regclass::oid;

-- Check for functions referencing bankroll table
SELECT p.proname AS function_name, 
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
WHERE pg_get_functiondef(p.oid) ILIKE '%bankroll%';
