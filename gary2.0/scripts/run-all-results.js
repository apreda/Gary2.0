#!/usr/bin/env node
/**
 * Ultimate Results Script (Gary 2.0)
 * - Prop bets (NBA, NHL, NFL, NCAAF, MLB) — graded FIRST so recaps can cite real prop prices
 * - Daily picks (NBA, NHL, NFL, NCAAB, NCAAF, MLB) + betting recaps & fact checks
 * - Weekly NFL picks
 * - Night highlights (league-wide standout stat lines → night_highlights)
 * - Streaks (team W/L + O/U runs, player hit/hitless/HR runs → streaks)
 * - Uses BallDontLie (BDL) as primary source
 * - Uses Gemini Grounding (Google Search) as fallback
 * 
 * Usage: node scripts/run-all-results.js [YYYY-MM-DD]
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { pickSide, matchGame } from '../src/services/teamMatch.js';
import { factCheckPick, buildGameEvidence } from '../src/services/factCheck.js';
import { generateRecap, filterPropsForGame, headlineNeedsRepair } from '../src/services/gameRecap.js';
import { runNightHighlights } from '../src/services/nightHighlights.js';
import { writeStreaks } from '../src/services/streaksService.js';
import { waitForBdlRequestSlot } from '../src/services/bdlRequestGate.js';
import {
  findExactNcaafStatRow,
  ncaafActualFromStatRow,
} from '../src/services/ncaafPropStats.js';
import { ncaafSlateDateForKickoff } from '../src/services/ncaafGamePolicy.js';
import {
  assertFootballSettlementCoverage,
  buildFootballSettlementOutcome,
  buildNflResultWritePayload,
  gradeGameSpread,
  gradePropResult,
  isFinalGameStatus,
  nflActualFromStatRow,
  nflSeasonTypeForGame,
  normalizeStoredPropType,
  pickGameId as storedPickGameId,
  propGameId,
  propResultIdentity,
  requiredPropSourceSports,
  statsForGame,
} from './lib/resultsGradingReliability.js';
import {
  FOOTBALL_SETTLEMENT_SPORTS,
  nflWeekStartForDate,
  parseResultsRunArgs,
  runFootballSettlementDates,
  sportAllowed,
} from './lib/resultsRunMode.js';
// Load environment variables FIRST (centralized)
await import('../src/loadEnv.js');

const RUN_OPTIONS = parseResultsRunArgs(process.argv.slice(2));

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
const cache = { games: new Map(), stats: new Map(), box: new Map(), propRows: new Map() };

// ET-anchored date (mirrors the cloud grade-results function's estDate so the
// dates we grade/recap line up with how games are filed — game_date IS the ET
// slate day).
const estDate = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
};

// Explicit CLI date wins; otherwise default to ET-yesterday.
const getTargetDate = () => {
  if (RUN_OPTIONS.explicitDate) return RUN_OPTIONS.explicitDate;
  return estDate(-1);
};

// When no CLI date is passed, cover TODAY + YESTERDAY (ET) just like the cloud
// grade-results function (estDate(0)/estDate(-1)). The cloud grader settles
// today's games as they finish, but game_recaps (the Home marquee headline
// TEXT) is written only by this local path — so grading+recapping today AS
// games settle rolls the headline same-day instead of waiting for the 2am
// yesterday-only pass. Every step here is idempotent per date.
const getTargetDates = () => {
  if (RUN_OPTIONS.explicitDate) return [RUN_OPTIONS.explicitDate];
  return [estDate(0), estDate(-1)];
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
  // Ask for scores by team name — avoids errors when pick's home/away doesn't match reality.
  // Grounding must NEVER settle a game that isn't over: demand a FINAL score and take "null"
  // for anything in progress/postponed/suspended/scheduled. The caller also gates this to
  // games the box-score provider lacks; this prompt guard is defense in depth.
  const query = `What was the FINAL score of the ${league} game between ${teamA} and ${teamB} on ${date}? Only answer if the game is already COMPLETED/FINAL. If it is still in progress, postponed, suspended, scheduled, or has not finished, respond ONLY "null". Respond ONLY as "${teamA} score"-"${teamB} score" (e.g. 115-102 means ${teamA} scored 115 and ${teamB} scored 102). If unknown or not final, say "null".`;
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
  const attempts = RUN_OPTIONS.footballSettlements ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // The narrow manual football backstop shares a five-starts/minute BDL
      // account with the live-score function. Keep this process to three evenly
      // spaced starts/minute and give a collision-throttled request one retry.
      // The historical full/nightly mode is intentionally unchanged.
      if (RUN_OPTIONS.footballSettlements) {
        await waitForBdlRequestSlot(`football-results ${path}`);
      }
      const res = await fetch(url, { headers: { 'Authorization': BDL_API_KEY } });
      if (res.ok) return await res.json();
      if (res.status === 429 && attempt + 1 < attempts) {
        console.warn(`  ⚠️ BDL ${path} rate-limited; retrying on the next guarded slot`);
        continue;
      }
      const message = `BDL ${path} returned HTTP ${res.status}`;
      if (RUN_OPTIONS.footballSettlements) throw new Error(message);
      console.warn(`  ⚠️ ${message}`);
      return null;
    } catch (e) {
      if (attempt + 1 >= attempts) {
        if (RUN_OPTIONS.footballSettlements) {
          throw new Error(`BDL ${path} failed after ${attempts} attempt(s): ${e.message}`, { cause: e });
        }
        return null;
      }
    }
  }
  return null;
}

async function fetchGames(league, date) {
  const key = `${league}-${date}`;
  if (cache.games.has(key)) return cache.games.get(key);

  // NBA uses v1/ while others use league/v1/
  const normalizedLeague = league.toUpperCase();
  const path = normalizedLeague === 'NBA' ? 'v1/games' : `${league.toLowerCase()}/v1/games`;
  const params = new URLSearchParams();
  params.append('dates[]', date);
  // BDL's NFL endpoint does not include preseason unless season_type is
  // explicit. Settlement must cover every stored NFL market: preseason (1),
  // regular season (2), and postseason (3).
  if (normalizedLeague === 'NFL') {
    for (const seasonType of [1, 2, 3]) params.append('season_type[]', String(seasonType));
  }
  const data = await bdlFetch(path, params.toString());
  const games = data?.data || [];
  cache.games.set(key, games);
  return games;
}

async function fetchNCAAFGames(date) {
  const key = `NCAAF-full-${date}`;
  if (cache.games.has(key)) return cache.games.get(key);

  const nextUtcDate = (() => {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  })();

  // A college Saturday can exceed one page, and late ET kickoffs can be filed
  // under the next UTC provider date. Pull both complete provider dates, then
  // filter back to the requested ET slate so tomorrow's games cannot leak in.
  const games = [];
  for (const providerDate of [date, nextUtcDate]) {
    const providerKey = `NCAAF-provider-${providerDate}`;
    let providerGames = cache.games.get(providerKey);
    if (!providerGames) {
      providerGames = [];
      let cursor = null;
      for (let page = 0; page < 10; page += 1) {
        const cursorParam = cursor != null ? `&cursor=${encodeURIComponent(cursor)}` : '';
        const data = await bdlFetch(
          'ncaaf/v1/games',
          `dates[]=${providerDate}&per_page=100${cursorParam}`,
        );
        if (!data) break;
        providerGames.push(...(data.data || []));
        cursor = data?.meta?.next_cursor ?? null;
        if (cursor == null) break;
      }
      cache.games.set(providerKey, providerGames);
    }
    games.push(...providerGames);
  }

  const unique = [...new Map(
    games.filter((game) => game?.id != null).map((game) => [String(game.id), game]),
  ).values()];
  const exactEtSlate = unique.filter((game) => ncaafSlateDateForKickoff(game) === date);
  cache.games.set(key, exactEtSlate);
  return exactEtSlate;
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

async function fetchNFLStats(games) {
  if (!games.length) return [];
  const exactGames = games
    .filter((game) => game?.id != null)
    .map((game) => ({ game, gameId: String(game.id), seasonType: nflSeasonTypeForGame(game) }));
  const key = `nfl-stats-${exactGames.map(({ gameId, seasonType }) => `${gameId}:${seasonType}`).join(',')}`;
  if (cache.stats.has(key)) return cache.stats.get(key);

  // Fetch one game at a time and stamp every row with that exact source id.
  // The NFL endpoint's stat rows do not reliably expose their game id, so a
  // date-wide batch cannot safely attribute a same-name player to one game.
  // `season_type` is mandatory for preseason/postseason; BDL otherwise defaults
  // to regular season and returns a clean-but-empty array for an exact August
  // preseason game id.
  const stats = [];
  for (const { gameId, seasonType } of exactGames) {
    const data = await bdlFetch(
      'nfl/v1/stats',
      `game_ids[]=${gameId}&season_type=${seasonType}&per_page=100`,
    );
    if (data?.data) {
      stats.push(...data.data.map((row) => ({ ...row, _game_id: String(gameId) })));
    }
  }
  cache.stats.set(key, stats);
  return stats;
}

async function fetchNCAAFStats(gameIds) {
  if (!gameIds.length) return [];
  const key = `ncaaf-stats-${gameIds.join(',')}`;
  if (cache.stats.has(key)) return cache.stats.get(key);

  // As with NFL, fetch and stamp one exact game at a time. A date-wide pool is
  // not sufficient attribution for a college slate with many same-name players.
  const stats = [];
  for (const gameId of gameIds) {
    let cursor = null;
    for (let page = 0; page < 10; page += 1) {
      const cursorParam = cursor != null ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const data = await bdlFetch('ncaaf/v1/player_stats', `game_ids[]=${gameId}&per_page=100${cursorParam}`);
      if (!data) break;
      // Do not blindly trust/filter-stamp a response row. NCAAF rows expose a
      // nested game id, so require it to equal the requested final game before
      // it is eligible to grade anything.
      stats.push(...(data.data || [])
        .filter((row) => String(row?.game?.id ?? '') === String(gameId))
        .map((row) => ({ ...row, _game_id: String(gameId) })));
      cursor = data?.meta?.next_cursor ?? null;
      if (cursor == null) break;
    }
  }
  cache.stats.set(key, stats);
  return stats;
}

/**
 * Gary's graded props around a date (±1 day to absorb pick-date vs ET-game-date
 * drift). Used to enrich the recap evidence pack with REAL betting prices so
 * slide bullets can carry the betting lens. One Supabase query per date, cached.
 * Nightly ordering note: main() grades props BEFORE game picks so these rows
 * exist by the time recaps are written.
 */
