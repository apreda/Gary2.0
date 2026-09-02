/**
 * THE PROPS BRAIN — one call over the complete desk + THE PROP BOARD
 * (spec docs/superpowers/specs/2026-07-26-props-desk.md).
 *
 * Brain: the props desk model (codex-gpt-5.6-sol via plist; Gemini retired Aug 24 2026 —
 * props off Sol's $5/$30; Sol stays reserved for game picks), with 3.1 Pro
 * as the quota/provider fallback. Sessions route through the sessionManager
 * provider seam, so the model is config, not plumbing.
 *
 * MLB props read the SAME desk game picks read (buildMlbDesk) — lines, stakes,
 * world, matchup lab, WIRE, TAPE, lineups — plus tonight's real prop prices.
 * No tools, no research assistant; the picks are a pure function of the desk.
 *
 * Rails unchanged (prevent fabrication, never detect-and-ship): statAudit +
 * count-claim rail per pick, ONE corrective retry, then the failing picks are
 * dropped individually. Odds/no-stats/cap gates live in the CLI chassis.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { buildMlbDesk, fetchTonightsGameCall } from './mlbDesk.js';
import { buildPropSheets } from './propSheets.js';
import { screenBoard, lineupRates } from './propModel.js';
import { PROPS_DESK_MODEL, LEGACY_BRAIN_FALLBACK, DESK_FALLBACK_MODELS, DESK_COST_PER_M } from '../agentic/orchestrator/orchestratorConfig.js';
import { createModelSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { normalizePropBetDirection } from '../agentic/propsSharedUtils.js';
import { auditPickRationale, auditCountClaims, buildStatAuditRetryMessage } from '../agentic/orchestrator/statAudit.js';
import { ballDontLieService } from '../ballDontLieService.js';
import { propOddsService } from '../propOddsService.js';

// ═══════════════════════════════════════════════════════════════════════════
// THE ZERO-BASED PROMPT SURFACE — same entry rule as garyBrain (Jul 26 2026):
// a sentence exists here only if it is (a) something a frontier model cannot
// know — product contracts, our environment, today's date — or (b) a law the
// founder has set. The desk is the system; this is the contract around it.
// ═══════════════════════════════════════════════════════════════════════════

export const buildGaryPropsSystemPrompt = (dateLong) => `Today is ${dateLong}. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the desk is current.

Each prop you take publishes as its own card with its own "Gary's Take" — the reasoning is yours. No emojis. Never mention data feeds, tools, or missing data.`;

export const THE_PROPS_ASK = `Pick the prop bets you want from tonight's board — an empty list means you pass this game.

Injuries: an absence already games old is already in the price and in the team's recent results; fresh news — today's scratch — is the exception.

Output:

\`\`\`json
{ "picks": [ { "player": "[full name]", "team": "[team]", "prop_type": "[key from the board]", "line": 1.5, "bet": "over", "odds": "[exact odds]", "confidence_score": 0.XX, "rationale": "Gary's Take\\n\\n[the prose]" } ] }
\`\`\`

bet is "over" or "under" — "over" for one-priced lines.
confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.`;

const norm = (s) => String(s || '').toLowerCase().trim();
const fmtOdds = (v) => (v == null ? null : (v > 0 ? `+${v}` : `${v}`));

// Prompt-era fingerprint (Jul 29) — template hash, date placeholder; moves
// when the contract wording moves AND (Sep 2 2026, the Aug 19 ledger law)
// when the desk surface the props brain reads moves: the board and the prop
// sheets are what Gary prices from, so an edit there is a new era.
const here = path.dirname(fileURLToPath(import.meta.url));
const propsSurface = () => ['propSheets.js', 'propModel.js'].map((f) => {
  try { return readFileSync(path.join(here, f), 'utf8'); }
  catch { return `missing:${f}`; }
}).join('\n⸻\n');
export const PROPS_PROMPT_SHA = createHash('sha256')
  .update(buildGaryPropsSystemPrompt('{date}') + THE_PROPS_ASK + '\n⸻\n' + propsSurface())
  .digest('hex')
  .slice(0, 12);

// ── Cleared counts (founder, Jul 27) ────────────────────────────────────────
// Each board line carries how often the player actually went over that exact
// line recently — a PAST-TENSE COUNT ("in 6 of his last 15"), never a rate or
// percentage: tonight's matchup stays the frame, history stays history.

/** IP string ("6.2" = 6⅔) → recorded outs. */
const ipToOuts = (ip) => {
  if (ip == null) return null;
  const [whole, frac] = String(ip).split('.');
  const w = parseInt(whole, 10);
  if (!Number.isFinite(w)) return null;
  return w * 3 + (parseInt(frac || '0', 10) || 0);
};

