// gary2.0/src/services/insights/computers/garyHrThreats.js
//
// LANE: garyHrThreats  (category token emitted: gary_hr_threats)
// "Gary Home Run Threats" — the players Gary has picked to homer today, each
// with a two-sentence reason lifted from his own rationale.
//
// Unlike the statistical computers in this directory, this lane does not
// derive an edge itself: it re-surfaces Gary's stored HR prop picks
// (prop_picks rows written by run-mlb-hr-picks.js / the regular MLB props
// runner) so the Hub shows his HR board. Fails closed: no HR picks today →
// zero rows, never throws.
//
// Pick shape in prop_picks.picks[] (verified live June 4 2026):
//   { bet:'over', line:'0.5', odds:270, prop:'home_runs 0.5', team, sport,
//     player, matchup, key_stats[], rationale, confidence, commence_time }
// HR picks are identified by prop starting with 'home_runs' + bet 'over'
// (sport is 'MLB' from the regular runner or 'MLB HR' from the hrOnly runner).

import axios from 'axios';
import { makeRow, TONES, clampScore } from '../shared.js';

// Same env resolution as run-insight-connections.js / src/supabaseClient.js.
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY || '';

// First two sentences of Gary's rationale — the card copy. Plain trim, no
// rewriting: it's genuinely Gary's reason, just sized for a Hub card.
function twoSentences(text) {
  if (!text || typeof text !== 'string') return '';
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(' ').trim();
}

function fmtOdds(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return '';
  return n > 0 ? `+${n}` : String(n);
}

export async function computeGaryHrThreats(ctx) {
  const { date } = ctx;
  const rows = [];
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[garyHrThreats] missing Supabase config — skipping');
    return rows;
  }

  let picksRows = [];
  try {
    const resp = await axios.get(
      `${SUPABASE_URL}/rest/v1/prop_picks?date=eq.${date}&select=date,picks`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, timeout: 15000 }
    );
    picksRows = Array.isArray(resp.data) ? resp.data : [];
  } catch (e) {
    console.warn(`[garyHrThreats] prop_picks fetch failed: ${e.message}`);
    return rows;
  }

  const allPicks = picksRows.flatMap(r => Array.isArray(r.picks) ? r.picks : []);
  const hrPicks = allPicks.filter(p =>
    typeof p?.prop === 'string' &&
    p.prop.startsWith('home_runs') &&
    String(p.bet).toLowerCase() === 'over' &&
    /^MLB/i.test(p.sport || 'MLB')
  );

  for (const p of hrPicks) {
    const detail = twoSentences(p.rationale);
    if (!p.player || !detail) continue; // fail closed — never emit an empty card
    const confidence = Number(p.confidence);
    rows.push(makeRow({
      category: 'garyHrThreats',
      headline: `${p.player} to go deep`,
      detail,
      game: p.matchup || '',
      value: fmtOdds(p.odds),
      tone: TONES.HOT,
      // Confidence 0.5→70, 0.85→84 — Gary's HR board should surface above
      // most statistical lanes but below true market-anomaly cards.
      relevance_score: clampScore(Number.isFinite(confidence) ? 50 + confidence * 40 : 65),
      meta: { line: p.line, odds: p.odds, team: p.team, key_stats: (p.key_stats || []).slice(0, 3) },
    }));
  }

  console.log(`[garyHrThreats] examined=${allPicks.length} picks, emitted=${rows.length} HR threats`);
  return rows;
}
