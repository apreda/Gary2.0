# betwithgary.ai Web Rebuild — Design Spec

**Date:** 2026-06-04
**Status:** Approved by user ("love it do it!")
**Scope:** New Next.js site at `web/` (repo root), translation of the iOS app's free surfaces to web, SEO + AI-marketing-tool readiness, cleanup of the legacy web code in `gary2.0/`.

---

## 1. Goals (priority order)

1. **Real resource** — the app's free surfaces rendered on web: today's picks, the Hub (Today's Edges), props, the full graded track record.
2. **App funnel** — every surface drives to the App Store (`https://apps.apple.com/us/app/gary-ai/id6751238914`). Winners (premium best bets) is teased, never shown.
3. **AI-marketing-consumable** — structured facts, canonical copy blocks, brand assets, and live stats that AI ad tools can extract accurately (user's explicit goal: feed AI marketing tools from the site).
4. **SEO** — server-rendered, indexable pages per sport with real daily content.

**Monetization model (user-confirmed):** Web is 100% free funnel. No web auth, no Stripe, no accounts, no paywall. Premium lives in the iOS app only.

## 2. Architecture

- **Framework:** Next.js (App Router, latest) in a new top-level `web/` directory. Deployed on Vercel at betwithgary.ai (repoint existing Vercel project root, or new project + domain move).
- **Rendering:**
  - ISR ~10 min revalidate: `/picks`, `/picks/[sport]`, `/props`, `/hub`, `/` (picks land 3x daily)
  - ISR daily (or ~1h): `/results`, `/results/[sport]`
  - Client polling (60s): live score chips only, layered over server-rendered content
  - Static: `/how-it-works`, `/app`, `/press`, `/terms`, `/privacy`, `/contact`
- **Data access:** Supabase PostgREST with the **anon key, server-side** (same path iOS uses; project ref `xuttubsfgdcjfgmskcol`). Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Data layer `web/lib/gary/`** — ports the iOS logic that already solved the hard problems:
  - Polymorphic `picks` JSONB parsing (array OR stringified JSON; tolerate both `picks` and legacy `props` keys) — mirrors iOS `PicksValue<T>`/`parsePicksRow`
  - `effectiveOdds`: `game_results` has no odds column — regex `[+-]\d{3,}` from tail of `pick_text` (mirrors iOS `GameResult.effectiveOdds`); `nfl_results`/`prop_results` have odds columns
  - Record/ROI/streak computation mirroring iOS Billfold; defensive dedupe (dedup key drift across re-runs); DISTINCT-style dedupe rather than trusting one-row-per-pick
  - Hub lane mapping: `insight_connections.category` → lane (mirrors iOS `SignalKind.from(category)`); lanes incl. featured, regression_watch, gary_hr_threats, beneficiary, rest_fatigue, heat_check, platoon_edge, ballpark_shift, owned, cooling_off
  - Insight hit-rate: exclude `result IS NULL` rows or the percentage is wrong
  - EST date logic: "today" rolls over at 3am America/New_York (mirrors `SupabaseAPI.todayEST`); NFL season inference (Jan–Jul ⇒ previous year)

### Tables read (anon)
`daily_picks`, `weekly_nfl_picks`, `prop_picks`, `game_results`, `nfl_results`, `prop_results`, `insight_connections`, `player_insight_cards`, `live_scores`.

### Tables NEVER touched by web
`push_tokens`, `test_daily_picks`, `test_prop_picks`, `pick_context`, `dfs_lineups`.

### Pre-build verification
Verify anon SELECT RLS on the older core tables (`daily_picks`, `prop_picks`, `game_results`, `nfl_results`, `weekly_nfl_picks`) via Supabase dashboard/MCP — proven working via iOS but policy text is not in repo migrations.

## 3. Sitemap

| Route | Purpose | Rendering |
|---|---|---|
| `/` | Home — bear hosts: hero, live record strip, today's free top pick + top prop, how-Gary-works summary, app showcase, App Store CTA | ISR 10m |
| `/picks` | Today's full free slate | ISR 10m |
| `/picks/[sport]` | `mlb`, `nba`, `nhl`, `nfl`, `ncaab`, `ncaaf`, `world-cup` | ISR 10m |
| `/props` | Today's props + Gary Home Run Threats lane (sport label `MLB HR`) | ISR 10m |
| `/results` | Public Billfold-lite: W-L-P, win %, ROI, streaks, by-sport | ISR 1h |
| `/results/[sport]` | Per-sport record | ISR 1h |
| `/hub` | Today's Edges — insight lanes + player breakdown sheets (`player_insight_cards`) | ISR 10m |
| `/how-it-works` | Methodology (accurate: research assistant + Gary's call — NO "3 models" claim; correct sport list incl. 2026 World Cup) | static |
| `/app` | App showcase — screenshots, feature walkthrough, Winners tease, download CTA | static |
| `/press` | Brand kit + canonical copy: logos, taglines, boilerplate ×3 lengths, live key stats | static + live stats |
| `/terms`, `/privacy` | Rewritten on `.ai` domain; remove dead-feature references (chat/UGC, bet/fade local storage, web DFS) | static |
| `/contact` | Wired (was orphaned); `support@betwithgary.ai` | static |
| `/llms.txt` | Structured product facts for AI tools | static |

- **Dropped:** `/changelog` (stale; markets dead tech) → 301 to `/`.
- **Excluded:** DFS (de-listed from app).
- Mobile UA-redirect behavior from the old site is replaced by responsive design (no separate MobileLanding).

## 4. Design language — "Quant Terminal" on web

Tokens traced from code (`GaryColors` Views.swift ~1381, `GaryFonts` ~17055) — code is canon, not the brand PDF.

- **Colors:** gold `#C9A227` (rationed: one hero per screen; the pick + Gary's voice only), lightGold `#E8D48B`, silver `#C7CCD6` (props twin), bg `#08080A`, card `#15171C`, inner chip `#1C1F26`, elevated `#1A1A1E`. Results: `#3FB950` win / `#E5484D` loss on pick contexts; `#22C55E` / `#EF4444` in charts. Gold gradient `#E8D48B → #C9A227 → #8B6914`.
- **Sport accents** (dot/badge-sized ONLY, never card outlines): NBA `#3B82F6`, NFL `#22C55E`, NHL `#00A3E0`, NCAAB `#F97316`, NCAAF `#DC2626`, MLB grass `#7BC267` (light variant for text), WC teal `#14B8A6`. MLB field-gradient eyebrow: `#7BC267 → #C9A66B → #EDEDE6`.
- **Fonts** via `next/font/google`: Barlow Condensed (700) display / Inter body / JetBrains Mono data+eyebrows. Never editorial serif or default mono as a "choice".
- **Grammar echoed from app:** Terminal Tape toggle (sliding gold underline), status-bar header (`REC w-l · win% | N PLAYS LIVE | league codes`), matte cards with ONE metal hairline (gold=game, silver=prop), inner matte chip for the pick, radii 20/12/10, black depth shadow, **no glows/neon**.
- **7 anti-slop guardrails apply** (ration gold; hierarchy via weight/space/elevation; no wide-tracked uppercase outside terminal eyebrows; nav ≠ filter styling; bear is a grounded character; zone it).
- **Zoning:** `/` = warm front door, bear hosts (real `GaryIconBG.png` assets, warm black, no blue tint, never AI-generated bear). `/picks` `/results` `/hub` = the terminal. "The bear hosts; the data closes."
- **A11y (fix inherited failures):** body text ≥55% white on `#08080A`; essential labels ≥11px; respect `prefers-reduced-motion`.
- **Copy voice:** plain, professional, understated. No funnel hooks, no hype, no rhetorical questions. Tagline locked: "Every Game. Everyday. Always Free."

## 5. SEO + AI-marketing machinery

- **JSON-LD:** `SoftwareApplication` + `Organization` site-wide (carry over from old index.html, corrected); `FAQPage` on `/how-it-works`; `ItemList` on picks pages; sport metadata on results pages.
- **Dynamic OG images** (`next/og`): branded 1200×630 cards; per-sport picks pages bake in live record. Replaces the square `coin2.png` OG.
- **`/press` + `/llms.txt`:** locked tagline, approved boilerplate (short/medium/long), live key stats, downloadable real-bear assets — accurate source material for AI ad generation.
- **`sitemap.xml`** generated with all content routes + lastmod; `robots.txt` permits major AI crawlers intentionally.
- **Metadata API** per route (title/description/canonical/OG/Twitter); `apple-itunes-app` smart banner retained.

## 6. Cleanup of `gary2.0/` (after new site is live on Vercel)

**Delete (web surface):** `src/pages/`, `src/components/`, `src/App.jsx`, `src/main.jsx`, `index.html`, `src/styles/`, `src/assets/css/`, `api/gemini-proxy.js`, `api/generate-dfs-lineups.js` (verify nothing external calls them first), web-only deps (`react`, `react-dom`, `react-router-dom`, `react-helmet-async`, `@vercel/analytics`, `framer-motion`, `lucide-react`, tailwind/postcss/vite-react plugins as applicable), `vercel.json`, stale `dist/`.
**Fix:** remove `admin-services` manualChunks landmine from `vite.config.js` (or remove vite build entirely if no web remains; **keep vitest** — pipeline tests use it).
**Migrate to `web/public/`:** `coin2.png`, `GaryIconBG.png` (from iOS assets), any keeper imagery.
**Untouched (pipeline):** everything else in `src/services/`, `scripts/`, root runners (`run-insight-connections.js`, `run-grade-insights.js`), `supabaseClient.js` Node path (`storeDailyPicks`), all `npm run picks/gary` scripts, GitHub Actions workflows, `supabase/`.
**Keep `src/services/performanceService.js` logic** — port its three queries to `web/lib/gary/` then it can be deleted with the rest.

## 7. Flagged follow-ups (not in this build)

- Legal emails default to `@betwithgary.ai` — **user must confirm mailboxes receive mail**.
- RLS tightening: `push_tokens` (anon read+write — leak risk) and `pick_context` (public SELECT exposes proprietary reasoning). Separate pass after launch.
- Real server-side premium entitlement (iOS paywall is a cosmetic local flag) — only matters if web ever sells premium; out of scope.

## 8. Risks / guardrails

- **Do NOT touch the Node pipeline** under `gary2.0/src/services/` — iOS + cron depend on it. The old web code is the only deletion target.
- Branch off `main` for all work; do not sweep up the user's uncommitted iOS changes (`SupabaseAPI.swift`, `Views.swift`, xcuserstate).
- Vercel cutover sequencing: new site must build + render with real data before repointing the domain.
- Insight rows with `result = NULL` excluded from hit rates; results tables deduped defensively.
- All copy claims verified against current reality (2-model pipeline described as roles, current sport list, no dead-tech references).
