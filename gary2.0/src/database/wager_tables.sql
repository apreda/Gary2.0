-- SQL to create tables for Gary's wagering system

-- Bankroll table - tracks Gary's bankroll over time
CREATE TABLE IF NOT EXISTS bankroll (
  id SERIAL PRIMARY KEY,
  starting_amount DECIMAL(10,2) NOT NULL DEFAULT 10000.00,
  current_amount DECIMAL(10,2) NOT NULL DEFAULT 10000.00,
  monthly_goal_percent INTEGER NOT NULL DEFAULT 30,
  start_date DATE NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wagers table - tracks individual wagers placed by Gary
CREATE TABLE IF NOT EXISTS wagers (
  id SERIAL PRIMARY KEY,
  pick_id TEXT REFERENCES daily_picks(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  odds VARCHAR(10),
  potential_payout DECIMAL(10,2) NOT NULL,
  placed_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  result_date TIMESTAMP WITH TIME ZONE,
  status VARCHAR(10) NOT NULL DEFAULT 'pending', -- pending, won, lost
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial bankroll with $10,000 starting balance
INSERT INTO bankroll (starting_amount, current_amount, monthly_goal_percent, start_date, last_updated)
VALUES (10000.00, 10000.00, 30, CURRENT_DATE, NOW())
ON CONFLICT DO NOTHING;

-- Create function to set wager amount for each pick
CREATE OR REPLACE FUNCTION calculate_wager_amount(confidence INTEGER, bankroll DECIMAL) 
RETURNS DECIMAL AS $$
DECLARE
    base_percentage DECIMAL;
    wager_amount DECIMAL;
BEGIN
    -- Base wager is 1-3% of bankroll depending on confidence
    IF confidence >= 70 THEN
        -- High confidence (70-100%) = 3% of bankroll
        base_percentage := 0.03;
    ELSIF confidence >= 55 THEN
        -- Medium confidence (55-69%) = 2% of bankroll
        base_percentage := 0.02;
    ELSE
        -- Lower confidence (below 55%) = 1% of bankroll
        base_percentage := 0.01;
    END IF;
    
    -- Calculate raw amount
    wager_amount := ROUND(bankroll * base_percentage);
    
    -- Round to nearest $5 for cleaner numbers
    wager_amount := ROUND(wager_amount / 5) * 5;
    
    -- Ensure minimum bet of $25
    RETURN GREATEST(wager_amount, 25);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically record wagers when new picks are created
CREATE OR REPLACE FUNCTION create_wagers_for_picks()
RETURNS TRIGGER AS $$
DECLARE
    current_bankroll DECIMAL;
    confidence_percent INTEGER;
    wager_amount DECIMAL;
    odds VARCHAR;
    potential_payout DECIMAL;
    pick_record RECORD;
BEGIN
    -- Get current bankroll
    SELECT current_amount INTO current_bankroll FROM bankroll ORDER BY id DESC LIMIT 1;
    
    -- If we have picks data, create wagers for each
    IF NEW.picks IS NOT NULL AND jsonb_array_length(NEW.picks) > 0 THEN
        FOR pick_record IN SELECT * FROM jsonb_array_elements(NEW.picks) AS pick
        LOOP
            -- Extract confidence percent based on confidence level
            CASE jsonb_extract_path_text(pick_record, 'confidenceLevel')
                WHEN 'Very High' THEN confidence_percent := 80;
                WHEN 'High' THEN confidence_percent := 70;
                WHEN 'Medium' THEN confidence_percent := 60;
                ELSE confidence_percent := 50;
            END CASE;
            
            -- Calculate wager amount
            wager_amount := calculate_wager_amount(confidence_percent, current_bankroll);
            
            -- Extract odds and calculate potential payout
            odds := jsonb_extract_path_text(pick_record, 'odds');
            
            -- Calculate potential payout based on odds
            IF odds LIKE '+%' THEN
                -- Positive odds
                potential_payout := wager_amount + (wager_amount * CAST(SUBSTRING(odds FROM 2) AS DECIMAL) / 100);
            ELSIF odds LIKE '-%' THEN
                -- Negative odds
                potential_payout := wager_amount + (wager_amount * 100 / ABS(CAST(SUBSTRING(odds FROM 2) AS DECIMAL)));
            ELSE
                -- Default if odds not available
                potential_payout := wager_amount * 2;
            END IF;
            
            -- Insert wager record
            INSERT INTO wagers (
                pick_id, 
                amount, 
                odds, 
                potential_payout, 
                placed_date, 
                status
            ) VALUES (
                jsonb_extract_path_text(pick_record, 'id'),
                wager_amount,
                odds,
                ROUND(potential_payout),
                NOW(),
                'pending'
            );
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run function when new picks are inserted
CREATE TRIGGER create_wagers_trigger
AFTER INSERT ON daily_picks
FOR EACH ROW
EXECUTE FUNCTION create_wagers_for_picks();
