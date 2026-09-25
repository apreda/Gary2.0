-- Primetime reads like the mock (founder, Sep 24 2026: "the primetime TNF
-- card doesn't look like the mock"):
--  * a dart is labelled by its category (ANYTIME TD, RECEIVING YARDS), its
--    words the player and his line, never "DART";
--  * a scratched Winners play is not a result: it reads Scratched for a
--    member and stays sealed for everyone else, as the Winners page does;
--  * the opening is short, three or four sentences.

create or replace function gary_private.primetime_bets(p_date date, p_league text, p_game_id text)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with pick as (select gary_private.primetime_pick(p_date, p_league, p_game_id) as pk),
  g as (
    select 1 as o, 0::bigint as sub, jsonb_build_object(
      'kind', 'game', 'label', 'GAME PICK',
      'text', regexp_replace(pk->>'pick', '\s*[+-][0-9]{3,4}\s*$', ''),
      'odds', case when pk->>'odds' ~ '^[+-]?[0-9]+$' then (pk->>'odds')::int end,
      'result', gary_private.primetime_result(gary_private.lab_ticket_result('game', p_league, to_char(p_date, 'YYYY-MM-DD'), p_game_id,
                  coalesce(pk->>'pick', ''), pk)->>'result')) as bet
    from pick where pk is not null
  ),
  p as (
    select 2 as o, row_number() over (order by pk->>'player') as sub, jsonb_build_object(
      'kind', 'prop', 'label', 'PROP',
      'text', gary_private.primetime_words(gary_private.parlay_leg_words(pk->>'player', pk->>'bet',
                concat_ws(' ', regexp_replace(coalesce(pk->>'prop', ''), '\s+[0-9.]+$', ''), coalesce(pk->>'line', substring(pk->>'prop' from '[0-9.]+$'))), null, null)),
      'odds', case when pk->>'odds' ~ '^[+-]?[0-9]+$' then (pk->>'odds')::int end,
      'player', pk->>'player', 'player_id', nullif(pk->>'player_id', ''),
      'result', gary_private.primetime_result(gary_private.lab_ticket_result('prop', p_league, to_char(p_date, 'YYYY-MM-DD'), p_game_id, '',
                  jsonb_build_object('player', pk->>'player', 'prop', pk->>'prop', 'bet', pk->>'bet', 'line', pk->>'line'))->>'result')) as bet
    from public.prop_picks pp, jsonb_array_elements(pp.picks) pk
    where pp.date = to_char(p_date, 'YYYY-MM-DD') and pk->>'game_id' = p_game_id
  ),
  d as (
    select 3 as o, row_number() over (order by d.odds, d.id) as sub, jsonb_build_object(
      'kind', 'dart',
      'label', case d.kind
        when 'td' then 'ANYTIME TD' when 'qbtd' then 'QB RUSHING TD' when 'recyds' then 'RECEIVING YARDS'
        when 'rushyds' then 'RUSHING YARDS' when 'passtd' then 'PASSING TDS' when 'int' then 'INTERCEPTIONS'
        when 'hr' then 'HOME RUN' when 'multihit' then '2+ HITS' when 'first_inning' then '1ST INNING'
        else 'DART' end,
      'text', case
        when d.kind in ('td', 'qbtd', 'hr', 'multihit') then d.player
        when d.kind in ('recyds', 'rushyds', 'passtd', 'int') then concat_ws(' ', d.player, lower(d.bet), substring(d.prop from '[0-9.]+$'))
        else gary_private.primetime_words(gary_private.parlay_leg_words(d.player, d.bet, d.prop, d.kind, d.matchup)) end,
      'odds', d.odds,
      'player', case when d.kind = 'first_inning' then null else d.player end, 'player_id', nullif(d.player_id, ''),
      'result', gary_private.primetime_result(d.result)) as bet
    from public.darts d
    where d.game_date = p_date and d.league = p_league and d.game_id = p_game_id and d.scratched_at is null
  ),
  w as (
    select row_number() over (order by b.admitted_at, b.candidate_id) as sub,
      b.league, b.stake_units, c.kind, c.pick_text, c.pick_snapshot, c.odds,
      b.scratched_at is not null as scratched,
      case when b.scratched_at is not null then null else gary_private.primetime_result(coalesce(
        (select l.result from gary_private.bankroll_ledger l where l.candidate_id = b.candidate_id limit 1),
        gary_private.lab_ticket_result(c.kind, c.league, b.game_date, b.game_id, coalesce(c.pick_text, ''),
                                       coalesce(c.pick_snapshot, '{}'::jsonb))->>'result')) end as res
    from public.winners_board b
    join public.winners_candidates c on c.id = b.candidate_id
    where b.game_date = to_char(p_date, 'YYYY-MM-DD') and b.game_id = p_game_id
  ),
  wb as (
    select 4 as o, w.sub, case when w.res is not null or gary_private.has_winners_access(w.league)
      then jsonb_build_object(
        'kind', 'winners', 'label', 'WINNERS', 'sealed', false,
        'text', case when w.kind = 'prop'
          then gary_private.primetime_words(gary_private.parlay_leg_words(w.pick_snapshot->>'player', w.pick_snapshot->>'bet',
                 concat_ws(' ', regexp_replace(coalesce(w.pick_snapshot->>'prop', ''), '\s+[0-9.]+$', ''), w.pick_snapshot->>'line'), null, null))
          else regexp_replace(w.pick_text, '\s*[+-][0-9]{3,4}\s*$', '') end,
        'odds', w.odds,
        'stake_dollars', round(w.stake_units * 100),
        'player', w.pick_snapshot->>'player',
        'result', case when w.scratched then 'scratched' else w.res end)
      else jsonb_build_object('kind', 'winners', 'label', 'WINNERS', 'sealed', true) end as bet
    from w
  )
  select coalesce(jsonb_agg(x.bet order by x.o, x.sub), '[]'::jsonb) from (
    select o, sub, bet from g
    union all select o, sub, bet from p
    union all select o, sub, bet from d
    union all select o, sub, bet from wb
  ) x
$function$;

create or replace function gary_private.primetime_contract() returns text
language sql immutable set search_path = '' as $c$
  select $t$You are Gary. You are writing the top of tonight's Primetime newsletter: the night's big game, for the fans who follow your bets.

Write three things in your own voice, the way you would talk to a friend who bets:
- lede: three or four short sentences, about sixty words. It opens the page, so it reads fast: what tonight's game is about and where your bets sit in it.
- stat_to_know: one sentence with one fact a fan should know before it starts.
- injuries: one or two sentences on who is out or hurting for this game. Leave it empty when the material names nobody who matters tonight.

Use only the facts in the material. Every number and every name you write must be in it. Your bets are yours; name them plainly (the side, the player, the line). Plain words a fan uses, no betting slang. When a football number comes from one or two games this season, say how many games it is.

You are Gary, a person. Never mention models, data, feeds, tools or the material.$t$
$c$;