/** The box-score value a prop type settles on, from one chrono stat row. */
export function statForProp(row, propType) {
  const t = norm(propType);
  const n = (v) => (v == null ? null : Number(v));
  switch (t) {
    case 'hits': return n(row.hits);
    case 'total_bases': return n(row.total_bases);
    case 'home_runs': case 'first_home_run': return n(row.hr);
    case 'rbis': return n(row.rbi);
    case 'runs_scored': return n(row.runs);
    case 'walks': return n(row.bb);
    case 'strikeouts': return n(row.k);
    case 'doubles': return n(row.doubles);
    case 'triples': return n(row.triples);
    case 'stolen_bases': return n(row.stolen_bases);
    case 'singles': {
      const h = n(row.hits);
      if (h == null) return null;
      return h - (n(row.doubles) || 0) - (n(row.triples) || 0) - (n(row.hr) || 0);
    }
    case 'hits_runs_rbis': {
      const h = n(row.hits), r = n(row.runs), rb = n(row.rbi);
      if (h == null && r == null && rb == null) return null;
      return (h || 0) + (r || 0) + (rb || 0);
    }
    case 'runs_rbis': {
      const r = n(row.runs), rb = n(row.rbi);
      if (r == null && rb == null) return null;
      return (r || 0) + (rb || 0);
    }
    case 'extra_base_hits': {
      const d = n(row.doubles), tr = n(row.triples), hr = n(row.hr);
      if (d == null && tr == null && hr == null) return null;
      return (d || 0) + (tr || 0) + (hr || 0);
    }
    case 'pitcher_strikeouts': return n(row.p_k);
    case 'pitcher_outs': return ipToOuts(row.ip);
    case 'pitcher_hits_allowed': return n(row.p_hits);
    case 'pitcher_walks': return n(row.p_bb);
    case 'pitcher_earned_runs': return n(row.er);
    default: return null;
  }
}

const HITTER_WINDOW = 15;
const PITCHER_WINDOW = 8;
const MIN_SAMPLES = 5;

/**
 * "in 6 of his last 15" (hitters) / "in 4 of his last 8 starts" (pitchers) —
 * or null when the sample is too thin to say anything.
 */
export function clearedClause(chronoRows, propType, line) {
  if (!Array.isArray(chronoRows) || !chronoRows.length || line == null) return null;
  const isPitcherProp = norm(propType).startsWith('pitcher_');
  const played = isPitcherProp
    ? chronoRows.filter((r) => r?.ip != null && parseFloat(r.ip) > 0)
    : chronoRows.filter((r) => r?.at_bats != null);
  const window = played.slice(-(isPitcherProp ? PITCHER_WINDOW : HITTER_WINDOW));
  const vals = window.map((r) => statForProp(r, propType)).filter((v) => v != null);
  if (vals.length < MIN_SAMPLES) return null;
  const cleared = vals.filter((v) => v > Number(line)).length;
  return isPitcherProp
    ? `over in ${cleared} of his last ${vals.length} starts`
    : `over in ${cleared} of his last ${vals.length}`;
}

// ═══ PROP BOARD V2 — the board presents MARKETS, not filtered scrape rows ═══
// (Aug 3 2026.) Measured that day: the legacy per-side odds window built a
// menu that was 58.6% over-only rows — 97% of one-sided rows were overs — so
// the documented over-bias was largely the MENU, not the brain. V2 rules:
//   - one row per player+prop_type: the two-sided market closest to even
//     money (preferring lines where both sides sit inside the bet window),
//     BOTH prices printed, sides always labeled — never a bare number;
//   - ladder rungs collapse into that primary market; a core player-prop
//     with no two-sided line anywhere is off the board (a market without an
//     opposing price cannot be price-checked);
//   - home runs are the sanctioned one-sided exception (the feed offers no
//     "no HR" side) — rungs print with an explicit "Over" label;
//   - the -200..+400 window moves layers: it was never wrong as a BET rule,
//     it was wrong as a BOARD rule. Bet permission = the CLI odds gate via
//     propOddsService.isOddsTakeable.

/** American odds → implied probability (vig included). */
const impliedProb = (odds) => {
  const o = Number(odds);
  if (!Number.isFinite(o) || o === 0) return null;
  return o > 0 ? 100 / (o + 100) : -o / (-o + 100);
};

const isHrType = (propType) => norm(propType).includes('home_run');

/**
 * Collapse market rows (player+prop_type+line, both sides priced when the
 * book offers both) to one primary market per player+prop_type.
 * Returns { rows, stats } — stats is the board-composition record stamped
 * onto stored picks so the ledger can segment board eras.
 *
 * `isFunLane` names the sport's sanctioned one-sided market family (MLB: home
 * runs; football: anytime TD) — the only markets whose yes-priced rungs stay
 * on the board without an opposing price.
 */
