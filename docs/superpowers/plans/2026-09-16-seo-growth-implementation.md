# SEO, Discovery & Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the remaining website indexing, discovery-destination, journey, and measurement work from the Sep 16 SEO/growth handoff, verify it in production, and leave the audit, query map, measurement, outreach and handoff documents ready for Adam.

**Architecture:** All code changes are additive edits to the Next.js 16.3 app in `web/` (server components, metadata, sitemaps, analytics client/server, weekly report). No pick engines, models, prices, entitlements or the X publisher change. Two new indexable routes (`/props/home-runs`, `/props/touchdowns`) reuse the existing prop feed, classification helpers and native `PropRow` cards. Measurement adds an explicit internal-test exclusion, two attribution corrections, paywall dedup and a wider weekly report. Docs land under `GaryMarketing/launch-2026-09/` plus a root handoff.

**Tech Stack:** Next.js 16.3 (App Router, async server components, `retry` error boundary prop), React 19, TypeScript, Vitest 4 (`tests/**/*.test.ts`, node env, `vi.mock` + `renderToStaticMarkup`), Tailwind, Supabase PostgREST via `lib/gary/supabase.ts` `rest()`, Vercel (project `gary2.0`, root `web`).

**Spec:** `/Users/adam.preda/Downloads/FABLE_SEO_GROWTH_IMPLEMENTATION_HANDOFF_2026-09-16.md` (copy also at `/Users/adam.preda/Documents/ChatGPT/Gary/FABLE_SEO_GROWTH_IMPLEMENTATION_HANDOFF_2026-09-16.md`). Understand-phase evidence: `/private/tmp/claude-501/-Users-adam-preda/9a3fc2d9-897f-4d53-8364-78910e2217ca/scratchpad/maps/*.json` and `.../scratchpad/live-probe/`.

## Global Constraints

