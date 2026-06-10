#!/usr/bin/env node
/**
 * Ultimate Results Script (Gary 2.0)
 * - Daily picks (NBA, NHL, NFL, NCAAB, NCAAF, MLB)
 * - Weekly NFL picks
 * - Prop bets (NBA, NHL, NFL, MLB)
 * - Uses BallDontLie (BDL) as primary source
 * - Uses Gemini Grounding (Google Search) as fallback
 * 
 * Usage: node scripts/run-all-results.js [YYYY-MM-DD]
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { gradeSoccerGame } from '../src/services/soccerGrading.js';
import { factCheckPick, buildGameEvidence } from '../src/services/factCheck.js';
// Load environment variables FIRST (centralized)
await import('../src/loadEnv.js');
// FIFA service reads the API key at import — must load AFTER loadEnv.
const fifaWorldCup = await import('../src/services/fifaWorldCupService.js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || process.env.BALL_DONT_LIE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials.');
  process.exit(1);
}

if (!BDL_API_KEY) {
  console.error('❌ Missing BallDontLie API key.');
  process.exit(1);
}

console.log(`\n🚀 GARY'S ULTIMATE RESULTS ENGINE`);
console.log(`════════════════════════════════════════`);
console.log(`🔑 Supabase:  ✅ ${SUPABASE_URL}`);
console.log(`📡 BDL API:   ✅`);
console.log(`📡 Grounding: ${GEMINI_API_KEY ? '✅ (Gemini 3 Flash)' : '❌ (Missing API Key)'}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

let genAI = null;
if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

// Caching
const cache = { games: new Map(), stats: new Map(), box: new Map() };

const getTargetDate = () => {
  const args = process.argv.slice(2);
  if (args.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) return args[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Gemini Grounding (Google Search) Fallback
 */
async function geminiGrounding(query) {
  if (!genAI) return null;
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      tools: [{ google_search: {} }],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });
    const result = await model.generateContent(query);
    const text = result.response.text();
    console.log(`    [Grounding] Result: ${text.substring(0, 80)}...`);
    return text;
  } catch (e) {
    console.warn(`    [Grounding] Error: ${e.message}`);
    return null;
  }
}

async function getScoreGrounding(league, teamA, teamB, date) {
  // Ask for scores by team name — avoids errors when pick's home/away doesn't match reality
  const query = `What was the final score of the ${league} game between ${teamA} and ${teamB} on ${date}? Respond ONLY as "${teamA} score"-"${teamB} score" (e.g. 115-102 means ${teamA} scored 115 and ${teamB} scored 102). If unknown, say "null".`;
  const text = await geminiGrounding(query);
  if (!text || text.toLowerCase().includes('null')) return null;
  const match = text.match(/(\d+)-(\d+)/);
  // h = teamA's score (pick's homeTeam), v = teamB's score (pick's awayTeam)
  return match ? { h: parseInt(match[1]), v: parseInt(match[2]) } : null;
}

async function getPropGrounding(sport, player, type, date) {
  const query = `In the ${sport} game on ${date}, what was ${player}'s exact total for ${type}? Respond ONLY with the number. If unknown, say "null".`;
  const text = await geminiGrounding(query);
  if (!text || text.toLowerCase().includes('null')) return null;
  // Only accept a clean number at the start of the response — prevents date/noise concatenation
  const match = text.trim().match(/^\d+\.?\d*/);
  const num = match ? parseFloat(match[0]) : NaN;
  return isNaN(num) ? null : num;
}

function normalizeToETDate(matchedGame) {
  // BDL surfaces game timing under several field names depending on sport:
  //   NBA  → `datetime` or `status` (ISO datetime)
  //   NHL  → `start_time_utc`
  //   MLB  → `date` is often a full ISO datetime string ("2026-05-29T00:05:00.000Z")
  //   Some endpoints  → `commence_time`
  // Try every plausible field, convert through ET. Only fall back to
  // matchedGame.date as a literal string if it's already a YYYY-MM-DD form.
  const candidates = [
    matchedGame.datetime,
    matchedGame.start_time_utc,
    matchedGame.commence_time,
    matchedGame.date,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      // Already a plain date — trust it
      return candidate;
    }
    const date = new Date(candidate);
    if (!isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    }
  }
  return null;
}

/**
 * BDL API Helpers
 */
