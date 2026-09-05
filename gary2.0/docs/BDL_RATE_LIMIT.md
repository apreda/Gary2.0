# Football data request allowance

Gary shares one local request gate across NFL and NCAAF processes. Missing or invalid `GARY_BDL_LOCAL_REQUESTS_PER_MINUTE` keeps the conservative trial default of 3/min. Positive integer settings are capped at 120/min. Configuration is read when a request waits, after environment loading.

Production is configured to `GARY_BDL_LOCAL_REQUESTS_PER_MINUTE=120`. The gate adds a 100ms spacing margin, so this setting permits at most one local start every 600ms. Cross-process locking, cancellation, shared caches and retry handling remain active. Existing slower reservations are honored when workers restart with a faster setting.

On September 5, 2026, ordinary requests using the production API key returned these non-sensitive headers:

| Endpoint | Response date (UTC) | HTTP | X-RateLimit-Limit | Remaining | Reset |
| --- | --- | --- | --- | --- | --- |
| `/nfl/v1/teams` | 12:36:05 | 200 | 600 | 599 | 1788611826 |
| `/ncaaf/v1/teams` | 12:37:45 | 200 | 600 | 598 | 1788611906 |

The [NFL](https://nfl.balldontlie.io/#account-tiers) and [NCAAF](https://ncaaf.balldontlie.io/#account-tiers) documentation identifies 600/min as the paid GOAT allowance and 5/min as the trial allowance. The live headers establish the allowance for this key on both sports; no subscription purchase or account change was made. The earlier hardcoded 3/min gate was left over from the trial allowance.

The local cap deliberately leaves headroom below the verified allowance. It gates football cache misses; generic game pagination also takes additional slots, while some roster/stat pagination remains inside a single cache operation. The cap is therefore not a complete count of every HTTP page. MLB's existing request behavior is unchanged. Do not infer another account or sport's allowance from these measurements.

After changing production `.env`, coordinate restarting existing long-lived workers so their child processes inherit the new setting. Setting the value to 3 restores trial-safe pacing. Never disable the gate to work around an unverified limit.
