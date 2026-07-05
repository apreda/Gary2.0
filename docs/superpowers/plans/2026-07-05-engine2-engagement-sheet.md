# Engine 2 — Daily Engagement Sheet Implementation Plan

> Executed inline Jul 5 2026 (founder: "set this up", checkpoints waived earlier today). Spec: §6 of
> `docs/superpowers/specs/2026-07-05-social-growth-three-engines-design.md`.

**Goal:** Every morning, a token-gated mobile page with 8-10 drafted Gary replies under big open-reply
sports accounts' fresh tweets. The founder opens it from his phone, taps through to X, pastes, sends —
15 min/day of borrowed reach that the API ban can't do for us.

**Architecture:** One new self-contained edge function `engagement-sheet` (helpers copied from
`gary-mention-reply`: signed OAuth GET, Gemini w/ thinking-low) + two tables. `?generate=1&token=` builds
the day's sheet (X recent-search over a curated handle list → engagement+slate-relevance scoring → one
pro-model draft per target); the bare `?token=` URL serves the page. Deployed `--no-verify-jwt` so a phone
browser can open it; a random `SHEET_TOKEN` secret is the gate. pg_cron regenerates daily 14:30 UTC
(10:30a ET, after picks exist).

## Decisions locked here

- **Outbound only, no reply-backs section:** replies to Gary's own posts implicitly @-mention him, so the
  live mention bot already answers them within ~60s. A sheet section would duplicate it.
- **Fabrication guard:** targets matched to a slate team get drafts grounded in that pick's rationale (one
  real number allowed, lean allowed). Unmatched targets get drafts that react ONLY to the tweet's own
  content — opinion/counter-take/question, zero external stats. Model may `{"skip":true}`.
- **Never promotional:** no links, no app mentions, no "tail me" — the profile does the converting
  (X_CONVERSION_STRATEGY reply rules).
- **Caps:** ≤10 rows/day, one per author/day, ≥5 weighted engagement floor, 6h freshness window.
- **Targets are data:** `engagement_targets` table (handle + note + active), seeded ~18 MLB/WC/media
  accounts; founder edits rows, no redeploys.
- **Costs:** 2-3 recent-search reads/day (~1¢) + ~10 Gemini pro drafts (cents). Zero idle cost.

## Tasks

1. **Migration** `engagement_tables`: `engagement_targets(handle text pk, note text, active bool default
   true, added_at)` seeded; `engagement_sheet(id uuid pk, sheet_date date, author text, author_name text,
   tweet_id text, tweet_text text, eng int, matched_pick text, draft text, url text, created_at)`, index on
   sheet_date; RLS on, no anon policies (service-role only — the function is the only reader).
2. **Edge fn `engagement-sheet`** (view + generate modes as above), `SHEET_TOKEN` secret (openssl rand),
   deploy `--no-verify-jwt`. Verify: `?generate=1&dry_run=1` shows scored targets + drafts; live generate
   writes rows; the token URL renders the page; a wrong token 401s.
3. **pg_cron** `engagement-sheet-daily` at `30 14 * * *` (net.http_post, anon bearer, URL carries
   `?generate=1&token=`). Commit, memory update, hand the founder the bookmark URL.