export function selectPrimaryMarkets(marketRows, { isFunLane = isHrType } = {}) {
  const pairs = new Map();
  for (const p of marketRows || []) {
    if (!p?.player || !p?.prop_type) continue;
    const key = `${norm(p.player)}|${norm(p.prop_type)}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(p);
  }

  const rows = [];
  let droppedOneSidedPairs = 0;
  let droppedNoTakeableSide = 0;
  for (const candidates of pairs.values()) {
    if (isFunLane(candidates[0].prop_type)) {
      // Fun-lane exception: every rung with a takeable yes-price stays.
      for (const c of candidates) {
        if (propOddsService.isOddsTakeable(c.over_odds, c.prop_type)) rows.push(c);
      }
      continue;
    }
    const twoSided = candidates.filter(c => c.over_odds != null && c.under_odds != null);
    if (!twoSided.length) { droppedOneSidedPairs++; continue; }
    // Tier 0 = both sides inside the bet window, tier 1 = one side, tier 2 =
    // neither. A tier-2 market has nothing Gary is allowed to bet (found on
    // real boards: stolen_bases "Over +1120 / Under -2300") — printing it only
    // invites picks the gate must kill, so it's off the board entirely.
    const tier = (c) => {
      const o = propOddsService.isOddsTakeable(c.over_odds, c.prop_type);
      const u = propOddsService.isOddsTakeable(c.under_odds, c.prop_type);
      return o && u ? 0 : (o || u) ? 1 : 2;
    };
    const ranked = twoSided.slice().sort((a, b) => {
      const at = tier(a), bt = tier(b);
      if (at !== bt) return at - bt;
      const aBal = Math.abs((impliedProb(a.over_odds) ?? 1) - (impliedProb(a.under_odds) ?? 1));
      const bBal = Math.abs((impliedProb(b.over_odds) ?? 1) - (impliedProb(b.under_odds) ?? 1));
      if (aBal !== bBal) return aBal - bBal;
      return Number(a.line) - Number(b.line);
    });
    if (tier(ranked[0]) === 2) { droppedNoTakeableSide++; continue; }
    rows.push(ranked[0]);
  }

  const twoSidedCount = rows.filter(r => r.over_odds != null && r.under_odds != null).length;
  const stats = {
    board_version: 2,
    markets: rows.length,
    two_sided: twoSidedCount,
    over_only: rows.filter(r => r.over_odds != null && r.under_odds == null).length,
    under_only: rows.filter(r => r.over_odds == null && r.under_odds != null).length,
    dropped_one_sided_pairs: droppedOneSidedPairs,
    dropped_no_takeable_side: droppedNoTakeableSide,
    two_sided_pct: rows.length ? Math.round((twoSidedCount / rows.length) * 100) : 0,
  };
  return { rows, stats };
}

/**
 * THE PROP BOARD — returns { text, players, stats }, fed by MARKET rows
 * (propOddsService.getMlbPlayerPropMarkets). The one and only board.
 * Sides are always labeled; a one-priced HR rung prints "Over +240", never a
 * bare "+240" that reads as the default bet.
 */
export function buildPropBoardV2(marketRows, {
  lineupNames = null,
  hrOnly = false,
  chronoByPlayer = null,
  // Sport hooks (football desk, Aug 20 2026) — every default is the exact MLB
  // behavior, so the MLB board is byte-identical with none of them passed.
  isFunLane = undefined,
  clearedClauseFor = null,
  headerLabel = `tonight's live prop prices`,
  excludedNote = `(Players not in tonight's lineups are off the board.)`,
} = {}) {
  let rows = (marketRows || []).filter(p => p?.player && p?.prop_type);
  if (hrOnly) rows = rows.filter(p => isHrType(p.prop_type));
  let excluded = 0;
  if (lineupNames && lineupNames.size) {
    const before = rows.length;
    rows = rows.filter(p => lineupNames.has(norm(p.player)));
    excluded = before - rows.length;
  }
  if (!rows.length) return { text: '', players: new Set(), stats: null };

  const { rows: primaries, stats } = selectPrimaryMarkets(rows, isFunLane ? { isFunLane } : {});

  const byPlayer = new Map();
  for (const p of primaries) {
    const over = fmtOdds(p.over_odds);
    const under = fmtOdds(p.under_odds);
    const price = over != null && under != null ? `Over ${over} / Under ${under}`
      : over != null ? `Over ${over}`
      : under != null ? `Under ${under}`
      : null;
    if (!price) continue;
    const key = norm(p.player);
    if (!byPlayer.has(key)) byPlayer.set(key, { player: p.player, team: p.team, entries: [] });
    const cleared = clearedClauseFor
      ? clearedClauseFor(key, p.prop_type, p.line)
      : (chronoByPlayer ? clearedClause(chronoByPlayer.get(key), p.prop_type, p.line) : null);
    byPlayer.get(key).entries.push(`${p.prop_type} ${p.line} (${price})${cleared ? ` — ${cleared}` : ''}`);
  }
  if (!byPlayer.size) return { text: '', players: new Set(), stats };

  const lines = [...byPlayer.values()]
    .sort((a, b) => a.player.localeCompare(b.player))
    .map(g => `  ${g.player}${g.team ? ` (${g.team})` : ''}: ${g.entries.join(' · ')}`);

  const note = excluded > 0 ? `\n${excludedNote}` : '';
  return {
    text: `═══ THE PROP BOARD (${headerLabel}) ═══\n${lines.join('\n')}${note}`,
    players: new Set(byPlayer.keys()),
    stats,
    // The priced markets themselves, for the menu snapshot. Tonight's prices
    // are the ONLY chance to record them — a book won't serve a settled
    // game's prop prices back, so anything not captured here is gone.
    markets: primaries,
  };
}


