# Website launch measurement

The web changes carry the exact current offer: launch preview until October 1, 2026 at midnight Eastern, with accounts created before that cutoff retaining founding Winners access. The implementation does not choose a later expiry or change eligibility, subscription prices or trial rules. The account determines included access before paid checkout. Full game picks and reasoning, available props, the Hub, public record and the private Book remain free.

The website changes are live on `www.betwithgary.ai`, deployed from `ec751968` on September 4. The additive database migration `20260904225312_web_useful_session_funnel.sql` is also applied to production; its new deduplication index and service-only writer/read permissions were verified. Historical migration mismatches prevented a full CLI push, so only this named migration was applied through Supabase's migration tool. No historical versions were repaired or replayed.

## What is measured

Only browsers that allow optional analytics send these website events. No account ID, email, sportsbook credentials, stake or private wager data is attached. A pseudonymous browser UUID and session UUID join the events; sessions renew after 30 minutes without measured navigation/foreground activity. Separate tabs can have separate sessions. This is observed website use, not a count of unique people.

`session_started` records the denominator and safe source/medium/campaign/creative labels, referrer hostname and pathname. Use `utm_content` for the creative, alongside `utm_source`, `utm_medium` and `utm_campaign`. Raw query strings, referrer paths and fragments are discarded.

`meaningful_pick_view` with `measurement_version=reasoning_v2` records actual pick reasoning visible for five continuous foreground seconds on an expanded board card or game-detail page. A route load alone does not count. Closed content, a thin visible sliver and a hidden tab do not count. Repeated reads of the same game in one session are deduplicated in the browser and the database. A later session can read the same game again. This is an opportunity to read, not proof that someone understood or acted on the pick.

Return cohorts use the browser's first **observed** session in the reporting week, then look for another session at least 24 hours and less than seven days later. Only completed seven-day observation windows enter the retention denominator. The report includes both overall and useful-first-session return counts. Legacy page-load events do not enter this funnel. No consent, storage blockers, failed requests, deleted storage and different devices create measurement gaps.

## Run the weekly report

From `web/`, with existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` supplied securely in the environment:

```sh
npm run report:funnel -- --week 2026-08-31
```

Without `--week`, the default is the previous complete Monday–Sunday UTC week. To use this checkout's existing ignored backend environment file without printing or copying credentials:

```sh
node --env-file=../gary2.0/.env.local --experimental-strip-types scripts/weekly-funnel.mjs --week 2026-08-31
```

The script makes GET requests only, paginates through the relevant session history, and prints aggregate counts and channel labels without browser IDs. Rates are `null` for an empty denominator, unfinished return windows are excluded and cohorts under 20 observations are flagged. A 250,000-event safeguard stops rather than printing partial totals; larger history will need database aggregation. No scheduler or recurring job was added.

Before web deployment on September 4, the live read-only report correctly returned zero new sessions, zero useful sessions and null return rates. These are expected baseline values, not a failed launch or an observed retention rate. Evidence is in `evidence/web-measurement-2026-09-04.json`.

The post-deployment check at 7:17 PM ET still had no observed consented acquisition cohort. Return rates remain unavailable; the new code has not been live long enough to measure seven-day return.

## Campaign handoff and deployment

The private Book route is `/you`. The prepared campaign uses `/picks?utm_source=x&utm_medium=organic_social&utm_campaign=launch_sep26&utm_content=find_game_v1` and the corresponding `/you` and `/results` destinations. Preserve the exact campaign and creative values in `content/README.md`; compare useful sessions alongside clicks. Small numbers are directional only.

The production website's `/go/app` redirect reaches app `6751238914` with the existing custom product page parameter. It currently emits no usable provider token or general website campaign token. Existing X bio route `/get` emits campaign `x_bio` and the custom page parameter, but no provider token. Obtain the real App Store Connect provider token and set `APP_STORE_PROVIDER_TOKEN`; set the chosen verified web campaign in `APP_STORE_WEB_CAMPAIGN_TOKEN`, then redeploy and inspect redirect metadata. Existing X customization is `APP_STORE_X_BIO_CAMPAIGN_TOKEN`, and the custom page override is `APP_STORE_CUSTOM_PRODUCT_PAGE_ID`. No fabricated values were installed. Clicks are not proof of installation, first app use or paid conversion.

Vercel project `gary2.0` is linked from `web/.vercel/project.json`. The main-branch push deployed successfully; production resolves to `gary20-2u30fx90t-adam-predas-projects.vercel.app` for `ec751968`. Repository verification, the website fixture smoke check and live public-page checks passed. The live browser declined optional analytics so QA did not manufacture a production acquisition cohort. `web/vercel.json` skips deployments when the web tree is unchanged.

## Account deletion follow-up

When successful deletion returns `apple_revocation_required=true`, the web signed-out confirmation now says Gary deletion is complete and shows Apple's separate sign-in-permission removal instructions. It links only to the fixed trusted Apple support URL, never to an arbitrary backend-provided URL. This mirrors the deployed backend success response and does not hold account deletion open.

## September 5: personal Book milestones

The consent-gated web events `book_opened`, `manual_bet_saved` and `manual_bet_settled` require a browser session and the fixed `/you` path. No bet/account identifiers, selections, odds, stakes, sportsbook, notes or outcomes are accepted. Saves fire after a new manual entry succeeds, not after edits or failed submissions. Settlements fire after a confirmed result save, not after reopening an entry. A Book open requires successful loading during an opening/refocus; automatic minute refreshes do not log opens.

The database deduplicates each milestone per browser/session. Reports count sessions with activity, not the number of bets. Manual activation is a browser's first observed successful save. Return requires a different session with a successfully loaded Book at least 24 hours and less than 7 days later; only complete 7-day windows enter the percentage. Missing denominators yield null. The report reads all retained relevant event history to avoid labeling an already-observed manual user new. No historical activity is backfilled. Native activity and people declining consent are outside this measure.

Migration `20260905125323_consented_book_milestones.sql` extends the existing service-only writer and adds a unique milestone index. Isolated PostgreSQL tests exercise privacy rejection, role permissions, duplicates, later sessions and compatibility. Browser-helper tests exercise consent, hidden pages and idle sessions; aggregation tests separate generic site returns from actual Book returns.
