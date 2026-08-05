-- THE REAL SCOREBOARD (Aug 5 2026).
--
-- X_CONVERSION_STRATEGY.md names profile clicks and bookmarks as the metrics that actually matter, and
-- explicitly demotes impressions/likes/followers to "lagging proxies at most". get-tweet-metrics has been
-- returning bookmarks, url_link_clicks and user_profile_clicks the whole time — but social_post_log had
-- nowhere to put them, so refreshMetrics kept only the four the strategy calls noise and dropped the three
-- it calls real. Every conversion decision since June has been made blind. These three columns end that.
--
-- Nullable by design: every historical row stays valid and simply carries null until its next refresh.
alter table social_post_log add column if not exists bookmarks integer;
alter table social_post_log add column if not exists profile_clicks integer;
alter table social_post_log add column if not exists link_clicks integer;

comment on column social_post_log.bookmarks is
  'Sum of bookmark_count across the thread. Save-for-later intent — closest proxy to "I will act on this".';
comment on column social_post_log.profile_clicks is
  'Sum of user_profile_clicks across the thread. The surface that out-converts an in-thread link; the tweet''s real job is earning this.';
comment on column social_post_log.link_clicks is
  'Sum of organic url_link_clicks across the thread. Null when X reports no organic metrics for the tweet.';