// ═══ THE SCREENED BOARD (Sep 2 2026) — the model's candidates as the menu ═══
// Founder: "do this system then for props" and "two per game is what we
// offer". THE PROP MODEL prices every primary market from the player's own
// numbers; the board Gary reads is the three the August replay's policy
// picks, each as ONE bet (the side the gap favors), best first. Both the
// model's number and the book's are stamped on the stored pick for the
// ledger — neither ever reaches the prompt. Gary reads the desk and the
// sheets, takes up to two, or passes.
//
// THE POLICY (validated on Aug 6 → Sep 1, positive in both halves and both
// model variants — see propModel.js): the favorite side priced -130..-200
// where the model sits 4+ points above the price, ranked by the gap; when
// that is thin, -129..+150 at 6+ points; never +151 or longer (the book's
// fattest edge, 7-11% lost in every slice); four market-sides that lost in
// both halves are off the menu; at most two markets per player.
export const SCREEN_CANDIDATES = 3;
export const SCREEN_FLOOR = 2;
const FAVORITE_BAND = { lo: -200, hi: -130, minGap: 0.04 };
const FILL_BAND = { lo: -129, hi: 150, minGap: 0.06 };
const MENU_BLOCKLIST = new Set(['singles under', 'total_bases under', 'pitcher_hits_allowed under', 'runs_scored under']);

export function selectCandidates(screened, { candidates = SCREEN_CANDIDATES, floor = SCREEN_FLOOR, perPlayer = 2 } = {}) {
  const inBand = (s, b) => Number(s.odds) >= b.lo && Number(s.odds) <= b.hi && s.edge >= b.minGap;
  const eligible = (screened || []).filter((s) => !isHrType(s.market.prop_type)
    && !MENU_BLOCKLIST.has(`${norm(s.market.prop_type)} ${s.side}`)
    && propOddsService.isOddsTakeable(s.odds, s.market.prop_type)
    && Number(s.odds) <= FILL_BAND.hi);
  const primary = eligible.filter((s) => inBand(s, FAVORITE_BAND));
  const fill = eligible.filter((s) => inBand(s, FILL_BAND));
  // The floor: two per game is the product, so on a flat board the next-best
  // takeable markets inside the window complete the pair.
  const rest = eligible.filter((s) => !primary.includes(s) && !fill.includes(s) && s.edge > 0);
  const out = [];
  const perPlayerCount = new Map();
  for (const s of [...primary, ...fill, ...rest]) {
    if (out.length >= candidates) break;
    if (rest.includes(s) && out.length >= floor) continue;
    const key = norm(s.market.player);
    if ((perPlayerCount.get(key) || 0) >= perPlayer) continue;
    perPlayerCount.set(key, (perPlayerCount.get(key) || 0) + 1);
    out.push(s);
  }
  return out;
}

/**
 * The candidate board text: one bet per line, in the policy's order (the
 * replay's edge sat mostly in the first line — the order is the product).
 */
