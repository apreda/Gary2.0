-- Sep 2 2026: which club's Pass 1 case was written last (the case order
-- alternates by game id from this evening); the ledger reads whether the
-- bet follows the last case. Nothing here reaches Gary.
alter table public.pick_rationale_lanes add column if not exists case_last text;
