CREATE TABLE IF NOT EXISTS team_specific_props (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  team TEXT NOT NULL,
  prop_type TEXT NOT NULL CHECK (prop_type IN ('home_run', 'stolen_base', 'two_hits')),
  player TEXT NOT NULL,
  rationale TEXT NOT NULL,
  confidence NUMERIC NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  game_opponent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, team, prop_type)
); 