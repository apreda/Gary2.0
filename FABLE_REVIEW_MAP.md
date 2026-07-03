# Gary 2.0 — Full-System Map for Fable

Purpose: this doc lets Fable review Gary 2.0 end-to-end (pick engine, social posting, database/pipelines, iOS app, web app) without spending tokens rediscovering structure. Built 2026-07-02 via direct filesystem exploration (not assumption) — every path below was verified to exist at that date. Where docs/memory disagreed with actual code, the disagreement is flagged explicitly rather than silently resolved, since that's exactly the kind of thing a review should catch.

Repo root: `/Users/adam.preda/Desktop/Gary2.0/`. Two similarly-named directories exist — don't confuse them:
- `gary2.0/` (lowercase) — the Node/JS backend: pick engine, Supabase functions, scripts.
- `ios/GaryApp/` — the SwiftUI iOS app.
- `web/` — the Next.js marketing/pricing site (betwithgary.ai).

Git state at time of writing: branch `main`, in sync with `origin/main`, only an uncommitted `.claude/settings.local.json` tweak (tooling, not app code).

---

## 0. What Gary Is (read this first)

Gary is an AI sports betting **picks** platform (NBA, NFL, NHL, NCAAB, NCAAF, MLB, 2026 World Cup) built for the sports betting **fan** — drama/recap/conviction, not a quant EV/CLV tool. Two-model architecture: **Gemini 3 Flash** (research assistant — investigates with tools) hands findings to **Gemini 3.5 Flash "Gary Pro"** (the decision-maker) who evaluates and writes the pick in first-person character voice. Gary the character must **never** say he's an AI/model/bot in any user-facing copy (app or social) — this is a hard, founder-enforced rule, not a suggestion.

The single most important cross-cutting rule in this codebase: **Layer 3 prompt discipline** (see `gary2.0/CLAUDE.md`). Prompts fed to Gary may state facts (Layer 1) and ask investigative questions (Layer 2), but must NEVER pre-conclude what a factor means for the pick (Layer 3 — e.g. "high pace = underdog can hang"). Gary follows if/then instructions literally, so a Layer 3 leak in any constitution file silently biases every pick of that type. **Any review of `constitution/*.js` files should specifically grep for Layer 3 violations.**

Second most important: **fabrication prevention**. There's a documented history (Jun 4 2026 stat-accuracy crisis, Jun 25 WC name-resolution bug) of Gary citing stats that were never actually shown to him (leaking from training-data memory instead of the live tape). Fix philosophy is explicitly **prevent, don't detect** — root-cause bad prompts/data rather than bolting on a post-hoc checker. `statAudit.js` (§2.6) is the one sanctioned detection layer; it exists as a safety net, not the primary defense.

---

## 1. Locked / do-not-touch areas

These are user-approved and explicitly should not be restyled or altered without direct confirmation (see `gary2.0/CLAUDE.md` for full text):
- **Picks page, Game Pick Card, Prop Pick Card/Slip, Home front page** UI designs (iOS) — locked June 2026.
- **Injury handling logic** (`ballDontLieService.js`, `bdlInjuries.js`, `bdlPlayers.js`) — labels FRESH/PRICED IN/Out For Season/etc. are intentional, don't touch without explicit confirmation.
- No code edits without explicit user approval — this applies to the project generally (`gary2.0/CLAUDE.md`: "No Edits Without Approval"). A review agent should treat this as **read-only unless told otherwise** — report findings, don't patch them.

---

## 2. Backend Pick-Generation / Agentic Engine

All paths repo-relative to `gary2.0/`. Model policy enforced in `orchestratorConfig.js`: Gemini 3.x only.

