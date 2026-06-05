# betwithgary.ai Web Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new betwithgary.ai — a Next.js site in `web/` that renders the Gary app's free surfaces (picks, props, Hub, track record) from public Supabase data, funnels to the App Store, is SEO-crawlable, and feeds AI marketing tools — then delete the legacy web code from `gary2.0/`.

**Architecture:** Next.js App Router (ISR for content pages, client polling only for live scores) reading Supabase PostgREST with the anon key server-side. A `lib/gary/` data layer ports battle-tested iOS logic (polymorphic JSONB parsing, odds-tail regex, units math, lane mapping, 3am EST rollover). Design language is the app's "Quant Terminal": gold `#C9A227` rationed on near-black `#08080A`, Barlow Condensed / Inter / JetBrains Mono.

**Tech Stack:** Next.js (latest, App Router, TypeScript), Tailwind CSS v4, next/font (Barlow Condensed, Inter, JetBrains Mono), vitest for the data layer, @vercel/analytics. No Supabase SDK — plain `fetch` against PostgREST for full ISR cache control.

**Spec:** `docs/superpowers/specs/2026-06-04-betwithgary-web-rebuild-design.md`

---

## Verified facts (source of truth for all tasks)

These were verified against the LIVE database and iOS source on 2026-06-04. Trust these over any other doc.

**Supabase:** project `xuttubsfgdcjfgmskcol`, URL `https://xuttubsfgdcjfgmskcol.supabase.co`. Anon key: copy value of `VITE_SUPABASE_ANON_KEY` from `/Users/adam.preda/Desktop/Gary2.0/gary2.0/.env`. All 9 web tables verified anon-SELECT-able via pg_policies. PostgREST caps responses at 1000 rows — paginate with `limit`/`offset`.

**Schemas (live `information_schema`, 2026-06-04):**
- `daily_picks`: `id uuid, date text, picks jsonb, created_at, updated_at` — ONE row per day, `picks` = array of pick objects
- `prop_picks`: `id uuid, date text, picks jsonb, created_at, updated_at` — NO league column on the row; league lives inside each pick
- `weekly_nfl_picks`: `id uuid, week_start date, week_number int, season int, picks jsonb`
- `game_results`: `id, pick_id uuid, game_date date, league text, result text, final_score text, pick_text text, matchup text, confidence float` — **NO odds column** (regex from pick_text)
- `nfl_results`: `id, nfl_pick_id uuid, game_date date, week_number int, season int, result varchar, final_score varchar, pick_text text, matchup text, confidence int, home_team, away_team, home_score int, away_score int` — **NO odds column either**
- `prop_results`: `id, prop_pick_id uuid, game_date date, player_name text, prop_type text, line_value numeric, actual_value numeric, result text, odds text, pick_text text, matchup text, bet text` — HAS odds column (text)
- `insight_connections`: `id bigint, date date, league text, category text, headline text, detail text, game text, value text, tone text, spark jsonb, line_val numeric, relevance_score numeric, player_id text, team_id text, game_id text, generated_by text, result text, result_note text, graded_at, meta jsonb`
- `player_insight_cards`: `id, date date, league text, player_id text, player_name text, team_abbr text, game_id text, payload jsonb`
- `live_scores`: `id, date date, league text, game_id text, away_abbr text, home_abbr text, away_score int, home_score int, status text ('scheduled'|'live'|'final'), detail text ('INN 7'/'Q3 4:12'/'FINAL'), outs smallint, bases text ('101' = 1st+3rd)`

**Live data gotchas:**
- `result` values: games/props use `won|lost|push`; insights use `hit|miss|push` (+ NULL = ungraded, EXCLUDE from hit rates)
- NFL results are SPLIT: `nfl_results` (30-29) AND `game_results` league='NFL' (4-5). Merge + dedupe on (lowercased trimmed pick_text, game_date)
- `game_results` contains legacy league `WBC` (19-16) — display as "World Baseball Classic" historical, never as active sport
- Live insight categories (verified): `ballpark, ballpark_shift, beneficiary, cooling_off, gary_hr_threats, heat_check, owned, platoon_edge, regression_watch, rest_fatigue, situational, streak, tournament`
- `spark` is a JSON array of numbers (e.g. `[0.357, 0.9]`); `tone` e.g. `"good"`
- Track record scale: ~2,532 game_results since 2025-04-30, 59 nfl_results, 4,049 prop_results
- HR Threats props carry sport label `MLB HR` inside prop objects
- Game pick objects (verified live): `pick, type ('spread'|'ml'|'total'), odds, confidence (0.5-1.0), homeTeam, awayTeam, league, sport, rationale (longform "Gary's Take"), time, venue, commence_time (ISO), pick_id, statsData[] ({name, token, home:{team,...}, away:{team,...}}), sportsbook_odds[] ({book, ml, spread, total, ml_home, ml_away, spread_odds, total_over_odds, total_under_odds}), injuries (string), is_top_pick?, moneylineHome, moneylineAway, spread, spreadOdds, total, trapAlert, soccer_* fields`
- Prop pick objects (verified live): `player, team, prop ('hits_runs_rbis 1.5'), bet ('over'|'under'|'yes'), line (string), odds (number), confidence, sport, league?, matchup, key_stats[] (strings), rationale, commence_time, td_category?, position?`

**iOS formulas to port exactly:**
- `units(for:odds:)` (Views.swift:273): won → odds>0 ? odds/100 : 100/abs(odds), **unparseable odds on a win → 0.9**; lost → -1; push → 0; anything else → 0
- `effectiveOdds` (Models.swift:1154): prefer odds column if non-empty, else regex `[+-]\d{3,}\s*$` on pick_text tail
- `todayEST` (SupabaseAPI.swift:64): before 3am America/New_York → yesterday; format `yyyy-MM-dd`
- `hubGradedDateEST`: one day before todayEST
- `fetchInsightHitRate` (SupabaseAPI.swift:406): rows where result not null; hit = count 'hit', graded = hit + miss (pushes excluded); UI shows only when graded ≥ 5
- `effectiveLeague` normalization (Models.swift:1098): league field first, fallback sport; substring matching; `nba` (not wnba)→NBA, `nfl`→NFL, `nhl`→NHL, `ncaab|ncaam`→NCAAB, `ncaaf`→NCAAF, `world_cup|worldcup|wc|soccer_world_cup`→WC, `epl|soccer_epl|premier`→EPL, exact `mlb hr`→MLB HR, `mlb|wbc`→MLB, `wnba`→WNBA, else raw uppercased
- `SignalKind.from(category)` (Views.swift:11404): case-insensitive, trimmed; `streak`→streak; `h2h|head-to-head|head_to_head|owned`→h2h; `hot|heat|heat check|heat_check`→hot; `cold|cooling|cooling off|cooling_off`→cold; `injury|replacement|beneficiary`→injury; `debut`→debut; `situational|rest|fatigue|rest & fatigue|rest_fatigue`→situational; `platoon|platoon edge|platoon_edge`→platoon; `ballpark|ballpark shift|ballpark_shift`→ballpark; `regression|regression watch|regression_watch`→regression; `tournament|stakes|group|tournament_stakes`→tournament; `gary_hr_threats|hr_threat|hr threats`→hrThreat; **unknown → null (drop row)**
- Lane chip labels (SignalKind.chip): STREAK, HEAD-TO-HEAD, HEAT CHECK, COOLING OFF, REPLACEMENT, DEBUT, SITUATIONAL, PLATOON EDGE, BALLPARK, REGRESSION, TOURNAMENT, HR THREAT
- Lane tint: hot/hrThreat green, cold/regression red, ALL OTHERS neutral white 50% ("gold diet: lane identity is neutral — gold belongs to the pick")
- Top pick selection (Views.swift:318): filter type != 'prop'; manual `is_top_pick === true` wins, else max confidence. Top props: sort confidence desc, take 2, today-only
- Status line format (Views.swift:2501): `REC 3-2 · 60%` (REC label white/40, w-l white/78, pct GOLD bold) `|` `N PLAYS LIVE` / `1 PLAY LIVE` / `AWAITING SLATE` (white/55) `|` league codes in sport accent colors. Pipes: 1px white/12
- `isLegitPropResult` (Views.swift:290): keep prop result row only if it has player_name OR prop_type OR bet OR line_value (non-empty trimmed)
- Most-recent-day record (performanceService.js): walk back day-by-day from yesterday to 7 days ago in EST, return first day with wins+losses > 0

**Design tokens (from GaryColors/GaryFonts in code — canon):**
gold `#C9A227`, lightGold `#E8D48B`, warmGold `#F4E4BA`, goldDark `#8B6914`, silver `#C7CCD6`, silverLight `#D7DCE4`, silverDim `#AEB8C4`, bg `#08080A`, card `#15171C`, chip `#1C1F26`, elevated `#1A1A1E`, win `#3FB950`, loss `#E5484D`, chartWin `#22C55E`, chartLoss `#EF4444`. Sport accents: NBA `#3B82F6`, NFL `#22C55E`, NHL `#00A3E0`, NCAAB `#F97316`, NCAAF `#DC2626`, MLB `#7BC267` (light grass for text), WC `#14B8A6`. Fonts: Barlow Condensed 700 (display), Inter (body), JetBrains Mono (data/eyebrows). NO glows, NO neon borders, gold rationed to ONE hero per screen, sport accents stay dot/badge sized, uppercase mono eyebrows on terminal surfaces only. A11y: body text ≥55% white, labels ≥11px.

**Brand/marketing canon:**
- Tagline (locked): "Every Game. Everyday. Always Free."
- CTA (approved): "Full slate of Gary's picks are live. Every game covered. Completely free."
- App Store: `https://apps.apple.com/us/app/gary-ai/id6751238914` (id 6751238914, free)
- Canonical domain: `https://www.betwithgary.ai`; X: `@BetwithGary`; entity: Gary A.I. LLC
- Gary is a BEAR, never a lion; real assets only: `ios/GaryApp/Assets.xcassets/GaryIconBG.imageset/GaryIconBG.png` (canonical 1024×1024 transparent mark), `GaryHead.imageset/gary-head.png`, mood assets (`GaryFire.imageset/fire.png`, `GaryIceCold.imageset/icecold.png`, etc.)
- NEVER write: "Three AI models"/"3-Model", GPT-5.1, Perplexity, Gemini 3 Deep Think, EPL or WBC as active sports. Honest pitch: a research agent investigates every game with live data tools, then Gary evaluates the evidence and makes the call, with a written rationale and a fact-check pass (statAudit) on numeric claims
- Sports list: NBA, NFL, NHL, NCAAB, NCAAF, MLB, 2026 FIFA World Cup
- Copy voice: plain, professional, understated. No rhetorical-question hooks, no hype, no exclamation energy
- Disclaimer (approved PH wording): "Gary is for informational and entertainment purposes only. We don't facilitate gambling, accept deposits, or place bets." Footer keeps current site's 18+ line + add "If you or someone you know has a gambling problem, call 1-800-GAMBLER."

**File structure:**

```
web/
├── package.json / next.config.ts / tsconfig.json / postcss.config.mjs / vitest.config.ts
├── .env.local                    (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
├── app/
│   ├── layout.tsx                fonts, Nav, Footer, metadata base, JSON-LD, analytics
│   ├── globals.css               Tailwind v4 @theme tokens
│   ├── page.tsx                  Home
│   ├── picks/page.tsx            today's slate
│   ├── picks/[sport]/page.tsx    7 sport pages
│   ├── props/page.tsx
│   ├── results/page.tsx
│   ├── results/[sport]/page.tsx
│   ├── hub/page.tsx
│   ├── how-it-works/page.tsx
│   ├── app/page.tsx              app showcase
│   ├── press/page.tsx
│   ├── contact/page.tsx
│   ├── terms/page.tsx
│   ├── privacy/page.tsx
│   ├── sitemap.ts / robots.ts
│   ├── opengraph-image.tsx       dynamic branded OG
│   └── llms.txt/route.ts
├── lib/gary/
│   ├── supabase.ts               rest() + restAll() PostgREST client
│   ├── types.ts                  all row/pick interfaces
│   ├── dates.ts                  todayEST, hubGradedDateEST, estDateStr
│   ├── leagues.ts                SPORTS config, normalizeLeague
│   ├── picks.ts                  parsePicksJson, fetchers, top-pick selection
│   ├── results.ts                effectiveOdds, unitsFor, records, streaks, merge/dedupe
│   └── hub.ts                    lane mapping, hit rate, insight fetchers
├── components/
│   ├── Nav.tsx / Footer.tsx
│   ├── Eyebrow.tsx / StatusBar.tsx / RecordTicker.tsx
│   ├── PickCard.tsx / PropCard.tsx
│   ├── TerminalTape.tsx          (client) GAMES/PROPS toggle
│   ├── LiveChip.tsx              (client) 60s polling
│   └── JsonLd.tsx
├── tests/                        vitest for lib/gary
└── public/brand/                 GaryIconBG.png, gary-head.png, coin2.png, mood assets
```

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: `web/` via create-next-app
- Create: `web/.env.local`
- Modify: `web/app/globals.css`, `web/app/layout.tsx` (minimal shell)

- [ ] **Step 1: Scaffold**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
npx create-next-app@latest web --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --turbopack
```

Accept defaults for anything else it asks.

- [ ] **Step 2: Env vars** — read the values (NOT the service key) from `gary2.0/.env`:

```bash
grep -E "^VITE_SUPABASE_(URL|ANON_KEY)=" /Users/adam.preda/Desktop/Gary2.0/gary2.0/.env
```

Create `web/.env.local` with those values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xuttubsfgdcjfgmskcol.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<value of VITE_SUPABASE_ANON_KEY from gary2.0/.env>
```

Verify `web/.gitignore` covers `.env*` (create-next-app default does — confirm).

- [ ] **Step 3: Install vitest + analytics**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web
npm install @vercel/analytics
npm install -D vitest
```

Add to `web/package.json` scripts: `"test": "vitest run"`.

Create `web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 4: Design tokens** — replace `web/app/globals.css` with:

