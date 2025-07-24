CREATE TABLE IF NOT EXISTS team_specific_prop_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prop_id UUID REFERENCES team_specific_props(id) ON DELETE CASCADE,
  actual_outcome BOOLEAN,
  grade_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
); 