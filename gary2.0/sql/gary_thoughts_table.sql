-- Gary Thoughts Table
-- Stores Gary's picks for all games (spread, moneyline, over/under)
-- This is different from daily_picks which only stores Gary's top selective picks

CREATE TABLE IF NOT EXISTS gary_thoughts (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    thoughts JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gary_thoughts_date ON gary_thoughts(date);
CREATE INDEX IF NOT EXISTS idx_gary_thoughts_created_at ON gary_thoughts(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE gary_thoughts ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anyone can view Gary's thoughts)
CREATE POLICY "Allow public read access to gary_thoughts" 
ON gary_thoughts FOR SELECT 
USING (true);

-- Allow insert/update for authenticated users (for the app to store data)
CREATE POLICY "Allow authenticated insert/update to gary_thoughts" 
ON gary_thoughts FOR ALL 
USING (auth.role() = 'authenticated');

-- Add comments for documentation
COMMENT ON TABLE gary_thoughts IS 'Stores Gary''s picks for all games of the day including spread, moneyline, and over/under picks';
COMMENT ON COLUMN gary_thoughts.date IS 'Date of the games (YYYY-MM-DD format)';
COMMENT ON COLUMN gary_thoughts.thoughts IS 'JSON array containing all games with Gary''s picks for each bet type';
COMMENT ON COLUMN gary_thoughts.created_at IS 'Timestamp when the record was first created';
COMMENT ON COLUMN gary_thoughts.updated_at IS 'Timestamp when the record was last updated';

-- Example of the thoughts JSONB structure:
/*
{
  "games": [
    {
      "id": "game_id",
      "homeTeam": "Team Name",
      "awayTeam": "Team Name", 
      "league": "MLB|NBA|NHL",
      "time": "7:30 PM EST",
      "odds": {
        "spread": {
          "home": {"line": "-1.5", "odds": "-110"},
          "away": {"line": "+1.5", "odds": "-110"}
        },
        "moneyline": {
          "home": "-150",
          "away": "+130"
        },
        "total": {
          "line": "8.5",
          "over": "-110", 
          "under": "-110"
        }
      },
      "garyPicks": {
        "spread": "home|away",
        "moneyline": "home|away",
        "total": "over|under",
        "confidence": 0.75
      }
    }
  ]
}
*/ 