```css
@import "tailwindcss";

@theme {
  --color-gold: #C9A227;
  --color-gold-light: #E8D48B;
  --color-gold-warm: #F4E4BA;
  --color-gold-dark: #8B6914;
  --color-silver: #C7CCD6;
  --color-silver-light: #D7DCE4;
  --color-silver-dim: #AEB8C4;
  --color-ink: #08080A;
  --color-card: #15171C;
  --color-chip: #1C1F26;
  --color-elev: #1A1A1E;
  --color-win: #3FB950;
  --color-loss: #E5484D;
  --color-chart-win: #22C55E;
  --color-chart-loss: #EF4444;
  --color-nba: #3B82F6;
  --color-nfl: #22C55E;
  --color-nhl: #00A3E0;
  --color-ncaab: #F97316;
  --color-ncaaf: #DC2626;
  --color-mlb: #7BC267;
  --color-wc: #14B8A6;
  --font-display: var(--font-barlow);
  --font-body: var(--font-inter);
  --font-mono: var(--font-jbmono);
}

html { background: #08080A; }
body { background: #08080A; color: rgba(255, 255, 255, 0.92); font-family: var(--font-body); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 5: Fonts + minimal layout** — replace `web/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Barlow_Condensed, Inter, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

const barlow = Barlow_Condensed({ weight: '700', subsets: ['latin'], variable: '--font-barlow' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jbmono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono' });

export const metadata: Metadata = {
  metadataBase: new URL('https://www.betwithgary.ai'),
  title: 'Gary AI — Free Sports Picks for Every Game, Every Day',
  description:
    'Gary AI covers the full slate — NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 World Cup — with free daily picks, written rationale, and a public track record. Free on iOS.',
  itunes: { appId: '6751238914' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${inter.variable} ${jbmono.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

(Nav/Footer get added in Task 8.)

- [ ] **Step 6: Verify it builds**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add web/ && git commit -m "web: scaffold Next.js app with Quant Terminal design tokens"
```

---

### Task 2: PostgREST client + types

**Files:**
- Create: `web/lib/gary/supabase.ts`
- Create: `web/lib/gary/types.ts`

- [ ] **Step 1: Write `web/lib/gary/supabase.ts`**

```ts
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** One PostgREST GET. `path` is `table?query` (no leading slash). */
export async function rest<T>(path: string, opts: { revalidate?: number } = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    next: { revalidate: opts.revalidate ?? 600 },
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${path.split('?')[0]}`);
  return res.json() as Promise<T>;
}

/**
 * Fetch ALL rows. Supabase caps a single response at 1000 rows, so page
 * through with limit/offset. Callers MUST include an `order=` in `path`
 * for stable pagination.
 */
export async function restAll<T>(path: string, opts: { revalidate?: number } = {}): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let offset = 0; ; offset += PAGE) {
    const rows = await rest<T[]>(`${path}${sep}limit=${PAGE}&offset=${offset}`, opts);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
```

- [ ] **Step 2: Write `web/lib/gary/types.ts`** (fields verified against live DB + Models.swift)

```ts
export interface SportsbookLine {
  book?: string;
  ml?: number; ml_home?: number; ml_away?: number;
  spread?: number | string; spread_home?: string; spread_away?: string; spread_odds?: number;
  total?: number | string; total_over_odds?: number; total_under_odds?: number;
}

export interface StatRow {
  name?: string; token?: string;
  home?: Record<string, string | number | null>;
  away?: Record<string, string | number | null>;
}

export interface GaryPick {
  pick?: string; type?: string; odds?: number; confidence?: number;
  homeTeam?: string; awayTeam?: string; league?: string; sport?: string;
  rationale?: string; time?: string; venue?: string; commence_time?: string;
  pick_id?: string; statsData?: StatRow[]; sportsbook_odds?: SportsbookLine[];
  injuries?: string; is_top_pick?: boolean;
  moneylineHome?: number; moneylineAway?: number;
  spread?: number; spreadOdds?: number; total?: number; trapAlert?: boolean;
  tournamentContext?: string;
  soccer_stage?: string | null; soccer_group?: string | null; soccer_round?: string | null;
}

export interface PropPick {
  player?: string; team?: string; prop?: string; bet?: string;
  line?: string | number; odds?: number; confidence?: number;
  sport?: string; league?: string; matchup?: string;
  key_stats?: string[]; rationale?: string; analysis?: string;
  commence_time?: string; td_category?: string; position?: string;
}

export interface DailyPicksRow { id: string; date: string; picks: unknown }
export interface PropPicksRow { id: string; date: string; picks: unknown }
export interface WeeklyNflPicksRow {
  id: string; week_start: string; week_number: number; season: number; picks: unknown;
}

export interface GameResultRow {
  game_date: string | null; league: string | null; matchup: string | null;
  pick_text: string | null; result: string | null; final_score: string | null;
  confidence: number | null;
}

export interface NflResultRow extends GameResultRow {
  week_number: number | null; season: number | null;
  home_team: string | null; away_team: string | null;
  home_score: number | null; away_score: number | null;
}

export interface PropResultRow {
  game_date: string | null; player_name: string | null; prop_type: string | null;
  line_value: number | string | null; actual_value: number | string | null;
  result: string | null; odds: string | null; pick_text: string | null;
  matchup: string | null; bet: string | null;
}

export interface InsightRow {
  id: number; date: string; league: string | null; category: string | null;
  headline: string | null; detail: string | null; game: string | null;
  value: string | null; tone: string | null; spark: number[] | null;
  line_val: number | null; relevance_score: number | null;
  player_id: string | null; team_id: string | null; game_id: string | null;
  result: string | null; result_note: string | null;
}

export interface PlayerCardRow {
  date: string; league: string | null; player_id: string | null;
  player_name: string | null; team_abbr: string | null; game_id: string | null;
  payload: Record<string, unknown> | null;
}

export interface LiveScoreRow {
  date: string; league: string | null; game_id: string | null;
  away_abbr: string | null; home_abbr: string | null;
  away_score: number | null; home_score: number | null;
  status: string | null; detail: string | null;
  outs: number | null; bases: string | null;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npx tsc --noEmit
cd /Users/adam.preda/Desktop/Gary2.0 && git add web/lib && git commit -m "web: PostgREST client (paginated) + data types"
```

---

### Task 3: EST date logic (TDD)

**Files:**
- Create: `web/lib/gary/dates.ts`
- Test: `web/tests/dates.test.ts`

- [ ] **Step 1: Write the failing tests** — `web/tests/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { todayEST, hubGradedDateEST, estDateStr } from '@/lib/gary/dates';

describe('todayEST', () => {
  // 2026-06-04T06:59:00Z = 2026-06-04 02:59 EDT (UTC-4) — before 3am rollover
  it('returns previous day before 3am EST', () => {
    expect(todayEST(new Date('2026-06-04T06:59:00Z'))).toBe('2026-06-03');
  });
  // 2026-06-04T07:01:00Z = 03:01 EDT — after rollover
  it('returns same day after 3am EST', () => {
    expect(todayEST(new Date('2026-06-04T07:01:00Z'))).toBe('2026-06-04');
  });
  // Midday UTC = morning EST
  it('handles midday', () => {
    expect(todayEST(new Date('2026-06-04T16:00:00Z'))).toBe('2026-06-04');
  });
  // Winter (EST, UTC-5): 2026-01-15T07:30:00Z = 02:30 EST — before rollover
  it('respects EST (winter) offset', () => {
    expect(todayEST(new Date('2026-01-15T07:30:00Z'))).toBe('2026-01-14');
  });
});

describe('hubGradedDateEST', () => {
  it('is one day before todayEST', () => {
    expect(hubGradedDateEST(new Date('2026-06-04T16:00:00Z'))).toBe('2026-06-03');
  });
});

describe('estDateStr', () => {
  it('formats a Date in America/New_York as yyyy-MM-dd', () => {
    expect(estDateStr(new Date('2026-06-05T01:00:00Z'))).toBe('2026-06-04'); // 9pm EDT prev day
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npx vitest run tests/dates.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `web/lib/gary/dates.ts`**

```ts
const EST = 'America/New_York';

/** yyyy-MM-dd in America/New_York. en-CA locale gives ISO ordering. */
export function estDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: EST });
}

function estHour(d: Date): number {
  return parseInt(d.toLocaleString('en-US', { timeZone: EST, hour: '2-digit', hour12: false }), 10) % 24;
}

/**
 * Port of iOS SupabaseAPI.todayEST (SupabaseAPI.swift:64).
 * Before 3am EST, "today" is still yesterday — keeps last night's slate up
 * until the morning grading run.
 */
export function todayEST(now: Date = new Date()): string {
  if (estHour(now) < 3) {
    return estDateStr(new Date(now.getTime() - 86400000));
  }
  return estDateStr(now);
}

/** Port of iOS hubGradedDateEST: the day before todayEST (graded record day). */
export function hubGradedDateEST(now: Date = new Date()): string {
  const today = todayEST(now);
  const [y, m, d] = today.split('-').map(Number);
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12)); // noon avoids TZ edge
  return estDateStr(new Date(noonUTC.getTime() - 86400000));
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/dates.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add web/lib/gary/dates.ts web/tests/dates.test.ts
git commit -m "web: EST date logic with 3am rollover (iOS todayEST port)"
```

---

### Task 4: Sports config + league normalization (TDD)

**Files:**
- Create: `web/lib/gary/leagues.ts`
- Test: `web/tests/leagues.test.ts`

- [ ] **Step 1: Failing tests** — `web/tests/leagues.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeLeague, SPORTS, sportBySlug, sportByCode } from '@/lib/gary/leagues';

describe('normalizeLeague (iOS effectiveLeague port)', () => {
  it('maps API sport keys', () => {
    expect(normalizeLeague('basketball_nba')).toBe('NBA');
    expect(normalizeLeague('baseball_mlb')).toBe('MLB');
    expect(normalizeLeague('soccer_world_cup')).toBe('WC');
    expect(normalizeLeague('americanfootball_nfl')).toBe('NFL');
    expect(normalizeLeague('icehockey_nhl')).toBe('NHL');
  });
  it('prefers league over sport', () => {
    expect(normalizeLeague('NBA', 'baseball_mlb')).toBe('NBA');
  });
  it('falls back to sport when league empty', () => {
    expect(normalizeLeague('', 'basketball_ncaab')).toBe('NCAAB');
    expect(normalizeLeague(undefined, 'WC')).toBe('WC');
  });
  it('NBA does not swallow WNBA', () => {
    expect(normalizeLeague('wnba')).toBe('WNBA');
  });
  it('MLB HR stays distinct; WBC folds into MLB', () => {
    expect(normalizeLeague('MLB HR')).toBe('MLB HR');
    expect(normalizeLeague('wbc')).toBe('MLB');
  });
  it('unknown → raw uppercased; nothing → null', () => {
    expect(normalizeLeague('xfl')).toBe('XFL');
    expect(normalizeLeague('', '')).toBeNull();
  });
});

describe('SPORTS config', () => {
  it('has 7 routable sports', () => {
    expect(SPORTS.map(s => s.slug)).toEqual(['mlb', 'nba', 'nhl', 'nfl', 'ncaab', 'ncaaf', 'world-cup']);
  });
  it('resolves slug and code', () => {
    expect(sportBySlug('world-cup')?.code).toBe('WC');
    expect(sportByCode('WC')?.slug).toBe('world-cup');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run tests/leagues.test.ts`)

- [ ] **Step 3: Implement `web/lib/gary/leagues.ts`**

```ts
export interface SportConfig {
  slug: string;        // URL segment
  code: string;        // league code in data
  name: string;        // display
  longName: string;    // SEO
  accent: string;      // hex — dot/badge use ONLY
}

export const SPORTS: SportConfig[] = [
  { slug: 'mlb', code: 'MLB', name: 'MLB', longName: 'MLB Baseball', accent: '#7BC267' },
  { slug: 'nba', code: 'NBA', name: 'NBA', longName: 'NBA Basketball', accent: '#3B82F6' },
  { slug: 'nhl', code: 'NHL', name: 'NHL', longName: 'NHL Hockey', accent: '#00A3E0' },
  { slug: 'nfl', code: 'NFL', name: 'NFL', longName: 'NFL Football', accent: '#22C55E' },
  { slug: 'ncaab', code: 'NCAAB', name: 'NCAAB', longName: 'College Basketball', accent: '#F97316' },
  { slug: 'ncaaf', code: 'NCAAF', name: 'NCAAF', longName: 'College Football', accent: '#DC2626' },
  { slug: 'world-cup', code: 'WC', name: 'World Cup', longName: '2026 FIFA World Cup', accent: '#14B8A6' },
];

export const sportBySlug = (slug: string) => SPORTS.find(s => s.slug === slug);
export const sportByCode = (code: string) => SPORTS.find(s => s.code === code.toUpperCase());

/** Historical league labels seen in results that are not routable sports. */
export const LEAGUE_DISPLAY: Record<string, string> = {
  WBC: 'World Baseball Classic',
  EPL: 'Premier League',
  WNBA: 'WNBA',
};

/**
 * Port of iOS PropPick.effectiveLeague (Models.swift:1098).
 * league field wins; sport is the fallback; substring matching tolerates
 * API keys like "basketball_nba".
 */
export function normalizeLeague(league?: string | null, sport?: string | null): string | null {
  const raw = (league && league.length > 0 ? league : sport) ?? '';
  if (!raw) return null;
  const n = raw.toLowerCase();
  if (n.includes('nba') && !n.includes('wnba')) return 'NBA';
  if (n.includes('nfl')) return 'NFL';
  if (n.includes('nhl')) return 'NHL';
  if (n.includes('ncaab') || n.includes('ncaam')) return 'NCAAB';
  if (n.includes('ncaaf')) return 'NCAAF';
  if (n.includes('world_cup') || n.includes('worldcup') || n === 'wc' || n.includes('soccer_world_cup')) return 'WC';
  if (n.includes('epl') || n.includes('soccer_epl') || n.includes('premier')) return 'EPL';
  if (n === 'mlb hr') return 'MLB HR';
  if (n.includes('mlb') || n.includes('wbc')) return 'MLB';
  if (n.includes('wnba')) return 'WNBA';
  return raw.toUpperCase();
}
```

- [ ] **Step 4: Run — expect PASS**, then commit:

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add web/lib/gary/leagues.ts web/tests/leagues.test.ts
git commit -m "web: sports config + league normalization (iOS effectiveLeague port)"
```

---

### Task 5: Picks parsing + fetchers + top-pick selection (TDD)

**Files:**
- Create: `web/lib/gary/picks.ts`
- Test: `web/tests/picks.test.ts`

- [ ] **Step 1: Failing tests** — `web/tests/picks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePicksJson, selectTopPick, selectTopProps } from '@/lib/gary/picks';
import type { GaryPick, PropPick } from '@/lib/gary/types';

describe('parsePicksJson (iOS PicksValue port)', () => {
  it('passes through a native array', () => {
    expect(parsePicksJson<GaryPick>([{ pick: 'Phillies -1.5 -110' }])).toEqual([{ pick: 'Phillies -1.5 -110' }]);
  });
  it('parses stringified JSON arrays', () => {
    expect(parsePicksJson<GaryPick>('[{"pick":"Knicks ML +154"}]')).toEqual([{ pick: 'Knicks ML +154' }]);
  });
  it('returns [] on garbage', () => {
    expect(parsePicksJson('not json')).toEqual([]);
    expect(parsePicksJson(null)).toEqual([]);
    expect(parsePicksJson(42)).toEqual([]);
    expect(parsePicksJson('{"a":1}')).toEqual([]); // object, not array
  });
});

describe('selectTopPick (iOS topPickCandidates port)', () => {
  const picks: GaryPick[] = [
    { pick: 'A ML -120', type: 'ml', confidence: 0.7 },
    { pick: 'B -3.5 -110', type: 'spread', confidence: 0.9 },
    { pick: 'prop thing', type: 'prop', confidence: 0.99 },
  ];
  it('excludes props and takes max confidence', () => {
    expect(selectTopPick(picks)?.pick).toBe('B -3.5 -110');
  });
  it('manual is_top_pick wins over confidence', () => {
    const withManual = [...picks, { pick: 'C ML +200', type: 'ml', confidence: 0.5, is_top_pick: true }];
    expect(selectTopPick(withManual)?.pick).toBe('C ML +200');
  });
  it('null on empty', () => {
    expect(selectTopPick([])).toBeNull();
  });
});

describe('selectTopProps', () => {
  it('sorts by confidence desc and takes n', () => {
    const props: PropPick[] = [
      { player: 'A', confidence: 0.6 },
      { player: 'B', confidence: 0.9 },
      { player: 'C', confidence: 0.8 },
    ];
    expect(selectTopProps(props, 2).map(p => p.player)).toEqual(['B', 'C']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `web/lib/gary/picks.ts`**

```ts
import { rest } from './supabase';
import { todayEST } from './dates';
import { normalizeLeague } from './leagues';
import type { DailyPicksRow, GaryPick, PropPick, PropPicksRow, WeeklyNflPicksRow } from './types';

/**
 * Port of iOS PicksValue<T> + parsePicksRow (Models.swift:15, SupabaseAPI.swift:858).
 * The picks column is polymorphic: a JSON array OR a stringified JSON array.
 */
export function parsePicksJson<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Port of iOS topPickCandidates (Views.swift:318): manual flag wins, else max confidence. */
export function selectTopPick(picks: GaryPick[]): GaryPick | null {
  const games = picks.filter(p => (p.type ?? 'game') !== 'prop');
  if (games.length === 0) return null;
  const manual = games.find(p => p.is_top_pick === true);
  if (manual) return manual;
  return games.reduce((best, p) => ((p.confidence ?? 0) > (best.confidence ?? 0) ? p : best));
}

/** Confidence-desc top-N (iOS topProps). */
export function selectTopProps(props: PropPick[], n: number): PropPick[] {
  return [...props].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, n);
}

/** All of today's game picks (daily_picks + current weekly_nfl_picks when in week). */
export async function fetchTodayGamePicks(revalidate = 600): Promise<GaryPick[]> {
  const date = todayEST();
  const rows = await rest<DailyPicksRow[]>(
    `daily_picks?select=date,picks&date=eq.${date}`, { revalidate },
  );
  const picks = rows.flatMap(r => parsePicksJson<GaryPick>(r.picks));

  // NFL is weekly — include the most recent week's picks only if today falls
  // inside that week (week_start .. week_start+6).
  const weekly = await rest<WeeklyNflPicksRow[]>(
    `weekly_nfl_picks?select=week_start,picks&order=week_start.desc&limit=1`, { revalidate },
  );
  if (weekly.length > 0) {
    const start = new Date(`${weekly[0].week_start}T12:00:00Z`).getTime();
    const today = new Date(`${date}T12:00:00Z`).getTime();
    if (today >= start && today < start + 7 * 86400000) {
      picks.push(...parsePicksJson<GaryPick>(weekly[0].picks));
    }
  }
  return picks;
}

/** All of today's prop picks, flattened across rows. */
export async function fetchTodayPropPicks(revalidate = 600): Promise<PropPick[]> {
  const date = todayEST();
  const rows = await rest<PropPicksRow[]>(
    `prop_picks?select=date,picks&date=eq.${date}`, { revalidate },
  );
  return rows.flatMap(r => parsePicksJson<PropPick>(r.picks));
}

/** Group game picks by normalized league code. */
export function groupPicksByLeague(picks: GaryPick[]): Map<string, GaryPick[]> {
  const m = new Map<string, GaryPick[]>();
  for (const p of picks) {
    const code = normalizeLeague(p.league, p.sport) ?? 'OTHER';
    m.set(code, [...(m.get(code) ?? []), p]);
  }
  return m;
}

/** Split props into the HR Threats lane (sport 'MLB HR') vs everything else. */
export function splitHrThreats(props: PropPick[]): { hr: PropPick[]; rest: PropPick[] } {
  const hr: PropPick[] = [];
  const rest: PropPick[] = [];
  for (const p of props) {
    (normalizeLeague(p.league, p.sport) === 'MLB HR' ? hr : rest).push(p);
  }
  return { hr, rest };
}
```

- [ ] **Step 4: Run tests — PASS. Commit:**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add web/lib/gary/picks.ts web/tests/picks.test.ts
git commit -m "web: picks parsing, fetchers, top-pick selection (iOS ports)"
```

---

### Task 6: Results math — odds, units, records, streaks (TDD)

**Files:**
- Create: `web/lib/gary/results.ts`
- Test: `web/tests/results.test.ts`

- [ ] **Step 1: Failing tests** — `web/tests/results.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  effectiveOdds, unitsFor, computeRecord, mergeGameResults,
  currentStreak, recordByLeague, isLegitPropResult,
} from '@/lib/gary/results';
import type { GameResultRow, PropResultRow } from '@/lib/gary/types';

const row = (over: Partial<GameResultRow>): GameResultRow => ({
  game_date: '2026-06-03', league: 'MLB', matchup: 'A @ B',
  pick_text: 'B ML -120', result: 'won', final_score: '5-3', confidence: 0.8, ...over,
});

describe('effectiveOdds (iOS Models.swift:1154 port)', () => {
  it('extracts odds from pick_text tail', () => {
    expect(effectiveOdds('Knicks ML +154')).toBe('+154');
    expect(effectiveOdds('Phillies -1.5 -110')).toBe('-110');
    expect(effectiveOdds('Over 8.5 -104  ')).toBe('-104');
  });
  it('requires 3+ digits at the tail', () => {
    expect(effectiveOdds('Phillies -1.5')).toBeNull();   // spread, not odds
    expect(effectiveOdds('B ML')).toBeNull();
    expect(effectiveOdds(null)).toBeNull();
  });
  it('prefers an explicit odds value', () => {
    expect(effectiveOdds('B ML -120', '-200')).toBe('-200');
    expect(effectiveOdds('B ML -120', '  ')).toBe('-120'); // blank column falls through
  });
});

describe('unitsFor (iOS Views.swift:273 port — EXACT)', () => {
  it('positive odds win', () => expect(unitsFor('won', '+150')).toBeCloseTo(1.5));
  it('negative odds win', () => expect(unitsFor('won', '-110')).toBeCloseTo(100 / 110));
  it('unparseable odds win pays 0.9', () => expect(unitsFor('won', null)).toBe(0.9));
  it('loss is -1 regardless of odds', () => expect(unitsFor('lost', '+300')).toBe(-1));
  it('push and unknown are 0', () => {
    expect(unitsFor('push', '-110')).toBe(0);
    expect(unitsFor(null, '-110')).toBe(0);
  });
});

describe('computeRecord', () => {
  it('counts W-L-P and win% (pushes excluded from pct)', () => {
    const rec = computeRecord([
      row({}), row({}), row({ result: 'lost' }), row({ result: 'push' }),
    ]);
    expect(rec).toMatchObject({ wins: 2, losses: 1, pushes: 1 });
    expect(rec.pct).toBe(67); // 2/3 rounded
  });
  it('sums net units from effective odds', () => {
    const rec = computeRecord([
      row({ pick_text: 'A ML +200' }),                  // +2.0
      row({ pick_text: 'B ML -100', result: 'lost' }),  // -1.0
    ]);
    expect(rec.netUnits).toBeCloseTo(1.0);
  });
});

describe('mergeGameResults (NFL split across two tables)', () => {
  it('dedupes on lowercased pick_text + game_date', () => {
    const a = row({ league: 'NFL', pick_text: 'Chiefs -3 -110' });
    const dupe = row({ league: 'NFL', pick_text: '  chiefs -3 -110 ' });
    const other = row({ league: 'NFL', pick_text: 'Bills ML -150' });
    expect(mergeGameResults([a], [dupe, other])).toHaveLength(2);
  });
});

describe('currentStreak', () => {
  it('counts consecutive identical results from most recent date', () => {
    const rows = [
      row({ game_date: '2026-06-03' }), row({ game_date: '2026-06-03' }),
      row({ game_date: '2026-06-02', result: 'lost' }),
    ];
    expect(currentStreak(rows)).toEqual({ kind: 'won', count: 2 });
  });
  it('skips pushes', () => {
    const rows = [
      row({ game_date: '2026-06-03', result: 'push' }),
      row({ game_date: '2026-06-02' }),
    ];
    expect(currentStreak(rows)).toEqual({ kind: 'won', count: 1 });
  });
});

describe('recordByLeague', () => {
  it('buckets by league', () => {
    const out = recordByLeague([row({}), row({ league: 'NBA', result: 'lost' })]);
    expect(out.get('MLB')?.wins).toBe(1);
    expect(out.get('NBA')?.losses).toBe(1);
  });
});

describe('isLegitPropResult (iOS Views.swift:290 port)', () => {
  const prop = (over: Partial<PropResultRow>): PropResultRow => ({
    game_date: '2026-06-03', player_name: null, prop_type: null, line_value: null,
    actual_value: null, result: 'won', odds: '-110', pick_text: null, matchup: null,
    bet: null, ...over,
  });
  it('keeps rows with any identifying field', () => {
    expect(isLegitPropResult(prop({ player_name: 'Manny Machado' }))).toBe(true);
    expect(isLegitPropResult(prop({ bet: 'under' }))).toBe(true);
  });
  it('drops fully anonymous rows', () => {
    expect(isLegitPropResult(prop({}))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `web/lib/gary/results.ts`**

```ts
import { restAll } from './supabase';
import type { GameResultRow, NflResultRow, PropResultRow } from './types';

const ODDS_TAIL = /[+-]\d{3,}\s*$/;

/**
 * Port of iOS GameResult.effectiveOdds (Models.swift:1154).
 * game_results/nfl_results have NO odds column — the line lives at the tail
 * of pick_text ("Knicks ML +154"). Prefer an explicit odds value if present.
 */
export function effectiveOdds(pickText: string | null | undefined, odds?: string | null): string | null {
  if (odds && odds.trim().length > 0) return odds.trim();
  if (!pickText) return null;
  const m = pickText.match(ODDS_TAIL);
  return m ? m[0].trim() : null;
}

function parseAmericanOdds(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const n = parseInt(odds.replace('+', ''), 10);
  return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
}

/**
 * EXACT port of iOS BillfoldCompute.units (Views.swift:273), including the
 * 0.9-unit fallback for wins with unparseable odds. 1 unit flat stakes.
 */
export function unitsFor(result: string | null | undefined, odds: string | null | undefined): number {
  switch (result) {
    case 'won': {
      const american = parseAmericanOdds(odds);
      if (american === null) return 0.9;
      return american > 0 ? american / 100 : 100 / Math.abs(american);
    }
    case 'lost': return -1;
    case 'push': return 0;
    default: return 0;
  }
}

export interface Record_ {
  wins: number; losses: number; pushes: number;
  pct: number;        // win% of decided (pushes excluded), rounded
  netUnits: number;   // flat 1-unit stakes
  graded: number;     // wins + losses + pushes
}

export function computeRecord(rows: GameResultRow[]): Record_ {
  let wins = 0, losses = 0, pushes = 0, netUnits = 0;
  for (const r of rows) {
    if (r.result === 'won') wins++;
    else if (r.result === 'lost') losses++;
    else if (r.result === 'push') pushes++;
    else continue;
    netUnits += unitsFor(r.result, effectiveOdds(r.pick_text));
  }
  const decided = wins + losses;
  return {
    wins, losses, pushes, netUnits,
    pct: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    graded: wins + losses + pushes,
  };
}

const dedupeKey = (r: GameResultRow) =>
  `${(r.pick_text ?? '').trim().toLowerCase()}|${r.game_date ?? ''}`;

/**
 * NFL results live in BOTH nfl_results (majority) and game_results (a few
 * legacy rows). Merge with nfl_results winning on (pick_text, game_date).
 * Also dedupes re-grade duplicates within each table.
 */
export function mergeGameResults(nflRows: NflResultRow[], gameRows: GameResultRow[]): GameResultRow[] {
  const seen = new Set<string>();
  const out: GameResultRow[] = [];
  for (const r of [...nflRows.map(r => ({ ...r, league: r.league ?? 'NFL' })), ...gameRows]) {
    const k = dedupeKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function currentStreak(rows: GameResultRow[]): { kind: 'won' | 'lost'; count: number } | null {
  const sorted = [...rows].sort((a, b) => (b.game_date ?? '').localeCompare(a.game_date ?? ''));
  let kind: 'won' | 'lost' | null = null;
  let count = 0;
  for (const r of sorted) {
    if (r.result !== 'won' && r.result !== 'lost') continue; // skip pushes/ungraded
    if (kind === null) { kind = r.result; count = 1; continue; }
    if (r.result === kind) count++;
    else break;
  }
  return kind ? { kind, count } : null;
}

export function recordByLeague(rows: GameResultRow[]): Map<string, Record_> {
  const buckets = new Map<string, GameResultRow[]>();
  for (const r of rows) {
    const league = (r.league ?? 'OTHER').toUpperCase();
    buckets.set(league, [...(buckets.get(league) ?? []), r]);
  }
  return new Map([...buckets].map(([k, v]) => [k, computeRecord(v)]));
}

/** Port of iOS isLegitPropResult (Views.swift:290). */
export function isLegitPropResult(r: PropResultRow): boolean {
  const has = (v: string | number | null | undefined) =>
    v !== null && v !== undefined && String(v).trim().length > 0;
  return has(r.player_name) || has(r.prop_type) || has(r.bet) || has(r.line_value);
}

/** Props use the odds COLUMN (text), with pick_text tail as fallback. */
export function computePropsRecord(rows: PropResultRow[]): Record_ {
  let wins = 0, losses = 0, pushes = 0, netUnits = 0;
  for (const r of rows.filter(isLegitPropResult)) {
    if (r.result === 'won') wins++;
    else if (r.result === 'lost') losses++;
    else if (r.result === 'push') pushes++;
    else continue;
    netUnits += unitsFor(r.result, effectiveOdds(r.pick_text, r.odds));
  }
  const decided = wins + losses;
  return {
    wins, losses, pushes, netUnits,
    pct: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    graded: wins + losses + pushes,
  };
}

// ---------- fetchers (ISR-cached; results change daily) ----------

export async function fetchAllGameResults(revalidate = 3600): Promise<GameResultRow[]> {
  // NOTE: nfl_results has NO league column — mergeGameResults stamps 'NFL'.
  const [games, nfl] = await Promise.all([
    restAll<GameResultRow>(
      'game_results?select=game_date,league,matchup,pick_text,result,final_score,confidence&order=game_date.desc', { revalidate }),
    restAll<NflResultRow>(
      'nfl_results?select=game_date,matchup,pick_text,result,final_score,confidence,week_number,season,home_team,away_team,home_score,away_score&order=game_date.desc', { revalidate }),
  ]);
  return mergeGameResults(nfl, games);
}

export async function fetchAllPropResults(revalidate = 3600): Promise<PropResultRow[]> {
  return restAll<PropResultRow>(
    'prop_results?select=game_date,player_name,prop_type,line_value,actual_value,result,odds,pick_text,matchup,bet&order=game_date.desc', { revalidate });
}

/** Rows on/after an ISO date (yyyy-MM-dd). */
export function sinceDate<T extends { game_date: string | null }>(rows: T[], iso: string): T[] {
  return rows.filter(r => (r.game_date ?? '') >= iso);
}
```

- [ ] **Step 4: Run tests — PASS. Commit:**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add web/lib/gary/results.ts web/tests/results.test.ts
git commit -m "web: results math — odds regex, exact units port, records, NFL merge"
```

---

### Task 7: Hub lanes + hit rate (TDD)

**Files:**
- Create: `web/lib/gary/hub.ts`
- Test: `web/tests/hub.test.ts`

- [ ] **Step 1: Failing tests** — `web/tests/hub.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { laneFromCategory, LANES, computeHitRate, groupInsightsByLane } from '@/lib/gary/hub';
import type { InsightRow } from '@/lib/gary/types';

const insight = (over: Partial<InsightRow>): InsightRow => ({
  id: 1, date: '2026-06-04', league: 'MLB', category: 'heat_check',
  headline: 'h', detail: 'd', game: 'SD @ PHI', value: '.900', tone: 'good',
  spark: [0.3, 0.9], line_val: null, relevance_score: 80,
  player_id: null, team_id: null, game_id: null, result: null, result_note: null,
  ...over,
});

describe('laneFromCategory (iOS SignalKind.from port)', () => {
  it('maps every live category', () => {
    expect(laneFromCategory('heat_check')).toBe('hot');
    expect(laneFromCategory('cooling_off')).toBe('cold');
    expect(laneFromCategory('beneficiary')).toBe('injury');
    expect(laneFromCategory('owned')).toBe('h2h');
    expect(laneFromCategory('platoon_edge')).toBe('platoon');
    expect(laneFromCategory('ballpark_shift')).toBe('ballpark');
    expect(laneFromCategory('ballpark')).toBe('ballpark');
    expect(laneFromCategory('regression_watch')).toBe('regression');
    expect(laneFromCategory('rest_fatigue')).toBe('situational');
    expect(laneFromCategory('situational')).toBe('situational');
    expect(laneFromCategory('streak')).toBe('streak');
    expect(laneFromCategory('tournament')).toBe('tournament');
    expect(laneFromCategory('gary_hr_threats')).toBe('hrThreat');
  });
  it('is tolerant of case/whitespace, null on unknown', () => {
    expect(laneFromCategory('  Heat Check ')).toBe('hot');
    expect(laneFromCategory('made_up')).toBeNull();
    expect(laneFromCategory(null)).toBeNull();
  });
});

describe('LANES metadata', () => {
  it('chip labels match the app', () => {
    expect(LANES.hot.chip).toBe('HEAT CHECK');
    expect(LANES.hrThreat.chip).toBe('HR THREAT');
    expect(LANES.injury.chip).toBe('REPLACEMENT');
  });
  it('tint discipline: hot/hrThreat green, cold/regression red, rest neutral', () => {
    expect(LANES.hot.tint).toBe('green');
    expect(LANES.hrThreat.tint).toBe('green');
    expect(LANES.cold.tint).toBe('red');
    expect(LANES.regression.tint).toBe('red');
    expect(LANES.platoon.tint).toBe('neutral');
  });
});

describe('computeHitRate (iOS fetchInsightHitRate port)', () => {
  it('hit/(hit+miss), pushes and nulls excluded', () => {
    const rows = [
      insight({ result: 'hit' }), insight({ result: 'hit' }),
      insight({ result: 'miss' }), insight({ result: 'push' }), insight({ result: null }),
    ];
    expect(computeHitRate(rows)).toEqual({ hit: 2, graded: 3 });
  });
  it('null when nothing graded', () => {
    expect(computeHitRate([insight({ result: null })])).toBeNull();
  });
});

describe('groupInsightsByLane', () => {
  it('drops unknown categories, sorts lanes by relevance', () => {
    const rows = [
      insight({ category: 'heat_check', relevance_score: 50 }),
      insight({ category: 'heat_check', relevance_score: 90 }),
      insight({ category: 'nonsense' }),
    ];
    const grouped = groupInsightsByLane(rows);
    expect(grouped.get('hot')!.map(r => r.relevance_score)).toEqual([90, 50]);
    expect([...grouped.keys()]).toEqual(['hot']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `web/lib/gary/hub.ts`**

```ts
import { rest } from './supabase';
import { todayEST, hubGradedDateEST } from './dates';
import type { InsightRow, PlayerCardRow } from './types';

export type LaneKey =
  | 'streak' | 'h2h' | 'hot' | 'cold' | 'injury' | 'debut' | 'situational'
  | 'platoon' | 'ballpark' | 'regression' | 'tournament' | 'hrThreat';

export interface LaneMeta {
  chip: string;                       // terminal eyebrow label (app SignalKind.chip)
  title: string;                      // section heading on web
  tint: 'green' | 'red' | 'neutral';  // gold diet: lane identity is neutral
}

export const LANES: Record<LaneKey, LaneMeta> = {
  streak:     { chip: 'STREAK',        title: 'Streaks',          tint: 'neutral' },
  h2h:        { chip: 'HEAD-TO-HEAD',  title: 'Head-to-Head',     tint: 'neutral' },
  hot:        { chip: 'HEAT CHECK',    title: 'Heat Check',       tint: 'green' },
  cold:       { chip: 'COOLING OFF',   title: 'Cooling Off',      tint: 'red' },
  injury:     { chip: 'REPLACEMENT',   title: 'The Beneficiary',  tint: 'neutral' },
  debut:      { chip: 'DEBUT',         title: 'Debuts',           tint: 'neutral' },
  situational:{ chip: 'SITUATIONAL',   title: 'Rest & Fatigue',   tint: 'neutral' },
  platoon:    { chip: 'PLATOON EDGE',  title: 'Platoon Edges',    tint: 'neutral' },
  ballpark:   { chip: 'BALLPARK',      title: 'Ballpark Shifts',  tint: 'neutral' },
  regression: { chip: 'REGRESSION',    title: 'Regression Board', tint: 'red' },
  tournament: { chip: 'TOURNAMENT',    title: 'Tournament Stakes',tint: 'neutral' },
  hrThreat:   { chip: 'HR THREAT',     title: 'Gary Home Run Threats', tint: 'green' },
};

/** Display order of lanes on /hub (HR Threats leads in MLB season). */
export const LANE_ORDER: LaneKey[] = [
  'hrThreat', 'hot', 'platoon', 'ballpark', 'regression', 'injury',
  'situational', 'streak', 'h2h', 'cold', 'tournament', 'debut',
];

/**
 * Port of iOS SignalKind.from (Views.swift:11404). Unknown categories return
 * null so the row is DROPPED rather than mis-bucketed.
 */
export function laneFromCategory(raw: string | null | undefined): LaneKey | null {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'streak': return 'streak';
    case 'h2h': case 'head-to-head': case 'head_to_head': case 'owned': return 'h2h';
    case 'hot': case 'heat': case 'heat check': case 'heat_check': return 'hot';
    case 'cold': case 'cooling': case 'cooling off': case 'cooling_off': return 'cold';
    case 'injury': case 'replacement': case 'beneficiary': return 'injury';
    case 'debut': return 'debut';
    case 'situational': case 'rest': case 'fatigue': case 'rest & fatigue': case 'rest_fatigue': return 'situational';
    case 'platoon': case 'platoon edge': case 'platoon_edge': return 'platoon';
    case 'ballpark': case 'ballpark shift': case 'ballpark_shift': return 'ballpark';
    case 'regression': case 'regression watch': case 'regression_watch': return 'regression';
    case 'tournament': case 'stakes': case 'group': case 'tournament_stakes': return 'tournament';
    case 'gary_hr_threats': case 'hr_threat': case 'hr threats': return 'hrThreat';
    default: return null;
  }
}

/** Port of iOS fetchInsightHitRate: hit/(hit+miss); pushes + NULLs excluded. */
export function computeHitRate(rows: InsightRow[]): { hit: number; graded: number } | null {
  const hit = rows.filter(r => r.result === 'hit').length;
  const miss = rows.filter(r => r.result === 'miss').length;
  const graded = hit + miss;
  return graded > 0 ? { hit, graded } : null;
}

export function groupInsightsByLane(rows: InsightRow[]): Map<LaneKey, InsightRow[]> {
  const m = new Map<LaneKey, InsightRow[]>();
  for (const r of rows) {
    const lane = laneFromCategory(r.category);
    if (!lane) continue;
    m.set(lane, [...(m.get(lane) ?? []), r]);
  }
  for (const [k, v] of m) {
    m.set(k, v.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)));
  }
  return m;
}

export async function fetchTodayInsights(revalidate = 600): Promise<InsightRow[]> {
  return rest<InsightRow[]>(
    `insight_connections?select=*&date=eq.${todayEST()}&order=relevance_score.desc.nullslast`,
    { revalidate },
  );
}

/** Yesterday's graded rows — powers the "X OF Y HIT YDAY" badge (show when graded >= 5). */
export async function fetchGradedYesterday(revalidate = 3600): Promise<InsightRow[]> {
  return rest<InsightRow[]>(
    `insight_connections?select=id,date,result&date=eq.${hubGradedDateEST()}&result=not.is.null`,
    { revalidate },
  );
}

export async function fetchPlayerCards(revalidate = 600): Promise<PlayerCardRow[]> {
  return rest<PlayerCardRow[]>(
    `player_insight_cards?select=*&date=eq.${todayEST()}`,
    { revalidate },
  );
}
```

- [ ] **Step 4: Run tests — PASS. Run the FULL suite (`npx vitest run`) — all green. Commit:**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add web/lib/gary/hub.ts web/tests/hub.test.ts
git commit -m "web: hub lane mapping, hit rate, insight fetchers (iOS ports)"
```

---

### Task 8: Core components — Nav, Footer, Eyebrow, cards, ticker, live chips

**Files:**
- Create: `web/components/Nav.tsx`, `web/components/Footer.tsx`, `web/components/Eyebrow.tsx`, `web/components/PickCard.tsx`, `web/components/PropCard.tsx`, `web/components/RecordTicker.tsx`, `web/components/StatusBar.tsx`, `web/components/LiveChip.tsx`, `web/components/AppStoreButton.tsx`
- Modify: `web/app/layout.tsx` (wire Nav + Footer)
- Create: `web/public/brand/` assets

Design grammar reminders for EVERY component here: matte card `#15171C` with ONE hairline (gold for game picks, silver for props), inner chip `#1C1F26`, radii 20/12/10, black depth shadow only (NO glow), mono uppercase eyebrows ≥11px, gold reserved for the pick text + Gary's voice, sport accents only as small dots/badges, body text ≥55% white.

- [ ] **Step 1: Copy brand assets**

```bash
mkdir -p /Users/adam.preda/Desktop/Gary2.0/web/public/brand
cp /Users/adam.preda/Desktop/Gary2.0/ios/GaryApp/Assets.xcassets/GaryIconBG.imageset/GaryIconBG.png /Users/adam.preda/Desktop/Gary2.0/web/public/brand/
cp /Users/adam.preda/Desktop/Gary2.0/ios/GaryApp/Assets.xcassets/GaryHead.imageset/gary-head.png /Users/adam.preda/Desktop/Gary2.0/web/public/brand/
cp /Users/adam.preda/Desktop/Gary2.0/ios/GaryApp/Assets.xcassets/GaryFire.imageset/fire.png /Users/adam.preda/Desktop/Gary2.0/web/public/brand/gary-fire.png
cp /Users/adam.preda/Desktop/Gary2.0/ios/GaryApp/Assets.xcassets/GaryIceCold.imageset/icecold.png /Users/adam.preda/Desktop/Gary2.0/web/public/brand/gary-icecold.png
cp /Users/adam.preda/Desktop/Gary2.0/gary2.0/public/coin2.png /Users/adam.preda/Desktop/Gary2.0/web/public/
```

(If an imageset filename differs, `ls` the imageset directory and copy the largest PNG.)

- [ ] **Step 2: `web/components/AppStoreButton.tsx`**

```tsx
export const APP_STORE_URL = 'https://apps.apple.com/us/app/gary-ai/id6751238914';

export function AppStoreButton({ label = 'Download on the App Store' }: { label?: string }) {
  return (
    <a
      href={APP_STORE_URL}
      className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 font-body text-sm font-semibold text-ink transition-opacity hover:opacity-90"
    >
       {label}
    </a>
  );
}
```

- [ ] **Step 3: `web/components/Eyebrow.tsx`** — the terminal eyebrow primitive:

```tsx
export function Eyebrow({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <span
      className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
      style={{ color: accent ?? 'rgba(255,255,255,0.45)' }}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: `web/components/Nav.tsx`** — links: Picks, Props, Hub, Results, How It Works; wordmark left; App Store button right. Nav links are NEUTRAL (selected = bright white underline, never gold):

```tsx
import Link from 'next/link';
import Image from 'next/image';
import { AppStoreButton } from './AppStoreButton';

const LINKS = [
  { href: '/picks', label: 'Picks' },
  { href: '/props', label: 'Props' },
  { href: '/hub', label: 'Hub' },
  { href: '/results', label: 'Results' },
  { href: '/how-it-works', label: 'How It Works' },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-ink/90 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/brand/gary-head.png" alt="Gary" width={28} height={28} />
          <span className="font-display text-lg tracking-wide text-white/95">GARY A.I.</span>
        </Link>
        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className="text-sm text-white/60 transition-colors hover:text-white/95">
              {l.label}
            </Link>
          ))}
        </div>
        <AppStoreButton label="Get the App" />
      </nav>
    </header>
  );
}
```

(Mobile menu: add a details/summary disclosure with the same links under `md:hidden` — simple, no JS.)

- [ ] **Step 5: `web/components/Footer.tsx`** — keeps the existing site's disclaimer posture (18+) + adds 1-800-GAMBLER; links to legal/contact/press; @BetwithGary:

```tsx
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/8 px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="text-[13px] leading-relaxed text-white/55">
          Gary is for informational and entertainment purposes only. We don&apos;t facilitate
          gambling, accept deposits, or place bets. 18+. If you or someone you know has a
          gambling problem, call 1-800-GAMBLER.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/55">
          <Link href="/terms" className="hover:text-white/90">Terms</Link>
          <Link href="/privacy" className="hover:text-white/90">Privacy</Link>
          <Link href="/contact" className="hover:text-white/90">Contact</Link>
          <Link href="/press" className="hover:text-white/90">Press &amp; Brand</Link>
          <a href="https://x.com/BetwithGary" className="hover:text-white/90">@BetwithGary</a>
        </div>
        <p className="text-[12px] text-white/35">© {new Date().getFullYear()} Gary A.I. LLC · betwithgary.ai</p>
      </div>
    </footer>
  );
}
```

Wire both into `web/app/layout.tsx` body: `<Nav />{children}<Footer />`.

- [ ] **Step 6: `web/components/PickCard.tsx`** — gold game-pick card mirroring the app's CompactPickRow grammar (eyebrow → matchup → Gary's Take → matte gold pick chip with grey odds):

```tsx
import { Eyebrow } from './Eyebrow';
import { sportByCode } from '@/lib/gary/leagues';
import { effectiveOdds } from '@/lib/gary/results';
import type { GaryPick } from '@/lib/gary/types';

