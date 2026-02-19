#!/usr/bin/env node
/**
 * Ultimate Results Script (Gary 2.0)
 * - Daily picks (NBA, NHL, NFL, NCAAB, NCAAF)
 * - Weekly NFL picks
 * - Prop bets (NBA, NHL, NFL)
 * - Uses BallDontLie (BDL) as primary source
 * - Uses Gemini Grounding (Google Search) as fallback
 * 
 * Usage: node scripts/run-all-results.js [YYYY-MM-DD]
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
// Load environment variables FIRST (centralized)
await import('../src/loadEnv.js');

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
  const num = parseFloat(text.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function normalizeToETDate(matchedGame) {
  // Prefer the full UTC timestamp if available (datetime)
  const utcString = matchedGame.datetime;
  if (utcString) {
    const date = new Date(utcString);
    // Convert to America/New_York
    const etDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
    return etDate; // format: YYYY-MM-DD
  }
  
  // If no timestamp, trust the API's date string directly
  return matchedGame.date || null;
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

/**
 * Matching & Grading
 */
function matchGame(games, h, v) {
  const hn = normalizeName(h), vn = normalizeName(v);
  const hLast = hn.split(' ').pop(), vLast = vn.split(' ').pop();

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
  if (sport === 'NBA') {
    for (const g of data) {
      const players = [...(g.home_team?.players || []), ...(g.visitor_team?.players || [])];
      const p = players.find(ps => normalizeName(`${ps.player?.first_name} ${ps.player?.last_name}`) === target);
      if (p) {
        if (t.includes('point')) return p.pts ?? p.points ?? 0;
        if (t.includes('rebound')) return p.reb ?? p.rebounds ?? 0;
        if (t.includes('assist')) return p.ast ?? p.assists ?? 0;
        if (t.includes('three')) return p.fg3m ?? 0;
        if (t.includes('pra')) return (p.pts || 0) + (p.reb || 0) + (p.ast || 0);
      }
    }
  } else if (sport === 'NHL') {
    const p = data.find(bs => normalizeName(`${bs.player?.first_name} ${bs.player?.last_name}`) === target);
    if (p) {
      if (t.includes('goal')) return p.goals ?? 0;
      if (t.includes('assist')) return p.assists ?? 0;
      if (t.includes('point')) return (p.goals || 0) + (p.assists || 0);
      if (t.includes('shot') || t.includes('sog')) return p.shots_on_goal ?? 0;
      if (t.includes('save')) return p.saves ?? 0;
    }
  } else if (sport === 'NFL') {
    const p = data.find(s => normalizeName(`${s.player?.first_name} ${s.player?.last_name}`) === target);
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
  }
  return null;
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

      if (table === 'weekly_nfl_picks') {
        const dateObj = new Date(date);
        for (let i = 0; i <= 7; i++) {
          const checkDate = new Date(dateObj);
          checkDate.setDate(dateObj.getDate() + i);
          const dStr = checkDate.toISOString().split('T')[0];
          const games = await fetchGames(league, dStr);
          const result = matchGame(games, pick.homeTeam, pick.awayTeam);
          if (result && result.game.status === 'Final') {
            matchedGame = result.game;
            swapped = result.swapped;
            gameDate = dStr;
            break;
          }
        }
      } else {
        const games = await fetchGames(league, date);
        const result = matchGame(games, pick.homeTeam, pick.awayTeam);
        if (result) {
          matchedGame = result.game;
          swapped = result.swapped;
        }
      }

      if (matchedGame) {
        if (swapped) {
          // Pick's "home" is actually BDL's visitor and vice versa — swap scores to align with pick
          hs = matchedGame.visitor_team_score ?? matchedGame.away_score ?? matchedGame.visitor_score ?? null;
          vs = matchedGame.home_team_score ?? matchedGame.home_score ?? null;
        } else {
          hs = matchedGame.home_team_score ?? matchedGame.home_score ?? null;
          vs = matchedGame.visitor_team_score ?? matchedGame.away_score ?? matchedGame.visitor_score ?? null;
        }
        // Normalize the game date to ET to ensure it aligns with app's "Yesterday" view
        gameDate = normalizeToETDate(matchedGame) || gameDate;
      }

      if (hs === null) {
        const g = await getScoreGrounding(league, pick.homeTeam, pick.awayTeam, date);
        if (g) { hs = g.h; vs = g.v; }
      }

      if (hs !== null) {
        const res = gradeGame(pick.pick, pick.homeTeam, pick.awayTeam, hs, vs);
        
        // NFL picks go to nfl_results table, others go to game_results
        if (league === 'NFL') {
          const { data: exist } = await supabase.from('nfl_results').select('id').eq('pick_text', pick.pick).eq('game_date', gameDate).maybeSingle();
          if (!exist) {
            await supabase.from('nfl_results').insert({
              nfl_pick_id: row.id, game_date: gameDate, result: res,
              final_score: `${vs}-${hs}`, pick_text: pick.pick,
              matchup: `${pick.awayTeam} @ ${pick.homeTeam}`
            });
          }
        } else {
          const { data: exist } = await supabase.from('game_results').select('id').eq('pick_text', pick.pick).eq('game_date', gameDate).maybeSingle();
          if (!exist) {
            await supabase.from('game_results').insert({
              pick_id: row.id, game_date: gameDate, league, result: res,
              final_score: `${vs}-${hs}`, pick_text: pick.pick,
              matchup: `${pick.awayTeam} @ ${pick.homeTeam}`
            });
          }
        }
        stats[res[0]]++; // w, l, or p
        console.log(`  ✅ ${league}: ${pick.pick} -> ${res.toUpperCase()} (${vs}-${hs}) on ${gameDate}`);
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
  const nflStats = await fetchNFLStats([...new Set(nflGames.map(g => g.id))]);

  const stats = { w: 0, l: 0 };
  const handled = new Set();

  for (const row of rows) {
    const picks = typeof row.props === 'string' ? JSON.parse(row.props) : (row.props || row.picks || []);
    for (const p of picks) {
      const name = p.player || p.player_name, rawProp = p.prop || p.prop_type, type = rawProp?.split(' ')?.[0] || rawProp;
      const line = p.line || p.line_value, bet = p.bet, sport = p.sport?.toUpperCase();
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
      if (sport === 'NBA') actual = getStatValue('NBA', nbaBox, name, type);
      else if (sport === 'NHL') actual = getStatValue('NHL', nhlBox, name, type);
      else if (sport === 'NFL') actual = getStatValue('NFL', nflStats, name, type);

      if (actual === null) actual = await getPropGrounding(sport, name, type, row.date);

      if (actual !== null) {
        const res = gradeProp(actual, line, bet);
        const { data: exist } = await supabase.from('prop_results').select('id').eq('player_name', name).eq('prop_type', type).eq('game_date', row.date).maybeSingle();
        if (!exist) {
          await supabase.from('prop_results').insert({
            prop_pick_id: row.id, game_date: row.date, player_name: name,
            prop_type: type, line_value: line, actual_value: actual,
            result: res, pick_text: `${name} ${bet} ${line} ${type}`,
            matchup: p.matchup, bet: bet
          });
        }
        stats[res[0]]++;
        console.log(`  🎯 ${sport}: ${name} ${type} ${bet} ${line} -> ${res.toUpperCase()} (${actual})`);
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
  console.log(`🏁 SUMMARY FOR ${targetDate}`);
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
