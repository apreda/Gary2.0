-- pg_net's queue, responses and request-number sequence are UNLOGGED: after
-- crash recovery the queue is empty and its request numbers can start again.
-- This lookup must have the same lifetime, or a reused number collides with
-- an old row and rolls back enqueue_social(), including the publishing request.
-- Durable publication receipts, incidents, events and email history stay logged.
alter table gary_ops.social_requests set unlogged;