- Production checkout `/Users/adam.preda/Gary2.0`, branch `main`, HEAD at plan time `87ecd166`. Work directly on `main`; push to `origin/main` after verification (root `AGENTS.md`).
- Shared checkout: **never** `git add -A` / `git add .`; every commit is `git add <paths> && git commit -m "..." -- <paths>` in ONE call. `ios/GaryApp/GoogleService-Info.plist` is modified locally and must stay uncommitted.
- Do not change: pick generation, grading, prices/entitlements (`lib/gary/pricing.ts` golden rule), model routing, the X publisher (`gary2.0/supabase/functions/social-auto-post/*`), `WinnersClient` hooks (tests mock `useState` in order).
- Product language (spec §1): "The Picks" / "Winners" (Gary's best bets of the day, number varies, designation ≠ win) / "The Hub". Never "board", "card", "shortlist" as the product. No parlay. No human bio. HR/TD are fun lanes: never a public tally/record for HR; no TD results block. `/props/touchdowns` is **NFL-only** anytime touchdown; never claim first-TD coverage.
- Approved Winners sentence, verbatim: `Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most.` (curly apostrophes, from `components/site/Sections.tsx:107`).
- Design: reuse existing classes (`site-wrap`, `rounded-panel`, `border-line`, `bg-card`, `text-gold underline decoration-gold/40 underline-offset-4`, `font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold`, `site-pick-grid`, `PageMasthead`, `StitchRule`). No new card style. Mobile 320/390 must not overflow.
- Next 16.3: read `web/node_modules/next/dist/docs/` before touching framework behavior; error boundaries take `{ error, retry }`; `params` is a Promise; canonicals are relative paths resolved by `metadataBase` (`app/layout.tsx:16`). Never add a route file under `web/app/sitemap-index.xml/` or `web/app/archive/inventory.xml/`.
- Time: all dates ET (`todayEST()` rolls at 3 AM ET). Artifact date = actual execution date (expected **2026-09-17**).
- Tests: focused test per task, then full `npm --prefix web test`, `run typecheck`, `run lint`, `run build`, root `npm run smoke:web`, `npm run smoke:sitemaps` before release. Pre-existing lint warnings (BookClient/DeleteAccount `window.location.assign`) are known.
- Authorization limits: no sends, form submissions, paid services, new cron/monitors, no indexing-API tools, no bulk indexing requests. Search Console / Vercel Analytics reads require Adam to pick a Chrome browser (`select_browser`); ask ONCE, at Task 25, never earlier.

---

## Phase A — Code (sequential, one commit per task)

### Task 1: Prop lane predicates

**Files:**
- Modify: `web/lib/gary/prop-lanes.ts` (whole file)
- Test: `web/tests/picks.test.ts` (append cases after line 68)

**Interfaces:**
- Produces: `isMlbHomeRun(p: PropPick): boolean`, `isNflAnytimeTdPick(p: PropPick): boolean`; `isLongShot` unchanged signature, now `isMlbHomeRun(p) || isNflAnytimeTdPick(p)`.

- [ ] **Step 1: Write the failing tests** — append to `web/tests/picks.test.ts`:

```ts
import { isMlbHomeRun, isNflAnytimeTdPick } from '@/lib/gary/prop-lanes';

describe('prop lane predicates', () => {
  it('identifies MLB home runs by the stored lane label or the batter market token', () => {
    expect(isMlbHomeRun({ sport: 'MLB HR', prop: 'home_runs 0.5' })).toBe(true);
    expect(isMlbHomeRun({ sport: 'MLB', prop: 'home_runs 0.5' })).toBe(true);
    expect(isMlbHomeRun({ league: 'MLB', prop: 'home_run 0.5' })).toBe(true);
    expect(isMlbHomeRun({ sport: 'MLB', prop: 'batter_home_runs 0.5' })).toBe(true);
    expect(isMlbHomeRun({ sport: 'MLB', prop: 'pitcher_home_runs 0.5' })).toBe(false);
    expect(isMlbHomeRun({ sport: 'MLB', prop: 'hits 0.5' })).toBe(false);
    expect(isMlbHomeRun({ sport: 'NFL', prop: 'home_runs 0.5' })).toBe(false);
    expect(isMlbHomeRun({})).toBe(false);
  });
  it('identifies NFL anytime touchdowns only, never NCAAF or yardage totals', () => {
    expect(isNflAnytimeTdPick({ sport: 'NFL', prop: 'anytime_td 0.5' })).toBe(true);
    expect(isNflAnytimeTdPick({ league: 'NFL', prop: 'anytime_touchdown 0.5' })).toBe(true);
    expect(isNflAnytimeTdPick({ sport: 'NCAAF', prop: 'anytime_touchdown 0.5' })).toBe(false);
    expect(isNflAnytimeTdPick({ sport: 'NFL', prop: 'rushing_touchdowns 0.5' })).toBe(false);
    expect(isNflAnytimeTdPick({ sport: 'NFL', prop: 'first_td 0.5' })).toBe(false);
    expect(isNflAnytimeTdPick({})).toBe(false);
  });
  it('keeps isLongShot equal to the union of both lanes', () => {
    expect(isLongShot({ sport: 'MLB', prop: 'home_runs 0.5' })).toBe(true);
    expect(isLongShot({ sport: 'NFL', prop: 'anytime_td 0.5' })).toBe(true);
    expect(isLongShot({ sport: 'MLB', prop: 'pitcher_strikeouts 5.5' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `cd web && npx vitest run tests/picks.test.ts` → FAIL (`isMlbHomeRun` not exported).

- [ ] **Step 3: Implement** — replace `web/lib/gary/prop-lanes.ts` with:

```ts
import { normalizeLeague } from './leagues';
import type { PropPick } from './types';

/** NFL-only anytime-scorer classification, matching the current native lane. */
export function isNflAnytimeTd(
  league?: string | null,
  market?: string | null,
  pickText?: string | null,
): boolean {
  if (normalizeLeague(league) !== 'NFL') return false;
  return [market, pickText].some(value => {
    const token = (value ?? '').toLowerCase().replace(/_/g, ' ').trim();
    return /\banytime[\s-]*(?:td|touchdown)\b/.test(token) ||
      /^(?:td|touchdown) scorer(?:\s+[+-]?\d+(?:\.\d+)?)?$/.test(token);
  });
}

// Stored props carry the market as `<type> <line>` ("home_runs 0.5"). The
// batter home-run tokens below match the results-side lane rule in
// results.ts (isHrLaneResult); pitcher home runs allowed stay a core prop.
const HOME_RUN_TOKENS = new Set(['home_runs', 'home_run', 'homeruns', 'homerun', 'batter_home_runs']);

function marketToken(market?: string | null): string {
  return (market ?? '').toLowerCase().trim().replace(/\s+[+-]?\d+(?:\.\d+)?$/, '').trim().replace(/\s+/g, '_');
}

/** MLB batter home run: the lane label the runner stamps, or the market token on an MLB row. */
export function isMlbHomeRun(p: PropPick): boolean {
  const league = normalizeLeague(p.league, p.sport);
  if (league === 'MLB HR') return true;
  if (league !== 'MLB') return false;
  const token = marketToken(p.prop);
  if (token.startsWith('pitcher')) return false;
  return HOME_RUN_TOKENS.has(token);
}

/** NFL anytime touchdown scorer on a stored pick (never NCAAF, never first-TD). */
export function isNflAnytimeTdPick(p: PropPick): boolean {
  return isNflAnytimeTd(normalizeLeague(p.league, p.sport), p.prop);
}

/** Fun picks remain game-adjacent cards, outside the core prop showcase. */
export function isLongShot(p: PropPick): boolean {
  return isMlbHomeRun(p) || isNflAnytimeTdPick(p);
}
```

- [ ] **Step 4: Run** `npx vitest run tests/picks.test.ts tests/featured-prop-ticket.test.ts tests/results.test.ts tests/native-card-model.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
cd /Users/adam.preda/Gary2.0 && git add web/lib/gary/prop-lanes.ts web/tests/picks.test.ts && git commit -m "Separate home run and anytime touchdown prop lanes" -- web/lib/gary/prop-lanes.ts web/tests/picks.test.ts
```

---

### Task 2: WinnersInvitation component

**Files:**
- Create: `web/components/WinnersInvitation.tsx`
- Test: `web/tests/winners-invitation.test.ts`

**Interfaces:**
- Produces: `export const WINNERS_INVITATION_BODY: string`; `export function WinnersInvitation({ className?: string })` (server component, one `<aside>` with a `/winners` link).

- [ ] **Step 1: Write the failing test** `web/tests/winners-invitation.test.ts`:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WINNERS_INVITATION_BODY, WinnersInvitation } from '@/components/WinnersInvitation';

describe('WinnersInvitation', () => {
  it('uses the approved sentence and links to Winners without promising a count or a result', () => {
    const html = renderToStaticMarkup(<WinnersInvitation />);
    expect(WINNERS_INVITATION_BODY).toBe('Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most.');
    expect(html).toContain('href="/winners"');
    expect(html).toContain('See Winners');
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/exactly|three|four|guarantee|winning bet/i);
  });
});
```
(The file must be `.tsx` if JSX is used: name it `web/tests/winners-invitation.test.tsx`? — **No**: vitest config includes only `tests/**/*.test.ts`. Use `createElement(WinnersInvitation)` from `react` instead of JSX.)

- [ ] **Step 2: Run** `npx vitest run tests/winners-invitation.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `web/components/WinnersInvitation.tsx`:

```tsx
import Link from 'next/link';

/** The approved Winners sentence (homepage Offering card). Reused verbatim so every page says the same thing. */
export const WINNERS_INVITATION_BODY =
  'Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most.';

/**
 * One quiet invitation after useful content — never inside a card, never a
 * modal. Winners is a selection from the published picks; being selected is
 * not a result.
 */
export function WinnersInvitation({ className = '' }: { className?: string }) {
  return (
    <aside aria-labelledby="winners-invitation-heading" className={`rounded-panel border border-line bg-card p-5 ${className}`.trim()}>
      <p id="winners-invitation-heading" className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Gary’s best bets</p>
      <p className="mt-2 text-[14px] leading-relaxed text-mid">{WINNERS_INVITATION_BODY}</p>
      <Link href="/winners" className="mt-3 inline-block text-[13.5px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light">
        See Winners
      </Link>
    </aside>
  );
}
```

- [ ] **Step 4: Run** the test → PASS. **Step 5: Commit** `git add web/components/WinnersInvitation.tsx web/tests/winners-invitation.test.ts && git commit -m "Add the shared Winners invitation" -- web/components/WinnersInvitation.tsx web/tests/winners-invitation.test.ts`

---

### Task 3: `/props/home-runs` and `/props/touchdowns`

**Files:**
- Create: `web/lib/gary/prop-lane-pages.ts`, `web/components/board/PropLanePage.tsx`, `web/app/props/home-runs/page.tsx`, `web/app/props/touchdowns/page.tsx`, `web/app/props/error.tsx`
- Modify: `web/scripts/fixture-preview.mjs:45-50, 65` (add two fixture props)
- Test: `web/tests/prop-lane-pages.test.ts`

**Interfaces:**
- Consumes: `isMlbHomeRun`, `isNflAnytimeTdPick` (Task 1); `WinnersInvitation` (Task 2); `fetchTodayPropPicks`, `fetchDailySlate`, `PropRow`, `BookDayProvider`, `BoardDateNotice`, `PageMasthead`, `StitchRule`, `JsonLd`, `etDateLabel`, `etTime`, `parseGameTime`, `todayEST`, `hubGradedDateEST`, `normalizeLeague`, `propCall`, `pageMetadata`, `SITE_URL`.
- Produces: `PROP_LANES: Record<PropLaneSlug, PropLaneConfig>`, `propLaneState(...)`, `PropLanePage({ lane })` async server component.

- [ ] **Step 1: Write the failing tests** `web/tests/prop-lane-pages.test.ts`:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PropPick } from '@/lib/gary/types';
import type { SlateRow } from '@/lib/gary/board';

const feed = vi.hoisted(() => ({ props: [] as PropPick[], slate: [] as SlateRow[] | null, propsError: false }));
vi.mock('@/lib/gary/picks', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/picks')>(),
  fetchTodayPropPicks: async () => { if (feed.propsError) throw new Error('Fixture source unavailable'); return feed.props; },
}));
vi.mock('@/lib/gary/board', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/board')>(),
  fetchDailySlate: async () => { if (feed.slate === null) throw new Error('Slate unavailable'); return feed.slate; },
}));
vi.mock('@/components/book/TailFadeRow', () => ({ PropTailFadeRow: () => null, TailFadeRow: () => null }));
vi.mock('@/components/BoardDateNotice', () => ({ BoardDateNotice: () => null }));

import { PropLanePage } from '@/components/board/PropLanePage';
import { PROP_LANES, propLaneState } from '@/lib/gary/prop-lane-pages';
import { metadata as hrMetadata } from '@/app/props/home-runs/page';
import { metadata as tdMetadata } from '@/app/props/touchdowns/page';
import sitemap from '@/app/sitemap';

afterEach(() => { feed.props = []; feed.slate = []; feed.propsError = false; });

const hr: PropPick = { player: 'Slugger', prop: 'home_runs 0.5', bet: 'over', line: '0.5', odds: 320, sport: 'MLB HR', matchup: 'Cubs @ Reds', commence_time: '2026-09-16T23:10:00Z', game_id: 'g1', rationale: 'Gary’s Take\n\nWind out and a lefty who allows fly balls.' };
const td: PropPick = { player: 'Runner', prop: 'anytime_td 0.5', bet: 'over', line: '0.5', odds: 150, sport: 'NFL', matchup: 'Bills @ Chiefs', commence_time: '2026-09-17T00:15:00Z', game_id: 'g2', td_category: 'standard', rationale: 'Gary’s Take\n\nGoal-line role.' };
const core: PropPick = { player: 'Ace', prop: 'pitcher_strikeouts 5.5', bet: 'over', sport: 'MLB', matchup: 'Cubs @ Reds', game_id: 'g1' };

describe('prop lane pages', () => {
  it('declares canonical metadata for both lanes and lists them in the sitemap', () => {
    expect(hrMetadata.alternates?.canonical).toBe('/props/home-runs');
    expect(tdMetadata.alternates?.canonical).toBe('/props/touchdowns');
    expect(String(tdMetadata.title)).toMatch(/NFL/);
    expect(String(tdMetadata.title)).not.toMatch(/first/i);
    const paths = sitemap().map(item => new URL(item.url).pathname);
    expect(paths.slice(paths.indexOf('/props'), paths.indexOf('/props') + 3)).toEqual(['/props', '/props/home-runs', '/props/touchdowns']);
  });

  it('renders only the lane’s picks with the native prop card and real links', async () => {
    feed.props = [hr, td, core];
    feed.slate = [{ league: 'MLB', away_team: 'Cubs', home_team: 'Reds', commence_time: hr.commence_time!, venue: null, spread: null, ml_home: null, ml_away: null, total: null }];
    const html = renderToStaticMarkup(await PropLanePage({ lane: 'home-runs' }));
    expect(html).toContain('Slugger');
    expect(html).not.toContain('Runner');
    expect(html).not.toContain('Ace');
    expect(html).toContain('Wind out and a lefty who allows fly balls.');
    expect(html).toContain('href="/picks/mlb"');
    expect(html).toContain('href="/props"');
    expect(html).toContain('href="/props/touchdowns"');
    expect(html).toContain('href="/winners"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).not.toContain('native-silver');
  });

  it('tells the truth on a day with no MLB games, a slate still being prepared, and an unknown slate', () => {
    expect(propLaneState({ picks: 0, slateGames: 0, firstStart: null })).toBe('no-games');
    expect(propLaneState({ picks: 0, slateGames: 3, firstStart: '7:05 PM' })).toBe('preparing');
    expect(propLaneState({ picks: 0, slateGames: null, firstStart: null })).toBe('unknown');
    expect(propLaneState({ picks: 2, slateGames: 0, firstStart: null })).toBe('picks');
  });

  it('renders each empty state without claiming games that do not exist', async () => {
    feed.slate = [];
    let html = renderToStaticMarkup(await PropLanePage({ lane: 'touchdowns' }));
    expect(html).toContain('No NFL games on today’s schedule');
    feed.slate = [{ league: 'NFL', away_team: 'Bills', home_team: 'Chiefs', commence_time: '2026-09-17T00:15:00Z', venue: null, spread: null, ml_home: null, ml_away: null, total: null }];
    html = renderToStaticMarkup(await PropLanePage({ lane: 'touchdowns' }));
    expect(html).toContain('being prepared');
    feed.slate = null;
    html = renderToStaticMarkup(await PropLanePage({ lane: 'touchdowns' }));
    expect(html).not.toContain('No NFL games');
    expect(html).toContain('not published here yet');
  });

  it('surfaces a source failure rather than an empty lane', async () => {
    feed.propsError = true;
    await expect(PropLanePage({ lane: 'home-runs' })).rejects.toThrow('Fixture source unavailable');
  });

  it('keeps the touchdowns lane NFL-only', async () => {
    feed.props = [{ ...td, sport: 'NCAAF', player: 'College Back' }, td];
    const html = renderToStaticMarkup(await PropLanePage({ lane: 'touchdowns' }));
    expect(html).toContain('Runner');
    expect(html).not.toContain('College Back');
  });
});
```

- [ ] **Step 2: Run** → FAIL (modules missing).

- [ ] **Step 3: Implement** `web/lib/gary/prop-lane-pages.ts`:

```ts
import { isMlbHomeRun, isNflAnytimeTdPick } from './prop-lanes';
import type { PropPick } from './types';

export type PropLaneSlug = 'home-runs' | 'touchdowns';

export interface PropLaneConfig {
  slug: PropLaneSlug;
  path: string;
  leagueCode: 'MLB' | 'NFL';
  sportSlug: 'mlb' | 'nfl';
  sportName: string;
  title: string;
  metaTitle: string;
  description: string;
  sub: string;
  laneNoun: string;
  otherLane: PropLaneSlug;
  predicate: (p: PropPick) => boolean;
  explainer: string;
}

export const PROP_LANES: Record<PropLaneSlug, PropLaneConfig> = {
  'home-runs': {
    slug: 'home-runs',
    path: '/props/home-runs',
    leagueCode: 'MLB',
    sportSlug: 'mlb',
    sportName: 'MLB',
    title: 'Home run picks.',
    metaTitle: "Today's MLB Home Run Picks | Gary AI",
    description: "Gary's MLB home run picks for today: the batter, the matchup, the listed odds and the reasoning, published before first pitch.",
    sub: 'One batter, one swing. Gary’s home run pick for the game, with the reasoning.',
    laneNoun: 'home run picks',
    otherLane: 'touchdowns',
    predicate: isMlbHomeRun,
    explainer: 'A home run pick is a bet that the named batter hits at least one home run in that game. Home run picks are long shots: they are published as picks, never counted in Gary’s game record, and are not part of Winners.',
  },
  touchdowns: {
    slug: 'touchdowns',
    path: '/props/touchdowns',
    leagueCode: 'NFL',
    sportSlug: 'nfl',
    sportName: 'NFL',
    title: 'Touchdown picks.',
    metaTitle: "Today's NFL Anytime Touchdown Picks | Gary AI",
    description: "Gary's NFL anytime touchdown scorer picks for today's games: the player, the matchup, the listed odds and the reasoning.",
    sub: 'Anytime touchdown scorers for today’s NFL games, with the reasoning.',
    laneNoun: 'anytime touchdown picks',
    otherLane: 'home-runs',
    predicate: isNflAnytimeTdPick,
    explainer: 'An anytime touchdown pick is a bet that the named player scores a touchdown at any point in the game. Gary does not publish first-touchdown picks. Touchdown picks are long shots: published as picks, kept out of the core prop record, and not part of Winners.',
  },
};

export type PropLaneState = 'picks' | 'preparing' | 'no-games' | 'unknown';

/** What the page can truthfully say. A failed slate read is unknown, never "no games". */
export function propLaneState(input: { picks: number; slateGames: number | null; firstStart: string | null }): PropLaneState {
  if (input.picks > 0) return 'picks';
  if (input.slateGames === null) return 'unknown';
  if (input.slateGames === 0) return 'no-games';
  return 'preparing';
}
```

`web/components/board/PropLanePage.tsx`:

```tsx
import Image from 'next/image';
import Link from 'next/link';
import { BoardDateNotice } from '@/components/BoardDateNotice';
import { JsonLd } from '@/components/JsonLd';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { WinnersInvitation } from '@/components/WinnersInvitation';
import { PropRow } from '@/components/board/PropRow';
import { BookDayProvider } from '@/components/book/BookDay';
import { fetchDailySlate } from '@/lib/gary/board';
import { hubGradedDateEST, todayEST } from '@/lib/gary/dates';
import { etDateLabel, etTime, parseGameTime, propCall } from '@/lib/gary/format';
import { normalizeLeague } from '@/lib/gary/leagues';
import { fetchTodayPropPicks } from '@/lib/gary/picks';
import { PROP_LANES, propLaneState, type PropLaneSlug } from '@/lib/gary/prop-lane-pages';
import { SITE_URL } from '@/lib/seo/metadata';

const link = 'text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light';

/** One lane of today’s props (home runs or NFL anytime touchdowns) on the same native cards as /props. */
export async function PropLanePage({ lane }: { lane: PropLaneSlug }) {
  const cfg = PROP_LANES[lane];
  const other = PROP_LANES[cfg.otherLane];
  const date = todayEST();
  const yesterday = hubGradedDateEST();
  const [props, slate] = await Promise.all([
    // A failed prop source reaches the route error boundary; it is never an empty lane.
    fetchTodayPropPicks(),
    // The slate only decides the empty-state wording; when it fails we say less, not "no games".
    fetchDailySlate(date).catch(() => null),
  ]);
  const picks = props.filter(cfg.predicate).sort((a, b) =>
    (parseGameTime(a.commence_time)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
    (parseGameTime(b.commence_time)?.getTime() ?? Number.MAX_SAFE_INTEGER));
  const slateGames = slate ? slate.filter(r => normalizeLeague(r.league) === cfg.leagueCode) : null;
  const firstStart = slateGames?.length ? etTime(slateGames[0].commence_time) : null;
  const state = propLaneState({ picks: picks.length, slateGames: slateGames ? slateGames.length : null, firstStart });

  return (
    <main className="site-wrap pb-20 pt-12">
      <BoardDateNotice date={date} />
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Gary AI', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Player Props', item: `${SITE_URL}/props` },
          { '@type': 'ListItem', position: 3, name: cfg.title.replace(/\.$/, ''), item: `${SITE_URL}${cfg.path}` },
        ],
      }} />
      {picks.length > 0 && (
        <JsonLd data={{
          '@context': 'https://schema.org', '@type': 'ItemList',
          name: `Gary AI ${cfg.sportName} ${cfg.laneNoun} for ${etDateLabel(date)}`,
          numberOfItems: picks.length,
          itemListElement: picks.slice(0, 25).map((p, i) => ({
            '@type': 'ListItem', position: i + 1, name: `${p.player ?? 'Player'} — ${propCall(p)}`,
          })),
        }} />
      )}
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
        <Link href="/props" className={link}>Player props</Link>
        <span aria-hidden>/</span>
        <span>{cfg.sportName} {cfg.laneNoun}</span>
      </nav>
      <div className="mt-5">
        <PageMasthead title={cfg.title} meta={`${cfg.sportName} · ${etDateLabel(date)}`} sub={cfg.sub} />
      </div>

      {state === 'picks' && (
        <BookDayProvider date={date}>
          <section className="mt-8" aria-label={`${cfg.sportName} ${cfg.laneNoun}`}>
            <p className="tnum font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
              {picks.length} {picks.length === 1 ? 'pick' : 'picks'} · game times in ET
            </p>
            <div className="site-pick-grid mt-4">
              {picks.map((p, i) => <PropRow key={`${p.player}-${p.prop}-${i}`} prop={p} />)}
            </div>
          </section>
        </BookDayProvider>
      )}

      {state !== 'picks' && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-panel border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            {state === 'no-games' && <>No {cfg.sportName} games on today’s schedule, so there are no {cfg.laneNoun} today. See <Link href={`/picks/${cfg.sportSlug}`} className={link}>today’s {cfg.sportName} picks</Link> or <Link href={`/archive/${yesterday}`} className={link}>yesterday’s cards</Link>.</>}
            {state === 'preparing' && <>{cfg.sportName} {cfg.laneNoun} are being prepared{firstStart ? ` — the first game starts at ${firstStart} ET` : ''}. Check back closer to game time, or see <Link href={`/picks/${cfg.sportSlug}`} className={link}>today’s {cfg.sportName} picks</Link>.</>}
            {state === 'unknown' && <>{cfg.sportName} {cfg.laneNoun} are not published here yet today. Check back closer to game time, or see <Link href={`/picks/${cfg.sportSlug}`} className={link}>today’s {cfg.sportName} picks</Link>.</>}
          </p>
        </div>
      )}

      <WinnersInvitation className="mt-10" />

      <section className="mt-12" aria-labelledby="lane-guide-heading">
        <h2 id="lane-guide-heading" className="font-display text-2xl uppercase text-hi">What a {cfg.sportName} {cfg.laneNoun.replace(/ picks$/, '')} pick is</h2>
        <StitchRule tone="faint" className="mt-4" />
        <p className="mt-5 text-[14px] leading-relaxed text-mid">{cfg.explainer}</p>
        <p className="mt-4 text-[13.5px] leading-relaxed text-low">
          Each card keeps the player, market, line, side and listed odds stored with the call, and the reasoning is in the card. Cards are graded after the game is final; <Link href={`/archive/${yesterday}`} className={link}>yesterday’s cards</Link> show the graded result. See all of <Link href="/props" className={link}>today’s player props</Link>, <Link href={other.path} className={link}>{other.sportName} {other.laneNoun}</Link>, or <Link href={`/picks/${cfg.sportSlug}`} className={link}>today’s {cfg.sportName} game picks</Link>.
        </p>
      </section>
    </main>
  );
}
```

`web/app/props/home-runs/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { PropLanePage } from '@/components/board/PropLanePage';
import { PROP_LANES } from '@/lib/gary/prop-lane-pages';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 600;

const lane = PROP_LANES['home-runs'];

export const metadata: Metadata = pageMetadata({
  canonical: lane.path,
  title: lane.metaTitle,
  description: lane.description,
});

export default function HomeRunPicksPage() {
  return <PropLanePage lane="home-runs" />;
}
```

`web/app/props/touchdowns/page.tsx`: identical with `PROP_LANES.touchdowns`, `lane="touchdowns"`, component name `TouchdownPicksPage`.

`web/app/props/error.tsx` (copy of `app/picks/error.tsx` with prop wording):

```tsx
'use client';

import Link from 'next/link';

export default function PropsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-5 text-center">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.04em] text-gold">Temporary interruption</p>
      <h1 className="mt-3 font-display text-3xl text-hi">We couldn&apos;t load the player props.</h1>
      <p className="mt-2 text-[15px] text-mid">
        Try again, or read today&apos;s game picks and previous prop cards in the archive.
      </p>
      <button
        onClick={() => retry()}
        className="mt-6 rounded-card border border-gold/40 px-5 py-3 text-sm text-gold transition-colors hover:border-gold/70 hover:text-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      >
        Try again
      </button>
      <p className="mt-5 flex gap-4 text-sm">
        <Link href="/picks" className="text-gold underline decoration-gold/40 underline-offset-4">Today&apos;s game picks</Link>
        <Link href="/archive" className="text-gold underline decoration-gold/40 underline-offset-4">Previous prop cards</Link>
      </p>
      <p className="mt-2 text-[13px] text-low">Archive cards are historical.</p>
    </main>
  );
}
```

Add to `web/tests/prop-lane-pages.test.ts` an error-boundary case mirroring `picks-page-recovery.test.ts:79-90` (`import PropsError from '@/app/props/error'`; markup contains `Temporary interruption`, `href="/archive"`, `href="/picks"`, not the provider detail; button click calls `retry` once).

Sitemap: in `web/app/sitemap.ts` line 36 replace `entry('/props', 0.8, 'daily'),` with:
```ts
    entry('/props', 0.8, 'daily'),
    entry('/props/home-runs', 0.8, 'daily'),
    entry('/props/touchdowns', 0.8, 'daily'),
```
and in `web/tests/sitemap.test.ts` line 57 replace `'/props',` with `'/props',\n  '/props/home-runs',\n  '/props/touchdowns',`.

Fixtures: in `web/scripts/fixture-preview.mjs` after the `prop` const (line 50) add:
```js
const hrProp = {
  player: 'Local QA Slugger', prop: 'home_runs 0.5', bet: 'over', line: '0.5', odds: '+320',
  sport: 'MLB HR', matchup: prop.matchup, commence_time: pick.commence_time, game_id: 'local-qa',
  rationale: 'Gary’s Take\n\nLocal QA home run fixture: a fly-ball lefty and a short porch. Not a published pick.',
};
const tdProp = {
  player: 'Local QA Runner', prop: 'anytime_td 0.5', bet: 'over', line: '0.5', odds: '+150', td_category: 'standard',
  sport: 'NFL', matchup: 'Local QA Away @ Local QA Home', commence_time: `${date}T20:20:00Z`, game_id: 'local-qa-nfl',
  rationale: 'Gary’s Take\n\nLocal QA touchdown fixture: goal-line role. Not a published pick.',
};
```
and change line 65 to `prop_picks: [{ id: 'local-qa-prop', date, picks: [prop, hrProp, tdProp] }],`. Also add an NFL slate row to `daily_slate` so the touchdowns page shows the populated state: `{ date, league: 'NFL', away_team: 'Local QA Away', home_team: 'Local QA Home', commence_time: tdProp.commence_time, venue: null, ml_away: '+120', ml_home: '-140' }`. Check `fixture-preview.mjs --check` assertions (lines ~235-300) still pass; add two assertions that `/props/home-runs` contains `Local QA Slugger` and `/props/touchdowns` contains `Local QA Runner`.

- [ ] **Step 4: Run** `npx vitest run tests/prop-lane-pages.test.ts tests/sitemap.test.ts tests/featured-prop-ticket.test.ts` → PASS; `npm run typecheck` → PASS.

- [ ] **Step 5: Commit**
```bash
git add web/lib/gary/prop-lane-pages.ts web/components/board/PropLanePage.tsx web/app/props/home-runs/page.tsx web/app/props/touchdowns/page.tsx web/app/props/error.tsx web/app/sitemap.ts web/tests/sitemap.test.ts web/tests/prop-lane-pages.test.ts web/scripts/fixture-preview.mjs && git commit -m "Add home run and NFL touchdown prop destinations" -- web/lib/gary/prop-lane-pages.ts web/components/board/PropLanePage.tsx web/app/props/home-runs/page.tsx web/app/props/touchdowns/page.tsx web/app/props/error.tsx web/app/sitemap.ts web/tests/sitemap.test.ts web/tests/prop-lane-pages.test.ts web/scripts/fixture-preview.mjs
```

---

### Task 4: `/props` — date notice, truthful empty state, lane links, Winners invitation

**Files:**
- Modify: `web/app/props/page.tsx`
- Test: extend `web/tests/featured-prop-ticket.test.ts` (add a `fetchDailySlate` mock returning `[]` and two render assertions) and `web/tests/picks-page-recovery.test.ts` ("carries the rendered board date" now also covers `PropsPage`).

- [ ] **Step 1: Tests** — in `featured-prop-ticket.test.ts` add `vi.mock('@/lib/gary/board', async importOriginal => ({ ...await importOriginal(), fetchDailySlate: async () => [] }))` and a test:
```ts
it('links the lane pages, the sport pages and Winners after the cards', async () => {
  feed.props = [{ player: 'Receiver', prop: 'receptions', sport: 'NFL', confidence: 0.75, matchup: 'Away @ Home', game_id: 222 }];
  const html = renderToStaticMarkup(await PropsPage());
  for (const href of ['/props/home-runs', '/props/touchdowns', '/picks', '/winners']) expect(html).toContain(`href="${href}"`);
});
```
(import `renderToStaticMarkup` from `react-dom/server`; mock `@/components/book/TailFadeRow` and `@/components/BoardDateNotice` to null as in Task 3.) In `picks-page-recovery.test.ts` add `import PropsPage from '@/app/props/page';` and push `await PropsPage()` into the `pages` array of the date-notice test (its `serveEmptyExcept()` stub already returns `[]` for `prop_picks`, `prop_results`, `daily_slate`).

- [ ] **Step 2: Run** → FAIL. 

- [ ] **Step 3: Implement** in `web/app/props/page.tsx`:
  - Imports: add `import { BoardDateNotice } from '@/components/BoardDateNotice';`, `import { WinnersInvitation } from '@/components/WinnersInvitation';`, `import { fetchDailySlate } from '@/lib/gary/board';`, `import { PROP_LANES } from '@/lib/gary/prop-lane-pages';`, `import { SPORTS } from '@/lib/gary/leagues';` (keep `normalizeLeague`).
  - Fetch: change the `Promise.all` to also read `fetchDailySlate(date).catch(() => null)` as a third value `slate`; compute `const activeSlate = slate ? slate.filter(r => SPORTS.some(s => !s.retired && s.code === normalizeLeague(r.league))) : null;` and `const firstStart = activeSlate?.length ? etTime(activeSlate[0].commence_time) : null;`.
  - Add `<BoardDateNotice date={date} />` as the first child of `<main>`.
  - Replace the `total === 0` block's sentence with three branches (same shape as Task 3): `activeSlate && activeSlate.length === 0` → `No games on today’s schedule, so there are no player props today. See yesterday’s cards →` `/archive/${graded}`; `activeSlate && activeSlate.length > 0` → `Player props are being prepared{firstStart ? ` — the first game starts at ${firstStart} ET` : ''}. Check back closer to game time.`; `activeSlate === null` → existing sentence unchanged.
  - After the guide `</section>` (line 191) and before `</main>` insert:
```tsx
      <WinnersInvitation className="mt-10" />
      <p className="mt-6 text-[13.5px] leading-relaxed text-low">
        Long shots have their own pages: <Link href={PROP_LANES['home-runs'].path} className="text-gold underline decoration-gold/40 underline-offset-4">MLB home run picks</Link> and <Link href={PROP_LANES.touchdowns.path} className="text-gold underline decoration-gold/40 underline-offset-4">NFL anytime touchdown picks</Link>. Game picks live on <Link href="/picks" className="text-gold underline decoration-gold/40 underline-offset-4">The Picks</Link>{SPORTS.filter(s => !s.retired && ['MLB', 'NFL', 'NCAAF'].includes(s.code)).map(s => <span key={s.slug}>, <Link href={`/picks/${s.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4">{s.name}</Link></span>)}.
      </p>
```
  - Change the AccountCta body to `Tail or fade any listed core prop above, then let Gary grade your prediction in My Book. It stays a record—not a real-money wager.` (long shots have no tail/fade row).

- [ ] **Step 4: Run** `npx vitest run tests/featured-prop-ticket.test.ts tests/picks-page-recovery.test.ts` → PASS. **Step 5: Commit** `-- web/app/props/page.tsx web/tests/featured-prop-ticket.test.ts web/tests/picks-page-recovery.test.ts` with message `Give the props page a date notice, truthful empty states and lane links`.

---

### Task 5: `llms.txt` key pages

**Files:** Modify `web/app/llms.txt/route.ts:52` (+ append lines); Test `web/tests/llms-route.test.ts:21`.

- [ ] Step 1: extend the loop in `expectCurrentProductFacts` to `['/picks', '/picks/mlb', '/picks/nfl', '/picks/ncaaf', '/props', '/props/home-runs', '/props/touchdowns', '/app', '/results', '/pricing', '/winners', '/you']`; add `expect(keyPages).not.toContain('Home Run Threats');`. Run → FAIL.
- [ ] Step 2: replace line 52 with:
```
- ${BRAND.domain}/picks/mlb — today's MLB game picks and record
- ${BRAND.domain}/picks/nfl — NFL game picks and record
- ${BRAND.domain}/picks/ncaaf — college football game picks and record
- ${BRAND.domain}/props — today's player prop picks, grouped by game
- ${BRAND.domain}/props/home-runs — today's MLB home run picks
- ${BRAND.domain}/props/touchdowns — today's NFL anytime touchdown picks
```
and after the `/press` line add `- ${BRAND.domain}/app — the iOS app\n- ${BRAND.domain}/install — add the website to your home screen`.
- [ ] Step 3: run → PASS. Commit `-- web/app/llms.txt/route.ts web/tests/llms-route.test.ts`, message `List sport and prop lane pages in llms.txt`.

---

### Task 6: Sport page — recent boards, off-day last slate, cross-links, Winners invitation

**Files:**
- Modify: `web/app/picks/[sport]/page.tsx`
- Test: `web/tests/sport-page-links.test.ts` (new)

- [ ] **Step 1: Test** `web/tests/sport-page-links.test.ts`:
```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameDay } from '@/lib/gary/gamepage';

const data = vi.hoisted(() => ({ dates: [] as string[], lastDay: null as GameDay | null }));
vi.mock('@/lib/gary/gamepage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/gamepage')>(),
  fetchLeagueDates: async () => data.dates,
  fetchGameDay: async () => data.lastDay,
}));
vi.mock('@/lib/gary/dates', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/dates')>(), todayEST: () => '2026-09-16' }));
vi.mock('@/components/BoardDateNotice', () => ({ BoardDateNotice: () => null }));
vi.mock('@/components/LiveChip', () => ({ LiveScoreStrip: () => null }));
vi.mock('@/components/book/TailFadeRow', () => ({ TailFadeRow: () => null, PropTailFadeRow: () => null }));
import SportPicksPage from '@/app/picks/[sport]/page';

afterEach(() => { vi.unstubAllGlobals(); data.dates = []; data.lastDay = null; });
const emptyFeeds = () => vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));

