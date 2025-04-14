-- Create views for Gary's picks analytics
CREATE OR REPLACE VIEW gary_daily_performance AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    sport_type,
    bet_type,
    COUNT(*) as total_picks,
    COUNT(*) FILTER (WHERE outcome = 'win') as wins,
    COUNT(*) FILTER (WHERE outcome = 'loss') as losses,
    ROUND(AVG(odds::numeric), 2) as avg_odds,
    SUM(CASE 
        WHEN outcome = 'win' THEN (odds::numeric * 100) - 100
        WHEN outcome = 'loss' THEN -100
        ELSE 0
    END) as profit_loss
FROM gary_picks
GROUP BY DATE_TRUNC('day', created_at), sport_type, bet_type;

-- View for sport-specific performance
CREATE OR REPLACE VIEW gary_sport_performance AS
SELECT 
    sport_type,
    bet_type,
    COUNT(*) as total_picks,
    COUNT(*) FILTER (WHERE outcome = 'win') as wins,
    COUNT(*) FILTER (WHERE outcome = 'loss') as losses,
    ROUND(COUNT(*) FILTER (WHERE outcome = 'win')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as win_rate,
    ROUND(AVG(odds::numeric), 2) as avg_odds,
    SUM(CASE 
        WHEN outcome = 'win' THEN (odds::numeric * 100) - 100
        WHEN outcome = 'loss' THEN -100
        ELSE 0
    END) as total_profit_loss
FROM gary_picks
GROUP BY sport_type, bet_type;

-- Function to get Gary's current streak
CREATE OR REPLACE FUNCTION get_gary_streak()
RETURNS TABLE (
    current_streak INTEGER,
    streak_type VARCHAR,
    last_pick_date TIMESTAMP,
    profit_during_streak NUMERIC
) 
LANGUAGE plpgsql
AS $$
DECLARE
    last_outcome VARCHAR;
    streak_count INTEGER := 0;
    profit NUMERIC := 0;
BEGIN
    -- Get the last outcome
    SELECT 
        outcome,
        created_at
    INTO last_outcome, last_pick_date
    FROM gary_picks
    ORDER BY created_at DESC
    LIMIT 1;

    -- Calculate streak and profit
    WITH RECURSIVE streak AS (
        SELECT 
            id,
            outcome,
            created_at,
            odds,
            1 as depth
        FROM gary_picks
        ORDER BY created_at DESC
        LIMIT 1

        UNION ALL

        SELECT 
            p.id,
            p.outcome,
            p.created_at,
            p.odds,
            s.depth + 1
        FROM gary_picks p
        INNER JOIN streak s ON p.outcome = s.outcome
        WHERE p.created_at < s.created_at
        ORDER BY p.created_at DESC
    )
    SELECT 
        COUNT(*),
        SUM(CASE 
            WHEN outcome = 'win' THEN (odds::numeric * 100) - 100
            WHEN outcome = 'loss' THEN -100
            ELSE 0
        END)
    INTO streak_count, profit
    FROM streak;

    RETURN QUERY
    SELECT 
        streak_count,
        last_outcome,
        last_pick_date,
        COALESCE(profit, 0);
END;
$$;

-- Function to get optimal betting patterns
CREATE OR REPLACE FUNCTION analyze_optimal_patterns()
RETURNS TABLE (
    sport_type TEXT,
    bet_type TEXT,
    time_of_day TEXT,
    win_rate NUMERIC,
    avg_odds NUMERIC,
    sample_size INTEGER
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gp.sport_type,
        gp.bet_type,
        CASE 
            WHEN EXTRACT(HOUR FROM gp.created_at) < 12 THEN 'Morning'
            WHEN EXTRACT(HOUR FROM gp.created_at) < 17 THEN 'Afternoon'
            ELSE 'Evening'
        END as time_of_day,
        ROUND(COUNT(*) FILTER (WHERE outcome = 'win')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as win_rate,
        ROUND(AVG(odds::numeric), 2) as avg_odds,
        COUNT(*) as sample_size
    FROM gary_picks gp
    GROUP BY 
        sport_type,
        bet_type,
        CASE 
            WHEN EXTRACT(HOUR FROM created_at) < 12 THEN 'Morning'
            WHEN EXTRACT(HOUR FROM created_at) < 17 THEN 'Afternoon'
            ELSE 'Evening'
        END
    HAVING COUNT(*) >= 10
    ORDER BY win_rate DESC;
END;
$$;
