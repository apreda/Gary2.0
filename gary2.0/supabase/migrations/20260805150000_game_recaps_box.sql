-- THE BOX LINE (founder, Aug 5 2026): the Home headline card's box column
-- could only ever draw runs, because game_results stores nothing but
-- final_score and live_scores carries no hits. The recap writer already
-- fetches per-game player stats to build its evidence (buildGameEvidence
-- even aggregates TEAM HITS into the prompt) and then throws them away.
-- This keeps them.
--
-- Shape: {"away":{"runs":1,"hits":11},"home":{"runs":3,"hits":4}}
-- Nullable by design — a row without it renders exactly as before.
alter table game_recaps add column if not exists box jsonb;

comment on column game_recaps.box is
  'Box line for the headline card: per-side runs + hits, written by scripts/run-game-recaps.js from BDL per-game stats. Null when the league or the feed has no batting lines.';