describe('sport page discovery links', () => {
  it('links recent boards, the lane page, props, the Hub and Winners on an off day', async () => {
    emptyFeeds();
    data.dates = ['2026-09-14', '2026-09-13', '2026-09-07', '2026-09-06', '2026-08-31'];
    data.lastDay = { date: '2026-09-14', leagueCode: 'NFL', picks: [{ league: 'NFL', pick: 'Denver Broncos +2.5 -115', awayTeam: 'Denver Broncos', homeTeam: 'Kansas City Chiefs' }], results: [{ game_date: '2026-09-14', league: 'NFL', matchup: 'Denver Broncos at Kansas City Chiefs', pick_text: 'Denver Broncos +2.5 -115', result: 'lost', final_score: '10-31', confidence: null }], slate: [], publishedAt: null };
    const html = renderToStaticMarkup(await SportPicksPage({ params: Promise.resolve({ sport: 'nfl' }) }));
    for (const d of ['2026-09-14', '2026-09-13', '2026-09-07', '2026-09-06']) expect(html).toContain(`href="/picks/nfl/${d}"`);
    expect(html).toContain('href="/picks/nfl/2026-09-14/denver-broncos-at-kansas-city-chiefs"');
    expect(html).toContain('href="/props/touchdowns"');
    expect(html).toContain('href="/props"');
    expect(html).toContain('href="/hub"');
    expect(html).toContain('href="/winners"');
    expect(html).toContain('No NFL games on today');
  });
  it('caps MLB recent boards at seven and links the home run page', async () => {
    emptyFeeds();
    data.dates = Array.from({ length: 12 }, (_, i) => `2026-09-${String(16 - i).padStart(2, '0')}`);
    const html = renderToStaticMarkup(await SportPicksPage({ params: Promise.resolve({ sport: 'mlb' }) }));
    expect(html.match(/href="\/picks\/mlb\/2026-09-\d{2}"/g)?.length).toBe(7);
    expect(html).toContain('href="/props/home-runs"');
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `web/app/picks/[sport]/page.tsx`:
  - Imports: `import { WinnersInvitation } from '@/components/WinnersInvitation';`, `import { ResultLetter } from '@/components/Terminal';` (extend the existing Terminal import), `import { etDateLabel } from '@/lib/gary/format';`, extend gamepage import to `{ fetchGameDay, fetchLeagueDates, gameSlug, matchPickResult }`.
  - After `lastBoard` (line 123) add:
```ts
  const RECENT_LIMIT = cfg.code === 'MLB' ? 7 : 4;
  const recentBoards = leagueDates.filter(d => d <= date).slice(0, RECENT_LIMIT);
  const laneHref = cfg.code === 'MLB' ? '/props/home-runs' : cfg.code === 'NFL' ? '/props/touchdowns' : null;
  const laneLabel = cfg.code === 'MLB' ? 'home run picks' : 'anytime touchdown picks';
```
  - After `board` is built (line 135) add the off-day read (only when the board is empty and a past board exists):
```ts
  // Off day: the last published slate, with results, so the page still opens a door to real games.
  const lastDay = !cfg.retired && board.length === 0 && lastBoard
    ? await fetchGameDay(cfg.slug, lastBoard).catch(() => null)
    : null;
```
  - Empty-state copy (line 220): change `No {cfg.name} picks published today` to `No {cfg.name} games on today’s schedule` when `slate.length === 0` and `No {cfg.name} picks published yet today` otherwise: `{slate.filter(r => (normalizeLeague(r.league) ?? '') === cfg.code).length === 0 ? <>No {cfg.name} games on today’s schedule</> : <>No {cfg.name} picks published yet today</>}`.
  - After the board/empty block (after line 241) insert:
```tsx
      {lastDay && lastDay.picks.length > 0 && (
        <section className="mt-10" aria-label={`Last ${cfg.name} board`}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Last {cfg.name} board · {etDateLabel(lastDay.date)}</p>
          <ol className="mt-3 divide-y divide-line rounded-panel border border-line bg-card">
            {lastDay.picks.slice(0, 16).map((pick, i) => {
              const result = matchPickResult(pick, lastDay.results);
              const res = (result?.result ?? '').trim().toLowerCase();
              return (
                <li key={`${pick.pick}-${i}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
                  <Link href={`/picks/${cfg.slug}/${lastDay.date}/${gameSlug(pick.awayTeam, pick.homeTeam)}`} className="font-display text-[1.2rem] uppercase leading-none text-hi transition-colors hover:text-gold">
                    {pick.awayTeam} at {pick.homeTeam}
                  </Link>
                  <span className="tnum flex items-center gap-2 font-mono text-[12px] text-low">
                    <span className="text-gold">{pick.pick}</span>
                    {res && <ResultLetter result={res} />}
                    {result?.final_score && <span>Final {result.final_score}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {recentBoards.length > 0 && (
        <nav aria-label={`Recent ${cfg.name} boards`} className="mt-10">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">Recent {cfg.name} boards</p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[12px] uppercase tracking-[0.05em]">
            {recentBoards.map(d => (
              <li key={d}>
                <Link href={`/picks/${cfg.slug}/${d}`} className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light">
                  {etDateLabel(d)}{d === date ? ' · today' : ''}
                </Link>
              </li>
            ))}
            <li><Link href="/archive" className="text-low underline decoration-white/20 underline-offset-4 hover:text-gold">Every day on the record</Link></li>
          </ul>
        </nav>
      )}

      {!cfg.retired && (
        <p className="mt-8 text-[13.5px] leading-relaxed text-low">
          Player props for {cfg.name} games are on <Link href="/props" className="text-gold underline decoration-gold/40 underline-offset-4">Player Props</Link>
          {laneHref ? <>, with {cfg.name} {laneLabel} on <Link href={laneHref} className="text-gold underline decoration-gold/40 underline-offset-4">their own page</Link></> : null}.
          Stats, trends and matchups are in <Link href="/hub" className="text-gold underline decoration-gold/40 underline-offset-4">The Hub</Link>.
        </p>
      )}

      {!cfg.retired && <WinnersInvitation className="mt-8" />}
```
  - Keep `<SportGuide …/>` last. Remove the now-duplicated `lastBoard` paragraph at lines 196-206? **Keep it** (it is the "latest picks with results" link the smoke test and readers rely on) but drop its second `/archive` link since the nav now has it: leave as is; duplication of one link is harmless.

- [ ] **Step 4: Run** `npx vitest run tests/sport-page-links.test.ts tests/picks-page-recovery.test.ts tests/nfl-launch-navigation.test.ts` → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `-- 'web/app/picks/[sport]/page.tsx' web/tests/sport-page-links.test.ts`, message `Link recent boards, the last slate and prop lanes from sport pages`.

---

### Task 7: League date listing — record link, year in title, Winners invitation

**Files:** Modify `web/app/picks/[sport]/[date]/page.tsx`; Test `web/tests/league-day-page.test.ts` (new).

- [ ] **Step 1: Test**:
```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/gary/gamepage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/gamepage')>(),
  fetchLeagueDates: async () => ['2026-09-15', '2026-09-14', '2026-09-13'],
  fetchGameDay: async () => ({ date: '2026-09-14', leagueCode: 'MLB', slate: [], publishedAt: null,
    picks: [{ league: 'MLB', pick: 'Rangers ML -134', awayTeam: 'Red Sox', homeTeam: 'Rangers', commence_time: '2026-09-15T00:05:00Z' }],
    results: [{ game_date: '2026-09-14', league: 'MLB', matchup: 'Red Sox at Rangers', pick_text: 'Rangers ML -134', result: 'won', final_score: '2-4', confidence: null }] }),
}));
vi.mock('@/lib/gary/dates', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/dates')>(), todayEST: () => '2026-09-16' }));
vi.mock('@/components/AppStoreButton', () => ({ AppStoreButton: () => null }));
import LeagueDayPage, { generateMetadata } from '@/app/picks/[sport]/[date]/page';

describe('league day listing', () => {
  it('links every game, the neighbours, the archive day, the record and Winners; title carries the year', async () => {
    const params = Promise.resolve({ sport: 'mlb', date: '2026-09-14' });
    const meta = await generateMetadata({ params });
    expect(String(meta.title)).toContain('2026');
    const html = renderToStaticMarkup(await LeagueDayPage({ params }));
    expect(html).toContain('href="/picks/mlb/2026-09-14/red-sox-at-rangers"');
    expect(html).toContain('href="/picks/mlb/2026-09-13"');
    expect(html).toContain('href="/picks/mlb/2026-09-15"');
    expect(html).toContain('href="/archive/2026-09-14"');
    expect(html).toContain('href="/results/mlb"');
    expect(html).toContain('href="/winners"');
    expect(html).toContain('Final 2-4');
  });
});
```
- [ ] **Step 2: Run** → FAIL (no `/results/mlb`, no year).
- [ ] **Step 3: Implement**: line 26 title → `` `${cfg.longName} Picks, ${day}, ${date.slice(0, 4)} — Every Game, Public Results | Gary AI` ``; in the nav row (lines 129-137) add after the archive link: `<Link href={`/results/${cfg.slug}`} className="text-low underline decoration-white/20 underline-offset-4 hover:text-gold">The {cfg.code} record</Link>`; import `WinnersInvitation` and insert `<WinnersInvitation className="mt-10" />` before `<StitchRule tone="faint" className="mt-12" />` (line 139).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `-- 'web/app/picks/[sport]/[date]/page.tsx' web/tests/league-day-page.test.ts`, message `Link the record and Winners from league day listings`.

---

### Task 8: Game page — next steps, Winners invitation, Hub link

**Files:**
- Modify: `web/app/picks/[sport]/[date]/[game]/page.tsx` (lines 268, 302-331), `web/components/GameResearch.tsx`
- Test: extend `web/tests/gamepage-jsonld.test.ts` (it already renders `GamePage` with mocked `fetchGameDay`/`fetchGameProps`; add one test) and `web/tests/game-research.test.ts` (new, small).

- [ ] **Step 1: Tests** — in `gamepage-jsonld.test.ts` add (inside the existing describe, using its fixtures and `vi.setSystemTime`):
```ts
it('offers related next steps: the archive day, props, the Hub and Winners', async () => {
  const html = await renderPage(); // use the file's existing helper that renders GamePage for the fixture
  expect(html).toContain(`href="/archive/${fixtureDate}"`);
  expect(html).toContain('href="/props"');
  expect(html).toContain('href="/winners"');
  expect(html).toMatch(/href="\/(hub|archive\/\d{4}-\d{2}-\d{2})"/);
});
```
(Adapt the helper/fixture names to the file's actual identifiers; read the file first.) New `web/tests/game-research.test.ts`:
```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameResearch } from '@/components/GameResearch';
import type { InsightRow } from '@/lib/gary/types';
const row = (o: Partial<InsightRow>): InsightRow => ({ id: 1, date: '2026-09-15', league: 'MLB', category: 'hot', headline: 'Bat is hot', detail: null, game: 'BOS @ TEX', value: '.410', tone: null, spark: null, line_val: null, relevance_score: 1, player_id: null, team_id: null, game_id: '77', result: null, result_note: null, ...o });
describe('GameResearch', () => {
  it('links onward to the Hub when rows exist and renders nothing otherwise', () => {
    expect(renderToStaticMarkup(createElement(GameResearch, { rows: [row({})], gameId: '77', matchup: 'Red Sox at Rangers', hubHref: '/hub' }))).toContain('href="/hub"');
    expect(renderToStaticMarkup(createElement(GameResearch, { rows: [row({})], gameId: '99', matchup: 'x', hubHref: '/hub' }))).toBe('');
  });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**:
  - `GameResearch.tsx`: add `hubHref` and `hubLabel` props: `export function GameResearch({ rows, gameId, matchup, hubHref = '/hub', hubLabel = 'More insights in the Hub' }: { rows: InsightRow[]; gameId: string | number | null | undefined; matchup: string; hubHref?: string; hubLabel?: string })`; `import Link from 'next/link';`; after the lanes `.map` add `<p className="mt-6 text-[13.5px]"><Link href={hubHref} className="text-gold underline decoration-gold/40 underline-offset-4">{hubLabel}</Link></p>`.
  - Game page: compute `const isToday = date === todayEST();` (import `todayEST` from `@/lib/gary/dates` if not already imported — read the file head first) and pass `hubHref={isToday ? '/hub' : `/archive/${date}`} hubLabel={isToday ? 'More insights in the Hub' : 'All research from this day'}` at line 268.
  - Props section (after `</ul>` at 315): add
```tsx
            <p className="mt-4 text-[13.5px] leading-relaxed text-low">
              {isToday ? <>See <Link href="/props" className="text-gold underline decoration-gold/40 underline-offset-4">all of today’s player props</Link>{props.some(isMlbHomeRun) ? <> and <Link href="/props/home-runs" className="text-gold underline decoration-gold/40 underline-offset-4">today’s home run picks</Link></> : null}{props.some(isNflAnytimeTdPick) ? <> and <Link href="/props/touchdowns" className="text-gold underline decoration-gold/40 underline-offset-4">today’s touchdown picks</Link></> : null}.</> : <>Every prop from this day is on the <Link href={`/archive/${date}`} className="text-gold underline decoration-gold/40 underline-offset-4">archive page</Link>.</>}
            </p>
```
    (import `isMlbHomeRun, isNflAnytimeTdPick` from `@/lib/gary/prop-lanes`).
  - Insert `<WinnersInvitation className="mt-12" />` before `<StitchRule className="mt-12" />` (line 319); import it.
  - Footer link row (327-331): add `<Link href={`/archive/${date}`} …>Every sport this day</Link>` and, when `isToday`, `<Link href="/props" …>Today’s player props</Link>`.
- [ ] **Step 4: Run** `npx vitest run tests/gamepage-jsonld.test.ts tests/game-research.test.ts tests/gamepage.test.ts` → PASS.
- [ ] **Step 5: Commit** `-- 'web/app/picks/[sport]/[date]/[game]/page.tsx' web/components/GameResearch.tsx web/tests/gamepage-jsonld.test.ts web/tests/game-research.test.ts`, message `Add related next steps and the Winners invitation to game pages`.

---

### Task 9: Hub — anchors, pick links, league links, Winners invitation

**Files:** Modify `web/app/hub/page.tsx`; Test extend `web/tests/hub-page.test.ts`.

- [ ] **Step 1: Test** (append to `hub-page.test.ts`, extending the existing mocks with `vi.mock('@/lib/gary/picks', …fetchTodayGamePicks: async () => [{ league: 'NFL', pick: 'Bills -3 -110', awayTeam: 'Bills', homeTeam: 'Chiefs', bdl_game_id: 555, commence_time: '2026-09-08T20:00:00Z' }])` and `vi.mock('@/lib/gary/pick-links', …fetchPublishedPickPaths: async () => new Set(['/picks/nfl/2026-09-08/bills-at-chiefs']))`, plus `todayEST` mocked to `'2026-09-08'`):
```ts
it('anchors each insight, links the league page, Gary’s pick for the game, and Winners', async () => {
  vi.mocked(fetchTodayInsights).mockResolvedValue([row({ id: 42, game_id: '555' }), row({ id: 43, game_id: '999' })]);
  const html = renderToStaticMarkup(await HubPage());
  expect(html).toContain('id="insight-42"');
  expect(html).toContain('href="/picks/nfl"');
  expect(html).toContain('href="/picks/nfl/2026-09-08/bills-at-chiefs"');
  expect(html).toContain('href="/winners"');
  expect((html.match(/Gary’s pick for this game/g) ?? []).length).toBe(1);
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in `hub/page.tsx`:
  - Imports: `Link` from `next/link`, `WinnersInvitation`, `fetchTodayGamePicks` from `@/lib/gary/picks`, `fetchPublishedPickPaths, publishedPickPath` from `@/lib/gary/pick-links`, `sportByCode` from `@/lib/gary/leagues`, `isGamePick` from `@/lib/gary/gamepage`.
  - In `HubPage`, after insights: 
```ts
  const date = todayEST();
  // Optional: today's published game pages, keyed by the BDL game id the insights carry.
  const picks = await fetchTodayGamePicks().catch(() => []);
  const paths = await fetchPublishedPickPaths(picks, date).catch(() => new Set<string>());
  const pickHrefs = new Map<string, string>();
  for (const pick of picks) {
    if (!isGamePick(pick)) continue;
    const href = publishedPickPath(pick, date, paths);
    const id = pick.bdl_game_id ?? pick.game_id;
    if (href && id != null) pickHrefs.set(String(id), href);
  }
```
  - Thread `pickHrefs` into `Lane` → `FeatureInsight`, `RankedRows`, `RailShelf`, `InsightGrid` as a prop `pickHrefs: Map<string, string>`; each `<li>`/feature root gets `id={`insight-${row.id}`}`; where `row.game` is printed, append `{pickHrefs.get(String(row.game_id ?? '')) && <> · <Link href={pickHrefs.get(String(row.game_id))!} className="text-gold underline decoration-gold/40 underline-offset-4">Gary’s pick for this game</Link></>}`. (Define a tiny `PickLink({ row, pickHrefs })` component to avoid repeating.)
  - League heading: after `<h2 …>{lg}</h2>` add `{sportByCode(lg) && <Link href={`/picks/${sportByCode(lg)!.slug}`} className="mt-1 inline-block font-mono text-[11px] uppercase tracking-[0.05em] text-gold underline decoration-gold/40 underline-offset-4">Today’s {lg} picks</Link>}`.
  - Before the trailing `<p className="mt-7 …">Insights are checked…` add `{leagues.length > 0 && <WinnersInvitation className="mt-10" />}`.
- [ ] **Step 4: Run** `npx vitest run tests/hub-page.test.ts tests/public-marketing-copy.test.ts` → PASS. **Step 5: Commit** `-- web/app/hub/page.tsx web/tests/hub-page.test.ts`, message `Anchor Hub insights and link them to today’s picks`.

---

### Task 10: Card headline as real text

**Files:** Modify `web/components/picks/native-headline.tsx:44-57`; Test `web/tests/native-headline.test.ts` (new).

- [ ] Step 1 test:
```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NativeGameHeadline } from '@/components/picks/native-headline';
describe('NativeGameHeadline', () => {
  it('carries the team and market as real text beside the fitted SVG', () => {
    const html = renderToStaticMarkup(createElement(NativeGameHeadline, { team: 'Guardians', market: 'Moneyline', premium: false }));
    expect(html).toContain('<svg');
    expect(html).toMatch(/<span class="sr-only">Guardians Moneyline<\/span>/);
  });
});
```
- [ ] Step 2 run → FAIL. Step 3: wrap the return in a fragment: `<><span className="sr-only">{team} {market}</span><svg …>…</svg></>`. Step 4: run this test + `tests/native-card-model.test.ts tests/pick-discovery.test.ts` → PASS. Step 5: commit `-- web/components/picks/native-headline.tsx web/tests/native-headline.test.ts`, message `Expose card headlines as text for crawlers and screen readers`.

---

### Task 11: Host redirect `betwithgary.com` → `www.betwithgary.ai`

**Files:** Modify `web/next.config.ts:19-25`; Test `web/tests/next-config-redirects.test.ts` (new).

- [ ] Step 1 test:
```ts
import { describe, expect, it } from 'vitest';
import nextConfig from '@/next.config';
describe('next.config redirects', () => {
  it('sends both betwithgary.com hosts to the canonical www.betwithgary.ai host, path preserved', async () => {
    const redirects = await nextConfig.redirects!();
    for (const host of ['betwithgary.com', 'www.betwithgary.com']) {
      const rule = redirects.find(r => r.has?.some(h => h.type === 'host' && h.value === host));
      expect(rule).toMatchObject({ source: '/:path*', destination: 'https://www.betwithgary.ai/:path*', permanent: true });
    }
    expect(redirects.find(r => r.source === '/picks/world-cup')).toBeDefined();
  });
});
```
- [ ] Step 2 run → FAIL. Step 3: prepend to the array returned by `redirects()`:
```ts
      // betwithgary.com is a legacy alias attached to the same deployment. Google
      // saw both hosts answer 200; only the .ai canonical tag separated them.
      { source: '/:path*', has: [{ type: 'host', value: 'betwithgary.com' }], destination: 'https://www.betwithgary.ai/:path*', permanent: true },
      { source: '/:path*', has: [{ type: 'host', value: 'www.betwithgary.com' }], destination: 'https://www.betwithgary.ai/:path*', permanent: true },
```
- [ ] Step 4: test PASS; `npm run build` must succeed (rewrites/redirects validated at build). Step 5: commit `-- web/next.config.ts web/tests/next-config-redirects.test.ts`, message `Redirect betwithgary.com to the canonical host`.

---

### Task 12: `feed.xml` pubDate from the stored publish time

**Files:** Modify `web/app/feed.xml/route.ts`; Test `web/tests/feed-route.test.ts` (new).

- [ ] Step 1 test:
```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/gary/picks', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/picks')>(),
  fetchTodayGamePicks: async () => [{ league: 'MLB', pick: 'Cubs ML -110', awayTeam: 'Cubs', homeTeam: 'Reds', pick_id: 'p1', rationale: 'The take.' }] }));
