#!/usr/bin/env node
/**
 * THE NOTEBOOK SHADOW PICK (founder GO, Sep 3 2026 — "I'm good with doing
 * the three systems"): Gary with a memory. A second read of the SAME desk
 * the real pick was made from, with the reader's own notebook appended,
 * through the same two passes and the same prompts — the notebook is the
 * only difference. Spawned detached by the pick child after the real pick
 * stores, so it never delays or touches it. Stores diary_picks.
 *
 *   node scripts/run-diary-pick.js --game-id 5059874 --date 2026-09-03 --matchup "Blue Jays @ Guardians"
 *   node scripts/run-diary-pick.js --game-id ... --dry     # load everything, print the notebook, no model call
 */
import '../src/loadEnv.js';
import { buildNotebook } from '../src/services/diary/notebook.js';
import { pickSideOf, pickPointOf } from '../src/services/closingLine.js';
import { matchingDesk, pregameEvidence } from '../src/services/diary/evidence.js';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const GAME_ID = arg('--game-id');
const DATE = arg('--date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const MATCHUP = arg('--matchup');
const DRY = process.argv.includes('--dry');
if (!GAME_ID) { console.error('usage: --game-id <id> [--date YYYY-MM-DD] [--matchup "Away @ Home"] [--dry]'); process.exit(2); }

const { supabaseAdmin, supabase } = await import('../src/supabaseClient.js');
const db = supabaseAdmin || supabase;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

/** The case blocks by the exact-heading contract ("CASE FOR BACKING X TONIGHT:"). */
function casesOf(text, homeTeam, awayTeam) {
  const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = (team) => new RegExp(`CASE FOR (?:BACKING\\s+)?(?:THE\\s+)?${esc(team)}(?:\\s+TONIGHT)?:?[^\\n]*`, 'i');
  const t = String(text || '');
  const find = (team) => t.match(rx(team)) || t.match(rx(String(team).trim().split(/\s+/).pop()));
  const h = find(homeTeam); const a = find(awayTeam);
  if (!h || !a) return { path_home: null, path_away: null };
  const hi = t.indexOf(h[0]); const ai = t.indexOf(a[0]);
  const slice = (from, to) => t.slice(from, to).replace(/^[^\n]*\n/, '').trim();
  return hi < ai ? { path_home: slice(hi, ai), path_away: slice(ai) } : { path_away: slice(ai, hi), path_home: slice(hi) };
}

async function main() {
  const { data: slateRows } = await db.from('daily_slate').select('*').eq('date', DATE).eq('league', 'MLB').eq('bdl_game_id', String(GAME_ID)).limit(1);
  const s = slateRows?.[0];
  if (!s) { console.error(`[Diary] no daily_slate row for ${GAME_ID} on ${DATE}`); process.exit(1); }
  const homeTeam = s.home_team; const awayTeam = s.away_team;
  const matchup = MATCHUP || `${awayTeam} @ ${homeTeam}`;

  const { data: picksRow, error: picksError } = await db.from('daily_picks').select('picks').eq('date', DATE);
  if (picksError) throw picksError;
  const gary = (picksRow?.[0]?.picks || []).find((p) => String(p?.game_id) === String(GAME_ID) && String(p?.league).toUpperCase() === 'MLB') || null;
  const sameMatchupGames = new Set((picksRow?.[0]?.picks || []).filter((p) => String(p?.league).toUpperCase() === 'MLB'
    && norm(p.homeTeam) === norm(homeTeam) && norm(p.awayTeam) === norm(awayTeam)).map((p) => String(p.game_id))).size;
  const { data: deskRows, error: deskError } = await db.from('pick_desks').select('desk, matchup, pick, research_briefing').eq('game_date', DATE);
  if (deskError) throw deskError;
  const original = gary ? matchingDesk(deskRows, { homeTeam, awayTeam, pickText: gary.pick, sameMatchupGames }) : null;
  const desk = original?.desk || null;
  const briefing = original?.research_briefing || null;
  if (!desk) { console.error(`[Diary] no unambiguous original desk for ${matchup} on ${DATE} — the notebook shadow reads the same desk or nothing`); process.exit(1); }

  const since = new Date(new Date(`${DATE}T12:00:00Z`).getTime() - 45 * 86400000).toISOString().slice(0, 10);
  const { data: autopsies } = await db.from('pick_autopsies').select('*').eq('league', 'MLB').gte('game_date', since).lt('game_date', DATE).order('game_date', { ascending: false }).limit(400);
  const notebook = buildNotebook(autopsies || [], { homeTeam, awayTeam });
  console.log(`[Diary] ${matchup}: desk ${desk.length} chars · briefing ${briefing ? `${briefing.length} chars (re-used from the main read)` : 'none stored — the researcher runs again'} · notebook from ${notebook.notes} autopsies (${notebook.text.length} chars) · Gary took ${gary?.pick || '—'}`);
  if (DRY) { console.log(notebook.text || '(empty notebook)'); process.exit(0); }

  const game = {
    id: s.bdl_game_id, bdl_game_id: s.bdl_game_id, home_team: homeTeam, away_team: awayTeam, commence_time: s.commence_time,
    moneyline_home: s.ml_home, moneyline_away: s.ml_away, spread_home: s.spread, spread_home_odds: s.spread_home_odds,
    spread_away: s.spread == null ? null : -s.spread, spread_away_odds: s.spread_away_odds, line_vendor: s.line_vendor, sport_key: 'baseball_mlb',
  };
  const deskWithNotebook = notebook.text ? `${desk}\n\n${notebook.text}` : desk;

  const { analyzeGame } = await import('../src/services/agentic/orchestrator/orchestratorMain.js');
  const { MLB_JUNE_BRAIN_MODEL } = await import('../src/services/agentic/orchestrator/orchestratorConfig.js');
  const t0 = Date.now();
  let result = await analyzeGame(game, 'baseball_mlb', { prebuiltScoutReport: deskWithNotebook, prebuiltResearchBriefing: briefing, modelOverride: MLB_JUNE_BRAIN_MODEL, nocache: true });
  if (result?.error || !result?.pick) {
    console.warn(`[Diary] first read failed (${result?.error || 'no pick'}) — one retry`);
    result = await analyzeGame(game, 'baseball_mlb', { prebuiltScoutReport: deskWithNotebook, prebuiltResearchBriefing: briefing, modelOverride: MLB_JUNE_BRAIN_MODEL, nocache: true });
  }
  if (result?.error || !result?.pick) { console.error(`[Diary] no pick (${result?.error || 'empty'})`); process.exit(1); }

  const raw = result._fullAssistantNarrative || result._context?.fullAssistantNarrative || result.rawAnalysis || result._context?.rawAnalysis || '';
  const paths = casesOf(raw, homeTeam, awayTeam);
  const pickText = String(result.pick);
  const pickLike = { pick: pickText, homeTeam, awayTeam, type: result.type || null, spread: result.spread ?? null };
  const side = pickSideOf(pickLike);
  const point = pickPointOf({ ...pickLike, type: result.type === 'spread' ? 'spread' : (/[+-]1\.5/.test(pickText) ? 'spread' : 'moneyline') });
  const betType = point != null ? 'spread' : 'moneyline';
  const priceMatch = pickText.match(/([+-]\d{3,4})\s*$/);
  const price = priceMatch ? Number(priceMatch[1]) : (Number.isFinite(Number(result.odds)) ? Number(result.odds) : (betType === 'moneyline' ? (side === 'home' ? s.ml_home : s.ml_away) : (side === 'home' ? s.spread_home_odds : s.spread_away_odds)));
  const garySide = gary ? pickSideOf({ pick: gary.pick, homeTeam, awayTeam }) : null;
  const row = {
    game_date: DATE, league: 'MLB', game_id: String(GAME_ID), matchup, home_team: homeTeam, away_team: awayTeam,
    pick_text: pickText, side, bet_type: betType, point, price: Number.isFinite(Number(price)) ? Math.round(Number(price)) : null,
    rationale: result.rationale || null, path_home: result.path_home ?? paths.path_home, path_away: result.path_away ?? paths.path_away,
    notebook: notebook.text || null, notebook_notes: notebook.notes, gary_pick: gary?.pick || null,
    agree_with_gary: garySide && side ? garySide === side : null, model: MLB_JUNE_BRAIN_MODEL, computed_at: new Date().toISOString(),
    pregame_evidence: pregameEvidence({
      pickText, price, model: MLB_JUNE_BRAIN_MODEL, era: result._promptSha || null,
      rationale: result.rationale || null, caseHome: result.path_home ?? paths.path_home, caseAway: result.path_away ?? paths.path_away,
      desk: result._context?.scoutReport || deskWithNotebook,
      briefing: result._context?.researchBriefing || result._researchBriefing || briefing,
      notebook: notebook.text || null, capturedAt: new Date().toISOString(), provenance: 'diary_decision_inputs',
    }),
  };
  const { data: stored, error } = await db.from('diary_picks').upsert(row, { onConflict: 'game_date,league,game_id', ignoreDuplicates: true }).select('game_id');
  if (error) { console.error(`[Diary] store failed: ${error.message}`); process.exit(1); }
  if (!stored?.length) { console.log(`[Diary] original ${matchup} decision already stored; left intact`); process.exit(0); }
  console.log(`[Diary] 📓 ${matchup}: ${pickText} · Gary ${gary?.pick || '—'} · ${row.agree_with_gary === false ? 'DIFFERENT side' : row.agree_with_gary ? 'same side' : 'side unread'} · ${Math.round((Date.now() - t0) / 1000)}s`);
  process.exit(0);
}

main().catch((e) => { console.error(`[Diary] failed: ${e?.message || e}`); process.exit(1); });
