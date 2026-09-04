\set ON_ERROR_STOP on
create function public.expect(v boolean,label text) returns void language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end$$;
create function public.expect_error(q text,fragment text) returns void language plpgsql as $$begin
 begin execute q; exception when others then
 if position(fragment in sqlerrm)>0 then raise notice 'PASS: refused %',fragment; return; end if;
 raise exception 'unexpected error: %',sqlerrm; end;
 raise exception 'FAIL: expected refusal %',fragment;
end$$;
insert into auth.users(id) values
 ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000003'),('10000000-0000-0000-0000-000000000004');
insert into user_experience_private.excluded_profiles values('10000000-0000-0000-0000-000000000004','local test cast');

set role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',false);
select expect((get_my_profile()->'profile')='null'::jsonb,'new account has no fabricated profile');
select save_my_profile(p_favorite_sports=>array['MLB'],p_unit_value=>25);
select expect((get_my_profile()->'preferences'->>'unit_value')::numeric=25,'private preferences work without a handle');
select save_my_profile(p_handle=>'AlphaOne',p_bio=>'Private bio',p_leaderboard_visible=>true);
select expect_error($q$select save_my_profile(p_handle=>'x')$q$,'3-18');
select expect_error($q$select save_my_profile(p_handle=>'OfficialGary')$q$,'reserved');
select save_my_profile(p_bio=>'');
select expect((get_my_profile()->'profile'->'bio')='null'::jsonb,'bio can be cleared');
insert into user_bets(id,user_id,kind,game_date,pick_text,odds_american,stake_units,status,units_net,graded_by,streak_pick)
values('20000000-0000-0000-0000-000000000001',auth.uid(),'manual',current_date,'Outside play',150,2,'won',999,'system',true);
select expect((select units_net=3 and graded_by='user' and not streak_pick from user_bets where kind='manual'),'manual win payout and provenance derived by server');
select expect_error($q$insert into user_bets(user_id,kind,game_date,pick_text,odds_american) values(auth.uid(),'manual',current_date,'Bad odds',0)$q$,'American odds');
select expect_error($q$update user_bets set kind='tail' where kind='manual'$q$,'identity');
update user_bets set status='pending',units_net=999,graded_by='system' where kind='manual';
select expect((select units_net is null and graded_at is null and graded_by is null from user_bets where kind='manual'),'manual reopen clears grade');
update user_bets set status='lost' where kind='manual';
select expect((select units_net=-2 from user_bets where kind='manual'),'manual loss subtracts stake');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',false);
select expect((select count(*)=0 from user_bets),'account B cannot read account A bets');
select expect_error($q$select save_my_profile(p_handle=>'alphaone')$q$,'taken');
select save_my_profile(p_handle=>'BetaTwo',p_leaderboard_visible=>true);
select expect((profile_card('10000000-0000-0000-0000-000000000001')->'logged')='null'::jsonb,'public card omits manual statistics');
select expect((profile_card('10000000-0000-0000-0000-000000000001')->'after_loss')='null'::jsonb,'public card omits private patterns');
select expect((profile_card('10000000-0000-0000-0000-000000000001')->'recent')='[]'::jsonb,'public card omits activity');
reset role;

-- Published local fixture tickets only; no provider or live pick generation.
insert into daily_picks(date,picks) values((now() at time zone 'America/New_York')::date::text,
 jsonb_build_array(jsonb_build_object('pick_id','game-a','pick','Home ML +120','league','MLB','game_id','501',
 'homeTeam','Home','awayTeam','Away','odds',120,'commence_time',now()+interval '3 hours'),
 jsonb_build_object('pick_id','game-b','pick','Other ML +130','league','MLB','game_id','502',
 'homeTeam','Other','awayTeam','Visitor','odds',130,'commence_time',now()+interval '4 hours')));
set role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',false);
select place_user_bet((now() at time zone 'America/New_York')::date,'game-a',null,'tail',1,true);
select place_user_bet((now() at time zone 'America/New_York')::date,'game-b',null,'tail',1,false);
select set_streak_pick((select id from user_bets where source_pick_id='game-b'),true);
select expect((select count(*)=1 and bool_and(source_pick_id='game-b') from user_bets where streak_pick),'streak swap is one atomic operation');
select place_user_bet((now() at time zone 'America/New_York')::date,'game-b',null,'fade',2,false);
select expect((select streak_pick and kind='fade' from user_bets where source_pick_id='game-b'),'ordinary repeat preserves designation');
select expect_error($q$select place_user_bet((now() at time zone 'America/New_York')::date,'missing','Home ML +120','tail')$q$,'pick not found');
select expect_error($q$update user_bets set units_net=900,graded_by='system' where kind='tail'$q$,'server-owned');
reset role;
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.user_bets set lock_at=now()-interval '1 minute' where source_pick_id='game-b';
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',false);
select expect_error($q$select set_streak_pick((select id from user_bets where source_pick_id='game-a'),true)$q$,'already locked');
select expect((select streak_pick from user_bets where source_pick_id='game-b'),'failed swap preserves original streak pick');
select expect_error($q$select place_user_bet((now() at time zone 'America/New_York')::date,'game-b',null,'tail')$q$,'game is locked');
update user_bets set is_favorite=true,notes='Remember this ticket' where source_pick_id='game-b';
select expect((select is_favorite from user_bets where source_pick_id='game-b'),'locked bet allows private favorite');
select expect_error($q$update user_bets set streak_pick=false where source_pick_id='game-b'$q$,'game is locked');
reset role;