vi.mock('@/lib/gary/pick-links', () => ({ fetchPublishedPickPaths: async () => new Set(['/picks/mlb/2026-09-16/cubs-at-reds']), publishedPickPath: () => '/picks/mlb/2026-09-16/cubs-at-reds' }));
vi.mock('@/lib/gary/dates', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/dates')>(), todayEST: () => '2026-09-16' }));
const index = vi.hoisted(() => ({ rows: [] as { date: string; published_at: string | null; game_count: number; prop_count: number; research_count: number }[] }));
vi.mock('@/lib/gary/archive', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gary/archive')>(), fetchArchiveDayIndex: async () => index.rows }));
import { GET } from '@/app/feed.xml/route';
describe('feed.xml', () => {
  it('dates items by the day’s stored publish time and omits pubDate when unknown', async () => {
    index.rows = [{ date: '2026-09-16', published_at: '2026-09-16T15:16:58Z', game_count: 1, prop_count: 0, research_count: 0 }];
    let xml = await (await GET()).text();
    expect(xml).toContain('<pubDate>Wed, 16 Sep 2026 15:16:58 GMT</pubDate>');
    expect(xml).toContain('<lastBuildDate>');
    index.rows = [];
    xml = await (await GET()).text();
    expect(xml).not.toContain('<pubDate>');
    expect(xml).toContain('<link>https://www.betwithgary.ai/picks/mlb/2026-09-16/cubs-at-reds</link>');
  });
});
```
- [ ] Step 2 run → FAIL. Step 3 implement: import `fetchArchiveDayIndex` from `@/lib/gary/archive`; in `GET`, after `publishedPaths`:
```ts
  const dayIndex = await fetchArchiveDayIndex().catch(() => []);
  const publishedAt = dayIndex.find(row => row.date === date)?.published_at ?? null;
  const pubDate = publishedAt && Number.isFinite(Date.parse(publishedAt)) ? new Date(publishedAt).toUTCString() : null;
  const buildDate = new Date().toUTCString();
```
Replace `<pubDate>${pubDate}</pubDate>` with `${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}` and `<lastBuildDate>${pubDate}</lastBuildDate>` with `<lastBuildDate>${buildDate}</lastBuildDate>`. Step 4 → PASS. Step 5 commit `-- web/app/feed.xml/route.ts web/tests/feed-route.test.ts`, message `Date feed items by the stored publish time`.

---

### Task 13: Sitemap `lastmod` from the stored publish time

**Files:** Modify `web/lib/gary/archive.ts:203-231` (`ArchiveDateSummary` + `summarizeArchiveDayIndex`), `web/lib/seo/sitemap.ts` (`sitemapXml`, `gameSitemapEntries`), `web/lib/seo/archive-sitemap.ts`, `web/lib/seo/game-sitemap.ts`; Tests: `web/tests/sitemap.test.ts:102-104, 147-164, 246-250` and `web/tests/archive.test.ts` (summaries).

- [ ] **Step 1: Tests** — in `sitemap.test.ts`: (a) keep the static-sitemap "does not invent last-modified timestamps" test as is; (b) in the archive test push summaries with `publishedAt: '2026-09-01T15:00:00Z'` for `2026-09-01` and `publishedAt: null` for `2026-08-02`, then assert `items.find(/archive/2026-09-01).lastModified` equals `new Date('2026-09-01T15:00:00Z')` and `/archive/2026-08-02` has `lastModified === undefined`, and the month `/archive/month/2026-09` gets the newest date's time; (c) replace the last test with:
```ts
it('escapes XML URLs and writes lastmod only from a real stored timestamp', () => {
  const xml = sitemapXml([
    { url: `${BASE_URL}/?a=1&b=<test>`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${BASE_URL}/archive/2026-09-01`, lastModified: new Date('2026-09-01T15:00:00Z') },
  ]);
  expect(xml).toContain('?a=1&amp;b=&lt;test&gt;</loc>');
  expect(xml.match(/<lastmod>/g)?.length).toBe(1);
  expect(xml).toContain('<lastmod>2026-09-01T15:00:00.000Z</lastmod>');
});
```
(d) add a game-shard case: mock `fetchArchiveDayIndex` in this file (extend the existing `@/lib/gary/archive` mock with `fetchArchiveDayIndex: async () => dayIndex` where `dayIndex` is a hoisted array) and assert `gameSitemap({id:'0'})` entries for a date present in `dayIndex` carry `lastModified`, and dates absent carry none; also assert that when `fetchArchiveDayIndex` rejects the shard still returns entries (no lastmod) — the pick index is the inventory, the day index is decoration.
In `archive.test.ts` add: `summarizeArchiveDayIndex([{ date:'2026-09-01', published_at:'2026-09-01T15:00:00Z', game_count:2, prop_count:0, research_count:0 }])[0].publishedAt === '2026-09-01T15:00:00Z'` and an invalid string → `null`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**:
  - `archive.ts`: `export interface ArchiveDateSummary { date: string; hasGamePicks: boolean; hasProps: boolean; hasResearch: boolean; publishedAt?: string | null; }`; in `summarizeArchiveDayIndex` merge keeps the earliest `published_at` (`prev.published_at && row.published_at ? (prev.published_at < row.published_at ? prev.published_at : row.published_at) : prev.published_at ?? row.published_at`), and the returned object adds `publishedAt: row.published_at && Number.isFinite(Date.parse(row.published_at)) ? row.published_at : null`.
  - `lib/seo/sitemap.ts`: in `sitemapXml` add after priority: `${entry.lastModified === undefined ? '' : `\n    <lastmod>${lastmodIso(entry.lastModified)}</lastmod>`}` with `function lastmodIso(value: Date | string): string { const d = value instanceof Date ? value : new Date(value); return d.toISOString(); }` guarded: skip when `Number.isNaN(d.getTime())`. Change `gameSitemapEntries(rows, today = todayEST(), publishedByDate: ReadonlyMap<string, string> = new Map())` and set `lastModified: publishedByDate.has(path.date) ? new Date(publishedByDate.get(path.date)!) : undefined` on both day and game entries (omit the key when undefined so the static "no lastmod" invariant holds for objects without a value — use conditional spread).
  - `archive-sitemap.ts`: date entries `...(summary.publishedAt ? { lastModified: new Date(summary.publishedAt) } : {})`; month entries: newest `publishedAt` among that month's summaries, same conditional spread.
  - `game-sitemap.ts`: `const [rows, dayIndex] = await Promise.all([fetchPickIndex(), fetchArchiveDayIndex().catch(() => [])]);` build `publishedByDate = new Map(dayIndex.filter(r => r.published_at && Number.isFinite(Date.parse(r.published_at))).map(r => [r.date, r.published_at!]))`; pass to `gameSitemapEntries(rows, todayEST(), publishedByDate)`.
  - Update `app/sitemap.ts:11-14` comment to say the static inventory still omits lastmod while archive/game inventories carry the stored publish time.
- [ ] **Step 4: Run** `npx vitest run tests/sitemap.test.ts tests/archive.test.ts tests/gamepage.test.ts` → PASS; typecheck.
- [ ] **Step 5: Commit** `-- web/lib/gary/archive.ts web/lib/seo/sitemap.ts web/lib/seo/archive-sitemap.ts web/lib/seo/game-sitemap.ts web/app/sitemap.ts web/tests/sitemap.test.ts web/tests/archive.test.ts`, message `Publish sitemap lastmod from stored publish times`.

---

### Task 14: Copy alignment (manifest, social alt, footer, Winners label, reviewer guide)

**Files:** Modify `web/app/manifest.ts:18-21`, `web/lib/seo/metadata.ts:8`, `web/components/Footer.tsx:12`, `web/components/book/WinnersClient.tsx:139`, `web/public/brand/gary-reviewer-guide.txt`; Test extend `web/tests/public-marketing-copy.test.ts`.

- [ ] Step 1 test (append):
```ts
it('keeps install and share copy on the approved product language', async () => {
  const { default: manifest } = await import('@/app/manifest');
  expect(manifest().description).not.toMatch(/every game|every day|written reasoning/i);
  expect(manifest().description).toContain('best bets');
  const guide = (await import('node:fs')).readFileSync(new URL('../public/brand/gary-reviewer-guide.txt', import.meta.url), 'utf8');
  expect(guide).toContain('best bets of the day');
  expect(guide).toContain('/hub');
  expect(guide).not.toContain('reviewed selection');
});
```
- [ ] Step 2 run → FAIL. Step 3:
  - `manifest.ts`: `description: 'Gary’s free game picks and player props, his best bets in Winners, and insights and betting connections in the Hub.'` (keep `name`); delete the stale Aug 11 comment block (lines 6-11), keep the standalone note.
  - `metadata.ts:8`: `const socialImageAlt = 'Gary AI — game picks, best bets and insights, with results on the public record.';`
  - `Footer.tsx:12`: replace `{ href: "/nfl", label: "NFL Kickoff" }` with `{ href: "/picks/mlb", label: "MLB Picks" }, { href: "/picks/nfl", label: "NFL Picks" }, { href: "/picks/ncaaf", label: "College Football Picks" }`.
  - `WinnersClient.tsx:139`: `{t.league} · WINNERS PICK · {t.kind === 'prop' ? 'PROP' : 'GAME'}` (string only; no hook changes).
  - Reviewer guide: line 2 `Updated September 17, 2026`; lines 4-6 → `Gary AI makes game picks and player prop picks for MLB, NFL and college football. Winners holds Gary's best bets of the day, the picks he would bet on; the number varies and a Winners designation is not a result. The Hub surfaces insights and betting connections. Every published pick keeps its reasoning, listed odds and public graded result. Gary is an AI product operated by Gary A.I. LLC, not a human handicapper.`; START HERE add `Player props: https://www.betwithgary.ai/props`, `Home run picks: https://www.betwithgary.ai/props/home-runs`, `Touchdown picks: https://www.betwithgary.ai/props/touchdowns`, `Winners: https://www.betwithgary.ai/winners`, `The Hub: https://www.betwithgary.ai/hub`; lines 31-32 → `Free game picks, player props, the Hub and public results do not require a purchase. Winners is a paid selection of Gary's best bets; see current terms at /pricing.`
- [ ] Step 4: run `tests/public-marketing-copy.test.ts tests/winners-empty-copy.test.ts tests/winners-client-boundary.test.ts tests/seo-metadata.test.ts` → PASS. Step 5: commit those five files + test, message `Align install, footer, Winners label and reviewer guide copy`.

---

### Task 15: Internal-test analytics exclusion (client, server, Vercel, UI) + beforeSend test

**Files:**
- Modify: `web/lib/gary/analytics-consent.ts`, `web/components/GrowthAnalytics.tsx`, `web/lib/gary/link-attribution.ts:30-36`, `web/app/get/route.ts`, `web/app/c/[handle]/route.ts`
- Test: `web/tests/useful-session.test.ts` (append), `web/tests/growth-analytics.test.ts` (new), `web/tests/app-store.test.ts` (append cookie case)

**Interfaces:**
- Produces: `ANALYTICS_INTERNAL_KEY = 'gary_analytics_internal_v1'`, `ANALYTICS_INTERNAL_COOKIE = 'gary_analytics_internal'`, `isInternalAnalyticsBrowser(): boolean`, `writeInternalAnalyticsExclusion(enabled: boolean): void`, `useInternalAnalyticsExclusion(): boolean | 'loading'`; server `hasInternalAnalyticsCookie(cookieHeader: string | null): boolean`; `hasGrantedAnalyticsCookie` now false when the internal cookie is present.

- [ ] **Step 1: Tests**. Append to `useful-session.test.ts`:
```ts
it('sends nothing from an internal test browser even after consent, and resumes when the flag is cleared', async () => {
  local.setItem('gary_analytics_consent_v1', 'granted');
  local.setItem('gary_analytics_internal_v1', '1');
  const analytics = await import('@/lib/gary/analytics');
  const consent = await import('@/lib/gary/analytics-consent');
  expect(consent.isInternalAnalyticsBrowser()).toBe(true);
  analytics.initializeGrowthAnalytics('/today'); analytics.logMeaningfulPickView(pick);
  expect(analytics.beginAppStoreHandoff('home_app_section')).toBe('/go/app?surface=home_app_section');
  expect(sent()).toEqual([]);
  consent.writeInternalAnalyticsExclusion(false);
  expect(local.getItem('gary_analytics_internal_v1')).toBeNull();
  analytics.initializeGrowthAnalytics('/today');
  expect(sent().map(e => e.event)).toEqual(['session_started']);
});
```
New `growth-analytics.test.ts`:
```ts
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const captured = vi.hoisted(() => ({ analytics: null as null | ((e: unknown) => unknown), speed: null as null | ((e: unknown) => unknown) }));
vi.mock('next/dynamic', () => ({ default: (loader: () => Promise<unknown>) => {
  // Resolve synchronously for the test: return a component that records beforeSend.
  const name = loader.toString();
  return (props: { beforeSend: (e: unknown) => unknown }) => { if (name.includes('speed-insights')) captured.speed = props.beforeSend; else captured.analytics = props.beforeSend; return null; };
} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/picks' }));
vi.mock('next/link', () => ({ default: (p: { children: unknown }) => p.children }));
import { renderToStaticMarkup } from 'react-dom/server';

describe('GrowthAnalytics consent gate', () => {
  beforeEach(() => { vi.resetModules(); captured.analytics = null; captured.speed = null; });
  afterEach(() => vi.unstubAllGlobals());
  it('cancels every Vercel event unless consent is granted and the browser is not internal', async () => {
    const consent = await import('@/lib/gary/analytics-consent');
    const { GrowthSignalsForTest } = await import('@/components/GrowthAnalytics');
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: new URL('https://www.betwithgary.ai/picks') }));
    vi.stubGlobal('document', { cookie: '', visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });
    const local = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v), removeItem: (k: string) => local.delete(k), key: () => null, length: 0 });
    renderToStaticMarkup(createElement(GrowthSignalsForTest));
    expect(captured.analytics).toBeTypeOf('function');
    expect(captured.analytics!({ type: 'pageview' })).toBeNull();
    consent.writeAnalyticsConsent('granted');
    expect(captured.analytics!({ type: 'pageview' })).toEqual({ type: 'pageview' });
    consent.writeInternalAnalyticsExclusion(true);
    expect(captured.analytics!({ type: 'pageview' })).toBeNull();
    expect(captured.speed!({ type: 'vital' })).toBeNull();
  });
});
```
(Export `GrowthSignals` as `GrowthSignalsForTest` from `GrowthAnalytics.tsx`; if `next/dynamic` mocking proves brittle, mock `@vercel/analytics/react` and `@vercel/speed-insights/next` instead and render `GrowthSignalsForTest` — whichever renders under `renderToStaticMarkup`. The assertion that matters: `beforeSend` returns `null` when undecided/declined/internal and passes the event through when granted.)
Append to `app-store.test.ts`:
```ts
it('does not log a standard handoff for an internal test browser', async () => {
  const { shouldTrackStandardHandoff, hasGrantedAnalyticsCookie } = await import('@/lib/gary/link-attribution');
  const url = new URL('https://www.betwithgary.ai/go/app?surface=home_app_section&measure=1&click_id=0b6a3d7e-8c2f-4a1e-9d3b-5f6a7b8c9d0e');
  expect(shouldTrackStandardHandoff(url, 'gary_analytics_consent=granted')).toBe(true);
  expect(shouldTrackStandardHandoff(url, 'gary_analytics_consent=granted; gary_analytics_internal=1')).toBe(false);
  expect(hasGrantedAnalyticsCookie('gary_analytics_internal=1; gary_analytics_consent=granted')).toBe(false);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**.
  `analytics-consent.ts` additions:
```ts
export const ANALYTICS_INTERNAL_KEY = 'gary_analytics_internal_v1';
export const ANALYTICS_INTERNAL_COOKIE = 'gary_analytics_internal';
let inMemoryInternal: boolean | undefined;

/** Deliberate developer/test opt-out: this browser never sends first-party or Vercel analytics. */
export function isInternalAnalyticsBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = localStorage.getItem(ANALYTICS_INTERNAL_KEY);
    if (value === '1') { inMemoryInternal = true; return true; }
    if (value === null && inMemoryInternal) return true;
  } catch {
    if (inMemoryInternal) return true;
  }
  try {
    return document.cookie.split(';').some(part => part.trim() === `${ANALYTICS_INTERNAL_COOKIE}=1`);
  } catch {
    return false;
  }
}

export function writeInternalAnalyticsExclusion(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  inMemoryInternal = enabled;
  try {
    if (enabled) localStorage.setItem(ANALYTICS_INTERNAL_KEY, '1');
    else localStorage.removeItem(ANALYTICS_INTERNAL_KEY);
  } catch { /* in-memory flag still applies for this page */ }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  try {
    document.cookie = enabled
      ? `${ANALYTICS_INTERNAL_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
      : `${ANALYTICS_INTERNAL_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  } catch { /* cookie-less contexts fall back to storage/memory */ }
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: enabled ? 'internal' : 'external' }));
}

export function useInternalAnalyticsExclusion(): boolean | 'loading' {
  return useSyncExternalStore(subscribeToAnalyticsConsent, isInternalAnalyticsBrowser, () => 'loading');
}
```
  and change `hasAnalyticsConsent` to `return readAnalyticsConsent() === 'granted' && !isInternalAnalyticsBrowser();` (this single change gates `trackWebEvent`, `initializeGrowthAnalytics`, `logMeaningfulPickView`, `logBookMilestone`, `beginAppStoreHandoff`, `logSignupCompleted`, `logFirstBookAction`, and both `beforeSend` callbacks). Add `ANALYTICS_INTERNAL_KEY` to nothing in the clear lists (the exclusion must survive a decline).
  `GrowthAnalytics.tsx`: `const internal = useInternalAnalyticsExclusion();` mount `GrowthSignals` only when `consent === 'granted' && internal === false`; export `GrowthSignals` additionally as `export { GrowthSignals as GrowthSignalsForTest }`; in the choices `<aside>` add a third, quieter control below the buttons:
```tsx
            <button type="button" onClick={() => writeInternalAnalyticsExclusion(internal !== true)} className="mt-2 text-[11px] text-low underline decoration-white/20 underline-offset-2 hover:text-hi">
              {internal === true ? 'Internal testing: this browser is excluded from analytics. Include it again' : 'Internal testing? Exclude this browser from analytics'}
            </button>
```
  `link-attribution.ts`:
```ts
export function hasInternalAnalyticsCookie(cookieHeader: string | null): boolean {
  return Boolean(cookieHeader?.split(';').some(value => value.trim() === 'gary_analytics_internal=1'));
}
export function hasGrantedAnalyticsCookie(cookieHeader: string | null): boolean {
  if (hasInternalAnalyticsCookie(cookieHeader)) return false;
  return Boolean(cookieHeader?.split(';').some(value => value.trim() === 'gary_analytics_consent=granted'));
}
```
  `app/get/route.ts` and `app/c/[handle]/route.ts`: wrap the `after(...)` block in `if (!hasInternalAnalyticsCookie(request.headers.get('cookie'))) { … }` (import it). Update the privacy-page sentence? Leave `app/privacy/page.tsx:80-88` unchanged (it says those links are always logged for the public; the internal cookie only exists on Adam's own browsers — note it in the measurement doc).
- [ ] **Step 4: Run** `npx vitest run tests/useful-session.test.ts tests/growth-analytics.test.ts tests/app-store.test.ts tests/analytics.test.ts tests/book-analytics.test.ts` → PASS; typecheck; lint.
- [ ] **Step 5: Commit** `-- web/lib/gary/analytics-consent.ts web/components/GrowthAnalytics.tsx web/lib/gary/link-attribution.ts web/app/get/route.ts 'web/app/c/[handle]/route.ts' web/tests/useful-session.test.ts web/tests/growth-analytics.test.ts web/tests/app-store.test.ts`, message `Add an internal-test exclusion to website analytics`.

---

### Task 16: Attribution corrections and paywall dedup

**Files:** Modify `web/lib/gary/analytics.ts` (`referrerHost`, `initializeGrowthAnalytics`, new `logPaywallViewed`), `web/lib/gary/analytics-consent.ts` (`SESSION_ANALYTICS_PREFIXES` + `'gary_paywall_v1:'`), `web/components/PricingPlans.tsx:14-16`; Tests `web/tests/analytics.test.ts`, `web/tests/useful-session.test.ts`, `web/tests/pricing-access-navigation.test.ts` (check it still passes; it mocks hooks).

- [ ] **Step 1: Tests**. `analytics.test.ts` append:
```ts
it('treats the legacy betwithgary.com host as the same site', () => {
  expect(attributionTouch({ url: 'https://www.betwithgary.ai/picks', referrer: 'https://www.betwithgary.com/today' })).toEqual({ source: 'direct', medium: 'none', landing: '/picks' });
});
```
`useful-session.test.ts` append:
```ts
it('does not let an OAuth return overwrite the campaign that brought the browser', async () => {
  local.setItem('gary_analytics_consent_v1', 'granted');
  const analytics = await import('@/lib/gary/analytics');
  analytics.initializeGrowthAnalytics('/today'); // utm_source=x campaign landing from beforeEach
  analytics.resetGrowthAnalyticsMemory(); // new document (the OAuth round-trip lands on /account)
  window.location.href = 'https://www.betwithgary.ai/account';
  vi.stubGlobal('document', { referrer: 'https://accounts.google.com/o/oauth2/auth', cookie: '', visibilityState: 'visible' });
  analytics.logSignupCompleted('google');
  const completed = sent().find(e => e.event === 'signup_completed');
  expect(completed?.props).toMatchObject({ latest_source: 'x', latest_medium: 'organic_social', first_source: 'x' });
});
it('records one paywall view per session across reloads', async () => {
  local.setItem('gary_analytics_consent_v1', 'granted');
  const analytics = await import('@/lib/gary/analytics');
  analytics.logPaywallViewed('web', 'pricing_page'); analytics.logPaywallViewed('web', 'pricing_page');
  analytics.resetGrowthAnalyticsMemory(); analytics.logPaywallViewed('web', 'pricing_page');
  expect(sent().filter(e => e.event === 'paywall_viewed')).toHaveLength(1);
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in `analytics.ts`:
  - `const OWNED_HOSTS = new Set(['betwithgary.ai', 'betwithgary.com']);` and in `referrerHost` return `host && host !== current && !OWNED_HOSTS.has(host) ? host : undefined;`
  - `const AUTH_RETURN_HOST = /^(?:accounts\.google\.com|appleid\.apple\.com|[a-z0-9-]+\.supabase\.co)$/;` and in `initializeGrowthAnalytics`: `const isAuthReturn = current.referrer !== undefined && AUTH_RETURN_HOST.test(current.referrer); const isFreshExternalEntry = !documentAttributionCaptured && current.referrer !== undefined && !isAuthReturn;`
  - Add:
```ts
const PAYWALL_PREFIX = 'gary_paywall_v1:';
/** One paywall view per session and surface, refresh-safe. Plan clicks stay distinct intents. */
export function logPaywallViewed(surface: string, trigger: string): void {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  initializeGrowthAnalytics(window.location.pathname);
  const key = `${PAYWALL_PREFIX}${memorySession!.id}:${cleanToken(surface) ?? 'unknown'}:${cleanToken(trigger) ?? 'unknown'}`;
  if (memoryViews.has(key)) return;
  try {
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
  } catch { /* in-memory deduplication still applies */ }
  memoryViews.add(key);
  trackWebEvent('paywall_viewed', { surface, trigger });
}
```
  - `analytics-consent.ts`: add `'gary_paywall_v1:'` to `SESSION_ANALYTICS_PREFIXES`.
  - `PricingPlans.tsx`: `import { logEvent, logPaywallViewed } from '@/lib/gary/analytics';` and `useEffect(() => { logPaywallViewed('web', 'pricing_page'); }, []);`.
- [ ] **Step 4: Run** `npx vitest run tests/analytics.test.ts tests/useful-session.test.ts tests/pricing-access-navigation.test.ts tests/growth-analytics.test.ts` → PASS.
- [ ] **Step 5: Commit** `-- web/lib/gary/analytics.ts web/lib/gary/analytics-consent.ts web/components/PricingPlans.tsx web/tests/analytics.test.ts web/tests/useful-session.test.ts`, message `Keep campaign attribution through login and dedupe paywall views`.

---

### Task 17: Weekly report — acquisition, returning, App Store, paywall, signups, shares, X roll-up

**Files:** Modify `web/lib/gary/funnel.ts`, `web/scripts/weekly-funnel.mjs`; Test `web/tests/funnel.test.ts` (append).

**Interfaces:**
- `weeklyFunnel(rows: FunnelEvent[], weekStart: string, asOf: string, linkClicks: LinkClickRow[] = [])` — existing output keys unchanged; new keys: `first_touch_channels`, `landing_pages`, `x_channel`, `returning`, `app_store`, `paywall`, `signups`, `shares`.
- `export type LinkClickRow = { click_id: string; surface: string; ct: string | null; referrer_host: string | null; latest_source: string | null; latest_medium: string | null; latest_campaign: string | null; latest_landing: string | null; created_at: string }`.

- [ ] **Step 1: Test** (append to `funnel.test.ts`):
```ts
it('reports acquisition, returning browsers, handoffs, paywall, signups and shares for the week with an X roll-up', () => {
  const rows = [
    row(1, 'a', 'a1', '2026-08-31T12:00:00Z', 'session_started', { latest_landing: '/picks/mlb', first_source: 'google.com', first_medium: 'organic' }),
    row(2, 'a', 'a1', '2026-08-31T12:00:05Z', 'meaningful_pick_view', { measurement_version: 'reasoning_v2' }),
    row(3, 'b', 'b1', '2026-09-01T12:00:00Z', 'session_started', { latest_source: 't.co', latest_medium: 'referral', latest_landing: '/' }),
    row(4, 'old', 'o0', '2026-08-01T12:00:00Z'),
    row(5, 'old', 'o1', '2026-09-02T12:00:00Z', 'session_started', { latest_source: 'direct', latest_medium: 'none' }),
    row(6, 'old', 'o1', '2026-09-02T12:00:01Z', 'return_visit', { path: '/', days_since_last_visit: 32 }),
    row(7, 'a', 'a1', '2026-08-31T12:01:00Z', 'app_store_handoff', { surface: 'game_page_mlb', click_id: 'c1', destination: 'app_store' }),
    row(8, 'a', 'a1', '2026-08-31T12:02:00Z', 'paywall_viewed', { surface: 'web', trigger: 'pricing_page' }),
    row(9, 'a', 'a1', '2026-08-31T12:02:30Z', 'plan_selected', { surface: 'web', plan: 'single', sport: 'mlb', billing: 'monthly' }),
    row(10, 'a', 'a1', '2026-08-31T12:03:00Z', 'signup_started', { method: 'email' }),
    row(11, 'a', 'a1', '2026-08-31T12:04:00Z', 'signup_completed', { method: 'email' }),
    row(12, 'b', 'b1', '2026-09-01T12:05:00Z', 'share_started', { method: 'copy_link', surface: 'matchup_page', content_type: 'pick', path: '/picks/mlb/2026-09-01/a-at-b' }),
    row(13, 'b', 'b1', '2026-09-01T12:05:01Z', 'share_completed', { method: 'copy_link', surface: 'matchup_page', content_type: 'pick', path: '/picks/mlb/2026-09-01/a-at-b' }),
  ];
  const clicks = [{ click_id: 'c1', surface: 'game_page_mlb', ct: 'website', referrer_host: null, latest_source: 'x', latest_medium: 'social', latest_campaign: null, latest_landing: '/picks', created_at: '2026-08-31T12:01:01Z' }];
  const report = weeklyFunnel(rows, '2026-08-31', '2026-09-10T00:00:00Z', clicks);
  expect(report.first_touch_channels[0]).toMatchObject({ source: 'google.com', medium: 'organic', sessions: 1 });
  expect(report.landing_pages.find(l => l.landing === '/picks/mlb')).toMatchObject({ sessions: 1, useful_sessions: 1 });
  expect(report.x_channel).toMatchObject({ sessions: 2 }); // utm x + bare t.co
  expect(report.returning).toEqual({ sessions_from_returning_browsers: 1, return_visit_events: 1 });
  expect(report.app_store).toMatchObject({ handoff_clicks: 1, handoff_sessions: 1, redirects_logged: 1, by_surface: [{ surface: 'game_page_mlb', clicks: 1 }] });
  expect(report.paywall).toMatchObject({ paywall_sessions: 1, plan_selection_clicks: 1, by_plan: [{ plan: 'single', billing: 'monthly', sport: 'mlb', clicks: 1 }] });
  expect(report.signups).toEqual({ signup_started: { email: 1 }, signup_completed: { email: 1 }, email_signup_completed: {} });
  expect(report.shares).toMatchObject({ started: 1, completed: 1 });
  expect(JSON.stringify(report)).not.toContain('c1');
});
```
- [ ] **Step 2: Run** → FAIL (TS: 4th arg; missing keys).
- [ ] **Step 3: Implement** in `funnel.ts` (keep every existing computation; add after `channels`):
```ts
  const count = (items: Iterable<string>) => { const m = new Map<string, number>(); for (const k of items) m.set(k, (m.get(k) ?? 0) + 1); return m; };
  const weekRows = ordered.filter(inWeek);
  const bySession = (rows: FunnelEvent[]) => new Set(rows.map(sessionKey)).size;
  const firstTouch = new Map<string, FunnelEvent[]>();
  for (const row of weekSessions) {
    const key = JSON.stringify([token(row.props.first_source), token(row.props.first_medium), token(row.props.first_campaign, '(none)'), token(row.props.first_content, '(none)')]);
    firstTouch.set(key, [...(firstTouch.get(key) ?? []), row]);
  }
  const landings = new Map<string, FunnelEvent[]>();
  for (const row of weekSessions) {
    const key = token(row.props.latest_landing, '(unknown)');
    landings.set(key, [...(landings.get(key) ?? []), row]);
  }
  const X_HOSTS = new Set(['t.co', 'x.com', 'twitter.com', 'mobile.twitter.com']);
  const xSessions = weekSessions.filter(row => token(row.props.latest_source) === 'x' || X_HOSTS.has(token(row.props.latest_source)) || X_HOSTS.has(token(row.props.latest_referrer)));
  const returningBrowsers = new Set([...sessions.values()].filter(row => Date.parse(row.created_at) < start).map(row => row.identity));
  const handoffs = weekRows.filter(row => row.event === 'app_store_handoff');
  const clickIds = new Set(linkClicks.filter(c => Date.parse(c.created_at) >= start && Date.parse(c.created_at) < end).map(c => c.click_id));
  const paywallRows = weekRows.filter(row => row.event === 'paywall_viewed');
  const planRows = weekRows.filter(row => row.event === 'plan_selected');
  const byMethod = (event: string) => Object.fromEntries(count(weekRows.filter(r => r.event === event).map(r => token(r.props.method))));
  const shareStarted = weekRows.filter(r => r.event === 'share_started');
  const shareCompleted = weekRows.filter(r => r.event === 'share_completed');
```
and add to the returned object:
```ts
    first_touch_channels: [...firstTouch].map(([key, items]) => { const [source, medium, campaign, content] = JSON.parse(key) as string[]; return { source, medium, campaign, content, ...summarize(items) }; }).sort((a, b) => b.sessions - a.sessions),
    landing_pages: [...landings].map(([landing, items]) => ({ landing, ...summarize(items) })).sort((a, b) => b.sessions - a.sessions).slice(0, 20),
    x_channel: { definition: 'latest_source x, or a t.co/x.com/twitter.com source or referrer; the detailed channel rows are not relabelled.', ...summarize(xSessions) },
    returning: { sessions_from_returning_browsers: weekSessions.filter(row => returningBrowsers.has(row.identity)).length, return_visit_events: weekRows.filter(row => row.event === 'return_visit').length },
    app_store: {
      definition: 'handoff_clicks are consented App Store button clicks; redirects_logged are /go/app rows joined by click_id. Installs and purchases are not observable here.',
      handoff_clicks: handoffs.length, handoff_sessions: bySession(handoffs),
      redirects_logged: handoffs.filter(row => typeof row.props.click_id === 'string' && clickIds.has(row.props.click_id)).length,
      by_surface: [...count(handoffs.map(r => token(r.props.surface)))].map(([surface, clicks]) => ({ surface, clicks })).sort((a, b) => b.clicks - a.clicks),
      tracked_links: [...count(linkClicks.filter(c => clickIds.has(c.click_id)).map(c => `${c.surface}|${c.ct ?? '(none)'}`))].map(([k, clicks]) => { const [surface, ct] = k.split('|'); return { surface, ct, clicks }; }),
    },
    paywall: {
      paywall_sessions: bySession(paywallRows), plan_selection_clicks: planRows.length, plan_selection_sessions: bySession(planRows),
      by_plan: [...count(planRows.map(r => JSON.stringify([token(r.props.plan), token(r.props.billing), token(r.props.sport, '(all)')])))].map(([k, clicks]) => { const [plan, billing, sport] = JSON.parse(k) as string[]; return { plan, billing, sport, clicks }; }),
      note: 'A plan click is not a purchase. Paid subscriptions come only from the Stripe-backed user_entitlements table.',
    },
    signups: { signup_started: byMethod('signup_started'), signup_completed: byMethod('signup_completed'), email_signup_completed: Object.fromEntries(count(weekRows.filter(r => r.event === 'email_signup_completed').map(r => token(r.props.cadence)))) },
    shares: { started: shareStarted.length, completed: shareCompleted.length, by_surface: [...count([...shareStarted, ...shareCompleted].map(r => `${token(r.props.surface)}|${token(r.props.method)}|${r.event}`))].map(([k, n]) => { const [surface, method, event] = k.split('|'); return { surface, method, event, count: n }; }) },
```
Add `export type LinkClickRow = {...}` and the 4th parameter. `weekly-funnel.mjs`: import `WEB_EVENTS` from `../lib/gary/analytics-schema.ts`; set `event: `in.(${WEB_EVENTS.join(',')})``; after the events loop add a second paginated loop over `/rest/v1/web_link_clicks` with `select: 'click_id,surface,ct,referrer_host,latest_source,latest_medium,latest_campaign,latest_landing,created_at'`, `created_at: gte.${week}T00:00:00Z` and `lte.${horizon}`, `order: id.asc`, `id: gt.${lastId}` (select must include `id` for pagination; strip it before passing); call `weeklyFunnel(rows, week, now.toISOString(), clicks)`. Update `--help` text.
- [ ] **Step 4: Run** `npx vitest run tests/funnel.test.ts` → PASS; `node --experimental-strip-types scripts/weekly-funnel.mjs --help` prints usage; typecheck.
- [ ] **Step 5: Commit** `-- web/lib/gary/funnel.ts web/scripts/weekly-funnel.mjs web/tests/funnel.test.ts`, message `Extend the weekly funnel to acquisition, handoffs, paywall, signups and shares`.

---

### Task 18: Full web verification

- [ ] `cd /Users/adam.preda/Gary2.0 && npm --prefix web test` → all green (record file/test counts).
- [ ] `npm --prefix web run typecheck && npm --prefix web run lint` → 0 errors (2 known warnings).
- [ ] `npm --prefix web run build` → success.
- [ ] `npm run smoke:web` → passes, including the two new fixture assertions. Also curl the preview (`node --experimental-strip-types web/scripts/fixture-preview.mjs --port=3100` in background) for `/props/home-runs`, `/props/touchdowns`, `/picks/mlb`, `/picks/mlb/<date>`, `/feed.xml`, `/archive/sitemap.xml` and confirm SSR text, canonical tags, `<lastmod>`, `<pubDate>`; stop the server.
- [ ] `npm run smoke:sitemaps` → passes (lastmod must survive the outage round: last-good XML byte-identical).
- [ ] Fix anything red inside the responsible task's files; report unrelated pre-existing failures separately.

---

## Phase B — Documents (parallel, write only; the orchestrator commits)

All under `GaryMarketing/launch-2026-09/`, dated with the execution date (`2026-09-17`). Plain Markdown, ET times, no numbers invented; every figure carries its source and retrieval time. Never overwrite `SEARCH_CONSOLE_2026-09-16.md`, `SEO_BASELINE_2026-09-16.md`, `SEO_OUTREACH_2026-09-16.md`.

### Task 19: `SEO_GROWTH_AUDIT_2026-09-17.md` (Workstream A)
- Sections: (1) Baseline (copy the spec §4 tables verbatim with their dates; add "live snapshot 2026-09-16 ~11:05 PM ET" counts: sitemap 34 + 335 + 4,330 = 4,699 URLs; feed 15 items; zero lastmod pre-change). (2) The 20+ page audit table with columns exactly: URL · page type · indexing desirable? · HTTP · robots · declared canonical · Google-selected canonical · Google status · last crawl · source sitemap · internal referring page · visible original content (SSR) · proposed action / fix task. Fill the non-Google columns from `scratchpad/live-probe/{meta_report.txt,chain.txt,*.links.txt}` (26 URLs sampled; keep at least: `/`, `/picks`, `/picks/mlb`, `/picks/nfl`, `/picks/ncaaf`, `/props`, `/hub`, `/winners`, `/results`, `/results/mlb`, `/archive`, `/archive/2026-09-01`, `/archive/month/2026-09`, `/today`, `/press`, `/picks/mlb/2026-09-15`, `/picks/nfl/2026-09-14`, `/picks/mlb/2026-09-15/red-sox-at-rangers`, `/picks/nfl/2026-09-14/denver-broncos-at-kansas-city-chiefs`, `/picks/mlb/2026-07-31/white-sox-at-rays`, `/signin`, the utm variant, `https://www.betwithgary.com/`, plus `/picks/nhl` and `/picks/ncaab` as "dormant sport" rows). Google columns: "pending URL Inspection (Task 26)" until filled. (3) Findings and fixes table: each ranked gap → task → commit. (4) Preserved/already-correct list (from the critic's `already_satisfactory`). (5) "Discovered – currently not indexed 3,993" interpretation: inventory-sized, no variant inflation, retired-sport share (NBA 721 + NCAAB 586 + WC 89 leaves), overlapping listing layers; what changed (host redirect, lastmod, internal links, headline text) and what only time/links can change. (6) Repeatable sample: paste `live-probe/urls.txt` and the `fetch.sh` recipe.

### Task 20: `SEO_QUERY_PAGE_MAP_2026-09-17.md` (Workstream B)
- Use `WebSearch` (no purchases) for: "MLB picks today", "NFL picks today", "college football picks", "home run picks today", "anytime touchdown picks today", plus branded "gary ai picks". Record for each: date/time of the search, the top result types observed (aggregator, sportsbook, publisher, forum), whether Gary appears, and the spec §4 GSC rows (`gary app` 5.1/37, `garyai` 5.2/5, `ai sports picks today` 76.8/4, `best ai sports betting picks today` 81.6/14, `free sports picks daily` 79.4/17). Label everything "candidate topic; volume unverified".
- Map: intent → ONE primary page (`/picks/mlb`, `/picks/nfl`, `/picks/ncaaf`, `/props/home-runs`, `/props/touchdowns`, `/props`, `/hub`, `/winners`, `/`), the title/description it now carries (quote from source), supporting pages, and the change implemented (task/commit). State why no new competing pages were created and why no guides were added (existing SportGuide, `/props` guide, `/how-it-works`, lane explainers cover the real questions; spec §6.9).

### Task 21: `SEO_GROWTH_MEASUREMENT_2026-09-17.md` (Workstream D)
- Event inventory (16 events, properties, where each fires) from `read_analytics.json` behavior §1. Definitions: `meaningful_pick_view`/`reasoning_v2` unchanged (5 continuous foreground seconds). Attribution rules (utm > referrer > direct; Google search roots only; owned hosts internal; auth-return no longer refreshes `latest_*`; historical rows before 2026-09-08 may carry `accounts.google.com` as organic and are not rewritten). X label set and the report roll-up. Internal exclusion: how to enable (Privacy choices → "Internal testing? Exclude this browser", or console `localStorage.setItem('gary_analytics_internal_v1','1'); document.cookie='gary_analytics_internal=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure'`), what it covers (first-party events, `/go/app`, `/get`, `/c/*`, Vercel Analytics + Speed Insights via `beforeSend`), exact limitations (a Vercel pageview that fires before React registers `beforeSend`; other devices; cleared storage). Dedup table per event. Report command: `cd web && node --env-file=../gary2.0/.env.local --experimental-strip-types scripts/weekly-funnel.mjs --week 2026-09-07` (UTC weeks; ET = UTC−4 now). Subscriber count SQL (read-only, service role): `select count(distinct stripe_subscription_id) filter (where status='active' and (expires_at is null or expires_at > now())) as active_subscriptions from public.user_entitlements where livemode and stripe_subscription_id is not null;` with the caveat that `has_winners_access` grants everyone Winners until 2026-10-01, so access ≠ paid; Apple installs/subscriptions reported separately, not joined. §9.1 X publisher verification: no in-thread URL by design (cite `social-auto-post/index.ts:18-20, 60-67`), OG/Twitter card verified live on three game pages, `social_post_log.link_clicks` is N/A for pick threads; read-only SQL over `social_post_log.post_text` for the last 14 days asserting no `https?://` (run via the Supabase MCP `execute_sql`, read-only; paste the count). Baseline numbers section left as "filled in Task 27".

### Task 22: `SEO_OUTREACH_2026-09-17.md` + `SEO_OUTREACH_TRACKER_2026-09-17.csv` (Workstream E)
- Re-verify the three existing routes with `WebFetch` (SGPN contact form, SBJ `news@` FAQ, App Review Central submission page) on 2026-09-17; note any fee/service requirement; do not enroll or submit. Rewrite the three drafts to lead with the product demonstration (game and prop picks → Winners = best bets → Hub insights), link `/picks/mlb`, `/picks/nfl`, `/props/home-runs` or `/props/touchdowns` where the audience fits, `/results`, `/press`. Keep "honest review, no rating required".
- Add 5–10 well-matched prospects (sports betting newsletters, podcasts, creators, iOS app reviewers) found via `WebSearch`/`WebFetch`: for each record name, audience fit (why), official contact route (URL/email as published), tailored angle, links, and "verified 2026-09-17". No paid placements, no link-scheme sites.
- CSV columns exactly: `prospect,route,draft_ref,approval_status,hold_date,send_date,reply,placement_url,link_destination,referral_visits,useful_visits`; every row `approval_status=prepared`, `hold_date=2026-09-20`, all send/reply/placement/visit fields empty.
- Final section "Dispatch-ready summary": the exact small set of messages awaiting Adam's approval, sender identity still unselected, September 20 hold preserved.

---

## Phase C — Release, live verification, external reads, handoff

### Task 23: Commit docs, push
- [ ] `git add GaryMarketing/launch-2026-09/SEO_GROWTH_AUDIT_2026-09-17.md GaryMarketing/launch-2026-09/SEO_QUERY_PAGE_MAP_2026-09-17.md GaryMarketing/launch-2026-09/SEO_GROWTH_MEASUREMENT_2026-09-17.md GaryMarketing/launch-2026-09/SEO_OUTREACH_2026-09-17.md GaryMarketing/launch-2026-09/SEO_OUTREACH_TRACKER_2026-09-17.csv docs/superpowers/plans/2026-09-16-seo-growth-implementation.md && git commit -m "Record the SEO growth audit, query map, measurement and outreach package" -- <same paths>`.
- [ ] `git status --short` must show only ` M ios/GaryApp/GoogleService-Info.plist`. `git push origin main` (no force). Record the pushed SHA.

### Task 24: Production deployment and live checks
- [ ] Watch the Vercel deployment for `gary2.0` reach READY on the pushed SHA (`vercel ls` / `vercel inspect` from `web/` with the linked project, or the dashboard once the browser is available). Record deployment URL and time (ET).
- [ ] `curl -sSI https://www.betwithgary.com/picks/mlb` → 308 → `https://www.betwithgary.ai/picks/mlb`; same for `https://betwithgary.com/`.
- [ ] `curl -sS https://www.betwithgary.ai/props/home-runs` and `/props/touchdowns` → 200, canonical, SSR content or truthful empty state; `/props`, `/picks/mlb`, `/picks/nfl`, a game page, `/hub` → new links present (`/winners`, `/props/home-runs`, recent boards).
- [ ] `/feed.xml` → `<pubDate>` equals the day's stored publish time; `/archive/sitemap.xml` and `/picks/sitemap/0.xml` → `<lastmod>` present on dated entries; `/sitemap.xml` → the two lane URLs.
- [ ] From `gary2.0/`: `node scripts/production-truth.js` (report the plist exception and any Supabase-CLI-auth limitation as in earlier handoffs; do not treat as parity proof).

### Task 25: Browser QA (asks Adam for the Chrome browser — the one blocking question)
- [ ] `AskUserQuestion` listing "Browser 1" (180a2a78-88d7-4b78-8db9-9439bf320ae7), "Browser 2" (698e2433-6ecb-42b4-9154-2176a1e5d450) and the confirmation-screen option; then `select_browser`.
- [ ] On production, at 320, 390, 768 and 1440 px widths (use `resize_window`): `/props/home-runs`, `/props/touchdowns`, `/props`, `/picks/mlb`, `/picks/nfl` (off-day state), `/picks/mlb/<yesterday>`, one MLB game page, `/hub`. Check: no horizontal overflow, headings not clipped, consent aside not obstructive, tap targets usable, card flip/expand/share work, related links navigate, Winners link reaches `/winners`, App Store button 302s. Screenshots saved to `GaryMarketing/launch-2026-09/evidence/seo-growth-2026-09-17/`.
- [ ] Consent flow: decline → no `/api/analytics/event` requests (read_network_requests); grant → `session_started` posted; enable internal exclusion → nothing posted, Vercel `beforeSend` cancels (no `/_vercel/insights/*` event POST after the toggle).

### Task 26: Search Console and Vercel Analytics (business account, read-only + a few indexing requests)
- [ ] Open `https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Abetwithgary.ai`; if the session is `adam.preda@betwithgary.ai`, record: latest complete 28-day vs previous (clicks, impressions, CTR, position), branded vs non-branded query rows, indexing report totals/date, sitemaps status. If signed out or the personal account is active: record "Google-side fields unavailable — business account signed out" and skip; never copy credentials or change ownership.
- [ ] URL Inspection for the audit sample (≥ 12 URLs incl. the two new lane pages): fill the Google columns in `SEO_GROWTH_AUDIT_2026-09-17.md` (Google canonical, status, last crawl; "live test" vs "indexed copy").
- [ ] Request indexing ONLY for: `/props/home-runs`, `/props/touchdowns`, `/picks/mlb`, `/picks/nfl` (materially changed). Record each as "requested (not indexed)". Do not resubmit the homepage.
- [ ] Vercel Analytics (Production): record last 7/30 days visitors, page views, top pages, referrers, hostnames with the exact date range shown and retrieval time; do not overwrite the spec §4 figures.

### Task 27: Baseline report and subscriber count
- [ ] `cd web && node --env-file=../gary2.0/.env.local --experimental-strip-types scripts/weekly-funnel.mjs --week 2026-09-07` (complete UTC week Sep 7–13) and `--week 2026-09-14` (partial). Paste the JSON into `SEO_GROWTH_MEASUREMENT_2026-09-17.md` with labels: consent scope, partial week, immature cohorts, small samples, internal exclusion not yet active for historical rows.
- [ ] Supabase MCP `execute_sql` (read-only) for the subscriber count SQL and the `social_post_log` no-URL check; paste results with the retrieval time; label "Stripe livemode active subscriptions" separately from Apple.
- [ ] Commit the updated measurement + audit docs with pathspecs.

### Task 28: `HANDOFF_2026-09-17_SEO_GROWTH.md` (repo root) and final report
- [ ] Sections: changed files by task; commits (SHAs); test results (counts, typecheck/lint/build, smokes); deployment evidence (SHA, READY time, live curl results, screenshots dir); what was already correct and preserved; external actions remaining (Search Console items done/undone, outreach awaiting Adam's approval after Sep 20, X bio `utm_medium` account change, optional Vercel domain-level redirect); product decisions for Adam (NCAAF anytime-TD lane, any TD results block, `/winners` SSR summary, NBA/NHL/NCAAB in tabs/sitemap, per-game X links); next reporting window (`--week 2026-09-14` on or after 2026-09-28 for a complete 7-day return window; 4-week comparison 2026-10-14; 28-day GSC comparison after Google recrawls) and the exact manual commands; explicit statement that no monitoring was scheduled.
- [ ] Commit with pathspec; push; then write Adam's final message in the six-point shape from spec §11.

---

## Self-review

- **Spec coverage:** §5.1-5.9 → Tasks 6, 7, 8, 10, 11, 13, 19, 26 (5.8 crawl stats in 26; 5.9 in 26). §6.1-6.9 → Tasks 1, 3, 4, 5, 20 (6.9 documented in 20). §7.1-7.7 → Tasks 2, 3, 4, 6, 7, 8, 9, 14, 25 (7.7 documented in 19/28; no data rewrite). §8.1-8.10 → Tasks 15, 16, 17, 21, 27. §9.1-9.7 → Tasks 21 (9.1), 22 (9.2-9.4, 9.6, 9.7), 14 (9.5). §10 → Tasks 18, 24, 25. §11 → Tasks 19-23, 28.
- **Placeholders:** none; every code step has the code; doc tasks specify sections, sources and columns.
- **Type consistency:** `isMlbHomeRun`/`isNflAnytimeTdPick` (Task 1) used in Tasks 3, 8; `WinnersInvitation` (Task 2) used in 3, 4, 6, 7, 8, 9; `PROP_LANES`/`propLaneState` (Task 3) used in 4; `ArchiveDateSummary.publishedAt` optional (Task 13) so earlier fixtures compile; `hasInternalAnalyticsCookie` (Task 15) used in `get`/`c` routes; `logPaywallViewed` (Task 16) used in `PricingPlans`; `LinkClickRow` + 4th parameter (Task 17) used by the script.
