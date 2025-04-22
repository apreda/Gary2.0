-- Update picks column in daily_picks table
DO $$ 
DECLARE
    picks_json jsonb;
    pick_record record;
BEGIN
    -- First, let's create a backup of the current data
    CREATE TABLE IF NOT EXISTS daily_picks_backup_20250422 AS 
    SELECT * FROM daily_picks;

    -- For each row in daily_picks
    FOR pick_record IN SELECT * FROM daily_picks LOOP
        -- Parse the JSON array
        picks_json := pick_record.picks::jsonb;
        
        -- For each pick in the array, update its structure
        picks_json := (
            SELECT jsonb_agg(
                pick || jsonb_build_object(
                    -- Ensure all odds fields exist
                    'odds', COALESCE(
                        CASE
                            WHEN pick->>'betType' = 'Moneyline' THEN pick->>'moneyline'
                            WHEN pick->>'betType' LIKE '%spread%' THEN pick->>'spreadOdds'
                            WHEN pick->>'betType' LIKE '%total%' THEN pick->>'totalOdds'
                            ELSE pick->>'odds'
                        END,
                        '-110'
                    ),
                    -- Update shortPick to show team abbreviation and odds
                    'shortPick', (
                        CASE 
                            WHEN pick->>'betType' = 'Moneyline' THEN 
                                -- Extract team from shortPick and format as "TEAM ML ODDS"
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(pick->>'shortPick', 'Bet on the (.*) to win.', '\1'),
                                    '(.+)',
                                    SUBSTRING(UPPER(REGEXP_REPLACE('\1', ' .*$', '')), 1, 3) || ' ML ' || COALESCE(pick->>'moneyline', '-110')
                                )
                            WHEN pick->>'betType' LIKE '%spread%' THEN
                                -- Format as "TEAM SPREAD ODDS"
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(pick->>'shortPick', 'Bet on the (.*) to win.', '\1'),
                                    '(.+)',
                                    SUBSTRING(UPPER(REGEXP_REPLACE('\1', ' .*$', '')), 1, 3) || ' ' || 
                                    COALESCE(pick->>'spread', '+0.0') || ' ' || 
                                    COALESCE(pick->>'spreadOdds', pick->>'odds', '-110')
                                )
                            WHEN pick->>'betType' LIKE '%over%' THEN 
                                'O ' || COALESCE(pick->>'overUnder', '0.0') || ' ' || COALESCE(pick->>'totalOdds', pick->>'odds', '-110')
                            WHEN pick->>'betType' LIKE '%under%' THEN 
                                'U ' || COALESCE(pick->>'overUnder', '0.0') || ' ' || COALESCE(pick->>'totalOdds', pick->>'odds', '-110')
                            ELSE pick->>'shortPick'
                        END
                    )
                ) - 'isPremium' - 'primeTimeCard'  -- Remove unused fields
            )
            FROM jsonb_array_elements(picks_json) pick
        );
        
        -- Update the row with the new picks structure
        UPDATE daily_picks 
        SET picks = picks_json::text 
        WHERE id = pick_record.id;
    END LOOP;
END $$;
