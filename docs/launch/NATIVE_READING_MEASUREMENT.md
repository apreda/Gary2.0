# Native useful-session measurement — September 8, 2026

Included in native source commit `7e7c163a`, signed build 2.25 (909), uploaded September 8, 2026. This is separate from the website's analytics table and does not establish observed launch conversion or cross-launch retention. Apple processing completion and public availability are unverified.

## Consent and recorded fields

“Share reading analytics” is a separate Settings switch, off by default. The existing “Share product analytics” permission retains its described plan/checkout scope and cannot enable reading measurement. Reading-only permission cannot enable checkout events. Successful account deletion clears both preferences. Each payload is allowlisted, and the transport checks the relevant permission again immediately before sending.

The new iOS `session_started` event contains only `session_id` and `measurement_version=reasoning_v2`. `meaningful_pick_view` adds `content_type=pick` and `surface=game_card|prop_card`. `p_identity` is null even when signed in. No account ID, installation/push ID, content key, team/player selection, odds, stake, reasoning text or private Book data is transmitted by these events.

A random UUID is kept only in the app process's memory. A session begins on a consented foreground entry, including visits with no reading, and is replaced after thirty minutes continuously in the background, an account change, or withdrawal/regrant of consent. A fresh process always starts fresh; there is no stored guest identity or cross-launch retention measurement. Account ID is used only locally to separate account transitions. Deduplication content keys remain in memory and are never sent.

## Exact coverage

Measured: the original `Text(take)` inside the **expanded** shared `GaryTakeCardBack`, for game and prop cards. These include the shared card surfaces used by Home, Winners and Picks. A read requires at least 32 points of actual text in both dimensions inside the window viewport and every ancestor scroll clip, continuously sampled for five foreground seconds. A sample gap over 250ms resets the interval; a blocked main thread does not count as proof of visibility.

Not measured: front faces, collapsed snippets, mounted but inactive tabs, flipped-away backs, empty/fallback reads, legacy popup routes, Hub/Fantasy prose, chat, and other text surfaces. The explicit root tab environment defaults false. Foreground state, card flip/expansion, the card's share sheet, global league/pick overlays, covering UIKit presentations, view visibility/alpha, viewport clipping and a conservative 96-point dock exclusion gate sampling. The probe stops after a deduplicated read or when its instrumented text leaves the view tree. It captures no screen or text and changes no presentation.

The root lifecycle modifier supplies the session denominator independently of opening a card. Counting sessions only from reasoning views would have excluded users who never reached useful content.

## Verification and limits

`gary2.0/tests/scripts/iosReadingMeasurement.test.js` compiles and executes production Swift with `-O`: interrupted reads, hidden content, exact five-second completion, duplicate/reopened cards, stalls, short/long background returns, account transitions, consent revocation, fresh-process state and viewport clipping. `PrivacyPreferencesTests.swift` verifies independent grants, no identity/prose/bet fields, malformed payload rejection and withdrawal. The privacy page has a matching rendered test. Both production Swift tests and the privacy test pass; full native compilation/runtime QA is the release owner's separate gate.

Read-only live schema checks confirmed that `log_app_event` accepts iOS JSON props, `app_events` has RLS enabled and no client policies, and client table grants do not permit row reads. No analytics event or private customer row was read/written for QA. No new SDK, persistent analytics ID or analytics database migration is introduced.

The legacy ingestion RPC is a client-writable analytics collector; event contents are not evidence of verified betting, account ownership or a purchase. Delivery is best effort and can be lost or arrive out of order. Use distinct session IDs, join useful events to a recorded session denominator, and do not interpret raw event counts or these metrics as billing/security truth. Organic observations cover only people who opted in and only the instrumented card surfaces.

## Privileged reporting query

This query reads aggregate counts only. Run after a release has organic consented observations; do not manufacture production events. The join deliberately does not require event arrival order.

```sql
with events as (
  select event, props->>'session_id' as session_id, created_at
  from public.app_events
  where platform = 'ios'
    and event in ('session_started', 'meaningful_pick_view')
    and props->>'measurement_version' = 'reasoning_v2'
    and props->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
), sessions as (
  select session_id, min(created_at) as started_at
  from events where event = 'session_started' group by session_id
), useful as (
  select distinct session_id from events where event = 'meaningful_pick_view'
)
select count(*) as observed_consented_sessions,
       count(u.session_id) as sessions_with_expanded_card_read,
       round(100.0 * count(u.session_id) / nullif(count(*), 0), 1) as useful_percent
from sessions s left join useful u using (session_id)
where s.started_at >= now() - interval '7 days';
```

Keep these results distinct from website `web_events` and do not report a combined rate without a documented shared population. Native anonymous return rates, acquisition attribution and consent coverage percentages remain unmeasured.

## Settings fix included in this lane

Both Settings entrypoints use `SettingsSheetView`'s NavigationStack. Settings keeps its navigation bar visible, the wrapper provides a labelled Done/Close control, and What's New uses its existing Settings back action without a duplicate system back button. The profile sheet's own close control is separately owned by the root release lane.
