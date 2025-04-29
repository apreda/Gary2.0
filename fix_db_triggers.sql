-- 1. List all triggers on daily_picks table
SELECT tgname, pg_get_triggerdef(oid) 
FROM pg_trigger 
WHERE tgrelid = 'daily_picks'::regclass;

-- 2. Check for functions referencing bankroll
SELECT proname, prosrc
FROM pg_proc
WHERE prosrc LIKE '%bankroll%';

-- 3. Drop bankroll-related triggers (run after examining results from above)
-- RISK WARNING: Please run the above queries first and verify what triggers exist
-- Then uncomment the relevant lines below

-- DROP TRIGGER IF EXISTS update_bankroll_on_picks_insert ON daily_picks;
-- DROP TRIGGER IF EXISTS after_daily_picks_insert ON daily_picks;
-- DROP TRIGGER IF EXISTS before_daily_picks_insert ON daily_picks;

-- 4. Alternative: Disable trigger instead of dropping it
-- ALTER TABLE daily_picks DISABLE TRIGGER update_bankroll_on_picks_insert;
-- ALTER TABLE daily_picks DISABLE TRIGGER after_daily_picks_insert;
-- ALTER TABLE daily_picks DISABLE TRIGGER before_daily_picks_insert;
