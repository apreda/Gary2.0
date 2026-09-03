/**
 * THE LATE-NEWS READER (founder, Sep 3 2026 — "your system has to be the
 * system you came up with in full"). The fourth tonight-fact for the
 * shadow model: what the official feeds cannot show. One LLM call with web
 * search reads the desk's press and injury material plus the last 24 hours
 * of reporting and emits TYPED FACTS ONLY — a closer ruled unavailable by
 * his manager, a starter on a stated pitch limit, an opener-and-bulk plan,
 * a regular scratched after the lineup posted, a weather threat — each
 * with a source. No opinions, no bet, no probability. The facts become
 * probability points through fixed weights the founder can turn.
 *
 * The LLM is the reader here, never the decider. Fail-soft: a failed call
 * is an empty fact list, never a blocked pick.
 */
import { codexCliOneShot } from '../agentic/orchestrator/providerAdapters/codexCliSession.js';
import { nameKey } from './marketModel.js';

export const NEWS_MODEL = process.env.GARY_SHADOW_NEWS_MODEL || 'gpt-5.6-sol';
export const NEWS_TIMEOUT_MS = Number(process.env.GARY_SHADOW_NEWS_TIMEOUT_MS) || 4 * 60 * 1000;

export const FACT_TYPES = ['closer_unavailable', 'reliever_unavailable', 'starter_pitch_limit', 'opener_bulk', 'starter_scratched', 'lineup_scratch', 'weather_risk', 'other'];

/** Points a fact costs its own club, before the news weight and confidence. */
export const FACT_POINTS = {
  closer_unavailable: 0.8,
  reliever_unavailable: 0.4,
  starter_pitch_limit: 1.0,
  opener_bulk: 1.0,
  starter_scratched: 1.0,
  lineup_scratch: 0.8,
  weather_risk: 0,
  other: 0,
};

const KEYWORDS = /scratch|unavailable|\bIL\b|injur|pitch (limit|count|cap)|limit|opener|bulk|rain|weather|postpone|delay|questionable|day-to-day|activated|optioned|recalled|placed on|ruled out|won'?t be available|not available|rest day|off day|resting|sore|tight|manager said|said/i;

/**
 * The desk trimmed to what a news reader needs: the storylines section in
 * full, plus every paragraph elsewhere that carries an availability word.
 * Capped so the call stays fast.
 */
export function sliceDeskForNews(deskText, { storyCap = 9000, paraCap = 9000 } = {}) {
  const text = String(deskText || '');
  if (!text) return '';
  let stories = '';
  const i = text.indexOf('— THE STORYLINES —');
  if (i >= 0) stories = text.slice(i, i + storyCap);
  const before = i >= 0 ? text.slice(0, i) : text;
  const paras = before.split(/\n\s*\n/).filter((p) => KEYWORDS.test(p));
  let picked = '';
  for (const p of paras) {
    if (picked.length + p.length > paraCap) break;
    picked += `${p.trim()}\n\n`;
  }
  return `${picked.trim()}${stories ? `\n\n${stories.trim()}` : ''}`.trim();
}

export const NEWS_CONTRACT = (homeTeam, awayTeam) => `{
  "facts": [
    {
      "club": "${homeTeam}|${awayTeam}",
      "type": "${FACT_TYPES.join('|')}",
      "player": "name or empty",
      "detail": "one line, what was reported",
      "source": "outlet or URL",
      "when": "date/time reported if known, or empty",
      "confidence": "high|medium|low"
    }
  ]
}`;

export function buildNewsAsk({ homeTeam, awayTeam, todayEt, deskSlice }) {
  return `You are a news reader for a baseball game tonight, ${todayEt}: ${awayTeam} at ${homeTeam}.

Report ONLY facts about availability for tonight that a betting line set earlier might not reflect, from the material below and from a web search of the last 24 hours. Typed facts only, each with a source. Do not guess, do not add opinion, do not say who will win. If nothing qualifies, return an empty list. A player who has been out for days is not news; a scratch, a stated pitch limit, an opener plan, a closer his manager said is down tonight, or a weather threat is.

## FROM THE DESK
${deskSlice || '(nothing flagged on the desk)'}

Output only this JSON, filled in:

\`\`\`json
${NEWS_CONTRACT(homeTeam, awayTeam)}
\`\`\``;
}

