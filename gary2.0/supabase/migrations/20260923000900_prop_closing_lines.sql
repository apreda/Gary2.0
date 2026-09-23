-- The closing price of every published prop (founder GO, Sep 23 2026):
-- internal measurement only, never shown in the app. The props runner's
-- T-30 and T-15 retries, which already find the game's props stored, record
-- each pick's current best price; the last write before first pitch stands
-- as the close. Taken vs close says whether the market moved toward Gary.
begin;

create table if not exists public.prop_closing_lines (
  game_date date not null,
  league text not null,
  game_id text not null,
  player text not null,
  prop text not null,
  bet text not null,
  taken_odds integer,
  close_odds integer,
  minutes_before integer,
  captured_at timestamptz not null default now(),
  primary key (game_date, league, game_id, player, prop, bet)
);

alter table public.prop_closing_lines enable row level security;
revoke all on public.prop_closing_lines from anon, authenticated;

commit;
