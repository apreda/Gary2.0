/**
 * THE PROPS BRAIN — one Sol xhigh call over the complete desk + THE PROP BOARD
 * (spec docs/superpowers/specs/2026-07-26-props-desk.md).
 *
 * MLB props read the SAME desk game picks read (buildMlbDesk) — lines, stakes,
 * world, matchup lab, WIRE, TAPE, lineups — plus tonight's real prop prices.
 * No tools, no research assistant; the picks are a pure function of the desk.
 *
 * Rails unchanged (prevent fabrication, never detect-and-ship): statAudit +
 * count-claim rail per pick, ONE corrective retry, then the failing picks are
 * dropped individually. Odds/no-stats/cap gates live in the CLI chassis.
 */
import { buildMlbDesk } from './mlbDesk.js';
import { GAME_PICK_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';
import { createOpenAISession, sendToOpenAISession } from '../agentic/orchestrator/providerAdapters/openaiSession.js';
import { auditPickRationale, auditCountClaims, buildStatAuditRetryMessage } from '../agentic/orchestrator/statAudit.js';
import { ballDontLieService } from '../ballDontLieService.js';

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
confidence_score (0.50–1.00): how strongly your read beats this price.`;

const norm = (s) => String(s || '').toLowerCase().trim();
const fmtOdds = (v) => (v == null ? null : (v > 0 ? `+${v}` : `${v}`));

/**
 * THE PROP BOARD — tonight's real prop prices, grouped by player, prop keys
 * printed verbatim so picks reference exactly what the odds gate verifies.
 * When lineups are posted, only players in them render (starters + probables):
 * a scratched player's props never reach the board.
 * Returns { text, players } — players is the validated pool (normalized names).
 */
export function buildPropBoard(playerProps, { lineupNames = null, hrOnly = false } = {}) {
  let rows = (playerProps || []).filter(p => p?.player && p?.prop_type);
  if (hrOnly) rows = rows.filter(p => norm(p.prop_type).includes('home_run'));
  let excluded = 0;
  if (lineupNames && lineupNames.size) {
    const before = rows.length;
    rows = rows.filter(p => lineupNames.has(norm(p.player)));
    excluded = before - rows.length;
  }
  if (!rows.length) return { text: '', players: new Set() };

  const byPlayer = new Map();
  for (const p of rows) {
    const key = norm(p.player);
    if (!byPlayer.has(key)) byPlayer.set(key, { player: p.player, team: p.team, entries: [] });
    const over = fmtOdds(p.over_odds);
    const under = fmtOdds(p.under_odds);
    const price = under != null ? `Over ${over} / Under ${under}` : `${over}`;
    byPlayer.get(key).entries.push(`${p.prop_type} ${p.line} (${price})`);
  }

  const lines = [...byPlayer.values()]
    .sort((a, b) => a.player.localeCompare(b.player))
    .map(g => `  ${g.player}${g.team ? ` (${g.team})` : ''}: ${g.entries.join(' · ')}`);

  const note = excluded > 0 ? `\n(Players not in tonight's lineups are off the board.)` : '';
  return {
    text: `═══ THE PROP BOARD (tonight's live prop prices) ═══\n${lines.join('\n')}${note}`,
    players: new Set(byPlayer.keys()),
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
  const board = buildPropBoard(playerProps, { lineupNames, hrOnly: !!options.hrOnly });
  if (!board.players.size) {
    console.log('   [Props Brain] empty board after filters — pass');
    return { picks: [], validatedPlayers: board.players };
  }

  const desk = await buildMlbDesk(game, options);
  const { homeTeam, awayTeam } = desk.meta;

  const session = await createOpenAISession({
    modelName: GAME_PICK_MODEL,
    systemPrompt: buildGaryPropsSystemPrompt(todayLong()),
    tools: [],
    thinkingLevel: 'xhigh',
  });

  const userMessage = `## THE DESK — ${awayTeam} @ ${homeTeam}\n\n${desk.deskText}\n\n${board.text}\n\n${THE_PROPS_ASK}`;
  const usage = { in: 0, out: 0 };
  const bump = (res) => { usage.in += res.usage?.prompt_tokens || 0; usage.out += res.usage?.completion_tokens || 0; };

  let res = await sendToOpenAISession(session, userMessage, {});
  bump(res);
  let parsed = parsePicksJson(res.content);
  if (!parsed) {
    res = await sendToOpenAISession(session, 'Return your final JSON now.', {});
    bump(res);
    parsed = parsePicksJson(res.content);
    if (!parsed) return { error: 'parse: no valid picks JSON after re-ask', picks: [], validatedPlayers: board.players };
  }

  // Rail: audit every pick's rationale against the desk+board corpus; on any
  // issue, ONE corrective retry for the full set, then drop failing picks.
  const corpus = [{ content: `${desk.deskText}\n${board.text}` }];
  const auditOne = (rationale) => {
    const a = auditPickRationale({ rationale }, corpus);
    const c = desk.recentScores ? auditCountClaims(rationale, desk.recentScores) : [];
    return { issues: [...a.retryable, ...c], warnings: a.warnOnly?.length ? a.warnOnly : null };
  };
  let audits = parsed.picks.map(p => auditOne(p.rationale));
  if (audits.some(a => a.issues.length)) {
    const allIssues = audits.flatMap(a => a.issues);
    console.warn(`   [Rail] ${allIssues.length} issue(s) across ${audits.filter(a => a.issues.length).length} pick(s) — one corrective retry`);
    res = await sendToOpenAISession(session, buildStatAuditRetryMessage(allIssues), {});
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

  const cost = (usage.in * 5 + usage.out * 30) / 1e6;
  console.log(`   [Props Brain] one call, ${usage.in.toLocaleString()} in / ${usage.out.toLocaleString()} out ≈ $${cost.toFixed(3)} — ${parsed.picks.length} pick(s)`);

  const picks = parsed.picks.map((p, i) => ({
    player: p.player,
    team: p.team ?? null,
    prop: String(p.prop_type || '').trim(),
    line: p.line != null ? p.line : null,
    bet: norm(p.bet) === 'under' ? 'under' : 'over',
    odds: p.odds != null ? String(p.odds) : null,
    confidence: p.confidence_score ?? null,
    rationale: p.rationale,
    _statAuditWarnings: audits[i]?.warnings ?? null,
  }));

  return { picks, validatedPlayers: board.players, _usage: usage };
}