async function fetchGradedPropRowsAround(dateStr) {
  if (cache.propRows.has(dateStr)) return cache.propRows.get(dateStr);
  const base = new Date(`${dateStr}T12:00:00Z`);
  const dates = [-1, 0, 1].map((off) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + off);
    return d.toISOString().slice(0, 10);
  });
  const { data, error } = await supabase
    .from('prop_results')
    .select('player_name, prop_type, line_value, actual_value, result, bet, odds, matchup')
    .in('game_date', dates);
  if (error) {
    console.warn(`  ⚠️ prop_results fetch failed (recap evidence will omit props): ${error.message}`);
    cache.propRows.set(dateStr, []);
    return [];
  }
  cache.propRows.set(dateStr, data || []);
  return data || [];
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
    // Tag each row with its source game so prop grading can scope the player
    // search to the pick's OWN game (local-only field, never stored).
    if (data?.data) allStats.push(...data.data.map(s => ({ ...s, _game_id: String(gameId) })));
  }
  console.log(`  📊 MLB stats: ${allStats.length} player entries for ${gameIds.length} games`);
  cache.stats.set(key, allStats);
  return allStats;
}

/**
 * Matching & Grading
 * matchGame() now lives in src/services/teamMatch.js (shared + tested) —
 * see that file for the Jul 15 2026 swapped-by-default fix.
 */
function gradeGame(pickText, homeTeam, awayTeam, hScore, vScore) {
  const pickLower = pickText.toLowerCase();

  // 1. Moneyline Detection (Prioritize this)
  const isML = pickLower.includes(' ml') || pickLower.includes('moneyline');

  // 2. Total (Over/Under) — team-agnostic.
  const totalMatch = pickText.match(/(over|under)\s+(\d+\.?\d*)/i);
  if (totalMatch) {
    const line = parseFloat(totalMatch[2]), actual = hScore + vScore;
    if (actual === line) return 'push';
    return (totalMatch[1].toLowerCase() === 'over' ? actual > line : actual < line) ? 'won' : 'lost';
  }

  // Side resolved via the tokens that DISTINGUISH the two teams (never a shared mascot
  // like "Sox"), so a same-mascot matchup can't flip the result. See teamMatch.js.
  const side = pickSide(pickText, homeTeam, awayTeam);

  // 3. Spread (Only if not a Moneyline pick)
  if (!isML) {
    const spreadResult = gradeGameSpread(pickText, side, hScore, vScore);
    if (spreadResult) return spreadResult;
  }

  // 3-way moneyline DRAW pick (win · tie · lose) — wins only on a level
  // result. Checked before the team-ML fallback, which would otherwise
  // misgrade a correct draw pick as a loss.
  if (/\b(draw|tie)\b/.test(pickLower)) return (hScore === vScore) ? 'won' : 'lost';

  // 4. Moneyline / team-to-win. A team-to-win ML loses on a draw — (hScore > vScore)
  // is false on a level result, so a tie correctly grades 'lost'.
  if (side === 'home') return (hScore > vScore) ? 'won' : 'lost';
  if (side === 'away') return (vScore > hScore) ? 'won' : 'lost';

  // Not classifiable as ML/spread/total/draw AND no distinguishing team token —
  // this isn't a team-score bet at all (e.g. a player prop like "Freeman to win
  // ASG MVP" living in daily_picks instead of the dedicated props table).
  // Leave it ungraded rather than fabricate a loss (Jul 15 2026: this used to
  // return 'lost' unconditionally here, so "Freeman to win ASG MVP" and "Cease
  // 2+ strikeouts" both got marked LOST with the team's final score attached,
  // regardless of the real outcome).
  return null;
}

/**
 * Prop Value Extraction
 */