export function buildScreenedBoard(candidates, { clearedClauseFor = null, headerLabel = `tonight's board` } = {}) {
  if (!candidates.length) return { text: '', players: new Set() };
  const sorted = candidates;
  const lines = sorted.map((s) => {
    const m = s.market;
    const cleared = clearedClauseFor ? clearedClauseFor(norm(m.player), m.prop_type, m.line) : null;
    return `  ${m.player}${m.team ? ` (${m.team})` : ''}: ${s.side.toUpperCase()} ${m.prop_type} ${m.line} (${fmtOdds(s.odds)})${cleared ? ` — ${cleared}` : ''}`;
  });
  return {
    text: `═══ THE PROP BOARD (${headerLabel}) ═══\n${lines.join('\n')}`,
    players: new Set(sorted.map((s) => norm(s.market.player))),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE MENU SNAPSHOT (founder, Aug 5 2026: "very few have odds"). The recap's
// bullets may carry a price ONLY where that price is in the evidence, and the
// only prices we stored were Gary's own picks — so a bullet about a prop he
// passed on ("Austin Riley HR, 2 RBI") could never show what it paid. The
// board already holds every market's live price and then drops it. This keeps
// the menu, once per game, at seal time. Fail-soft by contract: a snapshot
// that doesn't write must never cost a props run.
// ═══════════════════════════════════════════════════════════════════════════
const MENU_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const MENU_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export async function snapshotPropMenu({ markets, matchup, gameId, gameDate, league = 'MLB' }) {
  if (!MENU_URL || !MENU_KEY || !Array.isArray(markets) || !markets.length || gameId == null) return;
  try {
    let rows = markets.map((m) => ({
      player: m.player, team: m.team ?? null, prop_type: m.prop_type,
      line: m.line, over: m.over_odds ?? null, under: m.under_odds ?? null,
    }));

    // THE MENU ONLY GROWS (founder bug, Aug 6: a recap bullet said "Yohel
    // Pozo 1 HR, 1 RBI" with no price while the row above it wore +467).
    // The upsert REPLACES the row, and the HR lane (run-mlb-hr-picks.js,
    // hrOnly) builds a home-runs-only board — so whichever run fired last
    // owned the menu, and an HR run left the game with HR prices only:
    // three of today's six snapshots were 8/13/17 markets, one per player,
    // 100% home_runs, against 146-150 across 15 market types for the rest.
    // Union with whatever is already stored (fresh prices win on a repeat
    // key), so no partial board can ever shrink a fuller one.
    let existingId = null;
    try {
      const prior = await fetch(
        `${MENU_URL}/rest/v1/prop_menu?select=id,markets&league=eq.${encodeURIComponent(league)}`
          + `&bdl_game_id=eq.${encodeURIComponent(gameId)}`,
        { headers: { apikey: MENU_KEY, Authorization: `Bearer ${MENU_KEY}` } },
      );
      if (prior.ok) {
        const existingRow = (await prior.json())?.[0];
        existingId = existingRow?.id ?? null;
        const existing = existingRow?.markets;
        if (Array.isArray(existing) && existing.length) {
          const key = (m) => `${String(m.player).toLowerCase()}|${m.prop_type}|${m.line}`;
          const merged = new Map(existing.map((m) => [key(m), m]));
          for (const m of rows) merged.set(key(m), m);   // fresher price wins
          rows = [...merged.values()];
        }
      }
    } catch { /* fail-soft: a merge that can't read just writes this board */ }

    const endpoint = existingId == null
      ? `${MENU_URL}/rest/v1/prop_menu`
      : `${MENU_URL}/rest/v1/prop_menu?id=eq.${encodeURIComponent(existingId)}`;
    const res = await fetch(endpoint, {
      method: existingId == null ? 'POST' : 'PATCH',
      headers: {
        apikey: MENU_KEY, Authorization: `Bearer ${MENU_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        game_date: gameDate, league, matchup,
        bdl_game_id: gameId ?? null, markets: rows,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn(`   [Props Brain] menu snapshot skipped (${res.status}${detail ? `: ${detail}` : ''})`);
      return;
    }
    console.log(`   [Props Brain] menu snapshot: ${rows.length} priced markets` + `${markets.length !== rows.length ? ` (${markets.length} this board, merged with stored)` : ''}`);
  } catch (e) {
    console.warn(`   [Props Brain] menu snapshot failed: ${e?.message || e}`);
  }
}

const parsePicksJson = (t) => {
  try {
    const m = String(t || '').match(/```json\s*([\s\S]*?)```/i) || String(t || '').match(/(\{[\s\S]*\})/);
    const o = JSON.parse(m[1]);
    return Array.isArray(o.picks) ? o : null;
  } catch { return null; }
};

const todayLong = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York',
});
export { todayLong };

/**
 * ONE props desk brain pass over a finished desk+board user message — the
 * shared core of every props desk lane (MLB since Jul 26 2026, football since
 * Aug 20 2026). Owns: session creation, JSON parse + one re-ask, the statAudit
 * rail with ONE corrective retry then per-pick drops, the subscription-first
 * model cascade with overload retries, and the responder stamp. Sport adapters
 * own everything upstream (desk text, board, validation) and downstream (pick
 * mapping, lane stamps).
 */
export async function runPropsDeskBrain({ systemPrompt, userMessage, corpus, recentScores = null }) {
  // Rail: audit every pick's rationale against the desk+board corpus; on any
  // issue, ONE corrective retry for the full set, then drop failing picks.
  const auditOne = (rationale) => {
    const a = auditPickRationale({ rationale }, corpus);
    const c = recentScores ? auditCountClaims(rationale, recentScores) : [];
    return { issues: [...a.retryable, ...c], warnings: a.warnOnly?.length ? a.warnOnly : null };
  };

  // One full props pass on one model. Invalid output is a provider failure,
  // not an organic pass, so it must enter the same cascade as quota/network
  // failures after the one repair request is exhausted.
  const runPropsPass = async (modelName) => {
    const session = await createModelSession({
      modelName,
      systemPrompt,
      tools: [],
      thinkingLevel: 'xhigh',
    });

    const usage = { in: 0, out: 0 };
    const bump = (res) => { usage.in += res.usage?.prompt_tokens || 0; usage.out += res.usage?.completion_tokens || 0; };

    let res = await sendToSessionWithRetry(session, userMessage, {});
    bump(res);
    let parsed = parsePicksJson(res.content);
    if (!parsed) {
      res = await sendToSessionWithRetry(session, 'Return your final JSON now.', {});
      bump(res);
      parsed = parsePicksJson(res.content);
      if (!parsed) throw new Error('parse: no valid picks JSON after re-ask');
    }
    let explicitPass = parsed.picks.length === 0;

    let audits = parsed.picks.map(p => auditOne(p.rationale));
    if (audits.some(a => a.issues.length)) {
      const allIssues = audits.flatMap(a => a.issues);
      console.warn(`   [Rail] ${allIssues.length} issue(s) across ${audits.filter(a => a.issues.length).length} pick(s) — one corrective retry`);
      res = await sendToSessionWithRetry(session, buildStatAuditRetryMessage(allIssues), {});
      bump(res);
      const rp = parsePicksJson(res.content);
      if (rp) {
        parsed = rp;
        explicitPass = parsed.picks.length === 0;
        audits = parsed.picks.map(p => auditOne(p.rationale));
      }
      const keep = parsed.picks.filter((_, i) => !audits[i].issues.length);
      if (keep.length !== parsed.picks.length) {
        console.warn(`   [Rail] dropped ${parsed.picks.length - keep.length} pick(s) that failed statAudit after retry`);
      }
      parsed = { ...parsed, picks: keep };
      audits = audits.filter(a => !a.issues.length);
    }

    const [inRate, outRate] = DESK_COST_PER_M[modelName] || [0, 0];
    const cost = (usage.in * inRate + usage.out * outRate) / 1e6;
    console.log(`   [Props Brain] one call (${modelName}), ${usage.in.toLocaleString()} in / ${usage.out.toLocaleString()} out ≈ $${cost.toFixed(3)} — ${parsed.picks.length} pick(s)`);
    return { parsed, audits, usage, explicitPass };
  };

  // Match the game-desk resilience policy: subscription primary, the other
  // subscription provider, then the remaining desk fallbacks. De-duplicate so
  // an override can never retry the same exhausted model under another slot.
  const cascade = [...new Set([PROPS_DESK_MODEL, ...DESK_FALLBACK_MODELS, LEGACY_BRAIN_FALLBACK])];
  // RESPONDER STAMP + OVERLOAD RETRY (founder GO, Aug 12): mirrors the game
  // lane. Server-busy errors retry the SAME brain before cascading (a 529 is
  // not a cap), and the brain that actually answered stamps every pick — a
  // props cascade was invisible in the ledger before this.
  const isOverloaded = (err) => err?.isOverloaded === true
    || (!err?.isQuotaError && /overloaded|\b(?:529|503|502)\b/i.test(err?.message || ''));
  const OVERLOAD_RETRIES = 2;
  const OVERLOAD_BACKOFF_MS = process.env.VITEST ? [0, 0] : [30_000, 60_000];
  let pass = null;
  let respondingModel = null;
  cascadeLoop: for (let i = 0; i < cascade.length; i++) {
    for (let attempt = 0; ; attempt++) {
      try {
        pass = await runPropsPass(cascade[i]);
        respondingModel = cascade[i];
        if (i > 0) console.warn(`   [Props Brain] FALLBACK brain produced this pass: ${cascade[i]}`);
        break cascadeLoop;
      } catch (err) {
        if (isOverloaded(err) && attempt < OVERLOAD_RETRIES) {
          const waitMs = OVERLOAD_BACKOFF_MS[attempt] ?? 60_000;
          console.warn(`   [Props Brain] ${cascade[i]} overloaded (server-side, attempt ${attempt + 1}/${OVERLOAD_RETRIES + 1}) — retrying the same brain in ${Math.round(waitMs / 1000)}s`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        const reason = err?.isQuotaError ? 'quota/429'
          : (isOverloaded(err) ? `overloaded after ${attempt + 1} attempts` : (err?.message || 'provider error'));
        if (i < cascade.length - 1) {
          console.warn(`   [Props Brain] ${cascade[i]} failed (${reason}) — cascading to ${cascade[i + 1]}`);
          continue cascadeLoop;
        }
        console.error(`   [Props Brain] ${cascade[i]} failed (${reason}) — cascade exhausted`);
        throw err; // props CLI's per-game catch owns the miss, unchanged
      }
    }
  }
  return { ...pass, respondingModel };
}

/** Names from the exact BDL + official-MLB fallback lineups the desk resolved. */
export function resolvedConfirmedLineupNames(scout) {
  const lineups = scout?.confirmedLineups;
  if (!lineups) return null;
  const names = new Set();
  for (const side of [lineups.home, lineups.away]) {
    for (const batter of side?.batters || []) {
      if (batter?.name) names.add(norm(batter.name));
    }
    if (side?.pitcher?.name) names.add(norm(side.pitcher.name));
  }
  return names.size ? names : null;
}

/**
 * The MLB props brain. Returns { picks, validatedPlayers } in the props CLI's
 * existing mapping shape — the chassis (gates, caps, HR routing, store) does
 * not change.
 */
export async function analyzeMlbPropsDesk(game, playerProps, options = {}) {
  // Resolve the desk first, once. Its scout owns the canonical confirmed
  // lineup after combining BDL with the official MLB Stats API fallback.
  const desk = await buildMlbDesk(game, options);
  const lineupNames = resolvedConfirmedLineupNames(desk.scout);
  if (!lineupNames) {
    throw new Error('MLB props desk returned no resolved confirmed lineup');
  }

  // Cleared-count source: each board player's chrono game log (cached, one
  // request per player). A failed fetch just drops that player's counts.
  const chronoByPlayer = new Map();
  {
    const season = new Date().getFullYear();
    const wanted = new Map(); // normName -> player_id
    for (const p of playerProps || []) {
      const key = norm(p?.player);
      if (!key || p?.player_id == null) continue;
      if (lineupNames && lineupNames.size && !lineupNames.has(key)) continue;
      if (!wanted.has(key)) wanted.set(key, p.player_id);
    }
    await Promise.all([...wanted.entries()].map(async ([key, pid]) => {
      try {
        const rows = await ballDontLieService.getMlbPlayerGameRowsChrono(pid, season);
        if (Array.isArray(rows) && rows.length) chronoByPlayer.set(key, rows);
      } catch { /* counts are optional */ }
    }));
  }

  // BOARD V2 IS PRODUCTION (cutover Aug 3 2026, founder's "right now"):
  // playerProps arrive as MARKET rows (propOddsService.getMlbPlayerPropMarkets).
  // One board, one system (founder, Aug 3: the legacy board and its A/B
  // harness are deleted — no side-by-side, no old parts).
  const validatedPlayers = new Set(chronoByPlayer.keys());
  const statsBackedProps = (playerProps || []).filter((prop) => validatedPlayers.has(norm(prop?.player)));
  const board = buildPropBoardV2(statsBackedProps, { lineupNames, hrOnly: !!options.hrOnly, chronoByPlayer });
  if (!board.players.size) {
    throw new Error('MLB props board has no lineup-confirmed player with successfully fetched stats');
  }

  const { homeTeam, awayTeam } = desk.meta;
  const lineups = desk.scout?.confirmedLineups || null;

  // THE PROP MODEL screen (Sep 2 2026): the candidates become the board Gary
  // reads; the full board still feeds the menu snapshot. ON since the August
  // replay cleared the policy (Sep 2 evening); GARY_PROPS_SCREEN=0 restores
  // the full sheets board for a controlled read. board_version 4 = screened.
  const useScreen = !options.hrOnly && process.env.GARY_PROPS_SCREEN !== '0';
  let readBoard = board;
  let candidates = [];
  const screenByKey = new Map();
  if (useScreen) {
    const opposingRowsFor = (key) => {
      const pitchOf = (side) => norm(side?.pitcher?.name);
      const opp = pitchOf(lineups?.home) === key ? lineups?.away : pitchOf(lineups?.away) === key ? lineups?.home : null;
      if (!opp) return null;
      return lineupRates((opp.batters || []).map((b) => chronoByPlayer.get(norm(b?.name))).filter(Boolean));
    };
    const slotByName = new Map();
    for (const side of [lineups?.home, lineups?.away]) for (const b of side?.batters || []) if (b?.name && b?.battingOrder != null) slotByName.set(norm(b.name), Number(b.battingOrder));
    const screened = screenBoard(board.markets, {
      asOf: null,
      rowsFor: (k) => chronoByPlayer.get(k),
      lineupFor: opposingRowsFor,
      slotFor: (k) => slotByName.get(k) ?? null,
    });
    candidates = selectCandidates(screened);
    candidates.forEach((s, i) => screenByKey.set(`${norm(s.market.player)}|${norm(s.market.prop_type)}|${s.side}`, { ...s, rank: i + 1 }));
    const screenedBoard = buildScreenedBoard(candidates, {
      clearedClauseFor: (key, propType, line) => clearedClause(chronoByPlayer.get(key), propType, line),
    });
    if (screenedBoard.players.size) {
      readBoard = { ...board, text: screenedBoard.text, players: screenedBoard.players };
      console.log(`   [Props Brain] screen: ${candidates.length} candidates of ${screened.length} priced markets (gaps ${candidates.map((c) => (100 * c.edge).toFixed(0) + '%').join(' ')})`);
    }
  }

  // THE PROP SHEETS (Sep 2 2026): every board player's own numbers against
  // his markets — the evidence a prop decision needs that the game desk
  // never carried. Board version 3 = board + sheets; 4 = the screened board.
  const sheetPlayers = readBoard.players;
  const sheets = buildPropSheets({
    markets: board.markets.filter((m) => sheetPlayers.has(norm(m.player))),
    chronoByPlayer,
    lineups,
    homeTeam,
    awayTeam,
  });
  if (sheets.players && board.stats) board.stats.board_version = readBoard === board ? 3 : 4;

  await snapshotPropMenu({
    markets: board.markets,
    matchup: `${awayTeam} @ ${homeTeam}`,
    gameId: game.bdl_game_id ?? game.id,
    gameDate: new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
  });

  // GARY'S GAME CALL (founder GO, Aug 4 — the Seymour/Luzardo autopsies: the
  // two desks kept telling opposite stories about the same night). The game
  // pick publishes before props run (scheduler: picks → props per game), so
  // the published call rides the props desk as DATA. Absent when no pick
  // stored — fail-soft, section simply doesn't print.
  let gameCall = '';
  try {
    const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const call = await fetchTonightsGameCall(todayEt, game.bdl_game_id ?? game.id);
    if (call?.pick) {
      gameCall = `\n\n═══ GARY'S GAME CALL — this game, already published ═══\n${call.pick}\n\n${call.rationale}`;
    }
  } catch { /* the desk simply carries no call */ }

  const sheetsBlock = sheets.text ? `\n\n${sheets.text}` : '';
  const userMessage = `## THE DESK — ${awayTeam} @ ${homeTeam}\n\n${desk.deskText}${gameCall}\n\n${readBoard.text}${sheetsBlock}\n\n${THE_PROPS_ASK}`;

  const { parsed, audits, usage, explicitPass, respondingModel } = await runPropsDeskBrain({
    systemPrompt: buildGaryPropsSystemPrompt(todayLong()),
    userMessage,
    corpus: [{ content: `${desk.deskText}${gameCall}\n${readBoard.text}${sheetsBlock}` }],
    recentScores: desk.recentScores || null,
  });

  const picks = parsed.picks.map((p, i) => ({
    player: p.player,
    team: p.team ?? null,
    prop: String(p.prop_type || '').trim(),
    line: p.line != null ? p.line : null,
    bet: normalizePropBetDirection(p.bet),
    odds: p.odds != null ? String(p.odds) : null,
    confidence: p.confidence_score ?? null,
    rationale: p.rationale,
    prompt_sha: PROPS_PROMPT_SHA,
    // Which brain produced this pick — the responder, never the config
    // (Aug 12; same truth-stamp as the game lane's Aug 10 fix).
    model: respondingModel,
    // HR SPLIT (founder GO, Aug 4): HR picks are the fun lane — they live in
    // HR Threats and the Billfold fun tracker, and NEVER count in Gary's
    // prop record, balance, or metrics. Same definition as prop_lane_ledger's
    // lane case, stamped at generation so every surface reads one field.
    lane: /home_run/i.test(String(p.prop_type || '')) ? 'HR' : 'CORE',
    // Board-composition stamp (V2 boards only) — lets the ledger segment
    // board eras without a prompt change. Public names: stripInternalFields
    // drops _-prefixed keys at the storage boundary.
    ...(board.stats ? { board_version: board.stats.board_version, board_two_sided_pct: board.stats.two_sided_pct } : {}),
    // THE PROP MODEL's numbers for the ledger (never shown to Gary): the
    // model's chance for the side taken, the vig-free price, and the gap.
    ...(() => {
      const s = screenByKey.get(`${norm(p.player)}|${norm(p.prop_type)}|${normalizePropBetDirection(p.bet)}`);
      return s ? { screen_p: Number(s.pModel.toFixed(3)), price_p: Number(s.pMarket.toFixed(3)), screen_gap: Number(s.edge.toFixed(3)), screen_rank: s.rank } : {};
    })(),
    _statAuditWarnings: audits[i]?.warnings ?? null,
  }));

  return {
    picks,
    explicitPass,
    validatedPlayers,
    _usage: usage,
  };
}