### 2.1 Orchestrator (`src/services/agentic/orchestrator/`)
- `agentLoop.js` — the main iterative loop: tool calls, bilateral-case validation, investigation-sufficiency detection, invokes `statAudit.js` before a pick ships.
- `orchestratorMain.js` — entry point; scout-report caching (3hr TTL, disk cache keyed by date+sport+matchup+gameId), shared between game picks and props.
- `passBuilders.js` — builds Pass 1 (battlegrounds, no pick yet) / Pass 2.5 / Pass 3 prompts per sport; props schema/tool defs.
- `responseParser.js` — parses Gary's tool-call/text output into normalized pick objects.
- `statAudit.js` — post-generation fabrication check (§2.6).
- `flashAdvisor.js` — Flash research-briefing builder + 429 model-switch fallback logic.
- `sessionManager.js` — Gemini session/caching (thought signatures, 15 min TTL).
- `orchestratorHelpers.js`, `investigationFactors.js`, `spreadEvaluationFactors.js` — per-sport factor lists, investigation-sufficiency checks.
- `costTracker.js` — per-pipeline token/cost logging.

### 2.2 Constitution (`src/services/agentic/constitution/`)
Per-sport rulebooks injected into prompts — **this is where Layer 3 violations would live if they exist**: `nbaConstitution.js`, `nflConstitution.js`, `mlbConstitution.js`, `nhlConstitution.js`, `ncaabConstitution.js`, `ncaafConstitution.js`, `soccerConstitution.js`, plus props variants (`nbaPropsConstitution.js`, `nflPropsConstitution.js`, `mlbPropsConstitution.js`, `nhlPropsConstitution.js`, `wcPropsConstitution.js`) and shared `propsSharpFramework.js`. Aggregated via `constitution/index.js`'s `getConstitution()`. **No standalone GARY_VOICE.md inside gary2.0/** — Gary's in-pick voice is defined inline in these files (the root-level `GARY_VOICE.md` at `Gary2.0/GARY_VOICE.md` governs social copy, a different surface — see §3.5).

### 2.3 Props pipeline
Context builders (fetch+shape player data before Gary reasons): `nbaPropsAgenticContext.js`, `mlbPropsAgenticContext.js`, `nhlPropsAgenticContext.js`, `nflPropsAgenticContext.js`, `wcPropsAgenticContext.js` (World Cup, uses API-Football + BDL FIFA), shared in `propsSharedUtils.js`.

### 2.4 Scout report (`src/services/agentic/scoutReport/`)
Pre-game research briefing builder: `scoutReportBuilder.js` (incl. Gemini grounding search), `gameSignificanceGenerator.js`, per-sport assembly in `sports/{mlb,nba,nhl,nfl,ncaab,ncaaf,soccer}.js`, shared helpers in `shared/{dataFetchers,flashReportAssembler,grounding,propsUtilities,taleOfTape,utilities}.js`.

### 2.5 Tools (`src/services/agentic/tools/`)
`toolDefinitions.js` (Gemini function-calling schema + per-sport token budgets); `statRouters/` dispatches tool calls to real data services per sport (`{mlb,nba,nhl,nfl,ncaab,ncaaf,soccer}Fetchers.js`).

### 2.6 Fabrication prevention
`orchestrator/statAudit.js` — extracts numeric claims from a pick's rationale and verifies each traces to data actually shown to the model in-session (scout report, tool responses, grounding). Built after the Jun 4 2026 stat-accuracy crisis. `agentLoop.js` calls it to force one corrected rationale before shipping; attaches warnings if claims still don't trace. Matching is presence-based (number must appear anywhere in provided data — a review could reasonably ask whether this is too loose, e.g. false negatives from coincidental number matches).

### 2.7 Flash research assistant
`orchestrator/flashAdvisor.js` (briefing builder) + `agentic/flashInvestigationPrompts.js` (per-sport Socratic investigation checklists — "Flash handles thoroughness, Gary handles judgment").

