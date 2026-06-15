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

// Resolve the slate game a pick belongs to by matching its team name against
// the game's home/away names. Returns the BDL game object or null.
function findSlateGame(games, teamName) {
  if (!teamName) return null;
  const norm = (s) => String(s || '').toLowerCase();
  const t = norm(teamName);
  return (games || []).find(g => {
    const home = norm(g.home_team?.full_name || g.home_team_name || g.home_team);
    const away = norm(g.away_team?.full_name || g.away_team_name || g.away_team);
    return home.includes(t) || t.includes(home) || away.includes(t) || t.includes(away);
  }) || null;
}

export async function computeGaryHrThreats(ctx) {
  const { date, games, season, bdl } = ctx;
  const rows = [];
  // Per-team season-stats cache for player-id resolution (heatCheck pattern).
  const teamStatsCache = new Map();
  async function resolvePlayerId(teamId, playerName) {
    if (!bdl || teamId == null || !playerName) return null;
    try {
      if (!teamStatsCache.has(teamId)) {
        teamStatsCache.set(teamId, await bdl.getMlbPlayerSeasonStats({ season, teamId }).catch(() => []));
      }
      const target = String(playerName).toLowerCase().replace(/[.\-']/g, '').trim();
      const match = (teamStatsCache.get(teamId) || []).find(s => {
        const n = String(s.player?.full_name || '').toLowerCase().replace(/[.\-']/g, '').trim();
        return n === target || n.includes(target) || target.includes(n);
      });
      return match?.player?.id ?? null;
    } catch { return null; }
  }
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

  // Headline verbs rotate deterministically by player name — re-runs stay
  // stable for the same player, but the board mixes its phrasing.
  const HR_VERBS = ['to go deep', 'to leave the yard', 'to homer', 'for a home run', 'to clear a fence'];
  const hrVerb = (name) => {
    let h = 0;
    for (const ch of String(name)) h = (h + ch.charCodeAt(0)) % 997;
    return HR_VERBS[h % HR_VERBS.length];
  };

  for (const p of hrPicks) {
    const detail = twoSentences(p.rationale);
    if (!p.player || !detail) continue; // fail closed — never emit an empty card
    const confidence = Number(p.confidence);
    // game_id + player_id make the row gradeable (run-grade-insights joins the
    // box score by player_id within the slate game). Missing ids still emit —
    // the card is content first; the grader will skip it with a note.
    const slateGame = findSlateGame(games, p.team);
    const playerTeamId = slateGame
      ? (String(slateGame.home_team?.full_name || slateGame.home_team_name || '').toLowerCase().includes(String(p.team).toLowerCase())
          ? slateGame.home_team?.id
          : slateGame.away_team?.id)
      : null;
    const playerId = await resolvePlayerId(playerTeamId, p.player);
    rows.push(makeRow({
      category: 'garyHrThreats',
      headline: `${p.player} ${hrVerb(p.player)}`,
      detail,
      game: p.matchup || '',
      value: fmtOdds(p.odds),
      tone: TONES.HOT,
      // Confidence 0.5→70, 0.85→84 — Gary's HR board should surface above
      // most statistical lanes but below true market-anomaly cards.
      relevance_score: clampScore(Number.isFinite(confidence) ? 50 + confidence * 40 : 65),
      player_id: playerId ?? undefined,
      game_id: slateGame?.id ?? undefined,
      // meta.player powers name-based grading fallback (did this player homer?)
      meta: { player: p.player, line: p.line, odds: p.odds, team: p.team, key_stats: (p.key_stats || []).slice(0, 3) },
    }));
  }

  console.log(`[garyHrThreats] examined=${allPicks.length} picks, emitted=${rows.length} HR threats`);
  return rows;
}
