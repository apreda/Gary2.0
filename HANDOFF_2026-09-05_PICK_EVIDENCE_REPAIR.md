# College tool and decision evidence repair — September 5, 2026

The founder requested urgent repairs after the September 4 NCAAF/MLB audit.
That audit is at
`/Users/adam.preda/Documents/ChatGPT/Gary/Gary-picks-investigation-2026-09-04.md`.
This change addresses three demonstrated pipeline defects. It does not establish
that these defects explain every losing pick or that repaired picks will win.

## College tools

The tool menu now advertises the 29 implemented college adapters and their
equivalent generic names. The menu and router share the explicit college
aliases for schedule strength and defensive explosiveness. A college request
cannot choose its menu by supplying another league in the tool arguments.
The actual college payload, including nested records, samples, opponent results,
rankings, source limitations and unavailable values, survives formatting.
Injury handling and its existing formatting remain unchanged.

The six previously blocked requests with existing college implementations are
QB_STATS, OL_RANKINGS, PRESSURE_RATE, EXPLOSIVE_PLAYS, EXPLOSIVE_ALLOWED and
SCHEDULE_STRENGTH. Pressure responses still explicitly report sacks/TFL counts,
not an invented pressure percentage. Explosiveness remains CFBD's named metric,
not a fabricated count of long plays. WEATHER, TRAVEL_SITUATION and
SCHEDULE_CONTEXT do not have college stat adapters; they remain explicitly
unsupported rather than reaching NFL/NBA adapters. Organic narrative research
and the existing factual desk remain available for those subjects.

## Original evidence

The football Pass 2 gate now freezes the exact two case sections it accepts.
Both successful JSON exits attach those sections directly, independently of
context pruning and final-rationale extraction. The existing runner extraction
helper remains a compatibility fallback.

All tool response messages, including specialized player tools and failed
requests, are captured before context pruning. The same captured batch is sent
to the model, so pruning or an injected assistant message cannot suppress the
pending responses. Each completed decision carries the original response text
and observation time. The football era is frozen before asynchronous research;
the era surface now includes the formatter and college token contract.

The direct Winners queue and the private `pick_desks.decision_evidence` column
receive the same version-2 envelope: exact published decision, desk, cases,
research briefing and tool responses. Recovery requires the same game, ticket,
rationale, model and era, and a pregame observation timestamp. Both reviewer
passes receive the original tool outputs as source material. Existing admitted
snapshots and finished review judgments are preserved. A pending/unavailable
desk-only publication race can be enriched for the same original decision.

The additive migration `20260905124226_original_game_decision_evidence.sql`
was applied to production and its remote migration version was verified.
Existing rows remain null. No historical evidence was reconstructed.
The existing table has RLS enabled with no public policies; the security advisor's
informational no-policy notice is consistent with this service-only table.

## Missing markets

Football stops before scouting/model creation when neither side has a verified
spread and valid American price. The result is `market_unavailable`; the runner
does not cascade that data failure through more models. A later ordinary
scheduler attempt refreshes the source market. A genuine zero spread is valid,
and an away-only priced spread is supported. No unpriced pick is manufactured.

## Verification and rollout

The complete backend suite passed 1,896 tests in 217 files at 08:43 ET.
After the final era-freeze and response-label adjustments, the focused decision,
college-contract and durable-evidence suites passed another 15 tests.
Regression coverage runs the real agent loop through both successful exits,
aggressively prunes its working context, checks actual response delivery and
storage, exercises publication recovery/races, and proves that an unpriced
football game makes no scouting or model calls. The final injury-format exclusion
is followed by a focused regression run before commit. Syntax/diff checks pass.

The idle Winners worker was restarted at 08:45:50 ET, PID 11032, and its actual
working folder is `/Users/adam.preda/Desktop/Gary2.0/gary2.0`.
Production truth also sees the scheduler in that canonical folder (PID 9699,
restarted by another active task). Its MLB/props eras are unchanged:
`fbee57bc41bd` / `aa5fa0ab453b`. College pick children are fresh processes;
in-flight children may retain the revision loaded when they started.
At the 08:47 read, the only stored September 5 pick still had the prior college
era. A newly stored envelope is therefore not yet proven by that read.

Other active tasks have concurrent scheduler, content, web, native and edge
changes in this checkout. Repository-wide production truth consequently flags
their uncommitted work (including a concurrent social-auto-post edit). This
repair does not stage or deploy those changes. The real local Firebase plist
is the documented private configuration exception and remains untouched.