### 2.8 Data-source integrations (`src/services/`)
- `ballDontLie/` (split module) + `ballDontLieService.js` — primary multi-sport source (games, players, odds, injuries), NBA/NFL/NHL/MLB/NCAAF.
- `ballDontLieOddsService.js` — game-level odds via BDL V2.
- `baseballSavantService.js` — free Statcast xStats, no API key.
- `mlbStatsApiService.js` — free MLB Stats API.
- `apiFootballService.js` — World Cup gap-filler (api-sports.io) for recent international form BDL FIFA lacks.
- `fifaWorldCupService.js` — BDL FIFA wrapper.
- `nbaInjuryReportService.js` — RapidAPI NBA injuries (replaces unreliable Gemini-grounding injury extraction).
- `moneyPuckService.js`, `nhlStatsApiService.js` — NHL advanced stats.
- `ncaabMetricsService.js` (Barttorvik T-Rank), `ncaabVenueService.js` (Highlightly API).
- `oddsService.js` / `propOddsService.js` — now BDL-sourced (Odds API deprecated).
- `tank01DfsService.js` — DFS salaries (NBA/NFL) — **note: DFS feature itself was dropped Jul 2 2026, see §4 migration `20260702_drop_dfs_and_talk_tables.sql`; this service file may now be dead code worth flagging.**

### 2.9 Grading / results
- `supabase/functions/grade-results/index.ts` — cloud pg_cron edge fn, grades game picks on final.
- `supabase/functions/grade-props/index.ts` — cloud pg_cron edge fn, grades props (MLB + WC active); finality-gated, dedup'd, writes `prop_results`.
- `scripts/run-all-results.js` — legacy laptop-based grading (all sports); being phased out in favor of the two edge functions above. **Worth checking it hasn't silently diverged from the cloud logic it's supposed to mirror/be superseded by.**
- `src/services/soccerGrading.js` — soccer-specific grading helper.

### 2.10 CLI entry scripts (`scripts/`)
`run-agentic-picks.js` (main game-pick generator, per-game), `run-agentic-{nba,mlb,nhl,nfl}-props.js`, `run-agentic-props-cli.js` (shared harness), `run-wc-props.js`, `run-mlb-hr-picks.js`, `run-daily-slate.js`, `run-tomorrow-board.js`, `run-fact-checks.js`, `run-game-recaps.js`, `run-night-highlights.js`, `run-streaks.js`, `poll-live-scores.js`, `send-scheduled-push.js`, `scheduler.js` (§4.3).

---

## 3. Social Media / X Automation

All paths repo-relative to `Gary2.0/`.

### 3.1 Main auto-poster
`gary2.0/supabase/functions/social-auto-post/index.ts` (693 lines). Header comment says **v11 "conversion-first redesign"**; last inline change dated Jun 29 2026 — **memory/docs call this "v16," code header says v11; the version number in comments is stale/inconsistent, treat the code as ground truth, not the header string.**

Runs hourly at :45 UTC. Modes by ET hour: 10→recap, 12→personality (see flag below), 11/14/17/20→pick mode (MLB, cap 3/day); WC card mode runs every hour independently. Copy generated via Gemini (`GEMINI_API_KEY`/`GEMINI_MODEL`), structured JSON parsing, with hard-coded `VOICE_RULES` (11 rules) plus deterministic `killDashes`/`killEmoji`/`clean` code-level backstops in case the LLM violates rules.

**Flags found (real discrepancies, worth a review pass):**
- `runPersonalityMode` is **retired as of Jun 29 2026** (early-returns unless dry-run) but the file's own top-of-file summary comment still lists "daily personality" as active.
- Calls out to `post-single-tweet`, `post-reply-tweet`, `get-tweet-metrics` Supabase functions that **do not exist** in the local `supabase/functions/` tree — either deployed-only and never committed, or removed post-deploy and never cleaned up.
- `CLAUDE_MARKETING.md` (project root) instructs using 2-3 hashtags per post; both the code's `VOICE_RULES` and `X_CONVERSION_STRATEGY.md` say "no hashtags, ever." `CLAUDE_MARKETING.md` is stale and contradicted by shipped behavior.
- The local results-card image job (§3.4) is called "paused" in `social-auto-post`'s comments, but its launchd plist has no `Disabled` key — can't confirm actual load state from static files alone.

