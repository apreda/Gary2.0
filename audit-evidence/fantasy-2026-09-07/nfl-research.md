# NFL Fantasy research receipt — September 7, 2026

Research for the founder-approved Fantasy redesign. These are dated findings and implementation options, not standing design rules. Production NFL code was not changed during this research pass. The user asked to finish MLB before implementing NFL.

## Product finding

“AI advice,” pickups, start/sit, role-change articles, and personalized rankings already exist. Gary should compete on the quality and clarity of a small number of evidence-backed decisions: what changed, why it matters for this scoring week and this manager, and what would change the call. That is a product direction, not a claim of exclusive capability.

| Product | Verified existing capability | Implication for Gary |
| --- | --- | --- |
| ESPN | Its August 3, 2026 announcement describes daily analysis, weekly playbooks, trend watch, waiver advice, live lineup questions, and league presets including SuperFlex and FAB. | “More than stats” alone is not differentiation. [ESPN announcement](https://espnpressroom.com/press-release/espn-fantasy-football-celebrates-being-named-official-fantasy-game-of-the-nfl-with-new-features-games-campaigns-and-more/) |
| Yahoo | Research Assistant offers start/sit and add/drop comparisons; Assistant GM uses projections for lineup recommendations and future lineups. | A generic optimal-lineup feature duplicates a mature product. [Yahoo Fantasy Plus](https://help.yahoo.com/kb/SLN35629.html), [Assistant GM](https://sports.yahoo.com/fantasy/article/introducing-assistant-gm-a-smart-new-feature-exclusive-to-yahoo-fantasy-plus-subscribers-125543697.html) |
| FantasyPros | Waiver Assistant imports actual league availability and compares weekly/rest-of-season rankings against potential drops. Coach AI already provides contextual player, trade, waiver, and start/sit advice. Its September 1, 2026 MCP documentation also exposes league ownership and personalized advice tools. | Do not market conversational analysis or roster-aware waivers as unique. [Waiver Assistant](https://support.fantasypros.com/hc/en-us/articles/115001363868-How-does-the-Waiver-Wire-Assistant-work), [Coach AI](https://support.fantasypros.com/hc/en-us/articles/32059185108123-What-is-Coach-AI-HOF), [current MCP tools](https://support.fantasypros.com/hc/en-us/articles/55238312588571-What-tools-are-available-in-the-FantasyPros-MCP-Server) |
| Sleeper | Contextual fantasy box scores, live matchup feeds, trending adds/drops, custom scoring and waiver timing already exist. | Trending popularity is discovery context, not a recommendation or proof of availability. [Product features](https://support.sleeper.com/en/articles/1951583-what-are-sleeper-s-unique-features), [documented trending API](https://docs.sleeper.com/#trending-players) |
| PFF | Usage reports connect snaps, routes, targets per route, carry share, red-zone work and situational splits to waiver and lineup decisions. | Gary cannot claim “role connections” are new, and must not invent proprietary usage fields it cannot observe. [PFF usage report](https://www.pff.com/news/fantasy-football-nfl-usage-and-production-report-week-2) |

## Decisions the NFL page should help with

1. **This week's lineup:** a close call with the relevant format, opponent and kickoff. Explain which observed opportunities support the read and which parts are provider projections. A user-selected comparison is more useful than telling everyone to start the same star.
2. **An add worth investigating:** identify broadly under-rostered players, then explain whether the case is a one-week fill-in, a longer bench hold, or only something to watch. Without an imported or user-entered roster, do not assert that a player is available or recommend an exact drop.
3. **A changed role:** combine recent carries, targets and receptions into one player entry, including contrary evidence. One high-scoring game and a verified workload change are different observations; neither predetermines the recommendation.
4. **Next week's problem:** show the next scheduled matchup and verified bye information so managers can investigate replacements before the immediate deadline. A missing provider game is not proof of a bye.

Football requires a scoring-week view even on days without games. Waiver timing is league-specific: Sleeper's after-game, after-drop and custom daily settings can delay the same claim. League lock behavior also varies. A kickoff clock should be labeled as the game's kickoff unless Gary actually knows the league's lock rule. [Sleeper waiver timing](https://support.sleeper.com/en/articles/4042901-why-was-my-waiver-time-pushed-back), [NFL lineup rules, March 2025](https://support.nfl.com/hc/en-us/articles/35869679382420-Setting-Your-Lineup)

PPR/half-PPR/standard are useful starting contexts, but do not represent every league. Positional reception bonuses can stack on base PPR, and SuperFlex changes roster competition. Keep QB, RB, WR and TE distinct. [Sleeper reception rules](https://support.sleeper.com/en/articles/3652730-how-are-reception-bonuses-calculated), [FantasyPros custom scoring](https://support.fantasypros.com/hc/en-us/articles/360039535653-How-do-enhanced-rankings-and-tools-work-with-my-custom-scoring-i-e-non-default-settings-league)

## Existing data is sufficient for an initial version

Current BDL documentation includes `fantasy/adp`, `fantasy/projections`, `fantasy/weekly_stats`, and `fantasy/scoring_formats`. They require GOAT access. Ownership fields have collection/market timestamps; weekly projections link games; every endpoint paginates. The documented `scoring_format` parameter orders/filters records but still returns all formats. Weekly fantasy performance is periodic and can change while a game is in progress. `collected_at` is collection time, not the game's date. [BDL NFL documentation](https://nfl.balldontlie.io/#fantasy-football)

Read-only calls using Gary's existing local BDL credential succeeded; no key was printed and no model or database writes were performed:

| Request | Result observed September 7 |
| --- | --- |
| `fantasy/adp?season=2026&player_ids[]=38&per_page=1` | HTTP 200; 804 bytes; Josh Allen 99.92% rostered, 97.69% started; collected `2026-09-07T17:15:00.871Z`, market updated `2026-09-07T16:30:23.345Z`. |
| `fantasy/projections?season=2026&week=1&player_ids[]=38&scoring_format=ppr&per_page=1` | HTTP 200; **15,820 bytes for one player**, containing standard/half-PPR/PPR totals and repeated scoring definitions. Linked game `1392225`, Buffalo at Houston, September 13 at 17:00 UTC; projected totals 19.259549022 in each of those three formats. |
| `fantasy/weekly_stats?season=2025&week=1&player_ids[]=38&scoring_format=ppr&per_page=1` | HTTP 200; 15,088 bytes; game `423959` dated September 8, 2025 at 00:20 UTC, final; collection timestamp August 20, 2026. Demonstrates why a recent collection timestamp cannot make an old performance current. |
| `fantasy/scoring_formats?season=2026&scoring_format=ppr&per_page=1` | HTTP 200; 4,253 bytes; season-specific format definition present. |

Those four sequential requests individually took 130–273 ms. This is a small access/shape probe, not an availability SLA or complete season audit.

Canonical `/games/1392225` independently matched the projection's season 2026, week 1, team IDs (BUF 3, HOU 10), home/away, and kickoff. Buffalo's official 2026 schedule confirms Bills at Texans, Sunday September 13, 1 p.m. EDT. [Buffalo schedule](https://www.buffalobills.com/schedule/2026/)

The documented query `/games?seasons[]=2026&weeks[]=1&season_types[]=2&per_page=100` returned 16 games and no next cursor. **Week 1 opens Wednesday September 9 at 8:20 p.m. EDT**, followed by another game Thursday; a hard-coded Thursday opening would omit the first game. The Patriots' official preview confirms the Wednesday opener at Seattle. [Patriots game preview](https://www.patriots.com/news/game-preview-patriots-at-seahawks-week-1)

Implementation option using existing BDL access:

- Resolve the relevant provider season/week from the real regular-season schedule; keep this separate from the exact-day betting slate. Join projection game, player-team context and canonical schedule before presenting a weekly decision.
- Normalize QB/RB/WR/TE facts locally: identity, matchup/kickoff, selected projected counting stats, three fantasy totals, ownership percentage/timestamps, and dated regular-season logs. Store scoring definitions once; never send the raw 15 KB per-player envelope to Gary.
- Scan the full paginated ownership/candidate set before selecting a short list. The ownership endpoint is ordered by ADP, so using only its first page recreates the current stars-only problem.
- Mix actionable lineup considerations with under-rostered candidates and observed role changes. Ownership is provider-wide context; its source population and freshness must be labeled without inventing an ESPN/Yahoo attribution or a claim about the user's league.
- One decision per player: Gary's call, who it helps, the supporting connection, time horizon, and a concrete uncertainty that could change the call. Allow wait/hold/no recommendation; stop asking the model to justify adding every player.
- Reuse a normalized fact fingerprint so unchanged inputs do not trigger another analyst pass. Preserve facts and source timestamps alongside prose; validate output identities/evidence references and avoid contradictory duplicate cards.

## Current implementation findings

Reviewed `src/services/insights/computers/nflFantasyEdges.js`, `footballData.js`, `generateInsightConnections.js`, `ballDontLieService.js`, and `nflPlayerLogFacts.js` at commit `48c5b549`:

- `computeNflFantasyEdges` requires games on the selected day. The generator's empty-day path only publishes next-slate context, so this fantasy lane disappears between NFL game days.
- Candidate selection alternates season-volume RB and combined WR/TE pools, caps at eight players/two per team, and excludes QB. It can emit role, trend and matchup cards separately for the same player.
- Formulaic relevance creates MUST_ADD/STREAM/DEEP labels before the model sees the facts. The analyst prompt then asks for the case for adding every player, despite no roster availability or scoring context.
- `currentUsage` coerces missing carries/targets to zero. An incomplete provider field can therefore look like reduced opportunity.
- The lane calls `getNflPlayerGameLogsBatch(..., 5)` without `options.asOf`, then filters those selected five games by `date`. Historical requests can lose valid older evidence because the helper already selected the last five relative to now. Pass the cutoff into the helper before slicing.
- A minimum of two observed games excludes new current-season players; an empty result falls back to prior-year veterans. Rookies need a clearly labeled current projection/roster path, not an invented prior NFL sample. A returning veteran's prior season must remain explicitly labeled and must not establish his present role.
- Current measured fields do not establish routes, snap share, coverage matchups, designed QB rushes, individual red-zone opportunities, or a current starting role. Team totals/market context do not prove a player-level matchup advantage. No locked injury handling should change in this work.

## Optional data paths and reasons to defer them

**nflverse:** PBP and player/team stats update after game days; later corrections matter. Schedules update every five minutes in-season, rosters/depth charts daily, and PFR snap-count updates depend on upstream availability. Participation data from 2023 onward arrives after the postseason, so it cannot provide live 2026 routes. Its injury feed documentation reports the source died after 2024. None is needed for the first BDL-backed version. [Update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html), [participation](https://nflreadr.nflverse.com/reference/load_participation.html)

**Sleeper:** The current API says it is free for **non-commercial** use; commercial use requires discussing licensing. League scoring/rosters and waiver budget/priority could enable actual personalization later, but there is no need to introduce that dependency now. Trending counts are not roster percentages. Its full player directory should be cached and requested at most daily. [Current Sleeper API terms and capabilities](https://docs.sleeper.com/)

**Practical trust boundary:** provider projections are estimates, dated logs are observations, and Gary's recommendation is interpretation. The page should make those roles clear without replacing useful advice with a wall of methodology.
