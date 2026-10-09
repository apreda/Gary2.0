-- FIRST-INNING TICKETS NAMED NO-RUN / YES-RUN (Oct 9 2026): the Winners result rows shorten a player to his last
-- name, so "No Run" read RUN 1ST INNING. One word is never shortened: the App Store build reads NO-RUN 1ST INNING on
-- the card and NO-RUN UNDER 1ST INNING in a result row; build 978 reads NO RUN 1ST INNING in both. Replayed against
-- both builds' title code before applying; the Oct 8 ticket fixed in place.

CREATE OR REPLACE FUNCTION gary_private.admit_dart(p_dart_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.darts; stake numeric; label text; line text; snap jsonb; mk text; tk text; cid bigint; words text;
begin
 select * into d from public.darts where id = p_dart_id for update;
 if not found then return 'missing'; end if;
 if d.winners_candidate_id is not null then return 'already'; end if;
 if not ((d.league = 'MLB' and d.kind in ('hrr', 'tb', 'first_inning')) or (d.league = 'NFL' and d.kind = 'recyds')) then return 'not_a_winners_kind'; end if;
 if d.scratched_at is not null then return 'scratched'; end if;
 if d.result is not null or d.commence_time is null or d.commence_time <= clock_timestamp() then return 'started'; end if;
 if d.odds is null or abs(d.odds) < 100 then return 'no_price'; end if;
 if not coalesce((d.gary_bet->>'play')::boolean, false) or jsonb_typeof(d.gary_bet->'stake_dollars') <> 'number' then return 'no_amount'; end if;
 stake := (d.gary_bet->>'stake_dollars')::numeric;
 if stake <> trunc(stake) or stake < 100 then return 'no_amount'; end if;
 -- The same player and market already on the board through the props lane: one ticket, not two.
 if d.kind <> 'first_inning' and exists (
   select 1 from public.winners_board b where b.game_date = d.game_date::text and b.league = d.league and b.kind = 'prop' and b.scratched_at is null
     and lower(btrim(coalesce(b.pick_snapshot->>'player', ''))) = lower(btrim(d.player))
     and lower(btrim(coalesce(b.pick_snapshot->>'prop', b.pick_snapshot->>'prop_type', ''))) = lower(btrim(d.prop))) then
   return 'twin_on_board';
 end if;
 label := case d.kind when 'hrr' then 'H+R+RBI' when 'tb' then 'total bases' when 'recyds' then 'receiving yards' else 'first-inning' end;
 line := substring(d.prop from '[0-9.]+$');
 words := gary_private.dart_words(d);
 snap := jsonb_build_object(
   'player', case when d.kind = 'first_inning' then case when lower(d.bet) = 'under' then 'No-Run' else 'Yes-Run' end else d.player end, 'team', d.team, 'position', d.position,
   'prop', case when d.kind = 'first_inning' then '1st_inning' else d.prop end, 'line', case when d.kind = 'first_inning' then '' else line end, 'bet', lower(d.bet),
   'odds', case when d.odds > 0 then '+' || d.odds::text else d.odds::text end,
   'league', d.league, 'sport', d.league, 'lane', 'CORE',
   'matchup', d.matchup, 'game_id', case when d.game_id ~ '^[0-9]+$' then to_jsonb(d.game_id::bigint) else to_jsonb(d.game_id) end,
   'commence_time', d.commence_time, 'book', d.book,
   'rationale', d.reason, 'model', d.model,
   'dart_id', d.id, 'dart_kind', d.kind, 'dart_rank', d.rank, 'pick_text', words,
   'gary_bet', d.gary_bet);
 mk := md5(concat_ws('|', d.game_date::text, d.league, 'dart', lower(d.player), lower(d.prop), line));
 tk := md5(concat_ws('|', d.game_date::text, d.league, 'dart', lower(d.player), lower(d.prop), line, lower(d.bet), d.odds::text));
 insert into public.winners_candidates(game_date, league, kind, game_id, ticket_key, market_key, pick_text, odds, commence_time, pick_snapshot, evidence_snapshot, policy_version, status, reason, admitted_at)
  values (d.game_date::text, d.league, 'prop', d.game_id, tk, mk, words, d.odds, d.commence_time, snap, '{}'::jsonb, 'darts-top-v1', 'qualified', 'dart', clock_timestamp())
  returning id into cid;
 insert into public.winners_board(candidate_id, game_date, league, kind, game_id, ticket_key, market_key, pick_snapshot, admitted_at, policy_version, reason)
  values (cid, d.game_date::text, d.league, 'prop', d.game_id, tk, mk, snap, clock_timestamp(), 'darts-top-v1',
          format('Gary''s #%s %s dart, $%s', coalesce(d.rank, 1), label, trunc(stake)));
 update public.darts set winners_candidate_id = cid where id = d.id;
 insert into public.winners_decision_events(candidate_id, event, detail)
  values (cid, 'admitted', jsonb_build_object('gate', 'dart', 'dart_id', d.id, 'kind', d.kind, 'rank', d.rank, 'stake_dollars', stake, 'policy_version', 'darts-top-v1'));
 return 'admitted';
end $function$
;