### 3.2 Related edge functions (`gary2.0/supabase/functions/`)
- `gary-mention-reply/index.ts` — reactive @-mention bot ("Grok for Gary"), pg_cron ~90s, pivots every reply to a real pick from `daily_picks` (never invented). Caps: 10/run, 30/hr global, 2/hr per user. Spec: `docs/superpowers/specs/2026-06-26-gary-mention-reply-bot-design.md`.
- `reply-engine-scan/index.ts` — scans replies-to-Gary's-posts, drafts into `reply_queue` (never posts itself).
- `reply-engine-send/index.ts` — posts only human-approved `reply_queue` rows, enforces caps from `reply_engine_config`.
- `post-tweet-media/index.ts` — raw X API v2 poster (up to 4 images, OAuth 1.0a); used by WC card mode and the local results-card poster.
- `post-delete-tweet/index.ts`, `update-x-banner/index.ts` — utility functions.
- Governing scope doc: `Gary2.0/REPLY_ENGINE_SCOPE.md` — explicitly states it does not touch `social-auto-post`.

### 3.3 Local (non-Supabase) scheduling
Scheduled via **launchd on the founder's Mac**, not repo-tracked cron: `~/Library/LaunchAgents/com.gary2.results-card.plist` runs `post-daily.cjs` at 11:00am local, depends on the 6:45am `com.gary2.daily-results` grading job. This is the "local setup fundamentally unreliable" problem referenced in memory (`project_scheduler_cloud_migration.md`) — social posting itself has a laptop dependency baked in via this one plist even though the main tweet-generation function is cloud-hosted.

### 3.4 Daily Results Card system (`gary2.0/results-card/`)
- `post-daily.cjs` — entry point: fetches yesterday's ET-date Winners + YTD record, builds a $100/pick P/L card, rotates through **7 founder-picked designs** (never repeats two days running), renders via headless Chrome, posts image-only (no caption) via `post-tweet-media`. Idempotent via `out/.posted-<date>` marker files.
- `render.cjs`, `lib.cjs` — rendering/data-fetch/posting internals.
- **Note:** `web/app/api/results-card/route.tsx` and `web/app/api/pick-card/route.tsx` (Vercel OG routes) exist but are **not referenced by any current posting code** — likely stale/superseded by `pick-card-app`.

### 3.5 Voice/copywriting docs (project root)
- `GARY_VOICE.md` — Gary's character/persona bible; defers to `SESSION_HANDOFF.md` on posting-mechanics conflicts.
- `X_CONVERSION_STRATEGY.md` (Jun 16 2026) — growth strategy, source of the actually-implemented zero-emoji/no-hashtag/"give the pick hold the depth" policy; supersedes `SESSION_HANDOFF.md` on impressions framing.
- `CLAUDE_MARKETING.md` — **stale, contradicted by code** (see §3.1 flag).
- `SESSION_HANDOFF.md` — posting-mechanics doc, referenced by both other docs.
- `REPLY_ENGINE_SCOPE.md` — reply-engagement scope/boundary doc.

### 3.6 Credentials (names only)
`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` (OAuth 1.0a); `GEMINI_API_KEY`/`GEMINI_MODEL`; `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`; `CARD_BASE_URL`.

### 3.7 Persona/anti-fabrication guardrails
Embedded in code, not a separate policy file. `VOICE_RULES` constants (in `social-auto-post/index.ts` and `gary-mention-reply/index.ts`) ban: self-identifying as AI/model/bot/"trained"/"simulation"; importing outside facts beyond provided ground truth; emojis, em/en dashes, hashtags, links, "rule of three," corny capper lines, third-person brand narration (must be first-person). Deterministic `killDashes`/`killEmoji`/`clean` functions backstop the LLM.

---

## 4. Database + Data Pipelines / Scheduling