function getStatValue(sport, data, name, type, playerId = null) {
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
    // Last name + first initial (handles "V. Guerrero Jr." vs "Vladimir
    // Guerrero Jr."). Jul 30: the code matched on SURNAME ALONE — two
    // same-surname players in one game's stat pull graded the prop on
    // whichever appeared first (the attribution-swap class). The initial
    // is now required whenever both sides carry one.
    const last = normalizeName(lastName);
    if (last === targetLast && last.length > 3) {
      const fi = normalizeName(firstName).charAt(0);
      const ti = target.charAt(0);
      return !fi || !ti || fi === ti;
    }
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
    if (p) return nflActualFromStatRow(p, type, data);
  } else if (sport === 'NCAAF') {
    // Generation stamps the exact BDL roster id. Require it here too: a
    // college game can contain duplicate/similar names, so name-only matching
    // is not authoritative enough to settle money.
    const p = findExactNcaafStatRow(data, playerId);
    if (p) return ncaafActualFromStatRow(p, type);
  } else if (sport === 'MLB') {
    // BDL /mlb/v1/stats returns flat array with player objects
    const p = findPlayerFlat(data) || findPlayerInGames(data);
    if (p) {
      // BDL MLB stats fields: at_bats, runs, hits, rbi, hr, bb, k, avg, obp, slg,
      // ip, p_hits, p_runs, er, p_bb, p_k, p_hr, pitch_count, strikes, era
      // NOTE: total_bases and stolen_bases are NOT in BDL — compute or skip

      // Batter props
      // Combo prop FIRST — "hits_runs_rbis" contains "rbi" as a substring, so it must be
      // checked before the individual rbi/hit tests below or it gets intercepted by them
      // and graded on RBI count alone instead of the hits+runs+rbi sum.
      if (t.includes('hits_runs_rbi') || t.includes('h+r+rbi')) return (p.hits || 0) + (p.runs || 0) + (p.rbi || 0);
      // PITCHER props must be tested BEFORE their batter cousins — every one
      // contains the batter word as a substring ('pitcher_walks' ⊃ 'walk'),
      // and the generic branch graded Skenes' 4-walk start on batter-bb 0
      // (Aug 19: "pitcher walks over 1.5" settled LOST on a 4-walk night).
      if (t.includes('pitcher_walk') || t.includes('walks_allowed')) return p.p_bb ?? 0;
      if (t.includes('pitcher_hit') || t.includes('hits_allowed')) return p.p_hits ?? 0;
      if (t.includes('pitcher_home_run') || t.includes('home_runs_allowed')) return p.p_hr ?? 0;
      if (t.includes('hit') && !t.includes('run') && !t.includes('allow') && !t.includes('pitcher')) return p.hits ?? 0;
      if (t.includes('home_run') || t.includes('homer')) return p.hr ?? p.home_runs ?? 0;
      if (t.includes('total_base')) {
        // BDL doesn't have total_bases — compute from hits if we have component data
        if (p.total_bases != null) return p.total_bases;
        // Can't compute without doubles/triples — return null to try grounding
        return null;
      }
      if (t.includes('rbi') || t.includes('runs_batted')) return p.rbi ?? 0;
      if (t.includes('runs_scored') || t === 'runs') return p.runs ?? 0;
      if ((t.includes('walk') || t.includes('bases_on_ball')) && !t.includes('pitcher')) return p.bb ?? 0;
      if (t.includes('stolen_base') || t.includes('steal')) {
        if (p.stolen_bases != null) return p.stolen_bases;
        if (p.sb != null) return p.sb;
        return null; // BDL may not have SB — let grounding try
      }
      if (t.includes('single')) return null; // Need doubles/triples which BDL may not have
      if (t.includes('double') && !t.includes('play')) return p.doubles ?? null;
      // Strikeouts — keyed by the BOARD's own semantics (Jul 30, the Jun 4
      // "attribution-swap" class): 'pitcher_strikeouts' = p_k, bare
      // 'strikeouts' = the BATTER's Ks (row.k on the board). The old
      // "pitcher first if p_k > 0" heuristic graded a batter-Ks prop on
      // PITCHING Ks any night the player also pitched.
      if (t.includes('strikeout')) {
        if (t.includes('pitcher')) return p.p_k ?? 0;
        if (p.k != null) return p.k;
        return p.p_k ?? 0; // legacy pitcher props stored as bare 'strikeouts'
      }
      // Pitcher props
      if (t.includes('pitcher_out') || t.includes('outs_recorded')) {
        // MLB IP is THIRDS notation ("5.2" = 5⅔ = 17 outs) — the old
        // `ip * 3` graded 16 on every fractional line (Jul 30).
        if (p.ip != null) {
          const raw = parseFloat(p.ip);
          if (Number.isFinite(raw)) return Math.floor(raw) * 3 + Math.round((raw % 1) * 10);
        }
        return null;
      }
      if (t.includes('pitcher_earned') || t.includes('earned_run')) return p.er ?? 0;
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
 * Betting Recap
 * After a game pick is graded, write a 2-4 sentence ESPN-style recap of the
 * game from the betting perspective (rows land in game_recaps; the app reads
 * them to tell last night's story). Same evidence pack as the fact check —
 * fetchMLBStats is cached, so the second build is free. Game picks only —
 * props never reach this path. Non-fatal by design: callers wrap it in
 * try/catch so a recap failure can never break results grading.
 */
async function recapGradedPick({ pick, league, gameDate, result, hs, vs, matchedGame }) {
  const matchup = `${pick.awayTeam} @ ${pick.homeTeam}`;

  // Idempotency: skip matchups already recapped for this date (mirrors the
  // pick_fact_checks dedup check above) — UNLESS the stored recap's result no
  // longer matches the freshly-computed grade (Jul 10 2026 fix: game_recaps has
  // no updated_at column, so a re-grade that corrected game_results previously
  // left a stale recap narrating the old, wrong outcome forever — same class of
  // bug as writeRecap() in the cloud grade-results function).
  const { data: exist, error: dedupErr } = await supabase
    .from('game_recaps')
    .select('id, result, headline')
    .eq('game_date', gameDate)
    .eq('league', league)
    .eq('matchup', matchup)
    .maybeSingle();
  if (dedupErr) {
    console.warn(`  ⚠️ Recap dedup failed for ${matchup}: ${dedupErr.message}`);
    return;
  }
  const stale = !!exist && exist.result !== result;
  const editorialRepair = !!exist && headlineNeedsRepair(exist.headline);
  if (exist && !stale && !editorialRepair) {
    console.log(`  ⏩ Recap exists: ${league} ${matchup} (${gameDate})`);
    return;
  }

  // Evidence: final score + (MLB) the per-game BDL player stats we already
  // fetch for prop grading — pitcher lines, HRs, team hit totals — plus this
  // game's graded props WITH their real prices, so bullets can carry the
  // betting lens without inventing odds.
  let mlbStats = null;
  if (league === 'MLB' && matchedGame?.id != null) {
    mlbStats = await fetchMLBStats([matchedGame.id]);
  }
  const propRows = await fetchGradedPropRowsAround(gameDate);
  const gradedProps = filterPropsForGame(propRows, pick.homeTeam, pick.awayTeam);
  const evidence = buildGameEvidence({
    league,
    homeTeam: pick.homeTeam,
    awayTeam: pick.awayTeam,
    homeScore: hs,
    awayScore: vs,
    mlbStats,
    gradedProps,
  });

  // recapGradedPick runs on RE-grades too (its game_recaps dedup above makes it a no-op
  // once a recap exists), so a re-run of any day backfills missing recaps — including days
  // the cloud grader graded without recapping. The one thing that silently dropped a recap
  // on 2026-06-24 was a transient Gemini "Request aborted" throw, so retry generateRecap
  // once before giving up.
  let recap = null;
  for (let attempt = 1; attempt <= 2 && !recap; attempt++) {
    try {
      recap = await generateRecap({ pick, result, evidence });
    } catch (e) {
      console.warn(`  ⚠️ Recap gen attempt ${attempt} failed for ${matchup}: ${e.message}`);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!recap) {
    console.warn(`  ⚠️ Recap produced nothing for ${league} ${matchup}`);
    return;
  }

  if (stale || editorialRepair) {
    const { error: updateErr } = await supabase
      .from('game_recaps')
      .update({ result, headline: recap.headline, recap: recap.recap, bullets: recap.bullets || [] })
      .eq('id', exist.id);
    if (updateErr) {
      console.error(`  ❌ RECAP UPDATE FAILED [game_recaps] ${league} ${matchup} (${gameDate}): ${updateErr.message}`);
    } else {
      console.log(`  📰 Re-recapped ${league} ${matchup} (${stale ? 'grade changed' : 'headline repaired'}): "${recap.headline}"`);
    }
    return;
  }

  const { error: insertErr } = await supabase.from('game_recaps').insert({
    game_date: gameDate,
    league,
    matchup,
    pick_text: pick.pick,
    result,
    headline: recap.headline,
    recap: recap.recap,
    bullets: recap.bullets || [],
  });
  if (insertErr) {
    console.error(`  ❌ RECAP INSERT FAILED [game_recaps] ${league} ${matchup} (${gameDate}): ${insertErr.message}`);
  } else {
    console.log(`  📰 Recapped ${league} ${matchup}: "${recap.headline}"`);
  }
}

let gameResultIdentityColumnAvailable;
let nflResultIdentityColumnAvailable;

async function supportsExactGameResultIdentity() {
  if (gameResultIdentityColumnAvailable !== undefined) return gameResultIdentityColumnAvailable;

  const { error } = await supabase.from('game_results').select('game_id').limit(1);
  if (!error) {
    gameResultIdentityColumnAvailable = true;
    return true;
  }

  const missingColumn = ['42703', 'PGRST204'].includes(String(error.code || ''))
    || /column .*?game_id.*?does not exist|could not find .*?game_id.*?column/i.test(error.message || '');
  if (!missingColumn) throw new Error(`Could not inspect game_results.game_id: ${error.message}`);

  // Keep grading safe while code and schema roll out separately. The legacy
  // lookup still uses league + matchup + pick text + date rather than the old
  // collision-prone pick-text/date pair.
  console.warn('  ⚠️ game_results.game_id is not deployed yet — using legacy-safe result identity');
  gameResultIdentityColumnAvailable = false;
  return false;
}

async function supportsExactNFLResultIdentity() {
  if (nflResultIdentityColumnAvailable !== undefined) return nflResultIdentityColumnAvailable;

  const { error } = await supabase.from('nfl_results').select('game_id').limit(1);
  if (!error) {
    nflResultIdentityColumnAvailable = true;
    return true;
  }

  const missingColumn = ['42703', 'PGRST204'].includes(String(error.code || ''))
    || /column .*?game_id.*?does not exist|could not find .*?game_id.*?column/i.test(error.message || '');
  if (!missingColumn) throw new Error(`Could not inspect nfl_results.game_id: ${error.message}`);

  // Deployment-safe rollout: old code keeps its matchup-aware lookup and fails
  // closed on the historical unique-index collision until the migration lands.
  console.warn('  ⚠️ nfl_results.game_id is not deployed yet — using legacy-safe result identity');
  nflResultIdentityColumnAvailable = false;
  return false;
}

async function fetchExistingGameResult({
  targetTable,
  league,
  gameDate,
  gameId,
  pickText,
  matchup,
  exactGameIdentity,
}) {
  if (exactGameIdentity && gameId) {
    let exactQuery = supabase
      .from(targetTable)
      .select('id')
      .eq('game_date', gameDate)
      .eq('game_id', gameId)
      .eq('matchup', matchup)
      .eq('pick_text', pickText);
    if (targetTable === 'game_results') exactQuery = exactQuery.eq('league', league);
    const { data, error } = await exactQuery.limit(1);
    if (error) throw new Error(`Exact game-result identity lookup failed: ${error.message}`);
    if (data?.[0]) return data[0];
  }

  let query = supabase
    .from(targetTable)
    .select('id')
    .eq('game_date', gameDate)
    .eq('matchup', matchup)
    .eq('pick_text', pickText);
  if (targetTable === 'game_results') {
    query = query.eq('league', league);
  }
  if (exactGameIdentity) query = query.is('game_id', null);

  const { data, error } = await query.limit(1);
  if (error) throw new Error(`Legacy game-result identity lookup failed: ${error.message}`);
  return data?.[0] ?? null;
}

/**
 * Main Logic
 */
function emptySettlementStats() {
  return {
    w: 0,
    l: 0,
    p: 0,
    hrW: 0,
    hrL: 0,
    hrP: 0,
    candidates: 0,
    finalEligible: 0,
    persisted: 0,
    readBack: 0,
    pendingNonFinal: 0,
    invalidIdentity: 0,
    unmatched: 0,
    unresolvedFinal: 0,
    errors: [],
    persistedResultIds: [],
  };
}

async function readBackPersistedResults(table, resultIds, label) {
  const ids = [...new Set((resultIds || []).filter(Boolean).map(String))];
  if (!ids.length) return 0;

  const { data, error } = await supabase.from(table).select('id').in('id', ids);
  if (error) throw new Error(`${label} result readback failed: ${error.message}`);
  const found = new Set((data || []).map((row) => String(row.id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new Error(`${label} result readback missing ${missing.length}/${ids.length} row(s)`);
  }
  return found.size;
}

async function processGenericGames(table, date, leagueFilter = null, { settlementOnly = false } = {}) {
  console.log(`\n📂 Processing ${table.toUpperCase()} for ${date}...`);
  const query = supabase.from(table).select('*');
  if (table === 'daily_picks') query.eq('date', date);
  else query.eq('week_start', date);

  const { data: rows, error: rowsError } = await query;
  if (rowsError) throw new Error(`Could not read ${table} for ${date}: ${rowsError.message}`);
  const stats = emptySettlementStats();
  if (!rows?.length) return stats;

  for (const row of rows) {
    const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : (row.picks || row.picks_array || []);

    // Winners game picks = top 3 per league by (is_top_pick, then confidence) —
    // mirrors the app's Winners game shelves (sortedBest().prefix(3)). We stamp
    // is_winners_pick on the graded row so Home can show a Winners-only record.
    const winnerKey = (p) => `${(p.league || '').toUpperCase()}|${p.pick}|${p.awayTeam} @ ${p.homeTeam}`;
    const winnerKeys = new Set();
    {
      const byLeague = {};
      for (const p of picks) (byLeague[(p.league || 'UNKNOWN').toUpperCase()] ||= []).push(p);
      for (const lg of Object.keys(byLeague)) {
        const ranked = byLeague[lg].slice().sort((a, b) => {
          const at = a.is_top_pick ? 1 : 0, bt = b.is_top_pick ? 1 : 0;
          if (at !== bt) return bt - at;
          return (b.confidence ?? 0) - (a.confidence ?? 0);
        });
        for (const p of ranked.slice(0, 3)) winnerKeys.add(winnerKey(p));
      }
    }

    for (const pick of picks) {
      if (leagueFilter && pick.league?.toUpperCase() !== leagueFilter) continue;
      const league = pick.league || (table === 'weekly_nfl_picks' ? 'NFL' : 'UNKNOWN');
      stats.candidates++;
      
      // For weekly NFL, search a range around the date to handle UTC and different game days
      let gameDate = date;
      let hs = null, vs = null;
      let matchedGame = null;
      let swapped = false;
      // Set when the provider HAS this game but reports it non-final. Blocks the
      // grounding fallback below so an in-progress game is never graded off an LLM
      // "final score" guess (Jul 9: a live Mariners @ Marlins game graded a 4-1 loss
      // while it was in the 4th inning, then went out as a result tweet).
      let gameFoundNotFinal = false;

      // Pick may store the BDL game id as `game_id` or `bdl_game_id` (we add this
      // at pick-generation time). Match by ID first to avoid grabbing a different
      // day's same-teams game (UTC bleed) or the wrong half of a doubleheader.
      const pickGameId = storedPickGameId(pick);

      // College slates are too large for matchup-only attribution. Every new
      // NCAAF pick is stamped with its BDL game id; a legacy/id-less row remains
      // pending rather than risking another game with similar team names.
      if (['NFL', 'NCAAF'].includes(league) && pickGameId == null) {
        stats.invalidIdentity++;
        console.log(`  ⏳ EXACT GAME ID MISSING — leaving ${league} pick pending: ${pick.awayTeam} @ ${pick.homeTeam}`);
        continue;
      }

      if (table === 'weekly_nfl_picks') {
        const dateObj = new Date(`${date}T12:00:00Z`);
        // Include the following UTC date so a Monday-night ET game filed by
        // the provider on Tuesday UTC still settles inside this Tue–Mon row.
        for (let i = 0; i <= 7; i++) {
          const checkDate = new Date(dateObj);
          checkDate.setUTCDate(dateObj.getUTCDate() + i);
          const dStr = checkDate.toISOString().split('T')[0];
          const games = await fetchGames(league, dStr);
          const result = matchGame(games, pick.homeTeam, pick.awayTeam, pickGameId);
          if (result) {
            const statusStr = String(result.game.status ?? '').trim();
            if (!isFinalGameStatus(statusStr)) {
              console.log(`  ⏳ NOT FINAL — skipping grade for ${pick.awayTeam} @ ${pick.homeTeam} (status: ${statusStr || 'missing'})`);
              gameFoundNotFinal = true;
            } else {
              matchedGame = result.game;
              swapped = result.swapped;
              gameDate = dStr;
            }
            // Once the exact weekly game is found, never continue into another
            // date or let grounding invent a final for an in-progress game.
            break;
          }
        }
      } else {
        // MLB: use ET-aware fetch to handle BDL's UTC-based date indexing.
        // Other sports: single-date fetch is fine (their date field aligns with ET).
        const games = league === 'MLB'
          ? await fetchMlbGamesForETDate(date)
          : league === 'NCAAF' ? await fetchNCAAFGames(date)
            : await fetchGames(league, date);
        const result = matchGame(games, pick.homeTeam, pick.awayTeam, pickGameId);
        if (result) {
          // FINALITY GATE — never grade a non-final game. A suspended or
          // in-progress game carries partial scores in the same fields, and the
          // results dedup makes a wrong grade PERMANENT. Status shapes include
          // NFL 'Final/OT', MLB/NHL 'STATUS_FINAL', and NBA 'Final'. A missing
          // NFL status is not proof of completion and remains pending.
          const statusStr = String(result.game.status ?? '').trim();
          const finalStatus = isFinalGameStatus(statusStr);
          if ((['NFL', 'NCAAF'].includes(league) && !finalStatus) || (statusStr && !finalStatus)) {
            console.log(`  ⏳ NOT FINAL — skipping grade for ${pick.awayTeam} @ ${pick.homeTeam} (status: ${statusStr || 'missing'})`);
            gameFoundNotFinal = true; // provider has it but it isn't over — do NOT fall through to grounding
          } else {
            if (!statusStr) {
              console.warn(`  ⚠️ No status on matched game for ${pick.awayTeam} @ ${pick.homeTeam} — grading anyway`);
            }
            matchedGame = result.game;
            swapped = result.swapped;
          }
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
        // A confirmed NCAAF kickoff before 6 AM ET belongs to the prior Gary
        // slate everywhere (picks, live scores, proof, results, and iOS). Store
        // that slate key rather than its wall-clock calendar date.
        const normalized = league === 'NCAAF'
          ? ncaafSlateDateForKickoff(matchedGame)
          : normalizeToETDate(matchedGame);
        gameDate = typeof normalized === 'string' ? normalized.slice(0, 10) : normalized;
      }

      // Grounding is a fallback for a game the PROVIDER LACKS entirely — never for a
      // game the provider reports as still in progress. Without this guard, an
      // in-progress game (box-score path skipped by the finality gate above) fell
      // through here and got graded off an LLM "what was the final score?" answer,
      // posting a premature/wrong result (Jul 9: Mariners ML graded a 4-1 loss while
      // the game was in the 4th inning).
      if (hs === null && !gameFoundNotFinal && league !== 'NCAAF' && !(settlementOnly && league === 'NFL')) {
        const g = await getScoreGrounding(league, pick.homeTeam, pick.awayTeam, date);
        if (g) { hs = g.h; vs = g.v; }
      }

      if (hs !== null && vs !== null) {
        stats.finalEligible++;
        const res = gradeGame(pick.pick, pick.homeTeam, pick.awayTeam, hs, vs);

        // gradeGame couldn't classify this pick as a team-score bet (e.g. a
        // player prop) — leave it pending rather than writing a null/garbage
        // result. See the Jul 15 2026 comment on gradeGame's final return.
        if (res == null) {
          stats.unresolvedFinal++;
          console.log(`  ⏭️  UNGRADEABLE (not a team-score bet) — leaving pending: ${league} "${pick.pick}"`);
          continue;
        }

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
        const resolvedGameId = matchedGame?.id == null ? pickGameId : String(matchedGame.id);
        const exactGameIdentity = targetTable === 'game_results'
          ? await supportsExactGameResultIdentity()
          : targetTable === 'nfl_results'
            ? await supportsExactNFLResultIdentity()
            : false;
        const isWinnersPick = winnerKeys.has(winnerKey(pick));
        const insertPayload = league === 'NFL'
          ? buildNflResultWritePayload({
              mode: 'insert',
              weeklyRow: row,
              pick,
              nflPickId: perPickId,
              gameDate,
              gameId: exactGameIdentity ? resolvedGameId : null,
              result: res,
              homeScore: hs,
              awayScore: vs,
              isWinnersPick,
            })
          : {
              pick_id: perPickId, game_date: gameDate, league, result: res,
              final_score: `${vs}-${hs}`, pick_text: pick.pick,
              matchup: `${pick.awayTeam} @ ${pick.homeTeam}`,
              is_winners_pick: isWinnersPick,
              ...(exactGameIdentity && resolvedGameId ? { game_id: resolvedGameId } : {}),
            };

        let alreadyExists = false;
        let insertFailed = false;
        let persistedResultId = null;
        let exist = null;
        let dedupError = null;
        try {
          exist = await fetchExistingGameResult({
            targetTable,
            league,
            gameDate,
            gameId: resolvedGameId,
            pickText: pick.pick,
            matchup: `${pick.awayTeam} @ ${pick.homeTeam}`,
            exactGameIdentity,
          });
        } catch (error) {
          dedupError = error;
        }
        if (dedupError) {
          console.error(`  ❌ DEDUP CHECK FAILED [${targetTable}] ${league} "${pick.pick}" (${gameDate}): ${dedupError.message}`);
          insertFailed = true;
        } else if (exist) {
          // Row exists from an earlier (possibly mid-game or glitched-"final") grade —
          // RE-GRADE and UPDATE to the current result/score so a wrong early grade
          // self-corrects once the game truly settles, instead of being skipped
          // forever. The game path was still insert-once; this mirrors the prop
          // grader's re-grade fix (the Jun 18 Soto-HR bug). For an already-correct
          // row the update writes the same values — a harmless no-op.
          alreadyExists = true;
          const updatePayload = league === 'NFL'
            ? buildNflResultWritePayload({
                mode: 'update',
                weeklyRow: row,
                pick,
                gameId: exactGameIdentity ? resolvedGameId : null,
                result: res,
                homeScore: hs,
                awayScore: vs,
                isWinnersPick,
              })
            : {
                result: res,
                final_score: `${vs}-${hs}`,
                is_winners_pick: isWinnersPick,
                updated_at: new Date().toISOString(),
                ...(exactGameIdentity && resolvedGameId
                  ? { game_id: resolvedGameId }
                  : {}),
              };
          const { error: updErr } = await supabase
            .from(targetTable)
            .update(updatePayload)
            .eq('id', exist.id);
          if (updErr) {
            console.error(`  ❌ UPDATE FAILED [${targetTable}] ${league} "${pick.pick}" (${gameDate}): ${updErr.message}`);
            insertFailed = true;
          } else {
            persistedResultId = exist.id;
          }
        } else {
          const insertQuery = supabase.from(targetTable).insert(insertPayload);
          const { data: inserted, error: insertErr } = settlementOnly
            ? await insertQuery.select('id').single()
            : await insertQuery;
          if (insertErr) {
            console.error(`  ❌ INSERT FAILED [${targetTable}] ${league} "${pick.pick}" (${gameDate}): ${insertErr.message}${insertErr.code ? ' [code=' + insertErr.code + ']' : ''}${insertErr.details ? ' details=' + insertErr.details : ''}${insertErr.hint ? ' hint=' + insertErr.hint : ''}`);
            insertFailed = true;
          } else if (settlementOnly) {
            persistedResultId = inserted?.id ?? null;
            if (!persistedResultId) {
              console.error(`  ❌ INSERT READBACK ID MISSING [${targetTable}] ${league} "${pick.pick}" (${gameDate})`);
              insertFailed = true;
            }
          }
        }

        if (insertFailed) {
          stats.errors.push(`${targetTable} write failed for ${league} ${pick.pick}`);
          stats.unresolvedFinal++;
          // Don't fictionalize the W/L count when the row didn't land — iOS
          // reads game_results directly, so an uncounted stat is more honest
          // than a counted-but-missing row.
          console.error(`  ⛔ Skipped stats counter for ${league} "${pick.pick}" due to insert failure (row not in ${targetTable})`);
        } else {
          stats.persisted++;
          if (settlementOnly && persistedResultId) stats.persistedResultIds.push(persistedResultId);
          stats[res[0]]++;
          const tag = alreadyExists ? '⏩ ALREADY' : '✅';
          console.log(`  ${tag} ${league}: ${pick.pick} -> ${res.toUpperCase()} (${vs}-${hs}) on ${gameDate}`);

          if (!settlementOnly) {
            // Fact-check the rationale against the actual outcome. Runs on
            // re-grades too (alreadyExists) — its own dedup makes that a no-op
            // unless the fact check is missing. Never fatal to grading.
            try {
              await factCheckGradedPick({ pick, league, gameDate, result: res, hs, vs, matchedGame });
            } catch (e) {
              console.warn(`  ⚠️ Fact-check failed (non-fatal) for ${league} "${pick.pick}": ${e.message}`);
            }

            // Betting recap of the game itself (game_recaps). Same re-grade /
            // dedup semantics as the fact check. Never fatal to grading.
            try {
              await recapGradedPick({ pick, league, gameDate, result: res, hs, vs, matchedGame });
            } catch (e) {
              console.warn(`  ⚠️ Recap failed (non-fatal) for ${league} "${pick.pick}": ${e.message}`);
            }
          }
        }
      } else if (gameFoundNotFinal) {
        stats.pendingNonFinal++;
      } else if (matchedGame) {
        stats.finalEligible++;
        stats.unresolvedFinal++;
        console.error(`  ❌ FINAL SCORE MISSING — ${league} ${pick.awayTeam} @ ${pick.homeTeam}`);
      } else {
        stats.unmatched++;
      }
    }
  }
  if (settlementOnly) {
    const targetTable = table === 'weekly_nfl_picks' ? 'nfl_results' : 'game_results';
    stats.readBack = await readBackPersistedResults(
      targetTable,
      stats.persistedResultIds,
      `${leagueFilter || table} ${date}`,
    );
  }
  return stats;
}

let propResultIdentityColumnsAvailable;

async function supportsExactPropResultIdentity() {
  if (propResultIdentityColumnsAvailable !== undefined) return propResultIdentityColumnsAvailable;

  const { error } = await supabase.from('prop_results').select('game_id,sport').limit(1);
  if (!error) {
    propResultIdentityColumnsAvailable = true;
    return true;
  }

  const missingColumns = ['42703', 'PGRST204'].includes(String(error.code || ''))
    || /column .*?(game_id|sport).*?does not exist|could not find .*?(game_id|sport).*?column/i.test(error.message || '');
  if (!missingColumns) throw new Error(`Could not inspect prop_results identity columns: ${error.message}`);

  // Allows the script and schema migration to roll out independently. The
  // legacy lookup below is more specific than the old three-field query, but
  // exact cross-sport/game identity begins as soon as the migration is applied.
  console.warn('  ⚠️ prop_results.game_id/sport are not deployed yet — using legacy-safe result identity');
  propResultIdentityColumnsAvailable = false;
  return false;
}

function withNullSafeEq(query, column, value) {
  return value == null || String(value).trim() === ''
    ? query.is(column, null)
    : query.eq(column, value);
}

async function fetchExistingPropResult(identity, { exactColumns, claimedIds }) {
  const select = exactColumns ? 'id,game_id,sport,created_at' : 'id,created_at';
  const takeUnclaimed = (rows) => (rows || []).find((row) => !claimedIds.has(row.id)) || null;

  if (exactColumns && identity.gameId && identity.sport) {
    const { data, error } = await supabase
      .from('prop_results')
      .select(select)
      .eq('game_date', identity.gameDate)
      .eq('game_id', identity.gameId)
      .eq('sport', identity.sport)
      .eq('player_name', identity.playerName)
      .eq('prop_type', identity.propType)
      .ilike('bet', identity.bet)
      .eq('line_value', identity.line)
      .limit(2);
    if (error) throw new Error(`Exact prop-result identity lookup failed: ${error.message}`);
    const exact = takeUnclaimed(data);
    if (exact) return exact;
  }

  // Legacy rows predate game_id/sport. Include every identity dimension their
  // schema can represent, then claim each candidate at most once per run. That
  // lets a doubleheader adopt two historical rows instead of repeatedly
  // overwriting the first one while the new columns backfill organically.
  let query = supabase
    .from('prop_results')
    .select(select)
    .eq('prop_pick_id', identity.propPickId)
    .eq('game_date', identity.gameDate)
    .eq('player_name', identity.playerName)
    .eq('prop_type', identity.propType)
    .ilike('bet', identity.bet)
    .eq('line_value', identity.line)
    .order('created_at', { ascending: true })
    .limit(20);
  query = withNullSafeEq(query, 'matchup', identity.matchup);
  if (exactColumns) {
    query = query.is('game_id', null).is('sport', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Legacy prop-result identity lookup failed: ${error.message}`);
  return takeUnclaimed(data);
}

async function processPropBets(date, sportFilter = null, { settlementOnly = false } = {}) {
  console.log(`\n🎯 Processing PROP BETS for ${date}...`);
  const next = new Date(date); next.setDate(next.getDate() + 1);
  const nextStr = next.toISOString().split('T')[0];
  const allowedSports = sportFilter
    ? new Set([...sportFilter].map((sport) => String(sport).trim().toUpperCase()))
    : null;
  const propsForRow = (row) => typeof row.props === 'string'
    ? JSON.parse(row.props)
    : (row.props || row.picks || []);
  
  const { data: rows, error: rowsError } = await supabase.from('prop_picks').select('*').in('date', [date, nextStr]);
  if (rowsError) throw new Error(`Could not read prop_picks for ${date}/${nextStr}: ${rowsError.message}`);
  const stats = emptySettlementStats();
  if (!rows?.length) return stats;
  const storedProps = rows.flatMap(propsForRow);
  const sourceSports = requiredPropSourceSports(storedProps, allowedSports);
  if (allowedSports && sourceSports.size === 0) {
    console.log(`  ⏭️  No ${[...allowedSports].join('/')} props stored for this window.`);
    return stats;
  }
  const referencedNFLGameIds = new Set();
  const referencedNCAAFGameIds = new Set();
  for (const pick of storedProps) {
    const gameId = propGameId(pick);
    if (!gameId) continue;
    const sport = String(pick?.sport ?? '').trim().toUpperCase();
    if (sport === 'NFL') referencedNFLGameIds.add(gameId);
    if (sport === 'NCAAF') referencedNCAAFGameIds.add(gameId);
  }
  const exactPropIdentity = await supportsExactPropResultIdentity();

  const dates = [date, nextStr];
  // A normal full run opens only the provider lanes represented by stored
  // props. The explicit football settlement filter remains an intersection,
  // so it cannot call an unrelated source even when the same date row is mixed.
  const wants = (sport) => sourceSports.has(String(sport).trim().toUpperCase());
  const nbaBox = wants('NBA') ? (await Promise.all(dates.map(d => fetchBoxScores('NBA', d)))).flat() : [];
  const nhlBox = wants('NHL') ? (await Promise.all(dates.map(d => fetchBoxScores('NHL', d)))).flat() : [];
  const nflGames = wants('NFL') ? (await Promise.all(dates.map(d => fetchGames('NFL', d)))).flat() : [];
  const ncaafGames = wants('NCAAF') ? (await Promise.all(dates.map(d => fetchNCAAFGames(d)))).flat() : [];
  // MLB: no box_scores endpoint — fetch games then stats by game_ids (same pattern as NFL)
  const mlbGames = wants('MLB') ? (await Promise.all(dates.map(d => fetchGames('MLB', d)))).flat() : [];
  const mlbStats = wants('MLB')
    ? await fetchMLBStats([...new Set(mlbGames.map(g => g.id).filter(Boolean))])
    : [];
  // FINALITY GATE source (props): the set of MLB games that are FINAL. A prop whose game
  // isn't final must NOT be graded — an in-progress/unstarted game returns 0/partial stats
  // and settles the player prematurely (today's live game graded "0 TB -> LOST" before first
  // pitch). This mirrors the cloud grade-props gate.
  const mlbFinalIds = new Set(mlbGames.filter(g => isFinalGameStatus(g.status)).map(g => String(g.id)));
  const nflFinalIds = new Set(nflGames.filter(g => isFinalGameStatus(g.status)).map(g => String(g.id)));
  const ncaafFinalIds = new Set(ncaafGames.filter(g => isFinalGameStatus(g.status)).map(g => String(g.id)));
  // Only fetch NFL player stats for games proven final, then keep the source-id
  // stamp so each prop reads its own game's stat line.
  const nflStats = wants('NFL')
    ? await fetchNFLStats(
        nflGames.filter((game) => nflFinalIds.has(String(game.id)) && referencedNFLGameIds.has(String(game.id))),
      )
    : [];
  const ncaafStats = wants('NCAAF')
    ? await fetchNCAAFStats(
        [...ncaafFinalIds].filter((gameId) => referencedNCAAFGameIds.has(gameId)),
      )
    : [];

  console.log(`  📊 Data loaded: NBA=${nbaBox.length} box scores, NHL=${nhlBox.length} box scores, MLB=${mlbStats.length} player stats, NFL=${nflStats.length} player stats, NCAAF=${ncaafStats.length} player stats`);

  const handled = new Set();
  const claimedExistingResultIds = new Set();
  let skippedNotFinal = 0;

  for (const row of rows) {
    const picks = propsForRow(row);
    for (const p of picks) {
      const name = p.player || p.player_name, rawProp = p.prop || p.prop_type;
      // 'MLB HR' is the dedicated home-run lane's sport label: it keeps its
      // own label in prop_results (own record, never mixed into the main MLB
      // props record) but routes to MLB data sources for grading.
      const sport = String(p.sport ?? '').trim().toUpperCase();
      const dataSport = sport === 'MLB HR' ? 'MLB' : sport;
      if (!sportAllowed(dataSport, allowedSports)) continue;
      const type = dataSport === 'NFL'
        ? normalizeStoredPropType(rawProp)
        : (rawProp?.split(/\s+/)?.[0] || rawProp);
      const line = p.line ?? p.line_value;
      const bet = String(p.bet ?? p.direction ?? '').trim().toLowerCase();
      const gameId = propGameId(p);
      if (!name || !type || line == null || !bet || !sport) {
        stats.candidates++;
        stats.invalidIdentity++;
        continue;
      }

      // FINALITY GATE (props) — never grade a prop whose game isn't final. An in-progress or
      // unstarted game returns 0/partial stats and settles the player prematurely (a live MLB
      // game graded "0 total bases -> LOST" before first pitch). Skip -> the prop stays pending
      // and grades correctly once the game is final. Props with no game_id fall through (legacy).
      if (dataSport === 'MLB' && gameId != null && !mlbFinalIds.has(gameId)) { skippedNotFinal++; stats.pendingNonFinal++; continue; }
      // NFL stat rows can report zero/partial production while a game is live.
      // Unlike legacy lanes, an NFL prop must carry an exact game id and that
      // provider game must be final before API stats OR grounding may settle it.
      if (dataSport === 'NFL' && gameId == null) { stats.candidates++; stats.invalidIdentity++; continue; }
      if (dataSport === 'NFL' && !nflFinalIds.has(gameId)) { skippedNotFinal++; stats.candidates++; stats.pendingNonFinal++; continue; }
      // NCAAF follows the same hard identity/finality law as NFL. Legacy
      // matchup-only props are not safe on a large college slate and remain
      // pending until they carry an exact provider game id.
      if (dataSport === 'NCAAF' && gameId == null) { stats.candidates++; stats.invalidIdentity++; continue; }
      if (dataSport === 'NCAAF' && !ncaafFinalIds.has(gameId)) { skippedNotFinal++; stats.candidates++; stats.pendingNonFinal++; continue; }

      const key = propResultIdentity({
        gameId, sport, playerName: name, propType: type, bet, line, gameDate: row.date,
      });
      if (handled.has(key)) continue; handled.add(key);
      stats.candidates++;
      if (['NFL', 'NCAAF'].includes(dataSport)) stats.finalEligible++;

      // Re-grade every eligible FINAL run (no early settled-row skip). That lets
      // corrected provider stats repair a prior result while the finality gates
      // above prevent partial/live stats from creating one in the first place.
      let actual = null;
      let source = 'none';
      if (dataSport === 'NBA') actual = getStatValue('NBA', nbaBox, name, type);
      else if (dataSport === 'NHL') actual = getStatValue('NHL', nhlBox, name, type);
      else if (dataSport === 'MLB') {
        // Scope the search to the pick's OWN game (Aug 3): the date-wide pool
        // let a same-surname player in ANOTHER game match first, and the
        // unconditional UPDATE below then overwrote the cloud grader's correct
        // per-game grade every night (Torres/Pederson/Perez HR credits came
        // from other games' boxes). Legacy picks without game_id keep the
        // date-wide fallback.
        const pool = p.game_id != null
          ? mlbStats.filter(s => s._game_id === String(p.game_id))
          : mlbStats;
        actual = getStatValue('MLB', pool, name, type);
      }
      else if (dataSport === 'NFL') actual = getStatValue('NFL', statsForGame(nflStats, gameId), name, type);
      else if (dataSport === 'NCAAF') actual = getStatValue('NCAAF', statsForGame(ncaafStats, gameId), name, type, p.player_id);

      if (actual !== null) {
        source = 'api';
      } else if (['NFL', 'NCAAF'].includes(dataSport) && settlementOnly) {
        // The laptop-independent football pass never lets a model settle a
        // wager. Exact final-game BDL stats are the grading authority; a
        // provider hole stays pending, makes the structured coverage outcome
        // fail, and can self-heal on a later idempotent run.
        console.error(`    [BDL Miss] ${dataSport}: ${name} "${type}" missing from exact game ${gameId}; leaving pending`);
        stats.unresolvedFinal++;
        continue;
      } else {
        console.warn(`    [BDL Miss] ${sport}: ${name} "${type}" not found in box scores — trying grounding`);
        actual = await getPropGrounding(dataSport, name, type, row.date);
        if (actual !== null) source = 'grounding';
      }

      if (actual !== null) {
        const res = gradePropResult(actual, line, bet);
        if (res == null) {
          if (['NFL', 'NCAAF'].includes(dataSport)) stats.unresolvedFinal++;
          console.error(`  ❌ ${sport}: ${name} ${type} — invalid grade inputs (${bet} ${line}, actual ${actual}).`);
          continue;
        }
        let propInsertFailed = false;
        let propAlreadyExists = false;
        let persistedResultId = null;
        const persistentIdentity = {
          propPickId: row.id,
          gameDate: row.date,
          gameId,
          sport,
          playerName: name,
          propType: type,
          bet,
          line,
          matchup: p.matchup ?? null,
        };
        let exist = null;
        try {
          exist = await fetchExistingPropResult(persistentIdentity, {
            exactColumns: exactPropIdentity,
            claimedIds: claimedExistingResultIds,
          });
          if (exist) claimedExistingResultIds.add(exist.id);
        } catch (error) {
          console.error(`  ❌ DEDUP CHECK FAILED [prop_results] ${sport} "${name} ${type}" (${row.date}): ${error.message}`);
          propInsertFailed = true;
        }

        const identityStamp = exactPropIdentity && gameId
          ? { game_id: gameId, sport }
          : {};
        if (!propInsertFailed && exist) {
          // Row exists from an earlier (possibly mid-game) grade — RE-GRADE and UPDATE to
          // the current box-score value so a premature miss self-corrects once the game is
          // final, instead of being skipped forever (the Jun 18 Soto-HR bug).
          propAlreadyExists = true;
          const { error: updErr } = await supabase.from('prop_results')
            .update({ actual_value: actual, result: res, pick_text: `${name} ${bet} ${line} ${type}`,
                      odds: p.odds != null ? String(p.odds) : null,
                      ...identityStamp,
                      updated_at: new Date().toISOString() })
            .eq('id', exist.id);
          if (updErr) {
            console.error(`  ❌ UPDATE FAILED [prop_results] ${sport} "${name} ${type}" (${row.date}): ${updErr.message}`);
            propInsertFailed = true;
          } else {
            persistedResultId = exist.id;
          }
        } else if (!propInsertFailed) {
          const insertPayload = {
            prop_pick_id: row.id, game_date: row.date, player_name: name,
            prop_type: type, line_value: line, actual_value: actual,
            result: res, pick_text: `${name} ${bet} ${line} ${type}`,
            matchup: p.matchup, bet: bet,
            odds: p.odds != null ? String(p.odds) : null,
            ...identityStamp,
          };
          const insertQuery = supabase.from('prop_results').insert(insertPayload);
          const { data: inserted, error: insertErr } = settlementOnly
            ? await insertQuery.select('id').single()
            : await insertQuery;
          if (insertErr) {
            console.error(`  ❌ INSERT FAILED [prop_results] ${sport} "${name} ${type}" (${row.date}): ${insertErr.message}${insertErr.code ? ' [code=' + insertErr.code + ']' : ''}${insertErr.details ? ' details=' + insertErr.details : ''}${insertErr.hint ? ' hint=' + insertErr.hint : ''}`);
            propInsertFailed = true;
          } else if (settlementOnly) {
            persistedResultId = inserted?.id ?? null;
            if (!persistedResultId) {
              console.error(`  ❌ INSERT READBACK ID MISSING [prop_results] ${sport} "${name} ${type}" (${row.date})`);
              propInsertFailed = true;
            }
          }
        }

        if (propInsertFailed) {
          stats.errors.push(`prop_results write failed for ${sport} ${name} ${type}`);
          if (['NFL', 'NCAAF'].includes(dataSport)) stats.unresolvedFinal++;
          console.error(`  ⛔ Skipped prop stats counter for ${sport} "${name} ${type}" due to insert failure`);
        } else {
          stats.persisted++;
          if (settlementOnly && persistedResultId) stats.persistedResultIds.push(persistedResultId);
          // HR bets are the fun lane, not official picks (founder, Jul 29):
          // they tally separately and never touch the official props record.
          if (/home_run/i.test(String(type || ''))) {
            stats[res === 'won' ? 'hrW' : res === 'lost' ? 'hrL' : 'hrP']++;
          } else {
            stats[res[0]]++;
          }
          const tag = propAlreadyExists ? '⏩ ALREADY' : '🎯';
          console.log(`  ${tag} ${sport}: ${name} ${type} ${bet} ${line} -> ${res.toUpperCase()} (${actual}) [${source}]`);
        }
      } else {
        if (['NFL', 'NCAAF'].includes(dataSport)) stats.unresolvedFinal++;
        console.error(`  ❌ ${sport}: ${name} ${type} — NO DATA from API or grounding. Prop not graded.`);
      }
    }
  }
  if (skippedNotFinal) console.log(`  ⏳ Props finality gate: skipped ${skippedNotFinal} pick(s) whose game isn't final yet (will grade once final).`);
  if (settlementOnly) {
    stats.readBack = await readBackPersistedResults('prop_results', stats.persistedResultIds, `football props ${date}`);
  }
  return stats;
}

/**
 * Narrow cloud-safe settlement pass used only by the manual GitHub backstop.
 *
 * It deliberately reuses the exact same provider identity, finality, grading,
 * dedup, and write paths as the full nightly job, but only opens the two
 * football lanes. Editorial work (recaps/fact checks), MLB/NBA/NHL fetches,
 * night highlights, streaks, and era auditing remain on the existing full
 * cadence. The normal owner remains the established local results lifecycle;
 * this mode exists for an explicitly requested emergency/backfill run.
 */
async function mainFootballSettlements(targetDate) {
  console.log(`\n🏈 FOOTBALL SETTLEMENT DATE: ${targetDate}`);
  const footballSports = new Set(FOOTBALL_SETTLEMENT_SPORTS);

  const props = await processPropBets(targetDate, footballSports, { settlementOnly: true });
  const ncaaf = await processGenericGames('daily_picks', targetDate, 'NCAAF', { settlementOnly: true });
  const weekStart = nflWeekStartForDate(targetDate);
  const nfl = await processGenericGames('weekly_nfl_picks', weekStart, 'NFL', { settlementOnly: true });

  const outcome = buildFootballSettlementOutcome(targetDate, { ncaaf, nfl, props });

  console.log(`\n────────────────────────────────────────`);
  console.log(`FOOTBALL SETTLEMENT SUMMARY FOR ${targetDate}`);
  console.log(`NCAAF: ${ncaaf.w}W - ${ncaaf.l}L - ${ncaaf.p}P`);
  console.log(`NFL:   ${nfl.w}W - ${nfl.l}L - ${nfl.p}P`);
  console.log(`Props: ${props.w}W - ${props.l}L - ${props.p}P`);
  console.log(`────────────────────────────────────────\n`);

  try {
    assertFootballSettlementCoverage(outcome);
  } catch (error) {
    console.log(`FOOTBALL_SETTLEMENT_OUTCOME=${JSON.stringify(outcome)}`);
    throw error;
  }
  console.log(`FOOTBALL_SETTLEMENT_OUTCOME=${JSON.stringify(outcome)}`);
  return outcome;
}

async function main(targetDate = getTargetDate()) {
  console.log(`\n📅 TARGET DATE: ${targetDate}`);

  // Props grade FIRST: the betting recaps written during game grading enrich
  // their evidence pack with the night's graded props (real prices for the
  // slide bullets), so prop_results rows must exist before recaps run.
  const props = await processPropBets(targetDate);

  const daily = await processGenericGames('daily_picks', targetDate);

  // Weekly NFL - use the same Tue–Mon ET publication key as storage.
  const weekStart = nflWeekStartForDate(targetDate);

  const weeklyNFL = await processGenericGames('weekly_nfl_picks', weekStart, 'NFL');

  // Night highlights: league-wide standout stat lines (HRs, multi-hit games,
  // big K shows) from BDL box scores — NOT limited to Gary's picks. Idempotent
  // (upsert) and never fatal to grading.
  try {
    await runNightHighlights({ supabase, bdlApiKey: BDL_API_KEY, date: targetDate });
  } catch (e) {
    console.warn(`  ⚠️ Night highlights failed (non-fatal): ${e.message}`);
  }

  // Streaks: active team W/L + O/U runs and player hit/hitless/HR-game runs
  // as of the night just graded ($0 — BDL + statsapi data fetches only).
  // Idempotent (delete-then-insert per date) and never fatal to grading.
  try {
    await writeStreaks({ supabase, bdlApiKey: BDL_API_KEY, date: targetDate });
  } catch (e) {
    console.warn(`  ⚠️ Streaks failed (non-fatal): ${e.message}`);
  }

  // ERA-DRIFT GUARD (Aug 12 2026): read back the eras stamped on today's
  // stored picks and verify every one came from a pick run recorded in THIS
  // folder's ledger (logs/era-runs.log). A stamp no local run produced means
  // another writer — another clone, Railway, a stale process — is making
  // production picks; that exact failure ran unnoticed Jul 29 – Aug 12. Loud
  // WARN lines in the scheduler-log style, never fatal to grading.
  try {
    const { checkEraDrift, PROJECT_DIR } = await import('./lib/eraTruth.js');
    const problems = [];
    const { data: dpRow } = await supabase.from('daily_picks').select('picks').eq('date', targetDate).maybeSingle();
    problems.push(...checkEraDrift('game', targetDate, (dpRow?.picks || []).map(p => p?.prompt_sha)));
    const { data: ppRow } = await supabase.from('prop_picks').select('picks').eq('date', targetDate).maybeSingle();
    problems.push(...checkEraDrift('props', targetDate, (ppRow?.picks || []).map(p => p?.prompt_sha)));
    if (problems.length) {
      for (const p of problems) console.warn(`🚨 ERA DRIFT: ${p}`);
    } else {
      console.log(`🧬 Era check ${targetDate}: all stored pick eras trace to runs from ${PROJECT_DIR}`);
    }
  } catch (e) {
    console.warn(`  ⚠️ Era-drift check failed (non-fatal): ${e.message}`);
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`SUMMARY FOR ${targetDate}`);
  console.log(`Daily:  ${daily.w}W - ${daily.l}L`);
  console.log(`Weekly: ${weeklyNFL.w}W - ${weeklyNFL.l}L`);
  console.log(`Props:  ${props.w}W - ${props.l}L`);
  if ((props.hrW || 0) + (props.hrL || 0) > 0) console.log(`HR Bets (fun lane, not official): ${props.hrW}W - ${props.hrL}L`);
  console.log(`TOTAL:  ${daily.w + weeklyNFL.w + props.w}W - ${daily.l + weeklyNFL.l + props.l}L`);
  console.log(`════════════════════════════════════════\n`);
}

// The full grade+recap run remains TODAY then YESTERDAY (ET), so the Home
// marquee rolls to today's finished games same-day. The manual football-only
// backstop deliberately reverses that default: yesterday's late finals
// are attempted first, and a failure on either date cannot skip the other.
// Every path is idempotent per date.
async function run() {
  const dates = getTargetDates();
  if (RUN_OPTIONS.footballSettlements) {
    await runFootballSettlementDates(dates, mainFootballSettlements);
    return;
  }
  for (const date of dates) {
    await main(date);
  }
}

run().catch(err => {
  console.error('\n❌ FATAL ERROR:', err);
  process.exit(1);
});
