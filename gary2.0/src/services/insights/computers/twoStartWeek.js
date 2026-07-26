// gary2.0/src/services/insights/computers/twoStartWeek.js
//
// LANE: twoStartWeek  (category token: two_start_week) — MLB only.
// "Two-Start Week" — the season-long fantasy staple: starting pitchers with
// TWO POSTED probable starts in the coming scoring week (Mon-Sun ET). Managers
// set weekly lineups around these arms; every ESPN/Rotowire Sunday column
// leads with this list.
//
// GROUNDED — zero rotation inference: a start counts ONLY when MLB has posted
// the probable (schedule hydrate=probablePitcher). Early in the week the back
// half of next week is sparsely posted; the lane fills in across the day's
// runs as probables land (additive-freeze keeps what's posted).
//
// Sources:
//  • getMlbSchedule(date) [statsapi]: per-day games with
//    teams.{home,away}.probablePitcher {id, fullName} + officialDate.
//  • getPitcherXStats(season) [Savant]: xERA to tier the arms (missing xERA
//    → MATCHUP_CALL tier, and no xERA number appears in copy).
// Defensive: any fetch failure isolates to that day / that arm; returns [].

import { makeRow, TONES, clampScore, round, nameKey } from '../shared.js';
import { getMlbSchedule } from '../../mlbStatsApiService.js';
import { getPitcherXStats } from '../../baseballSavantService.js';
import { geminiService } from '../../geminiService.js';

const MAX_ARMS = 8;
const BASE_SCORE = 68;

function tierFor(xera) {
  if (!Number.isFinite(xera)) return 'MATCHUP_CALL';
  if (xera < 3.40) return 'PLAN_AROUND';
  if (xera < 4.20) return 'STREAM_BOTH';
  return 'MATCHUP_CALL';
}

const TIER_VERDICT = {
  PLAN_AROUND: 'Anchor your week around both starts.',
  STREAM_BOTH: 'Start him twice in standard leagues.',
  MATCHUP_CALL: 'Check the matchups before you commit to both.',
};

// ── ET date helpers ─────────────────────────────────────────────────────────
function etParts(d) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(d); // YYYY-MM-DD
}
function etWeekday(dateStr) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short',
  }).format(new Date(`${dateStr}T16:00:00Z`)); // noon ET — no midnight edge
}
function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

/** The next Mon-Sun ET scoring week strictly after today's ET date. */
export function nextScoringWeek(todayEt) {
  const base = new Date(`${todayEt}T16:00:00Z`);
  const dowFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  // walk forward 1..7 days to the first Monday
  let monday = null;
  for (let i = 1; i <= 7 && !monday; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    if (dowFmt.format(d) === 'Mon') monday = d;
  }
  const days = [];
  for (let i = 0; i < 7; i++) days.push(etParts(new Date(monday.getTime() + i * 86400000)));
  return days;
}

/**
 * Club display name: "Cleveland Guardians" -> "Guardians". NEVER a bare shared
 * mascot: "Chicago White Sox" -> "White Sox", "Boston Red Sox" -> "Red Sox",
 * "Toronto Blue Jays" -> "Blue Jays" (the Jul 9 grading bug class — "Sox"
 * alone is ambiguous between two teams).
 */
function clubName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length < 2) return fullName || '';
  const last = parts[parts.length - 1];
  if (last === 'Sox' || last === 'Jays') return parts.slice(-2).join(' ');
  return last;
}