async function bdlFetch(path, params = '') {
  const url = `https://api.balldontlie.io/${path}${params ? '?' + params : ''}`;
  try {
    const res = await fetch(url, { headers: { 'Authorization': BDL_API_KEY } });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fetchGames(league, date) {
  const key = `${league}-${date}`;
  if (cache.games.has(key)) return cache.games.get(key);

  // NBA uses v1/ while others use league/v1/
  const path = league.toUpperCase() === 'NBA' ? 'v1/games' : `${league.toLowerCase()}/v1/games`;
  const data = await bdlFetch(path, `dates[]=${date}`);
  const games = data?.data || [];
  cache.games.set(key, games);
  return games;
}

// MLB-only: BDL indexes games by UTC date. A 9:38 PM ET game on April 18 starts
// at 01:38 UTC on April 19, so BDL files it under 2026-04-19. To correctly grade
// picks for "April 18 ET", we query both UTC dates and filter to games whose ET
// date matches the target. Prevents grading against the wrong day's game.
async function fetchMlbGamesForETDate(etDateStr) {
  const tomorrow = new Date(etDateStr + 'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const [d1, d2] = await Promise.all([
    fetchGames('MLB', etDateStr),
    fetchGames('MLB', tomorrowStr)
  ]);

  const seen = new Set();
  const filtered = [];
  for (const g of [...d1, ...d2]) {
    if (!g || g.id == null) continue;
    if (seen.has(g.id)) continue;
    const iso = g.date; // MLB BDL returns a full ISO datetime in `date`
    if (!iso) continue;
    const gameETDate = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (gameETDate !== etDateStr) continue;
    seen.add(g.id);
    filtered.push(g);
  }
  return filtered;
}

async function fetchBoxScores(league, date) {
  const key = `${league}-${date}`;
  if (cache.box.has(key)) return cache.box.get(key);
  
  const path = league.toUpperCase() === 'NBA' ? 'v1/box_scores' : `${league.toLowerCase()}/v1/box_scores`;
  const data = await bdlFetch(path, `date=${date}&dates[]=${date}&per_page=100`);
  const box = data?.data || [];
  cache.box.set(key, box);
  return box;
}

async function fetchNFLStats(gameIds) {
  if (!gameIds.length) return [];
  const key = gameIds.join(',');
  if (cache.stats.has(key)) return cache.stats.get(key);

  const params = gameIds.map(id => `game_ids[]=${id}`).join('&') + '&per_page=100';
  const data = await bdlFetch('nfl/v1/stats', params);
  const stats = data?.data || [];
  cache.stats.set(key, stats);
  return stats;
}

async function fetchMLBStats(gameIds) {
  if (!gameIds.length) return [];
  const key = `mlb-stats-${gameIds.join(',')}`;
  if (cache.stats.has(key)) return cache.stats.get(key);

  // Fetch stats PER GAME — BDL per_page=100 is per request, not per game.
  // With ~26 players/game, batching multiple games loses data to pagination.
  let allStats = [];
  for (const gameId of gameIds) {
    const data = await bdlFetch('mlb/v1/stats', `game_ids[]=${gameId}&per_page=100`);
    if (data?.data) allStats.push(...data.data);
  }
  console.log(`  📊 MLB stats: ${allStats.length} player entries for ${gameIds.length} games`);
  cache.stats.set(key, allStats);
  return allStats;
}

/**
 * Matching & Grading
 */
function matchGame(games, h, v, gameId) {
  const hn = normalizeName(h), vn = normalizeName(v);
  const hLast = hn.split(' ').pop(), vLast = vn.split(' ').pop();

  // Prefer exact BDL game_id match when the pick has it stored. This eliminates
  // all ambiguity — same teams on consecutive nights, UTC bleed, doubleheaders.
  if (gameId != null) {
    const byId = games.find(g => String(g.id) === String(gameId));
    if (byId) {
      const gh = normalizeName(byId.home_team?.full_name || byId.home_team?.name || '');
      // If BDL's home team doesn't match the pick's home team, the pick stored
      // home/away in reversed order — set swapped so score alignment is correct.
      const swapped = !(gh.includes(hn) || gh.includes(hLast));
      return { game: byId, swapped };
    }
  }

  // Fallback for legacy picks without game_id: match by team names.
  // Try normal match first (pick's home = API's home)
  let match = games.find(g => {
    const gh = normalizeName(g.home_team?.full_name || g.home_team?.name || '');
    const gv = normalizeName(g.visitor_team?.full_name || g.visitor_team?.name || g.away_team?.full_name || g.away_team?.name || '');
    return (gh.includes(hn) || gh.includes(hLast)) && (gv.includes(vn) || gv.includes(vLast));
  });
  if (match) return { game: match, swapped: false };

  // Try reverse match (pick's home/away may be swapped vs API)
  match = games.find(g => {
    const gh = normalizeName(g.home_team?.full_name || g.home_team?.name || '');
    const gv = normalizeName(g.visitor_team?.full_name || g.visitor_team?.name || g.away_team?.full_name || g.away_team?.name || '');
    return (gh.includes(vn) || gh.includes(vLast)) && (gv.includes(hn) || gv.includes(hLast));
  });
  if (match) return { game: match, swapped: true };

  return null;
}

function gradeGame(pickText, homeTeam, awayTeam, hScore, vScore) {
  const pickLower = pickText.toLowerCase();
  const hFull = homeTeam.toLowerCase(), vFull = awayTeam.toLowerCase();
  const hMascot = hFull.split(' ').pop(), vMascot = vFull.split(' ').pop();
  
  // 1. Moneyline Detection (Prioritize this)
  const isML = pickLower.includes(' ml') || pickLower.includes('moneyline');
  
  // 2. Total (Over/Under)
  const totalMatch = pickText.match(/(over|under)\s+(\d+\.?\d*)/i);
  if (totalMatch) {
    const line = parseFloat(totalMatch[2]), actual = hScore + vScore;
    if (actual === line) return 'push';
    return (totalMatch[1].toLowerCase() === 'over' ? actual > line : actual < line) ? 'won' : 'lost';
  }

  // 3. Spread (Only if not a Moneyline pick)
  if (!isML) {
    const spreadMatch = pickText.match(/([+-][1-9]\d{0,1}(\.\d)?)(?!\d)/);
    if (spreadMatch) {
      const spread = parseFloat(spreadMatch[1]);
      const isHome = pickLower.includes(hMascot) || pickLower.includes(hFull);
      const isVisitor = pickLower.includes(vMascot) || pickLower.includes(vFull);
      
      const diff = isHome ? (hScore - vScore) : (vScore - hScore);
      if (diff + spread === 0) return 'push';
      return (diff + spread > 0) ? 'won' : 'lost';
    }
  }

  // 4. Moneyline Logic (Fallback)
  const isHomePick = pickLower.includes(hMascot) || pickLower.includes(hFull);
  const isVisitorPick = pickLower.includes(vMascot) || pickLower.includes(vFull);
  
  if (isHomePick && !isVisitorPick) return (hScore > vScore) ? 'won' : 'lost';
  if (isVisitorPick && !isHomePick) return (vScore > hScore) ? 'won' : 'lost';
  
  // Final fallback
  if (isHomePick) return (hScore > vScore) ? 'won' : 'lost';
  if (isVisitorPick) return (vScore > hScore) ? 'won' : 'lost';

  return 'lost'; 
}

function gradeProp(actual, line, bet) {
  if (actual === null) return null;
  const b = bet.toLowerCase();
  if (b === 'over' || b === 'yes' || b === 'anytime') {
    return (actual > line || (b === 'anytime' && actual >= 1)) ? 'won' : 'lost';
  }
  return actual < line ? 'won' : 'lost';
}

/**
 * Prop Value Extraction
 */
function getStatValue(sport, data, name, type) {
  const target = normalizeName(name), t = type.toLowerCase();
  if (!data || data.length === 0) return null;

  // Normalize with accent stripping for fuzzy matching (e.g., "Pérez" → "perez")
  const targetFuzzy = target.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const targetLast = target.split(' ').pop();

  function nameMatches(firstName, lastName) {
    const full = normalizeName(`${firstName} ${lastName}`);
    if (full === target) return true;
    // Fuzzy: strip accents
    const fuzzy = full.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (fuzzy === targetFuzzy) return true;
    // Last name + first initial match (handles "V. Guerrero Jr." vs "Vladimir Guerrero Jr.")
    const last = normalizeName(lastName);
    if (last === targetLast && last.length > 3) return true;
    return false;
  }

  // Helper: find player across nested game structures (NBA/MLB style) or flat arrays (NHL/NFL style)
  function findPlayerInGames(games) {
    for (const g of games) {
      const players = [...(g.home_team?.players || []), ...(g.visitor_team?.players || []), ...(g.away_team?.players || [])];
      const p = players.find(ps => nameMatches(ps.player?.first_name || '', ps.player?.last_name || ''));
      if (p) return p;
    }
    return null;
  }
  function findPlayerFlat(arr) {
    return arr.find(s => nameMatches(s.player?.first_name || '', s.player?.last_name || '')) || null;
  }

  if (sport === 'NBA') {
    const p = findPlayerInGames(data);
    if (p) {
      if (t.includes('point') && !t.includes('rebound') && !t.includes('assist')) return p.pts ?? p.points ?? 0;
      if (t.includes('rebound') && !t.includes('point') && !t.includes('assist')) return p.reb ?? p.rebounds ?? 0;
      if (t.includes('assist') && !t.includes('point') && !t.includes('rebound')) return p.ast ?? p.assists ?? 0;
      if (t.includes('three') || t.includes('3pt') || t.includes('threes')) return p.fg3m ?? 0;
      if (t.includes('steal')) return p.stl ?? p.steals ?? 0;
      if (t.includes('block')) return p.blk ?? p.blocks ?? 0;
      if (t.includes('turnover')) return p.turnover ?? p.tov ?? 0;
      // Combo props — must check AFTER individual props
      if (t.includes('points_rebounds_assists') || t.includes('pra') || (t.includes('point') && t.includes('rebound') && t.includes('assist'))) return (p.pts || 0) + (p.reb || 0) + (p.ast || 0);
      if (t.includes('points_rebounds') || (t.includes('point') && t.includes('rebound'))) return (p.pts || 0) + (p.reb || 0);
      if (t.includes('points_assists') || (t.includes('point') && t.includes('assist'))) return (p.pts || 0) + (p.ast || 0);
      if (t.includes('rebounds_assists') || (t.includes('rebound') && t.includes('assist'))) return (p.reb || 0) + (p.ast || 0);
      console.warn(`    [Stat] NBA: Found ${name} but no match for prop type "${type}"`);
    }
  } else if (sport === 'NHL') {
    // Try nested game format first, then flat
    const p = findPlayerInGames(data) || findPlayerFlat(data);
    if (p) {
      if (t.includes('goal') && !t.includes('shot')) return p.goals ?? 0;
      if (t.includes('assist')) return p.assists ?? 0;
      if (t.includes('point')) return (p.goals || 0) + (p.assists || 0);
      if (t.includes('shot') || t.includes('sog')) return p.shots_on_goal ?? p.shots ?? 0;
      if (t.includes('save')) return p.saves ?? 0;
      if (t.includes('block')) return p.blocked_shots ?? p.blocks ?? 0;
      console.warn(`    [Stat] NHL: Found ${name} but no match for prop type "${type}"`);
    }
  } else if (sport === 'NFL') {
    const p = findPlayerFlat(data);
    if (p) {
      if (t.includes('passing yard')) return p.passing_yards ?? 0;
      if (t.includes('passing td')) return p.passing_touchdowns ?? 0;
      if (t.includes('rushing yard')) return p.rushing_yards ?? 0;
      if (t.includes('rushing td')) return p.rushing_touchdowns ?? 0;
      if (t.includes('receiving yard')) return p.receiving_yards ?? 0;
      if (t.includes('receiving td')) return p.receiving_touchdowns ?? 0;
      if (t.includes('reception')) return p.receptions ?? 0;
      if (t.includes('anytime td') || t.includes('touchdown')) return (p.rushing_touchdowns || 0) + (p.receiving_touchdowns || 0) > 0 ? 1 : 0;
      if (t.includes('interception')) return p.passing_interceptions ?? 0;
      if (t.includes('completion')) return p.passing_completions ?? 0;
      if (t.includes('attempt')) {
        if (t.includes('rush')) return p.rushing_attempts ?? 0;
        if (t.includes('pass')) return p.passing_attempts ?? 0;
      }
    }
  } else if (sport === 'MLB') {
    // BDL /mlb/v1/stats returns flat array with player objects
    const p = findPlayerFlat(data) || findPlayerInGames(data);
    if (p) {
      // BDL MLB stats fields: at_bats, runs, hits, rbi, hr, bb, k, avg, obp, slg,
      // ip, p_hits, p_runs, er, p_bb, p_k, p_hr, pitch_count, strikes, era
      // NOTE: total_bases and stolen_bases are NOT in BDL — compute or skip

      // Batter props
      if (t.includes('hit') && !t.includes('run') && !t.includes('allow')) return p.hits ?? 0;
      if (t.includes('home_run') || t.includes('homer')) return p.hr ?? p.home_runs ?? 0;
      if (t.includes('total_base')) {
        // BDL doesn't have total_bases — compute from hits if we have component data
        if (p.total_bases != null) return p.total_bases;
        // Can't compute without doubles/triples — return null to try grounding
        return null;
      }
      if (t.includes('rbi') || t.includes('runs_batted')) return p.rbi ?? 0;
      if (t.includes('runs_scored') || t === 'runs') return p.runs ?? 0;
      if (t.includes('walk') || t.includes('bases_on_ball')) return p.bb ?? 0;
      if (t.includes('stolen_base') || t.includes('steal')) {
        if (p.stolen_bases != null) return p.stolen_bases;
        if (p.sb != null) return p.sb;
        return null; // BDL may not have SB — let grounding try
      }
      if (t.includes('single')) return null; // Need doubles/triples which BDL may not have
      if (t.includes('double') && !t.includes('play')) return p.doubles ?? null;
      if (t.includes('hits_runs_rbi') || t.includes('h+r+rbi')) return (p.hits || 0) + (p.runs || 0) + (p.rbi || 0);
      // Strikeouts — check pitcher stats first (p_k), then batter (k)
      if (t.includes('strikeout')) {
        if (p.p_k != null && p.p_k > 0) return p.p_k; // pitcher strikeouts
        return p.k ?? 0; // batter strikeouts
      }
      // Pitcher props
      if (t.includes('pitcher_out') || t.includes('outs_recorded')) {
        // BDL has ip (innings pitched) — convert to outs: ip * 3
        if (p.ip != null) return Math.round(parseFloat(p.ip) * 3);
        return null;
      }
      if (t.includes('pitcher_earned') || t.includes('earned_run')) return p.er ?? 0;
      if (t.includes('pitcher_hit') || t.includes('hits_allowed')) return p.p_hits ?? 0;
      if (t.includes('pitcher_walk')) return p.p_bb ?? 0;
      console.warn(`    [Stat] MLB: Found ${name} but no match for prop type "${type}"`);
    }
  }
  return null;
}

/**
 * Rationale Fact Check
 * After a game pick is graded, grade Gary's RATIONALE claim-by-claim against
 * what actually happened (rows land in pick_fact_checks; the app reads them to
 * show "what Gary got right"). Game picks only — props never reach this path.
 * Non-fatal by design: callers wrap it in try/catch so a fact-check failure
 * can never break results grading.
 */
async function factCheckGradedPick({ pick, league, gameDate, result, hs, vs, matchedGame }) {
  if (!pick.rationale || !String(pick.rationale).trim()) return;
  const matchup = `${pick.awayTeam} @ ${pick.homeTeam}`;

  // Idempotency: skip matchups already fact-checked for this date (mirrors the
  // game_results dedup check above).
  const { data: exist, error: dedupErr } = await supabase
    .from('pick_fact_checks')
    .select('id')
    .eq('game_date', gameDate)
    .eq('league', league)
    .eq('matchup', matchup)
    .maybeSingle();
  if (dedupErr) {
    console.warn(`  ⚠️ Fact-check dedup failed for ${matchup}: ${dedupErr.message}`);
    return;
  }
  if (exist) {
    console.log(`  ⏩ Fact-check exists: ${league} ${matchup} (${gameDate})`);
    return;
  }

  // Evidence: final score + (MLB) the per-game BDL player stats we already
  // fetch for prop grading — pitcher lines, HRs, team hit totals.
  let mlbStats = null;
  if (league === 'MLB' && matchedGame?.id != null) {
    mlbStats = await fetchMLBStats([matchedGame.id]);
  }
  const evidence = buildGameEvidence({
    league,
    homeTeam: pick.homeTeam,
    awayTeam: pick.awayTeam,
    homeScore: hs,
    awayScore: vs,
    mlbStats,
  });

  const fc = await factCheckPick({ pick, result, evidence });
  if (!fc) {
    console.warn(`  ⚠️ Fact-check produced no claims for ${league} ${matchup}`);
    return;
  }

  const { error: insertErr } = await supabase.from('pick_fact_checks').insert({
    game_date: gameDate,
    league,
    matchup,
    pick_text: pick.pick,
    result,
    claims: fc.claims,
    right_count: fc.right_count,
    wrong_count: fc.wrong_count,
  });
  if (insertErr) {
    console.error(`  ❌ FACT-CHECK INSERT FAILED [pick_fact_checks] ${league} ${matchup} (${gameDate}): ${insertErr.message}`);
  } else {
    const unclear = fc.claims.length - fc.right_count - fc.wrong_count;
    console.log(`  🔍 Fact-checked ${league} ${matchup}: ${fc.right_count} right / ${fc.wrong_count} wrong / ${unclear} unclear`);
  }
}

/**
 * Main Logic
 */
async function processGenericGames(table, date, leagueFilter = null) {
  console.log(`\n📂 Processing ${table.toUpperCase()} for ${date}...`);
  const query = supabase.from(table).select('*');
  if (table === 'daily_picks') query.eq('date', date);
  else query.eq('week_start', date);

  const { data: rows } = await query;
  if (!rows?.length) return { w: 0, l: 0 };

  const stats = { w: 0, l: 0, p: 0 };
  for (const row of rows) {
    const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : (row.picks || row.picks_array || []);
    for (const pick of picks) {
      if (leagueFilter && pick.league?.toUpperCase() !== leagueFilter) continue;
      const league = pick.league || (table === 'weekly_nfl_picks' ? 'NFL' : 'UNKNOWN');
      
      // For weekly NFL, search a range around the date to handle UTC and different game days
      let gameDate = date;
      let hs = null, vs = null;
      let matchedGame = null;
      let swapped = false;

      // Pick may store the BDL game id as `game_id` or `bdl_game_id` (we add this
      // at pick-generation time). Match by ID first to avoid grabbing a different
      // day's same-teams game (UTC bleed) or the wrong half of a doubleheader.
      const pickGameId = pick.game_id ?? pick.bdl_game_id ?? null;

      // SOCCER (World Cup): grade from FIFA match data on the 90' REGULATION score
      // (first half + second half) — NOT BDL (no soccer there) and NOT home_score
      // (which includes extra time). to_advance uses ET + penalties.
      let soccerResult = null;
      const isSoccerPick = pick.league === 'WC' || pick.league === 'soccer_world_cup' || !!pick.soccer_match_id;
      if (isSoccerPick) {
        if (!pick.soccer_match_id) continue; // cannot grade without the match id
        const wcMatches = await fifaWorldCup.getMatches({ matchIds: [pick.soccer_match_id] });
        const wcMatch = wcMatches[0];
        if (!wcMatch || wcMatch.status !== 'completed') continue; // not final — leave pending
        const reg = fifaWorldCup.getRegulationScore(wcMatch);
        if ((pick.type || '').toLowerCase() === 'to_advance') {
          const adv = fifaWorldCup.getAdvanceResult(wcMatch);
          const pickedHome = (pick.pick || '').toLowerCase().includes((wcMatch.home_team?.name || '').toLowerCase());
          const pickedId = pickedHome ? wcMatch.home_team?.id : wcMatch.away_team?.id;
          soccerResult = adv ? (adv.teamId === pickedId ? 'won' : 'lost') : null;
        } else {
          soccerResult = gradeSoccerGame(
            { ...pick, homeTeam: wcMatch.home_team?.name, awayTeam: wcMatch.away_team?.name },
            reg.home, reg.away
          );
        }
        if (soccerResult == null) continue;
        hs = reg.home; vs = reg.away;
        const wcDate = (wcMatch.datetime || '').slice(0, 10);
        if (wcDate) gameDate = wcDate;
      } else if (table === 'weekly_nfl_picks') {
        const dateObj = new Date(date);
        for (let i = 0; i <= 7; i++) {
          const checkDate = new Date(dateObj);
          checkDate.setDate(dateObj.getDate() + i);
          const dStr = checkDate.toISOString().split('T')[0];
          const games = await fetchGames(league, dStr);
          const result = matchGame(games, pick.homeTeam, pick.awayTeam, pickGameId);
          if (result && result.game.status === 'Final') {
            matchedGame = result.game;
            swapped = result.swapped;
            gameDate = dStr;
            break;
          }
        }
      } else {
        // MLB: use ET-aware fetch to handle BDL's UTC-based date indexing.
        // Other sports: single-date fetch is fine (their date field aligns with ET).
        const games = league === 'MLB'
          ? await fetchMlbGamesForETDate(date)
          : await fetchGames(league, date);
        const result = matchGame(games, pick.homeTeam, pick.awayTeam, pickGameId);
        if (result) {
          matchedGame = result.game;
          swapped = result.swapped;
        }
      }

      if (matchedGame) {
        // MLB: scores are in scoring_summary (last entry has final scores), not top-level fields
        let homeScore = matchedGame.home_team_score ?? matchedGame.home_score ?? null;
        let awayScore = matchedGame.visitor_team_score ?? matchedGame.away_score ?? matchedGame.visitor_score ?? null;
        if (homeScore == null && Array.isArray(matchedGame.scoring_summary) && matchedGame.scoring_summary.length > 0) {
          const final = matchedGame.scoring_summary[matchedGame.scoring_summary.length - 1];
          homeScore = final.home_score ?? null;
          awayScore = final.away_score ?? null;
        }
        if (swapped) {
          hs = awayScore;
          vs = homeScore;
        } else {
          hs = homeScore;
          vs = awayScore;
        }
        // Normalize the game date to ET to ensure it aligns with app's "Yesterday" view.
        // Strip any time component — game_results.game_date is a DATE column and existing
        // rows are stored as YYYY-MM-DD. Passing a full ISO datetime works in Postgres
        // (it truncates) but produces inconsistent date strings in iOS lookups.
        const normalized = normalizeToETDate(matchedGame) || gameDate;
        gameDate = typeof normalized === 'string' ? normalized.slice(0, 10) : normalized;
      }

      if (hs === null) {
        const g = await getScoreGrounding(league, pick.homeTeam, pick.awayTeam, date);
        if (g) { hs = g.h; vs = g.v; }
      }

      if (soccerResult != null || hs !== null) {
        const res = soccerResult != null ? soccerResult : gradeGame(pick.pick, pick.homeTeam, pick.awayTeam, hs, vs);
        
        // NFL picks go to nfl_results table, others go to game_results.
        // pick_id resolves to the per-pick UUID from the picks[] JSON (so a future
        // server-side join can target the specific pick), with the parent daily_picks
        // row id as a backwards-compatible fallback.
        // Insert with error handling. Prior version used bare `await
        // supabase.from(...).insert(...)` with no { error } check, then
        // unconditionally incremented stats and logged ✅. Silent failures
        // (RLS, schema mismatch, key expired, etc.) produced summary lines
        // claiming wins/losses that never actually landed — and the iOS app
        // showed no W/L badges because game_results was empty. The audit
        // flagged this as the #1 critical correctness issue; this is the fix.
        //
        // pick_id MUST be a UUID — the column is typed UUID. A previous "fix"
        // tried to use the per-pick slug id from picks[] JSON
        // ("pick-2026-05-28-mlb-tigers-angelsml112-0"), which Postgres rejected
        // with code 22P02. The slug isn't a UUID; the daily_picks row PK is.
        // iOS doesn't read pick_id so storing the parent row id is correct.
        const perPickId = row.id;
        const targetTable = league === 'NFL' ? 'nfl_results' : 'game_results';
        const insertPayload = league === 'NFL'
          ? {
              nfl_pick_id: perPickId, game_date: gameDate, result: res,
              final_score: `${vs}-${hs}`, pick_text: pick.pick,
              matchup: `${pick.awayTeam} @ ${pick.homeTeam}`,
            }
          : {
              pick_id: perPickId, game_date: gameDate, league, result: res,
              final_score: `${vs}-${hs}`, pick_text: pick.pick,
              matchup: `${pick.awayTeam} @ ${pick.homeTeam}`,
            };

        let alreadyExists = false;
        let insertFailed = false;
        const { data: exist, error: dedupErr } = await supabase
          .from(targetTable)
          .select('id')
          .eq('pick_text', pick.pick)
          .eq('game_date', gameDate)
          .maybeSingle();
        if (dedupErr) {
          console.error(`  ❌ DEDUP CHECK FAILED [${targetTable}] ${league} "${pick.pick}" (${gameDate}): ${dedupErr.message}`);
          insertFailed = true;
        } else if (exist) {
          alreadyExists = true;
        } else {
          const { error: insertErr } = await supabase.from(targetTable).insert(insertPayload);
          if (insertErr) {
            console.error(`  ❌ INSERT FAILED [${targetTable}] ${league} "${pick.pick}" (${gameDate}): ${insertErr.message}${insertErr.code ? ' [code=' + insertErr.code + ']' : ''}${insertErr.details ? ' details=' + insertErr.details : ''}${insertErr.hint ? ' hint=' + insertErr.hint : ''}`);
            insertFailed = true;
          }
        }

        if (insertFailed) {
          // Don't fictionalize the W/L count when the row didn't land — iOS
          // reads game_results directly, so an uncounted stat is more honest
          // than a counted-but-missing row.
          console.error(`  ⛔ Skipped stats counter for ${league} "${pick.pick}" due to insert failure (row not in ${targetTable})`);
        } else {
          stats[res[0]]++;
          const tag = alreadyExists ? '⏩ ALREADY' : '✅';
          console.log(`  ${tag} ${league}: ${pick.pick} -> ${res.toUpperCase()} (${vs}-${hs}) on ${gameDate}`);

          // Fact-check the rationale against the actual outcome. Runs on
          // re-grades too (alreadyExists) — its own dedup makes that a no-op
          // unless the fact check is missing. Never fatal to grading.
          try {
            await factCheckGradedPick({ pick, league, gameDate, result: res, hs, vs, matchedGame });
          } catch (e) {
            console.warn(`  ⚠️ Fact-check failed (non-fatal) for ${league} "${pick.pick}": ${e.message}`);
          }
        }
      }
    }
  }
  return stats;
}

async function processPropBets(date) {
  console.log(`\n🎯 Processing PROP BETS for ${date}...`);
  const next = new Date(date); next.setDate(next.getDate() + 1);
  const nextStr = next.toISOString().split('T')[0];
  
  const { data: rows } = await supabase.from('prop_picks').select('*').in('date', [date, nextStr]);
  if (!rows?.length) return { w: 0, l: 0 };

  const dates = [date, nextStr];
  const nbaBox = (await Promise.all(dates.map(d => fetchBoxScores('NBA', d)))).flat();
  const nhlBox = (await Promise.all(dates.map(d => fetchBoxScores('NHL', d)))).flat();
  const nflGames = (await Promise.all(dates.map(d => fetchGames('NFL', d)))).flat();
  // MLB: no box_scores endpoint — fetch games then stats by game_ids (same pattern as NFL)
  const mlbGames = (await Promise.all(dates.map(d => fetchGames('MLB', d)))).flat();
  const mlbStats = await fetchMLBStats([...new Set(mlbGames.map(g => g.id).filter(Boolean))]);
  const nflStats = await fetchNFLStats([...new Set(nflGames.map(g => g.id))]);

  console.log(`  📊 Data loaded: NBA=${nbaBox.length} box scores, NHL=${nhlBox.length} box scores, MLB=${mlbStats.length} player stats, NFL=${nflStats.length} player stats`);

  const stats = { w: 0, l: 0 };
  const handled = new Set();

  for (const row of rows) {
    const picks = typeof row.props === 'string' ? JSON.parse(row.props) : (row.props || row.picks || []);
    for (const p of picks) {
      const name = p.player || p.player_name, rawProp = p.prop || p.prop_type, type = rawProp?.split(' ')?.[0] || rawProp;
      const line = p.line || p.line_value, bet = p.bet;
      // 'MLB HR' is the dedicated home-run lane's sport label: it keeps its
      // own label in prop_results (own record, never mixed into the main MLB
      // props record) but routes to MLB data sources for grading.
      const sport = p.sport?.toUpperCase();
      const dataSport = sport === 'MLB HR' ? 'MLB' : sport;
      if (!name || !type || line === undefined) continue;

      const key = `${normalizeName(name)}-${type}-${line}-${row.date}`;
      if (handled.has(key)) continue; handled.add(key);

      // Check if result already exists before processing
      const { data: exist } = await supabase.from('prop_results').select('id').eq('player_name', name).eq('prop_type', type).eq('game_date', row.date).maybeSingle();
      if (exist) {
        console.log(`  ⏩ Skipping ${sport}: ${name} ${type} (Already exists)`);
        continue;
      }

      let actual = null;
      let source = 'none';
      if (dataSport === 'NBA') actual = getStatValue('NBA', nbaBox, name, type);
      else if (dataSport === 'NHL') actual = getStatValue('NHL', nhlBox, name, type);
      else if (dataSport === 'MLB') actual = getStatValue('MLB', mlbStats, name, type);
      else if (dataSport === 'NFL') actual = getStatValue('NFL', nflStats, name, type);

      if (actual !== null) {
        source = 'api';
      } else {
        console.warn(`    [BDL Miss] ${sport}: ${name} "${type}" not found in box scores — trying grounding`);
        actual = await getPropGrounding(dataSport, name, type, row.date);
        if (actual !== null) source = 'grounding';
      }

      if (actual !== null) {
        const res = gradeProp(actual, line, bet);
        let propInsertFailed = false;
        let propAlreadyExists = false;
        const { data: exist, error: dedupErr } = await supabase
          .from('prop_results')
          .select('id')
          .eq('player_name', name)
          .eq('prop_type', type)
          .eq('game_date', row.date)
          .maybeSingle();
        if (dedupErr) {
          console.error(`  ❌ DEDUP CHECK FAILED [prop_results] ${sport} "${name} ${type}" (${row.date}): ${dedupErr.message}`);
          propInsertFailed = true;
        } else if (exist) {
          propAlreadyExists = true;
        } else {
          const { error: insertErr } = await supabase.from('prop_results').insert({
            prop_pick_id: row.id, game_date: row.date, player_name: name,
            prop_type: type, line_value: line, actual_value: actual,
            result: res, pick_text: `${name} ${bet} ${line} ${type}`,
            matchup: p.matchup, bet: bet,
            odds: p.odds != null ? String(p.odds) : null,
          });
          if (insertErr) {
            console.error(`  ❌ INSERT FAILED [prop_results] ${sport} "${name} ${type}" (${row.date}): ${insertErr.message}${insertErr.code ? ' [code=' + insertErr.code + ']' : ''}${insertErr.details ? ' details=' + insertErr.details : ''}${insertErr.hint ? ' hint=' + insertErr.hint : ''}`);
            propInsertFailed = true;
          }
        }

        if (propInsertFailed) {
          console.error(`  ⛔ Skipped prop stats counter for ${sport} "${name} ${type}" due to insert failure`);
        } else {
          stats[res[0]]++;
          const tag = propAlreadyExists ? '⏩ ALREADY' : '🎯';
          console.log(`  ${tag} ${sport}: ${name} ${type} ${bet} ${line} -> ${res.toUpperCase()} (${actual}) [${source}]`);
        }
      } else {
        console.error(`  ❌ ${sport}: ${name} ${type} — NO DATA from API or grounding. Prop not graded.`);
      }
    }
  }
  return stats;
}

async function main() {
  const targetDate = getTargetDate();
  console.log(`\n📅 TARGET DATE: ${targetDate}`);
  
  const daily = await processGenericGames('daily_picks', targetDate);
  
  // Weekly NFL - find the Monday of the target date's week
  const dateParts = targetDate.split('-').map(Number);
  const d = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const weekDay = new Date(d.setDate(diff));
  const weekStart = weekDay.toISOString().split('T')[0];
  
  const weeklyNFL = await processGenericGames('weekly_nfl_picks', weekStart, 'NFL');
  
  const props = await processPropBets(targetDate);

  console.log(`\n════════════════════════════════════════`);
  console.log(`SUMMARY FOR ${targetDate}`);
  console.log(`Daily:  ${daily.w}W - ${daily.l}L`);
  console.log(`Weekly: ${weeklyNFL.w}W - ${weeklyNFL.l}L`);
  console.log(`Props:  ${props.w}W - ${props.l}L`);
  console.log(`TOTAL:  ${daily.w + weeklyNFL.w + props.w}W - ${daily.l + weeklyNFL.l + props.l}L`);
  console.log(`════════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('\n❌ FATAL ERROR:', err);
  process.exit(1);
});
