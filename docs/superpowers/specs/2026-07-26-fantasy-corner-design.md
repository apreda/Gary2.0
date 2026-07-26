# FANTASY CORNER — Design Spec (Hub, season-long fantasy baseball)

**Date:** 2026-07-26 (founder directive: "review The Hub and build out a fantasy corner" for ESPN/standard season-long leagues; reviewed ESPN/Rotowire/Yahoo feature sets against what the Hub already computes)

**One line:** The Hub grows a dedicated corner that answers the four questions every season-long manager asks daily — who do I add, who do I stream, who's getting saves, who's back — computed from data Gary already pulls, in Gary's voice.

## What the Hub already has (Jul 26 recon)

- `insight_connections` pipeline (local, 4x daily, ~$0) with 22 computers; a **`fantasyPickups` computer already ships** — waiver adds/streamers ranked with Savant xStats + a Gary analyst read (LLM), category token `fantasy_pickups`, Hub anchor `"fantasy"` already wired in `HubView.swift:571`.
- Fantasy-adjacent computers live today: `streaking`/`heatCheck` (hot bats), `coolingOff`, `starterForm`, `bullpenFatigue`, `platoonEdge`, `hitterRegression`, `owned` (roster/ownership context).
- `mlbStatsApiService.js` already hydrates `probablePitcher` on `/schedule` calls and does date-range schedule fetches — the exact primitives two-start detection needs.

So this is an ELEVATION, not a greenfield: the corner curates what exists and adds the three missing pillars.

## The competitive checklist (ESPN / Rotowire / Yahoo season-long staples)

| Their staple | Corner answer |
|---|---|
| Waiver wire / adds column | ✅ exists (`fantasyPickups`) — becomes the corner's lead |
| Streamer of the day | ✅ inside fantasyPickups; keep |
| **Two-start pitchers next week** | NEW computer `twoStartWeek` — count probable starts per SP over the next ET Mon-Sun via `/schedule?hydrate=probablePitcher`; list SP, both matchups, dates |
| **Closer watch / saves chain** | NEW computer `closerWatch` — saves + save-situation appearances last 14d per team from box scores; flag committee vs locked roles, recent role flips |
| **Back soon (injury returns)** | NEW computer `returnWatch` — existing injury data filtered to imminent returns (rehab/day-to-day flips), fantasy framing "activate before your league notices" |
| Rest-of-season ranks | ❌ skip — punditry we can't ground; not our fight |
| Trade analyzer | ❌ skip — tool-slop, zero Gary voice |
| Start/sit hotline | ❌ skip v1 — streamers + platoon edges cover the grounded part |

All three new computers are pure computation + the same one-cheap-LLM-read pattern `fantasyPickups` already uses. No new spend beyond pennies.

## Surfaces (iOS)

- **New file `FantasyCornerView.swift`**: the corner page — lead = Fantasy Pickups (existing data), then TWO-START WEEK, CLOSER WATCH, BACK SOON modules. Hub design language (HubFont kickers, gold hairline section heads). Reads `insight_connections` categories: `fantasy_pickups`, `two_start_week`, `closer_watch`, `return_watch`.
- **Side-nav entry "FANTASY CORNER"** in the Hub's pop-out nav + the existing `"fantasy"` anchor routes there; front page keeps/gets a one-row teaser lane (top pickup + "2 two-start arms next week") linking in.
- Flagged `AppFlags.fantasyCornerEnabled` (ship ON), one-line kill like userBook.

## Pipeline

- Three new computer files beside the existing 22, registered in `generateInsightConnections.js`; they ride the existing 4x-daily run and `insight_connections` upsert unchanged. Two-start only needs ONE morning run to be fresh (recomputes harmlessly).
- Sport scope v1: MLB only (season-long baseball is the ask). NFL corner is a Sep decision.

## Voice + laws

- Gary the sharp fantasy friend; plain copy, no slop, no ellipsis, ET dates. Numbers only from computed stats (fabrication law). This is Hub content, not the pick pipeline — Layer-3 discipline is a picks-prompt law and doesn't gag fantasy advice, but every claim stays grounded in the computed rows.

## Build order (next session, plan-file treatment like Tail/Fade)

1. `twoStartWeek` computer + verify against the real next-week schedule.
2. `closerWatch` computer + verify vs known closer situations.
3. `returnWatch` computer.
4. `FantasyCornerView.swift` + side-nav entry + front teaser (hot-file protocol on HubView mounts).
5. Verify loop: pipeline run → rows in `insight_connections` → corner renders → suite/build gates.