export async function computeTwoStartWeek(ctx) {
  const { date, season, helpers } = ctx;
  const week = nextScoringWeek(date);

  // Per-day schedules; a failed day is skipped (a start can't be claimed
  // without its schedule row, so a partial week only UNDER-reports — never wrong).
  const byPitcher = new Map(); // id -> { name, teamName, starts: [{date, opp, home}] }
  for (const day of week) {
    let games = [];
    try { games = (await getMlbSchedule(day)) || []; }
    catch (err) { console.error(`[twoStartWeek] schedule ${day} error:`, err?.message || err); continue; }
    for (const g of games) {
      const dateStr = g?.officialDate || day;
      const sides = [
        { me: g?.teams?.home, opp: g?.teams?.away, home: true },
        { me: g?.teams?.away, opp: g?.teams?.home, home: false },
      ];
      for (const s of sides) {
        const p = s.me?.probablePitcher;
        if (!p?.id || !p?.fullName) continue;
        const entry = byPitcher.get(p.id) || {
          name: p.fullName, teamName: s.me?.team?.name || '', starts: [],
        };
        if (!entry.starts.some((st) => st.date === dateStr)) {
          entry.starts.push({ date: dateStr, opp: clubName(s.opp?.team?.name), home: s.home });
        }
        byPitcher.set(p.id, entry);
      }
    }
  }

  const twoStart = [...byPitcher.entries()].filter(([, v]) => v.starts.length >= 2);
  if (!twoStart.length) {
    console.log('[twoStartWeek] no two-start arms posted yet for the coming week.');
    return [];
  }

  // Savant xERA (optional tiering signal — missing is fine).
  let xByName = new Map();
  try {
    for (const r of (await getPitcherXStats(season)) || []) {
      const last = r?.last_name || '', first = r?.first_name || '';
      if (last) xByName.set(nameKey(`${first} ${last}`), r);
      else if (r?.name) xByName.set(nameKey(r.name), r);
    }
  } catch (err) { console.error('[twoStartWeek] savant error (tiering degraded):', err?.message || err); }

  const weekLabel = `${etWeekday(week[0])} ${shortDate(week[0])} - ${etWeekday(week[6])} ${shortDate(week[6])}`;
  const rows = [];
  for (const [pid, v] of twoStart) {
    const starts = v.starts.slice(0, 3).sort((a, b) => a.date.localeCompare(b.date));
    const x = xByName.get(nameKey(v.name));
    const xera = x ? Number(x.xera) : NaN;
    const tier = tierFor(xera);
    let score = BASE_SCORE;
    if (Number.isFinite(xera)) score += (4.2 - xera) * 8;
    score = clampScore(score);

    const startBits = starts.map((st) =>
      `${etWeekday(st.date)} ${shortDate(st.date)} ${st.home ? 'vs' : 'at'} ${st.opp}`);
    const detail = `${starts.length === 2 ? 'Two starts' : `${starts.length} starts`} next week — ` +
      `${startBits.join(', ')}.` +
      (Number.isFinite(xera) ? ` ${round(xera, 2)} xERA this season.` : '');

    rows.push(makeRow({
      category: 'twoStartWeek',
      headline: v.name,
      detail,
      game: `${v.teamName} — week of ${shortDate(week[0])}`,
      value: `${starts.length} starts`,
      tone: TONES.EDGE,
      relevance_score: score,
      player_id: pid,
      meta: {
        kind: 'two_start', tier,
        week: weekLabel,
        team: v.teamName,
        starts: starts.map((st) => ({ date: st.date, opp: st.opp, home: st.home })),
        ...(Number.isFinite(xera) ? { xera: round(xera, 2) } : {}),
      },
    }));
  }

  rows.sort((a, b) => b.relevance_score - a.relevance_score);
  const out = rows.slice(0, MAX_ARMS);
  console.log(`[twoStartWeek] arms=${out.length}/${twoStart.length} (week ${week[0]}..${week[6]})`);
  await writeReads(out);
  return out;
}

/** Fenced flash pass — the week-planning read per arm (facts only). */
async function writeReads(rows) {
  if (!rows.length) return;
  const facts = rows.map((r, i) => {
    const m = r.meta || {};
    const starts = (m.starts || []).map((s) => `${s.home ? 'vs' : 'at'} ${s.opp} (${etWeekday(s.date)} ${s.date})`).join(', ');
    return `${i}. ${r.headline} (${m.team}) — ${(m.starts || []).length} posted starts next week: ${starts}.` +
      (m.xera != null ? ` Season xERA ${m.xera}.` : ' No xERA figure available.') +
      ` Tier: ${m.tier}.`;
  }).join('\n');

  const prompt = `You are Gary, a sharp fantasy baseball analyst writing the weekly two-start pitchers column. For each arm below, write the case for how a season-long manager should handle his week.

HARD RULES:
- Use ONLY the facts listed for that pitcher. Never introduce any statistic, matchup detail, injury, or player not provided. If no xERA is listed, do not mention any number.
- 2 sentences per pitcher, plain confident analyst voice. The first states what the week gives him; the second must say something SPECIFIC about his two opponents or the shape of the pair (a home pair, a soft opponent twice, a tough draw in one of the two) — drawn only from the listed starts.
- BANNED phrasing: "high-upside opportunity", "solidify your categories", "valuable asset", "a chance to deliver", "looking to", and any sentence that could describe any pitcher. If a sentence would fit every arm on the list, rewrite it.
- Then one short verdict sentence matched to his tier: PLAN_AROUND = "Anchor your week around both starts." style; STREAM_BOTH = start him twice in standard leagues; MATCHUP_CALL = check the matchups before committing.
- No hedging boilerplate, no exclamation marks, never mention being an AI or a model.

Return STRICT JSON only: {"reads":[{"i":0,"read":"...","verdict":"..."}]}

PITCHERS:
${facts}`;

  try {
    const resp = await geminiService.generateResponse(
      [{ role: 'user', content: prompt }],
      { model: 'gemini-3-flash-preview', maxTokens: 3000 }
    );
    const text = typeof resp === 'string' ? resp : (resp?.content ?? resp?.text ?? '');
    const jsonStr = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr.slice(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1));
    for (const item of parsed?.reads || []) {
      const r = rows[item?.i];
      if (!r || !item?.read) continue;
      const verdict = (item.verdict || '').trim();
      r.detail = `${item.read.trim()}${verdict ? ` ${verdict}` : ''}`;
      r.meta = { ...(r.meta || {}), read: item.read.trim(), ...(verdict ? { verdict } : {}) };
    }
    console.log(`[twoStartWeek] reads attached: ${(parsed?.reads || []).length}/${rows.length}`);
  } catch (err) {
    console.error('[twoStartWeek] analyst pass failed (computed details kept):', err?.message || err);
  }
}

export default { computeTwoStartWeek };