### 4.1 Supabase setup
`gary2.0/supabase/migrations/*.sql` (dated 2026-01-05 → 2026-07-02) — **only recent tables are migration-tracked.** Core tables referenced constantly in code (`daily_picks`, `game_results`, `prop_results`, `user_picks`, `bankroll`, `reply_queue`, `reply_engine_config`, `user_entitlements`) have **no CREATE TABLE migration in-repo** — they predate migration tracking or were created via dashboard/MCP. A schema review needs to pull these from the live DB (e.g. via the Supabase MCP `list_tables`), not from migration files.

**Tables with in-repo migrations:** `test_daily_picks` (dev mirror of `daily_picks`), `wire_items`/`market_pulse` (Home page feed), `app_events` (funnel analytics via `log_app_event` RPC), `live_scores` (+outs/bases columns), `game_recaps` (+bullets), `night_highlights`, `streaks`, `pick_fact_checks`, `daily_slate`, `today_board`/`tomorrow_board`, `insight_connections` (+grading/meta), `player_insight_cards`. `pick_context`, `dfs_lineups`, `test_dfs_lineups` were **dropped** by `20260702_drop_dfs_and_talk_tables.sql` (DFS + Talk-to-Gary features removed Jul 2 2026 — this migration's own comment says it is **not yet applied**, worth verifying it actually ran).

**Flag:** no `link_clicks` table found anywhere despite the web app's `/get` redirect route inserting into it (`web/lib/gary/supabase.ts`) — either the table exists live but untracked, or that insert is silently failing. Worth checking directly.

### 4.2 Supabase Edge Functions inventory (`gary2.0/supabase/functions/`)
`delete-account`, `gary-mention-reply`, `grade-props`, `grade-results`, `live-scores` (~1 min poll), `mlb-field-lineups` (~30 min poll), `post-delete-tweet`, `post-tweet-media`, `update-x-banner`, `reply-engine-scan`, `reply-engine-send`, `social-auto-post`, `stripe-webhook`. **No `cron.schedule(...)` SQL found in any tracked migration** — pg_cron jobs referenced in code comments were set up live via dashboard/CLI, not version-controlled. A review can't fully verify cadence from the repo alone.

### 4.3 Scheduler (`gary2.0/scripts/scheduler.js`, 689 lines)
Builds per-game trigger schedule at T-90/60/30/15 min before each game for NBA/NHL/MLB/WC, calls `run-agentic-picks.js`/props scripts per trigger. Modes: default 24/7 loop, `--now`, `--plan`. Has an `unhandledRejection` handler and in-process restart-on-transient-network-error logic — direct scar tissue from **4 separate total-pick-loss incidents in June-July 2026** (laptop sleep, launchd KeepAlive/watchdog decoupling) documented in memory (`project_scheduler_cloud_migration.md`). `gary2.0/DEPLOY_CLOUD.md` proposes moving this off the laptop entirely; **status is aspirational** — no `railway.json`/`Procfile`/`render.yaml` exists, so this is still a manual runbook, not a completed migration. This is probably the single highest-value area for Fable to scrutinize for reliability risk.

### 4.4 launchd / pg_cron
No `.plist` files exist in the repo (installed directly on the operator's Mac, untracked). Named jobs referenced only in prose: `com.gary.scheduler`, `com.gary.scheduler-watchdog`, `com.gary2.live-scores`, `com.gary2.results-card`, `com.gary.keepawake` (the last two are also absent from `gary2.0/` proper — mentioned in project memory, not discoverable from code).

### 4.5 External APIs
See §2.8 — same service files serve both pick generation and general data pipelines.

---

## 5. iOS App (`ios/GaryApp/`)

Xcode project generated via **XcodeGen** from `project.yml`. Bundle ID `ai.betwithgary.app`, min iOS 16.0, marketing version 2.17 (build 5). Only Firebase dependency is FirebaseMessaging (push).

**Structural note:** this is NOT organized into Views/Models/Services folders — it's a flat layout with a few large monolithic files:
- `Views.swift` (~1.2MB) — nearly all SwiftUI views AND the brand/design-system constants.
- `Models.swift` (~80KB) — shared data models/formatters.
- `SupabaseAPI.swift` (~62KB) — entire networking layer (`enum SupabaseAPI`, `actor APICache`).
- `ContentView.swift` — app root/tab container. `GaryApp.swift` — `@main` entry.
- `AuthManager.swift`, `AuthView.swift` — Sign in with Apple (`AuthenticationServices`).
- Standalone feature files: `SettingsView.swift`, `ChangelogView.swift`, `AccessView.swift` (pre-auth landing), `MLBGameIntelView.swift`, `WCGameIntelView.swift`, `MLBBallparks.swift`, `AppFlags.swift`.
- `Fonts/` — bundled display fonts (Anton, BebasNeue, Oswald, Teko).
- `ci_scripts/ci_post_clone.sh` — Xcode Cloud CI hook.

### 5.1 Key views (all in `Views.swift` unless noted, with approx. line numbers at time of writing — will drift, use as a starting search point not gospel)
`HomeView` (~1721), `AccessView` (separate file), `GaryPicksView` (~8140), `PremiumPicksView` (~6001), `PicksCarouselView` (~18919), `BillfoldView` (~11598, Winners/results tab), `PropsHubView` (~21041), `GaryPropsView` (~8623), share-card views `SharePropCardView`/`HeadlineSharePropCardView` (~15762/16059). No separate `PaywallView` — gating logic lives in `GaryPricing` + `PremiumPicksView`.

### 5.2 Brand/design-system source of truth (enums in `Views.swift`)
`GaryColors` (~1449), `GaryFonts` (~26268 — single source of truth for typefaces), `GaryBrand` (~14253 — logo mark constant), `GaryPricing` (~5956 — **hardcoded display prices with inline comments warning they must be manually kept in sync with Stripe Payment Links/webhook** — a real drift risk worth checking), `TeamColors` (~18806).

### 5.3 Networking & payments
`SupabaseAPI.swift` is the entire API client. `Secrets.swift` holds the Supabase URL/anon key; `SecretsLocal.swift`/`.example` for local-only secrets. **Payments are Stripe Payment Links opened in-app via `SFSafariViewController`, not native StoreKit/IAP** — StoreKit is imported only for App Store review prompts. Entitlements are granted server-side by `gary2.0/supabase/functions/stripe-webhook`. This is worth a security-minded look: payment-link-based flows plus manually-synced display prices are two independent places pricing can silently drift from what's actually charged.

### 5.4 App Store docs
`ios/GaryApp/AppStoreMetadata.md`, `Gary2.0/APPSTORE_LISTING_2.17.md`, `Gary2.0/SIWA_FIX_2.17.md` (Sign-in-with-Apple entitlement fix, per memory: pushed Jun 28, awaiting real-device TestFlight verification by the founder — check if that's since happened before assuming it's resolved).

---

## 6. Web App (`web/`) — betwithgary.ai

Next.js **16.2.7** (App Router), React 19.2.4, Tailwind v4, TypeScript, Vitest. `web/AGENTS.md` explicitly warns this Next version has breaking changes vs. typical training-data knowledge — **consult `node_modules/next/dist/docs/` before writing Next.js code here**, don't assume familiar APIs.

### 6.1 Key routes (`web/app/`)
`page.tsx` (home), `pricing/page.tsx`, `terms/page.tsx` (explicitly references Stripe-billed subscriptions), `privacy/page.tsx`, `press/page.tsx` (brand kit), `how-it-works/page.tsx`, `app/page.tsx` (download funnel), `picks/page.tsx` + `picks/[sport]/page.tsx`, `props/page.tsx`, `results/page.tsx` + `results/[sport]/page.tsx`, `hub/page.tsx`, `contact/page.tsx`, `get/route.ts` (App Store redirect + click logging — see §4.1 flag), plus SEO/AI-marketing machinery (`llms.txt/route.ts`, `feed.xml/route.ts`, `sitemap.ts`, `robots.ts`, OG image routes). API routes for share-card images: `api/pick-card/`, `api/pick-card-app/` (this one is live-used by social posting), `api/take-card/` (superseded, see §3.4), `api/results-card/` (superseded, see §3.4).

### 6.2 Deployment
Single Vercel project `gary2.0` (confirmed via `.vercel/project.json` at both repo root and `web/`, matching `projectId`). No `vercel.json` anywhere — root-directory config lives in the Vercel dashboard, not the repo.

### 6.3 Design system
"Warm-gold rebrand" tokens live in `web/app/globals.css` (Tailwind v4 `@theme` block) — comments explicitly call out "warm blacks, R ≥ B on every surface... blue-leaning dark palette is the generic-AI tell." Full rationale/spec: `docs/superpowers/specs/2026-06-04-betwithgary-web-rebuild-design.md`.

### 6.4 Analytics
`web/lib/gary/analytics.ts` posts to Supabase RPC `log_app_event` → `app_events` table (shared with iOS). `get/route.ts` inserts into `link_clicks` on each App Store redirect click (see §4.1 flag — table not found in migrations).

### 6.5 Open items noted in web docs
RLS tightening flagged as unresolved: `push_tokens` (anon read+write — leak risk) and `pick_context` (public SELECT exposes proprietary reasoning — **though note `pick_context` was dropped Jul 2 per §4.1, so this concern may now be moot, worth reconciling**). Anon SELECT policy text for legacy tables (`daily_picks`, `prop_picks`, `game_results`) isn't in repo migrations, only in the Supabase dashboard — can't verify from code alone.

---

## 7. Cross-Cutting Flags Worth a First Pass

These surfaced organically during mapping, not from a targeted audit — treat as leads, not conclusions:

1. **Version-string drift**: `social-auto-post`'s in-code header comment ("v11") disagrees with memory's tracking ("v16") and with its own top-of-file feature summary ("personality mode active" when the code retires it). Docs-vs-code drift here specifically, not elsewhere yet confirmed.
2. **Orphaned edge-function references**: `social-auto-post` calls `post-single-tweet`/`post-reply-tweet`/`get-tweet-metrics` which don't exist in the repo's `supabase/functions/` tree.
3. **`link_clicks` table**: referenced by web insert code, absent from all migrations — verify it exists live or that the insert isn't silently no-op'ing.
4. **`CLAUDE_MARKETING.md`**: stale, contradicts shipped no-hashtag policy — candidate for deletion or an explicit "superseded by X_CONVERSION_STRATEGY.md" banner.
5. **Pricing drift surface**: iOS `GaryPricing` enum hardcodes display prices that must be manually kept in sync with Stripe Payment Links + the `stripe-webhook` function — three independent places, no automated check found.
6. **Cloud migration is incomplete**: `DEPLOY_CLOUD.md` describes an always-on worker that doesn't exist yet (no Railway/Render config in repo) — the scheduler's reliability is currently bounded by the founder's laptop staying awake, despite four prior total-pick-loss incidents.
7. **DFS drop-migration not yet applied**: `20260702_drop_dfs_and_talk_tables.sql`'s own comment says it hasn't run — `tank01DfsService.js` and related DFS code may be live-but-orphaned depending on whether that migration ever executes.
8. **`pick_context` RLS concern may be moot** post-DFS-drop (§6.5) — needs reconciling against #7 above (is the table actually gone or not).

---

## 8. Suggested Review Order for Fable

1. Start with §7 (cross-cutting flags) — these are concrete, falsifiable claims a review can quickly confirm or refute against the live DB/deployed functions, higher value than a cold re-read of everything.
2. Then §2.2 (constitution files) for Layer 3 violations — the project's own stated highest-stakes review target, and something no automated test catches.
3. Then §4.3 (scheduler) for reliability — highest real-world blast radius (has caused actual production outages 4x).
4. Then spot-check §2.6 (statAudit) — is presence-based number matching actually catching fabrication, or just checking a number appears somewhere unrelated.
5. iOS/web are comparatively lower-risk (locked designs, smaller blast radius) — treat as a lighter pass unless the user asks for UI-level review specifically.
