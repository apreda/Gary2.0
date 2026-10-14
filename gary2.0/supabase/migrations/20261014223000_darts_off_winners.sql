-- DARTS LEAVE WINNERS (founder, Oct 14 2026: "Dart picks are not going to the winners page anymore ... It's
-- fine for today, but after today"). Winners shows only the picks that reach it on their own: game picks
-- through Gary's card and big games, props through the reader. Gary is no longer asked an amount on a dart and
-- no dart is booked; this removes the booking function. Oct 14 and earlier dart tickets (policy darts-top-v1)
-- stay on the board and settle from the dart's grade as before.
drop function if exists public.admit_dart(bigint);
drop function if exists gary_private.admit_dart(bigint);
