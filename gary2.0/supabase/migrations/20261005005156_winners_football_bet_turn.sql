-- FOOTBALL'S BET TURN IS THE WINNERS GATE (founder GO, Oct 4 2026).
--
-- "Gary's picks, Gary's bets, Gary's amounts, full agency for him to bet like a solo human."
-- An NFL or college game pick now answers two questions inside its own pick session
-- (src/services/pickdesk/betTurn.js): does this pick go on Winners, and how much. A pick that carries that
-- answer (gary_bet.asked = 'in_session') is admitted on it alone:
--   - Winners at his amount when he says so; 'gary_pass' when he passes.
--   - The reader's grade no longer gates it and it does not wait for the read. The reader still writes.
--   - The $300 line does not apply to it.
-- Unchanged: Sunday Night Football and college main games stay automatic, spreads past 21.5 and
-- small-conference college teams stay out, and the published original is matched exactly before admission.
-- A football pick without the in-session answer (the ask failed and the separate bet call stood in) keeps
-- the older rule. MLB and props are untouched.
--
-- Written as exact edits to the live definitions so nothing else in the gate is restated. Each edit must
-- match exactly once or the whole migration fails. No new function: existing grants stand.
do $mig$
declare
  def text; pair text[]; hits int; nl constant text := E'\n';
  gate_edits text[][] := array[
    [$a$automatic_mlb boolean:=false; automatic_game boolean:=false;$a$,
     $a$automatic_mlb boolean:=false; automatic_game boolean:=false; explicit boolean:=false;$a$],

    [$a$ automatic_game:=automatic_mlb or (c.league in ('NCAAF','NFL') and big);$a$ || nl || $a$ if automatic_game then$a$,
     $a$ automatic_game:=automatic_mlb or (c.league in ('NCAAF','NFL') and big);$a$ || nl ||
     $a$ -- Football's bet turn: Gary answered "Winners or pass, and how much" inside the pick session.$a$ || nl ||
     $a$ explicit:=c.kind='game' and c.league in ('NFL','NCAAF') and coalesce(c.pick_snapshot->'gary_bet'->>'asked','')='in_session';$a$ || nl ||
     $a$ if automatic_game or explicit then$a$],

    [$a$if not automatic_game and (grade is null or c.status<>'graded') then return 'unread'; end if;$a$,
     $a$if not automatic_game and not explicit and (grade is null or c.status<>'graded') then return 'unread'; end if;$a$],

    [$a$  elsif c.kind='game' and c.league='NCAAF' then$a$,
     $a$  elsif explicit then$a$ || nl ||
     $a$   ok:=play and coalesce((c.pick_snapshot->'gary_bet'->>'winners')::boolean,false);$a$ || nl ||
     $a$  elsif c.kind='game' and c.league='NCAAF' then$a$],

    [$a$why:=case when ok then 'admitted' when grade='unsupported' then 'unsupported'$a$,
     $a$why:=case when ok then 'admitted' when explicit then 'gary_pass' when grade='unsupported' then 'unsupported'$a$],

    [$a$        when play then format('Gary plays it, $%s; reader: %s',trunc(stake),grade)$a$,
     $a$        when explicit then format('Gary bets it, $%s',trunc(stake))$a$ || nl ||
     $a$        when play then format('Gary plays it, $%s; reader: %s',trunc(stake),grade)$a$],

    [$a$when c.league='NCAAF' and big then 'big_game' when play then 'play_and_grade' else 'big_game' end$a$,
     $a$when c.league='NCAAF' and big then 'big_game' when explicit and not automatic_game then 'gary_bet' when play then 'play_and_grade' else 'big_game' end$a$]
  ];
  sweep_edits text[][] := array[
    [$a$       or (c.status='graded' and ($a$,
     $a$       or (c.kind='game' and c.league in ('NFL','NCAAF') and coalesce(c.pick_snapshot->'gary_bet'->>'asked','')='in_session'$a$ || nl ||
     $a$         and coalesce((c.pick_snapshot->'gary_bet'->>'play')::boolean,false))$a$ || nl ||
     $a$       or (c.status='graded' and ($a$]
  ];
begin
  def := pg_get_functiondef('gary_private.admit_winners_candidate(bigint)'::regprocedure);
  foreach pair slice 1 in array gate_edits loop
    hits := (length(def) - length(replace(def, pair[1], ''))) / length(pair[1]);
    if hits <> 1 then raise exception 'admit_winners_candidate: expected one match, found % for: %', hits, pair[1]; end if;
    def := replace(def, pair[1], pair[2]);
  end loop;
  execute def;

  def := pg_get_functiondef('public.admit_winners_pending(text)'::regprocedure);
  foreach pair slice 1 in array sweep_edits loop
    hits := (length(def) - length(replace(def, pair[1], ''))) / length(pair[1]);
    if hits <> 1 then raise exception 'admit_winners_pending: expected one match, found % for: %', hits, pair[1]; end if;
    def := replace(def, pair[1], pair[2]);
  end loop;
  execute def;
end
$mig$;
