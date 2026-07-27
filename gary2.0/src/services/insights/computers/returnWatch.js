// gary2.0/src/services/insights/computers/returnWatch.js
//
// LANE: returnWatch  (category token: return_watch) — MLB only.
// "Back Soon" — IL players with a LISTED return date inside the stash window.
// The season-long move ESPN/Rotowire columns bury in notes: grab the returning
// bat/arm a few days before he's active, before your league notices.
//
// GROUNDED — the timeline is ONLY the feed's listed return_date; when the
// feed lists nothing inside the window, the player simply doesn't appear.
// Never an invented "expected back" claim. Injury feed access is READ-ONLY
// through the existing service surface (injury internals are founder-locked).
//
// Sources:
//  • bdl.getInjuriesGeneric('baseball_mlb', {}): league-wide IL list with
//    status ("10-Day-IL"), type ("Oblique Strain Left"), return_date (ISO).
//  • bdl.getMlbPlayerSeasonStats({season, playerIds}): the season line that
//    says whether he's worth a stash (OPS for bats, ERA for arms).
// Defensive: missing fields skip the row; failures return [].

import { makeRow, TONES, clampScore, round } from '../shared.js';
import { generateSolText } from '../solText.js';

const WINDOW_DAYS = 10;   // listed return inside this many days = stashable
const MAX_ROWS = 8;

const PITCHER_POS_RE = /^(sp|rp|p|cl|relief|pitcher|starting)/i;

function etToday(dateStr) { return `${dateStr}T00:00:00Z`; }

/** "Oblique Strain Left" -> "oblique strain" (side dropped, lowercased). */
function injuryPhrase(type) {
  const t = String(type || '').trim().replace(/\s+(Left|Right)$/i, '');
  return t ? t.toLowerCase() : '';
}

/**
 * Return dates arrive as midnight-UTC stamps ("2026-07-28T00:00:00.000Z");
 * rendering those through an ET formatter shifts them a day early (the BDL
 * midnight-UTC artifact class). Format the DATE FIELD of the string itself.
 */
function shortDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : '';
}

export async function computeReturnWatch(ctx) {
  const { date, season, bdl } = ctx;

  let injuries = [];
  try { injuries = (await bdl.getInjuriesGeneric('baseball_mlb', {})) || []; }
  catch (err) { console.error('[returnWatch] injuries fetch error:', err?.message || err); return []; }

  const t0 = Date.parse(etToday(date));
  const t1 = t0 + WINDOW_DAYS * 86400000;
  const soon = [];
  for (const inj of injuries) {
    const p = inj?.player;
    const ret = Date.parse(inj?.return_date || '');
    if (!p?.id || !p?.full_name || !Number.isFinite(ret)) continue;
    if (ret < t0 || ret > t1) continue;
    soon.push({
      id: p.id, name: p.full_name,
      team: p?.team?.abbreviation || p?.team?.full_name || '',
      position: String(p?.position || '').trim(),
      status: String(inj?.status || '').trim(),
      injury: injuryPhrase(inj?.type),
      returnIso: inj.return_date,
    });
  }
  if (!soon.length) {
    console.log('[returnWatch] nobody listed back inside the window.');
    return [];
  }

  // One batched season-stats call for the line that justifies the stash.
  const statById = new Map();
  try {
    const stats = await bdl.getMlbPlayerSeasonStats({ season, playerIds: soon.map((s) => s.id) });
    for (const r of (Array.isArray(stats) ? stats : [])) {
      const id = r?.player?.id ?? r?.player_id;
      if (id == null) continue;
      statById.set(String(id), {
        ops: Number(r?.batting_ops), era: Number(r?.pitching_era), ip: Number(r?.pitching_ip),
      });
    }
  } catch (err) { console.error('[returnWatch] season stats error (lines omitted):', err?.message || err); }

  const rows = [];
  for (const s of soon.sort((a, b) => Date.parse(a.returnIso) - Date.parse(b.returnIso))) {
    const st = statById.get(String(s.id)) || {};
    const isPitcher = PITCHER_POS_RE.test(s.position);
    // Sanity bounds — a source glitch (a 3.250 "OPS" appeared live Jul 26)
    // must drop the LINE, never print. Bad stat > no stat is never true here.
    const opsOk = Number.isFinite(st.ops) && st.ops >= 0.2 && st.ops <= 1.5;
    const eraOk = Number.isFinite(st.era) && st.era >= 0 && st.era <= 15;
    const line = isPitcher
      ? (eraOk ? `${round(st.era, 2)} ERA` : null)
      : (opsOk ? `${st.ops.toFixed(3)} OPS` : null);

    // Stash-WORTHINESS floor: a returning player with a demonstrably weak
    // season line is not a pickup, and recommending him reads naive (a .549
    // OPS "stash" surfaced live Jul 26). A player with NO line stays — the
    // absence of data is not evidence of weakness.
    if (!isPitcher && opsOk && st.ops < 0.650) continue;
    if (isPitcher && eraOk && st.era > 5.25) continue;

    const daysOut = Math.max(0, Math.round((Date.parse(s.returnIso) - t0) / 86400000));
    let score = 62 - daysOut * 2;                    // sooner = hotter stash
    if (line) score += 4;                            // has a season line to sell it
    score = clampScore(score);

    rows.push(makeRow({
      category: 'returnWatch',
      headline: s.name,
      detail: `Listed back ${shortDate(s.returnIso)} (${s.status}${s.injury ? `, ${s.injury}` : ''})` +
        (line ? ` — ${line} this season.` : '.'),
      game: `${s.team} — return listed ${shortDate(s.returnIso)}`,
      value: `back ${shortDate(s.returnIso)}`,
      tone: TONES.NEUTRAL,
      relevance_score: score,
      player_id: s.id,
      meta: {
        kind: 'return_watch',
        team: s.team, position: s.position, status: s.status,
        injury: s.injury, return_date: s.returnIso.slice(0, 10),
        days_out: daysOut,
        ...(line ? { season_line: line } : {}),
      },
    }));
  }

  const out = rows.slice(0, MAX_ROWS);
  console.log(`[returnWatch] stashes=${out.length}/${soon.length} (window ${WINDOW_DAYS}d)`);
  await writeReads(out);
  return out;
}

/** Fenced flash pass — the stash-now read (facts only). */
async function writeReads(rows) {
  if (!rows.length) return;
  const facts = rows.map((r, i) => {
    const m = r.meta || {};
    return `${i}. ${r.headline} (${m.team}, ${m.position}) — ${m.status}, ${m.injury || 'injury'}. ` +
      `Listed return date: ${m.return_date} (${m.days_out} days away).` +
      (m.season_line ? ` Season line: ${m.season_line}.` : ' No season line available.');
  }).join('\n');

  const prompt = `You are Gary — the bettor whose season-long fantasy column publishes in this app. You write as yourself, never as an AI, and your training data is old: the facts below are current and they are ALL you may use — never introduce a statistic, rehab detail, performance claim, or timeline that isn't listed. A listed return date is a roster listing, not a promise.

For each player below: where he is, and the stash call for a season-long manager.

Return STRICT JSON only: {"reads":[{"i":0,"read":"...","verdict":"..."}]}

PLAYERS:
${facts}`;

  try {
    const resp = await generateSolText(prompt, { maxTokens: 9000 });
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
    console.log(`[returnWatch] reads attached: ${(parsed?.reads || []).length}/${rows.length}`);
  } catch (err) {
    console.error('[returnWatch] analyst pass failed (computed details kept):', err?.message || err);
  }
}

export default { computeReturnWatch };