-- Establish verified historical records and test correction-safe chronology.
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
insert into public.user_bets(user_id,kind,pick_type,game_date,league,pick_text,stake_units,status,units_net,graded_by,graded_at,streak_pick,lock_at)
select '10000000-0000-0000-0000-000000000001','tail','game',(now() at time zone 'America/New_York')::date-i,
 'MLB','History '||i,1,'won',1,'system',now(),true,now()-i*interval '1 day' from generate_series(1,5)i;
update public.user_bets set status='void',units_net=0,graded_by='system' where source_pick_id='game-b';
reset role;
select expect((select current=5 and best=5 from user_streaks where user_id='10000000-0000-0000-0000-000000000001'),'streak uses designated verified ledger');
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.user_bets set status='lost',units_net=-1 where pick_text='History 3';
reset role;
select expect((select current=2 and best=2 from user_streaks where user_id='10000000-0000-0000-0000-000000000001'),'older correction repairs current and historical best');
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.user_bets set status='pending',units_net=null,graded_by=null where pick_text='History 3';
reset role;
select expect((select current=2 and best=2 from user_streaks where user_id='10000000-0000-0000-0000-000000000001'),'unresolved earlier day blocks later counting');
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.user_bets set status='won',units_net=1,graded_by='system' where pick_text='History 3';
reset role;
select expect((select current=5 and best=5 from user_streaks where user_id='10000000-0000-0000-0000-000000000001'),'late grade resolves full streak deterministically');

insert into public.public_profiles(user_id,display_name,leaderboard_visible) values
 ('10000000-0000-0000-0000-000000000003','PrivateThree',false),('10000000-0000-0000-0000-000000000004','FakeFour',true);
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
insert into user_bets(user_id,kind,pick_type,game_date,league,pick_text,stake_units,status,units_net,graded_by,graded_at)
select u,'tail','game',(now() at time zone 'America/New_York')::date-1,'NFL','NFL history '||i,1,
 case when i=1 and u='10000000-0000-0000-0000-000000000002' then 'lost' else 'won' end,1,'system',now()
from unnest(array['10000000-0000-0000-0000-000000000002'::uuid,'10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004'])u cross join generate_series(1,5)i;
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',false);
select expect((your_book_leaderboard_v3('7d')->>'qualified_count')::int=2,'board excludes private and fake accounts');
select expect((your_book_leaderboard_v3('7d','wins','all',1,0)->'me'->>'display_name')='BetaTwo','own row survives pagination');
select expect((your_book_leaderboard_v3('7d','wins','all',1,0)->>'has_more')::boolean,'board returns continuation');
select expect((your_book_leaderboard_v3('7d','wins','NFL')->>'qualified_count')::int=1,'league filter precedes qualification and rank');
select expect((your_book_leaderboard_v3('7d','wins','NFL')->'rows'->0->>'streak_len')::int=0,'unstarred wins never become designated streak');
select expect(profile_card('10000000-0000-0000-0000-000000000003') is null,'hidden profile cannot be read by ID');
select expect((select count(*) from leaderboard('log'))=0,'legacy manual leaderboard is closed');
select expect((select count(*) from your_book_leaderboard_v2('7d'))=2,'legacy v2 excludes private and demonstration records');
select expect_error($q$select your_book_leaderboard_v3('oops')$q$,'invalid leaderboard filter');
reset role;

-- Private payout rounding at very small stakes never changes public units.
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update user_bets set stake_units=0.01,units_net=0.01,odds_american=-110
where user_id='10000000-0000-0000-0000-000000000002' and status='won';
reset role;
select expect((your_book_leaderboard_v3('7d','units','NFL')->'rows'->0->>'units')::numeric=2.64,'public units are independent of private stake rounding');

-- Exact prop identity and NFL weekly publication support.
insert into prop_picks(date,picks) values((now() at time zone 'America/New_York')::date::text,
 jsonb_build_array(jsonb_build_object('player','Pitcher One','prop','strikeouts 5.5','bet','over','line',5.5,'sport','MLB','game_id','601','odds',110,'commence_time',now()+interval '2 hours'),
 jsonb_build_object('player','Pitcher One','prop','strikeouts 5.5','bet','over','line',5.5,'sport','MLB','game_id','602','odds',120,'commence_time',now()+interval '3 hours')));
insert into weekly_nfl_picks(picks) values(jsonb_build_array(jsonb_build_object('pick_id','weekly-one','pick','Bills ML +140','league','NFL','game_id','701','homeTeam','Bills','awayTeam','Jets','odds',140,'commence_time',now()+interval '2 hours')));
set role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',false);
select expect_error($q$select place_user_prop_bet((now() at time zone 'America/New_York')::date,'Pitcher One','strikeouts','tail')$q$,'multiple games');
select place_user_prop_bet_v2((now() at time zone 'America/New_York')::date,'Pitcher One','strikeouts','tail','601',5.5,'over');
select place_user_prop_bet_v2((now() at time zone 'America/New_York')::date,'Pitcher One','strikeouts','tail','602',5.5,'over');
select expect((select count(*) from user_bets where pick_type='prop')=2,'doubleheader props keep separate exact tickets');
select place_user_bet(((now()+interval '2 hours') at time zone 'America/New_York')::date,'weekly-one',null,'tail');
select expect((select count(*) from user_bets where source_pick_id='weekly-one')=1,'weekly NFL resolves on actual Eastern game date');
reset role;

-- Deleting an account must not recreate a streak row through cascade triggers.
select set_config('request.jwt.claims','{}',false);
delete from auth.users where id='10000000-0000-0000-0000-000000000001';
select expect((select count(*) from user_bets where user_id='10000000-0000-0000-0000-000000000001')=0,'account deletion cascades without recreating streaks');
