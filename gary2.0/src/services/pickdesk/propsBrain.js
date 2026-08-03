/**
 * THE PROPS BRAIN — one call over the complete desk + THE PROP BOARD
 * (spec docs/superpowers/specs/2026-07-26-props-desk.md).
 *
 * Brain: gemini-3.6-flash at top thinking level (founder, Jul 29 2026 —
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
import { buildMlbDesk } from './mlbDesk.js';
import { GEMINI_PROPS_MODEL, GEMINI_PRO_FALLBACK, DESK_COST_PER_M } from '../agentic/orchestrator/orchestratorConfig.js';
import { createGeminiSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
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

The line is the market's opinion of tonight, not a measurement of it.

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
// only when the contract wording moves. Same scheme as garyBrain.PROMPT_SHA.
export const PROPS_PROMPT_SHA = createHash('sha256')
  .update(buildGaryPropsSystemPrompt('{date}') + THE_PROPS_ASK)
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

/**
 * THE PROP BOARD — tonight's real prop prices, grouped by player, prop keys
 * printed verbatim so picks reference exactly what the odds gate verifies.
 * When lineups are posted, only players in them render (starters + probables):
 * a scratched player's props never reach the board.
 * Returns { text, players } — players is the validated pool (normalized names).
 */
export function buildPropBoard(playerProps, { lineupNames = null, hrOnly = false, chronoByPlayer = null } = {}) {
  let rows = (playerProps || []).filter(p => p?.player && p?.prop_type);
  if (hrOnly) rows = rows.filter(p => norm(p.prop_type).includes('home_run'));
  let excluded = 0;
  if (lineupNames && lineupNames.size) {
    const before = rows.length;
    rows = rows.filter(p => lineupNames.has(norm(p.player)));
    excluded = before - rows.length;
  }
  if (!rows.length) return { text: '', players: new Set() };

  // The feed can deliver a market's over and under as SEPARATE rows (the
  // second row carries over_odds: null) — merge by player+type+line first so
  // the board prints one clean two-sided line, never a "null" price.
  const merged = new Map();
  for (const p of rows) {
    const mk = `${norm(p.player)}|${norm(p.prop_type)}|${p.line}`;
    const cur = merged.get(mk) || { ...p };
    if (cur.over_odds == null && p.over_odds != null) cur.over_odds = p.over_odds;
    if (cur.under_odds == null && p.under_odds != null) cur.under_odds = p.under_odds;
    merged.set(mk, cur);
  }

  const byPlayer = new Map();
  for (const p of merged.values()) {
    const over = fmtOdds(p.over_odds);
    const under = fmtOdds(p.under_odds);
    const price = over != null && under != null ? `Over ${over} / Under ${under}`
      : over != null ? `${over}`
      : under != null ? `Under ${under}`
      : null;
    if (!price) continue; // no priced side — nothing to bet, nothing to print
    const key = norm(p.player);
    if (!byPlayer.has(key)) byPlayer.set(key, { player: p.player, team: p.team, entries: [] });
    const cleared = chronoByPlayer ? clearedClause(chronoByPlayer.get(key), p.prop_type, p.line) : null;
    byPlayer.get(key).entries.push(`${p.prop_type} ${p.line} (${price})${cleared ? ` — ${cleared}` : ''}`);
  }
  if (!byPlayer.size) return { text: '', players: new Set() };

  const lines = [...byPlayer.values()]
    .sort((a, b) => a.player.localeCompare(b.player))
    .map(g => `  ${g.player}${g.team ? ` (${g.team})` : ''}: ${g.entries.join(' · ')}`);

  const note = excluded > 0 ? `\n(Players not in tonight's lineups are off the board.)` : '';
  return {
    text: `═══ THE PROP BOARD (tonight's live prop prices) ═══\n${lines.join('\n')}${note}`,
    players: new Set(byPlayer.keys()),
  };
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
 */
export function selectPrimaryMarkets(marketRows) {
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
    if (isHrType(candidates[0].prop_type)) {
      // Fun-lane exception: every HR rung with a takeable yes-price stays.
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
 * THE PROP BOARD V2 — same contract as buildPropBoard ({ text, players },
 * plus stats), fed by MARKET rows (propOddsService.getMlbPlayerPropMarkets).
 * Sides are always labeled; a one-priced HR rung prints "Over +240", never a
 * bare "+240" that reads as the default bet.
 */
export function buildPropBoardV2(marketRows, { lineupNames = null, hrOnly = false, chronoByPlayer = null } = {}) {
  let rows = (marketRows || []).filter(p => p?.player && p?.prop_type);
  if (hrOnly) rows = rows.filter(p => isHrType(p.prop_type));
  let excluded = 0;
  if (lineupNames && lineupNames.size) {
    const before = rows.length;
    rows = rows.filter(p => lineupNames.has(norm(p.player)));
    excluded = before - rows.length;
  }
  if (!rows.length) return { text: '', players: new Set(), stats: null };

  const { rows: primaries, stats } = selectPrimaryMarkets(rows);

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
    const cleared = chronoByPlayer ? clearedClause(chronoByPlayer.get(key), p.prop_type, p.line) : null;
    byPlayer.get(key).entries.push(`${p.prop_type} ${p.line} (${price})${cleared ? ` — ${cleared}` : ''}`);
  }
  if (!byPlayer.size) return { text: '', players: new Set(), stats };

  const lines = [...byPlayer.values()]
    .sort((a, b) => a.player.localeCompare(b.player))
    .map(g => `  ${g.player}${g.team ? ` (${g.team})` : ''}: ${g.entries.join(' · ')}`);

  const note = excluded > 0 ? `\n(Players not in tonight's lineups are off the board.)` : '';
  return {
    text: `═══ THE PROP BOARD (tonight's live prop prices) ═══\n${lines.join('\n')}${note}`,
    players: new Set(byPlayer.keys()),
    stats,
  };
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

/** Tonight's lineup + probable names (normalized) — null when not yet posted. */
async function fetchLineupNames(gameId) {
  if (!gameId) return null;
  try {
    const lu = await ballDontLieService.getMlbLineups(gameId);
    if (!lu) return null;
    const names = new Set();
    for (const side of Object.values(lu)) {
      for (const b of side?.batters || []) if (b?.name) names.add(norm(b.name));
      if (side?.pitcher?.name) names.add(norm(side.pitcher.name));
    }
    return names.size ? names : null;
  } catch { return null; }
}

/**
 * The MLB props brain. Returns { picks, validatedPlayers } in the props CLI's
 * existing mapping shape — the chassis (gates, caps, HR routing, store) does
 * not change.
 */
export async function analyzeMlbPropsDesk(game, playerProps, options = {}) {
  const gameId = game.bdl_game_id ?? game.id ?? null;
  const lineupNames = await fetchLineupNames(gameId);

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

  // Board builder seam: production defaults to the legacy board until the V2
  // cutover; the paired bench passes buildBoard: buildPropBoardV2 with market
  // rows so both arms run the REAL brain path.
  const board = (options.buildBoard ?? buildPropBoard)(playerProps, { lineupNames, hrOnly: !!options.hrOnly, chronoByPlayer });
  if (!board.players.size) {
    console.log('   [Props Brain] empty board after filters — pass');
    return { picks: [], validatedPlayers: board.players };
  }

  const desk = await buildMlbDesk(game, options);
  const { homeTeam, awayTeam } = desk.meta;

  const userMessage = `## THE DESK — ${awayTeam} @ ${homeTeam}\n\n${desk.deskText}\n\n${board.text}\n\n${THE_PROPS_ASK}`;

  // Rail: audit every pick's rationale against the desk+board corpus; on any
  // issue, ONE corrective retry for the full set, then drop failing picks.
  const corpus = [{ content: `${desk.deskText}\n${board.text}` }];
  const auditOne = (rationale) => {
    const a = auditPickRationale({ rationale }, corpus);
    const c = desk.recentScores ? auditCountClaims(rationale, desk.recentScores) : [];
    return { issues: [...a.retryable, ...c], warnings: a.warnOnly?.length ? a.warnOnly : null };
  };

  // One full props pass on one model. Contained parse failures return
  // { error }; provider/quota failures THROW so the cascade below owns them.
  const runPropsPass = async (modelName) => {
    const session = await createGeminiSession({
      modelName,
      systemPrompt: buildGaryPropsSystemPrompt(todayLong()),
      tools: [],
      thinkingLevel: modelName.startsWith('gemini') ? 'high' : 'xhigh',
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
      if (!parsed) return { error: 'parse: no valid picks JSON after re-ask' };
    }

    let audits = parsed.picks.map(p => auditOne(p.rationale));
    if (audits.some(a => a.issues.length)) {
      const allIssues = audits.flatMap(a => a.issues);
      console.warn(`   [Rail] ${allIssues.length} issue(s) across ${audits.filter(a => a.issues.length).length} pick(s) — one corrective retry`);
      res = await sendToSessionWithRetry(session, buildStatAuditRetryMessage(allIssues), {});
      bump(res);
      const rp = parsePicksJson(res.content);
      if (rp) {
        parsed = rp;
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
    return { parsed, audits, usage };
  };

  const cascade = [GEMINI_PROPS_MODEL, GEMINI_PRO_FALLBACK];
  let pass = null;
  for (let i = 0; i < cascade.length; i++) {
    try {
      pass = await runPropsPass(cascade[i]);
      if (i > 0) console.warn(`   [Props Brain] FALLBACK brain produced this pass: ${cascade[i]}`);
      break;
    } catch (err) {
      const reason = err?.isQuotaError ? 'quota/429' : (err?.message || 'provider error');
      if (i < cascade.length - 1) {
        console.warn(`   [Props Brain] ${cascade[i]} failed (${reason}) — cascading to ${cascade[i + 1]}`);
        continue;
      }
      console.error(`   [Props Brain] ${cascade[i]} failed (${reason}) — cascade exhausted`);
      throw err; // props CLI's per-game catch owns the miss, unchanged
    }
  }
  if (pass.error) return { error: pass.error, picks: [], validatedPlayers: board.players };
  const { parsed, audits, usage } = pass;

  const picks = parsed.picks.map((p, i) => ({
    player: p.player,
    team: p.team ?? null,
    prop: String(p.prop_type || '').trim(),
    line: p.line != null ? p.line : null,
    bet: norm(p.bet) === 'under' ? 'under' : 'over',
    odds: p.odds != null ? String(p.odds) : null,
    confidence: p.confidence_score ?? null,
    rationale: p.rationale,
    prompt_sha: PROPS_PROMPT_SHA,
    // Board-composition stamp (V2 boards only) — lets the ledger segment
    // board eras without a prompt change. Public names: stripInternalFields
    // drops _-prefixed keys at the storage boundary.
    ...(board.stats ? { board_version: board.stats.board_version, board_two_sided_pct: board.stats.two_sided_pct } : {}),
    _statAuditWarnings: audits[i]?.warnings ?? null,
  }));

  return { picks, validatedPlayers: board.players, _usage: usage };
}
