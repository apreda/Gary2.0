-- THE DART SCREEN (Sep 24 2026): Gary's order on the board and the model's read behind each dart.
alter table public.darts add column if not exists rank integer;
alter table public.darts add column if not exists screen jsonb;
