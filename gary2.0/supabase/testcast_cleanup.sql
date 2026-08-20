-- TEST CAST CLEANUP — run before the Sep 5 launch (pairs with
-- testcast_seed.sql; also flip AppFlags.bookPreviewCast to false).
-- Removes every @testcast account and all of its rows. auth.users
-- cascades to public_profiles; user_bets goes first for clarity.

delete from public.user_bets
 where user_id in (select id from auth.users where email like '%@testcast.betwithgary.ai');

delete from public.public_profiles
 where user_id in (select id from auth.users where email like '%@testcast.betwithgary.ai');

delete from auth.users where email like '%@testcast.betwithgary.ai';