const line = (v, max = 300) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max));
const clubOf = (name, homeTeam, awayTeam) => {
  const k = nameKey(name);
  if (!k) return null;
  const h = nameKey(homeTeam);
  const a = nameKey(awayTeam);
  if (k === h || h.endsWith(k) || k.endsWith(h)) return 'home';
  if (k === a || a.endsWith(k) || k.endsWith(a)) return 'away';
  return null;
};

/** The model's text → normalized facts with a side ('home'|'away'); unknown clubs and types are dropped. */
export function parseNews(text, homeTeam, awayTeam) {
  const s = String(text || '');
  const m = s.match(/```json\s*([\s\S]*?)```/i) || s.match(/(\{[\s\S]*\})/);
  if (!m) return null;
  let o;
  try { o = JSON.parse(m[1]); } catch { return null; }
  const facts = [];
  for (const f of Array.isArray(o?.facts) ? o.facts : []) {
    const side = clubOf(f?.club, homeTeam, awayTeam);
    const type = FACT_TYPES.includes(String(f?.type || '').toLowerCase()) ? String(f.type).toLowerCase() : 'other';
    if (!side) continue;
    const conf = ['high', 'medium', 'low'].includes(String(f?.confidence || '').toLowerCase()) ? String(f.confidence).toLowerCase() : 'medium';
    facts.push({ side, type, player: line(f?.player, 80), detail: line(f?.detail), source: line(f?.source, 200), when: line(f?.when, 60), confidence: conf });
  }
  return { facts };
}

const confMul = { high: 1, medium: 0.75, low: 0.5 };

/**
 * Facts → points toward HOME (negative = toward away), with one driver per
 * counted fact. A fact already carried by the feeds is not counted twice:
 * a pen arm the pen builder marked down, a regular already listed missing,
 * a starter the leash feature already flagged.
 */
export function newsAdjustment(facts, features, weights = { news: 1.0 }) {
  const w = Number.isFinite(Number(weights?.news)) ? Number(weights.news) : 1.0;
  const drivers = [];
  let pts = 0;
  const perSide = { home: 0, away: 0 };
  for (const f of facts || []) {
    const base = FACT_POINTS[f.type] ?? 0;
    if (!base) continue;
    const side = f.side;
    const feat = features?.[side] || {};
    const pk = nameKey(f.player);
    if ((f.type === 'closer_unavailable' || f.type === 'reliever_unavailable') && pk && (feat.pen?.down || []).some((d) => nameKey(d).includes(pk))) continue;
    if (f.type === 'lineup_scratch' && pk && (feat.lineup?.missing || []).some((n) => nameKey(n) === pk)) continue;
    if ((f.type === 'starter_pitch_limit' || f.type === 'opener_bulk') && feat.leash?.short) continue;
    if (f.type === 'lineup_scratch' && perSide[side] >= 2 * FACT_POINTS.lineup_scratch) continue; // cap two scratches a side
    const cost = base * (confMul[f.confidence] ?? 0.75) * w;
    perSide[side] += cost;
    const signed = side === 'home' ? -cost : cost;
    pts += signed;
    drivers.push({ name: `${side} news: ${f.type.replace(/_/g, ' ')}`, pts: Math.round(signed * 10) / 10, detail: `${f.player ? `${f.player} — ` : ''}${f.detail}${f.source ? ` (${f.source})` : ''}` });
  }
  return { pts: Math.round(pts * 10) / 10, drivers };
}

/** Run the reader. Never throws: { facts, error?, ms }. */
export async function readLateNews({ homeTeam, awayTeam, todayEt, deskText }, { oneShot = codexCliOneShot } = {}) {
  const t0 = Date.now();
  try {
    const deskSlice = sliceDeskForNews(deskText);
    const res = await oneShot(buildNewsAsk({ homeTeam, awayTeam, todayEt, deskSlice }), {
      model: NEWS_MODEL, effort: 'medium', search: true, timeoutMs: NEWS_TIMEOUT_MS, breakerKey: 'codex-news',
    });
    if (!res?.success) return { facts: [], error: res?.error || 'no answer', ms: Date.now() - t0 };
    const parsed = parseNews(res.data, homeTeam, awayTeam);
    if (!parsed) return { facts: [], error: 'unparseable answer', ms: Date.now() - t0 };
    return { facts: parsed.facts, ms: Date.now() - t0 };
  } catch (e) {
    return { facts: [], error: e?.message || String(e), ms: Date.now() - t0 };
  }
}