function confidencePct(c?: number) {
  return c ? Math.round(c * 100) : null;
}

export function PickCard({ pick, expanded = false }: { pick: GaryPick; expanded?: boolean }) {
  const league = (pick.league ?? '').toUpperCase();
  const accent = sportByCode(league)?.accent;
  const odds = pick.odds ?? effectiveOdds(pick.pick);
  const conf = confidencePct(pick.confidence);
  const take = pick.rationale?.replace(/^Gary's Take\s*/i, '').trim();

  return (
    <article className="rounded-[20px] border border-gold/35 bg-card p-5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2">
        {accent && <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
        <Eyebrow>{league}{pick.time ? ` · ${pick.time}` : ''}</Eyebrow>
      </div>
      <h3 className="mt-2 font-display text-2xl text-white/95">
        {pick.awayTeam} @ {pick.homeTeam}
      </h3>
      {take && (
        <p className={`mt-2 text-[15px] leading-relaxed text-white/60 ${expanded ? '' : 'line-clamp-3'}`}>
          {take}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between rounded-[10px] border border-gold/60 bg-chip px-4 py-2.5">
        <span className="font-mono text-sm font-bold text-gold">{pick.pick}</span>
        {odds != null && <span className="font-mono text-sm text-white/55">{typeof odds === 'number' && odds > 0 ? `+${odds}` : odds}</span>}
      </div>
      {conf !== null && (
        <div className="mt-3 flex items-center gap-2">
          <Eyebrow>CONF</Eyebrow>
          <div className="h-1 flex-1 rounded bg-white/10">
            <div className="h-1 rounded bg-gold" style={{ width: `${conf}%` }} />
          </div>
          <span className="font-mono text-[11px] text-white/70">{conf}%</span>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 7: `web/components/PropCard.tsx`** — the silver twin. OVER calls gold, UNDER calls silver (locked app grammar):

```tsx
import { Eyebrow } from './Eyebrow';
import { normalizeLeague } from '@/lib/gary/leagues';
import type { PropPick } from '@/lib/gary/types';

export function PropCard({ prop, expanded = false }: { prop: PropPick; expanded?: boolean }) {
  const league = normalizeLeague(prop.league, prop.sport) ?? '';
  const isOver = (prop.bet ?? '').toLowerCase() === 'over' || (prop.bet ?? '').toLowerCase() === 'yes';
  const callColor = isOver ? 'text-gold' : 'text-silver';
  const odds = prop.odds;
  const rationale = (prop.rationale ?? prop.analysis ?? '').trim();

  return (
    <article className="rounded-[20px] border border-silver/30 bg-card p-5 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between">
        <Eyebrow>{league}{prop.matchup ? ` · ${prop.matchup}` : ''}</Eyebrow>
      </div>
      <h3 className="mt-2 font-display text-xl text-white/95">{prop.player}</h3>
      {rationale && (
        <p className={`mt-2 text-[15px] leading-relaxed text-white/60 ${expanded ? '' : 'line-clamp-3'}`}>{rationale}</p>
      )}
      <div className="mt-4 flex items-center justify-between rounded-[10px] border border-silver/50 bg-chip px-4 py-2.5">
        <span className={`font-mono text-sm font-bold uppercase ${callColor}`}>
          {prop.bet} {prop.line} {prop.prop?.replace(/\s[\d.]+$/, '')}
        </span>
        {odds != null && <span className="font-mono text-sm text-white/55">{odds > 0 ? `+${odds}` : odds}</span>}
      </div>
      {Array.isArray(prop.key_stats) && prop.key_stats.length > 0 && (
        <ul className="mt-3 space-y-1">
          {prop.key_stats.slice(0, 3).map((s, i) => (
            <li key={i} className="font-mono text-[12px] text-white/55">· {s}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
```

- [ ] **Step 8: `web/components/RecordTicker.tsx`** — recent wins marquee (server component; CSS animation, gated by prefers-reduced-motion which globals.css already handles). Constrain item width to avoid the iOS ticker width-explosion gotcha (truncate pick text at ~40 chars):

```tsx
import { Eyebrow } from './Eyebrow';

export interface TickerItem { league: string; pick: string; date: string }

export function RecordTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  const row = items.map(i => ({ ...i, pick: i.pick.length > 40 ? `${i.pick.slice(0, 40)}…` : i.pick }));
  return (
    <div className="overflow-hidden border-y border-white/8 bg-elev/60 py-2">
      <div className="flex w-max animate-[ticker_45s_linear_infinite] gap-8 px-4">
        {[...row, ...row].map((i, idx) => (
          <span key={idx} className="flex items-center gap-2 whitespace-nowrap">
            <Eyebrow>{i.league}</Eyebrow>
            <span className="font-mono text-[12px] text-white/75">{i.pick}</span>
            <span className="font-mono text-[12px] font-bold text-win">W</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

Add the keyframes to `globals.css`:

```css
@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
```

- [ ] **Step 9: `web/components/StatusBar.tsx`** — the terminal status line (REC w-l · pct% | N PLAYS LIVE | leagues). Server component taking computed props:

```tsx
import { sportByCode } from '@/lib/gary/leagues';

export function StatusBar({
  record, liveCount, liveLeagues,
}: {
  record: { wins: number; losses: number; pct: number } | null;
  liveCount: number;
  liveLeagues: string[];
}) {
  const pipe = <span className="mx-2 inline-block h-2.5 w-px bg-white/12 align-middle" />;
  return (
    <div className="font-mono text-[11px] leading-none">
      <span className="font-bold text-white/40">REC </span>
      {record ? (
        <>
          <span className="text-white/78">{record.wins}-{record.losses}</span>
          <span className="text-white/30"> · </span>
          <span className="font-bold text-gold">{record.pct}%</span>
        </>
      ) : (
        <span className="text-white/40">—</span>
      )}
      {pipe}
      <span className="font-bold text-white/55">
        {liveCount === 0 ? 'AWAITING SLATE' : liveCount === 1 ? '1 PLAY LIVE' : `${liveCount} PLAYS LIVE`}
      </span>
      {liveLeagues.length > 0 && (
        <>
          {pipe}
          {liveLeagues.map(code => (
            <span key={code} className="mr-1.5 font-bold" style={{ color: sportByCode(code)?.accent ?? 'rgba(255,255,255,0.55)' }}>
              {code}
            </span>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 10: `web/components/LiveChip.tsx`** — the ONLY polling client component. Fetches live_scores for today every 60s directly from PostgREST (anon key is public by design — same one the iOS binary ships):

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { LiveScoreRow } from '@/lib/gary/types';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function useLiveScores(date: string) {
  const [scores, setScores] = useState<LiveScoreRow[]>([]);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch(
          `${URL}/rest/v1/live_scores?select=*&date=eq.${date}`,
          { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
        );
        if (res.ok && alive) setScores(await res.json());
      } catch { /* keep last */ }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [date]);
  return scores;
}

export function LiveChip({ score }: { score: LiveScoreRow }) {
  const isLive = score.status === 'live';
  const isFinal = score.status === 'final';
  if (!isLive && !isFinal) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-chip px-2 py-1 font-mono text-[11px]">
      {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-win" />}
      <span className={isLive ? 'text-white/90' : 'text-white/55'}>
        {score.away_abbr} {score.away_score} · {score.home_abbr} {score.home_score}
      </span>
      <span className="text-white/45">{score.detail}</span>
    </span>
  );
}

/** Client wrapper: renders live chips for a set of league codes. */
export function LiveScoreStrip({ date, leagues }: { date: string; leagues?: string[] }) {
  const scores = useLiveScores(date);
  const filtered = leagues?.length
    ? scores.filter(s => leagues.includes((s.league ?? '').toUpperCase()))
    : scores;
  const active = filtered.filter(s => s.status === 'live' || s.status === 'final');
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {active.map(s => <LiveChip key={`${s.game_id}`} score={s} />)}
    </div>
  );
}
```

- [ ] **Step 11: Build + commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build
cd /Users/adam.preda/Desktop/Gary2.0
git add web/components web/app/layout.tsx web/app/globals.css web/public
git commit -m "web: core components — nav, footer, pick/prop cards, ticker, status bar, live chips"
```

---

### Task 9: Home page

**Files:**
- Modify: `web/app/page.tsx`

Zone rule: Home is the warm front door — the bear hosts, then the data closes. ONE gold hero (the top pick chip). Real bear asset, warm black, no blue tint.

- [ ] **Step 1: Implement `web/app/page.tsx`**

```tsx
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { AppStoreButton } from '@/components/AppStoreButton';
import { PickCard } from '@/components/PickCard';
import { PropCard } from '@/components/PropCard';
import { RecordTicker } from '@/components/RecordTicker';
import { Eyebrow } from '@/components/Eyebrow';
import { fetchTodayGamePicks, fetchTodayPropPicks, selectTopPick, selectTopProps } from '@/lib/gary/picks';
import { fetchAllGameResults, computeRecord, sinceDate } from '@/lib/gary/results';
import { estDateStr } from '@/lib/gary/dates';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Gary AI — Free Sports Picks for Every Game, Every Day',
  description:
    'Free daily picks with written reasoning across NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 World Cup. Public track record. Free on iOS.',
  alternates: { canonical: '/' },
};

export default async function Home() {
  const [gamePicks, propPicks, results] = await Promise.all([
    fetchTodayGamePicks(), fetchTodayPropPicks(), fetchAllGameResults(),
  ]);

  const topPick = selectTopPick(gamePicks);
  const topProp = selectTopProps(propPicks, 1)[0] ?? null;

  // Recent wins ticker (last 14 days, latest first)
  const cutoff = estDateStr(new Date(Date.now() - 14 * 86400000));
  const recentWins = sinceDate(results, cutoff)
    .filter(r => r.result === 'won' && (r.pick_text || r.matchup))
    .slice(0, 10)
    .map(r => ({ league: (r.league ?? '').toUpperCase(), pick: r.pick_text ?? r.matchup ?? '', date: r.game_date ?? '' }));

  // Last-30-day record for the proof strip
  const l30 = computeRecord(sinceDate(results, estDateStr(new Date(Date.now() - 30 * 86400000))));
  const allTime = computeRecord(results);

  return (
    <main>
      <RecordTicker items={recentWins} />

      {/* Hero — the bear hosts */}
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 text-center">
        <Image src="/brand/GaryIconBG.png" alt="Gary the bear" width={140} height={140} className="mx-auto" priority />
        <h1 className="mx-auto mt-6 max-w-3xl font-display text-5xl leading-tight text-white/95 md:text-6xl">
          Every Game. Everyday. Always Free.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
          Gary covers the full slate — not just best bets. Every pick comes with the
          reasoning behind it, and every result goes on the record.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <AppStoreButton />
          <Link href="/picks" className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/80 hover:border-white/30">
            See today&apos;s picks
          </Link>
        </div>
        <p className="mt-6 font-mono text-[12px] text-white/45">
          LAST 30 DAYS {l30.wins}-{l30.losses} · ALL-TIME {allTime.wins}-{allTime.losses} ({allTime.pct}%) ON {allTime.graded.toLocaleString()} GRADED PICKS
        </p>
      </section>

      {/* Today's free pick + prop — the data closes */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <Eyebrow>TODAY&apos;S FREE PICKS</Eyebrow>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {topPick ? <PickCard pick={topPick} /> : (
            <div className="rounded-[20px] border border-white/10 bg-card p-8 text-center text-white/45">
              Today&apos;s slate drops soon. Last night&apos;s results are on the <Link href="/results" className="text-white/75 underline">record</Link>.
            </div>
          )}
          {topProp && <PropCard prop={topProp} />}
        </div>
        <p className="mt-4 text-sm text-white/55">
          Full slate of Gary&apos;s picks are live. Every game covered. Completely free.{' '}
          <Link href="/picks" className="text-white/80 underline">All of today&apos;s picks →</Link>
        </p>
      </section>

      {/* How Gary works — honest, 3 steps */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <Eyebrow>HOW GARY WORKS</Eyebrow>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {[
            ['Research', 'A research agent investigates every game with live data tools — odds, stats, injuries, splits, weather.'],
            ['The call', 'Gary weighs the evidence against each sport’s rules and makes the call, with a confidence rating.'],
            ['On the record', 'Every pick is written up, graded the next morning, and added to the public track record.'],
          ].map(([title, body], i) => (
            <div key={title} className="rounded-[12px] border border-white/10 bg-card p-6">
              <span className="font-mono text-[11px] font-bold text-white/35">0{i + 1}</span>
              <h3 className="mt-2 font-display text-xl text-white/95">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/60">{body}</p>
            </div>
          ))}
        </div>
        <Link href="/how-it-works" className="mt-4 inline-block text-sm text-white/70 underline">The full methodology →</Link>
      </section>

      {/* App tease — Winners lives in the app */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-[20px] border border-white/10 bg-elev p-8 md:flex md:items-center md:justify-between">
          <div className="max-w-xl">
            <Eyebrow>IN THE APP</Eyebrow>
            <h2 className="mt-2 font-display text-3xl text-white/95">Gary&apos;s best bets, live scores, and the full Billfold</h2>
            <p className="mt-2 text-[15px] text-white/60">
              The website carries the free slate. The app adds Winners — Gary&apos;s
              highest-conviction board — plus live game tracking and the complete
              performance ledger.
            </p>
          </div>
          <div className="mt-6 md:mt-0"><AppStoreButton /></div>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify with real data**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build && npm run start &
sleep 4 && curl -s http://localhost:3000/ | grep -o "Every Game. Everyday. Always Free." && kill %1
```

Expected: the tagline appears in the server-rendered HTML (NOT empty shell).

- [ ] **Step 3: Commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add web/app/page.tsx && git commit -m "web: home page — bear hosts, live record, today's free pick + prop"
```

---

### Task 10: /picks and /picks/[sport]

**Files:**
- Create: `web/app/picks/page.tsx`, `web/app/picks/[sport]/page.tsx`

- [ ] **Step 1: `web/app/picks/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PickCard } from '@/components/PickCard';
import { Eyebrow } from '@/components/Eyebrow';
import { LiveScoreStrip } from '@/components/LiveChip';
import { JsonLd } from '@/components/JsonLd';
import { fetchTodayGamePicks, groupPicksByLeague } from '@/lib/gary/picks';
import { todayEST } from '@/lib/gary/dates';
import { SPORTS, sportByCode } from '@/lib/gary/leagues';

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Today's Free Sports Picks — Full Slate | Gary AI",
  description:
    "Every game on today's board with Gary's pick, written reasoning, and confidence rating. NBA, MLB, NHL, NFL, college, and the 2026 World Cup. Always free.",
  alternates: { canonical: '/picks' },
};

export default async function PicksPage() {
  const date = todayEST();
  const picks = await fetchTodayGamePicks();
  const byLeague = groupPicksByLeague(picks);
  const leaguesInPlay = [...byLeague.keys()];

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Gary AI free sports picks for ${date}`,
    numberOfItems: picks.length,
    itemListElement: picks.slice(0, 25).map((p, i) => ({
      '@type': 'ListItem', position: i + 1, name: `${p.awayTeam} @ ${p.homeTeam}: ${p.pick}`,
    })),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd data={itemList} />
      <Eyebrow>FREE PICKS · {date}</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Today&apos;s Picks</h1>
      <p className="mt-2 max-w-2xl text-white/60">
        The full slate, graded every morning. Sport pages:{' '}
        {SPORTS.map((s, i) => (
          <span key={s.slug}>
            {i > 0 && ' · '}
            <Link href={`/picks/${s.slug}`} className="text-white/80 underline">{s.name}</Link>
          </span>
        ))}
      </p>
      <div className="mt-4"><LiveScoreStrip date={date} /></div>

      {picks.length === 0 && (
        <div className="mt-10 rounded-[20px] border border-white/10 bg-card p-10 text-center text-white/50">
          Today&apos;s slate hasn&apos;t dropped yet. Picks land every morning —
          check the <Link href="/results" className="text-white/80 underline">track record</Link> meanwhile.
        </div>
      )}

      {leaguesInPlay.map(code => (
        <section key={code} className="mt-10">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: sportByCode(code)?.accent ?? '#666' }} />
            <h2 className="font-display text-2xl text-white/95">{sportByCode(code)?.longName ?? code}</h2>
            <span className="font-mono text-[11px] text-white/45">{byLeague.get(code)!.length} PICKS</span>
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {byLeague.get(code)!.map((p, i) => <PickCard key={p.pick_id ?? i} pick={p} />)}
          </div>
        </section>
      ))}
    </main>
  );
}
```

Create `web/components/JsonLd.tsx`:

```tsx
export function JsonLd({ data }: { data: object }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
```

- [ ] **Step 2: `web/app/picks/[sport]/page.tsx`** — per-sport landing with sport record header (the SEO workhorse):

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PickCard } from '@/components/PickCard';
import { Eyebrow } from '@/components/Eyebrow';
import { LiveScoreStrip } from '@/components/LiveChip';
import { JsonLd } from '@/components/JsonLd';
import { fetchTodayGamePicks } from '@/lib/gary/picks';
import { fetchAllGameResults, computeRecord, sinceDate } from '@/lib/gary/results';
import { normalizeLeague, SPORTS, sportBySlug } from '@/lib/gary/leagues';
import { todayEST, estDateStr } from '@/lib/gary/dates';

export const revalidate = 600;

export function generateStaticParams() {
  return SPORTS.map(s => ({ sport: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ sport: string }> }): Promise<Metadata> {
  const { sport } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg) return {};
  return {
    title: `Free ${cfg.longName} Picks Today — With Reasoning | Gary AI`,
    description: `Gary's free ${cfg.longName} picks for today with written rationale, confidence ratings, and a public graded track record. Updated daily.`,
    alternates: { canonical: `/picks/${cfg.slug}` },
  };
}

export default async function SportPicksPage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg) notFound();

  const [allPicks, results] = await Promise.all([fetchTodayGamePicks(), fetchAllGameResults()]);
  const picks = allPicks.filter(p => normalizeLeague(p.league, p.sport) === cfg.code);
  const sportResults = results.filter(r => (r.league ?? '').toUpperCase() === cfg.code);
  const allTime = computeRecord(sportResults);
  const l30 = computeRecord(sinceDate(sportResults, estDateStr(new Date(Date.now() - 30 * 86400000))));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'ItemList',
        name: `Gary AI free ${cfg.longName} picks`, numberOfItems: picks.length,
        itemListElement: picks.slice(0, 25).map((p, i) => ({
          '@type': 'ListItem', position: i + 1, name: `${p.awayTeam} @ ${p.homeTeam}: ${p.pick}`,
        })),
      }} />
      <Eyebrow accent={cfg.accent}>{cfg.code} · {todayEST()}</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Free {cfg.longName} Picks</h1>
      <p className="mt-3 font-mono text-[12px] text-white/45">
        {cfg.code} RECORD · L30 {l30.wins}-{l30.losses} · ALL-TIME {allTime.wins}-{allTime.losses}
        {allTime.graded > 0 ? ` (${allTime.pct}%)` : ''} ·{' '}
        <Link href={`/results/${cfg.slug}`} className="text-white/70 underline">FULL RECORD</Link>
      </p>
      <div className="mt-4"><LiveScoreStrip date={todayEST()} leagues={[cfg.code]} /></div>

      {picks.length === 0 ? (
        <div className="mt-10 rounded-[20px] border border-white/10 bg-card p-10 text-center text-white/50">
          No {cfg.name} picks on today&apos;s board{allTime.graded > 0 ? (
            <> — see the <Link href={`/results/${cfg.slug}`} className="text-white/80 underline">graded {cfg.name} record</Link> ({allTime.wins}-{allTime.losses}) while the season&apos;s quiet.</>
          ) : '.'}
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {picks.map((p, i) => <PickCard key={p.pick_id ?? i} pick={p} expanded />)}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Build, verify a sport page renders server-side, commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build && npm run start &
sleep 4 && curl -s http://localhost:3000/picks/mlb | grep -io "Free MLB Baseball Picks" && kill %1
cd /Users/adam.preda/Desktop/Gary2.0
git add web/app/picks web/components/JsonLd.tsx
git commit -m "web: /picks slate + per-sport SEO landing pages"
```

---

### Task 11: /props

**Files:**
- Create: `web/app/props/page.tsx`

- [ ] **Step 1: Implement** — props grouped by league, HR Threats as its own led lane:

```tsx
import type { Metadata } from 'next';
import { PropCard } from '@/components/PropCard';
import { Eyebrow } from '@/components/Eyebrow';
import { fetchTodayPropPicks, splitHrThreats, selectTopProps } from '@/lib/gary/picks';
import { normalizeLeague } from '@/lib/gary/leagues';
import { todayEST } from '@/lib/gary/dates';

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Today's Free Player Prop Picks | Gary AI",
  description:
    "Free player prop picks with the key stats behind each call, plus Gary's Home Run Threats board. Graded daily on the public record.",
  alternates: { canonical: '/props' },
};

export default async function PropsPage() {
  const props = await fetchTodayPropPicks();
  const { hr, rest } = splitHrThreats(props);
  const byLeague = new Map<string, typeof rest>();
  for (const p of rest) {
    const code = normalizeLeague(p.league, p.sport) ?? 'OTHER';
    byLeague.set(code, [...(byLeague.get(code) ?? []), p]);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Eyebrow>PROPS · {todayEST()}</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Today&apos;s Props</h1>

      {hr.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-2xl text-white/95">Gary Home Run Threats</h2>
          <p className="mt-1 text-sm text-white/55">Hitters with the conditions to leave the yard today.</p>
          <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {selectTopProps(hr, 12).map((p, i) => <PropCard key={i} prop={p} />)}
          </div>
        </section>
      )}

      {[...byLeague.entries()].map(([code, items]) => (
        <section key={code} className="mt-10">
          <h2 className="font-display text-2xl text-white/95">{code} Props</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {selectTopProps(items, 30).map((p, i) => <PropCard key={i} prop={p} />)}
          </div>
        </section>
      ))}

      {props.length === 0 && (
        <div className="mt-10 rounded-[20px] border border-white/10 bg-card p-10 text-center text-white/50">
          Today&apos;s props haven&apos;t dropped yet — they land with the morning slate.
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build
cd /Users/adam.preda/Desktop/Gary2.0
git add web/app/props && git commit -m "web: /props with Gary Home Run Threats lane"
```

---

### Task 12: /results and /results/[sport]

**Files:**
- Create: `web/app/results/page.tsx`, `web/app/results/[sport]/page.tsx`

Honesty rules: never hide the props record; pushes shown but excluded from win%; WBC shown as historical "World Baseball Classic".

- [ ] **Step 1: `web/app/results/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import {
  fetchAllGameResults, fetchAllPropResults, computeRecord, computePropsRecord,
  recordByLeague, currentStreak, sinceDate,
} from '@/lib/gary/results';
import { estDateStr } from '@/lib/gary/dates';
import { SPORTS, LEAGUE_DISPLAY, sportByCode } from '@/lib/gary/leagues';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Gary AI Track Record — Every Pick Graded | betwithgary.ai',
  description:
    'The complete public record of Gary AI sports picks: win-loss by sport, net units at flat stakes, streaks, and every graded result. No cherry-picking.',
  alternates: { canonical: '/results' },
};

const fmtUnits = (u: number) => `${u >= 0 ? '+' : '-'}${Math.abs(u).toFixed(1)}u`;

export default async function ResultsPage() {
  const [games, props] = await Promise.all([fetchAllGameResults(), fetchAllPropResults()]);
  const allTime = computeRecord(games);
  const l30 = computeRecord(sinceDate(games, estDateStr(new Date(Date.now() - 30 * 86400000))));
  const l7 = computeRecord(sinceDate(games, estDateStr(new Date(Date.now() - 7 * 86400000))));
  const streak = currentStreak(games);
  const byLeague = recordByLeague(games);
  const propsRec = computePropsRecord(props);
  const recent = games.filter(r => r.result === 'won' || r.result === 'lost' || r.result === 'push').slice(0, 25);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Eyebrow>THE RECORD</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Track Record</h1>
      <p className="mt-2 max-w-2xl text-white/60">
        Every pick is graded the morning after and stays on the record — wins, losses,
        and pushes. Units assume flat 1-unit stakes at the listed odds.
      </p>

      {/* Headline tiles */}
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {[
          ['ALL-TIME', `${allTime.wins}-${allTime.losses}-${allTime.pushes}`, `${allTime.pct}% · ${fmtUnits(allTime.netUnits)}`],
          ['LAST 30 DAYS', `${l30.wins}-${l30.losses}-${l30.pushes}`, `${l30.pct}% · ${fmtUnits(l30.netUnits)}`],
          ['LAST 7 DAYS', `${l7.wins}-${l7.losses}-${l7.pushes}`, `${l7.pct}% · ${fmtUnits(l7.netUnits)}`],
          ['STREAK', streak ? `${streak.count}${streak.kind === 'won' ? 'W' : 'L'}` : '—', streak?.kind === 'won' ? 'riding it' : streak ? 'owning it' : ''],
        ].map(([label, big, sub]) => (
          <div key={label} className="rounded-[12px] border border-white/10 bg-card p-5">
            <Eyebrow>{label}</Eyebrow>
            <p className="mt-2 font-display text-3xl text-white/95">{big}</p>
            <p className="mt-1 font-mono text-[12px] text-white/55">{sub}</p>
          </div>
        ))}
      </div>

      {/* By sport */}
      <section className="mt-12">
        <h2 className="font-display text-2xl text-white/95">By Sport</h2>
        <div className="mt-4 overflow-x-auto rounded-[12px] border border-white/10">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-white/10 font-mono text-[11px] uppercase text-white/45">
                <th className="px-4 py-3">Sport</th><th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Win %</th><th className="px-4 py-3">Net Units</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {[...byLeague.entries()]
                .sort((a, b) => b[1].graded - a[1].graded)
                .map(([code, rec]) => {
                  const cfg = sportByCode(code);
                  return (
                    <tr key={code} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3">
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: cfg?.accent ?? '#555' }} />
                        <span className="text-white/85">{cfg?.longName ?? LEAGUE_DISPLAY[code] ?? code}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-white/78">{rec.wins}-{rec.losses}{rec.pushes ? `-${rec.pushes}` : ''}</td>
                      <td className="px-4 py-3 font-mono text-sm text-white/78">{rec.pct}%</td>
                      <td className={`px-4 py-3 font-mono text-sm ${rec.netUnits >= 0 ? 'text-chart-win' : 'text-chart-loss'}`}>{fmtUnits(rec.netUnits)}</td>
                      <td className="px-4 py-3 text-right">
                        {cfg && <Link href={`/results/${cfg.slug}`} className="text-sm text-white/55 underline hover:text-white/85">details</Link>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Props — honest */}
      <section className="mt-12">
        <h2 className="font-display text-2xl text-white/95">Player Props</h2>
        <p className="mt-2 max-w-2xl text-[15px] text-white/60">
          Props record: <span className="font-mono text-white/85">{propsRec.wins}-{propsRec.losses}</span> ({propsRec.pct}%).
          Props are higher variance than game lines and Gary&apos;s prop model was rebuilt in June 2026 —
          the record stays public either way.
        </p>
      </section>

      {/* Recent results tape */}
      <section className="mt-12">
        <h2 className="font-display text-2xl text-white/95">Recent Results</h2>
        <ul className="mt-4 space-y-2">
          {recent.map((r, i) => (
            <li key={i} className="flex items-center justify-between rounded-[10px] border border-white/8 bg-card px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`font-mono text-[12px] font-bold ${r.result === 'won' ? 'text-win' : r.result === 'lost' ? 'text-loss' : 'text-gold'}`}>
                  {r.result === 'won' ? 'W' : r.result === 'lost' ? 'L' : 'P'}
                </span>
                <span className="truncate font-mono text-[13px] text-white/80">{r.pick_text}</span>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-3 font-mono text-[12px] text-white/45">
                <span>{(r.league ?? '').toUpperCase()}</span>
                <span>{r.final_score}</span>
                <span>{r.game_date}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: `web/app/results/[sport]/page.tsx`** — same shape filtered to one sport: headline tiles (all-time / L30 / streak for that sport) + last 50 graded results list. Reuse the exact patterns from Step 1 with `results.filter(r => (r.league ?? '').toUpperCase() === cfg.code)`, `generateStaticParams` over SPORTS, `generateMetadata` with title `` `${cfg.longName} Picks Track Record | Gary AI` ``, canonical `/results/${cfg.slug}`. notFound() for unknown slugs.

- [ ] **Step 3: Build, verify, commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build && npm run start &
sleep 4 && curl -s http://localhost:3000/results | grep -o "Track Record" | head -1 && kill %1
cd /Users/adam.preda/Desktop/Gary2.0
git add web/app/results && git commit -m "web: /results public track record + per-sport pages"
```

---

### Task 13: /hub

**Files:**
- Create: `web/app/hub/page.tsx`

- [ ] **Step 1: Implement** — lanes in LANE_ORDER, league sections only when rows exist, hit-rate badge when graded ≥ 5, spark mini-bars as tiny inline divs, tone coloring per LANES tint discipline:

```tsx
import type { Metadata } from 'next';
import { Eyebrow } from '@/components/Eyebrow';
import {
  fetchTodayInsights, fetchGradedYesterday, groupInsightsByLane,
  computeHitRate, LANES, LANE_ORDER, type LaneKey,
} from '@/lib/gary/hub';
import { todayEST } from '@/lib/gary/dates';
import type { InsightRow } from '@/lib/gary/types';

export const revalidate = 600;

export const metadata: Metadata = {
  title: "The Hub — Today's Edges & Insight Board | Gary AI",
  description:
    "Gary's daily insight board: heat checks, platoon edges, ballpark shifts, regression watches, and Home Run Threats — graded against results every morning.",
  alternates: { canonical: '/hub' },
};

function Spark({ values, tint }: { values: number[]; tint: 'green' | 'red' | 'neutral' }) {
  if (!values?.length) return null;
  const max = Math.max(...values.map(Math.abs), 0.0001);
  const color = tint === 'green' ? '#22C55E' : tint === 'red' ? '#EF4444' : 'rgba(255,255,255,0.5)';
  return (
    <span className="flex h-5 items-end gap-[2px]">
      {values.slice(-12).map((v, i) => (
        <span key={i} className="w-[3px] rounded-sm" style={{ height: `${Math.max(15, (Math.abs(v) / max) * 100)}%`, background: color, opacity: 0.85 }} />
      ))}
    </span>
  );
}

function InsightItem({ row, tint }: { row: InsightRow; tint: 'green' | 'red' | 'neutral' }) {
  return (
    <li className="rounded-[12px] border border-white/8 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-white/90">{row.headline}</p>
          {row.detail && <p className="mt-1 text-[13px] leading-relaxed text-white/55">{row.detail}</p>}
          <p className="mt-2 font-mono text-[11px] text-white/40">{row.game}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {row.value && <span className="font-mono text-sm font-bold text-white/85">{row.value}</span>}
          {Array.isArray(row.spark) && <Spark values={row.spark} tint={tint} />}
        </div>
      </div>
    </li>
  );
}

export default async function HubPage() {
  const [insights, gradedYday] = await Promise.all([fetchTodayInsights(), fetchGradedYesterday()]);
  const hitRate = computeHitRate(gradedYday);
  const leagues = ['MLB', 'NBA', 'WC'].filter(lg => insights.some(r => (r.league ?? '').toUpperCase() === lg));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>THE HUB · {todayEST()}</Eyebrow>
          <h1 className="mt-2 font-display text-4xl text-white/95">Today&apos;s Edges</h1>
        </div>
        {hitRate && hitRate.graded >= 5 && (
          <span className="rounded-md bg-chip px-3 py-1.5 font-mono text-[11px] font-bold text-white/70">
            {hitRate.hit} OF {hitRate.graded} HIT YDAY
          </span>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-white/60">
        The angles Gary&apos;s research surfaced today — every board is graded against
        actual results the next morning.
      </p>

      {insights.length === 0 && (
        <div className="mt-10 rounded-[20px] border border-white/10 bg-card p-10 text-center text-white/50">
          Today&apos;s board is still loading — edges land with the morning research run.
        </div>
      )}

      {leagues.map(lg => {
        const laneMap = groupInsightsByLane(insights.filter(r => (r.league ?? '').toUpperCase() === lg));
        const lanes = LANE_ORDER.filter(k => laneMap.has(k));
        if (lanes.length === 0) return null;
        return (
          <section key={lg} className="mt-12">
            <h2 className="font-display text-2xl text-white/95">{lg === 'WC' ? '2026 World Cup' : lg}</h2>
            {lanes.map((k: LaneKey) => (
              <div key={k} className="mt-6">
                <Eyebrow>{LANES[k].chip}</Eyebrow>
                <h3 className="mt-1 font-display text-xl text-white/90">{LANES[k].title}</h3>
                <ul className="mt-3 grid gap-3 md:grid-cols-2">
                  {laneMap.get(k)!.slice(0, 8).map(row => (
                    <InsightItem key={row.id} row={row} tint={LANES[k].tint} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 2: Build, verify hub renders lanes with real data, commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build && npm run start &
sleep 4 && curl -s http://localhost:3000/hub | grep -io "Today's Edges" | head -1 && kill %1
cd /Users/adam.preda/Desktop/Gary2.0
git add web/app/hub && git commit -m "web: /hub — Today's Edges lanes with hit-rate badge"
```

---

### Task 14: /how-it-works, /app, /contact

**Files:**
- Create: `web/app/how-it-works/page.tsx`, `web/app/app/page.tsx`, `web/app/contact/page.tsx`

- [ ] **Step 1: `/how-it-works`** — the honest methodology page + FAQPage JSON-LD. Content requirements (write as plain prose sections, no hype):
  - **Research**: a research agent investigates every matchup with live data tools — real-time odds across sportsbooks, season/recent stats, injuries with dates, platoon splits, ballpark factors, weather. It only reports what it can verify.
  - **The call**: Gary evaluates the evidence against per-sport rules (each sport has its own written constitution — e.g. MLB weighs starting pitching and price; NCAAB respects guard play and rest), assigns a confidence rating (50–100%), and writes the full rationale.
  - **Fact-check**: numeric claims in the writeup are audited against the underlying data before publishing (the statAudit pass); picks that fail get corrected or retried.
  - **Grading**: every pick is graded against final scores the next morning and added to the public record — including losses.
  - FAQ items (FAQPage JSON-LD): "Is Gary free?" (yes — every pick, every day; the app adds Winners, Gary's highest-conviction board), "What sports does Gary cover?" (NBA, NFL, NHL, MLB, NCAAB, NCAAF, 2026 World Cup), "Does Gary place bets?" (no — informational/entertainment only), "How is the record calculated?" (every graded pick, flat 1-unit stakes, pushes excluded from win%).
  - Title: `How Gary Works — Methodology | Gary AI`, canonical `/how-it-works`.

- [ ] **Step 2: `/app`** — the app showcase. Sections: hero ("The full Gary experience lives in the app"), feature list mirroring the 5 tabs (Home briefing · Winners best bets [premium tease — blurred matte cards mock, no real picks] · The Hub · live Picks carousel · the Billfold ledger), screenshots placeholder grid (use `GaryMarketing/producthunt/gallery_*.png` copied to `web/public/press/`), AppStoreButton, smart-banner note. Title: `Gary AI for iOS — Every Game, Every Day | betwithgary.ai`, canonical `/app`.

```bash
mkdir -p /Users/adam.preda/Desktop/Gary2.0/web/public/press
cp /Users/adam.preda/Desktop/Gary2.0/GaryMarketing/producthunt/gallery_hero_1270x760.png \
   /Users/adam.preda/Desktop/Gary2.0/GaryMarketing/producthunt/gallery_stats_1270x760.png \
   /Users/adam.preda/Desktop/Gary2.0/GaryMarketing/producthunt/gallery_howitworks_1270x760.png \
   /Users/adam.preda/Desktop/Gary2.0/web/public/press/
```

- [ ] **Step 3: `/contact`** — single card: support@betwithgary.ai, X @BetwithGary, App Store link. Title `Contact | Gary AI`, canonical `/contact`.

- [ ] **Step 4: Build + commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build
cd /Users/adam.preda/Desktop/Gary2.0
git add web/app/how-it-works web/app/app web/app/contact web/public/press
git commit -m "web: how-it-works methodology, app showcase, contact"
```

---

### Task 15: /terms and /privacy (rewritten legal)

**Files:**
- Create: `web/app/terms/page.tsx`, `web/app/privacy/page.tsx`

Rules: domain is betwithgary.ai everywhere; emails support@/legal@/privacy@betwithgary.ai; governing law stays Ohio (Cincinnati); REMOVE dead features (user-generated content, chat posting, web DFS, local bet/fade storage); cover BOTH the website (no accounts, read-only, Vercel Analytics) and the iOS app (optional accounts via email/Apple/Google, push notifications); keep informational/entertainment + no-gambling-facilitation language; 18+; arbitration/liability boilerplate carried from the existing Terms but scoped to real features. Use the existing `gary2.0/src/pages/TermsOfService.jsx` and `PrivacyPolicy.jsx` as the structural base — port the still-true sections, drop the dead ones, fix the domain.

- [ ] **Step 1: Write both pages** (static server components, `prose`-style layout with `max-w-3xl`, h2 sections, `Last updated: June 4, 2026`).
- [ ] **Step 2: Build + grep-verify no `.com` leakage:**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build
grep -ri "betwithgary.com" app/ && echo "FAIL: .com found" || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add web/app/terms web/app/privacy
git commit -m "web: rewritten terms + privacy on betwithgary.ai, dead features removed"
```

---

### Task 16: /press + llms.txt (the AI-marketing feeding trough)

**Files:**
- Create: `web/app/press/page.tsx`, `web/app/llms.txt/route.ts`, `web/lib/gary/press.ts`

- [ ] **Step 1: `web/lib/gary/press.ts`** — single source for canonical copy + live stats:

```ts
import { fetchAllGameResults, computeRecord, sinceDate } from './results';
import { estDateStr } from './dates';

export const BRAND = {
  name: 'Gary AI',
  legalName: 'Gary A.I. LLC',
  domain: 'https://www.betwithgary.ai',
  tagline: 'Every Game. Everyday. Always Free.',
  cta: "Full slate of Gary's picks are live. Every game covered. Completely free.",
  appStoreUrl: 'https://apps.apple.com/us/app/gary-ai/id6751238914',
  appStoreId: '6751238914',
  x: '@BetwithGary',
  xUrl: 'https://x.com/BetwithGary',
  supportEmail: 'support@betwithgary.ai',
  sports: ['NBA', 'NFL', 'NHL', 'MLB', 'NCAAB', 'NCAAF', '2026 FIFA World Cup'],
  character: 'Gary is a bear — a 30-year-veteran bettor who owns his losses. Always use the real character assets; never generate a bear, and never a lion.',
  boilerplateShort:
    'Gary AI delivers free daily sports picks for every game on the board, with written reasoning and a public graded track record. Free on iOS.',
  boilerplateMedium:
    'Gary AI is a free AI sports handicapper covering the full slate — NBA, NFL, NHL, MLB, college basketball and football, and the 2026 World Cup. A research agent investigates every matchup with live data; Gary makes the call with a confidence rating and a written rationale. Every pick is graded the next morning and stays on the public record. Free on iOS, with picks, props, the insight Hub, and the track record also published at betwithgary.ai.',
  boilerplateLong:
    'Gary AI is a free AI-powered sports handicapper built around one promise: every game, every day, always free. For each matchup, a research agent investigates live sportsbook odds, season and recent statistics, injuries, platoon splits, ballpark factors, and situational angles. Gary then weighs that evidence against sport-specific rules, assigns a confidence rating, and writes out the full reasoning behind the pick — game lines and player props across NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 FIFA World Cup. Numeric claims are fact-checked against the underlying data before publishing, every pick is graded against final scores the next morning, and the complete win-loss record — including losing streaks — is public at betwithgary.ai/results. The iOS app adds Winners (Gary’s highest-conviction board), live score tracking, and the full Billfold performance ledger. Gary is for informational and entertainment purposes only and does not facilitate gambling.',
  disclaimer:
    "Gary is for informational and entertainment purposes only. We don't facilitate gambling, accept deposits, or place bets. 18+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.",
};

export async function liveStats() {
  const games = await fetchAllGameResults(3600);
  const allTime = computeRecord(games);
  const l30 = computeRecord(sinceDate(games, estDateStr(new Date(Date.now() - 30 * 86400000))));
  return { allTime, l30, asOf: estDateStr(new Date()) };
}
```

- [ ] **Step 2: `web/app/press/page.tsx`** — sections: Brand facts table (name, tagline, domain, App Store, X, sports, founded entity); Boilerplate (short/medium/long in copyable `<pre>` blocks); Live stats (record pulled from `liveStats()`, labeled with as-of date); Assets (download links to `/brand/GaryIconBG.png`, `/brand/gary-head.png`, `/coin2.png`, `/press/gallery_*.png` with dimensions + usage note: warm black backgrounds, no blue tint, never recreate the bear); Disclaimer block. `revalidate = 3600`. Title `Press & Brand Kit | Gary AI`, canonical `/press`.

- [ ] **Step 3: `web/app/llms.txt/route.ts`**

```ts
import { BRAND, liveStats } from '@/lib/gary/press';

export const revalidate = 3600;

export async function GET() {
  const stats = await liveStats();
  const body = `# ${BRAND.name} (betwithgary.ai)

> ${BRAND.boilerplateShort}

## Facts
- Product: ${BRAND.name} — free AI sports picks app (iOS) + website
- Tagline: "${BRAND.tagline}"
- Sports covered: ${BRAND.sports.join(', ')}
- Price: free. Every pick, every day. The iOS app adds Winners (Gary's highest-conviction board).
- iOS App Store: ${BRAND.appStoreUrl}
- X / Twitter: ${BRAND.x} (${BRAND.xUrl})
- Support: ${BRAND.supportEmail}
- Entity: ${BRAND.legalName}

## Track record (live, as of ${stats.asOf})
- All-time game picks: ${stats.allTime.wins}-${stats.allTime.losses}-${stats.allTime.pushes} (${stats.allTime.pct}% win rate on ${stats.allTime.graded} graded picks)
- Last 30 days: ${stats.l30.wins}-${stats.l30.losses}-${stats.l30.pushes} (${stats.l30.pct}%)
- Full graded record: ${BRAND.domain}/results

## How it works
${BRAND.boilerplateMedium}

## Brand rules for generated content
- ${BRAND.character}
- Voice: plain, professional, understated. No hype, no rhetorical-question hooks.
- Colors: gold #C9A227 on near-black #08080A. No blue tint.
- Required disclaimer: ${BRAND.disclaimer}

## Key pages
- ${BRAND.domain}/picks — today's free picks (all sports)
- ${BRAND.domain}/props — today's player props + Home Run Threats
- ${BRAND.domain}/hub — daily insight board (Today's Edges)
- ${BRAND.domain}/results — complete graded track record
- ${BRAND.domain}/how-it-works — methodology
- ${BRAND.domain}/press — brand kit and approved boilerplate
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
```

- [ ] **Step 4: Build, curl-verify llms.txt renders live numbers, commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build && npm run start &
sleep 4 && curl -s http://localhost:3000/llms.txt | head -20 && kill %1
cd /Users/adam.preda/Desktop/Gary2.0
git add web/app/press web/app/llms.txt web/lib/gary/press.ts
git commit -m "web: /press brand kit + llms.txt with live stats"
```

---

### Task 17: SEO machinery — JSON-LD, sitemap, robots, OG image, redirects

**Files:**
- Modify: `web/app/layout.tsx` (site-wide JSON-LD)
- Create: `web/app/sitemap.ts`, `web/app/robots.ts`, `web/app/opengraph-image.tsx`, modify `web/next.config.ts`

- [ ] **Step 1: Site-wide JSON-LD in layout** — add to layout body via `<JsonLd>`:

```tsx
const softwareApp = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Gary AI',
  operatingSystem: 'iOS',
  applicationCategory: 'SportsApplication',
  description:
    'Free AI sports picks for every game, every day — NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 World Cup — with written reasoning and a public track record.',
  url: 'https://www.betwithgary.ai/',
  image: 'https://www.betwithgary.ai/brand/GaryIconBG.png',
  downloadUrl: 'https://apps.apple.com/us/app/gary-ai/id6751238914',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Gary A.I. LLC', url: 'https://www.betwithgary.ai/' },
};
const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Gary A.I. LLC',
  url: 'https://www.betwithgary.ai/',
  logo: 'https://www.betwithgary.ai/brand/GaryIconBG.png',
  sameAs: ['https://apps.apple.com/us/app/gary-ai/id6751238914', 'https://x.com/BetwithGary'],
};
```

- [ ] **Step 2: `web/app/sitemap.ts`**

```ts
import type { MetadataRoute } from 'next';
import { SPORTS } from '@/lib/gary/leagues';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.betwithgary.ai';
  const now = new Date();
  const daily = (path: string, priority: number): MetadataRoute.Sitemap[number] =>
    ({ url: `${base}${path}`, lastModified: now, changeFrequency: 'daily', priority });

  return [
    daily('/', 1),
    daily('/picks', 0.9),
    ...SPORTS.map(s => daily(`/picks/${s.slug}`, 0.9)),
    daily('/props', 0.8),
    daily('/results', 0.9),
    ...SPORTS.map(s => daily(`/results/${s.slug}`, 0.7)),
    daily('/hub', 0.8),
    { url: `${base}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/app`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/press`, lastModified: now, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.1 },
  ];
}
```

- [ ] **Step 3: `web/app/robots.ts`** — explicitly welcome AI crawlers (a stated product goal):

```ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Claude-Web', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
    ],
    sitemap: 'https://www.betwithgary.ai/sitemap.xml',
  };
}
```

- [ ] **Step 4: `web/app/opengraph-image.tsx`** — branded 1200×630 card (replaces the square coin):

```tsx
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Gary AI — Every Game. Everyday. Always Free.';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: 80, background: '#08080A',
        borderBottom: '6px solid #C9A227',
      }}>
        <div style={{ color: '#C9A227', fontSize: 28, letterSpacing: 4, fontFamily: 'monospace' }}>
          BETWITHGARY.AI
        </div>
        <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 84, fontWeight: 700, marginTop: 24, lineHeight: 1.05 }}>
          Every Game. Everyday.
        </div>
        <div style={{ color: '#C9A227', fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
          Always Free.
        </div>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 30, marginTop: 28 }}>
          Free AI sports picks with written reasoning and a public track record.
        </div>
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 5: Redirects in `web/next.config.ts`** — old indexed routes:

```ts
const nextConfig = {
  async redirects() {
    return [
      { source: '/changelog', destination: '/', permanent: true },
    ];
  },
};
export default nextConfig;
```

- [ ] **Step 6: Build; curl-verify `/sitemap.xml`, `/robots.txt`, `/opengraph-image` respond; commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web && npm run build && npm run start &
sleep 4
curl -s http://localhost:3000/sitemap.xml | head -5
curl -s http://localhost:3000/robots.txt
curl -sI http://localhost:3000/changelog | grep -i "location"
kill %1
cd /Users/adam.preda/Desktop/Gary2.0
git add web/app/sitemap.ts web/app/robots.ts web/app/opengraph-image.tsx web/next.config.ts web/app/layout.tsx
git commit -m "web: SEO machinery — JSON-LD, sitemap, robots (AI crawlers welcomed), branded OG, redirects"
```

---

### Task 18: Copy-accuracy audit + full verification

**Files:** none new — verification gates.

- [ ] **Step 1: Banned-phrase greps (these MUST all come back clean):**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web
grep -rin "three ai models\|3-model\|gpt-5\|perplexity\|deep think" app/ components/ lib/ && echo "FAIL" || echo "OK: no stale model claims"
grep -rin "betwithgary\.com" app/ components/ lib/ && echo "FAIL" || echo "OK: no .com domain"
grep -rin "lion" app/ components/ lib/ && echo "FAIL" || echo "OK: no lions"
grep -rn "system-ui.*serif\|font-serif" app/ components/ && echo "CHECK: serif used" || echo "OK: no serif"
```

- [ ] **Step 2: Full test suite + build**

```bash
npx vitest run && npm run build
```

- [ ] **Step 3: Manual page sweep** — `npm run start`, then curl every route and confirm 200 + non-empty content: `/`, `/picks`, `/picks/mlb`, `/picks/world-cup`, `/props`, `/results`, `/results/nba`, `/hub`, `/how-it-works`, `/app`, `/press`, `/contact`, `/terms`, `/privacy`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`.

- [ ] **Step 4: Commit any fixes; tag the milestone**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add -A web/ && git commit -m "web: verification fixes" || true
```

---

### Task 19: Vercel deploy (preview, then user-approved cutover)

**Files:**
- Possibly create: `web/vercel.json` (not needed — zero-config Next.js)

- [ ] **Step 1: Preview deploy** from `web/`:

```bash
cd /Users/adam.preda/Desktop/Gary2.0/web
npx vercel link    # create NEW project "betwithgary-web" (do NOT link the old gary2.0 project)
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel deploy
```

- [ ] **Step 2: Verify the preview URL** — every route from Task 18 Step 3, with real data rendering, OG image loads, view-source shows server-rendered pick content (not an empty shell).

- [ ] **Step 3: STOP — ask the user** to approve pointing betwithgary.ai (+ www) at the new project. Domain cutover is outward-facing; do not do it unprompted. After approval: move the domain in the Vercel dashboard or `npx vercel domains`, then `npx vercel deploy --prod`, then re-verify https://www.betwithgary.ai.

---

### Task 20: Legacy web cleanup in gary2.0/ (ONLY after cutover is verified)

**Files:**
- Delete: `gary2.0/src/pages/`, `gary2.0/src/components/`, `gary2.0/src/App.jsx`, `gary2.0/src/main.jsx`, `gary2.0/index.html`, `gary2.0/src/styles/`, `gary2.0/src/assets/`, `gary2.0/public/` (keeper assets already copied to web/), `gary2.0/api/gemini-proxy.js`, `gary2.0/api/generate-dfs-lineups.js`, `gary2.0/vercel.json`, `gary2.0/dist/`, `gary2.0/vite.config.js`, `gary2.0/postcss.config.js`, `gary2.0/tailwind.config.js`, `gary2.0/eslint.config.js` (web-specific), `gary2.0/src/services/performanceService.js`
- Modify: `gary2.0/package.json`, `gary2.0/src/supabaseClient.js`

- [ ] **Step 1: Confirm nothing in the pipeline imports what's being deleted**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/gary2.0
grep -rn "performanceService\|src/pages\|src/components\|src/styles" scripts/ src/services/ run-*.js supabase/functions/ 2>/dev/null && echo "STOP: pipeline dependency found" || echo "OK to delete"
grep -rn "gemini-proxy\|generate-dfs-lineups" /Users/adam.preda/Desktop/Gary2.0/ios/GaryApp/*.swift && echo "STOP: iOS depends on api/" || echo "OK"
```

- [ ] **Step 2: Delete the web surface** (the exact file list above via `git rm -r`).

- [ ] **Step 3: Prune `gary2.0/package.json`**: remove `dev`, `build`, `preview`, `lint` scripts; remove deps `react`, `react-dom`, `react-router-dom`, `react-helmet-async`, `@vercel/analytics`, `framer-motion`, `lucide-react`, `@tailwindcss/aspect-ratio`, `@tailwindcss/typography`; remove devDeps `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`, `@tailwindcss/forms`, `@types/react`, `@types/react-dom`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`. KEEP: `vite`? — NO, remove `vite` but KEEP `vitest` (pipeline tests) and everything else. Keep all `picks:*`/`gary:*`/`test` scripts. Run `npm install` to regenerate the lockfile.

- [ ] **Step 4: Clean `gary2.0/src/supabaseClient.js`** — remove the browser branch (import.meta.env reads + the init console.log) so it's a Node-only module; KEEP `storeDailyPicks` and the process.env path intact (pipeline depends on it).

- [ ] **Step 5: Verify the pipeline still works**

```bash
cd /Users/adam.preda/Desktop/Gary2.0/gary2.0
npm test
node --check scripts/run-agentic-picks.js && node --check run-insight-connections.js && node --check run-grade-insights.js && node --check scripts/run-all-results.js
node -e "import('./src/supabaseClient.js').then(m => console.log('supabaseClient OK:', typeof m.storeDailyPicks))"
```

Expected: tests pass, all syntax checks pass, storeDailyPicks is 'function'.

- [ ] **Step 6: Commit**

```bash
cd /Users/adam.preda/Desktop/Gary2.0
git add -A gary2.0/ && git commit -m "gary2.0: remove legacy web app — site now lives in web/ (pipeline untouched)"
```

---

## Self-review notes

- **Spec coverage:** all spec sections map to tasks (architecture→1-2, data layer→3-7, sitemap→9-16, design→1/8, SEO/AI→16-17, cleanup→20, flagged follow-ups intentionally out of scope).
- **Known judgment calls baked in:** `/picks/[sport]` shows record + empty-state for off-season sports (keeps 7 SEO pages alive year-round); props record shown honestly with one plain-prose context line; WBC displayed as historical league; `/app` premium tease uses mock blurred cards, never real Winners data (there IS no separate winners table — Winners is a curated view in-app, so nothing leaks).
- **Type consistency check:** `Record_` (results.ts) used by press.ts/pages; `LaneKey`/`LANES` (hub.ts) used by hub page; `SportConfig` (leagues.ts) used everywhere — names match across tasks.
